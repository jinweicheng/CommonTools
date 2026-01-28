import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Upload, Download, X, Settings, Loader2, Sparkles, RotateCcw, RotateCw, Wand2, Eraser, Paintbrush, Trash2, CheckSquare, Zap } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import './RemovePhotos.css'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_BATCH_FILES = 10 // 批量处理最大文件数

type OutputFormat = 'png' | 'webp' | 'jpg'
type BackgroundType = 'transparent' | 'color' | 'image' | 'blur'
type ProcessingMode = 'auto' | 'manual' | 'ai' // 处理模式：自动、手动、AI

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
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('auto')
  
  // ONNX Runtime 状态
  const [onnxLoaded, setOnnxLoaded] = useState(false)
  const [onnxLoading, setOnnxLoading] = useState(false)
  const onnxSessionRef = useRef<any>(null)
  
  // 当前选中任务的状态
  const currentTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId])
  const [compareSlider, setCompareSlider] = useState(50)
  const [showBrushTool, setShowBrushTool] = useState(false)
  const [showInpaintTool, setShowInpaintTool] = useState(false)

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

  // 画笔设置
  const [brushSize, setBrushSize] = useState(20)
  const [brushMode, setBrushMode] = useState<'add' | 'remove'>('remove')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const inpaintCanvasRef = useRef<HTMLCanvasElement>(null)

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

  // ========== ONNX Runtime Web 加载 ==========
  const loadONNXRuntime = useCallback(async (): Promise<boolean> => {
    if (onnxLoaded || onnxLoading) return onnxLoaded

    setOnnxLoading(true)

    try {
      // 动态加载 ONNX Runtime Web（如果可用）
      // 注意：需要先安装 onnxruntime-web: npm install onnxruntime-web
      let onnx: any
      try {
        // @ts-ignore - 动态导入，可能不存在
        onnx = await import('onnxruntime-web')
      } catch (err) {
        console.warn('ONNX Runtime Web not installed. Install with: npm install onnxruntime-web')
        setOnnxLoading(false)
        setOnnxLoaded(false)
        alert(language === 'zh-CN' 
          ? 'ONNX Runtime Web 未安装。请先安装：npm install onnxruntime-web'
          : 'ONNX Runtime Web not installed. Please install: npm install onnxruntime-web')
        return false
      }
      
      // 检查 WebGPU 支持
      const hasWebGPU = 'gpu' in navigator
      const executionProvider = hasWebGPU ? 'webgpu' : 'wasm'

      // 加载预训练模型（这里使用示例模型 URL，实际需要提供真实的模型文件）
      // 注意：需要下载并部署实际的语义分割模型
      const modelUrl = '/models/rembg.onnx' // 示例路径

      try {
        const session = await onnx.InferenceSession.create(modelUrl, {
          executionProviders: [executionProvider]
        })
        onnxSessionRef.current = session
        setOnnxLoaded(true)
        setOnnxLoading(false)
        return true
      } catch (err) {
        console.warn('ONNX model not found, falling back to traditional method:', err)
        setOnnxLoaded(false)
        setOnnxLoading(false)
        return false
      }
    } catch (err) {
      console.warn('ONNX Runtime Web not available:', err)
      setOnnxLoaded(false)
      setOnnxLoading(false)
      return false
    }
  }, [onnxLoaded, onnxLoading])

  // ========== AI 分割（使用 ONNX Runtime） ==========
  const aiSegment = useCallback(async (task: ImageTask): Promise<ImageData | null> => {
    if (!task.originalImage || !onnxSessionRef.current) return null

    try {
      const img = task.originalImage
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      
      // 预处理：转换为模型输入格式
      const inputTensor = preprocessImage(imageData)
      
      // 运行推理
      const feeds = { input: inputTensor }
      const results = await onnxSessionRef.current.run(feeds)
      
      // 后处理：转换为遮罩
      const mask = postprocessMask(results.output, canvas.width, canvas.height)
      
      return mask
    } catch (err) {
      console.error('AI segmentation failed:', err)
      return null
    }
  }, [])

  // 图像预处理（转换为模型输入）
  const preprocessImage = (imageData: ImageData): any => {
    const { data, width, height } = imageData
    const input = new Float32Array(3 * width * height)
    
    // 归一化到 [0, 1] 并转换为 RGB
    for (let i = 0; i < width * height; i++) {
      input[i] = data[i * 4] / 255.0 // R
      input[width * height + i] = data[i * 4 + 1] / 255.0 // G
      input[2 * width * height + i] = data[i * 4 + 2] / 255.0 // B
    }
    
    return new (window as any).onnx.Tensor('float32', input, [1, 3, height, width])
  }

  // 后处理（转换为遮罩）
  const postprocessMask = (output: any, width: number, height: number): ImageData => {
    const mask = new ImageData(width, height)
    const outputData = output.data
    
    for (let i = 0; i < width * height; i++) {
      const value = outputData[i] > 0.5 ? 255 : 0
      mask.data[i * 4] = value
      mask.data[i * 4 + 1] = value
      mask.data[i * 4 + 2] = value
      mask.data[i * 4 + 3] = value
    }
    
    return mask
  }

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

    stateRef.current.brushPath = []
    stateRef.current.lastPoint = null
  }, [currentTask])

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

  // ========== Inpainting（物体擦除） ==========
  const performInpainting = useCallback(async (task: ImageTask, mask: ImageData): Promise<ImageData | null> => {
    if (!task.originalImage) return null

    try {
      const img = task.originalImage
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      
      // 使用简单的 Inpainting 算法（基于 Telea 算法）
      const result = inpaintTelea(imageData, mask, canvas.width, canvas.height)
      
      return result
    } catch (err) {
      console.error('Inpainting failed:', err)
      return null
    }
  }, [])

  // Telea Inpainting 算法（简化版）
  const inpaintTelea = (imageData: ImageData, mask: ImageData, width: number, height: number): ImageData => {
    const result = new ImageData(width, height)
    const imgData = imageData.data
    const maskData = mask.data
    const resultData = result.data

    // 复制原始数据
    for (let i = 0; i < imgData.length; i++) {
      resultData[i] = imgData[i]
    }

    // 找到需要修复的区域
    const toInpaint: { x: number; y: number }[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        if (maskData[idx + 3] > 128) { // 遮罩区域
          toInpaint.push({ x, y })
        }
      }
    }

    // 对每个需要修复的像素，使用周围已知像素的平均值
    const radius = 5
    for (const { x, y } of toInpaint) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 4
            if (maskData[nIdx + 3] < 128) { // 非遮罩区域
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist <= radius && dist > 0) {
                const weight = 1 / dist
                rSum += imgData[nIdx] * weight
                gSum += imgData[nIdx + 1] * weight
                bSum += imgData[nIdx + 2] * weight
                count += weight
              }
            }
          }
        }
      }

      if (count > 0) {
        const idx = (y * width + x) * 4
        resultData[idx] = Math.round(rSum / count)
        resultData[idx + 1] = Math.round(gSum / count)
        resultData[idx + 2] = Math.round(bSum / count)
        resultData[idx + 3] = imgData[idx + 3]
      }
    }

    return result
  }

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

  // 处理单个任务
  const processSingleTask = useCallback(async (task: ImageTask) => {
    if (!task.originalImage) return

    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, status: 'processing', progress: 0 } : t
    ))

    let mask: ImageData | null = null

    // 根据模式选择处理方法
    if (processingMode === 'ai' && onnxLoaded && onnxSessionRef.current) {
      // AI 分割
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, progress: 10, progressMessage: language === 'zh-CN' ? 'AI 分割中...' : 'AI segmenting...' } : t
      ))
      mask = await aiSegment(task)
    } else {
      // 传统方法
      mask = await removeBackgroundTraditional(task)
    }

    if (!mask) {
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'failed', progressMessage: 'Processing failed' } : t
      ))
      return
    }

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
  }, [processingMode, onnxLoaded, edgeFeather, language, aiSegment])

  // 传统去背景方法
  const removeBackgroundTraditional = useCallback(async (task: ImageTask): Promise<ImageData | null> => {
    if (!task.originalImage) return null

    const img = task.originalImage
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, progress: 20, progressMessage: language === 'zh-CN' ? '检测边缘...' : 'Detecting edges...' } : t
    ))

    // 1. 检测边缘
    const edges = detectEdges(imageData)
    
    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, progress: 40, progressMessage: language === 'zh-CN' ? '生成遮罩...' : 'Generating mask...' } : t
    ))

    // 2. 基于边缘和颜色相似度生成遮罩
    const mask = generateMask(imageData, edges)

    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, progress: 60, progressMessage: language === 'zh-CN' ? '优化遮罩...' : 'Refining mask...' } : t
    ))

    // 3. 优化遮罩（填充空洞、平滑边缘）
    const refinedMask = refineMask(mask, canvas.width, canvas.height)

    return refinedMask
  }, [language, edgeFeather])

  // 应用背景到任务
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
      // 透明背景，清除画布
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    } else if (backgroundOptions.type === 'color') {
      ctx.fillStyle = backgroundOptions.color
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else if (backgroundOptions.type === 'blur') {
      // 模糊原图作为背景
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

    // 绘制前景（应用遮罩）
    const maskData = mask.data
    const resultData = new ImageData(canvas.width, canvas.height)
    
    // 获取当前背景（如果有）
    const backgroundData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < originalImageData.data.length; i += 4) {
      const maskAlpha = maskData[i + 3] / 255
      
      if (backgroundOptions.type === 'transparent') {
        // 透明背景：只保留前景部分
        resultData.data[i] = originalImageData.data[i]
        resultData.data[i + 1] = originalImageData.data[i + 1]
        resultData.data[i + 2] = originalImageData.data[i + 2]
        resultData.data[i + 3] = Math.round(originalImageData.data[i + 3] * maskAlpha)
      } else {
        // 有背景：混合前景和背景
        const fgAlpha = maskAlpha
        const bgAlpha = 1 - fgAlpha
        
        resultData.data[i] = Math.round(
          originalImageData.data[i] * fgAlpha + backgroundData.data[i] * bgAlpha
        )
        resultData.data[i + 1] = Math.round(
          originalImageData.data[i + 1] * fgAlpha + backgroundData.data[i + 1] * bgAlpha
        )
        resultData.data[i + 2] = Math.round(
          originalImageData.data[i + 2] * fgAlpha + backgroundData.data[i + 2] * bgAlpha
        )
        resultData.data[i + 3] = Math.round(
          originalImageData.data[i + 3] * fgAlpha + backgroundData.data[i + 3] * bgAlpha
        )
      }
    }

    ctx.putImageData(resultData, 0, 0)

    // 转换为 Blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          resolve({ blob, url })
        }
      }, `image/${outputFormat}`, outputFormat === 'png' ? undefined : outputQuality / 100)
    })
  }, [backgroundOptions, outputFormat, outputQuality])

  // 边缘检测（Sobel 算子）
  const detectEdges = (imageData: ImageData): boolean[] => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const edges = new Array(width * height).fill(false)

    // Sobel 算子
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            const kernelIdx = (ky + 1) * 3 + (kx + 1)
            gx += gray * sobelX[kernelIdx]
            gy += gray * sobelY[kernelIdx]
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        edges[y * width + x] = magnitude > 30 // 阈值
      }
    }

    return edges
  }

  // 生成遮罩（基于边缘和颜色相似度）
  const generateMask = (imageData: ImageData, edges: boolean[]): ImageData => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const mask = new ImageData(width, height)
    const maskData = mask.data

    // 获取四个角的平均颜色（假设是背景）
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1]
    ]

    let bgR = 0, bgG = 0, bgB = 0
    for (const [x, y] of corners) {
      const idx = (y * width + x) * 4
      bgR += data[idx]
      bgG += data[idx + 1]
      bgB += data[idx + 2]
    }
    bgR /= 4
    bgG /= 4
    bgB /= 4

    // 生成遮罩
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // 计算与背景颜色的相似度（使用欧氏距离）
      const colorDiff = Math.sqrt(
        Math.pow(r - bgR, 2) + 
        Math.pow(g - bgG, 2) + 
        Math.pow(b - bgB, 2)
      )

      // 判断是否为背景
      let isBackground = false
      
      // 如果非常接近背景色（阈值 30），直接认为是背景
      if (colorDiff < 30) {
        isBackground = true
      } 
      // 如果颜色相似（阈值 80）且不在边缘上，也认为是背景
      else if (colorDiff < 80 && !edges[i / 4]) {
        isBackground = true
      }

      // 设置遮罩：背景 = 0（黑色），前景 = 255（白色）
      maskData[i] = isBackground ? 0 : 255
      maskData[i + 1] = isBackground ? 0 : 255
      maskData[i + 2] = isBackground ? 0 : 255
      maskData[i + 3] = isBackground ? 0 : 255
    }

    return mask
  }

  // 优化遮罩（填充空洞、平滑边缘）
  const refineMask = (mask: ImageData, width: number, height: number): ImageData => {
    const refined = new ImageData(width, height)
    const maskData = mask.data
    const refinedData = refined.data

    // 复制原始数据
    for (let i = 0; i < maskData.length; i++) {
      refinedData[i] = maskData[i]
    }

    // 形态学操作：闭运算（先膨胀后腐蚀，填充小洞）
    for (let iter = 0; iter < 2; iter++) {
      // 膨胀
      const dilated = new ImageData(width, height)
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4
          let max = refinedData[idx]
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = ((y + dy) * width + (x + dx)) * 4
              max = Math.max(max, refinedData[nIdx])
            }
          }
          dilated.data[idx] = max
          dilated.data[idx + 1] = max
          dilated.data[idx + 2] = max
          dilated.data[idx + 3] = max
        }
      }

      // 腐蚀
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4
          let min = dilated.data[idx]
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = ((y + dy) * width + (x + dx)) * 4
              min = Math.min(min, dilated.data[nIdx])
            }
          }
          refinedData[idx] = min
          refinedData[idx + 1] = min
          refinedData[idx + 2] = min
          refinedData[idx + 3] = min
        }
      }
    }

    return refined
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

        if (centerAlpha === 0 || centerAlpha === 255) {
          // 在边缘区域，计算羽化
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
        } else {
          featheredData[idx] = maskData[idx]
          featheredData[idx + 1] = maskData[idx + 1]
          featheredData[idx + 2] = maskData[idx + 2]
          featheredData[idx + 3] = maskData[idx + 3]
        }
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
                {/* 对比预览 */}
                {currentTask.resultUrl && (
                  <div className="compare-container">
                    <div className="compare-wrapper">
                      <img 
                        src={currentTask.preview} 
                        alt="Original" 
                        className="compare-image original"
                        style={{ opacity: 1 - compareSlider / 100 }}
                      />
                      <img 
                        src={currentTask.resultUrl} 
                        alt="Result" 
                        className="compare-image result"
                        style={{ opacity: compareSlider / 100 }}
                      />
                    </div>
                    <div className="compare-slider-container">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={compareSlider}
                        onChange={(e) => setCompareSlider(Number(e.target.value))}
                        className="compare-slider"
                      />
                      <div className="compare-labels">
                        <span>{language === 'zh-CN' ? '原图' : 'Original'}</span>
                        <span>{language === 'zh-CN' ? '结果' : 'Result'}</span>
                      </div>
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
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="preview-actions">
                  {/* 处理模式选择 */}
                  <div className="mode-selector">
                    <button
                      className={`mode-btn ${processingMode === 'auto' ? 'active' : ''}`}
                      onClick={() => setProcessingMode('auto')}
                      disabled={isProcessing}
                    >
                      {language === 'zh-CN' ? '自动' : 'Auto'}
                    </button>
                    <button
                      className={`mode-btn ${processingMode === 'ai' ? 'active' : ''}`}
                      onClick={async () => {
                        if (!onnxLoaded) {
                          await loadONNXRuntime()
                        }
                        setProcessingMode('ai')
                      }}
                      disabled={isProcessing || onnxLoading}
                    >
                      {onnxLoading ? (
                        <Loader2 className="spinner" size={14} />
                      ) : (
                        <Zap size={14} />
                      )}
                      {language === 'zh-CN' ? 'AI' : 'AI'}
                    </button>
                  </div>

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
                  {currentTask && currentTask.mask && (
                    <button
                      className={`action-btn ${showInpaintTool ? 'active' : ''}`}
                      onClick={async () => {
                        setShowInpaintTool(!showInpaintTool)
                        setShowBrushTool(false)
                        if (!showInpaintTool && currentTask) {
                          const result = await performInpainting(currentTask, currentTask.mask!)
                          if (result) {
                            // 更新任务结果
                            const canvas = document.createElement('canvas')
                            canvas.width = result.width
                            canvas.height = result.height
                            const ctx = canvas.getContext('2d')!
                            ctx.putImageData(result, 0, 0)
                            canvas.toBlob((blob) => {
                              if (blob) {
                                const url = URL.createObjectURL(blob)
                                setTasks(prev => prev.map(t => 
                                  t.id === currentTask.id 
                                    ? { ...t, result: blob, resultUrl: url }
                                    : t
                                ))
                              }
                            }, `image/${outputFormat}`, outputFormat === 'png' ? undefined : outputQuality / 100)
                          }
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
                            setTasks(prev => prev.map(t => 
                              t.id === currentTask.id 
                                ? { ...t, mask: t.history[newIndex], historyIndex: newIndex }
                                : t
                            ))
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
                            setTasks(prev => prev.map(t => 
                              t.id === currentTask.id 
                                ? { ...t, mask: t.history[newIndex], historyIndex: newIndex }
                                : t
                            ))
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
            {/* 处理模式 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '处理模式' : 'Processing Mode'}
              </label>
              <select
                value={processingMode}
                onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                disabled={isProcessing}
              >
                <option value="auto">
                  {language === 'zh-CN' ? '自动（传统算法）' : 'Auto (Traditional)'}
                </option>
                <option value="ai">
                  {language === 'zh-CN' ? 'AI 分割（需要模型）' : 'AI Segmentation (Requires Model)'}
                </option>
              </select>
              {processingMode === 'ai' && !onnxLoaded && (
                <button
                  className="load-onnx-btn"
                  onClick={loadONNXRuntime}
                  disabled={onnxLoading}
                >
                  {onnxLoading 
                    ? (language === 'zh-CN' ? '加载中...' : 'Loading...')
                    : (language === 'zh-CN' ? '加载 AI 模型' : 'Load AI Model')}
                </button>
              )}
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
