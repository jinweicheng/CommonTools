import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  username: string
  isVip: boolean
  loginTime: number
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isVip: () => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  // 从localStorage加载登录状态
  useEffect(() => {
    const stored = localStorage.getItem('commontools_user')
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        // 检查登录是否过期（24小时）
        const now = Date.now()
        if (now - userData.loginTime < 24 * 60 * 60 * 1000) {
          setUser(userData)
        } else {
          localStorage.removeItem('commontools_user')
        }
      } catch (e) {
        console.error('加载用户数据失败', e)
      }
    }
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    // 简单的VIP账号验证（实际应用中应该连接后端）
    // VIP账号：admin/vip123 或 vip/vip123
    const isVip = (username === 'admin' && password === 'vip123') || 
                  (username === 'vip' && password === 'vip123')
    
    // 普通账号：user/user123
    const isValid = isVip || (username === 'user' && password === 'user123')

    if (isValid) {
      const userData: User = {
        username,
        isVip,
        loginTime: Date.now()
      }
      setUser(userData)
      localStorage.setItem('commontools_user', JSON.stringify(userData))
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('commontools_user')
  }

  const isVip = () => {
    return user?.isVip ?? false
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isVip }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

