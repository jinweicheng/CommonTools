# 邮件发送配置指南

CommonTools 的联系表单支持两种邮件发送方式：

## 方式一：后端API（推荐）

如果您有后端服务器，可以实现 `/api/contact` 端点来处理邮件发送。

### 后端API要求

**端点**: `POST /api/contact`

**请求体**:
```json
{
  "name": "用户姓名",
  "email": "user@example.com",
  "subject": "邮件主题",
  "message": "邮件内容"
}
```

**响应**:
```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

### 示例实现（Node.js + Express）

```javascript
const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// 配置邮件传输器（使用Gmail示例）
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'chengjinweigoole@gmail.com', // 接收邮件的地址
      replyTo: email,
      subject: subject,
      text: `
姓名: ${name}
邮箱: ${email}

${message}
      `,
      html: `
<h2>来自 CommonTools 联系表单</h2>
<p><strong>姓名:</strong> ${name}</p>
<p><strong>邮箱:</strong> ${email}</p>
<hr>
<p>${message.replace(/\n/g, '<br>')}</p>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

## 方式二：EmailJS（无需后端）

如果后端API不可用，系统会自动使用 EmailJS 作为备选方案。

### 配置步骤

1. **注册 EmailJS 账号**
   - 访问 https://www.emailjs.com/
   - 注册免费账号（每月200封邮件免费额度）

2. **创建邮件服务**
   - 登录后进入 Dashboard
   - 点击 "Add New Service"
   - 选择邮件服务提供商（Gmail、Outlook等）
   - 按照指引完成配置
   - 记录下 Service ID

3. **创建邮件模板**
   - 点击 "Email Templates" -> "Create New Template"
   - 设置模板内容：
     ```
     主题: {{subject}}
     
     来自: {{from_name}} ({{from_email}})
     
     内容:
     {{message}}
     ```
   - 记录下 Template ID

4. **获取 Public Key**
   - 进入 "Account" -> "General"
   - 找到 "Public Key"，复制

5. **配置环境变量**
   - 创建 `.env` 文件（参考 `.env.example`）
   - 填入以下配置：
     ```env
     VITE_EMAILJS_SERVICE_ID=your_service_id
     VITE_EMAILJS_TEMPLATE_ID=your_template_id
     VITE_EMAILJS_PUBLIC_KEY=your_public_key
     ```

6. **重新构建项目**
   ```bash
   npm run build
   ```

## 优先级

系统会按以下顺序尝试发送邮件：

1. **首先尝试后端API** (`/api/contact`)
   - 如果API返回成功，直接完成
   - 如果API返回404或网络错误，继续下一步

2. **然后尝试EmailJS**
   - 如果EmailJS配置完整，使用EmailJS发送
   - 如果EmailJS配置缺失，返回错误

## 测试

配置完成后，可以通过以下方式测试：

1. 访问联系页面：`/contact`
2. 填写表单并提交
3. 检查控制台日志查看使用的方式
4. 确认邮件是否成功发送到目标邮箱

## 注意事项

- EmailJS 免费版每月限制200封邮件
- 建议在生产环境使用后端API以确保可靠性
- 后端API可以添加更多功能（如验证码、限流等）
- EmailJS 的 Public Key 可以安全地暴露在前端代码中
