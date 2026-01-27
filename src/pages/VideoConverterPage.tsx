import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import VideoConverter from '../components/VideoConverter'
import './PageStyles.css'

export default function VideoConverterPage() {
  const { language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? '视频格式转换 - CommonTools' 
    : 'Video Format Converter - CommonTools'
  const description = language === 'zh-CN'
    ? '专业视频格式转换工具：支持 MP4、MOV、MKV、WebM 格式之间的相互转换。支持批量处理、自定义编码参数。使用 FFmpeg WebAssembly，100% 本地处理，保护隐私安全。'
    : 'Professional video format converter: Convert between MP4, MOV, MKV, and WebM formats. Supports batch processing and custom encoding parameters. Uses FFmpeg WebAssembly, 100% local processing, privacy protected.'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? '视频格式转换,MP4转MOV,MOV转MP4,MKV转MP4,WebM转MP4,视频转换器,在线视频转换,批量转换' 
          : 'video format converter,MP4 to MOV,MOV to MP4,MKV to MP4,WebM to MP4,video converter,online video converter,batch conversion'} />
        <link rel="canonical" href="https://commontools.top/tools/video-converter" />
        <meta property="og:url" content="https://commontools.top/tools/video-converter" />
      </Helmet>

      <div className="page-container">
        <div className="page-header">
          <h1>
            <span className="title-emoji">🎬</span>
            <span className="title-text">
              {language === 'zh-CN' ? '视频格式转换' : 'Video Format Converter'}
            </span>
          </h1>
          <p className="page-description">
            {description}
          </p>
        </div>
        
        <div className="page-content">
          <VideoConverter />
        </div>
      </div>
    </>
  )
}
