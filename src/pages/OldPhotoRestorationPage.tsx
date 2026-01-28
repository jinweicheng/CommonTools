import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import OldPhotoRestoration from '../components/OldPhotoRestoration'
import './PageStyles.css'

export default function OldPhotoRestorationPage() {
  const { language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? '老照片修复 - CommonTools' 
    : 'Old Photo Restoration - CommonTools'
  const description = language === 'zh-CN'
    ? '专业老照片修复工具：使用 AI 技术去噪、锐化、自动对比度、划痕修补。支持超分辨率清晰化。100% 本地处理，保护隐私安全。'
    : 'Professional old photo restoration tool: AI-powered denoise, sharpen, auto contrast, scratch repair. Supports super resolution. 100% local processing, privacy protected.'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? '老照片修复,照片修复,旧照片修复,照片去噪,照片锐化,照片清晰化,AI照片修复,照片划痕修复,超分辨率' 
          : 'old photo restoration,photo restoration,photo repair,photo denoise,photo sharpen,photo enhancement,AI photo restoration,scratch repair,super resolution'} />
        <link rel="canonical" href="https://commontools.top/tools/old-photo-restoration" />
        <meta property="og:url" content="https://commontools.top/tools/old-photo-restoration" />
      </Helmet>

      <div className="page-container">
        <div className="page-header">
          <h1>
            <span className="title-emoji">🖼️</span>
            <span className="title-text">
              {language === 'zh-CN' ? '老照片修复' : 'Old Photo Restoration'}
            </span>
          </h1>
          <p className="page-description">
            {description}
          </p>
        </div>
        
        <div className="page-content">
          <OldPhotoRestoration />
        </div>
      </div>
    </>
  )
}
