import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

interface FFmpegContextType {
  ffmpeg: FFmpeg | null
  isLoaded: boolean
  isLoading: boolean
  loadingProgress: string
  checkingCache: boolean
  error: string | null
  loadFFmpeg: () => Promise<boolean>
  resetError: () => void
}

const FFmpegContext = createContext<FFmpegContextType | null>(null)

interface FFmpegProviderProps {
  children: React.ReactNode
}

export function FFmpegProvider({ children }: FFmpegProviderProps) {
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState('')
  const [checkingCache, setCheckingCache] = useState(() => {
    // 初始时检查是否有有效缓存
    try {
      const cacheKey = 'ffmpeg_loaded_v1'
      const lastLoaded = localStorage.getItem(cacheKey)
      if (lastLoaded) {
        const loadTime = parseInt(lastLoaded)
        const cacheExpiry = 24 * 60 * 60 * 1000 // 24小时
        const isValid = !isNaN(loadTime) && Date.now() - loadTime < cacheExpiry
        return isValid
      }
    } catch (error) {
      console.warn('Cache check failed:', error)
    }
    return false
  })
  const [error, setError] = useState<string | null>(null)
  
  const loadingRef = useRef(false)
  const ffmpegRef = useRef<FFmpeg | null>(null)

  const loadFFmpegWithTimeout = useCallback(async (timeout: number = 90000): Promise<boolean> => {
    return new Promise(async (resolve) => {
      const timer = setTimeout(() => {
        console.error('❌ FFmpeg initialization timeout')
        resolve(false)
      }, timeout)

      try {
        const ffmpegInstance = new FFmpeg()
        
        // 添加日志监听
        ffmpegInstance.on('log', ({ message }) => {
          console.log('[FFmpeg]:', message)
          setLoadingProgress(`FFmpeg: ${message.substring(0, 100)}`)
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

        setLoadingProgress('检查本地文件...')
        try {
          // 检查本地文件
          const coreRes = await fetch(localCore, { method: 'HEAD' })
          const wasmRes = await fetch(localWasm, { method: 'HEAD' })
          
          if (coreRes.ok && wasmRes.ok) {
            const coreSize = parseInt(coreRes.headers.get('content-length') || '0', 10)
            const wasmSize = parseInt(wasmRes.headers.get('content-length') || '0', 10)
            
            if (coreSize > 50000 && wasmSize > 20000000) {
              setLoadingProgress('正在加载本地文件...')
              
              const coreBlobURL = await toBlobURL(localCore, 'text/javascript')
              const wasmBlobURL = await toBlobURL(localWasm, 'application/wasm')
              
              setLoadingProgress('正在初始化 FFmpeg...')
              
              await ffmpegInstance.load({
                coreURL: coreBlobURL,
                wasmURL: wasmBlobURL,
              })
              
              clearTimeout(timer)
              resolve(true)
              return
            }
          }
        } catch (localErr) {
          console.warn('Local file load failed, trying CDN:', localErr)
        }

        // CDN 回退
        setLoadingProgress('正在从 CDN 加载...')
        
        const cdnBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
        const coreCDN = `${cdnBase}/ffmpeg-core.js`
        const wasmCDN = `${cdnBase}/ffmpeg-core.wasm`
        
        const coreBlobURL = await toBlobURL(coreCDN, 'text/javascript')
        const wasmBlobURL = await toBlobURL(wasmCDN, 'application/wasm')
        
        setLoadingProgress('正在初始化 FFmpeg...')
        
        await ffmpegInstance.load({
          coreURL: coreBlobURL,
          wasmURL: wasmBlobURL,
        })
        
        clearTimeout(timer)
        setFFmpeg(ffmpegInstance)
        ffmpegRef.current = ffmpegInstance
        resolve(true)
        
      } catch (err) {
        clearTimeout(timer)
        console.error('❌ FFmpeg load error:', err)
        setError(err instanceof Error ? err.message : String(err))
        resolve(false)
      }
    })
  }, [])

  const loadFFmpeg = useCallback(async (): Promise<boolean> => {
    if (isLoaded || loadingRef.current) return isLoaded
    
    // 防止重复加载
    loadingRef.current = true
    setError(null)
    
    // 检查缓存状态
    const cacheKey = 'ffmpeg_loaded_v1'
    const lastLoaded = localStorage.getItem(cacheKey)
    const cacheExpiry = 24 * 60 * 60 * 1000 // 24小时过期
    
    if (lastLoaded) {
      const loadTime = parseInt(lastLoaded)
      if (Date.now() - loadTime < cacheExpiry) {
        // 缓存有效，快速加载
        setCheckingCache(false)
        try {
          console.log('🚀 Quick loading FFmpeg from cache...')
          const ffmpegInstance = new FFmpeg()
          
          // 快速初始化，不显示加载界面
          const isDev = import.meta.env.DEV
          let baseURL = isDev 
            ? window.location.origin 
            : (window.location.origin + import.meta.env.BASE_URL)
          baseURL = baseURL.replace(/\/+$/, '')
          
          const localCore = `${baseURL}/ffmpeg-core.js`
          const localWasm = `${baseURL}/ffmpeg-core.wasm`
          
          // 检查本地文件是否存在
          const coreRes = await fetch(localCore, { method: 'HEAD' })
          const wasmRes = await fetch(localWasm, { method: 'HEAD' })
          
          if (coreRes.ok && wasmRes.ok) {
            await ffmpegInstance.load({
              coreURL: localCore,
              wasmURL: localWasm
            })
          } else {
            // 使用CDN
            const cdnBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
            await ffmpegInstance.load({
              coreURL: `${cdnBase}/ffmpeg-core.js`,
              wasmURL: `${cdnBase}/ffmpeg-core.wasm`
            })
          }
          
          setFFmpeg(ffmpegInstance)
          ffmpegRef.current = ffmpegInstance
          setIsLoaded(true)
          loadingRef.current = false
          console.log('✅ Quick FFmpeg load successful')
          return true
        } catch (error) {
          // 快速加载失败，清除缓存，走正常流程
          console.warn('Quick FFmpeg load failed, falling back to full load:', error)
          localStorage.removeItem(cacheKey)
          setCheckingCache(false)
        }
      } else {
        // 缓存过期
        localStorage.removeItem(cacheKey)
        setCheckingCache(false)
      }
    } else {
      setCheckingCache(false)
    }
    
    setIsLoading(true)
    setLoadingProgress('正在加载视频处理引擎...')

    try {
      const success = await loadFFmpegWithTimeout(120000)
      
      if (success && ffmpegRef.current) {
        setIsLoaded(true)
        // 保存成功加载的时间戳
        localStorage.setItem('ffmpeg_loaded_v1', Date.now().toString())
      } else {
        setError('FFmpeg 加载失败，请刷新页面重试')
      }
      
      return success
    } finally {
      setIsLoading(false)
      setLoadingProgress('')
      loadingRef.current = false
    }
  }, [isLoaded, loadFFmpegWithTimeout])

  const resetError = useCallback(() => {
    setError(null)
  }, [])

  // 预加载FFmpeg
  useEffect(() => {
    const initFFmpeg = async () => {
      if (!isLoaded && !loadingRef.current) {
        const success = await loadFFmpeg().catch(() => false)
        if (!success) {
          setCheckingCache(false)
        }
      } else {
        setCheckingCache(false)
      }
    }
    
    initFFmpeg()
  }, [loadFFmpeg, isLoaded])

  const value: FFmpegContextType = {
    ffmpeg,
    isLoaded,
    isLoading,
    loadingProgress,
    checkingCache,
    error,
    loadFFmpeg,
    resetError
  }

  return (
    <FFmpegContext.Provider value={value}>
      {children}
    </FFmpegContext.Provider>
  )
}

export function useFFmpeg(): FFmpegContextType {
  const context = useContext(FFmpegContext)
  if (!context) {
    throw new Error('useFFmpeg must be used within FFmpegProvider')
  }
  return context
}