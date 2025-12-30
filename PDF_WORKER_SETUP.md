# 📦 PDF.js Worker 配置说明

## 🔧 问题与解决方案

### 问题
CDN 加载 PDF.js worker 失败：
```
Failed to fetch: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js
```

### 解决方案
**使用本地 worker 文件**，确保在任何网络环境下都能正常工作。

---

## 📁 文件结构

```
CommonTools/
├── public/
│   └── pdf.worker.min.mjs          # 开发环境 worker
├── dist/
│   ├── assets/
│   ├── index.html
│   └── pdf.worker.min.mjs          # 生产环境 worker (需要部署)
└── src/
    └── components/
        ├── PDFSignature.tsx        # ✅ 已更新
        ├── PDFProtection.tsx       # ✅ 已更新
        ├── PDFWordConverter.tsx    # ✅ 已更新
        └── ConvertFromPDF.tsx      # ✅ 已更新
```

---

## 🔄 更新内容

### 所有 PDF 相关组件统一使用本地 worker

```typescript
// Before (CDN - 不稳定):
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

// After (本地 - 稳定):
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
```

### 更新的组件列表
1. ✅ `src/components/PDFSignature.tsx` - 电子签名
2. ✅ `src/components/PDFProtection.tsx` - PDF 保护
3. ✅ `src/components/PDFWordConverter.tsx` - Word ↔ PDF 转换
4. ✅ `src/components/ConvertFromPDF.tsx` - PDF 转其他格式

---

## 🚀 部署步骤

### 1. 构建项目
```bash
npm run build
```

### 2. 确保 worker 文件在 dist 目录
```bash
# Windows PowerShell
Copy-Item "public\pdf.worker.min.mjs" "dist\pdf.worker.min.mjs" -Force

# Linux/Mac
cp public/pdf.worker.min.mjs dist/pdf.worker.min.mjs
```

### 3. 部署文件到服务器
上传以下文件到服务器：
```
dist/
├── assets/
│   ├── index-*.css
│   └── index-*.js
├── index.html
└── pdf.worker.min.mjs    ⚠️ 重要：必须部署此文件！
```

### 4. 服务器配置

#### Nginx 配置
```nginx
location /tools/ {
    alias /path/to/dist/;
    try_files $uri $uri/ /tools/index.html;
    
    # 确保 worker 文件可访问
    location ~ \.mjs$ {
        add_header Content-Type application/javascript;
    }
}
```

#### Apache 配置
```apache
<Directory /path/to/dist>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    
    # 确保 .mjs 文件正确的 MIME 类型
    AddType application/javascript .mjs
</Directory>
```

---

## ✅ 验证部署

### 开发环境测试
```bash
npm run dev
# 访问 http://localhost:3001
# 测试电子签名功能
```

### 生产环境测试
1. 部署后访问：`http://your-domain/tools/`
2. 打开浏览器开发者工具 (F12)
3. 进入"电子签名"页面
4. 上传一个 PDF 文件
5. 检查 Network 标签，确认：
   ```
   ✅ GET /tools/pdf.worker.min.mjs - 200 OK
   ```

---

## 🔍 故障排查

### 问题 1: Worker 文件 404
**症状**：
```
Failed to fetch: http://your-domain/tools/pdf.worker.min.mjs
```

**解决**：
```bash
# 确认文件存在
ls dist/pdf.worker.min.mjs

# 重新复制
cp public/pdf.worker.min.mjs dist/pdf.worker.min.mjs

# 重新部署
```

### 问题 2: MIME 类型错误
**症状**：
```
Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/plain"
```

**解决**：
在服务器配置中添加：
```nginx
# Nginx
location ~ \.mjs$ {
    add_header Content-Type application/javascript;
}
```

```apache
# Apache
AddType application/javascript .mjs
```

### 问题 3: CORS 错误
**症状**：
```
Access to script at 'http://...' from origin 'http://...' has been blocked by CORS policy
```

**解决**：
确保 worker 文件与应用在同一域名下，或配置 CORS：
```nginx
add_header Access-Control-Allow-Origin *;
```

---

## 📊 文件大小

| 文件 | 大小 | 说明 |
|------|------|------|
| pdf.worker.min.mjs | ~1.3 MB | PDF.js worker 文件 |
| index-*.js | ~2.0 MB | 应用主文件 |
| index-*.css | ~65 KB | 样式文件 |

**总计**: ~3.4 MB (首次加载)

---

## 🎯 优势

### 使用本地 worker 的好处

✅ **稳定性**
- 不依赖外部 CDN
- 避免网络问题
- 确保版本一致

✅ **性能**
- 减少 DNS 查询
- 减少 HTTP 连接
- 更快的加载速度

✅ **隐私**
- 完全本地处理
- 无第三方请求
- 符合隐私政策

✅ **可控性**
- 完全控制文件
- 可以离线使用
- 便于调试

---

## 🔄 自动化部署脚本

### Windows (PowerShell)
```powershell
# deploy.ps1
Write-Host "开始构建..." -ForegroundColor Green
npm run build

Write-Host "复制 worker 文件..." -ForegroundColor Green
Copy-Item "public\pdf.worker.min.mjs" "dist\pdf.worker.min.mjs" -Force

Write-Host "验证文件..." -ForegroundColor Green
if (Test-Path "dist\pdf.worker.min.mjs") {
    Write-Host "✅ Worker 文件已准备好" -ForegroundColor Green
} else {
    Write-Host "❌ Worker 文件缺失" -ForegroundColor Red
    exit 1
}

Write-Host "构建完成！请上传 dist 目录到服务器" -ForegroundColor Green
```

### Linux/Mac (Bash)
```bash
#!/bin/bash
# deploy.sh

echo "开始构建..."
npm run build

echo "复制 worker 文件..."
cp public/pdf.worker.min.mjs dist/pdf.worker.min.mjs

echo "验证文件..."
if [ -f "dist/pdf.worker.min.mjs" ]; then
    echo "✅ Worker 文件已准备好"
else
    echo "❌ Worker 文件缺失"
    exit 1
fi

echo "构建完成！请上传 dist 目录到服务器"
```

---

## 📝 package.json 脚本

可以添加自动化脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "postbuild": "cp public/pdf.worker.min.mjs dist/pdf.worker.min.mjs",
    "preview": "vite preview"
  }
}
```

这样每次 `npm run build` 后会自动复制 worker 文件。

---

## 🎊 总结

### 关键点
1. ✅ 所有组件统一使用本地 worker
2. ✅ Worker 文件已复制到 dist 目录
3. ✅ 构建成功，准备部署
4. ⚠️ **部署时必须包含 `pdf.worker.min.mjs` 文件**

### 部署清单
- [ ] 运行 `npm run build`
- [ ] 确认 `dist/pdf.worker.min.mjs` 存在
- [ ] 上传整个 `dist/` 目录到服务器
- [ ] 配置服务器正确的 MIME 类型
- [ ] 测试电子签名功能

---

**版本**: v6.1.0  
**更新日期**: 2025-12-30  
**状态**: ✅ 生产就绪  

---

**现在可以安全部署了！记得上传 `pdf.worker.min.mjs` 文件！** 🚀

