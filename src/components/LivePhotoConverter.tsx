import { useState, useRef, useCallback } from 'react'
import { Download, Play, Image as ImageIcon, Film, FileVideo, Loader2, Settings, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import heic2any from 'heic2any'
import { saveAs } from 'file-saver'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { useI18n } from '../i18n/I18nContext'
import { trackFileUpload, trackFileDownload, trackUsage } from '../utils/usageStatisticsService'
import './LivePhotoConverter.css'

interface LivePhotoFiles {
  heic: File | null
  mov: File | null
}

type ConversionMode = 'gif' | 'mp4' | 'static'

interface ConversionResult {
  type: ConversionMode
  blob: Blob
  preview?: string
}

export default function LivePhotoConverter() {
  const { t } = useI18n()
  const [livePhoto, setLivePhoto] = useState<LivePhotoFiles>({ heic: null, mov: null })
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ConversionMode>('gif')
  const [result, setResult] = useState<ConversionResult | null>(null)
  
  // GIF 设置
  const [gifQuality, setGifQuality] = useState(10) // 1-20, 越低越好
  const [gifFps, setGifFps] = useState(10) // 帧率
  const [gifWidth, setGifWidth] = useState(480) // 宽度
  
  // MP4 设置
  const [mp4Quality, setMp4Quality] = useState(23) // CRF: 0-51, 越低越好
  
  // 帧去重设置
  const [enableDedup, setEnableDedup] = useState(true)
  const [dedupThreshold, setDedupThreshold] = useState(5) // 0-100, 相似度阈值
  
  const heicInputRef = useRef<HTMLInputElement>(null)
  const movInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)

  // 初始化 FFmpeg
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegLoaded || ffmpegRef.current) {
      console.log('FFmpeg already loaded')
      return true
    }

    try {
      console.log('Starting FFmpeg load...')
      setProgressMessage(t('livePhoto.loadingFFmpeg'))
      setProgress(0)
      
      const ffmpeg = new FFmpeg()
      
      // 加载 FFmpeg WASM
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      console.log('Loading FFmpeg from:', baseURL)
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      console.log('FFmpeg loaded successfully')

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg Log]:', message)
      })

      ffmpeg.on('progress', ({ progress: p, time }) => {
        const percentage = Math.round(p * 100)
        console.log(`[FFmpeg Progress]: ${percentage}% (${time}ms)`)
        setProgress(percentage)
      })

      ffmpegRef.current = ffmpeg
      setFfmpegLoaded(true)
      return true
    } catch (err) {
      console.error('Failed to load FFmpeg:', err)
      setError(t('livePhoto.ffmpegLoadFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
      return false
    }
  }, [ffmpegLoaded, t])

  // 处理 HEIC 文件上传
  const handleHEICUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.heic') && !ext.endsWith('.heif')) {
      setError(t('livePhoto.invalidHeicFile'))
      return
    }

    setLivePhoto(prev => ({ ...prev, heic: file }))
    setResult(null)
    setError(null)
    
    // 统计：文件上传
    trackFileUpload('live-photo', 'heic')
  }, [t])

  // 处理 MOV 文件上传
  const handleMOVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.mov') && !ext.endsWith('.mp4')) {
      setError(t('livePhoto.invalidMovFile'))
      return
    }

    setLivePhoto(prev => ({ ...prev, mov: file }))
    setResult(null)
    setError(null)
    
    // 统计：文件上传
    trackFileUpload('live-photo', 'mov')
  }, [t])

  // 转换为静态图片
  const convertToStatic = useCallback(async (): Promise<ConversionResult> => {
    if (!livePhoto.heic) throw new Error(t('livePhoto.noHeicFile'))

    setProgressMessage(t('livePhoto.convertingStatic'))
    setProgress(50)

    const result = await heic2any({
      blob: livePhoto.heic,
      toType: 'image/jpeg',
      quality: 0.95,
    })

    const blob = Array.isArray(result) ? result[0] : result
    if (!(blob instanceof Blob)) throw new Error(t('livePhoto.conversionFailed'))

    setProgress(100)
    return {
      type: 'static',
      blob,
      preview: URL.createObjectURL(blob)
    }
  }, [livePhoto.heic, t])

  // 转换为 GIF
  const convertToGIF = useCallback(async (): Promise<ConversionResult> => {
    console.log('=== Starting GIF conversion ===')
    if (!livePhoto.mov) {
      console.error('No MOV file provided')
      throw new Error(t('livePhoto.noMovFile'))
    }

    console.log('MOV file:', livePhoto.mov.name, 'Size:', livePhoto.mov.size)

    console.log('Loading FFmpeg...')
    const loaded = await loadFFmpeg()
    if (!loaded || !ffmpegRef.current) {
      console.error('FFmpeg not loaded')
      throw new Error(t('livePhoto.ffmpegLoadFailed'))
    }

    const ffmpeg = ffmpegRef.current
    console.log('FFmpeg ready')

    setProgressMessage(t('livePhoto.extractingFrames'))
    setProgress(10)

    console.log('Writing MOV file to FFmpeg filesystem...')
    // 将 MOV 文件写入 FFmpeg 文件系统
    const fileData = await fetchFile(livePhoto.mov)
    console.log('File data size:', fileData.byteLength)
    await ffmpeg.writeFile('input.mov', fileData)
    console.log('File written successfully')

    setProgress(20)
    setProgressMessage(t('livePhoto.processingVideo'))

    console.log(`Generating GIF with params: fps=${gifFps}, width=${gifWidth}, quality=${gifQuality}`)

    // 直接生成 GIF（一步完成，更可靠）
    const filterComplex = `fps=${gifFps},scale=${gifWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${gifQuality}:diff_mode=rectangle`
    
    console.log('FFmpeg filter:', filterComplex)
    console.log('Executing FFmpeg command...')

    try {
      await ffmpeg.exec([
        '-i', 'input.mov',
        '-filter_complex', filterComplex,
        '-loop', '0',
        'output.gif'
      ])
      console.log('FFmpeg exec completed')
    } catch (execError) {
      console.error('FFmpeg exec failed:', execError)
      throw execError
    }

    setProgress(90)
    setProgressMessage(t('livePhoto.finalizing'))

    console.log('Reading output GIF...')
    // 读取生成的 GIF
    const data = await ffmpeg.readFile('output.gif')
    console.log('GIF data type:', typeof data)
    // @ts-ignore - FFmpeg returns Uint8Array but TypeScript doesn't recognize it properly
    console.log('GIF data size:', data.byteLength)
    // @ts-ignore
    const blob = new Blob([data], { type: 'image/gif' })
    console.log('GIF blob created, size:', blob.size)

    // 清理 FFmpeg 文件系统
    console.log('Cleaning up files...')
    try {
      await ffmpeg.deleteFile('input.mov')
      await ffmpeg.deleteFile('output.gif')
      console.log('Cleanup completed')
    } catch (err) {
      console.warn('Failed to clean up FFmpeg files:', err)
    }

    setProgress(100)
    console.log('=== GIF conversion completed successfully ===')
    return {
      type: 'gif',
      blob,
      preview: URL.createObjectURL(blob)
    }
  }, [livePhoto.mov, gifFps, gifWidth, gifQuality, loadFFmpeg, t])

  // 转换为 MP4
  const convertToMP4 = useCallback(async (): Promise<ConversionResult> => {
    console.log('=== Starting MP4 conversion ===')
    if (!livePhoto.mov) {
      console.error('No MOV file provided')
      throw new Error(t('livePhoto.noMovFile'))
    }

    console.log('MOV file:', livePhoto.mov.name, 'Size:', livePhoto.mov.size)

    console.log('Loading FFmpeg...')
    const loaded = await loadFFmpeg()
    if (!loaded || !ffmpegRef.current) {
      console.error('FFmpeg not loaded')
      throw new Error(t('livePhoto.ffmpegLoadFailed'))
    }

    const ffmpeg = ffmpegRef.current
    console.log('FFmpeg ready')

    setProgressMessage(t('livePhoto.convertingMp4'))
    setProgress(20)

    console.log('Writing MOV file to FFmpeg filesystem...')
    // 将 MOV 文件写入 FFmpeg 文件系统
    const fileData = await fetchFile(livePhoto.mov)
    console.log('File data size:', fileData.byteLength)
    await ffmpeg.writeFile('input.mov', fileData)
    console.log('File written successfully')

    setProgress(40)

    console.log(`MP4 conversion params: quality=${mp4Quality}, dedup=${enableDedup}, threshold=${dedupThreshold}`)

    // 转换为 MP4（使用 H.264 编码，兼容性最好）
    const ffmpegArgs = [
      '-i', 'input.mov',
      '-c:v', 'libx264',
      '-crf', mp4Quality.toString(),
      '-preset', 'medium',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p'
    ]

    if (enableDedup) {
      // 添加帧去重过滤器
      ffmpegArgs.push('-vf', `mpdecimate=hi=64*${dedupThreshold}:lo=64*${dedupThreshold}:frac=0.33`)
      console.log('Frame deduplication enabled')
    }

    ffmpegArgs.push('output.mp4')

    console.log('FFmpeg command:', ffmpegArgs.join(' '))
    console.log('Executing FFmpeg command...')

    try {
      await ffmpeg.exec(ffmpegArgs)
      console.log('FFmpeg exec completed')
    } catch (execError) {
      console.error('FFmpeg exec failed:', execError)
      throw execError
    }

    setProgress(90)
    setProgressMessage(t('livePhoto.finalizing'))

    console.log('Reading output MP4...')
    // 读取生成的 MP4
    const data = await ffmpeg.readFile('output.mp4')
    console.log('MP4 data size:', (data as Uint8Array).byteLength)
    const uint8Array = new Uint8Array(data as Uint8Array)
    const blob = new Blob([uint8Array], { type: 'video/mp4' })
    console.log('MP4 blob created, size:', blob.size)

    // 清理
    console.log('Cleaning up files...')
    try {
      await ffmpeg.deleteFile('input.mov')
      await ffmpeg.deleteFile('output.mp4')
      console.log('Cleanup completed')
    } catch (err) {
      console.warn('Failed to clean up FFmpeg files:', err)
    }

    setProgress(100)
    console.log('=== MP4 conversion completed successfully ===')
    return {
      type: 'mp4',
      blob,
      preview: URL.createObjectURL(blob)
    }
  }, [livePhoto.mov, mp4Quality, enableDedup, dedupThreshold, loadFFmpeg, t])

  // 执行转换
  const handleConvert = useCallback(async () => {
    console.log('=== handleConvert called ===')
    console.log('Mode:', mode)
    console.log('Live Photo files:', {
      heic: livePhoto.heic?.name,
      mov: livePhoto.mov?.name
    })

    setIsProcessing(true)
    setError(null)
    setProgress(0)
    setResult(null)

    try {
      let conversionResult: ConversionResult

      console.log('Starting conversion for mode:', mode)

      switch (mode) {
        case 'static':
          console.log('Converting to static image...')
          conversionResult = await convertToStatic()
          break
        case 'gif':
          console.log('Converting to GIF...')
          conversionResult = await convertToGIF()
          break
        case 'mp4':
          console.log('Converting to MP4...')
          conversionResult = await convertToMP4()
          break
        default:
          throw new Error(t('livePhoto.unsupportedMode'))
      }

      console.log('Conversion completed successfully')
      setResult(conversionResult)
      
      // 统计：转换完成
      trackUsage('live-photo', 'convert', `/tools/live-photo?mode=${mode}`)
    } catch (err) {
      console.error('=== Conversion failed ===')
      console.error('Error details:', err)
      console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace')
      const errorMessage = err instanceof Error ? err.message : t('livePhoto.conversionFailed')
      console.error('Error message:', errorMessage)
      setError(errorMessage)
    } finally {
      console.log('=== Conversion process finished ===')
      setIsProcessing(false)
      setProgress(0)
      setProgressMessage('')
    }
  }, [mode, livePhoto, convertToStatic, convertToGIF, convertToMP4, t])

  // 下载结果
  const handleDownload = useCallback(() => {
    if (!result) return

    const ext = result.type === 'gif' ? 'gif' : result.type === 'mp4' ? 'mp4' : 'jpg'
    const fileName = `live-photo-${Date.now()}.${ext}`
    saveAs(result.blob, fileName)
    
    // 统计：文件下载
    trackFileDownload('live-photo', result.type)
  }, [result])

  // 清除文件
  const handleClearFiles = useCallback(() => {
    setLivePhoto({ heic: null, mov: null })
    setResult(null)
    setError(null)
    setProgress(0)
  }, [])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const canConvert = () => {
    if (mode === 'static') return livePhoto.heic !== null
    if (mode === 'gif' || mode === 'mp4') return livePhoto.mov !== null
    return false
  }

  return (
    <div className="live-photo-converter">

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* 文件上传区域 */}
      <div className="upload-area">
        <div className="upload-section">
          <div className="upload-box">
            <input
              ref={heicInputRef}
              type="file"
              accept=".heic,.heif"
              onChange={handleHEICUpload}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
            <button
              className="upload-button heic-upload"
              onClick={() => heicInputRef.current?.click()}
              disabled={isProcessing}
            >
              <ImageIcon size={24} />
              <span>{t('livePhoto.uploadHeic')}</span>
            </button>
            {livePhoto.heic && (
              <div className="file-info">
                <CheckCircle size={16} className="check-icon" />
                <span className="file-name">{livePhoto.heic.name}</span>
                <span className="file-size">{formatFileSize(livePhoto.heic.size)}</span>
              </div>
            )}
          </div>

          <div className="upload-box">
            <input
              ref={movInputRef}
              type="file"
              accept=".mov,.mp4"
              onChange={handleMOVUpload}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
            <button
              className="upload-button mov-upload"
              onClick={() => movInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Film size={24} />
              <span>{t('livePhoto.uploadMov')}</span>
            </button>
            {livePhoto.mov && (
              <div className="file-info">
                <CheckCircle size={16} className="check-icon" />
                <span className="file-name">{livePhoto.mov.name}</span>
                <span className="file-size">{formatFileSize(livePhoto.mov.size)}</span>
              </div>
            )}
          </div>
        </div>

        {(livePhoto.heic || livePhoto.mov) && (
          <button
            className="clear-button"
            onClick={handleClearFiles}
            disabled={isProcessing}
          >
            <Trash2 size={18} />
            {t('livePhoto.clearFiles')}
          </button>
        )}
      </div>

      {/* 转换模式选择 */}
      <div className="mode-selector">
        <h3>{t('livePhoto.selectMode')}</h3>
        <div className="mode-buttons">
          <button
            className={`mode-button ${mode === 'static' ? 'active' : ''}`}
            onClick={() => setMode('static')}
            disabled={isProcessing}
          >
            <ImageIcon size={20} />
            <span>{t('livePhoto.modeStatic')}</span>
            <small>{t('livePhoto.modeStaticDesc')}</small>
          </button>
          
          <button
            className={`mode-button ${mode === 'gif' ? 'active' : ''}`}
            onClick={() => setMode('gif')}
            disabled={isProcessing}
          >
            <Play size={20} />
            <span>{t('livePhoto.modeGif')}</span>
            <small>{t('livePhoto.modeGifDesc')}</small>
          </button>
          
          <button
            className={`mode-button ${mode === 'mp4' ? 'active' : ''}`}
            onClick={() => setMode('mp4')}
            disabled={isProcessing}
          >
            <FileVideo size={20} />
            <span>{t('livePhoto.modeMp4')}</span>
            <small>{t('livePhoto.modeMp4Desc')}</small>
          </button>
        </div>
      </div>

      {/* 高级设置 */}
      {(mode === 'gif' || mode === 'mp4') && (
        <div className="advanced-settings">
          <button
            className="settings-toggle"
            onClick={() => setProgressMessage(progressMessage ? '' : t('livePhoto.advancedSettings'))}
          >
            <Settings size={18} />
            {t('livePhoto.advancedSettings')}
          </button>

          <div className="settings-panel">
            {mode === 'gif' && (
              <>
                <div className="setting-group">
                  <label>{t('livePhoto.gifQuality')}: {gifQuality}</label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={gifQuality}
                    onChange={(e) => setGifQuality(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.gifQualityHint')}</small>
                </div>

                <div className="setting-group">
                  <label>{t('livePhoto.gifFps')}: {gifFps}</label>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={gifFps}
                    onChange={(e) => setGifFps(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.gifFpsHint')}</small>
                </div>

                <div className="setting-group">
                  <label>{t('livePhoto.gifWidth')}: {gifWidth}px</label>
                  <input
                    type="range"
                    min="240"
                    max="1080"
                    step="60"
                    value={gifWidth}
                    onChange={(e) => setGifWidth(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.gifWidthHint')}</small>
                </div>
              </>
            )}

            {mode === 'mp4' && (
              <>
                <div className="setting-group">
                  <label>{t('livePhoto.mp4Quality')}: {mp4Quality}</label>
                  <input
                    type="range"
                    min="18"
                    max="28"
                    value={mp4Quality}
                    onChange={(e) => setMp4Quality(parseInt(e.target.value))}
                    disabled={isProcessing}
                  />
                  <small>{t('livePhoto.mp4QualityHint')}</small>
                </div>

                <div className="setting-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={enableDedup}
                      onChange={(e) => setEnableDedup(e.target.checked)}
                      disabled={isProcessing}
                    />
                    {t('livePhoto.enableDedup')}
                  </label>
                  <small>{t('livePhoto.dedupHint')}</small>
                </div>

                {enableDedup && (
                  <div className="setting-group">
                    <label>{t('livePhoto.dedupThreshold')}: {dedupThreshold}%</label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={dedupThreshold}
                      onChange={(e) => setDedupThreshold(parseInt(e.target.value))}
                      disabled={isProcessing}
                    />
                    <small>{t('livePhoto.dedupThresholdHint')}</small>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 转换按钮 */}
      <div className="action-area">
        <button
          className="convert-button"
          onClick={handleConvert}
          disabled={!canConvert() || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="spinner" />
              {t('livePhoto.processing')}
            </>
          ) : (
            <>
              <Play size={20} />
              {t('livePhoto.convert')}
            </>
          )}
        </button>

        {result && (
          <button
            className="download-button"
            onClick={handleDownload}
          >
            <Download size={20} />
            {t('livePhoto.download')}
          </button>
        )}
      </div>

      {/* 进度条 */}
      {isProcessing && (
        <div className="progress-area">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-message">{progressMessage} {progress}%</div>
        </div>
      )}

      {/* 预览区域 */}
      {result && (
        <div className="result-area">
          <h3>{t('livePhoto.result')}</h3>
          <div className="result-preview">
            {result.type === 'static' && result.preview && (
              <img src={result.preview} alt="Converted" className="preview-image" />
            )}
            {result.type === 'gif' && result.preview && (
              <img src={result.preview} alt="Converted GIF" className="preview-image" />
            )}
            {result.type === 'mp4' && result.preview && (
              <video src={result.preview} controls className="preview-video" />
            )}
          </div>
          <div className="result-info">
            <span>{t('livePhoto.fileSize')}: {formatFileSize(result.blob.size)}</span>
            <span>{t('livePhoto.format')}: {result.type.toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* 使用提示 */}
      <div className="tips-section">
        <h4>💡 {t('livePhoto.usageTips')}</h4>
        <ul>
          <li><strong>{t('livePhoto.tip1Label')}</strong> {t('livePhoto.tip1')}</li>
          <li><strong>{t('livePhoto.tip2Label')}</strong> {t('livePhoto.tip2')}</li>
          <li><strong>{t('livePhoto.tip3Label')}</strong> {t('livePhoto.tip3')}</li>
          <li><strong>{t('livePhoto.tip4Label')}</strong> {t('livePhoto.tip4')}</li>
          <li><strong>{t('livePhoto.tip5Label')}</strong> {t('livePhoto.tip5')}</li>
        </ul>
      </div>
    </div>
  )
}
