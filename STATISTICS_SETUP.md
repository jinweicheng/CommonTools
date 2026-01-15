# 📊 使用统计功能设置指南

## 概述

前端已集成使用统计功能，会自动收集用户使用情况。本指南说明如何配置后端API以接收统计数据。

---

## 🔧 开发环境配置

### 1. Vite 代理配置（已配置）

`vite.config.ts` 中已配置API代理：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8080',
      changeOrigin: true,
      secure: false,
    }
  }
}
```

**说明**：
- 开发环境下，所有 `/api/*` 请求会被代理到 `http://127.0.0.1:8080`
- 如果后端运行在其他端口，请修改 `target` 配置

### 2. 后端API要求

后端需要实现以下接口：

**POST** `/api/statistics/usage`

请求体：
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "statistics": [
    {
      "module": "watermark",
      "action": "upload",
      "endpoint": "/tools/watermark",
      "ipAddress": null,
      "userAgent": "Mozilla/5.0...",
      "deviceType": "PC",
      "browser": "Chrome",
      "os": "Windows 10/11",
      "statDate": "2026-01-13",
      "statHour": 14
    }
  ]
}
```

详细API文档请参考：`USAGE_STATISTICS_API.md`

---

## 🚀 快速开始

### 方案一：后端API已实现

1. **确保后端服务运行在 8080 端口**
   ```bash
   # 启动后端服务（示例）
   npm run server
   # 或
   python app.py
   ```

2. **启动前端开发服务器**
   ```bash
   npm run dev
   ```

3. **测试统计功能**
   - 打开浏览器开发者工具（F12）
   - 进入 Network 标签
   - 执行操作（上传文件、下载文件等）
   - 查看是否有 `/api/statistics/usage` 请求
   - 确认返回 200 状态码

### 方案二：后端API未实现（开发阶段）

**当前状态**：统计功能已集成，但后端API未实现时会静默失败，**不影响应用正常使用**。

**特点**：
- ✅ 前端代码正常工作
- ✅ 统计数据会收集并尝试上报
- ✅ 如果API返回404，会静默处理，不显示错误
- ✅ 不影响用户体验

**开发建议**：
1. 先完成前端功能开发
2. 后端API实现后，统计数据会自动开始上报
3. 无需修改前端代码

---

## 🔍 验证统计功能

### 1. 检查用户ID生成

在浏览器控制台执行：
```javascript
// 检查localStorage中的用户ID
localStorage.getItem('commontools_user_id')
```

应该返回一个UUID字符串，例如：`550e8400-e29b-41d4-a716-446655440000`

### 2. 检查统计数据收集

在浏览器控制台执行：
```javascript
// 手动触发统计（测试用）
import { trackUsage } from './src/utils/usageStatisticsService'
trackUsage('test', 'view', '/tools/test')
```

### 3. 检查API请求

1. 打开浏览器开发者工具（F12）
2. 进入 Network 标签
3. 执行操作（上传文件、下载文件等）
4. 查看是否有 `/api/statistics/usage` 请求
5. 检查请求体和响应

---

## 📝 环境变量配置（可选）

如果需要自定义API地址，可以创建 `.env` 文件：

### 开发环境（.env.development）

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

### 生产环境（.env.production）

```env
VITE_API_BASE_URL=https://commontools.top/api
```

**注意**：
- 环境变量必须以 `VITE_` 开头
- 修改后需要重启开发服务器

---

## 🐛 故障排查

### 问题1：404 Not Found

**症状**：Network标签显示 `/api/statistics/usage` 返回 404

**原因**：后端API未实现

**解决**：
- **开发阶段**：可以忽略，不影响使用
- **生产环境**：需要实现后端API（参考 `USAGE_STATISTICS_API.md`）

### 问题2：CORS 错误

**症状**：浏览器控制台显示 CORS 错误

**原因**：后端未配置CORS

**解决**：在后端添加CORS配置：
```javascript
// Express示例
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}))
```

### 问题3：代理不工作

**症状**：请求没有代理到后端

**解决**：
1. 确认 `vite.config.ts` 中代理配置正确
2. 确认后端服务正在运行
3. 重启开发服务器：`npm run dev`

### 问题4：统计数据未上报

**症状**：执行操作后，Network标签中没有统计请求

**检查**：
1. 确认 `StatisticsProvider` 已正确集成到 `App.tsx`
2. 检查浏览器控制台是否有错误
3. 确认用户ID已生成：`localStorage.getItem('commontools_user_id')`

---

## 📊 统计功能说明

### 自动统计

以下操作会自动记录：
- ✅ 页面访问（路由变化）
- ✅ 文件上传（PDF水印工具）
- ✅ 文件下载（PDF水印工具）
- ✅ 生成预览（PDF水印工具）

### 手动统计

在其他组件中添加统计：

```typescript
import { trackFileUpload, trackFileDownload, trackUsage } from '../utils/usageStatisticsService'

// 文件上传
trackFileUpload('conversion', 'pdf')

// 文件下载
trackFileDownload('signature', 'pdf')

// 其他操作
trackUsage('compression', 'compress', '/tools/compression')
```

---

## 🔐 隐私说明

- 用户ID存储在浏览器localStorage中，不会上传到服务器（除非用户执行操作）
- 统计数据不包含文件内容，只记录操作类型
- IP地址由后端从请求头获取，前端不收集
- 所有统计都是匿名的，无法识别具体用户身份

---

## 📚 相关文档

- **API文档**：`USAGE_STATISTICS_API.md` - 详细的API接口说明和实现示例
- **数据库表结构**：参考 `USAGE_STATISTICS_API.md` 中的数据库表结构

---

## ✅ 检查清单

- [ ] 后端API已实现（如果已实现）
- [ ] Vite代理配置正确（开发环境）
- [ ] 用户ID已生成（检查localStorage）
- [ ] 统计请求正常发送（检查Network标签）
- [ ] 无CORS错误（检查控制台）

---

**注意**：在开发阶段，如果后端API未实现，统计功能会静默失败，**不会影响应用的正常使用**。等后端API实现后，统计数据会自动开始上报。
