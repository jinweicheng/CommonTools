import PDFLock from '../components/PDFLock'
import './PageStyles.css'

export default function EncryptionPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">🔐 文件加密</h1>
        <p className="page-subtitle">
          使用 AES-256-GCM 军事级加密保护您的文件，支持 PDF、图片、文档、文本等多种格式
        </p>
      </div>
      
      <div className="page-content">
        <PDFLock />
      </div>
    </div>
  )
}

