import PDFSignature from '../components/PDFSignature'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './SignaturePage.css'

export default function SignaturePage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container signature-page">
      <div className="page-header">
        <h1>
          <span className="title-emoji">✍️</span>
          <span className="title-text">{t('signature.title')}</span>
        </h1>
        <p className="page-description">
          {t('signature.subtitle')}
        </p>
      </div>
      
      <div className="page-content">
        <PDFSignature />
      </div>
    </div>
  )
}

