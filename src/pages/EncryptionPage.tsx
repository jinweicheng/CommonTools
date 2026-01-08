import { useState } from 'react'
import PDFEncryption from '../components/PDFEncryption'
import FileEncryption from '../components/FileEncryption'
import { FileText, Shield } from 'lucide-react'
import './PageStyles.css'
import './EncryptionPage.css'

export default function EncryptionPage() {
  const [activeTab, setActiveTab] = useState<'pdf' | 'file'>('pdf')

  return (
    <div className="page-container encryption-page">
      <div className="page-header encryption-header">
        <div className="header-content">
          <h1 className="page-title">
            {/* <span className="title-icon">🔐</span> */}
            文件加密
          </h1>
          <p className="page-subtitle">
            使用 AES-256-GCM 军事级加密保护您的文件，支持 PDF、图片、文档、文本等多种格式
          </p>
        </div>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🔒</span>
            军事级加密
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            本地处理
          </span>
          <span className="feature-badge">
            <span className="badge-icon">✨</span>
            隐私安全
          </span>
        </div>
      </div>

      <div className="encryption-tabs">
        <button
          className={`encryption-tab ${activeTab === 'pdf' ? 'active' : ''}`}
          onClick={() => setActiveTab('pdf')}
        >
          <FileText size={20} />
          <span>PDF 文件加密</span>
          <span className="tab-badge">两种模式</span>
        </button>
        <button
          className={`encryption-tab ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          <Shield size={20} />
          <span>通用文件加密</span>
          <span className="tab-badge">多格式</span>
        </button>
      </div>

      <div className="page-content encryption-content">
        {activeTab === 'pdf' ? <PDFEncryption /> : <FileEncryption />}
      </div>
    </div>
  )
}
