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
    
    // 更新 meta 标签
    const locale = locales[language]
    const meta = locale.meta
    
    // 更新 title
    if (meta?.title) {
      document.title = meta.title
    }
    
    // 更新 description
    const descMeta = document.querySelector('meta[name="description"]')
    if (descMeta && meta?.description) {
      descMeta.setAttribute('content', meta.description)
    }
    
    // 更新 keywords
    const keywordsMeta = document.querySelector('meta[name="keywords"]')
    if (keywordsMeta && meta?.keywords) {
      keywordsMeta.setAttribute('content', meta.keywords)
    }
    
    // 更新 language meta
    const langMeta = document.querySelector('meta[name="language"]')
    if (langMeta) {
      langMeta.setAttribute('content', language)
    }
    
    // 更新 Open Graph 标签
    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle && meta?.ogTitle) {
      ogTitle.setAttribute('content', meta.ogTitle)
    }
    
    const ogDesc = document.querySelector('meta[property="og:description"]')
    if (ogDesc && meta?.ogDescription) {
      ogDesc.setAttribute('content', meta.ogDescription)
    }
    
    const ogLocale = document.querySelector('meta[property="og:locale"]')
    if (ogLocale) {
      ogLocale.setAttribute('content', language === 'zh-CN' ? 'zh_CN' : 'en_US')
    }
    
    const ogImageAlt = document.querySelector('meta[property="og:image:alt"]')
    if (ogImageAlt && meta?.ogImageAlt) {
      ogImageAlt.setAttribute('content', meta.ogImageAlt)
    }
    
    // 更新 Twitter Card 标签
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')
    if (twitterTitle && meta?.twitterTitle) {
      twitterTitle.setAttribute('content', meta.twitterTitle)
    }
    
    const twitterDesc = document.querySelector('meta[name="twitter:description"]')
    if (twitterDesc && meta?.twitterDescription) {
      twitterDesc.setAttribute('content', meta.twitterDescription)
    }
    
    const twitterImageAlt = document.querySelector('meta[name="twitter:image:alt"]')
    if (twitterImageAlt && meta?.twitterImageAlt) {
      twitterImageAlt.setAttribute('content', meta.twitterImageAlt)
    }
    
    // 更新结构化数据 (JSON-LD)
    const jsonLdScript = document.querySelector('script[type="application/ld+json"]')
    if (jsonLdScript && meta) {
      try {
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": meta.structuredDataName || "CommonTools",
          "alternateName": meta.structuredDataAlternateName || "CommonTools",
          "url": "https://commontools.top/tools/",
          "description": meta.structuredDataDescription || "",
          "applicationCategory": "UtilityApplication",
          "operatingSystem": "Web Browser",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": language === 'zh-CN' ? "CNY" : "USD"
          },
          "featureList": [
            meta.featurePdfEncryption || "PDF Encryption/Decryption",
            meta.featureFileEncryption || "File Encryption",
            meta.featureFormatConversion || "Format Conversion",
            meta.featurePdfWatermark || "PDF Watermark",
            meta.featureElectronicSignature || "Electronic Signature",
            meta.featureFileCompression || "File Compression/Decompression",
            meta.featureHeicToJpg || "HEIC to JPG"
          ],
          "screenshot": "https://commontools.top/tools/og-image.png",
          "softwareVersion": "1.0",
          "browserRequirements": "Requires JavaScript. Requires HTML5.",
          "permissions": meta.structuredDataPermissions || ""
        }
        jsonLdScript.textContent = JSON.stringify(jsonLd)
      } catch (err) {
        console.error('Failed to update JSON-LD:', err)
      }
    }
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
