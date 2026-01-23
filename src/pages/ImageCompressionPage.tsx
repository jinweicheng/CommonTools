import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import ImageCompression from '../components/ImageCompression'
import './PageStyles.css'

export default function ImageCompressionPage() {
  const { language } = useI18n()
  
  const title = language === 'zh-CN' 
    ? '图片压缩 - CommonTools' 
    : 'Image Compression - CommonTools'
  const description = language === 'zh-CN'
    ? '专业图片压缩工具：支持批量处理、多种格式（JPG/PNG/WebP/GIF/AVIF）、有损/无损压缩、目标大小控制、分辨率缩放、自动最佳格式。100%本地处理，保护隐私安全。'
    : 'Professional image compression tool: batch processing, multiple formats (JPG/PNG/WebP/GIF/TIFF//AVIF), lossy/lossless compression, target size control, resolution scaling, auto best format. 100% local processing, privacy protected.'
  
  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? '图片压缩,图片优化,图片大小,图片压缩工具,在线压缩图片,批量压缩,图片格式转换,WebP压缩,AVIF压缩,HEIC压缩' 
          : 'image compression,image optimization,compress images,online image compressor,batch compression,image format conversion,WebP compression,AVIF compression,HEIC compression'} />
        <link rel="canonical" href="https://commontools.top/tools/image-compression" />
        <meta property="og:url" content="https://commontools.top/tools/image-compression" />
      </Helmet>

      <div className="page-container">
        <div className="page-header">
          <h1>
            <span className="title-emoji">🗜️</span>
            <span className="title-text">
              {language === 'zh-CN' ? '图片压缩' : 'Image Compression'}
            </span>
          </h1>
          <p className="page-description">
            {description}
          </p>
        </div>
        
        <div className="page-content">
          <ImageCompression />
        </div>
      </div>
    </>
  )
}
