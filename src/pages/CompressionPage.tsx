import { useState } from 'react'
import { Upload, Download, Archive, FileArchive, AlertCircle, CheckCircle, File, Lock, Key } from 'lucide-react'
import JSZip from 'jszip'
import { BlobWriter, ZipWriter, BlobReader, ZipReader, Entry } from '@zip.js/zip.js'
import { saveAs } from 'file-saver'
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
  const [mode, setMode] = useState<Mode>('compress')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [zipName, setZipName] = useState('archive.zip')
  const [compressPassword, setCompressPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // 解压相关状态
  const [zipReader, setZipReader] = useState<ZipReader | null>(null)
  const [zipEntries, setZipEntries] = useState<Entry[] | null>(null)
  const [zipFileList, setZipFileList] = useState<ZipFileInfo[]>([])
  const [originalZipFile, setOriginalZipFile] = useState<File | null>(null)
  const [decompressPassword, setDecompressPassword] = useState('')
  const [needPassword, setNeedPassword] = useState(false)

  // 压缩文件（使用 zip.js 支持真正的 AES 加密）
  const handleCompress = async () => {
    if (files.length === 0) {
      setError('请先选择要压缩的文件')
      return
    }

    // 验证密码
    if (compressPassword) {
      if (compressPassword.length < 4) {
        setError('密码长度至少为 4 位')
        return
      }
      if (compressPassword !== confirmPassword) {
        setError('两次输入的密码不一致')
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
      const zipWriterOptions = compressPassword 
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
      
      const successMsg = `✅ 压缩成功！\n\n压缩信息：\n• 文件数：${files.length}\n• 原始大小：${(totalSize / 1024).toFixed(2)} KB\n• 压缩后大小：${(blob.size / 1024).toFixed(2)} KB\n• 压缩率：${(((1 - blob.size / totalSize) * 100).toFixed(1))}%${compressPassword ? '\n• 密码保护：AES-256 加密 🔒✅' : ''}`
      
      setSuccess(successMsg)
      
      // 清空文件列表和密码
      setFiles([])
      setCompressPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error('压缩失败:', err)
      setError('压缩失败：' + (err instanceof Error ? err.message : '未知错误'))
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
      
      let reader: ZipReader
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
          setError('❌ 此 ZIP 文件包含加密内容，请输入密码')
          setLoading(false)
          return
        }
      } catch (loadError: any) {
        // 检测是否需要密码
        const errorMsg = loadError.message || ''
        if (errorMsg.includes('password') || errorMsg.includes('encrypted') || errorMsg.includes('decrypt') || errorMsg.includes('Entry')) {
          setNeedPassword(true)
          setOriginalZipFile(file)
          setError('❌ 此 ZIP 文件受密码保护，请输入密码')
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
      setSuccess(`✅ ZIP 文件加载成功！\n\n包含 ${fileInfos.filter(f => !f.dir).length} 个文件${password ? ' · AES 密码验证成功 🔒✅' : ''}`)
    } catch (err) {
      console.error('加载 ZIP 失败:', err)
      setError('加载失败：' + (err instanceof Error ? err.message : '文件可能已损坏或密码错误'))
    } finally {
      setLoading(false)
    }
  }

  // 使用密码解锁
  const handleUnlockZip = () => {
    if (!decompressPassword) {
      setError('请输入密码')
      return
    }
    if (originalZipFile) {
      handleLoadZipFile(originalZipFile, decompressPassword)
    }
  }

  // 解压选中的文件（使用 zip.js）
  const handleDecompressSelected = async () => {
    if (!zipReader || !zipEntries) {
      setError('请先选择 ZIP 文件')
      return
    }

    const selectedFiles = zipFileList.filter(f => f.selected && !f.dir)
    
    if (selectedFiles.length === 0) {
      setError('请至少选择一个文件')
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
              setError('❌ 文件包含加密内容，请输入密码后重新加载')
              setLoading(false)
              return
            }
            throw entryError
          }
        }
      }

      setSuccess(`✅ 解压成功！\n\n解压信息：\n• 已解压文件：${extractedCount} 个\n• 原始压缩包：${originalZipFile ? (originalZipFile.size / 1024).toFixed(2) : '0'} KB`)
    } catch (err) {
      console.error('解压失败:', err)
      const errorMsg = err instanceof Error ? err.message : '未知错误'
      
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
        setError('❌ 此文件需要密码才能解压，请输入密码')
      } else {
        setError('解压失败：' + errorMsg)
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
    <div className="page-container">
      <div className="page-header">
        <h1>文件压缩/解压</h1>
        <p className="page-description">
          ZIP 格式文件压缩和解压，100% 浏览器本地处理
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
            <span>压缩文件</span>
            <p>将多个文件打包为 ZIP</p>
          </button>
          <button
            className={`mode-button ${mode === 'decompress' ? 'active' : ''}`}
            onClick={() => setMode('decompress')}
          >
            <FileArchive size={32} />
            <span>解压文件</span>
            <p>从 ZIP 中提取文件</p>
          </button>
        </div>

        {/* 压缩模式 */}
        {mode === 'compress' && (
          <div className="compress-section">
            <div className="settings-group">
              <label>压缩包名称</label>
              <input
                type="text"
                value={zipName}
                onChange={(e) => setZipName(e.target.value)}
                placeholder="archive.zip"
              />
            </div>

            <div className="settings-group">
              <label>
                密码保护（可选）
                <span className="label-hint">设置密码可保护压缩包内容</span>
              </label>
              <input
                type="password"
                value={compressPassword}
                onChange={(e) => setCompressPassword(e.target.value)}
                placeholder="至少 4 位"
              />
            </div>

            {compressPassword && (
              <div className="settings-group">
                <label>确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                />
                {compressPassword !== confirmPassword && confirmPassword && (
                  <p className="password-hint error">密码不一致</p>
                )}
                {compressPassword === confirmPassword && confirmPassword && (
                  <p className="password-hint success">密码一致 ✓</p>
                )}
              </div>
            )}

            <div className="file-list">
              <div className="file-list-header">
                <h3>待压缩文件 ({files.length})</h3>
                <label className="select-files-button">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <Upload size={16} />
                  选择文件
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
                  <p>点击"选择文件"添加要压缩的文件</p>
                </div>
              )}
            </div>

            <button
              className="action-button"
              onClick={handleCompress}
              disabled={loading || files.length === 0}
            >
              <Archive size={20} />
              {loading ? '压缩中...' : '开始压缩'}
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
                <h3>此压缩包需要密码</h3>
                <p className="password-hint-text">
                  文件：{originalZipFile?.name}
                </p>
                
                <div className="password-input-section">
                  <input
                    type="password"
                    value={decompressPassword}
                    onChange={(e) => setDecompressPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleUnlockZip()}
                    placeholder="请输入密码"
                    autoFocus
                  />
                  <button 
                    className="unlock-button"
                    onClick={handleUnlockZip}
                    disabled={!decompressPassword}
                  >
                    <Key size={16} />
                    解锁
                  </button>
                </div>
                
                <button 
                  className="back-button"
                  onClick={resetDecompress}
                >
                  返回选择文件
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
                  <h3>选择 ZIP 文件</h3>
                  <p>支持 .zip 格式（包括加密 ZIP）</p>
                  {loading && <p className="loading-text">加载中...</p>}
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
                    更换文件
                  </button>
                </div>

                <div className="file-selection-header">
                  <label className="select-all-checkbox">
                    <input
                      type="checkbox"
                      checked={zipFileList.filter(f => !f.dir).every(f => f.selected)}
                      onChange={toggleSelectAll}
                    />
                    <span>全选 ({zipFileList.filter(f => f.selected).length}/{zipFileList.filter(f => !f.dir).length})</span>
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
                  {loading ? '解压中...' : `解压选中的文件 (${zipFileList.filter(f => f.selected).length})`}
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
              <p><strong>💡 功能说明</strong></p>
              <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>压缩文件：</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>✅ 支持多文件打包</li>
                    <li>✅ DEFLATE 压缩算法（最高级别）</li>
                    <li>✅ 生成标准 ZIP 格式</li>
                    <li>✅ 完全本地处理，保护隐私</li>
                  </ul>
                </li>
                <li><strong>解压文件：</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>✅ 支持标准 ZIP 格式</li>
                    <li>✅ 自动提取所有文件</li>
                    <li>✅ 保留原始文件名</li>
                    <li>⚠️ 暂不支持加密的 ZIP</li>
                  </ul>
                </li>
                <li><strong>⚠️ 注意事项：</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>大文件处理可能需要较长时间</li>
                    <li>建议单次压缩文件总大小不超过 100MB</li>
                    <li>所有操作在浏览器本地完成</li>
                  </ul>
                </li>
                <li><strong>🚀 本地服务模式：</strong>
                  <ul style={{ marginTop: '5px' }}>
                    <li>如需处理大文件或加密 ZIP，可使用本地服务</li>
                    <li>运行 <code>npm run server</code> 启动本地服务</li>
                    <li>本地服务提供更强大的压缩和解压能力</li>
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

