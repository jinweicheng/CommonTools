import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useFFmpeg } from '../contexts/FFmpegContext'
import './GlobalFFmpegStatus.css'

export default function GlobalFFmpegStatus() {
  const { language } = useI18n()
  const { 
    isLoaded, 
    isLoading, 
    loadingProgress, 
    checkingCache, 
    error, 
    resetError,
    loadFFmpeg
  } = useFFmpeg()

  // 如果已加载且没有错误，不显示任何内容
  if (isLoaded && !error) {
    return null
  }

  // 如果正在检查缓存且没有错误，也不显示内容（避免闪烁）
  if (checkingCache && !error && !isLoading) {
    return null
  }

  return (
    <div className="global-ffmpeg-status">
      {/* 错误状态 */}
      {error && (
        <div className="ffmpeg-status-card error">
          <div className="status-icon">
            <AlertCircle size={20} />
          </div>
          <div className="status-content">
            <h4>{language === 'zh-CN' ? '视频引擎加载失败' : 'Video Engine Load Failed'}</h4>
            <p>{error}</p>
          </div>
          <div className="status-actions">
            <button onClick={() => { resetError(); loadFFmpeg() }} className="retry-btn">
              {language === 'zh-CN' ? '重试' : 'Retry'}
            </button>
            <button onClick={resetError} className="close-btn">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {(isLoading || checkingCache) && !error && (
        <div className="ffmpeg-status-card loading">
          <div className="status-icon">
            <Loader2 className="spinning" size={20} />
          </div>
          <div className="status-content">
            <h4>
              {checkingCache 
                ? (language === 'zh-CN' ? '检查缓存中...' : 'Checking cache...')
                : (language === 'zh-CN' ? '正在加载视频处理引擎' : 'Loading video processing engine')}
            </h4>
            {loadingProgress && !checkingCache && (
              <p className="loading-details">{loadingProgress}</p>
            )}
            {!checkingCache && (
              <p className="loading-hint">
                {language === 'zh-CN' 
                  ? '首次加载需要约30MB，后续访问将秒开' 
                  : 'First load ~30MB, subsequent visits instant'}
              </p>
            )}
          </div>
          <div className="loading-progress">
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
          </div>
        </div>
      )}

      {/* 就绪状态（短暂显示然后消失）*/}
      {isLoaded && !error && !isLoading && !checkingCache && (
        <div className="ffmpeg-status-card ready">
          <div className="status-icon">
            <CheckCircle2 size={20} />
          </div>
          <div className="status-content">
            <h4>{language === 'zh-CN' ? '视频处理引擎就绪' : 'Video engine ready'}</h4>
            <p>{language === 'zh-CN' ? '可以开始处理视频文件' : 'Ready to process video files'}</p>
          </div>
        </div>
      )}
    </div>
  )
}