import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './PolicyPage.css'

export default function RefundPolicyPage() {
  const { t } = useI18n()

  return (
    <div className="page-container policy-page refund-policy-page">
      <div className="page-header">
        <h1 className="page-title">{t('refundPolicy.title')}</h1>
        <p className="policy-last-updated">
          {t('refundPolicy.lastUpdated')}: 2026/1/13
        </p>
      </div>

      <div className="policy-content">
        <section className="policy-section">
          <h2 className="policy-section-title">{t('refundPolicy.overview')}</h2>
          <p className="policy-text">{t('refundPolicy.overviewText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('refundPolicy.eligibility')}</h2>
          <p className="policy-text">{t('refundPolicy.eligibilityText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('refundPolicy.refundProcess')}</h2>
          <p className="policy-text">{t('refundPolicy.refundProcessText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('refundPolicy.processingTime')}</h2>
          <p className="policy-text">{t('refundPolicy.processingTimeText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('refundPolicy.nonRefundable')}</h2>
          <p className="policy-text">{t('refundPolicy.nonRefundableText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('refundPolicy.contact')}</h2>
          <p className="policy-text">{t('refundPolicy.contactText')}</p>
          <a 
            href={`mailto:${t('refundPolicy.contactEmail')}`}
            className="policy-contact-email"
          >
            {t('refundPolicy.contactEmail')}
          </a>
        </section>
      </div>
    </div>
  )
}
