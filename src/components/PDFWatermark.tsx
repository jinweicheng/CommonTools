import { useState } from 'react'
import { Upload, Type, Sliders, FileImage, File, Download, Eye } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { saveAs } from 'file-saver'
import * as pdfjsLib from 'pdfjs-dist'
import { useI18n } from '../i18n/I18nContext'
import { trackFileUpload, trackFileDownload } from '../utils/usageStatisticsService'
import '../utils/pdfWorkerConfig'
import './PDFWatermark.css'

// 文件类型枚举
type FileType = 'pdf' | 'image' | 'unknown'

// 将文本转换为图片（支持中文）
const textToImage = async (text: string, fontSize: number, color: string = '#808080'): Promise<string> => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
  const textMetrics = ctx.measureText(text)
  const textWidth = textMetrics.width
  const textHeight = fontSize * 1.2
  
  canvas.width = textWidth + 20
  canvas.height = textHeight + 20
  
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 10, canvas.height / 2)
  
  return canvas.toDataURL('image/png')
}

// 检测文件类型
const detectFileType = (file: File): FileType => {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'bmp', 'webp', 'gif'].includes(ext)) return 'image'
  
  return 'unknown'
}

export default function PDFWatermark() {
  const { t } = useI18n()
  const [previewGenerating, setPreviewGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watermarkText, setWatermarkText] = useState(() => t('watermark.defaultWatermarkText'))
  const [opacity, setOpacity] = useState(0.3)
  const [fontSize, setFontSize] = useState(24)
  const [angle, setAngle] = useState(-45)
  const [fileType, setFileType] = useState<FileType>('unknown')
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewReady, setIsPreviewReady] = useState(false)

  // 处理PDF水印（返回Blob，不下载）
  const processPDFWatermark = async (file: File): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer()
    
    // 验证文件大小
    if (arrayBuffer.byteLength === 0) {
      throw new Error(t('watermark.pdfEmpty'))
    }
    
    // 验证是否为有效的 PDF 文件
    const uint8Array = new Uint8Array(arrayBuffer)
    const pdfHeader = String.fromCharCode(...uint8Array.slice(0, 4))
    if (pdfHeader !== '%PDF') {
      throw new Error(t('watermark.invalidPdf'))
    }
    
    const pdfDoc = await PDFDocument.load(arrayBuffer)
    const pages = pdfDoc.getPages()
    
    if (pages.length === 0) {
      throw new Error(t('watermark.pdfNoPages'))
    }

    // 检查是否包含中文
    const hasChinese = /[\u4e00-\u9fa5]/.test(watermarkText)
    
    let watermarkImage = null
    let imageDims = null
    
    if (hasChinese) {
      // 中文文本：转换为图片
      const grayValue = Math.round(0.5 * 255)
      const hexColor = `#${grayValue.toString(16).padStart(2, '0')}${grayValue.toString(16).padStart(2, '0')}${grayValue.toString(16).padStart(2, '0')}`
      const watermarkDataUrl = await textToImage(watermarkText, fontSize, hexColor)
      
      // 将 data URL 转换为 Uint8Array
      const base64Data = watermarkDataUrl.split(',')[1]
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      watermarkImage = await pdfDoc.embedPng(bytes)
      imageDims = watermarkImage.scale(1)
    }

    // 为每一页添加水印
    for (const page of pages) {
      const { width, height } = page.getSize()

      if (hasChinese && watermarkImage && imageDims) {
        // 使用图片水印（支持中文）
        const spacing = 200
        
        for (let x = -spacing; x < width + spacing; x += spacing) {
          for (let y = -spacing; y < height + spacing; y += spacing) {
            page.drawImage(watermarkImage, {
              x: x - imageDims.width / 2,
              y: y - imageDims.height / 2,
              width: imageDims.width,
              height: imageDims.height,
              opacity: opacity,
              rotate: degrees(angle),
            })
          }
        }
      } else {
        // 使用文本水印（英文）
        const textWidth = watermarkText.length * fontSize * 0.6
        const textHeight = fontSize
        const spacing = 200

        for (let x = 0; x < width + spacing; x += spacing) {
          for (let y = 0; y < height + spacing; y += spacing) {
            page.drawText(watermarkText, {
              x: x - textWidth / 2,
              y: y - textHeight / 2,
              size: fontSize,
              color: rgb(0.5, 0.5, 0.5),
              opacity: opacity,
              rotate: degrees(angle),
            })
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save()
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  }

  // 处理图片水印（返回Blob，不下载）
  const processImageWatermark = async (file: File): Promise<Blob> => {
    return new Promise<Blob>((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        try {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!
            
            // 设置canvas尺寸与图片相同
            canvas.width = img.width
            canvas.height = img.height
            
            // 绘制原图
            ctx.drawImage(img, 0, 0)
            
            // 设置水印样式
            ctx.save()
            ctx.globalAlpha = opacity
            ctx.fillStyle = '#808080'
            ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
            
            // 计算水印间距
            const spacing = 200
            const radians = (angle * Math.PI) / 180
            
            // 平铺水印
            for (let x = -spacing; x < canvas.width + spacing; x += spacing) {
              for (let y = 0; y < canvas.height + spacing; y += spacing) {
                ctx.save()
                ctx.translate(x, y)
                ctx.rotate(radians)
                ctx.fillText(watermarkText, 0, 0)
                ctx.restore()
              }
            }
            
            ctx.restore()
            
            // 转换为blob
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob)
              } else {
                reject(new Error(t('watermark.generateImageFailed')))
              }
            }, file.type || 'image/png')
          }
          
          img.onerror = () => reject(new Error(t('watermark.imageLoadFailed')))
          img.src = e.target?.result as string
        } catch (err) {
          reject(err)
        }
      }
      
      reader.onerror = () => reject(new Error(t('watermark.fileReadFailed')))
      reader.readAsDataURL(file)
    })
  }

  // 生成PDF预览（使用pdfjs-dist渲染第一页）
  const generatePDFPreview = async (blob: Blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const firstPage = await pdf.getPage(1)
      const viewport = firstPage.getViewport({ scale: 1.5 })
      
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      await firstPage.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
      
      return canvas.toDataURL('image/png')
    } catch (err) {
      console.error('生成PDF预览失败:', err)
      return null
    }
  }

  // 生成图片预览（在canvas上绘制水印）
  const generateImagePreview = async (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          
          // 限制预览尺寸（最大宽度800px）
          const maxWidth = 800
          const scale = Math.min(1, maxWidth / img.width)
          canvas.width = img.width * scale
          canvas.height = img.height * scale
          
          // 绘制原图（缩放）
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          
          // 设置水印样式
          ctx.save()
          ctx.globalAlpha = opacity
          ctx.fillStyle = '#808080'
          const scaledFontSize = fontSize * scale
          ctx.font = `${scaledFontSize}px Arial, "Microsoft YaHei", sans-serif`
          
          // 计算水印间距（按比例缩放）
          const spacing = 200 * scale
          const radians = (angle * Math.PI) / 180
          
          // 平铺水印
          for (let x = -spacing; x < canvas.width + spacing; x += spacing) {
            for (let y = 0; y < canvas.height + spacing; y += spacing) {
              ctx.save()
              ctx.translate(x, y)
              ctx.rotate(radians)
              ctx.fillText(watermarkText, 0, 0)
              ctx.restore()
            }
          }
          
          ctx.restore()
          
          resolve(canvas.toDataURL('image/png'))
        }
        
        img.onerror = () => reject(new Error(t('watermark.imageLoadFailed')))
        img.src = e.target?.result as string
      }
      
      reader.onerror = () => reject(new Error(t('watermark.fileReadFailed')))
      reader.readAsDataURL(file)
    })
  }

  // 文件上传处理（只上传，不处理）
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const type = detectFileType(file)
    setFileType(type)
    
    if (type === 'unknown') {
      setError(t('watermark.unsupportedFormat'))
      return
    }

    setError(null)
    setOriginalFile(file)
    setProcessedBlob(null)
    setPreviewUrl(null)
    setIsPreviewReady(false)

    // 统计：文件上传
    trackFileUpload('watermark', type)

    // 如果是图片，显示原始图片预览
    if (type === 'image') {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // 生成预览
  const handleGeneratePreview = async () => {
    if (!originalFile) {
      setError(t('watermark.selectFile'))
      return
    }

    setPreviewGenerating(true)
    setError(null)
    setIsPreviewReady(false)

    try {
      let blob: Blob

      // 处理水印
      switch (fileType) {
        case 'pdf':
          blob = await processPDFWatermark(originalFile)
          // 生成PDF预览（渲染第一页）
          const pdfPreview = await generatePDFPreview(blob)
          if (pdfPreview) {
            setPreviewUrl(pdfPreview)
          }
          break
        case 'image':
          blob = await processImageWatermark(originalFile)
          // 生成图片预览
          const imagePreview = await generateImagePreview(originalFile)
          setPreviewUrl(imagePreview)
          break
        default:
          throw new Error(t('watermark.unsupportedFormat'))
      }

      setProcessedBlob(blob)
      setIsPreviewReady(true)
    } catch (err) {
      console.error('生成预览失败:', err)
      
      let errorMessage = t('watermark.processFailed')
      if (err instanceof Error) {
        const errorMsg = err.message.toLowerCase()
        if (errorMsg.includes('invalid') || errorMsg.includes('corrupt')) {
          errorMessage = t('watermark.pdfInvalidOrCorrupt')
        } else if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
          errorMessage = t('watermark.pdfEncrypted')
        } else {
          errorMessage = err.message
        }
      }
      setError(errorMessage)
    } finally {
      setPreviewGenerating(false)
    }
  }

  // 下载处理后的文件
  const handleDownload = () => {
    if (!processedBlob || !originalFile) {
      setError(t('watermark.selectFile'))
      return
    }

    try {
      const ext = originalFile.name.split('.').pop()?.toLowerCase() || 'pdf'
      const newName = originalFile.name.replace(`.${ext}`, `-watermarked.${ext}`)
      saveAs(processedBlob, newName)
      
      // 统计：文件下载
      trackFileDownload('watermark', fileType)
    } catch (err) {
      console.error('下载失败:', err)
      setError(t('watermark.processFailed') + (err instanceof Error ? err.message : t('common.unknownError')))
    }
  }

  // 获取文件类型图标
  const getFileIcon = () => {
    switch (fileType) {
      case 'pdf': return <File size={20} className="file-icon-pdf" />
      case 'image': return <FileImage size={20} className="file-icon-image" />
      default: return <Upload size={20} />
    }
  }

  // 获取支持的文件类型文本
  const getSupportedFormats = () => {
    return t('watermark.supportedFormatsList')
  }

  return (
    <div className="pdf-watermark">
      <h2 className="tool-header">📝 {t('watermark.toolTitle')}</h2>
      
      <div className="format-info">
        <div className="supported-formats">
          <strong>{t('watermark.supportedFormatsLabel')}</strong> <span>{getSupportedFormats()}</span> 
        </div>
        {fileType !== 'unknown' && (
          <div className="current-file-type">
            {getFileIcon()}
            <span>{t('watermark.currentFileTypeLabel')} {fileType.toUpperCase()}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="watermark-settings">
        <div className="setting-group">
          <label className="setting-label">
            <Type size={20} />
            {t('watermark.text')}
          </label>
          <input
            type="text"
            className="setting-input"
            value={watermarkText}
            onChange={(e) => {
              setWatermarkText(e.target.value)
              setIsPreviewReady(false) // 参数改变后需要重新生成预览
            }}
            placeholder={t('watermark.textPlaceholder')}
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            <Sliders size={20} />
            {t('watermark.opacityLabel')} {Math.round(opacity * 100)}%
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={opacity}
            onChange={(e) => {
              setOpacity(parseFloat(e.target.value))
              setIsPreviewReady(false)
            }}
            className="setting-slider"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            {t('watermark.fontSizeLabel')} {fontSize}px
          </label>
          <input
            type="range"
            min="24"
            max="120"
            step="4"
            value={fontSize}
            onChange={(e) => {
              setFontSize(parseInt(e.target.value))
              setIsPreviewReady(false)
            }}
            className="setting-slider"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            {t('watermark.angleLabel')} {angle}°
          </label>
          <input
            type="range"
            min="-90"
            max="90"
            step="15"
            value={angle}
            onChange={(e) => {
              setAngle(parseInt(e.target.value))
              setIsPreviewReady(false)
            }}
            className="setting-slider"
          />
        </div>
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp,.gif"
            onChange={handleFileUpload}
            disabled={previewGenerating}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {t('watermark.selectFile')}
        </label>
      </div>

      {originalFile && (
        <div className="action-buttons">
          <button
            className="preview-button"
            onClick={handleGeneratePreview}
            disabled={previewGenerating}
          >
            <Eye size={20} />
            {previewGenerating ? t('watermark.generatingPreview') : t('watermark.generatePreview')}
          </button>

          {isPreviewReady && processedBlob && (
            <button
              className="download-button"
              onClick={handleDownload}
            >
              <Download size={20} />
              {t('watermark.downloadWatermark')}
            </button>
          )}
        </div>
      )}

      <div className="preview-section">
        <div className="preview-box">
          <div className="preview-label">{t('watermark.previewLabel')}</div>
          <div className="watermark-preview">
            {previewUrl ? (
              <div className="image-preview-container">
                <img src={previewUrl} alt={t('watermark.previewAlt')} className="preview-image" />
              </div>
            ) : (
              <div className="preview-placeholder">
                {originalFile 
                  ? t('watermark.selectFile')
                  : t('watermark.defaultWatermarkText')}
              </div>
            )}
          </div>
          {isPreviewReady && (
            <div className="preview-ready-message">
              {t('watermark.previewReady')}
            </div>
          )}
        </div>
        
        <div className="tips-box">
          <h4>💡 {t('watermark.usageTips')}</h4>
          <ul>
            <li><strong>{t('watermark.pdfTipLabel')}</strong>{t('watermark.pdfTip')}</li>
            <li><strong>{t('watermark.imageTipLabel')}</strong>{t('watermark.imageTip')}</li>
            <li><strong>{t('watermark.paramsTipLabel')}</strong>{t('watermark.paramsTip')}</li>
            <li><strong>{t('watermark.chineseTipLabel')}</strong>{t('watermark.chineseTip')}</li>
            <li><strong>{t('watermark.localTipLabel')}</strong>{t('watermark.localTip')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
