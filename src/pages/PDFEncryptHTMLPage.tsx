import PDFEncryptHTML from '../components/PDFEncryptHTML'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'

export default function PDFEncryptHTMLPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container pdf-encrypt-html-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">🔒</span>
          <span className="title-text">{t('pdfEncryptHTML.pageTitle')}</span>
        </h1>
        <p className="page-subtitle">
          {t('pdfEncryptHTML.pageSubtitle')}
        </p>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🛡️</span>
            {t('pdfEncryptHTML.badgeSHA256')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">📄</span>
            {t('pdfEncryptHTML.badgeSelfContained')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('pdfEncryptHTML.badgeLocal')}
          </span>
        </div>
      </div>
      
      <div className="page-content">
        <PDFEncryptHTML />
      </div>
    </div>
  )
}
