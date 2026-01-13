import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

type Language = 'zh-CN' | 'en-US'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const locales: Record<Language, any> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

// 检测浏览器语言
function detectLanguage(): Language {
  if (typeof window === 'undefined') return 'en-US'
  
  const browserLang = navigator.language || (navigator as any).userLanguage || 'en-US'
  
  // 检查是否是中文（包括 zh-CN, zh-TW, zh-HK 等）
  if (browserLang.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }
  
  // 默认返回英文
  return 'en-US'
}

// 从 localStorage 获取保存的语言设置
function getSavedLanguage(): Language | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem('app-language')
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved as Language
  }
  return null
}

// 获取嵌套对象的值
function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return path // 如果找不到，返回原始路径
    }
  }
  return typeof value === 'string' ? value : path
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // 优先使用保存的语言设置
    const saved = getSavedLanguage()
    if (saved) return saved
    // 否则检测浏览器语言
    return detectLanguage()
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('app-language', lang)
  }

  const t = (key: string): string => {
    const locale = locales[language]
    return getNestedValue(locale, key)
  }

  useEffect(() => {
    // 监听语言变化，更新 HTML lang 属性
    document.documentElement.lang = language
  }, [language])

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
