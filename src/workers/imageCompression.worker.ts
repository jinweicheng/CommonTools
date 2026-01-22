// Web Worker for Image Compression
// 使用 Canvas API 和浏览器原生能力进行图片压缩

interface CompressionMessage {
  type: 'compress'
  taskId: string
  fileData: ArrayBuffer
  fileName: string
  fileType: string
  options: {
    mode: 'lossy' | 'lossless'
    quality: number
    targetSize?: number
    maxWidth?: number
    maxHeight?: number
    autoFormat: 'auto' | 'webp' | 'jpg' | 'png' | 'avif'
    preserveMetadata: boolean
  }
}

interface ProgressMessage {
  type: 'progress'
  taskId: string
  progress: number
  stage: 'decode' | 'compress' | 'output'
}

interface CompleteMessage {
  type: 'complete'
  taskId: string
  result: {
    data: Uint8Array
    mimeType: string
  }
}

interface ErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

self.addEventListener('message', async (e: MessageEvent<CompressionMessage>) => {
  const { type, taskId, fileData, fileName, fileType, options } = e.data

  if (type !== 'compress') return

  try {
    // 阶段1: 解码 (20%)
    // 只在关键步骤发送进度更新，减少消息频率
    postMessage({
      type: 'progress',
      taskId,
      progress: 5,
      stage: 'decode'
    } as ProgressMessage)

    // 检查文件类型
    const isGif = fileType === 'image/gif' || fileName.toLowerCase().endsWith('.gif')
    const isSvg = fileType === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg')
    const isHeic = fileType === 'image/heic' || fileType === 'image/heif' || 
                   fileName.toLowerCase().endsWith('.heic') || fileName.toLowerCase().endsWith('.heif')

    // 对于特殊格式，尝试处理或返回错误提示
    if (isHeic) {
      postMessage({
        type: 'error',
        taskId,
        error: 'HEIC/HEIF format requires special processing. Please convert to JPG/PNG first using the HEIC converter tool.'
      } as ErrorMessage)
      return
    }

    // 对于 SVG，需要先位图化（在主线程处理）
    if (isSvg) {
      postMessage({
        type: 'error',
        taskId,
        error: 'SVG format requires rasterization. Please convert to bitmap format (JPG/PNG) first.'
      } as ErrorMessage)
      return
    }

    // 创建 Blob 并加载图片
    const blob = new Blob([fileData], { type: fileType || 'image/jpeg' })
    let imageBitmap: ImageBitmap
    
    // 对于 GIF，先尝试加载（静态 GIF 可以处理，动图会失败）
    if (isGif) {
      try {
        imageBitmap = await createImageBitmap(blob)
        // 如果成功，继续处理（静态 GIF）
      } catch (err) {
        postMessage({
          type: 'error',
          taskId,
          error: 'Animated GIF compression is not supported. Please extract frames first or use a static GIF.'
        } as ErrorMessage)
        return
      }
    } else {
      // 非 GIF 格式，正常处理
      try {
        imageBitmap = await createImageBitmap(blob)
      } catch (err) {
        // 如果 createImageBitmap 失败，尝试使用不同的 MIME 类型
        const fallbackBlob = new Blob([fileData])
        imageBitmap = await createImageBitmap(fallbackBlob)
      }
    }

    postMessage({
      type: 'progress',
      taskId,
      progress: 20,
      stage: 'decode'
    } as ProgressMessage)

    // 阶段2: 压缩 (60%)
    // 减少中间进度更新
    postMessage({
      type: 'progress',
      taskId,
      progress: 35,
      stage: 'compress'
    } as ProgressMessage)

    // 计算目标尺寸
    let { width, height } = imageBitmap
    if (options.maxWidth || options.maxHeight) {
      const maxW = options.maxWidth || Infinity
      const maxH = options.maxHeight || Infinity
      const ratio = Math.min(maxW / width, maxH / height, 1)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    // 创建 Canvas
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!

    // 绘制图片
    ctx.drawImage(imageBitmap, 0, 0, width, height)
    imageBitmap.close()

    postMessage({
      type: 'progress',
      taskId,
      progress: 50,
      stage: 'compress'
    } as ProgressMessage)

    // 确定输出格式
    let outputFormat = options.autoFormat
    if (outputFormat === 'auto') {
      // 自动选择最佳格式
      const originalExt = fileName.toLowerCase().split('.').pop() || ''
      if (['jpg', 'jpeg'].includes(originalExt)) {
        outputFormat = 'webp' // JPG 转 WebP 通常能获得更好的压缩比
      } else if (originalExt === 'png') {
        outputFormat = 'webp' // PNG 转 WebP
      } else {
        outputFormat = 'webp' // 默认使用 WebP
      }
    }

    // 转换为 Blob
    let mimeType = 'image/webp'
    let quality: number | undefined = options.quality / 100

    switch (outputFormat) {
      case 'webp':
        mimeType = 'image/webp'
        break
      case 'jpg':
        mimeType = 'image/jpeg'
        break
      case 'png':
        mimeType = 'image/png'
        quality = undefined // PNG 不支持质量参数
        break
      case 'avif':
        mimeType = 'image/avif'
        break
    }

    postMessage({
      type: 'progress',
      taskId,
      progress: 70,
      stage: 'compress'
    } as ProgressMessage)

    // 如果指定了目标大小，需要迭代压缩
    let outputBlob: Blob
    if (options.targetSize && options.mode === 'lossy' && quality !== undefined) {
      outputBlob = await compressToTargetSize(canvas, mimeType, options.targetSize * 1024, quality)
    } else {
      const blobOptions: { type: string; quality?: number } = { type: mimeType }
      if (quality !== undefined) {
        blobOptions.quality = options.mode === 'lossless' ? 1.0 : quality
      }
      outputBlob = await canvas.convertToBlob(blobOptions)
    }

    // 输出阶段进度更新
    postMessage({
      type: 'progress',
      taskId,
      progress: 95,
      stage: 'output'
    } as ProgressMessage)

    // 阶段3: 输出 (20%)
    const arrayBuffer = await outputBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    postMessage({
      type: 'complete',
      taskId,
      result: {
        data: uint8Array,
        mimeType: outputBlob.type
      }
    } as CompleteMessage)

  } catch (error) {
    let errorMessage = 'Unknown error'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      // 提供更详细的错误信息
      if (error.message.includes('createImageBitmap')) {
        errorMessage = 'Failed to decode image. The file may be corrupted or in an unsupported format.'
      } else if (error.message.includes('convertToBlob')) {
        errorMessage = 'Failed to compress image. The format may not be supported by your browser.'
      }
    } else if (typeof error === 'string') {
      errorMessage = error
    }
    
    postMessage({
      type: 'error',
      taskId,
      error: errorMessage
    } as ErrorMessage)
  }
})

// 压缩到目标大小
async function compressToTargetSize(
  canvas: OffscreenCanvas,
  mimeType: string,
  targetSizeBytes: number,
  initialQuality: number
): Promise<Blob> {
  let quality = initialQuality
  let blob = await canvas.convertToBlob({ type: mimeType, quality })
  
  // 如果已经小于目标大小，直接返回
  if (blob.size <= targetSizeBytes) {
    return blob
  }

  // 二分查找最佳质量
  let minQuality = 0.1
  let maxQuality = quality
  let bestBlob = blob

  for (let i = 0; i < 10; i++) {
    quality = (minQuality + maxQuality) / 2
    blob = await canvas.convertToBlob({ type: mimeType, quality })

    if (blob.size <= targetSizeBytes) {
      bestBlob = blob
      minQuality = quality
      if (Math.abs(blob.size - targetSizeBytes) < targetSizeBytes * 0.05) {
        break // 足够接近目标大小
      }
    } else {
      maxQuality = quality
    }
  }

  return bestBlob
}
