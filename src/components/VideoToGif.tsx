import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Video, Settings, Loader2, AlertCircle, Play, CheckCircle2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { saveAs } from 'file-saver'
import './VideoToGif.css'

const MAX_FILES = 5
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

interface ConversionTask {
  id: string
  file: File
  preview: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  progressMessage?: string
  result?: Blob
  resultUrl?: string
  error?: string
  startTime?: number
  endTime?: number
}

export default function VideoToGif() {
  const { language } = useI18n()
  const [files, setFiles] = useState<File[]>([])
  const [tasks, setTasks] = useState<ConversionTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState('')
  
  // GIF 设置
  const [gifQuality, setGifQuality] = useState(3) // 0-5, 越低越好（bayer_scale 的有效范围）
  const [gifFps, setGifFps] = useState(10) // 帧率
  const [gifWidth, setGifWidth] = useState(480) // 宽度
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)

  // 加载 FFmpeg
  const loadFFmpeg = useCallback(async (): Promise<boolean> => {
    if (ffmpegLoaded || ffmpegLoading) return ffmpegLoaded
    
    setFfmpegLoading(true)
    setLoadingProgress(language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...')

    try {
      const ffmpeg = new FFmpeg()
      
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]:', message)
      })

      // 检查环境
      if (typeof SharedArrayBuffer === 'undefined') {
        throw new Error('SharedArrayBuffer not available - check server headers')
      }

      // 优先使用本地文件
      const isDev = import.meta.env.DEV
      let baseURL = isDev 
        ? window.location.origin 
        : (window.location.origin + import.meta.env.BASE_URL)
      baseURL = baseURL.replace(/\/+$/, '')
      
      const localCore = `${baseURL}/ffmpeg-core.js`
      const localWasm = `${baseURL}/ffmpeg-core.wasm`

      try {
        // 检查本地文件
        const coreRes = await fetch(localCore, { method: 'HEAD' })
        const wasmRes = await fetch(localWasm, { method: 'HEAD' })
        
        if (coreRes.ok && wasmRes.ok) {
          const coreSize = parseInt(coreRes.headers.get('content-length') || '0', 10)
          const wasmSize = parseInt(wasmRes.headers.get('content-length') || '0', 10)
          
          if (coreSize > 50000 && wasmSize > 20000000) {
            setLoadingProgress(language === 'zh-CN' ? '正在加载本地文件...' : 'Loading local files...')
            
            const coreBlobURL = await toBlobURL(localCore, 'text/javascript')
            const wasmBlobURL = await toBlobURL(localWasm, 'application/wasm')
            
            setLoadingProgress(language === 'zh-CN' ? '正在初始化 FFmpeg...' : 'Initializing FFmpeg...')
            
            await ffmpeg.load({
              coreURL: coreBlobURL,
              wasmURL: wasmBlobURL,
            })
            
            ffmpegRef.current = ffmpeg
            setFfmpegLoaded(true)
            setFfmpegLoading(false)
            setLoadingProgress('')
            return true
          }
        }
      } catch (localErr) {
        console.warn('Local file load failed, trying CDN:', localErr)
      }

      // CDN 回退
      setLoadingProgress(language === 'zh-CN' ? '正在从 CDN 加载...' : 'Loading from CDN...')
      
      const cdnBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
      const coreCDN = `${cdnBase}/ffmpeg-core.js`
      const wasmCDN = `${cdnBase}/ffmpeg-core.wasm`
      
      const coreBlobURL = await toBlobURL(coreCDN, 'text/javascript')
      const wasmBlobURL = await toBlobURL(wasmCDN, 'application/wasm')
      
      setLoadingProgress(language === 'zh-CN' ? '正在初始化 FFmpeg...' : 'Initializing FFmpeg...')
      
      await ffmpeg.load({
        coreURL: coreBlobURL,
        wasmURL: wasmBlobURL,
      })
      
      ffmpegRef.current = ffmpeg
      setFfmpegLoaded(true)
      setFfmpegLoading(false)
      setLoadingProgress('')
      return true
    } catch (err) {
      console.error('FFmpeg load failed:', err)
      setFfmpegLoading(false)
      setLoadingProgress('')
      alert(
        language === 'zh-CN'
          ? 'FFmpeg 加载失败，请刷新页面重试'
          : 'FFmpeg load failed, please refresh and retry'
      )
      return false
    }
  }, [ffmpegLoaded, ffmpegLoading, language])

  // 预加载 FFmpeg
  useEffect(() => {
    if (!ffmpegLoaded && !ffmpegLoading) {
      loadFFmpeg().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 文件上传处理
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return

    const fileArray = Array.from(uploadedFiles)
    
    // 检查文件数量限制
    if (tasks.length + fileArray.length > MAX_FILES) {
      alert(
        language === 'zh-CN' 
          ? `最多只能处理 ${MAX_FILES} 个视频`
          : `Maximum ${MAX_FILES} videos allowed`
      )
      return
    }

    const newTasks: ConversionTask[] = []

    for (const file of fileArray) {
      // 检查文件类型
      if (!file.type.startsWith('video/')) {
        alert(
          language === 'zh-CN' 
            ? `不是视频文件: ${file.name}`
            : `Not a video file: ${file.name}`
        )
        continue
      }

      // 检查文件大小
      if (file.size > MAX_FILE_SIZE) {
        alert(
          language === 'zh-CN' 
            ? `文件过大 (最大500MB): ${file.name}`
            : `File too large (max 500MB): ${file.name}`
        )
        continue
      }

      const preview = URL.createObjectURL(file)
      const taskId = `${Date.now()}-${Math.random()}`

      newTasks.push({
        id: taskId,
        file,
        preview,
        status: 'pending',
        progress: 0
      })
    }

    setTasks(prev => [...prev, ...newTasks])
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [tasks.length, language])

  // 转换单个视频为 GIF
  const convertToGif = useCallback(async (task: ConversionTask): Promise<void> => {
    if (!ffmpegRef.current) {
      const loaded = await loadFFmpeg()
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg not loaded')
      }
    }

    const ffmpeg = ffmpegRef.current
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
      // 写入输入文件
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 10,
          progressMessage: language === 'zh-CN' ? '读取视频文件...' : 'Reading video file...'
        } : t
      ))

      const fileData = await fetchFile(task.file)
      const inputExt = task.file.name.split('.').pop()?.toLowerCase() || 'mp4'
      await ffmpeg.writeFile(`input.${inputExt}`, fileData)

      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 20,
          progressMessage: language === 'zh-CN' ? '开始转换...' : 'Starting conversion...'
        } : t
      ))

      // 设置进度监听器
      let lastProgressUpdate = 0
      const PROGRESS_UPDATE_INTERVAL = 200 // 每200ms更新一次
      
      const progressHandler = ({ progress: prog }: { progress: number }) => {
        const now = Date.now()
        if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) return
        lastProgressUpdate = now

        // FFmpeg progress 是 0-1 之间的值，转换为 20-90 的进度范围
        const progressPercent = Math.round(20 + prog * 70)
        
        setTasks(prev => prev.map(t => {
          if (t.id === task.id && t.status === 'processing') {
            return {
              ...t,
              progress: progressPercent,
              progressMessage: language === 'zh-CN' 
                ? `转换中... ${progressPercent}%` 
                : `Converting... ${progressPercent}%`
            }
          }
          return t
        }))
      }

      ffmpeg.on('progress', progressHandler)

      // 生成 GIF
      const filterComplex = `fps=${gifFps},scale=${gifWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${gifQuality}:diff_mode=rectangle`
      
      await ffmpeg.exec([
        '-i', `input.${inputExt}`,
        '-filter_complex', filterComplex,
        '-loop', '0',
        'output.gif'
      ])

      // 移除进度监听器
      ffmpeg.off('progress', progressHandler)

      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 90,
          progressMessage: language === 'zh-CN' ? '生成 GIF 文件...' : 'Generating GIF...'
        } : t
      ))

      // 读取输出文件
      const data = await ffmpeg.readFile('output.gif')
      const blob = new Blob([data as any], { type: 'image/gif' })
      const resultUrl = URL.createObjectURL(blob)

      // 清理文件
      try {
        await ffmpeg.deleteFile(`input.${inputExt}`)
        await ffmpeg.deleteFile('output.gif')
      } catch (err) {
        console.warn('Failed to clean up:', err)
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(1)

      // 更新任务状态
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
              endTime
            } 
          : t
      ))

      // 播放完成音效（可选）
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MT6bj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDE+m4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC')
        audio.volume = 0.3
        audio.play().catch(() => {}) // 忽略播放错误
      } catch (err) {
        // 忽略音效错误
      }
    } catch (err) {
      console.error('Conversion failed:', err)
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
  }, [gifFps, gifWidth, gifQuality, loadFFmpeg, language])

  // 处理所有任务
  const handleProcess = useCallback(async () => {
    if (tasks.length === 0) return

    const pendingTasks = tasks.filter(t => t.status === 'pending')
    if (pendingTasks.length === 0) return

    setIsProcessing(true)

    try {
      for (const task of pendingTasks) {
        try {
          await convertToGif(task)
        } catch (err) {
          console.error(`Failed to convert ${task.file.name}:`, err)
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [tasks, convertToGif])

  // 下载单个文件
  const handleDownload = useCallback((task: ConversionTask) => {
    if (!task.result || !task.resultUrl) return
    
    const fileName = task.file.name.replace(/\.[^/.]+$/, '') + '.gif'
    saveAs(task.result, fileName)
  }, [])

  // 下载全部
  const handleDownloadAll = useCallback(async () => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.result)
    if (completedTasks.length === 0) return

    for (const task of completedTasks) {
      if (task.result) {
        const fileName = task.file.name.replace(/\.[^/.]+$/, '') + '.gif'
        saveAs(task.result, fileName)
        // 延迟一下，避免浏览器阻止多个下载
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }, [tasks])

  // 删除任务
  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId)
      if (task?.preview) URL.revokeObjectURL(task.preview)
      if (task?.resultUrl) URL.revokeObjectURL(task.resultUrl)
      return prev.filter(t => t.id !== taskId)
    })
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="video-to-gif">
      {/* Header */}
      <div className="converter-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Video />
            {language === 'zh-CN' ? 'MP4 转 GIF' : 'MP4 To GIF'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? '将 MP4、MOV、WebM 等视频格式转换为 GIF 动图。支持批量处理、自定义质量、帧率和尺寸。使用 FFmpeg WebAssembly，100% 本地处理，保护隐私安全。'
              : 'Convert MP4, MOV, WebM and other video formats to animated GIF. Supports batch processing, custom quality, frame rate and size. Uses FFmpeg WebAssembly, 100% local processing, privacy-friendly.'}
          </p>
        </div>
      </div>

      {/* FFmpeg Loading Overlay */}
      {ffmpegLoading && (
        <div className="ffmpeg-loading-overlay">
          <div className="loading-spinner"></div>
          <p className="loading-title">
            {language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...'}
          </p>
          {loadingProgress && (
            <p className="loading-progress">{loadingProgress}</p>
          )}
          <p className="loading-hint">
            {language === 'zh-CN' 
              ? '首次加载需要下载约 30MB 文件，请耐心等待...' 
              : 'First load requires ~30MB download, please wait...'}
          </p>
        </div>
      )}

      {/* Upload Section */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isProcessing || ffmpegLoading}
        />
        
        <div
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={48} />
          <span>{language === 'zh-CN' ? '上传视频文件' : 'Upload Videos'}</span>
          <small>
            {language === 'zh-CN' 
              ? '支持 MP4, MOV, WebM 等格式，最多 5 个文件，每个最大 500MB'
              : 'Supports MP4, MOV, WebM, max 5 files, 500MB each'}
          </small>
        </div>

        {tasks.length > 0 && (
          <div className="file-list">
            {tasks.map((task) => (
              <div key={task.id} className={`file-item ${task.status}`}>
                <div className="file-preview">
                  <video src={task.preview} muted />
                </div>
                <div className="file-info">
                  <span className="file-name">{task.file.name}</span>
                  <span className="file-size">{formatFileSize(task.file.size)}</span>
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
                <div className="file-actions">
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
          <h3><Settings /> {language === 'zh-CN' ? 'GIF 设置' : 'GIF Settings'}</h3>
          
          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? 'GIF 质量' : 'GIF Quality'}: {gifQuality}
            </label>
            <input
              type="range"
              min="0"
              max="5"
              value={gifQuality}
              onChange={(e) => setGifQuality(parseInt(e.target.value))}
              disabled={isProcessing}
            />
            <small>
              {language === 'zh-CN' 
                ? '0-5，数值越低质量越高（文件越大）'
                : '0-5, lower is better quality (larger file)'}
            </small>
          </div>

          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '帧率' : 'Frame Rate'}: {gifFps} fps
            </label>
            <input
              type="range"
              min="5"
              max="30"
              value={gifFps}
              onChange={(e) => setGifFps(parseInt(e.target.value))}
              disabled={isProcessing}
            />
            <small>
              {language === 'zh-CN' 
                ? '每秒帧数，越高越流畅（文件越大）'
                : 'Frames per second, higher is smoother (larger file)'}
            </small>
          </div>

          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? 'GIF 宽度' : 'GIF Width'}: {gifWidth}px
            </label>
            <input
              type="range"
              min="240"
              max="1920"
              step="40"
              value={gifWidth}
              onChange={(e) => setGifWidth(parseInt(e.target.value))}
              disabled={isProcessing}
            />
            <small>
              {language === 'zh-CN' 
                ? '宽度（像素），越大越清晰（文件越大）'
                : 'Width in pixels, larger is clearer (larger file)'}
            </small>
          </div>

          <div className="action-buttons">
            <button
              className="process-button"
              onClick={handleProcess}
              disabled={isProcessing || ffmpegLoading || tasks.filter(t => t.status === 'pending').length === 0}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  <span>{language === 'zh-CN' ? '处理中...' : 'Processing...'}</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>{language === 'zh-CN' ? '开始转换' : 'Start Conversion'}</span>
                </>
              )}
            </button>

            {tasks.filter(t => t.status === 'completed').length > 1 && (
              <button
                className="download-all-button"
                onClick={handleDownloadAll}
                disabled={isProcessing}
              >
                <Download size={16} />
                <span>{language === 'zh-CN' ? '下载全部' : 'Download All'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results Preview */}
      {tasks.filter(t => t.status === 'completed' && t.resultUrl).length > 0 && (
        <div className="results-section">
          <h3>{language === 'zh-CN' ? '转换结果' : 'Conversion Results'}</h3>
          <div className="results-grid">
            {tasks
              .filter(t => t.status === 'completed' && t.resultUrl)
              .map((task) => (
                <div key={task.id} className="result-card">
                  <div className="result-preview">
                    <img src={task.resultUrl} alt="GIF result" />
                  </div>
                  <div className="result-info">
                    <div className="result-name">
                      {task.file.name.replace(/\.[^/.]+$/, '')}.gif
                    </div>
                    <div className="result-stats">
                      <span className="stat-item">
                        <strong>{language === 'zh-CN' ? '原始' : 'Original'}:</strong> {formatFileSize(task.file.size)}
                      </span>
                      <span className="stat-arrow">→</span>
                      <span className="stat-item">
                        <strong>{language === 'zh-CN' ? 'GIF' : 'GIF'}:</strong> {task.result ? formatFileSize(task.result.size) : '--'}
                      </span>
                      {task.result && task.file.size > 0 && (
                        <span className="stat-badge">
                          {task.result.size < task.file.size 
                            ? `↓ ${((1 - task.result.size / task.file.size) * 100).toFixed(1)}%`
                            : `↑ ${((task.result.size / task.file.size - 1) * 100).toFixed(1)}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    className="download-button"
                    onClick={() => handleDownload(task)}
                  >
                    <Download size={16} />
                    <span>{language === 'zh-CN' ? '下载' : 'Download'}</span>
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
