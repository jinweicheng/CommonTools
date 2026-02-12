import { useState, useRef, useCallback, useEffect } from 'react'
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
const SIMPLE_FORCED_OUTPUT_FORMAT: VideoOutputFormat = 'mp4'
const WEBCODECS_MAX_DURATION_SEC = 180
const WEBCODECS_MAX_INPUT_BYTES = 220 * 1024 * 1024
const WEBCODECS_MAX_FRAME_COUNT = 960
const WEBCODECS_MAX_SIDE = 1280

// 性能基准测试
interface BenchmarkResult {
  fileSize: number
  duration: number
  throughputMBps: number
  speedFactor: number // 相对于实时播放的倍数
}

const performBenchmark = (startTime: number, endTime: number, inputSize: number, videoDuration: number): BenchmarkResult => {
  const processingTime = (endTime - startTime) / 1000 // 秒
  const throughputMBps = (inputSize / (1024 * 1024)) / processingTime
  const speedFactor = videoDuration / processingTime
  
  return {
    fileSize: inputSize,
    duration: processingTime,
    throughputMBps: Math.round(throughputMBps * 100) / 100,
    speedFactor: Math.round(speedFactor * 100) / 100
  }
}

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
  processingRoute?: 'remux' | 'fast-encode' | 'fallback'
  error?: string
  startTime?: number
  endTime?: number
}

interface WebCodecsEncodeResult {
  videoBitstream: Uint8Array
  fps: number
  width: number
  height: number
}

interface WebCodecsDynamicProfile {
  maxDurationSec: number
  maxInputBytes: number
  fpsCap: number
  width: number
  height: number
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
  const [simpleTurboMode, setSimpleTurboMode] = useState(false)

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

  const getRouteLabel = (route?: ConversionTask['processingRoute']): string => {
    if (!route) return '-'
    if (route === 'remux') return 'remux'
    if (route === 'fast-encode') return 'fast-encode'
    return 'fallback'
  }

  const canPreview = (mime: string): boolean => {
    const v = document.createElement('video')
    return v.canPlayType(mime) !== ''
  }

  const concatUint8Arrays = (chunks: Uint8Array[]): Uint8Array => {
    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      out.set(c, offset)
      offset += c.byteLength
    }
    return out
  }

  const getWebCodecsDynamicProfile = useCallback((task: ConversionTask): WebCodecsDynamicProfile => {
    const srcWidth = Math.max(2, task.width || 1280)
    const srcHeight = Math.max(2, task.height || 720)
    const maxSide = Math.max(srcWidth, srcHeight)
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4
    const memoryGb = typeof navigator !== 'undefined' ? ((navigator as any).deviceMemory || 4) : 4

    let maxDurationSec = WEBCODECS_MAX_DURATION_SEC
    let maxInputBytes = WEBCODECS_MAX_INPUT_BYTES
    let fpsCap = 30
    let width = srcWidth
    let height = srcHeight

    if (maxSide >= 2160) {
      width = 1920
      height = Math.max(2, Math.round((srcHeight / srcWidth) * 1920))
      fpsCap = 24
      maxDurationSec = 90
      maxInputBytes = 140 * 1024 * 1024
    } else if (maxSide >= 1440) {
      fpsCap = 24
      maxDurationSec = 120
      maxInputBytes = 180 * 1024 * 1024
    }

    if (cores <= 4 || memoryGb <= 4) {
      maxDurationSec = Math.min(maxDurationSec, 90)
      maxInputBytes = Math.min(maxInputBytes, 120 * 1024 * 1024)
      fpsCap = Math.min(fpsCap, 24)
    }

    if (cores >= 12 && memoryGb >= 8) {
      maxDurationSec = Math.min(240, maxDurationSec + 30)
      maxInputBytes = Math.min(280 * 1024 * 1024, maxInputBytes + 40 * 1024 * 1024)
    }

    return {
      maxDurationSec,
      maxInputBytes,
      fpsCap,
      width,
      height,
    }
  }, [])

  // 轻量 probe：在尝试 remux 前先判断容器/编码是否匹配，避免无效回退双重耗时
  const probeVideoCodec = useCallback(async (file: File): Promise<{
    isH264: boolean
    isRemuxCompatible: boolean
    hasAudio: boolean
  }> => {
    try {
      const chunk = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer()
      const bytes = new Uint8Array(chunk)

      const isIsoBmff = bytes.length > 12 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp'
      const isRiffAvi = bytes.length > 12
        && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF'
        && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'AVI '
      const isFlv = bytes.length > 3 && String.fromCharCode(bytes[0], bytes[1], bytes[2]) === 'FLV'
      const isMatroska = bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3

      const sampleText = new TextDecoder('latin1').decode(bytes)
      const sampleLower = sampleText.toLowerCase()

      const hasH264Marker = sampleText.includes('avcC') || sampleLower.includes('avc1') || sampleText.includes('V_MPEG4/ISO/AVC')
      const hasH265Marker = sampleText.includes('hvcC') || sampleLower.includes('hev1') || sampleLower.includes('hvc1') || sampleText.includes('V_MPEGH/ISO/HEVC')
      const hasVp9Marker = sampleLower.includes('vp09') || sampleText.includes('V_VP9')
      const hasAudioMarker = sampleLower.includes('mp4a') || sampleText.includes('A_AAC') || sampleText.includes('A_OPUS') || sampleLower.includes('opus') || sampleLower.includes('mp3')

      const isLikelyH264 = hasH264Marker && !hasH265Marker && !hasVp9Marker

      const containerCanRemuxToMp4 = isIsoBmff || isRiffAvi || isFlv || isMatroska
      const isRemuxCompatible = containerCanRemuxToMp4 && isLikelyH264

      return {
        isH264: isLikelyH264,
        isRemuxCompatible,
        hasAudio: hasAudioMarker
      }
    } catch (err) {
      console.warn('Probe failed, fallback to direct encode path:', err)
      return { isH264: false, isRemuxCompatible: false, hasAudio: false }
    }
  }, [])

  // WebCodecs 支持检测（为后续优化做准备）
  const detectWebCodecsSupport = useCallback(() => {
    const support = {
      available: typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined',
      hardwareAcceleration: false,
      supportedCodecs: [] as string[]
    }

    if (support.available) {
      console.log('🧬 WebCodecs API available - potential for hardware-accelerated encoding')
      
      // 检测常用编码器支持（异步，不阻塞主流程）
      const testConfigs = [
        { codec: 'avc1.42E01E', width: 640, height: 480 }, // H.264 Baseline
        { codec: 'avc1.4D001E', width: 640, height: 480 }, // H.264 Main
        { codec: 'avc1.64001E', width: 640, height: 480 }, // H.264 High
        { codec: 'vp09.00.10.08', width: 640, height: 480 }, // VP9
      ]

      Promise.allSettled(
        testConfigs.map(config => 
          VideoEncoder.isConfigSupported(config).then(result => 
            result.supported ? config.codec : null
          ).catch(() => null)
        )
      ).then(results => {
        support.supportedCodecs = results
          .filter((r): r is PromiseFulfilledResult<string> => 
            r.status === 'fulfilled' && r.value !== null
          )
          .map(r => r.value)
        
        support.hardwareAcceleration = support.supportedCodecs.some(codec => 
          codec.startsWith('avc1')
        )
        
        console.log('🚀 WebCodecs capabilities:', support)
      })
    } else {
      console.log('❌ WebCodecs not available - using FFmpeg.wasm only')
    }

    return support
  }, [])

  const canUseWebCodecsSimplePath = useCallback(async (task: ConversionTask): Promise<boolean> => {
    if (uiMode !== 'simple') return false
    if (simpleTurboMode) return false
    if (task.targetFormat !== 'mp4') return false
    if (removeAudio) return false
    if (scaleWidth > 0 || targetFps > 0 || videoBitrateKbps > 0) return false
    if (!task.durationSec || task.durationSec <= 0) return false
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false

    const profile = getWebCodecsDynamicProfile(task)
    const maxSide = Math.max(task.width || 0, task.height || 0)
    const estimatedFps = Math.max(12, Math.min(profile.fpsCap, Math.round((task.durationSec || 30) > 60 ? 24 : 30)))
    const estimatedFrames = Math.floor(task.durationSec * estimatedFps)

    if (task.durationSec > profile.maxDurationSec) return false
    if (task.file.size > profile.maxInputBytes) return false
    // 当前 WebCodecs 路径基于逐帧 seek+draw，对长视频会非常慢；仅对短视频启用
    if (estimatedFrames > WEBCODECS_MAX_FRAME_COUNT) return false
    if (maxSide > WEBCODECS_MAX_SIDE) return false

    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: 'avc1.42001f',
        width: profile.width,
        height: profile.height,
        bitrate: 2_500_000,
        framerate: profile.fpsCap,
        avc: { format: 'annexb' },
        hardwareAcceleration: 'prefer-hardware'
      } as VideoEncoderConfig)
      return !!support.supported
    } catch {
      return false
    }
  }, [getWebCodecsDynamicProfile, removeAudio, scaleWidth, simpleTurboMode, targetFps, uiMode, videoBitrateKbps])

  const encodeToH264WithWebCodecs = useCallback(async (
    task: ConversionTask,
    onProgress?: (progress: number) => void,
  ): Promise<WebCodecsEncodeResult> => {
    const profile = getWebCodecsDynamicProfile(task)
    const targetFps = Math.min(profile.fpsCap, Math.max(12, Math.round((task.durationSec || 30) > 60 ? 24 : 30)))
    const width = profile.width
    const height = profile.height

    const url = URL.createObjectURL(task.file)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = url

    const waitMetadata = () => new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
        resolve()
      }
      const onError = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
        reject(new Error('Failed to read source video metadata'))
      }
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onError)
    })

    const seekTo = (timeSec: number) => new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        resolve()
      }
      const onError = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        reject(new Error('Seek failed during WebCodecs encode'))
      }
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.currentTime = Math.max(0, Math.min(timeSec, Math.max((task.durationSec || 0) - 0.01, 0)))
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      URL.revokeObjectURL(url)
      throw new Error('Failed to create canvas for WebCodecs path')
    }

    const chunks: Uint8Array[] = []
    const encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        chunks.push(data)
      },
      error: (e) => {
        console.error('WebCodecs encoder error:', e)
      },
    })

    try {
      await waitMetadata()

      const maxSide = Math.max(width, height)
      const targetBitrate = maxSide >= 1920 ? 4_500_000 : maxSide >= 1280 ? 3_000_000 : 1_800_000

      encoder.configure({
        codec: 'avc1.42001f',
        width,
        height,
        bitrate: targetBitrate,
        framerate: targetFps,
        avc: { format: 'annexb' },
        hardwareAcceleration: 'prefer-hardware'
      })

      const durationSec = Math.max(0.1, task.durationSec || video.duration || 0.1)
      const frameCount = Math.max(1, Math.floor(durationSec * targetFps))

      for (let i = 0; i < frameCount; i++) {
        const ts = i / targetFps
        await seekTo(ts)
        ctx.drawImage(video, 0, 0, width, height)
        const frame = new VideoFrame(canvas, { timestamp: Math.round(ts * 1_000_000) })
        encoder.encode(frame, { keyFrame: i % Math.max(1, targetFps) === 0 })
        frame.close()
        onProgress?.(Math.round((i / frameCount) * 100))
      }

      await encoder.flush()
      onProgress?.(100)

      if (chunks.length === 0) {
        throw new Error('WebCodecs produced empty H.264 stream')
      }

      return {
        videoBitstream: concatUint8Arrays(chunks),
        fps: targetFps,
        width,
        height,
      }
    } finally {
      try { encoder.close() } catch {}
      URL.revokeObjectURL(url)
    }
  }, [getWebCodecsDynamicProfile])

  // 组件初始化：检测环境能力
  useEffect(() => {
    // 异步检测WebCodecs支持，为后续优化提供信息
    detectWebCodecsSupport()
  }, [detectWebCodecsSupport])

  useEffect(() => {
    if (uiMode !== 'simple') return
    if (defaultFormat !== SIMPLE_FORCED_OUTPUT_FORMAT) {
      setDefaultFormat(SIMPLE_FORCED_OUTPUT_FORMAT)
    }
    setTasks(prev => prev.map(t =>
      t.status === 'pending'
        ? { ...t, targetFormat: SIMPLE_FORCED_OUTPUT_FORMAT }
        : t
    ))
  }, [uiMode, defaultFormat])

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

      // 检查环境和多线程支持
      const envCheck = () => {
        const issues: string[] = []
        
        if (typeof SharedArrayBuffer === 'undefined') {
          issues.push('SharedArrayBuffer不可用 - 需要COOP/COEP头部')
        }
        
        if (!crossOriginIsolated) {
          issues.push('未启用crossOriginIsolated - 多线程性能受限')
        }
        
        if (typeof Worker === 'undefined') {
          issues.push('Web Workers不可用')
        }
        
        return issues
      }
      
      const envIssues = envCheck()
      if (envIssues.length > 0) {
        console.warn('⚠️ Environment issues:', envIssues)
        if (typeof SharedArrayBuffer === 'undefined') {
          throw new Error('SharedArrayBuffer not available - check server COOP/COEP headers')
        }
      } else {
        console.log('✅ Optimal environment: SharedArrayBuffer + crossOriginIsolated available')
      }

      // 优先使用本地文件（快速、减少跨域延迟）
      const isDev = import.meta.env.DEV
      let baseURL = isDev 
        ? window.location.origin 
        : (window.location.origin + import.meta.env.BASE_URL)
      baseURL = baseURL.replace(/\/+$/, '')
      
      const localCore = `${baseURL}/ffmpeg-core.js`
      const localWasm = `${baseURL}/ffmpeg-core.wasm`

      try {
        // 智能本地文件检查：验证文件存在性和大小
        setLoadingProgress(language === 'zh-CN' ? '检查本地FFmpeg文件...' : 'Checking local FFmpeg files...')
        
        const [coreRes, wasmRes] = await Promise.allSettled([
          fetch(localCore, { method: 'HEAD', cache: 'force-cache' }),
          fetch(localWasm, { method: 'HEAD', cache: 'force-cache' })
        ])
        
        const coreOk = coreRes.status === 'fulfilled' && coreRes.value.ok
        const wasmOk = wasmRes.status === 'fulfilled' && wasmRes.value.ok
        
        if (coreOk && wasmOk) {
          const coreSize = coreRes.status === 'fulfilled' ? 
            parseInt(coreRes.value.headers.get('content-length') || '0', 10) : 0
          const wasmSize = wasmRes.status === 'fulfilled' ? 
            parseInt(wasmRes.value.headers.get('content-length') || '0', 10) : 0
          
          // 验证文件大小合理（防止损坏的缓存）
          if (coreSize > 50000 && wasmSize > 15000000) { // 降低WASM最小大小阈值
            setLoadingProgress(language === 'zh-CN' ? '使用本地FFmpeg（更快加载）...' : 'Using local FFmpeg (faster loading)...')
            
            const [coreBlob, wasmBlob] = await Promise.all([
              toBlobURL(localCore, 'text/javascript'),
              toBlobURL(localWasm, 'application/wasm')
            ])
            
            setLoadingProgress(language === 'zh-CN' ? '正在初始化本地FFmpeg...' : 'Initializing local FFmpeg...')
            
            await ffmpeg.load({
              coreURL: coreBlob,
              wasmURL: wasmBlob,
            })
            
            console.log(`✅ Local FFmpeg loaded successfully (Core: ${(coreSize/1024).toFixed(0)}KB, WASM: ${(wasmSize/1024/1024).toFixed(1)}MB)`)
            
            ffmpegRef.current = ffmpeg
            setFfmpegLoaded(true)
            setFfmpegLoading(false)
            setLoadingProgress('')
            return true
          } else {
            console.warn(`❌ Local files too small: Core ${coreSize}B, WASM ${wasmSize}B`)
          }
        } else {
          console.warn(`❌ Local files not accessible: Core ${coreOk}, WASM ${wasmOk}`)
        }
      } catch (localErr) {
        console.warn('Local file detection failed, using CDN fallback:', localErr)
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
            ? `文件过大 (最大100MB): ${file.name}`
            : `File too large (max 100MB): ${file.name}`
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
      // 简单模式：强制 H.264 + fast preset（最优速度/质量平衡）
      // 高级模式：可选择编码器
      if (uiMode === 'simple') {
        const maxSide = Math.max(task.width || 0, task.height || 0)
        const isHeavyInput =
          task.file.size > 60 * 1024 * 1024 ||
          (task.durationSec || 0) > 90 ||
          maxSide >= 1920

        args.push('-c:v', 'libx264')
        // Turbo: 牺牲少量体积比，换更极致速度
        const simplePreset = simpleTurboMode
          ? (isHeavyInput ? 'ultrafast' : 'superfast')
          : (isHeavyInput ? 'superfast' : 'fast')
        args.push('-preset', simplePreset)
        if (isHeavyInput || simpleTurboMode) {
          args.push('-tune', 'zerolatency')
        }
        args.push('-threads', '0')
      } else {
        // Advanced 模式保持原有选择
        const selectedCodec = codec
        if (selectedCodec === 'h265') {
          args.push('-c:v', 'libx265')
        } else {
          args.push('-c:v', 'libx264')
        }
        args.push('-preset', preset)
        args.push('-threads', '0')
      }

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
  }, [audioBitrateKbps, clamp, codec, preset, quality, removeAudio, scaleWidth, simpleTurboMode, targetFps, uiMode, videoBitrateKbps])

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

  // 智能remux：先探测再决定是否尝试
  const shouldAttemptRemux = useCallback(async (task: ConversionTask): Promise<boolean> => {
    if (!canUseFastRemux(task)) return false

    // MOV/MP4/M4V 在 simple->MP4 场景直接优先尝试 remux，失败再回退转码
    // 这类输入在真实场景里命中率高，且失败成本低（通常很快返回）
    if (
      uiMode === 'simple' &&
      task.targetFormat === 'mp4' &&
      (task.inputFormat === 'mov' || task.inputFormat === 'mp4' || task.inputFormat === 'm4v')
    ) {
      return true
    }
    
    try {
      const probeResult = await probeVideoCodec(task.file)
      
      // 只有在探测到兼容编码时才尝试 remux
      // simple 模式目标为商业稳定输出：仅对 H.264 走 remux
      return probeResult.isRemuxCompatible && (
        task.inputFormat === task.targetFormat ||
        (probeResult.isH264 && ['mp4', 'mov', 'mkv'].includes(task.targetFormat))
      )
    } catch (err) {
      console.warn('Video probe failed, skipping remux:', err)
      return false
    }
  }, [canUseFastRemux, probeVideoCodec, uiMode])

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

      // 执行转换：智能快速路径判定（先探测再尝试remux）
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { 
          ...t, 
          progress: 22,
          progressMessage: language === 'zh-CN' ? '分析视频编码...' : 'Analyzing video encoding...'
        } : t
      ))

      const shouldRemux = await shouldAttemptRemux(task)

      let converted = false
      let hadFallback = false
      let processingRoute: ConversionTask['processingRoute'] | undefined
      if (shouldRemux) {
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
          processingRoute = 'remux'
        } catch (fastErr) {
          console.warn('Fast remux failed, fallback to re-encode:', fastErr)
          hadFallback = true
        }
      }

      if (!converted) {
        let webCodecsDone = false
        const canUseWebCodecs = await canUseWebCodecsSimplePath(task)

        if (canUseWebCodecs) {
          setTasks(prev => prev.map(t =>
            t.id === task.id
              ? {
                  ...t,
                  progress: 28,
                  progressMessage: language === 'zh-CN'
                    ? 'WebCodecs 硬件编码中...' 
                    : 'WebCodecs hardware encoding...'
                }
              : t
          ))

          try {
            const wcStartAt = Date.now()
            let lastEtaUpdate = 0
            const encoded = await encodeToH264WithWebCodecs(task, (p) => {
              const mapped = 28 + Math.round((p / 100) * 42)
              const now = Date.now()
              if (now - lastEtaUpdate < 200) return
              lastEtaUpdate = now
              const elapsedSec = (now - wcStartAt) / 1000
              const ratio = Math.max(0.01, p / 100)
              const etaSec = Math.max(0, Math.round((elapsedSec / ratio) - elapsedSec))
              updateProgress(
                mapped,
                language === 'zh-CN'
                  ? `WebCodecs 编码中... ${p}% · 预计剩余 ${etaSec}s`
                  : `WebCodecs encoding... ${p}% · ETA ${etaSec}s`
              )
            })

            await ffmpeg.writeFile('webcodecs.h264', encoded.videoBitstream)

            const audioKbps = uiMode === 'simple' ? 96 : clamp(audioBitrateKbps, 32, 320)
            const muxArgs = [
              '-i', inputName,
              '-f', 'h264',
              '-r', String(encoded.fps),
              '-i', 'webcodecs.h264',
              '-map', '1:v:0',
              '-map', '0:a?',
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', `${Math.max(64, audioKbps)}k`,
              '-movflags', '+faststart',
              '-shortest',
              `output.${task.targetFormat}`,
            ]

            await ffmpeg.exec(muxArgs)
            webCodecsDone = true
            converted = true
            processingRoute = 'fast-encode'
          } catch (webErr) {
            console.warn('WebCodecs hybrid path failed, fallback to FFmpeg full encode:', webErr)
            hadFallback = true
            try {
              await ffmpeg.deleteFile('webcodecs.h264')
            } catch {
              // ignore
            }
          }
        }

        if (!webCodecsDone) {
          const args = buildFFmpegArgs(task, inputName)
          await ffmpeg.exec(args)
          converted = true
          processingRoute = hadFallback ? 'fallback' : 'fast-encode'
        }
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
        await ffmpeg.deleteFile('webcodecs.h264')
      } catch (err) {
        console.warn('Failed to clean up:', err)
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(1)

      // 生成基准测试数据
      const benchmark = task.durationSec ? 
        performBenchmark(startTime, endTime, task.file.size, task.durationSec) : null
      
      // 记录性能基准（帮助量化优化效果）
      if (benchmark) {
        const speedText = benchmark.speedFactor >= 1 
          ? `${benchmark.speedFactor.toFixed(1)}x实时速度` 
          : `${(1/benchmark.speedFactor).toFixed(1)}x慢于实时`
        console.log(`📊 Conversion benchmark: ${formatFileSize(benchmark.fileSize)} in ${benchmark.duration.toFixed(1)}s (${benchmark.throughputMBps}MB/s, ${speedText})`)
      }

      // 更新任务状态
      setTasks(prev => prev.map(t => 
        t.id === task.id 
          ? { 
              ...t, 
              status: 'completed' as const, 
              progress: 100,
              progressMessage: language === 'zh-CN' 
                ? `完成！用时 ${duration}秒${benchmark ? ` (${benchmark.throughputMBps}MB/s)` : ''}` 
                : `Completed! ${duration}s${benchmark ? ` (${benchmark.throughputMBps}MB/s)` : ''}`,
              result: blob,
              resultUrl,
              outputSize: blob.size,
              processingRoute,
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
  }, [
    audioBitrateKbps,
    buildFFmpegArgs,
    buildFastRemuxArgs,
    canUseWebCodecsSimplePath,
    clamp,
    encodeToH264WithWebCodecs,
    language,
    loadFFmpeg,
    shouldAttemptRemux,
    uiMode,
  ])

  // 处理所有任务
  const handleProcess = useCallback(async () => {
    if (tasks.length === 0) return

    const pendingTasks = tasks.filter(t => t.status === 'pending')
    if (pendingTasks.length === 0) return

    // 商业默认快速通道：simple 模式强制统一输出 MP4（H.264 + fast）
    const normalizedPendingTasks = uiMode === 'simple'
      ? pendingTasks.map(t => ({ ...t, targetFormat: SIMPLE_FORCED_OUTPUT_FORMAT }))
      : pendingTasks

    if (uiMode === 'simple') {
      setDefaultFormat(SIMPLE_FORCED_OUTPUT_FORMAT)
      setTasks(prev => prev.map(t =>
        t.status === 'pending'
          ? { ...t, targetFormat: SIMPLE_FORCED_OUTPUT_FORMAT }
          : t
      ))
    }

    // 只在开始转换时加载 FFmpeg，加载阶段不要全屏遮罩。
    const ok = await loadFFmpeg()
    if (!ok) return

    setIsProcessing(true)

    try {
      for (const task of normalizedPendingTasks) {
        try {
          await convertVideo(task)
        } catch (err) {
          console.error(`Failed to convert ${task.file.name}:`, err)
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [tasks, convertVideo, uiMode])

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
        processingRoute: undefined,
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
                    {task.processingRoute && (
                      <span className="meta-pill">
                        {language === 'zh-CN' ? '路径' : 'Path'}: {getRouteLabel(task.processingRoute)}
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
                const next = (uiMode === 'simple'
                  ? SIMPLE_FORCED_OUTPUT_FORMAT
                  : e.target.value) as VideoOutputFormat
                setDefaultFormat(next)
                // 极简模式：同步所有待处理任务的输出格式
                if (uiMode === 'simple') {
                  setTasks(prev => prev.map(t => t.status === 'pending' ? { ...t, targetFormat: SIMPLE_FORCED_OUTPUT_FORMAT } : t))
                }
              }}
              disabled={isProcessing}
            >
              <option value="mp4">MP4 (H.264 + AAC) ⭐</option>
              {uiMode === 'advanced' && (
                <>
                  <option value="webm">WebM (VP9 + Opus)</option>
                  <option value="mov">MOV</option>
                  <option value="mkv">MKV</option>
                  <option value="avi">AVI</option>
                </>
              )}
            </select>
            <small>
              {language === 'zh-CN' 
                ? (uiMode === 'simple'
                    ? '极简模式已锁定为 MP4（H.264 + AAC）快速通道：fast preset + 最低码率保护。'
                    : '推荐：MP4（H.264 + AAC）兼容性最佳；高级模式可切换容器与编码参数。')
                : (uiMode === 'simple'
                    ? 'Simple mode is locked to MP4 (H.264 + AAC) fast lane: fast preset + minimum bitrate protection.'
                    : 'Recommended: MP4 (H.264 + AAC) for best compatibility; advanced mode supports more containers and codec tuning.')}
            </small>
          </div>

          {uiMode === 'simple' && (
            <div className="simple-info">
              <div className="info-card">
                <h4>{language === 'zh-CN' ? '极简模式已优化' : 'Simple Mode Optimized'}</h4>
                <ul>
                  <li>{language === 'zh-CN' ? '✓ 强制H.264编码（最佳兼容性）' : '✓ Enforced H.264 encoding (best compatibility)'}</li>
                  <li>{language === 'zh-CN' ? '✓ Fast预设（速度/质量平衡）' : '✓ Fast preset (speed/quality balance)'}</li>
                  <li>{language === 'zh-CN' ? '✓ 自动分流 WebCodecs（可用时硬件编码）' : '✓ Auto WebCodecs route (hardware encode when available)'}</li>
                  <li>{language === 'zh-CN' ? '✓ 智能容器重封装（大幅提速）' : '✓ Smart container remuxing (major speedup)'}</li>
                  <li>{language === 'zh-CN' ? '✓ 自动码率保护（防止过小）' : '✓ Auto bitrate protection (prevent too small)'}</li>
                  <li>{language === 'zh-CN' ? '✓ 30fps上限（避免不必要处理）' : '✓ 30fps limit (avoid unnecessary processing)'}</li>
                </ul>

                <div className="checkbox-row" style={{ marginTop: 10 }}>
                  <input
                    id="simple-turbo-mode"
                    type="checkbox"
                    checked={simpleTurboMode}
                    onChange={(e) => setSimpleTurboMode(e.target.checked)}
                    disabled={isProcessing}
                  />
                  <label htmlFor="simple-turbo-mode" className="checkbox-label">
                    {language === 'zh-CN'
                      ? 'Turbo 开关：更偏向速度（可能稍增输出体积）'
                      : 'Turbo mode: prioritize speed (may slightly increase output size)'}
                  </label>
                </div>
              </div>
            </div>
          )}

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
                      {task.processingRoute && (
                        <span className="stat-item">
                          <strong>{language === 'zh-CN' ? '路径' : 'Path'}:</strong> {getRouteLabel(task.processingRoute)}
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
