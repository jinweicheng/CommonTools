import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Shield, Repeat, Droplet, PenTool, Archive, Image as ImageIcon, Camera as CameraIcon, FileImage, Layers, Video, Menu, X, Globe } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t, language, setLanguage } = useI18n()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const navItems = [
    { path: '/', icon: <Shield size={18} />, label: t('nav.encryption') },
    { path: '/conversion', icon: <Repeat size={18} />, label: t('nav.conversion') },
    { path: '/watermark', icon: <Droplet size={18} />, label: t('nav.watermark') },
    { path: '/signature', icon: <PenTool size={18} />, label: t('nav.signature') },
    { path: '/compression', icon: <Archive size={18} />, label: t('nav.compression') },
    { path: '/heic-to-jpg', icon: <ImageIcon size={18} />, label: t('nav.heicToJpg') },
    { path: '/live-photo', icon: <CameraIcon size={18} />, label: t('nav.livePhoto') },
    { path: '/legacy-image-converter', icon: <FileImage size={18} />, label: t('nav.legacyImageConverter') },
    { path: '/modern-image-converter', icon: <Layers size={18} />, label: t('nav.modernImageConverter') },
    { path: '/proraw-converter', icon: <CameraIcon size={18} />, label: t('nav.prorawConverter') },
    { path: '/screen-recording', icon: <Video size={18} />, label: t('nav.screenRecording') },
    // { path: '/password-manager', icon: <KeyRound size={18} />, label: t('nav.passwordManager') },
  ]
  
  const toggleLanguage = () => {
    setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN')
  }
  
  const handleNavClick = () => {
    setMobileMenuOpen(false)
  }

  
  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      
      <div className="layout-container">
        {/* 左侧导航侧边栏 */}
        <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <Link to="/" className="sidebar-logo">
              <div className="logo-icon">
                <Shield />
              </div>
              <span className="logo-text">CommonTools</span>
            </Link>
            <div className="sidebar-header-actions">
              <button 
                className="language-toggle" 
                onClick={toggleLanguage}
                title={language === 'zh-CN' ? 'Switch to English' : '切换到中文'}
              >
                <Globe size={18} />
                <span>{language === 'zh-CN' ? 'EN' : 'CN'}</span>
              </button>
            </div>
            <h2 className="sidebar-title">功能模块</h2>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-nav-link ${location.pathname === item.path ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <div className="nav-link-icon">{item.icon}</div>
                <span className="nav-link-label">{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* 移动端遮罩 */}
        {mobileMenuOpen && (
          <div 
            className="sidebar-overlay"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* 主内容区域 */}
        <div className="main-content-wrapper">
          {/* 安全提示横幅 */}
          <div className="security-banner">
            <div className="security-banner-content">
              <span className="security-text">
                <strong>🔐 {t('security.banner')}</strong> {t('security.description')}
              </span>
            </div>
          </div>
          
          <main className="main-content">
            {children}
          </main>
        </div>
      </div>
      
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-content">
            <div className="footer-links">
              <Link to="/support" className="footer-link">
                {t('support.title')}
              </Link>
              <Link to="/support-policy" className="footer-link">
                {t('supportPolicy.title')}
              </Link>
              <Link to="/privacy-policy" className="footer-link">
                {t('privacyPolicy.title')}
              </Link>
              <Link to="/terms-of-service" className="footer-link">
                {t('termsOfService.title')}
              </Link>
            </div>
            <div className="footer-copyright">
              <p>&copy; {new Date().getFullYear()} CommonTools. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
