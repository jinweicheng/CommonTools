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
const DICT_URL = 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt'

const FALLBACK_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,:;!?%+-=_()[]{}<>@#$&*/\\|\'" '

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

function buildDefaultDict(): string[] {
  return FALLBACK_ALPHABET.split('')
}

async function getDict(): Promise<string[]> {
  if (!dictPromise) {
    dictPromise = (async () => {
      try {
        const resp = await fetch(DICT_URL, { cache: 'force-cache' })
        if (!resp.ok) return buildDefaultDict()
        const txt = await resp.text()
        const rows = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        return rows.length > 100 ? rows : buildDefaultDict()
      } catch {
        return buildDefaultDict()
      }
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

    const sameLine = Math.abs((last.y + last.h / 2) - (r.y + r.h / 2)) <= Math.max(6, Math.min(last.h, r.h) * 0.7)
    const gap = r.x - (last.x + last.w)
    const near = gap >= -4 && gap <= Math.max(16, Math.min(last.h, r.h) * 1.2)

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

function ctcDecode(data: Float32Array, dims: readonly number[], dict: string[]): { text: string; confidence: number } {
  const t = dims[1] ?? 0
  const c = dims[2] ?? 0
  if (!t || !c) return { text: '', confidence: 0 }

  const decode = (blankIdx: number) => {
    const chars: string[] = []
    let prev = -1, confSum = 0, confCount = 0

    for (let ti = 0; ti < t; ti++) {
      const offset = ti * c
      let bestIdx = 0, bestVal = -Infinity
      for (let ci = 0; ci < c; ci++) {
        if (data[offset + ci] > bestVal) { bestVal = data[offset + ci]; bestIdx = ci }
      }

      if (bestIdx !== blankIdx && bestIdx !== prev) {
        const dictIdx = blankIdx === 0 ? bestIdx - 1 : bestIdx
        if (dictIdx >= 0 && dictIdx < dict.length) {
          chars.push(dict[dictIdx])
          confSum += Math.max(0, Math.min(1, bestVal))
          confCount++
        }
      }
      prev = bestIdx
    }

    return { text: chars.join('').trim(), confidence: confCount > 0 ? (confSum / confCount) * 100 : 0 }
  }

  const a = decode(0)
  const b = decode(c - 1)
  return a.text.length >= b.text.length ? a : b
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
): Promise<{ text: string; confidence: number }> {
  const [session, dict] = await Promise.all([getRecSession(), getDict()])
  const input = normalizeForRec(crop)

  const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: input }
  const out = await session.run(feeds)
  const tensor = out[session.outputNames[0]]
  if (!tensor?.data || !(tensor.data instanceof Float32Array)) return { text: '', confidence: 0 }

  return ctcDecode(tensor.data as Float32Array, tensor.dims, dict)
}

/**
 * Full pipeline: detect → crop → recognize → assemble.
 * Returns OcrPageResult (same shape as tesseractEngine).
 */
export async function recognizePage(
  source: HTMLCanvasElement,
  _langHint = 'zh',
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
    const result = await recognizeRegion(source)
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
    const crop = cropCanvas(source, r.x, r.y, r.w, r.h)
    const result = await recognizeRegion(crop)

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

  // Sort reading order: top→bottom, left→right
  lines.sort((a, b) => {
    const dy = a.bbox.y0 - b.bbox.y0
    return Math.abs(dy) > 8 ? dy : a.bbox.x0 - b.bbox.x0
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
