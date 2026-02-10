import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Upload, Download, Loader2, Sparkles,
  RotateCcw, RotateCw, Eraser, Paintbrush, Trash2,
  Image as ImageIcon, Eye, EyeOff,
  ZoomIn, ZoomOut, Layers, RefreshCw, ChevronDown, ChevronUp,
  Settings, X, CheckCircle2, AlertCircle
} from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { removeBackground } from '@imgly/background-removal'
import './RemovePhotos.css'

/* ─── Constants ─── */
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_BATCH_FILES = 20

type OutputFormat = 'png' | 'webp' | 'jpg'
type BackgroundType = 'transparent' | 'color' | 'image' | 'blur' | 'gradient'

interface ImageTask {
  id: string
  file: File
  preview: string
  originalImage: HTMLImageElement | null
  mask: ImageData | null
  result: Blob | null
  resultUrl: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  progressMessage?: string
  history: ImageData[]
  historyIndex: number
}

interface BackgroundOptions {
  type: BackgroundType
  color: string
  gradientStart: string
  gradientEnd: string
  gradientAngle: number
  imageFile: File | null
  imageUrl: string | null
  imageFit: 'cover' | 'contain' | 'stretch' | 'tile'
  blurAmount: number
}

const COLOR_PRESETS = [
  '#ffffff', '#000000', '#f44336', '#e91e63', '#9c27b0',
  '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
  '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b',
  '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b'
]

const GRADIENT_PRESETS = [
  { start: '#667eea', end: '#764ba2', label: 'Purple' },
  { start: '#f093fb', end: '#f5576c', label: 'Pink' },
  { start: '#4facfe', end: '#00f2fe', label: 'Blue' },
  { start: '#43e97b', end: '#38f9d7', label: 'Green' },
  { start: '#fa709a', end: '#fee140', label: 'Sunset' },
  { start: '#a18cd1', end: '#fbc2eb', label: 'Lavender' },
  { start: '#fccb90', end: '#d57eeb', label: 'Peach' },
  { start: '#e0c3fc', end: '#8ec5fc', label: 'Sky' },
]

/* ─── GPU-accelerated blur via CSS filter (instant, unlike pixel-loop) ─── */
function blurImageCanvas(sourceCanvas: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = sourceCanvas.width
  c.height = sourceCanvas.height
  const ctx = c.getContext('2d')!
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(sourceCanvas, 0, 0)
  return c
}

/* ═══════════════════════ Main Component ═══════════════════════ */
export default function RemovePhotos() {
  const { language } = useI18n()
  const t = useCallback((zh: string, en: string) => language === 'zh-CN' ? zh : en, [language])

  // Core state
  const [tasks, setTasks] = useState<ImageTask[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [modelProgress, setModelProgress] = useState('')

  // Editor state
  const [showCompare, setShowCompare] = useState(true)
  const [compareSlider, setCompareSlider] = useState(50)
  const [zoom, setZoom] = useState(1)

  // Brush state
  const [showBrush, setShowBrush] = useState(false)
  const [brushSize, setBrushSize] = useState(20)
  const [brushMode, setBrushMode] = useState<'add' | 'remove'>('remove')
  const [brushOpacity, setBrushOpacity] = useState(100)

  // Settings
  const [edgeFeather, setEdgeFeather] = useState(1)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png')
  const [outputQuality, setOutputQuality] = useState(95)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Background
  const [backgroundOptions, setBackgroundOptions] = useState<BackgroundOptions>({
    type: 'transparent',
    color: '#ffffff',
    gradientStart: '#667eea',
    gradientEnd: '#764ba2',
    gradientAngle: 135,
    imageFile: null,
    imageUrl: null,
    imageFit: 'cover',
    blurAmount: 15
  })

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgImageInputRef = useRef<HTMLInputElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const brushStateRef = useRef({ isDrawing: false, lastPoint: null as { x: number; y: number } | null })

  const currentTask = useMemo(() => tasks.find(tk => tk.id === selectedTaskId), [tasks, selectedTaskId])

  /* ═══════════════════════ File Upload ═══════════════════════ */
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return
    const fileArray = Array.from(uploadedFiles)
    if (tasks.length + fileArray.length > MAX_BATCH_FILES) {
      alert(t(`最多只能处理 ${MAX_BATCH_FILES} 张图片`, `Maximum ${MAX_BATCH_FILES} images allowed`))
      return
    }
    const newTasks: ImageTask[] = []
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > MAX_FILE_SIZE) {
        alert(t(`文件过大（最大 20MB）: ${file.name}`, `File too large (max 20MB): ${file.name}`))
        continue
      }
      const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const preview = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => setTasks(prev => prev.map(tk => tk.id === taskId ? { ...tk, originalImage: img } : tk))
      img.src = preview
      newTasks.push({
        id: taskId, file, preview, originalImage: null,
        mask: null, result: null, resultUrl: null,
        status: 'pending', progress: 0, history: [], historyIndex: -1
      })
    }
    setTasks(prev => [...prev, ...newTasks])
    if (newTasks.length > 0 && !selectedTaskId) setSelectedTaskId(newTasks[0].id)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [t, tasks.length, selectedTaskId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0 && fileInputRef.current) {
      const dt = new DataTransfer()
      Array.from(files).forEach(f => dt.items.add(f))
      fileInputRef.current.files = dt.files
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, [])

  /* ═══════════════════════ Feathering ═══════════════════════ */
  const applyFeathering = useCallback((mask: ImageData, radius: number): ImageData => {
    if (radius <= 0) return mask
    const { width: w, height: h } = mask
    const feathered = new ImageData(w, h)
    const md = mask.data, fd = feathered.data
    const r = Math.max(1, Math.floor(radius))
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        const alpha = md[idx + 3]
        if (alpha === 0 || alpha === 255) {
          fd[idx] = md[idx]; fd[idx + 1] = md[idx + 1]; fd[idx + 2] = md[idx + 2]; fd[idx + 3] = alpha
          continue
        }
        let sum = 0, wt = 0
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist <= r) {
                const weight = 1 - dist / r
                sum += md[(ny * w + nx) * 4 + 3] * weight
                wt += weight
              }
            }
          }
        }
        fd[idx] = md[idx]; fd[idx + 1] = md[idx + 1]; fd[idx + 2] = md[idx + 2]
        fd[idx + 3] = wt > 0 ? Math.round(sum / wt) : alpha
      }
    }
    return feathered
  }, [])

  /* ═══════════════════════ Composite Engine ═══════════════════════ */
  const compositeResult = useCallback(async (
    origImg: HTMLImageElement,
    mask: ImageData,
    bgOpts: BackgroundOptions
  ): Promise<{ blob: Blob; url: string }> => {
    const W = origImg.width, H = origImg.height
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Step 1: Draw background
    if (bgOpts.type === 'transparent') {
      ctx.clearRect(0, 0, W, H)
    } else if (bgOpts.type === 'color') {
      ctx.fillStyle = bgOpts.color
      ctx.fillRect(0, 0, W, H)
    } else if (bgOpts.type === 'gradient') {
      const angleRad = (bgOpts.gradientAngle * Math.PI) / 180
      const cx = W / 2, cy = H / 2
      const len = Math.max(W, H)
      const grad = ctx.createLinearGradient(
        cx - Math.cos(angleRad) * len / 2, cy - Math.sin(angleRad) * len / 2,
        cx + Math.cos(angleRad) * len / 2, cy + Math.sin(angleRad) * len / 2
      )
      grad.addColorStop(0, bgOpts.gradientStart)
      grad.addColorStop(1, bgOpts.gradientEnd)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
    } else if (bgOpts.type === 'blur') {
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = W; srcCanvas.height = H
      srcCanvas.getContext('2d')!.drawImage(origImg, 0, 0)
      const blurred = blurImageCanvas(srcCanvas, bgOpts.blurAmount)
      ctx.drawImage(blurred, 0, 0)
    } else if (bgOpts.type === 'image' && (bgOpts.imageFile || bgOpts.imageUrl)) {
      const bgImg = new Image()
      bgImg.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        bgImg.onload = () => resolve()
        bgImg.onerror = reject
        bgImg.src = bgOpts.imageUrl || URL.createObjectURL(bgOpts.imageFile!)
      })
      if (bgOpts.imageFit === 'cover') {
        const scale = Math.max(W / bgImg.width, H / bgImg.height)
        const w = bgImg.width * scale, h = bgImg.height * scale
        ctx.drawImage(bgImg, (W - w) / 2, (H - h) / 2, w, h)
      } else if (bgOpts.imageFit === 'contain') {
        const scale = Math.min(W / bgImg.width, H / bgImg.height)
        const w = bgImg.width * scale, h = bgImg.height * scale
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, H)
        ctx.drawImage(bgImg, (W - w) / 2, (H - h) / 2, w, h)
      } else if (bgOpts.imageFit === 'stretch') {
        ctx.drawImage(bgImg, 0, 0, W, H)
      } else if (bgOpts.imageFit === 'tile') {
        const pattern = ctx.createPattern(bgImg, 'repeat')
        if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, W, H) }
      }
    }

    // Step 2: Composite foreground over background using mask
    const bgData = ctx.getImageData(0, 0, W, H)
    const origCanvas = document.createElement('canvas')
    origCanvas.width = W; origCanvas.height = H
    origCanvas.getContext('2d')!.drawImage(origImg, 0, 0)
    const origData = origCanvas.getContext('2d')!.getImageData(0, 0, W, H)
    const result = new ImageData(W, H)

    for (let i = 0; i < origData.data.length; i += 4) {
      const a = mask.data[i + 3] / 255
      if (bgOpts.type === 'transparent') {
        result.data[i] = origData.data[i]
        result.data[i + 1] = origData.data[i + 1]
        result.data[i + 2] = origData.data[i + 2]
        result.data[i + 3] = Math.round(origData.data[i + 3] * a)
      } else {
        const bg = 1 - a
        result.data[i] = Math.round(origData.data[i] * a + bgData.data[i] * bg)
        result.data[i + 1] = Math.round(origData.data[i + 1] * a + bgData.data[i + 1] * bg)
        result.data[i + 2] = Math.round(origData.data[i + 2] * a + bgData.data[i + 2] * bg)
        result.data[i + 3] = 255
      }
    }

    ctx.putImageData(result, 0, 0)
    const mimeType = outputFormat === 'jpg' ? 'image/jpeg' : `image/${outputFormat}`
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        if (blob) resolve({ blob, url: URL.createObjectURL(blob) })
      }, mimeType, outputFormat === 'png' ? undefined : outputQuality / 100)
    })
  }, [outputFormat, outputQuality])

  /* ═══════════════════════ Refresh after mask/bg change ═══════════════════════ */
  const refreshTaskResult = useCallback(async (taskId: string, mask: ImageData, bgOpts?: BackgroundOptions) => {
    const task = tasks.find(tk => tk.id === taskId)
    if (!task?.originalImage) return
    const feathered = applyFeathering(mask, edgeFeather)
    const result = await compositeResult(task.originalImage, feathered, bgOpts || backgroundOptions)
    setTasks(prev => prev.map(tk => {
      if (tk.id !== taskId) return tk
      if (tk.resultUrl) URL.revokeObjectURL(tk.resultUrl)
      return { ...tk, mask: feathered, result: result.blob, resultUrl: result.url }
    }))
  }, [tasks, edgeFeather, compositeResult, backgroundOptions, applyFeathering])

  /* ═══════════════════════ AI Background Removal ═══════════════════════ */
  const removeBackgroundAI = useCallback(async (task: ImageTask): Promise<ImageData | null> => {
    if (!task.originalImage) return null
    try {
      const img = task.originalImage
      setTasks(prev => prev.map(tk =>
        tk.id === task.id ? { ...tk, progress: 5, progressMessage: t('初始化 AI 引擎...', 'Initializing AI engine...') } : tk
      ))

      const inputCanvas = document.createElement('canvas')
      inputCanvas.width = img.width; inputCanvas.height = img.height
      inputCanvas.getContext('2d')!.drawImage(img, 0, 0)
      const inputBlob: Blob = await new Promise(r => inputCanvas.toBlob(b => r(b!), 'image/png'))

      // Call the library — it auto-downloads models from CDN
      const resultBlob = await removeBackground(inputBlob, {
        progress: (key: string, current: number, total: number) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0
          let msg: string
          if (key.includes('fetch') || key.includes('download')) {
            msg = t(`下载 AI 模型... ${pct}%`, `Downloading model... ${pct}%`)
          } else if (key.includes('compute') || key.includes('inference')) {
            msg = t(`AI 分析中... ${pct}%`, `AI analyzing... ${pct}%`)
          } else {
            msg = t(`处理中... ${pct}%`, `Processing... ${pct}%`)
          }
          setModelProgress(msg)
          setTasks(prev => prev.map(tk =>
            tk.id === task.id ? { ...tk, progress: 10 + Math.round(pct * 0.75), progressMessage: msg } : tk
          ))
        },
        output: { format: 'image/png', quality: 1.0 }
      })

      setModelReady(true)
      setTasks(prev => prev.map(tk =>
        tk.id === task.id ? { ...tk, progress: 88, progressMessage: t('生成遮罩...', 'Generating mask...') } : tk
      ))

      // Convert result blob → mask (alpha channel)
      const resultImg = new Image()
      const resultUrl = URL.createObjectURL(resultBlob)
      await new Promise<void>((resolve, reject) => {
        resultImg.onload = () => resolve()
        resultImg.onerror = reject
        resultImg.src = resultUrl
      })

      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = img.width; maskCanvas.height = img.height
      const maskCtx = maskCanvas.getContext('2d')!
      maskCtx.drawImage(resultImg, 0, 0, img.width, img.height)
      const rd = maskCtx.getImageData(0, 0, img.width, img.height)

      const mask = new ImageData(img.width, img.height)
      for (let i = 0; i < rd.data.length; i += 4) {
        const a = rd.data[i + 3]
        mask.data[i] = a; mask.data[i + 1] = a; mask.data[i + 2] = a; mask.data[i + 3] = a
      }
      URL.revokeObjectURL(resultUrl)
      return mask
    } catch (err) {
      console.error('AI background removal failed:', err)
      return null
    }
  }, [t])

  /* ═══════════════════════ Process Task ═══════════════════════ */
  const processSingleTask = useCallback(async (task: ImageTask) => {
    if (!task.originalImage) return
    setTasks(prev => prev.map(tk =>
      tk.id === task.id ? { ...tk, status: 'processing', progress: 0 } : tk
    ))
    const mask = await removeBackgroundAI(task)
    if (!mask) {
      setTasks(prev => prev.map(tk =>
        tk.id === task.id ? { ...tk, status: 'failed', progressMessage: t('处理失败，请重试', 'Failed, please retry') } : tk
      ))
      return
    }
    setTasks(prev => prev.map(tk =>
      tk.id === task.id ? { ...tk, progress: 92, progressMessage: t('合成结果...', 'Compositing...') } : tk
    ))
    const feathered = applyFeathering(mask, edgeFeather)
    const result = await compositeResult(task.originalImage, feathered, backgroundOptions)
    setTasks(prev => prev.map(tk =>
      tk.id === task.id
        ? { ...tk, status: 'completed', mask: feathered, result: result.blob, resultUrl: result.url, progress: 100, progressMessage: t('完成！', 'Done!'), history: [feathered], historyIndex: 0 }
        : tk
    ))
  }, [edgeFeather, t, removeBackgroundAI, compositeResult, backgroundOptions, applyFeathering])

  const processBatch = useCallback(async () => {
    const pending = tasks.filter(tk => tk.status === 'pending')
    if (pending.length === 0) return
    setIsProcessing(true)
    for (const task of pending) {
      try { await processSingleTask(task) }
      catch (err) {
        console.error(`Failed: ${task.file.name}`, err)
        setTasks(prev => prev.map(tk =>
          tk.id === task.id ? { ...tk, status: 'failed', progressMessage: String(err) } : tk
        ))
      }
    }
    setIsProcessing(false)
  }, [tasks, processSingleTask])

  /* ═══════════════════════ Reapply background ═══════════════════════ */
  const reapplyBackground = useCallback(async () => {
    if (!currentTask?.mask || !currentTask?.originalImage) return
    const baseMask = currentTask.history[0] || currentTask.mask
    const feathered = applyFeathering(baseMask, edgeFeather)
    const result = await compositeResult(currentTask.originalImage, feathered, backgroundOptions)
    setTasks(prev => prev.map(tk => {
      if (tk.id !== currentTask.id) return tk
      if (tk.resultUrl) URL.revokeObjectURL(tk.resultUrl)
      return { ...tk, mask: feathered, result: result.blob, resultUrl: result.url }
    }))
  }, [currentTask, edgeFeather, compositeResult, backgroundOptions, applyFeathering])

  useEffect(() => {
    if (currentTask?.mask && currentTask?.originalImage && currentTask.status === 'completed') {
      reapplyBackground()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundOptions, edgeFeather])

  /* ═══════════════════════ Brush ═══════════════════════ */
  const initBrushCanvas = useCallback(() => {
    if (!maskCanvasRef.current || !currentTask?.originalImage) return
    const canvas = maskCanvasRef.current
    canvas.width = currentTask.originalImage.width
    canvas.height = currentTask.originalImage.height
    if (currentTask.mask) canvas.getContext('2d')!.putImageData(currentTask.mask, 0, 0)
  }, [currentTask])

  useEffect(() => {
    if (showBrush) initBrushCanvas()
  }, [showBrush, currentTask, initBrushCanvas])

  const drawBrushStroke = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    if (!maskCanvasRef.current) return
    const ctx = maskCanvasRef.current.getContext('2d')!
    ctx.globalCompositeOperation = brushMode === 'add' ? 'source-over' : 'destination-out'
    const alpha = brushOpacity / 100
    ctx.strokeStyle = brushMode === 'add' ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
    ctx.lineWidth = brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }, [brushMode, brushOpacity, brushSize])

  const handleBrushStart = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!maskCanvasRef.current || !currentTask) return
    const rect = maskCanvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (maskCanvasRef.current.width / rect.width)
    const y = (e.clientY - rect.top) * (maskCanvasRef.current.height / rect.height)
    brushStateRef.current.isDrawing = true
    brushStateRef.current.lastPoint = { x, y }
    drawBrushStroke(x, y, x, y)
  }, [currentTask, drawBrushStroke])

  const handleBrushMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!brushStateRef.current.isDrawing || !maskCanvasRef.current) return
    const rect = maskCanvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (maskCanvasRef.current.width / rect.width)
    const y = (e.clientY - rect.top) * (maskCanvasRef.current.height / rect.height)
    if (brushStateRef.current.lastPoint) {
      drawBrushStroke(brushStateRef.current.lastPoint.x, brushStateRef.current.lastPoint.y, x, y)
      brushStateRef.current.lastPoint = { x, y }
    }
  }, [drawBrushStroke])

  const handleBrushEnd = useCallback(() => {
    if (!brushStateRef.current.isDrawing || !maskCanvasRef.current || !currentTask) return
    brushStateRef.current.isDrawing = false
    brushStateRef.current.lastPoint = null
    const canvas = maskCanvasRef.current
    const mask = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const taskId = currentTask.id
    setTasks(prev => prev.map(tk => {
      if (tk.id !== taskId) return tk
      const newHistory = [...tk.history.slice(0, tk.historyIndex + 1), mask]
      return { ...tk, mask, history: newHistory, historyIndex: newHistory.length - 1 }
    }))
    refreshTaskResult(taskId, mask)
  }, [currentTask, refreshTaskResult])

  const undo = useCallback(() => {
    if (!currentTask || currentTask.historyIndex <= 0) return
    const idx = currentTask.historyIndex - 1
    const mask = currentTask.history[idx]
    setTasks(prev => prev.map(tk => tk.id === currentTask.id ? { ...tk, mask, historyIndex: idx } : tk))
    refreshTaskResult(currentTask.id, mask)
  }, [currentTask, refreshTaskResult])

  const redo = useCallback(() => {
    if (!currentTask || currentTask.historyIndex >= currentTask.history.length - 1) return
    const idx = currentTask.historyIndex + 1
    const mask = currentTask.history[idx]
    setTasks(prev => prev.map(tk => tk.id === currentTask.id ? { ...tk, mask, historyIndex: idx } : tk))
    refreshTaskResult(currentTask.id, mask)
  }, [currentTask, refreshTaskResult])

  /* ═══════════════════════ Download ═══════════════════════ */
  const downloadCurrent = useCallback(() => {
    if (!currentTask?.result) return
    const name = currentTask.file.name.replace(/\.[^/.]+$/, '') + `_no_bg.${outputFormat}`
    saveAs(currentTask.result, name)
  }, [currentTask, outputFormat])

  const downloadAll = useCallback(async () => {
    const completed = tasks.filter(tk => tk.status === 'completed' && tk.result)
    if (completed.length === 0) return
    if (completed.length === 1 && completed[0].result) {
      saveAs(completed[0].result, completed[0].file.name.replace(/\.[^/.]+$/, '') + `_no_bg.${outputFormat}`)
      return
    }
    const zip = new JSZip()
    completed.forEach(task => {
      if (task.result) zip.file(task.file.name.replace(/\.[^/.]+$/, '') + `_no_bg.${outputFormat}`, task.result)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'removed_backgrounds.zip')
  }, [tasks, outputFormat])

  /* ═══════════════════════ Task Management ═══════════════════════ */
  const clearAll = useCallback(() => {
    tasks.forEach(tk => { if (tk.preview) URL.revokeObjectURL(tk.preview); if (tk.resultUrl) URL.revokeObjectURL(tk.resultUrl) })
    setTasks([]); setSelectedTaskId(null); setShowBrush(false)
  }, [tasks])

  const removeTask = useCallback((id: string) => {
    const task = tasks.find(tk => tk.id === id)
    if (task) { if (task.preview) URL.revokeObjectURL(task.preview); if (task.resultUrl) URL.revokeObjectURL(task.resultUrl) }
    setTasks(prev => prev.filter(tk => tk.id !== id))
    if (selectedTaskId === id) setSelectedTaskId(tasks.find(tk => tk.id !== id)?.id || null)
  }, [tasks, selectedTaskId])

  const handleBgImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setBackgroundOptions(prev => ({ ...prev, imageFile: file, imageUrl: url, type: 'image' }))
    }
  }, [])

  const pendingCount = tasks.filter(tk => tk.status === 'pending').length
  const completedCount = tasks.filter(tk => tk.status === 'completed').length
  const processingCount = tasks.filter(tk => tk.status === 'processing').length

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div className="rp" onDrop={handleDrop} onDragOver={e => { e.preventDefault(); e.stopPropagation() }}>
      {/* Header */}
      <header className="rp-header">
        <h1 className="rp-title">
          <Sparkles size={28} />
          {t('AI 智能去背景', 'AI Background Remover')}
        </h1>
        <p className="rp-desc">
          {t(
            'AI 驱动 · 一键去除背景 · 自定义替换 · 画笔精修 · 批量处理 · 100% 本地运算',
            'AI-Powered · One-Click Removal · Custom Background · Brush Refine · Batch · 100% Local'
          )}
        </p>
      </header>

      {/* Upload Area */}
      {tasks.length === 0 && (
        <div className="rp-upload-area" onClick={() => fileInputRef.current?.click()}>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
          <div className="rp-upload-icon"><Upload size={48} /></div>
          <h2>{t('上传图片', 'Upload Images')}</h2>
          <p>{t('点击或拖拽图片到这里，支持批量', 'Click or drag images here')}</p>
          <span className="rp-upload-hint">
            {t(`JPG / PNG / WebP · 最多 ${MAX_BATCH_FILES} 张 · 单张最大 20MB`, `JPG / PNG / WebP · Max ${MAX_BATCH_FILES} · 20MB each`)}
          </span>
        </div>
      )}

      {/* Workspace */}
      {tasks.length > 0 && (
        <div className="rp-workspace">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
          <input ref={bgImageInputRef} type="file" accept="image/*" onChange={handleBgImageUpload} style={{ display: 'none' }} />

          {/* ─── Left Sidebar ─── */}
          <aside className="rp-sidebar">
            <div className="rp-sidebar-header">
              <h3><ImageIcon size={15} /> {t('图片', 'Images')} <span className="rp-badge">{tasks.length}</span></h3>
              <button className="rp-icon-btn" onClick={() => fileInputRef.current?.click()} title={t('添加', 'Add')}>
                <Upload size={15} />
              </button>
            </div>

            <div className="rp-task-list">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className={`rp-task ${task.id === selectedTaskId ? 'active' : ''} ${task.status}`}
                  onClick={() => { setSelectedTaskId(task.id); setShowBrush(false) }}
                >
                  <div className="rp-task-thumb">
                    <img src={task.resultUrl || task.preview} alt="" />
                    {task.status === 'processing' && (
                      <div className="rp-task-loading">
                        <Loader2 className="rp-spin" size={16} />
                        <div className="rp-task-pbar"><div className="rp-task-pfill" style={{ width: `${task.progress}%` }} /></div>
                      </div>
                    )}
                    {task.status === 'completed' && <div className="rp-task-done"><CheckCircle2 size={13} /></div>}
                    {task.status === 'failed' && <div className="rp-task-fail"><AlertCircle size={13} /></div>}
                  </div>
                  <div className="rp-task-meta">
                    <span className="rp-task-name">{task.file.name}</span>
                    <span className="rp-task-size">{(task.file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <button className="rp-task-del" onClick={e => { e.stopPropagation(); removeTask(task.id) }}><X size={13} /></button>
                </div>
              ))}
            </div>

            <div className="rp-sidebar-actions">
              {pendingCount > 0 && (
                <button className="rp-btn primary full" onClick={processBatch} disabled={isProcessing}>
                  <Sparkles size={15} /> {isProcessing ? t('处理中...', 'Processing...') : t(`开始处理 (${pendingCount})`, `Process All (${pendingCount})`)}
                </button>
              )}
              {completedCount > 0 && (
                <button className="rp-btn secondary full" onClick={downloadAll}>
                  <Download size={15} /> {t(`下载全部 (${completedCount})`, `Download All (${completedCount})`)}
                </button>
              )}
              <button className="rp-btn danger full" onClick={clearAll}>
                <Trash2 size={15} /> {t('清除全部', 'Clear All')}
              </button>
            </div>
          </aside>

          {/* ─── Center: Main Editor ─── */}
          <main className="rp-main">
            {currentTask ? (
              <>
                {/* Top Toolbar */}
                <div className="rp-toolbar-top">
                  <div className="rp-toolbar-left">
                    {currentTask.status === 'pending' && (
                      <button className="rp-btn primary sm" onClick={() => processSingleTask(currentTask)} disabled={isProcessing || !currentTask.originalImage}>
                        <Sparkles size={14} /> {t('去背景', 'Remove BG')}
                      </button>
                    )}
                    {currentTask.status === 'failed' && (
                      <button className="rp-btn primary sm" onClick={() => {
                        setTasks(prev => prev.map(tk => tk.id === currentTask.id ? { ...tk, status: 'pending' as const } : tk))
                        setTimeout(() => processSingleTask(currentTask), 100)
                      }}>
                        <RefreshCw size={14} /> {t('重试', 'Retry')}
                      </button>
                    )}

                    {currentTask.status === 'completed' && (
                      <>
                        <button className={`rp-btn ghost sm ${showCompare ? 'active' : ''}`} onClick={() => setShowCompare(!showCompare)}>
                          {showCompare ? <EyeOff size={14} /> : <Eye size={14} />}
                          {showCompare ? t('纯结果', 'Result') : t('对比', 'Compare')}
                        </button>
                        <button className={`rp-btn ghost sm ${showBrush ? 'active' : ''}`} onClick={() => setShowBrush(!showBrush)}>
                          <Paintbrush size={14} /> {t('精修', 'Refine')}
                        </button>
                        <div className="rp-divider" />
                        <button className="rp-btn ghost sm" onClick={undo} disabled={currentTask.historyIndex <= 0} title={t('撤销', 'Undo')}>
                          <RotateCcw size={14} />
                        </button>
                        <button className="rp-btn ghost sm" onClick={redo} disabled={currentTask.historyIndex >= currentTask.history.length - 1} title={t('重做', 'Redo')}>
                          <RotateCw size={14} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="rp-toolbar-right">
                    <div className="rp-zoom-controls">
                      <button className="rp-icon-btn sm" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}><ZoomOut size={13} /></button>
                      <span className="rp-zoom-label">{Math.round(zoom * 100)}%</span>
                      <button className="rp-icon-btn sm" onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn size={13} /></button>
                    </div>
                    {currentTask.resultUrl && (
                      <button className="rp-btn primary sm" onClick={downloadCurrent}>
                        <Download size={14} /> {t('下载', 'Download')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Canvas Area */}
                <div className="rp-canvas-area">
                  {showBrush && currentTask.mask ? (
                    <div className="rp-brush-editor" style={{ transform: `scale(${zoom})` }}>
                      <div className="rp-brush-canvas-wrap">
                        <img src={currentTask.preview} alt="Original" className="rp-brush-base" draggable={false} />
                        <canvas
                          ref={maskCanvasRef}
                          className="rp-brush-canvas"
                          onMouseDown={handleBrushStart}
                          onMouseMove={handleBrushMove}
                          onMouseUp={handleBrushEnd}
                          onMouseLeave={handleBrushEnd}
                        />
                      </div>
                    </div>
                  ) : currentTask.resultUrl && showCompare ? (
                    <div className="rp-preview" style={{ transform: `scale(${zoom})` }}>
                      <div className="rp-compare">
                        <img src={currentTask.preview} alt="Original" className="rp-compare-img" draggable={false} />
                        <img
                          src={currentTask.resultUrl}
                          alt="Result"
                          className="rp-compare-img rp-compare-result"
                          draggable={false}
                          style={{ clipPath: `inset(0 ${100 - compareSlider}% 0 0)` }}
                        />
                        <div className="rp-compare-line" style={{ left: `${compareSlider}%` }}>
                          <div className="rp-compare-handle">⇔</div>
                        </div>
                        <span className="rp-compare-label left">{t('结果', 'Result')}</span>
                        <span className="rp-compare-label right">{t('原图', 'Original')}</span>
                        <input
                          type="range" min="0" max="100" value={compareSlider}
                          onChange={e => setCompareSlider(Number(e.target.value))}
                          className="rp-compare-slider"
                        />
                      </div>
                    </div>
                  ) : currentTask.resultUrl ? (
                    <div className="rp-preview" style={{ transform: `scale(${zoom})` }}>
                      <div className={`rp-result-preview ${backgroundOptions.type === 'transparent' ? 'checkerboard' : ''}`}>
                        <img src={currentTask.resultUrl} alt="Result" draggable={false} />
                      </div>
                    </div>
                  ) : (
                    <div className="rp-preview" style={{ transform: `scale(${zoom})` }}>
                      <div className="rp-original-preview">
                        <img src={currentTask.preview} alt="Original" draggable={false} />
                        {currentTask.status === 'processing' && (
                          <div className="rp-processing-overlay">
                            <Loader2 className="rp-spin" size={36} />
                            <div className="rp-pbar"><div className="rp-pfill" style={{ width: `${currentTask.progress}%` }} /></div>
                            <p>{currentTask.progressMessage}</p>
                          </div>
                        )}
                        {currentTask.status === 'failed' && (
                          <div className="rp-processing-overlay failed">
                            <AlertCircle size={36} />
                            <p>{currentTask.progressMessage || t('处理失败', 'Failed')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rp-empty-state">
                <ImageIcon size={48} />
                <p>{t('选择一张图片开始编辑', 'Select an image to start')}</p>
              </div>
            )}
          </main>

          {/* ─── Right Panel ─── */}
          <aside className="rp-panel">
            {/* AI Status */}
            <div className="rp-panel-section">
              <h4><Sparkles size={14} /> {t('AI 引擎', 'AI Engine')}</h4>
              <div className="rp-ai-status">
                <span className={`rp-status-dot ${modelReady ? 'ready' : isProcessing ? 'loading' : 'idle'}`} />
                <span>
                  {modelReady ? t('模型已就绪', 'Model Ready')
                    : isProcessing ? (modelProgress || t('加载中...', 'Loading...'))
                    : t('首次处理自动加载', 'Auto-loads on first use')}
                </span>
              </div>
              <small className="rp-muted">{t('ISNet 模型 · 浏览器本地推理 · 无需服务器', 'ISNet Model · Browser-Local · No Server')}</small>
            </div>

            {/* Background Settings (visible after completed) */}
            {currentTask?.status === 'completed' && (
              <div className="rp-panel-section">
                <h4><Layers size={14} /> {t('背景设置', 'Background')}</h4>
                <div className="rp-bg-types">
                  {([
                    { type: 'transparent' as BackgroundType, icon: '⊘', label: t('透明', 'None') },
                    { type: 'color' as BackgroundType, icon: '◼', label: t('纯色', 'Color') },
                    { type: 'gradient' as BackgroundType, icon: '◩', label: t('渐变', 'Gradient') },
                    { type: 'image' as BackgroundType, icon: '🖼', label: t('图片', 'Image') },
                    { type: 'blur' as BackgroundType, icon: '◎', label: t('模糊', 'Blur') },
                  ]).map(({ type, icon, label }) => (
                    <button
                      key={type}
                      className={`rp-bg-type-btn ${backgroundOptions.type === type ? 'active' : ''}`}
                      onClick={() => setBackgroundOptions(prev => ({ ...prev, type }))}
                    >
                      <span className="rp-bg-type-icon">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {backgroundOptions.type === 'color' && (
                  <div className="rp-bg-config">
                    <div className="rp-color-presets">
                      {COLOR_PRESETS.map(c => (
                        <button key={c} className={`rp-color-swatch ${backgroundOptions.color === c ? 'active' : ''}`} style={{ backgroundColor: c }} onClick={() => setBackgroundOptions(prev => ({ ...prev, color: c }))} />
                      ))}
                    </div>
                    <div className="rp-color-custom">
                      <label>{t('自定义', 'Custom')}</label>
                      <input type="color" value={backgroundOptions.color} onChange={e => setBackgroundOptions(prev => ({ ...prev, color: e.target.value }))} />
                    </div>
                  </div>
                )}

                {backgroundOptions.type === 'gradient' && (
                  <div className="rp-bg-config">
                    <div className="rp-gradient-presets">
                      {GRADIENT_PRESETS.map((g, i) => (
                        <button key={i} className={`rp-gradient-swatch ${backgroundOptions.gradientStart === g.start && backgroundOptions.gradientEnd === g.end ? 'active' : ''}`} style={{ background: `linear-gradient(135deg, ${g.start}, ${g.end})` }} onClick={() => setBackgroundOptions(prev => ({ ...prev, gradientStart: g.start, gradientEnd: g.end }))} title={g.label} />
                      ))}
                    </div>
                    <div className="rp-gradient-custom">
                      <div className="rp-row">
                        <label>{t('起始色', 'Start')}</label>
                        <input type="color" value={backgroundOptions.gradientStart} onChange={e => setBackgroundOptions(prev => ({ ...prev, gradientStart: e.target.value }))} />
                      </div>
                      <div className="rp-row">
                        <label>{t('结束色', 'End')}</label>
                        <input type="color" value={backgroundOptions.gradientEnd} onChange={e => setBackgroundOptions(prev => ({ ...prev, gradientEnd: e.target.value }))} />
                      </div>
                      <div className="rp-row">
                        <label>{t('角度', 'Angle')}: {backgroundOptions.gradientAngle}°</label>
                        <input type="range" min="0" max="360" value={backgroundOptions.gradientAngle} onChange={e => setBackgroundOptions(prev => ({ ...prev, gradientAngle: Number(e.target.value) }))} />
                      </div>
                    </div>
                  </div>
                )}

                {backgroundOptions.type === 'image' && (
                  <div className="rp-bg-config">
                    <button className="rp-upload-bg-btn" onClick={() => bgImageInputRef.current?.click()}>
                      <Upload size={15} />
                      {backgroundOptions.imageFile ? backgroundOptions.imageFile.name : t('选择背景图片', 'Select Background Image')}
                    </button>
                    {backgroundOptions.imageUrl && (
                      <div className="rp-bg-image-preview">
                        <img src={backgroundOptions.imageUrl} alt="BG" />
                      </div>
                    )}
                    <div className="rp-row">
                      <label>{t('适应模式', 'Fit')}</label>
                      <select value={backgroundOptions.imageFit} onChange={e => setBackgroundOptions(prev => ({ ...prev, imageFit: e.target.value as BackgroundOptions['imageFit'] }))}>
                        <option value="cover">{t('覆盖', 'Cover')}</option>
                        <option value="contain">{t('适应', 'Contain')}</option>
                        <option value="stretch">{t('拉伸', 'Stretch')}</option>
                        <option value="tile">{t('平铺', 'Tile')}</option>
                      </select>
                    </div>
                  </div>
                )}

                {backgroundOptions.type === 'blur' && (
                  <div className="rp-bg-config">
                    <div className="rp-row">
                      <label>{t('模糊强度', 'Blur')}: {backgroundOptions.blurAmount}px</label>
                      <input type="range" min="5" max="50" value={backgroundOptions.blurAmount} onChange={e => setBackgroundOptions(prev => ({ ...prev, blurAmount: Number(e.target.value) }))} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Brush Settings */}
            {showBrush && currentTask?.mask && (
              <div className="rp-panel-section">
                <h4><Paintbrush size={14} /> {t('画笔精修', 'Brush Refine')}</h4>
                <div className="rp-brush-modes">
                  <button className={`rp-brush-mode ${brushMode === 'add' ? 'active' : ''}`} onClick={() => setBrushMode('add')}>
                    <Paintbrush size={14} /> {t('恢复', 'Restore')}
                  </button>
                  <button className={`rp-brush-mode ${brushMode === 'remove' ? 'active' : ''}`} onClick={() => setBrushMode('remove')}>
                    <Eraser size={14} /> {t('擦除', 'Erase')}
                  </button>
                </div>
                <div className="rp-row">
                  <label>{t('笔刷大小', 'Size')}: {brushSize}px</label>
                  <input type="range" min="3" max="150" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} />
                </div>
                <div className="rp-row">
                  <label>{t('不透明度', 'Opacity')}: {brushOpacity}%</label>
                  <input type="range" min="10" max="100" value={brushOpacity} onChange={e => setBrushOpacity(Number(e.target.value))} />
                </div>
              </div>
            )}

            {/* Advanced Settings */}
            <div className="rp-panel-section">
              <button className="rp-section-toggle" onClick={() => setSettingsOpen(!settingsOpen)}>
                <Settings size={14} />
                <span>{t('高级设置', 'Advanced')}</span>
                {settingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {settingsOpen && (
                <div className="rp-advanced-settings">
                  <div className="rp-row">
                    <label>{t('边缘羽化', 'Feather')}: {edgeFeather}px</label>
                    <input type="range" min="0" max="10" value={edgeFeather} onChange={e => setEdgeFeather(Number(e.target.value))} />
                  </div>
                  <div className="rp-row">
                    <label>{t('输出格式', 'Format')}</label>
                    <select value={outputFormat} onChange={e => setOutputFormat(e.target.value as OutputFormat)}>
                      <option value="png">PNG ({t('支持透明', 'Transparent')})</option>
                      <option value="webp">WebP</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </div>
                  {outputFormat !== 'png' && (
                    <div className="rp-row">
                      <label>{t('质量', 'Quality')}: {outputQuality}%</label>
                      <input type="range" min="50" max="100" value={outputQuality} onChange={e => setOutputQuality(Number(e.target.value))} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Global processing indicator */}
      {isProcessing && processingCount > 0 && (
        <div className="rp-global-progress">
          <Loader2 className="rp-spin" size={16} />
          {t(`正在处理 ${processingCount} 张图片...`, `Processing ${processingCount} image(s)...`)}
        </div>
      )}
    </div>
  )
}
