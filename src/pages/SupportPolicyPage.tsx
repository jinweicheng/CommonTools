import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './PolicyPage.css'

export default function SupportPolicyPage() {
  const { t } = useI18n()

  return (
    <div className="page-container policy-page support-policy-page">
      <div className="page-header">
        <h1 className="page-title">{t('supportPolicy.title')}</h1>
      </div>

      <div className="policy-content">
        <section className="policy-section">
          <h2 className="policy-section-title">{t('supportPolicy.voluntaryNature')}</h2>
          <p className="policy-text">{t('supportPolicy.voluntaryNatureText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('supportPolicy.noPurchase')}</h2>
          <p className="policy-text">{t('supportPolicy.noPurchaseText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('supportPolicy.refundPolicy')}</h2>
          <p className="policy-text">{t('supportPolicy.refundPolicyText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('supportPolicy.equalAccess')}</h2>
          <p className="policy-text">{t('supportPolicy.equalAccessText')}</p>
        </section>
      </div>
    </div>
  )
}
