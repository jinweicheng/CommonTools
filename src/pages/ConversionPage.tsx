import { useState } from 'react'
import PDFWordConverter from '../components/PDFWordConverter'
import MarkdownToPDF from '../components/MarkdownToPDF'
import ConvertToPDF from '../components/ConvertToPDF'
import ConvertFromPDF from '../components/ConvertFromPDF'
import './PageStyles.css'
import './ConversionPage.css'

type ConversionTool = 'word-pdf' | 'markdown-pdf' | 'to-pdf' | 'from-pdf'

export default function ConversionPage() {
  const [activeTool, setActiveTool] = useState<ConversionTool>('word-pdf')
  
  const tools = [
    { 
      id: 'word-pdf' as ConversionTool, 
      name: 'Word ↔ PDF', 
      description: '100% 本地转换',
      icon: '📄',
      badge: '双向'
    },
    { 
      id: 'markdown-pdf' as ConversionTool, 
      name: 'Markdown → PDF', 
      description: '实时预览',
      icon: '📝',
      badge: '单向'
    },
    { 
      id: 'to-pdf' as ConversionTool, 
      name: '转成 PDF', 
      description: '图片 & 文本',
      icon: '📥',
      badge: '高质量'
    },
    { 
      id: 'from-pdf' as ConversionTool, 
      name: 'PDF 转化', 
      description: '图片 & 文本',
      icon: '📤',
      badge: '高质量'
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
            格式转化
          </h1>
          <p className="page-subtitle">
            高质量文档格式转换，100% 浏览器本地处理，文件不上传
          </p>
        </div>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🔒</span>
            隐私安全
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            快速转换
          </span>
          <span className="feature-badge">
            <span className="badge-icon">✨</span>
            高质量
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

