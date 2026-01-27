import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Video, Settings, Loader2, AlertCircle, Play, CheckCircle2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { saveAs } from 'file-saver'
import './VideoConverter.css'

const MAX_FILES = 5
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

type VideoFormat = 'mp4' | 'mov' | 'mkv' | 'webm'
type VideoCodec = 'h264' | 'h265' | 'vp9'

interface ConversionTask {
  id: string
  file: File
  preview: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  progressMessage?: string
  targetFormat: VideoFormat
  result?: Blob
  resultUrl?: string
  error?: string
  startTime?: number
  endTime?: number
}

export default function VideoConverter() {
  const { language } = useI18n()
  const [tasks, setTasks] = useState<ConversionTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState('')
  
  // 转换设置
  const [defaultFormat, setDefaultFormat] = useState<VideoFormat>('mp4')
  const [codec, setCodec] = useState<VideoCodec>('h264')
  const [quality, setQuality] = useState(23) // CRF: 18-28, 越小质量越高
  const [preset, setPreset] = useState('medium') // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
  
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

  // 获取文件格式
  const getFileFormat = (fileName: string): VideoFormat | null => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'mp4') return 'mp4'
    if (ext === 'mov') return 'mov'
    if (ext === 'mkv') return 'mkv'
    if (ext === 'webm') return 'webm'
    return null
  }

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
      const currentFormat = getFileFormat(file.name)
      
      // 如果当前格式就是目标格式，跳过
      if (currentFormat === defaultFormat) {
        alert(
          language === 'zh-CN' 
            ? `文件 ${file.name} 已经是 ${defaultFormat.toUpperCase()} 格式，无需转换`
            : `File ${file.name} is already ${defaultFormat.toUpperCase()} format, no conversion needed`
        )
        URL.revokeObjectURL(preview)
        continue
      }

      newTasks.push({
        id: taskId,
        file,
        preview,
        status: 'pending',
        progress: 0,
        targetFormat: defaultFormat
      })
    }

    setTasks(prev => [...prev, ...newTasks])
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [tasks.length, language, defaultFormat])

  // 构建 FFmpeg 参数
  const buildFFmpegArgs = useCallback((task: ConversionTask): string[] => {
    const inputExt = task.file.name.split('.').pop()?.toLowerCase() || 'mp4'
    const args: string[] = ['-i', `input.${inputExt}`]

    // 视频编码器
    if (codec === 'h264') {
      args.push('-c:v', 'libx264')
      args.push('-preset', preset)
      args.push('-crf', quality.toString())
      args.push('-pix_fmt', 'yuv420p')
    } else if (codec === 'h265') {
      args.push('-c:v', 'libx265')
      args.push('-preset', preset)
      args.push('-crf', quality.toString())
      args.push('-pix_fmt', 'yuv420p')
    } else if (codec === 'vp9') {
      args.push('-c:v', 'libvpx-vp9')
      args.push('-crf', quality.toString())
      args.push('-b:v', '0')
    }

    // 音频编码器
    if (task.targetFormat === 'webm') {
      args.push('-c:a', 'libopus')
      args.push('-b:a', '128k')
    } else {
      args.push('-c:a', 'aac')
      args.push('-b:a', '128k')
    }

    // 输出格式特定设置
    if (task.targetFormat === 'mp4') {
      args.push('-movflags', '+faststart')
    }

    args.push(`output.${task.targetFormat}`)
    return args
  }, [codec, preset, quality])

  // 转换单个视频
  const convertVideo = useCallback(async (task: ConversionTask): Promise<void> => {
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
      const PROGRESS_UPDATE_INTERVAL = 200
      
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

      // 执行转换
      const args = buildFFmpegArgs(task)
      await ffmpeg.exec(args)

      // 移除进度监听器
      ffmpeg.off('progress', progressHandler)

      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 90,
          progressMessage: language === 'zh-CN' ? '生成输出文件...' : 'Generating output file...'
        } : t
      ))

      // 读取输出文件
      const data = await ffmpeg.readFile(`output.${task.targetFormat}`)
      const blob = new Blob([data as any], { type: `video/${task.targetFormat}` })
      const resultUrl = URL.createObjectURL(blob)

      // 清理文件
      try {
        await ffmpeg.deleteFile(`input.${inputExt}`)
        await ffmpeg.deleteFile(`output.${task.targetFormat}`)
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

      // 播放完成音效
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MT6bj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDE+m4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC')
        audio.volume = 0.3
        audio.play().catch(() => {})
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
  }, [buildFFmpegArgs, loadFFmpeg, language])

  // 处理所有任务
  const handleProcess = useCallback(async () => {
    if (tasks.length === 0) return

    const pendingTasks = tasks.filter(t => t.status === 'pending')
    if (pendingTasks.length === 0) return

    setIsProcessing(true)

    try {
      for (const task of pendingTasks) {
        try {
          await convertVideo(task)
        } catch (err) {
          console.error(`Failed to convert ${task.file.name}:`, err)
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [tasks, convertVideo])

  // 下载单个文件
  const handleDownload = useCallback((task: ConversionTask) => {
    if (!task.result || !task.resultUrl) return
    
    const fileName = task.file.name.replace(/\.[^/.]+$/, '') + `.${task.targetFormat}`
    saveAs(task.result, fileName)
  }, [])

  // 下载全部
  const handleDownloadAll = useCallback(async () => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.result)
    if (completedTasks.length === 0) return

    for (const task of completedTasks) {
      if (task.result) {
        const fileName = task.file.name.replace(/\.[^/.]+$/, '') + `.${task.targetFormat}`
        saveAs(task.result, fileName)
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

  // 更新任务的目标格式
  const handleFormatChange = useCallback((taskId: string, format: VideoFormat) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, targetFormat: format } : t
    ))
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFormatLabel = (format: VideoFormat): string => {
    return format.toUpperCase()
  }

  return (
    <div className="video-converter">
      {/* Header */}
      <div className="converter-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Video />
            {language === 'zh-CN' ? '视频格式转换' : 'Video Format Converter'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? '将视频文件在 MP4、MOV、MKV、WebM 格式之间转换。支持批量处理、自定义编码参数。使用 FFmpeg WebAssembly，100% 本地处理，保护隐私安全。'
              : 'Convert video files between MP4, MOV, MKV, and WebM formats. Supports batch processing and custom encoding parameters. Uses FFmpeg WebAssembly, 100% local processing, privacy-friendly.'}
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
              ? '支持 MP4, MOV, MKV, WebM 等格式，最多 5 个文件，每个最大 500MB'
              : 'Supports MP4, MOV, MKV, WebM, max 5 files, 500MB each'}
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
                  
                  {task.status === 'pending' && (
                    <div className="format-selector">
                      <label>{language === 'zh-CN' ? '转换为' : 'Convert to'}:</label>
                      <select
                        value={task.targetFormat}
                        onChange={(e) => handleFormatChange(task.id, e.target.value as VideoFormat)}
                        disabled={isProcessing}
                      >
                        <option value="mp4">MP4</option>
                        <option value="mov">MOV</option>
                        <option value="mkv">MKV</option>
                        <option value="webm">WebM</option>
                      </select>
                    </div>
                  )}

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
          <h3><Settings /> {language === 'zh-CN' ? '转换设置' : 'Conversion Settings'}</h3>
          
          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '默认输出格式' : 'Default Output Format'}
            </label>
            <select
              value={defaultFormat}
              onChange={(e) => setDefaultFormat(e.target.value as VideoFormat)}
              disabled={isProcessing}
            >
              <option value="mp4">MP4</option>
              <option value="mov">MOV</option>
              <option value="mkv">MKV</option>
              <option value="webm">WebM</option>
            </select>
            <small>
              {language === 'zh-CN' 
                ? '新上传的文件将默认转换为该格式'
                : 'Newly uploaded files will be converted to this format by default'}
            </small>
          </div>

          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '视频编码器' : 'Video Codec'}
            </label>
            <select
              value={codec}
              onChange={(e) => setCodec(e.target.value as VideoCodec)}
              disabled={isProcessing}
            >
              <option value="h264">H.264 (兼容性最好)</option>
              <option value="h265">H.265 (文件更小)</option>
              <option value="vp9">VP9 (WebM 推荐)</option>
            </select>
            <small>
              {language === 'zh-CN' 
                ? 'H.264 兼容性最好，H.265 文件更小，VP9 适合 WebM'
                : 'H.264 best compatibility, H.265 smaller files, VP9 for WebM'}
            </small>
          </div>

          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '视频质量' : 'Video Quality'}: {quality}
            </label>
            <input
              type="range"
              min="18"
              max="28"
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value))}
              disabled={isProcessing}
            />
            <small>
              {language === 'zh-CN' 
                ? '18-28，数值越小质量越高（文件越大）'
                : '18-28, lower is better quality (larger file)'}
            </small>
          </div>

          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '编码速度' : 'Encoding Speed'}
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              disabled={isProcessing}
            >
              <option value="ultrafast">{language === 'zh-CN' ? '极快' : 'Ultrafast'}</option>
              <option value="superfast">{language === 'zh-CN' ? '超快' : 'Superfast'}</option>
              <option value="veryfast">{language === 'zh-CN' ? '很快' : 'Veryfast'}</option>
              <option value="faster">{language === 'zh-CN' ? '较快' : 'Faster'}</option>
              <option value="fast">{language === 'zh-CN' ? '快' : 'Fast'}</option>
              <option value="medium">{language === 'zh-CN' ? '中等' : 'Medium'}</option>
              <option value="slow">{language === 'zh-CN' ? '慢' : 'Slow'}</option>
              <option value="slower">{language === 'zh-CN' ? '较慢' : 'Slower'}</option>
              <option value="veryslow">{language === 'zh-CN' ? '很慢' : 'Veryslow'}</option>
            </select>
            <small>
              {language === 'zh-CN' 
                ? '速度越快，文件越大；速度越慢，文件越小'
                : 'Faster = larger files, Slower = smaller files'}
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
                    <video src={task.resultUrl} controls />
                  </div>
                  <div className="result-info">
                    <div className="result-name">
                      {task.file.name.replace(/\.[^/.]+$/, '')}.{task.targetFormat}
                    </div>
                    <div className="result-stats">
                      <span className="stat-item">
                        <strong>{language === 'zh-CN' ? '原始' : 'Original'}:</strong> {formatFileSize(task.file.size)} ({getFileFormat(task.file.name)?.toUpperCase() || '?'})
                      </span>
                      <span className="stat-arrow">→</span>
                      <span className="stat-item">
                        <strong>{getFormatLabel(task.targetFormat)}:</strong> {task.result ? formatFileSize(task.result.size) : '--'}
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
