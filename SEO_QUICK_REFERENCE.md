# 🚀 SEO 快速参考指南

> **快速部署 SEO 优化的完整指南** | 更新时间：2026-01-19

---

## 📋 文件清单

### ✅ 已优化的文件

| 文件 | 位置 | 用途 | 状态 |
|------|------|------|------|
| `robots.txt` | `public/robots.txt` | 搜索引擎爬虫指令 | ✅ 已优化 |
| `sitemap.xml` | `public/sitemap.xml` | 网站地图（17个页面） | ✅ 已完善 |
| `humans.txt` | `public/humans.txt` | 团队与技术栈信息 | ✅ 新建 |
| `security.txt` | `public/.well-known/security.txt` | 安全政策 | ✅ 新建 |
| `browserconfig.xml` | `public/browserconfig.xml` | Windows 磁贴配置 | ✅ 新建 |
| `index.html` | `index.html` | Meta 标签与结构化数据 | ✅ 增强 |
| `nginx.conf.production` | `public/nginx.conf.production` | Nginx SEO 配置 | ✅ 优化 |

### 🔧 工具脚本

| 脚本 | 位置 | 用途 |
|------|------|------|
| `deploy-seo-files.sh` | `scripts/deploy-seo-files.sh` | 一键部署所有 SEO 文件 |
| `verify-seo.sh` | `scripts/verify-seo.sh` | 验证 SEO 配置 |

---

## ⚡ 快速部署

### 方式 1：使用部署脚本（推荐）

```bash
# 1. 配置脚本
nano scripts/deploy-seo-files.sh
# 修改 SERVER_HOST 为您的服务器地址

# 2. 运行部署
chmod +x scripts/deploy-seo-files.sh
./scripts/deploy-seo-files.sh
```

### 方式 2：手动部署

```bash
# 上传 SEO 文件
scp public/robots.txt root@server:/var/www/html/
scp public/sitemap.xml root@server:/var/www/html/
scp public/humans.txt root@server:/var/www/html/
scp public/browserconfig.xml root@server:/var/www/html/
scp -r public/.well-known root@server:/var/www/html/

# 更新 nginx 配置
scp public/nginx.conf.production root@server:/tmp/
ssh root@server "sudo cp /tmp/nginx.conf.production /etc/nginx/sites-available/commontools.top"
ssh root@server "sudo nginx -t && sudo systemctl reload nginx"
```

---

## 🔍 验证部署

### 在线验证

```bash
# 验证生产环境
chmod +x scripts/verify-seo.sh
./scripts/verify-seo.sh

# 验证本地开发环境
./scripts/verify-seo.sh --local

# 自定义 URL
./scripts/verify-seo.sh --url https://your-domain.com
```

### 手动验证

```bash
# 检查文件可访问性
curl https://commontools.top/tools/robots.txt
curl https://commontools.top/tools/sitemap.xml
curl https://commontools.top/tools/humans.txt
curl https://commontools.top/tools/.well-known/security.txt

# 检查 HTTP 头部
curl -I https://commontools.top/tools/ | grep -i "robots\|link"
```

---

## 📊 SEO 文件详解

### 1. robots.txt
**作用**: 告诉搜索引擎哪些页面可以爬取

**关键内容**:
- ✅ **17 个页面**全部添加 Allow 规则
- ✅ **4 个核心功能**标记为重点：
  - iPhone 录像处理
  - ProRAW 转换器
  - 现代图片转换
  - Live Photo 转换
- ✅ 针对 **4 个搜索引擎**的专门配置（Google, Bing, Baidu, Yandex）
- ✅ 禁止爬取构建产物和登录页

### 2. sitemap.xml
**作用**: 网站地图，帮助搜索引擎快速索引

**关键内容**:
- ✅ **17 个 URL** 全部列出
- ✅ **优先级**设置（0.5-1.0）
- ✅ **更新频率**（daily/weekly/monthly）
- ✅ **最后修改日期**（2026-01-19）

**页面优先级**:
- `1.0` - 首页
- `0.95` - 核心功能（屏幕录像、ProRAW、现代图片）
- `0.9` - 主要工具（格式转换、水印、签名、Live Photo）
- `0.8` - 辅助工具（HEIC 转换、压缩）
- `0.7` - 商业页面（定价、密码管理）
- `0.5-0.6` - 支持与政策页面

### 3. index.html Meta 标签

#### 基础 SEO
```html
<title>CommonTools - Professional Online Tools | Image & Video Processing</title>
<meta name="description" content="..." />
<meta name="keywords" content="iPhone screen recording, ProRAW converter, ..." />
<link rel="canonical" href="https://commontools.top/tools/" />
```

#### Open Graph (Facebook/LinkedIn)
```html
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://commontools.top/tools/og-image.png" />
<meta property="og:type" content="website" />
```

#### Twitter Card
```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="..." />
<meta name="twitter:image" content="..." />
<meta name="twitter:label1" content="Tools Available" />
<meta name="twitter:data1" content="13+" />
```

#### 结构化数据 (JSON-LD)
- **WebApplication** - 应用程序信息 + 评分（4.8/5）
- **Organization** - 组织信息
- **BreadcrumbList** - 面包屑导航

### 4. Nginx 配置

#### SEO 优化头部
```nginx
# Link 头部
add_header Link '<.../sitemap.xml>; rel="sitemap"';
add_header Link '<.../'; rel="canonical"';

# 搜索引擎指令
add_header X-Robots-Tag "index, follow, max-image-preview:large";
```

#### SEO 文件访问
```nginx
# 允许访问 .well-known（security.txt）
location ^~ /.well-known/ { allow all; }

# SEO 文件缓存
location ~* ^/(robots|sitemap|humans|browserconfig)\.
    expires 7d;
}
```

---

## 🎯 提交到搜索引擎

### Google Search Console
1. 访问 https://search.google.com/search-console
2. 添加属性 → `https://commontools.top`
3. 验证所有权（DNS/HTML 文件/Meta 标签）
4. **提交 Sitemap**:
   ```
   https://commontools.top/tools/sitemap.xml
   ```
5. 请求索引 → URL 检查 → 请求编入索引

### Bing Webmaster Tools
1. 访问 https://www.bing.com/webmasters
2. 添加网站 → `https://commontools.top`
3. 验证所有权
4. **提交 Sitemap**:
   ```
   https://commontools.top/tools/sitemap.xml
   ```
5. 提交 URL → 批量提交

### 其他搜索引擎
- **Yandex**: https://webmaster.yandex.com/
- **Baidu**: https://ziyuan.baidu.com/（如需要中国市场）

---

## 📈 监控与分析

### Google Search Console 关键指标
- **覆盖率** → 目标：17+ 页面已索引
- **性能** → 监控点击量、展示次数、CTR、排名
- **移动可用性** → 确保无错误
- **核心网页指标** → LCP < 2.5s, FID < 100ms, CLS < 0.1

### Google Analytics（如已安装）
- **自然搜索流量**
- **着陆页**
- **跳出率**
- **转化率**

### 建议工具
- **Google PageSpeed Insights**: 性能 + SEO 建议
- **Rich Results Test**: 验证结构化数据
- **Mobile-Friendly Test**: 移动端友好性

---

## 🔧 常见问题

### Q1: 部署后多久生效？
**A**: 
- Google: 通常 1-3 天开始重新爬取
- Bing: 1-7 天
- 完整索引: 2-4 周

### Q2: 如何加快索引速度？
**A**:
1. 在 Search Console 中手动请求编入索引
2. 确保网站地图正确提交
3. 创建外部链接（社交媒体、论坛、目录网站）
4. 发布新内容或更新现有内容

### Q3: 如何检查页面是否被索引？
**A**:
```
site:commontools.top/tools
site:commontools.top/tools/screen-recording
```

### Q4: robots.txt 会阻止页面被索引吗？
**A**: 不会！我们使用 `Allow:` 规则，明确允许爬取。只有 `Disallow:` 才会阻止。

### Q5: 结构化数据有什么用？
**A**: 
- 富媒体片段（评分星级、价格、功能数量）
- 提高搜索结果点击率
- 增强搜索引擎对内容的理解

---

## ✅ SEO 检查清单

### 部署前
- [ ] 检查 `robots.txt` 内容正确
- [ ] 验证 `sitemap.xml` 包含所有页面（17+）
- [ ] 确认 `index.html` meta 标签完整
- [ ] 测试 nginx 配置：`sudo nginx -t`
- [ ] 本地运行验证脚本：`./scripts/verify-seo.sh --local`

### 部署后
- [ ] 验证所有 SEO 文件可访问
- [ ] 运行验证脚本：`./scripts/verify-seo.sh`
- [ ] 提交 sitemap 到 Google Search Console
- [ ] 提交 sitemap 到 Bing Webmaster Tools
- [ ] 请求重新索引关键页面
- [ ] 使用 Rich Results Test 验证结构化数据

### 持续监控（每周）
- [ ] 检查 Search Console 覆盖率报告
- [ ] 监控索引页面数量
- [ ] 查看关键词排名变化
- [ ] 分析有机搜索流量
- [ ] 修复任何爬取错误

---

## 📚 相关资源

### 官方文档
- [Google 搜索中心](https://developers.google.com/search)
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/webmasters-guidelines-30fba23a)
- [Schema.org](https://schema.org/)

### 工具
- [Google Search Console](https://search.google.com/search-console)
- [Google PageSpeed Insights](https://pagespeed.web.dev/)
- [Rich Results Test](https://search.google.com/test/rich-results)
- [Mobile-Friendly Test](https://search.google.com/test/mobile-friendly)

### 学习资源
- [Moz SEO 初学者指南](https://moz.com/beginners-guide-to-seo)
- [Ahrefs SEO 博客](https://ahrefs.com/blog/)
- [Google SEO 入门指南](https://developers.google.com/search/docs/beginner/seo-starter-guide)

---

## 🆘 需要帮助？

- **详细文档**: 查看 `SEO_OPTIMIZATION.md`
- **部署脚本**: `scripts/deploy-seo-files.sh`
- **验证脚本**: `scripts/verify-seo.sh`
- **技术支持**: support@commontools.top

---

**最后更新**: 2026-01-19  
**维护者**: CommonTools Team  
**版本**: 1.0

---

**祝您 SEO 优化顺利！🚀**
