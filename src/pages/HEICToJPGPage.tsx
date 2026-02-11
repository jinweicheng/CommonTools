import { Helmet } from 'react-helmet-async'
import HEICToJPG from '../components/HEICToJPG'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './HEICToJPGPage.css'

export default function HEICToJPGPage() {
  const { t } = useI18n()
  
  const title = t('heicToJpg.title') + ' - CommonTools'
  const description = t('heicToJpg.subtitle')
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content="HEIC转JPG,HEIF转JPG,iPhone照片转换,苹果照片转换,在线转换工具,批量转换" />
        <link rel="canonical" href="https://commontools.top/tools/heic-to-jpg" />
        <meta property="og:url" content="https://commontools.top/tools/heic-to-jpg" />
      </Helmet>

      <div className="page-container heic-jpg-page">
      <div className="page-header">
        {/* <h1>
          <span className="title-emoji">🖼️</span>
          <span className="title-text">{t('heicToJpg.title')}</span>
        </h1>
        <p className="page-description">
          {t('heicToJpg.subtitle')}
        </p> */}
      </div>
      
      <div className="page-content">
        <HEICToJPG />
      </div>
    </div>
    </>
  )
}

