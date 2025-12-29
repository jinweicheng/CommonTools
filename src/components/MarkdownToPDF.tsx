import { useState } from 'react'
import { Upload, Download, FileText, Code } from 'lucide-react'
import { marked } from 'marked'
import { PDFDocument, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './MarkdownToPDF.css'

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
      const html = marked.parse(markdown)

      // 创建PDF文档
      const pdfDoc = await PDFDocument.create()
      const page = pdfDoc.addPage([595, 842]) // A4尺寸
      const { width, height } = page.getSize()

      // 解析HTML并转换为PDF文本
      // 移除HTML标签，提取纯文本
      const textContent = html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')

      // 将文本分行
      const lines = textContent.split('\n').filter(line => line.trim())
      
      let yPosition = height - 50
      const fontSize = 12
      const lineHeight = 16
      const margin = 50

      for (const line of lines) {
        if (yPosition < margin) {
          const newPage = pdfDoc.addPage([595, 842])
          yPosition = height - 50
        }

        // 处理长文本换行
        const words = line.split(' ')
        let currentLine = ''
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word
          if (testLine.length * 6 > width - 2 * margin) {
            if (currentLine) {
              page.drawText(currentLine, {
                x: margin,
                y: yPosition,
                size: fontSize,
                color: rgb(0, 0, 0),
              })
              yPosition -= lineHeight
              if (yPosition < margin) {
                const newPage = pdfDoc.addPage([595, 842])
                yPosition = height - 50
              }
            }
            currentLine = word
          } else {
            currentLine = testLine
          }
        }

        if (currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y: yPosition,
            size: fontSize,
            color: rgb(0, 0, 0),
          })
          yPosition -= lineHeight
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, 'markdown-converted.pdf')

      alert('转换完成！')
    } catch (err) {
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

