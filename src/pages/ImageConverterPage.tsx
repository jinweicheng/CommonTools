import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import ImageConverter from '../components/ImageConverter'
import './PageStyles.css'

export default function ImageConverterPage() {
  const { language } = useI18n()

  const title = language === 'zh-CN' ? '老旧格式图片转换 - 免费在线工具' : 'Legacy Image Converter - Free Online Tool'
  const description = language === 'zh-CN' 
    ? '免费在线将老旧格式图片（BMP, TGA, PCX, TIFF）转换为现代格式（JPG, WebP）。支持批量转换，完全在浏览器中处理，保护您的隐私。'
    : 'Free online tool to convert legacy image formats (BMP, TGA, PCX, TIFF) to modern formats (JPG, WebP). Supports batch conversion, all processing in browser, protecting your privacy.'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content="BMP转JPG, TGA转WebP, PCX转换, TIFF转换, 老旧格式, 图片转换, 在线工具" />
        <link rel="canonical" href="https://commontools.top/tools/legacy-image-converter" />
        <meta property="og:url" content="https://commontools.top/tools/legacy-image-converter" />
      </Helmet>

      <div className="page-container image-converter-page">
        <ImageConverter />

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
            <h3>{language === 'zh-CN' ? '⚡ 高效转换' : '⚡ Fast Conversion'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '采用先进的图片处理算法，支持批量转换，快速高效。' 
                : 'Uses advanced image processing algorithms, supports batch conversion, fast and efficient.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🎨 多格式支持' : '🎨 Multi-Format Support'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '支持 BMP、TGA、PCX、TIFF（多页）等老旧格式，输出 JPG 或 WebP。' 
                : 'Supports BMP, TGA, PCX, TIFF (multi-page) and other legacy formats, outputs JPG or WebP.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '💎 质量可控' : '💎 Quality Control'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '自定义输出质量，在文件大小和图片质量之间找到完美平衡。' 
                : 'Customize output quality to find the perfect balance between file size and image quality.'}
            </p>
          </div>
        </div>

        <div className="faq-section">
          <h2>{language === 'zh-CN' ? '常见问题' : 'FAQ'}</h2>
          
          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '支持哪些老旧格式？' : 'What legacy formats are supported?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '我们支持 BMP（所有位深）、TGA（包含 RLE 压缩和 Alpha 通道）、PCX（老游戏格式）、TIFF（包括多页文档）等格式。' 
                : 'We support BMP (all bit depths), TGA (with RLE compression and Alpha channel), PCX (legacy game format), TIFF (including multi-page documents), and more.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? 'JPG 和 WebP 有什么区别？' : 'What\'s the difference between JPG and WebP?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'JPG 是最通用的格式，兼容性最好。WebP 是现代格式，相同质量下文件更小，但部分老设备可能不支持。' 
                : 'JPG is the most universal format with best compatibility. WebP is a modern format with smaller file sizes at the same quality, but may not be supported on some older devices.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '转换会损失质量吗？' : 'Will conversion lose quality?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '在高质量设置下（85%+），视觉上几乎无损。我们使用专业的图片处理算法，确保最佳转换质量。' 
                : 'At high quality settings (85%+), the conversion is visually lossless. We use professional image processing algorithms to ensure the best conversion quality.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? 'TIFF 多页文件如何处理？' : 'How are multi-page TIFF files handled?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '目前支持提取第一页进行转换。完整的多页 TIFF 处理功能正在开发中，敬请期待。' 
                : 'Currently supports extracting and converting the first page. Full multi-page TIFF processing is in development, stay tuned.'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
