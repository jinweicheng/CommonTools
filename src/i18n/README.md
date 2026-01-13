# 国际化 (i18n) 使用指南

## 概述

项目已配置国际化支持，支持中文（zh-CN）和英文（en-US）。系统会根据浏览器语言自动选择语言，非中英文默认显示英文。

## 文件结构

```
src/i18n/
├── I18nContext.tsx      # 国际化上下文和 Hook
├── locales/
│   ├── zh-CN.ts        # 中文语言包
│   └── en-US.ts        # 英文语言包
└── README.md           # 本文件
```

## 使用方法

### 1. 在组件中使用国际化

```tsx
import { useI18n } from '../i18n/I18nContext'

function MyComponent() {
  const { t, language, setLanguage } = useI18n()
  
  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('common.subtitle')}</p>
      <button onClick={() => setLanguage('en-US')}>
        Switch to English
      </button>
    </div>
  )
}
```

### 2. 翻译键的命名规范

使用点号分隔的层级结构：
- `common.loading` - 通用文本
- `nav.encryption` - 导航项
- `encryption.title` - 页面标题
- `errors.fileRequired` - 错误消息

### 3. 添加新的翻译文本

在 `src/i18n/locales/zh-CN.ts` 和 `src/i18n/locales/en-US.ts` 中添加对应的键值对：

```typescript
// zh-CN.ts
export default {
  // ...
  myFeature: {
    title: '我的功能',
    description: '功能描述',
  },
}

// en-US.ts
export default {
  // ...
  myFeature: {
    title: 'My Feature',
    description: 'Feature description',
  },
}
```

### 4. 语言检测逻辑

- 优先使用 localStorage 中保存的语言设置
- 如果没有保存的设置，检测浏览器语言
- 如果浏览器语言是中文（zh-*），使用中文
- 其他情况默认使用英文

### 5. 语言切换

用户可以通过点击 header 中的语言切换按钮（🌐）来切换语言。语言设置会保存到 localStorage，下次访问时会自动应用。

## 已国际化的组件

- ✅ Layout（导航、安全横幅）
- ✅ ConversionPage（格式转化页面）
- ✅ EncryptionPage（加密页面）
- ✅ WatermarkPage（水印页面）
- ✅ SignaturePage（签名页面）

## 待国际化的组件

以下组件需要逐步添加国际化：

- [ ] PDFEncryption
- [ ] FileEncryption
- [ ] PDFWatermark
- [ ] PDFSignature
- [ ] PDFWordConverter
- [ ] ConvertToPDF
- [ ] ConvertFromPDF
- [ ] MarkdownToPDF
- [ ] CompressionPage
- [ ] HEICToJPGPage
- [ ] PasswordManagerPage
- [ ] LoginPage

## 注意事项

1. **保持翻译键的一致性**：确保中文和英文语言包中的键结构完全一致
2. **避免硬编码文本**：所有用户可见的文本都应该使用 `t()` 函数
3. **占位符和变量**：对于包含变量的文本，使用字符串模板或参数化翻译
4. **技术术语**：保持技术术语的一致性（如 PDF、AES-256-GCM 等）

## 示例：更新组件

```tsx
// 更新前
<h1>PDF 加密</h1>
<p>请输入密码</p>

// 更新后
import { useI18n } from '../i18n/I18nContext'

function MyComponent() {
  const { t } = useI18n()
  
  return (
    <>
      <h1>{t('encryption.pdfEncryption')}</h1>
      <p>{t('errors.passwordRequired')}</p>
    </>
  )
}
```
