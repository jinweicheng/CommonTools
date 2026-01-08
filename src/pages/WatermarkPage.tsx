import PDFWatermark from '../components/PDFWatermark'
import './PageStyles.css'
import './WatermarkPage.css'

export default function WatermarkPage() {
  return (
    <div className="page-container watermark-page">
      <div className="page-header">
        <h1 className="page-title">💧 水印工具</h1>
        <p className="page-subtitle">
          为 PDF 和图片添加专业水印，支持中英文、自定义透明度和旋转角度
        </p>
      </div>
      
      <div className="page-content">
        <PDFWatermark />
      </div>
    </div>
  )
}

