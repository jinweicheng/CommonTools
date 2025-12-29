import { Link } from 'react-router-dom'
import { FileText, ArrowRight } from 'lucide-react'
import './Home.css'

export default function Home() {
  return (
    <div className="home">
      <div className="hero">
        <h1 className="hero-title">CommonTools</h1>
        <p className="hero-subtitle">常用生活、办公的经常使用的工具</p>
      </div>
      
      <div className="tools-grid">
        <Link to="/pdf-tools" className="tool-card">
          <div className="tool-icon">
            <FileText size={48} />
          </div>
          <h2 className="tool-title">PDF工具集</h2>
          <p className="tool-description">
            提供PDF转换、水印、加密、签名等完整功能
          </p>
          <div className="tool-footer">
            <span>开始使用</span>
            <ArrowRight size={20} />
          </div>
        </Link>
      </div>
    </div>
  )
}

