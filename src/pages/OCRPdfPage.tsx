import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import OCRWorkspace from '../components/OCRWorkspace'
import './PageStyles.css'

export default function OCRPdfPage() {
  const { language } = useI18n()
  const zh = language === 'zh-CN'
  const title = zh
    ? 'PDF 转文字 - 免费在线 PDF OCR 识别 | CommonTools'
    : 'PDF to Text - Free Online PDF OCR Tool | CommonTools'
  const description = zh
    ? '免费在线 PDF OCR 识别工具：支持扫描件与多页 PDF，分页识别与合并导出，输出 TXT/DOCX/JSON/可搜索 PDF。支持页码范围选择，纯前端处理。'
    : 'Free online PDF OCR tool for scanned and multi-page PDFs. Page-wise recognition with range selection, merged export to TXT/DOCX/JSON/Searchable PDF. 100% client-side processing.'

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: zh ? 'PDF OCR 识别' : 'PDF OCR Tool',
    url: 'https://commontools.top/tools/ocr-pdf',
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
        <meta name="keywords" content="PDF to Text,PDF OCR,OCR Online,Free OCR Tool,Scan to Text,PDF转文字,扫描件OCR,多页PDF识别,PaddleOCR" />
        <link rel="canonical" href="https://commontools.top/tools/ocr-pdf" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://commontools.top/tools/ocr-pdf" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <div className="page-container">
        <div className="page-header">
          <h1><span className="title-emoji">📄</span><span className="title-text">{zh ? 'PDF OCR 识别' : 'PDF OCR'}</span></h1>
          <p className="page-description">{description}</p>
        </div>
        <div className="page-content">
          <OCRWorkspace mode="pdf" language={language} />
        </div>
      </div>
    </>
  )
}
