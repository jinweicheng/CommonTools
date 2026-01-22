import { ReactNode, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Shield, Repeat, Droplet, PenTool, Archive, Image as ImageIcon, Camera as CameraIcon, FileImage, Layers, Video, Menu, X, Globe, ChevronDown, ChevronRight, Minimize2, Film } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['imageConversion', 'videoConversion', 'fileCompression']))
  
  // 独立菜单项（不在分类下）
  const standaloneNavItems: NavItem[] = [
    { path: '/', icon: <Shield size={18} />, label: t('nav.encryption') },
    { path: '/conversion', icon: <Repeat size={18} />, label: t('nav.conversion') },
    { path: '/watermark', icon: <Droplet size={18} />, label: t('nav.watermark') },
    { path: '/signature', icon: <PenTool size={18} />, label: t('nav.signature') },
  ]
  
  // 分类导航
  const navCategories: NavCategory[] = [
    {
      id: 'imageConversion',
      label: t('nav.imageConversion'),
      icon: <ImageIcon size={18} />,
      items: [
        { path: '/heic-to-jpg', icon: <ImageIcon size={18} />, label: t('nav.heicToJpg') },
        { path: '/legacy-image-converter', icon: <FileImage size={18} />, label: t('nav.legacyImageConverter') },
        { path: '/modern-image-converter', icon: <Layers size={18} />, label: t('nav.modernImageConverter') },
        { path: '/proraw-converter', icon: <CameraIcon size={18} />, label: t('nav.prorawConverter') },
        { path: '/image-compression', icon: <Minimize2 size={18} />, label: t('nav.imageCompression') },
      ],
    },
    {
      id: 'videoConversion',
      label: t('nav.videoConversion'),
      icon: <Video size={18} />,
      items: [
        { path: '/screen-recording', icon: <Video size={18} />, label: t('nav.screenRecording') },
        { path: '/video-compression', icon: <Film size={18} />, label: t('nav.videoCompression') },
      ],
    },
    {
      id: 'fileCompression',
      label: t('nav.fileCompression'),
      icon: <Archive size={18} />,
      items: [
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
  
  const isActive = (path: string) => location.pathname === path

  
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
            {/* <h2 className="sidebar-title">功能模块</h2> */}
          </div>
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
            <div className="footer-copyright">
              <p>&copy; {new Date().getFullYear()} CommonTools. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
