# 代码混淆配置说明

## ✅ 已完成的配置

### 1. **安装的依赖包**
- `rollup-plugin-obfuscator` - Rollup/Vite 混淆插件
- `javascript-obfuscator` - JavaScript 混淆核心库
- `terser` - 代码压缩工具

### 2. **混淆配置**
已在 `vite.config.ts` 中配置了完整的代码混淆选项：

#### 混淆级别：**高**
- ✅ 控制流扁平化
- ✅ 死代码注入
- ✅ 字符串数组编码（Base64）
- ✅ 字符串分割和旋转
- ✅ 对象键转换
- ✅ 自我防御（防止格式化）
- ✅ 标识符名称十六进制化

#### 性能优化
- ✅ 代码压缩（Terser）
- ✅ 代码分割（React、PDF、工具库分离）
- ✅ 移除注释和 debugger
- ✅ 移除 console.log（可选）

## 🚀 使用方法

### 构建混淆后的代码
```bash
npm run build
```

混淆**仅在生产环境**（`NODE_ENV=production`）启用，开发环境不受影响。

### 验证混淆效果
构建完成后，检查 `dist/assets/` 目录下的 JS 文件：
- 代码已完全混淆
- 变量名已变成十六进制
- 字符串已编码
- 控制流已扁平化

## ⚙️ 服务器配置

### **重要：服务器端无需任何特殊配置！**

代码混淆是在**构建时**完成的，不是运行时。混淆后的代码就是普通的 JavaScript 文件，服务器只需要：

1. ✅ **正常部署** - 将 `dist/` 目录部署到服务器
2. ✅ **正常提供静态文件** - 确保 JS 文件可以被浏览器访问
3. ✅ **正确的 MIME 类型** - 确保 `.js` 文件的 MIME 类型是 `application/javascript`

### 服务器配置示例（Nginx）

```nginx
server {
    listen 443 ssl;
    server_name commontools.top;
    
    root /path/to/dist;
    index index.html;
    
    # 静态文件配置（已足够，无需特殊配置）
    location /tools/ {
        try_files $uri $uri/ /tools/index.html;
    }
    
    # JavaScript 文件 MIME 类型（通常已默认配置）
    location ~ \.js$ {
        add_header Content-Type application/javascript;
    }
}
```

### 服务器配置示例（Apache）

```apache
<Directory /path/to/dist>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
    
    # JavaScript 文件 MIME 类型（通常已默认配置）
    AddType application/javascript .js
</Directory>
```

## 🔧 混淆选项说明

### 当前配置（高安全性）

```typescript
{
  compact: true,                    // 压缩代码
  controlFlowFlattening: true,      // 控制流扁平化（增加逆向难度）
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,         // 注入死代码（增加混淆度）
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,                // 使用字符串数组
  stringArrayEncoding: ['base64'],  // Base64 编码字符串
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,        // 转换对象键
  selfDefending: true,              // 自我防御（防止格式化）
  identifierNamesGenerator: 'hexadecimal' // 十六进制标识符
}
```

### 调整混淆级别

如果需要调整混淆强度，可以修改 `vite.config.ts` 中的配置：

#### 低级别（性能优先）
```typescript
controlFlowFlattening: false,
deadCodeInjection: false,
stringArrayEncoding: [],
```

#### 中级别（平衡）
```typescript
controlFlowFlattening: true,
controlFlowFlatteningThreshold: 0.5,
deadCodeInjection: false,
stringArrayEncoding: ['base64'],
```

#### 高级别（当前配置，安全性优先）
```typescript
controlFlowFlattening: true,
controlFlowFlatteningThreshold: 0.75,
deadCodeInjection: true,
deadCodeInjectionThreshold: 0.4,
stringArrayEncoding: ['base64'],
```

## ⚠️ 注意事项

### 1. **性能影响**
- 混淆会增加代码体积（约 10-30%）
- 可能略微影响执行速度
- 建议在生产环境使用

### 2. **调试困难**
- 混淆后的代码难以调试
- 生产环境建议关闭 source map（已配置）
- 保留原始代码用于调试

### 3. **第三方库**
- 某些第三方库可能不兼容混淆
- 如果遇到问题，可以在 `exclude` 中排除特定文件

### 4. **浏览器兼容性**
- 混淆后的代码需要现代浏览器支持
- 已测试：Chrome、Firefox、Edge、Safari

## 📊 混淆效果对比

### 混淆前
```javascript
function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  return await encrypt(file, key);
}
```

### 混淆后
```javascript
var _0x1a2b=['getRandomValues','deriveKey','encrypt'];(function(_0x3c4d,_0x5e6f){var _0x7890=function(_0xabcd){while(--_0xabcd){_0x3c4d['push'](_0x3c4d['shift']());}};_0x7890(++_0x5e6f);}(_0x1a2b,0x123));function _0xdef0(_0x1111,_0x2222){var _0x3333=_0x1a2b;return _0x3333[0x0];}
```

## 🎯 最佳实践

1. ✅ **仅在生产环境混淆** - 开发环境保持可读性
2. ✅ **保留原始代码** - 用于调试和版本控制
3. ✅ **定期更新混淆策略** - 保持安全性
4. ✅ **测试混淆后的代码** - 确保功能正常
5. ✅ **监控性能** - 关注文件大小和加载时间

## 📝 总结

- ✅ **前端配置**：已在 `vite.config.ts` 中完成
- ✅ **服务器配置**：**无需任何特殊配置**
- ✅ **构建命令**：`npm run build`（自动混淆）
- ✅ **混淆级别**：高（可调整）

混淆后的代码可以直接部署到任何支持静态文件的服务器，无需额外配置！

