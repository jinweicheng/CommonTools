import PDFSignature from '../components/PDFSignature'
import './PageStyles.css'

export default function SignaturePage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>电子签名</h1>
        <p className="page-description">
          在 PDF 任意位置添加手写签名和日期面板，支持拖拽和调整大小
        </p>
      </div>
      
      <div className="page-content">
        <PDFSignature />
      </div>
    </div>
  )
}

