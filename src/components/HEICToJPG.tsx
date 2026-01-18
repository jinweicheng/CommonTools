import { useState, useRef, useCallback, useMemo } from 'react'
import { Upload, Download, Image as ImageIcon, X, CheckCircle, AlertCircle, Loader2, Settings, Eye, Trash2, FileImage } from 'lucide-react'
import heic2any from 'heic2any'
import { saveAs } from 'file-saver'
import { useI18n } from '../i18n/I18nContext'
import './HEICToJPG.css'

interface FileItem {
  id: string
  file: File
  preview?: string
  previewLoading?: boolean // 预览加载状态
  status: 'pending' | 'converting' | 'completed' | 'error'
  progress: number
  convertedBlob?: Blob
  error?: string
  originalSize: number
  convertedSize?: number
}

export default function HEICToJPG() {
  const { t } = useI18n()
  const [files, setFiles] = useState<FileItem[]>([])
  const [quality, setQuality] = useState(0.92) // JPG质量 (0-1)
  const [isConverting, setIsConverting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  // 格式化文件大小
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }, [])

  // 生成文件预览（对于HEIC文件，需要先转换为JPG）
  const generatePreview = useCallback(async (file: File): Promise<string> => {
    try {
      // 尝试直接读取（可能失败，因为浏览器不支持HEIC）
      const directPreview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          // 检查是否是有效的图片数据
          if (result && result.startsWith('data:image/')) {
            resolve(result)
          } else {
            reject(new Error('无法直接预览'))
          }
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      return directPreview
    } catch {
      // 如果直接读取失败，尝试转换为JPG预览（使用较低质量以加快速度）
      try {
        const result = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.7, // 预览使用较低质量
        })
        const blob = Array.isArray(result) ? result[0] : result
        if (blob instanceof Blob) {
          return URL.createObjectURL(blob)
        }
        throw new Error(t('errors.processingFailed'))
      } catch (error) {
        console.warn('无法生成预览:', error)
        return '' // 返回空字符串表示无法预览
      }
    }
  }, [])

  // 添加文件
  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return

    const newFiles: FileItem[] = []
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      
      // 验证文件类型
      const isHEIC = file.name.toLowerCase().endsWith('.heic') || 
                     file.name.toLowerCase().endsWith('.heif') ||
                     file.type === 'image/heic' ||
                     file.type === 'image/heif'
      
      if (!isHEIC) {
        continue // 跳过非HEIC文件
      }

      const fileItem: FileItem = {
        id: `${Date.now()}-${i}-${Math.random()}`,
        file,
        status: 'pending',
        progress: 0,
        originalSize: file.size,
      }

      newFiles.push(fileItem)
      
      // 异步生成预览（不阻塞文件添加）
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, previewLoading: true } : f
      ))
      
      generatePreview(file).then(preview => {
        if (preview) {
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, preview, previewLoading: false } : f
          ))
        } else {
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, previewLoading: false } : f
          ))
        }
      }).catch(err => {
        console.warn('无法生成预览:', err)
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, previewLoading: false } : f
        ))
      })
    }

    if (newFiles.length === 0) {
      alert('请选择HEIC或HEIF格式的文件')
      return
    }

    setFiles(prev => [...prev, ...newFiles])
  }, [generatePreview])

  // 处理文件输入
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFileSelect])

  // 拖拽处理
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files)
    }
  }, [handleFileSelect])

  // 转换单个文件
  const convertFile = useCallback(async (fileItem: FileItem): Promise<Blob> => {
    try {
      // 使用heic2any转换
      const result = await heic2any({
        blob: fileItem.file,
        toType: 'image/jpeg',
        quality: quality,
      })

      // heic2any可能返回数组或单个blob
      const blob = Array.isArray(result) ? result[0] : result
      
      if (!(blob instanceof Blob)) {
        throw new Error(t('errors.processingFailed'))
      }

      return blob
    } catch (error) {
      console.error('转换失败:', error)
      throw error
    }
  }, [quality])

  // 转换所有文件
  const handleConvertAll = useCallback(async () => {
    if (files.length === 0) {
      alert(t('errors.fileRequired'))
      return
    }

    setIsConverting(true)
    const pendingFiles = files.filter(f => f.status === 'pending')
    
    if (pendingFiles.length === 0) {
      setIsConverting(false)
      return
    }

    // 更新状态为转换中
    setFiles(prev => prev.map(f => 
      f.status === 'pending' ? { ...f, status: 'converting', progress: 0 } : f
    ))

    // 逐个转换文件
    for (let i = 0; i < pendingFiles.length; i++) {
      const fileItem = pendingFiles[i]
      
      try {
        // 更新进度
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, progress: 10 } : f
        ))

        const convertedBlob = await convertFile(fileItem)
        
        // 更新进度
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            progress: 100,
            status: 'completed',
            convertedBlob,
            convertedSize: convertedBlob.size
          } : f
        ))

        // 生成预览
        const previewUrl = URL.createObjectURL(convertedBlob)
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, preview: previewUrl } : f
        ))

      } catch (error) {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { 
            ...f, 
            status: 'error',
            error: error instanceof Error ? error.message : t('errors.processingFailed')
          } : f
        ))
      }
    }

    setIsConverting(false)
  }, [files, convertFile])

  // 转换单个文件
  const handleConvertSingle = useCallback(async (fileItem: FileItem) => {
    if (fileItem.status === 'converting' || fileItem.status === 'completed') {
      return
    }

    setFiles(prev => prev.map(f => 
      f.id === fileItem.id ? { ...f, status: 'converting', progress: 0 } : f
    ))

    try {
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, progress: 10 } : f
      ))

      const convertedBlob = await convertFile(fileItem)
      
      const previewUrl = URL.createObjectURL(convertedBlob)
      
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { 
          ...f, 
          progress: 100,
          status: 'completed',
          convertedBlob,
          convertedSize: convertedBlob.size,
          preview: previewUrl
        } : f
      ))
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { 
          ...f, 
          status: 'error',
          error: error instanceof Error ? error.message : '转换失败'
        } : f
      ))
    }
  }, [convertFile])

  // 下载单个文件
  const handleDownloadSingle = useCallback((fileItem: FileItem) => {
    if (!fileItem.convertedBlob) return

    const fileName = fileItem.file.name.replace(/\.(heic|heif)$/i, '.jpg')
    saveAs(fileItem.convertedBlob, fileName)
  }, [])

  // 下载所有文件
  const handleDownloadAll = useCallback(() => {
    const completedFiles = files.filter(f => f.status === 'completed' && f.convertedBlob)
    
    if (completedFiles.length === 0) {
      alert('没有可下载的文件，请先完成转换')
      return
    }

    completedFiles.forEach(fileItem => {
      const fileName = fileItem.file.name.replace(/\.(heic|heif)$/i, '.jpg')
      saveAs(fileItem.convertedBlob!, fileName)
    })
  }, [files])

  // 删除文件
  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => {
      const fileItem = prev.find(f => f.id === id)
      if (fileItem?.preview && fileItem.preview.startsWith('blob:')) {
        URL.revokeObjectURL(fileItem.preview)
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  // 清空所有文件
  const handleClearAll = useCallback(() => {
    files.forEach(fileItem => {
      if (fileItem.preview && fileItem.preview.startsWith('blob:')) {
        URL.revokeObjectURL(fileItem.preview)
      }
    })
    setFiles([])
  }, [files])

  // 预览文件
  const handlePreview = useCallback((fileItem: FileItem) => {
    if (!fileItem.preview) return
    
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head>
            <title>${fileItem.file.name}</title>
            <style>
              body { 
                margin: 0; 
                padding: 20px; 
                background: #1a1a1a; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                min-height: 100vh;
              }
              img { 
                max-width: 100%; 
                max-height: 100vh; 
                object-fit: contain;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
              }
            </style>
          </head>
          <body>
            <img src="${fileItem.preview}" alt="${fileItem.file.name}" />
          </body>
        </html>
      `)
      newWindow.document.close()
    }
  }, [])

  // 统计信息
  const stats = useMemo(() => {
    const total = files.length
    const completed = files.filter(f => f.status === 'completed').length
    const converting = files.filter(f => f.status === 'converting').length
    const error = files.filter(f => f.status === 'error').length
    const pending = files.filter(f => f.status === 'pending').length
    
    const totalOriginalSize = files.reduce((sum, f) => sum + f.originalSize, 0)
    const totalConvertedSize = files
      .filter(f => f.convertedSize)
      .reduce((sum, f) => sum + (f.convertedSize || 0), 0)
    
    return {
      total,
      completed,
      converting,
      error,
      pending,
      totalOriginalSize,
      totalConvertedSize,
      compressionRatio: totalConvertedSize > 0 
        ? ((totalOriginalSize - totalConvertedSize) / totalOriginalSize * 100).toFixed(1)
        : '0'
    }
  }, [files])

  return (
    <div className="heic-to-jpg">
      {/* 头部信息 */}
      <div className="heic-header">
        <div className="header-content">
          <h2 className="tool-title">
            <ImageIcon size={28} />
            {t('heicToJpg.toolTitle')}
          </h2>
          <p className="tool-description">
            {t('heicToJpg.toolDescription')}
          </p>
        </div>
        
        <div className="header-actions">
          <button
            className="settings-button"
            onClick={() => setShowSettings(!showSettings)}
            title={t('heicToJpg.settings')}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="settings-panel">
          <div className="setting-item">
            <label className="setting-label">
              <span>{t('heicToJpg.jpgQuality')}</span>
              <span className="quality-value">{Math.round(quality * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="quality-slider"
            />
            <div className="quality-hint">
              <span>{t('heicToJpg.smallerFile')}</span>
              <span>{t('heicToJpg.largerFile')}</span>
            </div>
          </div>
        </div>
      )}

      {/* 上传区域 */}
      <div
        className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".heic,.heif,image/heic,image/heif"
          multiple
          onChange={handleFileInput}
          className="file-input"
        />
        
        <div className="upload-content">
          <Upload size={48} className="upload-icon" />
          <h3 className="upload-title">{t('heicToJpg.dragFilesHere')}</h3>
          <p className="upload-hint">{t('heicToJpg.batchUploadHint')}</p>
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('heicToJpg.selectFiles')}
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      {files.length > 0 && (
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">{t('heicToJpg.totalFiles')}</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat-item success">
            <span className="stat-label">{t('heicToJpg.completed')}</span>
            <span className="stat-value">{stats.completed}</span>
          </div>
          {stats.converting > 0 && (
            <div className="stat-item converting">
              <span className="stat-label">{t('heicToJpg.converting')}</span>
              <span className="stat-value">{stats.converting}</span>
            </div>
          )}
          {stats.error > 0 && (
            <div className="stat-item error">
              <span className="stat-label">{t('heicToJpg.failed')}</span>
              <span className="stat-value">{stats.error}</span>
            </div>
          )}
          {stats.totalConvertedSize > 0 && (
            <div className="stat-item">
              <span className="stat-label">{t('compression.compressionRatio')}</span>
              <span className="stat-value">{stats.compressionRatio}%</span>
            </div>
          )}
        </div>
      )}

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="files-container">
          <div className="files-header">
            <h3 className="files-title">{t('common.fileList')} ({files.length})</h3>
            <div className="files-actions">
              {stats.pending > 0 && (
                <button
                  className="action-button convert-all"
                  onClick={handleConvertAll}
                  disabled={isConverting}
                >
                  {isConverting ? (
                    <>
                      <Loader2 size={16} className="spinning" />
                      {t('heicToJpg.converting')}
                    </>
                  ) : (
                    <>
                      <ImageIcon size={16} />
                      {t('heicToJpg.convert')} ({stats.pending})
                    </>
                  )}
                </button>
              )}
              {stats.completed > 0 && (
                <button
                  className="action-button download-all"
                  onClick={handleDownloadAll}
                >
                  <Download size={16} />
                  {t('heicToJpg.downloadAll')} ({stats.completed})
                </button>
              )}
              <button
                className="action-button clear-all"
                onClick={handleClearAll}
              >
                <Trash2 size={16} />
                {t('heicToJpg.clearAll')}
              </button>
            </div>
          </div>

          <div className="files-list">
            {files.map((fileItem) => (
              <div key={fileItem.id} className={`file-item ${fileItem.status}`}>
                {/* 预览图 */}
                <div className="file-preview">
                  {fileItem.preview ? (
                    <img 
                      src={fileItem.preview} 
                      alt={fileItem.file.name}
                      className="preview-image"
                    />
                  ) : (
                    <div className="preview-placeholder">
                      {fileItem.previewLoading ? (
                        <>
                          <Loader2 size={32} className="spinning" />
                          <span style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{t('common.generatingPreview')}</span>
                        </>
                      ) : (
                        <>
                          <FileImage size={32} />
                          <span style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#94a3b8' }}>{t('common.noPreview')}</span>
                        </>
                      )}
                    </div>
                  )}
                  {fileItem.status === 'converting' && (
                    <div className="preview-overlay">
                      <Loader2 size={24} className="spinning" />
                      <span style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{t('heicToJpg.converting')}</span>
                    </div>
                  )}
                  {fileItem.status === 'completed' && (
                    <div className="preview-badge success">
                      <CheckCircle size={16} />
                    </div>
                  )}
                  {fileItem.status === 'error' && (
                    <div className="preview-badge error">
                      <AlertCircle size={16} />
                    </div>
                  )}
                </div>

                {/* 文件信息 */}
                <div className="file-info">
                  <div className="file-name" title={fileItem.file.name}>
                    {fileItem.file.name}
                  </div>
                  <div className="file-meta">
                    <span className="file-size">
                      {t('common.original')}: {formatFileSize(fileItem.originalSize)}
                    </span>
                    {fileItem.convertedSize && (
                      <span className="file-size converted">
                        JPG: {formatFileSize(fileItem.convertedSize)}
                      </span>
                    )}
                  </div>
                  {fileItem.status === 'converting' && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${fileItem.progress}%` }}
                      />
                    </div>
                  )}
                  {fileItem.error && (
                    <div className="error-message">
                      <AlertCircle size={14} />
                      {fileItem.error}
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="file-actions">
                  {fileItem.status === 'pending' && (
                    <button
                      className="action-btn convert"
                      onClick={() => handleConvertSingle(fileItem)}
                    >
                      <ImageIcon size={16} />
                      {t('heicToJpg.convert')}
                    </button>
                  )}
                  {fileItem.status === 'completed' && (
                    <>
                      <button
                        className="action-btn preview"
                        onClick={() => handlePreview(fileItem)}
                        title={t('common.preview')}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="action-btn download"
                        onClick={() => handleDownloadSingle(fileItem)}
                        title={t('heicToJpg.download')}
                      >
                        <Download size={16} />
                      </button>
                    </>
                  )}
                  {fileItem.status === 'error' && (
                    <button
                      className="action-btn retry"
                      onClick={() => handleConvertSingle(fileItem)}
                      title={t('common.retry')}
                    >
                      <ImageIcon size={16} />
                      {t('common.retry')}
                    </button>
                  )}
                  <button
                    className="action-btn remove"
                    onClick={() => handleRemoveFile(fileItem.id)}
                    title={t('heicToJpg.delete')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 使用提示 */}
      <div className="info-box">
        <div className="info-header">
          <AlertCircle size={20} />
          <span>{t('heicToJpg.usageTips')}</span>
        </div>
        <div className="info-content">
          <div className="info-item">
            <div className="info-icon">
              <AlertCircle size={24} />
            </div>
            <div className="info-text">
              <ul>
                <li>✅ {t('heicToJpg.batchConversion')}</li>
                <li>✅ {t('heicToJpg.localProcessing')}</li>
                <li>✅ {t('heicToJpg.qualityAdjustment')}</li>
                <li>✅ {t('heicToJpg.autoPreview')}</li>
                <li>⚠️ {t('heicToJpg.largeFileWarning')}</li>
                <li>⚠️ {t('heicToJpg.browserRecommendation')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

