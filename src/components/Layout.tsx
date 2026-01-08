import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, Repeat, Droplet, PenTool, KeyRound, Archive, Image as ImageIcon, Menu, X, LogIn, LogOut, Crown, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isVip } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const navItems = [
    { path: '/', icon: <Shield size={18} />, label: '加密文件' },
    { path: '/conversion', icon: <Repeat size={18} />, label: '格式转化' },
    { path: '/watermark', icon: <Droplet size={18} />, label: '加水印' },
    { path: '/signature', icon: <PenTool size={18} />, label: '电子签名' },
    { path: '/compression', icon: <Archive size={18} />, label: '解压/压缩' },
    { path: '/heic-to-jpg', icon: <ImageIcon size={18} />, label: 'HEIC转JPG' },
    { path: '/password-manager', icon: <KeyRound size={18} />, label: '密码管理器' },
  ]
  
  const handleNavClick = () => {
    setMobileMenuOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/')
    setMobileMenuOpen(false)
  }
  
  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <div className="logo-icon">
              <Shield />
            </div>
            <span className="logo-text">CommonTools</span>
          </Link>
          
          <nav className={`nav ${mobileMenuOpen ? 'open' : ''}`}>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            {user ? (
              <div className="user-info">
                <div className="user-badge">
                  {isVip() ? <Crown size={16} /> : <User size={16} />}
                  <span className="username">{user.username}</span>
                  {isVip() && <span className="vip-badge">VIP</span>}
                </div>
                <button className="logout-button" onClick={handleLogout} title="登出">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="login-button-header">
                <LogIn size={18} />
                <span>登录</span>
              </Link>
            )}
          </div>
          
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
