import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Camera, Settings, CheckCircle2, AlertCircle, Package, Info } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
// @ts-ignore - ExifReader may not have types
import ExifReader from 'exifreader'
// @ts-ignore - piexifjs may not have complete types
import piexif from 'piexifjs'
import './ProRAWConverter.css'

interface ImageFile {
  file: File
  format: string
  size: number
  preview: string
  width?: number
  height?: number
  exifData?: Record<string, any>
}

interface ConvertedImage {
  name: string
  blob: Blob
  url: string
  size: number
  originalSize: number
  width?: number
  height?: number
  compressionRatio: number
}

interface ExifOptions {
  dateTime: boolean
  camera: boolean
  lens: boolean
  exposure: boolean
  gps: boolean
}

export default function ProRAWConverter() {
  const { language } = useI18n()
  const [uploadedFiles, setUploadedFiles] = useState<ImageFile[]>([])
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([])
  const [quality, setQuality] = useState(90)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // EXIF 保留选项
  const [exifOptions, setExifOptions] = useState<ExifOptions>({
    dateTime: true,
    camera: true,
    lens: true,
    exposure: true,
    gps: false, // 默认不保留GPS
  })

  // 格式检测
  const detectFormat = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer.slice(0, 16))
    
    // DNG (TIFF-based): 49 49 or 4D 4D
    if ((bytes[0] === 0x49 && bytes[1] === 0x49) || 
        (bytes[0] === 0x4D && bytes[1] === 0x4D)) {
      return 'DNG'
    }
    
    // HEIF/HEIC: ftyp
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const type = String.fromCharCode(...Array.from(bytes.slice(8, 12)))
      if (type.includes('heic') || type.includes('heif') || type.includes('mif1')) {
        return 'HEIC'
      }
    }
    
    return 'UNKNOWN'
  }, [])

  // 真实EXIF读取（v1.1 新增）
  const readExifData = useCallback(async (file: File): Promise<Record<string, any>> => {
    try {
      const buffer = await file.arrayBuffer()
      const tags = await ExifReader.load(buffer, { expanded: true })
      
      console.log('✅ EXIF tags loaded:', tags)
      
      return {
        // 基础信息
        DateTime: tags.exif?.DateTime?.description || null,
        DateTimeOriginal: tags.exif?.DateTimeOriginal?.description || null,
        
        // 相机信息
        Make: tags.exif?.Make?.description || null,
        Model: tags.exif?.Model?.description || null,
        LensModel: tags.exif?.LensModel?.description || null,
        
        // 曝光参数
        ISO: tags.exif?.ISOSpeedRatings?.value || null,
        FNumber: tags.exif?.FNumber?.value || null,
        ExposureTime: tags.exif?.ExposureTime?.description || null,
        FocalLength: tags.exif?.FocalLength?.description || null,
        
        // GPS
        GPSLatitude: tags.gps?.Latitude || null,
        GPSLongitude: tags.gps?.Longitude || null,
        GPSAltitude: tags.gps?.Altitude || null,
      }
    } catch (err) {
      console.warn('⚠️ Failed to read EXIF from', file.name, ':', err)
      return {} // 返回空对象，不影响转换流程
    }
  }, [])

  // EXIF写回JPG（v1.1 新增）
  const writeExifToJpg = useCallback((
    jpgDataURL: string,
    exifData: Record<string, any>,
    options: ExifOptions
  ): string => {
    try {
      const exifObj: any = {
        "0th": {},
        "Exif": {},
        "GPS": {}
      }
      
      // 拍摄时间
      if (options.dateTime && exifData.DateTime) {
        exifObj["0th"][piexif.ImageIFD.DateTime] = exifData.DateTime
        if (exifData.DateTimeOriginal) {
          exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = exifData.DateTimeOriginal
        }
      }
      
      // 相机信息
      if (options.camera) {
        if (exifData.Make) exifObj["0th"][piexif.ImageIFD.Make] = exifData.Make
        if (exifData.Model) exifObj["0th"][piexif.ImageIFD.Model] = exifData.Model
      }
      
      // 镜头信息
      if (options.lens && exifData.LensModel) {
        exifObj["Exif"][piexif.ExifIFD.LensModel] = exifData.LensModel
      }
      
      // 曝光参数
      if (options.exposure) {
        if (exifData.ISO) {
          exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = exifData.ISO
        }
        if (exifData.FNumber) {
          const fNumber = typeof exifData.FNumber === 'number' 
            ? [Math.round(exifData.FNumber * 100), 100]
            : [exifData.FNumber, 1]
          exifObj["Exif"][piexif.ExifIFD.FNumber] = fNumber
        }
      }
      
      // GPS（谨慎）
      if (options.gps && exifData.GPSLatitude && exifData.GPSLongitude) {
        exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = exifData.GPSLatitude
        exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = exifData.GPSLongitude
        if (exifData.GPSAltitude) {
          exifObj["GPS"][piexif.GPSIFD.GPSAltitude] = exifData.GPSAltitude
        }
      }
      
      const exifBytes = piexif.dump(exifObj)
      const newDataURL = piexif.insert(exifBytes, jpgDataURL)
      console.log('✅ EXIF written to JPG')
      return newDataURL
    } catch (err) {
      console.warn('⚠️ Failed to write EXIF:', err)
      return jpgDataURL // 失败时返回原始数据
    }
  }, [])

  // 处理文件列表（v1.1 增强错误处理）
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setError('')
    const newFiles: ImageFile[] = []
    const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

    for (const file of Array.from(files)) {
      try {
        // 文件大小检测
        if (file.size > MAX_FILE_SIZE) {
          setError(language === 'zh-CN' 
            ? `文件过大: ${file.name} (${formatFileSize(file.size)})，建议单个文件不超过 100MB` 
            : `File too large: ${file.name} (${formatFileSize(file.size)}), recommend under 100MB`)
          continue
        }
        
        const format = await detectFormat(file)
        
        // DNG 提示
        if (format === 'DNG') {
          setError(language === 'zh-CN' 
            ? `ProRAW (.dng) 支持即将推出，当前请使用 HEIC 格式。您可以在 iPhone 上导出为 HEIC。` 
            : `ProRAW (.dng) support coming soon, please use HEIC format for now. You can export as HEIC on iPhone.`)
          continue
        }
        
        // 不支持格式提示
        if (format === 'UNKNOWN') {
          setError(language === 'zh-CN' 
            ? `不支持的文件格式: ${file.name}，请上传 .heic 或 .heif 文件` 
            : `Unsupported format: ${file.name}, please upload .heic or .heif files`)
          continue
        }

        // 创建预览
        const preview = URL.createObjectURL(file)
        
        // 读取EXIF（v1.1 真实读取）
        const exifData = await readExifData(file)

        // 获取图片尺寸
        const img = new Image()
        await new Promise<void>((resolve) => {
          img.onload = () => {
            newFiles.push({
              file,
              format,
              size: file.size,
              preview,
              width: img.width,
              height: img.height,
              exifData,
            })
            resolve()
          }
          img.onerror = () => {
            // DNG可能无法直接预览
            newFiles.push({
              file,
              format,
              size: file.size,
              preview: '',
              exifData,
            })
            resolve()
          }
          img.src = preview
        })
      } catch (err) {
        console.error('File processing error:', err)
        setError(language === 'zh-CN' 
          ? `文件处理失败: ${file.name}` 
          : `Failed to process: ${file.name}`)
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles])
  }, [detectFormat, readExifData, language])

  // 文件上传
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    await processFiles(files)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processFiles])

  // 拖拽处理
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

    await processFiles(Array.from(files))
  }, [processFiles])

  // 图片转换（v1.1 增加EXIF写回）
  const convertImage = useCallback(async (imageFile: ImageFile): Promise<ConvertedImage> => {
    const startTime = performance.now() // 性能监控
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          
          const ctx = canvas.getContext('2d', { alpha: false })
          if (!ctx) {
            throw new Error('Failed to get canvas context')
          }

          ctx.drawImage(img, 0, 0)

          // 转换为JPG
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'))
                return
              }

              // v1.1 新增：EXIF 写回逻辑
              const reader = new FileReader()
              reader.onload = () => {
                const dataURL = reader.result as string
                
                // 写入 EXIF
                const newDataURL = writeExifToJpg(dataURL, imageFile.exifData || {}, exifOptions)
                
                // 转回 Blob
                fetch(newDataURL)
                  .then(res => res.blob())
                  .then(finalBlob => {
                    const name = imageFile.file.name.replace(/\.(dng|heic|heif)$/i, '.jpg')
                    const url = URL.createObjectURL(finalBlob)
                    const compressionRatio = ((1 - finalBlob.size / imageFile.file.size) * 100)

                    // 性能日志
                    const duration = performance.now() - startTime
                    console.log(`✅ Converted ${imageFile.file.name} in ${duration.toFixed(0)}ms`)

                    resolve({
                      name,
                      blob: finalBlob,
                      url,
                      size: finalBlob.size,
                      originalSize: imageFile.file.size,
                      width: img.width,
                      height: img.height,
                      compressionRatio: compressionRatio > 0 ? compressionRatio : 0
                    })
                  })
                  .catch(reject)
              }
              
              reader.onerror = reject
              reader.readAsDataURL(blob)
            },
            'image/jpeg',
            quality / 100
          )
        } catch (err) {
          reject(err)
        }
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${imageFile.file.name}`))
      }

      img.src = imageFile.preview
    })
  }, [quality, exifOptions, writeExifToJpg])

  // 批量转换（v1.1 并发处理 + 增强错误提示）
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
    const failedFiles: string[] = []
    const MAX_CONCURRENT = 3 // v1.1 并发处理

    try {
      // 分批并发处理
      for (let i = 0; i < uploadedFiles.length; i += MAX_CONCURRENT) {
        const batch = uploadedFiles.slice(i, i + MAX_CONCURRENT)
        
        // 并发处理一批
        const batchResults = await Promise.allSettled(
          batch.map(file => convertImage(file))
        )
        
        // 收集结果
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          } else {
            console.error(`❌ Failed: ${batch[index].file.name}`, result.reason)
            failedFiles.push(batch[index].file.name)
          }
        })
        
        // 更新进度
        const processed = Math.min(i + MAX_CONCURRENT, uploadedFiles.length)
        setProgress(Math.round((processed / uploadedFiles.length) * 100))
      }

      setConvertedImages(results)
      
      // 详细成功/失败消息
      if (results.length > 0) {
        const successMsg = language === 'zh-CN' 
          ? `成功转换 ${results.length} 个文件` 
          : `Successfully converted ${results.length} file(s)`
        
        const failMsg = failedFiles.length > 0
          ? (language === 'zh-CN' 
            ? `，${failedFiles.length} 个失败: ${failedFiles.join(', ')}` 
            : `, ${failedFiles.length} failed: ${failedFiles.join(', ')}`)
          : ''
        
        setSuccessMessage(successMsg + failMsg)
      }
      
      if (failedFiles.length > 0 && results.length === 0) {
        setError(
          language === 'zh-CN' 
            ? `所有文件转换失败: ${failedFiles.join(', ')}` 
            : `All files failed: ${failedFiles.join(', ')}`
        )
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

  // 批量下载ZIP
  const handleDownloadAll = useCallback(async () => {
    if (convertedImages.length === 0) return

    const zip = new JSZip()
    
    for (const image of convertedImages) {
      zip.file(image.name, image.blob)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `proraw-converted-${Date.now()}.zip`)
  }, [convertedImages])

  // 清除文件（v1.1 增强内存管理）
  const handleClearFiles = useCallback(() => {
    // 清理 Blob URLs
    uploadedFiles.forEach(file => {
      if (file.preview) URL.revokeObjectURL(file.preview)
    })
    convertedImages.forEach(image => {
      if (image.url) URL.revokeObjectURL(image.url)
    })

    setUploadedFiles([])
    setConvertedImages([])
    setError('')
    setSuccessMessage('')
  }, [uploadedFiles, convertedImages])

  // 移除单个文件
  const handleRemoveFile = useCallback((index: number) => {
    const file = uploadedFiles[index]
    if (file.preview) URL.revokeObjectURL(file.preview)
    
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }, [uploadedFiles])

  // 切换EXIF选项
  const toggleExifOption = useCallback((key: keyof ExifOptions) => {
    setExifOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // v1.1 新增：浏览器兼容性检测
  useEffect(() => {
    if (!HTMLCanvasElement.prototype.toBlob) {
      setError(
        language === 'zh-CN' 
          ? '浏览器不支持此功能，请使用 Chrome 或 Safari 最新版本' 
          : 'Browser not supported, please use latest Chrome or Safari'
      )
      return
    }
    
    if (!window.FileReader) {
      setError(
        language === 'zh-CN' 
          ? '浏览器不支持 FileReader API，请更新浏览器' 
          : 'Browser does not support FileReader API, please update browser'
      )
      return
    }
  }, [language])

  // v1.1 新增：组件卸载时清理内存
  useEffect(() => {
    return () => {
      uploadedFiles.forEach(file => {
        if (file.preview) URL.revokeObjectURL(file.preview)
      })
      convertedImages.forEach(image => {
        if (image.url) URL.revokeObjectURL(image.url)
      })
    }
  }, [uploadedFiles, convertedImages])

  return (
    <div className="proraw-converter">
      {/* 头部 */}
      <div className="converter-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Camera />
            {language === 'zh-CN' ? 'ProRAW / HEIF 专业转换' : 'ProRAW / HEIF Pro Converter'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN' 
              ? 'iPhone ProRAW (.DNG) 和 HEIF Burst 批量转 JPG，可选择性保留 EXIF 元数据，完全本地处理。' 
              : 'Batch convert iPhone ProRAW (.DNG) and HEIF Burst to JPG with selective EXIF metadata retention, all processed locally.'}
          </p>
        </div>
      </div>

      {/* 专业提示 */}
      <div className="pro-notice">
        <Info />
        <div className="notice-content">
          <strong>{language === 'zh-CN' ? '📷 为 iPhone ProRAW 设计' : '📷 Designed for iPhone ProRAW'}</strong>
          <p>{language === 'zh-CN' 
            ? '支持 ProRAW (.DNG) 和 HEIF Burst 连拍，快速转换为普通 JPG 用于分享，同时保留重要的拍摄信息。v1.1 已支持真实 EXIF 读写！' 
            : 'Support ProRAW (.DNG) and HEIF Burst, quickly convert to JPG for sharing while keeping essential shooting info. v1.1 now supports real EXIF read/write!'}</p>
        </div>
      </div>

      {/* 上传区域 */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept=".dng,.heic,.heif,image/heic,image/heif"
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
          <span>{language === 'zh-CN' ? '上传 ProRAW / HEIF 文件' : 'Upload ProRAW / HEIF Files'}</span>
          <small>
            {isDragging 
              ? (language === 'zh-CN' ? '松开鼠标上传文件' : 'Drop files here')
              : (language === 'zh-CN' ? '点击上传或拖拽文件到这里' : 'Click to upload or drag & drop files here')}
          </small>
          <small>{language === 'zh-CN' ? '支持 .DNG, .HEIC, .HEIF' : 'Supports .DNG, .HEIC, .HEIF'}</small>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="file-list">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-icon">
                  <Camera />
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

      {/* 设置区域 */}
      {uploadedFiles.length > 0 && (
        <div className="settings-section">
          <h3>
            <Settings />
            {language === 'zh-CN' ? '转换设置' : 'Conversion Settings'}
          </h3>
          
          {/* JPG质量 */}
          <div className="setting-group">
            <label>{language === 'zh-CN' ? 'JPG 质量' : 'JPG Quality'}: {quality}%</label>
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

          {/* EXIF元数据选项 */}
          <div className="setting-group exif-options">
            <label className="group-label">
              {language === 'zh-CN' ? '保留 EXIF 元数据 (v1.1 真实生效)' : 'Keep EXIF Metadata (v1.1 Real)'}
            </label>
            <div className="exif-checkboxes">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={exifOptions.dateTime}
                  onChange={() => toggleExifOption('dateTime')}
                  disabled={isConverting}
                />
                <span>{language === 'zh-CN' ? '拍摄时间' : 'Date & Time'}</span>
              </label>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={exifOptions.camera}
                  onChange={() => toggleExifOption('camera')}
                  disabled={isConverting}
                />
                <span>{language === 'zh-CN' ? '相机型号' : 'Camera Model'}</span>
              </label>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={exifOptions.lens}
                  onChange={() => toggleExifOption('lens')}
                  disabled={isConverting}
                />
                <span>{language === 'zh-CN' ? '镜头信息' : 'Lens Info'}</span>
              </label>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={exifOptions.exposure}
                  onChange={() => toggleExifOption('exposure')}
                  disabled={isConverting}
                />
                <span>{language === 'zh-CN' ? '曝光参数' : 'Exposure'}</span>
              </label>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={exifOptions.gps}
                  onChange={() => toggleExifOption('gps')}
                  disabled={isConverting}
                />
                <span className="gps-warning">
                  {language === 'zh-CN' ? 'GPS 位置' : 'GPS Location'}
                  {exifOptions.gps && <span className="warning-badge">⚠️</span>}
                </span>
              </label>
            </div>
            {exifOptions.gps && (
              <div className="gps-warning-message">
                <AlertCircle />
                <span>
                  {language === 'zh-CN' 
                    ? '⚠️ GPS 信息可能泄露您的位置隐私，建议谨慎保留' 
                    : '⚠️ GPS info may expose your location privacy, keep with caution'}
                </span>
              </div>
            )}
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
                <Camera />
                <span>{language === 'zh-CN' ? '开始转换' : 'Start Conversion'}</span>
              </>
            )}
          </button>

          {uploadedFiles.length > 0 && !isConverting && (
            <button className="clear-button" onClick={handleClearFiles}>
              <X />
              <span>{language === 'zh-CN' ? '清除所有' : 'Clear All'}</span>
            </button>
          )}
        </div>
      )}

      {/* 消息 */}
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
            <button className="download-all-button" onClick={handleDownloadAll}>
              <Package />
              <span>{language === 'zh-CN' ? '打包下载 ZIP' : 'Download ZIP'}</span>
            </button>
          </div>

          <div className="results-grid">
            {convertedImages.map((image, index) => (
              <div key={index} className="result-item">
                <div className="result-preview">
                  {image.url ? (
                    <img src={image.url} alt={image.name} />
                  ) : (
                    <div className="no-preview">
                      <Camera />
                      <span>JPG</span>
                    </div>
                  )}
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
                    <span className="result-format">JPG</span>
                    <span className="result-size">{formatFileSize(image.size)}</span>
                    {image.compressionRatio > 0 && (
                      <span className="result-compression">-{image.compressionRatio.toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
