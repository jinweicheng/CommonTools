# FFmpeg WASM HTTP 响应头配置指南

## 为什么需要特殊的 HTTP 响应头？

FFmpeg WASM 使用 **SharedArrayBuffer** 来实现高性能的多线程处理。出于安全考虑，浏览器要求使用 SharedArrayBuffer 的网站必须配置特定的 HTTP 响应头。

### 必需的响应头

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 可选但推荐的响应头

```
Cross-Origin-Resource-Policy: cross-origin
Access-Control-Allow-Origin: *
```

## 症状：缺少响应头时的表现

如果没有正确配置这些响应头，FFmpeg 初始化会失败：

**控制台错误：**
```
Uncaught (in promise) ReferenceError: SharedArrayBuffer is not defined
```

**或者：**
```
FFmpeg initialization timeout after 60s
```

**行为：**
- 文件加载成功（JS 和 WASM）
- 初始化卡在 50%
- 永远不会完成

## 解决方案

### 开发环境（Vite）

✅ **已配置** - `vite.config.ts` 已包含必要的响应头中间件：

```typescript
{
  name: 'configure-response-headers',
  configureServer: (server) => {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  }
}
```

**验证：**
```bash
# 重启开发服务器
npm run dev

# 在浏览器中访问
http://localhost:3001/tools/

# 打开开发者工具 -> Network
# 选择任何请求，查看 Response Headers
# 应看到：
# Cross-Origin-Opener-Policy: same-origin
# Cross-Origin-Embedder-Policy: require-corp
```

### 生产环境

#### Nginx

✅ **已配置** - `public/nginx.conf.example` 和 `public/nginx.conf.production` 已包含：

```nginx
location ~* \.(wasm|js)$ {
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cross-Origin-Embedder-Policy "require-corp";
    add_header Cross-Origin-Resource-Policy "cross-origin";
    add_header Access-Control-Allow-Origin *;
}
```

**部署步骤：**

1. 复制配置到你的 Nginx 站点配置：
   ```bash
   sudo nano /etc/nginx/sites-available/your-site
   ```

2. 重新加载 Nginx：
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. 验证配置：
   ```bash
   curl -I https://your-domain.com/tools/ffmpeg-core.js
   ```

#### Apache

✅ **已配置** - `public/.htaccess` 已包含：

```apache
<IfModule mod_headers.c>
    Header set Cross-Origin-Opener-Policy "same-origin"
    Header set Cross-Origin-Embedder-Policy "require-corp"
    Header set Cross-Origin-Resource-Policy "cross-origin"
</IfModule>
```

**部署步骤：**

1. 确保 `.htaccess` 文件在 `dist/` 目录：
   ```bash
   cp public/.htaccess dist/
   ```

2. 启用 `mod_headers`：
   ```bash
   sudo a2enmod headers
   sudo systemctl restart apache2
   ```

3. 验证配置：
   ```bash
   curl -I https://your-domain.com/tools/
   ```

## 验证配置

### 方法 1：浏览器开发者工具

1. 打开网站
2. F12 打开开发者工具
3. Network 标签
4. 刷新页面
5. 点击任何请求
6. 查看 Response Headers

**应看到：**
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 方法 2：命令行

```bash
curl -I https://your-domain.com/tools/
```

**预期输出：**
```
HTTP/1.1 200 OK
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
...
```

### 方法 3：JavaScript 检测

在浏览器控制台运行：

```javascript
// 检查 SharedArrayBuffer 是否可用
console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined')

// 如果输出 true，说明响应头配置正确
```

## 常见问题

### Q1: 开发环境中 SharedArrayBuffer 不可用

**解决方法：**

1. 确认 `vite.config.ts` 包含响应头配置
2. 重启开发服务器：
   ```bash
   # 完全停止
   Ctrl+C
   
   # 重新启动
   npm run dev
   ```
3. 清除浏览器缓存（Ctrl+Shift+Delete）
4. 使用隐身模式测试

### Q2: 生产环境中响应头不生效

**Nginx 排查：**

```bash
# 1. 检查配置语法
sudo nginx -t

# 2. 查看配置是否加载
sudo nginx -T | grep -A 5 "Cross-Origin"

# 3. 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 4. 重新加载配置
sudo systemctl reload nginx
```

**Apache 排查：**

```bash
# 1. 检查 mod_headers 是否启用
apache2ctl -M | grep headers

# 2. 查看错误日志
sudo tail -f /var/log/apache2/error.log

# 3. 重启服务
sudo systemctl restart apache2
```

### Q3: CDN 部署时的响应头

如果使用 CDN（如 CloudFlare, AWS CloudFront），需要在 CDN 设置中添加响应头。

**CloudFlare：**

1. 登录 CloudFlare Dashboard
2. Rules → Transform Rules → Modify Response Header
3. 添加规则：
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`

**AWS CloudFront：**

1. 创建 Response Headers Policy
2. 添加自定义头：
   ```json
   {
     "Cross-Origin-Opener-Policy": "same-origin",
     "Cross-Origin-Embedder-Policy": "require-corp"
   }
   ```
3. 关联到 Distribution

### Q4: 响应头影响其他功能

这些响应头可能影响：
- 跨域 iframe
- 跨域弹窗（window.open）
- 某些第三方脚本

**解决方法：**

只对需要 FFmpeg 的页面启用响应头：

**Nginx:**
```nginx
location /tools/live-photo {
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cross-Origin-Embedder-Policy "require-corp";
    try_files $uri $uri/ /tools/index.html;
}
```

**Apache (.htaccess):**
```apache
<If "%{REQUEST_URI} =~ m#^/tools/live-photo#">
    Header set Cross-Origin-Opener-Policy "same-origin"
    Header set Cross-Origin-Embedder-Policy "require-corp"
</If>
```

## 测试清单

开发环境部署后，按以下步骤测试：

- [ ] 重启开发服务器
- [ ] 清除浏览器缓存
- [ ] 访问 Live Photo 页面
- [ ] 打开浏览器控制台
- [ ] 运行：`console.log('SharedArrayBuffer:', typeof SharedArrayBuffer !== 'undefined')`
- [ ] 应输出：`SharedArrayBuffer: true`
- [ ] 上传 MOV 文件并转换
- [ ] 应在 5-10 秒内完成初始化
- [ ] 转换应成功完成

## 性能影响

这些响应头对性能的影响：

✅ **正面影响：**
- 启用 SharedArrayBuffer
- 多线程处理
- 更快的视频转换（2-3 倍提升）

❌ **潜在负面影响：**
- 无法在跨域 iframe 中使用
- 某些跨域功能受限

**权衡：** 对于 Live Photo 转换功能，启用这些响应头是必需的，性能提升远大于限制。

## 总结

| 环境 | 配置文件 | 状态 |
|------|----------|------|
| Vite 开发 | `vite.config.ts` | ✅ 已配置 |
| Vite 预览 | `vite.config.ts` | ✅ 已配置 |
| Nginx | `public/nginx.conf.example` | ✅ 已配置 |
| Nginx 生产 | `public/nginx.conf.production` | ✅ 已配置 |
| Apache | `public/.htaccess` | ✅ 已配置 |

**下一步：**
1. 重启开发服务器
2. 验证响应头
3. 测试 Live Photo 转换功能

---

**更新时间：** 2025-01-15
**版本：** v1.2.0
