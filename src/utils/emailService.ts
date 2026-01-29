/**
 * 邮件发送服务
 * 支持两种方式：
 * 1. 后端API（如果可用）
 * 2. EmailJS（作为备选方案）
 */

interface EmailData {
  name: string
  email: string
  subject: string
  message: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || ''
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || ''

/**
 * 通过后端API发送邮件
 */
async function sendEmailViaAPI(data: EmailData): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `API Error: ${response.status} ${errorText || response.statusText}`,
      }
    }

    const result = await response.json()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 通过EmailJS发送邮件
 */
async function sendEmailViaEmailJS(data: EmailData): Promise<{ success: boolean; error?: string }> {
  // 检查配置
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    return {
      success: false,
      error: 'EmailJS configuration is missing. Please configure environment variables.',
    }
  }

  // 动态加载EmailJS库
  if (!window.emailjs) {
    try {
      // 使用CDN加载EmailJS
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
        script.onload = () => {
          // 初始化EmailJS
          if (window.emailjs) {
            window.emailjs.init(EMAILJS_PUBLIC_KEY)
          }
          resolve()
        }
        script.onerror = () => reject(new Error('Failed to load EmailJS library'))
        document.head.appendChild(script)
      })
    } catch (error) {
      return {
        success: false,
        error: 'Failed to load EmailJS library. Please check your internet connection.',
      }
    }
  }

  try {
    const result = await window.emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        from_name: data.name,
        from_email: data.email,
        subject: data.subject,
        message: data.message,
        to_email: 'chengjinweigoole@gmail.com', // 接收邮件的地址
      },
      EMAILJS_PUBLIC_KEY
    )

    if (result.status === 200) {
      return { success: true }
    } else {
      return {
        success: false,
        error: `EmailJS Error: ${result.text || 'Unknown error'}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 发送邮件（自动选择最佳方式）
 */
export async function sendEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
  // 首先尝试使用后端API
  const apiResult = await sendEmailViaAPI(data)
  
  // 如果API成功，直接返回
  if (apiResult.success) {
    return apiResult
  }

  // 如果API失败（404或网络错误），尝试使用EmailJS
  console.log('API unavailable, trying EmailJS...', apiResult.error)
  
  const emailjsResult = await sendEmailViaEmailJS(data)
  
  if (emailjsResult.success) {
    return emailjsResult
  }

  // 如果两种方式都失败，返回错误
  return {
    success: false,
    error: apiResult.error || emailjsResult.error || 'Failed to send email',
  }
}

// 扩展Window接口以包含emailjs
declare global {
  interface Window {
    emailjs?: {
      init: (publicKey: string) => void
      send: (
        serviceId: string,
        templateId: string,
        templateParams: Record<string, string>,
        publicKey: string
      ) => Promise<{ status: number; text: string }>
    }
  }
}
