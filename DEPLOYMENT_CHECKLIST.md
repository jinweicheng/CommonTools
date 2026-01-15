# ✅ Live Photo 功能部署检查清单

## 前端部署

### 1. 文件确认

- [x] ✅ `src/components/LivePhotoConverter.tsx` - 转换器组件
- [x] ✅ `src/components/LivePhotoConverter.css` - 样式文件
- [x] ✅ `src/pages/LivePhotoPage.tsx` - 页面组件
- [x] ✅ `src/pages/LivePhotoPage.css` - 页面样式
- [x] ✅ 国际化配置（zh-CN.ts 和 en-US.ts）
- [x] ✅ 路由配置（App.tsx）
- [x] ✅ 导航菜单（Layout.tsx）

### 2. 依赖安装

- [x] ✅ `@ffmpeg/ffmpeg` - 视频处理
- [x] ✅ `@ffmpeg/util` - FFmpeg 工具
- [x] ✅ `gif.js` - GIF 生成
- [x] ✅ `heic2any` - HEIC 转换

### 3. 配置更新

- [x] ✅ `sitemap.xml` - 添加 /live-photo 路由
- [x] ✅ `.htaccess` - 添加路由重定向规则
- [x] ✅ `nginx.conf.production` - 添加路由支持
- [x] ✅ `nginx.conf.example` - 更新示例配置

---

## 构建部署

### 1. 构建项目

```bash
npm run build
```

### 2. 复制配置文件

```bash
# Apache
cp public/.htaccess dist/.htaccess

# Nginx
# 手动复制 public/nginx.conf.production 到服务器配置
```

### 3. 部署 dist 目录

```bash
# 上传到服务器
rsync -avz dist/ user@server:/var/www/html/tools/
```

### 4. 配置 Headers

确保服务器配置了正确的 Headers（支持 SharedArrayBuffer）：

**Nginx**:
```nginx
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
```

**Apache**:
```apache
Header set Cross-Origin-Embedder-Policy "require-corp"
Header set Cross-Origin-Opener-Policy "same-origin"
```

⚠️ **重要**：这些 Headers 是 FFmpeg WebAssembly 正常工作的必需条件！

---

## 验证测试

### 1. 功能测试

- [ ] 访问 `/tools/live-photo` 页面正常显示
- [ ] 上传 HEIC 文件成功
- [ ] 上传 MOV 文件成功
- [ ] 静态图片模式转换成功
- [ ] GIF 动图模式转换成功
- [ ] MP4 视频模式转换成功
- [ ] 下载功能正常
- [ ] 进度显示正常
- [ ] 错误提示正常

### 2. 性能测试

- [ ] FFmpeg 加载成功（首次约30秒）
- [ ] 转换速度可接受（<30秒）
- [ ] 内存占用正常（<500MB）
- [ ] 浏览器无卡顿

### 3. 兼容性测试

- [ ] Chrome 浏览器正常
- [ ] Edge 浏览器正常
- [ ] Firefox 浏览器正常
- [ ] Safari 浏览器正常
- [ ] 移动端显示正常
- [ ] 响应式布局正常

### 4. 国际化测试

- [ ] 中文界面显示正常
- [ ] 英文界面显示正常
- [ ] 语言切换正常
- [ ] 所有文字已翻译

### 5. SEO测试

- [ ] `/tools/live-photo` 路由可访问
- [ ] 刷新页面不出现404
- [ ] sitemap.xml 包含新路由
- [ ] robots.txt 允许爬取

---

## 常见问题排查

### 问题1：FFmpeg 加载失败

**症状**："视频处理引擎加载失败"

**检查**：
1. 网络连接是否正常
2. 浏览器是否支持 WebAssembly
3. 是否配置了正确的 CORS Headers
4. 控制台是否有错误信息

**解决**：
```nginx
# 添加 CORS Headers
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
```

### 问题2：转换速度很慢

**原因**：
- 设备性能较低
- GIF 参数设置过高
- MOV 文件过大

**优化**：
1. 降低 GIF 宽度（480px → 360px）
2. 降低帧率（10fps → 8fps）
3. 使用 MP4 代替 GIF
4. 压缩原始 MOV 文件

### 问题3：GIF 文件过大

**解决**：
1. 降低宽度
2. 降低帧率
3. 提高质量数值（10 → 15）
4. 使用 MP4 格式

---

## 性能优化建议

### 1. CDN 加速

将 FFmpeg WASM 文件部署到 CDN：
```typescript
const baseURL = 'https://your-cdn.com/@ffmpeg/core@0.12.6/dist/umd'
```

### 2. 预加载

在首页预加载 FFmpeg：
```typescript
useEffect(() => {
  loadFFmpeg() // 后台加载
}, [])
```

### 3. Worker 优化

将 FFmpeg 处理放到 Web Worker 中（避免阻塞主线程）：
```typescript
const worker = new Worker('./ffmpeg.worker.js')
```

---

## 营销建议

### SEO 关键词

- Live Photo to GIF converter
- iPhone Live Photo converter
- HEIC to GIF online
- MOV to GIF free
- Live Photo to MP4

### 目标用户群

- iPhone 用户
- 安卓用户（接收 Live Photo）
- 微信/QQ 用户
- 内容创作者
- 社交媒体用户

### 推广渠道

- 产品目录（Product Hunt, Hacker News）
- 社交媒体（Twitter, Reddit）
- iPhone 相关论坛
- 技术博客文章

---

## 支持

- **使用指南**: `LIVE_PHOTO_GUIDE.md`
- **快速开始**: `LIVE_PHOTO_QUICK_START.md`
- **技术实现**: `LIVE_PHOTO_IMPLEMENTATION.md`
- **技术支持**: chengjinweigoole@gmail.com

---

**状态**: ✅ 已完成，生产就绪  
**版本**: 1.0.0  
**日期**: 2026-01-15
