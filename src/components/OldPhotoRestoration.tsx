import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Image as ImageIcon, Settings, Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { saveAs } from 'file-saver'
import './OldPhotoRestoration.css'

const MAX_FILES = 5
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB for old photos

type OutputFormat = 'jpg' | 'png' | 'webp'

interface RestorationTask {
  id: string
  file: File
  originalPreview: string
  restoredPreview?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  progressMessage?: string
  result?: Blob
  resultUrl?: string
  error?: string
  startTime?: number
  endTime?: number
}

interface RestorationOptions {
  autoEnhance: boolean // 自动增强 ⭐⭐⭐⭐⭐
  denoise: boolean // 去噪 ⭐⭐⭐⭐⭐
  denoiseStrength: number // 0-100
  sharpen: boolean // 锐化 ⭐⭐⭐⭐⭐
  sharpenStrength: number // 0-100
  grayBackgroundFix: boolean // 灰底修复 ⭐⭐⭐⭐
  grayBackgroundFixStrength: number // 0-100
  scratchRepair: boolean // 划痕淡化 ⭐⭐⭐
  scratchRepairStrength: number // 0-100
  superResolution: boolean
  outputFormat: OutputFormat
  outputQuality: number // 0-100
}

export default function OldPhotoRestoration() {
  const { language } = useI18n()
  const [tasks, setTasks] = useState<RestorationTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [opencvLoaded, setOpencvLoaded] = useState(false)
  const [opencvLoading, setOpencvLoading] = useState(false)
  const [deviceWarning, setDeviceWarning] = useState(false)
  
  // 默认设置（强烈推荐的功能组合）
  const [options, setOptions] = useState<RestorationOptions>({
    autoEnhance: true, // ⭐⭐⭐⭐⭐ 自动增强
    denoise: true, // ⭐⭐⭐⭐⭐ 去噪
    denoiseStrength: 40, // 降低强度，避免过度模糊
    sharpen: true, // ⭐⭐⭐⭐⭐ 锐化
    sharpenStrength: 30, // 降低强度，避免过度锐化
    grayBackgroundFix: true, // ⭐⭐⭐⭐ 灰底修复
    grayBackgroundFixStrength: 60,
    scratchRepair: false, // ⭐⭐⭐ 划痕淡化（默认关闭，需要时开启）
    scratchRepairStrength: 50,
    superResolution: false,
    outputFormat: 'jpg',
    outputQuality: 90
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const opencvRef = useRef<any>(null)

  // 检测设备性能
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const hasLowMemory = (navigator as any).deviceMemory && (navigator as any).deviceMemory < 4
    const hasLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4

    if (isMobile || hasLowMemory || hasLowCores) {
      setDeviceWarning(true)
    }
  }, [])

  // 加载 OpenCV.js
  const loadOpenCV = useCallback(async (): Promise<boolean> => {
    if (opencvLoaded || opencvLoading) return opencvLoaded

    setOpencvLoading(true)

    return new Promise((resolve, reject) => {
      // 检查是否已经加载
      if ((window as any).cv && (window as any).cv.Mat) {
        opencvRef.current = (window as any).cv
        setOpencvLoaded(true)
        setOpencvLoading(false)
        resolve(true)
        return
      }

      // 动态加载 OpenCV.js（优先使用本地文件，然后尝试 CDN）
      const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = src
          script.async = true
          script.crossOrigin = 'anonymous'
          
          script.onload = () => {
            const cv = (window as any).cv
            if (!cv) {
              reject(new Error('OpenCV.js loaded but cv object not found'))
              return
            }

            // 检查是否已经初始化
            // OpenCV.js 加载后，cv 对象可能立即可用，也可能需要等待 onRuntimeInitialized
            const checkInitialized = () => {
              // 检查关键函数是否可用
              if (cv && typeof cv.Mat === 'function' && typeof cv.matFromImageData === 'function') {
                opencvRef.current = cv
                setOpencvLoaded(true)
                setOpencvLoading(false)
                resolve()
                return true
              }
              return false
            }

            // 立即检查
            if (checkInitialized()) {
              return
            }

            // 如果未初始化，等待运行时初始化
            if (cv.onRuntimeInitialized) {
              // 已经设置了回调，等待即可
              const originalCallback = cv.onRuntimeInitialized
              cv.onRuntimeInitialized = () => {
                if (originalCallback) originalCallback()
                if (checkInitialized()) {
                  return
                }
                // 如果检查失败，等待一下再检查
                setTimeout(() => {
                  if (!checkInitialized()) {
                    setOpencvLoading(false)
                    reject(new Error('OpenCV.js initialized but core functions not available'))
                  }
                }, 1000)
              }
            } else {
              // 设置初始化回调
              cv.onRuntimeInitialized = () => {
                setTimeout(() => {
                  if (!checkInitialized()) {
                    setOpencvLoading(false)
                    reject(new Error('OpenCV.js initialized but core functions not available'))
                  }
                }, 100)
              }
            }
            
            // 超时处理
            setTimeout(() => {
              if (!opencvLoaded) {
                setOpencvLoading(false)
                reject(new Error('OpenCV.js initialization timeout'))
              }
            }, 30000)
          }
          
          script.onerror = () => {
            reject(new Error(`Failed to load OpenCV.js from ${src}`))
          }
          
          document.head.appendChild(script)
        })
      }

      // 尝试加载顺序：本地文件 -> jsDelivr CDN -> docs.opencv.org
      const isDev = import.meta.env.DEV
      const baseURL = isDev ? window.location.origin : (window.location.origin + import.meta.env.BASE_URL)
      const localPath = `${baseURL.replace(/\/+$/, '')}/opencv.js`
      
      // 先尝试本地文件
      loadScript(localPath)
        .catch(() => {
          // 本地文件失败，尝试 jsDelivr CDN
          console.log('Local OpenCV.js not found, trying jsDelivr CDN...')
          return loadScript('https://cdn.jsdelivr.net/npm/opencv-js@4.10.0/dist/opencv.js')
        })
        .catch(() => {
          // jsDelivr 失败，尝试 docs.opencv.org
          console.log('jsDelivr CDN failed, trying docs.opencv.org...')
          return loadScript('https://docs.opencv.org/4.10.0/opencv.js')
        })
        .then(() => {
          resolve(true)
        })
        .catch((err) => {
          setOpencvLoading(false)
          reject(new Error(`Failed to load OpenCV.js from all sources: ${err.message}`))
        })
    })
  }, [opencvLoaded, opencvLoading])

  // 预加载 OpenCV（延迟加载，避免阻塞页面）
  useEffect(() => {
    // 延迟 1 秒后预加载，避免影响页面初始加载
    const timer = setTimeout(() => {
      loadOpenCV().catch(() => {
        console.warn('OpenCV preload failed, will retry on user action')
      })
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [loadOpenCV])


  // 文件上传处理
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return

    const fileArray = Array.from(uploadedFiles)
    
    // 检查文件数量限制
    if (tasks.length + fileArray.length > MAX_FILES) {
      alert(
        language === 'zh-CN' 
          ? `最多只能处理 ${MAX_FILES} 张照片`
          : `Maximum ${MAX_FILES} photos allowed`
      )
      return
    }

    const newTasks: RestorationTask[] = []

    for (const file of fileArray) {
      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        alert(
          language === 'zh-CN' 
            ? `不是图片文件: ${file.name}`
            : `Not an image file: ${file.name}`
        )
        continue
      }

      // 检查文件大小
      if (file.size > MAX_FILE_SIZE) {
        alert(
          language === 'zh-CN' 
            ? `文件过大 (最大50MB): ${file.name}`
            : `File too large (max 50MB): ${file.name}`
        )
        continue
      }

      const preview = URL.createObjectURL(file)
      const taskId = `${Date.now()}-${Math.random()}`

      newTasks.push({
        id: taskId,
        file,
        originalPreview: preview,
        status: 'pending',
        progress: 0
      })
    }

    setTasks(prev => [...prev, ...newTasks])
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [tasks.length, language])

  // 处理图像（使用 OpenCV.js 在主线程，但分块处理）
  const processImage = useCallback(async (task: RestorationTask): Promise<void> => {
    if (!opencvRef.current) {
      try {
        const loaded = await loadOpenCV()
        if (!loaded || !opencvRef.current) {
          throw new Error(language === 'zh-CN' 
            ? 'OpenCV 加载失败，请检查网络连接或刷新页面重试'
            : 'OpenCV failed to load, please check your network connection or refresh the page')
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        throw new Error(language === 'zh-CN' 
          ? `OpenCV 加载失败: ${errorMessage}`
          : `OpenCV loading failed: ${errorMessage}`)
      }
    }

    const cv = opencvRef.current
    const startTime = Date.now()

    // 更新任务状态
    setTasks(prev => prev.map(t => 
      t.id === task.id ? { 
        ...t, 
        status: 'processing' as const, 
        progress: 5,
        progressMessage: language === 'zh-CN' ? '准备中...' : 'Preparing...',
        startTime
      } : t
    ))

    try {
      // 加载图像
      const img = new Image()
      img.src = task.originalPreview
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 10,
          progressMessage: language === 'zh-CN' ? '加载图像...' : 'Loading image...'
        } : t
      ))

      // 创建 Canvas 并绘制图像
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      // 获取 ImageData
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // 创建 OpenCV Mat
      let src: any = null
      let processed: any = null
      
      try {
        // 验证 ImageData
        if (!imageData || !imageData.data || imageData.width === 0 || imageData.height === 0) {
          throw new Error(language === 'zh-CN' 
            ? '图像数据无效'
            : 'Invalid image data')
        }
        
        // 检查图像尺寸是否过大
        const maxDimension = 8192
        if (imageData.width > maxDimension || imageData.height > maxDimension) {
          throw new Error(language === 'zh-CN' 
            ? `图像尺寸过大（最大 ${maxDimension}x${maxDimension}）`
            : `Image size too large (max ${maxDimension}x${maxDimension})`)
        }
        
        src = cv.matFromImageData(imageData)
        if (!src || src.empty() || src.cols === 0 || src.rows === 0) {
          throw new Error(language === 'zh-CN' 
            ? `无法创建图像矩阵 (${imageData.width}x${imageData.height})`
            : `Failed to create image matrix (${imageData.width}x${imageData.height})`)
        }
        
        processed = src.clone()
        if (!processed || processed.empty() || processed.cols === 0 || processed.rows === 0) {
          throw new Error(language === 'zh-CN' 
            ? `无法克隆图像矩阵 (${src.cols}x${src.rows})`
            : `Failed to clone image matrix (${src.cols}x${src.rows})`)
        }
        
        console.log('Mat created successfully:', {
          srcSize: `${src.cols}x${src.rows}`,
          processedSize: `${processed.cols}x${processed.rows}`,
          imageDataSize: `${imageData.width}x${imageData.height}`
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error('Mat creation error:', errorMsg, {
          imageDataValid: !!imageData,
          imageDataSize: imageData ? `${imageData.width}x${imageData.height}` : 'null',
          srcValid: src && !src.empty(),
          processedValid: processed && !processed.empty()
        })
        try { if (src && !src.empty()) src.delete() } catch (e) {}
        try { if (processed && !processed.empty()) processed.delete() } catch (e) {}
        throw err
      }

      // 使用异步操作避免 UI 卡死
      const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

      // ========== 处理流程（按推荐顺序） ==========
      try {
        // 验证 OpenCV 函数可用性
        if (!cv.Mat || typeof cv.matFromImageData !== 'function') {
          throw new Error(language === 'zh-CN' ? 'OpenCV 核心函数不可用，请刷新页面重试' : 'OpenCV core functions not available, please refresh the page')
        }
        
        // 验证初始 processed Mat
        if (!processed || processed.empty() || processed.cols === 0 || processed.rows === 0) {
          throw new Error(`Initial processed Mat is invalid: cols=${processed?.cols}, rows=${processed?.rows}, empty=${processed?.empty()}`)
        }
        
        console.log('Processing started:', {
          imageSize: `${processed.cols}x${processed.rows}`,
          options: {
            autoEnhance: options.autoEnhance,
            denoise: options.denoise,
            sharpen: options.sharpen,
            grayBackgroundFix: options.grayBackgroundFix,
            scratchRepair: options.scratchRepair
          }
        })
        // 1. 自动增强 ⭐⭐⭐⭐⭐（第一步，提升整体质量）
        if (options.autoEnhance) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 15,
              progressMessage: language === 'zh-CN' ? '自动增强...' : 'Auto enhancing...'
            } : t
          ))

          await yieldToUI()

          if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is empty or invalid before auto enhance')
          }

          // 使用 CLAHE (Contrast Limited Adaptive Histogram Equalization) 进行自适应对比度增强
          // 这是专业照片修复的标准方法
          // 验证 processed Mat 是否有效
          if (!processed || processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is invalid before auto enhance')
          }
          
          const processedBackup = processed.clone()
          let rgb: any = null
          let lab: any = null
          let channels: any = null
          let enhanced: any = null
          
          try {
            // 转换为 RGB（去除 Alpha）
            rgb = new cv.Mat()
            // 验证 processed 仍然有效
            if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
              throw new Error('Processed Mat became invalid before RGB conversion')
            }
            cv.cvtColor(processed, rgb, cv.COLOR_RGBA2RGB)
            
            // 验证 RGB Mat
            if (rgb.empty() || rgb.cols === 0 || rgb.rows === 0) {
              throw new Error('RGB Mat conversion failed')
            }
            
            // 转换为 LAB 颜色空间（L 通道包含亮度信息）
            lab = new cv.Mat()
            cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
            
            // 验证 LAB Mat
            if (lab.empty() || lab.cols === 0 || lab.rows === 0) {
              throw new Error('LAB Mat conversion failed')
            }
            
            // 分离通道
            channels = new cv.MatVector()
            cv.split(lab, channels)
            
            // 验证通道数量
            if (channels.size() < 3) {
              throw new Error('Failed to split LAB channels')
            }
            
            // 对 L 通道应用 CLAHE（如果可用）
            const lChannel = channels.get(0)
            if (lChannel.empty() || lChannel.cols === 0 || lChannel.rows === 0) {
              throw new Error('L channel is invalid')
            }
            
            if (typeof cv.CLAHE === 'function') {
              const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8)) // 提高对比度限制
              clahe.apply(lChannel, lChannel)
              clahe.delete()
            } else {
              // 降级方案：使用直方图均衡化
              cv.equalizeHist(lChannel, lChannel)
            }
            
            // 合并通道
            cv.merge(channels, lab)
            
            // 验证合并后的 LAB Mat
            if (lab.empty() || lab.cols === 0 || lab.rows === 0) {
              throw new Error('LAB Mat merge failed')
            }
            
            // 转换回 RGB
            cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
            
            // 验证 RGB Mat
            if (rgb.empty() || rgb.cols === 0 || rgb.rows === 0) {
              throw new Error('RGB Mat conversion from LAB failed')
            }
            
            // 转换回 RGBA
            enhanced = new cv.Mat()
            cv.cvtColor(rgb, enhanced, cv.COLOR_RGB2RGBA)
            
            // 验证结果
            if (enhanced.empty() || enhanced.cols === 0 || enhanced.rows === 0) {
              throw new Error('Auto enhance result is invalid')
            }
            
            // 确保尺寸匹配
            if (enhanced.cols !== processed.cols || enhanced.rows !== processed.rows) {
              throw new Error(`Size mismatch: processed(${processed.cols}x${processed.rows}) vs enhanced(${enhanced.cols}x${enhanced.rows})`)
            }
            
            processed.delete()
            processedBackup.delete()
            processed = enhanced
            
            // 清理
            if (rgb) rgb.delete()
            if (lab) lab.delete()
            if (channels) channels.delete()
          } catch (err) {
            // 记录错误详情
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.error('Auto enhance error:', errorMsg, {
              processedValid: processed && !processed.empty() && processed.cols > 0 && processed.rows > 0,
              processedSize: processed ? `${processed.cols}x${processed.rows}` : 'null',
              rgbValid: rgb && !rgb.empty(),
              labValid: lab && !lab.empty(),
              enhancedValid: enhanced && !enhanced.empty()
            })
            
            // 清理
            try { if (rgb && !rgb.empty()) rgb.delete() } catch (e) {}
            try { if (lab && !lab.empty()) lab.delete() } catch (e) {}
            try { if (channels) channels.delete() } catch (e) {}
            try { if (enhanced && !enhanced.empty()) enhanced.delete() } catch (e) {}
            
            // 如果失败，使用备份
            if (processed && !processed.empty() && processed.cols > 0 && processed.rows > 0) {
              processedBackup.delete()
            } else {
              if (processedBackup && !processedBackup.empty()) {
                processed = processedBackup
              } else {
                throw new Error('Both processed and backup are invalid')
              }
            }
            console.warn('Auto enhance failed, continuing with original:', err)
          }
          
          await yieldToUI()
        }

        // 2. 去噪 ⭐⭐⭐⭐⭐（在增强后进行，效果更好）
        if (options.denoise) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 35,
              progressMessage: language === 'zh-CN' ? '去噪处理...' : 'Denoising...'
            } : t
          ))

          await yieldToUI()

          // 验证 processed Mat 是否有效
          if (!processed || processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is empty or invalid before denoising')
          }
          
          // 调整去噪强度：降低默认值，避免过度模糊
          const h = Math.max(1, Math.min(8, (options.denoiseStrength / 100) * 8))
          
          // 创建备份
          const processedBackup = processed.clone()
          const dst = new cv.Mat()
          let rgb: any = null
          let denoisedRgb: any = null
          
          try {
            // 验证 processed 仍然有效
            if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
              throw new Error('Processed Mat became invalid before denoising')
            }
            
            // fastNlMeansDenoisingColored 需要 RGB 格式（CV_8UC3），不是 RGBA（CV_8UC4）
            // 所以需要先转换为 RGB，去噪后再转换回 RGBA
            rgb = new cv.Mat()
            cv.cvtColor(processed, rgb, cv.COLOR_RGBA2RGB)
            
            // 验证 RGB Mat
            if (rgb.empty() || rgb.cols === 0 || rgb.rows === 0) {
              throw new Error('RGB conversion failed for denoising')
            }
            
            denoisedRgb = new cv.Mat()
            
            // 优先使用 fastNlMeansDenoisingColored（彩色去噪，效果最好）
            if (typeof cv.fastNlMeansDenoisingColored === 'function') {
              // 使用更温和的参数：h 值较小，模板窗口和搜索窗口适中
              // 注意：fastNlMeansDenoisingColored 需要 RGB 格式
              cv.fastNlMeansDenoisingColored(rgb, denoisedRgb, h, 7, 7, 21)
            } else if (typeof cv.fastNlMeansDenoising === 'function') {
              // 降级到灰度去噪
              const gray = new cv.Mat()
              try {
                cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY)
                if (gray.empty() || gray.cols === 0 || gray.rows === 0) {
                  throw new Error('Gray conversion failed')
                }
                cv.fastNlMeansDenoising(gray, gray, h, 7, 21)
                cv.cvtColor(gray, denoisedRgb, cv.COLOR_GRAY2RGB)
              } finally {
                if (gray && !gray.empty()) gray.delete()
              }
            } else {
              // 降级方案：使用双边滤波（保留边缘的去噪）
              cv.bilateralFilter(rgb, denoisedRgb, 9, 75, 75)
            }
            
            // 验证去噪后的 RGB Mat
            if (denoisedRgb.empty() || denoisedRgb.cols === 0 || denoisedRgb.rows === 0) {
              throw new Error('Denoised RGB Mat is invalid')
            }
            
            // 转换回 RGBA
            cv.cvtColor(denoisedRgb, dst, cv.COLOR_RGB2RGBA)
            
            // 验证结果
            if (dst.empty() || dst.cols === 0 || dst.rows === 0) {
              throw new Error('Denoising result is invalid')
            }
            
            // 确保尺寸匹配
            if (dst.cols !== processed.cols || dst.rows !== processed.rows) {
              throw new Error(`Size mismatch: processed(${processed.cols}x${processed.rows}) vs dst(${dst.cols}x${dst.rows})`)
            }
            
            processed.delete()
            processedBackup.delete()
            processed = dst
            
            // 清理
            if (rgb) rgb.delete()
            if (denoisedRgb) denoisedRgb.delete()
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            const errorCode = typeof err === 'number' ? err : undefined
            
            console.error('Denoising error:', errorMsg, {
              errorCode: errorCode,
              processedValid: processed && !processed.empty() && processed.cols > 0 && processed.rows > 0,
              processedSize: processed ? `${processed.cols}x${processed.rows}` : 'null',
              processedType: processed ? processed.type ? processed.type() : 'unknown' : 'null',
              rgbValid: rgb && !rgb.empty(),
              denoisedRgbValid: denoisedRgb && !denoisedRgb.empty(),
              dstValid: dst && !dst.empty(),
              h: h
            })
            
            // 清理
            try { if (rgb && !rgb.empty()) rgb.delete() } catch (e) {}
            try { if (denoisedRgb && !denoisedRgb.empty()) denoisedRgb.delete() } catch (e) {}
            try { if (dst && !dst.empty()) dst.delete() } catch (e) {}
            
            // 如果失败，使用备份
            if (processed && !processed.empty() && processed.cols > 0 && processed.rows > 0) {
              processedBackup.delete()
            } else {
              if (processedBackup && !processedBackup.empty()) {
                processed = processedBackup
              } else {
                throw new Error('Both processed and backup are invalid after denoising error')
              }
            }
            
            // 如果是 OpenCV 错误代码，尝试使用降级方案
            let fallbackSucceeded = false
            if (typeof err === 'number' && (err === 6981192 || err === 6981448)) {
              console.warn('OpenCV denoising failed, trying fallback method...')
              
              // 使用双边滤波作为降级方案
              try {
                // 确保 processed 仍然有效（此时应该是备份）
                if (processed && !processed.empty() && processed.cols > 0 && processed.rows > 0) {
                  const fallbackDst = new cv.Mat()
                  cv.bilateralFilter(processed, fallbackDst, 9, 75, 75)
                  
                  if (!fallbackDst.empty() && fallbackDst.cols > 0 && fallbackDst.rows > 0 && 
                      fallbackDst.cols === processed.cols && fallbackDst.rows === processed.rows) {
                    processed.delete()
                    processedBackup.delete()
                    processed = fallbackDst
                    fallbackSucceeded = true
                    console.log('Fallback denoising (bilateral filter) succeeded')
                  } else {
                    fallbackDst.delete()
                    console.warn('Fallback denoising result is invalid')
                  }
                }
              } catch (fallbackErr) {
                console.warn('Fallback denoising also failed:', fallbackErr)
              }
            }
            
            // 如果降级方案也失败，继续使用原图（processed 已经是备份）
            if (!fallbackSucceeded && processed && !processed.empty() && processed.cols > 0 && processed.rows > 0) {
              console.warn('Denoising failed, continuing with original image:', err)
            }
          }
          
          await yieldToUI()
        }

        // 3. 锐化 ⭐⭐⭐⭐⭐（在去噪后进行，恢复细节）
        if (options.sharpen) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 50,
              progressMessage: language === 'zh-CN' ? '锐化处理...' : 'Sharpening...'
            } : t
          ))

          await yieldToUI()

          // 验证 processed Mat 是否有效
          if (!processed || processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is empty or invalid before sharpening')
          }

          const kernel = new cv.Mat(3, 3, cv.CV_32F)
          const dst = new cv.Mat()
          
          try {
            // 验证 processed 仍然有效
            if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
              throw new Error('Processed Mat became invalid before sharpening')
            }
            
            // 使用 Unsharp Mask 算法（专业锐化方法）
            // 调整强度：降低默认值，避免过度锐化产生伪影
            const strength = options.sharpenStrength / 100
            const center = -0.3 * strength // 降低锐化强度
            const others = center / 8
            
            const kernelData = new Float32Array([
              others, others, others,
              others, 1 - center, others,
              others, others, others
            ])
            kernel.data32F.set(kernelData)
            
            cv.filter2D(processed, dst, cv.CV_8U, kernel, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT)
            
            // 验证结果
            if (dst.empty() || dst.cols === 0 || dst.rows === 0) {
              throw new Error('Sharpening result is invalid')
            }
            
            // 确保尺寸匹配
            if (dst.cols !== processed.cols || dst.rows !== processed.rows) {
              throw new Error(`Size mismatch: processed(${processed.cols}x${processed.rows}) vs dst(${dst.cols}x${dst.rows})`)
            }
            
            processed.delete()
            processed = dst
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.error('Sharpening error:', errorMsg, {
              processedValid: processed && !processed.empty() && processed.cols > 0 && processed.rows > 0,
              processedSize: processed ? `${processed.cols}x${processed.rows}` : 'null',
              dstValid: dst && !dst.empty()
            })
            if (dst && !dst.empty()) dst.delete()
            if (kernel && !kernel.empty()) kernel.delete()
            throw err
          }
          
          if (kernel && !kernel.empty()) kernel.delete()
          await yieldToUI()
        }

        // 4. 灰底修复 ⭐⭐⭐⭐（修复老照片常见的灰底问题）
        if (options.grayBackgroundFix) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 65,
              progressMessage: language === 'zh-CN' ? '修复灰底...' : 'Fixing gray background...'
            } : t
          ))

          await yieldToUI()

          if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is empty or invalid before gray background fix')
          }

          // 验证 processed Mat 是否有效
          if (!processed || processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is invalid before gray background fix')
          }
          
          const processedBackup = processed.clone()
          const dst = new cv.Mat()
          let rgb: any = null
          let hsv: any = null
          let hsvChannels: any = null
          
          try {
            // 灰底修复策略：
            // 1. 转换为 HSV 颜色空间
            // 2. 对 V (Value/Brightness) 通道进行 CLAHE 增强
            // 3. 提升灰底区域的亮度和对比度
            
            // 转换为 RGB（去除 Alpha）
            rgb = new cv.Mat()
            // 验证 processed 仍然有效
            if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
              throw new Error('Processed Mat became invalid before RGB conversion')
            }
            cv.cvtColor(processed, rgb, cv.COLOR_RGBA2RGB)
            
            // 验证 RGB Mat
            if (rgb.empty() || rgb.cols === 0 || rgb.rows === 0) {
              throw new Error('RGB Mat conversion failed')
            }
            
            // 转换为 HSV
            hsv = new cv.Mat()
            cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)
            
            // 验证 HSV Mat
            if (hsv.empty() || hsv.cols === 0 || hsv.rows === 0) {
              throw new Error('HSV Mat conversion failed')
            }
            
            // 分离通道
            hsvChannels = new cv.MatVector()
            cv.split(hsv, hsvChannels)
            
            // 验证通道数量
            if (hsvChannels.size() < 3) {
              throw new Error('Failed to split HSV channels')
            }
            
            // 对 V (Value/Brightness) 通道进行增强
            const vChannel = hsvChannels.get(2)
            if (vChannel.empty() || vChannel.cols === 0 || vChannel.rows === 0) {
              throw new Error('V channel is invalid')
            }
            
            // 使用 CLAHE 增强亮度通道（专门针对灰底）
            if (typeof cv.CLAHE === 'function') {
              const clahe = new cv.CLAHE(4.0, new cv.Size(8, 8)) // 更高的对比度限制
              clahe.apply(vChannel, vChannel)
              clahe.delete()
            } else {
              // 降级：使用直方图均衡化
              cv.equalizeHist(vChannel, vChannel)
            }
            
            // 合并通道
            cv.merge(hsvChannels, hsv)
            
            // 验证合并后的 HSV Mat
            if (hsv.empty() || hsv.cols === 0 || hsv.rows === 0) {
              throw new Error('HSV Mat merge failed')
            }
            
            // 转换回 RGB
            cv.cvtColor(hsv, rgb, cv.COLOR_HSV2RGB)
            
            // 验证 RGB Mat
            if (rgb.empty() || rgb.cols === 0 || rgb.rows === 0) {
              throw new Error('RGB Mat conversion from HSV failed')
            }
            
            // 转换回 RGBA
            cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)
            
            // 验证结果
            if (dst.empty() || dst.cols === 0 || dst.rows === 0) {
              throw new Error('Gray background fix result is invalid')
            }
            
            // 确保尺寸匹配
            if (dst.cols !== processed.cols || dst.rows !== processed.rows) {
              throw new Error(`Size mismatch: processed(${processed.cols}x${processed.rows}) vs dst(${dst.cols}x${dst.rows})`)
            }
            
            processed.delete()
            processedBackup.delete()
            processed = dst
            
            // 清理
            if (rgb) rgb.delete()
            if (hsv) hsv.delete()
            if (hsvChannels) hsvChannels.delete()
          } catch (err) {
            // 记录错误详情
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.error('Gray background fix error:', errorMsg, {
              processedValid: processed && !processed.empty() && processed.cols > 0 && processed.rows > 0,
              processedSize: processed ? `${processed.cols}x${processed.rows}` : 'null',
              rgbValid: rgb && !rgb.empty(),
              hsvValid: hsv && !hsv.empty(),
              dstValid: dst && !dst.empty()
            })
            
            // 清理
            try { if (rgb && !rgb.empty()) rgb.delete() } catch (e) {}
            try { if (hsv && !hsv.empty()) hsv.delete() } catch (e) {}
            try { if (hsvChannels) hsvChannels.delete() } catch (e) {}
            try { if (dst && !dst.empty()) dst.delete() } catch (e) {}
            
            // 如果失败，恢复备份
            if (processed && !processed.empty() && processed.cols > 0 && processed.rows > 0) {
              processedBackup.delete()
            } else {
              if (processedBackup && !processedBackup.empty()) {
                processed = processedBackup
              } else {
                throw new Error('Both processed and backup are invalid')
              }
            }
            console.warn('Gray background fix failed, continuing with original:', err)
          }
          
          await yieldToUI()
        }

        // 5. 划痕淡化 ⭐⭐⭐（最后处理，修复细节瑕疵）
        if (options.scratchRepair) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 80,
              progressMessage: language === 'zh-CN' ? '淡化划痕...' : 'Fading scratches...'
            } : t
          ))

          await yieldToUI()

          if (processed.empty() || processed.cols === 0 || processed.rows === 0) {
            throw new Error('Processed Mat is empty or invalid before scratch repair')
          }

          // 划痕淡化：使用更温和的方法
          // 1. 检测细线（划痕通常是细线）
          // 2. 使用形态学操作淡化
          // 3. 使用中值滤波平滑
          const dst = new cv.Mat()
          
          try {
            // 转换为灰度
            const gray = new cv.Mat()
            cv.cvtColor(processed, gray, cv.COLOR_RGBA2GRAY)
            
            // 检测细线（划痕）
            const edges = new cv.Mat()
            const threshold = Math.max(30, Math.min(100, Math.floor((options.scratchRepairStrength / 100) * 70) + 30))
            cv.Canny(gray, edges, threshold, threshold * 2)
            
            // 使用形态学操作：开运算（先腐蚀后膨胀）来淡化细线
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
            const opened = new cv.Mat()
            cv.morphologyEx(edges, opened, cv.MORPH_OPEN, kernel)
            
            // 如果 inpaint 可用，使用它修复
            if (typeof cv.inpaint === 'function') {
              cv.inpaint(processed, opened, dst, 2, cv.INPAINT_TELEA) // 降低修复半径
            } else {
              // 降级：使用中值滤波（对细线有效）
              cv.medianBlur(processed, dst, 3) // 使用较小的核，避免过度模糊
            }
            
            if (dst.empty() || dst.cols === 0 || dst.rows === 0) {
              throw new Error('Scratch repair result is invalid')
            }
            
            processed.delete()
            processed = dst
            
            // 清理
            gray.delete()
            edges.delete()
            opened.delete()
            kernel.delete()
          } catch (err) {
            dst.delete()
            console.warn('Scratch repair failed, continuing:', err)
            // 如果失败，继续使用原图
          }
          
          await yieldToUI()
        }

        // 转换为 ImageData
        setTasks(prev => prev.map(t => 
          t.id === task.id ? { 
            ...t, 
            progress: 90,
            progressMessage: language === 'zh-CN' ? '生成结果...' : 'Generating result...'
          } : t
        ))

        await yieldToUI() // 让出控制权

        // 验证 processed Mat 是否有效
        // 注意：OpenCV.js Mat 对象可能没有 isDeleted 属性，使用 try-catch 更安全
        let isValid = false
        try {
          isValid = processed && 
                   !processed.empty() && 
                   processed.cols > 0 && 
                   processed.rows > 0 &&
                   typeof processed.cols === 'number' &&
                   typeof processed.rows === 'number'
        } catch (err) {
          isValid = false
        }
        
        if (!isValid) {
          throw new Error(language === 'zh-CN' 
            ? '处理后的图像无效，请重试或使用其他图片'
            : 'Processed image is invalid, please try again or use a different image')
        }
        
        // 限制 Canvas 大小，避免内存问题
        const maxDimension = 4096
        let outputWidth = processed.cols
        let outputHeight = processed.rows
        
        if (outputWidth > maxDimension || outputHeight > maxDimension) {
          const scale = Math.min(maxDimension / outputWidth, maxDimension / outputHeight)
          outputWidth = Math.floor(outputWidth * scale)
          outputHeight = Math.floor(outputHeight * scale)
          
          // 缩放 Mat
          const resized = new cv.Mat()
          cv.resize(processed, resized, new cv.Size(outputWidth, outputHeight), 0, 0, cv.INTER_LINEAR)
          processed.delete()
          processed = resized
        }
        
        const resultCanvas = document.createElement('canvas')
        resultCanvas.width = processed.cols
        resultCanvas.height = processed.rows
        
        // cv.imshow 需要 Canvas 元素，而不是 ImageData
        // 将 Mat 绘制到 Canvas 上
        try {
          // 确保 Canvas 已添加到 DOM（某些浏览器需要）
          if (!resultCanvas.parentElement) {
            document.body.appendChild(resultCanvas)
            resultCanvas.style.display = 'none'
          }
          
          cv.imshow(resultCanvas, processed)
          
          // 从 DOM 中移除（如果之前添加了）
          if (resultCanvas.parentElement && resultCanvas.parentElement === document.body) {
            document.body.removeChild(resultCanvas)
          }
        } catch (err) {
          // 如果 imshow 失败，提供更详细的错误信息
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error('cv.imshow failed:', errorMsg, 'Mat info:', {
            cols: processed.cols,
            rows: processed.rows,
            empty: processed.empty(),
            type: processed.type ? processed.type() : 'unknown'
          })
          throw new Error(language === 'zh-CN' 
            ? `无法将处理结果绘制到画布: ${errorMsg}`
            : `Failed to draw result to canvas: ${errorMsg}`)
        }
        
        // 直接使用 Canvas 转换为 Blob（cv.imshow 已经将 Mat 绘制到 Canvas 上了）
        // 将 toBlob 转换为 Promise 以便正确处理错误
        await new Promise<void>((resolve, reject) => {
          try {
            resultCanvas.toBlob((blob) => {
              if (blob) {
                const resultUrl = URL.createObjectURL(blob)
                const endTime = Date.now()
                const duration = ((endTime - startTime) / 1000).toFixed(1)

                setTasks(prev => prev.map(t => 
                  t.id === task.id
                    ? {
                        ...t,
                        status: 'completed' as const,
                        progress: 100,
                        progressMessage: language === 'zh-CN' 
                          ? `完成！用时 ${duration}秒` 
                          : `Completed! ${duration}s`,
                        result: blob,
                        resultUrl,
                        restoredPreview: resultUrl,
                        endTime
                      }
                    : t
                ))

                // 播放完成音效
                try {
                  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MT6bj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDE+m4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC')
                  audio.volume = 0.3
                  audio.play().catch(() => {})
                } catch (err) {
                  // 忽略音效错误
                }
                
                resolve()
              } else {
                reject(new Error(language === 'zh-CN' 
                  ? '无法生成图像 Blob' 
                  : 'Failed to generate image Blob'))
              }
            }, `image/${options.outputFormat}`, options.outputQuality / 100)
          } catch (err) {
            reject(err)
          }
        })

        // 清理 Mat 对象（安全删除）
        try {
          if (src && !src.empty && !src.empty()) src.delete()
        } catch (e) {
          console.warn('Error deleting src Mat:', e)
        }
        try {
          if (processed && !processed.empty && !processed.empty()) processed.delete()
        } catch (e) {
          console.warn('Error deleting processed Mat:', e)
        }
      } catch (err) {
        // 确保清理所有 Mat 对象
        try {
          if (src && !src.empty && !src.empty()) src.delete()
        } catch (e) {
          console.warn('Error deleting src Mat:', e)
        }
        try {
          if (processed && !processed.empty && !processed.empty()) processed.delete()
        } catch (e) {
          console.warn('Error deleting processed Mat:', e)
        }
        throw err
      }
    } catch (err) {
      console.error('Processing failed:', err)
      
      // 记录详细的错误信息
      const errorDetails: any = {
        error: err instanceof Error ? err.message : String(err),
        errorCode: typeof err === 'number' ? err : undefined,
        taskId: task.id,
        fileName: task.file.name,
        fileSize: task.file.size
      }
      
      // 如果错误是数字（OpenCV 错误代码），添加更多信息
      if (typeof err === 'number') {
        errorDetails.opencvErrorCode = err
        errorDetails.suggestions = [
          'Try refreshing the page',
          'Try using a different image',
          'Check if the image is corrupted',
          'Try reducing image size'
        ]
      }
      
      console.error('Error details:', errorDetails)
      
      // 提供更友好的错误消息
      let errorMessage = 'Unknown error'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'number') {
        // OpenCV 错误代码
        errorMessage = language === 'zh-CN' 
          ? `OpenCV 错误代码: ${err}。请尝试刷新页面或使用其他图片。如果问题持续，请尝试使用较小的图片。`
          : `OpenCV error code: ${err}. Please try refreshing the page or using a different image. If the problem persists, try using a smaller image.`
      } else {
        errorMessage = String(err)
      }
      
      setTasks(prev => prev.map(t => 
        t.id === task.id 
          ? { 
              ...t, 
              status: 'failed' as const,
              progress: 0,
              progressMessage: undefined,
              error: errorMessage
            } 
          : t
      ))
      throw err
    }
  }, [options, loadOpenCV, language])

  // 处理所有任务
  const handleProcess = useCallback(async () => {
    if (tasks.length === 0) return

    const pendingTasks = tasks.filter(t => t.status === 'pending')
    if (pendingTasks.length === 0) return

    setIsProcessing(true)

    try {
      for (const task of pendingTasks) {
        try {
          await processImage(task)
        } catch (err) {
          console.error(`Failed to process ${task.file.name}:`, err)
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [tasks, processImage])

  // 下载单个文件
  const handleDownload = useCallback((task: RestorationTask) => {
    if (!task.result || !task.resultUrl) return
    
    const ext = options.outputFormat
    const fileName = task.file.name.replace(/\.[^/.]+$/, '') + `_restored.${ext}`
    saveAs(task.result, fileName)
  }, [options.outputFormat])

  // 删除任务
  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId)
      if (task?.originalPreview) URL.revokeObjectURL(task.originalPreview)
      if (task?.restoredPreview) URL.revokeObjectURL(task.restoredPreview)
      if (task?.resultUrl) URL.revokeObjectURL(task.resultUrl)
      return prev.filter(t => t.id !== taskId)
    })
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 每个任务的对比滑块值（taskId -> value）
  const [compareSliders, setCompareSliders] = useState<Record<string, number>>({})
  
  const getCompareSlider = (taskId: string): number => {
    return compareSliders[taskId] ?? 50
  }
  
  const setCompareSlider = (taskId: string, value: number) => {
    setCompareSliders(prev => ({ ...prev, [taskId]: value }))
  }

  return (
    <div className="old-photo-restoration">
      {/* Header */}
      <div className="restoration-header">
        <div className="header-content">
          <h1 className="tool-title">
            <ImageIcon />
            {language === 'zh-CN' ? '老照片修复' : 'Old Photo Restoration'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? '使用专业算法修复老照片：自动增强、去噪、锐化、灰底修复、划痕淡化。100% 本地处理，保护隐私安全。'
              : 'Restore old photos with professional algorithms: auto enhance, denoise, sharpen, gray background fix, scratch fading. 100% local processing, privacy protected.'}
          </p>
          <div className="expectation-warning">
            <AlertCircle size={16} />
            <span>
              {language === 'zh-CN'
                ? '此工具可以改善清晰度，但无法恢复已丢失的细节。'
                : 'This tool improves clarity but cannot restore lost details.'}
            </span>
          </div>
        </div>
      </div>

      {/* Device Warning */}
      {deviceWarning && (
        <div className="device-warning">
          <AlertCircle size={20} />
          <div>
            <strong>
              {language === 'zh-CN' ? '设备性能提示' : 'Device Performance Notice'}
            </strong>
            <p>
              {language === 'zh-CN'
                ? '建议使用桌面浏览器以获得最佳性能。移动设备可能处理较慢。'
                : 'Desktop browsers recommended for best performance. Mobile devices may process slower.'}
            </p>
          </div>
        </div>
      )}

      {/* OpenCV Loading Overlay */}
      {opencvLoading && (
        <div className="opencv-loading-overlay">
          <div className="loading-spinner"></div>
          <p className="loading-title">
            {language === 'zh-CN' ? '正在加载图像处理引擎...' : 'Loading image processing engine...'}
          </p>
          <p className="loading-hint">
            {language === 'zh-CN' 
              ? '首次加载需要下载约 8MB 文件，请耐心等待...' 
              : 'First load requires ~8MB download, please wait...'}
          </p>
        </div>
      )}

      {/* Upload Section */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isProcessing || opencvLoading}
        />
        
        <div
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={48} />
          <span>{language === 'zh-CN' ? '上传老照片' : 'Upload Old Photos'}</span>
          <small>
            {language === 'zh-CN' 
              ? '支持 JPG, PNG, BMP 等格式，最多 5 张，每个最大 50MB'
              : 'Supports JPG, PNG, BMP, max 5 photos, 50MB each'}
          </small>
        </div>

        {tasks.length > 0 && (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className={`task-item ${task.status}`}>
                <div className="task-preview">
                  {task.status === 'completed' && task.restoredPreview ? (
                    <div className="compare-container">
                      <div className="compare-wrapper">
                        <img 
                          src={task.originalPreview} 
                          alt="Original" 
                          className="compare-image original"
                          style={{ opacity: 1 - getCompareSlider(task.id) / 100 }}
                        />
                        <img 
                          src={task.restoredPreview} 
                          alt="Restored" 
                          className="compare-image restored"
                          style={{ opacity: getCompareSlider(task.id) / 100 }}
                        />
                      </div>
                      <div className="compare-slider-container">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={getCompareSlider(task.id)}
                          onChange={(e) => setCompareSlider(task.id, Number(e.target.value))}
                          className="compare-slider"
                        />
                        <div className="compare-labels">
                          <span>{language === 'zh-CN' ? '原图' : 'Original'}</span>
                          <span>{language === 'zh-CN' ? '修复后' : 'Restored'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img src={task.originalPreview} alt="Preview" />
                  )}
                </div>
                <div className="task-info">
                  <span className="task-name">{task.file.name}</span>
                  <span className="task-size">{formatFileSize(task.file.size)}</span>
                  
                  {task.status === 'processing' && (
                    <>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${task.progress}%` }}></div>
                      </div>
                      <div className="progress-message">
                        {task.progressMessage || `${task.progress}%`}
                      </div>
                    </>
                  )}
                  
                  {task.status === 'completed' && task.progressMessage && (
                    <div className="success-message">
                      <CheckCircle2 size={14} />
                      {task.progressMessage}
                    </div>
                  )}
                  
                  {task.status === 'failed' && task.error && (
                    <div className="error-message">
                      <AlertCircle size={14} />
                      {task.error}
                    </div>
                  )}
                </div>
                <div className="task-actions">
                  {task.status === 'completed' && task.resultUrl && (
                    <button 
                      className="download-btn"
                      onClick={() => handleDownload(task)}
                      title={language === 'zh-CN' ? '下载修复后的照片' : 'Download restored photo'}
                    >
                      <Download size={16} />
                      <span>{language === 'zh-CN' ? '下载' : 'Download'}</span>
                    </button>
                  )}
                  <button 
                    className="remove-btn"
                    onClick={() => handleRemoveTask(task.id)}
                    disabled={isProcessing}
                    title={language === 'zh-CN' ? '删除任务' : 'Remove task'}
                  >
                    <X size={16} />
                    <span>{language === 'zh-CN' ? '删除' : 'Remove'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Section */}
      {tasks.length > 0 && (
        <div className="settings-section">
          <h3><Settings /> {language === 'zh-CN' ? '修复设置' : 'Restoration Settings'}</h3>
          
          <div className="settings-grid">
            {/* 自动增强 ⭐⭐⭐⭐⭐ */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.autoEnhance}
                  onChange={(e) => setOptions(prev => ({ ...prev, autoEnhance: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '自动增强' : 'Auto Enhance'}</span>
                <span className="setting-badge">⭐⭐⭐⭐⭐</span>
              </label>
              <small>
                {language === 'zh-CN' 
                  ? '使用 CLAHE 自适应对比度增强，提升整体质量'
                  : 'Use CLAHE adaptive contrast enhancement to improve overall quality'}
              </small>
            </div>

            {/* 去噪 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.denoise}
                  onChange={(e) => setOptions(prev => ({ ...prev, denoise: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '去噪' : 'Denoise'}</span>
                <span className="setting-badge">⭐⭐⭐⭐⭐</span>
              </label>
              {options.denoise && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={options.denoiseStrength}
                  onChange={(e) => setOptions(prev => ({ ...prev, denoiseStrength: Number(e.target.value) }))}
                  disabled={isProcessing}
                />
              )}
              <small>
                {language === 'zh-CN' 
                  ? '减少照片噪点和颗粒感'
                  : 'Reduce noise and grain'}
              </small>
            </div>

            {/* 锐化 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.sharpen}
                  onChange={(e) => setOptions(prev => ({ ...prev, sharpen: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '锐化' : 'Sharpen'}</span>
                <span className="setting-badge">⭐⭐⭐⭐⭐</span>
              </label>
              {options.sharpen && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={options.sharpenStrength}
                  onChange={(e) => setOptions(prev => ({ ...prev, sharpenStrength: Number(e.target.value) }))}
                  disabled={isProcessing}
                />
              )}
              <small>
                {language === 'zh-CN' 
                  ? '增强图像清晰度'
                  : 'Enhance image sharpness'}
              </small>
            </div>

            {/* 灰底修复 ⭐⭐⭐⭐ */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.grayBackgroundFix}
                  onChange={(e) => setOptions(prev => ({ ...prev, grayBackgroundFix: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '灰底修复' : 'Gray Background Fix'}</span>
                <span className="setting-badge">⭐⭐⭐⭐</span>
              </label>
              {options.grayBackgroundFix && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={options.grayBackgroundFixStrength}
                  onChange={(e) => setOptions(prev => ({ ...prev, grayBackgroundFixStrength: Number(e.target.value) }))}
                  disabled={isProcessing}
                />
              )}
              <small>
                {language === 'zh-CN' 
                  ? '修复老照片常见的灰底问题，提升亮度和对比度'
                  : 'Fix gray background issues common in old photos, enhance brightness and contrast'}
              </small>
            </div>

            {/* 划痕淡化 ⭐⭐⭐ */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.scratchRepair}
                  onChange={(e) => setOptions(prev => ({ ...prev, scratchRepair: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '划痕淡化' : 'Scratch Fading'}</span>
                <span className="setting-badge">⭐⭐⭐</span>
              </label>
              {options.scratchRepair && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={options.scratchRepairStrength}
                  onChange={(e) => setOptions(prev => ({ ...prev, scratchRepairStrength: Number(e.target.value) }))}
                  disabled={isProcessing}
                />
              )}
              <small>
                {language === 'zh-CN' 
                  ? '淡化照片上的划痕和细线瑕疵'
                  : 'Fade scratches and fine line blemishes'}
              </small>
            </div>

            {/* 超分辨率 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.superResolution}
                  onChange={(e) => setOptions(prev => ({ ...prev, superResolution: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '超分辨率' : 'Super Resolution'}</span>
                <span className="setting-badge">实验性</span>
              </label>
              <small>
                {language === 'zh-CN' 
                  ? '使用 AI 提升图像分辨率（需要 ONNX Runtime）'
                  : 'Use AI to enhance image resolution (requires ONNX Runtime)'}
              </small>
            </div>

            {/* 输出格式 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '输出格式' : 'Output Format'}
              </label>
              <select
                value={options.outputFormat}
                onChange={(e) => setOptions(prev => ({ ...prev, outputFormat: e.target.value as OutputFormat }))}
                disabled={isProcessing}
              >
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>

            {/* 输出质量 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '输出质量' : 'Output Quality'}: {options.outputQuality}
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={options.outputQuality}
                onChange={(e) => setOptions(prev => ({ ...prev, outputQuality: Number(e.target.value) }))}
                disabled={isProcessing}
              />
              <small>
                {language === 'zh-CN' 
                  ? '50-100，数值越高质量越好（文件越大）'
                  : '50-100, higher is better quality (larger file)'}
              </small>
            </div>
          </div>

          <div className="action-buttons">
            <button
              className="process-button"
              onClick={handleProcess}
              disabled={isProcessing || opencvLoading || tasks.filter(t => t.status === 'pending').length === 0}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  <span>{language === 'zh-CN' ? '处理中...' : 'Processing...'}</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>{language === 'zh-CN' ? '开始修复' : 'Start Restoration'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
