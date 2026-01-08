import HEICToJPG from '../components/HEICToJPG'
import './PageStyles.css'

export default function HEICToJPGPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>HEIC 转 JPG</h1>
        <p className="page-description">
          将iPhone拍摄的HEIC格式图片转换为通用的JPG格式，100%浏览器本地处理，保护隐私安全
        </p>
      </div>
      
      <div className="page-content">
        <HEICToJPG />
      </div>
    </div>
  )
}

