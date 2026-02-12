import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, ImageIcon, AlertCircle, CheckCircle2, FileImage, Layers, SlidersHorizontal, Package, Eye } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './ModernImageConverter.css'

interface ConvertedImage {
  name: string
  blob: Blob
  url: string
  size: number
  format: 'avif' | 'webp' | 'png' | 'jpg'
  originalFormat: string
  width?: number
  height?: number
  originalSize: number
  compressionRatio?: number
}

interface ImageFile {
  file: File
  format: string
  size: number
  preview: string
  width?: number
  height?: number
}

type OutputFormat = 'avif' | 'webp' | 'png' | 'jpg'

const MAX_FILES = 50

export default function ModernImageConverter() {
  const { language } = useI18n()
  const [uploadedFiles, setUploadedFiles] = useState<ImageFile[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('webp')
  const [quality, setQuality] = useState(85)
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [comparisonMode, setComparisonMode] = useState(false)
  const [comparisonIndex, setComparisonIndex] = useState<number>(-1)
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isSliderDragging, setIsSliderDragging] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number>(-1)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const comparisonCanvasRef = useRef<HTMLCanvasElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [avifSupported, setAvifSupported] = useState<boolean | null>(null)

  // 文件格式检测
  const detectFormat = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer.slice(0, 16))
    
    // AVIF: ftypavif
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const type = String.fromCharCode(...Array.from(bytes.slice(8, 12)))
      if (type === 'avif') return 'AVIF'
    }
    
    // WebP: RIFF...WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'WebP'
    }
    
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'PNG'
    }
    
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'JPG'
    }

    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'GIF'
    }

    // BMP: 42 4D
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
      return 'BMP'
    }

    // TIFF: 49 49 2A 00 (little-endian) or 4D 4D 00 2A (big-endian)
    if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
        (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
      return 'TIFF'
    }

    // Fallback: 通过文件扩展名检测
    const ext = file.name.toLowerCase().split('.').pop() || ''
    const extMap: Record<string, string> = {
      'jpg': 'JPG', 'jpeg': 'JPG', 'png': 'PNG', 'webp': 'WebP',
      'avif': 'AVIF', 'gif': 'GIF', 'bmp': 'BMP', 'tiff': 'TIFF', 'tif': 'TIFF',
      'heic': 'HEIC', 'heif': 'HEIF', 'svg': 'SVG'
    }
    if (extMap[ext]) return extMap[ext]

    // 最后使用 MIME 类型
    if (file.type.startsWith('image/')) {
      const mimeFormat = file.type.split('/')[1]?.toUpperCase()
      if (mimeFormat) return mimeFormat === 'JPEG' ? 'JPG' : mimeFormat
    }
    
    return 'UNKNOWN'
  }, [])

  // 初始化时检测 AVIF 支持（异步，避免阻塞）
  useEffect(() => {
    const detectAvifSupport = () => {
      const ua = navigator.userAgent
      
      // 方法 1：检查 Chrome 版本（Chrome 123+ 支持 AVIF 编码）
      const chromeMatch = ua.match(/Chrome\/(\d+)/)
      if (chromeMatch && !ua.includes('Edg/')) {
        const version = parseInt(chromeMatch[1], 10)
        if (version >= 123) {
          console.log(`[AVIF] Chrome ${version} detected, AVIF encoding supported`)
          setAvifSupported(true)
          return
        }
      }
      
      // 方法 2：检查 Edge 版本
      const edgeMatch = ua.match(/Edg\/(\d+)/)
      if (edgeMatch) {
        const version = parseInt(edgeMatch[1], 10)
        if (version >= 123) {
          console.log(`[AVIF] Edge ${version} detected, AVIF encoding supported`)
          setAvifSupported(true)
          return
        }
      }
      
      // 方法 3：实际检测（异步）
      const testCanvas = document.createElement('canvas')
      testCanvas.width = 1
      testCanvas.height = 1
      const testCtx = testCanvas.getContext('2d')
      if (!testCtx) {
        setAvifSupported(false)
        return
      }
      
      testCtx.fillRect(0, 0, 1, 1)
      
      // 使用 toBlob 检测（与实际编码使用的 API 相同）
      let toBlobCompleted = false
      testCanvas.toBlob((blob) => {
        toBlobCompleted = true
        const supported = blob !== null && blob.type === 'image/avif'
        console.log(`[AVIF] toBlob test result: ${supported}, blob type: ${blob?.type}`)
        setAvifSupported(supported)
      }, 'image/avif', 0.9)
      
      // 超时保护（200ms 后如果还没结果，尝试同步检测）
      const timeoutId = setTimeout(() => {
        // 如果 toBlob 还没完成，使用同步检测作为备用
        setAvifSupported((current) => {
          if (current !== null || toBlobCompleted) return current ?? false // 已有结果，不覆盖
          
          try {
            const dataURL = testCanvas.toDataURL('image/avif')
            const supported = dataURL.startsWith('data:image/avif') || dataURL.includes('image/avif')
            console.log(`[AVIF] toDataURL fallback result: ${supported}`)
            return supported
          } catch {
            console.warn('[AVIF] All detection methods failed')
            return false
          }
        })
      }, 200)
      
      return () => {
        clearTimeout(timeoutId)
      }
    }
    
    detectAvifSupport()
  }, []) // 只在组件挂载时运行一次

  // 检查浏览器支持（检测编码能力）
  const checkBrowserSupport = useCallback((format: string): boolean => {
    // AVIF 支持检测
    if (format === 'AVIF') {
      // 如果已检测，使用检测结果
      if (avifSupported !== null) {
        return avifSupported
      }
      
      // 如果还在检测中，使用 User Agent 快速检测
      const ua = navigator.userAgent
      const chromeMatch = ua.match(/Chrome\/(\d+)/)
      if (chromeMatch && !ua.includes('Edg/')) {
        const version = parseInt(chromeMatch[1], 10)
        if (version >= 123) {
          return true
        }
      }
      
      const edgeMatch = ua.match(/Edg\/(\d+)/)
      if (edgeMatch) {
        const version = parseInt(edgeMatch[1], 10)
        if (version >= 123) {
          return true
        }
      }
      
      // 默认返回 false（保守策略）
      return false
    }
    
    // 其他格式使用原有逻辑
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    
    const mimeTypes = {
      'WebP': 'image/webp',
      'PNG': 'image/png',
      'JPG': 'image/jpeg'
    }
    
    const mimeType = mimeTypes[format as keyof typeof mimeTypes]
    if (!mimeType) return true
    
    try {
      const dataURL = canvas.toDataURL(mimeType)
      return dataURL.indexOf(mimeType) > -1
    } catch {
      return false
    }
  }, [])

  // 处理文件列表
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setError('')
    const fileArray = Array.from(files)

    // 文件数量限制
    if (uploadedFiles.length + fileArray.length > MAX_FILES) {
      setError(language === 'zh-CN'
        ? `最多支持 ${MAX_FILES} 个文件，当前已有 ${uploadedFiles.length} 个`
        : `Maximum ${MAX_FILES} files allowed. You have ${uploadedFiles.length} file(s).`)
      return
    }

    const newFiles: ImageFile[] = []
    const errors: string[] = []

    for (const file of fileArray) {
      try {
        // 文件大小限制 (100MB)
        if (file.size > 100 * 1024 * 1024) {
          errors.push(language === 'zh-CN'
            ? `文件过大 (>100MB): ${file.name}`
            : `File too large (>100MB): ${file.name}`)
          continue
        }

        const format = await detectFormat(file)
        
        if (format === 'UNKNOWN') {
          errors.push(language === 'zh-CN' 
            ? `不支持的文件格式: ${file.name}` 
            : `Unsupported format: ${file.name}`)
          continue
        }

        // 创建预览并获取尺寸
        const preview = URL.createObjectURL(file)
        const img = new Image()
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            newFiles.push({
              file,
              format,
              size: file.size,
              preview,
              width: img.width,
              height: img.height
            })
            resolve()
          }
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = preview
        })
      } catch (err) {
        console.error('File processing error:', err)
        errors.push(language === 'zh-CN' 
          ? `文件处理失败: ${file.name}` 
          : `Failed to process: ${file.name}`)
      }
    }

    if (errors.length > 0) {
      setError(errors.join('; '))
    }

    if (newFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFiles])
    }
  }, [detectFormat, language, uploadedFiles.length])

  // 文件上传处理
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    await processFiles(files)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processFiles])

  // 拖拽相关处理
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

    // 过滤只保留图片文件
    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/')
    )

    if (imageFiles.length === 0) {
      setError(language === 'zh-CN' 
        ? '请拖放图片文件（AVIF, WebP, PNG, JPG, GIF, BMP, TIFF 等）' 
        : 'Please drop image files (AVIF, WebP, PNG, JPG, GIF, BMP, TIFF, etc.)')
      return
    }

    await processFiles(imageFiles)
  }, [processFiles, language])

  // 图片转换核心功能
  const convertImage = useCallback(async (imageFile: ImageFile): Promise<ConvertedImage> => {
    const { file, format } = imageFile
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          
          const ctx = canvas.getContext('2d', { alpha: true })
          if (!ctx) {
            throw new Error('Failed to get canvas context')
          }

          // 处理 Alpha 通道：PNG/WebP/AVIF/GIF 可能有透明区域，转 JPG 时需要白色背景
          if (outputFormat === 'jpg') {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
          }

          ctx.drawImage(img, 0, 0)

          // 根据输出格式选择 MIME 类型
          const mimeTypes = {
            'avif': 'image/avif',
            'webp': 'image/webp',
            'png': 'image/png',
            'jpg': 'image/jpeg'
          }

          const mimeType = mimeTypes[outputFormat]
          const qualityValue = outputFormat === 'png' ? undefined : quality / 100

          // 转换为 Blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'))
                return
              }

              const name = file.name.replace(/\.[^.]+$/, `.${outputFormat}`)
              const url = URL.createObjectURL(blob)
              // 正数=减小了, 负数=增大了
              const compressionRatio = ((1 - blob.size / file.size) * 100)

              resolve({
                name,
                blob,
                url,
                size: blob.size,
                format: outputFormat,
                originalFormat: format,
                width: img.width,
                height: img.height,
                originalSize: file.size,
                compressionRatio
              })
            },
            mimeType,
            qualityValue
          )
        } catch (err) {
          reject(err)
        }
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${file.name}`))
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string
        }
      }
      reader.onerror = () => {
        reject(new Error(`Failed to read file: ${file.name}`))
      }
      reader.readAsDataURL(file)
    })
  }, [outputFormat, quality])

  // 批量转换
  const handleConvert = useCallback(async () => {
    if (uploadedFiles.length === 0) {
      setError(language === 'zh-CN' ? '请先上传文件' : 'Please upload files first')
      return
    }

    // 检查浏览器支持
    if (outputFormat === 'avif') {
      const isSupported = checkBrowserSupport('AVIF')
      if (!isSupported) {
        const ua = navigator.userAgent
        console.warn('[AVIF] Browser support check failed. UA:', ua)
        console.warn('[AVIF] Cached support value:', avifSupported)
        setError(language === 'zh-CN' 
          ? '您的浏览器不支持 AVIF 格式，请使用 Chrome 123+ 或 Edge 123+' 
          : 'Your browser does not support AVIF format. Please use Chrome 123+ or Edge 123+')
        return
      }
    }

    setIsConverting(true)
    setError('')
    setSuccessMessage('')
    setProgress(0)

    // 释放旧的转换结果 URL，防止内存泄漏
    convertedImages.forEach(img => URL.revokeObjectURL(img.url))
    setConvertedImages([])

    // 同格式转换提示
    const sameFormatFiles = uploadedFiles.filter(f => 
      f.format.toLowerCase() === outputFormat.toLowerCase() ||
      (f.format === 'JPG' && outputFormat === 'jpg') ||
      (f.format === 'JPEG' && outputFormat === 'jpg')
    )
    if (sameFormatFiles.length > 0 && sameFormatFiles.length === uploadedFiles.length) {
      const warnMsg = language === 'zh-CN'
        ? `提示：所有文件已经是 ${outputFormat.toUpperCase()} 格式，转换可能不会减小文件大小。`
        : `Note: All files are already in ${outputFormat.toUpperCase()} format. Conversion may not reduce file size.`
      setError(warnMsg)
    }

    const results: ConvertedImage[] = []

    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const imageFile = uploadedFiles[i]
        setProgress(Math.round(((i + 0.5) / uploadedFiles.length) * 100))
        
        try {
          const converted = await convertImage(imageFile)
          results.push(converted)
        } catch (err) {
          console.error(`Conversion failed for ${imageFile.file.name}:`, err)
          setError(language === 'zh-CN' 
            ? `转换失败: ${imageFile.file.name}` 
            : `Conversion failed: ${imageFile.file.name}`)
        }

        setProgress(Math.round(((i + 1) / uploadedFiles.length) * 100))
      }

      setConvertedImages(results)
      
      if (results.length > 0) {
        // 计算总体统计
        const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0)
        const totalConverted = results.reduce((sum, r) => sum + r.size, 0)
        const totalSaved = totalOriginal - totalConverted
        const savedPercent = totalOriginal > 0 ? ((totalSaved / totalOriginal) * 100).toFixed(1) : '0'
        
        const failCount = uploadedFiles.length - results.length
        const statsMsg = language === 'zh-CN'
          ? `成功转换 ${results.length} 个文件${failCount > 0 ? `，${failCount} 个失败` : ''}！总计${totalSaved > 0 ? '节省' : '增加'} ${formatFileSize(Math.abs(totalSaved))}（${totalSaved > 0 ? '-' : '+'}${Math.abs(Number(savedPercent))}%）`
          : `Successfully converted ${results.length} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}! Total ${totalSaved > 0 ? 'saved' : 'increased'}: ${formatFileSize(Math.abs(totalSaved))} (${totalSaved > 0 ? '-' : '+'}${Math.abs(Number(savedPercent))}%)`
        setSuccessMessage(statsMsg)
      }
    } catch (err) {
      console.error('Batch conversion error:', err)
      setError(language === 'zh-CN' ? '批量转换失败' : 'Batch conversion failed')
    } finally {
      setIsConverting(false)
      setProgress(0)
    }
  }, [uploadedFiles, convertImage, language, outputFormat, checkBrowserSupport])

  // 下载单个文件
  const handleDownload = useCallback((image: ConvertedImage) => {
    const link = document.createElement('a')
    link.href = image.url
    link.download = image.name
    link.click()
  }, [])

  // 批量下载为 ZIP
  const handleDownloadAll = useCallback(async () => {
    if (convertedImages.length === 0) return

    const zip = new JSZip()
    
    for (const image of convertedImages) {
      zip.file(image.name, image.blob)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `converted-images-${Date.now()}.zip`)
  }, [convertedImages])

  // 开启对比模式
  const handleCompare = useCallback((index: number) => {
    setComparisonMode(true)
    setComparisonIndex(index)
    setSliderPosition(50)
  }, [])

  // 绘制对比画布
  useEffect(() => {
    if (!comparisonMode || comparisonIndex === -1 || !comparisonCanvasRef.current) {
      return
    }

    const canvas = comparisonCanvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      return
    }

    const original = uploadedFiles[comparisonIndex]
    const converted = convertedImages[comparisonIndex]
    if (!original || !converted) {
      return
    }

    const loadImages = async () => {
      try {
        const leftImg = new Image()
        const rightImg = new Image()

        leftImg.crossOrigin = 'anonymous'
        rightImg.crossOrigin = 'anonymous'

        await Promise.all([
          new Promise<void>((resolve, reject) => {
            leftImg.onload = () => resolve()
            leftImg.onerror = () => reject(new Error('Failed to load left image'))
            leftImg.src = original.preview
          }),
          new Promise<void>((resolve, reject) => {
            rightImg.onload = () => resolve()
            rightImg.onerror = () => reject(new Error('Failed to load right image'))
            rightImg.src = converted.url
          })
        ])

        // 设置 canvas 尺寸
        canvas.width = leftImg.width
        canvas.height = leftImg.height

        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // 计算分割线位置
        const sliderX = (canvas.width * sliderPosition) / 100

        // 绘制原图（左侧）
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, sliderX, canvas.height)
        ctx.clip()
        ctx.drawImage(leftImg, 0, 0, canvas.width, canvas.height)
        ctx.restore()

        // 绘制转换后的图（右侧）
        ctx.save()
        ctx.beginPath()
        ctx.rect(sliderX, 0, canvas.width - sliderX, canvas.height)
        ctx.clip()
        ctx.drawImage(rightImg, 0, 0, canvas.width, canvas.height)
        ctx.restore()

        // 绘制分割线
        ctx.strokeStyle = '#667eea'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(sliderX, 0)
        ctx.lineTo(sliderX, canvas.height)
        ctx.stroke()

      } catch {
        // 图片加载失败时静默处理
      }
    }

    loadImages()
  }, [comparisonMode, comparisonIndex, sliderPosition, uploadedFiles, convertedImages])

  // 滑块拖动开始
  const handleSliderMouseDown = useCallback(() => {
    setIsSliderDragging(true)
  }, [])

  // 滑块拖动中
  const handleSliderMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return
    
    const rect = sliderRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPosition(percentage)
  }, [])

  // 滑块拖动结束
  const handleSliderMouseUp = useCallback(() => {
    setIsSliderDragging(false)
  }, [])

  // 全局鼠标/触摸移动监听
  useEffect(() => {
    if (!isSliderDragging) return

    const handleMove = (clientX: number) => {
      if (!sliderRef.current) return
      const rect = sliderRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
      setSliderPosition(percentage)
    }

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX)
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length > 0) handleMove(e.touches[0].clientX)
    }

    const handleEnd = () => {
      setIsSliderDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleEnd)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleEnd)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleEnd)
    }
  }, [isSliderDragging])

  // 清除文件
  const handleClearFiles = useCallback(() => {
    uploadedFiles.forEach(file => URL.revokeObjectURL(file.preview))
    convertedImages.forEach(image => URL.revokeObjectURL(image.url))

    setUploadedFiles([])
    setConvertedImages([])
    setError('')
    setSuccessMessage('')
    setComparisonMode(false)
    setComparisonIndex(-1)
  }, [uploadedFiles, convertedImages])

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

  return (
    <div className="modern-image-converter">
      {/* 头部区域 */}
      <div className="converter-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Layers />
            {language === 'zh-CN' ? '图片格式转换' : 'Image Format Converter'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN' 
              ? '支持 AVIF / WebP / PNG / JPG / GIF / BMP / TIFF 等格式互转，实时预览对比，质量可调，完全本地处理。' 
              : 'Convert between AVIF / WebP / PNG / JPG / GIF / BMP / TIFF with real-time preview comparison and quality control, all processed locally.'}
          </p>
        </div>
      </div>

      {/* 上传区域 */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/avif,image/webp,image/png,image/jpeg,image/gif,image/bmp,image/tiff,image/heic,.avif,.webp,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.heic,.heif"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isConverting}
        />
        
        <div
          className={`upload-button ${isDragging ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ cursor: isConverting ? 'not-allowed' : 'pointer' }}
        >
          <Upload />
          <span>{language === 'zh-CN' ? '上传图片' : 'Upload Images'}</span>
          <small>
            {isDragging 
              ? (language === 'zh-CN' ? '松开鼠标上传文件' : 'Drop files here')
              : (language === 'zh-CN' ? '点击上传或拖拽文件到这里' : 'Click to upload or drag & drop files here')}
          </small>
          <small>{language === 'zh-CN' ? `支持 AVIF, WebP, PNG, JPG, GIF, BMP, TIFF（最多 ${MAX_FILES} 个文件）` : `Supports AVIF, WebP, PNG, JPG, GIF, BMP, TIFF (max ${MAX_FILES} files)`}</small>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="file-list">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-thumbnail">
                  <img src={file.preview} alt={file.file.name} />
                  <span className="format-badge">{file.format}</span>
                </div>
                <div className="file-info">
                  <span className="file-name">{file.file.name}</span>
                  <div className="file-meta">
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    {file.width && file.height && (
                      <span className="file-dimensions">{file.width}×{file.height}</span>
                    )}
                  </div>
                </div>
                <button
                  className="remove-button"
                  onClick={() => handleRemoveFile(index)}
                  disabled={isConverting}
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 设置区域 - 紧凑布局 */}
      {uploadedFiles.length > 0 && (
        <div className="settings-section">
          {/* 第一行：格式选择 + 质量 */}
          <div className="settings-row">
            <div className="setting-inline">
              <span className="setting-label">{language === 'zh-CN' ? '格式' : 'Format'}</span>
              <div className="format-buttons">
                <button
                  className={`format-button ${outputFormat === 'avif' ? 'active' : ''}`}
                  onClick={() => setOutputFormat('avif')}
                  disabled={isConverting}
                >
                  AVIF
                </button>
                <button
                  className={`format-button ${outputFormat === 'webp' ? 'active' : ''}`}
                  onClick={() => setOutputFormat('webp')}
                  disabled={isConverting}
                >
                  WebP
                </button>
                <button
                  className={`format-button ${outputFormat === 'png' ? 'active' : ''}`}
                  onClick={() => setOutputFormat('png')}
                  disabled={isConverting}
                >
                  PNG
                </button>
                <button
                  className={`format-button ${outputFormat === 'jpg' ? 'active' : ''}`}
                  onClick={() => setOutputFormat('jpg')}
                  disabled={isConverting}
                >
                  JPG
                </button>
              </div>
            </div>

            {outputFormat !== 'png' && (
              <div className="setting-inline quality-inline">
                <span className="setting-label">{language === 'zh-CN' ? '质量' : 'Quality'}</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  disabled={isConverting}
                  className="quality-slider"
                />
                <span className="quality-value">{quality}%</span>
              </div>
            )}
          </div>

          {/* 第二行：操作按钮 + 进度条 */}
          <div className="settings-actions">
            <button
              className="convert-button"
              onClick={handleConvert}
              disabled={isConverting}
            >
              {isConverting ? (
                <>
                  <div className="spinner"></div>
                  <span>{language === 'zh-CN' ? '转换中' : 'Converting'} {progress}%</span>
                </>
              ) : (
                <>
                  <ImageIcon />
                  <span>{language === 'zh-CN' ? '开始转换' : 'Convert'}</span>
                </>
              )}
            </button>

            {!isConverting && (
              <button
                className="clear-button"
                onClick={handleClearFiles}
              >
                <X />
                <span>{language === 'zh-CN' ? '清除' : 'Clear'}</span>
              </button>
            )}

            {isConverting && (
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 错误和成功消息 */}
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

      {/* 转换结果 */}
      {convertedImages.length > 0 && !comparisonMode && (
        <div className="results-section">
          <div className="results-header">
            <h3>{language === 'zh-CN' ? '转换完成' : 'Conversion Complete'}</h3>
            <div className="header-actions">
              <button
                className="download-all-button"
                onClick={handleDownloadAll}
              >
                <Package />
                <span>{language === 'zh-CN' ? '打包下载' : 'Download ZIP'}</span>
              </button>
            </div>
          </div>

          <div className="results-grid">
            {convertedImages.map((image, index) => (
              <div key={index} className="result-item">
                <div className="result-preview">
                  <img src={image.url} alt={image.name} />
                  <div className="result-overlay">
                    <button
                      className="preview-button"
                      onClick={() => setPreviewIndex(index)}
                      title={language === 'zh-CN' ? '预览' : 'Preview'}
                    >
                      <Eye />
                    </button>
                    <button
                      className="compare-button"
                      onClick={() => handleCompare(index)}
                      title={language === 'zh-CN' ? '对比' : 'Compare'}
                    >
                      <SlidersHorizontal />
                    </button>
                    <button
                      className="download-button"
                      onClick={() => handleDownload(image)}
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                    >
                      <Download />
                    </button>
                  </div>
                </div>
                <div className="result-info">
                  <span className="result-name">{image.name}</span>
                  <div className="result-details">
                    <span className="result-format">{image.format.toUpperCase()}</span>
                    <span className="result-size">{formatFileSize(image.size)}</span>
                    {image.compressionRatio !== undefined && (
                      image.compressionRatio > 0 ? (
                        <span className="result-compression saved">-{image.compressionRatio.toFixed(1)}%</span>
                      ) : image.compressionRatio < -1 ? (
                        <span className="result-compression increased">+{Math.abs(image.compressionRatio).toFixed(1)}%</span>
                      ) : (
                        <span className="result-compression neutral">≈ {language === 'zh-CN' ? '无变化' : 'No change'}</span>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 对比模式 */}
      {comparisonMode && comparisonIndex !== -1 && (
        <div className="comparison-modal">
          <div className="comparison-content">
            <div className="comparison-header">
              <h3>{language === 'zh-CN' ? '并排对比' : 'Side-by-Side Comparison'}</h3>
              <button
                className="close-button"
                onClick={() => setComparisonMode(false)}
              >
                <X />
              </button>
            </div>
            
            <div className="comparison-canvas-container">
              <div 
                ref={sliderRef}
                className="comparison-slider"
                onMouseDown={handleSliderMouseDown}
                onMouseMove={handleSliderMove}
                onMouseUp={handleSliderMouseUp}
                onMouseLeave={handleSliderMouseUp}
                onTouchStart={(e) => {
                  e.preventDefault()
                  handleSliderMouseDown()
                  if (sliderRef.current && e.touches.length > 0) {
                    const rect = sliderRef.current.getBoundingClientRect()
                    const x = e.touches[0].clientX - rect.left
                    setSliderPosition(Math.max(0, Math.min(100, (x / rect.width) * 100)))
                  }
                }}
              >
                <canvas ref={comparisonCanvasRef} />
                <div 
                  className="slider-handle" 
                  style={{ left: `${sliderPosition}%` }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    handleSliderMouseDown()
                  }}
                >
                  <div className="slider-line"></div>
                  <div className="slider-thumb">
                    <SlidersHorizontal />
                  </div>
                </div>
              </div>
              
              <div className="comparison-info">
                {/* 左侧：原始文件信息 */}
                <div className="comparison-file-card left">
                  <div className="card-header">
                    <FileImage />
                    <span className="card-title">{language === 'zh-CN' ? '原图' : 'Original'}</span>
                  </div>
                  <div className="card-content">
                    <div className="file-name-row">
                      <span className="format-badge">{uploadedFiles[comparisonIndex].format}</span>
                      <span className="file-name">{uploadedFiles[comparisonIndex].file.name}</span>
                    </div>
                    <div className="file-meta-row">
                      <span className="meta-item">
                        <strong>{formatFileSize(uploadedFiles[comparisonIndex].size)}</strong>
                      </span>
                      {uploadedFiles[comparisonIndex].width && uploadedFiles[comparisonIndex].height && (
                        <span className="meta-item">
                          {uploadedFiles[comparisonIndex].width}×{uploadedFiles[comparisonIndex].height}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 右侧：转换后文件信息 */}
                <div className="comparison-file-card right">
                  <div className="card-header">
                    <Layers />
                    <span className="card-title">{language === 'zh-CN' ? '转换后' : 'Converted'}</span>
                  </div>
                  <div className="card-content">
                    <div className="file-name-row">
                      <span className="format-badge">{convertedImages[comparisonIndex].format.toUpperCase()}</span>
                      <span className="file-name">{convertedImages[comparisonIndex].name}</span>
                    </div>
                    <div className="file-meta-row">
                      <span className="meta-item">
                        <strong>{formatFileSize(convertedImages[comparisonIndex].size)}</strong>
                      </span>
                      {convertedImages[comparisonIndex].compressionRatio !== undefined && (
                        convertedImages[comparisonIndex].compressionRatio! > 0 ? (
                          <span className="meta-item compression">
                            -{convertedImages[comparisonIndex].compressionRatio!.toFixed(1)}%
                          </span>
                        ) : convertedImages[comparisonIndex].compressionRatio! < -1 ? (
                          <span className="meta-item" style={{ background: 'rgba(251, 191, 36, 0.12)', color: '#fde68a', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                            +{Math.abs(convertedImages[comparisonIndex].compressionRatio!).toFixed(1)}%
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览灯箱 */}
      {previewIndex !== -1 && convertedImages[previewIndex] && (
        <div className="preview-modal" onClick={() => setPreviewIndex(-1)}>
          <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-modal-title">
                <Eye />
                <span>{convertedImages[previewIndex].name}</span>
                <span className="preview-modal-meta">
                  {convertedImages[previewIndex].format.toUpperCase()} · {formatFileSize(convertedImages[previewIndex].size)}
                  {convertedImages[previewIndex].width && convertedImages[previewIndex].height && (
                    <> · {convertedImages[previewIndex].width}×{convertedImages[previewIndex].height}</>
                  )}
                </span>
              </div>
              <div className="preview-modal-actions">
                <button
                  className="preview-download-btn"
                  onClick={() => handleDownload(convertedImages[previewIndex])}
                >
                  <Download />
                  <span>{language === 'zh-CN' ? '下载' : 'Download'}</span>
                </button>
                <button
                  className="close-button"
                  onClick={() => setPreviewIndex(-1)}
                >
                  <X />
                </button>
              </div>
            </div>
            <div className="preview-modal-image">
              <img 
                src={convertedImages[previewIndex].url} 
                alt={convertedImages[previewIndex].name}
              />
            </div>
            {convertedImages.length > 1 && (
              <div className="preview-modal-nav">
                <button 
                  className="preview-nav-btn"
                  disabled={previewIndex <= 0}
                  onClick={() => setPreviewIndex(previewIndex - 1)}
                >
                  ← {language === 'zh-CN' ? '上一张' : 'Previous'}
                </button>
                <span className="preview-counter">{previewIndex + 1} / {convertedImages.length}</span>
                <button 
                  className="preview-nav-btn"
                  disabled={previewIndex >= convertedImages.length - 1}
                  onClick={() => setPreviewIndex(previewIndex + 1)}
                >
                  {language === 'zh-CN' ? '下一张' : 'Next'} →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
