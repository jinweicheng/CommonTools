import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, Repeat, Droplet, PenTool, KeyRound, Archive, Image as ImageIcon, Menu, X, LogIn, LogOut, Crown, User, Globe } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isVip } = useAuth()
  const { t, language, setLanguage } = useI18n()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const navItems = [
    { path: '/', icon: <Shield size={18} />, label: t('nav.encryption') },
    { path: '/conversion', icon: <Repeat size={18} />, label: t('nav.conversion') },
    { path: '/watermark', icon: <Droplet size={18} />, label: t('nav.watermark') },
    { path: '/signature', icon: <PenTool size={18} />, label: t('nav.signature') },
    { path: '/compression', icon: <Archive size={18} />, label: t('nav.compression') },
    { path: '/heic-to-jpg', icon: <ImageIcon size={18} />, label: t('nav.heicToJpg') },
    { path: '/password-manager', icon: <KeyRound size={18} />, label: t('nav.passwordManager') },
  ]
  
  const toggleLanguage = () => {
    setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN')
  }
  
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
            <button 
              className="language-toggle" 
              onClick={toggleLanguage}
              title={language === 'zh-CN' ? 'Switch to English' : '切换到中文'}
            >
              <Globe size={18} />
              <span>{language === 'zh-CN' ? 'EN' : '中'}</span>
            </button>
            
            {user ? (
              <div className="user-info">
                <div className="user-badge">
                  {isVip() ? <Crown size={16} /> : <User size={16} />}
                  <span className="username">{user.username}</span>
                  {isVip() && <span className="vip-badge">{t('common.vip')}</span>}
                </div>
                <button className="logout-button" onClick={handleLogout} title={t('common.logout')}>
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="login-button-header">
                <LogIn size={18} />
                <span>{t('common.login')}</span>
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
      
      {/* 安全提示横幅 */}
      <div className="security-banner">
        <div className="security-banner-content">
          {/* <Lock size={18} className="security-icon" /> */}
          <span className="security-text">
            <strong>🔐 {t('security.banner')}</strong> {t('security.description')}
          </span>
        </div>
      </div>
      
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
