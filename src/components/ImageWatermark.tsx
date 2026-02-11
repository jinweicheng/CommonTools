import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Upload, Download, Image as ImageIcon, Type, Layers, RotateCcw, Trash2, Plus, Settings, Eye, Grid3X3, Move, Copy, Check } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import './ImageWatermark.css'

// ========== Types ==========
type WatermarkType = 'text' | 'image'
type WatermarkMode = 'single' | 'tile' | 'border'
type OutputFormat = 'png' | 'jpg' | 'webp'
type PositionPreset = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom'

interface WatermarkConfig {
  type: WatermarkType
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  color: string
  opacity: number
  rotation: number
  scale: number
  position: PositionPreset
  customX: number
  customY: number
  mode: WatermarkMode
  tileSpacingX: number
  tileSpacingY: number
  shadow: boolean
  shadowColor: string
  shadowBlur: number
  stroke: boolean
  strokeColor: string
  strokeWidth: number
  watermarkImageSrc: string | null
  watermarkImageWidth: number
  watermarkImageHeight: number
}

interface ImageItem {
  id: string
  file: File
  previewUrl: string
  width: number
  height: number
  processed: boolean
  processedUrl?: string
}

interface OutputConfig {
  format: OutputFormat
  quality: number
  maxWidth: number
  maxHeight: number
  maintainAspect: boolean
}

// ========== Constants ==========
const FONT_FAMILIES = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Microsoft YaHei", sans-serif', label: '微软雅黑' },
  { value: '"SimHei", sans-serif', label: '黑体' },
  { value: '"SimSun", serif', label: '宋体' },
  { value: '"KaiTi", serif', label: '楷体' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: '"Comic Sans MS", cursive', label: 'Comic Sans' },
]

const DEFAULT_CONFIG: WatermarkConfig = {
  type: 'text',
  text: 'Watermark',
  fontFamily: 'Arial, sans-serif',
  fontSize: 48,
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#ffffff',
  opacity: 0.35,
  rotation: -30,
  scale: 1,
  position: 'center',
  customX: 50,
  customY: 50,
  mode: 'tile',
  tileSpacingX: 200,
  tileSpacingY: 150,
  shadow: true,
  shadowColor: '#000000',
  shadowBlur: 4,
  stroke: false,
  strokeColor: '#000000',
  strokeWidth: 2,
  watermarkImageSrc: null,
  watermarkImageWidth: 200,
  watermarkImageHeight: 200,
}

const DEFAULT_OUTPUT: OutputConfig = {
  format: 'png',
  quality: 0.92,
  maxWidth: 0,
  maxHeight: 0,
  maintainAspect: true,
}

// ========== Utility Functions ==========
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function getPositionCoords(position: PositionPreset, canvasW: number, canvasH: number, wmW: number, wmH: number): { x: number; y: number } {
  const margin = 20
  switch (position) {
    case 'top-left': return { x: margin, y: margin }
    case 'top-center': return { x: (canvasW - wmW) / 2, y: margin }
    case 'top-right': return { x: canvasW - wmW - margin, y: margin }
    case 'center-left': return { x: margin, y: (canvasH - wmH) / 2 }
    case 'center': return { x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 }
    case 'center-right': return { x: canvasW - wmW - margin, y: (canvasH - wmH) / 2 }
    case 'bottom-left': return { x: margin, y: canvasH - wmH - margin }
    case 'bottom-center': return { x: (canvasW - wmW) / 2, y: canvasH - wmH - margin }
    case 'bottom-right': return { x: canvasW - wmW - margin, y: canvasH - wmH - margin }
    case 'custom': return { x: (canvasW * 0.5), y: (canvasH * 0.5) }
    default: return { x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 }
  }
}

// ========== Core Rendering ==========
function renderWatermark(
  ctx: CanvasRenderingContext2D,
  config: WatermarkConfig,
  canvasWidth: number,
  canvasHeight: number,
  watermarkImage: HTMLImageElement | null
) {
  ctx.save()
  ctx.globalAlpha = config.opacity

  if (config.type === 'text') {
    const font = `${config.fontStyle} ${config.fontWeight} ${config.fontSize * config.scale}px ${config.fontFamily}`
    ctx.font = font
    ctx.fillStyle = config.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (config.shadow) {
      ctx.shadowColor = config.shadowColor
      ctx.shadowBlur = config.shadowBlur
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2
    }

    const textMetrics = ctx.measureText(config.text)
    const textWidth = textMetrics.width
    const textHeight = config.fontSize * config.scale

    if (config.mode === 'tile') {
      renderTiledWatermark(ctx, config, canvasWidth, canvasHeight, textWidth, textHeight, null)
    } else if (config.mode === 'border') {
      renderBorderWatermark(ctx, config, canvasWidth, canvasHeight, textWidth, textHeight, null)
    } else {
      // Single
      const pos = config.position === 'custom'
        ? { x: canvasWidth * config.customX / 100, y: canvasHeight * config.customY / 100 }
        : getPositionCoords(config.position, canvasWidth, canvasHeight, textWidth, textHeight)
      
      ctx.save()
      ctx.translate(pos.x + textWidth / 2, pos.y + textHeight / 2)
      ctx.rotate((config.rotation * Math.PI) / 180)
      if (config.stroke) {
        ctx.strokeStyle = config.strokeColor
        ctx.lineWidth = config.strokeWidth
        ctx.strokeText(config.text, 0, 0)
      }
      ctx.fillText(config.text, 0, 0)
      ctx.restore()
    }
  } else if (config.type === 'image' && watermarkImage) {
    const wmW = config.watermarkImageWidth * config.scale
    const wmH = config.watermarkImageHeight * config.scale

    if (config.mode === 'tile') {
      renderTiledWatermark(ctx, config, canvasWidth, canvasHeight, wmW, wmH, watermarkImage)
    } else if (config.mode === 'border') {
      renderBorderWatermark(ctx, config, canvasWidth, canvasHeight, wmW, wmH, watermarkImage)
    } else {
      const pos = config.position === 'custom'
        ? { x: canvasWidth * config.customX / 100, y: canvasHeight * config.customY / 100 }
        : getPositionCoords(config.position, canvasWidth, canvasHeight, wmW, wmH)
      
      ctx.save()
      ctx.translate(pos.x + wmW / 2, pos.y + wmH / 2)
      ctx.rotate((config.rotation * Math.PI) / 180)
      if (config.shadow) {
        ctx.shadowColor = config.shadowColor
        ctx.shadowBlur = config.shadowBlur
        ctx.shadowOffsetX = 2
        ctx.shadowOffsetY = 2
      }
      ctx.drawImage(watermarkImage, -wmW / 2, -wmH / 2, wmW, wmH)
      ctx.restore()
    }
  }

  ctx.restore()
}

function renderTiledWatermark(
  ctx: CanvasRenderingContext2D,
  config: WatermarkConfig,
  canvasWidth: number,
  canvasHeight: number,
  wmWidth: number,
  wmHeight: number,
  wmImage: HTMLImageElement | null
) {
  const spacingX = wmWidth + config.tileSpacingX
  const spacingY = wmHeight + config.tileSpacingY
  const diagonal = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight)

  for (let y = -diagonal; y < diagonal; y += spacingY) {
    for (let x = -diagonal; x < diagonal; x += spacingX) {
      ctx.save()
      ctx.translate(canvasWidth / 2, canvasHeight / 2)
      ctx.rotate((config.rotation * Math.PI) / 180)
      ctx.translate(x, y)

      if (wmImage) {
        if (config.shadow) {
          ctx.shadowColor = config.shadowColor
          ctx.shadowBlur = config.shadowBlur
        }
        ctx.drawImage(wmImage, -wmWidth / 2, -wmHeight / 2, wmWidth, wmHeight)
      } else {
        ctx.font = `${config.fontStyle} ${config.fontWeight} ${config.fontSize * config.scale}px ${config.fontFamily}`
        ctx.fillStyle = config.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (config.shadow) {
          ctx.shadowColor = config.shadowColor
          ctx.shadowBlur = config.shadowBlur
        }
        if (config.stroke) {
          ctx.strokeStyle = config.strokeColor
          ctx.lineWidth = config.strokeWidth
          ctx.strokeText(config.text, 0, 0)
        }
        ctx.fillText(config.text, 0, 0)
      }
      ctx.restore()
    }
  }
}

function renderBorderWatermark(
  ctx: CanvasRenderingContext2D,
  config: WatermarkConfig,
  canvasWidth: number,
  canvasHeight: number,
  wmWidth: number,
  wmHeight: number,
  wmImage: HTMLImageElement | null
) {
  const positions = [
    { x: 30, y: 30 },
    { x: canvasWidth / 2, y: 30 },
    { x: canvasWidth - 30, y: 30 },
    { x: 30, y: canvasHeight - 30 },
    { x: canvasWidth / 2, y: canvasHeight - 30 },
    { x: canvasWidth - 30, y: canvasHeight - 30 },
    { x: 30, y: canvasHeight / 2 },
    { x: canvasWidth - 30, y: canvasHeight / 2 },
  ]

  positions.forEach(pos => {
    ctx.save()
    ctx.translate(pos.x, pos.y)
    ctx.rotate((config.rotation * Math.PI) / 180)

    if (wmImage) {
      if (config.shadow) {
        ctx.shadowColor = config.shadowColor
        ctx.shadowBlur = config.shadowBlur
      }
      ctx.drawImage(wmImage, -wmWidth / 2, -wmHeight / 2, wmWidth, wmHeight)
    } else {
      ctx.font = `${config.fontStyle} ${config.fontWeight} ${config.fontSize * config.scale}px ${config.fontFamily}`
      ctx.fillStyle = config.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (config.shadow) {
        ctx.shadowColor = config.shadowColor
        ctx.shadowBlur = config.shadowBlur
      }
      if (config.stroke) {
        ctx.strokeStyle = config.strokeColor
        ctx.lineWidth = config.strokeWidth
        ctx.strokeText(config.text, 0, 0)
      }
      ctx.fillText(config.text, 0, 0)
    }
    ctx.restore()
  })
}

// ========== Process image with watermark ==========
async function processImage(
  imageItem: ImageItem,
  config: WatermarkConfig,
  outputConfig: OutputConfig,
  watermarkImage: HTMLImageElement | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let w = img.width
      let h = img.height

      // Apply output size constraints
      if (outputConfig.maxWidth > 0 && w > outputConfig.maxWidth) {
        const ratio = outputConfig.maxWidth / w
        w = outputConfig.maxWidth
        h = outputConfig.maintainAspect ? Math.round(h * ratio) : (outputConfig.maxHeight > 0 ? outputConfig.maxHeight : h)
      }
      if (outputConfig.maxHeight > 0 && h > outputConfig.maxHeight) {
        const ratio = outputConfig.maxHeight / h
        h = outputConfig.maxHeight
        w = outputConfig.maintainAspect ? Math.round(w * ratio) : w
      }

      canvas.width = w
      canvas.height = h

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      renderWatermark(ctx, config, w, h, watermarkImage)

      const mimeType = outputConfig.format === 'jpg' ? 'image/jpeg' : outputConfig.format === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = canvas.toDataURL(mimeType, outputConfig.quality)
      resolve(dataUrl)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageItem.previewUrl
  })
}

// ========== Main Component ==========
export default function ImageWatermark() {
  const { t } = useI18n()

  // State
  const [images, setImages] = useState<ImageItem[]>([])
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [config, setConfig] = useState<WatermarkConfig>({ ...DEFAULT_CONFIG, text: t('imgWatermark.defaultText') || 'Watermark' })
  const [outputConfig, setOutputConfig] = useState<OutputConfig>({ ...DEFAULT_OUTPUT })
  const [watermarkImage, setWatermarkImage] = useState<HTMLImageElement | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'style' | 'position' | 'output'>('style')
  const [isDragging, setIsDragging] = useState(false)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wmImageInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const selectedImage = useMemo(() => images[selectedImageIndex] || null, [images, selectedImageIndex])

  // ========== Image Upload ==========
  const handleFiles = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (validFiles.length === 0) return

    const newItems: ImageItem[] = []
    let loaded = 0

    validFiles.forEach(file => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        newItems.push({
          id: generateId(),
          file,
          previewUrl: url,
          width: img.width,
          height: img.height,
          processed: false,
        })
        loaded++
        if (loaded === validFiles.length) {
          setImages(prev => [...prev, ...newItems])
        }
      }
      img.onerror = () => {
        loaded++
        if (loaded === validFiles.length) {
          setImages(prev => [...prev, ...newItems])
        }
      }
      img.src = url
    })
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  // Paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) handleFiles(files)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handleFiles])

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const newImages = prev.filter(img => img.id !== id)
      if (selectedImageIndex >= newImages.length) {
        setSelectedImageIndex(Math.max(0, newImages.length - 1))
      }
      return newImages
    })
  }, [selectedImageIndex])

  const clearAllImages = useCallback(() => {
    images.forEach(img => URL.revokeObjectURL(img.previewUrl))
    setImages([])
    setSelectedImageIndex(0)
  }, [images])

  // ========== Watermark Image Upload ==========
  const handleWmImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      setWatermarkImage(img)
      setConfig(prev => ({
        ...prev,
        type: 'image' as WatermarkType,
        watermarkImageSrc: img.src,
        watermarkImageWidth: Math.min(img.width, 300),
        watermarkImageHeight: Math.min(img.height, 300),
      }))
    }
    img.src = URL.createObjectURL(file)
    e.target.value = ''
  }, [])

  // ========== Preview Rendering ==========
  useEffect(() => {
    if (!selectedImage || !previewCanvasRef.current) return
    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      // Fit canvas into container
      const container = previewContainerRef.current
      const maxW = container ? container.clientWidth - 40 : 800
      const maxH = 500

      let w = img.width
      let h = img.height
      const scale = Math.min(maxW / w, maxH / h, 1)
      w = Math.round(w * scale)
      h = Math.round(h * scale)

      canvas.width = w
      canvas.height = h
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      // Render watermark scaled
      const scaledConfig: WatermarkConfig = {
        ...config,
        fontSize: config.fontSize * scale,
        watermarkImageWidth: config.watermarkImageWidth * scale,
        watermarkImageHeight: config.watermarkImageHeight * scale,
        tileSpacingX: config.tileSpacingX * scale,
        tileSpacingY: config.tileSpacingY * scale,
        shadowBlur: config.shadowBlur * scale,
        strokeWidth: config.strokeWidth * scale,
      }
      renderWatermark(ctx, scaledConfig, w, h, watermarkImage)
    }
    img.src = selectedImage.previewUrl
  }, [selectedImage, config, watermarkImage])

  // ========== Canvas Drag for Custom Position ==========
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (config.position !== 'custom') return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: config.customX,
      origY: config.customY,
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const pctX = (dx / rect.width) * 100
      const pctY = (dy / rect.height) * 100
      setConfig(prev => ({
        ...prev,
        customX: Math.max(0, Math.min(100, dragRef.current!.origX + pctX)),
        customY: Math.max(0, Math.min(100, dragRef.current!.origY + pctY)),
      }))
    }

    const handleMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [config.position, config.customX, config.customY])

  // ========== Batch Processing ==========
  const handleProcess = useCallback(async () => {
    if (images.length === 0) return
    setProcessing(true)
    setProcessedCount(0)

    try {
      const results: ImageItem[] = [...images]
      for (let i = 0; i < results.length; i++) {
        const processedUrl = await processImage(results[i], config, outputConfig, watermarkImage)
        results[i] = { ...results[i], processed: true, processedUrl }
        setProcessedCount(i + 1)
      }
      setImages(results)
    } catch (err) {
      console.error('Processing failed:', err)
    } finally {
      setProcessing(false)
    }
  }, [images, config, outputConfig, watermarkImage])

  // ========== Download ==========
  const downloadSingle = useCallback((item: ImageItem) => {
    if (!item.processedUrl) return
    const ext = outputConfig.format === 'jpg' ? 'jpg' : outputConfig.format
    const name = item.file.name.replace(/\.[^.]+$/, `_watermark.${ext}`)
    const a = document.createElement('a')
    a.href = item.processedUrl
    a.download = name
    a.click()
  }, [outputConfig.format])

  const downloadAll = useCallback(() => {
    const processedImages = images.filter(img => img.processedUrl)
    processedImages.forEach((item, index) => {
      setTimeout(() => downloadSingle(item), index * 200)
    })
  }, [images, downloadSingle])

  // ========== Config Helpers ==========
  const updateConfig = useCallback(<K extends keyof WatermarkConfig>(key: K, value: WatermarkConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }, [])

  const updateOutput = useCallback(<K extends keyof OutputConfig>(key: K, value: OutputConfig[K]) => {
    setOutputConfig(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG, text: t('imgWatermark.defaultText') || 'Watermark' })
  }, [t])

  const processedImagesCount = useMemo(() => images.filter(i => i.processed).length, [images])

  // ========== JSX ==========
  return (
    <div className="iw-container">
      {/* Upload Area */}
      <div className="iw-upload-section">
        <div
          className={`iw-dropzone ${isDragging ? 'dragging' : ''} ${images.length > 0 ? 'has-images' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInput}
            className="iw-file-input"
          />
          <div className="iw-dropzone-content">
            <div className="iw-dropzone-icon">
              <Upload size={32} />
            </div>
            <div className="iw-dropzone-text">
              <strong>{t('imgWatermark.dropzoneTitle')}</strong>
              <span>{t('imgWatermark.dropzoneHint')}</span>
            </div>
          </div>
        </div>

        {/* Image Thumbnails */}
        {images.length > 0 && (
          <div className="iw-thumbnails-bar">
            <div className="iw-thumbnails-scroll">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className={`iw-thumb ${idx === selectedImageIndex ? 'active' : ''} ${img.processed ? 'processed' : ''}`}
                  onClick={() => setSelectedImageIndex(idx)}
                >
                  <img src={img.previewUrl} alt={img.file.name} />
                  {img.processed && <div className="iw-thumb-badge"><Check size={12} /></div>}
                  <button className="iw-thumb-remove" onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              <button className="iw-thumb-add" onClick={() => fileInputRef.current?.click()}>
                <Plus size={18} />
              </button>
            </div>
            <div className="iw-thumb-actions">
              <span className="iw-image-count">{images.length} {t('imgWatermark.imagesLoaded')}</span>
              <button className="iw-btn-text" onClick={clearAllImages}>
                <Trash2 size={14} /> {t('imgWatermark.clearAll')}
              </button>
            </div>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="iw-workspace">
          {/* Preview Panel */}
          <div className="iw-preview-panel" ref={previewContainerRef}>
            <div className="iw-preview-header">
              <h3><Eye size={16} /> {t('imgWatermark.preview')}</h3>
              {selectedImage && (
                <span className="iw-preview-info">
                  {selectedImage.width} × {selectedImage.height} · {(selectedImage.file.size / 1024).toFixed(0)}KB
                </span>
              )}
            </div>
            <div className="iw-preview-canvas-wrapper">
              {selectedImage ? (
                <canvas
                  ref={previewCanvasRef}
                  className={`iw-preview-canvas ${config.position === 'custom' ? 'draggable' : ''}`}
                  onMouseDown={handleCanvasMouseDown}
                />
              ) : (
                <div className="iw-preview-empty">
                  <ImageIcon size={48} />
                  <p>{t('imgWatermark.selectImage')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Settings Panel */}
          <div className="iw-settings-panel">
            {/* Tabs */}
            <div className="iw-settings-tabs">
              <button className={`iw-tab ${activeTab === 'style' ? 'active' : ''}`} onClick={() => setActiveTab('style')}>
                <Type size={14} /> {t('imgWatermark.tabStyle')}
              </button>
              <button className={`iw-tab ${activeTab === 'position' ? 'active' : ''}`} onClick={() => setActiveTab('position')}>
                <Grid3X3 size={14} /> {t('imgWatermark.tabPosition')}
              </button>
              <button className={`iw-tab ${activeTab === 'output' ? 'active' : ''}`} onClick={() => setActiveTab('output')}>
                <Settings size={14} /> {t('imgWatermark.tabOutput')}
              </button>
            </div>

            <div className="iw-settings-body">
              {/* Style Tab */}
              {activeTab === 'style' && (
                <div className="iw-tab-content">
                  {/* Watermark Type */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.watermarkType')}</label>
                    <div className="iw-type-selector">
                      <button
                        className={`iw-type-btn ${config.type === 'text' ? 'active' : ''}`}
                        onClick={() => updateConfig('type', 'text')}
                      >
                        <Type size={16} /> {t('imgWatermark.textWatermark')}
                      </button>
                      <button
                        className={`iw-type-btn ${config.type === 'image' ? 'active' : ''}`}
                        onClick={() => updateConfig('type', 'image')}
                      >
                        <ImageIcon size={16} /> {t('imgWatermark.imageWatermark')}
                      </button>
                    </div>
                  </div>

                  {config.type === 'text' ? (
                    <>
                      {/* Text Input */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.watermarkText')}</label>
                        <input
                          type="text"
                          className="iw-input"
                          value={config.text}
                          onChange={(e) => updateConfig('text', e.target.value)}
                          placeholder={t('imgWatermark.textPlaceholder')}
                        />
                      </div>

                      {/* Font Family */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.fontFamily')}</label>
                        <select
                          className="iw-select"
                          value={config.fontFamily}
                          onChange={(e) => updateConfig('fontFamily', e.target.value)}
                        >
                          {FONT_FAMILIES.map(f => (
                            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Font Size */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.fontSize')} <span className="iw-value">{config.fontSize}px</span></label>
                        <input
                          type="range"
                          className="iw-slider"
                          min="12"
                          max="200"
                          value={config.fontSize}
                          onChange={(e) => updateConfig('fontSize', Number(e.target.value))}
                        />
                      </div>

                      {/* Font Style */}
                      <div className="iw-field-row">
                        <button
                          className={`iw-style-btn ${config.fontWeight === 'bold' ? 'active' : ''}`}
                          onClick={() => updateConfig('fontWeight', config.fontWeight === 'bold' ? 'normal' : 'bold')}
                          title="Bold"
                        >
                          <strong>B</strong>
                        </button>
                        <button
                          className={`iw-style-btn ${config.fontStyle === 'italic' ? 'active' : ''}`}
                          onClick={() => updateConfig('fontStyle', config.fontStyle === 'italic' ? 'normal' : 'italic')}
                          title="Italic"
                        >
                          <em>I</em>
                        </button>
                      </div>

                      {/* Color */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.color')}</label>
                        <div className="iw-color-row">
                          <input
                            type="color"
                            className="iw-color-picker"
                            value={config.color}
                            onChange={(e) => updateConfig('color', e.target.value)}
                          />
                          <input
                            type="text"
                            className="iw-input iw-color-text"
                            value={config.color}
                            onChange={(e) => updateConfig('color', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Stroke */}
                      <div className="iw-field-group">
                        <label className="iw-checkbox-label">
                          <input type="checkbox" checked={config.stroke} onChange={(e) => updateConfig('stroke', e.target.checked)} />
                          {t('imgWatermark.stroke')}
                        </label>
                        {config.stroke && (
                          <div className="iw-sub-fields">
                            <div className="iw-color-row">
                              <input type="color" className="iw-color-picker" value={config.strokeColor} onChange={(e) => updateConfig('strokeColor', e.target.value)} />
                              <input type="range" className="iw-slider" min="1" max="10" value={config.strokeWidth} onChange={(e) => updateConfig('strokeWidth', Number(e.target.value))} />
                              <span className="iw-value">{config.strokeWidth}px</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Image Watermark Upload */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.watermarkImage')}</label>
                        <div
                          className="iw-wm-upload"
                          onClick={() => wmImageInputRef.current?.click()}
                        >
                          <input
                            ref={wmImageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleWmImageUpload}
                            className="iw-file-input"
                          />
                          {config.watermarkImageSrc ? (
                            <img src={config.watermarkImageSrc} alt="watermark" className="iw-wm-preview" />
                          ) : (
                            <div className="iw-wm-placeholder">
                              <Upload size={20} />
                              <span>{t('imgWatermark.uploadWmImage')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Image Size */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.wmImageWidth')} <span className="iw-value">{config.watermarkImageWidth}px</span></label>
                        <input type="range" className="iw-slider" min="20" max="800" value={config.watermarkImageWidth} onChange={(e) => updateConfig('watermarkImageWidth', Number(e.target.value))} />
                      </div>
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.wmImageHeight')} <span className="iw-value">{config.watermarkImageHeight}px</span></label>
                        <input type="range" className="iw-slider" min="20" max="800" value={config.watermarkImageHeight} onChange={(e) => updateConfig('watermarkImageHeight', Number(e.target.value))} />
                      </div>
                    </>
                  )}

                  {/* Opacity */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.opacity')} <span className="iw-value">{Math.round(config.opacity * 100)}%</span></label>
                    <input type="range" className="iw-slider" min="0" max="100" value={Math.round(config.opacity * 100)} onChange={(e) => updateConfig('opacity', Number(e.target.value) / 100)} />
                  </div>

                  {/* Rotation */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.rotation')} <span className="iw-value">{config.rotation}°</span></label>
                    <input type="range" className="iw-slider" min="-180" max="180" value={config.rotation} onChange={(e) => updateConfig('rotation', Number(e.target.value))} />
                  </div>

                  {/* Scale */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.scale')} <span className="iw-value">{config.scale.toFixed(1)}x</span></label>
                    <input type="range" className="iw-slider" min="1" max="50" value={Math.round(config.scale * 10)} onChange={(e) => updateConfig('scale', Number(e.target.value) / 10)} />
                  </div>

                  {/* Shadow */}
                  <div className="iw-field-group">
                    <label className="iw-checkbox-label">
                      <input type="checkbox" checked={config.shadow} onChange={(e) => updateConfig('shadow', e.target.checked)} />
                      {t('imgWatermark.shadow')}
                    </label>
                    {config.shadow && (
                      <div className="iw-sub-fields">
                        <div className="iw-color-row">
                          <input type="color" className="iw-color-picker" value={config.shadowColor} onChange={(e) => updateConfig('shadowColor', e.target.value)} />
                          <input type="range" className="iw-slider" min="0" max="20" value={config.shadowBlur} onChange={(e) => updateConfig('shadowBlur', Number(e.target.value))} />
                          <span className="iw-value">{config.shadowBlur}px</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button className="iw-btn-reset" onClick={resetConfig}>
                    <RotateCcw size={14} /> {t('imgWatermark.resetConfig')}
                  </button>
                </div>
              )}

              {/* Position Tab */}
              {activeTab === 'position' && (
                <div className="iw-tab-content">
                  {/* Mode */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.repeatMode')}</label>
                    <div className="iw-mode-selector">
                      <button className={`iw-mode-btn ${config.mode === 'single' ? 'active' : ''}`} onClick={() => updateConfig('mode', 'single')}>
                        <Layers size={14} /> {t('imgWatermark.modeSingle')}
                      </button>
                      <button className={`iw-mode-btn ${config.mode === 'tile' ? 'active' : ''}`} onClick={() => updateConfig('mode', 'tile')}>
                        <Copy size={14} /> {t('imgWatermark.modeTile')}
                      </button>
                      <button className={`iw-mode-btn ${config.mode === 'border' ? 'active' : ''}`} onClick={() => updateConfig('mode', 'border')}>
                        <Grid3X3 size={14} /> {t('imgWatermark.modeBorder')}
                      </button>
                    </div>
                  </div>

                  {config.mode === 'single' && (
                    <>
                      {/* Position Grid */}
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.positionLabel')}</label>
                        <div className="iw-position-grid">
                          {(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'] as PositionPreset[]).map(pos => (
                            <button
                              key={pos}
                              className={`iw-pos-btn ${config.position === pos ? 'active' : ''}`}
                              onClick={() => updateConfig('position', pos)}
                              title={pos}
                            >
                              <div className="iw-pos-dot" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Position */}
                      <div className="iw-field-group">
                        <label className="iw-checkbox-label">
                          <input
                            type="checkbox"
                            checked={config.position === 'custom'}
                            onChange={(e) => updateConfig('position', e.target.checked ? 'custom' : 'center')}
                          />
                          <Move size={14} /> {t('imgWatermark.customPosition')}
                        </label>
                        {config.position === 'custom' && (
                          <div className="iw-sub-fields">
                            <div className="iw-field-group">
                              <label className="iw-label">X <span className="iw-value">{config.customX.toFixed(0)}%</span></label>
                              <input type="range" className="iw-slider" min="0" max="100" value={config.customX} onChange={(e) => updateConfig('customX', Number(e.target.value))} />
                            </div>
                            <div className="iw-field-group">
                              <label className="iw-label">Y <span className="iw-value">{config.customY.toFixed(0)}%</span></label>
                              <input type="range" className="iw-slider" min="0" max="100" value={config.customY} onChange={(e) => updateConfig('customY', Number(e.target.value))} />
                            </div>
                            <p className="iw-hint"><Move size={12} /> {t('imgWatermark.dragHint')}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {config.mode === 'tile' && (
                    <>
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.tileSpacingX')} <span className="iw-value">{config.tileSpacingX}px</span></label>
                        <input type="range" className="iw-slider" min="50" max="500" value={config.tileSpacingX} onChange={(e) => updateConfig('tileSpacingX', Number(e.target.value))} />
                      </div>
                      <div className="iw-field-group">
                        <label className="iw-label">{t('imgWatermark.tileSpacingY')} <span className="iw-value">{config.tileSpacingY}px</span></label>
                        <input type="range" className="iw-slider" min="50" max="500" value={config.tileSpacingY} onChange={(e) => updateConfig('tileSpacingY', Number(e.target.value))} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Output Tab */}
              {activeTab === 'output' && (
                <div className="iw-tab-content">
                  {/* Format */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.outputFormat')}</label>
                    <div className="iw-format-selector">
                      {(['png', 'jpg', 'webp'] as OutputFormat[]).map(fmt => (
                        <button
                          key={fmt}
                          className={`iw-format-btn ${outputConfig.format === fmt ? 'active' : ''}`}
                          onClick={() => updateOutput('format', fmt)}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quality */}
                  {outputConfig.format !== 'png' && (
                    <div className="iw-field-group">
                      <label className="iw-label">{t('imgWatermark.quality')} <span className="iw-value">{Math.round(outputConfig.quality * 100)}%</span></label>
                      <input type="range" className="iw-slider" min="10" max="100" value={Math.round(outputConfig.quality * 100)} onChange={(e) => updateOutput('quality', Number(e.target.value) / 100)} />
                    </div>
                  )}

                  {/* Max dimensions */}
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.maxWidth')} <span className="iw-value">{outputConfig.maxWidth || t('imgWatermark.original')}</span></label>
                    <input type="range" className="iw-slider" min="0" max="4000" step="100" value={outputConfig.maxWidth} onChange={(e) => updateOutput('maxWidth', Number(e.target.value))} />
                  </div>
                  <div className="iw-field-group">
                    <label className="iw-label">{t('imgWatermark.maxHeight')} <span className="iw-value">{outputConfig.maxHeight || t('imgWatermark.original')}</span></label>
                    <input type="range" className="iw-slider" min="0" max="4000" step="100" value={outputConfig.maxHeight} onChange={(e) => updateOutput('maxHeight', Number(e.target.value))} />
                  </div>

                  <div className="iw-field-group">
                    <label className="iw-checkbox-label">
                      <input type="checkbox" checked={outputConfig.maintainAspect} onChange={(e) => updateOutput('maintainAspect', e.target.checked)} />
                      {t('imgWatermark.maintainAspect')}
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="iw-actions">
              <button
                className="iw-btn iw-btn-primary"
                onClick={handleProcess}
                disabled={processing || images.length === 0}
              >
                {processing ? (
                  <>
                    <span className="iw-spinner" />
                    {t('imgWatermark.processing')} ({processedCount}/{images.length})
                  </>
                ) : (
                  <>
                    <Layers size={16} />
                    {images.length > 1
                      ? `${t('imgWatermark.batchProcess')} (${images.length})`
                      : t('imgWatermark.applyWatermark')
                    }
                  </>
                )}
              </button>

              {processedImagesCount > 0 && (
                <button className="iw-btn iw-btn-success" onClick={downloadAll}>
                  <Download size={16} />
                  {processedImagesCount > 1
                    ? `${t('imgWatermark.downloadAll')} (${processedImagesCount})`
                    : t('imgWatermark.download')
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Processed Results */}
      {processedImagesCount > 0 && (
        <div className="iw-results-section">
          <h3><Check size={16} /> {t('imgWatermark.results')} ({processedImagesCount})</h3>
          <div className="iw-results-grid">
            {images.filter(i => i.processed && i.processedUrl).map(item => (
              <div key={item.id} className="iw-result-card">
                <div className="iw-result-preview">
                  <img src={item.processedUrl!} alt={item.file.name} />
                </div>
                <div className="iw-result-info">
                  <span className="iw-result-name">{item.file.name}</span>
                  <button className="iw-btn-sm" onClick={() => downloadSingle(item)}>
                    <Download size={12} /> {t('imgWatermark.download')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature Tips */}
      <div className="iw-tips-section">
        <h3>💡 {t('imgWatermark.tipsTitle')}</h3>
        <ul className="iw-tips-list">
          <li>{t('imgWatermark.tip1')}</li>
          <li>{t('imgWatermark.tip2')}</li>
          <li>{t('imgWatermark.tip3')}</li>
          <li>{t('imgWatermark.tip4')}</li>
          <li>{t('imgWatermark.tip5')}</li>
        </ul>
      </div>
    </div>
  )
}
