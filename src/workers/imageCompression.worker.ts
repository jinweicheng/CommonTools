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
    autoFormat: 'auto' | 'webp' | 'jpg' | 'png' | 'avif' | 'gif'
    preserveMetadata: boolean
  }
}

interface ProgressMessage {
  type: 'progress'
  taskId: string
  progress: number
  stage: 'decode' | 'compress' | 'output'
}

interface CompressCompleteMessage {
  type: 'complete'
  taskId: string
  result: {
    data: Uint8Array
    mimeType: string
    originalFormat: string // 实际输出格式扩展名
  }
}

interface ErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

// 根据文件名和 MIME 类型推断原始格式
function detectFormat(fileName: string, fileType: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || ''
  if (['jpg', 'jpeg'].includes(ext) || fileType === 'image/jpeg') return 'jpg'
  if (ext === 'png' || fileType === 'image/png') return 'png'
  if (ext === 'webp' || fileType === 'image/webp') return 'webp'
  if (ext === 'avif' || fileType === 'image/avif') return 'avif'
  if (ext === 'gif' || fileType === 'image/gif') return 'gif'
  if (ext === 'bmp' || fileType === 'image/bmp') return 'bmp'
  if (['tiff', 'tif'].includes(ext) || fileType === 'image/tiff') return 'tiff'
  if (ext === 'svg' || fileType === 'image/svg+xml') return 'svg'
  return 'jpg'
}

// 格式到 MIME 类型映射
function formatToMime(format: string): string {
  switch (format) {
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'avif': return 'image/avif'
    case 'gif': return 'image/png' // GIF 只能通过 Canvas 输出为 PNG
    case 'bmp': return 'image/png'
    case 'tiff': return 'image/png'
    default: return 'image/jpeg'
  }
}

// 格式是否支持 quality 参数
function supportsQuality(mimeType: string): boolean {
  return ['image/jpeg', 'image/webp', 'image/avif'].includes(mimeType)
}

// 高质量绘制图片到 canvas（支持多步缩放以获得更好质量）
function drawImageHighQuality(
  source: ImageBitmap | OffscreenCanvas,
  targetWidth: number,
  targetHeight: number
): OffscreenCanvas {
  let srcWidth: number, srcHeight: number
  if (source instanceof ImageBitmap) {
    srcWidth = source.width
    srcHeight = source.height
  } else {
    srcWidth = source.width
    srcHeight = source.height
  }

  // 如果缩小幅度超过 2x，使用多步缩放（类似 Photoshop 的双三次插值效果）
  // 这是 TinyPNG/Squoosh 高质量缩放的关键技巧
  if (targetWidth < srcWidth / 2 || targetHeight < srcHeight / 2) {
    let currentWidth = srcWidth
    let currentHeight = srcHeight
    let currentSource: ImageBitmap | OffscreenCanvas = source

    while (currentWidth / 2 > targetWidth || currentHeight / 2 > targetHeight) {
      const stepWidth = Math.max(targetWidth, Math.round(currentWidth / 2))
      const stepHeight = Math.max(targetHeight, Math.round(currentHeight / 2))

      const stepCanvas = new OffscreenCanvas(stepWidth, stepHeight)
      const stepCtx = stepCanvas.getContext('2d')!
      stepCtx.imageSmoothingEnabled = true
      stepCtx.imageSmoothingQuality = 'high'
      stepCtx.drawImage(currentSource, 0, 0, stepWidth, stepHeight)

      currentSource = stepCanvas
      currentWidth = stepWidth
      currentHeight = stepHeight
    }

    // 最终一步
    const finalCanvas = new OffscreenCanvas(targetWidth, targetHeight)
    const finalCtx = finalCanvas.getContext('2d')!
    finalCtx.imageSmoothingEnabled = true
    finalCtx.imageSmoothingQuality = 'high'
    finalCtx.drawImage(currentSource, 0, 0, targetWidth, targetHeight)
    return finalCanvas
  }

  // 普通缩放
  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight)
  return canvas
}

self.addEventListener('message', async (e: MessageEvent<CompressionMessage>) => {
  const { type, taskId, fileData, fileName, fileType, options } = e.data

  if (type !== 'compress') return

  try {
    // ====== 阶段1: 解码 (0-20%) ======
    postMessage({
      type: 'progress',
      taskId,
      progress: 5,
      stage: 'decode'
    } as ProgressMessage)

    // 检测原始格式
    const originalFormat = detectFormat(fileName, fileType)

    // 特殊格式检查
    const isHeic = fileType === 'image/heic' || fileType === 'image/heif' || 
                   fileName.toLowerCase().endsWith('.heic') || fileName.toLowerCase().endsWith('.heif')
    if (isHeic) {
      postMessage({
        type: 'error',
        taskId,
        error: 'HEIC/HEIF format requires special processing. Please convert to JPG/PNG first using the HEIC converter tool.'
      } as ErrorMessage)
      return
    }

    if (originalFormat === 'svg') {
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

    try {
      imageBitmap = await createImageBitmap(blob)
    } catch {
      try {
        const fallbackBlob = new Blob([fileData])
        imageBitmap = await createImageBitmap(fallbackBlob)
      } catch {
        postMessage({
          type: 'error',
          taskId,
          error: 'Failed to decode image. The file may be corrupted or in an unsupported format.'
        } as ErrorMessage)
        return
      }
    }

    postMessage({
      type: 'progress',
      taskId,
      progress: 20,
      stage: 'decode'
    } as ProgressMessage)

    // ====== 阶段2: 压缩 (20-90%) ======
    postMessage({
      type: 'progress',
      taskId,
      progress: 30,
      stage: 'compress'
    } as ProgressMessage)

    // 原始尺寸
    const originalWidth = imageBitmap.width
    const originalHeight = imageBitmap.height
    let width = originalWidth
    let height = originalHeight

    // 用户设置的尺寸限制
    if (options.maxWidth || options.maxHeight) {
      const maxW = options.maxWidth || Infinity
      const maxH = options.maxHeight || Infinity
      const ratio = Math.min(maxW / width, maxH / height, 1)
      if (ratio < 1) {
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
    }

    // 确定输出格式
    let targetFormat: string
    if (options.autoFormat === 'auto') {
      targetFormat = originalFormat
    } else {
      targetFormat = options.autoFormat
    }

    let outputMime = formatToMime(targetFormat)
    let outputExt = targetFormat
    if (['bmp', 'tiff'].includes(targetFormat)) {
      outputExt = 'png'
    }

    // 目标大小模式下的智能格式选择
    const hasTargetSize = !!(options.targetSize && options.targetSize > 0)
    const targetSizeBytes = hasTargetSize ? options.targetSize! * 1024 : 0

    // 如果设置了目标大小，但输出格式是 PNG（不支持 quality 参数），
    // 且模式是有损的，则自动切换到 WebP 以获得更好的压缩效果
    if (hasTargetSize && !supportsQuality(outputMime) && options.mode === 'lossy') {
      // 对于 PNG 等不支持 quality 的格式，切换到 WebP 来实现目标大小
      outputMime = 'image/webp'
      outputExt = 'webp'
    }

    // 创建 Canvas 并绘制图片
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!

    // 对于 JPG 格式，填充白色背景（避免透明区域变黑）
    if (outputMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
    }

    // 使用高质量缩放绘制
    if (width !== originalWidth || height !== originalHeight) {
      const scaledCanvas = drawImageHighQuality(imageBitmap, width, height)
      if (outputMime === 'image/jpeg') {
        // 先填白色背景再绘制
        ctx.drawImage(scaledCanvas, 0, 0)
      } else {
        ctx.drawImage(scaledCanvas, 0, 0)
      }
    } else {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(imageBitmap, 0, 0, width, height)
    }
    imageBitmap.close()

    postMessage({
      type: 'progress',
      taskId,
      progress: 50,
      stage: 'compress'
    } as ProgressMessage)

    // 计算 quality 参数
    const canUseQuality = supportsQuality(outputMime)
    let quality: number | undefined

    if (canUseQuality) {
      if (options.mode === 'lossless') {
        quality = 1.0
      } else {
        quality = options.quality / 100
      }
    } else {
      quality = undefined
    }

    postMessage({
      type: 'progress',
      taskId,
      progress: 60,
      stage: 'compress'
    } as ProgressMessage)

    // ====== 智能压缩策略 ======
    let outputBlob: Blob

    if (hasTargetSize) {
      // ===== 目标大小模式（最高优先级） =====
      // 无论有损/无损、什么格式，都尽全力达到目标大小
      outputBlob = await compressToTargetSizeAdvanced(
        canvas,
        outputMime,
        targetSizeBytes,
        quality || 0.8,
        width,
        height,
        imageBitmap, // 注意：已 close，需要用 canvas 代替
        taskId
      )
    } else if (outputMime === 'image/png') {
      // PNG 压缩策略
      if (options.mode === 'lossy' && options.quality < 95) {
        outputBlob = await compressPNG(canvas, options.quality, width, height)
      } else {
        outputBlob = await canvas.convertToBlob({ type: 'image/png' })
      }
    } else if (canUseQuality) {
      // JPG / WebP / AVIF 压缩
      outputBlob = await canvas.convertToBlob({ type: outputMime, quality })

      // 智能质量优化：如果压缩后比原始还大，逐步降低质量
      if (outputBlob.size >= fileData.byteLength && options.mode === 'lossy') {
        let tryQ = Math.max(0.1, (quality || 0.8) - 0.1)
        while (tryQ >= 0.1) {
          const tryBlob = await canvas.convertToBlob({ type: outputMime, quality: tryQ })
          if (tryBlob.size < outputBlob.size) {
            outputBlob = tryBlob
          }
          if (outputBlob.size < fileData.byteLength) break
          tryQ -= 0.05
        }
      }
    } else {
      outputBlob = await canvas.convertToBlob({ type: outputMime })
    }

    // 最终检查（非目标大小模式）：如果压缩后文件更大且没有缩放，尝试进一步压缩
    if (!hasTargetSize && 
        outputBlob.size >= fileData.byteLength && 
        width === originalWidth && height === originalHeight &&
        options.mode === 'lossy' && canUseQuality) {
      let tryQuality = Math.max(0.2, (quality || 0.8) - 0.2)
      while (tryQuality >= 0.1) {
        const tryBlob = await canvas.convertToBlob({ type: outputMime, quality: tryQuality })
        if (tryBlob.size < fileData.byteLength) {
          outputBlob = tryBlob
          break
        }
        tryQuality -= 0.05
      }
    }

    postMessage({
      type: 'progress',
      taskId,
      progress: 90,
      stage: 'compress'
    } as ProgressMessage)

    // ====== 阶段3: 输出 (90-100%) ======
    postMessage({
      type: 'progress',
      taskId,
      progress: 95,
      stage: 'output'
    } as ProgressMessage)

    const arrayBuffer = await outputBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    postMessage({
      type: 'complete',
      taskId,
      result: {
        data: uint8Array,
        mimeType: outputBlob.type,
        originalFormat: outputExt
      }
    } as CompressCompleteMessage)

  } catch (error) {
    let errorMessage = 'Unknown error'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
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

// PNG 有损压缩策略：通过颜色量化减小文件大小
async function compressPNG(
  canvas: OffscreenCanvas,
  quality: number,
  width: number,
  height: number
): Promise<Blob> {
  const originalPNG = await canvas.convertToBlob({ type: 'image/png' })

  if (quality >= 95) {
    return originalPNG
  }

  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  // 根据质量参数决定颜色量化级别
  const quantizationStep = Math.max(2, Math.round(16 - (quality / 100) * 14))

  if (quantizationStep > 2) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] / quantizationStep) * quantizationStep
      data[i + 1] = Math.round(data[i + 1] / quantizationStep) * quantizationStep
      data[i + 2] = Math.round(data[i + 2] / quantizationStep) * quantizationStep
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const compressedPNG = await canvas.convertToBlob({ type: 'image/png' })

  if (compressedPNG.size >= originalPNG.size) {
    return originalPNG
  }

  return compressedPNG
}

// ===== 高级目标大小压缩（核心算法） =====
// 策略优先级：
//   1. 先通过 quality 二分查找（保持原分辨率）
//   2. 如果最低质量仍超标，逐步缩小分辨率 + quality 联合调整
//   3. 目标是尽量接近用户指定的大小（±10% 可接受）
async function compressToTargetSizeAdvanced(
  canvas: OffscreenCanvas,
  mimeType: string,
  targetSizeBytes: number,
  initialQuality: number,
  currentWidth: number,
  currentHeight: number,
  _imageBitmap: ImageBitmap | null, // 可能已 close
  taskId: string
): Promise<Blob> {
  const canUseQ = supportsQuality(mimeType)
  
  // Step 1: 如果格式支持 quality，先尝试纯 quality 调整
  if (canUseQ) {
    const result = await compressWithQualityBinarySearch(canvas, mimeType, targetSizeBytes, initialQuality)
    if (result.size <= targetSizeBytes) {
      return result
    }
    // 最低质量 0.01 也超标 → 需要缩小分辨率
  }

  // Step 2: 逐步缩小分辨率（每次缩小到 85% → 72% → 61% → ...）
  // 结合 quality 调整，直到满足目标大小
  const scaleSteps = [0.85, 0.72, 0.6, 0.5, 0.4, 0.32, 0.25, 0.2, 0.15, 0.1]
  let bestBlob: Blob = await canvas.convertToBlob(
    canUseQ ? { type: mimeType, quality: 0.01 } : { type: mimeType }
  )

  for (const scale of scaleSteps) {
    const newW = Math.max(16, Math.round(currentWidth * scale))
    const newH = Math.max(16, Math.round(currentHeight * scale))

    const scaledCanvas = new OffscreenCanvas(newW, newH)
    const scaledCtx = scaledCanvas.getContext('2d')!

    // 对于 JPG，需要白色背景
    if (mimeType === 'image/jpeg') {
      scaledCtx.fillStyle = '#FFFFFF'
      scaledCtx.fillRect(0, 0, newW, newH)
    }

    scaledCtx.imageSmoothingEnabled = true
    scaledCtx.imageSmoothingQuality = 'high'
    scaledCtx.drawImage(canvas, 0, 0, newW, newH)

    if (canUseQ) {
      // 在这个分辨率下用二分查找最优质量
      const result = await compressWithQualityBinarySearch(scaledCanvas, mimeType, targetSizeBytes, 0.8)
      if (result.size <= targetSizeBytes) {
        return result
      }
      if (result.size < bestBlob.size) {
        bestBlob = result
      }
    } else {
      // PNG 等不支持 quality 的格式
      const result = await scaledCanvas.convertToBlob({ type: mimeType })
      if (result.size <= targetSizeBytes) {
        return result
      }
      if (result.size < bestBlob.size) {
        bestBlob = result
      }
    }

    // 进度报告
    postMessage({
      type: 'progress',
      taskId,
      progress: 60 + Math.round(scaleSteps.indexOf(scale) / scaleSteps.length * 25),
      stage: 'compress'
    } as ProgressMessage)
  }

  // Step 3: 最后的尝试 — 如果仍然超标，用极小分辨率 + 最低质量
  if (bestBlob.size > targetSizeBytes) {
    // 根据比例估算需要的缩放倍率
    const sizeRatio = targetSizeBytes / bestBlob.size
    // 面积与文件大小大致成正比
    const areaScale = Math.sqrt(sizeRatio) * 0.9 // 留 10% 余量
    const finalW = Math.max(8, Math.round(currentWidth * 0.1 * areaScale))
    const finalH = Math.max(8, Math.round(currentHeight * 0.1 * areaScale))

    const finalCanvas = new OffscreenCanvas(finalW, finalH)
    const finalCtx = finalCanvas.getContext('2d')!
    if (mimeType === 'image/jpeg') {
      finalCtx.fillStyle = '#FFFFFF'
      finalCtx.fillRect(0, 0, finalW, finalH)
    }
    finalCtx.imageSmoothingEnabled = true
    finalCtx.imageSmoothingQuality = 'high'
    finalCtx.drawImage(canvas, 0, 0, finalW, finalH)

    const finalBlob = await finalCanvas.convertToBlob(
      canUseQ ? { type: mimeType, quality: 0.01 } : { type: mimeType }
    )
    if (finalBlob.size <= targetSizeBytes || finalBlob.size < bestBlob.size) {
      bestBlob = finalBlob
    }
  }

  return bestBlob
}

// quality 二分查找压缩
async function compressWithQualityBinarySearch(
  canvas: OffscreenCanvas,
  mimeType: string,
  targetSizeBytes: number,
  initialQuality: number
): Promise<Blob> {
  // 先用初始质量试试
  let blob = await canvas.convertToBlob({ type: mimeType, quality: initialQuality })
  if (blob.size <= targetSizeBytes) {
    // 已经满足，尝试提高质量以获取更好画质
    let lo = initialQuality
    let hi = 1.0
    let bestBlob = blob
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2
      const tryBlob = await canvas.convertToBlob({ type: mimeType, quality: mid })
      if (tryBlob.size <= targetSizeBytes) {
        bestBlob = tryBlob
        lo = mid
      } else {
        hi = mid
      }
      // 精度足够则提前退出
      if (hi - lo < 0.01) break
    }
    return bestBlob
  }

  // 需要降低质量
  let minQ = 0.01
  let maxQ = initialQuality
  let bestBlob = blob

  for (let i = 0; i < 16; i++) {
    const midQ = (minQ + maxQ) / 2
    blob = await canvas.convertToBlob({ type: mimeType, quality: midQ })

    if (blob.size <= targetSizeBytes) {
      bestBlob = blob
      minQ = midQ // 尝试更高质量
      // 如果已经很接近目标（±5%），提前退出
      if (blob.size >= targetSizeBytes * 0.9) break
    } else {
      maxQ = midQ
    }

    if (maxQ - minQ < 0.005) break
  }

  // 如果仍然超标，最后用最低质量试一次
  if (bestBlob.size > targetSizeBytes) {
    const lastBlob = await canvas.convertToBlob({ type: mimeType, quality: 0.01 })
    if (lastBlob.size <= targetSizeBytes || lastBlob.size < bestBlob.size) {
      bestBlob = lastBlob
    }
  }

  return bestBlob
}
