import { useState } from 'react'
import { Upload, FileText, Image, AlertCircle, CheckCircle } from 'lucide-react'
// import { PDFDocument } from 'pdf-lib' // 暂未使用
import * as pdfjsLib from 'pdfjs-dist'
import { saveAs } from 'file-saver'
import '../utils/pdfWorkerConfig' // 配置 PDF.js worker
import { useI18n } from '../i18n/I18nContext'
import './ConvertFromPDF.css'

type ConversionType = 'image' | 'txt'

export default function ConvertFromPDF() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<ConversionType>('image')

  // PDF 转图片
  const pdfToImage = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    const images: Blob[] = []
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const scale = 2.0 // 高清晰度
      const viewport = page.getViewport({ scale })
      
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
      
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png')
      })
      
      images.push(blob)
    }
    
    if (images.length === 1) {
      // 单页 PDF，直接保存为图片
      saveAs(images[0], file.name.replace('.pdf', '.png'))
      setSuccess(`✅ ${t('convertFromPdf.successImageSingle')}`)
    } else {
      // 多页 PDF，保存为多个图片
      for (let i = 0; i < images.length; i++) {
        saveAs(images[i], file.name.replace('.pdf', `_page${i + 1}.png`))
      }
      setSuccess(`✅ ${t('convertFromPdf.successImageMulti').replace('{count}', String(images.length))}`)
    }
  }

  // PDF 转 TXT
  const pdfToTxt = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    let textContent = ''
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      
      const pageHeader = t('convertFromPdf.pageHeader').replace('{page}', String(pageNum))
      textContent += `\n========== ${pageHeader} ==========\n\n`
      
      content.items.forEach((item: any) => {
        if (item.str) {
          textContent += item.str
        }
      })
      
      textContent += '\n'
    }
    
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, file.name.replace('.pdf', '.txt'))
    setSuccess(
      `✅ ${t('convertFromPdf.successTxt')}`
        .replace('{pages}', String(pdf.numPages))
    )
  }


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      switch (selectedType) {
        case 'image':
          await pdfToImage(file)
          break
        case 'txt':
          await pdfToTxt(file)
          break
      }
    } catch (err) {
      console.error('转换失败:', err)
      setError(`${t('convertFromPdf.convertFailed')}：` + (err instanceof Error ? err.message : t('common.unknownError')))
    } finally {
      setLoading(false)
    }
  }

  const conversionTypes = [
    { 
      id: 'image' as ConversionType, 
      name: t('convertFromPdf.pdfToImage'), 
      icon: <Image size={24} />, 
      formats: t('convertFromPdf.pngHdFormat'), 
      difficulty: t('convertFromPdf.ratingPerfect'),
      description: t('convertFromPdf.pdfToImageDesc')
    },
    { 
      id: 'txt' as ConversionType, 
      name: t('convertFromPdf.pdfToTxt'), 
      icon: <FileText size={24} />, 
      formats: '.txt', 
      difficulty: t('convertFromPdf.ratingPerfect'),
      description: t('convertFromPdf.pdfToTxtDesc')
    },
  ]

  return (
    <div className="convert-from-pdf">
      <h2 className="tool-header">{t('convertFromPdf.title')}</h2>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>
        </div>
      )}

      {success && (
        <div className="success-message">
          <CheckCircle size={20} />
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{success}</pre>
        </div>
      )}

      <div className="conversion-types">
        {conversionTypes.map((type) => (
          <button
            key={type.id}
            className={`conversion-type-card ${selectedType === type.id ? 'active' : ''}`}
            onClick={() => setSelectedType(type.id)}
          >
            <div className="card-icon">{type.icon}</div>
            <div className="card-content">
              <h3>{type.name}</h3>
              <p className="card-formats">{t('convertFromPdf.outputPrefix')}: {type.formats}</p>
              <p className="card-difficulty">{type.difficulty}</p>
              <p className="card-description">{type.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? t('convertFromPdf.converting') : t('convertFromPdf.uploadAndConvert')}
        </label>
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <CheckCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#10b981' }} />
          <div>
            <p><strong>✨ {t('convertFromPdf.tipsTitle')}</strong></p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>🖼️ {t('convertFromPdf.pdfToImage')}：</strong>{t('convertFromPdf.tipImage')}</li>
              <li><strong>📄 {t('convertFromPdf.pdfToTxt')}：</strong>{t('convertFromPdf.tipTxt')}</li>
              <li><strong>💡 Word：</strong>{t('convertFromPdf.tipWord')}</li>
              <li><strong>🔧 {t('convertFromPdf.techTitle')}：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>{t('convertFromPdf.techImage')}</li>
                  <li>{t('convertFromPdf.techText')}</li>
                  <li>{t('convertFromPdf.techLocal')}</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

