import PDFSignatureTool from '../components/PDFSignatureTool'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'

export default function PDFSignatureToolPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container pdf-signature-tool-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">✍️</span>
          <span className="title-text">{t('pdfSignatureTool.pageTitle')}</span>
        </h1>
        <p className="page-subtitle">
          {t('pdfSignatureTool.pageSubtitle')}
        </p>
        
        <div className="features-badges" style={{ display: 'flex', justifyContent: 'center' }}>
          <span className="feature-badge">
            <span className="badge-icon">🖊️</span>
            {t('pdfSignatureTool.badgeHandwritten')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">📑</span>
            {t('pdfSignatureTool.badgeMultiPage')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('pdfSignatureTool.badgeLocal')}
          </span>
        </div>
      </div>
      
      <div className="page-content">
        <PDFSignatureTool />
      </div>
    </div>
  )
}
