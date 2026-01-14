import PDFWatermark from '../components/PDFWatermark'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './WatermarkPage.css'

export default function WatermarkPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container watermark-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">💧</span>
          <span className="title-text">{t('watermark.title')}</span>
        </h1>
        <p className="page-subtitle">
          {t('watermark.subtitle')}
        </p>
      </div>
      
      <div className="page-content">
        <PDFWatermark />
      </div>
    </div>
  )
}

