import HEICToJPG from '../components/HEICToJPG'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './HEICToJPGPage.css'

export default function HEICToJPGPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container heic-jpg-page">
      <div className="page-header">
        <h1>
          <span className="title-emoji">🖼️</span>
          <span className="title-text">{t('heicToJpg.title')}</span>
        </h1>
        <p className="page-description">
          {t('heicToJpg.subtitle')}
        </p>
      </div>
      
      <div className="page-content">
        <HEICToJPG />
      </div>
    </div>
  )
}

