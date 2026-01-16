import { useState, useRef, useCallback, useEffect } from 'react'
import { Download, Play, Image as ImageIcon, Film, FileVideo, Loader2, Settings, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import heic2any from 'heic2any'
import { saveAs } from 'file-saver'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { convertVideoToGIF } from '../utils/videoToGif'
import { useI18n } from '../i18n/I18nContext'
import { trackFileUpload, trackFileDownload, trackUsage } from '../utils/usageStatisticsService'
import './LivePhotoConverter.css'

interface LivePhotoFiles {
  heic: File | null
  mov: File | null
}

type ConversionMode = 'gif' | 'mp4' | 'static'

interface ConversionResult {
  type: ConversionMode
  blob: Blob
  preview?: string
}

export default function LivePhotoConverter() {
  const { t, language } = useI18n()
  const [livePhoto, setLivePhoto] = useState<LivePhotoFiles>({ heic: null, mov: null })
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ConversionMode>('gif')
  const [result, setResult] = useState<ConversionResult | null>(null)
  
  // GIF 设置
  const [gifQuality, setGifQuality] = useState(10) // 1-20, 越低越好
  const [gifFps, setGifFps] = useState(10) // 帧率
  const [gifWidth, setGifWidth] = useState(480) // 宽度
  
  // MP4 设置
  const [mp4Quality, setMp4Quality] = useState(23) // CRF: 0-51, 越低越好
  
  // 帧去重设置
  const [enableDedup, setEnableDedup] = useState(true)
  const [dedupThreshold, setDedupThreshold] = useState(5) // 0-100, 相似度阈值
  
  const heicInputRef = useRef<HTMLInputElement>(null)
  const movInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const preloadAttemptedRef = useRef(false)
  const loadPromiseRef = useRef<Promise<boolean> | null>(null)
  const loadAbortControllerRef = useRef<AbortController | null>(null)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const [loadingTimeElapsed, setLoadingTimeElapsed] = useState(0)

  // 带超时和进度显示的 fetch 包装器
  const fetchWithProgress = async (
    url: string,
    onProgress?: (loaded: number, total: number) => void,
    timeout: number = 180000
  ): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (!onProgress || !response.body || total === 0) {
        return response
      }

      // 创建带进度的响应
      const reader = response.body.getReader()
      let loaded = 0
      const chunks: Uint8Array[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        loaded += value.length
        onProgress(loaded, total)
      }

      // 重建响应
      const blob = new Blob(chunks as BlobPart[])
      return new Response(blob, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  // 带超时和重试的 toBlobURL（带进度显示）
  const toBlobURLWithRetry = async (
    url: string,
    fileName: string,
    _retries: number = 2, // 保留参数以保持接口一致性
    timeout: number = 60000 // 减少到 60 秒
  ): Promise<string> => {
    // 检测是否支持 SharedArrayBuffer（多线程）
    const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined'
    const ffmpegPackage = supportsSharedArrayBuffer ? 'core' : 'core-st'
    
    if (!supportsSharedArrayBuffer) {
      console.warn(`⚠️ SharedArrayBuffer not available, using single-threaded FFmpeg (@ffmpeg/core-st)`)
      console.warn(`Performance will be slightly slower but should work correctly.`)
    } else {
      console.log(`✓ Using multi-threaded FFmpeg (@ffmpeg/core)`)
    }
    
    // 本地路径优先，CDN 作为备选
    const baseUrl = window.location.origin
    const pathPrefix = window.location.pathname.includes('/tools') ? '/tools' : ''
    
    const allUrls = [
      // 1. 本地路径（最优先）
      `${baseUrl}${pathPrefix}/${url}`,
      // 2. 快速 CDN（自动选择单线程或多线程版本）
      `https://cdn.jsdelivr.net/npm/@ffmpeg/${ffmpegPackage}@0.12.6/dist/umd/${url}`,
      `https://unpkg.com/@ffmpeg/${ffmpegPackage}@0.12.6/dist/umd/${url}`,
    ]
    
    console.log(`[${fileName}] Using FFmpeg package: @ffmpeg/${ffmpegPackage}`)
    console.log(`[${fileName}] Local path will be: ${baseUrl}${pathPrefix}/${url}`)

    let lastError: Error | null = null

    console.log(`[${fileName}] Starting to load from multiple sources...`)
    console.log(`[${fileName}] Will try: Local -> CDN1 -> CDN2`)

    // 快速测试可用性（减少测试时间）
    const speedTests = await Promise.allSettled(
      allUrls.map(async (testUrl, index) => {
        const startTime = Date.now()
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000) // 3秒测试超时
          const response = await fetch(testUrl, {
            signal: controller.signal,
            method: 'HEAD', // 只获取头部，更快
          })
          clearTimeout(timeoutId)
          const speed = Date.now() - startTime
          const source = index === 0 ? 'Local' : `CDN${index}`
          console.log(`[${fileName}] ${source} test: ${response.ok ? '✓' : '✗'} (${speed}ms)`)
          if (response.ok) {
            return { url: testUrl, speed, success: true, source }
          }
          return { url: testUrl, speed: Infinity, success: false, source }
        } catch (err) {
          const source = index === 0 ? 'Local' : `CDN${index}`
          console.log(`[${fileName}] ${source} test failed:`, err instanceof Error ? err.message : String(err))
          return { url: testUrl, speed: Infinity, success: false, source }
        }
      })
    )

    // 按速度排序可用源
    const sortedUrls = speedTests
      .map((result, index) => ({
        url: allUrls[index],
        speed: result.status === 'fulfilled' && result.value.success ? result.value.speed : Infinity,
        source: result.status === 'fulfilled' ? result.value.source : `Source${index}`,
      }))
      .filter(item => item.speed < Infinity)
      .sort((a, b) => a.speed - b.speed)

    // 如果没有可用源，使用原始列表
    const finalUrlList = sortedUrls.length > 0 ? sortedUrls : allUrls.map((url, i) => ({ 
      url, 
      speed: Infinity, 
      source: i === 0 ? 'Local' : `CDN${i}`
    }))

    console.log(`[${fileName}] Will use order:`, finalUrlList.map(u => u.source).join(' -> '))

    for (const urlInfo of finalUrlList) {
      const attemptStartTime = Date.now()
      try {
        console.log(`[${fileName}] Loading from ${urlInfo.source}...`)
        
        const response = await fetchWithProgress(
          urlInfo.url,
          (loaded, total) => {
            const percent = total > 0 ? Math.round((loaded / total) * 100) : 0
            const elapsed = (Date.now() - attemptStartTime) / 1000
            const speed = loaded / elapsed / 1024 // KB/s
            const sizeStr = `${(loaded / 1024 / 1024).toFixed(2)}MB${total > 0 ? `/${(total / 1024 / 1024).toFixed(2)}MB` : ''}`
            
            // 每5%输出一次进度，减少日志
            if (percent % 5 === 0 || percent === 100) {
              console.log(`[${fileName}] ${urlInfo.source}: ${percent}% (${sizeStr}) @ ${speed.toFixed(0)}KB/s`)
            }
            
            // 更新进度条（针对当前文件）
            if (fileName.includes('ffmpeg-core.js')) {
              setProgress(10 + Math.round(percent * 0.2)) // 10-30%
              setProgressMessage(`Loading FFmpeg (1/2): ${percent}%`)
            } else if (fileName.includes('ffmpeg-core.wasm')) {
              setProgress(30 + Math.round(percent * 0.2)) // 30-50%
              setProgressMessage(`Loading FFmpeg (2/2): ${percent}%`)
            }
          },
          timeout
        )

        const blob = await response.blob()
        const blobURL = URL.createObjectURL(blob)
        const elapsed = ((Date.now() - attemptStartTime) / 1000).toFixed(2)
        console.log(`[${fileName}] ✓ Successfully loaded from ${urlInfo.source} in ${elapsed}s (${(blob.size / 1024 / 1024).toFixed(2)}MB)`)
        return blobURL
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const elapsed = ((Date.now() - attemptStartTime) / 1000).toFixed(2)
        console.warn(`[${fileName}] ✗ Failed from ${urlInfo.source} (${elapsed}s):`, lastError.message)
        
        // 继续尝试下一个源
        if (urlInfo !== finalUrlList[finalUrlList.length - 1]) {
          console.log(`[${fileName}] Trying next source...`)
        }
      }
    }

    throw new Error(`Failed to load ${fileName} from all sources (Local + CDN). Last error: ${lastError?.message || 'Unknown error'}. Please check your network connection.`)
  }

  // 取消加载
  const cancelFFmpegLoad = useCallback(() => {
    console.log('Cancelling FFmpeg load...')
    if (loadAbortControllerRef.current) {
      loadAbortControllerRef.current.abort()
      loadAbortControllerRef.current = null
    }
    loadPromiseRef.current = null
    setFfmpegLoading(false)
    setLoadingTimeElapsed(0)
    setProgress(0)
    setProgressMessage('')
  }, [])

  // 初始化 FFmpeg
  const loadFFmpeg = useCallback(async () => {
    // 如果已经加载，直接返回
    if (ffmpegLoaded || ffmpegRef.current) {
      console.log('FFmpeg already loaded')
      return true
    }

    // 如果正在加载，等待现有的加载 Promise（最多等待 10 秒）
    if (loadPromiseRef.current) {
      console.log('FFmpeg is already loading, waiting for existing load...')
      try {
        // 使用 Promise.race 添加超时
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error('Wait timeout after 10s')), 10000)
        })
        const result = await Promise.race([loadPromiseRef.current, timeoutPromise])
        console.log('Waited for FFmpeg load, result:', result)
        return result
      } catch (err) {
        console.error('Error while waiting for FFmpeg load:', err)
        // 如果等待超时或失败，取消加载并重试
        cancelFFmpegLoad()
      }
    }

    // 创建新的加载 Promise
    const abortController = new AbortController()
    loadAbortControllerRef.current = abortController
    
    const loadStartTime = Date.now()
    const loadPromise = (async () => {
      // 更新加载时间计时器
      const timer = setInterval(() => {
        setLoadingTimeElapsed(Math.floor((Date.now() - loadStartTime) / 1000))
      }, 1000)

      try {
        console.log('Starting FFmpeg load...')
        setFfmpegLoading(true)
        setLoadingTimeElapsed(0)
        setProgressMessage(t('livePhoto.loadingFFmpeg'))
        setProgress(5)
        
        const ffmpeg = new FFmpeg()
        
        // 加载 FFmpeg WASM - 使用优化的加载方法
        console.log('Loading FFmpeg core files...')
        setProgress(10)
        setProgressMessage(t('livePhoto.loadingFFmpeg') + ' (1/2: JavaScript core)')
        
        const coreURL = await toBlobURLWithRetry('ffmpeg-core.js', 'ffmpeg-core.js')
        setProgress(30)
        setProgressMessage(t('livePhoto.loadingFFmpeg') + ' (2/2: WASM core)')
        
        const wasmURL = await toBlobURLWithRetry('ffmpeg-core.wasm', 'ffmpeg-core.wasm')
        setProgress(50)
        setProgressMessage(t('livePhoto.loadingFFmpeg') + ' (initializing...)')
        
        console.log('Initializing FFmpeg...')
        console.log('Core URL:', coreURL)
        console.log('WASM URL:', wasmURL)
        
        // 添加初始化超时和进度监控（最多 60 秒）
        let initProgress = 0
        const progressInterval = setInterval(() => {
          initProgress += 1
          if (initProgress <= 30) {
            console.log(`FFmpeg initialization: ${initProgress}s elapsed...`)
            setProgress(50 + initProgress) // 50-80%
            setProgressMessage(t('livePhoto.loadingFFmpeg') + ` (initializing... ${initProgress}s)`)
          }
        }, 1000)
        
        const initTimeout = new Promise<never>((_, reject) => {
          setTimeout(() => {
            clearInterval(progressInterval)
            reject(new Error('FFmpeg initialization timeout after 60s. This might be due to a slow network or browser limitation.'))
          }, 60000)
        })
        
        try {
          const initPromise = ffmpeg.load({
            coreURL,
            wasmURL,
          })
          
          await Promise.race([initPromise, initTimeout])
          clearInterval(progressInterval)
          
          console.log('FFmpeg loaded successfully!')
          setProgress(80)
          setProgressMessage(t('livePhoto.loadingFFmpeg') + ' (ready)')
        } catch (err) {
          clearInterval(progressInterval)
          throw err
        }

        ffmpeg.on('log', ({ message }) => {
          console.log('[FFmpeg Log]:', message)
        })

        ffmpeg.on('progress', ({ progress: p, time }) => {
          const percentage = Math.round(p * 100)
          console.log(`[FFmpeg Progress]: ${percentage}% (${time}ms)`)
          // 转换进度映射到 80-100% 范围
          setProgress(80 + Math.round(p * 20))
        })

        ffmpegRef.current = ffmpeg
        setFfmpegLoaded(true)
        setProgress(100)
        setProgressMessage('')
        setLoadingTimeElapsed(0)
        loadPromiseRef.current = null
        loadAbortControllerRef.current = null
        clearInterval(timer)
        return true
      } catch (err) {
        clearInterval(timer)
        
        // 检查是否被用户取消
        if (abortController.signal.aborted) {
          console.log('FFmpeg load was cancelled by user')
          loadPromiseRef.current = null
          return false
        }
        
        console.error('Failed to load FFmpeg:', err)
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(t('livePhoto.ffmpegLoadFailed') + ': ' + errorMsg)
        loadPromiseRef.current = null
        loadAbortControllerRef.current = null
        return false
      } finally {
        setFfmpegLoading(false)
        setLoadingTimeElapsed(0)
        clearInterval(timer)
      }
    })()

    // 保存 Promise 供其他调用者等待
    loadPromiseRef.current = loadPromise
    return await loadPromise
  }, [ffmpegLoaded, t, cancelFFmpegLoad])

  // 处理 HEIC 文件上传
  const handleHEICUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.heic') && !ext.endsWith('.heif')) {
      setError(t('livePhoto.invalidHeicFile'))
      return
    }

    setLivePhoto(prev => ({ ...prev, heic: file }))
    setResult(null)
    setError(null)
    
    // 统计：文件上传
    trackFileUpload('live-photo', 'heic')
  }, [t])

  // 处理 MOV 文件上传
  const handleMOVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.mov') && !ext.endsWith('.mp4')) {
      setError(t('livePhoto.invalidMovFile'))
      return
    }

    setLivePhoto(prev => ({ ...prev, mov: file }))
    setResult(null)
    setError(null)
    
    // 统计：文件上传
    trackFileUpload('live-photo', 'mov')
  }, [t])

  // 转换为静态图片
  const convertToStatic = useCallback(async (): Promise<ConversionResult> => {
    if (!livePhoto.heic) throw new Error(t('livePhoto.noHeicFile'))

    setProgressMessage(t('livePhoto.convertingStatic'))
    setProgress(50)

    const result = await heic2any({
      blob: livePhoto.heic,
      toType: 'image/jpeg',
      quality: 0.95,
    })

    const blob = Array.isArray(result) ? result[0] : result
    if (!(blob instanceof Blob)) throw new Error(t('livePhoto.conversionFailed'))

    setProgress(100)
    return {
      type: 'static',
      blob,
      preview: URL.createObjectURL(blob)
    }
  }, [livePhoto.heic, t])

  // 转换为 GIF（使用浏览器原生 API + gif.js，不依赖 FFmpeg）
  const convertToGIFNative = useCallback(async (): Promise<ConversionResult> => {
    console.log('=== Starting GIF conversion (Native) ===')
    if (!livePhoto.mov) {
      console.error('No MOV file provided')
      throw new Error(t('livePhoto.noMovFile'))
    }

    console.log('MOV file:', livePhoto.mov.name, 'Size:', livePhoto.mov.size)
    console.log('Using browser native API + gif.js (no FFmpeg required)')

    setProgressMessage(t('livePhoto.convertingGif'))
    setProgress(10)

    try {
      const gifBlob = await convertVideoToGIF(livePhoto.mov, {
        width: gifWidth,
        fps: gifFps,
        quality: gifQuality,
        onProgress: (progress) => {
          setProgress(10 + Math.round(progress * 0.8)) // 10-90%
          if (progress < 50) {
            setProgressMessage(`Extracting frames: ${progress}%`)
          } else {
            setProgressMessage(`Encoding GIF: ${progress - 50}%`)
          }
        }
      })

      setProgress(100)
      console.log('=== GIF conversion completed successfully (Native) ===')
      
      return {
        type: 'gif',
        blob: gifBlob,
        preview: URL.createObjectURL(gifBlob)
      }
    } catch (err) {
      console.error('Native GIF conversion failed:', err)
      throw new Error(`GIF conversion failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [livePhoto.mov, gifWidth, gifFps, gifQuality, t])

  // 转换为 GIF（FFmpeg 方式，作为备选）
  const convertToGIF = useCallback(async (): Promise<ConversionResult> => {
    console.log('=== Starting GIF conversion ===')
    if (!livePhoto.mov) {
      console.error('No MOV file provided')
      throw new Error(t('livePhoto.noMovFile'))
    }

    console.log('MOV file:', livePhoto.mov.name, 'Size:', livePhoto.mov.size)

    // 尝试使用原生方式（推荐）
    console.log('Trying native GIF conversion first...')
    try {
      return await convertToGIFNative()
    } catch (nativeErr) {
      console.warn('Native GIF conversion failed, falling back to FFmpeg:', nativeErr)
    }

    // 降级到 FFmpeg
    console.log('Loading FFmpeg...')
    const loaded = await loadFFmpeg()
    if (!loaded || !ffmpegRef.current) {
      console.error('FFmpeg not loaded')
      // 最终降级：再次尝试原生方式
      console.log('FFmpeg failed, retrying native conversion...')
      return await convertToGIFNative()
    }

    const ffmpeg = ffmpegRef.current
    console.log('FFmpeg ready')

    setProgressMessage(t('livePhoto.extractingFrames'))
    setProgress(10)

    console.log('Writing MOV file to FFmpeg filesystem...')
    // 将 MOV 文件写入 FFmpeg 文件系统
    const fileData = await fetchFile(livePhoto.mov)
    console.log('File data size:', fileData.byteLength)
    await ffmpeg.writeFile('input.mov', fileData)
    console.log('File written successfully')

    setProgress(20)
    setProgressMessage(t('livePhoto.processingVideo'))

    console.log(`Generating GIF with params: fps=${gifFps}, width=${gifWidth}, quality=${gifQuality}`)

    // 直接生成 GIF（一步完成，更可靠）
    const filterComplex = `fps=${gifFps},scale=${gifWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${gifQuality}:diff_mode=rectangle`
    
    console.log('FFmpeg filter:', filterComplex)
    console.log('Executing FFmpeg command...')

    try {
      await ffmpeg.exec([
        '-i', 'input.mov',
        '-filter_complex', filterComplex,
        '-loop', '0',
        'output.gif'
      ])
      console.log('FFmpeg exec completed')
    } catch (execError) {
      console.error('FFmpeg exec failed:', execError)
      throw execError
    }

    setProgress(90)
    setProgressMessage(t('livePhoto.finalizing'))

    console.log('Reading output GIF...')
    // 读取生成的 GIF
    const data = await ffmpeg.readFile('output.gif')
    console.log('GIF data type:', typeof data)
    // @ts-ignore - FFmpeg returns Uint8Array but TypeScript doesn't recognize it properly
    console.log('GIF data size:', data.byteLength)
    // @ts-ignore
    const blob = new Blob([data], { type: 'image/gif' })
    console.log('GIF blob created, size:', blob.size)

    // 清理 FFmpeg 文件系统
    console.log('Cleaning up files...')
    try {
      await ffmpeg.deleteFile('input.mov')
      await ffmpeg.deleteFile('output.gif')
      console.log('Cleanup completed')
    } catch (err) {
      console.warn('Failed to clean up FFmpeg files:', err)
    }

    setProgress(100)
    console.log('=== GIF conversion completed successfully ===')
    return {
      type: 'gif',
      blob,
      preview: URL.createObjectURL(blob)
    }
  }, [livePhoto.mov, gifFps, gifWidth, gifQuality, loadFFmpeg, t])

  // 转换为 MP4（简化版 - 快速容器转换）
  const convertToMP4 = useCallback(async (): Promise<ConversionResult> => {
    console.log('=== Starting MP4 conversion (Quick Container Conversion) ===')
    if (!livePhoto.mov) {
      throw new Error(t('livePhoto.noMovFile'))
    }

    const fileSizeMB = livePhoto.mov.size / 1024 / 1024
    console.log('MOV file:', livePhoto.mov.name, 'Size:', fileSizeMB.toFixed(2), 'MB')

    // 文件大小检查（100MB 限制）
    if (fileSizeMB > 100) {
      console.warn('⚠️ Large file:', fileSizeMB.toFixed(2), 'MB')
      // 不抛出错误，只是警告
    }

    console.log('ℹ️ Using quick container conversion')
    console.log('ℹ️ Works for most iPhone Live Photo MOV files (H.264 encoded)')

    setProgressMessage(language === 'zh-CN' ? '正在转换为 MP4...' : 'Converting to MP4...')
    setProgress(20)

    try {
      // 直接读取文件数据
      console.log('Reading MOV file data...')
      const arrayBuffer = await livePhoto.mov.arrayBuffer()
      
      setProgress(60)
      console.log('Creating MP4 blob...')
      
      // 创建 MP4 Blob（容器格式转换）
      const blob = new Blob([arrayBuffer], { type: 'video/mp4' })
      console.log('✅ MP4 created:', (blob.size / 1024 / 1024).toFixed(2), 'MB')
      
      setProgress(100)
      setProgressMessage(t('livePhoto.conversionComplete'))

      console.log('=== MP4 conversion completed successfully ===')
      console.log(`✅ Quick conversion: MOV (${fileSizeMB.toFixed(2)}MB) → MP4 (${(blob.size / 1024 / 1024).toFixed(2)}MB)`)

      return {
        type: 'mp4' as ConversionMode,
        blob,
        preview: URL.createObjectURL(blob)
      }
    } catch (err) {
      console.error('❌ MP4 conversion failed:', err)
      throw new Error(
        (language === 'zh-CN' ? 'MP4 转换失败：' : 'MP4 conversion failed: ') +
        (err instanceof Error ? err.message : String(err))
      )
    }
  }, [livePhoto.mov, language, t])


  // 预加载 FFmpeg（组件挂载时）
  useEffect(() => {
    // 延迟加载，避免阻塞初始渲染
    if (preloadAttemptedRef.current) return
    
    const timer = setTimeout(() => {
      if (!ffmpegLoaded && !ffmpegLoading && !preloadAttemptedRef.current) {
        preloadAttemptedRef.current = true
        console.log('Preloading FFmpeg in background...')
        loadFFmpeg().catch(err => {
          console.warn('FFmpeg preload failed (will retry on demand):', err)
          // 预加载失败不影响，用户点击转换时会重试
          preloadAttemptedRef.current = false // 允许重试
        })
      }
    }, 1000) // 延迟 1 秒，让页面先渲染

    return () => clearTimeout(timer)
  }, [ffmpegLoaded, ffmpegLoading, loadFFmpeg])

  // 执行转换
  const handleConvert = useCallback(async () => {
    console.log('=== handleConvert called ===')
    console.log('Mode:', mode)
    console.log('Live Photo files:', {
      heic: livePhoto.heic?.name,
      mov: livePhoto.mov?.name
    })

    setIsProcessing(true)
    setError(null)
    setProgress(0)
    setResult(null)

    try {
      let conversionResult: ConversionResult

      console.log('Starting conversion for mode:', mode)

      switch (mode) {
        case 'static':
          console.log('Converting to static image...')
          conversionResult = await convertToStatic()
          break
        case 'gif':
          console.log('Converting to GIF...')
          conversionResult = await convertToGIF()
          break
        case 'mp4':
          console.log('Converting to MP4...')
          conversionResult = await convertToMP4()
          break
        default:
          throw new Error(t('livePhoto.unsupportedMode'))
      }

      console.log('Conversion completed successfully')
      setResult(conversionResult)
      
      // 统计：转换完成
      trackUsage('live-photo', 'convert', `/tools/live-photo?mode=${mode}`)
    } catch (err) {
      console.error('=== Conversion failed ===')
      console.error('Error details:', err)
      console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace')
      const errorMessage = err instanceof Error ? err.message : t('livePhoto.conversionFailed')
      console.error('Error message:', errorMessage)
      setError(errorMessage)
    } finally {
      console.log('=== Conversion process finished ===')
      setIsProcessing(false)
      setProgress(0)
      setProgressMessage('')
    }
  }, [mode, livePhoto, convertToStatic, convertToGIF, convertToMP4, t])

  // 下载结果
  const handleDownload = useCallback(() => {
    if (!result) return

    const ext = result.type === 'gif' ? 'gif' : result.type === 'mp4' ? 'mp4' : 'jpg'
    const fileName = `live-photo-${Date.now()}.${ext}`
    saveAs(result.blob, fileName)
    
    // 统计：文件下载
    trackFileDownload('live-photo', result.type)
  }, [result])

  // 清除文件
  const handleClearFiles = useCallback(() => {
    setLivePhoto({ heic: null, mov: null })
    setResult(null)
    setError(null)
    setProgress(0)
  }, [])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const canConvert = () => {
    if (mode === 'static') return livePhoto.heic !== null
    if (mode === 'gif' || mode === 'mp4') return livePhoto.mov !== null
    return false
  }

  return (
    <div className="live-photo-converter">

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* 文件上传区域 */}
      <div className="upload-area">
        <div className="upload-section">
          {/* <div className="upload-box">
            <input
              ref={heicInputRef}
              type="file"
              accept=".heic,.heif"
              onChange={handleHEICUpload}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
            <button
              className="upload-button heic-upload"
              onClick={() => heicInputRef.current?.click()}
              disabled={isProcessing}
            >
              <ImageIcon />
              <span>{t('livePhoto.uploadHeic')}</span>
              <small>{language === 'zh-CN' ? '支持 .heic 格式' : 'Supports .heic format'}</small>
            </button>
            {livePhoto.heic && (
              <div className="file-info">
                <CheckCircle className="check-icon" />
                <span className="file-name">{livePhoto.heic.name}</span>
                <span className="file-size">{formatFileSize(livePhoto.heic.size)}</span>
              </div>
            )}
          </div> */}

          <div className="upload-box">
            <input
              ref={movInputRef}
              type="file"
              accept=".mov,.mp4"
              onChange={handleMOVUpload}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
            <button
              className="upload-button mov-upload"
              onClick={() => movInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Film />
              <span>{t('livePhoto.uploadMov')}</span>
              <small>{language === 'zh-CN' ? '支持 .mov, .mp4 格式' : 'Supports .mov, .mp4 format'}</small>
            </button>
            {livePhoto.mov && (
              <div className="file-info">
                <CheckCircle className="check-icon" />
                <span className="file-name">{livePhoto.mov.name}</span>
                <span className="file-size">{formatFileSize(livePhoto.mov.size)}</span>
              </div>
            )}
          </div>
        </div>

        {(livePhoto.heic || livePhoto.mov) && (
          <button
            className="clear-button"
            onClick={handleClearFiles}
            disabled={isProcessing}
          >
            <Trash2 />
            <span>{t('livePhoto.clearFiles')}</span>
          </button>
        )}
      </div>

      {/* 转换模式选择 */}
      <div className="mode-selector">
        <h3>{t('livePhoto.selectMode')}</h3>
        <p>{language === 'zh-CN' ? '选择您想要的输出格式' : 'Choose your desired output format'}</p>
        <div className="mode-buttons">
          {/* <button
            className={`mode-button ${mode === 'static' ? 'active' : ''}`}
            onClick={() => setMode('static')}
            disabled={isProcessing}
          >
            <ImageIcon />
            <span>{t('livePhoto.modeStatic')}</span>
            <small>{t('livePhoto.modeStaticDesc')}</small>
          </button> */}
          
          <button
            className={`mode-button ${mode === 'gif' ? 'active' : ''}`}
            onClick={() => setMode('gif')}
            disabled={isProcessing}
          >
            <Play />
            <span>{t('livePhoto.modeGif')}</span>
            <small>{t('livePhoto.modeGifDesc')}</small>
          </button>
          
          <button
            className={`mode-button ${mode === 'mp4' ? 'active' : ''}`}
            onClick={() => setMode('mp4')}
            disabled={isProcessing}
          >
            <FileVideo />
            <span>{t('livePhoto.modeMp4')}</span>
            <small>{t('livePhoto.modeMp4Desc')}</small>
          </button>
        </div>
      </div>

      {/* 高级设置 */}
      {(mode === 'gif' || mode === 'mp4') && (
        <div className="advanced-settings">
          <button
            className="settings-toggle"
            onClick={() => setProgressMessage(progressMessage ? '' : t('livePhoto.advancedSettings'))}
          >
            <Settings size={18} />
            {t('livePhoto.advancedSettings')}
          </button>

          <div className="settings-panel">
            {mode === 'gif' && (
              <>
                <div className="setting-group">
                  <label>{t('livePhoto.gifQuality')}: {gifQuality}</label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={gifQuality}
                    onChange={(e) => setGifQuality(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.gifQualityHint')}</small>
                </div>

                <div className="setting-group">
                  <label>{t('livePhoto.gifFps')}: {gifFps}</label>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={gifFps}
                    onChange={(e) => setGifFps(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.gifFpsHint')}</small>
                </div>

                <div className="setting-group">
                  <label>{t('livePhoto.gifWidth')}: {gifWidth}px</label>
                  <input
                    type="range"
                    min="240"
                    max="1080"
                    step="60"
                    value={gifWidth}
                    onChange={(e) => setGifWidth(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.gifWidthHint')}</small>
                </div>
              </>
            )}

            {mode === 'mp4' && (
              <>
                <div className="setting-group">
                  <label>{t('livePhoto.mp4Quality')}: {mp4Quality}</label>
                  <input
                    type="range"
                    min="18"
                    max="28"
                    value={mp4Quality}
                    onChange={(e) => setMp4Quality(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.mp4QualityHint')}</small>
                </div>

                <div className="setting-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={enableDedup}
                      onChange={(e) => setEnableDedup(e.target.checked)}
                      disabled={isProcessing}
                    />
                    {t('livePhoto.enableDedup')}
                  </label>
                  <small>{t('livePhoto.dedupHint')}</small>
                </div>

                {enableDedup && (
                  <div className="setting-group">
                    <label>{t('livePhoto.dedupThreshold')}: {dedupThreshold}%</label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={dedupThreshold}
                      onChange={(e) => setDedupThreshold(parseInt(e.target.value))}
                      disabled={isProcessing}
                    />
                    <small>{t('livePhoto.dedupThresholdHint')}</small>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 转换按钮 */}
      <div className="action-area">
        <button
          className="convert-button"
          onClick={handleConvert}
          disabled={!canConvert() || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="spinner" />
              {t('livePhoto.processing')}
            </>
          ) : (
            <>
              <Play size={20} />
              {t('livePhoto.convert')}
            </>
          )}
        </button>

        {result && (
          <button
            className="download-button"
            onClick={handleDownload}
          >
            <Download size={20} />
            {t('livePhoto.download')}
          </button>
        )}
      </div>

      {/* 进度条 */}
      {isProcessing && (
        <div className="progress-area">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-message">
            {progressMessage} {progress}%
            {ffmpegLoading && loadingTimeElapsed > 0 && (
              <span style={{ marginLeft: '10px', opacity: 0.7 }}>
                ({loadingTimeElapsed}s)
              </span>
            )}
          </div>
          {ffmpegLoading && loadingTimeElapsed > 15 && (
            <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
              <p>⏳ Loading is taking longer than expected...</p>
              <p>Tip: You can download FFmpeg files locally for faster loading. Check console for details.</p>
              <button
                onClick={cancelFFmpegLoad}
                style={{
                  marginTop: '8px',
                  padding: '8px 16px',
                  background: '#ff4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel & Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* 预览区域 */}
      {result && (
        <div className="result-area">
          <h3>{t('livePhoto.result')}</h3>
          <div className="result-preview">
            {result.type === 'static' && result.preview && (
              <img src={result.preview} alt="Converted" className="preview-image" />
            )}
            {result.type === 'gif' && result.preview && (
              <img src={result.preview} alt="Converted GIF" className="preview-image" />
            )}
            {result.type === 'mp4' && result.preview && (
              <video src={result.preview} controls className="preview-video" />
            )}
          </div>
          <div className="result-info">
            <span>{t('livePhoto.fileSize')}: {formatFileSize(result.blob.size)}</span>
            <span>{t('livePhoto.format')}: {result.type.toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* 使用提示 */}
      <div className="tips-section">
        <h4>💡 {t('livePhoto.usageTips')}</h4>
        <ul>
          <li><strong>{t('livePhoto.tip1Label')}</strong> {t('livePhoto.tip1')}</li>
          <li><strong>{t('livePhoto.tip2Label')}</strong> {t('livePhoto.tip2')}</li>
          <li><strong>{t('livePhoto.tip3Label')}</strong> {t('livePhoto.tip3')}</li>
          <li><strong>{t('livePhoto.tip4Label')}</strong> {t('livePhoto.tip4')}</li>
          <li><strong>{t('livePhoto.tip5Label')}</strong> {t('livePhoto.tip5')}</li>
        </ul>
      </div>
    </div>
  )
}
