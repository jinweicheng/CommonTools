import { useState, useRef, useCallback, DragEvent, useEffect } from 'react'
import { Upload, Download, Droplet, Eye, Trash2, FileText, Sliders, Type, RotateCcw, AlertCircle, CheckCircle, Info, X, ChevronDown } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { saveAs } from 'file-saver'
import * as pdfjsLib from 'pdfjs-dist'
import { useI18n } from '../i18n/I18nContext'
import '../utils/pdfWorkerConfig'
import './PDFWatermarkTool.css'

interface ToastMessage {
  type: 'success' | 'error' | 'info'
  text: string
}

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Text to image for Chinese character support
const textToImage = async (text: string, fontSize: number, color: string = '#808080'): Promise<string> => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
  const metrics = ctx.measureText(text)
  canvas.width = metrics.width + 20
  canvas.height = fontSize * 1.2 + 20
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 10, canvas.height / 2)
  return canvas.toDataURL('image/png')
}

export default function PDFWatermarkTool() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultName, setResultName] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showFaq, setShowFaq] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Watermark settings
  const [watermarkText, setWatermarkText] = useState(() => t('pdfWatermarkTool.defaultText'))
  const [opacity, setOpacity] = useState(0.3)
  const [fontSize, setFontSize] = useState(24)
  const [angle, setAngle] = useState(-45)
  const [spacing, setSpacing] = useState(200)
  const [watermarkColor, setWatermarkColor] = useState('#808080')

  const canProcess = pdfFile && watermarkText.trim().length > 0 && !loading

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 5000)
  }, [])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const file = files[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('error', t('pdfWatermarkTool.onlyPDF'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast('error', t('pdfWatermarkTool.fileTooLarge'))
      return
    }
    setPdfFile(file)
    setResultBlob(null)
    setResultName('')
    setPreviewUrl(null)
    // Generate preview
    generatePreview(file)
  }, [showToast, t])

  // Generate PDF preview of first page
  const generatePreview = async (file: File) => {
    setPreviewLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1 })
      const scale = Math.min(400 / viewport.width, 500 / viewport.height)
      const scaledViewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = scaledViewport.width
      canvas.height = scaledViewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise

      // Draw watermark preview on canvas
      ctx.save()
      ctx.globalAlpha = opacity
      ctx.fillStyle = watermarkColor
      ctx.font = `${fontSize * scale}px Arial, "Microsoft YaHei", sans-serif`
      const radians = (angle * Math.PI) / 180
      const spacingScaled = spacing * scale
      for (let x = -spacingScaled; x < canvas.width + spacingScaled; x += spacingScaled) {
        for (let y = 0; y < canvas.height + spacingScaled; y += spacingScaled) {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(radians)
          ctx.fillText(watermarkText, 0, 0)
          ctx.restore()
        }
      }
      ctx.restore()

      setPreviewUrl(canvas.toDataURL('image/png'))
    } catch (err) {
      console.error('Preview failed:', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Re-generate preview when settings change
  useEffect(() => {
    if (pdfFile) {
      const timer = setTimeout(() => generatePreview(pdfFile), 300)
      return () => clearTimeout(timer)
    }
  }, [watermarkText, opacity, fontSize, angle, spacing, watermarkColor])

  // Process watermark
  const processWatermark = async () => {
    if (!pdfFile || !watermarkText.trim()) return
    setLoading(true)
    try {
      const arrayBuffer = await pdfFile.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      if (String.fromCharCode(...uint8.slice(0, 4)) !== '%PDF') {
        showToast('error', t('pdfWatermarkTool.invalidPDF'))
        setLoading(false)
        return
      }

      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const pages = pdfDoc.getPages()
      if (pages.length === 0) {
        showToast('error', t('pdfWatermarkTool.pdfNoPages'))
        setLoading(false)
        return
      }

      const hasChinese = /[\u4e00-\u9fa5]/.test(watermarkText)
      let watermarkImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
      let imageDims: { width: number; height: number } | null = null

      if (hasChinese) {
        const dataUrl = await textToImage(watermarkText, fontSize, watermarkColor)
        const base64 = dataUrl.split(',')[1]
        const bin = atob(base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        watermarkImage = await pdfDoc.embedPng(bytes)
        imageDims = watermarkImage.scale(1)
      }

      // Parse color
      const r = parseInt(watermarkColor.slice(1, 3), 16) / 255
      const g = parseInt(watermarkColor.slice(3, 5), 16) / 255
      const b = parseInt(watermarkColor.slice(5, 7), 16) / 255

      for (const page of pages) {
        const { width, height } = page.getSize()
        if (hasChinese && watermarkImage && imageDims) {
          for (let x = -spacing; x < width + spacing; x += spacing) {
            for (let y = -spacing; y < height + spacing; y += spacing) {
              page.drawImage(watermarkImage, {
                x: x - imageDims.width / 2,
                y: y - imageDims.height / 2,
                width: imageDims.width,
                height: imageDims.height,
                opacity,
                rotate: degrees(angle),
              })
            }
          }
        } else {
          for (let x = 0; x < width + spacing; x += spacing) {
            for (let y = 0; y < height + spacing; y += spacing) {
              page.drawText(watermarkText, {
                x: x - (watermarkText.length * fontSize * 0.6) / 2,
                y: y - fontSize / 2,
                size: fontSize,
                color: rgb(r, g, b),
                opacity,
                rotate: degrees(angle),
              })
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const outputName = pdfFile.name.replace('.pdf', '-watermarked.pdf')
      setResultBlob(blob)
      setResultName(outputName)
      showToast('success', t('pdfWatermarkTool.watermarkSuccess').replace('{pages}', String(pages.length)))
    } catch (err) {
      console.error('[PDFWatermarkTool] Error:', err)
      showToast('error', t('pdfWatermarkTool.watermarkFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (resultBlob && resultName) saveAs(resultBlob, resultName)
  }

  const clearFile = () => {
    setPdfFile(null)
    setResultBlob(null)
    setResultName('')
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resetSettings = () => {
    setWatermarkText(t('pdfWatermarkTool.defaultText'))
    setOpacity(0.3)
    setFontSize(24)
    setAngle(-45)
    setSpacing(200)
    setWatermarkColor('#808080')
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  const faqItems = [
    { q: t('pdfWatermarkTool.faq1Q'), a: t('pdfWatermarkTool.faq1A') },
    { q: t('pdfWatermarkTool.faq2Q'), a: t('pdfWatermarkTool.faq2A') },
    { q: t('pdfWatermarkTool.faq3Q'), a: t('pdfWatermarkTool.faq3A') },
  ]

  return (
    <div className="pwt-container">
      {/* Toast */}
      {toast && (
        <div className={`pwt-toast pwt-toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'error' && <AlertCircle size={18} />}
          {toast.type === 'info' && <Info size={18} />}
          <span>{toast.text}</span>
          <button className="pwt-toast-close" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Main Layout */}
      <div className="pwt-main-layout">
        {/* Left: Settings */}
        <div className="pwt-left-panel">
          <div className="pwt-card pwt-settings-card">
            <div className="pwt-card-title-row">
              <h3 className="pwt-card-title">
                <Sliders size={18} />
                {t('pdfWatermarkTool.watermarkSettings')}
              </h3>
              <button className="pwt-reset-btn" onClick={resetSettings} title={t('pdfWatermarkTool.resetSettings')}>
                <RotateCcw size={14} />
              </button>
            </div>

            {/* Watermark Text */}
            <div className="pwt-field">
              <label><Type size={14} /> {t('pdfWatermarkTool.watermarkText')}</label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder={t('pdfWatermarkTool.textPlaceholder')}
                maxLength={50}
              />
              <span className="pwt-char-count">{watermarkText.length}/50</span>
            </div>

            {/* Opacity */}
            <div className="pwt-field">
              <label><Droplet size={14} /> {t('pdfWatermarkTool.opacity')}: {Math.round(opacity * 100)}%</label>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="pwt-slider"
              />
            </div>

            {/* Font Size */}
            <div className="pwt-field">
              <label><Type size={14} /> {t('pdfWatermarkTool.fontSize')}: {fontSize}px</label>
              <input
                type="range"
                min="8"
                max="72"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="pwt-slider"
              />
            </div>

            {/* Angle */}
            <div className="pwt-field">
              <label><RotateCcw size={14} /> {t('pdfWatermarkTool.angle')}: {angle}°</label>
              <input
                type="range"
                min="-90"
                max="90"
                step="5"
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value))}
                className="pwt-slider"
              />
            </div>

            {/* Spacing */}
            <div className="pwt-field">
              <label>{t('pdfWatermarkTool.spacing')}: {spacing}px</label>
              <input
                type="range"
                min="100"
                max="400"
                step="10"
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
                className="pwt-slider"
              />
            </div>

            {/* Color */}
            <div className="pwt-field">
              <label>{t('pdfWatermarkTool.color')}</label>
              <div className="pwt-color-row">
                <input
                  type="color"
                  value={watermarkColor}
                  onChange={(e) => setWatermarkColor(e.target.value)}
                  className="pwt-color-picker"
                />
                <span className="pwt-color-value">{watermarkColor}</span>
                <div className="pwt-color-presets">
                  {['#808080', '#ff0000', '#0000ff', '#000000', '#ff6600'].map(c => (
                    <button
                      key={c}
                      className={`pwt-color-preset ${watermarkColor === c ? 'active' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setWatermarkColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Upload & Preview */}
        <div className="pwt-right-panel">
          <div className="pwt-card pwt-upload-card">
            <h3 className="pwt-card-title">
              <FileText size={18} />
              {t('pdfWatermarkTool.selectPDF')}
            </h3>

            <div
              className={`pwt-dropzone ${isDragging ? 'dragging' : ''} ${pdfFile ? 'has-file' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !pdfFile && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                style={{ display: 'none' }}
              />

              {pdfFile ? (
                <div className="pwt-file-preview">
                  <div className="pwt-file-icon"><FileText size={32} /></div>
                  <div className="pwt-file-info">
                    <span className="pwt-file-name">{pdfFile.name}</span>
                    <span className="pwt-file-size">{formatFileSize(pdfFile.size)}</span>
                  </div>
                  <button className="pwt-remove-btn" onClick={(e) => { e.stopPropagation(); clearFile() }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="pwt-drop-content">
                  <Upload size={40} />
                  <p className="pwt-drop-title">{t('pdfWatermarkTool.dropTitle')}</p>
                  <p className="pwt-drop-hint">{t('pdfWatermarkTool.dropHint')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className="pwt-card pwt-preview-card">
              <h3 className="pwt-card-title">
                <Eye size={18} />
                {t('pdfWatermarkTool.preview')}
              </h3>
              <div className="pwt-preview-wrap">
                {previewLoading && <div className="pwt-preview-loading"><span className="pwt-spinner" /></div>}
                <img src={previewUrl} alt="Preview" className="pwt-preview-img" />
              </div>
            </div>
          )}

          {/* Action */}
          <div className="pwt-actions">
            <button
              className="pwt-process-btn"
              onClick={processWatermark}
              disabled={!canProcess}
            >
              {loading ? (
                <><span className="pwt-spinner" /> {t('pdfWatermarkTool.processing')}</>
              ) : (
                <><Droplet size={18} /> {t('pdfWatermarkTool.addWatermark')}</>
              )}
            </button>
          </div>

          {/* Result */}
          {resultBlob && (
            <div className="pwt-card pwt-result-card">
              <div className="pwt-result-header">
                <CheckCircle size={20} />
                <span>{t('pdfWatermarkTool.watermarkDone')}</span>
              </div>
              <div className="pwt-result-info">
                <div className="pwt-result-row">
                  <span>{t('pdfWatermarkTool.outputFile')}</span>
                  <strong>{resultName}</strong>
                </div>
                <div className="pwt-result-row">
                  <span>{t('pdfWatermarkTool.outputSize')}</span>
                  <strong>{formatFileSize(resultBlob.size)}</strong>
                </div>
              </div>
              <button className="pwt-download-btn" onClick={handleDownload}>
                <Download size={18} />
                {t('pdfWatermarkTool.downloadResult')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FAQ */}
      <div className="pwt-faq-section">
        <h3><Info size={18} /> {t('pdfWatermarkTool.faqTitle')}</h3>
        {faqItems.map((item, i) => (
          <div key={i} className={`pwt-faq-item ${showFaq === i ? 'open' : ''}`}>
            <button className="pwt-faq-q" onClick={() => setShowFaq(showFaq === i ? null : i)}>
              <span>{item.q}</span>
              <ChevronDown size={16} />
            </button>
            {showFaq === i && <div className="pwt-faq-a">{item.a}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
