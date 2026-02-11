import PDFWatermarkTool from '../components/PDFWatermarkTool'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'

export default function PDFWatermarkToolPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container pdf-watermark-tool-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">💧</span>
          <span className="title-text">{t('pdfWatermarkTool.pageTitle')}</span>
        </h1>
        <p className="page-subtitle">
          {t('pdfWatermarkTool.pageSubtitle')}
        </p>
        
        <div className="features-badges" style={{ display: 'flex', justifyContent: 'center' }}>
          <span className="feature-badge">
            <span className="badge-icon">👁️</span>
            {t('pdfWatermarkTool.badgePreview')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">🎨</span>
            {t('pdfWatermarkTool.badgeCustomize')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('pdfWatermarkTool.badgeLocal')}
          </span>
        </div>
      </div>
      
      <div className="page-content">
        <PDFWatermarkTool />
      </div>
    </div>
  )
}
