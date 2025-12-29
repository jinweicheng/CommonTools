import PDFLock from '../components/PDFLock'
import './PageStyles.css'

export default function EncryptionPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>加密文件</h1>
        <p className="page-description">
          使用 AES-256-GCM 军事级加密保护您的 PDF 文件，支持标准模式和强加密模式
        </p>
      </div>
      
      <div className="page-content">
        <PDFLock />
      </div>
    </div>
  )
}

