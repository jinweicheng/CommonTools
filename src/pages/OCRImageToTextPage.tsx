import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import OCRWorkspace from '../components/OCRWorkspace'
import './PageStyles.css'

export default function OCRImageToTextPage() {
  const { language } = useI18n()
  const zh = language === 'zh-CN'
  const title = zh
    ? '图片转文字 - 免费在线 OCR 识别 | CommonTools'
    : 'Image to Text - Free Online OCR Tool | CommonTools'
  const description = zh
    ? '免费在线图片转文字 OCR 工具：支持 JPG/PNG/WEBP/BMP/TIFF 批量识别，内置 OpenCV 预处理，支持 PaddleOCR v4（ONNX）或 Tesseract.js 引擎。可在线编辑并导出 TXT/DOCX/JSON/可搜索 PDF。纯前端处理，文件不上传服务器。'
    : 'Free online Image to Text OCR tool. Batch JPG/PNG/WEBP/BMP/TIFF support with OpenCV preprocessing and choice of PaddleOCR v4 (ONNX) or Tesseract.js engines. Editable output and export to TXT/DOCX/JSON/Searchable PDF. 100% client-side — files never leave your device.'

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: zh ? '图片转文字 OCR' : 'Image to Text OCR',
    url: 'https://commontools.top/tools/ocr-image-to-text',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Web Browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description,
  }

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content="Image to Text,OCR Online,Free OCR Tool,Scan to Text,图片转文字,在线OCR,文字识别,OCR工具,批量OCR,可导出PDF,客户端OCR" />
        <link rel="canonical" href="https://commontools.top/tools/ocr-image-to-text" />
        <meta name="robots" content="index,follow" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://commontools.top/tools/ocr-image-to-text" />
        <meta property="og:image" content="https://commontools.top/tools/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content="https://commontools.top/tools/og-image.png" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Tools', item: 'https://commontools.top/tools/' },
            { '@type': 'ListItem', position: 2, name: zh ? '图片转文字' : 'Image to Text', item: 'https://commontools.top/tools/ocr-image-to-text' },
          ],
        })}</script>
      </Helmet>
      <div className="page-container">
        <div className="page-header">
          <h1><span className="title-emoji">🧠</span><span className="title-text">{zh ? '图片转文字' : 'Image to Text'}</span></h1>
          <p className="page-description">{description}</p>
        </div>
        <div className="page-content">
          <OCRWorkspace mode="image" language={language} />
        </div>
      </div>
    </>
  )
}
