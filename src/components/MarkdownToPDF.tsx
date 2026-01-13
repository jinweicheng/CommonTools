import { useState, useRef } from 'react'
import { Upload, Download, FileText, Code, AlertCircle, CheckCircle, Settings } from 'lucide-react'
import { marked } from 'marked'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useI18n } from '../i18n/I18nContext'
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
  const { t } = useI18n()
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
      setSuccess(`✅ ${t('markdownToPdf.fileLoaded')}`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(`${t('markdownToPdf.readFileFailed')}：` + (err instanceof Error ? err.message : t('common.unknownError')))
    }
  }

  const convertToPDF = async () => {
    if (!markdown.trim()) {
      setError(t('markdownToPdf.inputRequired'))
      return
    }

    if (!previewRef.current) {
      setError(t('markdownToPdf.previewNotReady'))
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const previewElement = previewRef.current
      const qualitySettings = QUALITY_SETTINGS[config.quality]
      const pageSize = PAGE_SIZES[config.format]
      
      // 获取预览区域的计算样式
      const previewStyles = window.getComputedStyle(previewElement)
      
      // 临时创建一个用于渲染的容器，完整复制预览样式
      const renderContainer = document.createElement('div')
      renderContainer.className = 'markdown-preview-pdf-render' // 用于调试
      renderContainer.style.position = 'absolute'
      renderContainer.style.left = '-9999px'
      renderContainer.style.top = '0'
      renderContainer.style.width = `${pageSize.width * 3.78}px` // mm to px (1mm ≈ 3.78px at 96 DPI)
      renderContainer.style.padding = `${config.margins}px`
      renderContainer.style.backgroundColor = '#ffffff'
      renderContainer.style.boxSizing = 'border-box'
      
      // 复制关键的文本样式
      renderContainer.style.fontFamily = previewStyles.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei", "SimHei"'
      renderContainer.style.fontSize = previewStyles.fontSize || '14px'
      renderContainer.style.lineHeight = previewStyles.lineHeight || '1.7'
      renderContainer.style.color = previewStyles.color || '#1e293b'
      renderContainer.style.fontWeight = previewStyles.fontWeight
      renderContainer.style.letterSpacing = previewStyles.letterSpacing
      renderContainer.style.wordSpacing = previewStyles.wordSpacing
      
      // 复制内容
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
        foreignObjectRendering: false, // 使用更可靠的渲染方式
        imageTimeout: 15000,
        removeContainer: false,
        onclone: (clonedDoc) => {
          const clonedContainer = clonedDoc.querySelector('.markdown-preview-pdf-render') as HTMLElement
          if (clonedContainer) {
            // 复制原始预览区域的所有CSS样式
            const originalPreview = document.querySelector('.markdown-preview')
            if (originalPreview) {
              const styles = window.getComputedStyle(originalPreview)
              
              // 复制容器样式
              clonedContainer.style.fontFamily = styles.fontFamily
              clonedContainer.style.fontSize = styles.fontSize
              clonedContainer.style.lineHeight = styles.lineHeight
              clonedContainer.style.color = styles.color
            }
            
            // 确保所有元素样式完整
            // 标题
            clonedContainer.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
              const el = heading as HTMLElement
              const originalEl = previewElement.querySelector(heading.tagName.toLowerCase())
              if (originalEl) {
                const computedStyle = window.getComputedStyle(originalEl)
                el.style.fontWeight = computedStyle.fontWeight
                el.style.fontSize = computedStyle.fontSize
                el.style.lineHeight = computedStyle.lineHeight
                el.style.marginTop = computedStyle.marginTop
                el.style.marginBottom = computedStyle.marginBottom
                el.style.color = computedStyle.color
                el.style.borderBottom = computedStyle.borderBottom
                el.style.paddingBottom = computedStyle.paddingBottom
              }
            })
            
            // 段落
            clonedContainer.querySelectorAll('p').forEach((p) => {
              const el = p as HTMLElement
              const originalP = previewElement.querySelector('p')
              if (originalP) {
                const computedStyle = window.getComputedStyle(originalP)
                el.style.margin = computedStyle.margin
                el.style.lineHeight = computedStyle.lineHeight
              }
            })
            
            // 代码块
            clonedContainer.querySelectorAll('pre').forEach((pre) => {
              const el = pre as HTMLElement
              const originalPre = previewElement.querySelector('pre')
              if (originalPre) {
                const computedStyle = window.getComputedStyle(originalPre)
                el.style.background = computedStyle.background
                el.style.padding = computedStyle.padding
                el.style.borderRadius = computedStyle.borderRadius
                el.style.border = computedStyle.border
                el.style.margin = computedStyle.margin
                el.style.overflow = 'visible' // 确保内容不被裁剪
              }
            })
            
            // 行内代码
            clonedContainer.querySelectorAll('code').forEach((code) => {
              if (code.parentElement?.tagName !== 'PRE') {
                const el = code as HTMLElement
                const originalCode = previewElement.querySelector('p code, li code')
                if (originalCode) {
                  const computedStyle = window.getComputedStyle(originalCode)
                  el.style.background = computedStyle.background
                  el.style.padding = computedStyle.padding
                  el.style.borderRadius = computedStyle.borderRadius
                  el.style.fontFamily = computedStyle.fontFamily
                  el.style.fontSize = computedStyle.fontSize
                  el.style.color = computedStyle.color
                  el.style.fontWeight = computedStyle.fontWeight
                }
              }
            })
            
            // 列表
            clonedContainer.querySelectorAll('ul, ol').forEach((list) => {
              const el = list as HTMLElement
              const originalList = previewElement.querySelector(list.tagName.toLowerCase())
              if (originalList) {
                const computedStyle = window.getComputedStyle(originalList)
                el.style.margin = computedStyle.margin
                el.style.paddingLeft = computedStyle.paddingLeft
              }
            })
            
            clonedContainer.querySelectorAll('li').forEach((li) => {
              const el = li as HTMLElement
              const originalLi = previewElement.querySelector('li')
              if (originalLi) {
                const computedStyle = window.getComputedStyle(originalLi)
                el.style.margin = computedStyle.margin
                el.style.lineHeight = computedStyle.lineHeight
              }
            })
            
            // 引用块
            clonedContainer.querySelectorAll('blockquote').forEach((quote) => {
              const el = quote as HTMLElement
              const originalQuote = previewElement.querySelector('blockquote')
              if (originalQuote) {
                const computedStyle = window.getComputedStyle(originalQuote)
                el.style.borderLeft = computedStyle.borderLeft
                el.style.padding = computedStyle.padding
                el.style.margin = computedStyle.margin
                el.style.background = computedStyle.background
                el.style.color = computedStyle.color
                el.style.fontStyle = computedStyle.fontStyle
                el.style.borderRadius = computedStyle.borderRadius
              }
            })
            
            // 链接
            clonedContainer.querySelectorAll('a').forEach((a) => {
              const el = a as HTMLElement
              const originalA = previewElement.querySelector('a')
              if (originalA) {
                const computedStyle = window.getComputedStyle(originalA)
                el.style.color = computedStyle.color
                el.style.textDecoration = computedStyle.textDecoration
              }
            })
            
            // 粗体和斜体
            clonedContainer.querySelectorAll('strong, b').forEach((strong) => {
              const el = strong as HTMLElement
              const originalStrong = previewElement.querySelector('strong, b')
              if (originalStrong) {
                const computedStyle = window.getComputedStyle(originalStrong)
                el.style.fontWeight = computedStyle.fontWeight
                el.style.color = computedStyle.color
              }
            })
            
            clonedContainer.querySelectorAll('em, i').forEach((em) => {
              const el = em as HTMLElement
              const originalEm = previewElement.querySelector('em, i')
              if (originalEm) {
                const computedStyle = window.getComputedStyle(originalEm)
                el.style.fontStyle = computedStyle.fontStyle
                el.style.color = computedStyle.color
              }
            })
            
            // 分隔线
            clonedContainer.querySelectorAll('hr').forEach((hr) => {
              const el = hr as HTMLElement
              const originalHr = previewElement.querySelector('hr')
              if (originalHr) {
                const computedStyle = window.getComputedStyle(originalHr)
                el.style.border = computedStyle.border
                el.style.borderTop = computedStyle.borderTop
                el.style.margin = computedStyle.margin
              }
            })
            
            // 表格
            clonedContainer.querySelectorAll('table').forEach((table) => {
              const el = table as HTMLElement
              const originalTable = previewElement.querySelector('table')
              if (originalTable) {
                const computedStyle = window.getComputedStyle(originalTable)
                el.style.borderCollapse = computedStyle.borderCollapse
                el.style.width = computedStyle.width
                el.style.margin = computedStyle.margin
              }
            })
            
            clonedContainer.querySelectorAll('th, td').forEach((cell) => {
              const el = cell as HTMLElement
              const originalCell = previewElement.querySelector(cell.tagName.toLowerCase())
              if (originalCell) {
                const computedStyle = window.getComputedStyle(originalCell)
                el.style.border = computedStyle.border
                el.style.padding = computedStyle.padding
                el.style.textAlign = computedStyle.textAlign
                if (cell.tagName === 'TH') {
                  el.style.background = computedStyle.background
                  el.style.fontWeight = computedStyle.fontWeight
                }
              }
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
        title: t('markdownToPdf.metaTitle'),
        subject: t('markdownToPdf.metaSubject'),
        author: 'CommonTools',
        keywords: 'markdown, pdf',
        creator: 'CommonTools PDF Converter'
      })

      // 保存 PDF
      pdf.save('markdown-converted.pdf')

      const qualityLabel =
        config.quality === 'ultra'
          ? t('markdownToPdf.qualityUltra')
          : config.quality === 'high'
            ? t('markdownToPdf.qualityHigh')
            : t('markdownToPdf.qualityStandard')
      setSuccess(`✅ ${t('markdownToPdf.convertDone').replace('{quality}', qualityLabel)}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      console.error('转换失败:', err)
      setError(`${t('conversion.conversionFailed')}：` + (err instanceof Error ? err.message : t('common.unknownError')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="markdown-to-pdf">
      <div className="tool-header">
        <h2>{t('markdownToPdf.title')}</h2>
        <p className="tool-description">
          {t('markdownToPdf.subtitle')}
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
          {t('markdownToPdf.uploadFile')}
        </label>
        
        <button 
          className="settings-button"
          onClick={() => setShowSettings(!showSettings)}
          title={t('markdownToPdf.exportSettingsTooltip')}
        >
          <Settings size={20} />
          {t('markdownToPdf.exportSettings')}
        </button>
      </div>

      {showSettings && (
        <div className="pdf-settings-panel">
          <h3>{t('markdownToPdf.exportSettingsTitle')}</h3>
          
          <div className="settings-grid">
            <div className="setting-group">
              <label>{t('markdownToPdf.pageFormat')}</label>
              <select 
                value={config.format} 
                onChange={(e) => setConfig({ ...config, format: e.target.value as 'a4' | 'letter' })}
              >
                <option value="a4">A4 (210×297mm)</option>
                <option value="letter">Letter (216×279mm)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>{t('markdownToPdf.pageOrientation')}</label>
              <select 
                value={config.orientation} 
                onChange={(e) => setConfig({ ...config, orientation: e.target.value as 'portrait' | 'landscape' })}
              >
                <option value="portrait">{t('markdownToPdf.orientationPortrait')} (Portrait)</option>
                <option value="landscape">{t('markdownToPdf.orientationLandscape')} (Landscape)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>{t('markdownToPdf.exportQuality')}</label>
              <select 
                value={config.quality} 
                onChange={(e) => setConfig({ ...config, quality: e.target.value as 'standard' | 'high' | 'ultra' })}
              >
                <option value="standard">{t('markdownToPdf.qualityStandard')} (Fast)</option>
                <option value="high">{t('markdownToPdf.qualityHigh')} (Recommended)</option>
                <option value="ultra">{t('markdownToPdf.qualityUltra')} (Slow)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>{t('markdownToPdf.margins')} ({config.margins}px)</label>
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
            <p>💡 <strong>{t('markdownToPdf.qualityHintTitle')}：</strong></p>
            <ul>
              <li>{t('markdownToPdf.qualityHintStandard')}</li>
              <li>{t('markdownToPdf.qualityHintHigh')}</li>
              <li>{t('markdownToPdf.qualityHintUltra')}</li>
            </ul>
          </div>
        </div>
      )}

      <div className="editor-preview-container">
        <div className="editor-section">
          <div className="section-header">
            <Code size={20} />
            <span>{t('markdownToPdf.editorTitle')}</span>
          </div>
          <textarea
            className="markdown-editor"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder={t('markdownToPdf.placeholder')}
            rows={20}
          />
          <div className="editor-stats">
            {markdown
              ? t('markdownToPdf.statsFormat')
                  .replace('{chars}', String(markdown.length))
                  .replace('{lines}', String(markdown.split('\n').length))
              : t('markdownToPdf.statsWaiting')}
          </div>
        </div>

        <div className="preview-section">
          <div className="section-header">
            {/* <FileText size={20} /> */}
            {/* <span>{t('markdownToPdf.previewTitle')}</span> */}
            {/* <span className="preview-note">{t('markdownToPdf.previewNote')}</span> */}
          </div>
          <div 
            ref={previewRef}
            className="markdown-preview"
            dangerouslySetInnerHTML={{ 
              __html: markdown 
                ? marked.parse(markdown) as string
                : t('markdownToPdf.previewPlaceholderHtml')
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
              {t('markdownToPdf.converting')}
            </>
          ) : (
            t('markdownToPdf.convertToPdf')
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
            {t('markdownToPdf.clear')}
          </button>
        )}
      </div>

      <div className="features-info">
        <h3>🎯 {t('conversion.quality')}</h3>
        <div className="features-grid">
          <div className="feature-card">
            <h4>✨ {t('conversion.quality')}</h4>
            <p>{t('markdownToPdf.previewNote')}</p>
          </div>
          <div className="feature-card">
            <h4>🎨 {t('conversion.quality')}</h4>
            <p>{t('conversion.markdownPdfDesc')}</p>
          </div>
          <div className="feature-card">
            <h4>🌏 {t('conversion.privacy')}</h4>
            <p>{t('conversion.localProcessing')}</p>
          </div>
          <div className="feature-card">
            <h4>📄 {t('conversion.fast')}</h4>
            <p>{t('markdownToPdf.subtitle')}</p>
          </div>
          <div className="feature-card">
            <h4>🔍 {t('markdownToPdf.exportQuality')}</h4>
            <p>{t('markdownToPdf.qualityHintHigh')}</p>
          </div>
          <div className="feature-card">
            <h4>⚙️ {t('markdownToPdf.exportSettings')}</h4>
            <p>{t('markdownToPdf.exportSettingsTitle')}</p>
          </div>
        </div>

        <div className="tech-note">
          <strong>🚀 {t('markdownToPdf.techHighlightsTitle')}：</strong>
          <p>{t('markdownToPdf.techHighlightsBody')}</p>
        </div>
      </div>
    </div>
  )
}

