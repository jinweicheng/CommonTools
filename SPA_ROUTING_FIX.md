# 🔧 SPA 路由刷新 404 问题解决方案

## 问题描述

当用户直接访问或刷新以下 URL 时会出现 404 错误：
- `https://commontools.top/tools/conversion` （带 `/tools/` 前缀）
- `https://commontools.top/conversion` （不带 `/tools/` 前缀）
- `https://commontools.top/tools/watermark`
- `https://commontools.top/watermark`
- 等等...

这是因为服务器尝试查找这些路径对应的文件，但实际上这些路由应该由前端 React Router 处理。

**需求**：支持两种URL格式，刷新页面时都能保持在当前页面，不出现404。

## 解决方案

### 1. Apache 服务器配置

#### 方法 A：使用 .htaccess 文件（推荐）

1. **构建项目**：
   ```bash
   npm run build
   ```

2. **复制 .htaccess 文件**：
   ```bash
   # 将 public/.htaccess 复制到 dist/ 目录
   cp public/.htaccess dist/.htaccess
   ```

3. **部署 dist/ 目录**到服务器的 `/tools/` 目录

4. **确保 Apache 启用了以下模块**：
   ```bash
   # Ubuntu/Debian
   sudo a2enmod rewrite
   sudo a2enmod headers
   sudo a2enmod mime
   sudo systemctl restart apache2
   ```

#### 方法 B：在 Apache 配置文件中设置

在 Apache 虚拟主机配置中添加：

```apache
<Directory /path/to/dist>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    
    # SPA 路由支持
    RewriteEngine On
    RewriteBase /tools/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [L]
    
    # MIME 类型
    AddType application/javascript .mjs
</Directory>
```

### 2. Nginx 服务器配置

编辑 Nginx 配置文件（通常在 `/etc/nginx/sites-available/your-site`）：

```nginx
server {
    listen 80;
    server_name commontools.top;
    
    root /path/to/dist;
    index index.html;
    
    location /tools/ {
        alias /path/to/dist/;
        try_files $uri $uri/ /tools/index.html;
    }
    
    # PDF.js Worker MIME 类型
    location ~ \.mjs$ {
        add_header Content-Type application/javascript;
    }
}
```

然后重新加载 Nginx：
```bash
sudo nginx -t  # 测试配置
sudo systemctl reload nginx  # 重新加载
```

### 3. 其他服务器

#### Node.js/Express

```javascript
const express = require('express');
const path = require('path');
const app = express();

app.use('/tools', express.static(path.join(__dirname, 'dist')));

// SPA 路由支持
app.get('/tools/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(3000);
```

#### Caddy

```
commontools.top {
    root * /path/to/dist
    file_server
    
    # SPA 路由支持
    try_files {path} /index.html
}
```

## 验证配置

部署后，测试以下操作：

1. **直接访问路由**：
   - 访问 `https://commontools.top/tools/conversion`
   - 应该正常显示页面，而不是 404

2. **刷新页面**：
   - 在任意路由页面按 F5 刷新
   - 应该保持在同一页面，而不是跳转到首页或显示 404

3. **浏览器开发者工具**：
   - 打开 Network 标签
   - 刷新页面
   - 应该看到 `index.html` 返回 200 状态码

## 常见问题

### Q: 配置后仍然出现 404

**A:** 检查以下几点：
1. 确认 `.htaccess` 文件已正确部署到服务器
2. 确认 Apache 的 `AllowOverride` 设置为 `All`
3. 确认 Apache 已启用 `mod_rewrite` 模块
4. 检查服务器错误日志：`tail -f /var/log/apache2/error.log`

### Q: 静态资源（CSS/JS）加载失败

**A:** 确保：
1. 所有静态资源路径都包含 `/tools/` 前缀
2. Vite 配置中 `base: '/tools/'` 已正确设置
3. 构建后的 `index.html` 中的资源路径正确

### Q: 开发环境正常，生产环境 404

**A:** 这是因为：
- Vite 开发服务器自动处理 SPA 路由
- 生产环境需要服务器配置
- 按照上述步骤配置服务器即可

## 文件说明

- `public/.htaccess` - Apache 服务器配置文件（需要部署到 dist/）
- `public/nginx.conf.example` - Nginx 配置示例
- `vite.config.ts` - 已更新，包含开发环境 SPA 路由支持

## 部署检查清单

- [ ] 运行 `npm run build` 构建项目
- [ ] 复制 `public/.htaccess` 到 `dist/.htaccess`
- [ ] 确认服务器已启用必要的模块（Apache: mod_rewrite, mod_headers, mod_mime）
- [ ] 部署 `dist/` 目录到服务器的 `/tools/` 目录
- [ ] 测试直接访问路由 URL
- [ ] 测试刷新页面功能
- [ ] 检查浏览器控制台是否有错误
