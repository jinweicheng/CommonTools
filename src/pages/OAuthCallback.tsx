import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { parseTokenFromUrl, safeSetRefreshToken } from '../utils/auth'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const { setAccessToken } = useAuth()

  useEffect(() => {
    const tokens = parseTokenFromUrl()
    const query = new URLSearchParams(window.location.search)
    const hashStr = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    const hash = new URLSearchParams(hashStr)
    const nextPath = query.get('state') || hash.get('state') || '/'

    if (tokens) {
      if (tokens.accessToken) setAccessToken(tokens.accessToken)
      if (tokens.refreshToken) safeSetRefreshToken(tokens.refreshToken)

      // Clean URL (remove query/hash token params)
      const url = new URL(window.location.href)
      url.search = ''
      url.hash = ''
      window.history.replaceState({}, document.title, url.toString())

      // Redirect to home or a deep link
      navigate(nextPath)
    } else {
      // No tokens in URL — simply redirect
      navigate(nextPath)
    }
  }, [navigate, setAccessToken])

  return <div>Processing sign-in callback...</div>
}
