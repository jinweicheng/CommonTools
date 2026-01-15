# FFmpeg 初始化问题调试指南

## 问题现象

FFmpeg 文件加载成功（从 CDN 或本地），但在初始化阶段（`ffmpeg.load()`）卡在 50% 不再前进。

```
[ffmpeg-core.js] ✓ Successfully loaded
[ffmpeg-core.wasm] ✓ Successfully loaded  
Initializing FFmpeg...
[卡在这里，不再有输出]
```

## 原因分析

### 1. 内存限制
- FFmpeg WASM 需要大量内存（>100MB）
- 浏览器可能限制了 WebAssembly 的内存使用
- 特别是在移动设备或低配置电脑上

### 2. 浏览器兼容性
- 某些浏览器版本对 WebAssembly 支持不完整
- SharedArrayBuffer 可能被禁用（需要特定的 HTTP 头）
- 需要检查浏览器版本

### 3. 网络连接
- 虽然文件下载完成，但初始化时可能还需要额外的网络请求
- 某些网络环境可能阻止了这些请求

## 解决方案

### 1. 检查浏览器支持

在浏览器控制台运行：

```javascript
// 检查 WebAssembly 支持
console.log('WebAssembly:', typeof WebAssembly !== 'undefined');

// 检查 SharedArrayBuffer 支持
console.log('SharedArrayBuffer:', typeof SharedArrayBuffer !== 'undefined');

// 检查内存限制
console.log('Memory:', performance.memory ? 
  `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB limit` : 
  'Memory info not available');
```

**预期输出：**
```
WebAssembly: true
SharedArrayBuffer: true
Memory: 2048MB limit (或更高)
```

### 2. 启用 SharedArrayBuffer（如果需要）

如果 SharedArrayBuffer 显示为 `false`，需要配置 HTTP 响应头：

**Nginx:**
```nginx
add_header Cross-Origin-Opener-Policy "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

**Apache:**
```apache
Header set Cross-Origin-Opener-Policy "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

**开发环境（Vite）：**

在 `vite.config.ts` 中添加：

```typescript
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
})
```

### 3. 增加浏览器内存限制

**Chrome/Edge：**
```bash
# Windows
chrome.exe --js-flags="--max-old-space-size=4096"

# Mac/Linux
google-chrome --js-flags="--max-old-space-size=4096"
```

**Firefox：**
```
about:config
javascript.options.mem.high_water_mark = 512
```

### 4. 使用更轻量的 FFmpeg 版本

如果只需要基本的视频转换功能，可以使用更小的 FFmpeg build。

修改 `LivePhotoConverter.tsx`：

```typescript
// 使用 mt（多线程）版本，更小但功能完整
const VERSION = '0.12.6';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${VERSION}/dist/umd/`;
```

### 5. 清除浏览器缓存和状态

1. 清除浏览器缓存（Ctrl+Shift+Delete）
2. 关闭所有浏览器标签
3. 重启浏览器
4. 以隐身模式重试

### 6. 检查控制台错误

查看浏览器控制台是否有额外的错误信息：

- 内存错误："Out of memory"
- CORS 错误："CORS policy"
- WebAssembly 错误："CompileError" 或 "LinkError"

## 已实现的优化

### 1. 初始化超时（60 秒）

代码已添加 60 秒超时，避免永久卡住：

```typescript
const initTimeout = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error('FFmpeg initialization timeout after 60s')), 60000)
})
```

### 2. 实时进度显示

每秒更新初始化进度：

```
FFmpeg initialization: 1s elapsed...
FFmpeg initialization: 2s elapsed...
...
```

### 3. 本地路径修复

修复了本地文件路径检测，确保优先使用本地文件：

```typescript
const pathPrefix = window.location.pathname.includes('/tools') ? '/tools' : ''
const localUrl = `${baseUrl}${pathPrefix}/${url}`
```

## 测试步骤

### 步骤 1：验证文件加载

打开浏览器控制台，应看到：

```
[ffmpeg-core.js] Local path will be: http://localhost:3001/tools/ffmpeg-core.js
[ffmpeg-core.js] Local test: ✓ (50ms)
[ffmpeg-core.js] ✓ Successfully loaded from Local in 0.12s
```

### 步骤 2：监控初始化

初始化应在 30 秒内完成：

```
Initializing FFmpeg...
FFmpeg initialization: 1s elapsed...
FFmpeg initialization: 2s elapsed...
...
FFmpeg loaded successfully!
```

### 步骤 3：测试转换

上传 MOV 文件并转换，应能正常工作。

## 常见问题

### Q1: 为什么本地文件不生效？

**检查文件是否存在：**
```bash
# 检查 public 目录
ls public/ffmpeg-core.*
```

**验证文件可访问：**

在浏览器中直接访问：
- `http://localhost:3001/tools/ffmpeg-core.js`
- `http://localhost:3001/tools/ffmpeg-core.wasm`

应该能下载文件（不是 404）。

### Q2: 初始化一直超时怎么办？

1. **切换浏览器：** 尝试 Chrome、Firefox、Edge
2. **检查内存：** 确保有足够可用内存（>2GB）
3. **关闭其他标签：** 释放内存
4. **使用生产 build：** `npm run build && npm run preview`

### Q3: 在生产环境中也卡住

**检查 HTTP 响应头：**

```bash
curl -I https://your-domain.com/tools/ffmpeg-core.js
```

应包含：
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Access-Control-Allow-Origin: *
```

### Q4: 移动设备上不工作

移动浏览器内存限制更严格：

1. **减少视频尺寸：** GIF 宽度限制在 480px
2. **使用 MP4 而不是 GIF：** MP4 更节省内存
3. **提示用户：** 建议在桌面设备上使用

## 备选方案

如果 FFmpeg WASM 确实无法工作，可以考虑：

### 1. 服务端转换

创建一个 API 端点处理视频转换：

```typescript
// 客户端上传文件到服务器
const formData = new FormData()
formData.append('video', movFile)

const response = await fetch('/api/convert-to-gif', {
  method: 'POST',
  body: formData
})

const gifBlob = await response.blob()
```

### 2. 使用在线服务

集成第三方视频转换 API：
- Cloudinary
- imgix
- FFmpeg API services

### 3. 限制功能

如果 FFmpeg 不可用，只提供基本功能：
- 仅支持静态图片转换（不需要 FFmpeg）
- 提示用户使用桌面应用

## 性能建议

### 开发环境
- 使用本地文件（0.6-1.3s 加载）
- 启用 source maps
- 使用开发者工具监控内存

### 生产环境
- 启用 gzip/brotli 压缩
- 配置 CDN 缓存
- 添加 Service Worker 缓存
- 预加载 FFmpeg 文件（用户访问页面时）

## 总结

FFmpeg 初始化卡住通常是以下原因之一：

1. ✅ **内存不足** → 增加内存限制或关闭其他标签
2. ✅ **浏览器不支持** → 使用现代浏览器（Chrome 90+）
3. ✅ **HTTP 头缺失** → 配置 COOP/COEP 头
4. ✅ **网络问题** → 使用本地文件
5. ✅ **文件损坏** → 重新下载 FFmpeg 文件

通过以上调试步骤和优化措施，99% 的初始化问题都能解决！

---

**更新时间：** 2025-01-15
**版本：** v1.1.0
