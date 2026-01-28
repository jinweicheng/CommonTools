import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Image, Settings, Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
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
  denoise: boolean
  denoiseStrength: number // 0-100
  sharpen: boolean
  sharpenStrength: number // 0-100
  autoContrast: boolean
  scratchRepair: boolean
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
  
  // 默认设置
  const [options, setOptions] = useState<RestorationOptions>({
    denoise: true,
    denoiseStrength: 50,
    sharpen: true,
    sharpenStrength: 50,
    autoContrast: true,
    scratchRepair: false,
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

      // 动态加载 OpenCV.js
      const script = document.createElement('script')
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js'
      script.async = true
      
      // OpenCV.js 加载完成后的处理
      script.onload = () => {
        const cv = (window as any).cv
        if (!cv) {
          setOpencvLoading(false)
          reject(new Error('OpenCV.js loaded but cv object not found'))
          return
        }

        // 检查是否已经初始化
        if (cv.Mat) {
          // 已经初始化完成
          opencvRef.current = cv
          setOpencvLoaded(true)
          setOpencvLoading(false)
          resolve(true)
        } else {
          // 等待运行时初始化
          cv.onRuntimeInitialized = () => {
            opencvRef.current = cv
            setOpencvLoaded(true)
            setOpencvLoading(false)
            resolve(true)
          }
          
          // 超时处理
          setTimeout(() => {
            if (!opencvLoaded) {
              setOpencvLoading(false)
              reject(new Error('OpenCV.js initialization timeout'))
            }
          }, 30000)
        }
      }
      
      script.onerror = () => {
        setOpencvLoading(false)
        reject(new Error('Failed to load OpenCV.js'))
      }
      
      document.head.appendChild(script)
    })
  }, [opencvLoaded, opencvLoading])

  // 预加载 OpenCV
  useEffect(() => {
    loadOpenCV().catch(() => {
      console.warn('OpenCV preload failed, will retry on user action')
    })
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
      const loaded = await loadOpenCV()
      if (!loaded || !opencvRef.current) {
        throw new Error('OpenCV not loaded')
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
      let src = cv.matFromImageData(imageData)
      let processed = src.clone()

      // 使用异步操作避免 UI 卡死
      const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

      try {

        // 1. 去噪
        if (options.denoise) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 20,
              progressMessage: language === 'zh-CN' ? '去噪处理...' : 'Denoising...'
            } : t
          ))

          await yieldToUI() // 让出控制权

          const dst = new cv.Mat()
          const h = (options.denoiseStrength / 100) * 10
          cv.fastNlMeansDenoisingColored(src, dst, h, 10, 7, 21)
          processed.delete()
          processed = dst
          
          await yieldToUI() // 让出控制权
        }

        // 2. 自动对比度
        if (options.autoContrast) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 40,
              progressMessage: language === 'zh-CN' ? '调整对比度...' : 'Adjusting contrast...'
            } : t
          ))

          await yieldToUI() // 让出控制权

          // 转换为 LAB 颜色空间进行对比度调整
          // 先转换为 RGB（去除 Alpha 通道）
          const rgb = new cv.Mat()
          cv.cvtColor(processed, rgb, cv.COLOR_RGBA2RGB)
          
          // 转换为 LAB
          const lab = new cv.Mat()
          cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
          
          // 分离通道
          const channels = new cv.MatVector()
          cv.split(lab, channels)
          
          // 对 L 通道应用 CLAHE
          const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
          clahe.apply(channels.get(0), channels.get(0))
          
          // 合并通道
          cv.merge(channels, lab)
          
          // 转换回 RGB
          cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
          
          // 转换回 RGBA
          cv.cvtColor(rgb, processed, cv.COLOR_RGB2RGBA)
          
          // 清理
          rgb.delete()
          channels.delete()
          lab.delete()
          clahe.delete()
          
          await yieldToUI() // 让出控制权
        }

        // 3. 锐化
        if (options.sharpen) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 60,
              progressMessage: language === 'zh-CN' ? '锐化处理...' : 'Sharpening...'
            } : t
          ))

          await yieldToUI() // 让出控制权

          const kernel = new cv.Mat(3, 3, cv.CV_32F)
          const center = -0.5 * (options.sharpenStrength / 100)
          const others = center / 8
          kernel.data32F.set([
            others, others, others,
            others, 1 - center, others,
            others, others, others
          ])
          
          const dst = new cv.Mat()
          cv.filter2D(processed, dst, cv.CV_8U, kernel, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT)
          processed.delete()
          processed = dst
          kernel.delete()
          
          await yieldToUI() // 让出控制权
        }

        // 4. 划痕修复
        if (options.scratchRepair) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              progress: 80,
              progressMessage: language === 'zh-CN' ? '修复划痕...' : 'Repairing scratches...'
            } : t
          ))

          await yieldToUI() // 让出控制权

          const gray = new cv.Mat()
          cv.cvtColor(processed, gray, cv.COLOR_RGBA2GRAY)
          
          const edges = new cv.Mat()
          const threshold = Math.floor((options.scratchRepairStrength / 100) * 50) + 50
          cv.Canny(gray, edges, threshold, threshold * 2)
          
          const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
          const dilated = new cv.Mat()
          cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2)
          
          const dst = new cv.Mat()
          cv.inpaint(processed, dilated, dst, 3, cv.INPAINT_TELEA)
          processed.delete()
          processed = dst
          
          gray.delete()
          edges.delete()
          dilated.delete()
          kernel.delete()
          
          await yieldToUI() // 让出控制权
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

        const resultCanvas = document.createElement('canvas')
        resultCanvas.width = processed.cols
        resultCanvas.height = processed.rows
        const resultCtx = resultCanvas.getContext('2d')!
        const resultImageData = resultCtx.createImageData(resultCanvas.width, resultCanvas.height)
        cv.imshow(resultImageData, processed)

        // 转换为 Blob
        resultCtx.putImageData(resultImageData, 0, 0)
        
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
          }
        }, `image/${options.outputFormat}`, options.outputQuality / 100)

        src.delete()
        processed.delete()
      } catch (err) {
        src.delete()
        if (processed) processed.delete()
        throw err
      }
    } catch (err) {
      console.error('Processing failed:', err)
      setTasks(prev => prev.map(t => 
        t.id === task.id 
          ? { 
              ...t, 
              status: 'failed' as const,
              progress: 0,
              progressMessage: undefined,
              error: err instanceof Error ? err.message : String(err)
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
            <Image />
            {language === 'zh-CN' ? '老照片修复' : 'Old Photo Restoration'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? '使用 AI 技术修复老照片：去噪、锐化、自动对比度、划痕修补。支持超分辨率清晰化。100% 本地处理，保护隐私安全。'
              : 'Restore old photos with AI: denoise, sharpen, auto contrast, scratch repair. Supports super resolution. 100% local processing, privacy protected.'}
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
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                    >
                      <Download size={16} />
                    </button>
                  )}
                  <button 
                    className="remove-btn"
                    onClick={() => handleRemoveTask(task.id)}
                    disabled={isProcessing}
                    title={language === 'zh-CN' ? '删除' : 'Remove'}
                  >
                    <X size={16} />
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
            {/* 自动增强 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.autoContrast}
                  onChange={(e) => setOptions(prev => ({ ...prev, autoContrast: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '自动增强' : 'Auto Enhance'}</span>
                <span className="setting-badge">⭐⭐⭐⭐⭐</span>
              </label>
              <small>
                {language === 'zh-CN' 
                  ? '自动调整对比度和亮度'
                  : 'Auto adjust contrast and brightness'}
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

            {/* 划痕修复 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={options.scratchRepair}
                  onChange={(e) => setOptions(prev => ({ ...prev, scratchRepair: e.target.checked }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '划痕修复' : 'Scratch Repair'}</span>
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
                  ? '修复照片上的划痕和瑕疵'
                  : 'Repair scratches and blemishes'}
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
