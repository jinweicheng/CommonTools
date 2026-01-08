import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogIn, User, Crown, Lock, AlertCircle } from 'lucide-react'
import './LoginPage.css'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const success = await login(username, password)
      if (success) {
        navigate('/')
      } else {
        setError('用户名或密码错误')
      }
    } catch (err) {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-icon">
            <Lock size={48} />
          </div>
          <h1 className="login-title">登录</h1>
          <p className="login-subtitle">
            登录后可使用 VIP 功能，包括加密文件备份等高级特性
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              <User size={18} />
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="form-input"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <Lock size={18} />
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="form-input"
              required
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <>
                <div className="spinner" />
                登录中...
              </>
            ) : (
              <>
                <LogIn size={20} />
                登录
              </>
            )}
          </button>
        </form>

        <div className="login-info">
          <div className="info-box">
            <Crown size={20} />
            <div>
              <strong>VIP 账号</strong>
              <p>admin / vip123 或 vip / vip123</p>
            </div>
          </div>
          <div className="info-box">
            <User size={20} />
            <div>
              <strong>普通账号</strong>
              <p>user / user123</p>
            </div>
          </div>
        </div>

        <div className="login-features">
          <h3>VIP 功能特性</h3>
          <ul>
            <li>✅ 加密文件操作记录备份</li>
            <li>✅ 备份数据云端同步（即将推出）</li>
            <li>✅ 批量操作历史记录</li>
            <li>✅ 高级加密选项</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

