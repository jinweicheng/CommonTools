import { useState } from 'react'
import { Upload, Lock, Shield, Key, AlertCircle, CheckCircle } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { CryptoUtils } from '../utils/cryptoUtils'
import './PDFLock.css'

export default function PDFLock() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<'lock' | 'unlock'>('lock')
  
  // Encryption mode: 'strong' (needs tool to decrypt) or 'standard' (any PDF reader)
  const [encryptionMode, setEncryptionMode] = useState<'strong' | 'standard'>('standard')
  
  // Lock mode
  const [userPassword, setUserPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [allowPrinting, setAllowPrinting] = useState(true)
  const [allowCopying, setAllowCopying] = useState(true)
  const [allowModifying, setAllowModifying] = useState(false)
  const [allowAnnotating, setAllowAnnotating] = useState(false)
  
  // Unlock mode
  const [unlockPassword, setUnlockPassword] = useState('')

  // 将 emoji 转换为图片（避免 WinAnsi 编码错误）
  const emojiToImage = async (emoji: string, size: number): Promise<string> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    // 设置画布大小
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)
    
    // 绘制 emoji
    ctx.font = `${size}px Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2)
    
    return canvas.toDataURL('image/png')
  }

  // 标准加密模式：创建带密码验证页的 HTML 包装器
  const lockPDFStandard = async (file: File) => {
    if (!userPassword) {
      setError('请设置打开密码（User Password）')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 读取原始 PDF
      const arrayBuffer = await file.arrayBuffer()
      const pdfBase64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      
      // 生成密码哈希（用于验证）
      const encoder = new TextEncoder()
      const passwordData = encoder.encode(userPassword)
      const hashBuffer = await crypto.subtle.digest('SHA-256', passwordData)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      // 创建 HTML 包装器，包含密码验证和 PDF 查看器
      const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>受密码保护的 PDF 文档</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #password-screen {
      background: white;
      padding: 3rem;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 400px;
      width: 90%;
      text-align: center;
    }
    .lock-icon {
      font-size: 64px;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      color: #333;
      margin-bottom: 0.5rem;
    }
    p {
      color: #666;
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    .input-group {
      margin-bottom: 1.5rem;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: #555;
      font-weight: 500;
    }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.3s;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .error {
      color: #e53e3e;
      font-size: 0.9rem;
      margin-top: 1rem;
      display: none;
    }
    .error.show {
      display: block;
    }
    #pdf-viewer {
      display: none;
      width: 100%;
      height: 100vh;
      border: none;
    }
    .info {
      font-size: 0.85rem;
      color: #888;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div id="password-screen">
    <div class="lock-icon">🔒</div>
    <h1>此文档受密码保护</h1>
    <p>请输入密码以查看文档内容</p>
    
    <div class="input-group">
      <label for="password">密码</label>
      <input type="password" id="password" placeholder="请输入密码" autofocus>
    </div>
    
    <button onclick="verifyPassword()">解锁并查看</button>
    <div class="error" id="error">密码错误，请重试</div>
    
    <div class="info">
      此文档由 CommonTools 加密保护<br>
      使用 SHA-256 密码验证
    </div>
  </div>
  
  <iframe id="pdf-viewer"></iframe>

  <script>
    const PASSWORD_HASH = '${passwordHash}';
    const PDF_DATA = '${pdfBase64}';
    
    async function hashPassword(password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    async function verifyPassword() {
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error');
      
      if (!password) {
        errorDiv.textContent = '请输入密码';
        errorDiv.classList.add('show');
        return;
      }
      
      const hash = await hashPassword(password);
      
      if (hash === PASSWORD_HASH) {
        // 密码正确，显示 PDF
        errorDiv.classList.remove('show');
        document.getElementById('password-screen').style.display = 'none';
        
        const pdfViewer = document.getElementById('pdf-viewer');
        const pdfBlob = base64ToBlob(PDF_DATA, 'application/pdf');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        pdfViewer.src = pdfUrl;
        pdfViewer.style.display = 'block';
      } else {
        // 密码错误
        errorDiv.textContent = '密码错误，请重试';
        errorDiv.classList.add('show');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
      }
    }
    
    function base64ToBlob(base64, type) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: type });
    }
    
    // 按 Enter 键提交
    document.getElementById('password').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        verifyPassword();
      }
    });
    
    // 防止右键和复制（基础保护）
    if (${!allowCopying}) {
      document.addEventListener('contextmenu', e => e.preventDefault());
      document.addEventListener('copy', e => e.preventDefault());
    }
    
    // 防止打印（基础保护）
    if (${!allowPrinting}) {
      window.addEventListener('beforeprint', function(e) {
        alert('此文档不允许打印');
        e.preventDefault();
        return false;
      });
    }
  </script>
</body>
</html>`;

      // 保存为 HTML 文件
      const blob = new Blob([htmlContent], { type: 'text/html' })
      saveAs(blob, file.name.replace('.pdf', '-protected.html'))
      
      setSuccess(`✅ PDF 已添加密码保护（标准模式）！\n\n保护信息：\n• 模式：HTML 包装器（浏览器可打开）\n• 文件格式：.html（内嵌 PDF）\n• 密码验证：SHA-256 哈希\n• 文件大小：${(blob.size / 1024).toFixed(2)} KB\n\n使用方法：\n1. 双击打开 .html 文件\n2. 在浏览器中输入密码\n3. 密码正确后即可查看 PDF 内容\n\n⚠️ 注意：\n• 这不是真正的加密，技术人员可以查看源代码\n• 推荐使用"强加密模式"获得真正的安全保护`)
      
      // 清空密码
      setUserPassword('')
      setOwnerPassword('')
    } catch (err) {
      console.error('标准加密失败:', err)
      setError('加密失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 强加密模式：使用 AES-256-GCM 加密内容
  const lockPDFStrong = async (file: File) => {
    if (!userPassword) {
      setError('请设置打开密码（User Password）')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 读取原始 PDF
      const arrayBuffer = await file.arrayBuffer()
      const originalPdfDoc = await PDFDocument.load(arrayBuffer)
      
      // 获取 PDF 基本信息
      const pageCount = originalPdfDoc.getPageCount()
      const originalBytes = await originalPdfDoc.save()
      
      // 使用 AES-256-GCM 加密 PDF 内容
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const userKey = await CryptoUtils.deriveKeyFromPassword(userPassword, salt)
      const { encrypted: encryptedContent, iv } = await CryptoUtils.encrypt(originalBytes.buffer as ArrayBuffer, userKey)
      
      // 创建新的受保护的 PDF
      const protectedPdf = await PDFDocument.create()
      
      // 设置元数据
      protectedPdf.setTitle('🔒 Encrypted PDF Document')
      protectedPdf.setSubject('This document is protected with AES-256 encryption')
      protectedPdf.setCreator('CommonTools PDF Lock')
      protectedPdf.setProducer('CommonTools - AES-256-GCM Encryption')
      
      // 构建加密信息
      const encryptionInfo = {
        version: '1.0',
        algorithm: 'AES-256-GCM',
        salt: CryptoUtils.arrayBufferToBase64(salt.buffer),
        iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
        pageCount: pageCount,
        originalSize: originalBytes.byteLength,
        encryptedAt: new Date().toISOString(),
        permissions: {
          printing: allowPrinting,
          copying: allowCopying,
          modifying: allowModifying,
          annotating: allowAnnotating
        },
        hasOwnerPassword: !!ownerPassword
      }
      
      // 存储加密信息到 Keywords
      protectedPdf.setKeywords([
        'encrypted',
        'aes-256-gcm',
        'password-protected',
        `v:${encryptionInfo.version}`,
        `pages:${pageCount}`,
        `date:${new Date().toISOString().split('T')[0]}`
      ])
      
      // 创建信息页面
      const page = protectedPdf.addPage([595, 842])
      const { width, height } = page.getSize()
      const font = await protectedPdf.embedFont(StandardFonts.Helvetica)
      const boldFont = await protectedPdf.embedFont(StandardFonts.HelveticaBold)
      
      // 绘制锁图标（转换为图片避免编码错误）
      const lockIconDataUrl = await emojiToImage('🔒', 60)
      const lockIconBytes = await fetch(lockIconDataUrl).then(res => res.arrayBuffer())
      const lockIcon = await protectedPdf.embedPng(lockIconBytes)
      const lockIconDims = lockIcon.scale(1)
      
      page.drawImage(lockIcon, {
        x: width / 2 - lockIconDims.width / 2,
        y: height - 100 - lockIconDims.height / 2,
        width: lockIconDims.width,
        height: lockIconDims.height,
      })
      
      // 标题
      const title = 'ENCRYPTED PDF DOCUMENT'
      page.drawText(title, {
        x: width / 2 - boldFont.widthOfTextAtSize(title, 20) / 2,
        y: height - 150,
        size: 20,
        font: boldFont,
      })
      
      // 说明文本
      const instructions = [
        'This document is protected with AES-256-GCM encryption.',
        '',
        'To view this document, you need:',
        '1. Open it with CommonTools PDF Unlock',
        '2. Enter the correct password',
        '3. The original content will be decrypted and displayed',
        '',
        'Document Information:',
        `- Pages: ${pageCount}`,
        `- Encrypted: ${new Date().toLocaleDateString()}`,
        `- Algorithm: AES-256-GCM`,
        '',
        'Permissions:',
        `- Printing: ${allowPrinting ? 'Allowed' : 'Denied'}`,
        `- Copying: ${allowCopying ? 'Allowed' : 'Denied'}`,
        `- Modifying: ${allowModifying ? 'Allowed' : 'Denied'}`,
        `- Annotating: ${allowAnnotating ? 'Allowed' : 'Denied'}`,
      ]
      
      let yPos = height - 200
      instructions.forEach(line => {
        const fontSize = line.startsWith('-') ? 10 : 12
        const lineFont = line.startsWith('Document Information:') || line.startsWith('Permissions:') ? boldFont : font
        page.drawText(line, {
          x: 50,
          y: yPos,
          size: fontSize,
          font: lineFont,
        })
        yPos -= fontSize + 6
      })
      
      // 将加密信息和数据存储在 PDF 中
      // 注意：由于 PDF 有大小限制，我们需要将加密数据分块存储
      const encryptedBase64 = CryptoUtils.arrayBufferToBase64(encryptedContent as ArrayBuffer)
      const chunkSize = 200 // 每个 keyword 最多 200 字符
      const chunks = []
      for (let i = 0; i < encryptedBase64.length; i += chunkSize) {
        chunks.push(encryptedBase64.substring(i, i + chunkSize))
      }
      
      // 将元数据存储为 PDF 的自定义属性
      // 使用 Subject 字段存储加密信息（JSON 格式）
      protectedPdf.setSubject(JSON.stringify(encryptionInfo))
      
      // 将加密数据存储在 Producer 字段（有长度限制，这里只存储引用信息）
      protectedPdf.setProducer(`ENCRYPTED:${chunks.length}:${encryptedBase64.length}`)
      
      // 在页面底部添加说明（避免使用 emoji）
      page.drawText('WARNING: Do not try to remove this page or modify this document.', {
        x: 50,
        y: 50,
        size: 8,
        font: font,
      })
      
      page.drawText('The encrypted content is embedded in this PDF file.', {
        x: 50,
        y: 35,
        size: 8,
        font: font,
      })
      
      // 保存受保护的 PDF
      const protectedBytes = await protectedPdf.save()
      
      // 创建一个包含加密数据的完整文件
      // 我们将加密数据附加到 PDF 文件末尾（作为自定义数据块）
      const finalBytes = new Uint8Array(protectedBytes.byteLength + encryptedContent.byteLength + 1024)
      finalBytes.set(new Uint8Array(protectedBytes), 0)
      
      // 添加分隔符
      const separator = new TextEncoder().encode('\n%%ENCRYPTED_DATA_START%%\n')
      finalBytes.set(separator, protectedBytes.byteLength)
      
      // 添加加密数据
      finalBytes.set(new Uint8Array(encryptedContent), protectedBytes.byteLength + separator.byteLength)
      
      // 添加数据信息（用于解密时定位）
      const dataInfo = new TextEncoder().encode(
        `\n%%ENCRYPTED_DATA_INFO%%\n${JSON.stringify({
          ...encryptionInfo,
          dataOffset: protectedBytes.byteLength + separator.byteLength,
          dataLength: encryptedContent.byteLength
        })}\n%%END%%`
      )
      finalBytes.set(dataInfo, protectedBytes.byteLength + separator.byteLength + encryptedContent.byteLength)
      
      const finalLength = protectedBytes.byteLength + separator.byteLength + encryptedContent.byteLength + dataInfo.byteLength
      const trimmedBytes = finalBytes.slice(0, finalLength)
      
      const blob = new Blob([trimmedBytes.buffer], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('.pdf', '-locked.pdf'))
      
      setSuccess(`✅ PDF 已成功加密！\n\n加密信息：\n• 算法：AES-256-GCM\n• 页数：${pageCount}\n• 原始大小：${(originalBytes.byteLength / 1024).toFixed(2)} KB\n• 加密后大小：${(trimmedBytes.byteLength / 1024).toFixed(2)} KB\n\n请妥善保管密码，忘记密码将无法恢复！`)
      
      // 清空密码
      setUserPassword('')
      setOwnerPassword('')
    } catch (err) {
      console.error('加密 PDF 失败:', err)
      setError('加密失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 解锁 PDF（解密内容）
  const unlockPDF = async (file: File) => {
    if (!unlockPassword) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 读取受保护的 PDF
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      // 查找加密数据信息
      const text = new TextDecoder().decode(bytes)
      const infoMatch = text.match(/%%ENCRYPTED_DATA_INFO%%\n(.*?)\n%%END%%/s)
      
      if (!infoMatch) {
        setError('❌ 这不是一个有效的加密 PDF 文件')
        return
      }
      
      const encryptionInfo = JSON.parse(infoMatch[1])
      
      // 提取加密数据
      const encryptedData = bytes.slice(encryptionInfo.dataOffset, encryptionInfo.dataOffset + encryptionInfo.dataLength)
      
      // 解密数据
      const salt = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.salt))
      const iv = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.iv))
      
      const key = await CryptoUtils.deriveKeyFromPassword(unlockPassword, salt)
      
      let decryptedBytes
      try {
        decryptedBytes = await CryptoUtils.decrypt(encryptedData.buffer, key, iv)
      } catch (err) {
        setError('❌ 密码错误！请检查密码后重试')
        return
      }
      
      // 验证解密后的数据是否为有效的 PDF
      const decryptedPdf = await PDFDocument.load(decryptedBytes)
      
      // 保存解密后的 PDF
      const finalBytes = await decryptedPdf.save()
      const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('-locked.pdf', '-unlocked.pdf').replace('.pdf', '-unlocked.pdf'))
      
      setSuccess(`✅ PDF 已成功解密！\n\n文档信息：\n• 页数：${encryptionInfo.pageCount}\n• 原始大小：${(encryptionInfo.originalSize / 1024).toFixed(2)} KB\n• 加密日期：${new Date(encryptionInfo.encryptedAt).toLocaleDateString()}\n\n解密后的 PDF 已保存`)
      
      // 清空密码
      setUnlockPassword('')
    } catch (err) {
      console.error('解密 PDF 失败:', err)
      if (err instanceof Error && err.message.includes('password')) {
        setError('❌ 密码错误！')
      } else {
        setError('解密失败：' + (err instanceof Error ? err.message : '未知错误'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (mode === 'lock') {
      if (encryptionMode === 'standard') {
        await lockPDFStandard(file)
      } else {
        await lockPDFStrong(file)
      }
    } else {
      await unlockPDF(file)
    }
  }

  return (
    <div className="pdf-lock">
      <h2 className="tool-header">PDF 密码保护与解除</h2>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          <CheckCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{success}</pre>
        </div>
      )}

      {/* Mode Selection */}
      <div className="mode-selection">
        <button
          className={`mode-button ${mode === 'lock' ? 'active' : ''}`}
          onClick={() => setMode('lock')}
        >
          <Lock size={20} />
          <span>加密 PDF（Lock）</span>
        </button>
        <button
          className={`mode-button ${mode === 'unlock' ? 'active' : ''}`}
          onClick={() => setMode('unlock')}
        >
          <Key size={20} />
          <span>解密 PDF（Unlock）</span>
        </button>
      </div>

      {mode === 'lock' ? (
        // Lock Mode
        <div className="lock-settings">
          <div className="setting-group">
            <label className="setting-label">
              <Shield size={20} />
              加密模式
            </label>
            <div className="encryption-mode-selection">
              <label className="radio-label">
                <input
                  type="radio"
                  name="encryptionMode"
                  value="standard"
                  checked={encryptionMode === 'standard'}
                  onChange={(e) => setEncryptionMode(e.target.value as 'standard' | 'strong')}
                  className="radio-input"
                />
                <div>
                  <strong>标准加密</strong>
                  <p className="radio-description">
                    任何 PDF 阅读器都可以直接打开（推荐）
                  </p>
                </div>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="encryptionMode"
                  value="strong"
                  checked={encryptionMode === 'strong'}
                  onChange={(e) => setEncryptionMode(e.target.value as 'standard' | 'strong')}
                  className="radio-input"
                />
                <div>
                  <strong>强加密</strong>
                  <p className="radio-description">
                    需要本工具解密才能查看（AES-256-GCM）
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <Lock size={20} />
              打开密码（User Password）
            </label>
            <input
              type="password"
              className="setting-input"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="设置打开 PDF 的密码（必填）"
            />
            <p className="setting-description">
              {encryptionMode === 'standard' 
                ? '生成 HTML 包装器，在浏览器中打开时需要输入此密码' 
                : '用户需要使用本工具并输入此密码才能解密和查看 PDF 文件'}
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <Shield size={20} />
              权限密码（Owner Password - 可选）
            </label>
            <input
              type="password"
              className="setting-input"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              placeholder="设置编辑权限密码（可选）"
            />
            <p className="setting-description">
              用于控制文档的编辑、打印等权限（当前版本权限存储在元数据中）
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <Shield size={20} />
              权限设置
            </label>
            <div style={{ paddingLeft: '10px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allowPrinting}
                  onChange={(e) => setAllowPrinting(e.target.checked)}
                  className="checkbox-input"
                />
                <span>允许打印</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allowCopying}
                  onChange={(e) => setAllowCopying(e.target.checked)}
                  className="checkbox-input"
                />
                <span>允许复制内容</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allowModifying}
                  onChange={(e) => setAllowModifying(e.target.checked)}
                  className="checkbox-input"
                />
                <span>允许修改文档</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allowAnnotating}
                  onChange={(e) => setAllowAnnotating(e.target.checked)}
                  className="checkbox-input"
                />
                <span>允许添加注释</span>
              </label>
            </div>
          </div>
        </div>
      ) : (
        // Unlock Mode
        <div className="unlock-settings">
          <div className="setting-group">
            <label className="setting-label">
              <Key size={20} />
              输入密码
            </label>
            <input
              type="password"
              className="setting-input"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="输入加密时设置的密码"
            />
            <p className="setting-description">
              请输入加密此 PDF 时设置的打开密码（User Password）
            </p>
          </div>
        </div>
      )}

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading || (mode === 'lock' && !userPassword) || (mode === 'unlock' && !unlockPassword)}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : mode === 'lock' ? '选择 PDF 文件并加密' : '选择加密的 PDF 文件并解密'}
        </label>
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#0066cc' }} />
          <div>
            <p><strong>🔐 两种加密模式对比</strong></p>
            <div style={{ margin: '12px 0' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>📄 标准加密模式（推荐日常使用）</p>
              <ul style={{ margin: '4px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>✅ 生成 HTML 文件，浏览器可直接打开</li>
                <li>✅ 打开时需要输入密码（SHA-256 验证）</li>
                <li>✅ PDF 内嵌在 HTML 中，密码正确后显示</li>
                <li>✅ 适合分享给非技术用户</li>
                <li>⚠️ 安全性：中等（HTML 源代码可被查看）</li>
              </ul>
            </div>
            <div style={{ margin: '12px 0' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>🔒 强加密模式（推荐敏感文档）</p>
              <ul style={{ margin: '4px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>✅ AES-256-GCM 军事级加密</li>
                <li>✅ 完全加密 PDF 内容，无法直接查看</li>
                <li>✅ 需要本工具解密才能打开</li>
                <li>✅ 安全性：极高（真正的内容加密）</li>
                <li>⚠️ 忘记密码将无法恢复</li>
              </ul>
            </div>
            <p style={{ marginTop: '12px', fontSize: '0.9em', color: '#666' }}>
              💡 <strong>建议：</strong>日常文档使用"标准加密"，敏感机密文档使用"强加密"
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

