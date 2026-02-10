import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Upload, Download, X, Settings, Loader2, Sparkles, RotateCcw, RotateCw, Wand2, Eraser, Paintbrush, Trash2, CheckSquare } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { removeBackground, type Config as RemBgConfig } from '@imgly/background-removal'
import './RemovePhotos.css'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_BATCH_FILES = 10 // 批量处理最大文件数

type OutputFormat = 'png' | 'webp' | 'jpg'
type BackgroundType = 'transparent' | 'color' | 'image' | 'blur'

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

interface ProcessingState {
  originalImage: HTMLImageElement | null
  originalCanvas: HTMLCanvasElement | null
  maskCanvas: HTMLCanvasElement | null
  resultCanvas: HTMLCanvasElement | null
  mask: ImageData | null
  history: ImageData[]
  historyIndex: number
  // 画笔相关
  brushPath: { x: number; y: number }[]
  isDrawing: boolean
  lastPoint: { x: number; y: number } | null
}

interface BackgroundOptions {
  type: BackgroundType
  color: string
  imageFile: File | null
  blurAmount: number // 0-100
}

export default function RemovePhotos() {
  const { language } = useI18n()
  
  // 批量处理任务列表
  const [tasks, setTasks] = useState<ImageTask[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // AI 模型状态
  const [modelReady, setModelReady] = useState(false)
  const [modelProgress, setModelProgress] = useState('')
  
  // 当前选中任务的状态
  const currentTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId])
  const [compareSlider, setCompareSlider] = useState(50)
  const [showBrushTool, setShowBrushTool] = useState(false)
  const [showInpaintTool, setShowInpaintTool] = useState(false)
  const [inpaintMode, setInpaintMode] = useState<'erase' | 'blur'>('erase')
  const [inpaintBlur, setInpaintBlur] = useState(25)

  // 处理状态（每个任务独立）
  const stateRef = useRef<ProcessingState>({
    originalImage: null,
    originalCanvas: null,
    maskCanvas: null,
    resultCanvas: null,
    mask: null,
    history: [],
    historyIndex: -1,
    brushPath: [],
    isDrawing: false,
    lastPoint: null
  })

  // 设置
  const [edgeFeather, setEdgeFeather] = useState(2) // 0-10
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png')
  const [outputQuality, setOutputQuality] = useState(95) // 50-100
  const [backgroundOptions, setBackgroundOptions] = useState<BackgroundOptions>({
    type: 'transparent',
    color: '#ffffff',
    imageFile: null,
    blurAmount: 50
  })
  const [defringeEdges, setDefringeEdges] = useState(true)

  // 画笔设置
  const [brushSize, setBrushSize] = useState(20)
  const [brushMode, setBrushMode] = useState<'add' | 'remove'>('remove')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const inpaintCanvasRef = useRef<HTMLCanvasElement>(null)
  const inpaintStateRef = useRef({ isDrawing: false, lastPoint: null as { x: number; y: number } | null })

  // 批量文件上传
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return

    const fileArray = Array.from(uploadedFiles)
    
    // 检查文件数量限制
    if (tasks.length + fileArray.length > MAX_BATCH_FILES) {
      alert(
        language === 'zh-CN' 
          ? `最多只能处理 ${MAX_BATCH_FILES} 张图片`
          : `Maximum ${MAX_BATCH_FILES} images allowed`
      )
      return
    }

    const newTasks: ImageTask[] = []

    for (const uploadedFile of fileArray) {
      if (!uploadedFile.type.startsWith('image/')) {
        alert(
          language === 'zh-CN' 
            ? `不是图片文件: ${uploadedFile.name}`
            : `Not an image file: ${uploadedFile.name}`
        )
        continue
      }

      if (uploadedFile.size > MAX_FILE_SIZE) {
        alert(
          language === 'zh-CN' 
            ? `文件过大（最大 20MB）: ${uploadedFile.name}`
            : `File too large (max 20MB): ${uploadedFile.name}`
        )
        continue
      }

      const taskId = `${Date.now()}-${Math.random()}`
      const preview = URL.createObjectURL(uploadedFile)

      // 加载图像
      const img = new Image()
      img.onload = () => {
        setTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, originalImage: img } : t
        ))
      }
      img.src = preview

      newTasks.push({
        id: taskId,
        file: uploadedFile,
        preview,
        originalImage: null,
        mask: null,
        result: null,
        resultUrl: null,
        status: 'pending',
        progress: 0,
        history: [],
        historyIndex: -1
      })
    }

    setTasks(prev => [...prev, ...newTasks])
    
    // 自动选中第一个任务
    if (newTasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(newTasks[0].id)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [language, tasks.length, selectedTaskId])

  // 重置处理状态
  const resetProcessing = useCallback(() => {
    stateRef.current.mask = null
    stateRef.current.history = []
    stateRef.current.historyIndex = -1
    stateRef.current.brushPath = []
    stateRef.current.isDrawing = false
    stateRef.current.lastPoint = null
    setCompareSlider(50)
  }, [])

  // 应用背景到任务（前置以避免 TDZ）
  const applyBackgroundToTask = useCallback(async (task: ImageTask, mask: ImageData): Promise<{ blob: Blob; url: string }> => {
    if (!task.originalImage) throw new Error('Original image not found')

    const img = task.originalImage
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!

    // 先绘制原始图片
    ctx.drawImage(img, 0, 0)
    const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // 绘制背景
    if (backgroundOptions.type === 'transparent') {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    } else if (backgroundOptions.type === 'color') {
      ctx.fillStyle = backgroundOptions.color
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else if (backgroundOptions.type === 'blur') {
      const blurred = applyBlur(originalImageData, backgroundOptions.blurAmount)
      ctx.putImageData(blurred, 0, 0)
    } else if (backgroundOptions.type === 'image' && backgroundOptions.imageFile) {
      const bgImg = new Image()
      await new Promise((resolve, reject) => {
        bgImg.onload = resolve
        bgImg.onerror = reject
        bgImg.src = URL.createObjectURL(backgroundOptions.imageFile!)
      })
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height)
    }

    const maskData = mask.data
    const resultData = new ImageData(canvas.width, canvas.height)
    const backgroundData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const bgColor = defringeEdges ? estimateBackgroundColor(originalImageData) : null

    for (let i = 0; i < originalImageData.data.length; i += 4) {
      const maskAlpha = maskData[i + 3] / 255
      if (backgroundOptions.type === 'transparent') {
        resultData.data[i] = originalImageData.data[i]
        resultData.data[i + 1] = originalImageData.data[i + 1]
        resultData.data[i + 2] = originalImageData.data[i + 2]
        resultData.data[i + 3] = Math.round(originalImageData.data[i + 3] * maskAlpha)
        if (defringeEdges && bgColor) {
          const a = resultData.data[i + 3] / 255
          if (a > 0 && a < 1) {
            resultData.data[i] = clampColor((resultData.data[i] - bgColor.r * (1 - a)) / a)
            resultData.data[i + 1] = clampColor((resultData.data[i + 1] - bgColor.g * (1 - a)) / a)
            resultData.data[i + 2] = clampColor((resultData.data[i + 2] - bgColor.b * (1 - a)) / a)
          } else if (a === 0) {
            resultData.data[i] = 0
            resultData.data[i + 1] = 0
            resultData.data[i + 2] = 0
          }
        }
      } else {
        const fgAlpha = maskAlpha
        const bgAlpha = 1 - fgAlpha
        resultData.data[i] = Math.round(originalImageData.data[i] * fgAlpha + backgroundData.data[i] * bgAlpha)
        resultData.data[i + 1] = Math.round(originalImageData.data[i + 1] * fgAlpha + backgroundData.data[i + 1] * bgAlpha)
        resultData.data[i + 2] = Math.round(originalImageData.data[i + 2] * fgAlpha + backgroundData.data[i + 2] * bgAlpha)
        resultData.data[i + 3] = Math.round(originalImageData.data[i + 3] * fgAlpha + backgroundData.data[i + 3] * bgAlpha)
      }
    }

    ctx.putImageData(resultData, 0, 0)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          resolve({ blob, url })
        }
      }, `image/${outputFormat}`, outputFormat === 'png' ? undefined : outputQuality / 100)
    })
  }, [backgroundOptions, outputFormat, outputQuality, defringeEdges])

  // 遮罩变更时更新结果
  const updateTaskResultWithMask = useCallback(async (taskId: string, mask: ImageData) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || !task.originalImage) return

    const featheredMask = applyFeathering(mask, task.originalImage.width, task.originalImage.height, edgeFeather)
    const result = await applyBackgroundToTask(task, featheredMask)

    setTasks(prev => prev.map(t => 
      t.id === taskId
        ? (() => {
            if (t.resultUrl) URL.revokeObjectURL(t.resultUrl)
            return { ...t, mask: featheredMask, result: result.blob, resultUrl: result.url }
          })()
        : t
    ))
  }, [tasks, edgeFeather, applyBackgroundToTask])

  // ========== AI 背景去除（@imgly/background-removal） ==========
  const removeBackgroundAI = useCallback(async (task: ImageTask): Promise<ImageData | null> => {
    if (!task.originalImage) return null

    try {
      const img = task.originalImage

      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, progress: 10, progressMessage: language === 'zh-CN' ? '正在加载 AI 模型...' : 'Loading AI model...' } : t
      ))

      // 将 HTMLImageElement 转为 Blob 以供 @imgly/background-removal
      const inputCanvas = document.createElement('canvas')
      inputCanvas.width = img.width
      inputCanvas.height = img.height
      const inputCtx = inputCanvas.getContext('2d')!
      inputCtx.drawImage(img, 0, 0)
      const inputBlob: Blob = await new Promise((resolve) => {
        inputCanvas.toBlob((b) => resolve(b!), 'image/png')
      })

      const config: Partial<RemBgConfig> = {
        output: {
          format: 'image/png' as const,
          quality: 1.0,
        },
        progress: (key: string, current: number, total: number) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0
          let msg = ''
          if (key.includes('fetch') || key.includes('download')) {
            msg = language === 'zh-CN' ? `下载模型中... ${pct}%` : `Downloading model... ${pct}%`
          } else if (key.includes('compute') || key.includes('inference')) {
            msg = language === 'zh-CN' ? `AI 推理中... ${pct}%` : `AI inference... ${pct}%`
          } else {
            msg = language === 'zh-CN' ? `处理中... ${pct}%` : `Processing... ${pct}%`
          }
          setModelProgress(msg)
          const overallProgress = 10 + Math.round(pct * 0.7) // 10-80
          setTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, progress: overallProgress, progressMessage: msg } : t
          ))
        }
      }

      // 调用 AI 去背景
      const resultBlob = await removeBackground(inputBlob, config)
      setModelReady(true)

      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, progress: 85, progressMessage: language === 'zh-CN' ? '生成遮罩...' : 'Generating mask...' } : t
      ))

      // 从 AI 结果中提取 alpha 通道作为 mask
      const resultImg = new Image()
      await new Promise<void>((resolve, reject) => {
        resultImg.onload = () => resolve()
        resultImg.onerror = reject
        resultImg.src = URL.createObjectURL(resultBlob)
      })

      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = img.width
      maskCanvas.height = img.height
      const maskCtx = maskCanvas.getContext('2d')!
      maskCtx.drawImage(resultImg, 0, 0, img.width, img.height)
      const resultImageData = maskCtx.getImageData(0, 0, img.width, img.height)

      // 提取 alpha 通道创建 mask（白色=前景，黑色=背景）
      const mask = new ImageData(img.width, img.height)
      for (let i = 0; i < resultImageData.data.length; i += 4) {
        const alpha = resultImageData.data[i + 3]
        mask.data[i] = alpha
        mask.data[i + 1] = alpha
        mask.data[i + 2] = alpha
        mask.data[i + 3] = alpha
      }

      URL.revokeObjectURL(resultImg.src)
      return mask
    } catch (err) {
      console.error('AI background removal failed:', err)
      return null
    }
  }, [language])

  // ========== 画笔功能 ==========
  const initBrushCanvas = useCallback(() => {
    if (!maskCanvasRef.current || !currentTask?.originalImage) return

    const canvas = maskCanvasRef.current
    const img = currentTask.originalImage
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    
    // 绘制当前遮罩
    if (currentTask.mask) {
      ctx.putImageData(currentTask.mask, 0, 0)
    }
  }, [currentTask])

  const handleBrushStart = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!maskCanvasRef.current || !currentTask) return

    const canvas = maskCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    stateRef.current.isDrawing = true
    stateRef.current.lastPoint = { x, y }
    stateRef.current.brushPath = [{ x, y }]

    drawBrushStroke(x, y, x, y)
  }, [currentTask])

  const handleBrushMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!stateRef.current.isDrawing || !maskCanvasRef.current || !currentTask) return

    const canvas = maskCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    if (stateRef.current.lastPoint) {
      drawBrushStroke(stateRef.current.lastPoint.x, stateRef.current.lastPoint.y, x, y)
      stateRef.current.lastPoint = { x, y }
      stateRef.current.brushPath.push({ x, y })
    }
  }, [currentTask])

  const handleBrushEnd = useCallback(() => {
    if (!stateRef.current.isDrawing || !maskCanvasRef.current || !currentTask) return

    stateRef.current.isDrawing = false
    
    // 保存到历史记录
    const canvas = maskCanvasRef.current
    const mask = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    
    setTasks(prev => prev.map(t => {
      if (t.id === currentTask.id) {
        const newHistory = [...t.history.slice(0, t.historyIndex + 1), mask]
        return {
          ...t,
          mask,
          history: newHistory,
          historyIndex: newHistory.length - 1
        }
      }
      return t
    }))

    updateTaskResultWithMask(currentTask.id, mask)

    stateRef.current.brushPath = []
    stateRef.current.lastPoint = null
  }, [currentTask, updateTaskResultWithMask])

  const drawBrushStroke = (x1: number, y1: number, x2: number, y2: number) => {
    if (!maskCanvasRef.current) return

    const ctx = maskCanvasRef.current.getContext('2d')!
    ctx.globalCompositeOperation = brushMode === 'add' ? 'source-over' : 'destination-out'
    ctx.strokeStyle = brushMode === 'add' ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 1)'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // ========== Inpainting 画布绘制 ==========
  const initInpaintCanvas = useCallback(() => {
    if (!inpaintCanvasRef.current || !currentTask?.originalImage) return

    const canvas = inpaintCanvasRef.current
    const img = currentTask.originalImage
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'
    ctx.lineWidth = brushSize
  }, [currentTask, brushSize])

  const handleInpaintStart = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inpaintCanvasRef.current || !currentTask) return

    const canvas = inpaintCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    inpaintStateRef.current.isDrawing = true
    inpaintStateRef.current.lastPoint = { x, y }

    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [currentTask])

  const handleInpaintMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inpaintCanvasRef.current || !inpaintStateRef.current.isDrawing) return
    const canvas = inpaintCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    const ctx = canvas.getContext('2d')!
    ctx.lineWidth = brushSize
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'
    ctx.lineTo(x, y)
    ctx.stroke()
    inpaintStateRef.current.lastPoint = { x, y }
  }, [brushSize])

  const applyInpaintMask = useCallback(async (task: ImageTask, paintMask: ImageData) => {
    if (!task.originalImage) return

    const img = task.originalImage
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!

    // 如果已有结果，用结果作为基底，否则用原图套用当前遮罩结果
    if (task.resultUrl) {
      const baseImg = new Image()
      await new Promise((resolve, reject) => {
        baseImg.onload = resolve
        baseImg.onerror = reject
        baseImg.src = task.resultUrl!
      })
      ctx.drawImage(baseImg, 0, 0)
    } else {
      ctx.drawImage(img, 0, 0)
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const baseData = imageData.data
    const maskData = paintMask.data

    if (inpaintMode === 'erase') {
      for (let i = 0; i < maskData.length; i += 4) {
        if (maskData[i + 3] > 10) {
          baseData[i + 3] = 0
        }
      }
    } else {
      const blurred = applyBlur(imageData, inpaintBlur)
      const blurredData = blurred.data
      for (let i = 0; i < maskData.length; i += 4) {
        if (maskData[i + 3] > 10) {
          baseData[i] = blurredData[i]
          baseData[i + 1] = blurredData[i + 1]
          baseData[i + 2] = blurredData[i + 2]
          baseData[i + 3] = blurredData[i + 3]
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      setTasks(prev => prev.map(t =>
        t.id === task.id
          ? (() => {
              if (t.resultUrl) URL.revokeObjectURL(t.resultUrl)
              return { ...t, result: blob, resultUrl: url }
            })()
          : t
      ))
    }, `image/${outputFormat}`, outputFormat === 'png' ? undefined : outputQuality / 100)
  }, [inpaintMode, inpaintBlur, outputFormat, outputQuality])

  const handleInpaintEnd = useCallback(async () => {
    if (!inpaintCanvasRef.current || !currentTask) return
    inpaintStateRef.current.isDrawing = false
    const canvas = inpaintCanvasRef.current
    const mask = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    await applyInpaintMask(currentTask, mask)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [currentTask, applyInpaintMask])

  // 批量处理所有待处理任务
  const processBatch = useCallback(async () => {
    const pendingTasks = tasks.filter(t => t.status === 'pending')
    if (pendingTasks.length === 0) return

    setIsProcessing(true)

    for (const task of pendingTasks) {
      try {
        await processSingleTask(task)
      } catch (err) {
        console.error(`Failed to process ${task.file.name}:`, err)
        setTasks(prev => prev.map(t => 
          t.id === task.id 
            ? { ...t, status: 'failed', progressMessage: err instanceof Error ? err.message : String(err) }
            : t
        ))
      }
    }

    setIsProcessing(false)
  }, [tasks])

  // 处理单个任务（使用 AI 去背景）
  const processSingleTask = useCallback(async (task: ImageTask) => {
    if (!task.originalImage) return

    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, status: 'processing', progress: 0 } : t
    ))

    // 使用 AI 去背景
    const mask = await removeBackgroundAI(task)

    if (!mask) {
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'failed', progressMessage: language === 'zh-CN' ? '处理失败' : 'Processing failed' } : t
      ))
      return
    }

    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, progress: 90, progressMessage: language === 'zh-CN' ? '应用背景...' : 'Applying background...' } : t
    ))

    // 应用边缘羽化
    const featheredMask = applyFeathering(
      mask,
      task.originalImage.width,
      task.originalImage.height,
      edgeFeather
    )

    // 应用背景并生成结果
    const result = await applyBackgroundToTask(task, featheredMask)

    setTasks(prev => prev.map(t => 
      t.id === task.id 
        ? {
            ...t,
            status: 'completed',
            mask: featheredMask,
            result: result.blob,
            resultUrl: result.url,
            progress: 100,
            progressMessage: language === 'zh-CN' ? '完成！' : 'Completed!',
            history: [featheredMask],
            historyIndex: 0
          }
        : t
    ))
  }, [edgeFeather, language, removeBackgroundAI])

  const clampColor = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

  const estimateBackgroundColor = (imageData: ImageData) => {
    const { data, width, height } = imageData
    const step = Math.max(1, Math.floor(Math.min(width, height) / 20))
    let r = 0
    let g = 0
    let b = 0
    let count = 0

    const sample = (x: number, y: number) => {
      const idx = (y * width + x) * 4
      r += data[idx]
      g += data[idx + 1]
      b += data[idx + 2]
      count++
    }

    for (let x = 0; x < width; x += step) {
      sample(x, 0)
      sample(x, height - 1)
    }
    for (let y = 0; y < height; y += step) {
      sample(0, y)
      sample(width - 1, y)
    }

    return {
      r: count ? r / count : 255,
      g: count ? g / count : 255,
      b: count ? b / count : 255
    }
  }

  // 应用边缘羽化
  const applyFeathering = (mask: ImageData, width: number, height: number, featherRadius: number): ImageData => {
    if (featherRadius === 0) return mask

    const feathered = new ImageData(width, height)
    const maskData = mask.data
    const featheredData = feathered.data

    const radius = Math.max(1, Math.floor(featherRadius))

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const centerAlpha = maskData[idx + 3]

        // 仅在边缘带做模糊，实心区域直接复制，加速且减少过度平滑
        if (centerAlpha === 0 || centerAlpha === 255) {
          featheredData[idx] = maskData[idx]
          featheredData[idx + 1] = maskData[idx + 1]
          featheredData[idx + 2] = maskData[idx + 2]
          featheredData[idx + 3] = maskData[idx + 3]
          continue
        }

        let sum = 0
        let count = 0

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist <= radius) {
                const weight = 1 - dist / radius
                sum += maskData[nIdx + 3] * weight
                count += weight
              }
            }
          }
        }

        const alpha = count > 0 ? Math.round(sum / count) : centerAlpha
        featheredData[idx] = maskData[idx]
        featheredData[idx + 1] = maskData[idx + 1]
        featheredData[idx + 2] = maskData[idx + 2]
        featheredData[idx + 3] = alpha
      }
    }

    return feathered
  }


  // 模糊效果
  const applyBlur = (imageData: ImageData, radius: number): ImageData => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const blurred = new ImageData(width, height)
    const blurredData = blurred.data

    const r = Math.max(1, Math.floor(radius / 10))

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0

        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const idx = (ny * width + nx) * 4
              rSum += data[idx]
              gSum += data[idx + 1]
              bSum += data[idx + 2]
              aSum += data[idx + 3]
              count++
            }
          }
        }

        const idx = (y * width + x) * 4
        blurredData[idx] = Math.round(rSum / count)
        blurredData[idx + 1] = Math.round(gSum / count)
        blurredData[idx + 2] = Math.round(bSum / count)
        blurredData[idx + 3] = Math.round(aSum / count)
      }
    }

    return blurred
  }


  // 背景选项或边缘羽化变化时重新应用（针对当前任务）
  useEffect(() => {
    if (currentTask && currentTask.mask && currentTask.originalImage) {
      const featheredMask = applyFeathering(
        currentTask.history[0] || currentTask.mask,
        currentTask.originalImage.width,
        currentTask.originalImage.height,
        edgeFeather
      )
      applyBackgroundToTask(currentTask, featheredMask).then(result => {
        setTasks(prev => prev.map(t => 
          t.id === currentTask.id 
            ? { ...t, mask: featheredMask, result: result.blob, resultUrl: result.url }
            : t
        ))
      })
    }
  }, [backgroundOptions, edgeFeather, currentTask, applyBackgroundToTask])

  useEffect(() => {
    if (showBrushTool) {
      initBrushCanvas()
    }
  }, [showBrushTool, currentTask, initBrushCanvas])

  useEffect(() => {
    if (showInpaintTool) {
      initInpaintCanvas()
    }
  }, [showInpaintTool, currentTask, initInpaintCanvas])

  return (
    <div className="remove-photos">
      {/* Header */}
      <div className="remove-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Wand2 />
            {language === 'zh-CN' ? '智能去背景' : 'Remove Background'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? 'AI 驱动的智能去背景工具：自动识别前景、去除背景、替换背景。支持透明背景、纯色背景、图片背景和模糊背景。100% 本地处理，保护隐私。'
              : 'AI-powered background removal tool: Auto-detect foreground, remove background, replace background. Supports transparent, solid color, image, and blur backgrounds. 100% local processing, privacy protected.'}
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />
        
        {tasks.length === 0 ? (
          <div
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={48} />
            <span>{language === 'zh-CN' ? '上传图片（支持批量）' : 'Upload Images (Batch Supported)'}</span>
            <small>
              {language === 'zh-CN' 
                ? `支持 JPG, PNG, WebP 等格式，最多 ${MAX_BATCH_FILES} 张，每张最大 20MB`
                : `Supports JPG, PNG, WebP, max ${MAX_BATCH_FILES} images, 20MB each`}
            </small>
          </div>
        ) : (
          <>
            {/* 任务列表 */}
            <div className="task-list">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`task-item ${task.id === selectedTaskId ? 'active' : ''} ${task.status}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className="task-preview">
                    <img src={task.preview} alt={task.file.name} />
                    {task.status === 'processing' && (
                      <div className="task-progress-overlay">
                        <Loader2 className="spinner" size={20} />
                        <div className="task-progress-bar">
                          <div className="task-progress-fill" style={{ width: `${task.progress}%` }}></div>
                        </div>
                        <span>{task.progressMessage || `${task.progress}%`}</span>
                      </div>
                    )}
                    {task.status === 'completed' && (
                      <div className="task-completed-badge">
                        <CheckSquare size={16} />
                      </div>
                    )}
                  </div>
                  <div className="task-info">
                    <span className="task-name">{task.file.name}</span>
                    <span className="task-size">{(task.file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <button
                    className="task-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTasks(prev => prev.filter(t => t.id !== task.id))
                      if (selectedTaskId === task.id) {
                        setSelectedTaskId(tasks.find(t => t.id !== task.id)?.id || null)
                      }
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* 主预览区域 */}
            {currentTask && (
              <div className="preview-section">
                {/* 对比预览 - 专业裁切滑块 */}
                {currentTask.resultUrl && (
                  <div className="compare-container">
                    <div
                      className="compare-wrapper"
                      style={{ position: 'relative', overflow: 'hidden', cursor: 'ew-resize' }}
                    >
                      {/* 原图（全宽显示） */}
                      <img
                        src={currentTask.preview}
                        alt="Original"
                        className="compare-image original"
                        style={{ width: '100%', display: 'block' }}
                      />
                      {/* 结果图（用 clip-path 裁切左侧部分） */}
                      <img
                        src={currentTask.resultUrl}
                        alt="Result"
                        className="compare-image result"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          display: 'block',
                          clipPath: `inset(0 ${100 - compareSlider}% 0 0)`
                        }}
                      />
                      {/* 滑块线 */}
                      <div
                        className="compare-line"
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${compareSlider}%`,
                          width: 3,
                          backgroundColor: '#fff',
                          boxShadow: '0 0 6px rgba(0,0,0,.5)',
                          zIndex: 3,
                          pointerEvents: 'none'
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: '#fff',
                          boxShadow: '0 2px 8px rgba(0,0,0,.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 'bold',
                          color: '#333',
                          userSelect: 'none'
                        }}>⇔</div>
                      </div>
                      {/* 标签 */}
                      <span style={{
                        position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.6)',
                        color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, zIndex: 4
                      }}>{language === 'zh-CN' ? '结果' : 'Result'}</span>
                      <span style={{
                        position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)',
                        color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, zIndex: 4
                      }}>{language === 'zh-CN' ? '原图' : 'Original'}</span>
                      {/* 透明输入滑块覆盖 */}
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={compareSlider}
                        onChange={(e) => setCompareSlider(Number(e.target.value))}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'ew-resize',
                          zIndex: 5,
                          margin: 0
                        }}
                      />
                    </div>

                    {/* 终态预览（暗色棋盘背景） */}
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid #2f3136',
                        backgroundImage:
                          'linear-gradient(45deg, #2b2b2b 25%, transparent 25%), linear-gradient(-45deg, #2b2b2b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2b2b2b 75%), linear-gradient(-45deg, transparent 75%, #2b2b2b 75%)',
                        backgroundColor: '#1f1f1f',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 14, color: '#e5e7eb' }}>
                          {language === 'zh-CN' ? '最终预览（透明背景）' : 'Final Preview (Transparent)'}
                        </strong>
                        <small style={{ color: '#9ca3af' }}>{outputFormat.toUpperCase()}</small>
                      </div>
                      <img
                        src={currentTask.resultUrl}
                        alt="Result preview"
                        style={{
                          width: '100%',
                          maxHeight: 360,
                          objectFit: 'contain',
                          display: 'block'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 单图预览 + 画笔/Inpainting 画布 */}
                {!currentTask.resultUrl && (
                  <div className="single-preview-container">
                    <div className="single-preview">
                      <img src={currentTask.preview} alt="Preview" />
                      {/* 画笔画布 */}
                      {showBrushTool && currentTask.mask && (
                        <canvas
                          ref={maskCanvasRef}
                          className="brush-canvas"
                          onMouseDown={handleBrushStart}
                          onMouseMove={handleBrushMove}
                          onMouseUp={handleBrushEnd}
                          onMouseLeave={handleBrushEnd}
                        />
                      )}
                      {/* Inpainting 画布 */}
                      {showInpaintTool && (
                        <canvas
                          ref={inpaintCanvasRef}
                          className="inpaint-canvas"
                          onMouseDown={handleInpaintStart}
                          onMouseMove={handleInpaintMove}
                          onMouseUp={handleInpaintEnd}
                          onMouseLeave={handleInpaintEnd}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="preview-actions">

                  {/* 批量处理按钮 */}
                  {tasks.filter(t => t.status === 'pending').length > 0 && (
                    <button
                      className="action-btn primary"
                      onClick={processBatch}
                      disabled={isProcessing}
                    >
                      <Sparkles size={16} />
                      {language === 'zh-CN' 
                        ? `批量处理 (${tasks.filter(t => t.status === 'pending').length})`
                        : `Process Batch (${tasks.filter(t => t.status === 'pending').length})`}
                    </button>
                  )}

                  {/* 单图处理按钮 */}
                  {currentTask && currentTask.status === 'pending' && (
                    <button
                      className="action-btn primary"
                      onClick={async () => {
                        if (currentTask && currentTask.originalImage) {
                          await processSingleTask(currentTask)
                        }
                      }}
                      disabled={isProcessing || !currentTask.originalImage}
                    >
                      <Sparkles size={16} />
                      {language === 'zh-CN' ? '处理此图片' : 'Process This Image'}
                    </button>
                  )}
                  
                  {/* 如果没有待处理任务，显示提示 */}
                  {tasks.length > 0 && tasks.filter(t => t.status === 'pending').length === 0 && tasks.filter(t => t.status === 'processing').length === 0 && (
                    <div className="no-pending-tasks">
                      {language === 'zh-CN' 
                        ? '所有任务已完成！可以下载结果。'
                        : 'All tasks completed! You can download the results.'}
                    </div>
                  )}

                  {/* 画笔工具 */}
                  {currentTask && currentTask.mask && (
                    <button
                      className={`action-btn ${showBrushTool ? 'active' : ''}`}
                      onClick={() => {
                        setShowBrushTool(!showBrushTool)
                        setShowInpaintTool(false)
                        if (!showBrushTool) {
                          setTimeout(initBrushCanvas, 100)
                        }
                      }}
                      title={language === 'zh-CN' ? '画笔工具' : 'Brush Tool'}
                    >
                      <Paintbrush size={16} />
                    </button>
                  )}

                  {/* Inpainting 工具 */}
                  {currentTask && (
                    <button
                      className={`action-btn ${showInpaintTool ? 'active' : ''}`}
                      onClick={async () => {
                        const next = !showInpaintTool
                        setShowInpaintTool(next)
                        setShowBrushTool(false)
                        if (next) {
                          setTimeout(() => initInpaintCanvas(), 50)
                        }
                      }}
                      title={language === 'zh-CN' ? '物体擦除' : 'Remove Object'}
                    >
                      <Eraser size={16} />
                    </button>
                  )}

                  {/* 撤销/重做 */}
                  {currentTask && currentTask.history.length > 0 && (
                    <>
                      <button
                        className="action-btn"
                        onClick={() => {
                          if (currentTask && currentTask.historyIndex > 0) {
                            const newIndex = currentTask.historyIndex - 1
                            const newMask = currentTask.history[newIndex]
                            setTasks(prev => prev.map(t => 
                              t.id === currentTask.id 
                                ? { ...t, mask: newMask, historyIndex: newIndex }
                                : t
                            ))
                            updateTaskResultWithMask(currentTask.id, newMask)
                          }
                        }}
                        disabled={!currentTask || currentTask.historyIndex <= 0}
                        title={language === 'zh-CN' ? '撤销' : 'Undo'}
                      >
                        <RotateCcw size={16} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => {
                          if (currentTask && currentTask.historyIndex < currentTask.history.length - 1) {
                            const newIndex = currentTask.historyIndex + 1
                            const newMask = currentTask.history[newIndex]
                            setTasks(prev => prev.map(t => 
                              t.id === currentTask.id 
                                ? { ...t, mask: newMask, historyIndex: newIndex }
                                : t
                            ))
                            updateTaskResultWithMask(currentTask.id, newMask)
                          }
                        }}
                        disabled={!currentTask || currentTask.historyIndex >= currentTask.history.length - 1}
                        title={language === 'zh-CN' ? '重做' : 'Redo'}
                      >
                        <RotateCw size={16} />
                      </button>
                    </>
                  )}

                  {/* 下载按钮 */}
                  {currentTask && currentTask.resultUrl && (
                    <button
                      className="action-btn"
                      onClick={() => {
                        if (currentTask?.result) {
                          const ext = outputFormat
                          const fileName = currentTask.file.name.replace(/\.[^/.]+$/, '') + `_removed.${ext}`
                          saveAs(currentTask.result, fileName)
                        }
                      }}
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                    >
                      <Download size={16} />
                    </button>
                  )}

                  {/* 批量下载 */}
                  {tasks.filter(t => t.status === 'completed' && t.result).length > 0 && (
                    <button
                      className="action-btn"
                      onClick={async () => {
                        const completedTasks = tasks.filter(t => t.status === 'completed' && t.result)
                        if (completedTasks.length === 1) {
                          // 单个文件直接下载
                          if (completedTasks[0].result) {
                            const ext = outputFormat
                            const fileName = completedTasks[0].file.name.replace(/\.[^/.]+$/, '') + `_removed.${ext}`
                            saveAs(completedTasks[0].result, fileName)
                          }
                        } else {
                          // 多个文件打包下载
                          const zip = new JSZip()
                          completedTasks.forEach((task) => {
                            if (task.result) {
                              const ext = outputFormat
                              const fileName = task.file.name.replace(/\.[^/.]+$/, '') + `_removed.${ext}`
                              zip.file(fileName, task.result)
                            }
                          })
                          const blob = await zip.generateAsync({ type: 'blob' })
                          saveAs(blob, 'removed_backgrounds.zip')
                        }
                      }}
                      title={language === 'zh-CN' ? '批量下载' : 'Download All'}
                    >
                      <Download size={16} />
                      {tasks.filter(t => t.status === 'completed' && t.result).length}
                    </button>
                  )}

                  {/* 清除所有 */}
                  <button
                    className="action-btn"
                    onClick={() => {
                      tasks.forEach(t => {
                        if (t.preview) URL.revokeObjectURL(t.preview)
                        if (t.resultUrl) URL.revokeObjectURL(t.resultUrl)
                      })
                      setTasks([])
                      setSelectedTaskId(null)
                      resetProcessing()
                    }}
                    title={language === 'zh-CN' ? '清除所有' : 'Clear All'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Settings Section */}
      {tasks.length > 0 && (
        <div className="settings-section">
          <h3>
            <Settings />
            {language === 'zh-CN' ? '设置' : 'Settings'}
          </h3>

          <div className="settings-grid">
            {/* AI 模型状态 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? 'AI 引擎' : 'AI Engine'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: modelReady ? '#22c55e' : isProcessing ? '#f59e0b' : '#6b7280'
                }}></span>
                <span style={{ fontSize: 13, color: '#d1d5db' }}>
                  {modelReady
                    ? (language === 'zh-CN' ? '模型已就绪' : 'Model ready')
                    : isProcessing
                      ? (modelProgress || (language === 'zh-CN' ? '加载中...' : 'Loading...'))
                      : (language === 'zh-CN' ? '首次处理时自动加载' : 'Auto-loads on first process')}
                </span>
              </div>
              <small>
                {language === 'zh-CN'
                  ? '使用 ISNet 深度学习模型，100% 浏览器本地运行'
                  : 'Powered by ISNet deep learning model, 100% local in browser'}
              </small>
            </div>

            {/* 画笔设置 */}
            {showBrushTool && (
              <>
                <div className="setting-group">
                  <label>
                    {language === 'zh-CN' ? '画笔大小' : 'Brush Size'}: {brushSize}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                </div>
                <div className="setting-group">
                  <label>
                    {language === 'zh-CN' ? '画笔模式' : 'Brush Mode'}
                  </label>
                  <div className="brush-mode-selector">
                    <button
                      className={`brush-mode-btn ${brushMode === 'add' ? 'active' : ''}`}
                      onClick={() => setBrushMode('add')}
                    >
                      {language === 'zh-CN' ? '添加' : 'Add'}
                    </button>
                    <button
                      className={`brush-mode-btn ${brushMode === 'remove' ? 'active' : ''}`}
                      onClick={() => setBrushMode('remove')}
                    >
                      {language === 'zh-CN' ? '移除' : 'Remove'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {showInpaintTool && (
              <>
                <div className="setting-group">
                  <label>{language === 'zh-CN' ? '擦除模式' : 'Remove Mode'}</label>
                  <div className="brush-mode-selector">
                    <button
                      className={`brush-mode-btn ${inpaintMode === 'erase' ? 'active' : ''}`}
                      onClick={() => setInpaintMode('erase')}
                    >
                      {language === 'zh-CN' ? '区域透明' : 'Transparent'}
                    </button>
                    <button
                      className={`brush-mode-btn ${inpaintMode === 'blur' ? 'active' : ''}`}
                      onClick={() => setInpaintMode('blur')}
                    >
                      {language === 'zh-CN' ? '区域模糊' : 'Blur'}
                    </button>
                  </div>
                </div>
                {inpaintMode === 'blur' && (
                  <div className="setting-group">
                    <label>{language === 'zh-CN' ? '模糊程度' : 'Blur Strength'}: {inpaintBlur}</label>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      value={inpaintBlur}
                      onChange={(e) => setInpaintBlur(Number(e.target.value))}
                    />
                  </div>
                )}
              </>
            )}

            {/* 边缘羽化 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '边缘羽化' : 'Edge Feathering'}: {edgeFeather}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                value={edgeFeather}
                onChange={(e) => setEdgeFeather(Number(e.target.value))}
                disabled={isProcessing}
              />
              <small>
                {language === 'zh-CN' 
                  ? '柔化边缘，数值越大边缘越柔和'
                  : 'Soften edges, higher value = softer edges'}
              </small>
            </div>

            {/* 背景类型 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '背景类型' : 'Background Type'}
              </label>
              <select
                value={backgroundOptions.type}
                onChange={(e) => setBackgroundOptions(prev => ({ 
                  ...prev, 
                  type: e.target.value as BackgroundType 
                }))}
                disabled={isProcessing}
              >
                <option value="transparent">
                  {language === 'zh-CN' ? '透明' : 'Transparent'}
                </option>
                <option value="color">
                  {language === 'zh-CN' ? '纯色' : 'Solid Color'}
                </option>
                <option value="blur">
                  {language === 'zh-CN' ? '模糊' : 'Blur'}
                </option>
                <option value="image">
                  {language === 'zh-CN' ? '图片' : 'Image'}
                </option>
              </select>
            </div>

            {/* 边缘去污 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '边缘去污' : 'Edge Defringe'}
              </label>
              <div className="brush-mode-selector">
                <button
                  className={`brush-mode-btn ${defringeEdges ? 'active' : ''}`}
                  onClick={() => setDefringeEdges(true)}
                  disabled={isProcessing}
                >
                  {language === 'zh-CN' ? '开启' : 'On'}
                </button>
                <button
                  className={`brush-mode-btn ${!defringeEdges ? 'active' : ''}`}
                  onClick={() => setDefringeEdges(false)}
                  disabled={isProcessing}
                >
                  {language === 'zh-CN' ? '关闭' : 'Off'}
                </button>
              </div>
              <small>
                {language === 'zh-CN'
                  ? '减少背景色溢出，利于后期商业合成'
                  : 'Reduces color spill on edges for cleaner compositing'}
              </small>
            </div>

            {/* 纯色背景 */}
            {backgroundOptions.type === 'color' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '背景颜色' : 'Background Color'}
                </label>
                <input
                  type="color"
                  value={backgroundOptions.color}
                  onChange={(e) => setBackgroundOptions(prev => ({ 
                    ...prev, 
                    color: e.target.value 
                  }))}
                  disabled={isProcessing}
                />
              </div>
            )}

            {/* 模糊背景 */}
            {backgroundOptions.type === 'blur' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '模糊程度' : 'Blur Amount'}: {backgroundOptions.blurAmount}
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={backgroundOptions.blurAmount}
                  onChange={(e) => setBackgroundOptions(prev => ({ 
                    ...prev, 
                    blurAmount: Number(e.target.value) 
                  }))}
                  disabled={isProcessing}
                />
              </div>
            )}

            {/* 图片背景 */}
            {backgroundOptions.type === 'image' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '背景图片' : 'Background Image'}
                </label>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setBackgroundOptions(prev => ({ ...prev, imageFile: file }))
                    }
                  }}
                  style={{ display: 'none' }}
                  disabled={isProcessing}
                />
                <button
                  className="upload-bg-btn"
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  {backgroundOptions.imageFile 
                    ? backgroundOptions.imageFile.name 
                    : (language === 'zh-CN' ? '选择图片' : 'Select Image')}
                </button>
              </div>
            )}

            {/* 输出格式 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '输出格式' : 'Output Format'}
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                disabled={isProcessing}
              >
                <option value="png">PNG (透明背景)</option>
                <option value="webp">WebP</option>
                <option value="jpg">JPG</option>
              </select>
            </div>

            {/* 输出质量 */}
            {outputFormat !== 'png' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '输出质量' : 'Output Quality'}: {outputQuality}
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={outputQuality}
                  onChange={(e) => setOutputQuality(Number(e.target.value))}
                  disabled={isProcessing}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
