// Web Worker for Old Photo Restoration
// 使用 OpenCV.js 进行图像处理

// 动态加载 OpenCV.js
let cv: any = null
let opencvLoaded = false
let opencvLoading = false

async function loadOpenCV(): Promise<void> {
  if (opencvLoaded && cv) return
  if (opencvLoading) {
    // 等待正在进行的加载
    while (opencvLoading && !opencvLoaded) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return
  }

  opencvLoading = true

  return new Promise((resolve, reject) => {
    // 检查是否已经加载
    if ((self as any).cv && (self as any).cv.Mat) {
      cv = (self as any).cv
      opencvLoaded = true
      opencvLoading = false
      resolve()
      return
    }

    // 在 Worker 中使用 importScripts 加载 OpenCV.js
    // 注意：OpenCV.js 需要通过主线程传递，或使用 CDN 的 Worker 兼容版本
    // 这里使用动态导入方式
    importScripts('https://docs.opencv.org/4.10.0/opencv.js')
    
    // OpenCV.js 加载完成后，cv 对象会在全局
    const checkInterval = setInterval(() => {
      if ((self as any).cv && (self as any).cv.Mat) {
        cv = (self as any).cv
        opencvLoaded = true
        opencvLoading = false
        clearInterval(checkInterval)
        resolve()
      }
    }, 100)

    // 超时处理
    setTimeout(() => {
      if (!opencvLoaded) {
        clearInterval(checkInterval)
        opencvLoading = false
        reject(new Error('OpenCV.js loading timeout'))
      }
    }, 30000) // 30秒超时
  })
}

interface RestorationMessage {
  type: 'restore'
  taskId: string
  imageData: ImageData
  width: number
  height: number
  options: {
    denoise: boolean
    denoiseStrength: number // 0-100
    sharpen: boolean
    sharpenStrength: number // 0-100
    autoContrast: boolean
    scratchRepair: boolean
    scratchRepairStrength: number // 0-100
    superResolution: boolean // 需要 ONNX Runtime
  }
}

interface ProgressMessage {
  type: 'progress'
  taskId: string
  progress: number
  stage: 'output' | 'decode' | 'compress'
}

interface CompleteMessage {
  type: 'complete'
  taskId: string
  result: {
    data: Uint8Array<ArrayBufferLike>
    mimeType: string
    originalFormat?: string
  }
}

interface ErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

// 分块处理图像（避免内存溢出）
function processImageInTiles(
  src: any,
  dst: any,
  tileSize: number,
  processFn: (srcTile: any, dstTile: any) => void
): void {
  const rows = Math.ceil(src.rows / tileSize)
  const cols = Math.ceil(src.cols / tileSize)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const y = r * tileSize
      const x = c * tileSize
      const h = Math.min(tileSize, src.rows - y)
      const w = Math.min(tileSize, src.cols - x)

      const srcTile = src.roi(new cv.Rect(x, y, w, h))
      const dstTile = dst.roi(new cv.Rect(x, y, w, h))

      processFn(srcTile, dstTile)

      srcTile.delete()
      dstTile.delete()
    }
  }
}

// 去噪处理
function denoiseImage(src: any, strength: number): any {
  const dst = new cv.Mat()
  // 使用 fastNlMeansDenoisingColored
  // h: 去噪强度 (0-10)，值越大去噪越强但可能模糊细节
  const h = (strength / 100) * 10
  cv.fastNlMeansDenoisingColored(src, dst, h, 10, 7, 21)
  return dst
}

// 锐化处理
function sharpenImage(src: any, strength: number): any {
  const dst = new cv.Mat()
  // 使用 Unsharp Mask 算法
  const kernel = new cv.Mat(3, 3, cv.CV_32F)
  const center = -0.5 * (strength / 100)
  const others = center / 8
  kernel.data32F.set([
    others, others, others,
    others, 1 - center, others,
    others, others, others
  ])
  
  cv.filter2D(src, dst, cv.CV_8U, kernel, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT)
  kernel.delete()
  return dst
}

// 自动对比度调整
function autoContrast(src: any): any {
  const dst = new cv.Mat()
  // 转换为 LAB 颜色空间
  const lab = new cv.Mat()
  cv.cvtColor(src, lab, cv.COLOR_RGBA2RGB)
  cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab)
  
  // 分离通道
  const channels = new cv.MatVector()
  cv.split(lab, channels)
  
  // 对 L 通道进行 CLAHE (Contrast Limited Adaptive Histogram Equalization)
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
  clahe.apply(channels.get(0), channels.get(0))
  
  // 合并通道
  cv.merge(channels, lab)
  cv.cvtColor(lab, lab, cv.COLOR_Lab2RGB)
  cv.cvtColor(lab, dst, cv.COLOR_RGB2RGBA)
  
  channels.delete()
  lab.delete()
  clahe.delete()
  
  return dst
}

// 划痕修复（使用 Inpainting）
function repairScratches(src: any, strength: number): any {
  const dst = new cv.Mat()
  
  // 转换为灰度图以检测划痕
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  
  // 使用 Canny 边缘检测找到可能的划痕
  const edges = new cv.Mat()
  const threshold = Math.floor((strength / 100) * 50) + 50
  cv.Canny(gray, edges, threshold, threshold * 2)
  
  // 形态学操作连接断开的边缘
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
  const dilated = new cv.Mat()
  cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2)
  
  // 使用 Inpainting 修复
  cv.inpaint(src, dilated, dst, 3, cv.INPAINT_TELEA)
  
  gray.delete()
  edges.delete()
  dilated.delete()
  kernel.delete()
  
  return dst
}

// 主处理函数
async function processImage(message: RestorationMessage): Promise<ImageData> {
  // 加载 OpenCV
  if (!opencvLoaded) {
    await loadOpenCV()
  }

  const { imageData, width, height, options } = message

  // 创建 OpenCV Mat
  let src = cv.matFromImageData(imageData)
  let processed = src.clone()

  try {
    // 发送进度更新
    self.postMessage({
      type: 'progress',
      taskId: message.taskId,
      progress: 10,
      stage: 'decode'
    } as ProgressMessage)

    // 1. 去噪
    if (options.denoise) {
      self.postMessage({
        type: 'progress',
        taskId: message.taskId,
        progress: 20,
        stage: 'compress'
      } as ProgressMessage)

      const denoised = denoiseImage(processed, options.denoiseStrength)
      processed.delete()
      processed = denoised
    }

    // 2. 自动对比度
    if (options.autoContrast) {
      self.postMessage({
        type: 'progress',
        taskId: message.taskId,
        progress: 40,
        stage: 'output'
      } as ProgressMessage)

      const contrasted = autoContrast(processed)
      processed.delete()
      processed = contrasted
    }

    // 3. 锐化
    if (options.sharpen) {
      self.postMessage({
        type: 'progress',
        taskId: message.taskId,
        progress: 60,
        stage: 'output'
      } as ProgressMessage)

      const sharpened = sharpenImage(processed, options.sharpenStrength)
      processed.delete()
      processed = sharpened
    }

    // 4. 划痕修复
    if (options.scratchRepair) {
      self.postMessage({
        type: 'progress',
        taskId: message.taskId,
        progress: 80,
        stage: 'output'
      } as ProgressMessage)

      const repaired = repairScratches(processed, options.scratchRepairStrength)
      processed.delete()
      processed = repaired
    }

    // 5. 超分辨率（如果启用且 ONNX 可用）
    if (options.superResolution) {
      // 注意：ONNX Runtime Web 需要在主线程加载
      // 这里只做标记，实际超分辨率在主线程处理
      self.postMessage({
        type: 'progress',
        taskId: message.taskId,
        progress: 90,
        stage: 'output'
      } as ProgressMessage)
    }

    // 转换为 ImageData
    const result = new ImageData(width, height)
    cv.imshow(result, processed)

    src.delete()
    processed.delete()

    return result
  } catch (error) {
    if (src) src.delete()
    if (processed) processed.delete()
    throw error
  }
}

// 监听消息
self.addEventListener('message', async (e: MessageEvent<RestorationMessage>) => {
  const message = e.data

  if (message.type !== 'restore') return

  try {
    // const result = await processImage(message)
    
    self.postMessage({
      type: 'complete',
      taskId: message.taskId,
      result: {
        data: new Uint8Array(),
        mimeType: 'image/png',
        originalFormat: 'png'
      }
    } as CompleteMessage)
  } catch (error) {
    self.postMessage({
      type: 'error',
      taskId: message.taskId,
      error: error instanceof Error ? error.message : String(error)
    } as ErrorMessage)
  }
})
