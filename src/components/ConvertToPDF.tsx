import { useState } from 'react'
import { Upload, FileText, Image, FileSpreadsheet, FileCode, AlertCircle, CheckCircle } from 'lucide-react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './ConvertToPDF.css'

type ConversionType = 'image' | 'txt' | 'html' | 'csv' | 'word' | 'excel' | 'ppt'

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

  // CSV 转 PDF
  const csvToPDF = async (file: File) => {
    const text = await file.text()
    const lines = text.split('\n').map(line => line.split(','))
    
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    
    const pageWidth = 842 // A4 横向
    const pageHeight = 595
    const margin = 40
    const fontSize = 10
    const rowHeight = 20
    
    let page = pdfDoc.addPage([pageWidth, pageHeight])
    let yPosition = pageHeight - margin
    
    // 计算列宽
    const numCols = lines[0]?.length || 1
    const colWidth = (pageWidth - 2 * margin) / numCols
    
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i]
      
      if (yPosition - rowHeight < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        yPosition = pageHeight - margin
      }
      
      // 绘制表格线
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: pageWidth - margin, y: yPosition },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })
      
      // 绘制单元格内容
      for (let j = 0; j < row.length; j++) {
        const cell = row[j].trim()
        const xPosition = margin + j * colWidth + 5
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(cell)
        
        if (hasChinese && cell) {
          // 中文转图片
          const imageDataUrl = await textToImage(cell, fontSize - 2)
          const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer())
          const image = await pdfDoc.embedPng(imageBytes)
          const imageDims = image.scale(0.8)
          
          page.drawImage(image, {
            x: xPosition,
            y: yPosition - rowHeight + 5,
            width: Math.min(imageDims.width, colWidth - 10),
            height: Math.min(imageDims.height, rowHeight - 10),
          })
        } else if (cell) {
          page.drawText(cell.substring(0, 30), {
            x: xPosition,
            y: yPosition - rowHeight + 8,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
          })
        }
        
        // 绘制垂直线
        page.drawLine({
          start: { x: margin + j * colWidth, y: yPosition },
          end: { x: margin + j * colWidth, y: yPosition - rowHeight },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        })
      }
      
      // 最后一条垂直线
      page.drawLine({
        start: { x: pageWidth - margin, y: yPosition },
        end: { x: pageWidth - margin, y: yPosition - rowHeight },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })
      
      yPosition -= rowHeight
    }
    
    // 底部线
    page.drawLine({
      start: { x: margin, y: yPosition + rowHeight },
      end: { x: pageWidth - margin, y: yPosition + rowHeight },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    })
    
    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    saveAs(blob, file.name.replace(/\.[^.]+$/, '.pdf'))
  }

  // HTML 转 PDF（基础版）
  const htmlToPDF = async (file: File) => {
    const htmlText = await file.text()
    
    // 移除 HTML 标签，提取纯文本
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlText
    const text = tempDiv.textContent || tempDiv.innerText || ''
    
    // 使用 TXT 转 PDF 的逻辑
    const textBlob = new Blob([text], { type: 'text/plain' })
    const textFile = new File([textBlob], file.name, { type: 'text/plain' })
    await txtToPDF(textFile)
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
          setSuccess('✅ 图片已成功转换为 PDF！')
          break
        case 'txt':
          await txtToPDF(file)
          setSuccess('✅ TXT 文件已成功转换为 PDF！')
          break
        case 'csv':
          await csvToPDF(file)
          setSuccess('✅ CSV 文件已成功转换为 PDF（表格格式）！')
          break
        case 'html':
          await htmlToPDF(file)
          setSuccess('✅ HTML 文件已成功转换为 PDF！')
          break
        case 'word':
          setError('⚠️ Word → PDF 转换请使用专门的 "PDF ↔ Word" 工具\n该工具提供 100% 本地转换，支持中文！')
          break
        case 'excel':
        case 'ppt':
          setError('⚠️ 该格式需要服务器端支持（LibreOffice/Aspose），浏览器环境暂不支持')
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
    { id: 'image' as ConversionType, name: '图片转 PDF', icon: <Image size={24} />, formats: '.jpg, .png', difficulty: '⭐⭐⭐⭐⭐' },
    { id: 'txt' as ConversionType, name: 'TXT 转 PDF', icon: <FileText size={24} />, formats: '.txt', difficulty: '⭐⭐⭐⭐⭐' },
    { id: 'csv' as ConversionType, name: 'CSV 转 PDF', icon: <FileSpreadsheet size={24} />, formats: '.csv', difficulty: '⭐⭐⭐⭐' },
    { id: 'html' as ConversionType, name: 'HTML 转 PDF', icon: <FileCode size={24} />, formats: '.html', difficulty: '⭐⭐⭐' },
    { id: 'word' as ConversionType, name: 'Word 转 PDF', icon: <FileText size={24} />, formats: '.doc, .docx', difficulty: '⭐⭐⭐⭐ (见专用工具)' },
    { id: 'excel' as ConversionType, name: 'Excel 转 PDF', icon: <FileSpreadsheet size={24} />, formats: '.xls, .xlsx', difficulty: '⭐⭐ (需服务器)' },
    { id: 'ppt' as ConversionType, name: 'PPT 转 PDF', icon: <FileText size={24} />, formats: '.ppt, .pptx', difficulty: '⭐⭐ (需服务器)' },
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
              <p className="card-formats">{type.formats}</p>
              <p className="card-difficulty">难度: {type.difficulty}</p>
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
          <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#0066cc' }} />
          <div>
            <p><strong>💡 浏览器环境支持情况</strong></p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>✅ 完全支持：</strong>图片、TXT、CSV、HTML（基础）</li>
              <li><strong>📄 Word 转换：</strong>请使用专门的 "PDF ↔ Word" 工具（100% 本地）</li>
              <li><strong>⚠️ 需服务器：</strong>Excel、PPT（推荐使用 LibreOffice/Aspose）</li>
              <li><strong>🔧 技术方案：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>图片：直接嵌入 PDF</li>
                  <li>文本：支持中文（转换为图片）</li>
                  <li>CSV：生成表格格式 PDF</li>
                  <li>HTML：提取文本内容</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

