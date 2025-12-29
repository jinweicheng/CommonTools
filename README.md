# CommonTools
Commonly used tools for daily life and office work（常用生活、办公的经常使用的工具）

## PDF工具集

一个功能完整的PDF处理工具，基于React 18和TypeScript开发。

### 功能列表

| 功能             | 状态 | 说明 |
| -------------- | ---- | ---- |
| PDF ↔ Word     | ✅   | PDF与Word文档相互转换 |
| Markdown → PDF | ✅   | 将Markdown文档转换为PDF |
| 水印             | ✅   | 为PDF添加自定义水印 |
| 文件有效期          | ✅   | 设置PDF文件有效期 |
| 查看密码           | ✅   | 为PDF添加查看密码保护 |
| 防复制/打印         | ✅   | 防止PDF被复制或打印 |
| 甲乙方签名          | ✅   | 在PDF任意位置动态插入手写签名和日期面板 |

### 技术栈

- React 18.3
- TypeScript
- Vite
- pdf-lib
- react-signature-canvas
- marked (Markdown解析)
- mammoth (Word文档处理)

### 安装和运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### 使用说明

1. **PDF ↔ Word转换**：支持PDF和Word文档的相互转换（注意：由于浏览器限制，完整功能需要服务器端支持）

2. **Markdown → PDF**：在编辑器中输入Markdown内容，实时预览，然后转换为PDF

3. **水印**：上传PDF文件，设置水印文本、透明度、字体大小和旋转角度

4. **文件有效期**：为PDF文件设置有效期，过期信息会添加到文档中

5. **查看密码**：为PDF添加密码保护，需要密码才能查看

6. **防复制/打印**：设置PDF权限，防止复制、打印或修改

7. **甲乙方签名**：
   - 上传PDF文件
   - 选择签名方（甲方/乙方）
   - 添加手写签名或日期面板
   - 拖拽签名面板到PDF的任意位置
   - 应用签名并下载

### 注意事项

- 某些功能（如PDF ↔ Word转换）由于浏览器安全限制，可能需要服务器端支持才能实现完整功能
- PDF保护功能依赖于PDF阅读器对权限的支持，某些阅读器可能不完全遵守这些限制
- 建议使用现代浏览器（Chrome、Firefox、Edge等）以获得最佳体验
