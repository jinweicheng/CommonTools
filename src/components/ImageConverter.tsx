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

          // 处理 Alpha 通道（TGA/TIFF）
          if (format === 'TGA' || format === 'TIFF') {
            // 添加白色背景（如果输出为JPG）
            if (outputFormat === 'jpg') {
              ctx.fillStyle = '#FFFFFF'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
          }

          // 绘制图片
          ctx.drawImage(img, 0, 0)

          // 转换为 Blob
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
                width: img.width,
                height: img.height
              })
            },
            outputFormat === 'jpg' ? 'image/jpeg' : 'image/webp',
            quality / 100
          )
        } catch (err) {
          reject(err)
        }
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${file.name}`))
      }

      // 使用 FileReader 读取文件
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
