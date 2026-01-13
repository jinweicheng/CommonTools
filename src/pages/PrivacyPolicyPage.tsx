import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './PolicyPage.css'

export default function PrivacyPolicyPage() {
  const { t } = useI18n()

  return (
    <div className="page-container policy-page privacy-policy-page">
      <div className="page-header">
        <h1 className="page-title">{t('privacyPolicy.title')}</h1>
        <p className="policy-last-updated">
          {t('privacyPolicy.lastUpdated')}: 2026/1/13
        </p>
      </div>

      <div className="policy-content">
        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.introduction')}</h2>
          <p className="policy-text">{t('privacyPolicy.introductionText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.informationCollection')}</h2>
          <p className="policy-text">{t('privacyPolicy.informationCollectionText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.dataProcessing')}</h2>
          <p className="policy-text">{t('privacyPolicy.dataProcessingText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.cookies')}</h2>
          <p className="policy-text">{t('privacyPolicy.cookiesText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.thirdPartyServices')}</h2>
          <p className="policy-text">{t('privacyPolicy.thirdPartyServicesText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.changes')}</h2>
          <p className="policy-text">{t('privacyPolicy.changesText')}</p>
        </section>

        <section className="policy-section">
          <h2 className="policy-section-title">{t('privacyPolicy.contact')}</h2>
          <p className="policy-text">{t('privacyPolicy.contactText')}</p>
          <a 
            href={`mailto:${t('privacyPolicy.contactEmail')}`}
            className="policy-contact-email"
          >
            {t('privacyPolicy.contactEmail')}
          </a>
        </section>
      </div>
    </div>
  )
}
