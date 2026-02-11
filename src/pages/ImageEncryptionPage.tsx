import ImageEncryption from '../components/ImageEncryption'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './ImageEncryptionPage.css'

export default function ImageEncryptionPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container image-encryption-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">🔐</span>
          <span className="title-text">{t('imgEncrypt.pageTitle')}</span>
        </h1>
        <p className="page-subtitle">
          {t('imgEncrypt.pageSubtitle')}
        </p>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🛡️</span>
            {t('imgEncrypt.badgeMilitary')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('imgEncrypt.badgeLocal')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">🖼️</span>
            {t('imgEncrypt.badgeBatch')}
          </span>
        </div>
      </div>
      
      <div className="page-content">
        <ImageEncryption />
      </div>
    </div>
  )
}
