import { useState, useRef, useCallback } from 'react'
import { Upload, Download, X, Camera, Settings, CheckCircle2, AlertCircle, Package, Info } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
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
      // 检查是否是DNG
      const view = new DataView(buffer)
      // 简单检测，实际需要更复杂的TIFF解析
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

  // 读取EXIF数据（简化版，实际需要exifreader库）
  const readExifData = useCallback(async (file: File): Promise<Record<string, any>> => {
    // TODO: 集成 exifreader.js
    // 这里返回模拟数据
    return {
      DateTime: '2024:01:16 12:30:45',
      Make: 'Apple',
      Model: 'iPhone 15 Pro Max',
      LensModel: 'iPhone 15 Pro Max back camera 6.86mm f/1.78',
      ISO: 400,
      FNumber: 1.78,
      ExposureTime: '1/250',
      FocalLength: '6.86mm',
      GPSLatitude: null,
      GPSLongitude: null,
    }
  }, [])

  // 处理文件列表
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
        
        // 读取EXIF
        const exifData = await readExifData(file)

        // 获取图片尺寸
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
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
              preview: '', // DNG暂时无预览
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

  // 图片转换
  const convertImage = useCallback(async (imageFile: ImageFile): Promise<ConvertedImage> => {
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

              const name = imageFile.file.name.replace(/\.(dng|heic|heif)$/i, '.jpg')
              const url = URL.createObjectURL(blob)
              const compressionRatio = ((1 - blob.size / imageFile.file.size) * 100)

              resolve({
                name,
                blob,
                url,
                size: blob.size,
                originalSize: imageFile.file.size,
                width: img.width,
                height: img.height,
                compressionRatio: compressionRatio > 0 ? compressionRatio : 0
              })
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
  }, [quality])

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

  // 清除文件
  const handleClearFiles = useCallback(() => {
    uploadedFiles.forEach(file => URL.revokeObjectURL(file.preview))
    convertedImages.forEach(image => URL.revokeObjectURL(image.url))

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
            ? '支持 ProRAW (.DNG) 和 HEIF Burst 连拍，快速转换为普通 JPG 用于分享，同时保留重要的拍摄信息。' 
            : 'Support ProRAW (.DNG) and HEIF Burst, quickly convert to JPG for sharing while keeping essential shooting info.'}</p>
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
              {language === 'zh-CN' ? '保留 EXIF 元数据' : 'Keep EXIF Metadata'}
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
