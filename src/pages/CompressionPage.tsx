import { useState } from 'react'
import { Upload, Archive, FileArchive, AlertCircle, CheckCircle, File, Lock, Key } from 'lucide-react'
import { BlobWriter, ZipWriter, BlobReader, ZipReader, Entry } from '@zip.js/zip.js'
import { saveAs } from 'file-saver'
import { useI18n } from '../i18n/I18nContext'
import './CompressionPage.css'

type Mode = 'compress' | 'decompress'

interface ZipFileInfo {
  name: string
  size: number
  date: Date
  dir: boolean
  selected: boolean
}

export default function CompressionPage() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('compress')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [zipName, setZipName] = useState('archive.zip')
  const [compressPassword, setCompressPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // 解压相关状态
  const [zipReader, setZipReader] = useState<ZipReader<unknown> | null>(null)
  const [zipEntries, setZipEntries] = useState<Entry[] | null>(null)
  const [zipFileList, setZipFileList] = useState<ZipFileInfo[]>([])
  const [originalZipFile, setOriginalZipFile] = useState<File | null>(null)
  const [decompressPassword, setDecompressPassword] = useState('')
  const [needPassword, setNeedPassword] = useState(false)

  // 压缩文件（使用 zip.js 支持真正的 AES 加密）
  const handleCompress = async () => {
    if (files.length === 0) {
      setError(t('compression.selectFilesToCompress'))
      return
    }

    // 验证密码
    if (compressPassword) {
      if (compressPassword.length < 4) {
        setError(t('compression.passwordTooShort'))
        return
      }
      if (compressPassword !== confirmPassword) {
        setError(t('compression.passwordMismatch'))
        return
      }
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 使用 zip.js 创建加密 ZIP
      const blobWriter = new BlobWriter('application/zip')
      
      // 如果有密码，使用 AES-256 加密
      const zipWriterOptions: any = compressPassword 
        ? { 
            password: compressPassword,
            encryptionStrength: 3, // 3 = AES-256, 2 = AES-192, 1 = AES-128
            zip64: true
          }
        : { zip64: true }
      
      const zipWriter = new ZipWriter(blobWriter, zipWriterOptions)

      // 添加所有文件到 zip
      const totalSize = files.reduce((sum, f) => sum + f.size, 0)
      
      for (const file of files) {
        const blobReader = new BlobReader(file)
        await zipWriter.add(file.name, blobReader, {
          level: 9, // 最高压缩级别 (0-9)
          lastModDate: new Date(file.lastModified)
        })
      }

      // 关闭 zip writer 并获取 blob
      const blob = await zipWriter.close()

      saveAs(blob, zipName)
      
      const successMsg = `✅ ${t('compression.compressSuccess')}\n\n${t('compression.compressInfo')}：\n• ${t('compression.fileCount')}：${files.length}\n• ${t('compression.originalSize')}：${(totalSize / 1024).toFixed(2)} KB\n• ${t('compression.compressedSize')}：${(blob.size / 1024).toFixed(2)} KB\n• ${t('compression.compressionRatio')}：${(((1 - blob.size / totalSize) * 100).toFixed(1))}%${compressPassword ? '\n• ' + t('compression.passwordProtected') : ''}`
      
      setSuccess(successMsg)
      
      // 清空文件列表和密码
      setFiles([])
      setCompressPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error('压缩失败:', err)
      setError(t('compression.compressFailed') + '：' + (err instanceof Error ? err.message : t('common.unknownError')))
    } finally {
      setLoading(false)
    }
  }

  // 加载 ZIP 文件并预览（使用 zip.js）
  const handleLoadZipFile = async (file: File, password?: string) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 使用 zip.js 读取 ZIP
      const blobReader = new BlobReader(file)
      
      const readerOptions = password 
        ? { password }
        : {}
      
      let reader: ZipReader<unknown>
      let entries: Entry[]
      
      try {
        reader = new ZipReader(blobReader, readerOptions)
        entries = await reader.getEntries()
        
        // 检查是否有加密的 entry（即使 reader 创建成功）
        const hasEncrypted = entries.some(entry => entry.encrypted)
        if (hasEncrypted && !password) {
          // 有加密文件但没有提供密码
          await reader.close()
          setNeedPassword(true)
          setOriginalZipFile(file)
          setError('❌ ' + t('compression.enterPassword'))
          setLoading(false)
          return
        }
      } catch (loadError: any) {
        // 检测是否需要密码
        const errorMsg = loadError.message || ''
        if (errorMsg.includes('password') || errorMsg.includes('encrypted') || errorMsg.includes('decrypt') || errorMsg.includes('Entry')) {
          setNeedPassword(true)
          setOriginalZipFile(file)
          setError('❌ ' + t('compression.enterPassword'))
          setLoading(false)
          return
        }
        throw loadError
      }
      
      // 提取文件列表
      const fileInfos: ZipFileInfo[] = entries.map(entry => ({
        name: entry.filename,
        size: entry.uncompressedSize || 0,
        date: entry.lastModDate || new Date(),
        dir: entry.directory,
        selected: !entry.directory, // 默认选中所有文件（不包括文件夹）
      }))
      
      setZipReader(reader)
      setZipEntries(entries)
      setZipFileList(fileInfos)
      setOriginalZipFile(file)
      setNeedPassword(false)
      setSuccess(`✅ ${t('compression.zipLoadedSuccess')}\n\n${t('compression.containsFiles')} ${fileInfos.filter(f => !f.dir).length} ${t('common.files')}${password ? ` · ${t('compression.aesPasswordVerified')} 🔒✅` : ''}`)
    } catch (err) {
      console.error('加载 ZIP 失败:', err)
      setError(t('errors.processingFailed') + '：' + (err instanceof Error ? err.message : t('common.unknownError')))
    } finally {
      setLoading(false)
    }
  }

  // 使用密码解锁
  const handleUnlockZip = () => {
    if (!decompressPassword) {
      setError(t('compression.enterPassword'))
      return
    }
    if (originalZipFile) {
      handleLoadZipFile(originalZipFile, decompressPassword)
    }
  }

  // 解压选中的文件（使用 zip.js）
  const handleDecompressSelected = async () => {
    if (!zipReader || !zipEntries) {
      setError(t('compression.selectZipFile'))
      return
    }

    const selectedFiles = zipFileList.filter(f => f.selected && !f.dir)
    
    if (selectedFiles.length === 0) {
      setError(t('compression.selectFilesToExtract'))
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      let extractedCount = 0

      for (const fileInfo of selectedFiles) {
        // 找到对应的 entry
        const entry = zipEntries.find(e => e.filename === fileInfo.name)
        if (entry && !entry.directory) {
          try {
            const blobWriter = new BlobWriter()
            const blob = await entry.getData!(blobWriter)
            saveAs(blob, entry.filename)
            extractedCount++
          } catch (entryError: any) {
            // 检测单个文件的加密错误
            const errorMsg = entryError.message || ''
            if (errorMsg.includes('encrypted') || errorMsg.includes('password') || errorMsg.includes('decrypt')) {
              // 关闭当前 reader
              await zipReader.close()
              
              // 切换到密码输入模式
              setZipReader(null)
              setZipEntries(null)
              setZipFileList([])
              setNeedPassword(true)
              setError('❌ ' + t('compression.enterPassword'))
              setLoading(false)
              return
            }
            throw entryError
          }
        }
      }

      setSuccess(`✅ ${t('compression.decompressSuccess')}\n\n${t('compression.decompressInfo')}：\n• ${t('compression.extractedFiles')}：${extractedCount} ${t('common.files')}\n• ${t('compression.originalSize')}：${originalZipFile ? (originalZipFile.size / 1024).toFixed(2) : '0'} KB`)
    } catch (err) {
      console.error('解压失败:', err)
      const errorMsg = err instanceof Error ? err.message : t('common.unknownError')
      
      // 如果是加密相关错误，切换到密码输入界面
      if (errorMsg.includes('encrypted') || errorMsg.includes('password') || errorMsg.includes('decrypt')) {
        // 关闭当前 reader
        if (zipReader) {
          try {
            await zipReader.close()
          } catch (e) {
            console.error('关闭 reader 失败:', e)
          }
        }
        
        setZipReader(null)
        setZipEntries(null)
        setZipFileList([])
        setNeedPassword(true)
        setError('❌ ' + t('compression.enterPassword'))
      } else {
        setError(t('compression.decompressFailed') + '：' + errorMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  // 切换文件选择状态
  const toggleFileSelection = (index: number) => {
    setZipFileList(prev => prev.map((file, i) => 
      i === index ? { ...file, selected: !file.selected } : file
    ))
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    const allSelected = zipFileList.filter(f => !f.dir).every(f => f.selected)
    setZipFileList(prev => prev.map(file => 
      file.dir ? file : { ...file, selected: !allSelected }
    ))
  }

  // 重置解压状态
  const resetDecompress = async () => {
    // 关闭 zip reader
    if (zipReader) {
      try {
        await zipReader.close()
      } catch (e) {
        console.error('关闭 zip reader 失败:', e)
      }
    }
    
    setZipReader(null)
    setZipEntries(null)
    setZipFileList([])
    setOriginalZipFile(null)
    setDecompressPassword('')
    setNeedPassword(false)
    setError(null)
    setSuccess(null)
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    if (mode === 'compress') {
      setFiles(prev => [...prev, ...selectedFiles])
    } else if (selectedFiles.length > 0) {
      handleLoadZipFile(selectedFiles[0])
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="page-container compression-page">
      <div className="page-header compression-header">
        <h1 className="page-title">
          <span className="title-emoji">📦</span>
          <span className="title-text">{t('compression.title')}</span>
        </h1>
        <p className="page-subtitle">
          {t('compression.subtitle')}
        </p>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>
        </div>
      )}

      {success && (
        <div className="success-message">
          <CheckCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{success}</pre>
        </div>
      )}

      <div className="compression-content">
        {/* 模式选择 */}
        <div className="mode-selector">
          <button
            className={`mode-button ${mode === 'compress' ? 'active' : ''}`}
            onClick={() => setMode('compress')}
          >
            <Archive size={32} />
            <span>{t('compression.compress')}</span>
            <p>{t('compression.compressDesc')}</p>
          </button>
          <button
            className={`mode-button ${mode === 'decompress' ? 'active' : ''}`}
            onClick={() => setMode('decompress')}
          >
            <FileArchive size={32} />
            <span>{t('compression.decompress')}</span>
            <p>{t('compression.decompressDesc')}</p>
          </button>
        </div>

        {/* 压缩模式 */}
        {mode === 'compress' && (
          <div className="compress-section">
            <div className="settings-group">
              <label>{t('compression.archiveName')}</label>
              <input
                type="text"
                value={zipName}
                onChange={(e) => setZipName(e.target.value)}
                placeholder="archive.zip"
              />
            </div>

            <div className="settings-group">
              <label>
                {t('compression.passwordProtectionOptional')}
                <span className="label-hint">{t('compression.passwordProtectionHint')}</span>
              </label>
              <input
                type="password"
                value={compressPassword}
                onChange={(e) => setCompressPassword(e.target.value)}
                placeholder={t('compression.atLeastFourChars')}
              />
            </div>

            {compressPassword && (
              <div className="settings-group">
                <label>{t('compression.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('compression.reEnterPassword')}
                />
                {compressPassword !== confirmPassword && confirmPassword && (
                  <p className="password-hint error">{t('compression.passwordMismatch')}</p>
                )}
                {compressPassword === confirmPassword && confirmPassword && (
                  <p className="password-hint success">{t('compression.passwordMatch')}</p>
                )}
              </div>
            )}

            <div className="file-list">
              <div className="file-list-header">
                <h3>{t('compression.filesToCompress')} ({files.length})</h3>
                <label className="select-files-button">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <Upload size={16} />
                  {t('compression.selectFiles')}
                </label>
              </div>

              {files.length > 0 ? (
                <div className="files">
                  {files.map((file, index) => (
                    <div key={index} className="file-item">
                      <File size={20} />
                      <div className="file-info">
                        <div className="file-name">{file.name}</div>
                        <div className="file-size">{(file.size / 1024).toFixed(2)} KB</div>
                      </div>
                      <button
                        className="remove-button"
                        onClick={() => handleRemoveFile(index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Archive size={48} />
                  <p>{t('compression.clickToAddFiles')}</p>
                </div>
              )}
            </div>

            <button
              className="action-button"
              onClick={handleCompress}
              disabled={loading || files.length === 0}
            >
              <Archive size={20} />
              {loading ? t('compression.compressing') : t('compression.startCompress')}
            </button>
          </div>
        )}

        {/* 解压模式 */}
        {mode === 'decompress' && (
          <div className="decompress-section">
            {needPassword ? (
              // 需要密码：显示密码输入
              <div className="password-required">
                <div className="password-lock-icon">
                  <Lock size={64} />
                </div>
                <h3>{t('compression.passwordRequiredTitle')}</h3>
                <p className="password-hint-text">
                  {t('common.file')}: {originalZipFile?.name}
                </p>
                
                <div className="password-input-section">
                  <input
                    type="password"
                    value={decompressPassword}
                    onChange={(e) => setDecompressPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleUnlockZip()}
                    placeholder={t('compression.enterPassword')}
                    autoFocus
                  />
                  <button 
                    className="unlock-button"
                    onClick={handleUnlockZip}
                    disabled={!decompressPassword}
                  >
                    <Key size={16} />
                    {t('compression.unlock')}
                  </button>
                </div>
                
                  <button 
                    className="back-button"
                    onClick={resetDecompress}
                  >
                  {t('compression.backToSelectFile')}
                  </button>
              </div>
            ) : !zipReader ? (
              // 未选择文件：显示上传区域
              <div className="upload-area">
                <label className="upload-zone">
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleFileSelect}
                    disabled={loading}
                    style={{ display: 'none' }}
                  />
                  <FileArchive size={64} />
                  <h3>{t('compression.selectZipFile')}</h3>
                  <p>{t('compression.supportedFormats')}</p>
                  {loading && <p className="loading-text">{t('common.loading')}</p>}
                </label>
              </div>
            ) : (
              // 已选择文件：显示文件预览和选择
              <div className="zip-preview">
                <div className="zip-preview-header">
                  <div>
                    <h3>📦 {originalZipFile?.name}</h3>
                    <p className="zip-info">
                      {(originalZipFile?.size || 0 / 1024).toFixed(2)} KB · 
                      共 {zipFileList.filter(f => !f.dir).length} 个文件
                    </p>
                  </div>
                  <button className="change-file-button" onClick={resetDecompress}>
                    {t('compression.changeFile')}
                  </button>
                </div>

                <div className="file-selection-header">
                  <label className="select-all-checkbox">
                    <input
                      type="checkbox"
                      checked={zipFileList.filter(f => !f.dir).every(f => f.selected)}
                      onChange={toggleSelectAll}
                    />
                    <span>{t('compression.selectAll')} ({zipFileList.filter(f => f.selected).length}/{zipFileList.filter(f => !f.dir).length})</span>
                  </label>
                </div>

                <div className="zip-file-list">
                  {zipFileList.filter(f => !f.dir).map((file, index) => (
                    <div key={index} className="zip-file-item">
                      <input
                        type="checkbox"
                        checked={file.selected}
                        onChange={() => toggleFileSelection(index)}
                        className="file-checkbox"
                      />
                      <File size={20} />
                      <div className="file-info">
                        <div className="file-name">{file.name}</div>
                        <div className="file-meta">
                          {(file.size / 1024).toFixed(2)} KB · 
                          {file.date.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="action-button"
                  onClick={handleDecompressSelected}
                  disabled={loading || zipFileList.filter(f => f.selected).length === 0}
                >
                  <FileArchive size={20} />
                  {loading ? t('common.processing') : `${t('compression.decompress')} (${zipFileList.filter(f => f.selected).length})`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 功能说明 */}
        <div className="info-box">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#0066cc' }} />
            <div>
              <p><strong>💡 {t('compression.functionDescription')}</strong></p>
              <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>{t('compression.compressFilesDesc')}</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>✅ {t('compression.multiFilePackaging')}</li>
                    <li>✅ {t('compression.deflateAlgorithm')}</li>
                    <li>✅ {t('compression.standardZipFormat')}</li>
                    <li>✅ {t('compression.fullyLocalProcessing')}</li>
                  </ul>
                </li>
                <li><strong>{t('compression.decompressFilesDesc')}</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>✅ {t('compression.standardZipSupport')}</li>
                    <li>✅ {t('compression.autoExtract')}</li>
                    <li>✅ {t('compression.preserveOriginalNames')}</li>
                    <li>⚠️ {t('compression.encryptedZipNotSupported')}</li>
                  </ul>
                </li>
                <li><strong>⚠️ {t('compression.notes')}</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>{t('compression.largeFileProcessing')}</li>
                    <li>{t('compression.recommendMaxSize')}</li>
                    <li>{t('compression.allOperationsLocal')}</li>
                  </ul>
                </li>
                <li><strong>🚀 {t('compression.localServerMode')}</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>{t('compression.largeFileOrEncryptedZip')}</li>
                    <li>{t('compression.runNpmServer')}</li>
                    <li>{t('compression.powerfulCapabilities')}</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

