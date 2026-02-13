/**
 * Tesseract.js OCR Engine — production-ready browser OCR
 *
 * Uses tesseract.js v5 which automatically downloads its WASM core
 * and language models from CDN on first use (cached afterwards).
 *
 * Supports 100+ languages, returns bounding boxes + confidence.
 */
import { createWorker, type Worker } from 'tesseract.js'

// ═══ Types ═══

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

type ProgressCallback = (progress: number) => void

// ═══ Worker pool ═══

let workerInstance: Worker | null = null
let workerLangs = ''
let workerInitPromise: Promise<Worker> | null = null

/**
 * Get or create a reusable Tesseract worker.
 * Supports: eng, chi_sim, chi_tra, jpn, kor, fra, deu, spa, etc.
 * Multiple languages: 'eng+chi_sim'
 */
async function getWorker(langs = 'eng+chi_sim'): Promise<Worker> {
  // Reuse if same langs
  if (workerInstance && workerLangs === langs) return workerInstance

  // If langs changed, terminate old worker
  if (workerInstance && workerLangs !== langs) {
    try { await workerInstance.terminate() } catch { /* safe */ }
    workerInstance = null
    workerInitPromise = null
  }

  if (!workerInitPromise) {
    workerInitPromise = (async () => {
      const worker = await createWorker(langs, 1, {
        logger: () => { /* suppress default logging */ },
      })
      workerInstance = worker
      workerLangs = langs
      return worker
    })()
  }

  return workerInitPromise
}

/**
 * Map a language hint (zh/en/ja/ko) to Tesseract language codes.
 */
export function langHintToTesseract(hint: string): string {
  switch (hint) {
    case 'zh': return 'eng+chi_sim'
    case 'ja': return 'eng+jpn'
    case 'ko': return 'eng+kor'
    default: return 'eng+chi_sim'  // default: eng + chinese for broad coverage
  }
}

/**
 * Recognize text from a canvas (single image/page).
 * Returns full text, per-line bounding boxes, and confidence.
 */
export async function recognizePage(
  source: HTMLCanvasElement | HTMLImageElement | ImageData,
  langHint = 'en',
  onProgress?: ProgressCallback,
): Promise<OcrPageResult> {
  const langs = langHintToTesseract(langHint)

  // Create worker with progress tracking
  let worker: Worker
  if (onProgress) {
    // Use fresh worker with logger for progress tracking
    worker = await createWorker(langs, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress(Math.round(m.progress * 100))
        }
      },
    })
  } else {
    worker = await getWorker(langs)
  }

  try {
    const result = await worker.recognize(source, {
      rotateAuto: true,
    }, {
      text: true,
      blocks: true,
      hocr: false,
      tsv: false,
    })

    const page = result.data
    const lines: OcrLineResult[] = (page.lines || []).map(line => ({
      text: line.text.trim(),
      confidence: line.confidence,
      bbox: line.bbox,
    })).filter(l => l.text.length > 0)

    return {
      text: page.text.trim(),
      confidence: page.confidence,
      lines,
    }
  } finally {
    // Only terminate if we created a dedicated worker for progress
    if (onProgress) {
      try { await worker.terminate() } catch { /* safe */ }
    }
  }
}

/**
 * Cleanup: terminate the cached worker.
 * Call this when unmounting the OCR workspace.
 */
export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    try { await workerInstance.terminate() } catch { /* safe */ }
    workerInstance = null
    workerInitPromise = null
    workerLangs = ''
  }
}
