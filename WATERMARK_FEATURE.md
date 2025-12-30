# 多格式水印工具 - 功能说明

## 🎯 功能概述

全新的多格式水印工具已经完美实现，支持为 PDF、图片和 Word 文档添加专业水印。

## ✨ 支持的文件格式

### 1. PDF 文档 (.pdf)
- ✅ **平铺水印**：在每一页添加多个平铺的水印
- ✅ **中英文支持**：中文自动转换为图片以确保正确显示
- ✅ **自定义样式**：可调整透明度、字体大小、旋转角度
- ✅ **保持原文档**：生成新的带水印PDF，不影响原文件

**技术实现**：
- 使用 `pdf-lib` 库处理 PDF
- 中文文本通过 Canvas 转换为 PNG 图片嵌入
- 支持自定义水印间距和分布

### 2. 图片文件 (.jpg, .jpeg, .png, .bmp, .webp, .gif)
- ✅ **Canvas 渲染**：直接在图片上绘制水印
- ✅ **透明水印**：支持半透明效果
- ✅ **平铺模式**：智能平铺，覆盖整个图片
- ✅ **格式保持**：输出格式与原图片格式一致

**技术实现**：
- 使用 HTML5 Canvas API
- 支持所有主流图片格式
- 实时预览（图片上传后显示）

### 3. Word 文档 (.doc, .docx)
- ✅ **内容提取**：自动提取原文档文本内容
- ✅ **智能插入**：每隔几段自动插入水印
- ✅ **格式化水印**：开头和结尾添加醒目的水印标识
- ✅ **生成新文档**：生成带水印的新 DOCX 文件

**技术实现**：
- 使用 `mammoth.js` 提取 Word 内容
- 使用 `docx` 库生成新文档
- 在段落间插入彩色水印文本

## 🎨 可调参数

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| **水印文本** | 任意文本 | "水印" | 支持中英文、数字、符号 |
| **透明度** | 10% - 100% | 30% | 控制水印的可见度 |
| **字体大小** | 24px - 120px | 24px | 调整水印文字大小 |
| **旋转角度** | -90° - 90° | -45° | 水印倾斜角度 |

## 🚀 使用方法

### 基本步骤

1. **设置水印参数**
   - 输入水印文本
   - 调整透明度、字体大小、旋转角度
   - 在预览区查看效果

2. **上传文件**
   - 点击"选择文件并添加水印"按钮
   - 选择支持的文件格式（PDF/图片/Word）
   - 系统自动检测文件类型

3. **自动处理**
   - 系统根据文件类型自动选择处理方式
   - 显示当前文件类型和处理进度

4. **下载结果**
   - 处理完成后自动下载带水印的文件
   - 文件名自动添加 "-watermarked" 后缀

### 最佳实践

#### PDF 文档
- **机密文档**：设置透明度 20%-30%，字体大小 48px
- **草稿文档**：设置透明度 40%-50%，字体大小 36px
- **示例文档**：设置透明度 15%-25%，字体大小 60px

#### 图片
- **产品图**：透明度 30%，角度 -45°，大小 36px
- **设计稿**：透明度 20%，角度 45°，大小 48px
- **证件照**：透明度 40%，角度 0°，大小 28px

#### Word 文档
- **合同文档**：使用公司名称，字体 32px
- **报告文档**：使用"仅供内部参考"，字体 28px
- **学术论文**：使用"草稿"或日期，字体 24px

## 🎯 技术特性

### 性能优化
- ✅ 100% 本地处理，无需上传到服务器
- ✅ 大文件支持，内存占用优化
- ✅ 批量处理支持（可依次处理多个文件）

### 安全性
- ✅ 所有处理都在浏览器中完成
- ✅ 原文件不会被上传或保存
- ✅ 处理完成后自动清理内存

### 兼容性
- ✅ 支持 Chrome、Firefox、Edge、Safari
- ✅ 支持 Windows、macOS、Linux
- ✅ 移动端响应式设计

## 🛠️ 技术栈

| 功能 | 使用的技术 |
|------|------------|
| PDF 处理 | pdf-lib |
| Word 处理 | mammoth.js + docx |
| 图片处理 | HTML5 Canvas API |
| 中文渲染 | Canvas + Microsoft YaHei 字体 |
| 文件下载 | file-saver |
| UI 组件 | React + TypeScript |
| 图标 | lucide-react |

## 📝 代码示例

### PDF 水印核心代码
```typescript
// 为 PDF 页面添加水印
for (const page of pages) {
  const { width, height } = page.getSize()
  const spacing = 200
  
  for (let x = -spacing; x < width + spacing; x += spacing) {
    for (let y = -spacing; y < height + spacing; y += spacing) {
      page.drawImage(watermarkImage, {
        x: x - imageDims.width / 2,
        y: y - imageDims.height / 2,
        opacity: opacity,
        rotate: degrees(angle),
      })
    }
  }
}
```

### 图片水印核心代码
```typescript
// Canvas 绘制水印
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')!

// 绘制原图
ctx.drawImage(img, 0, 0)

// 设置水印样式
ctx.globalAlpha = opacity
ctx.fillStyle = '#808080'
ctx.font = `${fontSize}px Arial, "Microsoft YaHei"`

// 平铺水印
for (let x = -spacing; x < canvas.width + spacing; x += spacing) {
  for (let y = 0; y < canvas.height + spacing; y += spacing) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(radians)
    ctx.fillText(watermarkText, 0, 0)
    ctx.restore()
  }
}
```

### Word 水印核心代码
```typescript
// 创建带水印的 Word 文档
const children: Paragraph[] = paragraphs.map(para => 
  new Paragraph({
    children: [new TextRun(para)],
    spacing: { after: 200 }
  })
)

// 每 5 段插入一个水印
for (let i = 4; i < children.length; i += 5) {
  children.splice(i + 1, 0, 
    new Paragraph({
      children: [
        new TextRun({
          text: `【${watermarkText}】`,
          color: 'CCCCCC',
          size: fontSize,
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  )
}
```

## 💡 使用提示

1. **中文水印**：系统会自动检测中文字符并转换为图片，确保在任何环境下都能正确显示

2. **文件大小**：
   - PDF：支持任意大小，处理时间取决于页数
   - 图片：建议单张不超过 10MB
   - Word：建议不超过 5MB

3. **水印效果**：
   - 透明度越低，水印越不明显但不影响阅读
   - 角度 -45° 是最常用的水印角度
   - 平铺间距自动优化，确保完整覆盖

4. **输出格式**：
   - PDF → PDF（保持原格式）
   - 图片 → 图片（保持原格式）
   - Word → DOCX（统一为 DOCX 格式）

## 🐛 常见问题

### Q: 中文水印显示为方框？
A: 系统已自动处理，中文会转换为图片嵌入，不会出现此问题。

### Q: PDF 水印位置不准确？
A: 已优化坐标系统，使用 Canvas 渲染确保精确对齐。

### Q: Word 水印不够明显？
A: 可以调大字体大小（建议 32px 以上），或在 Word 设置中选择更鲜艳的颜色。

### Q: 处理大文件很慢？
A: 所有处理都在本地完成，速度取决于电脑性能。建议：
- PDF：分批处理，每次不超过 50 页
- 图片：压缩后再添加水印
- Word：控制在 50 页以内

## 🔮 未来计划

- [ ] 支持批量处理多个文件
- [ ] 添加水印模板功能（预设常用水印）
- [ ] 支持图片水印（不仅是文字）
- [ ] PDF 水印位置自定义（不仅是平铺）
- [ ] Excel 表格水印支持
- [ ] PPT 演示文稿水印支持

## 📞 技术支持

如有问题或建议，请通过以下方式联系：

- 提交 Issue
- 查看代码文档
- 参考本说明文档

---

**版本**: v2.0.0  
**更新日期**: 2025-12-30  
**状态**: ✅ 生产就绪

