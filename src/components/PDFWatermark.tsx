import { useState, useRef } from 'react'
import { Upload, Type, Sliders, FileImage, FileText, File } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import mammoth from 'mammoth'
import './PDFWatermark.css'

// 文件类型枚举
type FileType = 'pdf' | 'image' | 'word' | 'unknown'

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
  if (['doc', 'docx'].includes(ext)) return 'word'
  
  return 'unknown'
}

export default function PDFWatermark() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watermarkText, setWatermarkText] = useState('水印')
  const [opacity, setOpacity] = useState(0.3)
  const [fontSize, setFontSize] = useState(24)
  const [angle, setAngle] = useState(-45)
  const [fileType, setFileType] = useState<FileType>('unknown')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 处理PDF水印
  const handlePDFWatermark = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdfDoc = await PDFDocument.load(arrayBuffer)
    const pages = pdfDoc.getPages()

    // 检查是否包含中文
    const hasChinese = /[\u4e00-\u9fa5]/.test(watermarkText)
    
    let watermarkImage = null
    let imageDims = null
    
    if (hasChinese) {
      // 中文文本：转换为图片
      const grayValue = Math.round(0.5 * 255)
      const hexColor = `#${grayValue.toString(16).padStart(2, '0')}${grayValue.toString(16).padStart(2, '0')}${grayValue.toString(16).padStart(2, '0')}`
      const watermarkDataUrl = await textToImage(watermarkText, fontSize, hexColor)
      const watermarkBytes = await fetch(watermarkDataUrl).then(res => res.arrayBuffer())
      watermarkImage = await pdfDoc.embedPng(watermarkBytes)
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
                reject(new Error('无法生成图片'))
              }
            }, file.type || 'image/png')
          }
          
          img.onerror = () => reject(new Error('图片加载失败'))
          img.src = e.target?.result as string
        } catch (err) {
          reject(err)
        }
      }
      
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
  }

  // 处理Word水印（通过 Word → PDF → 添加水印）
  const handleWordWatermark = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    
    // 读取Word文档内容
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = result.value
    
    // 将文本分段
    const paragraphs = text.split('\n').filter(p => p.trim())
    
    // 创建带内容的新文档
    const children: Paragraph[] = []
    
    // 添加所有内容段落
    paragraphs.forEach(para => {
      children.push(
        new Paragraph({
          children: [
            new TextRun(para),
          ],
          spacing: { after: 200 }
        })
      )
    })
    
    // 每隔5段添加水印文本
    for (let i = 4; i < children.length; i += 5) {
      children.splice(i + 1, 0, 
        new Paragraph({
          children: [
            new TextRun({
              text: `【${watermarkText}】`,
              color: 'CCCCCC',
              size: fontSize,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 100 }
        })
      )
    }
    
    // 在开头也添加水印
    children.unshift(
      new Paragraph({
        children: [
          new TextRun({
            text: `━━━━ ${watermarkText} ━━━━`,
            color: '999999',
            size: fontSize + 8,
            bold: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 400 }
      })
    )
    
    // 在末尾也添加水印
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `━━━━ ${watermarkText} ━━━━`,
            color: '999999',
            size: fontSize + 8,
            bold: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 }
      })
    )
    
    // 创建新的Word文档
    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    })
    
    // 生成并保存文档
    const blob = await Packer.toBlob(doc)
    const newName = file.name.replace(/\.(docx?|DOCX?)$/, '-watermarked.docx')
    saveAs(blob, newName)
  }

  // 主文件上传处理
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const type = detectFileType(file)
    setFileType(type)
    
    if (type === 'unknown') {
      setError('不支持的文件格式。请上传 PDF、图片（JPG/PNG/BMP/WEBP）或 Word 文档（DOCX）')
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
        case 'word':
          await handleWordWatermark(file)
          break
      }

      alert('✅ 水印添加成功！')
    } catch (err) {
      console.error('添加水印时出错:', err)
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 获取文件类型图标
  const getFileIcon = () => {
    switch (fileType) {
      case 'pdf': return <File size={20} className="file-icon-pdf" />
      case 'image': return <FileImage size={20} className="file-icon-image" />
      case 'word': return <FileText size={20} className="file-icon-word" />
      default: return <Upload size={20} />
    }
  }

  // 获取支持的文件类型文本
  const getSupportedFormats = () => {
    return 'PDF、图片（JPG/PNG/BMP/WEBP/GIF）、Word（DOCX）'
  }

  return (
    <div className="pdf-watermark">
      <h2 className="tool-header">📝 多格式水印工具</h2>
      
      <div className="format-info">
        <div className="supported-formats">
          <strong>支持格式：</strong> {getSupportedFormats()}
        </div>
        {fileType !== 'unknown' && (
          <div className="current-file-type">
            {getFileIcon()}
            <span>当前文件类型: {fileType.toUpperCase()}</span>
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
            水印文本
          </label>
          <input
            type="text"
            className="setting-input"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="输入水印文本"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            <Sliders size={20} />
            透明度: {Math.round(opacity * 100)}%
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
            字体大小: {fontSize}px
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
            旋转角度: {angle}°
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
            accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp,.gif,.doc,.docx"
            onChange={handleFileUpload}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : '选择文件并添加水印'}
        </label>
      </div>

      <div className="preview-section">
        <div className="preview-box">
          <div className="preview-label">水印效果预览：</div>
          <div className="watermark-preview">
            {previewUrl && fileType === 'image' ? (
              <div className="image-preview-container">
                <img src={previewUrl} alt="预览" className="preview-image" />
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
                {watermarkText || '水印'}
              </div>
            )}
          </div>
        </div>
        
        <div className="tips-box">
          <h4>💡 使用提示</h4>
          <ul>
            <li><strong>PDF：</strong>为每一页添加平铺水印，支持中英文</li>
            <li><strong>图片：</strong>在图片上添加透明水印，支持JPG/PNG等格式</li>
            <li><strong>Word：</strong>将水印嵌入文档内容，生成新的DOCX文件</li>
            <li>调整透明度、字体大小和角度可获得最佳效果</li>
            <li>中文水印会自动转换为图片以确保正确显示</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

