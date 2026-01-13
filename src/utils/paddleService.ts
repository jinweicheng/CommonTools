/**
 * Paddle 支付服务
 * 
 * 使用 Paddle Checkout Overlay 方式集成支付
 * 参考文档：https://developer.paddle.com/paddlejs/overview
 */

import { paddleConfig, isPaddleConfigured as checkPaddleConfigured } from '../config/paddle.config'

// 重新导出配置检查函数，方便其他模块使用
export { checkPaddleConfigured as isPaddleConfigured }

// Paddle JS SDK 类型声明
declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: 'sandbox' | 'production') => void
      }
      Checkout: {
        open: (options: PaddleCheckoutOptions) => void
      }
      Setup: (options: PaddleSetupOptions) => void
    }
  }
}

interface PaddleCheckoutOptions {
  items?: Array<{
    priceId?: string
    quantity?: number
    price?: {
      amount: string
      currencyCode: string
    }
  }>
  customData?: Record<string, any>
  settings?: {
    displayMode?: 'overlay' | 'inline'
    theme?: 'light' | 'dark'
    locale?: string
    successUrl?: string
    allowQuantity?: boolean
  }
  customer?: {
    email?: string
    country?: string
  }
  eventCallback?: (data: any) => void
}

interface PaddleSetupOptions {
  environment?: 'sandbox' | 'production'
  token?: string
  eventCallback?: (data: any) => void
}

/**
 * 加载 Paddle JS SDK
 */
export async function loadPaddleSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    if (window.Paddle) {
      resolve()
      return
    }

    // 创建 script 标签
    const script = document.createElement('script')
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    script.async = true
    script.onload = () => {
      if (window.Paddle) {
        // 设置环境
        window.Paddle.Environment.set(paddleConfig.environment)
        resolve()
      } else {
        reject(new Error('Paddle SDK failed to load'))
      }
    }
    script.onerror = () => {
      reject(new Error('Failed to load Paddle SDK'))
    }
    document.head.appendChild(script)
  })
}

/**
 * 初始化 Paddle
 */
export async function initializePaddle(): Promise<boolean> {
  if (!checkPaddleConfigured()) {
    console.warn('Paddle is not configured. Please set your Vendor ID in paddle.config.ts')
    return false
  }

  try {
    await loadPaddleSDK()
    
    if (window.Paddle) {
      window.Paddle.Setup({
        environment: paddleConfig.environment,
        token: paddleConfig.vendorId,
        eventCallback: (data) => {
          console.log('Paddle event:', data)
        },
      })
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to initialize Paddle:', error)
    return false
  }
}

/**
 * 打开 Paddle Checkout 支付
 * @param amount 支付金额（美元）
 * @param label 支付标签/描述
 * @param customData 自定义数据
 */
export async function openPaddleCheckout(
  amount: string,
  label: string,
  customData?: Record<string, any>
): Promise<void> {
  if (!checkPaddleConfigured()) {
    alert('Payment system is not configured. Please contact support.')
    return
  }

  const initialized = await initializePaddle()
  if (!initialized || !window.Paddle) {
    alert('Payment system initialization failed. Please try again later.')
    return
  }

  const amountInCents = Math.round(parseFloat(amount) * 100).toString()

  try {
    window.Paddle.Checkout.open({
      items: [
        {
          price: {
            amount: amountInCents,
            currencyCode: 'USD',
          },
          quantity: 1,
        },
      ],
      customData: {
        support_type: label,
        ...customData,
      },
      settings: {
        displayMode: 'overlay',
        theme: 'light',
        locale: 'en',
        allowQuantity: false,
      },
      eventCallback: (data) => {
        console.log('Paddle checkout event:', data)
        
        if (data.name === 'checkout.completed') {
          // 支付成功
          alert(`Thank you for your support! Your payment of $${amount} has been processed successfully.`)
          // 这里可以发送支付成功通知到后端（如果需要）
        } else if (data.name === 'checkout.closed') {
          // 用户关闭了支付窗口
          console.log('Checkout closed by user')
        } else if (data.name === 'checkout.error') {
          // 支付错误
          console.error('Checkout error:', data)
          alert('Payment processing error. Please try again.')
        }
      },
    })
  } catch (error) {
    console.error('Failed to open Paddle checkout:', error)
    alert('Failed to open payment window. Please try again.')
  }
}

/**
 * 检查 Paddle SDK 是否可用
 */
export function isPaddleAvailable(): boolean {
  return typeof window !== 'undefined' && window.Paddle !== undefined
}
