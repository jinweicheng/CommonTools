import PDFEncryptAES from '../components/PDFEncryptAES'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'

export default function PDFEncryptPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container pdf-encrypt-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">🔐</span>
          <span className="title-text">{t('pdfEncryptAES.pageTitle')}</span>
        </h1>
        <p className="page-subtitle">
          {t('pdfEncryptAES.pageSubtitle')}
        </p>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🛡️</span>
            {t('pdfEncryptAES.badgeAES256')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">🔓</span>
            {t('pdfEncryptAES.badgeDecrypt')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('pdfEncryptAES.badgeLocal')}
          </span>
        </div>
      </div>
      
      <div className="page-content">
        <PDFEncryptAES />
      </div>
    </div>
  )
}
