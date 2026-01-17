import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './PricingPage.css'

export default function PricingPage() {
  const { t } = useI18n()

  return (
    <div className="page-container pricing-page">
      <div className="page-header">
        <h1 className="page-title">{t('pricing.title')}</h1>
        <p className="pricing-subtitle">{t('pricing.subtitle')}</p>
      </div>

      <div className="pricing-content">
        <section className="pricing-intro">
          <p className="pricing-intro-text">{t('pricing.introText')}</p>
        </section>

        <div className="pricing-plans">
          <div className="pricing-plan free-plan">
            <div className="plan-header">
              <h2 className="plan-name">{t('pricing.freePlan.name')}</h2>
              <div className="plan-price">
                <span className="price-amount">{t('pricing.freePlan.price')}</span>
              </div>
            </div>
            <ul className="plan-features">
              {t('pricing.freePlan.features', { returnObjects: true }).map((feature: string, index: number) => (
                <li key={index} className="plan-feature">
                  <span className="feature-icon">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="pricing-plan premium-plan">
            <div className="plan-header">
              <h2 className="plan-name">{t('pricing.premiumPlan.name')}</h2>
              <div className="plan-price">
                <span className="price-amount">{t('pricing.premiumPlan.price')}</span>
                <span className="price-period">{t('pricing.premiumPlan.period')}</span>
              </div>
            </div>
            <ul className="plan-features">
              {t('pricing.premiumPlan.features', { returnObjects: true }).map((feature: string, index: number) => (
                <li key={index} className="plan-feature">
                  <span className="feature-icon">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <div className="plan-cta">
              <a href="/tools/support" className="pricing-button">
                {t('pricing.premiumPlan.cta')}
              </a>
            </div>
          </div>
        </div>

        <section className="pricing-faq">
          <h2 className="faq-title">{t('pricing.faq.title')}</h2>
          <div className="faq-list">
            <div className="faq-item">
              <h3 className="faq-question">{t('pricing.faq.q1')}</h3>
              <p className="faq-answer">{t('pricing.faq.a1')}</p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">{t('pricing.faq.q2')}</h3>
              <p className="faq-answer">{t('pricing.faq.a2')}</p>
            </div>
            <div className="faq-item">
              <h3 className="faq-question">{t('pricing.faq.q3')}</h3>
              <p className="faq-answer">{t('pricing.faq.a3')}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
