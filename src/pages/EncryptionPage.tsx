import { useState } from 'react'
import PDFEncryption from '../components/PDFEncryption'
import FileEncryption from '../components/FileEncryption'
import { FileText, Shield } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'
import './EncryptionPage.css'

export default function EncryptionPage() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'pdf' | 'file'>('pdf')

  return (
    <div className="page-container encryption-page">
      <div className="page-header encryption-header">
        <div className="header-content">
          <h1 className="page-title">
            {t('encryption.title')}
          </h1>
          <p className="page-subtitle">
            {t('encryption.subtitle')}
          </p>
        </div>
        
        <div className="features-badges">
          <span className="feature-badge">
            <span className="badge-icon">🔒</span>
            {t('encryption.militaryGrade')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">⚡</span>
            {t('encryption.localProcessing')}
          </span>
          <span className="feature-badge">
            <span className="badge-icon">✨</span>
            {t('encryption.privacySecurity')}
          </span>
        </div>
      </div>

      <div className="encryption-layout">
        <aside className="encryption-sidebar">
          <div className="sidebar-header">
            <h2 className="sidebar-title">功能模块</h2>
          </div>
          <nav className="encryption-tabs">
            <button
              className={`encryption-tab ${activeTab === 'pdf' ? 'active' : ''}`}
              onClick={() => setActiveTab('pdf')}
            >
              <FileText size={20} />
              <div className="tab-content">
                <span className="tab-label">{t('encryption.pdfEncryption')}</span>
                <span className="tab-badge">{t('encryption.twoModes')}</span>
              </div>
            </button>
            <button
              className={`encryption-tab ${activeTab === 'file' ? 'active' : ''}`}
              onClick={() => setActiveTab('file')}
            >
              <Shield size={20} />
              <div className="tab-content">
                <span className="tab-label">{t('encryption.fileEncryption')}</span>
                <span className="tab-badge">{t('encryption.multiFormat')}</span>
              </div>
            </button>
          </nav>
        </aside>

        <main className="page-content encryption-content">
          {activeTab === 'pdf' ? <PDFEncryption /> : <FileEncryption />}
        </main>
      </div>
    </div>
  )
}
