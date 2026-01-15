# 🔧 Live Photo 转换故障排查指南

## 问题：转换进度始终为 0，无错误提示

### 诊断步骤

#### 1. 打开浏览器开发者工具

按 `F12` 或右键点击 "检查" 打开浏览器开发者工具，切换到 "Console" 标签。

#### 2. 上传文件并转换

1. 选择 MOV 文件
2. 选择转换模式（GIF 或 MP4）
3. 点击 "开始转换"
4. 观察控制台输出

#### 3. 检查控制台日志

你应该看到类似以下的日志输出：

```
=== handleConvert called ===
Mode: gif
Live Photo files: { heic: undefined, mov: "IMG_1234.MOV" }
Starting conversion for mode: gif
=== Starting GIF conversion ===
MOV file: IMG_1234.MOV Size: 2048576
Loading FFmpeg...
FFmpeg already loaded (或 Starting FFmpeg load...)
FFmpeg ready
Writing MOV file to FFmpeg filesystem...
File data size: 2048576
File written successfully
Generating GIF with params: fps=10, width=480, quality=10
FFmpeg filter: fps=10,scale=480:-1:flags=lanczos...
Executing FFmpeg command...
[FFmpeg Log]: ...各种 FFmpeg 日志
[FFmpeg Progress]: 25% (1234ms)
[FFmpeg Progress]: 50% (2468ms)
...
FFmpeg exec completed
Reading output GIF...
GIF data size: 1536789
GIF blob created, size: 1536789
Cleaning up files...
Cleanup completed
=== GIF conversion completed successfully ===
```

### 常见问题及解决方案

#### 问题 1: FFmpeg 加载失败

**症状**：
```
Failed to load FFmpeg: TypeError: Failed to fetch
```

**原因**：
- 网络连接问题
- CDN 被墙或无法访问
- 浏览器不支持 WebAssembly

**解决方案**：
1. 检查网络连接
2. 尝试使用 VPN
3. 更换浏览器（推荐 Chrome/Edge 最新版）
4. 等待 CDN 恢复或使用代理

#### 问题 2: SharedArrayBuffer 不可用

**症状**：
```
ReferenceError: SharedArrayBuffer is not defined
```

**原因**：
- 浏览器不支持 SharedArrayBuffer
- 网站未配置正确的 CORS headers

**解决方案**：

在服务器配置中添加以下 headers：

**Nginx**：
```nginx
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
```

**Apache (.htaccess)**：
```apache
Header set Cross-Origin-Embedder-Policy "require-corp"
Header set Cross-Origin-Opener-Policy "same-origin"
```

#### 问题 3: MOV 文件无法读取

**症状**：
```
Error: Failed to read file
File data size: 0
```

**原因**：
- 文件已损坏
- 文件格式不正确
- 浏览器文件读取权限问题

**解决方案**：
1. 确认文件可以正常播放
2. 尝试重新导出文件
3. 使用其他浏览器
4. 检查文件大小是否过大（推荐 < 50MB）

#### 问题 4: FFmpeg 执行超时

**症状**：
```
Executing FFmpeg command...
(长时间无响应)
```

**原因**：
- 设备性能不足
- 文件过大
- GIF 参数设置过高

**解决方案**：
1. 降低 GIF 宽度（480px → 360px）
2. 降低帧率（10fps → 8fps）
3. 使用 MP4 模式（更快）
4. 关闭其他标签页释放内存

#### 问题 5: 内存不足

**症状**：
```
Uncaught (in promise) Error: Cannot enlarge memory arrays
```

**原因**：
- 浏览器内存限制
- 文件过大
- 同时处理多个文件

**解决方案**：
1. 刷新页面重新开始
2. 关闭其他标签页
3. 使用 64 位浏览器
4. 增加系统可用内存
5. 处理较小的文件

### 浏览器兼容性检查

运行以下命令检查浏览器兼容性：

```javascript
console.log('WebAssembly:', typeof WebAssembly !== 'undefined' ? '✅ 支持' : '❌ 不支持')
console.log('SharedArrayBuffer:', typeof SharedArrayBuffer !== 'undefined' ? '✅ 支持' : '❌ 不支持')
console.log('Worker:', typeof Worker !== 'undefined' ? '✅ 支持' : '❌ 不支持')
console.log('Available Memory:', performance.memory ? `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0)} MB` : '未知')
```

### 推荐配置

**最佳体验**：
- 浏览器：Chrome/Edge 90+ 或 Firefox 88+
- 系统内存：8GB+
- 可用内存：4GB+
- 网络：Wi-Fi（首次加载）

**最低要求**：
- 浏览器：支持 WebAssembly 的现代浏览器
- 系统内存：4GB+
- 可用内存：2GB+

### 手动测试步骤

1. **清除缓存**：
   - Chrome: Ctrl + Shift + Delete
   - 选择 "缓存的图像和文件"
   - 时间范围：全部时间
   - 点击 "清除数据"

2. **重新加载页面**：
   - 按 Ctrl + Shift + R（硬刷新）

3. **检查网络**：
   - 开发者工具 → Network 标签
   - 查找 `ffmpeg-core.js` 和 `ffmpeg-core.wasm`
   - 确认状态为 200 (成功)

4. **测试文件**：
   - 使用小文件测试（< 5MB）
   - 确认文件格式正确（.mov 或 .mp4）
   - 确认文件可以正常播放

5. **检查权限**：
   - 确认浏览器有文件访问权限
   - 检查是否被广告拦截器阻止

### 获取帮助

如果以上方法都无法解决问题，请提供以下信息：

1. **浏览器信息**：
   - 浏览器名称和版本
   - 操作系统和版本

2. **控制台日志**：
   - 完整的控制台输出（截图或文本）
   - 特别是错误信息

3. **文件信息**：
   - 文件大小
   - 文件格式
   - 视频时长

4. **操作步骤**：
   - 详细描述操作步骤
   - 预期结果和实际结果

## 联系支持

- Email: chengjinweigoole@gmail.com
- 标题格式：[Live Photo 转换] 问题描述
- 附上控制台日志和错误截图
