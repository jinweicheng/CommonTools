import { useState } from 'react'
import { Upload, Download, FileText, Code } from 'lucide-react'
import { marked } from 'marked'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './MarkdownToPDF.css'

// 将文本转换为图片（支持中文）
const textToImage = async (text: string, fontSize: number): Promise<string> => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
  const textMetrics = ctx.measureText(text)
  const textWidth = textMetrics.width
  const textHeight = fontSize * 1.5
  
  canvas.width = Math.max(textWidth + 10, 100)
  canvas.height = textHeight
  
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", sans-serif`
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 5, canvas.height / 2)
  
  return canvas.toDataURL('image/png')
}

export default function MarkdownToPDF() {
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setMarkdown(text)
    } catch (err) {
      setError('读取文件失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const convertToPDF = async () => {
    if (!markdown.trim()) {
      setError('请输入Markdown内容')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 将Markdown转换为HTML
      const html = await marked.parse(markdown)

      // 创建PDF文档
      const pdfDoc = await PDFDocument.create()
      let currentPage = pdfDoc.addPage([595, 842]) // A4尺寸
      const { width, height } = currentPage.getSize()

      // 解析HTML并转换为PDF文本
      // 移除HTML标签，提取纯文本
      const textContent = html
        .replace(/<[^>]*>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n\n+/g, '\n')

      // 将文本分行
      const lines = textContent.split('\n').filter(line => line.trim())
      
      let yPosition = height - 50
      const fontSize = 12
      const lineHeight = 18
      const margin = 50
      const maxWidth = width - 2 * margin
      
      // 检查是否包含中文
      const hasChinese = /[\u4e00-\u9fa5]/.test(textContent)
      
      let font
      if (!hasChinese) {
        font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      }

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]
        
        if (yPosition < margin + lineHeight) {
          currentPage = pdfDoc.addPage([595, 842])
          yPosition = height - 50
        }

        if (hasChinese || /[\u4e00-\u9fa5]/.test(line)) {
          // 包含中文：将文本转换为图片
          try {
            // 处理长文本换行
            const maxCharsPerLine = Math.floor(maxWidth / (fontSize * 0.6))
            const textLines = []
            let currentText = ''
            
            for (let i = 0; i < line.length; i++) {
              currentText += line[i]
              if (currentText.length >= maxCharsPerLine || i === line.length - 1) {
                textLines.push(currentText)
                currentText = ''
              }
            }
            
            for (const textLine of textLines) {
              if (yPosition < margin + lineHeight) {
                currentPage = pdfDoc.addPage([595, 842])
                yPosition = height - 50
              }
              
              const imageDataUrl = await textToImage(textLine, fontSize)
              const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer())
              const image = await pdfDoc.embedPng(imageBytes)
              const imageDims = image.scale(1)
              
              currentPage.drawImage(image, {
                x: margin,
                y: yPosition - imageDims.height,
                width: Math.min(imageDims.width, maxWidth),
                height: imageDims.height,
              })
              
              yPosition -= lineHeight
            }
          } catch (err) {
            console.warn('无法绘制中文文本', err)
          }
        } else {
          // 英文文本：使用标准字体
          // 处理长文本换行
          const words = line.split(' ')
          let currentLine = ''
          
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            if (testLine.length * 6 > maxWidth) {
              if (currentLine) {
                if (yPosition < margin + lineHeight) {
                  currentPage = pdfDoc.addPage([595, 842])
                  yPosition = height - 50
                }
                
                currentPage.drawText(currentLine, {
                  x: margin,
                  y: yPosition,
                  size: fontSize,
                  color: rgb(0, 0, 0),
                  font,
                })
                yPosition -= lineHeight
              }
              currentLine = word
            } else {
              currentLine = testLine
            }
          }

          if (currentLine) {
            if (yPosition < margin + lineHeight) {
              currentPage = pdfDoc.addPage([595, 842])
              yPosition = height - 50
            }
            
            currentPage.drawText(currentLine, {
              x: margin,
              y: yPosition,
              size: fontSize,
              color: rgb(0, 0, 0),
              font,
            })
            yPosition -= lineHeight
          }
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, 'markdown-converted.pdf')

      alert('✅ 转换完成！')
    } catch (err) {
      console.error('转换失败:', err)
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="markdown-to-pdf">
      <h2 className="tool-header">Markdown → PDF 转换</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".md,.markdown"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          上传Markdown文件
        </label>
      </div>

      <div className="editor-section">
        <div className="editor-header">
          <Code size={20} />
          <span>Markdown编辑器</span>
        </div>
        <textarea
          className="markdown-editor"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder="在此输入Markdown内容，或上传.md文件..."
          rows={15}
        />
      </div>

      <div className="preview-section">
        <div className="preview-header">
          <FileText size={20} />
          <span>预览</span>
        </div>
        <div 
          className="markdown-preview"
          dangerouslySetInnerHTML={{ 
            __html: markdown 
              ? marked.parse(markdown)
              : '<p style="color: #999;">预览将显示在这里...</p>' 
          }}
        />
      </div>

      <button 
        className="convert-button"
        onClick={convertToPDF}
        disabled={loading || !markdown.trim()}
      >
        <Download size={20} />
        {loading ? '转换中...' : '转换为PDF'}
      </button>
    </div>
  )
}

