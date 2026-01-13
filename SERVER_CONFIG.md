# 🔧 服务器配置说明

## PDF.js Worker MIME 类型配置

### 问题
如果服务器将 `pdf.worker.min.mjs` 文件返回为 `application/octet-stream`，浏览器会拒绝加载，导致错误：
```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/octet-stream".
```

### 解决方案

#### Nginx 配置
在 `nginx.conf` 或站点配置文件中添加：

```nginx
location ~* \.mjs$ {
    add_header Content-Type application/javascript;
    add_header Access-Control-Allow-Origin *;
}
```

或者更具体的配置：

```nginx
location /tools/pdf.worker.min.mjs {
    add_header Content-Type application/javascript;
    add_header Access-Control-Allow-Origin *;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

#### Apache 配置
在 `.htaccess` 或 `httpd.conf` 中添加：

```apache
<IfModule mod_mime.c>
    AddType application/javascript .mjs
</IfModule>
```

或者：

```apache
<FilesMatch "\.mjs$">
    Header set Content-Type "application/javascript"
</FilesMatch>
```

#### Node.js/Express 配置
如果使用 Express 静态文件服务：

```javascript
app.use('/tools/pdf.worker.min.mjs', (req, res, next) => {
  res.setHeader('Content-Type', 'application/javascript')
  next()
}, express.static('public'))
```

#### 通用解决方案
如果无法修改服务器配置，应用会自动使用 CDN 作为降级方案，CDN 会正确设置 MIME 类型。

---

## Content Security Policy (CSP)

应用已配置 CSP，允许 worker 从以下源加载：
- `'self'` - 同源
- `blob:` - Blob URL（PDF.js 内部使用）
- CDN 域名（jsdelivr.net, unpkg.com, cdnjs.cloudflare.com）

如果服务器有自己的 CSP 头，请确保包含：
```
worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com;
```

---

## 文件部署检查清单

- [ ] `pdf.worker.min.mjs` 文件已部署到 `/tools/pdf.worker.min.mjs`
- [ ] 服务器配置了正确的 MIME 类型（`application/javascript`）
- [ ] CSP 策略允许 worker 加载
- [ ] 文件权限正确（可读）
- [ ] 如果使用 CDN，确保网络连接正常

---

## 验证方法

1. **检查 MIME 类型**：
   ```bash
   curl -I https://commontools.top/tools/pdf.worker.min.mjs
   ```
   应该看到：`Content-Type: application/javascript`

2. **浏览器测试**：
   - 打开开发者工具（F12）
   - 查看 Network 标签
   - 加载 PDF 文件
   - 检查 `pdf.worker.min.mjs` 请求的响应头

3. **控制台检查**：
   - 应该看到：`✅ PDF.js Worker: Using CDN - ...` 或 `✅ PDF.js Worker: Using LOCAL - ...`
   - 不应该看到 MIME 类型错误
