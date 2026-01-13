import { useState, useRef } from 'react'
import { Upload, Type, Sliders, FileImage, File } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { useI18n } from '../i18n/I18nContext'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watermarkText, setWatermarkText] = useState(() => t('watermark.defaultWatermarkText'))
  const [opacity, setOpacity] = useState(0.3)
  const [fontSize, setFontSize] = useState(24)
  const [angle, setAngle] = useState(-45)
  const [fileType, setFileType] = useState<FileType>('unknown')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 处理PDF水印
  const handlePDFWatermark = async (file: File) => {
    try {
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
      
      // 将 data URL 转换为 Uint8Array（不使用 fetch，避免网络错误）
      const base64Data = watermarkDataUrl.split(',')[1] // 移除 data:image/png;base64, 前缀
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
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('.pdf', '-watermarked.pdf'))
    } catch (err) {
      console.error('处理PDF水印失败', err)
      
      let errorMessage = t('watermark.processPdfFailed')
      if (err instanceof Error) {
        const errorMsg = err.message.toLowerCase()
        if (errorMsg.includes('invalid') || errorMsg.includes('corrupt')) {
          errorMessage = t('watermark.pdfInvalidOrCorrupt')
        } else if (errorMsg.includes('password') || errorMsg.includes('encrypted')) {
          errorMessage = t('watermark.pdfEncrypted')
        } else {
          errorMessage = t('watermark.processPdfFailedWithMessage').replace('{message}', err.message)
        }
      }
      throw new Error(errorMessage)
    }
  }

  // 处理图片水印
  const handleImageWatermark = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
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
            
            // 转换为blob并下载
            canvas.toBlob((blob) => {
              if (blob) {
                const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
                const newName = file.name.replace(`.${ext}`, `-watermarked.${ext}`)
                saveAs(blob, newName)
                resolve()
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

  // 主文件上传处理
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const type = detectFileType(file)
    setFileType(type)
    
    if (type === 'unknown') {
      setError(t('watermark.unsupportedFormat'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 生成预览
      if (type === 'image') {
        const reader = new FileReader()
        reader.onload = (e) => setPreviewUrl(e.target?.result as string)
        reader.readAsDataURL(file)
      }

      // 根据文件类型选择处理方法
      switch (type) {
        case 'pdf':
          await handlePDFWatermark(file)
          break
        case 'image':
          await handleImageWatermark(file)
          break
      }

      alert(t('watermark.watermarkAddedSuccess'))
    } catch (err) {
      console.error('添加水印时出错:', err)
      setError(t('watermark.processFailed') + (err instanceof Error ? err.message : t('common.unknownError')))
    } finally {
      setLoading(false)
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
            onChange={(e) => setWatermarkText(e.target.value)}
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
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
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
            onChange={(e) => setFontSize(parseInt(e.target.value))}
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
            onChange={(e) => setAngle(parseInt(e.target.value))}
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
            disabled={loading}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? t('watermark.processing') : t('watermark.selectFileAndAddWatermark')}
        </label>
      </div>

      <div className="preview-section">
        <div className="preview-box">
          <div className="preview-label">{t('watermark.previewLabel')}</div>
          <div className="watermark-preview">
            {previewUrl && fileType === 'image' ? (
              <div className="image-preview-container">
                <img src={previewUrl} alt={t('watermark.previewAlt')} className="preview-image" />
                <canvas ref={canvasRef} className="preview-canvas" />
              </div>
            ) : (
              <div
                className="preview-text"
                style={{
                  fontSize: `${fontSize * 0.3}px`,
                  opacity: opacity,
                  transform: `rotate(${angle}deg)`,
                }}
              >
                {watermarkText || t('watermark.defaultWatermarkText')}
              </div>
            )}
          </div>
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

