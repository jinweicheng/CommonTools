/**
 * 视频转 GIF 工具（不依赖 FFmpeg）
 * 使用浏览器原生 API + gif.js
 */

import GIF from 'gif.js'

export interface VideoToGifOptions {
  width?: number
  height?: number
  fps?: number
  quality?: number
  onProgress?: (progress: number) => void
}

export async function convertVideoToGIF(
  videoFile: File,
  options: VideoToGifOptions = {}
): Promise<Blob> {
  const {
    width = 480,
    fps = 10,
    quality = 10,
    onProgress
  } = options

  return new Promise((resolve, reject) => {
    // 创建 video 元素
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous' // 允许跨域

    // 创建 canvas 用于抽帧
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (!ctx) {
      reject(new Error('Failed to get canvas context. Your browser may not support this feature.'))
      return
    }

    // 加载视频
    let videoURL: string
    try {
      videoURL = URL.createObjectURL(videoFile)
      video.src = videoURL
      console.log(`Video blob URL created: ${videoURL}`)
      console.log(`Video file type: ${videoFile.type}, size: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`)
    } catch (err) {
      reject(new Error(`Failed to create video URL: ${err instanceof Error ? err.message : String(err)}`))
      return
    }

    // 设置加载超时（30秒）
    const loadTimeout = setTimeout(() => {
      URL.revokeObjectURL(videoURL)
      reject(new Error('Video loading timeout after 30 seconds. Please try a smaller file or different browser.'))
    }, 30000)

    video.addEventListener('loadedmetadata', async () => {
      clearTimeout(loadTimeout)
      try {
        // 计算缩放后的尺寸（保持宽高比）
        const aspectRatio = video.videoWidth / video.videoHeight
        canvas.width = width
        canvas.height = Math.round(width / aspectRatio)

        console.log(`Video size: ${video.videoWidth}x${video.videoHeight}`)
        console.log(`Canvas size: ${canvas.width}x${canvas.height}`)
        console.log(`Duration: ${video.duration}s`)

        // 创建 GIF 编码器
        const gif = new GIF({
          workers: 2,
          quality,
          width: canvas.width,
          height: canvas.height,
          workerScript: '/tools/gif.worker.js', // 需要复制 worker 文件
        })

        // 监听 GIF 生成进度
        gif.on('progress', (progress: number) => {
          console.log(`GIF encoding progress: ${(progress * 100).toFixed(1)}%`)
          onProgress?.(Math.round(progress * 100))
        })

        // 监听完成
        gif.on('finished', (blob: Blob) => {
          URL.revokeObjectURL(videoURL)
          console.log(`GIF generated: ${(blob.size / 1024 / 1024).toFixed(2)}MB`)
          resolve(blob)
        })

        // 抽帧
        const frameInterval = 1 / fps
        const frameCount = Math.floor(video.duration * fps)
        console.log(`Will extract ${frameCount} frames (${fps} fps)`)

        for (let i = 0; i < frameCount; i++) {
          const time = i * frameInterval
          
          // 跳转到指定时间
          video.currentTime = time
          
          // 等待视频跳转完成
          await new Promise<void>((resolveSeek) => {
            const seeked = () => {
              video.removeEventListener('seeked', seeked)
              resolveSeek()
            }
            video.addEventListener('seeked', seeked)
          })

          // 绘制当前帧到 canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

          // 添加帧到 GIF（延迟 = 1000ms / fps）
          gif.addFrame(ctx, {
            copy: true,
            delay: Math.round(1000 / fps)
          })

          // 更新抽帧进度
          const extractProgress = ((i + 1) / frameCount) * 50 // 0-50%
          onProgress?.(Math.round(extractProgress))
        }

        console.log('Frame extraction completed, starting GIF encoding...')
        
        // 开始渲染 GIF
        gif.render()
      } catch (err) {
        URL.revokeObjectURL(videoURL)
        reject(err)
      }
    })

    video.addEventListener('error', (e) => {
      clearTimeout(loadTimeout)
      URL.revokeObjectURL(videoURL)
      
      // 获取详细错误信息
      const errorDetails = []
      if (video.error) {
        const errorCode = video.error.code
        const errorMessage = video.error.message
        errorDetails.push(`Code: ${errorCode}`)
        errorDetails.push(`Message: ${errorMessage}`)
        
        // 根据错误代码提供更详细的说明
        switch (errorCode) {
          case 1: // MEDIA_ERR_ABORTED
            errorDetails.push('Video loading was aborted')
            break
          case 2: // MEDIA_ERR_NETWORK
            errorDetails.push('Network error occurred while loading video')
            break
          case 3: // MEDIA_ERR_DECODE
            errorDetails.push('Video decoding failed - file may be corrupted')
            break
          case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
            errorDetails.push('Video format not supported by browser')
            break
        }
      }
      
      reject(new Error(`Failed to load video. ${errorDetails.join('. ')}. Event: ${e.type}. Please ensure the file is a valid MOV/MP4 video and try again.`))
    })

    // 开始加载视频
    video.load()
  })
}

/**
 * MOV 转 MP4（纯客户端无法实现，需要服务端或 FFmpeg）
 */
export async function convertVideoToMP4(): Promise<Blob> {
  throw new Error(
    'MOV to MP4 conversion requires FFmpeg or server-side processing. ' +
    'Please use a desktop application or online service for this conversion.'
  )
}

/**
 * 检查浏览器是否支持视频格式
 */
export function checkVideoSupport(format: string): boolean {
  const video = document.createElement('video')
  return video.canPlayType(`video/${format}`) !== ''
}
