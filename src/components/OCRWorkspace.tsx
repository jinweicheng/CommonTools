import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Play, Download, Copy, FileText, FileJson, FileSpreadsheet, FileType2, Languages, Clock3, ScanLine, Trash2, RotateCcw, AlertTriangle, Cpu } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph } from 'docx'
import { saveAs } from 'file-saver'
import configurePDFWorker from '../utils/pdfWorkerConfig'
import { recognizePage as tesseractRecognize, terminateWorker as tesseractTerminate } from '../utils/tesseractEngine'
import { recognizePage as paddleRecognize, terminateEngine as paddleTerminate } from '../utils/paddleOcrEngine'
import './OCRWorkspace.css'

type OcrEngine = 'tesseract' | 'paddle'

type OCRMode = 'image' | 'pdf' | 'table'
type OCRStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface OCRBox { id: string; text: string; x: number; y: number; w: number; h: number }

interface OCRTask {
  id: string
  file: File
  status: OCRStatus
  progress: number
  previewUrl?: string
  pageCount?: number
  resolution?: string
  langDetected: string
  estimateSec: number
  recognizedText: string
  confidence: number
  durationMs?: number
  wordCount: number
  boxes: OCRBox[]
  tableRows: string[][]
  selectedPages: string
  error?: string
}

interface OCRWorkspaceProps { mode: OCRMode; language: 'zh-CN' | 'en-US' }

// ═══ Constants ═══
const PDF_MAX_MB = 50
const IMG_MAX_MB = 30
const PDF_MAX_PAGES = 100
const SUPPORTED_HINT = 'JPG, PNG, WEBP, BMP, TIFF, PDF'
const BATCH_LIMIT = 20

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const detectLangFromContent = (text: string): string => {
  const zh = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const ja = (text.match(/[\u3040-\u30ff]/g) || []).length
  const ko = (text.match(/[\uac00-\ud7af]/g) || []).length
  const en = (text.match(/[a-zA-Z]/g) || []).length
  const max = Math.max(zh, ja, ko, en)
  if (max === 0) return 'en'
  if (max === zh) return 'zh'
  if (max === ja) return 'ja'
  if (max === ko) return 'ko'
  return 'en'
}

const detectLanguageHint = (name: string) => {
  if (/[\u4e00-\u9fa5]/.test(name)) return 'zh'
  if (/[ぁ-んァ-ン]/.test(name)) return 'ja'
  if (/[가-힣]/.test(name)) return 'ko'
  return 'en'
}

export default function OCRWorkspace({ mode, language }: OCRWorkspaceProps) {
  const [tasks, setTasks] = useState<OCRTask[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>('paddle')
  const inputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef(false)

  const zh = language === 'zh-CN'

  useEffect(() => {
    configurePDFWorker().catch(() => undefined)
    return () => {
      tasks.forEach(t => t.previewUrl && URL.revokeObjectURL(t.previewUrl))
      tesseractTerminate().catch(() => undefined)
      paddleTerminate().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTask = useMemo(() => tasks.find(t => t.id === activeTaskId) || null, [tasks, activeTaskId])

  const updateTask = useCallback((id: string, patch: Partial<OCRTask>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  // ═══ Labels ═══
  const getModeLabel = () => mode === 'image' ? 'Image to Text' : mode === 'pdf' ? 'PDF OCR' : 'Table OCR'

  const estimateSeconds = (size: number, pageCount: number, res?: string) => {
    const mb = size / (1024 * 1024)
    const f = res?.includes('x') ? 1.1 : 1
    return Math.max(2, Math.round((mb * 0.7 + pageCount * 1.4) * f))
  }

  // ═══ Text → Box fallback ═══
  const makeBoxesFromText = (text: string): OCRBox[] => {
    const lines = text.split('\n').filter(Boolean).slice(0, 30)
    if (lines.length === 0) return []
    const step = Math.min(6, Math.floor(90 / lines.length))
    return lines.map((line, i) => ({
      id: `box-${i}`, text: line, x: 4, y: 4 + i * step, w: 92, h: Math.max(3, step - 1),
    }))
  }

  // ═══ Page range parsing ═══
  const parsePageSelection = (selected: string, max: number): number[] => {
    const tokens = selected.split(',').map(s => s.trim()).filter(Boolean)
    if (tokens.length === 0) return Array.from({ length: max }, (_, i) => i + 1)
    const out = new Set<number>()
    for (const tok of tokens) {
      const range = tok.split('-').map(Number)
      if (range.length === 2 && range.every(Number.isFinite)) {
        for (let i = Math.max(1, Math.min(...range)); i <= Math.min(max, Math.max(...range)); i++) out.add(i)
      } else {
        const p = Number(tok)
        if (Number.isFinite(p) && p >= 1 && p <= max) out.add(p)
      }
    }
    return [...out].sort((a, b) => a - b)
  }

  // ═══ Canvas helpers ═══
  const canvasFromBitmap = (bm: ImageBitmap) => {
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height
    const ctx = c.getContext('2d')!; ctx.drawImage(bm, 0, 0); bm.close()
    return c
  }

  const renderPdfPage = async (doc: pdfjsLib.PDFDocumentProxy, pageNo: number, scale = 2) => {
    const page = await doc.getPage(pageNo)
    const vp = page.getViewport({ scale })
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height))
    const ctx = c.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    return c
  }

  // ═══ Table rows builder ═══
  const buildTableRows = (boxes: OCRBox[]) => {
    if (boxes.length === 0) return [] as string[][]
    const sorted = [...boxes].sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y)
    const tolerance = 3.2
    const rows: OCRBox[][] = []
    sorted.forEach(box => {
      const cy = box.y + box.h / 2
      const row = rows.find(r => Math.abs(r.reduce((s, b) => s + b.y + b.h / 2, 0) / r.length - cy) <= tolerance)
      if (row) row.push(box); else rows.push([box])
    })
    const cols: number[] = []
    rows.flat().forEach(b => {
      const cx = b.x + b.w / 2
      if (!cols.find(c => Math.abs(c - cx) <= 4)) cols.push(cx)
    })
    cols.sort((a, b) => a - b)
    return rows.map(row => {
      const cells = new Array(Math.max(1, cols.length)).fill('') as string[]
      row.sort((a, b) => a.x - b.x).forEach(cell => {
        const cx = cell.x + cell.w / 2
        let t = 0, best = Infinity
        cols.forEach((c, i) => { const d = Math.abs(c - cx); if (d < best) { best = d; t = i } })
        cells[t] = cells[t] ? `${cells[t]} ${cell.text}` : cell.text
      })
      return cells
    })
  }

  // ═══ PDF metadata ═══
  const getPdfMeta = async (file: File) => {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    const page = await pdf.getPage(1)
    const vp = page.getViewport({ scale: 0.4 })
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height))
    const ctx = c.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const previewUrl = c.toDataURL('image/png')
    pdf.destroy()
    return { pageCount: pdf.numPages, previewUrl, resolution: `${c.width}x${c.height}` }
  }

  const getImageMeta = async (file: File) => {
    const url = URL.createObjectURL(file)
    const img = document.createElement('img'); img.src = url
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('img load')) })
    return { previewUrl: url, resolution: `${img.naturalWidth}x${img.naturalHeight}` }
  }

  // ═══ File validation ═══
  const validateFile = (file: File): string | null => {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const isImg = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i.test(file.name)
    if (!isPdf && !isImg) return zh ? '不支持的文件格式' : 'Unsupported file format'
    const maxMB = isPdf ? PDF_MAX_MB : IMG_MAX_MB
    if (file.size > maxMB * 1024 * 1024) return zh ? `文件超过 ${maxMB}MB 限制` : `File exceeds ${maxMB}MB limit`
    return null
  }

  // ═══ Add files (batch upload) ═══
  const addFiles = useCallback(async (files: File[]) => {
    const limited = files.slice(0, BATCH_LIMIT)
    const nextTasks: OCRTask[] = []

    for (const file of limited) {
      const err = validateFile(file)
      if (err) {
        nextTasks.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file, status: 'failed', progress: 0, langDetected: detectLanguageHint(file.name),
          estimateSec: 0, recognizedText: '', confidence: 0, wordCount: 0, boxes: [], tableRows: [], selectedPages: '1', error: err,
        })
        continue
      }

      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      try {
        let pageCount = 1, previewUrl = '', resolution = '-'
        if (isPdf) {
          const m = await getPdfMeta(file)
          pageCount = Math.min(m.pageCount, PDF_MAX_PAGES)
          previewUrl = m.previewUrl; resolution = m.resolution
          if (m.pageCount > PDF_MAX_PAGES) {
            // truncate warning
          }
        } else {
          const m = await getImageMeta(file); previewUrl = m.previewUrl; resolution = m.resolution
        }
        nextTasks.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file, status: 'pending', progress: 0, previewUrl, pageCount, resolution,
          langDetected: detectLanguageHint(file.name),
          estimateSec: estimateSeconds(file.size, pageCount, resolution),
          recognizedText: '', confidence: 0, wordCount: 0, boxes: [], tableRows: [],
          selectedPages: isPdf ? `1-${pageCount}` : '1',
        })
      } catch {
        nextTasks.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file, status: 'failed', progress: 0, langDetected: detectLanguageHint(file.name),
          estimateSec: 0, recognizedText: '', confidence: 0, wordCount: 0, boxes: [], tableRows: [], selectedPages: '1',
          error: zh ? '文件解析失败' : 'File parse failed',
        })
      }
    }

    setTasks(prev => {
      const merged = [...prev, ...nextTasks]
      if (!activeTaskId && merged.length > 0) setActiveTaskId(merged[0].id)
      return merged
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, zh])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await addFiles(files)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ═══ Drag & Drop ═══
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    await addFiles(files)
  }, [addFiles])

  // ═══ Run single task ═══
  const runOne = async (task: OCRTask) => {
    if (abortRef.current) return
    const start = performance.now()
    updateTask(task.id, { status: 'processing', progress: 3, error: undefined, recognizedText: '' })

    try {
      const isPdf = task.file.type === 'application/pdf' || /\.pdf$/i.test(task.file.name)
      const totalPages = isPdf ? Math.max(1, Math.min(task.pageCount || 1, PDF_MAX_PAGES)) : 1
      const selectedPages = isPdf ? parsePageSelection(task.selectedPages, totalPages) : [1]
      if (selectedPages.length === 0) throw new Error(zh ? '无有效页码' : 'No valid pages selected')

      let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
      if (isPdf) {
        const buf = await task.file.arrayBuffer()
        pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise
      }

      const allBoxes: OCRBox[] = []
      const pageTexts: string[] = []
      let confSum = 0, confCount = 0

      for (let pi = 0; pi < selectedPages.length; pi++) {
        if (abortRef.current) break
        const pageNo = selectedPages[pi]

        // Render page/image to canvas
        const srcCanvas = isPdf
          ? await renderPdfPage(pdfDoc!, pageNo, 2)
          : canvasFromBitmap(await createImageBitmap(task.file))

        // Use selected OCR engine
        const recognize = ocrEngine === 'paddle' ? paddleRecognize : tesseractRecognize
        const pageResult = await recognize(
          srcCanvas,
          task.langDetected,
          (pct) => {
            const pageProgress = (pi + pct / 100) / selectedPages.length
            updateTask(task.id, { progress: Math.min(98, Math.round(5 + pageProgress * 90)) })
          },
        )

        // Convert Tesseract line bounding boxes to our OCRBox format (percentage-based)
        const imgW = srcCanvas.width, imgH = srcCanvas.height
        const pageBoxes: OCRBox[] = pageResult.lines.map((line, idx) => ({
          id: `box-p${pageNo}-${idx}`,
          text: line.text,
          x: (line.bbox.x0 / imgW) * 100,
          y: (line.bbox.y0 / imgH) * 100,
          w: ((line.bbox.x1 - line.bbox.x0) / imgW) * 100,
          h: ((line.bbox.y1 - line.bbox.y0) / imgH) * 100,
        }))

        allBoxes.push(...pageBoxes)

        if (pageResult.text) {
          confSum += pageResult.confidence
          confCount += 1
        }

        if (selectedPages.length > 1) pageTexts.push(`--- Page ${pageNo} ---`)
        pageTexts.push(pageResult.text)

        // Progressive update
        updateTask(task.id, {
          progress: Math.min(98, Math.round(5 + ((pi + 1) / selectedPages.length) * 90)),
          boxes: [...allBoxes],
          recognizedText: pageTexts.join('\n').trim(),
        })
      }

      // Cleanup PDF doc
      if (pdfDoc) { try { pdfDoc.destroy() } catch { /* safe */ } }

      const finalText = pageTexts.join('\n').trim() || (zh ? '[未识别到文字]' : '[No text recognized]')
      const confidence = confCount > 0 ? confSum / confCount : 0
      const durationMs = Math.round(performance.now() - start)
      const tableRows = mode === 'table' ? buildTableRows(allBoxes) : []
      const realLang = detectLangFromContent(finalText)

      updateTask(task.id, {
        status: 'completed', progress: 100, recognizedText: finalText,
        confidence, durationMs, wordCount: finalText.length,
        boxes: allBoxes.length > 0 ? allBoxes : makeBoxesFromText(finalText),
        tableRows, langDetected: realLang,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR failed'
      updateTask(task.id, { status: 'failed', progress: 100, error: message })
    }
  }

  const startOCR = async () => {
    if (isProcessing) return
    const pending = tasks.filter(t => t.status === 'pending')
    if (pending.length === 0) return
    abortRef.current = false
    setIsProcessing(true)
    try {
      for (const t of pending) {
        if (abortRef.current) break
        await runOne(t)
      }
    } finally { setIsProcessing(false) }
  }

  const stopOCR = () => { abortRef.current = true }

  // ═══ Task management ═══
  const removeTask = (id: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTaskId === id) setActiveTaskId(next[0]?.id || null)
      return next
    })
  }

  const resetTask = (id: string) => {
    updateTask(id, {
      status: 'pending', progress: 0, recognizedText: '', confidence: 0,
      durationMs: undefined, wordCount: 0, boxes: [], tableRows: [], error: undefined,
    })
  }

  const clearAll = () => {
    tasks.forEach(t => t.previewUrl && URL.revokeObjectURL(t.previewUrl))
    setTasks([]); setActiveTaskId(null)
  }

  // ═══ Editing ═══
  const updateActiveText = (next: string) => {
    if (!activeTask) return
    setTasks(prev => prev.map(t => t.id === activeTask.id
      ? { ...t, recognizedText: next, wordCount: next.length, boxes: t.boxes.length > 0 ? t.boxes : makeBoxesFromText(next) }
      : t))
  }

  const updateActivePageSelection = (next: string) => {
    if (!activeTask) return
    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, selectedPages: next } : t))
  }

  // ═══ Exports ═══
  const downloadTxt = (task: OCRTask) => {
    saveAs(new Blob([task.recognizedText], { type: 'text/plain;charset=utf-8' }), `${task.file.name}.txt`)
  }

  const downloadJson = (task: OCRTask) => {
    const payload = {
      fileName: task.file.name, language: task.langDetected, confidence: task.confidence,
      pages: task.pageCount || 1, words: task.wordCount, durationMs: task.durationMs || 0,
      text: task.recognizedText, boxes: task.boxes,
      ...(task.tableRows.length > 0 ? { tableRows: task.tableRows } : {}),
    }
    saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `${task.file.name}.json`)
  }

  const downloadDocx = async (task: OCRTask) => {
    const doc = new Document({ sections: [{ children: task.recognizedText.split('\n').map(line => new Paragraph(line)) }] })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, `${task.file.name}.docx`)
  }

  const downloadSearchablePdf = (task: OCRTask) => {
    const pdf = new jsPDF()
    const lines = pdf.splitTextToSize(task.recognizedText || '', 180)
    let y = 16
    lines.forEach((line: string) => {
      if (y > 280) { pdf.addPage(); y = 16 }
      pdf.text(line, 12, y); y += 7
    })
    pdf.save(`${task.file.name}-searchable.pdf`)
  }

  const downloadExcel = (task: OCRTask) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rows = task.tableRows.length > 0 ? task.tableRows : task.boxes.map(b => [b.text, `${task.confidence.toFixed(1)}%`])
    const htmlRows = rows.map(row => `<tr>${row.map(c => `<td>${esc(c || '')}</td>`).join('')}</tr>`).join('')
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${htmlRows}</table></body></html>`
    saveAs(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${task.file.name}.xls`)
  }

  const downloadHtmlTable = (task: OCRTask) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rows = task.tableRows.length > 0 ? task.tableRows : task.boxes.map(b => [b.text])
    const htmlRows = rows.map(row => `<tr>${row.map(c => `<td>${esc(c || '')}</td>`).join('')}</tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OCR Table</title><style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}</style></head><body><table>${htmlRows}</table></body></html>`
    saveAs(new Blob([html], { type: 'text/html;charset=utf-8' }), `${task.file.name}.html`)
  }

  // ═══ Scroll to box ═══
  const scrollToBox = (boxId: string) => {
    setActiveBoxId(boxId)
    if (!activeTask || !editorRef.current) return
    const box = activeTask.boxes.find(b => b.id === boxId)
    if (!box?.text || !editorRef.current) return
    const idx = activeTask.recognizedText.indexOf(box.text)
    if (idx >= 0) {
      editorRef.current.focus()
      editorRef.current.setSelectionRange(idx, idx + box.text.length)
    }
  }

  // ═══ Stats summary ═══
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length

  // ═══ Render ═══
  return (
    <div className="ocr-workspace">
      {/* Toolbar */}
      <div className="ocr-toolbar">
        <h3>{getModeLabel()} • OCR Online</h3>
        <div className="ocr-actions">
          <input ref={inputRef} type="file" multiple
            accept=".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.pdf,image/*,application/pdf"
            onChange={handleUpload} style={{ display: 'none' }} />
          <button onClick={() => inputRef.current?.click()} className="ocr-btn">
            <Upload size={15} /> {zh ? '批量上传' : 'Upload'}
          </button>
          {!isProcessing ? (
            <button onClick={startOCR} className="ocr-btn ocr-primary" disabled={pendingCount === 0}>
              <Play size={15} /> {zh ? '开始识别' : 'Start OCR'}{pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ) : (
            <button onClick={stopOCR} className="ocr-btn ocr-btn-danger">
              <AlertTriangle size={15} /> {zh ? '停止' : 'Stop'}
            </button>
          )}
          {tasks.length > 0 && (
            <button onClick={clearAll} className="ocr-btn ocr-btn-sm ocr-btn-danger" disabled={isProcessing}>
              <Trash2 size={14} /> {zh ? '清空' : 'Clear'}
            </button>
          )}
          <div className="ocr-engine-switcher">
            <Cpu size={14} />
            <select
              value={ocrEngine}
              onChange={e => setOcrEngine(e.target.value as OcrEngine)}
              disabled={isProcessing}
              title={zh ? '选择OCR引擎' : 'Select OCR Engine'}
            >
              <option value="paddle">PaddleOCR v4</option>
              <option value="tesseract">Tesseract.js</option>
            </select>
          </div>
        </div>
      </div>

      {/* Format & limit hints */}
      <div className="ocr-support">
        {zh ? '支持格式：' : 'Supported: '}{SUPPORTED_HINT}
        <span className="ocr-size-limit">{zh ? `图片≤${IMG_MAX_MB}MB · PDF≤${PDF_MAX_MB}MB · ≤${PDF_MAX_PAGES}页` : `Image≤${IMG_MAX_MB}MB · PDF≤${PDF_MAX_MB}MB · ≤${PDF_MAX_PAGES}p`}</span>
      </div>

      {/* Drop zone when no tasks */}
      {tasks.length === 0 && (
        <div
          className={`ocr-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={36} />
          <p>{zh ? '拖拽文件到此处，或点击上传' : 'Drag & drop files here, or click to upload'}</p>
          <small>{zh ? `最多 ${BATCH_LIMIT} 个文件 · ${SUPPORTED_HINT}` : `Up to ${BATCH_LIMIT} files · ${SUPPORTED_HINT}`}</small>
        </div>
      )}

      {/* Main grid */}
      {tasks.length > 0 && (
        <div className="ocr-grid"
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >
          {/* Left: file list */}
          <div className="ocr-left">
            {tasks.map(task => (
              <div key={task.id}
                className={`ocr-task ${activeTaskId === task.id ? 'active' : ''}`}
                onClick={() => setActiveTaskId(task.id)}
              >
                <div className="ocr-task-top">
                  {task.previewUrl ? <img src={task.previewUrl} alt={task.file.name} /> : <div className="ocr-thumb-placeholder" />}
                  <div className="ocr-meta">
                    <div className="ocr-name">{task.file.name}</div>
                    <div className="ocr-file-size">{fmtSize(task.file.size)}</div>
                    <div className="ocr-tags">
                      <span><Languages size={12} /> {task.langDetected}</span>
                      <span><Clock3 size={12} /> ~{task.estimateSec}s</span>
                      <span><ScanLine size={12} /> {task.resolution || '-'}</span>
                      {(task.pageCount || 0) > 1 && <span>{task.pageCount}p</span>}
                    </div>
                    {task.error && <div className="ocr-task-error">{task.error}</div>}
                    <div className="ocr-progress">
                      <div className={`ocr-bar ${task.status === 'failed' ? 'ocr-bar-failed' : ''}`}>
                        <div style={{ width: `${task.progress}%` }} />
                      </div>
                      <small>{task.status === 'completed' ? (zh ? '✓ 完成' : '✓ Done') : task.status === 'failed' ? (zh ? '✗ 失败' : '✗ Failed') : task.status === 'processing' ? `${task.progress}%` : (zh ? '等待中' : 'Pending')}</small>
                    </div>
                    <div className="ocr-task-actions">
                      {(task.status === 'completed' || task.status === 'failed') && (
                        <button className="ocr-btn ocr-btn-sm" onClick={(e) => { e.stopPropagation(); resetTask(task.id) }}>
                          <RotateCcw size={12} /> {zh ? '重试' : 'Retry'}
                        </button>
                      )}
                      <button className="ocr-btn ocr-btn-sm ocr-btn-danger" onClick={(e) => { e.stopPropagation(); removeTask(task.id) }} disabled={isProcessing && task.status === 'processing'}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: preview + editor */}
          <div className="ocr-right">
            {activeTask ? (
              <>
                <div className="ocr-preview-row">
                  {/* Source preview with overlaid boxes */}
                  <div className="ocr-preview-col">
                    <h4>{zh ? '原图 / 原页' : 'Source'}</h4>
                    <div className="ocr-preview-stage">
                      {activeTask.previewUrl && <img src={activeTask.previewUrl} alt="preview" />}
                      {activeTask.boxes.filter(b => b.text).map(box => (
                        <button key={box.id}
                          className={`ocr-box ${activeBoxId === box.id ? 'active' : ''}`}
                          style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                          onClick={() => scrollToBox(box.id)}
                          title={box.text}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Editable text */}
                  <div className="ocr-preview-col">
                    <h4>{zh ? '识别文字（可编辑）' : 'Recognized Text (Editable)'}</h4>
                    <textarea ref={editorRef} className="ocr-editor"
                      value={activeTask.recognizedText}
                      onChange={e => updateActiveText(e.target.value)}
                      placeholder={zh ? '识别结果将实时显示在这里…' : 'OCR results will appear here in real time...'}
                      spellCheck={false}
                    />

                    {/* PDF page range selector */}
                    {(activeTask.file.type === 'application/pdf' || /\.pdf$/i.test(activeTask.file.name)) && (
                      <div className="ocr-page-range">
                        <label>{zh ? `页码范围（共 ${activeTask.pageCount || 1} 页，例：1-3,5）` : `Page range (${activeTask.pageCount || 1} pages total, e.g. 1-3,5)`}</label>
                        <input value={activeTask.selectedPages} onChange={e => updateActivePageSelection(e.target.value)} />
                      </div>
                    )}

                    {/* Linked text lines */}
                    <div className="ocr-lines">
                      {activeTask.boxes.filter(b => b.text).map(box => (
                        <span key={box.id}
                          className={activeBoxId === box.id ? 'active' : ''}
                          onMouseEnter={() => setActiveBoxId(box.id)}
                          onMouseLeave={() => setActiveBoxId(null)}
                          onClick={() => scrollToBox(box.id)}
                        >
                          {box.text}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Table preview for table mode */}
                {mode === 'table' && activeTask.tableRows.length > 0 && (
                  <div className="ocr-table-preview">
                    <table>
                      <thead>
                        <tr>{activeTask.tableRows[0].map((_, ci) => <th key={ci}>{zh ? `列 ${ci + 1}` : `Col ${ci + 1}`}</th>)}</tr>
                      </thead>
                      <tbody>
                        {activeTask.tableRows.map((row, ri) => (
                          <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell || ''}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Stats */}
                <div className="ocr-stat-row">
                  <span>{zh ? '耗时' : 'Time'}: {((activeTask.durationMs || 0) / 1000).toFixed(2)}s</span>
                  <span>{zh ? '语言' : 'Lang'}: {activeTask.langDetected.toUpperCase()}</span>
                  <span>{zh ? '置信度' : 'Conf'}: {activeTask.confidence.toFixed(1)}%</span>
                  <span>{zh ? '字数' : 'Chars'}: {activeTask.wordCount}</span>
                  {(activeTask.pageCount || 0) > 1 && <span>{zh ? '页数' : 'Pages'}: {activeTask.pageCount}</span>}
                  {mode === 'table' && activeTask.tableRows.length > 0 && (
                    <span>{zh ? '表格' : 'Table'}: {activeTask.tableRows.length}×{activeTask.tableRows[0]?.length || 0}</span>
                  )}
                </div>

                {/* Exports */}
                <div className="ocr-export-row">
                  <button className="ocr-btn ocr-btn-sm" onClick={() => downloadTxt(activeTask)}><FileText size={14} /> TXT</button>
                  <button className="ocr-btn ocr-btn-sm" onClick={() => downloadDocx(activeTask)}><FileType2 size={14} /> DOCX</button>
                  <button className="ocr-btn ocr-btn-sm" onClick={() => downloadSearchablePdf(activeTask)}><Download size={14} /> PDF</button>
                  <button className="ocr-btn ocr-btn-sm" onClick={() => downloadJson(activeTask)}><FileJson size={14} /> JSON</button>
                  {mode === 'table' && (
                    <>
                      <button className="ocr-btn ocr-btn-sm" onClick={() => downloadExcel(activeTask)}><FileSpreadsheet size={14} /> Excel</button>
                      <button className="ocr-btn ocr-btn-sm" onClick={() => downloadHtmlTable(activeTask)}><FileText size={14} /> HTML</button>
                    </>
                  )}
                  <button className="ocr-btn ocr-btn-sm" onClick={() => navigator.clipboard.writeText(activeTask.recognizedText)}><Copy size={14} /> {zh ? '复制' : 'Copy'}</button>
                </div>
              </>
            ) : (
              <div className="ocr-empty">
                <div className="ocr-empty-icon">📑</div>
                {zh ? '选择左侧文件查看详情，或上传文件开始 OCR' : 'Select a file on the left, or upload files to start OCR'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {tasks.length > 0 && (
        <div className="ocr-stat-row">
          <span>{zh ? '总文件' : 'Files'}: {tasks.length}</span>
          <span>{zh ? '已完成' : 'Done'}: {completedCount}</span>
          <span>{zh ? '等待中' : 'Pending'}: {pendingCount}</span>
        </div>
      )}

      {/* Footer */}
      <div className="ocr-note">
        {zh
          ? `纯前端 OCR：支持 PaddleOCR v4（ONNX Runtime Web，det+rec 双模型，中英文精度高）和 Tesseract.js（100+ 语言广覆盖）双引擎。PDF 支持分页选择识别，表格模式保留行列结构。所有处理在浏览器本地完成，文件不上传服务器。当前引擎：${ocrEngine === 'paddle' ? 'PaddleOCR v4' : 'Tesseract.js'}`
          : `Client-side OCR with dual engines: PaddleOCR v4 (ONNX Runtime Web, high-accuracy det+rec for CJK) and Tesseract.js (100+ languages). PDF supports page-range selection. Table mode preserves row/column structure. All processing happens locally in your browser. Current engine: ${ocrEngine === 'paddle' ? 'PaddleOCR v4' : 'Tesseract.js'}`}
      </div>
    </div>
  )
}
