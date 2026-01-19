import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import ModernImageConverter from '../components/ModernImageConverter'
import './PageStyles.css'

export default function ModernImageConverterPage() {
  const { language } = useI18n()

  const title = language === 'zh-CN' ? '现代图片格式转换 - AVIF/WebP/PNG/JPG 互转' : 'Modern Image Converter - AVIF/WebP/PNG/JPG Conversion'
  const description = language === 'zh-CN' 
    ? '免费在线 AVIF / WebP / PNG / JPG 高质量批量转换工具，支持实时预览对比和质量调节，完全在浏览器本地处理，保护您的隐私。'
    : 'Free online AVIF / WebP / PNG / JPG high-quality batch conversion tool with real-time preview comparison and quality control, all processed locally in browser, protecting your privacy.'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content="AVIF转换, WebP转换, PNG转JPG, 图片格式转换, 在线工具, 本地处理, 质量对比" />
        <link rel="canonical" href="https://commontools.top/tools/modern-image-converter" />
        <meta property="og:url" content="https://commontools.top/tools/modern-image-converter" />
      </Helmet>

      <div className="page-container modern-image-converter-page">
        <ModernImageConverter />

        <div className="page-info">
          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🔒 本地处理' : '🔒 Local Processing'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '所有图片转换都在您的浏览器中完成，文件不会上传到服务器，确保隐私安全。' 
                : 'All image conversions are processed in your browser. Files are never uploaded to servers, ensuring privacy and security.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '👀 实时对比' : '👀 Real-time Comparison'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '支持原图和转换后图片的并排对比，滑动查看压缩前后的视觉差异。' 
                : 'Supports side-by-side comparison of original and converted images with interactive slider to see visual differences.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🎚️ 质量控制' : '🎚️ Quality Control'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '精细的质量滑块，在文件大小和图片质量之间找到完美平衡。' 
                : 'Fine-grained quality slider to find the perfect balance between file size and image quality.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '📦 批量导出' : '📦 Batch Export'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '支持批量转换和 ZIP 打包下载，保持一致的质量设置。' 
                : 'Batch conversion and ZIP export with consistent quality settings across all images.'}
            </p>
          </div>
        </div>

        <div className="faq-section">
          <h2>{language === 'zh-CN' ? '常见问题' : 'FAQ'}</h2>
          
          <div className="faq-item">
            <h3>{language === 'zh-CN' ? 'AVIF 和 WebP 有什么区别？' : 'What\'s the difference between AVIF and WebP?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'AVIF 是最新的图片格式，压缩率比 WebP 高约 20-50%，但浏览器兼容性较差（需要 Chrome 90+）。WebP 压缩率好且兼容性更广泛，适合大多数场景。' 
                : 'AVIF is the newest format with 20-50% better compression than WebP, but has limited browser support (requires Chrome 90+). WebP offers good compression with wider compatibility, suitable for most scenarios.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '为什么我的浏览器不支持 AVIF？' : 'Why doesn\'t my browser support AVIF?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'AVIF 需要 Chrome 90+、Edge 90+ 或 Firefox 93+ 才能支持。如果您的浏览器版本较旧，建议使用 WebP 格式。' 
                : 'AVIF requires Chrome 90+, Edge 90+, or Firefox 93+. If your browser is older, we recommend using WebP format instead.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '推荐使用什么质量设置？' : 'What quality settings are recommended?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'AVIF: 40-60 获得最佳压缩比；WebP: 75-85 平衡质量和大小；JPG: 80-90 保持较好质量。具体可根据实时预览调整。' 
                : 'AVIF: 40-60 for best compression; WebP: 75-85 for balanced quality and size; JPG: 80-90 for good quality. Adjust based on real-time preview.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? 'PNG 转 JPG 会丢失透明通道吗？' : 'Will PNG to JPG lose transparency?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '是的，JPG 不支持透明通道。转换时会自动添加白色背景。如需保留透明通道，请选择 WebP 或 PNG 格式。' 
                : 'Yes, JPG doesn\'t support transparency. A white background is automatically added during conversion. To preserve transparency, use WebP or PNG format.'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
