import { useState } from 'react'
import PDFWordConverter from '../components/PDFWordConverter'
import MarkdownToPDF from '../components/MarkdownToPDF'
import ConvertToPDF from '../components/ConvertToPDF'
import ConvertFromPDF from '../components/ConvertFromPDF'
import './PageStyles.css'

type ConversionTool = 'word-pdf' | 'markdown-pdf' | 'to-pdf' | 'from-pdf'

export default function ConversionPage() {
  const [activeTool, setActiveTool] = useState<ConversionTool>('word-pdf')
  
  const tools = [
    { id: 'word-pdf' as ConversionTool, name: 'Word ↔ PDF', description: '100% 本地转换' },
    { id: 'markdown-pdf' as ConversionTool, name: 'Markdown → PDF', description: '实时预览' },
    { id: 'to-pdf' as ConversionTool, name: '转成 PDF', description: '图片/TXT/CSV/HTML' },
    { id: 'from-pdf' as ConversionTool, name: 'PDF 转化', description: '图片/TXT/HTML' },
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
    <div className="page-container">
      <div className="page-header">
        <h1>格式转化</h1>
        <p className="page-description">
          多种文档格式相互转换，100% 浏览器本地处理
        </p>
      </div>
      
      <div className="tool-selector">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-selector-button ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
          >
            <div className="tool-name">{tool.name}</div>
            <div className="tool-desc">{tool.description}</div>
          </button>
        ))}
      </div>
      
      <div className="page-content">
        {renderTool()}
      </div>
    </div>
  )
}

