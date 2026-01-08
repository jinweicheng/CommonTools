import HEICToJPG from '../components/HEICToJPG'
import './PageStyles.css'
import './HEICToJPGPage.css'

export default function HEICToJPGPage() {
  return (
    <div className="page-container heic-jpg-page">
      <div className="page-header">
        <h1>🖼️ HEIC 转 JPG</h1>
        <p className="page-description">
          将 iPhone 拍摄的 HEIC/HEIF 格式图片转换为通用的 JPG 格式，100% 浏览器本地处理，保护隐私安全
        </p>
      </div>
      
      <div className="page-content">
        <HEICToJPG />
      </div>
    </div>
  )
}

