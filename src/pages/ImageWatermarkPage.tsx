import ImageWatermark from '../components/ImageWatermark'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './ImageWatermarkPage.css'

export default function ImageWatermarkPage() {
  const { t } = useI18n()
  
  return (
    <div className="page-container image-watermark-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-emoji">🎨</span>
          <span className="title-text">{t('imgWatermark.title')}</span>
        </h1>
        <p className="page-subtitle">
          {t('imgWatermark.subtitle')}
        </p>
      </div>
      
      <div className="page-content">
        <ImageWatermark />
      </div>
    </div>
  )
}
