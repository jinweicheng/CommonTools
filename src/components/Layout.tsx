import { ReactNode, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Shield, Repeat, Droplet, PenTool, Archive, Image as ImageIcon, Camera as CameraIcon, FileImage, Layers, Video, Menu, X, Globe, ChevronDown, ChevronRight, Minimize2, Film, Wand2, FileLock, LogOut, LogIn } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../contexts/AuthContext'
import TrustBadges from './TrustBadges'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

interface NavItem {
  path: string
  icon: ReactNode
  label: string
}

interface NavCategory {
  id: string
  label: string
  icon: ReactNode
  items: NavItem[]
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { t, language, setLanguage } = useI18n()
  const { user, logout, isVip } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['imageTools', 'pdfTools', 'videoTools', 'fileTools', 'ocrTools']))
  
  // 独立菜单项（不在分类下）
  const standaloneNavItems: NavItem[] = [
    // { path: '/', icon: <Shield size={18} />, label: t('nav.encryption') },
    // { path: '/conversion', icon: <Repeat size={18} />, label: t('nav.conversion') },
    // { path: '/watermark', icon: <Droplet size={18} />, label: t('nav.watermark') },
    // { path: '/signature', icon: <PenTool size={18} />, label: t('nav.signature') },
  ]
  
  // 分类导航
  const navCategories: NavCategory[] = [
    {
      id: 'imageTools',
      label: t('nav.imageTools'),
      icon: <ImageIcon size={18} />,
      items: [
        { path: '/heic-to-jpg', icon: <ImageIcon size={18} />, label: t('nav.heicToJpg') },
        { path: '/legacy-image-converter', icon: <FileImage size={18} />, label: t('nav.legacyImageConverter') },
        { path: '/modern-image-converter', icon: <Layers size={18} />, label: t('nav.modernImageConverter') },
        { path: '/proraw-converter', icon: <CameraIcon size={18} />, label: t('nav.prorawConverter') },
        { path: '/image-compression', icon: <Minimize2 size={18} />, label: t('nav.imageCompression') },
        { path: '/old-photo-restoration', icon: <ImageIcon size={18} />, label: t('nav.oldPhotoRestoration') },
        { path: '/remove-photos', icon: <Wand2 size={18} />, label: t('nav.removePhotos') },
        { path: '/image-watermark', icon: <Droplet size={18} />, label: t('nav.imageWatermark') },
        { path: '/image-encryption', icon: <Shield size={18} />, label: t('nav.imageEncryption') },
        { path: '/image-mosaic', icon: <Layers size={18} />, label: t('nav.imageMosaic') },
      ],
    },
    {
      id: 'pdfTools',
      label: t('nav.pdfTools'),
      icon: <FileLock size={18} />,
      items: [
        { path: '/pdf-encrypt-html', icon: <FileLock size={18} />, label: t('nav.pdfEncryptHTML') },
        { path: '/pdf-encrypt', icon: <Shield size={18} />, label: t('nav.pdfEncrypt') },
        { path: '/pdf-watermark', icon: <Droplet size={18} />, label: t('nav.pdfWatermark') },
        { path: '/pdf-signature', icon: <PenTool size={18} />, label: t('nav.pdfSignature') },
        ],
    },
    {
      id: 'ocrTools',
      label: t('nav.ocrTools'),
      icon: <FileImage size={18} />,
      items: [
        { path: '/ocr-image-to-text', icon: <FileImage size={18} />, label: t('nav.ocrImageToText') },
        { path: '/ocr-pdf', icon: <FileLock size={18} />, label: t('nav.ocrPdf') },
        { path: '/ocr-table', icon: <Layers size={18} />, label: t('nav.ocrTable') },
      ],
    },
    {
      id: 'videoTools',
      label: t('nav.videoTools'),
      icon: <Video size={18} />,
      items: [
        { path: '/screen-recording', icon: <Video size={18} />, label: t('nav.screenRecording') },
        { path: '/video-compression', icon: <Film size={18} />, label: t('nav.videoCompression') },
        { path: '/video-to-gif', icon: <FileImage size={18} />, label: t('nav.videoToGif') },
        { path: '/video-converter', icon: <Repeat size={18} />, label: t('nav.videoConverter') },
      ],
    },
    {
      id: 'fileTools',
      label: t('nav.fileTools'),
      icon: <Archive size={18} />,
      items: [
        { path: '/', icon: <Shield size={18} />, label: t('nav.encryption') },
        { path: '/conversion', icon: <Repeat size={18} />, label: t('nav.conversion') },
        { path: '/watermark', icon: <Droplet size={18} />, label: t('nav.watermark') },
        { path: '/signature', icon: <PenTool size={18} />, label: t('nav.signature') },
        { path: '/compression', icon: <Archive size={18} />, label: t('nav.archiveCompression') },
      ],
    },
  ]
  
  // 自动展开包含当前路径的分类
  useEffect(() => {
    const currentPath = location.pathname
    setExpandedCategories(prev => {
      const newExpanded = new Set(prev)
      
      navCategories.forEach(category => {
        const hasActiveItem = category.items.some(item => item.path === currentPath)
        if (hasActiveItem) {
          newExpanded.add(category.id)
        }
      })
      
      return newExpanded
    })
  }, [location.pathname])
  
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
  }
  
  const toggleLanguage = () => {
    setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN')
  }
  
  const handleNavClick = () => {
    setMobileMenuOpen(false)
  }
  
  const handleLogout = () => {
    logout()
    setMobileMenuOpen(false)
  }
  
  const isActive = (path: string) => location.pathname === path

  
  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          {/* 左侧：移动端菜单按钮 + Logo */}
          <div className="header-left">
            <Link to="/" className="header-logo">
              <div className="logo-icon">
                <Shield />
              </div>
              <span className="header-logo-text">CommonTools</span>
            </Link>
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          
          {/* 右侧：语言切换 + 认证按钮 */}
          <div className="header-auth">
            <button
              className="language-toggle header-language"
              onClick={toggleLanguage}
              title={language === 'zh-CN' ? 'Switch to English' : '切换到中文'}
              aria-label={language === 'zh-CN' ? 'Switch to English' : '切换到中文'}
            >
              <Globe size={18} />
              <span className="lang-label">{language === 'zh-CN' ? 'EN' : 'CN'}</span>
            </button>

            {user ? (
              <div className="auth-user-info">
                <span className="auth-username">{user.username}</span>
                {isVip() && <span className="auth-vip-badge">VIP</span>}
                <button 
                  className="auth-logout-btn" 
                  onClick={handleLogout}
                  title={t('auth.logout')}
                  aria-label={t('auth.logout')}
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link 
                to="/login" 
                className="auth-login-btn"
                title={t('auth.login')}
              >
                <LogIn size={18} />
                <span className="auth-btn-text">{t('auth.login')}</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      
      <div className="layout-container">
        {/* 左侧导航侧边栏 */}
        <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
          {/* sidebar header moved into top header for unified branding */}
          
          
          
          <nav className="sidebar-nav">
            {/* 独立菜单项 */}
            {standaloneNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-nav-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <div className="nav-link-icon">{item.icon}</div>
                <span className="nav-link-label">{item.label}</span>
              </Link>
            ))}
            
            {/* 分类导航 */}
            {navCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.id)
              const hasActiveItem = category.items.some(item => isActive(item.path))
              
              return (
                <div key={category.id} className="nav-category">
                  <button
                    className={`nav-category-header ${hasActiveItem ? 'has-active' : ''}`}
                    onClick={() => toggleCategory(category.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="nav-category-icon">{category.icon}</div>
                    <span className="nav-category-label">{category.label}</span>
                    <div className="nav-category-chevron">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="nav-category-items">
                      {category.items.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`sidebar-nav-link nav-sub-link ${isActive(item.path) ? 'active' : ''}`}
                          onClick={handleNavClick}
                        >
                          <div className="nav-link-icon">{item.icon}</div>
                          <span className="nav-link-label">{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
              <Link to="/about" className="footer-link">
                {t('about.title')}
              </Link>
              <Link to="/contact" className="footer-link">
                {t('contact.title')}
              </Link>
              <Link to="/support" className="footer-link">
                {t('support.title')}
              </Link>
              <Link to="/pricing" className="footer-link">
                {t('pricing.title')}
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
              <Link to="/refund-policy" className="footer-link">
                {t('refundPolicy.title')}
              </Link>
            </div>
            <TrustBadges />
            <div className="footer-copyright">
              <p>&copy; {new Date().getFullYear()} CommonTools. All rights reserved.</p>
              <p className="footer-security-note">
                🔒 {t('footer.securityNote')}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
