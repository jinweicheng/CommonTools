import { useState } from 'react'
import { Upload, Lock, Shield, Key, AlertCircle, CheckCircle, Globe, FileLock } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { CryptoUtils } from '../utils/cryptoUtils'
import { useAuth } from '../contexts/AuthContext'
import { backupService, hashPassword } from '../utils/backupService'
import { useI18n } from '../i18n/I18nContext'
import './PDFEncryption.css'

export default function PDFEncryption() {
  const { isVip } = useAuth()
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<'lock' | 'unlock'>('lock')
  const [encryptionMode, setEncryptionMode] = useState<'html' | 'encrypted'>('html')
  const [userPassword, setUserPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')

  // 将 emoji 转换为图片（避免 WinAnsi 编码错误）
  const emojiToImage = async (emoji: string, size: number): Promise<string> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)
    
    ctx.font = `${size}px Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2)
    
    return canvas.toDataURL('image/png')
  }

  // HTML包装器模式：创建带密码验证页的HTML文件
  const lockPDFHTML = async (file: File) => {
    if (!userPassword) {
      setError(t('encryption.setPassword'))
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
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

      const encoder = new TextEncoder()
      const passwordData = encoder.encode(userPassword)
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordData)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
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
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error('Web Crypto API 不可用');
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
        errorDiv.textContent = '请输入密码';
        errorDiv.classList.add('show');
        return;
      }
      
      const hash = await hashPassword(password);
      
      if (hash === PASSWORD_HASH) {
        errorDiv.classList.remove('show');
        document.getElementById('password-screen').style.display = 'none';
        
        const pdfViewer = document.getElementById('pdf-viewer');
        const pdfBlob = base64ToBlob(PDF_DATA, 'application/pdf');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        pdfViewer.src = pdfUrl;
        pdfViewer.style.display = 'block';
      } else {
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
    
    document.getElementById('password').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        verifyPassword();
      }
    });
  </script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' })
      saveAs(blob, file.name.replace('.pdf', '-protected.html'))
      
      // VIP用户备份操作记录
      if (isVip()) {
        try {
          const passwordHash = await hashPassword(userPassword)
          await backupService.addRecord({
            type: 'encrypt',
            fileType: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            encryptionMode: 'standard',
            metadata: {
              passwordHash,
              operation: 'HTML包装器加密'
            }
          })
        } catch (err) {
          console.error('备份失败:', err)
        }
      }
      
      setSuccess(`✅ ${t('encryption.htmlSuccessTitle')}！\n\n${t('common.success')}：\n• ${t('encryption.htmlSuccessMode')}\n• ${t('encryption.htmlSuccessFormat')}\n• ${t('encryption.htmlSuccessVerify')}\n• ${t('encryption.htmlSuccessSize')}：${(blob.size / 1024).toFixed(2)} KB${isVip() ? `\n• ${t('common.vip')} ${t('common.save')}` : ''}\n\n${t('common.usage')}：\n1. ${t('encryption.htmlSuccessUsage1')}\n2. ${t('encryption.htmlSuccessUsage2')}\n3. ${t('encryption.htmlSuccessUsage3')}\n\n⚠️ ${t('common.note')}：\n• ${t('encryption.htmlSuccessWarning')}\n• ${t('encryption.htmlSuccessRecommend')}`)
      
      setUserPassword('')
      setConfirmPassword('')
      setPasswordError('')
    } catch (err) {
      console.error('HTML加密失败:', err)
      setError(t('errors.processingFailed') + ': ' + (err instanceof Error ? err.message : t('common.unknownError')))
    } finally {
      setLoading(false)
    }
  }

  // 加密文件模式：使用 AES-256-GCM 加密
  const lockPDFEncrypted = async (file: File) => {
    if (!userPassword) {
      setError(t('encryption.setPassword'))
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const originalPdfDoc = await PDFDocument.load(arrayBuffer)
      
      const pageCount = originalPdfDoc.getPageCount()
      const originalBytes = await originalPdfDoc.save()
      
      // 检查 Web Crypto API 是否可用
      if (!window.crypto || !window.crypto.subtle) {
        setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
        setLoading(false)
        return
      }
      
      const salt = window.crypto.getRandomValues(new Uint8Array(16))
      const userKey = await CryptoUtils.deriveKeyFromPassword(userPassword, salt)
      const { encrypted: encryptedContent, iv } = await CryptoUtils.encrypt(originalBytes.buffer as ArrayBuffer, userKey)
      
      const protectedPdf = await PDFDocument.create()
      
      protectedPdf.setTitle('🔒 Encrypted PDF Document')
      protectedPdf.setSubject('This document is protected with AES-256 encryption')
      protectedPdf.setCreator('CommonTools PDF Lock')
      protectedPdf.setProducer('CommonTools - AES-256-GCM Encryption')
      
      const encryptionInfo = {
        version: '1.0',
        algorithm: 'AES-256-GCM',
        salt: CryptoUtils.arrayBufferToBase64(salt.buffer),
        iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
        pageCount: pageCount,
        originalSize: originalBytes.byteLength,
        encryptedAt: new Date().toISOString(),
      }
      
      protectedPdf.setKeywords([
        'encrypted',
        'aes-256-gcm',
        'password-protected',
        `v:${encryptionInfo.version}`,
        `pages:${pageCount}`,
        `date:${new Date().toISOString().split('T')[0]}`
      ])
      
      const page = protectedPdf.addPage([595, 842])
      const { width, height } = page.getSize()
      const font = await protectedPdf.embedFont(StandardFonts.Helvetica)
      const boldFont = await protectedPdf.embedFont(StandardFonts.HelveticaBold)
      
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
      
      const title = 'ENCRYPTED PDF DOCUMENT'
      page.drawText(title, {
        x: width / 2 - boldFont.widthOfTextAtSize(title, 20) / 2,
        y: height - 150,
        size: 20,
        font: boldFont,
      })
      
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
      ]
      
      let yPos = height - 200
      instructions.forEach(line => {
        const fontSize = line.startsWith('-') ? 10 : 12
        const lineFont = line.startsWith('Document Information:') ? boldFont : font
        page.drawText(line, {
          x: 50,
          y: yPos,
          size: fontSize,
          font: lineFont,
        })
        yPos -= fontSize + 6
      })
      
      protectedPdf.setSubject(JSON.stringify(encryptionInfo))
      
      const protectedBytes = await protectedPdf.save()
      
      const finalBytes = new Uint8Array(protectedBytes.byteLength + encryptedContent.byteLength + 1024)
      finalBytes.set(new Uint8Array(protectedBytes), 0)
      
      const separator = new TextEncoder().encode('\n%%ENCRYPTED_DATA_START%%\n')
      finalBytes.set(separator, protectedBytes.byteLength)
      
      finalBytes.set(new Uint8Array(encryptedContent), protectedBytes.byteLength + separator.byteLength)
      
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
      saveAs(blob, file.name.replace('.pdf', '-encrypted.pdf'))
      
      setSuccess(`✅ ${t('encryption.encryptedSuccessTitle')}！\n\n${t('common.success')}：\n• ${t('encryption.encryptedSuccessAlgorithm')}\n• ${t('encryption.encryptedSuccessPages')}：${pageCount}\n• ${t('encryption.encryptedSuccessOriginalSize')}：${(originalBytes.byteLength / 1024).toFixed(2)} KB\n• ${t('encryption.encryptedSuccessEncryptedSize')}：${(trimmedBytes.byteLength / 1024).toFixed(2)} KB\n\n${t('encryption.encryptedSuccessWarning')}`)
      
      setUserPassword('')
      setConfirmPassword('')
      setPasswordError('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFEncryption] 加密 PDF 失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name,
        fileSize: file.size
      })
      
      // 提供更友好的错误信息
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
      // 检查 Web Crypto API 是否可用
      if (!window.crypto || !window.crypto.subtle) {
        setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
        setLoading(false)
        return
      }

      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      const text = new TextDecoder().decode(bytes)
      const infoMatch = text.match(/%%ENCRYPTED_DATA_INFO%%\n(.*?)\n%%END%%/s)
      
      if (!infoMatch) {
        setError('❌ 这不是一个有效的加密 PDF 文件')
        return
      }
      
      const encryptionInfo = JSON.parse(infoMatch[1])
      
      const encryptedData = bytes.slice(encryptionInfo.dataOffset, encryptionInfo.dataOffset + encryptionInfo.dataLength)
      
      const salt = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.salt))
      const iv = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.iv))
      
      const key = await CryptoUtils.deriveKeyFromPassword(unlockPassword, salt)
      
      let decryptedBytes
      try {
        decryptedBytes = await CryptoUtils.decrypt(encryptedData.buffer, key, iv)
      } catch (err) {
        setError('❌ ' + t('encryption.passwordIncorrect'))
        return
      }
      
      const decryptedPdf = await PDFDocument.load(decryptedBytes)
      
      const finalBytes = await decryptedPdf.save()
      const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('-encrypted.pdf', '-decrypted.pdf').replace('.pdf', '-decrypted.pdf'))
      
      setSuccess(`✅ ${t('success.fileProcessed')}！\n\n${t('common.success')}：\n• ${t('encryption.encryptedSuccessPages')}：${encryptionInfo.pageCount}\n• ${t('encryption.encryptedSuccessOriginalSize')}：${(encryptionInfo.originalSize / 1024).toFixed(2)} KB\n• ${t('common.date')}：${new Date(encryptionInfo.encryptedAt).toLocaleDateString()}\n\n${t('success.fileDownloaded')}`)
      
      setUnlockPassword('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[PDFEncryption] 解密 PDF 失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name
      })
      
      if (errorMessage.includes('password') || errorMessage.includes('密码错误')) {
        setError('❌ ' + t('encryption.passwordIncorrect'))
      } else if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n' + t('common.hint') + '：Web Crypto API ' + t('common.requires') + ' HTTPS ' + t('common.environment'))
      } else {
        setError('❌ ' + t('encryption.decryptFailed') + '：' + errorMessage + '\n\n' + t('encryption.checkConsole'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (mode === 'lock') {
      if (!userPassword) {
        setError(t('encryption.setPassword'))
        return
      }
      
      if (!confirmPassword) {
        setPasswordError(t('compression.confirmPassword'))
        setError(t('compression.confirmPassword'))
        return
      }
      
      if (userPassword !== confirmPassword) {
        setPasswordError(t('encryption.passwordMismatch'))
        setError(t('encryption.passwordMismatch'))
        return
      }
      
      setPasswordError('')
      
      if (encryptionMode === 'html') {
        await lockPDFHTML(file)
      } else {
        await lockPDFEncrypted(file)
      }
    } else {
      if (file.name.endsWith('.html')) {
        setError(t('encryption.htmlFileHint'))
      } else if (file.name.includes('-encrypted.pdf')) {
        await unlockPDF(file)
      } else {
        setError(t('encryption.unrecognizedFile'))
      }
    }
  }

  return (
    <div className="pdf-encryption">
      <div className="encryption-header-compact">
        <div className="header-content-compact">
          <h2 className="section-title-compact">{t('encryption.pdfEncryption')}</h2>
          <p className="section-description-compact">
            {t('encryption.twoEncryptionModes')}
          </p>
        </div>
      </div>

      {error && (
        <div className="message-box error-box">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="message-box success-box">
          <CheckCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{success}</pre>
        </div>
      )}

      <div className="mode-tabs">
        <button
          className={`tab-button ${mode === 'lock' ? 'active' : ''}`}
          onClick={() => setMode('lock')}
        >
          <Lock size={20} />
          <span>{t('encryption.lock')} PDF</span>
        </button>
        <button
          className={`tab-button ${mode === 'unlock' ? 'active' : ''}`}
          onClick={() => setMode('unlock')}
        >
          <Key size={20} />
          <span>{t('encryption.unlock')} PDF</span>
        </button>
      </div>

      {mode === 'lock' ? (
        <div className="encryption-panel">
          <div className="encryption-mode-selector">
            <div className={`mode-card ${encryptionMode === 'html' ? 'selected' : ''}`} onClick={() => setEncryptionMode('html')}>
              <input
                type="radio"
                name="encryptionMode"
                value="html"
                checked={encryptionMode === 'html'}
                onChange={() => setEncryptionMode('html')}
                className="mode-radio"
              />
              <div className="mode-content">
                <div className="mode-icon html">
                  <Globe size={32} />
                </div>
                <div className="mode-info">
                  <h3 className="mode-title">{t('encryption.htmlModeTitle')}</h3>
                  <p className="mode-description">
                    {t('encryption.htmlModeDesc1')}，{t('encryption.htmlModeDesc3')}
                  </p>
                  <div className="mode-features">
                    <span className="feature-tag">✓ {t('encryption.htmlModeFeature1')}</span>
                    <span className="feature-tag">✓ {t('encryption.htmlModeFeature2')}</span>
                    <span className="feature-tag warning">⚠ {t('encryption.htmlModeFeature3')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`mode-card ${encryptionMode === 'encrypted' ? 'selected' : ''}`} onClick={() => setEncryptionMode('encrypted')}>
              <input
                type="radio"
                name="encryptionMode"
                value="encrypted"
                checked={encryptionMode === 'encrypted'}
                onChange={() => setEncryptionMode('encrypted')}
                className="mode-radio"
              />
              <div className="mode-content">
                <div className="mode-icon encrypted">
                  <FileLock size={32} />
                </div>
                <div className="mode-info">
                  <h3 className="mode-title">{t('encryption.encryptedModeTitle')}</h3>
                  <p className="mode-description">
                    {t('encryption.encryptedModeDesc1')}，{t('encryption.encryptedModeDesc2')}，{t('encryption.encryptedModeDesc3')}
                  </p>
                  <div className="mode-features">
                    <span className="feature-tag">✓ {t('encryption.encryptedModeFeature1')}</span>
                    <span className="feature-tag">✓ {t('encryption.encryptedModeDesc4')}</span>
                    <span className="feature-tag">✓ {t('encryption.encryptedModeDesc2')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="password-section">
            <div className="input-group">
              <label className="input-label">
                <Shield size={18} />
                {t('common.password')}
              </label>
              <input
                type="password"
                className="password-input"
                value={userPassword}
                onChange={(e) => {
                  setUserPassword(e.target.value)
                  if (confirmPassword && e.target.value !== confirmPassword) {
                    setPasswordError(t('encryption.passwordMismatch'))
                  } else {
                    setPasswordError('')
                  }
                }}
                placeholder={t('encryption.passwordRequired')}
              />
            </div>

            <div className="input-group">
              <label className="input-label">
                <Shield size={18} />
                {t('compression.confirmPassword')}
              </label>
              <input
                type="password"
                className={`password-input ${passwordError ? 'input-error' : ''} ${!passwordError && confirmPassword && userPassword === confirmPassword ? 'input-success' : ''}`}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (e.target.value && userPassword && e.target.value !== userPassword) {
                    setPasswordError(t('encryption.passwordMismatch'))
                  } else {
                    setPasswordError('')
                  }
                }}
                placeholder={t('compression.confirmPassword')}
              />
              {passwordError && (
                <div className="input-feedback error">
                  <AlertCircle size={14} />
                  {passwordError}
                </div>
              )}
              {!passwordError && confirmPassword && userPassword === confirmPassword && (
                <div className="input-feedback success">
                  <CheckCircle size={14} />
                  {t('common.success')}
                </div>
              )}
            </div>
          </div>

          <div className="upload-section">
            <label className="upload-button">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={loading || !userPassword || !confirmPassword || userPassword !== confirmPassword}
                style={{ display: 'none' }}
              />
              <Upload size={20} />
              {loading ? t('common.loading') : t('encryption.selectFile') + ' ' + t('encryption.lock')}
            </label>
          </div>
        </div>
      ) : (
        <div className="decryption-panel">
          <div className="input-group">
            <label className="input-label">
              <Key size={18} />
              {t('encryption.passwordRequired')}
            </label>
            <input
              type="password"
              className="password-input"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder={t('encryption.passwordRequired')}
            />
            <p className="input-hint">
              {t('encryption.passwordRequired')}
            </p>
          </div>

          <div className="upload-section">
            <label className="upload-button">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={loading || !unlockPassword}
                style={{ display: 'none' }}
              />
              <Upload size={20} />
              {loading ? t('common.loading') : t('encryption.selectEncryptedFile') + ' ' + t('encryption.unlock')}
            </label>
          </div>
        </div>
      )}

      <div className="info-panel">
        <div className="info-header">
          <AlertCircle size={20} />
          <span>{t('encryption.modeDescription')}</span>
        </div>
        <div className="info-content">
          <div className="info-item">
            <div className="info-icon html">
              <Globe size={20} />
            </div>
            <div className="info-text">
              <strong>{t('encryption.htmlModeTitle')}</strong>
              <ul>
                <li>{t('encryption.htmlModeDesc1')}</li>
                <li>{t('encryption.htmlModeDesc2')}</li>
                <li>{t('encryption.htmlModeDesc3')}</li>
                <li>⚠️ {t('encryption.htmlModeDesc4')}</li>
              </ul>
            </div>
          </div>
          <div className="info-item">
            <div className="info-icon encrypted">
              <FileLock size={20} />
            </div>
            <div className="info-text">
              <strong>{t('encryption.encryptedModeTitle')}</strong>
              <ul>
                <li>{t('encryption.encryptedModeDesc1')}</li>
                <li>{t('encryption.encryptedModeDesc2')}</li>
                <li>{t('encryption.encryptedModeDesc3')}</li>
                <li>✅ {t('encryption.encryptedModeDesc4')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

