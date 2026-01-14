# 🔧 Nginx 配置指南 - 支持两种URL格式

## 问题描述

用户希望以下两种URL格式都能正常工作，并且刷新页面时不会出现404：
- `https://commontools.top/conversion` （不带 `/tools/` 前缀）
- `https://commontools.top/tools/conversion` （带 `/tools/` 前缀）

## 解决方案

### 方案一：301重定向（推荐，SEO友好）

将不带 `/tools/` 前缀的URL永久重定向到带前缀的URL。

**优点**：
- SEO友好，统一URL格式
- 避免重复内容
- 浏览器会记住重定向，后续直接访问带前缀的URL

**Nginx 配置**：

```nginx
server {
    listen 80;
    server_name commontools.top;
    
    # HTTPS配置（如果有）
    # listen 443 ssl http2;
    # ssl_certificate /path/to/ssl/cert.pem;
    # ssl_certificate_key /path/to/ssl/key.pem;
    
    # 网站根目录（指向构建后的 dist 目录）
    root /path/to/your/dist;
    index index.html;
    
    # ========================================
    # 处理不带 /tools/ 前缀的路径（301重定向）
    # ========================================
    location ~ ^/(conversion|watermark|signature|compression|heic-to-jpg|password-manager|support|support-policy|privacy-policy|terms-of-service|login)/?$ {
        return 301 /tools$request_uri;
    }
    
    # ========================================
    # 处理根路径重定向到 /tools/
    # ========================================
    location = / {
        return 301 /tools/;
    }
    
    # ========================================
    # 处理带 /tools/ 前缀的路径（SPA路由支持）
    # ========================================
    location /tools/ {
        alias /path/to/your/dist/;
        try_files $uri $uri/ /tools/index.html;
    }
    
    # ========================================
    # PDF.js Worker MIME 类型配置
    # ========================================
    location ~ \.mjs$ {
        add_header Content-Type application/javascript;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # ========================================
    # 静态资源缓存
    # ========================================
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # ========================================
    # HTML 文件不缓存
    # ========================================
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    
    # ========================================
    # 安全头设置
    # ========================================
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # ========================================
    # Gzip 压缩
    # ========================================
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

### 方案二：直接服务 index.html（不重定向）

两种URL格式都直接服务 `index.html`，让前端路由处理。

**优点**：
- 用户看到的是原始URL
- 不需要重定向

**缺点**：
- 可能导致SEO问题（重复内容）
- 静态资源路径可能有问题（因为Vite的base是 `/tools/`）

**Nginx 配置**：

```nginx
server {
    listen 80;
    server_name commontools.top;
    
    root /path/to/your/dist;
    index index.html;
    
    # ========================================
    # 处理不带 /tools/ 前缀的路径
    # ========================================
    location ~ ^/(conversion|watermark|signature|compression|heic-to-jpg|password-manager|support|support-policy|privacy-policy|terms-of-service|login)/?$ {
        # 直接服务 /tools/index.html，让前端路由处理
        try_files /tools/index.html =404;
    }
    
    # ========================================
    # 处理根路径
    # ========================================
    location = / {
        try_files /tools/index.html =404;
    }
    
    # ========================================
    # 处理带 /tools/ 前缀的路径
    # ========================================
    location /tools/ {
        alias /path/to/your/dist/;
        try_files $uri $uri/ /tools/index.html;
    }
    
    # 其他配置同上...
}
```

## 推荐配置

**强烈推荐使用方案一（301重定向）**，因为：
1. ✅ SEO友好，统一URL格式
2. ✅ 避免重复内容问题
3. ✅ 浏览器会缓存重定向，提升性能
4. ✅ 符合最佳实践

## 部署步骤

1. **编辑 Nginx 配置文件**：
   ```bash
   sudo nano /etc/nginx/sites-available/commontools.top
   ```

2. **复制方案一的配置**到配置文件中

3. **修改路径**：
   - 将 `/path/to/your/dist` 替换为实际的 dist 目录路径

4. **测试配置**：
   ```bash
   sudo nginx -t
   ```

5. **重新加载 Nginx**：
   ```bash
   sudo systemctl reload nginx
   ```

6. **验证**：
   - 访问 `https://commontools.top/conversion` → 应该重定向到 `https://commontools.top/tools/conversion`
   - 访问 `https://commontools.top/tools/conversion` → 应该正常显示
   - 刷新页面 → 应该保持在当前页面，不出现404

## 注意事项

1. **前端配置**：
   - `vite.config.ts` 中 `base: '/tools/'` 已正确配置
   - `App.tsx` 中 `Router basename="/tools"` 已配置
   - 这些配置确保前端路由和资源路径都使用 `/tools/` 前缀

2. **静态资源**：
   - 由于 Vite 的 `base: '/tools/'`，所有静态资源路径都是 `/tools/assets/...`
   - 如果用户访问 `/conversion`，资源路径仍然是 `/tools/assets/...`，这是正确的
   - 301重定向后，URL变为 `/tools/conversion`，资源路径匹配

3. **缓存**：
   - 301重定向会被浏览器永久缓存
   - 如果以后想改变URL结构，需要清除浏览器缓存或使用302临时重定向

## 故障排查

### 问题1：重定向循环

**症状**：浏览器显示"重定向过多"

**解决**：检查 Nginx 配置，确保：
- 重定向规则不会互相冲突
- `/tools/` 路径不会再次重定向

### 问题2：静态资源404

**症状**：页面显示但CSS/JS加载失败

**解决**：
- 确认 Vite 配置中 `base: '/tools/'` 正确
- 确认 Nginx 配置中 `/tools/` location 正确设置
- 检查浏览器控制台的资源路径

### 问题3：刷新后404

**症状**：刷新页面后显示404

**解决**：
- 确认 `try_files` 配置正确
- 确认 `index.html` 文件存在于 dist 目录
- 检查 Nginx 错误日志：`sudo tail -f /var/log/nginx/error.log`
