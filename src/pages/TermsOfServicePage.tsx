import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './PolicyPage.css'

export default function TermsOfServicePage() {
  const { t } = useI18n()

  return (
    <div className="page-container policy-page terms-of-service-page">
      <div className="page-header">
        <h1 className="page-title">{t('termsOfService.title')}</h1>
        <p className="policy-last-updated">
          {t('termsOfService.lastUpdated')}: 2026/1/13
        </p>
      </div>

      <div className="policy-content">
        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.acceptance')}</h2>
          <p className="policy-text">{t('termsOfService.acceptanceText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.useLicense')}</h2>
          <p className="policy-text">{t('termsOfService.useLicenseText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.disclaimer')}</h2>
          <p className="policy-text">{t('termsOfService.disclaimerText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.limitations')}</h2>
          <p className="policy-text">{t('termsOfService.limitationsText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.accuracy')}</h2>
          <p className="policy-text">{t('termsOfService.accuracyText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.links')}</h2>
          <p className="policy-text">{t('termsOfService.linksText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.modifications')}</h2>
          <p className="policy-text">{t('termsOfService.modificationsText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.governingLaw')}</h2>
          <p className="policy-text">{t('termsOfService.governingLawText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.refundPolicy')}</h2>
          <p className="policy-text">
            {t('termsOfService.refundPolicyText')}{' '}
            <a href="/tools/refund-policy" className="policy-link">
              {t('termsOfService.refundPolicyLink')}
            </a>
          </p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('termsOfService.contact')}</h2>
          <p className="policy-text">{t('termsOfService.contactText')}</p>
          <a 
            href={`mailto:${t('termsOfService.contactEmail')}`}
            className="policy-contact-email"
          >
            {t('termsOfService.contactEmail')}
          </a>
        </section>
      </div>
    </div>
  )
}
