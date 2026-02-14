import React, { createContext, useContext, useEffect, useState } from 'react'
import { login as apiLogin, logout as apiLogout, refreshAccessToken, register as apiRegister } from '../utils/auth'
import apiClient from '../utils/apiClient'

type AuthContextValue = {
  accessToken: string | null
  isAuthenticated: boolean
  user: { username?: string | null } | null
  login: (username: string, password: string) => Promise<boolean>
  register: (username: string, email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  isVip: () => boolean
  setAccessToken: (t: string | null) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // keep access token in memory only
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    if (accessToken) {
      apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`
    } else {
      delete apiClient.defaults.headers.common.Authorization
    }
  }, [accessToken])

  // On mount, try to rebuild access token using httpOnly refresh cookie via backend
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const refreshed = await refreshAccessToken()
        if (mounted && refreshed) setAccessToken(refreshed)
      } catch {
        // ignore
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const login = async (username: string, password: string) => {
    const tokens = await apiLogin(username, password)
    if (tokens && tokens.accessToken) {
      // do NOT persist access token to localStorage; keep in memory only
      setAccessToken(tokens.accessToken)
      setUsername(tokens.username || username)
      return true
    }
    return false
  }

  const register = async (username: string, email: string, password: string) => {
    const tokens = await apiRegister(username, email, password)
    if (tokens && tokens.accessToken) {
      setAccessToken(tokens.accessToken)
      setUsername(tokens.username || username)
      return true
    }
    return false
  }

  const logout = async () => {
    await apiLogout()
    setAccessToken(null)
    setUsername(null)
  }

  const isVip = () => {
    if (!username) return false
    const v = username.toLowerCase()
    return v === 'admin' || v === 'vip' || v.includes('vip')
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        user: username ? { username } : null,
        login,
        register,
        logout,
        isVip,
        setAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext

