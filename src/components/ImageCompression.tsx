import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Upload, Download, X, AlertCircle, Pause, Play, Trash2, GripVertical, Settings, Eye, EyeOff, CheckSquare, Square, Maximize2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './ImageCompression.css'

// 任务状态
type TaskStatus = 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled'

// 压缩策略
type CompressionMode = 'lossy' | 'lossless'
type AutoFormat = 'auto' | 'webp' | 'jpg' | 'png' | 'avif'

interface CompressionOptions {
  mode: CompressionMode
  quality: number // 0-100
  targetSize?: number // KB
  maxWidth?: number
  maxHeight?: number
  autoFormat: AutoFormat
  preserveMetadata: boolean
}

interface CompressionTask {
  id: string
  file: File
  status: TaskStatus
  progress: number
  stage: 'decode' | 'compress' | 'output'
  originalSize: number
  compressedSize?: number
  originalPreview?: string
  compressedPreview?: string
  error?: string
  options: CompressionOptions
  order: number
}

interface CompressionStats {
  totalOriginalSize: number
  totalCompressedSize: number
  savedSize: number
  savedPercentage: number
  totalFiles: number
  completedFiles: number
}

const MAX_FILES = 20
const MAX_CONCURRENT_WORKERS = 3

export default function ImageCompression() {
  const { language } = useI18n()
  const [tasks, setTasks] = useState<CompressionTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [globalOptions, setGlobalOptions] = useState<CompressionOptions>({
    mode: 'lossy',
    quality: 80,
    autoFormat: 'auto',
    preserveMetadata: true,
    maxWidth: undefined,
    maxHeight: undefined,
    targetSize: undefined
  })
  const [showPreview, setShowPreview] = useState(true)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workerPoolRef = useRef<Worker[]>([])
  const taskQueueRef = useRef<CompressionTask[]>([])
  const activeWorkersRef = useRef<Map<string, Worker>>(new Map())
  const tasksRef = useRef<CompressionTask[]>([])
  const isProcessingRef = useRef(false)
  const isPausedRef = useRef(false)
  const processQueueTimerRef = useRef<number | null>(null)
  const progressThrottleRef = useRef<Map<string, number>>(new Map())

  // 同步 tasks 到 tasksRef（确保 ref 始终是最新的）
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  // 初始化 Worker 池
  useEffect(() => {
    const workers: Worker[] = []
    for (let i = 0; i < MAX_CONCURRENT_WORKERS; i++) {
      try {
        const worker = new Worker(new URL('../workers/imageCompression.worker.ts', import.meta.url), { type: 'module' })
        workers.push(worker)
      } catch (err) {
        console.warn(`Failed to create worker ${i}:`, err)
      }
    }
    workerPoolRef.current = workers

    return () => {
      // 清理定时器
      if (processQueueTimerRef.current) {
        clearTimeout(processQueueTimerRef.current)
        processQueueTimerRef.current = null
      }
      // 清理 workers
      workers.forEach(worker => worker.terminate())
      // 清理对象 URL
      tasksRef.current.forEach(task => {
        if (task.originalPreview) URL.revokeObjectURL(task.originalPreview)
        if (task.compressedPreview) URL.revokeObjectURL(task.compressedPreview)
      })
    }
  }, [])

  // 支持的图片格式
  const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/avif', 'image/heic', 'image/heif']

  // 文件上传处理
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    
    // 检查文件数量限制
    if (tasks.length + fileArray.length > MAX_FILES) {
      const message = language === 'zh-CN' 
        ? `最多只能处理 ${MAX_FILES} 张图片，当前已有 ${tasks.length} 张，请删除部分后再添加`
        : `Maximum ${MAX_FILES} images allowed. You have ${tasks.length} images. Please remove some before adding more.`
      alert(message)
      return
    }

    const newTasks: CompressionTask[] = []
    let order = tasks.length

    for (const file of fileArray) {
      // 检查文件类型
      const isImage = supportedFormats.some(format => file.type === format) || 
                     /\.(jpg|jpeg|png|webp|gif|bmp|tiff|svg|avif|heic|heif)$/i.test(file.name)
      
      if (!isImage) {
        continue
      }

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const preview = URL.createObjectURL(file)

      newTasks.push({
        id: taskId,
        file,
        status: 'pending',
        progress: 0,
        stage: 'decode' as const,
        originalSize: file.size,
        originalPreview: preview,
        options: { ...globalOptions },
        order: order++
      })
    }

    setTasks(prev => {
      const updatedTasks = [...prev, ...newTasks]
      tasksRef.current = updatedTasks
      return updatedTasks
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [tasks.length, globalOptions, language, supportedFormats])

  // 拖拽上传
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    
    if (tasks.length + files.length > MAX_FILES) {
      const message = language === 'zh-CN' 
        ? `最多只能处理 ${MAX_FILES} 张图片`
        : `Maximum ${MAX_FILES} images allowed`
      alert(message)
      return
    }

    const dataTransfer = new DataTransfer()
    files.forEach(file => dataTransfer.items.add(file))
    
    const input = fileInputRef.current
    if (input) {
      input.files = dataTransfer.files
      const event = new Event('change', { bubbles: true })
      input.dispatchEvent(event)
    }
  }, [tasks.length, language])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // 处理单个任务
  const processTask = useCallback(async (task: CompressionTask, worker: Worker): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 标记 worker 为使用中
      activeWorkersRef.current.set(task.id, worker)

      const messageHandler = (e: MessageEvent) => {
        const { type, taskId, progress, stage, result, error } = e.data

        if (taskId !== task.id) return

        if (type === 'progress') {
          // 节流进度更新：每100ms最多更新一次
          const now = Date.now()
          const lastUpdate = progressThrottleRef.current.get(taskId) || 0
          
          if (now - lastUpdate < 100 && progress < 100) {
            // 跳过这次更新，除非是最后一步
            return
          }
          
          progressThrottleRef.current.set(taskId, now)
          
          // 使用函数式更新，避免依赖 tasks
          setTasks(prev => {
            const newTasks = prev.map(t => 
              t.id === taskId 
                ? { ...t, progress, stage: stage as 'decode' | 'compress' | 'output', status: 'processing' as TaskStatus }
                : t
            )
            tasksRef.current = newTasks
            return newTasks
          })
        } else if (type === 'complete') {
          // 清除节流记录
          progressThrottleRef.current.delete(taskId)
          const compressedBlob = new Blob([result.data], { type: result.mimeType })
          const compressedPreview = URL.createObjectURL(compressedBlob)
          
          setTasks(prev => {
            const newTasks = prev.map(t => 
              t.id === taskId 
                ? { 
                    ...t, 
                    status: 'completed' as TaskStatus,
                    progress: 100,
                    compressedSize: compressedBlob.size,
                    compressedPreview,
                    stage: 'output' as const
                  }
                : t
            )
            tasksRef.current = newTasks
            return newTasks
          })

          worker.removeEventListener('message', messageHandler)
          activeWorkersRef.current.delete(task.id)
          resolve()
        } else if (type === 'error') {
          // 清除节流记录
          progressThrottleRef.current.delete(taskId)
          const errorMessage = error || (language === 'zh-CN' ? '处理失败：未知错误' : 'Processing failed: Unknown error')
          setTasks(prev => {
            const newTasks = prev.map(t => 
              t.id === taskId 
                ? { 
                    ...t, 
                    status: 'failed' as TaskStatus,
                    error: errorMessage
                  }
                : t
            )
            tasksRef.current = newTasks
            return newTasks
          })

          worker.removeEventListener('message', messageHandler)
          activeWorkersRef.current.delete(task.id)
          reject(new Error(errorMessage))
        }
      }

      worker.addEventListener('message', messageHandler)

      // 发送任务到 Worker
      const fileReader = new FileReader()
      fileReader.onload = () => {
        worker.postMessage({
          type: 'compress',
          taskId: task.id,
          fileData: fileReader.result,
          fileName: task.file.name,
          fileType: task.file.type,
          options: task.options
        })
      }
      fileReader.onerror = () => {
        activeWorkersRef.current.delete(task.id)
        reject(new Error(language === 'zh-CN' ? '文件读取失败' : 'File read failed'))
      }
      fileReader.readAsArrayBuffer(task.file)
    })
  }, [language])

  // 处理队列（使用 ref 避免依赖 tasks，防止无限循环）
  const processQueue = useCallback(async () => {
    // 清除之前的定时器
    if (processQueueTimerRef.current) {
      clearTimeout(processQueueTimerRef.current)
      processQueueTimerRef.current = null
    }

    if (isPausedRef.current || !isProcessingRef.current) return

    // 使用 ref 获取最新的 tasks，而不是依赖 state
    const currentTasks = tasksRef.current

    const pendingTasks = currentTasks.filter(t => t.status === 'pending' || (t.status === 'paused' && !isPausedRef.current))
    if (pendingTasks.length === 0) {
      if (activeWorkersRef.current.size === 0) {
        isProcessingRef.current = false
        setIsProcessing(false)
      }
      return
    }

    // 找到可用的 worker（不在 activeWorkers 中的）
    const usedWorkers = new Set(Array.from(activeWorkersRef.current.values()))
    const availableWorkers = workerPoolRef.current.filter(w => !usedWorkers.has(w))

    if (availableWorkers.length === 0) {
      // 没有可用 worker，等待一段时间后重试
      processQueueTimerRef.current = window.setTimeout(() => processQueue(), 200)
      return
    }

    // 处理下一个待处理任务
    const task = pendingTasks[0]
    const worker = availableWorkers[0]

    try {
      await processTask(task, worker)
      // 继续处理下一个
      processQueueTimerRef.current = window.setTimeout(() => processQueue(), 100)
    } catch (err) {
      console.error('Task processing error:', err)
      processQueueTimerRef.current = window.setTimeout(() => processQueue(), 100)
    }
  }, [processTask])

  // 开始处理
  const handleStart = useCallback(() => {
    if (tasks.length === 0) return

    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused')
    if (pendingTasks.length === 0) return

    taskQueueRef.current = [...tasks]
    tasksRef.current = tasks
    isProcessingRef.current = true
    isPausedRef.current = false
    setIsProcessing(true)
    setIsPaused(false)
    processQueue()
  }, [tasks, processQueue])

  // 暂停
  const handlePause = useCallback(() => {
    isPausedRef.current = true
    setIsPaused(true)
    // 清除队列处理定时器
    if (processQueueTimerRef.current) {
      clearTimeout(processQueueTimerRef.current)
      processQueueTimerRef.current = null
    }
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.status === 'processing' ? { ...t, status: 'paused' as TaskStatus } : t
      )
      tasksRef.current = newTasks
      return newTasks
    })
    // 注意：Worker 中的任务无法真正暂停，只能标记状态
  }, [])

  // 继续
  const handleResume = useCallback(() => {
    isPausedRef.current = false
    setIsPaused(false)
    processQueue()
  }, [processQueue])

  // 取消
  const handleCancel = useCallback(() => {
    isProcessingRef.current = false
    isPausedRef.current = false
    setIsProcessing(false)
    setIsPaused(false)
    
    // 清除队列处理定时器
    if (processQueueTimerRef.current) {
      clearTimeout(processQueueTimerRef.current)
      processQueueTimerRef.current = null
    }
    
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.status === 'processing' || t.status === 'paused' 
          ? { ...t, status: 'cancelled' as TaskStatus, progress: 0 }
          : t
      )
      tasksRef.current = newTasks
      return newTasks
    })
    // 清理 worker 引用
    activeWorkersRef.current.clear()
    // 清理节流记录
    progressThrottleRef.current.clear()
  }, [])

  // 删除任务
  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId)
      if (task?.originalPreview) URL.revokeObjectURL(task.originalPreview)
      if (task?.compressedPreview) URL.revokeObjectURL(task.compressedPreview)
      const newTasks = prev.filter(t => t.id !== taskId).map((t, idx) => ({ ...t, order: idx }))
      tasksRef.current = newTasks
      return newTasks
    })
  }, [])

  // 更新任务选项（只重新处理选中项）
  const handleUpdateTaskOptions = useCallback((taskId: string, options: Partial<CompressionOptions>) => {
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.id === taskId 
          ? { 
              ...t, 
              options: { ...t.options, ...options }, 
              status: 'pending' as TaskStatus, 
              progress: 0,
              compressedSize: undefined,
              compressedPreview: undefined,
              error: undefined
            }
          : t
      )
      tasksRef.current = newTasks
      return newTasks
    })
  }, [])

  // 批量应用全局设置到选中任务
  const handleApplyGlobalToSelected = useCallback(() => {
    setTasks(prev => {
      const newTasks = prev.map(t => {
        const shouldUpdate = selectedTasks.size === 0
          ? (t.status === 'pending' || t.status === 'completed' || t.status === 'failed')
          : selectedTasks.has(t.id)
        
        return shouldUpdate
          ? { 
              ...t, 
              options: { ...globalOptions }, 
              status: 'pending' as TaskStatus, 
              progress: 0,
              compressedSize: undefined,
              compressedPreview: undefined,
              error: undefined
            }
          : t
      })
      tasksRef.current = newTasks
      return newTasks
    })
  }, [selectedTasks, globalOptions])

  // 切换任务选中状态
  const handleToggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }, [])

  // 全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(tasks.map(t => t.id)))
    }
  }, [selectedTasks, tasks])

  // 拖拽排序
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOverItem = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    setTasks(prev => {
      const newTasks = [...prev]
      const draggedTask = newTasks[draggedIndex]
      newTasks.splice(draggedIndex, 1)
      newTasks.splice(index, 0, draggedTask)
      const reorderedTasks = newTasks.map((t, idx) => ({ ...t, order: idx }))
      tasksRef.current = reorderedTasks
      return reorderedTasks
    })
    setDraggedIndex(index)
  }, [draggedIndex])

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
  }, [])

  // 计算统计信息（使用 useMemo 优化，避免频繁重新计算）
  const stats: CompressionStats = useMemo(() => {
    const completedTasks = tasks.filter(t => t.status === 'completed')
    const totalOriginal = tasks.reduce((sum, t) => sum + t.originalSize, 0)
    const totalCompressed = completedTasks.reduce((sum, t) => sum + (t.compressedSize || 0), 0)
    const saved = totalOriginal - totalCompressed
    const savedPercentage = totalOriginal > 0 ? (saved / totalOriginal) * 100 : 0

    return {
      totalOriginalSize: totalOriginal,
      totalCompressedSize: totalCompressed,
      savedSize: saved,
      savedPercentage,
      totalFiles: tasks.length,
      completedFiles: completedTasks.length
    }
  }, [tasks])

  // 下载单个文件
  const handleDownloadSingle = useCallback((task: CompressionTask) => {
    if (!task.compressedPreview) return
    fetch(task.compressedPreview)
      .then(res => res.blob())
      .then(blob => {
        const ext = task.options.autoFormat === 'auto' ? 'webp' : task.options.autoFormat
        const fileName = task.file.name.replace(/\.[^/.]+$/, '') + `_compressed.${ext}`
        saveAs(blob, fileName)
      })
  }, [])

  // 下载全部
  const handleDownloadAll = useCallback(async () => {
    const completedTasks = tasks.filter(t => t.status === 'completed')
    if (completedTasks.length === 0) return

    if (completedTasks.length === 1) {
      handleDownloadSingle(completedTasks[0])
      return
    }

    const zip = new JSZip()
    
    for (const task of completedTasks) {
      if (!task.compressedPreview) continue
      const blob = await fetch(task.compressedPreview).then(r => r.blob())
      const ext = task.options.autoFormat === 'auto' ? 'webp' : task.options.autoFormat
      const fileName = task.file.name.replace(/\.[^/.]+$/, '') + `_compressed.${ext}`
      zip.file(fileName, blob)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    saveAs(zipBlob, 'compressed_images.zip')
  }, [tasks, handleDownloadSingle])

  // 播放完成音效
  const playSuccessSound = useCallback(() => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MTqTj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDE6k4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC')
      audio.volume = 0.3
      audio.play().catch(() => {})
    } catch (err) {
      // 忽略音效错误
    }
  }, [])

  // 当所有任务完成时播放音效
  useEffect(() => {
    const allCompleted = tasks.length > 0 && tasks.every(t => t.status === 'completed' || t.status === 'failed')
    if (allCompleted && isProcessing) {
      playSuccessSound()
      isProcessingRef.current = false
      setIsProcessing(false)
      // 清除队列处理定时器
      if (processQueueTimerRef.current) {
        clearTimeout(processQueueTimerRef.current)
        processQueueTimerRef.current = null
      }
    }
  }, [tasks, isProcessing, playSuccessSound])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className="image-compression-container">
      {/* 上传区域 */}
      <div 
        className="upload-area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <Upload size={48} />
        <p className="upload-text">
          {language === 'zh-CN' 
            ? '拖拽图片到此处或点击上传（最多20张）'
            : 'Drag images here or click to upload (max 20)'}
        </p>
        <button 
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          {language === 'zh-CN' ? '选择文件' : 'Select Files'}
        </button>
      </div>

      {/* 全局设置 */}
      {tasks.length > 0 && (
        <div className="global-settings">
          <h3>
            <Settings size={20} />
            {language === 'zh-CN' ? '压缩设置' : 'Compression Settings'}
          </h3>
          <div className="settings-grid">
            <div className="setting-item">
              <label>{language === 'zh-CN' ? '压缩模式' : 'Mode'}</label>
              <select 
                value={globalOptions.mode}
                onChange={(e) => setGlobalOptions(prev => ({ ...prev, mode: e.target.value as CompressionMode }))}
              >
                <option value="lossy">{language === 'zh-CN' ? '有损' : 'Lossy'}</option>
                <option value="lossless">{language === 'zh-CN' ? '无损' : 'Lossless'}</option>
              </select>
            </div>
            <div className="setting-item">
              <label>{language === 'zh-CN' ? '质量' : 'Quality'}</label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={globalOptions.quality}
                onChange={(e) => setGlobalOptions(prev => ({ ...prev, quality: parseInt(e.target.value) }))}
              />
              <span>{globalOptions.quality}%</span>
            </div>
            <div className="setting-item">
              <label>{language === 'zh-CN' ? '目标格式' : 'Format'}</label>
              <select 
                value={globalOptions.autoFormat}
                onChange={(e) => setGlobalOptions(prev => ({ ...prev, autoFormat: e.target.value as AutoFormat }))}
              >
                <option value="auto">{language === 'zh-CN' ? '自动最佳' : 'Auto Best'}</option>
                <option value="webp">WebP</option>
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
                <option value="avif">AVIF</option>
              </select>
            </div>
          </div>
          <div className="settings-advanced-toggle">
            <button 
              className="btn-link"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            >
              <Maximize2 size={16} />
              {language === 'zh-CN' ? '高级设置' : 'Advanced Settings'}
            </button>
            {selectedTasks.size > 0 && (
              <button 
                className="btn-primary-small"
                onClick={handleApplyGlobalToSelected}
              >
                {language === 'zh-CN' ? `应用到选中 (${selectedTasks.size})` : `Apply to Selected (${selectedTasks.size})`}
              </button>
            )}
            <button 
              className="btn-primary-small"
              onClick={handleApplyGlobalToSelected}
            >
              {language === 'zh-CN' ? '应用到全部' : 'Apply to All'}
            </button>
          </div>
          {showAdvancedSettings && (
            <div className="settings-advanced">
              <div className="settings-grid">
                <div className="setting-item">
                  <label>{language === 'zh-CN' ? '目标大小 (KB)' : 'Target Size (KB)'}</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder={language === 'zh-CN' ? '例如: 300' : 'e.g.: 300'}
                    value={globalOptions.targetSize || ''}
                    onChange={(e) => setGlobalOptions(prev => ({ 
                      ...prev, 
                      targetSize: e.target.value ? parseInt(e.target.value) : undefined 
                    }))}
                  />
                </div>
                <div className="setting-item">
                  <label>{language === 'zh-CN' ? '最大宽度 (px)' : 'Max Width (px)'}</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder={language === 'zh-CN' ? '例如: 1920' : 'e.g.: 1920'}
                    value={globalOptions.maxWidth || ''}
                    onChange={(e) => setGlobalOptions(prev => ({ 
                      ...prev, 
                      maxWidth: e.target.value ? parseInt(e.target.value) : undefined 
                    }))}
                  />
                </div>
                <div className="setting-item">
                  <label>{language === 'zh-CN' ? '最大高度 (px)' : 'Max Height (px)'}</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder={language === 'zh-CN' ? '例如: 1080' : 'e.g.: 1080'}
                    value={globalOptions.maxHeight || ''}
                    onChange={(e) => setGlobalOptions(prev => ({ 
                      ...prev, 
                      maxHeight: e.target.value ? parseInt(e.target.value) : undefined 
                    }))}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      {tasks.length > 0 && (
        <div className="tasks-container">
          <div className="tasks-header">
            <div className="tasks-header-left">
              <h3>
                {language === 'zh-CN' ? '处理队列' : 'Processing Queue'} 
                <span className="task-count">({tasks.length}/{MAX_FILES})</span>
              </h3>
              {tasks.length > 0 && (
                <button 
                  className="btn-link"
                  onClick={handleToggleSelectAll}
                  title={language === 'zh-CN' ? '全选/取消全选' : 'Select All / Deselect All'}
                >
                  {selectedTasks.size === tasks.length ? <CheckSquare size={18} /> : <Square size={18} />}
                  {language === 'zh-CN' 
                    ? selectedTasks.size === tasks.length ? '取消全选' : '全选'
                    : selectedTasks.size === tasks.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            <div className="action-buttons">
              {!isProcessing && (
                <button className="btn-primary" onClick={handleStart}>
                  <Play size={16} />
                  {language === 'zh-CN' ? '开始处理' : 'Start'}
                </button>
              )}
              {isProcessing && !isPaused && (
                <button className="btn-secondary" onClick={handlePause}>
                  <Pause size={16} />
                  {language === 'zh-CN' ? '暂停' : 'Pause'}
                </button>
              )}
              {isProcessing && isPaused && (
                <button className="btn-primary" onClick={handleResume}>
                  <Play size={16} />
                  {language === 'zh-CN' ? '继续' : 'Resume'}
                </button>
              )}
              {isProcessing && (
                <button className="btn-danger" onClick={handleCancel}>
                  <X size={16} />
                  {language === 'zh-CN' ? '取消' : 'Cancel'}
                </button>
              )}
              <button 
                className="btn-icon"
                onClick={() => setShowPreview(!showPreview)}
                title={language === 'zh-CN' ? '切换预览' : 'Toggle Preview'}
              >
                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="tasks-list">
            {tasks.map((task, index) => (
              <div 
                key={task.id}
                className={`task-item ${task.status} ${selectedTasks.has(task.id) ? 'selected' : ''}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOverItem(e, index)}
                onDragEnd={handleDragEnd}
              >
                <button
                  className="task-checkbox"
                  onClick={() => handleToggleTaskSelection(task.id)}
                  title={language === 'zh-CN' ? '选择/取消选择' : 'Select / Deselect'}
                >
                  {selectedTasks.has(task.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
                <div className="task-drag-handle">
                  <GripVertical size={16} />
                </div>
                
                {showPreview && task.originalPreview && (
                  <div className="task-preview">
                    <img src={task.originalPreview} alt="Original" />
                    {task.compressedPreview && (
                      <img src={task.compressedPreview} alt="Compressed" />
                    )}
                  </div>
                )}

                <div className="task-info">
                  <div className="task-name">{task.file.name}</div>
                  <div className="task-details">
                    <span>{formatFileSize(task.originalSize)}</span>
                    {task.compressedSize && (
                      <>
                        <span>→</span>
                        <span>{formatFileSize(task.compressedSize)}</span>
                        <span className="saved">
                          ({((1 - task.compressedSize / task.originalSize) * 100).toFixed(1)}% {language === 'zh-CN' ? '节省' : 'saved'})
                        </span>
                      </>
                    )}
                  </div>
                  {task.status === 'processing' && (
                    <div className="task-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        {task.stage === 'decode' && (language === 'zh-CN' ? '解码' : 'Decoding')}
                        {task.stage === 'compress' && (language === 'zh-CN' ? '压缩' : 'Compressing')}
                        {task.stage === 'output' && (language === 'zh-CN' ? '输出' : 'Output')}
                        : {task.progress}%
                      </span>
                    </div>
                  )}
                  {task.status === 'failed' && task.error && (
                    <div className="task-error">
                      <AlertCircle size={14} />
                      {task.error}
                    </div>
                  )}
                </div>

                <div className="task-actions">
                  {task.status === 'completed' && (
                    <button 
                      className="btn-icon"
                      onClick={() => handleDownloadSingle(task)}
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                    >
                      <Download size={16} />
                    </button>
                  )}
                  {(task.status === 'pending' || task.status === 'completed' || task.status === 'failed') && (
                    <button 
                      className="btn-icon"
                      onClick={() => {
                        const modal = document.createElement('div')
                        modal.className = 'task-settings-modal'
                        modal.innerHTML = `
                          <div class="modal-content">
                            <h3>${language === 'zh-CN' ? '单独设置' : 'Individual Settings'}</h3>
                            <div class="modal-settings">
                              <div class="setting-item">
                                <label>${language === 'zh-CN' ? '质量' : 'Quality'}</label>
                                <input type="range" min="0" max="100" value="${task.options.quality}" id="task-quality-${task.id}" />
                                <span id="task-quality-value-${task.id}">${task.options.quality}%</span>
                              </div>
                              <div class="setting-item">
                                <label>${language === 'zh-CN' ? '目标大小 (KB)' : 'Target Size (KB)'}</label>
                                <input type="number" min="0" value="${task.options.targetSize || ''}" id="task-target-${task.id}" placeholder="${language === 'zh-CN' ? '例如: 300' : 'e.g.: 300'}" />
                              </div>
                            </div>
                            <div class="modal-actions">
                              <button class="btn-primary" id="task-apply-${task.id}">${language === 'zh-CN' ? '应用' : 'Apply'}</button>
                              <button class="btn-secondary" id="task-cancel-${task.id}">${language === 'zh-CN' ? '取消' : 'Cancel'}</button>
                            </div>
                          </div>
                        `
                        document.body.appendChild(modal)
                        
                        const qualityInput = document.getElementById(`task-quality-${task.id}`) as HTMLInputElement
                        const qualityValue = document.getElementById(`task-quality-value-${task.id}`)
                        const targetInput = document.getElementById(`task-target-${task.id}`) as HTMLInputElement
                        const applyBtn = document.getElementById(`task-apply-${task.id}`)
                        const cancelBtn = document.getElementById(`task-cancel-${task.id}`)
                        
                        qualityInput?.addEventListener('input', (e) => {
                          if (qualityValue) {
                            qualityValue.textContent = (e.target as HTMLInputElement).value + '%'
                          }
                        })
                        
                        applyBtn?.addEventListener('click', () => {
                          handleUpdateTaskOptions(task.id, {
                            quality: parseInt(qualityInput.value),
                            targetSize: targetInput.value ? parseInt(targetInput.value) : undefined
                          })
                          document.body.removeChild(modal)
                        })
                        
                        cancelBtn?.addEventListener('click', () => {
                          document.body.removeChild(modal)
                        })
                      }}
                      title={language === 'zh-CN' ? '单独设置' : 'Individual Settings'}
                    >
                      <Settings size={16} />
                    </button>
                  )}
                  <button 
                    className="btn-icon"
                    onClick={() => handleRemoveTask(task.id)}
                    title={language === 'zh-CN' ? '删除' : 'Remove'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 统计信息 */}
      {stats.completedFiles > 0 && (
        <div className="stats-container">
          <div className="stats-card">
            <div className="stats-label">{language === 'zh-CN' ? '原始大小' : 'Original Size'}</div>
            <div className="stats-value">{formatFileSize(stats.totalOriginalSize)}</div>
          </div>
          <div className="stats-card">
            <div className="stats-label">{language === 'zh-CN' ? '压缩后' : 'Compressed'}</div>
            <div className="stats-value">{formatFileSize(stats.totalCompressedSize)}</div>
          </div>
          <div className="stats-card highlight">
            <div className="stats-label">{language === 'zh-CN' ? '节省' : 'Saved'}</div>
            <div className="stats-value-large">
              {formatFileSize(stats.savedSize)}
            </div>
            <div className="stats-percentage">
              {stats.savedPercentage.toFixed(1)}%
            </div>
          </div>
          <div className="stats-actions">
            <button className="btn-primary" onClick={handleDownloadAll}>
              <Download size={20} />
              {language === 'zh-CN' ? '下载全部' : 'Download All'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
