import { useState, useRef, useCallback, useEffect } from 'react'
import { useI18n } from '../i18n/I18nContext'
import './ImageMosaic.css'

// ==================== 类型定义 ====================
interface MosaicRegion {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: MosaicType
  intensity: number
}

type MosaicType = 'pixelate' | 'blur' | 'solid' | 'crosshatch'
type ToolMode = 'rect' | 'brush' | 'select'

interface HistoryState {
  imageData: ImageData
  regions: MosaicRegion[]
}

// ==================== 辅助函数 ====================
function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export default function ImageMosaic() {
  const { t } = useI18n()

  // ==================== 状态 ====================
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [regions, setRegions] = useState<MosaicRegion[]>([])
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [mosaicType, setMosaicType] = useState<MosaicType>('pixelate')
  const [intensity, setIntensity] = useState(15)
  const [brushSize, setBrushSize] = useState(30)
  const [toolMode, setToolMode] = useState<ToolMode>('rect')
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })
  const [drawCurrent, setDrawCurrent] = useState({ x: 0, y: 0 })
  const [processing, setProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const originalImageRef = useRef<HTMLImageElement | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 移动选区的状态
  const [isDraggingRegion, setIsDraggingRegion] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const resizeStartRef = useRef<{ x: number; y: number; region: MosaicRegion } | null>(null)

  // 画笔模式的路径
  const brushPathRef = useRef<Array<{ x: number; y: number }>>([])

  // ==================== 图片加载 ====================
  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        originalImageRef.current = img
        setImageSize({ width: img.width, height: img.height })

        // 计算显示尺寸（适配容器）
        const maxW = 900
        const maxH = window.innerHeight - 350
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const dw = Math.round(img.width * scale)
        const dh = Math.round(img.height * scale)
        setDisplaySize({ width: dw, height: dh })
        setZoom(Math.round(scale * 100))

        // 绘制到canvas
        setTimeout(() => {
          drawImageToCanvas(img, dw, dh)
          setImageLoaded(true)
          setRegions([])
          setSelectedRegionId(null)
          setHistory([])
          setHistoryIndex(-1)
        }, 50)
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  const drawImageToCanvas = useCallback((img: HTMLImageElement, dw: number, dh: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, dw, dh)
    originalImageDataRef.current = ctx.getImageData(0, 0, dw, dh)

    // 设置覆盖层画布
    const overlay = overlayCanvasRef.current
    if (overlay) {
      overlay.width = dw
      overlay.height = dh
    }
  }, [])

  // ==================== 拖放上传 ====================
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) loadImage(file)
  }, [loadImage])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadImage(file)
    // 重置以允许选同一文件
    e.target.value = ''
  }, [loadImage])

  // 粘贴上传
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) loadImage(file)
          break
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [loadImage])

  // ==================== 坐标转换 ====================
  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    }
  }, [])

  // ==================== 保存历史 ====================
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ imageData, regions: [...regions] })
    // 最多保留30步
    if (newHistory.length > 30) newHistory.shift()
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [history, historyIndex, regions])

  // ==================== 撤销/重做 ====================
  const undo = useCallback(() => {
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    const canvas = canvasRef.current
    if (!canvas || !prev) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(prev.imageData, 0, 0)
    setRegions(prev.regions)
    setHistoryIndex(historyIndex - 1)
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    const canvas = canvasRef.current
    if (!canvas || !next) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(next.imageData, 0, 0)
    setRegions(next.regions)
    setHistoryIndex(historyIndex + 1)
  }, [history, historyIndex])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        undo()
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedRegionId) {
          e.preventDefault()
          deleteRegion(selectedRegionId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedRegionId])

  // ==================== 马赛克渲染 ====================
  const applyMosaicEffect = useCallback((
    ctx: CanvasRenderingContext2D,
    _origData: ImageData,
    region: MosaicRegion,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const x = Math.max(0, Math.round(region.x))
    const y = Math.max(0, Math.round(region.y))
    const w = Math.min(Math.round(region.width), canvasWidth - x)
    const h = Math.min(Math.round(region.height), canvasHeight - y)
    if (w <= 0 || h <= 0) return

    const blockSize = Math.max(2, Math.round(region.intensity))

    switch (region.type) {
      case 'pixelate': {
        // 像素化马赛克
        const regionData = ctx.getImageData(x, y, w, h)
        for (let by = 0; by < h; by += blockSize) {
          for (let bx = 0; bx < w; bx += blockSize) {
            let r = 0, g = 0, b = 0, count = 0
            const bw = Math.min(blockSize, w - bx)
            const bh = Math.min(blockSize, h - by)
            // 采样
            for (let dy = 0; dy < bh; dy++) {
              for (let dx = 0; dx < bw; dx++) {
                const idx = ((by + dy) * w + (bx + dx)) * 4
                r += regionData.data[idx]
                g += regionData.data[idx + 1]
                b += regionData.data[idx + 2]
                count++
              }
            }
            r = Math.round(r / count)
            g = Math.round(g / count)
            b = Math.round(b / count)
            // 填充
            for (let dy = 0; dy < bh; dy++) {
              for (let dx = 0; dx < bw; dx++) {
                const idx = ((by + dy) * w + (bx + dx)) * 4
                regionData.data[idx] = r
                regionData.data[idx + 1] = g
                regionData.data[idx + 2] = b
              }
            }
          }
        }
        ctx.putImageData(regionData, x, y)
        break
      }

      case 'blur': {
        // 高斯模糊效果 (使用多次box blur近似)
        const iterations = Math.max(1, Math.round(region.intensity / 3))
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.clip()
        for (let i = 0; i < iterations; i++) {
          ctx.filter = `blur(${region.intensity}px)`
          ctx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h)
        }
        ctx.filter = 'none'
        ctx.restore()
        break
      }

      case 'solid': {
        // 纯色覆盖
        ctx.save()
        ctx.fillStyle = '#000000'
        ctx.globalAlpha = 0.95
        ctx.fillRect(x, y, w, h)
        ctx.restore()
        break
      }

      case 'crosshatch': {
        // 网格交叉遮挡
        const regionData = ctx.getImageData(x, y, w, h)
        // 先做轻微像素化
        const smallBlock = Math.max(3, Math.round(blockSize * 0.6))
        for (let by = 0; by < h; by += smallBlock) {
          for (let bx = 0; bx < w; bx += smallBlock) {
            let r = 0, g = 0, b = 0, count = 0
            const bw = Math.min(smallBlock, w - bx)
            const bh = Math.min(smallBlock, h - by)
            for (let dy = 0; dy < bh; dy++) {
              for (let dx = 0; dx < bw; dx++) {
                const idx = ((by + dy) * w + (bx + dx)) * 4
                r += regionData.data[idx]
                g += regionData.data[idx + 1]
                b += regionData.data[idx + 2]
                count++
              }
            }
            r = Math.round(r / count)
            g = Math.round(g / count)
            b = Math.round(b / count)
            for (let dy = 0; dy < bh; dy++) {
              for (let dx = 0; dx < bw; dx++) {
                const idx = ((by + dy) * w + (bx + dx)) * 4
                regionData.data[idx] = r
                regionData.data[idx + 1] = g
                regionData.data[idx + 2] = b
              }
            }
          }
        }
        ctx.putImageData(regionData, x, y)
        // 叠加交叉线
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.clip()
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.lineWidth = 1
        const step = Math.max(4, blockSize)
        for (let i = -h; i < w; i += step) {
          ctx.beginPath()
          ctx.moveTo(x + i, y)
          ctx.lineTo(x + i + h, y + h)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x + i + h, y)
          ctx.lineTo(x + i, y + h)
          ctx.stroke()
        }
        ctx.restore()
        break
      }
    }
  }, [])

  // ==================== 重绘画布（应用所有区域） ====================
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = originalImageRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 先恢复原图
    ctx.drawImage(img, 0, 0, displaySize.width, displaySize.height)

    // 应用所有马赛克区域
    regions.forEach(region => {
      applyMosaicEffect(ctx, ctx.getImageData(0, 0, canvas.width, canvas.height), region, canvas.width, canvas.height)
    })
  }, [regions, displaySize, applyMosaicEffect])

  // 图片加载后，确保 canvas 尺寸正确并绘制
  useEffect(() => {
    if (imageLoaded && originalImageRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      // 如果 canvas 尺寸未正确设置（首次挂载时 drawImageToCanvas 可能因 canvas 未在 DOM 中而失败）
      if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
        drawImageToCanvas(originalImageRef.current, displaySize.width, displaySize.height)
      }
    }
  }, [imageLoaded, displaySize, drawImageToCanvas])

  // 区域变化时重绘
  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas()
    }
  }, [regions, imageLoaded, redrawCanvas])

  // ==================== 绘制覆盖层（选区框等） ====================
  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    // 绘制现有区域框
    regions.forEach(region => {
      const isSelected = region.id === selectedRegionId
      ctx.save()
      ctx.strokeStyle = isSelected ? '#818cf8' : 'rgba(99, 102, 241, 0.6)'
      ctx.lineWidth = isSelected ? 2.5 : 1.5
      ctx.setLineDash(isSelected ? [] : [6, 3])
      ctx.strokeRect(region.x, region.y, region.width, region.height)
      ctx.restore()
    })

    // 绘制正在绘制的选区
    if (isDrawing && toolMode === 'rect') {
      const x = Math.min(drawStart.x, drawCurrent.x)
      const y = Math.min(drawStart.y, drawCurrent.y)
      const w = Math.abs(drawCurrent.x - drawStart.x)
      const h = Math.abs(drawCurrent.y - drawStart.y)
      ctx.save()
      ctx.strokeStyle = '#818cf8'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = 'rgba(99, 102, 241, 0.08)'
      ctx.fillRect(x, y, w, h)
      ctx.restore()
    }
  }, [regions, selectedRegionId, isDrawing, toolMode, drawStart, drawCurrent])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay])

  // ==================== 鼠标事件 ====================
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!imageLoaded) return
    const coords = getCanvasCoords(e)

    if (toolMode === 'select') {
      // 选择模式：点击选区
      const clickedRegion = [...regions].reverse().find(r =>
        coords.x >= r.x && coords.x <= r.x + r.width &&
        coords.y >= r.y && coords.y <= r.y + r.height
      )
      if (clickedRegion) {
        setSelectedRegionId(clickedRegion.id)
        setIsDraggingRegion(true)
        setDragOffset({
          x: coords.x - clickedRegion.x,
          y: coords.y - clickedRegion.y
        })
      } else {
        setSelectedRegionId(null)
      }
      return
    }

    if (toolMode === 'rect') {
      setIsDrawing(true)
      setDrawStart(coords)
      setDrawCurrent(coords)
    } else if (toolMode === 'brush') {
      setIsDrawing(true)
      brushPathRef.current = [coords]
      // 画笔模式：直接添加小块马赛克
      addBrushMosaic(coords)
    }
  }, [imageLoaded, toolMode, regions, getCanvasCoords])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!imageLoaded) return
    const coords = getCanvasCoords(e)

    if (isDraggingRegion && selectedRegionId) {
      // 拖动选区
      setRegions(prev => prev.map(r => {
        if (r.id !== selectedRegionId) return r
        const canvas = canvasRef.current
        if (!canvas) return r
        const newX = clamp(coords.x - dragOffset.x, 0, canvas.width - r.width)
        const newY = clamp(coords.y - dragOffset.y, 0, canvas.height - r.height)
        return { ...r, x: newX, y: newY }
      }))
      return
    }

    if (resizeHandle && selectedRegionId) {
      // 调整选区大小
      handleResize(coords)
      return
    }

    if (!isDrawing) return

    if (toolMode === 'rect') {
      setDrawCurrent(coords)
    } else if (toolMode === 'brush') {
      brushPathRef.current.push(coords)
      addBrushMosaic(coords)
    }
  }, [imageLoaded, isDrawing, toolMode, isDraggingRegion, selectedRegionId, dragOffset, resizeHandle, getCanvasCoords])

  const handleMouseUp = useCallback(() => {
    if (isDraggingRegion) {
      setIsDraggingRegion(false)
      saveHistory()
      return
    }

    if (resizeHandle) {
      setResizeHandle(null)
      resizeStartRef.current = null
      saveHistory()
      return
    }

    if (!isDrawing) return
    setIsDrawing(false)

    if (toolMode === 'rect') {
      const x = Math.min(drawStart.x, drawCurrent.x)
      const y = Math.min(drawStart.y, drawCurrent.y)
      const w = Math.abs(drawCurrent.x - drawStart.x)
      const h = Math.abs(drawCurrent.y - drawStart.y)

      // 最小尺寸
      if (w < 5 || h < 5) return

      const newRegion: MosaicRegion = {
        id: generateId(),
        x, y,
        width: w,
        height: h,
        type: mosaicType,
        intensity
      }
      setRegions(prev => [...prev, newRegion])
      setSelectedRegionId(newRegion.id)
      saveHistory()
    } else if (toolMode === 'brush') {
      saveHistory()
    }
  }, [isDrawing, toolMode, drawStart, drawCurrent, mosaicType, intensity, isDraggingRegion, resizeHandle, saveHistory])

  // ==================== 画笔马赛克 ====================
  const addBrushMosaic = useCallback((coords: { x: number; y: number }) => {
    const halfSize = brushSize / 2
    const newRegion: MosaicRegion = {
      id: generateId(),
      x: coords.x - halfSize,
      y: coords.y - halfSize,
      width: brushSize,
      height: brushSize,
      type: mosaicType,
      intensity
    }
    setRegions(prev => [...prev, newRegion])
  }, [brushSize, mosaicType, intensity])

  // ==================== 选区大小调整 ====================
  const handleResizeStart = useCallback((handle: string, region: MosaicRegion, e: React.MouseEvent) => {
    e.stopPropagation()
    setResizeHandle(handle)
    const coords = getCanvasCoords(e)
    resizeStartRef.current = { x: coords.x, y: coords.y, region: { ...region } }
  }, [getCanvasCoords])

  const handleResize = useCallback((coords: { x: number; y: number }) => {
    if (!resizeHandle || !resizeStartRef.current || !selectedRegionId) return
    const { region: origRegion } = resizeStartRef.current
    const canvas = canvasRef.current
    if (!canvas) return

    setRegions(prev => prev.map(r => {
      if (r.id !== selectedRegionId) return r
      const updated = { ...r }

      switch (resizeHandle) {
        case 'se':
          updated.width = clamp(coords.x - origRegion.x, 10, canvas.width - origRegion.x)
          updated.height = clamp(coords.y - origRegion.y, 10, canvas.height - origRegion.y)
          break
        case 'sw':
          updated.x = clamp(coords.x, 0, origRegion.x + origRegion.width - 10)
          updated.width = origRegion.x + origRegion.width - updated.x
          updated.height = clamp(coords.y - origRegion.y, 10, canvas.height - origRegion.y)
          break
        case 'ne':
          updated.width = clamp(coords.x - origRegion.x, 10, canvas.width - origRegion.x)
          updated.y = clamp(coords.y, 0, origRegion.y + origRegion.height - 10)
          updated.height = origRegion.y + origRegion.height - updated.y
          break
        case 'nw':
          updated.x = clamp(coords.x, 0, origRegion.x + origRegion.width - 10)
          updated.y = clamp(coords.y, 0, origRegion.y + origRegion.height - 10)
          updated.width = origRegion.x + origRegion.width - updated.x
          updated.height = origRegion.y + origRegion.height - updated.y
          break
        case 'n':
          updated.y = clamp(coords.y, 0, origRegion.y + origRegion.height - 10)
          updated.height = origRegion.y + origRegion.height - updated.y
          break
        case 's':
          updated.height = clamp(coords.y - origRegion.y, 10, canvas.height - origRegion.y)
          break
        case 'w':
          updated.x = clamp(coords.x, 0, origRegion.x + origRegion.width - 10)
          updated.width = origRegion.x + origRegion.width - updated.x
          break
        case 'e':
          updated.width = clamp(coords.x - origRegion.x, 10, canvas.width - origRegion.x)
          break
      }
      return updated
    }))
  }, [resizeHandle, selectedRegionId])

  // ==================== 删除区域 ====================
  const deleteRegion = useCallback((id: string) => {
    setRegions(prev => prev.filter(r => r.id !== id))
    if (selectedRegionId === id) setSelectedRegionId(null)
    saveHistory()
  }, [selectedRegionId, saveHistory])

  // ==================== 全图马赛克 ====================
  const applyFullImageMosaic = useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const newRegion: MosaicRegion = {
      id: generateId(),
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      type: mosaicType,
      intensity
    }
    setRegions(prev => [...prev, newRegion])
    saveHistory()
  }, [mosaicType, intensity, saveHistory])

  // ==================== 清除所有 ====================
  const clearAll = useCallback(() => {
    setRegions([])
    setSelectedRegionId(null)
    if (originalImageRef.current) {
      drawImageToCanvas(originalImageRef.current, displaySize.width, displaySize.height)
    }
    saveHistory()
  }, [displaySize, drawImageToCanvas, saveHistory])

  // ==================== 更换图片 ====================
  const changeImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // ==================== 缩放 ====================
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 10, 200))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 10, 30))
  }, [])

  const handleZoomFit = useCallback(() => {
    if (!originalImageRef.current) return
    const img = originalImageRef.current
    const maxW = 900
    const maxH = window.innerHeight - 350
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    setZoom(Math.round(scale * 100))
  }, [])

  // ==================== 导出下载 ====================
  const exportImage = useCallback(async () => {
    const img = originalImageRef.current
    if (!img) return

    setProcessing(true)

    try {
      // 创建全尺寸画布
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = img.width
      exportCanvas.height = img.height
      const ctx = exportCanvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0)

      // 缩放区域到原始尺寸并应用马赛克
      const scaleX = img.width / displaySize.width
      const scaleY = img.height / displaySize.height

      for (const region of regions) {
        const scaledRegion: MosaicRegion = {
          ...region,
          x: region.x * scaleX,
          y: region.y * scaleY,
          width: region.width * scaleX,
          height: region.height * scaleY,
          intensity: region.intensity * Math.max(scaleX, scaleY)
        }
        applyMosaicEffect(
          ctx,
          ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height),
          scaledRegion,
          exportCanvas.width,
          exportCanvas.height
        )
      }

      // 下载
      exportCanvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `mosaic_${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setProcessing(false)
      }, 'image/png')
    } catch {
      setProcessing(false)
    }
  }, [regions, displaySize, applyMosaicEffect])

  // ==================== 马赛克类型选项 ====================
  const mosaicTypes: Array<{ type: MosaicType; icon: string; label: string }> = [
    { type: 'pixelate', icon: '🟩', label: t('imageMosaic.typePixelate') },
    { type: 'blur', icon: '🌫️', label: t('imageMosaic.typeBlur') },
    { type: 'solid', icon: '⬛', label: t('imageMosaic.typeSolid') },
    { type: 'crosshatch', icon: '🔳', label: t('imageMosaic.typeCrosshatch') },
  ]

  // ==================== 强度预设 ====================
  const intensityPresets = [
    { label: t('imageMosaic.presetLight'), value: 8 },
    { label: t('imageMosaic.presetMedium'), value: 15 },
    { label: t('imageMosaic.presetStrong'), value: 25 },
    { label: t('imageMosaic.presetMax'), value: 40 },
  ]

  // ==================== 渲染 ====================
  if (!imageLoaded) {
    return (
      <div className="image-mosaic-tool">
        <div
          className={`mosaic-upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="upload-icon">🖼️</span>
          <div className="upload-title">{t('imageMosaic.uploadTitle')}</div>
          <div className="upload-hint">{t('imageMosaic.uploadHint')}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* 使用提示 */}
        <div className="mosaic-tips">
          <h3>💡 {t('imageMosaic.tipsTitle')}</h3>
          <ul className="mosaic-tips-list">
            <li><span className="tip-icon">📌</span>{t('imageMosaic.tip1')}</li>
            <li><span className="tip-icon">🎯</span>{t('imageMosaic.tip2')}</li>
            <li><span className="tip-icon">🖌️</span>{t('imageMosaic.tip3')}</li>
            <li><span className="tip-icon">⌨️</span>{t('imageMosaic.tip4')}</li>
            <li><span className="tip-icon">🔒</span>{t('imageMosaic.tip5')}</li>
            <li><span className="tip-icon">📱</span>{t('imageMosaic.tip6')}</li>
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="image-mosaic-tool">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <div className="mosaic-editor">
        {/* 工具栏 */}
        <div className="mosaic-toolbar">
          <div className="mosaic-toolbar-group">
            <button
              className={`mosaic-tool-btn ${toolMode === 'rect' ? 'active' : ''}`}
              onClick={() => setToolMode('rect')}
              title={t('imageMosaic.toolRect')}
            >
              ▭ {t('imageMosaic.toolRect')}
            </button>
            <button
              className={`mosaic-tool-btn ${toolMode === 'brush' ? 'active' : ''}`}
              onClick={() => setToolMode('brush')}
              title={t('imageMosaic.toolBrush')}
            >
              🖌️ {t('imageMosaic.toolBrush')}
            </button>
            <button
              className={`mosaic-tool-btn ${toolMode === 'select' ? 'active' : ''}`}
              onClick={() => setToolMode('select')}
              title={t('imageMosaic.toolSelect')}
            >
              ⬚ {t('imageMosaic.toolSelect')}
            </button>
          </div>

          <div className="mosaic-toolbar-divider" />

          <div className="mosaic-history-bar">
            <button
              className="mosaic-tool-btn"
              onClick={undo}
              disabled={historyIndex <= 0}
              title={t('imageMosaic.undo')}
            >
              ↩
            </button>
            <button
              className="mosaic-tool-btn"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title={t('imageMosaic.redo')}
            >
              ↪
            </button>
          </div>

          <div className="mosaic-toolbar-divider" />

          <div className="mosaic-zoom-control">
            <button className="mosaic-zoom-btn" onClick={handleZoomOut}>−</button>
            <span className="mosaic-zoom-value">{zoom}%</span>
            <button className="mosaic-zoom-btn" onClick={handleZoomIn}>+</button>
            <button className="mosaic-zoom-btn" onClick={handleZoomFit} title={t('imageMosaic.zoomFit')}>⊡</button>
          </div>

          <div className="toolbar-spacer" />

          <button className="mosaic-tool-btn" onClick={changeImage}>
            📂 {t('imageMosaic.changeImage')}
          </button>
          <button
            className="mosaic-tool-btn danger"
            onClick={clearAll}
          >
            🗑️ {t('imageMosaic.clearAll')}
          </button>
        </div>

        {/* 主编辑区域 */}
        <div className="mosaic-editor-main">
          {/* 画布 */}
          <div className="mosaic-canvas-area" ref={containerRef}>
            <div
              className="mosaic-canvas-container"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas ref={canvasRef} />
              <canvas
                ref={overlayCanvasRef}
                className="selection-overlay"
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
              />
              {/* 选区框UI */}
              {toolMode === 'select' && regions.map(region => (
                <div
                  key={region.id}
                  className={`mosaic-selection-rect ${region.id === selectedRegionId ? 'selected' : ''}`}
                  style={{
                    left: region.x,
                    top: region.y,
                    width: region.width,
                    height: region.height,
                    pointerEvents: 'auto'
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setSelectedRegionId(region.id)
                    const coords = getCanvasCoords(e)
                    setIsDraggingRegion(true)
                    setDragOffset({
                      x: coords.x - region.x,
                      y: coords.y - region.y
                    })
                  }}
                >
                  <button
                    className="selection-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteRegion(region.id)
                    }}
                  >✕</button>
                  {region.id === selectedRegionId && (
                    <>
                      {['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map(h => (
                        <div
                          key={h}
                          className={`resize-handle ${h}`}
                          onMouseDown={(e) => handleResizeStart(h, region, e)}
                        />
                      ))}
                    </>
                  )}
                </div>
              ))}

              {/* 正在绘制的选区预览 */}
              {isDrawing && toolMode === 'rect' && (
                <div
                  className="mosaic-drawing-rect"
                  style={{
                    left: Math.min(drawStart.x, drawCurrent.x),
                    top: Math.min(drawStart.y, drawCurrent.y),
                    width: Math.abs(drawCurrent.x - drawStart.x),
                    height: Math.abs(drawCurrent.y - drawStart.y)
                  }}
                />
              )}
            </div>

            {/* 处理中遮罩 */}
            {processing && (
              <div className="mosaic-processing-overlay">
                <div className="processing-spinner" />
                <span className="processing-text">{t('imageMosaic.processing')}</span>
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="mosaic-sidebar">
            {/* 马赛克类型 */}
            <div className="mosaic-panel">
              <div className="mosaic-panel-header">
                <span className="mosaic-panel-title">🎨 {t('imageMosaic.mosaicType')}</span>
              </div>
              <div className="mosaic-panel-content">
                <div className="mosaic-type-grid">
                  {mosaicTypes.map(mt => (
                    <button
                      key={mt.type}
                      className={`mosaic-type-btn ${mosaicType === mt.type ? 'active' : ''}`}
                      onClick={() => setMosaicType(mt.type)}
                    >
                      <span className="type-icon">{mt.icon}</span>
                      {mt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 参数设置 */}
            <div className="mosaic-panel">
              <div className="mosaic-panel-header">
                <span className="mosaic-panel-title">⚙️ {t('imageMosaic.params')}</span>
              </div>
              <div className="mosaic-panel-content">
                {/* 强度/块大小 */}
                <div className="mosaic-param">
                  <div className="mosaic-param-label">
                    <span>{t('imageMosaic.intensity')}</span>
                    <span className="mosaic-param-value">{intensity}px</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="50"
                    value={intensity}
                    onChange={e => setIntensity(Number(e.target.value))}
                  />
                  <div className="mosaic-preset-row">
                    {intensityPresets.map(p => (
                      <button
                        key={p.value}
                        className={`mosaic-preset-btn ${intensity === p.value ? 'active' : ''}`}
                        onClick={() => setIntensity(p.value)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 画笔大小（画笔模式） */}
                {toolMode === 'brush' && (
                  <div className="mosaic-param">
                    <div className="mosaic-param-label">
                      <span>{t('imageMosaic.brushSize')}</span>
                      <span className="mosaic-param-value">{brushSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={brushSize}
                      onChange={e => setBrushSize(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 区域列表 */}
            <div className="mosaic-panel">
              <div className="mosaic-panel-header">
                <span className="mosaic-panel-title">
                  📋 {t('imageMosaic.regionList')}
                  {regions.length > 0 && <span style={{ opacity: 0.5, fontWeight: 400 }}> ({regions.length})</span>}
                </span>
              </div>
              <div className="mosaic-panel-content">
                {regions.length === 0 ? (
                  <div className="mosaic-empty-hint">
                    {t('imageMosaic.noRegions')}
                  </div>
                ) : (
                  <div className="mosaic-region-list">
                    {/* 只显示矩形选区（非画笔小块）的列表 */}
                    {regions.filter(r => r.width > brushSize * 1.5 || r.height > brushSize * 1.5).map((region, idx) => (
                      <div
                        key={region.id}
                        className={`mosaic-region-item ${region.id === selectedRegionId ? 'selected' : ''}`}
                        onClick={() => setSelectedRegionId(region.id)}
                      >
                        <div className="mosaic-region-info">
                          <span className="region-index">{idx + 1}</span>
                          <span>
                            {Math.round(region.width)}×{Math.round(region.height)}
                          </span>
                        </div>
                        <button
                          className="mosaic-region-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteRegion(region.id)
                          }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 快捷操作 */}
            <div className="mosaic-panel">
              <div className="mosaic-panel-header">
                <span className="mosaic-panel-title">⚡ {t('imageMosaic.quickActions')}</span>
              </div>
              <div className="mosaic-panel-content">
                <button
                  className="mosaic-tool-btn"
                  style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                  onClick={applyFullImageMosaic}
                >
                  🔲 {t('imageMosaic.fullImageMosaic')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="mosaic-action-bar">
          <div className="mosaic-action-info">
            {t('imageMosaic.imageInfo')}:
            <span> {imageSize.width}×{imageSize.height}</span>
            {regions.length > 0 && (
              <> · {t('imageMosaic.regionsCount')}: <span>{regions.length}</span></>
            )}
          </div>
          <div className="mosaic-action-buttons">
            <button
              className="mosaic-tool-btn primary"
              onClick={exportImage}
              disabled={processing || regions.length === 0}
            >
              📥 {t('imageMosaic.exportImage')}
            </button>
          </div>
        </div>
      </div>

      {/* 使用提示 */}
      <div className="mosaic-tips">
        <h3>💡 {t('imageMosaic.tipsTitle')}</h3>
        <ul className="mosaic-tips-list">
          <li><span className="tip-icon">📌</span>{t('imageMosaic.tip1')}</li>
          <li><span className="tip-icon">🎯</span>{t('imageMosaic.tip2')}</li>
          <li><span className="tip-icon">🖌️</span>{t('imageMosaic.tip3')}</li>
          <li><span className="tip-icon">⌨️</span>{t('imageMosaic.tip4')}</li>
          <li><span className="tip-icon">🔒</span>{t('imageMosaic.tip5')}</li>
          <li><span className="tip-icon">📱</span>{t('imageMosaic.tip6')}</li>
        </ul>
      </div>
    </div>
  )
}
