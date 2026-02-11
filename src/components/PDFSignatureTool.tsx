import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Upload, Download, PenTool, X, Calendar, Maximize2, Droplet, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Info, Trash2, RotateCcw } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'
import { PDFDocument, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
import * as pdfjsLib from 'pdfjs-dist'
import { useI18n } from '../i18n/I18nContext'
import '../utils/pdfWorkerConfig'
import './PDFSignatureTool.css'

interface Signature {
  id: string
  type: 'signature' | 'date'
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
  data?: string
  backgroundColor?: string
}

type ToastType = 'success' | 'error' | 'info'

export default function PDFSignatureTool() {
  const { t } = useI18n()
  // Toast
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const showToast = (type: ToastType, message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ type, message })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  // State
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [renderScale, setRenderScale] = useState(1.5)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [showSignaturePanel, setShowSignaturePanel] = useState(false)
  const [showDatePanel, setShowDatePanel] = useState(false)
  const signatureCanvasRef = useRef<SignatureCanvas>(null)
  const dateCanvasRef = useRef<SignatureCanvas>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const pdfPreviewRef = useRef<HTMLDivElement>(null)
  const [penSize, setPenSize] = useState(2)
  const [pageThumbnails, setPageThumbnails] = useState<Map<number, string>>(new Map())
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [resultInfo, setResultInfo] = useState<{ name: string; size: number; pages: number } | null>(null)
  const resultBlobRef = useRef<Blob | null>(null)

  // FAQ
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const faqItems = useMemo(() => [
    { q: t('pdfSignatureTool.faq1Q'), a: t('pdfSignatureTool.faq1A') },
    { q: t('pdfSignatureTool.faq2Q'), a: t('pdfSignatureTool.faq2A') },
    { q: t('pdfSignatureTool.faq3Q'), a: t('pdfSignatureTool.faq3A') },
  ], [t])

  // Render PDF page to canvas
  const renderPdfToCanvas = useCallback(async (pdf: any, pageNum: number, scale: number) => {
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      context.clearRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise
      setCanvasSize({ width: viewport.width, height: viewport.height })
    } catch (err) {
      console.error('Render PDF failed', err)
      showToast('error', t('pdfSignatureTool.renderFailed'))
    }
  }, [t])

  // Generate thumbnail
  const generateThumbnail = useCallback(async (pdf: any, pageNum: number): Promise<string> => {
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 0.3 })
      const c = document.createElement('canvas')
      c.width = viewport.width; c.height = viewport.height
      const ctx = c.getContext('2d')
      if (!ctx) return ''
      await page.render({ canvasContext: ctx, viewport }).promise
      return c.toDataURL()
    } catch { return '' }
  }, [])

  // Page navigation
  const goToPage = useCallback(async (pageNum: number) => {
    if (!pdfDocument || pageNum < 1 || pageNum > totalPages) return
    setCurrentPage(pageNum)
    await renderPdfToCanvas(pdfDocument, pageNum, renderScale)
  }, [pdfDocument, totalPages, renderScale, renderPdfToCanvas])

  // Current page signatures
  const currentPageSignatures = useMemo(() => signatures.filter(s => s.pageNumber === currentPage), [signatures, currentPage])
  const signatureStats = useMemo(() => {
    const byPage = new Map<number, number>()
    signatures.forEach(s => byPage.set(s.pageNumber, (byPage.get(s.pageNumber) || 0) + 1))
    return { total: signatures.length, byPage, pagesWithSignatures: byPage.size }
  }, [signatures])

  // File upload
  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('error', t('pdfSignatureTool.onlyPDF')); return
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast('error', t('pdfSignatureTool.fileTooLarge')); return
    }
    setPdfFile(file); setSignatures([]); setCurrentPage(1); setResultInfo(null); resultBlobRef.current = null
    try {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        const { configurePDFWorker } = await import('../utils/pdfWorkerConfig')
        await configurePDFWorker()
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = import.meta.env.DEV
            ? '/pdf.worker.min.mjs'
            : `${(import.meta.env.BASE_URL || '/tools/').replace(/\/$/, '')}/pdf.worker.min.mjs`
        }
      }
      const arrayBuffer = await file.arrayBuffer()
      if (arrayBuffer.byteLength === 0) throw new Error('Empty file')
      const uint8 = new Uint8Array(arrayBuffer)
      if (String.fromCharCode(...uint8.slice(0, 4)) !== '%PDF') throw new Error('Not a PDF')
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0, useWorkerFetch: false, isEvalSupported: false }).promise
      setPdfDocument(pdf); setTotalPages(pdf.numPages)
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.0 })
      const container = pdfPreviewRef.current
      if (container) {
        const sw = (container.offsetWidth || 800) / viewport.width
        const sh = (container.offsetHeight || 800) / viewport.height
        const scale = Math.min(sw, sh) * 0.95
        setRenderScale(scale)
        await renderPdfToCanvas(pdf, 1, scale)
        setTimeout(async () => {
          const thumbs = new Map<number, string>()
          for (let i = 1; i <= pdf.numPages; i++) {
            const thumb = await generateThumbnail(pdf, i)
            if (thumb) { thumbs.set(i, thumb); setPageThumbnails(new Map(thumbs)) }
          }
        }, 100)
      }
      showToast('success', t('pdfSignatureTool.pdfLoaded').replace('{pages}', String(pdf.numPages)))
    } catch (err) {
      console.error('Load PDF failed', err)
      showToast('error', t('pdfSignatureTool.loadFailed'))
      setPdfFile(null); setPdfDocument(null); setTotalPages(0)
    }
  }, [renderPdfToCanvas, generateThumbnail, t])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleFile(file)
  }, [handleFile])

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingFile(true) }
  const handleDragLeave = () => setIsDraggingFile(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]; if (file) handleFile(file)
  }

  // Add signature
  const handleAddSignature = useCallback(() => {
    if (!signatureCanvasRef.current) return
    const dataURL = signatureCanvasRef.current.toDataURL()
    if (!dataURL || dataURL === 'data:,') { showToast('error', t('pdfSignatureTool.drawFirst')); return }
    setSignatures(prev => [...prev, {
      id: Date.now().toString(), type: 'signature', pageNumber: currentPage,
      x: 100, y: 100, width: 250, height: 100, data: dataURL, backgroundColor
    }])
    setShowSignaturePanel(false); signatureCanvasRef.current.clear()
    showToast('success', t('pdfSignatureTool.signatureAdded'))
  }, [backgroundColor, currentPage, t])

  // Add date
  const handleAddDate = useCallback(() => {
    if (!dateCanvasRef.current) return
    const dataURL = dateCanvasRef.current.toDataURL()
    if (!dataURL || dataURL === 'data:,') { showToast('error', t('pdfSignatureTool.drawFirst')); return }
    setSignatures(prev => [...prev, {
      id: Date.now().toString(), type: 'date', pageNumber: currentPage,
      x: 100, y: 200, width: 180, height: 60, data: dataURL, backgroundColor
    }])
    setShowDatePanel(false); dateCanvasRef.current.clear()
    showToast('success', t('pdfSignatureTool.dateAdded'))
  }, [backgroundColor, currentPage, t])

  // Delete
  const handleDeleteSignature = useCallback((id: string) => setSignatures(prev => prev.filter(s => s.id !== id)), [])

  // Drag & resize signatures
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragging(id)
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const overlay = document.querySelector('.pst-pdf-overlay') as HTMLElement
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    if (resizing) {
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const nw = Math.max(100, mx - resizeStart.x + resizeStart.width)
      const nh = Math.max(50, my - resizeStart.y + resizeStart.height)
      setSignatures(prev => prev.map(s => s.id === resizing ? { ...s, width: Math.min(nw, canvasSize.width - s.x), height: Math.min(nh, canvasSize.height - s.y) } : s))
    } else if (dragging) {
      const x = e.clientX - rect.left - dragOffset.x, y = e.clientY - rect.top - dragOffset.y
      setSignatures(prev => prev.map(s => s.id === dragging ? { ...s, x: Math.max(0, Math.min(x, canvasSize.width - s.width)), y: Math.max(0, Math.min(y, canvasSize.height - s.height)) } : s))
    }
  }, [resizing, dragging, resizeStart, dragOffset, canvasSize])
  const handleMouseUp = () => { setDragging(null); setResizing(null) }
  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    const sig = signatures.find(s => s.id === id); if (!sig) return
    setResizing(id)
    setResizeStart({ x: sig.x + sig.width, y: sig.y + sig.height, width: sig.width, height: sig.height })
  }

  // Update pen size
  useEffect(() => {
    if (showSignaturePanel && signatureCanvasRef.current) {
      (signatureCanvasRef.current as any).minWidth = penSize;
      (signatureCanvasRef.current as any).maxWidth = penSize
    }
  }, [showSignaturePanel, penSize])
  useEffect(() => {
    if (showDatePanel && dateCanvasRef.current) {
      (dateCanvasRef.current as any).minWidth = penSize;
      (dateCanvasRef.current as any).maxWidth = penSize
    }
  }, [showDatePanel, penSize])

  // Hex to RGB
  const hexToRgb = (hex: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null
  }

  // Update signature bg color
  const updateSignatureBackground = useCallback((id: string, color: string) => {
    setSignatures(prev => prev.map(s => s.id === id ? { ...s, backgroundColor: color } : s))
  }, [])

  // Apply signatures & save
  const handleApply = async () => {
    if (!pdfFile || signatures.length === 0) { showToast('error', t('pdfSignatureTool.noSignatures')); return }
    setLoading(true)
    try {
      const arrayBuffer = await pdfFile.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const pages = pdfDoc.getPages()
      const sigsByPage = new Map<number, Signature[]>()
      signatures.forEach(s => { if (!sigsByPage.has(s.pageNumber)) sigsByPage.set(s.pageNumber, []); sigsByPage.get(s.pageNumber)!.push(s) })

      for (const [pageNum, pageSigs] of sigsByPage.entries()) {
        if (pageNum < 1 || pageNum > pages.length) continue
        const page = pages[pageNum - 1]
        const { width: pw, height: ph } = page.getSize()
        if (!pdfDocument) throw new Error('PDF not loaded')
        const pdfPage = await pdfDocument.getPage(pageNum)
        const vp = pdfPage.getViewport({ scale: renderScale })
        const sx = pw / vp.width, sy = ph / vp.height

        for (const sig of pageSigs) {
          if (!sig.data) continue
          const pdfX = sig.x * sx
          const pdfY = ph - (sig.y + sig.height) * sy
          const pdfW = sig.width * sx, pdfH = sig.height * sy

          if (sig.backgroundColor && sig.backgroundColor !== '#ffffff') {
            const c = hexToRgb(sig.backgroundColor)
            if (c) page.drawRectangle({ x: pdfX, y: pdfY, width: pdfW, height: pdfH, color: rgb(c.r / 255, c.g / 255, c.b / 255) })
          }
          const b64 = sig.data.split(',')[1]
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const image = await pdfDoc.embedPng(bytes)
          page.drawImage(image, { x: pdfX, y: pdfY, width: pdfW, height: pdfH })
        }
      }
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const outName = pdfFile.name.replace('.pdf', '-signed.pdf')
      resultBlobRef.current = blob
      setResultInfo({ name: outName, size: blob.size, pages: pages.length })
      showToast('success', t('pdfSignatureTool.applySuccess').replace('{count}', String(signatures.length)))
    } catch (err) {
      showToast('error', t('pdfSignatureTool.applyFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
    } finally { setLoading(false) }
  }

  const handleDownload = () => {
    if (resultBlobRef.current && resultInfo) saveAs(resultBlobRef.current, resultInfo.name)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const removePdf = () => {
    setPdfFile(null); setPdfDocument(null); setTotalPages(0); setCurrentPage(1)
    setSignatures([]); setPageThumbnails(new Map()); setResultInfo(null); resultBlobRef.current = null
  }

  return (
    <div className="pst-container">
      {/* Toast */}
      {toast && (
        <div className={`pst-toast pst-toast-${toast.type}`}>
          <CheckCircle size={18} />
          <span>{toast.message}</span>
          <button className="pst-toast-close" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Signature/Date drawing panels */}
      {showSignaturePanel && (
        <div className="pst-modal-overlay" onClick={() => setShowSignaturePanel(false)}>
          <div className="pst-modal" onClick={e => e.stopPropagation()}>
            <div className="pst-modal-header">
              <h3><PenTool size={18} /> {t('pdfSignatureTool.drawSignature')}</h3>
              <button className="pst-modal-close" onClick={() => setShowSignaturePanel(false)}><X size={18} /></button>
            </div>
            <div className="pst-pen-control">
              <label>{t('pdfSignatureTool.penSize')}: {penSize}px</label>
              <input type="range" min="1" max="10" step="0.5" value={penSize} className="pst-slider"
                onChange={e => { const v = parseFloat(e.target.value); setPenSize(v); setTimeout(() => { if (signatureCanvasRef.current) { (signatureCanvasRef.current as any).minWidth = v; (signatureCanvasRef.current as any).maxWidth = v } }, 0) }} />
            </div>
            <div className="pst-canvas-wrap">
              <SignatureCanvas ref={signatureCanvasRef} penColor="#000000" minWidth={penSize} maxWidth={penSize} velocityFilterWeight={0.7}
                canvasProps={{ className: 'pst-sig-canvas', width: 560, height: 220, style: { touchAction: 'none', display: 'block', width: '560px', height: '220px' } }} />
            </div>
            <div className="pst-modal-actions">
              <button className="pst-btn-secondary" onClick={() => signatureCanvasRef.current?.clear()}><RotateCcw size={14} /> {t('pdfSignatureTool.clear')}</button>
              <button className="pst-btn-primary" onClick={handleAddSignature}><CheckCircle size={14} /> {t('pdfSignatureTool.confirmAdd')}</button>
            </div>
          </div>
        </div>
      )}
      {showDatePanel && (
        <div className="pst-modal-overlay" onClick={() => setShowDatePanel(false)}>
          <div className="pst-modal" onClick={e => e.stopPropagation()}>
            <div className="pst-modal-header">
              <h3><Calendar size={18} /> {t('pdfSignatureTool.drawDate')}</h3>
              <button className="pst-modal-close" onClick={() => setShowDatePanel(false)}><X size={18} /></button>
            </div>
            <div className="pst-pen-control">
              <label>{t('pdfSignatureTool.penSize')}: {penSize}px</label>
              <input type="range" min="1" max="10" step="0.5" value={penSize} className="pst-slider"
                onChange={e => { const v = parseFloat(e.target.value); setPenSize(v); setTimeout(() => { if (dateCanvasRef.current) { (dateCanvasRef.current as any).minWidth = v; (dateCanvasRef.current as any).maxWidth = v } }, 0) }} />
            </div>
            <div className="pst-canvas-wrap">
              <SignatureCanvas ref={dateCanvasRef} penColor="#000000" minWidth={penSize} maxWidth={penSize} velocityFilterWeight={0.7}
                canvasProps={{ className: 'pst-sig-canvas', width: 560, height: 160, style: { touchAction: 'none', display: 'block', width: '560px', height: '160px' } }} />
            </div>
            <div className="pst-modal-actions">
              <button className="pst-btn-secondary" onClick={() => dateCanvasRef.current?.clear()}><RotateCcw size={14} /> {t('pdfSignatureTool.clear')}</button>
              <button className="pst-btn-primary" onClick={handleAddDate}><CheckCircle size={14} /> {t('pdfSignatureTool.confirmAdd')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="pst-main-layout">
        {/* Left: Controls */}
        <div className="pst-left-panel">
          {/* Background & tools */}
          <div className="pst-card">
            <div className="pst-card-title"><PenTool size={18} /> {t('pdfSignatureTool.signatureTools')}</div>
            <div className="pst-field">
              <label><Droplet size={14} /> {t('pdfSignatureTool.bgColor')}</label>
              <div className="pst-color-row">
                <input type="color" className="pst-color-picker" value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)} />
                <span className="pst-color-value">{backgroundColor}</span>
                <div className="pst-color-presets">
                  {['#ffffff', '#fffde7', '#f3e5f5', '#e3f2fd', '#e8f5e9'].map(c => (
                    <button key={c} className={`pst-color-preset ${backgroundColor === c ? 'active' : ''}`}
                      style={{ background: c }} onClick={() => setBackgroundColor(c)} />
                  ))}
                </div>
              </div>
            </div>
            <div className="pst-tool-buttons">
              <button className="pst-tool-btn pst-tool-signature" onClick={() => { setShowSignaturePanel(true); setShowDatePanel(false) }}>
                <PenTool size={18} /> {t('pdfSignatureTool.addSignature')}
              </button>
              <button className="pst-tool-btn pst-tool-date" onClick={() => { setShowDatePanel(true); setShowSignaturePanel(false) }}>
                <Calendar size={18} /> {t('pdfSignatureTool.addDate')}
              </button>
            </div>
          </div>

          {/* Upload */}
          <div className="pst-card">
            <div className="pst-card-title"><Upload size={18} /> {t('pdfSignatureTool.selectPDF')}</div>
            <div className={`pst-dropzone ${isDraggingFile ? 'dragging' : ''} ${pdfFile ? 'has-file' : ''}`}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => { if (!pdfFile) document.getElementById('pst-file-input')?.click() }}>
              <input id="pst-file-input" type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />
              {pdfFile ? (
                <div className="pst-file-preview">
                  <div className="pst-file-icon"><Upload size={22} /></div>
                  <div className="pst-file-info">
                    <span className="pst-file-name">{pdfFile.name}</span>
                    <span className="pst-file-size">{formatSize(pdfFile.size)} · {totalPages} {t('pdfSignatureTool.pages')}</span>
                  </div>
                  <button className="pst-remove-btn" onClick={e => { e.stopPropagation(); removePdf() }}><X size={16} /></button>
                </div>
              ) : (
                <div className="pst-drop-content">
                  <Upload size={32} />
                  <p className="pst-drop-title">{t('pdfSignatureTool.dropTitle')}</p>
                  <p className="pst-drop-hint">{t('pdfSignatureTool.dropHint')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Signature list */}
          {signatures.length > 0 && (
            <div className="pst-card">
              <div className="pst-card-title"><CheckCircle size={18} /> {t('pdfSignatureTool.signatureList')} ({signatures.length})</div>
              <div className="pst-sig-list">
                {signatures.map((sig, idx) => (
                  <div key={sig.id} className="pst-sig-item">
                    <div className="pst-sig-item-preview">
                      {sig.data && <img src={sig.data} alt="" />}
                    </div>
                    <div className="pst-sig-item-info">
                      <span className="pst-sig-item-label">{sig.type === 'signature' ? t('pdfSignatureTool.sigLabel') : t('pdfSignatureTool.dateLabel')} #{idx + 1}</span>
                      <span className="pst-sig-item-page">{t('pdfSignatureTool.page')} {sig.pageNumber}</span>
                    </div>
                    <button className="pst-sig-item-del" onClick={() => handleDeleteSignature(sig.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview & Result */}
        <div className="pst-right-panel">
          {/* Page navigation */}
          {pdfFile && totalPages > 1 && (
            <div className="pst-page-nav">
              <button className="pst-page-btn" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>
                <ChevronLeft size={16} />
              </button>
              <div className="pst-page-indicator">
                <span className="pst-current-page">{currentPage}</span>
                <span className="pst-page-sep">/</span>
                <span className="pst-total-pages">{totalPages}</span>
                {signatureStats.byPage.get(currentPage) ? (
                  <span className="pst-page-badge">{signatureStats.byPage.get(currentPage)} {t('pdfSignatureTool.sigOnPage')}</span>
                ) : null}
              </div>
              <button className="pst-page-btn" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Thumbnails */}
          {pdfFile && totalPages > 1 && (
            <div className="pst-thumbnails">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => {
                const thumb = pageThumbnails.get(num)
                const count = signatureStats.byPage.get(num) || 0
                return (
                  <div key={num} className={`pst-thumb ${num === currentPage ? 'active' : ''} ${count > 0 ? 'has-sig' : ''}`} onClick={() => goToPage(num)}>
                    {thumb ? <img src={thumb} alt="" /> : <span>{num}</span>}
                    <div className="pst-thumb-label">
                      <span>{num}</span>
                      {count > 0 && <span className="pst-thumb-badge">{count}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* PDF Preview */}
          <div className="pst-card pst-preview-card">
            <div className="pst-card-title">{t('pdfSignatureTool.pdfPreview')}</div>
            <div ref={pdfPreviewRef} className="pst-preview-wrap"
              onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
              {pdfFile ? (
                <div className="pst-pdf-wrapper">
                  <canvas ref={canvasRef} className="pst-pdf-canvas" style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />
                  <div className="pst-pdf-overlay" style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: canvasSize.width, height: canvasSize.height, pointerEvents: 'none'
                  }}>
                    {currentPageSignatures.map(sig => (
                      <div key={sig.id} className={`pst-sig-on-pdf ${sig.type}`}
                        style={{ left: sig.x, top: sig.y, width: sig.width, height: sig.height, backgroundColor: sig.backgroundColor || backgroundColor }}
                        onMouseDown={e => { if (!(e.target as HTMLElement).classList.contains('pst-resize-handle')) handleMouseDown(e, sig.id) }}>
                        {sig.data && <img src={sig.data} alt="" className="pst-sig-img" />}
                        <div className="pst-sig-actions">
                          <input type="color" className="pst-sig-color" value={sig.backgroundColor || backgroundColor}
                            onChange={e => updateSignatureBackground(sig.id, e.target.value)} />
                          <button className="pst-sig-delete" onClick={() => handleDeleteSignature(sig.id)}><X size={14} /></button>
                        </div>
                        <div className="pst-resize-handle" onMouseDown={e => handleResizeStart(e, sig.id)}>
                          <Maximize2 size={10} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pst-no-preview">
                  <Upload size={40} />
                  <p>{t('pdfSignatureTool.uploadFirst')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Action button */}
          {pdfFile && signatures.length > 0 && !resultInfo && (
            <div className="pst-actions">
              <button className="pst-process-btn" onClick={handleApply} disabled={loading}>
                {loading ? <><span className="pst-spinner" /> {t('pdfSignatureTool.processing')}</> : <><Download size={18} /> {t('pdfSignatureTool.applySignatures')}</>}
              </button>
            </div>
          )}

          {/* Result */}
          {resultInfo && (
            <div className="pst-card pst-result-card">
              <div className="pst-result-header"><CheckCircle size={20} /> <span>{t('pdfSignatureTool.signatureDone')}</span></div>
              <div className="pst-result-info">
                <div className="pst-result-row"><span>{t('pdfSignatureTool.outputFile')}</span><strong>{resultInfo.name}</strong></div>
                <div className="pst-result-row"><span>{t('pdfSignatureTool.totalPages')}</span><strong>{resultInfo.pages}</strong></div>
                <div className="pst-result-row"><span>{t('pdfSignatureTool.outputSize')}</span><strong>{formatSize(resultInfo.size)}</strong></div>
                <div className="pst-result-row"><span>{t('pdfSignatureTool.sigCount')}</span><strong>{signatures.length}</strong></div>
              </div>
              <button className="pst-download-btn" onClick={handleDownload}><Download size={18} /> {t('pdfSignatureTool.downloadResult')}</button>
            </div>
          )}
        </div>
      </div>

      {/* FAQ */}
      <div className="pst-faq-section">
        <h3><Info size={18} /> {t('pdfSignatureTool.faqTitle')}</h3>
        {faqItems.map((item, i) => (
          <div key={i} className={`pst-faq-item ${openFAQ === i ? 'open' : ''}`}>
            <button className="pst-faq-q" onClick={() => setOpenFAQ(openFAQ === i ? null : i)}>
              {item.q} <ChevronDown size={16} />
            </button>
            {openFAQ === i && <div className="pst-faq-a">{item.a}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
