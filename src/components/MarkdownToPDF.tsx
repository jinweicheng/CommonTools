import { useState, useRef } from 'react'
import { Upload, Download, FileText, Code, AlertCircle, CheckCircle, Settings } from 'lucide-react'
import { marked } from 'marked'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import './MarkdownToPDF.css'

// PDF 导出配置
interface PDFConfig {
  format: 'a4' | 'letter'
  orientation: 'portrait' | 'landscape'
  quality: 'standard' | 'high' | 'ultra'
  margins: number
}

const DEFAULT_PDF_CONFIG: PDFConfig = {
  format: 'a4',
  orientation: 'portrait',
  quality: 'high',
  margins: 40
}

// PDF 页面尺寸 (mm)
const PAGE_SIZES = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 }
}

// 质量配置
const QUALITY_SETTINGS = {
  standard: { scale: 2, imageQuality: 0.85 },
  high: { scale: 3, imageQuality: 0.92 },
  ultra: { scale: 4, imageQuality: 0.95 }
}

// 配置 marked 渲染器以支持更好的样式
marked.setOptions({
  breaks: true,
  gfm: true,
})

export default function MarkdownToPDF() {
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<PDFConfig>(DEFAULT_PDF_CONFIG)
  const [showSettings, setShowSettings] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setMarkdown(text)
      setError(null)
      setSuccess('✅ 文件加载成功！')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('读取文件失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const convertToPDF = async () => {
    if (!markdown.trim()) {
      setError('请输入Markdown内容')
      return
    }

    if (!previewRef.current) {
      setError('预览区域未就绪')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const previewElement = previewRef.current
      const qualitySettings = QUALITY_SETTINGS[config.quality]
      const pageSize = PAGE_SIZES[config.format]
      
      // 临时创建一个用于渲染的容器，确保样式完整
      const renderContainer = document.createElement('div')
      renderContainer.style.position = 'absolute'
      renderContainer.style.left = '-9999px'
      renderContainer.style.top = '0'
      renderContainer.style.width = `${pageSize.width * 3.78}px` // mm to px (1mm ≈ 3.78px at 96 DPI)
      renderContainer.style.padding = `${config.margins}px`
      renderContainer.style.backgroundColor = '#ffffff'
      renderContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei", "SimHei"'
      renderContainer.style.fontSize = '14px'
      renderContainer.style.lineHeight = '1.6'
      renderContainer.style.color = '#333'
      renderContainer.innerHTML = previewElement.innerHTML
      
      document.body.appendChild(renderContainer)

      // 使用 html2canvas 将内容转换为 canvas
      const canvas = await html2canvas(renderContainer, {
        scale: qualitySettings.scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: renderContainer.scrollWidth,
        windowHeight: renderContainer.scrollHeight,
        onclone: (clonedDoc) => {
          const clonedContainer = clonedDoc.querySelector('div') as HTMLElement
          if (clonedContainer) {
            // 确保代码块样式正确
            clonedContainer.querySelectorAll('pre').forEach((pre) => {
              pre.style.backgroundColor = '#f6f8fa'
              pre.style.padding = '16px'
              pre.style.borderRadius = '6px'
              pre.style.overflow = 'auto'
            })
            clonedContainer.querySelectorAll('code').forEach((code) => {
              if (code.parentElement?.tagName !== 'PRE') {
                code.style.backgroundColor = '#f6f8fa'
                code.style.padding = '2px 6px'
                code.style.borderRadius = '3px'
                code.style.fontFamily = 'Consolas, Monaco, "Courier New", monospace'
                code.style.fontSize = '0.9em'
              }
            })
            // 确保标题样式
            clonedContainer.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
              const el = heading as HTMLElement
              el.style.setProperty('font-weight', '600')
              el.style.setProperty('margin-top', '24px')
              el.style.setProperty('margin-bottom', '16px')
            })
            // 确保列表样式
            clonedContainer.querySelectorAll('ul, ol').forEach((list) => {
              const el = list as HTMLElement
              el.style.setProperty('padding-left', '2em')
              el.style.setProperty('margin-bottom', '16px')
            })
            // 确保段落样式
            clonedContainer.querySelectorAll('p').forEach((p) => {
              const el = p as HTMLElement
              el.style.setProperty('margin-bottom', '16px')
            })
            // 确保引用样式
            clonedContainer.querySelectorAll('blockquote').forEach((quote) => {
              const el = quote as HTMLElement
              el.style.setProperty('border-left', '4px solid #ddd')
              el.style.setProperty('padding-left', '16px')
              el.style.setProperty('color', '#666')
              el.style.setProperty('margin-left', '0')
            })
          }
        }
      })

      // 移除临时容器
      document.body.removeChild(renderContainer)

      // 创建 PDF
      const imgWidth = config.orientation === 'portrait' ? pageSize.width : pageSize.height
      const imgHeight = config.orientation === 'portrait' ? pageSize.height : pageSize.width
      
      const pdf = new jsPDF({
        orientation: config.orientation,
        unit: 'mm',
        format: config.format,
        compress: true
      })

      // 计算图片在 PDF 中的尺寸
      const contentWidth = imgWidth - (config.margins * 2 / 3.78)
      const contentHeight = (canvas.height * contentWidth) / canvas.width
      const pageHeight = imgHeight - (config.margins * 2 / 3.78)

      // 分页处理
      let heightLeft = contentHeight
      let position = config.margins / 3.78

      // 添加第一页
      const imgData = canvas.toDataURL('image/jpeg', qualitySettings.imageQuality)
      pdf.addImage(
        imgData,
        'JPEG',
        config.margins / 3.78,
        position,
        contentWidth,
        contentHeight,
        undefined,
        'FAST'
      )
      
      heightLeft -= pageHeight

      // 添加后续页面
      while (heightLeft > 0) {
        position = heightLeft - contentHeight + (config.margins / 3.78)
        pdf.addPage()
        pdf.addImage(
          imgData,
          'JPEG',
          config.margins / 3.78,
          position,
          contentWidth,
          contentHeight,
          undefined,
          'FAST'
        )
        heightLeft -= pageHeight
      }

      // 添加元数据
      pdf.setProperties({
        title: 'Markdown转PDF',
        subject: 'Markdown文档',
        author: 'CommonTools',
        keywords: 'markdown, pdf',
        creator: 'CommonTools PDF Converter'
      })

      // 保存 PDF
      pdf.save('markdown-converted.pdf')

      setSuccess(`✅ 转换完成！PDF 已下载（${config.quality === 'ultra' ? '超高' : config.quality === 'high' ? '高' : '标准'}质量）`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      console.error('转换失败:', err)
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="markdown-to-pdf">
      <div className="tool-header">
        <h2>Markdown → PDF 专业转换</h2>
        <p className="tool-description">
          保持格式的高质量转换 • 完美还原预览效果 • 支持中英文混合排版
        </p>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <CheckCircle size={20} />
          <span>{success}</span>
        </div>
      )}

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".md,.markdown,.txt"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          上传Markdown文件
        </label>
        
        <button 
          className="settings-button"
          onClick={() => setShowSettings(!showSettings)}
          title="PDF 导出设置"
        >
          <Settings size={20} />
          导出设置
        </button>
      </div>

      {showSettings && (
        <div className="pdf-settings-panel">
          <h3>PDF 导出设置</h3>
          
          <div className="settings-grid">
            <div className="setting-group">
              <label>页面格式</label>
              <select 
                value={config.format} 
                onChange={(e) => setConfig({ ...config, format: e.target.value as 'a4' | 'letter' })}
              >
                <option value="a4">A4 (210×297mm)</option>
                <option value="letter">Letter (216×279mm)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>页面方向</label>
              <select 
                value={config.orientation} 
                onChange={(e) => setConfig({ ...config, orientation: e.target.value as 'portrait' | 'landscape' })}
              >
                <option value="portrait">纵向 (Portrait)</option>
                <option value="landscape">横向 (Landscape)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>导出质量</label>
              <select 
                value={config.quality} 
                onChange={(e) => setConfig({ ...config, quality: e.target.value as 'standard' | 'high' | 'ultra' })}
              >
                <option value="standard">标准 (快速)</option>
                <option value="high">高质量 (推荐)</option>
                <option value="ultra">超高质量 (慢)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>页边距 ({config.margins}px)</label>
              <input 
                type="range" 
                min="20" 
                max="80" 
                step="10"
                value={config.margins}
                onChange={(e) => setConfig({ ...config, margins: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="settings-info">
            <p>💡 <strong>提示：</strong></p>
            <ul>
              <li><strong>标准质量</strong>：适合快速预览，文件较小</li>
              <li><strong>高质量</strong>：推荐用于正式文档，质量与速度平衡</li>
              <li><strong>超高质量</strong>：适合打印，文件较大，转换较慢</li>
            </ul>
          </div>
        </div>
      )}

      <div className="editor-preview-container">
        <div className="editor-section">
          <div className="section-header">
            <Code size={20} />
            <span>Markdown 编辑器</span>
          </div>
          <textarea
            className="markdown-editor"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="# 欢迎使用 Markdown 转 PDF

## 功能特点
- 完整保留 Markdown 格式
- 支持中英文混合排版
- 专业的 PDF 输出质量

### 代码示例
```javascript
const hello = 'world';
console.log(hello);
```

**粗体文本** 和 *斜体文本*

> 这是一个引用块
> 可以包含多行内容

---

试试编辑或上传你的 Markdown 文件！"
            rows={20}
          />
          <div className="editor-stats">
            {markdown ? `${markdown.length} 字符 • ${markdown.split('\n').length} 行` : '等待输入...'}
          </div>
        </div>

        <div className="preview-section">
          <div className="section-header">
            <FileText size={20} />
            <span>实时预览</span>
            <span className="preview-note">（PDF 输出将完美还原此效果）</span>
          </div>
          <div 
            ref={previewRef}
            className="markdown-preview"
            dangerouslySetInnerHTML={{ 
              __html: markdown 
                ? marked.parse(markdown) as string
                : '<div class="preview-placeholder"><p>预览将显示在这里...</p><p>你在左侧输入的内容会实时渲染</p></div>' 
            }}
          />
        </div>
      </div>

      <div className="action-section">
        <button 
          className={`convert-button ${loading ? 'loading' : ''}`}
          onClick={convertToPDF}
          disabled={loading || !markdown.trim()}
        >
          <Download size={20} />
          {loading ? (
            <>
              <span className="loading-spinner"></span>
              转换中，请稍候...
            </>
          ) : (
            '转换为 PDF'
          )}
        </button>
        
        {markdown && !loading && (
          <button 
            className="clear-button"
            onClick={() => {
              setMarkdown('')
              setError(null)
              setSuccess(null)
            }}
          >
            清空内容
          </button>
        )}
      </div>

      <div className="features-info">
        <h3>🎯 专业级转换引擎</h3>
        <div className="features-grid">
          <div className="feature-card">
            <h4>✨ 完美还原</h4>
            <p>PDF 输出与预览效果 100% 一致，所见即所得</p>
          </div>
          <div className="feature-card">
            <h4>🎨 专业排版</h4>
            <p>完整保留标题、列表、代码块、引用等所有样式</p>
          </div>
          <div className="feature-card">
            <h4>🌏 中英文支持</h4>
            <p>完美处理中英文混合排版，字体渲染清晰</p>
          </div>
          <div className="feature-card">
            <h4>📄 智能分页</h4>
            <p>自动处理多页内容，确保排版连续自然</p>
          </div>
          <div className="feature-card">
            <h4>🔍 高清输出</h4>
            <p>支持多种质量级别，适合屏幕阅读和打印</p>
          </div>
          <div className="feature-card">
            <h4>⚙️ 灵活配置</h4>
            <p>自定义页面格式、方向、边距等参数</p>
          </div>
        </div>

        <div className="tech-note">
          <strong>🚀 技术亮点：</strong>
          <p>采用 html2canvas + jsPDF 双引擎技术，将 HTML 渲染结果直接转换为 PDF，确保预览和输出完全一致。支持高 DPI 输出，文字清晰锐利，适合商业文档和技术文档。</p>
        </div>
      </div>
    </div>
  )
}

