import LivePhotoConverter from '../components/LivePhotoConverter'
import { useI18n } from '../i18n/I18nContext'
import './LivePhotoPage.css'

export default function LivePhotoPage() {
  const { t } = useI18n()
  
  return (
    <div className="live-photo-page">
      <div className="page-header">
        <h1>
          <span className="title-emoji">📸</span>
          <span className="title-text">{t('livePhoto.title')}</span>
        </h1>
        <p className="page-subtitle">{t('livePhoto.subtitle')}</p>
      </div>

      <LivePhotoConverter />
    </div>
  )
}
