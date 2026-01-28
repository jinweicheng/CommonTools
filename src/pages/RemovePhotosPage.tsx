import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import RemovePhotos from '../components/RemovePhotos'
import './PageStyles.css'

export default function RemovePhotosPage() {
  const { language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? '智能去背景 - CommonTools' 
    : 'Remove Background - CommonTools'
  const description = language === 'zh-CN'
    ? 'AI 驱动的智能去背景工具：自动识别前景、去除背景、替换背景。支持透明背景、纯色背景、图片背景和模糊背景。100% 本地处理，保护隐私。'
    : 'AI-powered background removal tool: Auto-detect foreground, remove background, replace background. Supports transparent, solid color, image, and blur backgrounds. 100% local processing, privacy protected.'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? '去背景,抠图,背景移除,透明背景,换背景,AI抠图,图片处理,背景替换,remove background,remove.bg' 
          : 'remove background,background removal,transparent background,change background,AI image processing,image editing,remove.bg alternative'} />
        <link rel="canonical" href="https://commontools.top/tools/remove-photos" />
        <meta property="og:url" content="https://commontools.top/tools/remove-photos" />
      </Helmet>

      <div className="page-container">
        <div className="page-header">
          <h1>
            <span className="title-emoji">✨</span>
            <span className="title-text">
              {language === 'zh-CN' ? '智能去背景' : 'Remove Background'}
            </span>
          </h1>
          <p className="page-description">
            {description}
          </p>
        </div>
        
        <div className="page-content">
          <RemovePhotos />
        </div>
      </div>
    </>
  )
}
