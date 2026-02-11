import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Upload, Download, Lock, Unlock, Shield, Key, Eye, EyeOff,
  Image as ImageIcon, Trash2, Plus, Check, AlertCircle, CheckCircle,
  RotateCcw, Info, X, ChevronDown
} from 'lucide-react'
import { CryptoUtils } from '../utils/cryptoUtils'
import { useI18n } from '../i18n/I18nContext'
import './ImageEncryption.css'

// ========== Types ==========
type Mode = 'encrypt' | 'decrypt'

interface ImageItem {
  id: string
  file: File
  previewUrl: string
  width: number
  height: number
  size: number
  status: 'pending' | 'processing' | 'success' | 'error'
  progress: number
  resultUrl?: string
  resultBlob?: Blob
  resultName?: string
  errorMessage?: string
}

interface PasswordStrength {
  score: number // 0-4
  label: string
  color: string
}

// ========== Constants ==========
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff,.tif,.ico'
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tif', 'ico']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ENCRYPTION_VERSION = '2.0'

// ========== Utility Functions ==========
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function getImageMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
    svg: 'image/svg+xml', tiff: 'image/tiff', tif: 'image/tiff',
    ico: 'image/x-icon',
  }
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.includes(ext)
}

function isEncryptedImageFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.locked')
}

// ========== Password Strength Checker ==========
function checkPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: 'transparent' }
  
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'`~]/.test(password)) score++
  
  score = Math.min(score, 4)
  
  const levels: Record<number, { label: string; color: string }> = {
    0: { label: 'tooWeak', color: '#ef4444' },
    1: { label: 'weak', color: '#f97316' },
    2: { label: 'medium', color: '#eab308' },
    3: { label: 'strong', color: '#22c55e' },
    4: { label: 'veryStrong', color: '#10b981' },
  }
  
  return { score, ...levels[score] }
}

// ========== Core Encryption ==========
async function encryptImage(file: File, password: string): Promise<{ blob: Blob; name: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const extension = file.name.split('.').pop() || 'png'
  
  if (!window.crypto?.subtle) {
    throw new Error('CRYPTO_NOT_AVAILABLE')
  }
  
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const userKey = await CryptoUtils.deriveKeyFromPassword(password, salt)
  const { encrypted, iv } = await CryptoUtils.encrypt(arrayBuffer, userKey)
  
  const encryptionInfo = {
    version: ENCRYPTION_VERSION,
    algorithm: 'AES-256-GCM',
    fileType: 'image',
    originalName: file.name,
    originalExtension: extension,
    salt: CryptoUtils.arrayBufferToBase64(salt.buffer),
    iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
    originalSize: arrayBuffer.byteLength,
    encryptedAt: new Date().toISOString(),
    mimeType: file.type || getImageMimeType(extension),
  }
  
  const encryptedData = new Uint8Array(encrypted)
  const infoJson = JSON.stringify(encryptionInfo)
  const infoBytes = new TextEncoder().encode(infoJson)
  const infoLength = new Uint32Array([infoBytes.byteLength])
  
  const finalBytes = new Uint8Array(4 + infoBytes.byteLength + encryptedData.byteLength)
  finalBytes.set(new Uint8Array(infoLength.buffer), 0)
  finalBytes.set(infoBytes, 4)
  finalBytes.set(encryptedData, 4 + infoBytes.byteLength)
  
  const blob = new Blob([finalBytes.buffer], { type: 'application/octet-stream' })
  const baseName = file.name.replace(/\.[^/.]+$/, '')
  
  return { blob, name: `${baseName}.locked` }
}

async function decryptImage(file: File, password: string): Promise<{ blob: Blob; name: string; info: Record<string, unknown> }> {
  if (!window.crypto?.subtle) {
    throw new Error('CRYPTO_NOT_AVAILABLE')
  }
  
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  
  if (bytes.byteLength < 8) {
    throw new Error('INVALID_FILE')
  }
  
  const infoLength = new Uint32Array(bytes.buffer.slice(0, 4))[0]
  
  if (infoLength <= 0 || infoLength > bytes.byteLength - 4) {
    throw new Error('INVALID_FILE')
  }
  
  const infoBytes = bytes.slice(4, 4 + infoLength)
  let encryptionInfo: Record<string, unknown>
  
  try {
    const infoJson = new TextDecoder().decode(infoBytes)
    encryptionInfo = JSON.parse(infoJson)
  } catch {
    throw new Error('INVALID_FILE')
  }
  
  const encryptedData = bytes.slice(4 + infoLength)
  const salt = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.salt as string))
  const iv = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.iv as string))
  
  const key = await CryptoUtils.deriveKeyFromPassword(password, salt)
  
  let decryptedBytes: ArrayBuffer
  try {
    decryptedBytes = await CryptoUtils.decrypt(encryptedData.buffer, key, iv)
  } catch {
    throw new Error('WRONG_PASSWORD')
  }
  
  const originalExt = (encryptionInfo.originalExtension as string) || 'png'
  const mimeType = (encryptionInfo.mimeType as string) || getImageMimeType(originalExt)
  const blob = new Blob([decryptedBytes], { type: mimeType })
  const originalName = (encryptionInfo.originalName as string) || `decrypted.${originalExt}`
  
  return { blob, name: originalName, info: encryptionInfo }
}

// ========== Main Component ==========
export default function ImageEncryption() {
  const { t } = useI18n()
  
  // Core state
  const [mode, setMode] = useState<Mode>('encrypt')
  const [images, setImages] = useState<ImageItem[]>([])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [globalMessage, setGlobalMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [showFaq, setShowFaq] = useState<number | null>(null)
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropzoneRef = useRef<HTMLDivElement>(null)
  
  // Computed
  const passwordStrength = useMemo(() => checkPasswordStrength(password), [password])
  const passwordsMatch = useMemo(() => password && confirmPassword && password === confirmPassword, [password, confirmPassword])
  const hasPasswordError = useMemo(() => confirmPassword.length > 0 && password !== confirmPassword, [password, confirmPassword])
  
  const canProcess = useMemo(() => {
    if (images.length === 0) return false
    if (mode === 'encrypt') {
      return password.length >= 1 && passwordsMatch
    }
    return password.length >= 1
  }, [images, mode, password, passwordsMatch])
  
  const processedCount = useMemo(() => images.filter(i => i.status === 'success').length, [images])
  const errorCount = useMemo(() => images.filter(i => i.status === 'error').length, [images])
  const pendingCount = useMemo(() => images.filter(i => i.status === 'pending').length, [images])
  
  // Auto-clear global message
  useEffect(() => {
    if (globalMessage) {
      const timer = setTimeout(() => setGlobalMessage(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [globalMessage])
  
  // ========== File Handling ==========
  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const validFiles: File[] = []
    const errors: string[] = []
    
    fileArray.forEach(file => {
      if (mode === 'encrypt') {
        if (!isImageFile(file)) {
          errors.push(`${file.name}: ${t('imgEncrypt.notImageFile')}`)
          return
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: ${t('imgEncrypt.fileTooLarge')}`)
          return
        }
      } else {
        if (!isEncryptedImageFile(file)) {
          errors.push(`${file.name}: ${t('imgEncrypt.notLockedFile')}`)
          return
        }
      }
      validFiles.push(file)
    })
    
    if (errors.length > 0) {
      setGlobalMessage({ type: 'error', text: errors.join('\n') })
    }
    
    if (validFiles.length === 0) return
    
    const newItems: ImageItem[] = []
    let loaded = 0
    
    validFiles.forEach(file => {
      if (mode === 'encrypt') {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
          newItems.push({
            id: generateId(),
            file,
            previewUrl: url,
            width: img.width,
            height: img.height,
            size: file.size,
            status: 'pending',
            progress: 0,
          })
          loaded++
          if (loaded === validFiles.length) {
            setImages(prev => [...prev, ...newItems])
          }
        }
        img.onerror = () => {
          loaded++
          if (loaded === validFiles.length && newItems.length > 0) {
            setImages(prev => [...prev, ...newItems])
          }
        }
        img.src = url
      } else {
        // For encrypted files, no preview
        newItems.push({
          id: generateId(),
          file,
          previewUrl: '',
          width: 0,
          height: 0,
          size: file.size,
          status: 'pending',
          progress: 0,
        })
        loaded++
        if (loaded === validFiles.length) {
          setImages(prev => [...prev, ...newItems])
        }
      }
    })
  }, [mode, t])
  
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }, [handleFiles])
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }, [handleFiles])
  
  // Paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (mode !== 'encrypt') return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) handleFiles(files)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handleFiles, mode])
  
  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const item = prev.find(i => i.id === id)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      if (item?.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return prev.filter(i => i.id !== id)
    })
  }, [])
  
  const clearAll = useCallback(() => {
    images.forEach(img => {
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl)
      if (img.resultUrl) URL.revokeObjectURL(img.resultUrl)
    })
    setImages([])
    setGlobalMessage(null)
  }, [images])
  
  // ========== Mode Switch ==========
  const switchMode = useCallback((newMode: Mode) => {
    if (newMode === mode) return
    clearAll()
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setGlobalMessage(null)
    setMode(newMode)
  }, [mode, clearAll])
  
  // ========== Processing ==========
  const handleProcess = useCallback(async () => {
    if (!canProcess) return
    setProcessing(true)
    setGlobalMessage(null)
    
    let successCount = 0
    let failCount = 0
    
    const updatedImages = [...images]
    
    for (let i = 0; i < updatedImages.length; i++) {
      const item = updatedImages[i]
      if (item.status === 'success') {
        successCount++
        continue
      }
      
      updatedImages[i] = { ...item, status: 'processing', progress: 0 }
      setImages([...updatedImages])
      
      try {
        if (mode === 'encrypt') {
          const { blob, name } = await encryptImage(item.file, password)
          const resultUrl = URL.createObjectURL(blob)
          updatedImages[i] = {
            ...updatedImages[i],
            status: 'success',
            progress: 100,
            resultUrl,
            resultBlob: blob,
            resultName: name,
          }
          successCount++
        } else {
          const { blob, name } = await decryptImage(item.file, password)
          const resultUrl = URL.createObjectURL(blob)
          updatedImages[i] = {
            ...updatedImages[i],
            status: 'success',
            progress: 100,
            resultUrl,
            resultBlob: blob,
            resultName: name,
          }
          successCount++
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        let userMsg: string
        
        if (errorMsg === 'WRONG_PASSWORD') {
          userMsg = t('imgEncrypt.wrongPassword')
        } else if (errorMsg === 'INVALID_FILE') {
          userMsg = t('imgEncrypt.invalidFile')
        } else if (errorMsg === 'CRYPTO_NOT_AVAILABLE') {
          userMsg = t('imgEncrypt.cryptoNotAvailable')
        } else {
          userMsg = t('imgEncrypt.processingError')
        }
        
        updatedImages[i] = {
          ...updatedImages[i],
          status: 'error',
          progress: 0,
          errorMessage: userMsg,
        }
        failCount++
      }
      
      setImages([...updatedImages])
    }
    
    setProcessing(false)
    
    if (failCount === 0 && successCount > 0) {
      setGlobalMessage({
        type: 'success',
        text: mode === 'encrypt'
          ? t('imgEncrypt.allEncryptedSuccess').replace('{count}', String(successCount))
          : t('imgEncrypt.allDecryptedSuccess').replace('{count}', String(successCount))
      })
    } else if (failCount > 0 && successCount > 0) {
      setGlobalMessage({
        type: 'info',
        text: t('imgEncrypt.partialSuccess')
          .replace('{success}', String(successCount))
          .replace('{fail}', String(failCount))
      })
    } else if (failCount > 0 && successCount === 0) {
      setGlobalMessage({
        type: 'error',
        text: mode === 'encrypt'
          ? t('imgEncrypt.encryptionFailed')
          : t('imgEncrypt.decryptionFailed')
      })
    }
  }, [canProcess, images, mode, password, t])
  
  // ========== Download ==========
  const downloadSingle = useCallback((item: ImageItem) => {
    if (!item.resultBlob || !item.resultName) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(item.resultBlob)
    a.download = item.resultName
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])
  
  const downloadAll = useCallback(() => {
    const results = images.filter(i => i.status === 'success' && i.resultBlob)
    results.forEach((item, index) => {
      setTimeout(() => downloadSingle(item), index * 300)
    })
  }, [images, downloadSingle])
  
  // ========== Password Copy ==========
  const generateStrongPassword = useCallback(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let pwd = ''
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    for (let i = 0; i < 16; i++) {
      pwd += chars[array[i] % chars.length]
    }
    setPassword(pwd)
    setConfirmPassword(pwd)
    setShowPassword(true)
    setShowConfirmPassword(true)
    
    // Copy to clipboard
    navigator.clipboard?.writeText(pwd).then(() => {
      setGlobalMessage({ type: 'info', text: t('imgEncrypt.passwordGenerated') })
    }).catch(() => {
      setGlobalMessage({ type: 'info', text: t('imgEncrypt.passwordGeneratedNoCopy') })
    })
  }, [t])
  
  // ========== Reset ==========
  const handleReset = useCallback(() => {
    clearAll()
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }, [clearAll])
  
  // ========== JSX ==========
  return (
    <div className="ie-container">
      {/* Global Message Toast */}
      {globalMessage && (
        <div className={`ie-toast ie-toast-${globalMessage.type}`}>
          <div className="ie-toast-icon">
            {globalMessage.type === 'success' && <CheckCircle size={18} />}
            {globalMessage.type === 'error' && <AlertCircle size={18} />}
            {globalMessage.type === 'info' && <Info size={18} />}
          </div>
          <span className="ie-toast-text">{globalMessage.text}</span>
          <button className="ie-toast-close" onClick={() => setGlobalMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      
      {/* Mode Selector */}
      <div className="ie-mode-section">
        <div className="ie-mode-switcher">
          <button
            className={`ie-mode-btn ${mode === 'encrypt' ? 'active encrypt' : ''}`}
            onClick={() => switchMode('encrypt')}
          >
            <div className="ie-mode-icon">
              <Lock size={22} />
            </div>
            <div className="ie-mode-info">
              <span className="ie-mode-label">{t('imgEncrypt.encryptMode')}</span>
              <span className="ie-mode-desc">{t('imgEncrypt.encryptModeDesc')}</span>
            </div>
          </button>
          <button
            className={`ie-mode-btn ${mode === 'decrypt' ? 'active decrypt' : ''}`}
            onClick={() => switchMode('decrypt')}
          >
            <div className="ie-mode-icon">
              <Unlock size={22} />
            </div>
            <div className="ie-mode-info">
              <span className="ie-mode-label">{t('imgEncrypt.decryptMode')}</span>
              <span className="ie-mode-desc">{t('imgEncrypt.decryptModeDesc')}</span>
            </div>
          </button>
        </div>
      </div>
      
      {/* Security Info Bar */}
      <div className="ie-security-bar">
        <div className="ie-security-item">
          <Shield size={14} />
          <span>AES-256-GCM</span>
        </div>
        <div className="ie-security-item">
          <Key size={14} />
          <span>PBKDF2</span>
        </div>
        <div className="ie-security-item">
          <Lock size={14} />
          <span>{t('imgEncrypt.localOnly')}</span>
        </div>
      </div>
      
      {/* Main Content: Two Column Layout */}
      <div className="ie-main-layout">
        {/* Left Column: Password & Upload */}
        <div className="ie-left-column">
          {/* Password Section */}
          <div className="ie-password-card">
            <div className="ie-card-header">
              <Key size={16} />
              <h3>{mode === 'encrypt' ? t('imgEncrypt.setPassword') : t('imgEncrypt.enterPassword')}</h3>
            </div>
            
            <div className="ie-password-fields">
              {/* Password Input */}
              <div className="ie-field">
                <label className="ie-field-label">
                  <Lock size={14} />
                  {mode === 'encrypt' ? t('imgEncrypt.password') : t('imgEncrypt.decryptPassword')}
                </label>
                <div className="ie-password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="ie-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'encrypt' ? t('imgEncrypt.passwordPlaceholder') : t('imgEncrypt.decryptPasswordPlaceholder')}
                    autoComplete="off"
                  />
                  <button
                    className="ie-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? t('imgEncrypt.hidePassword') : t('imgEncrypt.showPassword')}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                
                {/* Password Strength Indicator (encrypt mode only) */}
                {mode === 'encrypt' && password && (
                  <div className="ie-password-strength">
                    <div className="ie-strength-bars">
                      {[1, 2, 3, 4].map(level => (
                        <div
                          key={level}
                          className={`ie-strength-bar ${passwordStrength.score >= level ? 'active' : ''}`}
                          style={{ backgroundColor: passwordStrength.score >= level ? passwordStrength.color : undefined }}
                        />
                      ))}
                    </div>
                    <span className="ie-strength-label" style={{ color: passwordStrength.color }}>
                      {t(`imgEncrypt.strength.${passwordStrength.label}`)}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Confirm Password (encrypt mode only) */}
              {mode === 'encrypt' && (
                <div className="ie-field">
                  <label className="ie-field-label">
                    <Shield size={14} />
                    {t('imgEncrypt.confirmPassword')}
                  </label>
                  <div className="ie-password-input-wrapper">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className={`ie-input ${hasPasswordError ? 'ie-input-error' : ''} ${passwordsMatch ? 'ie-input-success' : ''}`}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('imgEncrypt.confirmPasswordPlaceholder')}
                      autoComplete="off"
                    />
                    <button
                      className="ie-password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      type="button"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {hasPasswordError && (
                    <div className="ie-field-feedback error">
                      <AlertCircle size={12} />
                      {t('imgEncrypt.passwordMismatch')}
                    </div>
                  )}
                  {passwordsMatch && (
                    <div className="ie-field-feedback success">
                      <CheckCircle size={12} />
                      {t('imgEncrypt.passwordMatch')}
                    </div>
                  )}
                </div>
              )}
              
              {/* Password Tools */}
              {mode === 'encrypt' && (
                <div className="ie-password-tools">
                  <button className="ie-tool-btn" onClick={generateStrongPassword} type="button">
                    <Key size={13} />
                    {t('imgEncrypt.generatePassword')}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Upload Section */}
          <div className="ie-upload-card">
            <div className="ie-card-header">
              <Upload size={16} />
              <h3>{mode === 'encrypt' ? t('imgEncrypt.selectImages') : t('imgEncrypt.selectEncryptedFiles')}</h3>
            </div>
            
            <div
              ref={dropzoneRef}
              className={`ie-dropzone ${isDragging ? 'dragging' : ''} ${images.length > 0 ? 'has-files' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={mode === 'encrypt' ? IMAGE_ACCEPT : '.locked'}
                multiple
                onChange={handleFileInput}
                className="ie-file-input"
              />
              <div className="ie-dropzone-content">
                <div className="ie-dropzone-icon">
                  {mode === 'encrypt' ? <ImageIcon size={36} /> : <Lock size={36} />}
                </div>
                <div className="ie-dropzone-text">
                  <strong>
                    {mode === 'encrypt' ? t('imgEncrypt.dropImages') : t('imgEncrypt.dropEncrypted')}
                  </strong>
                  <span>
                    {mode === 'encrypt' ? t('imgEncrypt.dropImagesHint') : t('imgEncrypt.dropEncryptedHint')}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Supported Formats */}
            {mode === 'encrypt' && (
              <div className="ie-formats-hint">
                <span>{t('imgEncrypt.supportedFormats')}:</span>
                <div className="ie-format-tags">
                  {['JPG', 'PNG', 'GIF', 'BMP', 'WEBP', 'SVG', 'TIFF', 'ICO'].map(fmt => (
                    <span key={fmt} className="ie-format-tag">{fmt}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Column: File List & Results */}
        <div className="ie-right-column">
          {/* File List */}
          {images.length > 0 ? (
            <div className="ie-files-card">
              <div className="ie-card-header">
                <ImageIcon size={16} />
                <h3>
                  {mode === 'encrypt' ? t('imgEncrypt.imageList') : t('imgEncrypt.fileList')}
                  <span className="ie-count-badge">{images.length}</span>
                </h3>
                <div className="ie-card-actions">
                  <button className="ie-btn-text-sm" onClick={() => fileInputRef.current?.click()}>
                    <Plus size={14} /> {t('imgEncrypt.addMore')}
                  </button>
                  <button className="ie-btn-text-sm danger" onClick={clearAll}>
                    <Trash2 size={14} /> {t('imgEncrypt.clearAll')}
                  </button>
                </div>
              </div>
              
              <div className="ie-file-list">
                {images.map(item => (
                  <div key={item.id} className={`ie-file-item ${item.status}`}>
                    {/* Preview thumbnail */}
                    <div className="ie-file-thumb">
                      {mode === 'encrypt' && item.previewUrl ? (
                        <img src={item.previewUrl} alt={item.file.name} />
                      ) : (
                        <div className="ie-file-thumb-icon">
                          <Lock size={20} />
                        </div>
                      )}
                      {item.status === 'success' && (
                        <div className="ie-file-thumb-badge success">
                          <Check size={12} />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="ie-file-thumb-badge error">
                          <AlertCircle size={12} />
                        </div>
                      )}
                      {item.status === 'processing' && (
                        <div className="ie-file-thumb-badge processing">
                          <span className="ie-mini-spinner" />
                        </div>
                      )}
                    </div>
                    
                    {/* File info */}
                    <div className="ie-file-info">
                      <span className="ie-file-name" title={item.file.name}>
                        {item.file.name}
                      </span>
                      <span className="ie-file-meta">
                        {formatFileSize(item.size)}
                        {item.width > 0 && ` · ${item.width}×${item.height}`}
                      </span>
                      {item.status === 'error' && item.errorMessage && (
                        <span className="ie-file-error">{item.errorMessage}</span>
                      )}
                      {item.status === 'success' && item.resultName && (
                        <span className="ie-file-result-name">→ {item.resultName}</span>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="ie-file-actions">
                      {item.status === 'success' && (
                        <button
                          className="ie-btn-icon success"
                          onClick={(e) => { e.stopPropagation(); downloadSingle(item) }}
                          title={t('imgEncrypt.download')}
                        >
                          <Download size={16} />
                        </button>
                      )}
                      <button
                        className="ie-btn-icon danger"
                        onClick={(e) => { e.stopPropagation(); removeImage(item.id) }}
                        title={t('imgEncrypt.remove')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Status Summary */}
              {(processedCount > 0 || errorCount > 0) && (
                <div className="ie-status-summary">
                  {processedCount > 0 && (
                    <span className="ie-status-item success">
                      <CheckCircle size={14} />
                      {processedCount} {t('imgEncrypt.succeeded')}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="ie-status-item error">
                      <AlertCircle size={14} />
                      {errorCount} {t('imgEncrypt.failed')}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="ie-status-item pending">
                      <Info size={14} />
                      {pendingCount} {t('imgEncrypt.pending')}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="ie-empty-state">
              <div className="ie-empty-icon">
                {mode === 'encrypt' ? <ImageIcon size={48} /> : <Lock size={48} />}
              </div>
              <h4>{mode === 'encrypt' ? t('imgEncrypt.noImages') : t('imgEncrypt.noFiles')}</h4>
              <p>{mode === 'encrypt' ? t('imgEncrypt.noImagesHint') : t('imgEncrypt.noFilesHint')}</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="ie-actions-bar">
        <div className="ie-actions-left">
          <button className="ie-btn ie-btn-secondary" onClick={handleReset} disabled={processing}>
            <RotateCcw size={16} />
            {t('imgEncrypt.reset')}
          </button>
        </div>
        <div className="ie-actions-right">
          {processedCount > 0 && (
            <button className="ie-btn ie-btn-success" onClick={downloadAll} disabled={processing}>
              <Download size={16} />
              {processedCount > 1
                ? `${t('imgEncrypt.downloadAll')} (${processedCount})`
                : t('imgEncrypt.download')
              }
            </button>
          )}
          <button
            className={`ie-btn ie-btn-primary ${mode === 'encrypt' ? 'encrypt' : 'decrypt'}`}
            onClick={handleProcess}
            disabled={!canProcess || processing}
          >
            {processing ? (
              <>
                <span className="ie-spinner" />
                {t('imgEncrypt.processing')}
              </>
            ) : mode === 'encrypt' ? (
              <>
                <Lock size={16} />
                {images.length > 1
                  ? `${t('imgEncrypt.encryptAll')} (${images.length})`
                  : t('imgEncrypt.encryptImage')
                }
              </>
            ) : (
              <>
                <Unlock size={16} />
                {images.length > 1
                  ? `${t('imgEncrypt.decryptAll')} (${images.length})`
                  : t('imgEncrypt.decryptImage')
                }
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* How It Works & FAQ */}
      <div className="ie-info-section">
        {/* How It Works */}
        <div className="ie-how-it-works">
          <h3>🔐 {t('imgEncrypt.howItWorks')}</h3>
          <div className="ie-steps">
            <div className="ie-step">
              <div className="ie-step-number">1</div>
              <div className="ie-step-content">
                <strong>{mode === 'encrypt' ? t('imgEncrypt.step1EncTitle') : t('imgEncrypt.step1DecTitle')}</strong>
                <span>{mode === 'encrypt' ? t('imgEncrypt.step1EncDesc') : t('imgEncrypt.step1DecDesc')}</span>
              </div>
            </div>
            <div className="ie-step">
              <div className="ie-step-number">2</div>
              <div className="ie-step-content">
                <strong>{t('imgEncrypt.step2Title')}</strong>
                <span>{mode === 'encrypt' ? t('imgEncrypt.step2EncDesc') : t('imgEncrypt.step2DecDesc')}</span>
              </div>
            </div>
            <div className="ie-step">
              <div className="ie-step-number">3</div>
              <div className="ie-step-content">
                <strong>{mode === 'encrypt' ? t('imgEncrypt.step3EncTitle') : t('imgEncrypt.step3DecTitle')}</strong>
                <span>{mode === 'encrypt' ? t('imgEncrypt.step3EncDesc') : t('imgEncrypt.step3DecDesc')}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* FAQ */}
        <div className="ie-faq">
          <h3>❓ {t('imgEncrypt.faqTitle')}</h3>
          <div className="ie-faq-list">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`ie-faq-item ${showFaq === i ? 'open' : ''}`}>
                <button
                  className="ie-faq-question"
                  onClick={() => setShowFaq(showFaq === i ? null : i)}
                >
                  <span>{t(`imgEncrypt.faq${i}Q`)}</span>
                  <ChevronDown size={16} className="ie-faq-chevron" />
                </button>
                {showFaq === i && (
                  <div className="ie-faq-answer">
                    {t(`imgEncrypt.faq${i}A`)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
