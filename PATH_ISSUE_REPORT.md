# 🔍 路径问题排查报告

## 问题根源

**Vite 配置**：`vite.config.ts` 第 8 行
```typescript
base: '/tools/',
```

这意味着：
- **生产环境**：网站部署在 `https://commontools.top/tools/`
- **开发环境**：本地 `public` 文件从 `/` 访问（不是 `/tools/`）

---

## ✅ 已修复的问题

### 1. `index.html` - Favicon 路径
```html
<!-- ❌ 错误 -->
<link rel="icon" href="/tools/favicon.svg" />

<!-- ✅ 修复 -->
<link rel="icon" href="/favicon.svg" />
```

**原因**：开发环境中，public 文件直接从根路径访问

### 2. `index.html` - humans.txt 路径
```html
<!-- ❌ 错误 -->
<link rel="author" href="/tools/humans.txt" />

<!-- ✅ 修复 -->
<link rel="author" href="/humans.txt" />
```

### 3. `public/browserconfig.xml` - 图标路径
```xml
<!-- ❌ 错误 -->
<square150x150logo src="/tools/favicon-192x192.png"/>

<!-- ✅ 修复 -->
<square150x150logo src="/favicon-192x192.png"/>
```

---

## ✅ 确认正确的部分

### 1. 外部完整 URL（无需修改）
```html
<!-- ✅ 正确：这些是完整的外部 URL -->
<link rel="canonical" href="https://commontools.top/tools/" />
<meta property="og:url" content="https://commontools.top/tools/" />
<meta property="og:image" content="https://commontools.top/tools/og-image.png" />
<meta name="twitter:url" content="https://commontools.top/tools/" />
```

**原因**：生产环境确实部署在 `/tools/` 路径下

### 2. Vite 源代码路径（无需修改）
```html
<!-- ✅ 正确：Vite 会自动处理源代码路径 -->
<script type="module" src="/src/main.tsx"></script>
```

### 3. site.webmanifest 图标路径（已正确）
```json
{
  "icons": [
    {
      "src": "/favicon.svg",  // ✅ 正确
      "sizes": "any"
    }
  ]
}
```

---

## 📊 所有路径使用情况

### Public 文件引用（本地资源）

| 文件 | 路径 | 状态 |
|------|------|------|
| `index.html` | `/favicon.svg` | ✅ |
| `index.html` | `/favicon-32x32.png` | ✅ |
| `index.html` | `/favicon-16x16.png` | ✅ |
| `index.html` | `/apple-touch-icon.png` | ✅ |
| `index.html` | `/site.webmanifest` | ✅ |
| `index.html` | `/humans.txt` | ✅ |
| `browserconfig.xml` | `/favicon-192x192.png` | ✅ |
| `browserconfig.xml` | `/favicon-512x512.png` | ✅ |
| `site.webmanifest` | `/favicon.svg` | ✅ |
| `site.webmanifest` | `/favicon-192x192.png` | ✅ |
| `site.webmanifest` | `/favicon-512x512.png` | ✅ |

### 外部完整 URL（保持不变）

| 文件 | URL | 状态 |
|------|-----|------|
| `index.html` | `https://commontools.top/tools/` (canonical) | ✅ |
| `index.html` | `https://commontools.top/tools/` (og:url) | ✅ |
| `index.html` | `https://commontools.top/tools/og-image.png` (og:image) | ✅ |
| `index.html` | `https://commontools.top/tools/` (twitter:url) | ✅ |
| `index.html` | `https://commontools.top/tools/og-image.png` (twitter:image) | ✅ |
| `index.html` | `https://commontools.top/tools/favicon-512x512.png` (logo) | ✅ |

---

## 🎯 路径使用原则

### 规则 1: Public 文件使用相对根路径
```html
✅ <link rel="icon" href="/favicon.svg" />
❌ <link rel="icon" href="/tools/favicon.svg" />
```

**原因**：
- Vite 在构建时会自动添加 `base` 前缀
- 开发环境直接从根路径访问

### 规则 2: 外部 URL 使用完整路径
```html
✅ <link rel="canonical" href="https://commontools.top/tools/" />
❌ <link rel="canonical" href="https://commontools.top/" />
```

**原因**：
- 生产环境实际部署在 `/tools/` 子路径
- SEO 需要准确的完整 URL

### 规则 3: 源代码文件使用 Vite 路径
```html
✅ <script type="module" src="/src/main.tsx"></script>
❌ <script type="module" src="/tools/src/main.tsx"></script>
```

**原因**：
- Vite 会自动处理源代码路径
- 不需要手动添加 base 前缀

---

## 🔧 Vite 工作原理

### 开发环境 (`npm run dev`)
```
http://localhost:3000/
├── / (根路径)
│   ├── favicon.svg (public 文件)
│   ├── humans.txt (public 文件)
│   └── ...
└── /src/main.tsx (源代码)
```

### 生产环境 (`npm run build`)
```
https://commontools.top/tools/
├── /tools/ (base 路径)
│   ├── favicon.svg (自动添加前缀)
│   ├── humans.txt (自动添加前缀)
│   └── assets/ (构建产物)
```

**Vite 自动处理**：
- 源码中写 `/favicon.svg`
- 构建后变成 `/tools/favicon.svg`
- ✅ 两个环境都能正常工作

---

## ✅ 验证清单

### 本地开发环境
- [ ] `http://localhost:3000/` 能访问首页
- [ ] `http://localhost:3000/favicon.svg` 能看到图标
- [ ] `http://localhost:3000/humans.txt` 能看到内容
- [ ] 浏览器标签页显示新图标
- [ ] F12 → Network 无 404 错误

### 生产环境
- [ ] `https://commontools.top/tools/` 能访问首页
- [ ] `https://commontools.top/tools/favicon.svg` 能看到图标
- [ ] `https://commontools.top/tools/humans.txt` 能看到内容
- [ ] 浏览器标签页显示新图标
- [ ] Open Graph 图片正常显示

---

## 🐛 如果还有问题

### 1. 清除浏览器缓存
```
Ctrl + F5 (强制刷新)
或
F12 → Network → Disable cache
```

### 2. 检查文件是否存在
```bash
# 开发环境
http://localhost:3000/favicon.svg
http://localhost:3000/humans.txt

# 生产环境
https://commontools.top/tools/favicon.svg
https://commontools.top/tools/humans.txt
```

### 3. 检查 Vite 配置
```typescript
// vite.config.ts
export default defineConfig({
  base: '/tools/',  // 确认 base 路径正确
  // ...
})
```

### 4. 检查构建输出
```bash
npm run build
# 检查 dist 目录结构
```

---

## 📝 总结

### 问题原因
在 `index.html` 和 `browserconfig.xml` 中使用了 `/tools/` 前缀引用 public 文件，导致：
- ❌ 开发环境找不到文件（404）
- ❌ 图标无法显示

### 解决方案
所有 public 文件引用改为根路径（不带 `/tools/`）：
- ✅ `/favicon.svg` 而不是 `/tools/favicon.svg`
- ✅ `/humans.txt` 而不是 `/tools/humans.txt`
- ✅ Vite 构建时会自动添加 base 前缀

### 关键理解
```
源代码路径（开发&构建）: /favicon.svg
                         ↓ Vite build (自动添加 base)
生产环境实际路径: /tools/favicon.svg
```

**不要在源代码中写 `/tools/`，让 Vite 自动处理！** ✅

---

**更新时间**：2026-01-19  
**状态**：✅ 所有路径问题已修复
