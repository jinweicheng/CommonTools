import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogIn, User, Crown, Lock, AlertCircle, Mail, UserPlus } from 'lucide-react'
import './LoginPage.css'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const nextPath = new URLSearchParams(location.search).get('next') || '/'
  const apiBase =
    ((import.meta.env.VITE_API_BASE_URL as string) ||
      (import.meta.env.VITE_API_BASE as string) ||
      '/api')
      .replace(/\/$/, '')

  const oauthHref = (provider: 'google' | 'github' | 'microsoft' | 'facebook' | 'linkedin') =>
    `${apiBase}/oauth2/authorization/${provider}?state=${encodeURIComponent(nextPath)}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'register') {
      if (!email || !email.includes('@')) {
        setError('Please enter a valid email address.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setLoading(true)

    try {
      const success =
        mode === 'login'
          ? await login(username, password)
          : await register(username, email, password)
      if (success) {
        navigate(nextPath)
      } else {
        setError(mode === 'login' ? 'Invalid username or password.' : 'Registration failed.')
      }
    } catch {
      setError(mode === 'login' ? 'Sign-in failed, please try again.' : 'Sign-up failed, please try again.')
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
          <h1 className="login-title">{mode === 'login' ? 'Sign In' : 'Create Account'}</h1>
          <p className="login-subtitle">
            Secure authentication with local account and OAuth providers.
          </p>
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`mode-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login')
              setError(null)
            }}
          >
            <LogIn size={16} /> Sign In
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            <UserPlus size={16} /> Sign Up
          </button>
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
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="form-input"
              required
              autoFocus
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">
                <Mail size={18} />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="form-input"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              <Lock size={18} />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="form-input"
              required
            />
          </div>

          {mode === 'login' && (
            <div className="form-help">
              <Link to="/forgot" className="forgot-link">Forgot password?</Link>
            </div>
          )}

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">
                <Lock size={18} />
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="form-input"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={
              loading ||
              !username ||
              !password ||
              (mode === 'register' && (!email || !confirmPassword))
            }
          >
            {loading ? (
              <>
                <div className="spinner" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              <>
                {mode === 'login' ? <LogIn size={20} /> : <UserPlus size={20} />}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </>
            )}
          </button>
        </form>

        <div className="social-login">
          <p>Continue with</p>
          <div className="social-buttons">
            <a className="social-btn google" href={oauthHref('google')}>
              Google
            </a>
            <a className="social-btn github" href={oauthHref('github')}>
              GitHub
            </a>
            <a className="social-btn microsoft" href={oauthHref('microsoft')}>
              Microsoft
            </a>
            <a className="social-btn facebook" href={oauthHref('facebook')}>
              Facebook
            </a>
            <a className="social-btn linkedin" href={oauthHref('linkedin')}>
              LinkedIn
            </a>
          </div>
        </div>

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

