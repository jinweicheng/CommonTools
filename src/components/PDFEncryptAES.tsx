import { useState, useRef, useCallback, DragEvent } from 'react'
import { Upload, Lock, Unlock, Shield, Key, Eye, EyeOff, AlertCircle, CheckCircle, Download, Trash2, FileText, ChevronDown, Info, Zap, X } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { CryptoUtils } from '../utils/cryptoUtils'
import { useI18n } from '../i18n/I18nContext'
import './PDFEncryptAES.css'

type Mode = 'encrypt' | 'decrypt'

interface PasswordStrength {
  score: number
  label: string
  color: string
}

interface ToastMessage {
  type: 'success' | 'error' | 'info'
  text: string
}

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB
const ENCRYPTION_VERSION = '2.0'

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

export default function PDFEncryptAES() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('encrypt')
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
  const [resultInfo, setResultInfo] = useState<{ pages?: number; originalSize?: number; encryptedSize?: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const passwordStrength = checkPasswordStrength(password)
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const hasPasswordError = confirmPassword.length > 0 && password !== confirmPassword
  const canEncrypt = pdfFile && password.length >= 4 && passwordsMatch && !loading
  const canDecrypt = pdfFile && password.length > 0 && !loading

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
      showToast('info', t('pdfEncryptAES.passwordCopied'))
    })
  }, [showToast, t])

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setPdfFile(null)
    setResultBlob(null)
    setResultName('')
    setResultInfo(null)
    setPassword('')
    setConfirmPassword('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFiles = useCallback((files: FileList | File[]) => {
    const file = files[0]
    if (!file) return

    if (mode === 'encrypt' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('error', t('pdfEncryptAES.onlyPDF'))
      return
    }
    if (mode === 'decrypt' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('error', t('pdfEncryptAES.selectEncryptedPDF'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast('error', t('pdfEncryptAES.fileTooLarge'))
      return
    }

    setPdfFile(file)
    setResultBlob(null)
    setResultName('')
    setResultInfo(null)
  }, [mode, showToast, t])

  // Emoji to image for PDF cover page
  const emojiToImage = async (emoji: string, size: number): Promise<ArrayBuffer> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)
    ctx.font = `${size}px Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2)
    const dataUrl = canvas.toDataURL('image/png')
    return await fetch(dataUrl).then(res => res.arrayBuffer())
  }

  // AES-256-GCM Encryption
  const encryptPDF = async () => {
    if (!pdfFile || !password) return
    
    setLoading(true)
    try {
      if (!window.crypto || !window.crypto.subtle) {
        showToast('error', t('pdfEncryptAES.cryptoNotAvailable'))
        setLoading(false)
        return
      }

      const arrayBuffer = await pdfFile.arrayBuffer()
      const originalPdf = await PDFDocument.load(arrayBuffer)
      const pageCount = originalPdf.getPageCount()
      const originalBytes = await originalPdf.save()
      
      const salt = window.crypto.getRandomValues(new Uint8Array(16))
      const userKey = await CryptoUtils.deriveKeyFromPassword(password, salt)
      const { encrypted: encryptedContent, iv } = await CryptoUtils.encrypt(originalBytes.buffer as ArrayBuffer, userKey)

      // Create cover PDF
      const protectedPdf = await PDFDocument.create()
      protectedPdf.setTitle('🔒 Encrypted PDF Document')
      protectedPdf.setCreator('CommonTools PDF Encryption')
      protectedPdf.setProducer('CommonTools - AES-256-GCM')

      const encryptionInfo = {
        version: ENCRYPTION_VERSION,
        algorithm: 'AES-256-GCM',
        salt: CryptoUtils.arrayBufferToBase64(salt.buffer),
        iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
        pageCount,
        originalSize: originalBytes.byteLength,
        encryptedAt: new Date().toISOString(),
      }

      protectedPdf.setKeywords([
        'encrypted', 'aes-256-gcm', 'password-protected',
        `v:${ENCRYPTION_VERSION}`, `pages:${pageCount}`
      ])

      const page = protectedPdf.addPage([595, 842])
      const { width, height } = page.getSize()
      const font = await protectedPdf.embedFont(StandardFonts.Helvetica)
      const boldFont = await protectedPdf.embedFont(StandardFonts.HelveticaBold)

      const lockIconBytes = await emojiToImage('🔒', 60)
      const lockIcon = await protectedPdf.embedPng(lockIconBytes)
      const lockDims = lockIcon.scale(1)
      page.drawImage(lockIcon, {
        x: width / 2 - lockDims.width / 2,
        y: height - 100 - lockDims.height / 2,
        width: lockDims.width, height: lockDims.height,
      })

      const title = 'ENCRYPTED PDF DOCUMENT'
      page.drawText(title, {
        x: width / 2 - boldFont.widthOfTextAtSize(title, 20) / 2,
        y: height - 150, size: 20, font: boldFont,
      })

      const instructions = [
        'This document is protected with AES-256-GCM encryption.',
        '', 'To view this document, you need:',
        '1. Open it with CommonTools PDF Decrypt',
        '2. Enter the correct password',
        '3. The original content will be decrypted', '',
        'Document Information:',
        `- Pages: ${pageCount}`,
        `- Encrypted: ${new Date().toLocaleDateString()}`,
        '- Algorithm: AES-256-GCM',
      ]

      let yPos = height - 200
      instructions.forEach(line => {
        const fs = line.startsWith('-') ? 10 : 12
        const lf = line.startsWith('Document') ? boldFont : font
        page.drawText(line, { x: 50, y: yPos, size: fs, font: lf })
        yPos -= fs + 6
      })

      protectedPdf.setSubject(JSON.stringify(encryptionInfo))
      const protectedBytes = await protectedPdf.save()

      // Combine cover PDF + encrypted data
      const separator = new TextEncoder().encode('\n%%ENCRYPTED_DATA_START%%\n')
      const dataInfo = new TextEncoder().encode(
        `\n%%ENCRYPTED_DATA_INFO%%\n${JSON.stringify({
          ...encryptionInfo,
          dataOffset: protectedBytes.byteLength + separator.byteLength,
          dataLength: encryptedContent.byteLength
        })}\n%%END%%`
      )

      const totalLen = protectedBytes.byteLength + separator.byteLength + encryptedContent.byteLength + dataInfo.byteLength
      const finalBytes = new Uint8Array(totalLen)
      let offset = 0
      finalBytes.set(new Uint8Array(protectedBytes), offset); offset += protectedBytes.byteLength
      finalBytes.set(separator, offset); offset += separator.byteLength
      finalBytes.set(new Uint8Array(encryptedContent), offset); offset += encryptedContent.byteLength
      finalBytes.set(dataInfo, offset)

      const blob = new Blob([finalBytes.buffer], { type: 'application/pdf' })
      const outputName = pdfFile.name.replace('.pdf', '-encrypted.pdf')
      setResultBlob(blob)
      setResultName(outputName)
      setResultInfo({ pages: pageCount, originalSize: originalBytes.byteLength, encryptedSize: totalLen })
      showToast('success', t('pdfEncryptAES.encryptSuccess'))
    } catch (err) {
      console.error('[PDFEncryptAES] Encryption failed:', err)
      showToast('error', t('pdfEncryptAES.encryptFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  // AES-256-GCM Decryption
  const decryptPDF = async () => {
    if (!pdfFile || !password) return
    
    setLoading(true)
    try {
      if (!window.crypto || !window.crypto.subtle) {
        showToast('error', t('pdfEncryptAES.cryptoNotAvailable'))
        setLoading(false)
        return
      }

      const arrayBuffer = await pdfFile.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const text = new TextDecoder().decode(bytes)
      const infoMatch = text.match(/%%ENCRYPTED_DATA_INFO%%\n(.*?)\n%%END%%/s)

      if (!infoMatch) {
        showToast('error', t('pdfEncryptAES.invalidEncryptedFile'))
        setLoading(false)
        return
      }

      const encryptionInfo = JSON.parse(infoMatch[1])
      const encryptedData = bytes.slice(encryptionInfo.dataOffset, encryptionInfo.dataOffset + encryptionInfo.dataLength)
      const salt = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.salt))
      const iv = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.iv))
      const key = await CryptoUtils.deriveKeyFromPassword(password, salt)

      let decryptedBytes: ArrayBuffer
      try {
        decryptedBytes = await CryptoUtils.decrypt(encryptedData.buffer, key, iv)
      } catch {
        showToast('error', t('pdfEncryptAES.wrongPassword'))
        setLoading(false)
        return
      }

      const decryptedPdf = await PDFDocument.load(decryptedBytes)
      const finalBytes = await decryptedPdf.save()
      const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const outputName = pdfFile.name.replace('-encrypted.pdf', '-decrypted.pdf').replace('.pdf', '-decrypted.pdf')
      
      setResultBlob(blob)
      setResultName(outputName)
      setResultInfo({ pages: encryptionInfo.pageCount, originalSize: encryptionInfo.originalSize })
      showToast('success', t('pdfEncryptAES.decryptSuccess'))
    } catch (err) {
      console.error('[PDFEncryptAES] Decryption failed:', err)
      if (String(err).includes('password') || String(err).includes('密码')) {
        showToast('error', t('pdfEncryptAES.wrongPassword'))
      } else {
        showToast('error', t('pdfEncryptAES.decryptFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (resultBlob && resultName) saveAs(resultBlob, resultName)
  }

  const clearFile = () => {
    setPdfFile(null)
    setResultBlob(null)
    setResultName('')
    setResultInfo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  const faqItems = [
    { q: t('pdfEncryptAES.faq1Q'), a: t('pdfEncryptAES.faq1A') },
    { q: t('pdfEncryptAES.faq2Q'), a: t('pdfEncryptAES.faq2A') },
    { q: t('pdfEncryptAES.faq3Q'), a: t('pdfEncryptAES.faq3A') },
  ]

  return (
    <div className="pea-container">
      {/* Toast */}
      {toast && (
        <div className={`pea-toast pea-toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'error' && <AlertCircle size={18} />}
          {toast.type === 'info' && <Info size={18} />}
          <span>{toast.text}</span>
          <button className="pea-toast-close" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="pea-mode-switcher">
        <button
          className={`pea-mode-btn ${mode === 'encrypt' ? 'active' : ''}`}
          onClick={() => switchMode('encrypt')}
        >
          <Lock size={18} />
          <div>
            <strong>{t('pdfEncryptAES.modeEncrypt')}</strong>
            <span>{t('pdfEncryptAES.modeEncryptDesc')}</span>
          </div>
        </button>
        <button
          className={`pea-mode-btn ${mode === 'decrypt' ? 'active' : ''}`}
          onClick={() => switchMode('decrypt')}
        >
          <Unlock size={18} />
          <div>
            <strong>{t('pdfEncryptAES.modeDecrypt')}</strong>
            <span>{t('pdfEncryptAES.modeDecryptDesc')}</span>
          </div>
        </button>
      </div>

      {/* Security Bar */}
      <div className="pea-security-bar">
        <Shield size={16} />
        <span>{t('pdfEncryptAES.securityNote')}</span>
      </div>

      {/* Main Layout */}
      <div className="pea-main-layout">
        <div className="pea-left-panel">
          <div className="pea-card pea-password-card">
            <h3 className="pea-card-title">
              <Key size={18} />
              {mode === 'encrypt' ? t('pdfEncryptAES.setPassword') : t('pdfEncryptAES.enterPassword')}
            </h3>

            <div className="pea-field">
              <label>{t('pdfEncryptAES.password')}</label>
              <div className="pea-password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'encrypt' ? t('pdfEncryptAES.passwordPlaceholder') : t('pdfEncryptAES.decryptPasswordPlaceholder')}
                />
                <button className="pea-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {password && mode === 'encrypt' && (
                <div className="pea-password-strength">
                  <div className="pea-strength-bars">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={`pea-strength-bar ${i <= passwordStrength.score ? 'active' : ''}`}
                        style={{ backgroundColor: i <= passwordStrength.score ? passwordStrength.color : undefined }}
                      />
                    ))}
                  </div>
                  <span className="pea-strength-label" style={{ color: passwordStrength.color }}>
                    {t(`pdfEncryptAES.strength_${passwordStrength.label}`)}
                  </span>
                </div>
              )}
            </div>

            {mode === 'encrypt' && (
              <>
                <div className="pea-field">
                  <label>{t('pdfEncryptAES.confirmPassword')}</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('pdfEncryptAES.confirmPlaceholder')}
                    className={hasPasswordError ? 'pea-input-error' : passwordsMatch ? 'pea-input-success' : ''}
                  />
                  {hasPasswordError && (
                    <span className="pea-field-error"><AlertCircle size={12} /> {t('pdfEncryptAES.passwordMismatch')}</span>
                  )}
                  {passwordsMatch && (
                    <span className="pea-field-success"><CheckCircle size={12} /> {t('pdfEncryptAES.passwordMatch')}</span>
                  )}
                </div>
                <button className="pea-generate-btn" onClick={generateStrongPassword}>
                  <Zap size={14} />
                  {t('pdfEncryptAES.generatePassword')}
                </button>
              </>
            )}
          </div>

          <div className="pea-card pea-info-card">
            <h3 className="pea-card-title">
              <Shield size={18} />
              {t('pdfEncryptAES.algorithmInfo')}
            </h3>
            <div className="pea-algo-list">
              <div className="pea-algo-item">
                <span className="pea-algo-badge">AES-256</span>
                <span>{t('pdfEncryptAES.algoAES')}</span>
              </div>
              <div className="pea-algo-item">
                <span className="pea-algo-badge">GCM</span>
                <span>{t('pdfEncryptAES.algoGCM')}</span>
              </div>
              <div className="pea-algo-item">
                <span className="pea-algo-badge">PBKDF2</span>
                <span>{t('pdfEncryptAES.algoPBKDF2')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pea-right-panel">
          <div className="pea-card pea-upload-card">
            <h3 className="pea-card-title">
              <FileText size={18} />
              {mode === 'encrypt' ? t('pdfEncryptAES.selectPDF') : t('pdfEncryptAES.selectEncryptedPDF')}
            </h3>

            <div
              className={`pea-dropzone ${isDragging ? 'dragging' : ''} ${pdfFile ? 'has-file' : ''}`}
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
                <div className="pea-file-preview">
                  <div className="pea-file-icon"><FileText size={32} /></div>
                  <div className="pea-file-info">
                    <span className="pea-file-name">{pdfFile.name}</span>
                    <span className="pea-file-size">{formatFileSize(pdfFile.size)}</span>
                  </div>
                  <button className="pea-remove-btn" onClick={(e) => { e.stopPropagation(); clearFile() }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="pea-drop-content">
                  <Upload size={40} />
                  <p className="pea-drop-title">{mode === 'encrypt' ? t('pdfEncryptAES.dropTitle') : t('pdfEncryptAES.dropTitleDecrypt')}</p>
                  <p className="pea-drop-hint">{t('pdfEncryptAES.dropHint')}</p>
                  <span className="pea-drop-badge">{mode === 'encrypt' ? 'PDF' : 'ENCRYPTED PDF'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pea-actions">
            <button
              className={`pea-action-btn ${mode === 'encrypt' ? 'encrypt' : 'decrypt'}`}
              onClick={mode === 'encrypt' ? encryptPDF : decryptPDF}
              disabled={mode === 'encrypt' ? !canEncrypt : !canDecrypt}
            >
              {loading ? (
                <><span className="pea-spinner" /> {mode === 'encrypt' ? t('pdfEncryptAES.encrypting') : t('pdfEncryptAES.decrypting')}</>
              ) : (
                <>{mode === 'encrypt' ? <Lock size={18} /> : <Unlock size={18} />} {mode === 'encrypt' ? t('pdfEncryptAES.encryptBtn') : t('pdfEncryptAES.decryptBtn')}</>
              )}
            </button>
          </div>

          {resultBlob && (
            <div className="pea-card pea-result-card">
              <div className="pea-result-header">
                <CheckCircle size={20} />
                <span>{mode === 'encrypt' ? t('pdfEncryptAES.encryptDone') : t('pdfEncryptAES.decryptDone')}</span>
              </div>
              <div className="pea-result-info">
                <div className="pea-result-row">
                  <span>{t('pdfEncryptAES.outputFile')}</span>
                  <strong>{resultName}</strong>
                </div>
                {resultInfo?.pages && (
                  <div className="pea-result-row">
                    <span>{t('pdfEncryptAES.totalPages')}</span>
                    <strong>{resultInfo.pages}</strong>
                  </div>
                )}
                <div className="pea-result-row">
                  <span>{t('pdfEncryptAES.outputSize')}</span>
                  <strong>{formatFileSize(resultBlob.size)}</strong>
                </div>
              </div>
              <button className="pea-download-btn" onClick={handleDownload}>
                <Download size={18} />
                {t('pdfEncryptAES.downloadResult')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FAQ */}
      <div className="pea-info-section">
        <div className="pea-faq">
          <h3><Info size={18} /> {t('pdfEncryptAES.faqTitle')}</h3>
          {faqItems.map((item, i) => (
            <div key={i} className={`pea-faq-item ${showFaq === i ? 'open' : ''}`}>
              <button className="pea-faq-q" onClick={() => setShowFaq(showFaq === i ? null : i)}>
                <span>{item.q}</span>
                <ChevronDown size={16} />
              </button>
              {showFaq === i && <div className="pea-faq-a">{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
