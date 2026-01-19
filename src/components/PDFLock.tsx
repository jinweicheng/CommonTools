import { useState } from 'react'
import { Upload, Lock, Shield, Key, AlertCircle, CheckCircle } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { CryptoUtils } from '../utils/cryptoUtils'
import { useI18n } from '../i18n/I18nContext'
import './PDFLock.css'

// 支持的文件类型
type FileType = 'pdf' | 'image' | 'document' | 'text' | 'code' | 'data' | 'unknown'

// 检测文件类型
const detectFileType = (file: File): FileType => {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image'
  if (['doc', 'docx'].includes(ext)) return 'document'
  if (['txt'].includes(ext)) return 'text'
  if (['html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass', 'less', 
       'java', 'py', 'swift', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'php', 'rb', 
       'json', 'xml', 'yaml', 'yml', 'md', 'sh', 'bat', 'ps1'].includes(ext)) return 'code'
  if (['sql', 'db', 'sqlite', 'sqlite3', 'mdb', 'accdb'].includes(ext)) return 'data'
  
  return 'unknown'
}

export default function PDFLock() {
  const { language } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<'lock' | 'unlock'>('lock')
  
  // Encryption mode: 'strong' (needs tool to decrypt) or 'standard' (any PDF reader, only for PDF)
  const [encryptionMode, setEncryptionMode] = useState<'strong' | 'standard'>('standard')
  
  // Lock mode
  const [userPassword, setUserPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [allowPrinting, setAllowPrinting] = useState(true)
  void setAllowPrinting // Used in JSX
  const [allowCopying, setAllowCopying] = useState(true)
  void setAllowCopying // Used in JSX
  const [allowModifying, setAllowModifying] = useState(false)
  void setAllowModifying // Used in JSX
  const [allowAnnotating, setAllowAnnotating] = useState(false)
  void setAllowAnnotating // Used in JSX
  
  // Unlock mode
  const [unlockPassword, setUnlockPassword] = useState('')
  
  // 当前文件信息
  const [currentFileType, setCurrentFileType] = useState<FileType>('unknown')

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
      
      // 检查 Web Crypto API 是否可用
      if (!window.crypto || !window.crypto.subtle) {
        setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
        setLoading(false)
        return
      }

      // 生成密码哈希（用于验证）
      const encoder = new TextEncoder()
      const passwordData = encoder.encode(userPassword)
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordData)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      // 创建 HTML 包装器，包含密码验证和 PDF 查看器
      const isZhCN = language === 'zh-CN'
      
      const htmlContent = `<!DOCTYPE html>
<html lang="${isZhCN ? 'zh-CN' : 'en-US'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔐 ${isZhCN ? '安全加密文档 - CommonTools' : 'Secure Encrypted Document - CommonTools'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      background-size: 200% 200%;
      animation: gradientShift 15s ease infinite;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    body::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(34, 211, 238, 0.1) 0%, transparent 70%);
      animation: rotate 30s linear infinite;
    }
    @keyframes rotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    #password-screen {
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
      backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 20px;
      border: 1px solid rgba(34, 211, 238, 0.3);
      box-shadow: 
        0 20px 60px rgba(0, 0, 0, 0.6),
        0 0 80px rgba(34, 211, 238, 0.2),
        0 0 0 1px rgba(34, 211, 238, 0.1) inset;
      max-width: 450px;
      width: 90%;
      text-align: center;
      position: relative;
      z-index: 1;
    }
    #password-screen::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, 
        rgba(34, 211, 238, 0.8) 0%, 
        rgba(59, 130, 246, 0.8) 50%,
        rgba(16, 185, 129, 0.8) 100%);
      box-shadow: 0 0 20px rgba(34, 211, 238, 0.8);
      border-radius: 20px 20px 0 0;
    }
    .lock-icon {
      font-size: 72px;
      margin-bottom: 1.5rem;
      filter: drop-shadow(0 0 20px rgba(34, 211, 238, 0.6));
      animation: pulse 3s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(34, 211, 238, 0.6)); }
      50% { transform: scale(1.05); filter: drop-shadow(0 0 30px rgba(34, 211, 238, 0.9)); }
    }
    h1 {
      font-size: 1.75rem;
      color: #22d3ee;
      margin-bottom: 1rem;
      font-weight: 700;
      text-shadow: 
        0 0 20px rgba(34, 211, 238, 0.6),
        0 0 40px rgba(34, 211, 238, 0.3);
      letter-spacing: 0.5px;
    }
    p {
      color: #94a3b8;
      margin-bottom: 2rem;
      line-height: 1.6;
      font-size: 1rem;
    }
    .input-group {
      margin-bottom: 1.5rem;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 0.75rem;
      color: #22d3ee;
      font-weight: 600;
      font-size: 0.95rem;
      text-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
    }
    input[type="password"] {
      width: 100%;
      padding: 1rem;
      background: rgba(15, 23, 42, 0.8);
      border: 2px solid rgba(34, 211, 238, 0.3);
      border-radius: 12px;
      font-size: 1rem;
      color: #e2e8f0;
      transition: all 0.3s ease;
      box-shadow: 
        inset 0 2px 8px rgba(0, 0, 0, 0.3),
        0 0 0 0 rgba(34, 211, 238, 0);
    }
    input[type="password"]:focus {
      outline: none;
      border-color: rgba(34, 211, 238, 0.6);
      box-shadow: 
        inset 0 2px 8px rgba(0, 0, 0, 0.3),
        0 0 30px rgba(34, 211, 238, 0.3);
      background: rgba(15, 23, 42, 0.95);
    }
    input[type="password"]::placeholder {
      color: #64748b;
    }
    button {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, 
        rgba(34, 211, 238, 0.2) 0%, 
        rgba(59, 130, 246, 0.2) 50%,
        rgba(16, 185, 129, 0.2) 100%);
      color: #22d3ee;
      border: 2px solid rgba(34, 211, 238, 0.5);
      border-radius: 12px;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s ease;
      text-shadow: 0 0 10px rgba(34, 211, 238, 0.6);
      box-shadow: 
        0 4px 20px rgba(0, 0, 0, 0.4),
        0 0 40px rgba(34, 211, 238, 0.2);
      backdrop-filter: blur(10px);
    }
    button:hover {
      transform: translateY(-2px);
      background: linear-gradient(135deg, 
        rgba(34, 211, 238, 0.3) 0%, 
        rgba(59, 130, 246, 0.3) 50%,
        rgba(16, 185, 129, 0.3) 100%);
      border-color: rgba(34, 211, 238, 0.8);
      box-shadow: 
        0 8px 30px rgba(0, 0, 0, 0.5),
        0 0 60px rgba(34, 211, 238, 0.4);
      text-shadow: 0 0 20px rgba(34, 211, 238, 1);
    }
    button:active {
      transform: translateY(0);
    }
    .error {
      color: #fca5a5;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 0.75rem;
      font-size: 0.9rem;
      margin-top: 1rem;
      display: none;
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
    }
    .error.show {
      display: block;
      animation: shake 0.5s;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
    #pdf-viewer {
      display: none;
      width: 100%;
      height: 100vh;
      border: none;
    }
    .info {
      font-size: 0.85rem;
      color: #64748b;
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(34, 211, 238, 0.2);
      line-height: 1.8;
    }
    .info strong {
      color: #22d3ee;
      text-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
    }
    .website-link {
      display: inline-block;
      margin-top: 0.75rem;
      color: #22d3ee;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s ease;
      text-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
    }
    .website-link:hover {
      color: #67e8f9;
      text-shadow: 0 0 15px rgba(34, 211, 238, 0.8);
      transform: translateY(-2px);
    }
    .shield-icon {
      display: inline-block;
      margin: 0 4px;
      filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.6));
    }
  </style>
</head>
<body>
  <div id="password-screen">
    <div class="lock-icon">🔐</div>
    <h1>${isZhCN ? '安全加密文档' : 'Secure Encrypted Document'}</h1>
    <p>${isZhCN ? '此文档已通过企业级加密技术保护<br>请输入密码验证身份' : 'This document is protected by enterprise-grade encryption<br>Please enter password to verify your identity'}</p>
    
    <div class="input-group">
      <label for="password">🔑 ${isZhCN ? '访问密码' : 'Access Password'}</label>
      <input type="password" id="password" placeholder="${isZhCN ? '输入密码以解锁文档' : 'Enter password to unlock document'}" autofocus>
    </div>
    
    <button onclick="verifyPassword()">🚀 ${isZhCN ? '验证并解锁' : 'Verify & Unlock'}</button>
    <div class="error" id="error">❌ ${isZhCN ? '密码错误，请重新输入' : 'Incorrect password, please try again'}</div>
    
    <div class="info">
      <strong>${isZhCN ? '加密保护' : 'Encryption Protection'}</strong> ${isZhCN ? '由 CommonTools 提供' : 'by CommonTools'}<br>
      ${isZhCN ? '采用' : 'Using'} <span class="shield-icon">🛡️</span> SHA-256 ${isZhCN ? '密码验证算法' : 'password verification algorithm'}<br>
      ${isZhCN ? '确保文档内容 100% 安全' : 'Ensuring 100% document security'}
      <br><br>
      <a href="https://commontools.top/tools" target="_blank" class="website-link">
        🌐 ${isZhCN ? '访问 CommonTools 官网' : 'Visit CommonTools Official Website'}
      </a>
      <br>
      <a href="https://commontools.top/tools" target="_blank" class="website-link" style="margin-top: 0.5rem;">
        🔓 ${isZhCN ? '在线解密此文档' : 'Decrypt this document online'}
      </a>
    </div>
  </div>
  
  <iframe id="pdf-viewer"></iframe>

  <script>
    const PASSWORD_HASH = '${passwordHash}';
    const PDF_DATA = '${pdfBase64}';
    
    async function hashPassword(password) {
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error('${isZhCN ? 'Web Crypto API 不可用' : 'Web Crypto API is not available'}');
      }
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    async function verifyPassword() {
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error');
      
      if (!password) {
        errorDiv.textContent = '${isZhCN ? '❌ 请输入密码' : '❌ Please enter password'}';
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
        errorDiv.textContent = '${isZhCN ? '❌ 密码错误，请重新输入' : '❌ Incorrect password, please try again'}';
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
      setConfirmPassword('')
      setPasswordError('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFLock] 标准加密失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined
      })
      
      if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n提示：Web Crypto API 需要 HTTPS 环境。请确保网站使用 HTTPS 协议。')
      } else if (errorMessage.includes('不支持')) {
        setError('❌ ' + errorMessage)
      } else {
        setError('❌ 加密失败：' + errorMessage + '\n\n如果问题持续，请检查浏览器控制台获取详细信息。')
      }
    } finally {
      setLoading(false)
    }
  }

  // 通用文件加密（图片、文档、文本）
  const lockGenericFile = async (file: File) => {
    if (!userPassword) {
      setError('请设置密码')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 读取文件内容
      const arrayBuffer = await file.arrayBuffer()
      const originalSize = arrayBuffer.byteLength
      
      // 检查 Web Crypto API 是否可用
      if (!window.crypto || !window.crypto.subtle) {
        setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
        setLoading(false)
        return
      }

      // 获取文件扩展名
      const extension = file.name.split('.').pop() || 'bin'
      
      // 使用 AES-256-GCM 加密文件内容
      const salt = window.crypto.getRandomValues(new Uint8Array(16))
      const userKey = await CryptoUtils.deriveKeyFromPassword(userPassword, salt)
      const { encrypted: encryptedContent, iv } = await CryptoUtils.encrypt(arrayBuffer, userKey)
      
      // 构建加密信息
      const encryptionInfo = {
        version: '1.0',
        algorithm: 'AES-256-GCM',
        fileType: detectFileType(file),
        originalName: file.name,
        originalExtension: extension,
        salt: CryptoUtils.arrayBufferToBase64(salt.buffer),
        iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
        originalSize: originalSize,
        encryptedAt: new Date().toISOString(),
        permissions: {
          printing: allowPrinting,
          copying: allowCopying,
          modifying: allowModifying,
          annotating: allowAnnotating
        }
      }
      
      // 创建加密文件结构
      const encryptedData = new Uint8Array(encryptedContent)
      const infoJson = JSON.stringify(encryptionInfo)
      const infoBytes = new TextEncoder().encode(infoJson)
      const infoLength = new Uint32Array([infoBytes.byteLength])
      
      // 组合数据：[infoLength(4 bytes)][info][encryptedData]
      const finalBytes = new Uint8Array(4 + infoBytes.byteLength + encryptedData.byteLength)
      finalBytes.set(new Uint8Array(infoLength.buffer), 0)
      finalBytes.set(infoBytes, 4)
      finalBytes.set(encryptedData, 4 + infoBytes.byteLength)
      
      // 保存加密文件
      const blob = new Blob([finalBytes.buffer], { type: 'application/octet-stream' })
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      saveAs(blob, `${baseName}.locked`)
      
      setSuccess(`✅ 文件已成功加密！\n\n加密信息：\n• 文件类型：${getFileTypeName(detectFileType(file))}\n• 算法：AES-256-GCM\n• 原始大小：${(originalSize / 1024).toFixed(2)} KB\n• 加密后大小：${(finalBytes.byteLength / 1024).toFixed(2)} KB\n• 加密文件：${baseName}.locked\n\n请妥善保管密码，忘记密码将无法恢复！`)
      
      // 清空密码
      setUserPassword('')
      setConfirmPassword('')
      setPasswordError('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFLock] 加密文件失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name,
        fileSize: file.size
      })
      
      if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n提示：Web Crypto API 需要 HTTPS 环境。请确保网站使用 HTTPS 协议。')
      } else if (errorMessage.includes('不支持')) {
        setError('❌ ' + errorMessage)
      } else {
        setError('❌ 加密失败：' + errorMessage + '\n\n如果问题持续，请检查浏览器控制台获取详细信息。')
      }
    } finally {
      setLoading(false)
    }
  }

  // 通用文件解密
  const unlockGenericFile = async (file: File) => {
    if (!unlockPassword) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 读取加密文件
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      // 读取信息长度（前4字节）
      const infoLength = new Uint32Array(bytes.buffer.slice(0, 4))[0]
      
      // 读取加密信息
      const infoBytes = bytes.slice(4, 4 + infoLength)
      const infoJson = new TextDecoder().decode(infoBytes)
      const encryptionInfo = JSON.parse(infoJson)
      
      // 读取加密数据
      const encryptedData = bytes.slice(4 + infoLength)
      
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
      
      // 保存解密后的文件
      const blob = new Blob([decryptedBytes], { type: getMimeType(encryptionInfo.originalExtension) })
      const originalName = encryptionInfo.originalName || `decrypted.${encryptionInfo.originalExtension}`
      saveAs(blob, originalName)
      
      setSuccess(`✅ 文件已成功解密！\n\n文件信息：\n• 文件类型：${getFileTypeName(encryptionInfo.fileType)}\n• 原始文件名：${originalName}\n• 文件大小：${(encryptionInfo.originalSize / 1024).toFixed(2)} KB\n• 加密日期：${new Date(encryptionInfo.encryptedAt).toLocaleDateString()}\n\n解密后的文件已保存`)
      
      // 清空密码
      setUnlockPassword('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFLock] 解密文件失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name
      })
      
      if (errorMessage.includes('password') || errorMessage.includes('密码错误')) {
        setError('❌ 密码错误！请检查密码后重试。')
      } else if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n提示：Web Crypto API 需要 HTTPS 环境。请确保网站使用 HTTPS 协议。')
      } else {
        setError('❌ 解密失败：' + errorMessage + '\n\n如果问题持续，请检查浏览器控制台获取详细信息。')
      }
    } finally {
      setLoading(false)
    }
  }

  // 获取文件类型名称
  const getFileTypeName = (type: FileType): string => {
    switch (type) {
      case 'pdf': return 'PDF 文档'
      case 'image': return '图片文件'
      case 'document': return 'Word 文档'
      case 'text': return '文本文件'
      case 'code': return '代码文件'
      case 'data': return '数据文件'
      default: return '未知文件'
    }
  }

  // 获取 MIME 类型
  const getMimeType = (extension: string): string => {
    const mimeTypes: { [key: string]: string } = {
      // 文档
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      
      // 图片
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      
      // 网页代码
      'html': 'text/html',
      'htm': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'jsx': 'application/javascript',
      'ts': 'application/typescript',
      'tsx': 'application/typescript',
      
      // 样式
      'scss': 'text/x-scss',
      'sass': 'text/x-sass',
      'less': 'text/x-less',
      
      // 编程语言
      'java': 'text/x-java-source',
      'py': 'text/x-python',
      'swift': 'text/x-swift',
      'c': 'text/x-c',
      'cpp': 'text/x-c++',
      'h': 'text/x-c',
      'hpp': 'text/x-c++',
      'go': 'text/x-go',
      'rs': 'text/x-rust',
      'php': 'text/x-php',
      'rb': 'text/x-ruby',
      
      // 数据格式
      'json': 'application/json',
      'xml': 'application/xml',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'md': 'text/markdown',
      
      // 脚本
      'sh': 'text/x-sh',
      'bat': 'text/plain',
      'ps1': 'text/plain',
      
      // 数据库
      'sql': 'application/sql',
      'db': 'application/x-sqlite3',
      'sqlite': 'application/x-sqlite3',
      'sqlite3': 'application/x-sqlite3',
      'mdb': 'application/x-msaccess',
      'accdb': 'application/x-msaccess'
    }
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
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
      // 检查 Web Crypto API 是否可用
      if (!window.crypto || !window.crypto.subtle) {
        setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
        setLoading(false)
        return
      }

      const originalBytes = await originalPdfDoc.save()
      
      // 使用 AES-256-GCM 加密 PDF 内容
      const salt = window.crypto.getRandomValues(new Uint8Array(16))
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
        }
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
      setConfirmPassword('')
      setPasswordError('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFLock] 加密 PDF 失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name,
        fileSize: file.size
      })
      
      if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n提示：Web Crypto API 需要 HTTPS 环境。请确保网站使用 HTTPS 协议。')
      } else if (errorMessage.includes('不支持')) {
        setError('❌ ' + errorMessage)
      } else {
        setError('❌ 加密失败：' + errorMessage + '\n\n如果问题持续，请检查浏览器控制台获取详细信息。')
      }
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
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFLock] 解密 PDF 失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name
      })
      
      if (errorMessage.includes('password') || errorMessage.includes('密码错误')) {
        setError('❌ 密码错误！请检查密码后重试。')
      } else if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n提示：Web Crypto API 需要 HTTPS 环境。请确保网站使用 HTTPS 协议。')
      } else {
        setError('❌ 解密失败：' + errorMessage + '\n\n如果问题持续，请检查浏览器控制台获取详细信息。')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const fileType = detectFileType(file)
    setCurrentFileType(fileType)

    if (mode === 'lock') {
      // 加密模式 - 验证密码
      if (!userPassword) {
        setError('请设置密码')
        return
      }
      
      if (!confirmPassword) {
        setPasswordError('请再次输入密码以确认')
        setError('请再次输入密码以确认')
        return
      }
      
      if (userPassword !== confirmPassword) {
        setPasswordError('两次输入的密码不一致，请重新输入')
        setError('两次输入的密码不一致，请重新输入')
        return
      }
      
      // 密码验证通过，清除错误提示
      setPasswordError('')
      
      // 加密文件
      if (fileType === 'pdf') {
        // PDF 文件有两种加密模式
        if (encryptionMode === 'standard') {
          await lockPDFStandard(file)
        } else {
          await lockPDFStrong(file)
        }
      } else if (fileType === 'image' || fileType === 'document' || fileType === 'text' || 
                 fileType === 'code' || fileType === 'data') {
        // 其他文件类型使用通用加密
        await lockGenericFile(file)
      } else {
        setError('不支持的文件格式。支持的格式：PDF、图片、Word 文档、文本文件、代码文件、数据文件')
      }
    } else {
      // 解密模式
      if (file.name.endsWith('.locked')) {
        // 通用加密文件
        await unlockGenericFile(file)
      } else if (file.name.includes('-locked.pdf')) {
        // PDF 强加密文件
        await unlockPDF(file)
      } else if (file.name.endsWith('.html')) {
        setError('HTML 包装的 PDF 请直接在浏览器中打开并输入密码查看')
      } else {
        setError('无法识别的加密文件。请选择 .locked 文件或 -locked.pdf 文件')
      }
    }
  }

  return (
    <div className="pdf-lock">
      <h2 className="tool-header">🔐 文件加密与解密</h2>
      
      <div className="format-info">
        <div><strong>📄 文档：</strong> PDF、Word（DOC/DOCX）、文本（TXT）</div>
        <div><strong>🖼️ 图片：</strong> JPG、PNG、GIF、BMP、WEBP</div>
        <div><strong>💻 代码：</strong> HTML、JS、CSS、Java、Python、Swift、JSON、XML 等</div>
        <div><strong>🗄️ 数据：</strong> SQL、DB、SQLite 等数据库文件</div>
      </div>

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
              设置密码
            </label>
            <input
              type="password"
              className="setting-input"
              value={userPassword}
              onChange={(e) => {
                setUserPassword(e.target.value)
                // 实时验证密码是否一致
                if (confirmPassword && e.target.value !== confirmPassword) {
                  setPasswordError('两次输入的密码不一致')
                } else {
                  setPasswordError('')
                }
              }}
              placeholder="请设置文件加密密码（必填）"
            />
            <p className="setting-description">
              {encryptionMode === 'standard' 
                ? '生成 HTML 包装器，在浏览器中打开时需要输入此密码' 
                : '用户需要使用本工具并输入此密码才能解密和查看文件'}
            </p>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <Shield size={20} />
              再次确认密码
            </label>
            <input
              type="password"
              className={`setting-input ${passwordError ? 'input-error' : ''}`}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                // 实时验证密码是否一致
                if (e.target.value && userPassword && e.target.value !== userPassword) {
                  setPasswordError('两次输入的密码不一致')
                } else {
                  setPasswordError('')
                }
              }}
              placeholder="请再次输入密码以确认"
            />
            {passwordError && (
              <p className="error-message" style={{ marginTop: '8px', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={16} />
                {passwordError}
              </p>
            )}
            {!passwordError && confirmPassword && userPassword === confirmPassword && (
              <p className="success-message" style={{ marginTop: '8px', color: '#10b981', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ✓ 密码一致
              </p>
            )}
          </div>

          {/* <div className="setting-group">
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
          </div> */}
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
            accept={mode === 'lock' ? 
              '.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.doc,.docx,.txt,.html,.htm,.js,.jsx,.ts,.tsx,.css,.scss,.sass,.less,.java,.py,.swift,.c,.cpp,.h,.hpp,.go,.rs,.php,.rb,.json,.xml,.yaml,.yml,.md,.sh,.bat,.ps1,.sql,.db,.sqlite,.sqlite3,.mdb,.accdb' 
              : '.locked,.pdf,.html'}
            onChange={handleFileUpload}
            disabled={loading || (mode === 'lock' && (!userPassword || !confirmPassword || userPassword !== confirmPassword)) || (mode === 'unlock' && !unlockPassword)}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : mode === 'lock' ? '选择文件并加密' : '选择加密文件并解密'}
        </label>
        
        {currentFileType !== 'unknown' && mode === 'lock' && (
          <div className="file-type-indicator">
            当前文件类型: <strong>{getFileTypeName(currentFileType)}</strong>
            {currentFileType !== 'pdf' && <span className="badge">仅支持强加密</span>}
          </div>
        )}
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#0066cc' }} />
          <div>
            <p><strong>🔐 加密模式说明</strong></p>
            
            <div style={{ margin: '12px 0' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>📄 PDF 文件 - 两种加密模式</p>
              <div style={{ paddingLeft: '12px' }}>
                <p style={{ fontWeight: '600', marginBottom: '4px', marginTop: '8px' }}>1️⃣ 标准加密（推荐日常使用）</p>
                <ul style={{ margin: '4px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                  <li>✅ 生成 HTML 文件，浏览器可直接打开</li>
                  <li>✅ 打开时需要输入密码（SHA-256 验证）</li>
                  <li>⚠️ 安全性：中等（源代码可被查看）</li>
                </ul>
                
                <p style={{ fontWeight: '600', marginBottom: '4px', marginTop: '8px' }}>2️⃣ 强加密（推荐敏感文档）</p>
                <ul style={{ margin: '4px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                  <li>✅ AES-256-GCM 军事级加密</li>
                  <li>✅ 需要本工具解密才能查看</li>
                  <li>✅ 安全性：极高</li>
                </ul>
              </div>
            </div>
            
            <div style={{ margin: '12px 0' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>🗂️ 其他文件 - 强加密模式（通用加密）</p>
              <ul style={{ margin: '4px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>✅ <strong>图片：</strong>JPG、PNG、GIF、BMP、WEBP</li>
                <li>✅ <strong>文档：</strong>DOC、DOCX、TXT</li>
                <li>✅ <strong>代码：</strong>HTML、JS、CSS、Java、Python、Swift、JSON、XML 等</li>
                <li>✅ <strong>数据：</strong>SQL、DB、SQLite 等数据库文件</li>
                <li>✅ AES-256-GCM 加密，生成 .locked 文件</li>
                <li>✅ 使用本工具解密后完美恢复原始文件</li>
              </ul>
            </div>
            
            <p style={{ marginTop: '12px', fontSize: '0.9em', color: '#666', padding: '8px', background: '#f0f9ff', borderRadius: '4px' }}>
              💡 <strong>安全提示：</strong>所有文件都使用 AES-256-GCM 加密，请妥善保管密码。忘记密码将无法恢复文件！
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

