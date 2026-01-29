import { useI18n } from '../i18n/I18nContext'
import { Shield, Lock, Zap, Globe, Heart, Code, Users, Award } from 'lucide-react'
import './PageStyles.css'
import './AboutPage.css'

export default function AboutPage() {
  const { t } = useI18n()

  return (
    <div className="page-container about-page">
      <div className="page-header">
        <h1 className="page-title">{t('about.title')}</h1>
        <p className="page-subtitle">{t('about.subtitle')}</p>
      </div>

      <div className="about-content">
        {/* 使命和愿景 */}
        <section className="about-section">
          <div className="about-section-header">
            <Shield className="section-icon" size={32} />
            <h2>{t('about.mission.title')}</h2>
          </div>
          <p className="about-text">{t('about.mission.text')}</p>
        </section>

        {/* 核心价值 */}
        <section className="about-section">
          <div className="about-section-header">
            <Heart className="section-icon" size={32} />
            <h2>{t('about.values.title')}</h2>
          </div>
          <div className="values-grid">
            <div className="value-card">
              <Lock className="value-icon" size={24} />
              <h3>{t('about.values.privacy.title')}</h3>
              <p>{t('about.values.privacy.text')}</p>
            </div>
            <div className="value-card">
              <Zap className="value-icon" size={24} />
              <h3>{t('about.values.performance.title')}</h3>
              <p>{t('about.values.performance.text')}</p>
            </div>
            <div className="value-card">
              <Globe className="value-icon" size={24} />
              <h3>{t('about.values.accessibility.title')}</h3>
              <p>{t('about.values.accessibility.text')}</p>
            </div>
            <div className="value-card">
              <Code className="value-icon" size={24} />
              <h3>{t('about.values.transparency.title')}</h3>
              <p>{t('about.values.transparency.text')}</p>
            </div>
          </div>
        </section>

        {/* 技术优势 */}
        <section className="about-section">
          <div className="about-section-header">
            <Award className="section-icon" size={32} />
            <h2>{t('about.technology.title')}</h2>
          </div>
          <div className="tech-features">
            <div className="tech-feature">
              <div className="tech-feature-badge">100%</div>
              <h3>{t('about.technology.localProcessing.title')}</h3>
              <p>{t('about.technology.localProcessing.text')}</p>
            </div>
            <div className="tech-feature">
              <div className="tech-feature-badge">AES-256</div>
              <h3>{t('about.technology.encryption.title')}</h3>
              <p>{t('about.technology.encryption.text')}</p>
            </div>
            <div className="tech-feature">
              <div className="tech-feature-badge">WebAssembly</div>
              <h3>{t('about.technology.performance.title')}</h3>
              <p>{t('about.technology.performance.text')}</p>
            </div>
          </div>
        </section>

        {/* 团队信息 */}
        <section className="about-section">
          <div className="about-section-header">
            <Users className="section-icon" size={32} />
            <h2>{t('about.team.title')}</h2>
          </div>
          <p className="about-text">{t('about.team.text')}</p>
          <div className="team-info">
            <div className="team-stat">
              <div className="team-stat-number">2026</div>
              <div className="team-stat-label">{t('about.team.founded')}</div>
            </div>
            <div className="team-stat">
              <div className="team-stat-number">15+</div>
              <div className="team-stat-label">{t('about.team.tools')}</div>
            </div>
            <div className="team-stat">
              <div className="team-stat-number">100%</div>
              <div className="team-stat-label">{t('about.team.local')}</div>
            </div>
          </div>
        </section>

        {/* 联系方式 */}
        <section className="about-section contact-section">
          <h2>{t('about.contact.title')}</h2>
          <p className="about-text">{t('about.contact.text')}</p>
          <div className="contact-info">
            <a href={`mailto:${t('about.contact.email')}`} className="contact-link">
              {t('about.contact.email')}
            </a>
            <a href="/tools/contact" className="contact-button">
              {t('about.contact.button')}
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
