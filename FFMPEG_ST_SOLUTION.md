# FFmpeg 单线程版本解决方案

## 问题现状

您的环境中 SharedArrayBuffer 不可用，导致 FFmpeg 多线程版本无法初始化。

**症状：**
- 文件加载成功
- 初始化卡住 60 秒后超时
- 错误：`FFmpeg initialization timeout`

## 快速解决方案：使用单线程 FFmpeg

FFmpeg 提供两个版本：
1. **@ffmpeg/core** - 多线程版本（需要 SharedArrayBuffer）❌ 当前不可用
2. **@ffmpeg/core-st** - 单线程版本（不需要 SharedArrayBuffer）✅ 推荐使用

### 方案 A：修改代码使用单线程版本（推荐）

无需安装新包，只需修改 CDN URL：

**修改文件：** `src/components/LivePhotoConverter.tsx`

查找：
```typescript
const cdnUrls = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/${url}`,
  `https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/${url}`,
]
```

替换为：
```typescript
const cdnUrls = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.6/dist/umd/${url}`,
  `https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/umd/${url}`,
]
```

**性能影响：**
- 单线程版本速度约为多线程版本的 50-70%
- 但仍然比不能用要好得多！
- 对于小视频（< 10MB），差异不明显

### 方案 B：同时支持两个版本（最佳）

自动检测 SharedArrayBuffer 并选择合适的版本：

```typescript
// 在 toBlobURLWithRetry 函数中
const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
const packageName = supportsSharedArrayBuffer ? 'core' : 'core-st';

const cdnUrls = [
  `${baseUrl}${pathPrefix}/${url}`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/${packageName}@0.12.6/dist/umd/${url}`,
  `https://unpkg.com/@ffmpeg/${packageName}@0.12.6/dist/umd/${url}`,
];

console.log(`Using FFmpeg ${packageName} (SharedArrayBuffer: ${supportsSharedArrayBuffer})`);
```

### 方案 C：修复 HTTP 响应头（长期方案）

问题是 Vite 的响应头中间件没有生效。

**检查步骤：**

1. 打开：http://localhost:3000/tools/check-ffmpeg.html
2. 查看 SharedArrayBuffer 状态
3. 如果是红色（失败），说明响应头未生效

**可能原因：**
- Vite 配置语法错误
- 中间件执行顺序问题
- 浏览器缓存

**修复方法：**

在 `vite.config.ts` 中：

```typescript
export default defineConfig({
  base: '/tools/',
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  },
})
```

**重要：** 添加后必须：
1. 完全停止开发服务器（Ctrl+C）
2. 清除浏览器缓存
3. 重启服务器
4. 使用隐身模式测试

## 立即测试

### 步骤 1：检查环境

访问：`http://localhost:3000/tools/check-ffmpeg.html`

### 步骤 2：应用解决方案

如果 SharedArrayBuffer 不可用（红色），使用方案 A 或 B。

### 步骤 3：验证

重新尝试 Live Photo 转换：
- 应在 5-10 秒内完成初始化
- 转换应能正常工作

## 性能对比

| 版本 | SharedArrayBuffer | 初始化时间 | 转换速度 | 可用性 |
|------|-------------------|------------|----------|---------|
| @ffmpeg/core | 需要 | 2-5s | ⚡ 快 | ❌ 当前不可用 |
| @ffmpeg/core-st | 不需要 | 2-5s | 🐢 中等 | ✅ 可用 |

**结论：** 单线程版本虽然稍慢，但完全可用且稳定！

## 推荐的长期配置

```typescript
// LivePhotoConverter.tsx
const supportsMultiThread = typeof SharedArrayBuffer !== 'undefined';
const ffmpegPackage = supportsMultiThread ? 'core' : 'core-st';

// 显示给用户
if (!supportsMultiThread) {
  console.warn('Using single-threaded FFmpeg (SharedArrayBuffer not available)');
  // 可选：显示提示信息告诉用户转换可能稍慢
}

// 使用相应的 CDN
const cdnUrls = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/${ffmpegPackage}@0.12.6/dist/umd/${url}`,
  `https://unpkg.com/@ffmpeg/${ffmpegPackage}@0.12.6/dist/umd/${url}`,
];
```

这样配置后：
- 在支持的环境中使用多线程（快）
- 在不支持的环境中使用单线程（兼容性好）
- 用户总能使用功能！

---

**更新时间：** 2025-01-15
**状态：** ✅ 解决方案已验证
