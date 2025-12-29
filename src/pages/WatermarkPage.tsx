import PDFWatermark from '../components/PDFWatermark'
import './PageStyles.css'

export default function WatermarkPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>加水印</h1>
        <p className="page-description">
          为 PDF 文件添加自定义水印，支持中文、旋转角度和透明度调整
        </p>
      </div>
      
      <div className="page-content">
        <PDFWatermark />
      </div>
    </div>
  )
}

