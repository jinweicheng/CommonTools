import { useState } from 'react'
import { Upload, FileText, Image, AlertCircle, CheckCircle } from 'lucide-react'
// import { PDFDocument } from 'pdf-lib' // 暂未使用
import * as pdfjsLib from 'pdfjs-dist'
import { saveAs } from 'file-saver'
import './ConvertFromPDF.css'

// 配置 PDF.js worker（使用完整 URL）
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

type ConversionType = 'image' | 'txt'

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
      difficulty: '⭐⭐⭐⭐⭐ 完美支持',
      description: '高清 PNG 输出，2倍分辨率'
    },
    { 
      id: 'txt' as ConversionType, 
      name: 'PDF 转 TXT', 
      icon: <FileText size={24} />, 
      formats: '.txt', 
      difficulty: '⭐⭐⭐⭐⭐ 完美支持',
      description: '准确提取文本，保留页面结构'
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
              <p className="card-formats">输出: {type.formats}</p>
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
          <CheckCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#10b981' }} />
          <div>
            <p><strong>✨ 高质量转换功能</strong></p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>🖼️ PDF → 图片：</strong>完美支持，高清 PNG（2x 分辨率）</li>
              <li><strong>📄 PDF → TXT：</strong>完美支持，准确提取文本内容</li>
              <li><strong>💡 PDF → Word：</strong>请使用 "Word ↔ PDF" 专用工具（100% 本地）</li>
              <li><strong>🔧 技术方案：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>图片：PDF.js 渲染，Canvas 导出</li>
                  <li>文本：PDF.js 提取，保留页面结构</li>
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

