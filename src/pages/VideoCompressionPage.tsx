import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import VideoCompression from '../components/VideoCompression'
import './PageStyles.css'

export default function VideoCompressionPage() {
  const { language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? '视频压缩 - CommonTools' 
    : 'Video Compression - CommonTools'
  const description = language === 'zh-CN'
    ? '专业视频压缩工具：支持批量处理、多种格式（MP4/MOV/AVI/WebM/M4V）、H.264/VP9编码、CRF/码率/文件大小三种压缩模式。100%本地处理，保护隐私安全。'
    : 'Professional video compression tool: batch processing, multiple formats (MP4/MOV/AVI/WebM/M4V), H.264/VP9 encoding, CRF/bitrate/size compression modes. 100% local processing, privacy protected.'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? '视频压缩,视频优化,视频大小,视频压缩工具,在线压缩视频,批量压缩,MP4压缩,MOV压缩,H.264编码' 
          : 'video compression,video optimization,compress videos,online video compressor,batch compression,MP4 compression,MOV compression,H.264 encoding'} />
        <link rel="canonical" href="https://commontools.top/tools/video-compression" />
        <meta property="og:url" content="https://commontools.top/tools/video-compression" />
      </Helmet>

      <div className="page-container">
        <div className="page-header">
          <h1>
            <span className="title-emoji">🎬</span>
            <span className="title-text">
              {language === 'zh-CN' ? '视频压缩' : 'Video Compression'}
            </span>
          </h1>
          <p className="page-description">
            {description}
          </p>
        </div>
        
        <div className="page-content">
          <VideoCompression />
        </div>
      </div>
    </>
  )
}
