/**
 * Paddle 支付配置
 * 
 * 使用说明：
 * 1. 注册 Paddle 账号：https://vendors.paddle.com/
 * 2. 获取你的 Vendor ID 和 API Key
 * 3. 在 Paddle Dashboard 中创建产品
 * 4. 将下面的配置替换为你的实际值
 * 5. 测试环境使用 sandbox，生产环境使用 production
 */

export interface PaddleConfig {
  // Paddle Vendor ID（在 Paddle Dashboard > Settings > Account 中获取）
  vendorId: string
  // 环境：'sandbox' 用于测试，'production' 用于生产
  environment: 'sandbox' | 'production'
  // 沙盒环境 URL（测试用）
  sandboxUrl?: string
  // 生产环境 URL
  productionUrl?: string
}

// TODO: 注册 Paddle 后，替换以下配置
export const paddleConfig: PaddleConfig = {
  // 替换为你的 Paddle Vendor ID
  vendorId: 'YOUR_PADDLE_VENDOR_ID',
  // 开发/测试阶段使用 'sandbox'，上线后改为 'production'
  environment: 'sandbox',
  // Paddle Checkout URL（通常不需要修改）
  sandboxUrl: 'https://sandbox-checkout.paddle.com',
  productionUrl: 'https://checkout.paddle.com',
}

/**
 * 获取当前环境的 Paddle Checkout URL
 */
export function getPaddleCheckoutUrl(): string {
  if (paddleConfig.environment === 'sandbox') {
    return paddleConfig.sandboxUrl || 'https://sandbox-checkout.paddle.com'
  }
  return paddleConfig.productionUrl || 'https://checkout.paddle.com'
}

/**
 * 检查 Paddle 配置是否已设置
 */
export function isPaddleConfigured(): boolean {
  return paddleConfig.vendorId !== 'YOUR_PADDLE_VENDOR_ID' && paddleConfig.vendorId.length > 0
}
