import { useState } from 'react'
import { Upload, Lock, Shield, Key, AlertCircle, CheckCircle, Image, FileText, Code, Database } from 'lucide-react'
import { saveAs } from 'file-saver'
import { CryptoUtils } from '../utils/cryptoUtils'
import { useI18n } from '../i18n/I18nContext'
import './FileEncryption.css'

// 支持的文件类型
type FileType = 'image' | 'document' | 'text' | 'code' | 'data' | 'unknown'

// 检测文件类型
const detectFileType = (file: File): FileType => {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image'
  if (['doc', 'docx'].includes(ext)) return 'document'
  if (['txt'].includes(ext)) return 'text'
  if (['html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass', 'less', 
       'java', 'py', 'swift', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'php', 'rb', 
       'json', 'xml', 'yaml', 'yml', 'md', 'sh', 'bat', 'ps1'].includes(ext)) return 'code'
  if (['sql', 'db', 'sqlite', 'sqlite3', 'mdb', 'accdb'].includes(ext)) return 'data'
  
  return 'unknown'
}

// 获取文件类型图标
const getFileTypeIcon = (type: FileType) => {
  switch (type) {
    case 'image': return <Image size={24} />
    case 'document': return <FileText size={24} />
    case 'text': return <FileText size={24} />
    case 'code': return <Code size={24} />
    case 'data': return <Database size={24} />
    default: return <FileText size={24} />
  }
}

// 获取文件类型名称（需要国际化，但函数在组件外，暂时保留）
const getFileTypeName = (type: FileType): string => {
  switch (type) {
    case 'image': return '图片文件'
    case 'document': return 'Word 文档'
    case 'text': return '文本文件'
    case 'code': return '代码文件'
    case 'data': return '数据文件'
    default: return '未知文件'
  }
}

// 获取支持的文件格式列表
const getSupportedFormats = (type: FileType): string[] => {
  switch (type) {
    case 'image': return ['JPG', 'PNG', 'GIF', 'BMP', 'WEBP']
    case 'document': return ['DOC', 'DOCX']
    case 'text': return ['TXT']
    case 'code': return ['HTML', 'JS', 'CSS', 'Java', 'Python', 'Swift', 'JSON', 'XML', '等']
    case 'data': return ['SQL', 'DB', 'SQLite', '等']
    default: return []
  }
}

export default function FileEncryption() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<'lock' | 'unlock'>('lock')
  const [userPassword, setUserPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')
  const [currentFileType, setCurrentFileType] = useState<FileType>('unknown')

  // 通用文件加密
  const lockFile = async (file: File) => {
    if (!userPassword) {
      setError(t('fileEncryption.passwordRequired'))
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const originalSize = arrayBuffer.byteLength
      
      const extension = file.name.split('.').pop() || 'bin'
      
      // 检查 Web Crypto API 是否可用
      if (!window.crypto || !window.crypto.subtle) {
        setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
        setLoading(false)
        return
      }
      
      const salt = window.crypto.getRandomValues(new Uint8Array(16))
      const userKey = await CryptoUtils.deriveKeyFromPassword(userPassword, salt)
      const { encrypted: encryptedContent, iv } = await CryptoUtils.encrypt(arrayBuffer, userKey)
      
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
      }
      
      const encryptedData = new Uint8Array(encryptedContent)
      const infoJson = JSON.stringify(encryptionInfo)
      const infoBytes = new TextEncoder().encode(infoJson)
      const infoLength = new Uint32Array([infoBytes.byteLength])
      
      const finalBytes = new Uint8Array(4 + infoBytes.byteLength + encryptedData.byteLength)
      finalBytes.set(new Uint8Array(infoLength.buffer), 0)
      finalBytes.set(infoBytes, 4)
      finalBytes.set(encryptedData, 4 + infoBytes.byteLength)
      
      const blob = new Blob([finalBytes.buffer], { type: 'application/octet-stream' })
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      saveAs(blob, `${baseName}.locked`)
      
      setSuccess(`✅ ${t('fileEncryption.fileEncrypted')}\n\n${t('fileEncryption.encryptionInfo')}：\n• ${t('fileEncryption.fileType')}：${getFileTypeName(detectFileType(file))}\n• ${t('fileEncryption.algorithm')}\n• ${t('fileEncryption.originalSize')}：${(originalSize / 1024).toFixed(2)} KB\n• ${t('fileEncryption.encryptedSize')}：${(finalBytes.byteLength / 1024).toFixed(2)} KB\n• ${t('fileEncryption.encryptedFile')}：${baseName}.locked\n\n${t('fileEncryption.keepPasswordSafe')}`)
      
      setUserPassword('')
      setConfirmPassword('')
      setPasswordError('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[FileEncryption] 加密文件失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name,
        fileSize: file.size,
        fileType: detectFileType(file)
      })
      
      // 提供更友好的错误信息
      if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n提示：Web Crypto API 需要 HTTPS 环境。请确保网站使用 HTTPS 协议。')
      } else if (errorMessage.includes('不支持')) {
        setError('❌ ' + errorMessage)
      } else {
        setError('❌ ' + t('fileEncryption.encryptionFailed') + '：' + errorMessage + '\n\n' + t('encryption.checkConsole'))
      }
    } finally {
      setLoading(false)
    }
  }

  // 通用文件解密
  const unlockFile = async (file: File) => {
    if (!unlockPassword) {
      setError(t('fileEncryption.passwordRequired'))
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
      
      const infoLength = new Uint32Array(bytes.buffer.slice(0, 4))[0]
      
      const infoBytes = bytes.slice(4, 4 + infoLength)
      const infoJson = new TextDecoder().decode(infoBytes)
      const encryptionInfo = JSON.parse(infoJson)
      
      const encryptedData = bytes.slice(4 + infoLength)
      
      const salt = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.salt))
      const iv = new Uint8Array(CryptoUtils.base64ToArrayBuffer(encryptionInfo.iv))
      
      const key = await CryptoUtils.deriveKeyFromPassword(unlockPassword, salt)
      
      let decryptedBytes
      try {
        decryptedBytes = await CryptoUtils.decrypt(encryptedData.buffer, key, iv)
      } catch (err) {
        setError('❌ ' + t('fileEncryption.passwordIncorrect'))
        return
      }
      
      const blob = new Blob([decryptedBytes], { type: getMimeType(encryptionInfo.originalExtension) })
      const originalName = encryptionInfo.originalName || `decrypted.${encryptionInfo.originalExtension}`
      saveAs(blob, originalName)
      
      setSuccess(`✅ ${t('fileEncryption.fileDecrypted')}\n\n${t('fileEncryption.decryptionInfo')}：\n• ${t('fileEncryption.fileType')}：${getFileTypeName(encryptionInfo.fileType)}\n• ${t('common.originalFileName')}：${originalName}\n• ${t('common.fileSize')}：${(encryptionInfo.originalSize / 1024).toFixed(2)} KB\n• ${t('encryption.date')}：${new Date(encryptionInfo.encryptedAt).toLocaleDateString()}\n\n${t('success.fileDownloaded')}`)
      
      setUnlockPassword('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[FileEncryption] 解密文件失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        fileName: file.name
      })
      
      if (errorMessage.includes('password') || errorMessage.includes('密码错误')) {
        setError('❌ ' + t('fileEncryption.passwordIncorrect'))
      } else if (errorMessage.includes('HTTPS') || errorMessage.includes('crypto.subtle')) {
        setError('❌ ' + errorMessage + '\n\n' + t('encryption.hint') + '：Web Crypto API ' + t('encryption.requires') + ' HTTPS ' + t('encryption.environment'))
      } else {
        setError('❌ ' + t('fileEncryption.decryptionFailed') + '：' + errorMessage + '\n\n' + t('encryption.checkConsole'))
      }
    } finally {
      setLoading(false)
    }
  }

  // 获取 MIME 类型
  const getMimeType = (extension: string): string => {
    const mimeTypes: { [key: string]: string } = {
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      'html': 'text/html',
      'htm': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'jsx': 'application/javascript',
      'ts': 'application/typescript',
      'tsx': 'application/typescript',
      'scss': 'text/x-scss',
      'sass': 'text/x-sass',
      'less': 'text/x-less',
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
      'json': 'application/json',
      'xml': 'application/xml',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'md': 'text/markdown',
      'sh': 'text/x-sh',
      'bat': 'text/plain',
      'ps1': 'text/plain',
      'sql': 'application/sql',
      'db': 'application/x-sqlite3',
      'sqlite': 'application/x-sqlite3',
      'sqlite3': 'application/x-sqlite3',
      'mdb': 'application/x-msaccess',
      'accdb': 'application/x-msaccess'
    }
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (mode === 'lock') {
      const fileType = detectFileType(file)
      setCurrentFileType(fileType)

      if (fileType === 'unknown') {
        setError('不支持的文件格式。支持的格式：图片、Word 文档、文本文件、代码文件、数据文件')
        return
      }

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
      
      setPasswordError('')
      await lockFile(file)
    } else {
      if (!file.name.endsWith('.locked')) {
        setError('请选择 .locked 加密文件')
        return
      }
      await unlockFile(file)
    }
  }

  return (
    <div className="file-encryption">
      <div className="encryption-header">
        <div className="header-icon">
          <Shield size={32} />
        </div>
        <div className="header-content">
          <h2 className="section-title">{t('fileEncryption.title')}</h2>
          <p className="section-description">
            {t('fileEncryption.subtitle')}
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
          <span>{t('fileEncryption.encryptFile')}</span>
        </button>
        <button
          className={`tab-button ${mode === 'unlock' ? 'active' : ''}`}
          onClick={() => setMode('unlock')}
        >
          <Key size={20} />
          <span>{t('fileEncryption.decryptFile')}</span>
        </button>
      </div>

      {mode === 'lock' ? (
        <div className="encryption-panel">
          <div className="supported-formats">
            <div className="format-category">
              <div className="format-icon image">
                <Image size={20} />
              </div>
              <div className="format-info">
                <strong>{t('fileEncryption.images')}</strong>
                <span>JPG, PNG, GIF, BMP, WEBP</span>
              </div>
            </div>
            <div className="format-category">
              <div className="format-icon document">
                <FileText size={20} />
              </div>
              <div className="format-info">
                <strong>{t('fileEncryption.documents')}</strong>
                <span>DOC, DOCX</span>
              </div>
            </div>
            <div className="format-category">
              <div className="format-icon text">
                <FileText size={20} />
              </div>
              <div className="format-info">
                <strong>{t('fileEncryption.text')}</strong>
                <span>TXT</span>
              </div>
            </div>
            <div className="format-category">
              <div className="format-icon code">
                <Code size={20} />
              </div>
              <div className="format-info">
                <strong>{t('fileEncryption.code')}</strong>
                <span>HTML, JS, CSS, Java, Python, Swift, JSON, XML 等</span>
              </div>
            </div>
            <div className="format-category">
              <div className="format-icon data">
                <Database size={20} />
              </div>
              <div className="format-info">
                <strong>{t('fileEncryption.data')}</strong>
                <span>SQL, DB, SQLite 等</span>
              </div>
            </div>
          </div>

          <div className="password-section">
            <div className="input-group">
              <label className="input-label">
                <Shield size={18} />
                {t('encryption.setPassword')}
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
                  {t('common.passwordMatch')}
                </div>
              )}
            </div>
          </div>

          <div className="upload-section">
            <label className="upload-button">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.doc,.docx,.txt,.html,.htm,.js,.jsx,.ts,.tsx,.css,.scss,.sass,.less,.java,.py,.swift,.c,.cpp,.h,.hpp,.go,.rs,.php,.rb,.json,.xml,.yaml,.yml,.md,.sh,.bat,.ps1,.sql,.db,.sqlite,.sqlite3,.mdb,.accdb"
                onChange={handleFileUpload}
                disabled={loading || !userPassword || !confirmPassword || userPassword !== confirmPassword}
                style={{ display: 'none' }}
              />
              <Upload size={20} />
              {loading ? t('fileEncryption.processing') : t('fileEncryption.selectFileAndEncrypt')}
            </label>
            
            {currentFileType !== 'unknown' && (
              <div className="file-type-indicator">
                <div className="type-icon">
                  {getFileTypeIcon(currentFileType)}
                </div>
                <div className="type-info">
                  <strong>{getFileTypeName(currentFileType)}</strong>
                  <span>{t('fileEncryption.supportedFormats')}：{getSupportedFormats(currentFileType).join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="decryption-panel">
          <div className="input-group">
            <label className="input-label">
              <Key size={18} />
              {t('encryption.enterPassword')}
            </label>
            <input
              type="password"
              className="password-input"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder={t('encryption.enterPassword')}
            />
            <p className="input-hint">
              {t('encryption.enterPassword')}
            </p>
          </div>

          <div className="upload-section">
            <label className="upload-button">
              <input
                type="file"
                accept=".locked"
                onChange={handleFileUpload}
                disabled={loading || !unlockPassword}
                style={{ display: 'none' }}
              />
              <Upload size={20} />
              {loading ? t('fileEncryption.processing') : t('fileEncryption.selectEncryptedFileAndDecrypt')}
            </label>
          </div>
        </div>
      )}

      <div className="info-panel">
        <div className="info-header">
          <AlertCircle size={20} />
          <span>{t('fileEncryption.encryptionDescription')}</span>
        </div>
        <div className="info-content">
          <div className="info-item">
            <div className="info-icon">
              <Shield size={20} />
            </div>
            <div className="info-text">
              <strong>{t('fileEncryption.aes256GcmEncryption')}</strong>
              <ul>
                <li>{t('fileEncryption.militaryGradeAlgorithm')}</li>
                <li>{t('fileEncryption.pbkdf2KeyDerivation')}</li>
                <li>{t('fileEncryption.generateLockedFile')}</li>
                <li>{t('fileEncryption.perfectRecovery')}</li>
              </ul>
            </div>
          </div>
          <div className="info-item">
            <div className="info-icon">
              <Lock size={20} />
            </div>
            <div className="info-text">
              <strong>{t('fileEncryption.securityTips')}</strong>
              <ul>
                <li>{t('fileEncryption.keepPasswordSafe')}</li>
                <li>{t('fileEncryption.strongPasswordRecommendation')}</li>
                <li>{t('fileEncryption.safeTransmission')}</li>
                <li>{t('fileEncryption.localProcessingNote')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

