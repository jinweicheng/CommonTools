import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import OCRWorkspace from '../components/OCRWorkspace'
import './PageStyles.css'

export default function OCRTablePage() {
  const { language } = useI18n()
  const zh = language === 'zh-CN'
  const title = zh
    ? '表格 OCR - 免费在线表格识别导出 | CommonTools'
    : 'Table OCR - Free Online Table Recognition & Export | CommonTools'
  const description = zh
    ? '免费在线表格 OCR 结构化识别工具：智能抽取表格/发票/证件，保留行列结构，导出 JSON/Excel/HTML。支持在线表格预览与编辑，纯前端处理。'
    : 'Free online Table OCR with structured recognition for tables, invoices & IDs. Preserves row/column layout. Export to JSON/Excel/HTML with live table preview. 100% client-side.'

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: zh ? '表格 OCR 识别' : 'Table OCR Tool',
    url: 'https://commontools.top/tools/ocr-table',
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
        <meta name="keywords" content="Table OCR,OCR Online,Free OCR Tool,表格识别,发票OCR,Excel导出,结构化识别,Table Recognition,Invoice OCR" />
        <link rel="canonical" href="https://commontools.top/tools/ocr-table" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://commontools.top/tools/ocr-table" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <div className="page-container">
        <div className="page-header">
          <h1><span className="title-emoji">🧾</span><span className="title-text">{zh ? '表格 OCR' : 'Table OCR'}</span></h1>
          <p className="page-description">{description}</p>
        </div>
        <div className="page-content">
          <OCRWorkspace mode="table" language={language} />
        </div>
      </div>
    </>
  )
}
