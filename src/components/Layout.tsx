import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Shield, Repeat, Droplet, PenTool, KeyRound, Archive } from 'lucide-react'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  
  const navItems = [
    { path: '/', icon: <Shield size={20} />, label: '加密文件' },
    { path: '/conversion', icon: <Repeat size={20} />, label: '格式转化' },
    { path: '/watermark', icon: <Droplet size={20} />, label: '加水印' },
    { path: '/signature', icon: <PenTool size={20} />, label: '电子签名' },
    { path: '/password-manager', icon: <KeyRound size={20} />, label: '密码管理器' },
    { path: '/compression', icon: <Archive size={20} />, label: '解压/压缩' },
  ]
  
  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">
            <Shield size={28} />
            CommonTools
          </h1>
          <p className="tagline">本地加密工具集 - 保护您的隐私</p>
        </div>
      </header>
      
      <nav className="navigation">
        <div className="nav-content">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
      
      <main className="main-content">
        {children}
      </main>
      
      <footer className="footer">
        <p>© 2025 CommonTools - 100% 本地处理，保护您的隐私</p>
      </footer>
    </div>
  )
}
