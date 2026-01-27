import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import VideoToGif from '../components/VideoToGif'
import './PageStyles.css'

export default function VideoToGifPage() {
  const { language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? 'MP4 转 GIF - CommonTools' 
    : 'MP4 To GIF - CommonTools'
  const description = language === 'zh-CN'
    ? '专业视频转 GIF 工具：支持批量处理、多种视频格式（MP4/MOV/WebM）、自定义质量、帧率和尺寸。使用 FFmpeg WebAssembly，100% 本地处理，保护隐私安全。'
    : 'Professional video to GIF converter: batch processing, multiple formats (MP4/MOV/WebM), custom quality, frame rate and size. Uses FFmpeg WebAssembly, 100% local processing, privacy protected.'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? 'MP4转GIF,视频转GIF,MOV转GIF,视频转换,在线GIF转换,批量转换,动图制作' 
          : 'MP4 to GIF,video to GIF,MOV to GIF,video converter,online GIF converter,batch conversion,animated GIF maker'} />
        <link rel="canonical" href="https://commontools.top/tools/video-to-gif" />
        <meta property="og:url" content="https://commontools.top/tools/video-to-gif" />
      </Helmet>

      <div className="page-container">
        <div className="page-header">
          <h1>
            <span className="title-emoji">🎬</span>
            <span className="title-text">
              {language === 'zh-CN' ? 'MP4 转 GIF' : 'MP4 To GIF'}
            </span>
          </h1>
          <p className="page-description">
            {description}
          </p>
        </div>
        
        <div className="page-content">
          <VideoToGif />
        </div>
      </div>
    </>
  )
}
