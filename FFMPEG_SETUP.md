# FFmpeg 本地部署指南

## 问题说明

Live Photo 转换功能需要 FFmpeg WASM 库。默认情况下，系统会从 CDN 下载这些文件：
- `ffmpeg-core.js` (~1.5MB)
- `ffmpeg-core.wasm` (~32MB)

如果网络较慢或 CDN 访问受限，加载可能需要很长时间或失败。

## 解决方案：本地部署

将 FFmpeg 文件下载到项目的 `public` 目录，可以实现：
- ⚡ **更快的加载速度**（本地文件，无需等待 CDN）
- 🔒 **更高的可靠性**（不依赖外部 CDN）
- 📦 **离线可用**（无网络也能使用）

## 部署步骤

### 方法 1：手动下载（推荐）

1. **下载 FFmpeg WASM 文件**

   访问以下链接下载文件：
   - [ffmpeg-core.js](https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js)
   - [ffmpeg-core.wasm](https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm)

2. **放置文件**

   将下载的文件放到项目的 `public` 目录：
   ```
   public/
   ├── ffmpeg-core.js
   └── ffmpeg-core.wasm
   ```

3. **验证**

   刷新页面，打开浏览器控制台，应该看到：
   ```
   [ffmpeg-core.js] Loading from Local...
   [ffmpeg-core.js] Local test: ✓ (50ms)
   [ffmpeg-core.js] ✓ Successfully loaded from Local in 0.1s (1.5MB)
   ```

### 方法 2：使用命令行下载

**Windows (PowerShell):**
```powershell
cd public
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js" -OutFile "ffmpeg-core.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm" -OutFile "ffmpeg-core.wasm"
```

**Mac/Linux:**
```bash
cd public
curl -O https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js
curl -O https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm
```

### 方法 3：使用 npm 脚本（自动化）

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "download-ffmpeg": "node scripts/download-ffmpeg.js"
  }
}
```

创建 `scripts/download-ffmpeg.js`：

```javascript
const https = require('https');
const fs = require('fs');
const path = require('path');

const files = [
  { name: 'ffmpeg-core.js', size: '1.5MB' },
  { name: 'ffmpeg-core.wasm', size: '32MB' }
];

const baseUrl = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/';
const publicDir = path.join(__dirname, '..', 'public');

files.forEach(({ name, size }) => {
  const url = baseUrl + name;
  const dest = path.join(publicDir, name);

  console.log(`Downloading ${name} (${size})...`);

  const file = fs.createWriteStream(dest);
  https.get(url, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`✓ ${name} downloaded successfully`);
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    console.error(`✗ Failed to download ${name}:`, err.message);
  });
});
```

运行：
```bash
npm run download-ffmpeg
```

## 加载策略

系统会按以下顺序尝试加载：

1. **本地文件**（最快，推荐）
   - `/public/ffmpeg-core.js`
   - `/public/ffmpeg-core.wasm`

2. **CDN 备选**（自动降级）
   - jsDelivr CDN
   - unpkg CDN

## 验证部署

1. 打开浏览器控制台（F12）
2. 上传 MOV 文件并选择 GIF/MP4 转换
3. 点击"转换"按钮
4. 观察控制台输出：

**成功示例（本地加载）：**
```
[ffmpeg-core.js] Loading from Local...
[ffmpeg-core.js] ✓ Successfully loaded from Local in 0.12s (1.45MB)
[ffmpeg-core.wasm] Loading from Local...
[ffmpeg-core.wasm] ✓ Successfully loaded from Local in 0.85s (31.2MB)
FFmpeg loaded successfully
```

**降级示例（CDN）：**
```
[ffmpeg-core.js] Local test failed: 404 Not Found
[ffmpeg-core.js] Loading from CDN1...
[ffmpeg-core.js] ✓ Successfully loaded from CDN1 in 2.5s (1.45MB)
```

## 故障排除

### 问题：加载仍然很慢

**可能原因：**
- 文件未正确放置在 `public` 目录
- 浏览器缓存问题

**解决方法：**
```bash
# 1. 检查文件是否存在
ls public/ffmpeg-core.*

# 2. 清除浏览器缓存
# - Chrome: Ctrl+Shift+Delete
# - Firefox: Ctrl+Shift+Delete
# - 或使用隐身模式测试

# 3. 重启开发服务器
npm run dev
```

### 问题：CORS 错误

**错误信息：**
```
Access to fetch at 'file:///...' from origin 'http://localhost' has been blocked by CORS
```

**解决方法：**

确保文件在 `public` 目录（而不是 `src` 目录），Vite 会自动正确配置 CORS。

### 问题：加载超过 15 秒

如果加载超过 15 秒，界面会显示：
- ⏳ Loading is taking longer than expected...
- 提示下载本地文件
- "Cancel & Retry" 按钮

点击按钮可以取消当前加载并重试。

## 生产环境部署

### Nginx 配置

确保静态文件正确配置：

```nginx
location ~* \.(js|wasm)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    add_header Access-Control-Allow-Origin *;
}
```

### Apache 配置

在 `.htaccess` 中添加：

```apache
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType application/javascript "access plus 30 days"
    ExpiresByType application/wasm "access plus 30 days"
</IfModule>

<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
</IfModule>
```

### CDN 部署

如果使用 CDN（如 CloudFlare, AWS CloudFront）：
1. 确保 FFmpeg 文件上传到 CDN
2. 设置正确的 MIME 类型：
   - `.js` → `application/javascript`
   - `.wasm` → `application/wasm`
3. 启用 CORS
4. 配置长期缓存（30 天+）

## 文件大小和性能

| 文件 | 大小 | 本地加载时间 | CDN 加载时间 |
|------|------|--------------|--------------|
| ffmpeg-core.js | ~1.5MB | 0.1-0.2s | 1-3s |
| ffmpeg-core.wasm | ~32MB | 0.5-1s | 10-30s |
| **总计** | **~33.5MB** | **0.6-1.2s** | **11-33s** |

*注：CDN 加载时间取决于网络速度和 CDN 距离*

## 更新 FFmpeg 版本

如果需要更新 FFmpeg 版本（当前：0.12.6）：

1. 修改 `LivePhotoConverter.tsx` 中的版本号
2. 重新下载文件
3. 测试功能是否正常

## 总结

✅ **推荐配置：**
- 本地部署 FFmpeg 文件（33.5MB）
- 首次加载：0.6-1.2 秒
- 后续加载：浏览器缓存，即时可用

❌ **不推荐：**
- 仅依赖 CDN
- 首次加载：11-33 秒或更长
- 网络问题时可能完全失败

---

**需要帮助？** 查看浏览器控制台日志，或检查 [FFmpeg.wasm 官方文档](https://ffmpegwasm.netlify.app/)
