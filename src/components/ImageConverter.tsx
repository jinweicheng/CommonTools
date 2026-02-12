import { useState, useRef, useCallback, useMemo } from 'react'
import { Upload, Download, X, ImageIcon, AlertCircle, CheckCircle2, FileImage, Layers, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import './ImageConverter.css'

interface ConvertedImage {
  name: string
  blob: Blob
  url: string
  size: number
  format: 'jpg' | 'webp'
  originalFormat: string
  originalSize: number
  width?: number
  height?: number
  dpi?: number
}

interface ImageFile {
  file: File
  format: string
  size: number
  preview?: string
  pages?: number
}

type OutputFormat = 'jpg' | 'webp'

export default function ImageConverter() {
  const { language } = useI18n()
  const [uploadedFiles, setUploadedFiles] = useState<ImageFile[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpg')
  const [quality, setQuality] = useState(85)
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 统计信息
  const totalFileSize = useMemo(() => 
    uploadedFiles.reduce((sum, f) => sum + f.size, 0), [uploadedFiles])
  const totalConvertedSize = useMemo(() => 
    convertedImages.reduce((sum, f) => sum + f.size, 0), [convertedImages])
  const totalOriginalSizeOfConverted = useMemo(() =>
    convertedImages.reduce((sum, f) => sum + f.originalSize, 0), [convertedImages])

  // 文件格式识别（Magic Bytes）
  const detectFormat = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer.slice(0, 12))
    
    // BMP: 42 4D
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
      return 'BMP'
    }
    
    // TGA: 判断比较复杂，使用文件扩展名辅助
    if (file.name.toLowerCase().endsWith('.tga')) {
      return 'TGA'
    }
    
    // PCX: 0A xx 01
    if (bytes[0] === 0x0A && bytes[2] === 0x01) {
      return 'PCX'
    }
    
    // TIFF: 49 49 2A 00 (Little Endian) 或 4D 4D 00 2A (Big Endian)
    if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
        (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
      return 'TIFF'
    }
    
    return 'UNKNOWN'
  }, [])

  // 文件上传处理
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setError('')
    const newFiles: ImageFile[] = []

    for (const file of Array.from(files)) {
      try {
        const format = await detectFormat(file)
        
        if (format === 'UNKNOWN') {
          setError(language === 'zh-CN' 
            ? `不支持的文件格式: ${file.name}` 
            : `Unsupported format: ${file.name}`)
          continue
        }

        // 创建预览
        const preview = URL.createObjectURL(file)

        newFiles.push({
          file,
          format,
          size: file.size,
          preview
        })
      } catch (err) {
        console.error('File processing error:', err)
        setError(language === 'zh-CN' 
          ? `文件处理失败: ${file.name}` 
          : `Failed to process: ${file.name}`)
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles])
  }, [detectFormat, language])

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    await processFiles(files)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processFiles])

  // 拖拽上传处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      await processFiles(files)
    }
  }, [processFiles])

  // PCX 解码器（支持 8-bit 调色板 PCX）
  const decodePCX = useCallback(async (file: File): Promise<ImageBitmap> => {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const view = new DataView(arrayBuffer)
    
    // PCX 文件头验证
    if (bytes[0] !== 0x0A) {
      throw new Error('Invalid PCX file: missing PCX signature (0x0A)')
    }
    
    // 读取图像尺寸（小端序）
    const xMin = view.getUint16(4, true)
    const yMin = view.getUint16(6, true)
    const xMax = view.getUint16(8, true)
    const yMax = view.getUint16(10, true)
    const width = xMax - xMin + 1
    const height = yMax - yMin + 1
    
    if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
      throw new Error(`Invalid PCX file: invalid dimensions (${width}x${height})`)
    }
    
    // PCX 文件头中，偏移 66-67 在不同变体中含义不同
    // 标准 PCX v3.0: 偏移 66 = BytesPerLine (16-bit, 低字节), 偏移 67 = BytesPerLine (高字节)
    // 某些变体: 偏移 66 = BitsPerPixel (8-bit), 偏移 67 = NumPlanes (8-bit)
    
    // 尝试读取 BytesPerLine（16-bit，小端）
    const bytesPerLineFromHeader = view.getUint16(66, true)
    
    // 如果 BytesPerLine 值合理（在宽度范围内），使用它
    // 否则尝试读取 bitsPerPixel 和 numPlanes
    let bitsPerPixel: number
    let numPlanes: number
    let actualBytesPerLine: number
    
    if (bytesPerLineFromHeader > 0 && bytesPerLineFromHeader < width * 4) {
      // 使用文件头中的 BytesPerLine
      actualBytesPerLine = bytesPerLineFromHeader
      // 尝试从其他位置读取 bitsPerPixel 和 numPlanes，或根据 BytesPerLine 推断
      bitsPerPixel = bytes[66] // 可能是 bitsPerPixel 的低字节
      numPlanes = bytes[67] // 可能是 numPlanes 或 bitsPerPixel 的高字节
      
      // 如果 bitsPerPixel 不合理，根据 BytesPerLine 和 width 推断
      if (bitsPerPixel > 32 || bitsPerPixel === 0) {
        // 推断：BytesPerLine 通常 >= width * bitsPerPixel / 8
        const estimatedBpp = Math.ceil((actualBytesPerLine * 8) / width)
        if (estimatedBpp === 8 || estimatedBpp === 24) {
          bitsPerPixel = estimatedBpp
          numPlanes = estimatedBpp === 24 ? 3 : 1
        } else {
          // 默认假设 8-bit
          bitsPerPixel = 8
          numPlanes = 1
        }
      }
    } else {
      // 使用 bitsPerPixel 和 numPlanes，计算 BytesPerLine
      bitsPerPixel = bytes[66]
      numPlanes = bytes[67]
      
      // 验证并修正不合理的值
      if (bitsPerPixel > 32 || bitsPerPixel === 0) {
        console.warn(`[PCX] Invalid BitsPerPixel: ${bitsPerPixel}, assuming 8-bit`)
        bitsPerPixel = 8
      }
      if (numPlanes === 0 || numPlanes > 4) {
        console.warn(`[PCX] Invalid NumPlanes: ${numPlanes}, assuming 1`)
        numPlanes = 1
      }
      
      // 计算每行字节数（PCX 要求每行字节数为偶数）
      const bytesPerLine = Math.ceil((width * bitsPerPixel * numPlanes) / 8)
      actualBytesPerLine = bytesPerLine + (bytesPerLine % 2) // 确保是偶数
    }
    
    console.log(`[PCX] Dimensions: ${width}x${height}, BitsPerPixel: ${bitsPerPixel}, Planes: ${numPlanes}, BytesPerLine: ${actualBytesPerLine}`)
    
    // 读取调色板（256 色，在文件末尾，768 字节）
    // 某些 PCX 文件在调色板前有一个 0x0C 标识字节
    const palette: number[][] = []
    const fileSize = arrayBuffer.byteLength
    
    if (bitsPerPixel === 8 && numPlanes === 1) {
      // 检查文件末尾是否有调色板
      let paletteStart = fileSize - 768
      
      // 检查是否有 0x0C 标识（可选）
      if (paletteStart > 0 && bytes[paletteStart - 1] === 0x0C) {
        paletteStart = paletteStart - 1
      }
      
      if (paletteStart > 128 && paletteStart + 768 <= fileSize) {
        for (let i = 0; i < 256; i++) {
          const offset = paletteStart + i * 3
          if (offset + 2 < fileSize) {
            palette.push([bytes[offset], bytes[offset + 1], bytes[offset + 2]])
          }
        }
        console.log(`[PCX] Loaded palette with ${palette.length} colors`)
      }
    }
    
    // 计算预期的解码数据大小（按行、按平面）
    const expectedDecodedSize = height * numPlanes * actualBytesPerLine
    
    // 解码 RLE 压缩数据（按行解码）
    const decodedData = new Uint8Array(expectedDecodedSize)
    let dataOffset = 128
    let decodedPos = 0
    
    // RLE 解码（按行处理）
    for (let plane = 0; plane < numPlanes; plane++) {
      for (let row = 0; row < height; row++) {
        let rowBytesDecoded = 0
        
        while (rowBytesDecoded < actualBytesPerLine && dataOffset < bytes.length - 1) {
          const byte = bytes[dataOffset++]
          
          if ((byte & 0xC0) === 0xC0) {
            // RLE 编码：前 6 位是重复次数（1-63）
            const count = byte & 0x3F
            if (dataOffset >= bytes.length) break
            const value = bytes[dataOffset++]
            
            const endPos = Math.min(decodedPos + count, decodedPos + (actualBytesPerLine - rowBytesDecoded))
            for (let i = decodedPos; i < endPos; i++) {
              decodedData[i] = value
            }
            const actualCount = endPos - decodedPos
            decodedPos += actualCount
            rowBytesDecoded += actualCount
          } else {
            // 原始字节
            decodedData[decodedPos++] = byte
            rowBytesDecoded++
          }
        }
      }
    }
    
    // 转换为 RGBA 图像数据
    const imageData = new Uint8ClampedArray(width * height * 4)
    
    if (bitsPerPixel === 8 && numPlanes === 1 && palette.length === 256) {
      // 8-bit 调色板模式
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // 使用 actualBytesPerLine 而不是 bytesPerLine
          const srcIndex = y * actualBytesPerLine + x
          if (srcIndex < decodedData.length) {
            const paletteIndex = decodedData[srcIndex]
            const color = palette[paletteIndex] || [0, 0, 0]
            const dstIndex = (y * width + x) * 4
            
            imageData[dstIndex] = color[0]
            imageData[dstIndex + 1] = color[1]
            imageData[dstIndex + 2] = color[2]
            imageData[dstIndex + 3] = 255
          }
        }
      }
    } else {
      // 灰度模式或其他
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // 使用 actualBytesPerLine 而不是 bytesPerLine
          const srcIndex = y * actualBytesPerLine + x
          if (srcIndex < decodedData.length) {
            const value = decodedData[srcIndex]
            const dstIndex = (y * width + x) * 4
            
            imageData[dstIndex] = value
            imageData[dstIndex + 1] = value
            imageData[dstIndex + 2] = value
            imageData[dstIndex + 3] = 255
          }
        }
      }
    }
    
    // 创建 ImageData 并转换为 ImageBitmap
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    
    const imageDataObj = new ImageData(imageData, width, height)
    ctx.putImageData(imageDataObj, 0, 0)
    
    return createImageBitmap(canvas)
  }, [])

  // TGA 解码器（支持多种 TGA 格式）
  const decodeTGA = useCallback(async (file: File): Promise<ImageBitmap> => {
    const arrayBuffer = await file.arrayBuffer()
    const view = new DataView(arrayBuffer)
    let offset = 0
    
    // TGA 文件头（18 字节）
    const idLength = view.getUint8(offset); offset += 1
    const colorMapType = view.getUint8(offset); offset += 1
    const imageType = view.getUint8(offset); offset += 1
    
    // 调色板信息
    view.getUint16(offset, true); offset += 2 // colorMapOrigin (未使用)
    const colorMapLength = view.getUint16(offset, true); offset += 2
    const colorMapEntrySize = view.getUint8(offset); offset += 1
    
    // 图像信息
    view.getUint16(offset, true); offset += 2 // xOrigin (未使用)
    view.getUint16(offset, true); offset += 2 // yOrigin (未使用)
    const width = view.getUint16(offset, true); offset += 2
    const height = view.getUint16(offset, true); offset += 2
    const pixelDepth = view.getUint8(offset); offset += 1
    const imageDescriptor = view.getUint8(offset); offset += 1
    
    console.log(`[TGA] Dimensions: ${width}x${height}, PixelDepth: ${pixelDepth}, ImageType: ${imageType}, ColorMapType: ${colorMapType}`)
    
    if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
      throw new Error(`Invalid TGA file: invalid dimensions (${width}x${height})`)
    }
    
    // 跳过图像 ID
    offset += idLength
    
    // 读取调色板（如果有）
    const palette: number[][] = []
    if (colorMapType === 1 && colorMapLength > 0) {
      for (let i = 0; i < colorMapLength; i++) {
        if (colorMapEntrySize === 24) {
          // 24-bit BGR
          const b = view.getUint8(offset); offset++
          const g = view.getUint8(offset); offset++
          const r = view.getUint8(offset); offset++
          palette.push([r, g, b])
        } else if (colorMapEntrySize === 32) {
          // 32-bit BGRA
          const b = view.getUint8(offset); offset++
          const g = view.getUint8(offset); offset++
          const r = view.getUint8(offset); offset++
          const a = view.getUint8(offset); offset++
          palette.push([r, g, b, a])
        } else {
          // 其他位深，跳过
          offset += colorMapEntrySize / 8
        }
      }
      console.log(`[TGA] Loaded palette with ${palette.length} colors`)
    }
    
    // 创建图像数据
    const imageData = new Uint8ClampedArray(width * height * 4)
    
    // 判断是否 RLE 压缩
    const isRLE = imageType === 9 || imageType === 10 || imageType === 11
    
    // 判断图像方向
    const originMask = (imageDescriptor >> 5) & 0x03
    const flipVertically = !(originMask & 0x02)
    const flipHorizontally = (originMask & 0x01) === 0
    
    // 解码像素数据
    if (isRLE) {
      // RLE 压缩解码
      let pixelIndex = 0
      while (pixelIndex < width * height && offset < arrayBuffer.byteLength) {
        const packetHeader = view.getUint8(offset); offset++
        const isRLEPacket = (packetHeader & 0x80) !== 0
        const pixelCount = (packetHeader & 0x7F) + 1
        
        if (isRLEPacket) {
          // RLE 包：重复像素
          let r = 0, g = 0, b = 0, a = 255
          
          if (imageType === 9 || imageType === 10) {
            // 调色板或真彩色
            if (colorMapType === 1 && pixelDepth === 8) {
              // 调色板索引
              const paletteIndex = view.getUint8(offset); offset++
              if (paletteIndex < palette.length) {
                const color = palette[paletteIndex]
                r = color[0]
                g = color[1]
                b = color[2]
                a = color[3] ?? 255
              }
            } else {
              // 真彩色
              b = view.getUint8(offset); offset++
              g = view.getUint8(offset); offset++
              r = view.getUint8(offset); offset++
              if (pixelDepth === 32) {
                a = view.getUint8(offset); offset++
              }
            }
          }
          
          // 重复像素
          for (let i = 0; i < pixelCount && pixelIndex < width * height; i++) {
            const y = Math.floor(pixelIndex / width)
            const x = pixelIndex % width
            const finalY = flipVertically ? (height - 1 - y) : y
            const finalX = flipHorizontally ? (width - 1 - x) : x
            const idx = (finalY * width + finalX) * 4
            
            imageData[idx] = r
            imageData[idx + 1] = g
            imageData[idx + 2] = b
            imageData[idx + 3] = a
            pixelIndex++
          }
        } else {
          // 原始包：连续像素
          for (let i = 0; i < pixelCount && pixelIndex < width * height; i++) {
            let r = 0, g = 0, b = 0, a = 255
            
            if (colorMapType === 1 && pixelDepth === 8) {
              // 调色板索引
              const paletteIndex = view.getUint8(offset); offset++
              if (paletteIndex < palette.length) {
                const color = palette[paletteIndex]
                r = color[0]
                g = color[1]
                b = color[2]
                a = color[3] ?? 255
              }
            } else {
              // 真彩色
              b = view.getUint8(offset); offset++
              g = view.getUint8(offset); offset++
              r = view.getUint8(offset); offset++
              if (pixelDepth === 32) {
                a = view.getUint8(offset); offset++
              }
            }
            
            const y = Math.floor(pixelIndex / width)
            const x = pixelIndex % width
            const finalY = flipVertically ? (height - 1 - y) : y
            const finalX = flipHorizontally ? (width - 1 - x) : x
            const idx = (finalY * width + finalX) * 4
            
            imageData[idx] = r
            imageData[idx + 1] = g
            imageData[idx + 2] = b
            imageData[idx + 3] = a
            pixelIndex++
          }
        }
      }
    } else {
      // 未压缩解码
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, a = 255
          
          if (colorMapType === 1 && pixelDepth === 8) {
            // 调色板索引
            const paletteIndex = view.getUint8(offset); offset++
            if (paletteIndex < palette.length) {
              const color = palette[paletteIndex]
              r = color[0]
              g = color[1]
              b = color[2]
              a = color[3] ?? 255
            }
          } else if (pixelDepth === 24) {
            // 24-bit BGR
            b = view.getUint8(offset); offset++
            g = view.getUint8(offset); offset++
            r = view.getUint8(offset); offset++
          } else if (pixelDepth === 32) {
            // 32-bit BGRA
            b = view.getUint8(offset); offset++
            g = view.getUint8(offset); offset++
            r = view.getUint8(offset); offset++
            a = view.getUint8(offset); offset++
          } else if (pixelDepth === 16) {
            // 16-bit ARGB (5-5-5-1)
            const pixel = view.getUint16(offset, true); offset += 2
            r = ((pixel >> 10) & 0x1F) * 8
            g = ((pixel >> 5) & 0x1F) * 8
            b = (pixel & 0x1F) * 8
            a = (pixel >> 15) ? 255 : 0
          } else {
            throw new Error(`Unsupported TGA pixel depth: ${pixelDepth}`)
          }
          
          const finalY = flipVertically ? (height - 1 - y) : y
          const finalX = flipHorizontally ? (width - 1 - x) : x
          const idx = (finalY * width + finalX) * 4
          
          imageData[idx] = r
          imageData[idx + 1] = g
          imageData[idx + 2] = b
          imageData[idx + 3] = a
        }
      }
    }
    
    // 创建 ImageData 并转换为 ImageBitmap
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    
    const imageDataObj = new ImageData(imageData, width, height)
    ctx.putImageData(imageDataObj, 0, 0)
    
    return createImageBitmap(canvas)
  }, [])

  // TIFF 解码器（支持未压缩和 PackBits 压缩的 TIFF）
  const decodeTIFF = useCallback(async (file: File): Promise<ImageBitmap> => {
    const arrayBuffer = await file.arrayBuffer()
    const view = new DataView(arrayBuffer)
    
    // 读取字节序标记（Byte Order Mark）
    const byteOrder = view.getUint16(0, false)
    const isLittleEndian = byteOrder === 0x4949 // 'II'
    
    if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) { // 'II' or 'MM'
      throw new Error('Invalid TIFF file: missing byte order mark')
    }
    
    // 验证 TIFF 标识（42）
    const tiffMagic = view.getUint16(2, isLittleEndian)
    if (tiffMagic !== 42) {
      throw new Error('Invalid TIFF file: missing magic number 42')
    }
    
    // 读取第一个 IFD（Image File Directory）的偏移
    let ifdOffset = view.getUint32(4, isLittleEndian)
    
    console.log(`[TIFF] Byte order: ${isLittleEndian ? 'Little Endian' : 'Big Endian'}, IFD offset: ${ifdOffset}`)
    
    // 解析 IFD 条目
    const tags: Record<number, any> = {}
    const numEntries = view.getUint16(ifdOffset, isLittleEndian)
    ifdOffset += 2
    
    for (let i = 0; i < numEntries; i++) {
      const tag = view.getUint16(ifdOffset, isLittleEndian)
      const type = view.getUint16(ifdOffset + 2, isLittleEndian)
      const count = view.getUint32(ifdOffset + 4, isLittleEndian)
      const valueOffset = ifdOffset + 8
      
      // 读取值（如果值大小 <= 4 字节，存储在偏移字段中）
      let value: any
      const typeSize = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] || 1
      const totalSize = count * typeSize
      
      if (totalSize <= 4) {
        // 值存储在偏移字段中
        if (type === 3) { // SHORT
          value = count === 1 
            ? view.getUint16(valueOffset, isLittleEndian)
            : Array.from({ length: count }, (_, j) => view.getUint16(valueOffset + j * 2, isLittleEndian))
        } else if (type === 4) { // LONG
          value = view.getUint32(valueOffset, isLittleEndian)
        } else if (type === 1) { // BYTE
          value = count === 1
            ? view.getUint8(valueOffset)
            : Array.from({ length: count }, (_, j) => view.getUint8(valueOffset + j))
        } else {
          value = view.getUint32(valueOffset, isLittleEndian)
        }
      } else {
        // 值存储在其他位置
        const offset = view.getUint32(valueOffset, isLittleEndian)
        if (type === 3) { // SHORT
          value = count === 1
            ? view.getUint16(offset, isLittleEndian)
            : Array.from({ length: count }, (_, j) => view.getUint16(offset + j * 2, isLittleEndian))
        } else if (type === 4) { // LONG
          value = count === 1
            ? view.getUint32(offset, isLittleEndian)
            : Array.from({ length: count }, (_, j) => view.getUint32(offset + j * 4, isLittleEndian))
        } else if (type === 1) { // BYTE
          value = Array.from({ length: count }, (_, j) => view.getUint8(offset + j))
        } else {
          value = offset
        }
      }
      
      tags[tag] = value
      ifdOffset += 12
    }
    
    console.log('[TIFF] Tags:', tags)
    
    // 提取关键信息
    const width = tags[256] // ImageWidth
    const height = tags[257] // ImageLength
    const bitsPerSample = tags[258] || 8 // BitsPerSample
    const compression = tags[259] || 1 // Compression (1 = 无压缩, 32773 = PackBits)
    // const photometric = tags[262] || 1 // PhotometricInterpretation (暂未使用)
    const stripOffsets = Array.isArray(tags[273]) ? tags[273] : [tags[273]] // StripOffsets
    const samplesPerPixel = tags[277] || 1 // SamplesPerPixel
    // const rowsPerStrip = tags[278] || height // RowsPerStrip (暂未使用)
    const stripByteCounts = Array.isArray(tags[279]) ? tags[279] : [tags[279]] // StripByteCounts
    
    console.log(`[TIFF] Dimensions: ${width}x${height}, BitsPerSample: ${bitsPerSample}, Compression: ${compression}, SamplesPerPixel: ${samplesPerPixel}`)
    
    if (!width || !height || width <= 0 || height <= 0 || width > 10000 || height > 10000) {
      throw new Error(`Invalid TIFF file: invalid dimensions (${width}x${height})`)
    }
    
    // 创建图像数据
    const imageData = new Uint8ClampedArray(width * height * 4)
    
    // 解码图像数据
    if (compression === 1) {
      // 无压缩
      let imageOffset = 0
      for (let stripIndex = 0; stripIndex < stripOffsets.length; stripIndex++) {
        const stripOffset = stripOffsets[stripIndex]
        const stripByteCount = stripByteCounts[stripIndex]
        const stripData = new Uint8Array(arrayBuffer, stripOffset, stripByteCount)
        
        // 根据 photometric 和 samplesPerPixel 解码
        if (samplesPerPixel === 3 || samplesPerPixel === 4) {
          // RGB 或 RGBA
          for (let i = 0; i < stripData.length; i += samplesPerPixel) {
            if (imageOffset >= imageData.length) break
            imageData[imageOffset] = stripData[i] // R
            imageData[imageOffset + 1] = stripData[i + 1] // G
            imageData[imageOffset + 2] = stripData[i + 2] // B
            imageData[imageOffset + 3] = samplesPerPixel === 4 ? stripData[i + 3] : 255 // A
            imageOffset += 4
          }
        } else if (samplesPerPixel === 1) {
          // 灰度或调色板
          for (let i = 0; i < stripData.length; i++) {
            if (imageOffset >= imageData.length) break
            const value = stripData[i]
            imageData[imageOffset] = value
            imageData[imageOffset + 1] = value
            imageData[imageOffset + 2] = value
            imageData[imageOffset + 3] = 255
            imageOffset += 4
          }
        }
      }
    } else if (compression === 32773) {
      // PackBits 压缩（RLE）
      let imageOffset = 0
      for (let stripIndex = 0; stripIndex < stripOffsets.length; stripIndex++) {
        const stripOffset = stripOffsets[stripIndex]
        const stripByteCount = stripByteCounts[stripIndex]
        const compressedData = new Uint8Array(arrayBuffer, stripOffset, stripByteCount)
        
        // PackBits 解码
        let srcOffset = 0
        const decodedStrip: number[] = []
        
        while (srcOffset < compressedData.length) {
          const n = compressedData[srcOffset++]
          
          if (n < 128) {
            // 复制接下来的 n+1 个字节
            const count = n + 1
            for (let i = 0; i < count && srcOffset < compressedData.length; i++) {
              decodedStrip.push(compressedData[srcOffset++])
            }
          } else if (n > 128) {
            // 重复接下来的字节 257-n 次
            const count = 257 - n
            if (srcOffset < compressedData.length) {
              const value = compressedData[srcOffset++]
              for (let i = 0; i < count; i++) {
                decodedStrip.push(value)
              }
            }
          }
          // n === 128 是 no-op
        }
        
        // 将解码后的数据转换为 RGBA
        if (samplesPerPixel === 3 || samplesPerPixel === 4) {
          // RGB 或 RGBA
          for (let i = 0; i < decodedStrip.length; i += samplesPerPixel) {
            if (imageOffset >= imageData.length) break
            imageData[imageOffset] = decodedStrip[i] // R
            imageData[imageOffset + 1] = decodedStrip[i + 1] // G
            imageData[imageOffset + 2] = decodedStrip[i + 2] // B
            imageData[imageOffset + 3] = samplesPerPixel === 4 ? decodedStrip[i + 3] : 255 // A
            imageOffset += 4
          }
        } else if (samplesPerPixel === 1) {
          // 灰度
          for (let i = 0; i < decodedStrip.length; i++) {
            if (imageOffset >= imageData.length) break
            const value = decodedStrip[i]
            imageData[imageOffset] = value
            imageData[imageOffset + 1] = value
            imageData[imageOffset + 2] = value
            imageData[imageOffset + 3] = 255
            imageOffset += 4
          }
        }
      }
    } else {
      throw new Error(`Unsupported TIFF compression type: ${compression}. Supported: 1 (None), 32773 (PackBits)`)
    }
    
    // 创建 ImageBitmap
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    
    const imageDataObj = new ImageData(imageData, width, height)
    ctx.putImageData(imageDataObj, 0, 0)
    
    return createImageBitmap(canvas)
  }, [])

  // 图片转换核心功能
  const convertImage = useCallback(async (imageFile: ImageFile): Promise<ConvertedImage> => {
    const { file, format } = imageFile
    
    try {
      let imageBitmap: ImageBitmap | null = null
      let img: HTMLImageElement | null = null
      
      // 对于 PCX 和 TIFF，使用自定义解码器或 createImageBitmap
      if (format === 'PCX') {
        try {
          // 先尝试 createImageBitmap（某些浏览器可能支持）
          const blob = new Blob([await file.arrayBuffer()], { type: 'image/x-pcx' })
          try {
            imageBitmap = await createImageBitmap(blob)
            console.log('[PCX] Using createImageBitmap')
          } catch {
            // 如果 createImageBitmap 不支持，使用自定义解码器
            console.log('[PCX] Using custom decoder')
            imageBitmap = await decodePCX(file)
          }
        } catch (err) {
          console.error('PCX decode error:', err)
          throw new Error(
            language === 'zh-CN' 
              ? `PCX 解码失败: ${file.name}。请确保文件是有效的 PCX 格式。` 
              : `PCX decode failed: ${file.name}. Please ensure the file is a valid PCX format.`
          )
        }
      } else if (format === 'TIFF') {
        try {
          // 先尝试浏览器原生支持
          const blob = new Blob([await file.arrayBuffer()], { type: 'image/tiff' })
          try {
            imageBitmap = await createImageBitmap(blob)
            console.log('[TIFF] Using native createImageBitmap')
          } catch {
            // 如果浏览器不支持，使用自定义解码器
            console.log('[TIFF] Using custom decoder')
            imageBitmap = await decodeTIFF(file)
          }
        } catch (err) {
          console.error('TIFF decode error:', err)
          throw new Error(
            language === 'zh-CN' 
              ? `TIFF 解码失败: ${file.name}。请确保文件是有效的 TIFF 格式。` 
              : `TIFF decode failed: ${file.name}. Please ensure the file is a valid TIFF format.`
          )
        }
      } else if (format === 'TGA') {
        try {
          // TGA 格式需要自定义解码器
          console.log('[TGA] Using custom decoder')
          imageBitmap = await decodeTGA(file)
        } catch (err) {
          console.error('TGA decode error:', err)
          throw new Error(
            language === 'zh-CN' 
              ? `TGA 解码失败: ${file.name}。请确保文件是有效的 TGA 格式。` 
              : `TGA decode failed: ${file.name}. Please ensure the file is a valid TGA format.`
          )
        }
      } else {
        // BMP 使用标准 Image 对象
        img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.crossOrigin = 'anonymous'
          
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error(`Failed to load image: ${file.name}`))
          
          const reader = new FileReader()
          reader.onload = (e) => {
            if (e.target?.result) {
              image.src = e.target.result as string
            }
          }
          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
          reader.readAsDataURL(file)
        })
      }
      
      // 创建 Canvas 并绘制
      const canvas = document.createElement('canvas')
      let width: number
      let height: number
      
      if (imageBitmap) {
        width = imageBitmap.width
        height = imageBitmap.height
        canvas.width = width
        canvas.height = height
      } else if (img) {
        width = img.width
        height = img.height
        canvas.width = width
        canvas.height = height
      } else {
        throw new Error('No image source available')
      }
      
      const ctx = canvas.getContext('2d', { alpha: true })
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      // 处理 Alpha 通道（TGA/TIFF）
      if (format === 'TGA' || format === 'TIFF') {
        // 添加白色背景（如果输出为JPG）
        if (outputFormat === 'jpg') {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
      }

      // 绘制图片
      if (imageBitmap) {
        ctx.drawImage(imageBitmap, 0, 0)
        imageBitmap.close() // 释放资源
      } else if (img) {
        ctx.drawImage(img, 0, 0)
      }

      // 转换为 Blob
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'))
              return
            }

            const name = file.name.replace(/\.[^.]+$/, `.${outputFormat}`)
            const url = URL.createObjectURL(blob)

            resolve({
              name,
              blob,
              url,
              size: blob.size,
              format: outputFormat,
              originalFormat: format,
              originalSize: file.size,
              width,
              height
            })
          },
          outputFormat === 'jpg' ? 'image/jpeg' : 'image/webp',
          quality / 100
        )
      })
    } catch (err) {
      throw err
    }
  }, [outputFormat, quality, decodePCX, decodeTGA, decodeTIFF, language])

  // 批量转换
  const handleConvert = useCallback(async () => {
    if (uploadedFiles.length === 0) {
      setError(language === 'zh-CN' ? '请先上传文件' : 'Please upload files first')
      return
    }

    setIsConverting(true)
    setError('')
    setSuccessMessage('')
    setProgress(0)
    setConvertedImages([])

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
        setSuccessMessage(language === 'zh-CN' 
          ? `成功转换 ${results.length} 个文件！` 
          : `Successfully converted ${results.length} file(s)!`)
      }
    } catch (err) {
      console.error('Batch conversion error:', err)
      setError(language === 'zh-CN' ? '批量转换失败' : 'Batch conversion failed')
    } finally {
      setIsConverting(false)
      setProgress(0)
    }
  }, [uploadedFiles, convertImage, language])

  // 下载单个文件
  const handleDownload = useCallback((image: ConvertedImage) => {
    const link = document.createElement('a')
    link.href = image.url
    link.download = image.name
    link.click()
  }, [])

  // 批量下载（多文件时打包ZIP）
  const handleDownloadAll = useCallback(async () => {
    if (convertedImages.length === 1) {
      handleDownload(convertedImages[0])
      return
    }

    // 简单的多文件逐个下载（浏览器兼容性最好）
    for (const image of convertedImages) {
      const link = document.createElement('a')
      link.href = image.url
      link.download = image.name
      link.click()
      // 延迟避免浏览器拦截
      await new Promise(r => setTimeout(r, 300))
    }
  }, [convertedImages, handleDownload])

  // 清除文件
  const handleClearFiles = useCallback(() => {
    // 释放预览 URL
    uploadedFiles.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    })
    
    convertedImages.forEach(image => {
      URL.revokeObjectURL(image.url)
    })

    setUploadedFiles([])
    setConvertedImages([])
    setError('')
    setSuccessMessage('')
  }, [uploadedFiles, convertedImages])

  // 移除单个文件
  const handleRemoveFile = useCallback((index: number) => {
    const file = uploadedFiles[index]
    if (file.preview) {
      URL.revokeObjectURL(file.preview)
    }
    
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }, [uploadedFiles])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="image-converter">
      {/* 头部区域 */}
      <div className="converter-header">
        <div className="header-content">
          <h1 className="tool-title">
            <FileImage />
            {language === 'zh-CN' ? '老旧格式图片转换' : 'Legacy Image Converter'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN' 
              ? '将 BMP、TGA、PCX、TIFF 等老旧格式快速转换为现代 JPG 或 WebP 格式，完全在本地处理，保护隐私安全。' 
              : 'Convert BMP, TGA, PCX, TIFF and other legacy formats to modern JPG or WebP, all processed locally to protect your privacy.'}
          </p>
        </div>
      </div>

      {/* 上传区域 - 支持拖拽 */}
      <div 
        className={`upload-section ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".bmp,.tga,.pcx,.tiff,.tif"
          multiple
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isConverting}
        />
        
        <button
          className={`upload-button ${isDragOver ? 'drag-active' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          disabled={isConverting}
        >
          <Upload />
          <span>{language === 'zh-CN' 
            ? (isDragOver ? '释放以添加文件' : '点击或拖拽上传图片') 
            : (isDragOver ? 'Drop to add files' : 'Click or drag to upload')}</span>
          <small>{language === 'zh-CN' ? '支持 BMP, TGA, PCX, TIFF 格式 · 可批量上传' : 'Supports BMP, TGA, PCX, TIFF · Batch upload'}</small>
        </button>

        {uploadedFiles.length > 0 && (
          <>
            {/* 文件统计 */}
            <div className="file-stats">
              <span className="file-count">
                {language === 'zh-CN' 
                  ? `${uploadedFiles.length} 个文件` 
                  : `${uploadedFiles.length} file(s)`}
              </span>
              <span className="file-total-size">{formatFileSize(totalFileSize)}</span>
            </div>

            <div className="file-list">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="file-item">
                  <div className="file-thumbnail">
                    {file.preview ? (
                      <img src={file.preview} alt={file.file.name} />
                    ) : (
                      <FileImage />
                    )}
                    <span className="format-badge">{file.format}</span>
                  </div>
                  <div className="file-info">
                    <span className="file-name">{file.file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    className="remove-button"
                    onClick={() => handleRemoveFile(index)}
                    disabled={isConverting}
                    title={language === 'zh-CN' ? '移除' : 'Remove'}
                  >
                    <X />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 设置区域 - 紧凑布局 */}
      {uploadedFiles.length > 0 && (
        <div className="settings-section">
          <div className="settings-row">
            <div className="setting-inline">
              <span className="setting-label">{language === 'zh-CN' ? '格式' : 'Format'}</span>
              <div className="format-buttons">
                <button
                  className={`format-button ${outputFormat === 'jpg' ? 'active' : ''}`}
                  onClick={() => setOutputFormat('jpg')}
                  disabled={isConverting}
                >
                  JPG
                </button>
                <button
                  className={`format-button ${outputFormat === 'webp' ? 'active' : ''}`}
                  onClick={() => setOutputFormat('webp')}
                  disabled={isConverting}
                >
                  WebP
                </button>
              </div>
            </div>

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
          </div>

          <div className="settings-actions">
            <button
              className="convert-button"
              onClick={handleConvert}
              disabled={isConverting}
            >
              {isConverting ? (
                <>
                  <div className="spinner"></div>
                  <span>{language === 'zh-CN' ? '转换中...' : 'Converting...'}</span>
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
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <span className="progress-text">{progress}%</span>
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
      {convertedImages.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>{language === 'zh-CN' ? '转换完成' : 'Conversion Complete'}</h3>
            <div className="results-stats">
              <span className="savings-badge">
                {totalOriginalSizeOfConverted > 0 && (
                  <>
                    {formatFileSize(totalOriginalSizeOfConverted)} → {formatFileSize(totalConvertedSize)}
                    {' · '}
                    <strong>
                      {totalConvertedSize < totalOriginalSizeOfConverted 
                        ? (language === 'zh-CN' ? '减少 ' : 'Saved ') + Math.round((1 - totalConvertedSize / totalOriginalSizeOfConverted) * 100) + '%'
                        : (language === 'zh-CN' ? '增加 ' : 'Increased ') + Math.round((totalConvertedSize / totalOriginalSizeOfConverted - 1) * 100) + '%'
                      }
                    </strong>
                  </>
                )}
              </span>
            </div>
            <button
              className="download-all-button"
              onClick={handleDownloadAll}
            >
              <Download />
              <span>{language === 'zh-CN' 
                ? `下载全部 (${convertedImages.length})` 
                : `Download All (${convertedImages.length})`}</span>
            </button>
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
                      className="download-button"
                      onClick={() => handleDownload(image)}
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                    >
                      <Download />
                    </button>
                  </div>
                </div>
                <div className="result-info">
                  <span className="result-name" title={image.name}>{image.name}</span>
                  <div className="result-details">
                    <span className="result-format">{image.format.toUpperCase()}</span>
                    <span className="result-size">{formatFileSize(image.size)}</span>
                    {image.width && image.height && (
                      <span className="result-dimensions">{image.width}×{image.height}</span>
                    )}
                    {image.originalSize > 0 && (
                      <span className={`result-savings ${image.size < image.originalSize ? 'saved' : 'increased'}`}>
                        {image.size < image.originalSize 
                          ? '-' + Math.round((1 - image.size / image.originalSize) * 100) + '%'
                          : '+' + Math.round((image.size / image.originalSize - 1) * 100) + '%'
                        }
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 预览灯箱 */}
      {previewIndex !== null && convertedImages[previewIndex] && (
        <div className="preview-lightbox" onClick={() => setPreviewIndex(null)}>
          <div className="lightbox-header">
            <span className="lightbox-title">{convertedImages[previewIndex].name}</span>
            <button className="lightbox-close" onClick={() => setPreviewIndex(null)}>
              <X />
            </button>
          </div>
          <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
            {previewIndex > 0 && (
              <button 
                className="lightbox-nav lightbox-prev"
                onClick={() => setPreviewIndex(previewIndex - 1)}
              >
                <ChevronLeft />
              </button>
            )}
            <img 
              src={convertedImages[previewIndex].url} 
              alt={convertedImages[previewIndex].name}
              className="lightbox-image"
            />
            {previewIndex < convertedImages.length - 1 && (
              <button 
                className="lightbox-nav lightbox-next"
                onClick={() => setPreviewIndex(previewIndex + 1)}
              >
                <ChevronRight />
              </button>
            )}
          </div>
          <div className="lightbox-info">
            {convertedImages[previewIndex].width}×{convertedImages[previewIndex].height}
            {' · '}
            {formatFileSize(convertedImages[previewIndex].size)}
            {' · '}
            {convertedImages[previewIndex].format.toUpperCase()}
          </div>
        </div>
      )}

      {/* 功能说明 */}
      <div className="features-section">
        <h3>{language === 'zh-CN' ? '支持的格式' : 'Supported Formats'}</h3>
        <div className="features-grid">
          <div className="feature-card">
            <FileImage />
            <h4>BMP</h4>
            <p>{language === 'zh-CN' ? '支持多种位深（1/4/8/16/24/32bit）' : 'Multiple bit depths supported'}</p>
          </div>
          <div className="feature-card">
            <FileImage />
            <h4>TGA</h4>
            <p>{language === 'zh-CN' ? '支持RLE压缩和Alpha通道' : 'RLE compression & Alpha channel'}</p>
          </div>
          <div className="feature-card">
            <FileImage />
            <h4>PCX</h4>
            <p>{language === 'zh-CN' ? '老游戏常用格式，支持调色板' : 'Legacy game format with palette'}</p>
          </div>
          <div className="feature-card">
            <Layers />
            <h4>TIFF</h4>
            <p>{language === 'zh-CN' ? '支持多页和多种压缩算法' : 'Multi-page & compression support'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
