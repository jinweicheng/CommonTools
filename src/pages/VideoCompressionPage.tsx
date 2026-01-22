import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'

export default function VideoCompressionPage() {
  const { t, language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? '视频压缩 - CommonTools' 
    : 'Video Compression - CommonTools'
  const description = language === 'zh-CN'
    ? '压缩 MP4、MOV、WebM 等视频格式，减小文件大小，保持视频质量'
    : 'Compress videos in MP4, MOV, WebM and other formats to reduce file size while maintaining quality'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? '视频压缩,视频优化,视频大小,视频压缩工具,在线压缩视频' 
          : 'video compression,video optimization,compress videos,online video compressor'} />
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
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: '#94a3b8',
            background: 'rgba(15, 23, 42, 0.5)',
            borderRadius: '12px',
            border: '2px dashed rgba(34, 211, 238, 0.3)'
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
              {language === 'zh-CN' 
                ? '🚧 功能开发中，敬请期待...' 
                : '🚧 Feature under development, coming soon...'}
            </p>
            <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
              {language === 'zh-CN'
                ? '支持压缩 MP4、MOV、WebM 等多种视频格式'
                : 'Supports compressing MP4, MOV, WebM and other video formats'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
