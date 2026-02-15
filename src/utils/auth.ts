import apiClient from './apiClient'

type TokenResponse = {
  token?: string
  accessToken?: string
  refreshToken?: string
  username?: string
  email?: string
}

function getAccessTokenFromResponse(data: TokenResponse | null | undefined): string | null {
  if (!data) return null
  return data.accessToken || data.token || null
}

export async function login(username: string, password: string): Promise<TokenResponse | null> {
  const res = await apiClient.post('/auth/login', { username, password }).catch(() => null)
  if (!res || !res.data) return null
  const data = res.data as TokenResponse
  // If backend returns refreshToken (non-httpOnly), store as fallback
  if (data.refreshToken) safeSetRefreshToken(data.refreshToken)
  const mapped = getAccessTokenFromResponse(data)
  if (mapped) data.accessToken = mapped
  return data
}

export async function register(
  username: string,
  email: string,
  password: string
): Promise<TokenResponse | null> {
  const res = await apiClient.post('/auth/register', { username, email, password }).catch(() => null)
  if (!res || !res.data) return null
  const data = res.data as TokenResponse
  if (data.refreshToken) safeSetRefreshToken(data.refreshToken)
  const mapped = getAccessTokenFromResponse(data)
  if (mapped) data.accessToken = mapped
  return data
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken })
    } else {
      // Backward-compatible call for cookie-based implementations
      await apiClient.post('/auth/logout', {})
    }
  } catch {
    // ignore
  }
  safeRemoveRefreshToken()
}

export async function refreshAccessToken(): Promise<string | null> {
  // Single-flight guard: if a refresh is already in progress, wait for it.
  // This prevents sending multiple /auth/refresh calls in parallel.
  if ((refreshAccessToken as any)._inflight) {
    return (refreshAccessToken as any)._inflight
  }

  const inflight = (async (): Promise<string | null> => {
    // Attempt refresh via httpOnly cookie first (backend should support /auth/refresh without body)
    try {
      const res = await apiClient.post('/auth/refresh', {})
      const token = getAccessTokenFromResponse((res?.data || null) as TokenResponse | null)
      if (token) {
        if (res.data?.refreshToken) safeSetRefreshToken(res.data.refreshToken)
        return token
      }
    } catch {
      // ignore and fallback
    }

    // Fallback: if refresh token stored in localStorage, send it to server
    const refresh = getRefreshToken()
    if (refresh) {
      try {
        const res = await apiClient.post('/auth/refresh', { refreshToken: refresh })
        const token = getAccessTokenFromResponse((res?.data || null) as TokenResponse | null)
        if (token) {
          if (res.data.refreshToken) safeSetRefreshToken(res.data.refreshToken)
          return token
        }
      } catch {
        // ignore
      }
    }

    return null
  })()

  ;(refreshAccessToken as any)._inflight = inflight
  try {
    const result = await inflight
    return result
  } finally {
    // clear inflight regardless of success/failure so subsequent calls can retry
    delete (refreshAccessToken as any)._inflight
  }
}

const REFRESH_KEY = 'refresh_token'

export function safeSetRefreshToken(t: string) {
  try {
    localStorage.setItem(REFRESH_KEY, t)
  } catch {}
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function safeRemoveRefreshToken() {
  try {
    localStorage.removeItem(REFRESH_KEY)
  } catch {}
}

export function parseTokenFromUrl(): TokenResponse | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)

  // Hash fragment support: #access_token=...&refresh_token=...
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const hashParams = new URLSearchParams(hash)

  const accessToken =
    params.get('token') ||
    params.get('access_token') ||
    hashParams.get('token') ||
    hashParams.get('access_token')
  const refreshToken =
    params.get('refresh') ||
    params.get('refresh_token') ||
    hashParams.get('refresh') ||
    hashParams.get('refresh_token')
  if (!accessToken && !refreshToken) return null
  return { accessToken: accessToken ?? undefined, refreshToken: refreshToken ?? undefined }
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp) return false
    const now = Math.floor(Date.now() / 1000)
    return payload.exp <= now + 10 // treat near-expiry as expired
  } catch {
    return false
  }
}
