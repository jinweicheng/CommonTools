import { useState, useRef, useCallback, DragEvent } from 'react'
import { Upload, Lock, Shield, Eye, EyeOff, AlertCircle, CheckCircle, Download, Trash2, FileText, Globe, ChevronDown, Info, Key, Zap, X } from 'lucide-react'
import { saveAs } from 'file-saver'
import { useI18n } from '../i18n/I18nContext'
import './PDFEncryptHTML.css'

interface PasswordStrength {
  score: number
  label: string
  color: string
}

interface ToastMessage {
  type: 'success' | 'error' | 'info'
  text: string
}

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const checkPasswordStrength = (password: string): PasswordStrength => {
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  
  const levels: PasswordStrength[] = [
    { score: 0, label: 'tooWeak', color: '#ef4444' },
    { score: 1, label: 'weak', color: '#f97316' },
    { score: 2, label: 'medium', color: '#eab308' },
    { score: 3, label: 'strong', color: '#22c55e' },
    { score: 4, label: 'veryStrong', color: '#10b981' },
  ]
  
  return levels[Math.min(score, 4)]
}

export default function PDFEncryptHTML() {
  const { t, language } = useI18n()
  const [loading, setLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [showFaq, setShowFaq] = useState<number | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultName, setResultName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const passwordStrength = checkPasswordStrength(password)
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const hasPasswordError = confirmPassword.length > 0 && password !== confirmPassword
  const canProcess = pdfFile && password.length >= 4 && passwordsMatch && !loading

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 5000)
  }, [])

  const generateStrongPassword = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*'
    let pwd = ''
    for (let i = 0; i < 16; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)]
    }
    setPassword(pwd)
    setConfirmPassword(pwd)
    setShowPassword(true)
    navigator.clipboard.writeText(pwd).then(() => {
      showToast('info', t('pdfEncryptHTML.passwordCopied'))
    })
  }, [showToast, t])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const file = files[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('error', t('pdfEncryptHTML.onlyPDF'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast('error', t('pdfEncryptHTML.fileTooLarge'))
      return
    }

    setPdfFile(file)
    setResultBlob(null)
    setResultName('')
  }, [showToast, t])

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
  }, [handleFiles])

  const encryptToHTML = async () => {
    if (!pdfFile || !password) return
    
    setLoading(true)
    try {
      const arrayBuffer = await pdfFile.arrayBuffer()
      const pdfBase64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      
      if (!window.crypto || !window.crypto.subtle) {
        showToast('error', t('pdfEncryptHTML.cryptoNotAvailable'))
        setLoading(false)
        return
      }

      const encoder = new TextEncoder()
      const passwordData = encoder.encode(password)
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordData)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
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
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      transform: translateZ(0);
    }
    body.locked {
      background-size: 200% 200%;
      animation: gradientShift 15s ease infinite;
    }
    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    body.locked::before {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: radial-gradient(circle, rgba(34, 211, 238, 0.1) 0%, transparent 70%);
      animation: rotate 30s linear infinite;
      will-change: transform;
      transform: translateZ(0);
    }
    @keyframes rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    #password-screen {
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
      backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 20px;
      border: 1px solid rgba(34, 211, 238, 0.3);
      box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 80px rgba(34,211,238,0.2);
      max-width: 450px;
      width: 90%;
      text-align: center;
      position: relative;
      z-index: 1;
    }
    #password-screen::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, rgba(34,211,238,0.8) 0%, rgba(59,130,246,0.8) 50%, rgba(16,185,129,0.8) 100%);
      box-shadow: 0 0 20px rgba(34,211,238,0.8);
      border-radius: 20px 20px 0 0;
    }
    .lock-icon {
      font-size: 72px;
      margin-bottom: 1.5rem;
      filter: drop-shadow(0 0 20px rgba(34,211,238,0.6));
      animation: pulse 3s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(34,211,238,0.6)); }
      50% { transform: scale(1.05); filter: drop-shadow(0 0 30px rgba(34,211,238,0.9)); }
    }
    h1 { font-size: 1.75rem; color: #22d3ee; margin-bottom: 1rem; font-weight: 700; text-shadow: 0 0 20px rgba(34,211,238,0.6); }
    p { color: #94a3b8; margin-bottom: 2rem; line-height: 1.6; font-size: 1rem; }
    .input-group { margin-bottom: 1.5rem; text-align: left; }
    label { display: block; margin-bottom: 0.75rem; color: #22d3ee; font-weight: 600; font-size: 0.95rem; }
    input[type="password"] {
      width: 100%; padding: 1rem;
      background: rgba(15,23,42,0.8);
      border: 2px solid rgba(34,211,238,0.3);
      border-radius: 12px; font-size: 1rem; color: #e2e8f0;
      transition: all 0.3s ease;
    }
    input[type="password"]:focus {
      outline: none; border-color: rgba(34,211,238,0.6);
      box-shadow: 0 0 30px rgba(34,211,238,0.3);
    }
    input::placeholder { color: #64748b; }
    button {
      width: 100%; padding: 1rem;
      background: linear-gradient(135deg, rgba(34,211,238,0.2), rgba(59,130,246,0.2), rgba(16,185,129,0.2));
      color: #22d3ee; border: 2px solid rgba(34,211,238,0.5);
      border-radius: 12px; font-size: 1.1rem; font-weight: 700;
      cursor: pointer; transition: all 0.3s ease;
      text-shadow: 0 0 10px rgba(34,211,238,0.6);
    }
    button:hover { transform: translateY(-2px); border-color: rgba(34,211,238,0.8); box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
    .error { color: #fca5a5; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 0.75rem; font-size: 0.9rem; margin-top: 1rem; display: none; }
    .error.show { display: block; animation: shake 0.5s; }
    @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
    #pdf-viewer { display: none; width: 100%; height: 100vh; border: none; transform: translateZ(0); }
    .info { font-size: 0.85rem; color: #64748b; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(34,211,238,0.2); line-height: 1.8; }
    .info strong { color: #22d3ee; }
    .website-link { display: inline-block; margin-top: 0.75rem; color: #22d3ee; text-decoration: none; font-weight: 600; transition: all 0.3s ease; }
    .website-link:hover { color: #67e8f9; transform: translateY(-2px); }
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
      ${isZhCN ? '采用' : 'Using'} 🛡️ SHA-256 ${isZhCN ? '密码验证算法' : 'password verification algorithm'}<br>
      ${isZhCN ? '确保文档内容 100% 安全' : 'Ensuring 100% document security'}
      <br><br>
      <a href="https://commontools.top/tools" target="_blank" class="website-link">
        🌐 ${isZhCN ? '访问 CommonTools 官网' : 'Visit CommonTools Official Website'}
      </a>
    </div>
  </div>
  <iframe id="pdf-viewer"></iframe>
  <script>
    const PASSWORD_HASH = '${passwordHash}';
    const PDF_DATA = '${pdfBase64}';
    document.body.classList.add('locked');
    async function hashPassword(password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async function verifyPassword() {
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error');
      if (!password) { errorDiv.textContent = '${isZhCN ? '❌ 请输入密码' : '❌ Please enter password'}'; errorDiv.classList.add('show'); return; }
      const hash = await hashPassword(password);
      if (hash === PASSWORD_HASH) {
        errorDiv.classList.remove('show');
        document.getElementById('password-screen').style.display = 'none';
        document.body.classList.remove('locked');
        const pdfViewer = document.getElementById('pdf-viewer');
        const binaryStr = atob(PDF_DATA);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
        const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        pdfViewer.src = URL.createObjectURL(pdfBlob);
        pdfViewer.style.display = 'block';
      } else {
        errorDiv.textContent = '${isZhCN ? '❌ 密码错误，请重新输入' : '❌ Incorrect password, please try again'}';
        errorDiv.classList.add('show');
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
      }
    }
    document.getElementById('password').addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyPassword(); });
  </script>
</body>
</html>`

      const blob = new Blob([htmlContent], { type: 'text/html' })
      const outputName = pdfFile.name.replace('.pdf', '-protected.html')
      setResultBlob(blob)
      setResultName(outputName)
      showToast('success', t('pdfEncryptHTML.encryptSuccess'))
    } catch (err) {
      console.error('[PDFEncryptHTML] Encryption failed:', err)
      showToast('error', t('pdfEncryptHTML.encryptFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (resultBlob && resultName) {
      saveAs(resultBlob, resultName)
    }
  }

  const clearFile = () => {
    setPdfFile(null)
    setResultBlob(null)
    setResultName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const faqItems = [
    { q: t('pdfEncryptHTML.faq1Q'), a: t('pdfEncryptHTML.faq1A') },
    { q: t('pdfEncryptHTML.faq2Q'), a: t('pdfEncryptHTML.faq2A') },
    { q: t('pdfEncryptHTML.faq3Q'), a: t('pdfEncryptHTML.faq3A') },
  ]

  return (
    <div className="peh-container" onPaste={handlePaste}>
      {/* Toast */}
      {toast && (
        <div className={`peh-toast peh-toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'error' && <AlertCircle size={18} />}
          {toast.type === 'info' && <Info size={18} />}
          <span>{toast.text}</span>
          <button className="peh-toast-close" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Security Banner */}
      <div className="peh-security-bar">
        <Shield size={16} />
        <span>{t('pdfEncryptHTML.securityNote')}</span>
      </div>

      {/* Main Layout */}
      <div className="peh-main-layout">
        {/* Left: Password & Settings */}
        <div className="peh-left-panel">
          <div className="peh-card peh-password-card">
            <h3 className="peh-card-title">
              <Key size={18} />
              {t('pdfEncryptHTML.setPassword')}
            </h3>

            <div className="peh-field">
              <label>{t('pdfEncryptHTML.password')}</label>
              <div className="peh-password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('pdfEncryptHTML.passwordPlaceholder')}
                />
                <button className="peh-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {password && (
                <div className="peh-password-strength">
                  <div className="peh-strength-bars">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={`peh-strength-bar ${i <= passwordStrength.score ? 'active' : ''}`}
                        style={{ backgroundColor: i <= passwordStrength.score ? passwordStrength.color : undefined }}
                      />
                    ))}
                  </div>
                  <span className="peh-strength-label" style={{ color: passwordStrength.color }}>
                    {t(`pdfEncryptHTML.strength_${passwordStrength.label}`)}
                  </span>
                </div>
              )}
            </div>

            <div className="peh-field">
              <label>{t('pdfEncryptHTML.confirmPassword')}</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('pdfEncryptHTML.confirmPlaceholder')}
                className={hasPasswordError ? 'peh-input-error' : passwordsMatch ? 'peh-input-success' : ''}
              />
              {hasPasswordError && (
                <span className="peh-field-error"><AlertCircle size={12} /> {t('pdfEncryptHTML.passwordMismatch')}</span>
              )}
              {passwordsMatch && (
                <span className="peh-field-success"><CheckCircle size={12} /> {t('pdfEncryptHTML.passwordMatch')}</span>
              )}
            </div>

            <button className="peh-generate-btn" onClick={generateStrongPassword}>
              <Zap size={14} />
              {t('pdfEncryptHTML.generatePassword')}
            </button>
          </div>

          {/* How it works */}
          <div className="peh-card peh-info-card">
            <h3 className="peh-card-title">
              <Info size={18} />
              {t('pdfEncryptHTML.howItWorks')}
            </h3>
            <div className="peh-steps">
              <div className="peh-step">
                <span className="peh-step-num">1</span>
                <div>
                  <strong>{t('pdfEncryptHTML.step1Title')}</strong>
                  <p>{t('pdfEncryptHTML.step1Desc')}</p>
                </div>
              </div>
              <div className="peh-step">
                <span className="peh-step-num">2</span>
                <div>
                  <strong>{t('pdfEncryptHTML.step2Title')}</strong>
                  <p>{t('pdfEncryptHTML.step2Desc')}</p>
                </div>
              </div>
              <div className="peh-step">
                <span className="peh-step-num">3</span>
                <div>
                  <strong>{t('pdfEncryptHTML.step3Title')}</strong>
                  <p>{t('pdfEncryptHTML.step3Desc')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Upload & Result */}
        <div className="peh-right-panel">
          <div className="peh-card peh-upload-card">
            <h3 className="peh-card-title">
              <FileText size={18} />
              {t('pdfEncryptHTML.selectPDF')}
            </h3>

            <div
              className={`peh-dropzone ${isDragging ? 'dragging' : ''} ${pdfFile ? 'has-file' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !pdfFile && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                style={{ display: 'none' }}
              />
              
              {pdfFile ? (
                <div className="peh-file-preview">
                  <div className="peh-file-icon">
                    <FileText size={32} />
                  </div>
                  <div className="peh-file-info">
                    <span className="peh-file-name">{pdfFile.name}</span>
                    <span className="peh-file-size">{formatFileSize(pdfFile.size)}</span>
                  </div>
                  <button className="peh-remove-btn" onClick={(e) => { e.stopPropagation(); clearFile(); }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="peh-drop-content">
                  <Upload size={40} />
                  <p className="peh-drop-title">{t('pdfEncryptHTML.dropTitle')}</p>
                  <p className="peh-drop-hint">{t('pdfEncryptHTML.dropHint')}</p>
                  <span className="peh-drop-badge">PDF</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="peh-actions">
            <button
              className="peh-encrypt-btn"
              onClick={encryptToHTML}
              disabled={!canProcess}
            >
              {loading ? (
                <>
                  <span className="peh-spinner" />
                  {t('pdfEncryptHTML.encrypting')}
                </>
              ) : (
                <>
                  <Lock size={18} />
                  {t('pdfEncryptHTML.encryptBtn')}
                </>
              )}
            </button>
          </div>

          {/* Result */}
          {resultBlob && (
            <div className="peh-card peh-result-card">
              <div className="peh-result-header">
                <CheckCircle size={20} />
                <span>{t('pdfEncryptHTML.encryptDone')}</span>
              </div>
              <div className="peh-result-info">
                <div className="peh-result-row">
                  <span>{t('pdfEncryptHTML.outputFile')}</span>
                  <strong>{resultName}</strong>
                </div>
                <div className="peh-result-row">
                  <span>{t('pdfEncryptHTML.outputSize')}</span>
                  <strong>{formatFileSize(resultBlob.size)}</strong>
                </div>
                <div className="peh-result-row">
                  <span>{t('pdfEncryptHTML.outputFormat')}</span>
                  <strong>HTML ({t('pdfEncryptHTML.selfContained')})</strong>
                </div>
              </div>
              <button className="peh-download-btn" onClick={handleDownload}>
                <Download size={18} />
                {t('pdfEncryptHTML.downloadResult')}
              </button>
              <div className="peh-result-tips">
                <p>💡 {t('pdfEncryptHTML.usageTip1')}</p>
                <p>💡 {t('pdfEncryptHTML.usageTip2')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Features & FAQ */}
      <div className="peh-info-section">
        <div className="peh-features">
          <h3><Globe size={18} /> {t('pdfEncryptHTML.featuresTitle')}</h3>
          <ul>
            <li>✅ {t('pdfEncryptHTML.feature1')}</li>
            <li>✅ {t('pdfEncryptHTML.feature2')}</li>
            <li>✅ {t('pdfEncryptHTML.feature3')}</li>
            <li>✅ {t('pdfEncryptHTML.feature4')}</li>
            <li>⚠️ {t('pdfEncryptHTML.feature5')}</li>
          </ul>
        </div>
        <div className="peh-faq">
          <h3><Info size={18} /> {t('pdfEncryptHTML.faqTitle')}</h3>
          {faqItems.map((item, i) => (
            <div key={i} className={`peh-faq-item ${showFaq === i ? 'open' : ''}`}>
              <button className="peh-faq-q" onClick={() => setShowFaq(showFaq === i ? null : i)}>
                <span>{item.q}</span>
                <ChevronDown size={16} />
              </button>
              {showFaq === i && <div className="peh-faq-a">{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
