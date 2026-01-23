# FFmpeg.wasm 配置指南

## 🎯 问题说明

FFmpeg.wasm 需要 `SharedArrayBuffer` 才能正常工作，而 `SharedArrayBuffer` 需要特定的 HTTP 头部支持。

## ✅ 解决方案

### 1. Nginx 配置（生产环境）

在 `/tools/` location 块中添加以下头部：

```nginx
location /tools/ {
    alias /var/www/html/tools/;
    try_files $uri $uri/ /tools/index.html;
    
    # 启用 SharedArrayBuffer（FFmpeg.wasm 必需）
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "cross-origin" always;
    
    # 确保 HTML 文件不缓存
    location ~ \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        # SharedArrayBuffer 头部（必须重复，因为 add_header 在嵌套 location 中不继承）
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Resource-Policy "cross-origin" always;
    }
}
```

### 2. Vite 配置（开发环境）

**重要**：`base` 配置必须根据环境动态设置：

```typescript
export default defineConfig(({ mode }) => ({
  // 只在生产环境使用 /tools/ 前缀，开发环境使用根路径
  base: mode === 'production' ? '/tools/' : '/',
  
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  }
}))
```

**原因**：FFmpeg.wasm 内部会创建 Worker，如果在开发环境使用 `/tools/` 前缀，会导致 Worker 路径错误（404）。

### 3. React Router 配置

**同步更新 Router basename**：

在 `src/App.tsx` 中：

```typescript
// 使用 Vite 环境变量自动适配 basename
<Router basename={import.meta.env.BASE_URL}>
  {/* routes */}
</Router>
```

**说明**：Router 的 basename 必须与 Vite 的 base 保持一致，否则路由无法正常工作。

### 4. 下载 FFmpeg 文件

运行以下命令下载必需的 FFmpeg 文件到 `public/` 目录：

```bash
npm run download-ffmpeg
```

这将下载：
- `ffmpeg-core.js` (~1.5MB)
- `ffmpeg-core.wasm` (~32MB)

## 🔍 验证配置

### 方法 1：使用检查工具

访问：`http://localhost:3000/check-ffmpeg-files.html`

或：`https://commontools.top/tools/check-ffmpeg-files.html`

该工具会自动检查：
- SharedArrayBuffer 可用性
- WebAssembly 支持
- HTTP 头部配置
- FFmpeg 文件存在性

### 方法 2：浏览器控制台检查

打开浏览器控制台（F12），运行：

```javascript
// 检查 SharedArrayBuffer
typeof SharedArrayBuffer !== 'undefined'  // 应返回 true

// 检查 WebAssembly
typeof WebAssembly !== 'undefined'  // 应返回 true

// 检查 HTTP 头部
fetch(window.location.href).then(r => {
  console.log('COOP:', r.headers.get('cross-origin-opener-policy'))  // 应为 'same-origin'
  console.log('COEP:', r.headers.get('cross-origin-embedder-policy'))  // 应为 'require-corp'
})
```

## 📋 部署步骤

### 开发环境

1. 确保 `vite.config.ts` 已更新（已完成）
2. 下载 FFmpeg 文件：
   ```bash
   npm run download-ffmpeg
   ```
3. 重启开发服务器：
   ```bash
   npm run dev
   ```
4. 访问检查工具验证：`http://localhost:3000/check-ffmpeg-files.html`

### 生产环境

1. 更新服务器上的 Nginx 配置：
   ```bash
   # 备份当前配置
   sudo cp /etc/nginx/sites-available/commontools.conf /etc/nginx/sites-available/commontools.conf.backup
   
   # 上传新配置
   scp public/nginx.conf.production root@your-server:/etc/nginx/sites-available/commontools.conf
   
   # 测试配置
   sudo nginx -t
   
   # 重新加载 Nginx
   sudo systemctl reload nginx
   ```

2. 确保 FFmpeg 文件已上传到服务器：
   ```bash
   # 本地运行
   npm run download-ffmpeg
   
   # 上传文件
   scp public/ffmpeg-core.js root@your-server:/var/www/html/tools/
   scp public/ffmpeg-core.wasm root@your-server:/var/www/html/tools/
   scp public/check-ffmpeg-files.html root@your-server:/var/www/html/tools/
   ```

3. 访问检查工具验证：`https://commontools.top/tools/check-ffmpeg-files.html`

## ⚠️ 常见问题

### Q1: SharedArrayBuffer is not defined

**原因**：服务器未发送正确的 COOP/COEP 头部

**解决**：
1. 检查 Nginx 配置是否正确
2. 确保执行了 `nginx -t` 和 `systemctl reload nginx`
3. 清除浏览器缓存（Ctrl + Shift + Delete）
4. 使用 curl 检查头部：
   ```bash
   curl -I https://commontools.top/tools/ | grep -i cross-origin
   ```

### Q2: FFmpeg 初始化超时

**原因**：FFmpeg 文件缺失或损坏

**解决**：
1. 运行 `npm run download-ffmpeg` 重新下载
2. 检查文件大小：
   - `ffmpeg-core.js` 应约 1.5MB
   - `ffmpeg-core.wasm` 应约 32MB
3. 检查文件权限（服务器）：
   ```bash
   ls -lh /var/www/html/tools/ffmpeg-*
   chmod 644 /var/www/html/tools/ffmpeg-*
   ```

### Q3: 本地开发环境正常，生产环境失败

**原因**：Nginx 配置未更新或缓存问题

**解决**：
1. 确认 Nginx 配置已更新
2. 清除 CDN/浏览器缓存
3. 使用浏览器隐私模式测试
4. 检查 Nginx 错误日志：
   ```bash
   tail -f /var/log/nginx/commontools.error.log
   ```

### Q4: Worker 404 错误 (`/tools/node_modules/.vite/deps/worker.js`)

**原因**：开发环境使用了 `/tools/` base 路径，导致 FFmpeg.wasm 内部 Worker 路径错误

**解决**：
1. 确保 `vite.config.ts` 使用动态 base：
   ```typescript
   base: mode === 'production' ? '/tools/' : '/'
   ```
2. 重启开发服务器：
   ```bash
   npm run dev
   ```

### Q5: 视频压缩很慢

**原因**：FFmpeg.wasm 运行在 WebAssembly 中，没有硬件加速

**说明**：这是技术限制，无法避免。建议：
- 提示用户使用较小的视频文件
- 限制视频分辨率（如最大 1080p）
- 对大文件建议用户使用桌面软件

## 📊 性能参考

| 视频大小 | 分辨率 | 预估压缩时间 |
|---------|--------|------------|
| 50MB    | 1080p  | 2-5 分钟   |
| 100MB   | 1080p  | 5-10 分钟  |
| 200MB   | 4K     | 15-30 分钟 |

⚠️ 超过 500MB 的视频可能导致浏览器内存不足。

## 🔗 参考资源

- [FFmpeg.wasm 官方文档](https://ffmpegwasm.netlify.app/)
- [SharedArrayBuffer 和 COOP/COEP](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)
- [Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy)

## ✨ 更新日志

- 2026-01-22：初始版本，添加 FFmpeg.wasm 支持和 SharedArrayBuffer 配置
