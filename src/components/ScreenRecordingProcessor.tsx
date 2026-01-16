import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Video, Settings, CheckCircle2, AlertCircle, Package, Info, Scissors, Minimize2, EyeOff } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './ScreenRecordingProcessor.css'

interface VideoFile {
  file: File
  preview: string
  duration?: number
  width?: number
  height?: number
  size: number
  format: string
}

interface ProcessedVideo {
  name: string
  blob: Blob
  url: string
  size: number
  originalSize: number
  compressionRatio: number
}

interface CropSettings {
  top: number
  bottom: number
  left: number
  right: number
}

interface ProcessSettings {
  action: 'crop' | 'compress' | 'blur' | 'all'
  crop: CropSettings
  quality: 'high' | 'medium' | 'low'
  blur: {
    enabled: boolean
    region: 'top' | 'custom'
    x: number
    y: number
    width: number
    height: number
  }
}

export default function ScreenRecordingProcessor() {
  const { language } = useI18n()
  const [uploadedFiles, setUploadedFiles] = useState<VideoFile[]>([])
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTask, setCurrentTask] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)

  // 处理设置
  const [settings, setSettings] = useState<ProcessSettings>({
    action: 'crop',
    crop: {
      top: 120,
      bottom: 80,
      left: 0,
      right: 0
    },
    quality: 'medium',
    blur: {
      enabled: false,
      region: 'top',
      x: 0,
      y: 0,
      width: 200,
      height: 100
    }
  })

  // 加载 FFmpeg
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegLoaded || ffmpegLoading) return

    setFfmpegLoading(true)
    setCurrentTask(language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...')

    try {
      const ffmpeg = new FFmpeg()
      
      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg:', message)
      })

      ffmpeg.on('progress', ({ progress, time }) => {
        setProgress(Math.round(progress * 100))
        console.log(`FFmpeg Progress: ${Math.round(progress * 100)}% (${time}ms)`)
      })

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      })

      ffmpegRef.current = ffmpeg
      setFfmpegLoaded(true)
      setCurrentTask('')
      console.log('✅ FFmpeg loaded successfully')
    } catch (err) {
      console.error('Failed to load FFmpeg:', err)
      setError(language === 'zh-CN' 
        ? '视频处理引擎加载失败，请刷新页面重试' 
        : 'Failed to load video processing engine, please refresh')
    } finally {
      setFfmpegLoading(false)
    }
  }, [ffmpegLoaded, ffmpegLoading, language])

  // 分析视频信息
  const analyzeVideo = useCallback(async (file: File): Promise<{ duration?: number; width?: number; height?: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        })
        URL.revokeObjectURL(video.src)
      }
      
      video.onerror = () => {
        resolve({})
        URL.revokeObjectURL(video.src)
      }
      
      video.src = URL.createObjectURL(file)
    })
  }, [])

  // 处理文件上传
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setError('')
    const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
    const MAX_DURATION = 600 // 10分钟
    const newFiles: VideoFile[] = []

    for (const file of Array.from(files)) {
      try {
        // 检查文件类型
        if (!file.type.startsWith('video/')) {
          setError(language === 'zh-CN' 
            ? `不是视频文件: ${file.name}` 
            : `Not a video file: ${file.name}`)
          continue
        }

        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
          setError(language === 'zh-CN' 
            ? `文件过大: ${file.name} (${formatFileSize(file.size)})，建议不超过 500MB` 
            : `File too large: ${file.name} (${formatFileSize(file.size)}), recommend under 500MB`)
          continue
        }

        // 分析视频
        const videoInfo = await analyzeVideo(file)
        
        // 检查时长
        if (videoInfo.duration && videoInfo.duration > MAX_DURATION) {
          setError(language === 'zh-CN' 
            ? `视频过长: ${file.name} (${Math.round(videoInfo.duration / 60)}分钟)，建议不超过 10 分钟` 
            : `Video too long: ${file.name} (${Math.round(videoInfo.duration / 60)}min), recommend under 10 minutes`)
          continue
        }

        const preview = URL.createObjectURL(file)
        
        newFiles.push({
          file,
          preview,
          duration: videoInfo.duration,
          width: videoInfo.width,
          height: videoInfo.height,
          size: file.size,
          format: file.type.split('/')[1].toUpperCase()
        })
      } catch (err) {
        console.error('File processing error:', err)
        setError(language === 'zh-CN' 
          ? `文件处理失败: ${file.name}` 
          : `Failed to process: ${file.name}`)
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles])
  }, [analyzeVideo, language])

  // 文件上传
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    await processFiles(files)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processFiles])

  // 拖拽处理
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    await processFiles(Array.from(files))
  }, [processFiles])

  // 处理视频
  const processVideo = useCallback(async (videoFile: VideoFile): Promise<ProcessedVideo> => {
    const ffmpeg = ffmpegRef.current
    if (!ffmpeg) throw new Error('FFmpeg not loaded')

    const inputName = 'input.mp4'
    const outputName = 'output.mp4'

    try {
      // 写入输入文件
      setCurrentTask(language === 'zh-CN' ? '读取视频文件...' : 'Reading video file...')
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile.file))

      // 构建 FFmpeg 命令
      const args: string[] = ['-i', inputName]
      
      // 视频滤镜
      const filters: string[] = []
      
      // 裁剪
      if (settings.action === 'crop' || settings.action === 'all') {
        const { top, bottom, left, right } = settings.crop
        if (top > 0 || bottom > 0 || left > 0 || right > 0) {
          const cropW = `in_w-${left + right}`
          const cropH = `in_h-${top + bottom}`
          filters.push(`crop=${cropW}:${cropH}:${left}:${top}`)
        }
      }
      
      // 模糊
      if (settings.blur.enabled && (settings.action === 'blur' || settings.action === 'all')) {
        if (settings.blur.region === 'top') {
          filters.push(`boxblur=10:1:enable='between(t,0,999)'`)
        } else {
          const { x, y, width, height } = settings.blur
          filters.push(`drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=black@0.8:t=fill`)
        }
      }
      
      if (filters.length > 0) {
        args.push('-vf', filters.join(','))
      }
      
      // 压缩设置
      if (settings.action === 'compress' || settings.action === 'all') {
        args.push('-c:v', 'libx264')
        
        // 质量设置
        const crfMap = { high: '18', medium: '23', low: '28' }
        args.push('-crf', crfMap[settings.quality])
        args.push('-preset', 'fast')
        
        // 音频处理
        args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2')
      } else {
        // 只复制，不重新编码
        if (filters.length === 0) {
          args.push('-c', 'copy')
        }
      }
      
      args.push(outputName)
      
      setCurrentTask(language === 'zh-CN' ? '处理视频中...' : 'Processing video...')
      console.log('FFmpeg command:', args.join(' '))
      
      await ffmpeg.exec(args)
      
      // 读取输出文件
      setCurrentTask(language === 'zh-CN' ? '生成输出文件...' : 'Generating output...')
      const data = await ffmpeg.readFile(outputName)
      const buffer = (data as Uint8Array).buffer as ArrayBuffer
      const blob = new Blob([buffer], { type: 'video/mp4' })
      
      // 清理
      try {
        await ffmpeg.deleteFile(inputName)
        await ffmpeg.deleteFile(outputName)
      } catch (err) {
        console.warn('Failed to delete temp files:', err)
      }
      
      const name = videoFile.file.name.replace(/\.[^.]+$/, '_processed.mp4')
      const url = URL.createObjectURL(blob)
      const compressionRatio = ((1 - blob.size / videoFile.file.size) * 100)
      
      return {
        name,
        blob,
        url,
        size: blob.size,
        originalSize: videoFile.file.size,
        compressionRatio: compressionRatio > 0 ? compressionRatio : 0
      }
    } catch (err) {
      console.error('Video processing error:', err)
      throw err
    }
  }, [settings, language])

  // 批量处理
  const handleProcess = useCallback(async () => {
    if (uploadedFiles.length === 0) {
      setError(language === 'zh-CN' ? '请先上传视频' : 'Please upload videos first')
      return
    }

    if (!ffmpegLoaded) {
      await loadFFmpeg()
      if (!ffmpegLoaded) return
    }

    setIsProcessing(true)
    setError('')
    setSuccessMessage('')
    setProgress(0)
    setProcessedVideos([])

    const results: ProcessedVideo[] = []
    const failedFiles: string[] = []

    try {
      // 顺序处理（视频处理不适合并发）
      for (let i = 0; i < uploadedFiles.length; i++) {
        const videoFile = uploadedFiles[i]
        setCurrentTask(`${language === 'zh-CN' ? '处理' : 'Processing'} ${i + 1}/${uploadedFiles.length}: ${videoFile.file.name}`)
        
        try {
          const processed = await processVideo(videoFile)
          results.push(processed)
        } catch (err) {
          console.error(`Processing failed for ${videoFile.file.name}:`, err)
          failedFiles.push(videoFile.file.name)
        }
      }

      setProcessedVideos(results)
      setCurrentTask('')
      
      if (results.length > 0) {
        const successMsg = language === 'zh-CN' 
          ? `成功处理 ${results.length} 个视频` 
          : `Successfully processed ${results.length} video(s)`
        
        const failMsg = failedFiles.length > 0
          ? (language === 'zh-CN' 
            ? `，${failedFiles.length} 个失败: ${failedFiles.join(', ')}` 
            : `, ${failedFiles.length} failed: ${failedFiles.join(', ')}`)
          : ''
        
        setSuccessMessage(successMsg + failMsg)
      }
      
      if (failedFiles.length > 0 && results.length === 0) {
        setError(
          language === 'zh-CN' 
            ? `所有视频处理失败: ${failedFiles.join(', ')}` 
            : `All videos failed: ${failedFiles.join(', ')}`
        )
      }
    } catch (err) {
      console.error('Batch processing error:', err)
      setError(language === 'zh-CN' ? '批量处理失败' : 'Batch processing failed')
    } finally {
      setIsProcessing(false)
      setProgress(0)
      setCurrentTask('')
    }
  }, [uploadedFiles, processVideo, ffmpegLoaded, loadFFmpeg, language])

  // 下载单个文件
  const handleDownload = useCallback((video: ProcessedVideo) => {
    const link = document.createElement('a')
    link.href = video.url
    link.download = video.name
    link.click()
  }, [])

  // 批量下载ZIP
  const handleDownloadAll = useCallback(async () => {
    if (processedVideos.length === 0) return

    const zip = new JSZip()
    
    for (const video of processedVideos) {
      zip.file(video.name, video.blob)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `screen-recordings-${Date.now()}.zip`)
  }, [processedVideos])

  // 清除文件
  const handleClearFiles = useCallback(() => {
    uploadedFiles.forEach(file => URL.revokeObjectURL(file.preview))
    processedVideos.forEach(video => URL.revokeObjectURL(video.url))

    setUploadedFiles([])
    setProcessedVideos([])
    setError('')
    setSuccessMessage('')
  }, [uploadedFiles, processedVideos])

  // 移除单个文件
  const handleRemoveFile = useCallback((index: number) => {
    const file = uploadedFiles[index]
    URL.revokeObjectURL(file.preview)
    
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }, [uploadedFiles])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 格式化时长
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      uploadedFiles.forEach(file => URL.revokeObjectURL(file.preview))
      processedVideos.forEach(video => URL.revokeObjectURL(video.url))
    }
  }, [uploadedFiles, processedVideos])

  // 自动加载 FFmpeg
  useEffect(() => {
    if (uploadedFiles.length > 0 && !ffmpegLoaded && !ffmpegLoading) {
      loadFFmpeg()
    }
  }, [uploadedFiles, ffmpegLoaded, ffmpegLoading, loadFFmpeg])

  return (
    <div className="screen-recording-processor">
      {/* 头部 */}
      <div className="processor-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Video />
            {language === 'zh-CN' ? 'iPhone 屏幕录像处理' : 'iPhone Screen Recording Processor'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN' 
              ? '裁剪状态栏、压缩体积、模糊敏感区域，纯本地处理，隐私安全。' 
              : 'Crop status bar, compress size, blur sensitive areas, 100% local processing, privacy-friendly.'}
          </p>
        </div>
      </div>

      {/* 专业提示 */}
      <div className="pro-notice">
        <Info />
        <div className="notice-content">
          <strong>{language === 'zh-CN' ? '🎥 专为 iPhone 屏幕录像设计' : '🎥 Designed for iPhone Screen Recordings'}</strong>
          <p>{language === 'zh-CN' 
            ? '去除顶部红点和时间戳、压缩视频大小、模糊敏感信息，所有处理在本地完成，视频不上传服务器。' 
            : 'Remove top red dot and timestamp, compress video size, blur sensitive info. All processing done locally, videos never uploaded.'}
          </p>
        </div>
      </div>

      {/* 上传区域 */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mov,.mp4"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />
        
        <div
          className={`upload-button ${isDragging ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
        >
          <Upload />
          <span>{language === 'zh-CN' ? '上传屏幕录像' : 'Upload Screen Recordings'}</span>
          <small>
            {isDragging 
              ? (language === 'zh-CN' ? '松开鼠标上传文件' : 'Drop files here')
              : (language === 'zh-CN' ? '点击上传或拖拽视频到这里' : 'Click to upload or drag & drop videos here')}
          </small>
          <small>{language === 'zh-CN' ? '支持 .MOV, .MP4（建议 < 500MB，< 10分钟）' : 'Supports .MOV, .MP4 (< 500MB, < 10min)'}</small>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="file-list">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-preview">
                  <video src={file.preview} />
                  <div className="video-overlay">
                    <Video />
                  </div>
                </div>
                <div className="file-info">
                  <span className="file-name">{file.file.name}</span>
                  <div className="file-meta">
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    {file.duration && <span className="file-duration">{formatDuration(file.duration)}</span>}
                    {file.width && file.height && (
                      <span className="file-resolution">{file.width}×{file.height}</span>
                    )}
                    <span className="format-badge">{file.format}</span>
                  </div>
                </div>
                <button
                  className="remove-button"
                  onClick={() => handleRemoveFile(index)}
                  disabled={isProcessing}
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 设置区域 */}
      {uploadedFiles.length > 0 && (
        <div className="settings-section">
          <h3>
            <Settings />
            {language === 'zh-CN' ? '处理设置' : 'Processing Settings'}
          </h3>
          
          {/* 处理类型 */}
          <div className="setting-group">
            <label className="group-label">{language === 'zh-CN' ? '处理类型' : 'Process Type'}</label>
            <div className="action-buttons">
              <button
                className={`action-button ${settings.action === 'crop' ? 'active' : ''}`}
                onClick={() => setSettings(prev => ({ ...prev, action: 'crop' }))}
                disabled={isProcessing}
              >
                <Scissors />
                <span>{language === 'zh-CN' ? '仅裁剪' : 'Crop Only'}</span>
              </button>
              <button
                className={`action-button ${settings.action === 'compress' ? 'active' : ''}`}
                onClick={() => setSettings(prev => ({ ...prev, action: 'compress' }))}
                disabled={isProcessing}
              >
                <Minimize2 />
                <span>{language === 'zh-CN' ? '仅压缩' : 'Compress Only'}</span>
              </button>
              <button
                className={`action-button ${settings.action === 'blur' ? 'active' : ''}`}
                onClick={() => setSettings(prev => ({ ...prev, action: 'blur' }))}
                disabled={isProcessing}
              >
                <EyeOff />
                <span>{language === 'zh-CN' ? '仅模糊' : 'Blur Only'}</span>
              </button>
              <button
                className={`action-button ${settings.action === 'all' ? 'active' : ''}`}
                onClick={() => setSettings(prev => ({ ...prev, action: 'all' }))}
                disabled={isProcessing}
              >
                <Package />
                <span>{language === 'zh-CN' ? '全部处理' : 'All'}</span>
              </button>
            </div>
          </div>

          {/* 裁剪设置 */}
          {(settings.action === 'crop' || settings.action === 'all') && (
            <div className="setting-group crop-settings">
              <label className="group-label">{language === 'zh-CN' ? '裁剪区域（像素）' : 'Crop Region (px)'}</label>
              <div className="crop-controls">
                <div className="crop-input">
                  <label>{language === 'zh-CN' ? '顶部' : 'Top'}</label>
                  <input
                    type="number"
                    value={settings.crop.top}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      crop: { ...prev.crop, top: Math.max(0, parseInt(e.target.value) || 0) }
                    }))}
                    disabled={isProcessing}
                    min="0"
                    max="500"
                  />
                </div>
                <div className="crop-input">
                  <label>{language === 'zh-CN' ? '底部' : 'Bottom'}</label>
                  <input
                    type="number"
                    value={settings.crop.bottom}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      crop: { ...prev.crop, bottom: Math.max(0, parseInt(e.target.value) || 0) }
                    }))}
                    disabled={isProcessing}
                    min="0"
                    max="500"
                  />
                </div>
                <div className="crop-input">
                  <label>{language === 'zh-CN' ? '左侧' : 'Left'}</label>
                  <input
                    type="number"
                    value={settings.crop.left}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      crop: { ...prev.crop, left: Math.max(0, parseInt(e.target.value) || 0) }
                    }))}
                    disabled={isProcessing}
                    min="0"
                    max="500"
                  />
                </div>
                <div className="crop-input">
                  <label>{language === 'zh-CN' ? '右侧' : 'Right'}</label>
                  <input
                    type="number"
                    value={settings.crop.right}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      crop: { ...prev.crop, right: Math.max(0, parseInt(e.target.value) || 0) }
                    }))}
                    disabled={isProcessing}
                    min="0"
                    max="500"
                  />
                </div>
              </div>
              <div className="crop-presets">
                <button
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    crop: { top: 120, bottom: 80, left: 0, right: 0 }
                  }))}
                  disabled={isProcessing}
                  className="preset-button"
                >
                  {language === 'zh-CN' ? 'iPhone 预设' : 'iPhone Preset'}
                </button>
                <button
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    crop: { top: 0, bottom: 0, left: 0, right: 0 }
                  }))}
                  disabled={isProcessing}
                  className="preset-button"
                >
                  {language === 'zh-CN' ? '重置' : 'Reset'}
                </button>
              </div>
            </div>
          )}

          {/* 压缩设置 */}
          {(settings.action === 'compress' || settings.action === 'all') && (
            <div className="setting-group">
              <label className="group-label">{language === 'zh-CN' ? '压缩质量' : 'Compression Quality'}</label>
              <div className="quality-buttons">
                <button
                  className={`quality-button ${settings.quality === 'high' ? 'active' : ''}`}
                  onClick={() => setSettings(prev => ({ ...prev, quality: 'high' }))}
                  disabled={isProcessing}
                >
                  <span className="quality-label">{language === 'zh-CN' ? '高' : 'High'}</span>
                  <small>{language === 'zh-CN' ? '较大' : 'Larger'}</small>
                </button>
                <button
                  className={`quality-button ${settings.quality === 'medium' ? 'active' : ''}`}
                  onClick={() => setSettings(prev => ({ ...prev, quality: 'medium' }))}
                  disabled={isProcessing}
                >
                  <span className="quality-label">{language === 'zh-CN' ? '中' : 'Medium'}</span>
                  <small>{language === 'zh-CN' ? '平衡' : 'Balanced'}</small>
                </button>
                <button
                  className={`quality-button ${settings.quality === 'low' ? 'active' : ''}`}
                  onClick={() => setSettings(prev => ({ ...prev, quality: 'low' }))}
                  disabled={isProcessing}
                >
                  <span className="quality-label">{language === 'zh-CN' ? '低' : 'Low'}</span>
                  <small>{language === 'zh-CN' ? '最小' : 'Smallest'}</small>
                </button>
              </div>
            </div>
          )}

          {/* 模糊设置 */}
          {(settings.action === 'blur' || settings.action === 'all') && (
            <div className="setting-group">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={settings.blur.enabled}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    blur: { ...prev.blur, enabled: e.target.checked }
                  }))}
                  disabled={isProcessing}
                />
                <span>{language === 'zh-CN' ? '启用模糊/遮挡' : 'Enable Blur/Mask'}</span>
              </label>
              {settings.blur.enabled && (
                <div className="blur-region-buttons">
                  <button
                    className={`region-button ${settings.blur.region === 'top' ? 'active' : ''}`}
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      blur: { ...prev.blur, region: 'top' }
                    }))}
                    disabled={isProcessing}
                  >
                    {language === 'zh-CN' ? '顶部区域' : 'Top Region'}
                  </button>
                  <button
                    className={`region-button ${settings.blur.region === 'custom' ? 'active' : ''}`}
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      blur: { ...prev.blur, region: 'custom' }
                    }))}
                    disabled={isProcessing}
                  >
                    {language === 'zh-CN' ? '自定义' : 'Custom'}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            className="process-button"
            onClick={handleProcess}
            disabled={isProcessing || ffmpegLoading}
          >
            {isProcessing || ffmpegLoading ? (
              <>
                <div className="spinner"></div>
                <span>{currentTask || (language === 'zh-CN' ? '处理中...' : 'Processing...')}</span>
              </>
            ) : (
              <>
                <Video />
                <span>{language === 'zh-CN' ? '开始处理' : 'Start Processing'}</span>
              </>
            )}
          </button>

          {isProcessing && progress > 0 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              <span className="progress-text">{progress}%</span>
            </div>
          )}

          {uploadedFiles.length > 0 && !isProcessing && (
            <button className="clear-button" onClick={handleClearFiles}>
              <X />
              <span>{language === 'zh-CN' ? '清除所有' : 'Clear All'}</span>
            </button>
          )}
        </div>
      )}

      {/* 消息 */}
      {error && (
        <div className="message error-message">
          <AlertCircle />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="message success-message">
          <CheckCircle2 />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 处理结果 */}
      {processedVideos.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>{language === 'zh-CN' ? '处理完成' : 'Processing Complete'}</h3>
            <button className="download-all-button" onClick={handleDownloadAll}>
              <Package />
              <span>{language === 'zh-CN' ? '打包下载 ZIP' : 'Download ZIP'}</span>
            </button>
          </div>

          <div className="results-grid">
            {processedVideos.map((video, index) => (
              <div key={index} className="result-item">
                <div className="result-preview">
                  <video src={video.url} controls />
                  <div className="result-overlay">
                    <button
                      className="download-button"
                      onClick={() => handleDownload(video)}
                    >
                      <Download />
                    </button>
                  </div>
                </div>
                <div className="result-info">
                  <span className="result-name">{video.name}</span>
                  <div className="result-details">
                    <span className="result-format">MP4</span>
                    <span className="result-size">{formatFileSize(video.size)}</span>
                    {video.compressionRatio > 0 && (
                      <span className="result-compression">-{video.compressionRatio.toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
