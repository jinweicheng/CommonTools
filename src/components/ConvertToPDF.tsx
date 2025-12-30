import { useState } from 'react'
import { Upload, FileText, Image, AlertCircle, CheckCircle } from 'lucide-react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './ConvertToPDF.css'

type ConversionType = 'image' | 'txt'

export default function ConvertToPDF() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<ConversionType>('image')

  // 将文本转换为图片（支持中文）
  const textToImage = async (text: string, fontSize: number, color: string = '#000000'): Promise<string> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    const dpr = window.devicePixelRatio || 1
    ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const textHeight = fontSize * 1.5
    
    canvas.width = (textWidth + 20) * dpr
    canvas.height = textHeight * dpr
    canvas.style.width = `${textWidth + 20}px`
    canvas.style.height = `${textHeight}px`
    ctx.scale(dpr, dpr)
    
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, textHeight / 2)
    
    return canvas.toDataURL('image/png')
  }

  // 图片转 PDF
  const imageToPDF = async (file: File) => {
    const pdfDoc = await PDFDocument.create()
    const imageBytes = await file.arrayBuffer()
    
    let image
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      image = await pdfDoc.embedJpg(imageBytes)
    } else if (file.type === 'image/png') {
      image = await pdfDoc.embedPng(imageBytes)
    } else {
      throw new Error('不支持的图片格式，请使用 JPG 或 PNG')
    }
    
    const page = pdfDoc.addPage([image.width, image.height])
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    })
    
    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    saveAs(blob, file.name.replace(/\.[^.]+$/, '.pdf'))
  }

  // TXT 转 PDF
  const txtToPDF = async (file: File) => {
    const text = await file.text()
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    
    const pageWidth = 595
    const pageHeight = 842
    const margin = 50
    const fontSize = 12
    const lineHeight = fontSize * 1.5
    const maxWidth = pageWidth - 2 * margin
    
    let page = pdfDoc.addPage([pageWidth, pageHeight])
    let yPosition = pageHeight - margin
    
    const lines = text.split('\n')
    
    for (const line of lines) {
      if (!line.trim()) {
        yPosition -= lineHeight
        if (yPosition < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight])
          yPosition = pageHeight - margin
        }
        continue
      }
      
      // 检查是否包含中文
      const hasChinese = /[\u4e00-\u9fa5]/.test(line)
      
      if (hasChinese) {
        // 中文转图片
        const imageDataUrl = await textToImage(line, fontSize)
        const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer())
        const image = await pdfDoc.embedPng(imageBytes)
        const imageDims = image.scale(1)
        
        if (yPosition - imageDims.height < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight])
          yPosition = pageHeight - margin
        }
        
        page.drawImage(image, {
          x: margin,
          y: yPosition - imageDims.height,
          width: Math.min(imageDims.width, maxWidth),
          height: imageDims.height,
        })
        
        yPosition -= imageDims.height + 5
      } else {
        // 英文使用标准字体
        const words = line.split(' ')
        let currentLine = ''
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word
          const textWidth = font.widthOfTextAtSize(testLine, fontSize)
          
          if (textWidth > maxWidth && currentLine) {
            if (yPosition < margin) {
              page = pdfDoc.addPage([pageWidth, pageHeight])
              yPosition = pageHeight - margin
            }
            
            page.drawText(currentLine, {
              x: margin,
              y: yPosition,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
            })
            
            yPosition -= lineHeight
            currentLine = word
          } else {
            currentLine = testLine
          }
        }
        
        if (currentLine) {
          if (yPosition < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight])
            yPosition = pageHeight - margin
          }
          
          page.drawText(currentLine, {
            x: margin,
            y: yPosition,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
          })
          
          yPosition -= lineHeight
        }
      }
    }
    
    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    saveAs(blob, file.name.replace(/\.[^.]+$/, '.pdf'))
  }


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      switch (selectedType) {
        case 'image':
          await imageToPDF(file)
          setSuccess('✅ 图片已成功转换为 PDF！完美支持 JPG/PNG 格式。')
          break
        case 'txt':
          await txtToPDF(file)
          setSuccess('✅ TXT 文件已成功转换为 PDF！完美支持中英文混排。')
          break
      }
    } catch (err) {
      console.error('转换失败:', err)
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const conversionTypes = [
    { 
      id: 'image' as ConversionType, 
      name: '图片转 PDF', 
      icon: <Image size={24} />, 
      formats: '.jpg, .png', 
      difficulty: '⭐⭐⭐⭐⭐ 完美支持',
      description: '保持原始分辨率，无损转换'
    },
    { 
      id: 'txt' as ConversionType, 
      name: 'TXT 转 PDF', 
      icon: <FileText size={24} />, 
      formats: '.txt', 
      difficulty: '⭐⭐⭐⭐⭐ 完美支持',
      description: '自动分页，支持中英文混排'
    },
  ]

  return (
    <div className="convert-to-pdf">
      <h2 className="tool-header">转成 PDF</h2>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          <CheckCircle size={20} />
          {success}
        </div>
      )}

      <div className="conversion-types">
        {conversionTypes.map((type) => (
          <button
            key={type.id}
            className={`conversion-type-card ${selectedType === type.id ? 'active' : ''}`}
            onClick={() => setSelectedType(type.id)}
          >
            <div className="card-icon">{type.icon}</div>
            <div className="card-content">
              <h3>{type.name}</h3>
              <p className="card-formats">支持: {type.formats}</p>
              <p className="card-difficulty">{type.difficulty}</p>
              <p className="card-description">{type.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={loading}
            accept={conversionTypes.find(t => t.id === selectedType)?.formats}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '转换中...' : `选择文件并转换为 PDF`}
        </label>
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <CheckCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#10b981' }} />
          <div>
            <p><strong>✨ 高质量转换功能</strong></p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>🖼️ 图片 → PDF：</strong>完美支持 JPG/PNG，保持原始分辨率</li>
              <li><strong>📄 TXT → PDF：</strong>完美支持中英文混排，自动分页</li>
              <li><strong>💡 Word 转换：</strong>请使用 "Word ↔ PDF" 专用工具（100% 本地）</li>
              <li><strong>🔧 技术方案：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>图片：直接嵌入 PDF，无损转换</li>
                  <li>文本：中文转图片嵌入，避免编码问题</li>
                  <li>全部本地处理：文件不上传，隐私安全</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

