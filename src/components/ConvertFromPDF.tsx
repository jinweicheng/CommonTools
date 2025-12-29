import { useState } from 'react'
import { Upload, FileText, Image, FileCode, AlertCircle, CheckCircle } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { saveAs } from 'file-saver'
import './ConvertFromPDF.css'

// 配置 PDF.js worker（使用完整 URL）
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

type ConversionType = 'image' | 'txt' | 'html' | 'word' | 'excel'

export default function ConvertFromPDF() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<ConversionType>('image')

  // PDF 转图片
  const pdfToImage = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    const images: Blob[] = []
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const scale = 2.0 // 高清晰度
      const viewport = page.getViewport({ scale })
      
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
      
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png')
      })
      
      images.push(blob)
    }
    
    if (images.length === 1) {
      // 单页 PDF，直接保存为图片
      saveAs(images[0], file.name.replace('.pdf', '.png'))
      setSuccess(`✅ PDF 已成功转换为图片！`)
    } else {
      // 多页 PDF，保存为多个图片
      for (let i = 0; i < images.length; i++) {
        saveAs(images[i], file.name.replace('.pdf', `_page${i + 1}.png`))
      }
      setSuccess(`✅ PDF 已成功转换为 ${images.length} 张图片！`)
    }
  }

  // PDF 转 TXT
  const pdfToTxt = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    let textContent = ''
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      
      textContent += `\n========== 第 ${pageNum} 页 ==========\n\n`
      
      content.items.forEach((item: any) => {
        if (item.str) {
          textContent += item.str
        }
      })
      
      textContent += '\n'
    }
    
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, file.name.replace('.pdf', '.txt'))
    setSuccess(`✅ PDF 已成功转换为 TXT！\n提取了 ${pdf.numPages} 页文本内容。`)
  }

  // PDF 转 HTML
  const pdfToHtml = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    let htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${file.name}</title>
  <style>
    body {
      font-family: Arial, "Microsoft YaHei", sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      background: #f5f5f5;
    }
    .page {
      background: white;
      padding: 40px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    .page-number {
      text-align: center;
      color: #666;
      font-size: 0.9em;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 40px;
    }
  </style>
</head>
<body>
  <h1>${file.name}</h1>
`
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      
      htmlContent += `  <div class="page">
    <div class="page-number">第 ${pageNum} 页</div>
    <div class="content">\n`
      
      content.items.forEach((item: any) => {
        if (item.str) {
          htmlContent += `      <p>${item.str.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>\n`
        }
      })
      
      htmlContent += `    </div>
  </div>\n`
    }
    
    htmlContent += `</body>
</html>`
    
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    saveAs(blob, file.name.replace('.pdf', '.html'))
    setSuccess(`✅ PDF 已成功转换为 HTML！\n包含 ${pdf.numPages} 页内容。`)
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
          await pdfToImage(file)
          break
        case 'txt':
          await pdfToTxt(file)
          break
        case 'html':
          await pdfToHtml(file)
          break
        case 'word':
          setError('⚠️ PDF 转 Word 请使用专门的 "PDF ↔ Word" 工具\n该工具提供 100% 本地转换，生成标准 .docx 文件！')
          break
        case 'excel':
          setError('⚠️ PDF 转 Excel 仅适用于表格型 PDF\n需要服务器端支持（推荐使用 Tabula 或 Camelot）\n浏览器环境难度：⭐⭐（需要表格识别）')
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
      name: 'PDF 转图片', 
      icon: <Image size={24} />, 
      formats: '.png (高清)', 
      difficulty: '⭐⭐⭐⭐⭐',
      description: '完全支持，高清输出'
    },
    { 
      id: 'txt' as ConversionType, 
      name: 'PDF 转 TXT', 
      icon: <FileText size={24} />, 
      formats: '.txt', 
      difficulty: '⭐⭐⭐⭐',
      description: '提取纯文本内容'
    },
    { 
      id: 'html' as ConversionType, 
      name: 'PDF 转 HTML', 
      icon: <FileCode size={24} />, 
      formats: '.html', 
      difficulty: '⭐⭐⭐',
      description: '基础布局，可浏览器查看'
    },
    { 
      id: 'word' as ConversionType, 
      name: 'PDF 转 Word', 
      icon: <FileText size={24} />, 
      formats: '.docx', 
      difficulty: '⭐⭐⭐⭐ (见专用工具)',
      description: '请使用 PDF ↔ Word 工具'
    },
    { 
      id: 'excel' as ConversionType, 
      name: 'PDF 转 Excel', 
      icon: <FileText size={24} />, 
      formats: '.xlsx', 
      difficulty: '⭐⭐ (表格型PDF)',
      description: '需表格识别'
    },
  ]

  return (
    <div className="convert-from-pdf">
      <h2 className="tool-header">PDF 转化</h2>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>
        </div>
      )}

      {success && (
        <div className="success-message">
          <CheckCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{success}</pre>
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
              <p className="card-description">{type.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '转换中...' : `选择 PDF 文件并转换`}
        </label>
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#0066cc' }} />
          <div>
            <p><strong>💡 PDF 转换难度说明</strong></p>
            <table style={{ width: '100%', marginTop: '10px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #0066cc' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>目标格式</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>真实可控度</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px' }}>图片 (.jpg/.png)</td>
                  <td style={{ padding: '8px' }}>⭐⭐⭐⭐⭐</td>
                  <td style={{ padding: '8px' }}>✅ 完美支持，100% 还原</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}>TXT</td>
                  <td style={{ padding: '8px' }}>⭐⭐⭐⭐</td>
                  <td style={{ padding: '8px' }}>✅ 提取文本，无格式</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}>HTML</td>
                  <td style={{ padding: '8px' }}>⭐⭐⭐</td>
                  <td style={{ padding: '8px' }}>✅ 基础布局</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}>Word (.docx)</td>
                  <td style={{ padding: '8px' }}>⭐⭐⭐⭐</td>
                  <td style={{ padding: '8px' }}>✅ 见专用工具（100% 本地）</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}>Excel (表格型)</td>
                  <td style={{ padding: '8px' }}>⭐⭐</td>
                  <td style={{ padding: '8px' }}>⚠️ 需服务器（表格识别）</td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: '12px', fontSize: '0.9em' }}>
              <strong>建议：</strong>如需高质量转换 Word/Excel，推荐使用专业工具（Adobe Acrobat、Aspose、pdf2docx）
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

