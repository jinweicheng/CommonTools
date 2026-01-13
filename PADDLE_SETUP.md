# Paddle 支付集成说明

## 📋 配置步骤

### 1. 注册 Paddle 账号
访问 [Paddle 官网](https://vendors.paddle.com/) 注册账号并完成验证。

### 2. 获取 Vendor ID
1. 登录 Paddle Dashboard
2. 进入 **Settings > Account**
3. 找到 **Vendor ID**（通常是一个数字，如 `123456`）

### 3. 配置项目
打开 `src/config/paddle.config.ts` 文件，替换以下配置：

```typescript
export const paddleConfig: PaddleConfig = {
  // 替换为你的 Paddle Vendor ID
  vendorId: 'YOUR_PADDLE_VENDOR_ID',  // ← 替换这里
  // 开发/测试阶段使用 'sandbox'，上线后改为 'production'
  environment: 'sandbox',  // ← 测试完成后改为 'production'
  sandboxUrl: 'https://sandbox-checkout.paddle.com',
  productionUrl: 'https://checkout.paddle.com',
}
```

### 4. 测试支付流程
1. 在 `paddle.config.ts` 中设置 `environment: 'sandbox'`
2. 使用 Paddle 提供的测试卡号进行测试
3. 测试成功后，将 `environment` 改为 `'production'`

### 5. 生产环境部署
1. 确保 `environment` 设置为 `'production'`
2. 确保 `vendorId` 是生产环境的 Vendor ID
3. 重新构建并部署项目

## 🔧 技术实现

### 支付流程
1. 用户点击支持按钮
2. 系统加载 Paddle SDK
3. 打开 Paddle Checkout Overlay
4. 用户完成支付
5. Paddle 回调处理支付结果

### 文件说明
- `src/config/paddle.config.ts` - Paddle 配置文件
- `src/utils/paddleService.ts` - Paddle 支付服务封装
- `src/pages/SupportPage.tsx` - 支持页面（已集成 Paddle）

## 📝 注意事项

1. **测试环境**：开发阶段务必使用 `sandbox` 环境
2. **Vendor ID**：确保使用正确的 Vendor ID（测试和生产环境可能不同）
3. **HTTPS**：Paddle 要求生产环境必须使用 HTTPS
4. **CSP 策略**：已更新 `index.html` 的 CSP 以允许 Paddle CDN

## 🧪 测试卡号

Paddle 沙盒环境测试卡号：
- 卡号：`4242 4242 4242 4242`
- 过期日期：任意未来日期
- CVV：任意3位数字
- 邮编：任意有效邮编

## 📚 参考文档

- [Paddle 官方文档](https://developer.paddle.com/)
- [Paddle Checkout 文档](https://developer.paddle.com/paddlejs/overview)
- [Paddle API 文档](https://developer.paddle.com/api-reference/overview)
