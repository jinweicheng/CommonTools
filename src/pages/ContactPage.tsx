import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext'
import { Mail, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import './PageStyles.css'
import './ContactPage.css'

export default function ContactPage() {
  const { t } = useI18n()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')

    // 构建邮件链接
    const subject = encodeURIComponent(formData.subject || 'Contact from CommonTools')
    const body = encodeURIComponent(
      `Name: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`
    )
    const mailtoLink = `mailto:${t('contact.email')}?subject=${subject}&body=${body}`

    // 打开邮件客户端
    window.location.href = mailtoLink

    // 模拟发送状态
    setTimeout(() => {
      setStatus('success')
      setTimeout(() => {
        setStatus('idle')
        setFormData({ name: '', email: '', subject: '', message: '' })
      }, 3000)
    }, 1000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div className="page-container contact-page">
      <div className="page-header">
        <h1 className="page-title">{t('contact.title')}</h1>
        <p className="page-subtitle">{t('contact.subtitle')}</p>
      </div>

      <div className="contact-content">
        <div className="contact-grid">
          {/* 联系表单 */}
          <div className="contact-form-section">
            <h2>{t('contact.form.title')}</h2>
            <p className="contact-form-description">{t('contact.form.description')}</p>

            <form onSubmit={handleSubmit} className="contact-form">
              <div className="form-group">
                <label htmlFor="name">{t('contact.form.name')}</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder={t('contact.form.namePlaceholder')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">{t('contact.form.email')}</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder={t('contact.form.emailPlaceholder')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="subject">{t('contact.form.subject')}</label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                >
                  <option value="">{t('contact.form.subjectPlaceholder')}</option>
                  <option value="general">{t('contact.form.subjectOptions.general')}</option>
                  <option value="bug">{t('contact.form.subjectOptions.bug')}</option>
                  <option value="feature">{t('contact.form.subjectOptions.feature')}</option>
                  <option value="security">{t('contact.form.subjectOptions.security')}</option>
                  <option value="other">{t('contact.form.subjectOptions.other')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="message">{t('contact.form.message')}</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  placeholder={t('contact.form.messagePlaceholder')}
                />
              </div>

              {status === 'success' && (
                <div className="form-status success">
                  <CheckCircle2 size={20} />
                  <span>{t('contact.form.success')}</span>
                </div>
              )}

              {status === 'error' && (
                <div className="form-status error">
                  <AlertCircle size={20} />
                  <span>{t('contact.form.error')}</span>
                </div>
              )}

              <button
                type="submit"
                className="submit-button"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? (
                  <>
                    <span className="spinner"></span>
                    {t('contact.form.sending')}
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    {t('contact.form.submit')}
                  </>
                )}
              </button>
            </form>
          </div>

          {/* 联系信息 */}
          <div className="contact-info-section">
            <h2>{t('contact.info.title')}</h2>
            
            <div className="contact-info-card">
              <Mail className="info-icon" size={24} />
              <div>
                <h3>{t('contact.info.email.title')}</h3>
                <a href={`mailto:${t('contact.email')}`} className="contact-email-link">
                  {t('contact.email')}
                </a>
                <p className="info-description">{t('contact.info.email.description')}</p>
              </div>
            </div>

            <div className="contact-info-card">
              <div className="info-icon">🔒</div>
              <div>
                <h3>{t('contact.info.security.title')}</h3>
                <p className="info-description">{t('contact.info.security.description')}</p>
                <a href="/tools/.well-known/security.txt" className="security-link" target="_blank" rel="noopener noreferrer">
                  {t('contact.info.security.link')}
                </a>
              </div>
            </div>

            <div className="contact-info-card">
              <div className="info-icon">⏱️</div>
              <div>
                <h3>{t('contact.info.response.title')}</h3>
                <p className="info-description">{t('contact.info.response.description')}</p>
              </div>
            </div>

            <div className="contact-info-card">
              <div className="info-icon">🌍</div>
              <div>
                <h3>{t('contact.info.language.title')}</h3>
                <p className="info-description">{t('contact.info.language.description')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
