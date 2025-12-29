import { useState } from 'react'
import { FileText, FileUp, Download, Lock, Shield, PenTool, Calendar, Eye } from 'lucide-react'
import PDFWordConverter from '../components/PDFWordConverter'
import MarkdownToPDF from '../components/MarkdownToPDF'
import PDFWatermark from '../components/PDFWatermark'
import PDFExpiry from '../components/PDFExpiry'
import PDFPassword from '../components/PDFPassword'
import PDFLock from '../components/PDFLock'
import PDFProtection from '../components/PDFProtection'
import PDFSignature from '../components/PDFSignature'
import './PDFTools.css'

type ToolType = 
  | 'pdf-word' 
  | 'markdown-pdf' 
  | 'watermark' 
  | 'expiry' 
  | 'password' 
  | 'protection' 
  | 'signature'
  | 'lock'

interface Tool {
  id: ToolType
  name: string
  icon: React.ReactNode
  description: string
}

const tools: Tool[] = [
  {
    id: 'pdf-word',
    name: 'PDF ↔ Word',
    icon: <FileText size={24} />,
    description: 'PDF与Word文档相互转换'
  },
  {
    id: 'markdown-pdf',
    name: 'Markdown → PDF',
    icon: <FileUp size={24} />,
    description: '将Markdown文档转换为PDF'
  },
  {
    id: 'watermark',
    name: '水印',
    icon: <Shield size={24} />,
    description: '为PDF添加水印'
  },
  // {
  //   id: 'expiry',
  //   name: '文件有效期',
  //   icon: <Calendar size={24} />,
  //   description: '设置PDF文件有效期'
  // },
  // {
  //   id: 'password',
  //   name: '查看密码',
  //   icon: <Lock size={24} />,
  //   description: '为PDF添加查看密码'
  // },
  {
    id: 'lock',
    name: 'PDF 加密/解密',
    icon: <Shield size={24} />,
    description: 'AES-256 加密保护 PDF'
  },
  // {
  //   id: 'protection',
  //   name: '防复制/打印',
  //   icon: <Eye size={24} />,
  //   description: '防止PDF被复制或打印'
  // },
  {
    id: 'signature',
    name: '甲乙方签名',
    icon: <PenTool size={24} />,
    description: '在PDF任意位置添加手写签名'
  }
]

export default function PDFTools() {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null)

  const renderTool = () => {
    switch (activeTool) {
      case 'pdf-word':
        return <PDFWordConverter />
      case 'markdown-pdf':
        return <MarkdownToPDF />
      case 'watermark':
        return <PDFWatermark />
      case 'expiry':
        return <PDFExpiry />
      case 'password':
        return <PDFPassword />
      case 'lock':
        return <PDFLock />
      case 'protection':
        return <PDFProtection />
      case 'signature':
        return <PDFSignature />
      default:
        return (
          <div className="tool-placeholder">
            <FileText size={64} />
            <h2>选择一个工具开始使用</h2>
            <p>从左侧选择您需要的PDF处理功能</p>
          </div>
        )
    }
  }

  return (
    <div className="pdf-tools">
      <div className="tools-sidebar">
        <h2 className="sidebar-title">PDF工具</h2>
        <div className="tools-list">
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`tool-item ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => setActiveTool(tool.id)}
            >
              <div className="tool-item-icon">{tool.icon}</div>
              <div className="tool-item-content">
                <div className="tool-item-name">{tool.name}</div>
                <div className="tool-item-desc">{tool.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="tools-content">
        {renderTool()}
      </div>
    </div>
  )
}

