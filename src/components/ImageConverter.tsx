import { useState, useRef, useCallback } from 'react'
import { Upload, Download, X, ImageIcon, AlertCircle, CheckCircle2, FileImage, Layers } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import './ImageConverter.css'

interface ConvertedImage {
  name: string
  blob: Blob
  url: string
  size: number
  format: 'jpg' | 'webp'
  originalFormat: string
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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

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
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [detectFormat, language])

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
          // 尝试 createImageBitmap（Chrome/Edge 可能支持）
          const blob = new Blob([await file.arrayBuffer()], { type: 'image/tiff' })
          imageBitmap = await createImageBitmap(blob)
          console.log('[TIFF] Using createImageBitmap')
        } catch (err) {
          console.error('TIFF decode error:', err)
          // Chrome/Edge 的 createImageBitmap 应该支持 TIFF
          // 如果不支持，可能是文件格式问题
          throw new Error(
            language === 'zh-CN' 
              ? `TIFF 解码失败: ${file.name}。请确保使用 Chrome 或 Edge 浏览器，或文件格式可能不受支持。` 
              : `TIFF decode failed: ${file.name}. Please use Chrome or Edge browser, or the file format may not be supported.`
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
  }, [outputFormat, quality, decodePCX, decodeTGA, language])

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

  // 批量下载
  const handleDownloadAll = useCallback(() => {
    convertedImages.forEach(image => {
      handleDownload(image)
    })
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

      {/* 上传区域 */}
      <div className="upload-section">
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
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isConverting}
        >
          <Upload />
          <span>{language === 'zh-CN' ? '上传老旧格式图片' : 'Upload Legacy Images'}</span>
          <small>{language === 'zh-CN' ? '支持 BMP, TGA, PCX, TIFF 格式' : 'Supports BMP, TGA, PCX, TIFF'}</small>
        </button>

        {uploadedFiles.length > 0 && (
          <div className="file-list">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-icon">
                  <FileImage />
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
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 设置区域 */}
      {uploadedFiles.length > 0 && (
        <div className="settings-section">
          <h3>{language === 'zh-CN' ? '转换设置' : 'Conversion Settings'}</h3>
          
          <div className="setting-group">
            <label>{language === 'zh-CN' ? '输出格式' : 'Output Format'}</label>
            <div className="format-buttons">
              <button
                className={`format-button ${outputFormat === 'jpg' ? 'active' : ''}`}
                onClick={() => setOutputFormat('jpg')}
                disabled={isConverting}
              >
                <ImageIcon />
                <span>JPG</span>
                <small>{language === 'zh-CN' ? '通用格式' : 'Universal'}</small>
              </button>
              <button
                className={`format-button ${outputFormat === 'webp' ? 'active' : ''}`}
                onClick={() => setOutputFormat('webp')}
                disabled={isConverting}
              >
                <Layers />
                <span>WebP</span>
                <small>{language === 'zh-CN' ? '现代格式' : 'Modern'}</small>
              </button>
            </div>
          </div>

          <div className="setting-group">
            <label>
              {language === 'zh-CN' ? '质量' : 'Quality'}: {quality}%
            </label>
            <input
              type="range"
              min="60"
              max="100"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              disabled={isConverting}
              className="quality-slider"
            />
            <div className="quality-hints">
              <span>{language === 'zh-CN' ? '文件小' : 'Smaller'}</span>
              <span>{language === 'zh-CN' ? '质量高' : 'Better'}</span>
            </div>
          </div>

          <button
            className="convert-button"
            onClick={handleConvert}
            disabled={isConverting}
          >
            {isConverting ? (
              <>
                <div className="spinner"></div>
                <span>{language === 'zh-CN' ? '转换中...' : 'Converting...'} {progress}%</span>
              </>
            ) : (
              <>
                <ImageIcon />
                <span>{language === 'zh-CN' ? '开始转换' : 'Start Conversion'}</span>
              </>
            )}
          </button>

          {uploadedFiles.length > 0 && !isConverting && (
            <button
              className="clear-button"
              onClick={handleClearFiles}
            >
              <X />
              <span>{language === 'zh-CN' ? '清除所有' : 'Clear All'}</span>
            </button>
          )}
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
            <button
              className="download-all-button"
              onClick={handleDownloadAll}
            >
              <Download />
              <span>{language === 'zh-CN' ? '下载全部' : 'Download All'}</span>
            </button>
          </div>

          <div className="results-grid">
            {convertedImages.map((image, index) => (
              <div key={index} className="result-item">
                <div className="result-preview">
                  <img src={image.url} alt={image.name} />
                  <div className="result-overlay">
                    <button
                      className="download-button"
                      onClick={() => handleDownload(image)}
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
                    {image.width && image.height && (
                      <span className="result-dimensions">{image.width}×{image.height}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
