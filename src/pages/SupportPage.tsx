import { useState, useEffect } from 'react'
import { Coffee, Rocket, Gem, DollarSign } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { openPaddleCheckout, initializePaddle, isPaddleConfigured } from '../utils/paddleService'
import './PageStyles.css'
import './SupportPage.css'

export default function SupportPage() {
  const { t } = useI18n()
  const [customAmount, setCustomAmount] = useState('')
  const [paddleReady, setPaddleReady] = useState(false)

  // 初始化 Paddle（如果已配置）
  useEffect(() => {
    if (isPaddleConfigured()) {
      initializePaddle()
        .then((success) => {
          setPaddleReady(success)
        })
        .catch((error) => {
          console.error('Failed to initialize Paddle:', error)
        })
    }
  }, [])

  const handleSupport = async (amount: string, label: string) => {
    if (isPaddleConfigured() && paddleReady) {
      // 使用 Paddle 支付
      await openPaddleCheckout(amount, label, {
        timestamp: new Date().toISOString(),
      })
    } else {
      // 未配置 Paddle，显示提示信息
      alert(`Thank you for your support! Payment processing for $${amount} will be available soon.\n\nPlease contact us if you'd like to support this project.`)
    }
  }

  const handleCustomAmount = () => {
    if (!customAmount || parseFloat(customAmount) <= 0) {
      alert('Please enter a valid amount')
      return
    }
    handleSupport(customAmount, 'Custom Amount')
  }

  return (
    <div className="page-container support-page">
      <div className="page-header">
        <div className="support-header-wrapper">
          <h1 className="page-title support-header-title">{t('support.title')}</h1>
          <div className="support-content">
            <p className="support-description">{t('support.description')}</p>
            <p className="support-description">{t('support.description2')}</p>
          </div>
        </div>
      </div>

      <div className="support-options">
        <button
          className="support-button coffee"
          onClick={() => handleSupport('5', t('support.buyCoffee'))}
        >
          <Coffee size={24} />
          <span className="button-label">{t('support.buyCoffee')}</span>
          <span className="button-amount">$5</span>
        </button>

        <button
          className="support-button feature"
          onClick={() => handleSupport('10', t('support.sponsorFeature'))}
        >
          <Rocket size={24} />
          <span className="button-label">{t('support.sponsorFeature')}</span>
          <span className="button-amount">$10</span>
        </button>

        <button
          className="support-button supporter"
          onClick={() => handleSupport('20', t('support.superSupporter'))}
        >
          <Gem size={24} />
          <span className="button-label">{t('support.superSupporter')}</span>
          <span className="button-amount">$20</span>
        </button>

        <div className="support-button custom">
          <DollarSign size={24} />
          <span className="button-label">{t('support.customAmount')}</span>
          <div className="custom-amount-wrapper">
            <input
              type="number"
              className="custom-amount-input"
              placeholder="$0.00"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              min="1"
              step="0.01"
            />
            <button
              className="custom-submit-button"
              onClick={handleCustomAmount}
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>

      <div className="support-goal">
        <div className="goal-item">
          <span className="goal-label">{t('support.nextGoal')}:</span>
          <span className="goal-value">{t('support.goalAmount')}</span>
        </div>
        <div className="goal-item">
          <span className="goal-label">{t('support.currentSupport')}:</span>
          <span className="goal-value">$12/month</span>
        </div>
      </div>

      <div className="support-disclaimer">
        <h3 className="disclaimer-title">{t('support.disclaimer')}</h3>
        <p className="disclaimer-text">{t('support.disclaimerText')}</p>
      </div>
    </div>
  )
}
