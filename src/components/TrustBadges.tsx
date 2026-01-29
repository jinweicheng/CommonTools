import { Shield, Lock, CheckCircle2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import './TrustBadges.css'

export default function TrustBadges() {
  const { t } = useI18n()

  return (
    <div className="trust-badges">
      <div className="trust-badge">
        <Shield className="badge-icon" size={20} />
        <div className="badge-content">
          <span className="badge-title">{t('trustBadges.https.title')}</span>
          <span className="badge-description">{t('trustBadges.https.description')}</span>
        </div>
      </div>
      
      <div className="trust-badge">
        <Lock className="badge-icon" size={20} />
        <div className="badge-content">
          <span className="badge-title">{t('trustBadges.local.title')}</span>
          <span className="badge-description">{t('trustBadges.local.description')}</span>
        </div>
      </div>
      
      {/* <div className="trust-badge">
        <Globe className="badge-icon" size={20} />
        <div className="badge-content">
          <span className="badge-title">{t('trustBadges.free.title')}</span>
          <span className="badge-description">{t('trustBadges.free.description')}</span>
        </div>
      </div> */}
      
      <div className="trust-badge">
        <CheckCircle2 className="badge-icon" size={20} />
        <div className="badge-content">
          <span className="badge-title">{t('trustBadges.verified.title')}</span>
          <span className="badge-description">{t('trustBadges.verified.description')}</span>
        </div>
      </div>
    </div>
  )
}
