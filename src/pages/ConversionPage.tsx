import { useState } from 'react'
import PDFWordConverter from '../components/PDFWordConverter'
import MarkdownToPDF from '../components/MarkdownToPDF'
import ConvertToPDF from '../components/ConvertToPDF'
import ConvertFromPDF from '../components/ConvertFromPDF'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './ConversionPage.css'

type ConversionTool = 'word-pdf' | 'markdown-pdf' | 'to-pdf' | 'from-pdf'

export default function ConversionPage() {
  const { t } = useI18n()
  const [activeTool, setActiveTool] = useState<ConversionTool>('word-pdf')
  
  const tools = [
    { 
      id: 'word-pdf' as ConversionTool, 
      name: t('conversion.wordPdf'), 
      description: t('conversion.wordPdfDesc'),
      icon: '📄',
      badge: t('conversion.wordPdfBadge')
    },
    { 
      id: 'markdown-pdf' as ConversionTool, 
      name: t('conversion.markdownPdf'), 
      description: t('conversion.markdownPdfDesc'),
      icon: '📝',
      badge: t('conversion.markdownPdfBadge')
    },
    { 
      id: 'to-pdf' as ConversionTool, 
      name: t('conversion.toPdf'), 
      description: t('conversion.toPdfDesc'),
      icon: '📥',
      badge: t('conversion.toPdfBadge')
    },
    { 
      id: 'from-pdf' as ConversionTool, 
      name: t('conversion.fromPdf'), 
      description: t('conversion.fromPdfDesc'),
      icon: '📤',
      badge: t('conversion.fromPdfBadge')
    },
  ]
  
  const renderTool = () => {
    switch (activeTool) {
      case 'word-pdf':
        return <PDFWordConverter />
      case 'markdown-pdf':
        return <MarkdownToPDF />
      case 'to-pdf':
        return <ConvertToPDF />
      case 'from-pdf':
        return <ConvertFromPDF />
    }
  }
  
  return (
    <div className="page-container conversion-page">
      <div className="page-header conversion-header">
        <div className="header-content">
          <h1 className="page-title">
            <span className="title-icon">🔄</span>
            {t('conversion.title')}
          </h1>
          <p className="page-subtitle">
            {t('conversion.subtitle')}
          </p>
        </div>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🔒</span>
            {t('conversion.privacy')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('conversion.fast')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">✨</span>
            {t('conversion.quality')}
          </span>
        </div>
      </div>
      
      <div className="tool-selector conversion-selector">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-selector-button ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
          >
            <div className="tool-icon">{tool.icon}</div>
            <div className="tool-info">
              <div className="tool-name">{tool.name}</div>
              <div className="tool-desc">{tool.description}</div>
            </div>
            {tool.badge && <span className="tool-badge">{tool.badge}</span>}
            {activeTool === tool.id && <div className="active-indicator"></div>}
          </button>
        ))}
      </div>
      
      <div className="page-content conversion-content">
        {renderTool()}
      </div>
    </div>
  )
}

