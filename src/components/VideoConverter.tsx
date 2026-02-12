import { useState, useRef, useCallback } from 'react'
import { Upload, Download, X, Video, Settings, Loader2, AlertCircle, Play, CheckCircle2, RotateCcw } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { saveAs } from 'file-saver'
import './VideoConverter.css'

const MAX_FILES = 5
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
const SIMPLE_TARGET_SIZE_RATIO = 0.6 // 简单模式默认目标：源文件的 60%
const SIMPLE_MIN_VIDEO_BITRATE_KBPS_SD = 400
const SIMPLE_MIN_VIDEO_BITRATE_KBPS_HD = 500
const SIMPLE_MIN_VIDEO_BITRATE_KBPS_FHD_PLUS = 600

type VideoOutputFormat = 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi'
type VideoInputFormat = 'mp4' | 'mov' | 'mkv' | 'webm' | 'avi' | 'flv' | 'm4v' | '3gp'
type VideoCodec = 'h264' | 'h265'

type UiMode = 'simple' | 'advanced'

interface ConversionTask {
  id: string
  file: File
  preview: string
  inputFormat?: VideoInputFormat
  durationSec?: number
  width?: number
  height?: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  progressMessage?: string
  targetFormat: VideoOutputFormat
  result?: Blob
  resultUrl?: string
  outputSize?: number
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
  const [isDragOver, setIsDragOver] = useState(false)
  
  // 转换设置
  const [uiMode, setUiMode] = useState<UiMode>('simple')
  const [defaultFormat, setDefaultFormat] = useState<VideoOutputFormat>('mp4')

  // Advanced
  const [codec, setCodec] = useState<VideoCodec>('h264')
  const [quality, setQuality] = useState(23) // CRF: 18-28, 越小质量越高
  const [preset, setPreset] = useState('veryfast') // ultrafast..veryslow
  const [scaleWidth, setScaleWidth] = useState(0) // 0 = keep
  const [targetFps, setTargetFps] = useState(0) // 0 = keep
  const [videoBitrateKbps, setVideoBitrateKbps] = useState(0) // 0 = auto
  const [audioBitrateKbps, setAudioBitrateKbps] = useState(128)
  const [removeAudio, setRemoveAudio] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00:00'
    const s = Math.max(0, seconds)
    const hh = Math.floor(s / 3600)
    const mm = Math.floor((s % 3600) / 60)
    const ss = Math.floor(s % 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  const getVideoMeta = (objectUrl: string): Promise<{ durationSec?: number; width?: number; height?: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = objectUrl
      const cleanup = () => {
        video.removeAttribute('src')
        video.load()
      }
      video.onloadedmetadata = () => {
        const d = Number.isFinite(video.duration) ? video.duration : undefined
        const w = Number.isFinite(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : undefined
        const h = Number.isFinite(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : undefined
        cleanup()
        resolve({ durationSec: d, width: w, height: h })
      }
      video.onerror = () => {
        cleanup()
        resolve({})
      }
    })
  }

  const getInputFormat = (fileName: string): VideoInputFormat | undefined => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'mp4') return 'mp4'
    if (ext === 'mov') return 'mov'
    if (ext === 'mkv') return 'mkv'
    if (ext === 'webm') return 'webm'
    if (ext === 'avi') return 'avi'
    if (ext === 'flv') return 'flv'
    if (ext === 'm4v') return 'm4v'
    if (ext === '3gp') return '3gp'
    return undefined
  }

  const getOutputMime = (format: VideoOutputFormat): string => {
    if (format === 'mp4') return 'video/mp4'
    if (format === 'webm') return 'video/webm'
    if (format === 'mov') return 'video/quicktime'
    if (format === 'mkv') return 'video/x-matroska'
    return 'video/x-msvideo'
  }

  const canPreview = (mime: string): boolean => {
    const v = document.createElement('video')
    return v.canPlayType(mime) !== ''
  }

  // 加载 FFmpeg
  const loadFFmpeg = useCallback(async (): Promise<boolean> => {
    if (ffmpegLoaded || ffmpegLoading) return ffmpegLoaded
    
    setFfmpegLoading(true)
    setLoadingProgress(language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...')

    try {
      const ffmpeg = new FFmpeg()
      
      ffmpeg.on('log', ({ message }) => {
        // 保留 log 方便调试，但不要在 UI 阻塞。
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

  // 不在页面进入时预加载：避免每次进入页面都下载 WASM，改为点击“开始转换”时加载。

  // 文件上传处理
  const addFiles = useCallback(async (fileArray: File[]) => {
    if (fileArray.length === 0) return

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
      if (!file.type.startsWith('video/')) {
        alert(
          language === 'zh-CN'
            ? `不是视频文件: ${file.name}`
            : `Not a video file: ${file.name}`
        )
        continue
      }

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
      const inputFormat = getInputFormat(file.name)

      const meta = await getVideoMeta(preview)

      newTasks.push({
        id: taskId,
        file,
        preview,
        inputFormat,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        status: 'pending',
        progress: 0,
        targetFormat: defaultFormat
      })
    }

    setTasks(prev => [...prev, ...newTasks])
  }, [tasks.length, language, defaultFormat])

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return

    await addFiles(Array.from(uploadedFiles))
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [addFiles])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (isProcessing) return

    const files = Array.from(e.dataTransfer.files || []).filter(f => f)
    await addFiles(files)
  }, [addFiles, isProcessing])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }, [isDragOver])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  // 构建 FFmpeg 参数
  const buildFFmpegArgs = useCallback((task: ConversionTask, inputName: string): string[] => {
    const args: string[] = ['-i', inputName]

    const resolvedAudioBitrateKbps = uiMode === 'simple'
      ? 96
      : clamp(audioBitrateKbps, 32, 320)

    const simpleTargetVideoKbps = (() => {
      if (uiMode !== 'simple') return undefined
      if (!task.durationSec || task.durationSec <= 0) return undefined

      const maxSide = Math.max(task.width || 0, task.height || 0)
      const minVideoBitrateKbps = maxSide >= 1920
        ? SIMPLE_MIN_VIDEO_BITRATE_KBPS_FHD_PLUS
        : maxSide >= 1280
          ? SIMPLE_MIN_VIDEO_BITRATE_KBPS_HD
          : SIMPLE_MIN_VIDEO_BITRATE_KBPS_SD

      const targetTotalKbps = Math.max(
        300,
        Math.floor((task.file.size * SIMPLE_TARGET_SIZE_RATIO * 8) / task.durationSec / 1000)
      )
      const audioKbps = removeAudio ? 0 : resolvedAudioBitrateKbps
      return Math.max(minVideoBitrateKbps, targetTotalKbps - audioKbps)
    })()

    // 视频滤镜：缩放 / FPS
    const filters: string[] = []
    if (uiMode === 'advanced' && scaleWidth > 0) {
      filters.push(`scale=${scaleWidth}:-1:flags=lanczos`)
    }
    if (uiMode === 'advanced' && targetFps > 0) {
      filters.push(`fps=${targetFps}`)
    }
    if (filters.length > 0) {
      args.push('-vf', filters.join(','))
    }

    // 简单模式下仅在源视频高帧率时限制到 30fps，避免不必要的重采样
    if (uiMode === 'simple') {
      args.push('-fpsmax', '30')
    }

    // 输出格式与编码策略
    if (task.targetFormat === 'webm') {
      // WebM: VP9 + Opus
      args.push('-c:v', 'libvpx-vp9')
      if (uiMode === 'advanced' && videoBitrateKbps > 0) {
        args.push('-b:v', `${videoBitrateKbps}k`)
      } else if (simpleTargetVideoKbps) {
        args.push('-b:v', `${simpleTargetVideoKbps}k`)
        args.push('-maxrate', `${Math.floor(simpleTargetVideoKbps * 1.15)}k`)
        args.push('-bufsize', `${Math.floor(simpleTargetVideoKbps * 2)}k`)
      } else {
        args.push('-crf', quality.toString())
        args.push('-b:v', '0')
      }
      if (removeAudio) {
        args.push('-an')
      } else {
        args.push('-c:a', 'libopus')
        args.push('-b:a', `${resolvedAudioBitrateKbps}k`)
      }
    } else {
      // 其它容器默认 H.264 + AAC（推荐），高级可选 H.265
      const selectedCodec = uiMode === 'advanced' ? codec : 'h264'
      if (selectedCodec === 'h265') {
        args.push('-c:v', 'libx265')
      } else {
        args.push('-c:v', 'libx264')
      }
      // 默认优先速度，避免本地 wasm 编码过慢
      // 简单模式按分辨率自适应：1080p 内 veryfast，2K/4K 使用 faster
      const simplePreset = (() => {
        const maxSide = Math.max(task.width || 0, task.height || 0)
        return maxSide >= 1920 ? 'faster' : 'veryfast'
      })()
      args.push('-preset', uiMode === 'advanced' ? preset : simplePreset)

      if (uiMode === 'advanced' && videoBitrateKbps > 0) {
        args.push('-b:v', `${videoBitrateKbps}k`)
      } else if (simpleTargetVideoKbps) {
        args.push('-b:v', `${simpleTargetVideoKbps}k`)
        args.push('-maxrate', `${Math.floor(simpleTargetVideoKbps * 1.15)}k`)
        args.push('-bufsize', `${Math.floor(simpleTargetVideoKbps * 2)}k`)
      } else {
        args.push('-crf', quality.toString())
      }

      args.push('-pix_fmt', 'yuv420p')

      if (removeAudio) {
        args.push('-an')
      } else {
        if (task.targetFormat === 'avi') {
          // AVI 对 AAC 支持并不统一，默认 MP3 更稳一些
          args.push('-c:a', 'libmp3lame')
          args.push('-b:a', `${Math.max(64, resolvedAudioBitrateKbps)}k`)
        } else {
          args.push('-c:a', 'aac')
          args.push('-b:a', `${Math.max(64, resolvedAudioBitrateKbps)}k`)
        }
      }
    }

    if (task.targetFormat === 'mp4') {
      args.push('-movflags', '+faststart')
    }

    args.push(`output.${task.targetFormat}`)
    return args
  }, [audioBitrateKbps, clamp, codec, preset, quality, removeAudio, scaleWidth, targetFps, uiMode, videoBitrateKbps])

  // 快速路径：容器重封装（不重编码），速度通常可提升一个数量级
  const buildFastRemuxArgs = useCallback((task: ConversionTask, inputName: string): string[] => {
    const args: string[] = ['-i', inputName, '-c', 'copy']
    if (task.targetFormat === 'mp4') {
      args.push('-movflags', '+faststart')
    }
    args.push(`output.${task.targetFormat}`)
    return args
  }, [])

  const canUseFastRemux = useCallback((task: ConversionTask): boolean => {
    if (uiMode !== 'simple') return false
    if (removeAudio) return false
    if (scaleWidth > 0 || targetFps > 0 || videoBitrateKbps > 0) return false
    if (!task.inputFormat) return false

    // 仅在高成功率容器组合上优先尝试 remux，减少失败回退成本
    const remuxMatrix: Record<VideoInputFormat, VideoOutputFormat[]> = {
      mp4: ['mp4', 'mov', 'mkv'],
      mov: ['mp4', 'mov', 'mkv'],
      mkv: ['mp4', 'mov', 'mkv'],
      webm: ['webm'],
      avi: ['avi', 'mkv'],
      flv: ['mkv'],
      m4v: ['mp4', 'mov'],
      '3gp': ['mp4']
    }

    return (remuxMatrix[task.inputFormat] || []).includes(task.targetFormat)
  }, [removeAudio, scaleWidth, targetFps, uiMode, videoBitrateKbps])

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

    // 先声明，保证 finally 能访问并清理监听器
    let progressHandler: ((payload: { progress: number }) => void) | undefined
    let logHandler: ((payload: { message: string }) => void) | undefined

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
      const inputName = `input.${inputExt}`
      await ffmpeg.writeFile(inputName, fileData)

      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 20,
          progressMessage: language === 'zh-CN' ? '开始转换...' : 'Starting conversion...'
        } : t
      ))

      // 设置“真实”进度（尽力）：
      // 1) 优先解析 FFmpeg 日志中的 time=xx（基于视频时长）
      // 2) 退回 progress 事件（0-1）
      let lastProgressUpdate = 0
      const PROGRESS_UPDATE_INTERVAL = 200

      const totalSec = task.durationSec && Number.isFinite(task.durationSec) && task.durationSec > 0
        ? task.durationSec
        : undefined

      const parseTimeToSeconds = (timeStr: string): number | undefined => {
        // HH:MM:SS.xx
        const m = timeStr.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
        if (!m) return undefined
        const hh = parseInt(m[1], 10)
        const mm = parseInt(m[2], 10)
        const ss = parseFloat(m[3])
        if (![hh, mm, ss].every(Number.isFinite)) return undefined
        return hh * 3600 + mm * 60 + ss
      }

      const updateProgress = (pct: number, label?: string) => {
        const progressPercent = clamp(Math.round(pct), 0, 100)
        setTasks(prev => prev.map(t => {
          if (t.id === task.id && t.status === 'processing') {
            return {
              ...t,
              progress: progressPercent,
              progressMessage: label
                ? label
                : (language === 'zh-CN'
                    ? `转换中... ${progressPercent}%`
                    : `Converting... ${progressPercent}%`)
            }
          }
          return t
        }))
      }
      
      progressHandler = ({ progress: prog }: { progress: number }) => {
        const now = Date.now()
        if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) return
        lastProgressUpdate = now

        updateProgress(20 + clamp(prog, 0, 1) * 70)
      }

      logHandler = ({ message }: { message: string }) => {
        if (!totalSec) return
        const now = Date.now()
        if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) return

        const m = message.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/)
        if (!m) return
        const tSec = parseTimeToSeconds(m[1])
        if (tSec == null) return
        const pct = 20 + clamp(tSec / totalSec, 0, 1) * 70
        updateProgress(pct)
      }

      ffmpeg.on('progress', progressHandler)
      ffmpeg.on('log', logHandler)

      // 执行转换：优先尝试快速重封装（simple 模式且无画面/音频变更）
      const canTryFastRemux = canUseFastRemux(task)

      let converted = false
      if (canTryFastRemux) {
        setTasks(prev => prev.map(t =>
          t.id === task.id
            ? {
                ...t,
                progress: 25,
                progressMessage: language === 'zh-CN' ? '快速模式：重封装中...' : 'Fast mode: remuxing...'
              }
            : t
        ))

        try {
          const fastArgs = buildFastRemuxArgs(task, inputName)
          await ffmpeg.exec(fastArgs)
          converted = true
        } catch (fastErr) {
          console.warn('Fast remux failed, fallback to re-encode:', fastErr)
        }
      }

      if (!converted) {
        const args = buildFFmpegArgs(task, inputName)
        await ffmpeg.exec(args)
      }

      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 90,
          progressMessage: language === 'zh-CN' ? '生成输出文件...' : 'Generating output file...'
        } : t
      ))

      // 读取输出文件
      const data = await ffmpeg.readFile(`output.${task.targetFormat}`)
      const blob = new Blob([data as any], { type: getOutputMime(task.targetFormat) })
      const resultUrl = URL.createObjectURL(blob)

      // 清理文件
      try {
        await ffmpeg.deleteFile(inputName)
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
              outputSize: blob.size,
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
    } finally {
      // 确保监听器始终被清理，避免多次转换后性能下降
      try {
        if (progressHandler) ffmpeg.off('progress', progressHandler)
        if (logHandler) ffmpeg.off('log', logHandler)
      } catch {
        // ignore
      }
    }
  }, [buildFFmpegArgs, buildFastRemuxArgs, canUseFastRemux, loadFFmpeg, language])

  // 处理所有任务
  const handleProcess = useCallback(async () => {
    if (tasks.length === 0) return

    const pendingTasks = tasks.filter(t => t.status === 'pending')
    if (pendingTasks.length === 0) return

    // 只在开始转换时加载 FFmpeg，加载阶段不要全屏遮罩。
    const ok = await loadFFmpeg()
    if (!ok) return

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
  const handleFormatChange = useCallback((taskId: string, format: VideoOutputFormat) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, targetFormat: format } : t
    ))
  }, [])

  const handleReconvert = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      if (t.resultUrl) URL.revokeObjectURL(t.resultUrl)
      return {
        ...t,
        status: 'pending',
        progress: 0,
        progressMessage: undefined,
        result: undefined,
        resultUrl: undefined,
        outputSize: undefined,
        error: undefined,
        startTime: undefined,
        endTime: undefined
      }
    }))
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFormatLabel = (format: VideoOutputFormat): string => {
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

      {/* FFmpeg Loading: inline hint only (no blocking overlay) */}
      {ffmpegLoading && (
        <div className="ffmpeg-inline-status" role="status" aria-live="polite">
          <div className="ffmpeg-inline-row">
            <div className="ffmpeg-inline-spinner" aria-hidden="true" />
            <div className="ffmpeg-inline-text">
              <div className="ffmpeg-inline-title">
                {language === 'zh-CN' ? '正在加载 FFmpeg 引擎（仅首次需要）' : 'Loading FFmpeg engine (first time only)'}
              </div>
              <div className="ffmpeg-inline-subtitle">
                {loadingProgress || (language === 'zh-CN' ? '准备中…' : 'Preparing…')}
              </div>
            </div>
          </div>
          <div className="ffmpeg-inline-bar" aria-hidden="true">
            <div className="ffmpeg-inline-barFill" />
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div
        className={`upload-section ${isDragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.mkv,.avi,.webm,.flv,.m4v,.3gp"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />
        
        <div
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={48} />
          <span>{language === 'zh-CN' ? '上传视频文件' : 'Upload Videos'}</span>
          <small>
            {language === 'zh-CN' 
              ? '支持 MP4 / MOV / MKV / AVI / WebM / FLV / M4V / 3GP，最多 5 个文件，每个最大 500MB（可拖拽）'
              : 'Supports MP4 / MOV / MKV / AVI / WebM / FLV / M4V / 3GP, max 5 files, 500MB each (drag & drop)'}
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
                  <div className="file-meta">
                    {task.durationSec != null && (
                      <span className="meta-pill">
                        {language === 'zh-CN' ? '时长' : 'Duration'}: {formatTime(task.durationSec)}
                      </span>
                    )}
                    {task.width && task.height && (
                      <span className="meta-pill">
                        {language === 'zh-CN' ? '分辨率' : 'Resolution'}: {task.width}×{task.height}
                      </span>
                    )}
                    {task.inputFormat && (
                      <span className="meta-pill">
                        {language === 'zh-CN' ? '格式' : 'Format'}: {task.inputFormat.toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  {task.status === 'pending' && uiMode === 'advanced' && (
                    <div className="format-selector">
                      <label>{language === 'zh-CN' ? '转换为' : 'Convert to'}:</label>
                      <select
                        value={task.targetFormat}
                        onChange={(e) => handleFormatChange(task.id, e.target.value as VideoOutputFormat)}
                        disabled={isProcessing}
                      >
                        <option value="mp4">MP4 (H.264)</option>
                        <option value="webm">WebM (VP9)</option>
                        <option value="mov">MOV</option>
                        <option value="mkv">MKV</option>
                        <option value="avi">AVI</option>
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
                  {task.status === 'completed' && (
                    <button
                      className="reconvert-btn"
                      onClick={() => handleReconvert(task.id)}
                      disabled={isProcessing}
                      title={language === 'zh-CN' ? '重新转换' : 'Reconvert'}
                    >
                      <RotateCcw size={16} />
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

          <div className="mode-toggle">
            <button
              className={`mode-btn ${uiMode === 'simple' ? 'active' : ''}`}
              onClick={() => setUiMode('simple')}
              disabled={isProcessing}
            >
              {language === 'zh-CN' ? '极简模式' : 'Simple'}
            </button>
            <button
              className={`mode-btn ${uiMode === 'advanced' ? 'active' : ''}`}
              onClick={() => setUiMode('advanced')}
              disabled={isProcessing}
            >
              {language === 'zh-CN' ? '高级模式' : 'Advanced'}
            </button>
          </div>
          
          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '默认输出格式' : 'Default Output Format'}
            </label>
            <select
              value={defaultFormat}
              onChange={(e) => {
                const next = e.target.value as VideoOutputFormat
                setDefaultFormat(next)
                // 极简模式：同步所有待处理任务的输出格式
                if (uiMode === 'simple') {
                  setTasks(prev => prev.map(t => t.status === 'pending' ? { ...t, targetFormat: next } : t))
                }
              }}
              disabled={isProcessing}
            >
              <option value="mp4">MP4 (H.264 + AAC) ⭐</option>
              <option value="webm">WebM (VP9 + Opus)</option>
              <option value="mov">MOV</option>
              <option value="mkv">MKV</option>
              <option value="avi">AVI</option>
            </select>
            <small>
              {language === 'zh-CN' 
                ? '推荐：MP4（H.264 + AAC）兼容性最佳；极简模式默认目标大小≈源文件60%。'
                : 'Recommended: MP4 (H.264 + AAC); Simple mode targets ~60% of source size by default.'}
            </small>
          </div>

          {uiMode === 'advanced' && (
            <div className="settings-grid">
              <div className="setting-group">
                <label>{language === 'zh-CN' ? '视频编码' : 'Video Codec'}</label>
                <select
                  value={codec}
                  onChange={(e) => setCodec(e.target.value as VideoCodec)}
                  disabled={isProcessing || defaultFormat === 'webm'}
                >
                  <option value="h264">H.264 (推荐)</option>
                  <option value="h265">H.265 (更小体积)</option>
                </select>
                <small>
                  {defaultFormat === 'webm'
                    ? (language === 'zh-CN' ? 'WebM 固定使用 VP9。' : 'WebM uses VP9 automatically.')
                    : (language === 'zh-CN' ? 'H.264 兼容性最好；H.265 更省空间。' : 'H.264 best compatibility; H.265 smaller files.')}
                </small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '缩放宽度' : 'Scale Width'}</label>
                <select
                  value={scaleWidth}
                  onChange={(e) => setScaleWidth(parseInt(e.target.value, 10))}
                  disabled={isProcessing}
                >
                  <option value={0}>{language === 'zh-CN' ? '保持原始' : 'Keep original'}</option>
                  <option value={1920}>1920</option>
                  <option value={1280}>1280</option>
                  <option value={960}>960</option>
                  <option value={720}>720</option>
                  <option value={480}>480</option>
                </select>
                <small>{language === 'zh-CN' ? '仅设置宽度，高度按比例自动计算。' : 'Sets width only; height is auto.'}</small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '帧率' : 'FPS'}</label>
                <select
                  value={targetFps}
                  onChange={(e) => setTargetFps(parseInt(e.target.value, 10))}
                  disabled={isProcessing}
                >
                  <option value={0}>{language === 'zh-CN' ? '保持原始' : 'Keep original'}</option>
                  <option value={60}>60</option>
                  <option value={30}>30</option>
                  <option value={24}>24</option>
                  <option value={15}>15</option>
                </select>
                <small>{language === 'zh-CN' ? '降低帧率通常可明显减小体积。' : 'Lower FPS often reduces size.'}</small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '视频码率 (kbps)' : 'Video Bitrate (kbps)'}</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={videoBitrateKbps}
                  onChange={(e) => setVideoBitrateKbps(clamp(parseInt(e.target.value || '0', 10), 0, 50000))}
                  disabled={isProcessing}
                  className="number-input"
                />
                <small>{language === 'zh-CN' ? '0 表示自动（使用 CRF）。' : '0 = auto (uses CRF).'}</small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '视频质量 (CRF)' : 'Video Quality (CRF)'}: {quality}</label>
                <input
                  type="range"
                  min="18"
                  max="28"
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  disabled={isProcessing || videoBitrateKbps > 0}
                />
                <small>
                  {videoBitrateKbps > 0
                    ? (language === 'zh-CN' ? '已使用码率模式，CRF 将被忽略。' : 'Bitrate mode enabled; CRF is ignored.')
                    : (language === 'zh-CN' ? '18-28，越小越清晰（体积更大）。' : '18-28, lower = clearer (larger file).')}
                </small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '音频码率 (kbps)' : 'Audio Bitrate (kbps)'}</label>
                <input
                  type="number"
                  min={32}
                  max={320}
                  step={16}
                  value={audioBitrateKbps}
                  onChange={(e) => setAudioBitrateKbps(clamp(parseInt(e.target.value || '128', 10), 32, 320))}
                  disabled={isProcessing || removeAudio}
                  className="number-input"
                />
                <small>{language === 'zh-CN' ? '语音内容可用 64-96kbps。' : 'For speech, 64-96kbps is often enough.'}</small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '编码速度' : 'Encoding Speed'}</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  disabled={isProcessing || defaultFormat === 'webm'}
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
                  {defaultFormat === 'webm'
                    ? (language === 'zh-CN' ? 'WebM(VP9) 不使用 preset。' : 'WebM(VP9) does not use preset.')
                    : (language === 'zh-CN' ? '越慢通常越小，但耗时更长。' : 'Slower often yields smaller files but takes longer.')}
                </small>
              </div>

              <div className="setting-group">
                <label>{language === 'zh-CN' ? '移除音频' : 'Remove Audio'}</label>
                <div className="checkbox-row">
                  <input
                    id="remove-audio"
                    type="checkbox"
                    checked={removeAudio}
                    onChange={(e) => setRemoveAudio(e.target.checked)}
                    disabled={isProcessing}
                  />
                  <label htmlFor="remove-audio" className="checkbox-label">
                    {language === 'zh-CN' ? '转换后不保留音频轨道（更小体积）' : 'Remove audio track (smaller file)'}
                  </label>
                </div>
              </div>
            </div>
          )}

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
                    {canPreview(getOutputMime(task.targetFormat)) ? (
                      <video src={task.resultUrl} controls />
                    ) : (
                      <div className="preview-unsupported">
                        <div className="preview-unsupported-title">
                          {language === 'zh-CN' ? '浏览器可能不支持在线预览该格式' : 'Preview not supported in your browser'}
                        </div>
                        <div className="preview-unsupported-sub">
                          {language === 'zh-CN' ? '你仍然可以下载并使用本地播放器打开。' : 'You can still download and play it locally.'}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="result-info">
                    <div className="result-name">
                      {task.file.name.replace(/\.[^/.]+$/, '')}.{task.targetFormat}
                    </div>
                    <div className="result-stats">
                      <span className="stat-item">
                        <strong>{language === 'zh-CN' ? '原始' : 'Original'}:</strong> {formatFileSize(task.file.size)} ({task.inputFormat?.toUpperCase() || '?'})
                      </span>
                      <span className="stat-arrow">→</span>
                      <span className="stat-item">
                        <strong>{getFormatLabel(task.targetFormat)}:</strong> {task.outputSize ? formatFileSize(task.outputSize) : '--'}
                      </span>
                      {task.outputSize && task.file.size > 0 && (
                        <span className={`stat-badge ${task.outputSize < task.file.size ? 'saved' : 'bigger'}`}>
                          {task.outputSize < task.file.size
                            ? (language === 'zh-CN'
                                ? `节省 ${((1 - task.outputSize / task.file.size) * 100).toFixed(1)}%`
                                : `Saved ${((1 - task.outputSize / task.file.size) * 100).toFixed(1)}%`)
                            : (language === 'zh-CN'
                                ? `增大 ${((task.outputSize / task.file.size - 1) * 100).toFixed(1)}%`
                                : `Increased ${((task.outputSize / task.file.size - 1) * 100).toFixed(1)}%`)
                          }
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
