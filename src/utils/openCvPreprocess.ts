const OPEN_CV_CANDIDATES = [
  `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/opencv.js`,
  'https://docs.opencv.org/4.10.0/opencv.js',
]

let cvReadyPromise: Promise<boolean> | null = null

function hasCvReady() {
  return typeof window !== 'undefined' && !!window.cv && !!window.cv.Mat
}

function waitCvReady(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    if (hasCvReady()) {
      resolve(true)
      return
    }

    const started = Date.now()
    const timer = window.setInterval(() => {
      if (hasCvReady()) {
        window.clearInterval(timer)
        resolve(true)
        return
      }

      if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer)
        resolve(false)
      }
    }, 120)
  })
}

async function injectScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[data-opencv-src="${src}"]`) as HTMLScriptElement | null
    if (existing) {
      void waitCvReady().then(resolve)
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.dataset.opencvSrc = src

    script.onload = () => {
      void waitCvReady().then(resolve)
    }

    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

export async function loadOpenCv(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (hasCvReady()) return true

  if (!cvReadyPromise) {
    cvReadyPromise = (async () => {
      for (const src of OPEN_CV_CANDIDATES) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await injectScript(src)
        if (ok) return true
      }
      return false
    })()
  }

  return cvReadyPromise
}

function toCanvas(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source
  const canvas = document.createElement('canvas')
  canvas.width = source.naturalWidth || source.width
  canvas.height = source.naturalHeight || source.height
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.drawImage(source, 0, 0)
  return canvas
}

function deskewByContours(input: any): any {
  const points = new cv.Mat()
  cv.findNonZero(input, points)

  if (points.rows < 5) {
    points.delete()
    return input.clone()
  }

  const rotatedRect = cv.minAreaRect(points)
  points.delete()

  let angle = rotatedRect.angle as number
  if (angle < -45) angle += 90

  const center = new cv.Point(input.cols / 2, input.rows / 2)
  const rotMat = cv.getRotationMatrix2D(center, angle, 1)
  const rotated = new cv.Mat()
  const dsize = new cv.Size(input.cols, input.rows)

  cv.warpAffine(input, rotated, rotMat, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255))
  rotMat.delete()

  return rotated
}

export async function preprocessWithOpenCv(source: HTMLCanvasElement | HTMLImageElement): Promise<HTMLCanvasElement> {
  const ready = await loadOpenCv()
  const origin = toCanvas(source)
  if (!ready) return origin

  const src = cv.imread(origin)
  const gray = new cv.Mat()
  const deskewMask = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // 1) 自适应二值，生成用于 deskew 的 mask
    cv.adaptiveThreshold(gray, deskewMask, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 35, 15)

    // 2) 旋转纠偏 — 在灰度图上做，保留灰度信息
    const rotatedGray = deskewByContours(gray)

    // 3) 阴影去除 — 背景估计 + 归一化，输出 enhanced grayscale (非纯二值)
    const bg = new cv.Mat()
    const ksize = new cv.Size(21, 21)
    cv.GaussianBlur(rotatedGray, bg, ksize, 0)

    const diff = new cv.Mat()
    cv.absdiff(rotatedGray, bg, diff)
    const enhanced = new cv.Mat()
    cv.normalize(diff, enhanced, 0, 255, cv.NORM_MINMAX)

    // 4) CLAHE 自适应直方图均衡，增强对比度但保留灰度层次
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8))
    const claheOut = new cv.Mat()
    clahe.apply(enhanced, claheOut)
    clahe.delete()

    // 5) 轻度去噪，保留文字细节
    cv.medianBlur(claheOut, claheOut, 3)

    const output = document.createElement('canvas')
    output.width = origin.width
    output.height = origin.height
    cv.imshow(output, claheOut)

    rotatedGray.delete()
    bg.delete()
    diff.delete()
    enhanced.delete()
    claheOut.delete()

    return output
  } catch {
    // CLAHE may not be available in all opencv.js builds, fallback to simple pipeline
    try {
      const simple = new cv.Mat()
      cv.cvtColor(src, simple, cv.COLOR_RGBA2GRAY)
      cv.medianBlur(simple, simple, 3)
      const out = document.createElement('canvas')
      out.width = origin.width; out.height = origin.height
      cv.imshow(out, simple)
      simple.delete()
      return out
    } catch {
      return origin
    }
  } finally {
    src.delete()
    gray.delete()
    deskewMask.delete()
  }
}
