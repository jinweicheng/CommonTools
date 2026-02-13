/**
 * PaddleOCR ONNX Engine — PP-OCRv4 det + rec, running in browser via ONNX Runtime Web (WASM)
 *
 * Models hosted on HuggingFace (OleehyO/paddleocrv4.onnx):
 *   - ch_PP-OCRv4_det.onnx  (~4.5 MB)  Text detection (DB)
 *   - ch_PP-OCRv4_rec.onnx  (~10.3 MB) Text recognition (SVTR-LCNet + CTC)
 *
 * Character dictionary: ppocr_keys_v1.txt from PaddleOCR GitHub (6623 Chinese/CJK chars)
 *
 * Pipeline: image → normalise → det model → heatmap → connected-component boxes
 *           → crop each box → rec model → CTC decode → text + confidence
 */
import * as ort from 'onnxruntime-web'

// ═══ Public types (same shape as tesseractEngine for drop-in switching) ═══

export interface OcrLineResult {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface OcrPageResult {
  text: string
  confidence: number
  lines: OcrLineResult[]
}

export interface OcrRegion {
  x: number; y: number; w: number; h: number; score: number
}

type ProgressCallback = (progress: number) => void

// ═══ CDN URLs — verified working ═══

const HF_BASE = 'https://huggingface.co/OleehyO/paddleocrv4.onnx/resolve/main'
const DET_URL = `${HF_BASE}/ch_PP-OCRv4_det.onnx`
const REC_URL = `${HF_BASE}/ch_PP-OCRv4_rec.onnx`

// Try multiple dictionary sources for better PP-OCRv4 compatibility
const DICT_URLS = [
  'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt',
  'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/dygraph/ppocr/utils/ppocr_keys_v1.txt'
]

// ═══ Singleton caches ═══

let detSessionPromise: Promise<ort.InferenceSession> | null = null
let recSessionPromise: Promise<ort.InferenceSession> | null = null
let dictPromise: Promise<string[]> | null = null
let modelTotalBytes = 0
let modelLoadedBytes = 0

// ═══ Model download with progress tracking ═══

async function fetchModelWithProgress(
  url: string,
  onBytesLoaded?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const resp = await fetch(url, { cache: 'force-cache' })
  if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status} ${resp.statusText} — ${url}`)

  const contentLength = parseInt(resp.headers.get('content-length') || '0', 10)
  if (!resp.body || !contentLength) {
    return resp.arrayBuffer()
  }

  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    onBytesLoaded?.(received, contentLength)
  }

  const buf = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.byteLength }
  return buf.buffer
}

// ═══ ORT session creation ═══

function configureOrt() {
  ort.env.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2))
}

async function createSession(
  url: string,
  label: string,
  onProgress?: ProgressCallback,
): Promise<ort.InferenceSession> {
  configureOrt()

  const model = await fetchModelWithProgress(url, (loaded, _total) => {
    if (onProgress) {
      modelLoadedBytes += loaded
      const pct = modelTotalBytes > 0 ? Math.round((modelLoadedBytes / modelTotalBytes) * 30) : 0
      onProgress(Math.min(30, pct))
    }
  })

  // Validate: ONNX protobuf never starts with '<' (HTML error page)
  const view = new Uint8Array(model, 0, 4)
  if (view[0] === 0x3c) {
    throw new Error(`${label}: received HTML instead of ONNX model — CDN may be returning an error page`)
  }

  return ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
}

function getDetSession(onProgress?: ProgressCallback): Promise<ort.InferenceSession> {
  if (!detSessionPromise) {
    detSessionPromise = createSession(DET_URL, 'det', onProgress).catch(e => {
      detSessionPromise = null; throw e
    })
  }
  return detSessionPromise
}

function getRecSession(onProgress?: ProgressCallback): Promise<ort.InferenceSession> {
  if (!recSessionPromise) {
    recSessionPromise = createSession(REC_URL, 'rec', onProgress).catch(e => {
      recSessionPromise = null; throw e
    })
  }
  return recSessionPromise
}

// ═══ Character dictionary ═══

function buildChineseEnglishDict(): string[] {
  // Common Chinese characters + English for PP-OCRv4
  const chinese = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严首底液官德调随病苏失尔死讲配女黄推显谈罪神艺呢席含企望密批营项防举球英氧势告李台落木帮轮破亚师围注远字材排供河态封另施减树溶怎止案言士均武固叶鱼波视仅费紧爱左章早朝害续轻服试食充兵源判护司足某练差致板田降黑犯负击范继兴似余坚曲输修故城夫够送笔船占右财吃富春职觉汉画功巴跟虽杂飞检吸助升阳互初创抗考投坏策古径换未跑留钢曾端责站简述钱副尽帝射草冲承独令限阿宣环双请超微让控州良轨承晚移植朋'
  const english = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const punctuation = '.,:;!?()[]{}"\'-_/\\|@#$%^&*+=<>~`'
  return (numbers + english + chinese + punctuation).split('')
}

async function getDict(): Promise<string[]> {
  if (!dictPromise) {
    dictPromise = (async () => {
      // Try multiple dictionary sources
      for (const url of DICT_URLS) {
        try {
          const resp = await fetch(url, { cache: 'force-cache' })
          if (resp.ok) {
            const txt = await resp.text()
            const rows = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            if (rows.length > 1000) {
              console.log(`Loaded ${rows.length} characters from ${url}`)
              return rows
            }
          }
        } catch (e) {
          console.warn(`Failed to load dict from ${url}:`, e)
        }
      }
      
      console.warn('Using fallback Chinese+English dictionary for PP-OCRv4')
      return buildChineseEnglishDict()
    })()
  }
  return dictPromise
}

// ═══ Image preprocessing — detection ═══

function nearestMul32(v: number, lower = 32, upper = 1536): number {
  const clipped = Math.max(lower, Math.min(upper, v))
  return Math.max(lower, Math.round(clipped / 32) * 32)
}

function normalizeForDet(source: HTMLCanvasElement, maxSide = 960) {
  const srcW = Math.max(1, source.width)
  const srcH = Math.max(1, source.height)
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH))
  const dstW = nearestMul32(Math.round(srcW * scale))
  const dstH = nearestMul32(Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dstW; canvas.height = dstH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, dstW, dstH)
  ctx.drawImage(source, 0, 0, dstW, dstH)

  const pixels = ctx.getImageData(0, 0, dstW, dstH).data
  const chw = new Float32Array(3 * dstH * dstW)
  const gOff = dstH * dstW, bOff = 2 * dstH * dstW
  let idx = 0

  for (let i = 0; i < pixels.length; i += 4) {
    chw[idx] = (pixels[i] / 255 - 0.485) / 0.229
    chw[gOff + idx] = (pixels[i + 1] / 255 - 0.456) / 0.224
    chw[bOff + idx] = (pixels[i + 2] / 255 - 0.406) / 0.225
    idx++
  }

  return {
    tensor: new ort.Tensor('float32', chw, [1, 3, dstH, dstW]),
    dstW, dstH,
    scaleX: srcW / dstW,
    scaleY: srcH / dstH,
  }
}

// ═══ Image preprocessing — recognition ═══

function normalizeForRec(source: HTMLCanvasElement, targetH = 48, targetW = 320) {
  const ratio = source.width > 0 ? source.width / source.height : 1
  const resizedW = Math.max(16, Math.min(targetW, Math.round(targetH * ratio)))

  const canvas = document.createElement('canvas')
  canvas.width = targetW; canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(source, 0, 0, resizedW, targetH)

  const pixels = ctx.getImageData(0, 0, targetW, targetH).data
  const chw = new Float32Array(3 * targetH * targetW)
  const gOff = targetH * targetW, bOff = 2 * targetH * targetW
  let idx = 0

  for (let i = 0; i < pixels.length; i += 4) {
    chw[idx] = (pixels[i] / 255 - 0.5) / 0.5
    chw[gOff + idx] = (pixels[i + 1] / 255 - 0.5) / 0.5
    chw[bOff + idx] = (pixels[i + 2] / 255 - 0.5) / 0.5
    idx++
  }

  return new ort.Tensor('float32', chw, [1, 3, targetH, targetW])
}

// ═══ Detection post-processing ═══

function toHeatmap(data: Float32Array, dims: readonly number[]) {
  if (dims.length !== 4) return { map: [] as number[][], h: 0, w: 0 }

  let h: number, w: number
  if (dims[1] === 1) { h = dims[2]; w = dims[3] }
  else if (dims[3] === 1) { h = dims[1]; w = dims[2] }
  else return { map: [] as number[][], h: 0, w: 0 }

  if (h <= 0 || w <= 0) return { map: [] as number[][], h: 0, w: 0 }

  const map: number[][] = Array.from({ length: h }, () => new Array(w).fill(0))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      map[y][x] = Math.max(0, Math.min(1, data[y * w + x]))
    }
  }
  return { map, h, w }
}

function connectedBoxes(
  prob: number[][], h: number, w: number, threshold = 0.25,
): Array<{ x0: number; y0: number; x1: number; y1: number; score: number }> {
  const visited = Array.from({ length: h }, () => new Uint8Array(w))
  const out: Array<{ x0: number; y0: number; x1: number; y1: number; score: number }> = []
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (visited[y][x] || prob[y][x] < threshold) continue

      const queue: [number, number][] = [[x, y]]
      visited[y][x] = 1
      let qi = 0, x0 = x, y0 = y, x1 = x, y1 = y, sum = 0, count = 0

      while (qi < queue.length) {
        const [cx, cy] = queue[qi++]
        sum += prob[cy][cx]; count++
        if (cx < x0) x0 = cx; if (cy < y0) y0 = cy
        if (cx > x1) x1 = cx; if (cy > y1) y1 = cy

        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          if (visited[ny][nx] || prob[ny][nx] < threshold) continue
          visited[ny][nx] = 1
          queue.push([nx, ny])
        }
      }

      if (count < 6 || (x1 - x0) < 3 || (y1 - y0) < 2) continue
      out.push({ x0, y0, x1, y1, score: sum / count })
    }
  }

  return out
}

function mergeCloseBoxes(regions: OcrRegion[]): OcrRegion[] {
  if (regions.length <= 1) return regions
  const sorted = [...regions].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
  const merged: OcrRegion[] = []

  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (!last) { merged.push({ ...r }); continue }

    // 更精确的行判断：考虑文字高度的垂直重叠
    const lastCenterY = last.y + last.h / 2
    const rCenterY = r.y + r.h / 2
    const verticalOverlap = Math.max(0, 
      Math.min(last.y + last.h, r.y + r.h) - Math.max(last.y, r.y)
    )
    const minHeight = Math.min(last.h, r.h)
    const sameLine = verticalOverlap > minHeight * 0.3 || 
      Math.abs(lastCenterY - rCenterY) <= Math.max(2, minHeight * 0.4)
    
    const gap = r.x - (last.x + last.w)
    // 更保守的水平合并：避免过度合并不同语义的文字
    const maxGap = Math.min(last.h * 0.8, r.h * 0.8, 24)
    const near = gap >= -3 && gap <= maxGap

    if (sameLine && near) {
      const nx0 = Math.min(last.x, r.x)
      const ny0 = Math.min(last.y, r.y)
      const nx1 = Math.max(last.x + last.w, r.x + r.w)
      const ny1 = Math.max(last.y + last.h, r.y + r.h)
      last.x = nx0; last.y = ny0; last.w = nx1 - nx0; last.h = ny1 - ny0
      last.score = (last.score + r.score) / 2
    } else {
      merged.push({ ...r })
    }
  }

  return merged
}

// ═══ CTC decoder ═══

function ctcDecode(
  data: Float32Array,
  dims: readonly number[],
  dict: string[],
  langHint = 'zh',
): { text: string; confidence: number } {
  if (dims.length < 2) return { text: '', confidence: 0 }

  let t = 0
  let c = 0
  let layout: 'TC' | 'CT' = 'TC'

  // Common recognition output layouts:
  //  - [1, T, C]
  //  - [1, C, T]
  //  - [T, C]
  //  - [C, T]
  if (dims.length === 3) {
    const d1 = dims[1] ?? 0
    const d2 = dims[2] ?? 0
    // Class count is usually much larger than time steps in OCR rec heads.
    if (d1 > d2) {
      layout = 'CT'
      c = d1
      t = d2
    } else {
      layout = 'TC'
      t = d1
      c = d2
    }
  } else {
    const d0 = dims[0] ?? 0
    const d1 = dims[1] ?? 0
    if (d0 > d1) {
      layout = 'CT'
      c = d0
      t = d1
    } else {
      layout = 'TC'
      t = d0
      c = d1
    }
  }

  if (!t || !c) return { text: '', confidence: 0 }

  const logitAt = (ti: number, ci: number): number => {
    if (layout === 'TC') return data[ti * c + ci]
    return data[ci * t + ti]
  }

  const decode = (blankIdx: number) => {
    const chars: string[] = []
    let prev = -1
    let confSum = 0
    let confCount = 0

    for (let ti = 0; ti < t; ti++) {
      let bestIdx = 0
      let bestVal = -Infinity

      for (let ci = 0; ci < c; ci++) {
        const v = logitAt(ti, ci)
        if (v > bestVal) {
          bestVal = v
          bestIdx = ci
        }
      }

      // Softmax confidence for best class at this timestep (stable).
      let maxLogit = -Infinity
      for (let ci = 0; ci < c; ci++) {
        const v = logitAt(ti, ci)
        if (v > maxLogit) maxLogit = v
      }
      let denom = 0
      for (let ci = 0; ci < c; ci++) {
        denom += Math.exp(logitAt(ti, ci) - maxLogit)
      }
      const bestProb = denom > 0 ? Math.exp(bestVal - maxLogit) / denom : 0

      if (bestIdx !== blankIdx && bestIdx !== prev) {
        const dictIdx = blankIdx === 0 ? bestIdx - 1 : bestIdx
        if (dictIdx >= 0 && dictIdx < dict.length) {
          const char = dict[dictIdx]
          // Filter out obviously invalid characters that suggest dictionary mismatch
          if (char && char !== '\uFFFD' && char.length === 1) {
            chars.push(char)
            confSum += bestProb
            confCount++
          }
        }
      }

      prev = bestIdx
    }

    let text = chars.join('').trim()
    
    // Post-process to clean up common OCR artifacts
    text = text
      .replace(/['`´'']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/\s+/g, ' ')
      .trim()
    
    const confidence = confCount > 0 ? (confSum / confCount) * 100 : 0

    const enCount = (text.match(/[A-Za-z]/g) || []).length
    const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const punctCount = (text.match(/["'`~!@#$%^&*()_+\-=[\]{};:\\|,.<>/?]/g) || []).length
    const len = Math.max(1, text.length)
    const enRatio = enCount / len
    const zhRatio = zhCount / len
    const punctRatio = punctCount / len

    let langScore = 0
    if (langHint === 'en') langScore = enRatio - zhRatio
    else if (langHint === 'zh') langScore = zhRatio - enRatio
    else langScore = Math.max(enRatio, zhRatio) - punctRatio

    // Heavily penalize results with excessive random punctuation (indicates dictionary mismatch)
    const artifactPenalty = punctRatio > 0.3 ? -50 : 0
    const quality = confidence + langScore * 20 - Math.max(0, punctRatio - 0.2) * 30 + artifactPenalty

    return { text, confidence, quality }
  }

  const a = decode(0)
  const b = decode(c - 1)
  return (a.quality >= b.quality ? a : b)
}

// ═══ Crop helper ═══

function cropCanvas(source: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w); c.height = Math.max(1, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(source, x, y, w, h, 0, 0, w, h)
  return c
}

// ═══ Public API ═══

/**
 * Ensure both models are loaded (warm-up).
 */
export async function warmUpModels(onProgress?: ProgressCallback): Promise<void> {
  modelTotalBytes = 4_744_262 + 10_825_534  // det + rec
  modelLoadedBytes = 0

  await Promise.all([
    getDetSession(onProgress),
    getRecSession(onProgress),
    getDict(),
  ])

  onProgress?.(30)
}

/**
 * Detect text regions using PP-OCRv4 det model.
 */
export async function detectTextRegions(
  source: HTMLCanvasElement,
  onProgress?: ProgressCallback,
): Promise<OcrRegion[]> {
  const session = await getDetSession(onProgress)
  const prep = normalizeForDet(source)

  const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: prep.tensor }
  const out = await session.run(feeds)
  const tensor = out[session.outputNames[0]]
  if (!tensor?.data || !(tensor.data instanceof Float32Array)) return []

  const { map, h, w } = toHeatmap(tensor.data as Float32Array, tensor.dims)
  if (h === 0 || w === 0) return []

  const blobs = connectedBoxes(map, h, w)

  const regions: OcrRegion[] = blobs.map(b => {
    const pad = 3
    const x = Math.max(0, Math.round((b.x0 - pad) * prep.scaleX))
    const y = Math.max(0, Math.round((b.y0 - pad) * prep.scaleY))
    const right = Math.min(source.width, Math.round((b.x1 + pad) * prep.scaleX))
    const bottom = Math.min(source.height, Math.round((b.y1 + pad) * prep.scaleY))
    return { x, y, w: Math.max(2, right - x), h: Math.max(2, bottom - y), score: b.score }
  }).filter(r => r.w >= 8 && r.h >= 6 && r.w * r.h >= 80)

  return mergeCloseBoxes(regions).slice(0, 300)
}

/**
 * Recognise text in a single cropped region.
 */
export async function recognizeRegion(
  crop: HTMLCanvasElement,
  langHint = 'zh',
): Promise<{ text: string; confidence: number }> {
  const [session, dict] = await Promise.all([getRecSession(), getDict()])
  const input = normalizeForRec(crop)

  const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: input }
  const out = await session.run(feeds)
  const tensor = out[session.outputNames[0]]
  if (!tensor?.data || !(tensor.data instanceof Float32Array)) return { text: '', confidence: 0 }

  return ctcDecode(tensor.data as Float32Array, tensor.dims, dict, langHint)
}

function splitWideRegion(r: OcrRegion, maxAspect = 10): OcrRegion[] {
  const aspect = r.w / Math.max(1, r.h)
  if (aspect <= maxAspect) return [r]

  const chunkW = Math.max(40, Math.round(r.h * maxAspect))
  const overlap = Math.max(8, Math.round(r.h * 0.6))
  const out: OcrRegion[] = []
  let x = r.x
  const end = r.x + r.w

  while (x < end) {
    const right = Math.min(end, x + chunkW)
    out.push({ x, y: r.y, w: Math.max(2, right - x), h: r.h, score: r.score })
    if (right >= end) break
    x = right - overlap
  }

  return out.length > 0 ? out : [r]
}

/**
 * Full pipeline: detect → crop → recognize → assemble.
 * Returns OcrPageResult (same shape as tesseractEngine).
 */
export async function recognizePage(
  source: HTMLCanvasElement,
  langHint = 'zh',
  onProgress?: ProgressCallback,
): Promise<OcrPageResult> {
  // Phase 1: load models (0–30%)
  await warmUpModels(onProgress)
  onProgress?.(30)

  // Phase 2: detection (30–45%)
  const regions = await detectTextRegions(source, onProgress)
  onProgress?.(45)

  if (regions.length === 0) {
    // Fallback: whole image as one region
    const result = await recognizeRegion(source, langHint)
    onProgress?.(100)
    return {
      text: result.text,
      confidence: result.confidence,
      lines: result.text ? [{
        text: result.text,
        confidence: result.confidence,
        bbox: { x0: 0, y0: 0, x1: source.width, y1: source.height },
      }] : [],
    }
  }

  // Phase 3: recognition per region (45–95%)
  const lines: OcrLineResult[] = []
  let confSum = 0, confCount = 0

  for (let i = 0; i < regions.length; i++) {
    const r = regions[i]
    const pieces = splitWideRegion(r)
    const pieceTexts: string[] = []
    let pieceConfSum = 0
    let pieceConfCount = 0

    for (const p of pieces) {
      const crop = cropCanvas(source, p.x, p.y, p.w, p.h)
      const rec = await recognizeRegion(crop, langHint)
      if (rec.text) {
        pieceTexts.push(rec.text)
        pieceConfSum += rec.confidence
        pieceConfCount++
      }
    }

    const result = {
      text: pieceTexts.join(' ').replace(/\s{2,}/g, ' ').trim(),
      confidence: pieceConfCount > 0 ? pieceConfSum / pieceConfCount : 0,
    }

    if (result.text) {
      lines.push({
        text: result.text,
        confidence: result.confidence,
        bbox: { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h },
      })
      confSum += result.confidence
      confCount++
    }

    onProgress?.(45 + Math.round((i + 1) / regions.length * 50))
  }

  // Sort reading order: 更精确的阅读顺序排序
  lines.sort((a, b) => {
    const aTop = a.bbox.y0
    const bTop = b.bbox.y0
    const aHeight = a.bbox.y1 - a.bbox.y0
    const bHeight = b.bbox.y1 - b.bbox.y0
    const avgHeight = (aHeight + bHeight) / 2
    
    // 如果垂直距离小于平均高度的0.5倍，认为是同一行，按左右排序
    const verticalDistance = Math.abs(aTop - bTop)
    if (verticalDistance < avgHeight * 0.5) {
      return a.bbox.x0 - b.bbox.x0
    }
    
    // 否则按上下排序
    return aTop - bTop
  })

  onProgress?.(100)

  return {
    text: lines.map(l => l.text).join('\n'),
    confidence: confCount > 0 ? confSum / confCount : 0,
    lines,
  }
}

/**
 * Release cached sessions to free memory.
 */
export async function terminateEngine(): Promise<void> {
  if (detSessionPromise) {
    try { const s = await detSessionPromise; s.release() } catch { /* safe */ }
    detSessionPromise = null
  }
  if (recSessionPromise) {
    try { const s = await recSessionPromise; s.release() } catch { /* safe */ }
    recSessionPromise = null
  }
  dictPromise = null
}
