import { useState, useRef, useCallback } from 'react'
import { Upload, Download, X, Video, CheckCircle2, AlertCircle, Info, Scissors, Package } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
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

export default function ScreenRecordingProcessorNative() {
  const { language } = useI18n()
  const [uploadedFiles, setUploadedFiles] = useState<VideoFile[]>([])
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTask, setCurrentTask] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 裁剪设置
  const [cropSettings, setCropSettings] = useState<CropSettings>({
    top: 120,
    bottom: 80,
    left: 0,
    right: 0
  })

  // 质量设置
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium')

  // 使用Canvas API处理视频
  const processVideoNative = useCallback(async (videoFile: VideoFile): Promise<ProcessedVideo> => {
    return new Promise(async (resolve, reject) => {
      try {
        const video = document.createElement('video')
        video.src = videoFile.preview
        video.muted = true
        
        await new Promise((res, rej) => {
          video.onloadedmetadata = res
          video.onerror = rej
        })

        const { videoWidth: width, videoHeight: height, duration } = video
        
        // 计算裁剪后的尺寸
        const croppedWidth = width - cropSettings.left - cropSettings.right
        const croppedHeight = height - cropSettings.top - cropSettings.bottom
        
        // 创建canvas
        const canvas = document.createElement('canvas')
        canvas.width = croppedWidth
        canvas.height = croppedHeight
        const ctx = canvas.getContext('2d')!
        
        // 设置质量参数
        const bitrateMap = {
          high: 8000000,   // 8 Mbps
          medium: 4000000, // 4 Mbps
          low: 2000000     // 2 Mbps
        }
        const bitrate = bitrateMap[quality]
        
        // 创建MediaRecorder
        const stream = canvas.captureStream(30) // 30 FPS
        
        // 获取原视频音轨
        const mediaStream = (video as any).captureStream ? (video as any).captureStream() : null
        if (mediaStream) {
          const audioTrack = mediaStream.getAudioTracks()[0]
          if (audioTrack) {
            stream.addTrack(audioTrack)
          }
        }
        
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: bitrate
        })
        
        const chunks: Blob[] = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        }
        
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          const url = URL.createObjectURL(blob)
          
          resolve({
            name: videoFile.file.name.replace(/\.[^/.]+$/, '_processed.webm'),
            blob,
            url,
            size: blob.size,
            originalSize: videoFile.size,
            compressionRatio: videoFile.size > 0 ? (blob.size / videoFile.size) * 100 : 100
          })
        }
        
        recorder.onerror = reject
        
        // 开始录制
        recorder.start(100)
        
        // 播放并绘制帧
        video.play()
        
        let frameCount = 0
        
        const drawFrame = () => {
          if (video.paused || video.ended) {
            recorder.stop()
            return
          }
          
          frameCount++
          const progress = (video.currentTime / duration) * 100
          setProgress(Math.min(Math.round(progress), 99))
          
          // 绘制裁剪后的帧
          ctx.drawImage(
            video,
            cropSettings.left, cropSettings.top, croppedWidth, croppedHeight,
            0, 0, croppedWidth, croppedHeight
          )
          
          requestAnimationFrame(drawFrame)
        }
        
        requestAnimationFrame(drawFrame)
        
      } catch (err) {
        console.error('Video processing error:', err)
        reject(err)
      }
    })
  }, [cropSettings, quality])

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
    const newFiles: VideoFile[] = []

    for (const file of Array.from(files)) {
      try {
        if (!file.type.startsWith('video/')) {
          setError(language === 'zh-CN' ? `不是视频文件: ${file.name}` : `Not a video file: ${file.name}`)
          continue
        }

        if (file.size > MAX_FILE_SIZE) {
          setError(language === 'zh-CN' ? `文件过大 (最大500MB): ${file.name}` : `File too large (max 500MB): ${file.name}`)
          continue
        }

        const preview = URL.createObjectURL(file)
        const { duration, width, height } = await analyzeVideo(file)

        newFiles.push({
          file,
          preview,
          duration,
          width,
          height,
          size: file.size
        })
      } catch (err) {
        console.error(`Error processing ${file.name}:`, err)
      }
    }

    if (newFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFiles])
    }
  }, [analyzeVideo, language])

  // 处理所有视频
  const handleProcess = useCallback(async () => {
    if (uploadedFiles.length === 0) return

    setIsProcessing(true)
    setError('')
    setProcessedVideos([])
    setProgress(0)

    try {
      const processed: ProcessedVideo[] = []

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i]
        setCurrentTask(
          language === 'zh-CN'
            ? `正在处理: ${file.file.name} (${i + 1}/${uploadedFiles.length})`
            : `Processing: ${file.file.name} (${i + 1}/${uploadedFiles.length})`
        )

        try {
          const result = await processVideoNative(file)
          processed.push(result)
        } catch (err) {
          console.error(`Failed to process ${file.file.name}:`, err)
          setError(
            language === 'zh-CN'
              ? `处理失败: ${file.file.name}`
              : `Failed to process: ${file.file.name}`
          )
        }
      }

      setProcessedVideos(processed)
      setProgress(100)
      
      if (processed.length > 0) {
        setSuccessMessage(
          language === 'zh-CN'
            ? `✅ 成功处理 ${processed.length} 个视频！`
            : `✅ Successfully processed ${processed.length} video(s)!`
        )
        setTimeout(() => setSuccessMessage(''), 5000)
      }
    } catch (err) {
      console.error('Processing error:', err)
      setError(language === 'zh-CN' ? '处理失败，请重试' : 'Processing failed, please try again')
    } finally {
      setIsProcessing(false)
      setCurrentTask('')
    }
  }, [uploadedFiles, processVideoNative, language])

  // 拖放处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files)
    }
  }, [processFiles])

  const handleDownload = useCallback((video: ProcessedVideo) => {
    const link = document.createElement('a')
    link.href = video.url
    link.download = video.name
    link.click()
  }, [])

  const handleDownloadAll = useCallback(async () => {
    if (processedVideos.length === 0) return

    const zip = new JSZip()
    for (const video of processedVideos) {
      zip.file(video.name, video.blob)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `screen-recordings-${Date.now()}.zip`)
  }, [processedVideos])

  const handleClearFiles = useCallback(() => {
    uploadedFiles.forEach(file => URL.revokeObjectURL(file.preview))
    processedVideos.forEach(video => URL.revokeObjectURL(video.url))
    setUploadedFiles([])
    setProcessedVideos([])
    setError('')
    setSuccessMessage('')
  }, [uploadedFiles, processedVideos])

  const handleRemoveFile = useCallback((index: number) => {
    const file = uploadedFiles[index]
    URL.revokeObjectURL(file.preview)
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }, [uploadedFiles])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="screen-recording-processor">
      {/* Header */}
      <div className="processor-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Video />
            {language === 'zh-CN' ? 'iPhone 屏幕录像处理' : 'iPhone Screen Recording Processor'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? '裁剪状态栏、压缩体积，使用浏览器原生API，立即可用，无需等待。'
              : 'Crop status bar, compress size. Uses native browser APIs, instant loading, zero wait time.'}
          </p>
        </div>
      </div>

      {/* Tips */}
      <div className="pro-notice">
        <Info />
        <div className="notice-content">
          <strong>{language === 'zh-CN' ? '✨ 全新原生引擎' : '✨ Native Browser Engine'}</strong>
          <p>{language === 'zh-CN'
            ? '使用浏览器原生API处理视频，无需下载任何外部库，立即开始使用！所有处理在本地完成，视频不上传服务器。'
            : 'Uses native browser APIs for video processing. No external libraries needed, start using immediately! All processing done locally, videos never uploaded.'}
          </p>
        </div>
      </div>

      {/* Settings */}
      <div className="settings-section">
        <h3><Scissors /> {language === 'zh-CN' ? '裁剪设置' : 'Crop Settings'}</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <label>{language === 'zh-CN' ? '顶部裁剪' : 'Top'}: {cropSettings.top}px</label>
            <input
              type="range"
              min="0"
              max="300"
              value={cropSettings.top}
              onChange={(e) => setCropSettings(prev => ({ ...prev, top: Number(e.target.value) }))}
            />
          </div>
          <div className="setting-item">
            <label>{language === 'zh-CN' ? '底部裁剪' : 'Bottom'}: {cropSettings.bottom}px</label>
            <input
              type="range"
              min="0"
              max="300"
              value={cropSettings.bottom}
              onChange={(e) => setCropSettings(prev => ({ ...prev, bottom: Number(e.target.value) }))}
            />
          </div>
          <div className="setting-item">
            <label>{language === 'zh-CN' ? '质量' : 'Quality'}</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value as any)}>
              <option value="high">{language === 'zh-CN' ? '高 (8 Mbps)' : 'High (8 Mbps)'}</option>
              <option value="medium">{language === 'zh-CN' ? '中 (4 Mbps)' : 'Medium (4 Mbps)'}</option>
              <option value="low">{language === 'zh-CN' ? '低 (2 Mbps)' : 'Low (2 Mbps)'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={48} />
        <p className="upload-title">
          {language === 'zh-CN' ? '点击或拖拽视频文件到此处' : 'Click or drag video files here'}
        </p>
        <p className="upload-subtitle">
          {language === 'zh-CN' ? '支持 MP4, MOV, WEBM 等格式，最大 500MB' : 'Supports MP4, MOV, WEBM, max 500MB'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="files-section">
          <h3>{language === 'zh-CN' ? '已上传的视频' : 'Uploaded Videos'}</h3>
          <div className="files-list">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <video src={file.preview} style={{ width: 100, height: 'auto', borderRadius: 4 }} />
                <div className="file-info">
                  <div className="file-name">{file.file.name}</div>
                  <div className="file-meta">
                    {file.width}×{file.height} • {formatDuration(file.duration)} • {formatFileSize(file.size)}
                  </div>
                </div>
                <button className="remove-button" onClick={() => handleRemoveFile(index)}>
                  <X />
                </button>
              </div>
            ))}
          </div>

          <button
            className="process-button"
            onClick={handleProcess}
            disabled={isProcessing}
          >
            {isProcessing ? (
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

          {isProcessing && (
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

      {/* Messages */}
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

      {/* Results */}
      {processedVideos.length > 0 && (
        <div className="results-section">
          <h3>{language === 'zh-CN' ? '处理结果' : 'Processed Videos'}</h3>
          <div className="results-list">
            {processedVideos.map((video, index) => (
              <div key={index} className="result-item">
                <video src={video.url} controls style={{ width: '100%', maxHeight: 300, borderRadius: 8 }} />
                <div className="result-info">
                  <div className="result-name">{video.name}</div>
                  <div className="result-stats">
                    {language === 'zh-CN' ? '原始' : 'Original'}: {formatFileSize(video.originalSize)} →{' '}
                    {language === 'zh-CN' ? '压缩后' : 'Compressed'}: {formatFileSize(video.size)}{' '}
                    ({video.compressionRatio.toFixed(1)}%)
                  </div>
                </div>
                <button className="download-button" onClick={() => handleDownload(video)}>
                  <Download />
                  {language === 'zh-CN' ? '下载' : 'Download'}
                </button>
              </div>
            ))}
          </div>

          {processedVideos.length > 1 && (
            <button className="download-all-button" onClick={handleDownloadAll}>
              <Package />
              <span>{language === 'zh-CN' ? '打包下载全部' : 'Download All as ZIP'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
