/**
 * 邮件发送服务
 * 支持两种方式：
 * 1. 后端API（如果可用）
 * 2. EmailJS（作为备选方案）
 */

import { getUserId } from './userIdService'
import { getDeviceInfo, type DeviceInfo } from './deviceDetector'
import { trackUsage } from './usageStatisticsService'

interface EmailData {
  name: string
  email: string
  subject: string
  message: string
}

interface EmailApiData extends EmailData {
  userId: string
  userAgent?: string
  deviceType?: string
  browser?: string
  os?: string
  ipAddress?: string | null
  timestamp: string
}

// API基础URL（从环境变量或配置中获取）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || ''
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || ''

/**
 * 获取当前日期时间（YYYY-MM-DD HH:mm:ss格式）
 */
function getCurrentDateTime(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * 通过后端API发送邮件
 */
async function sendEmailViaAPI(data: EmailData): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = getUserId()
    const deviceInfo: DeviceInfo = getDeviceInfo()
    
    // 准备API请求数据
    const apiData: EmailApiData = {
      ...data,
      userId,
      userAgent: deviceInfo.userAgent,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: null, // IP地址由后端从请求头获取
      timestamp: getCurrentDateTime()
    }

    const response = await fetch(`${API_BASE_URL}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiData)
    })

    if (!response.ok) {
      // 开发环境下，如果后端API未实现（404），静默处理
      if (response.status === 404 && import.meta.env.DEV) {
        console.debug('Email API not implemented yet (404). Data:', apiData)
        return {
          success: false,
          error: 'Email API not available'
        }
      }
      return {
        success: false,
        error: `API Error: ${response.status} ${response.statusText}`
      }
    }

    const result = await response.json()
    return { success: true, ...result }
  } catch (error) {
    // 开发环境下，如果是网络错误（后端未启动），静默处理
    if (import.meta.env.DEV) {
      console.debug('Email API unavailable (development mode). Error:', error)
      return {
        success: false,
        error: 'Email API unavailable'
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
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

  // Fixing potential undefined `window.emailjs` in `sendEmailViaEmailJS`.
  if (!window.emailjs) {
    return {
      success: false,
      error: 'EmailJS library is not loaded. Please check your configuration.',
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
  // 记录邮件发送统计
  trackUsage('email', 'send', '/api/email/send')

  // 首先尝试使用后端API
  const apiResult = await sendEmailViaAPI(data)
  
  // 如果API成功，直接返回
  if (apiResult.success) {
    // 记录API发送成功的统计
    trackUsage('email', 'api_success', '/api/email/send')
    return apiResult
  }

  // 如果API失败（404或网络错误），尝试使用EmailJS
  console.log('API unavailable, trying EmailJS...', apiResult.error)
  
  const emailjsResult = await sendEmailViaEmailJS(data)
  
  if (emailjsResult.success) {
    // 记录EmailJS发送成功的统计
    trackUsage('email', 'emailjs_success', '/api/email/send')
    return emailjsResult
  }

  // 如果两种方式都失败，返回错误
  trackUsage('email', 'send_failed', '/api/email/send')
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
