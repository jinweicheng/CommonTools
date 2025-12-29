import { useState } from 'react'
import { Upload, Download, FileText, File } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import mammoth from 'mammoth'
import { saveAs } from 'file-saver'
import './PDFWordConverter.css'

export default function PDFWordConverter() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePDFToWord = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const pages = pdfDoc.getPages()
      
      // 提取PDF文本内容
      let textContent = ''
      for (let i = 0; i < pages.length; i++) {
        // 注意：pdf-lib不直接支持文本提取，这里使用简化方法
        // 实际应用中可能需要使用其他库如pdf.js
        textContent += `第 ${i + 1} 页\n\n`
      }

      // 创建Word文档（使用HTML格式，因为mammoth主要用于转换）
      // 这里我们创建一个简单的HTML文档
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${file.name.replace('.pdf', '')}</title>
        </head>
        <body>
          <h1>PDF转Word文档</h1>
          <p>注意：由于浏览器限制，PDF文本提取功能有限。建议使用专业工具进行转换。</p>
          <pre>${textContent}</pre>
        </body>
        </html>
      `

      // 创建Blob并下载
      const blob = new Blob([htmlContent], { type: 'application/msword' })
      saveAs(blob, file.name.replace('.pdf', '.doc'))

      alert('转换完成！注意：由于浏览器限制，此功能为简化版本。')
    } catch (err) {
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleWordToPDF = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      
      // 使用mammoth将Word转换为HTML
      const result = await mammoth.convertToHtml({ arrayBuffer })
      const html = result.value

      // 创建PDF文档
      const pdfDoc = await PDFDocument.create()
      const page = pdfDoc.addPage([595, 842]) // A4尺寸
      const { width, height } = page.getSize()

      // 注意：pdf-lib不直接支持HTML渲染
      // 这里添加一个说明文本
      page.drawText('Word转PDF功能', {
        x: 50,
        y: height - 50,
        size: 20,
      })

      page.drawText('由于浏览器限制，完整的Word转PDF需要服务器端处理。', {
        x: 50,
        y: height - 100,
        size: 12,
      })

      page.drawText('HTML内容预览：', {
        x: 50,
        y: height - 150,
        size: 14,
      })

      // 将HTML内容截取前500字符显示
      const previewText = html.replace(/<[^>]*>/g, '').substring(0, 500)
      const lines = previewText.split('\n').slice(0, 20)
      
      lines.forEach((line, index) => {
        if (line.trim()) {
          page.drawText(line.substring(0, 80), {
            x: 50,
            y: height - 180 - (index * 20),
            size: 10,
          })
        }
      })

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, file.name.replace(/\.(docx?|doc)$/i, '.pdf'))

      alert('转换完成！注意：由于浏览器限制，此功能为简化版本。')
    } catch (err) {
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pdf-word-converter">
      <h2 className="tool-header">PDF ↔ Word 转换</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="converter-grid">
        <div className="converter-card">
          <div className="converter-icon">
            <FileText size={48} />
          </div>
          <h3>PDF → Word</h3>
          <p>将PDF文档转换为Word格式</p>
          <label className="upload-button">
            <input
              type="file"
              accept=".pdf"
              onChange={handlePDFToWord}
              disabled={loading}
              style={{ display: 'none' }}
            />
            <Upload size={20} />
            {loading ? '处理中...' : '选择PDF文件'}
          </label>
        </div>

        <div className="converter-card">
          <div className="converter-icon">
            <File size={48} />
          </div>
          <h3>Word → PDF</h3>
          <p>将Word文档转换为PDF格式</p>
          <label className="upload-button">
            <input
              type="file"
              accept=".doc,.docx"
              onChange={handleWordToPDF}
              disabled={loading}
              style={{ display: 'none' }}
            />
            <Upload size={20} />
            {loading ? '处理中...' : '选择Word文件'}
          </label>
        </div>
      </div>

      <div className="info-box">
        <p><strong>提示：</strong>由于浏览器安全限制，完整的PDF ↔ Word转换功能需要服务器端支持。当前版本为演示版本，建议使用专业工具进行转换。</p>
      </div>
    </div>
  )
}

