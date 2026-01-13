import { useState } from 'react'
import { Upload, FileText, ArrowRight, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'
import { useI18n } from '../i18n/I18nContext'
import '../utils/pdfWorkerConfig' // 配置 PDF.js worker
import './PDFWordConverter.css'

type ConversionMode = 'word-to-pdf' | 'pdf-to-word'

export default function PDFWordConverter() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<ConversionMode>('word-to-pdf')

  // 将文本转换为图片（支持中文）
  const textToImage = async (text: string, fontSize: number, color: string = '#000000'): Promise<string> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    const dpr = window.devicePixelRatio || 1
    ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const textHeight = fontSize * 1.5
    
    canvas.width = (textWidth + 20) * dpr
    canvas.height = textHeight * dpr
    canvas.style.width = `${textWidth + 20}px`
    canvas.style.height = `${textHeight}px`
    ctx.scale(dpr, dpr)
    
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, textHeight / 2)
    
    return canvas.toDataURL('image/png')
  }

  // Word → PDF（100% 本地）
  const wordToPDF = async (file: File) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 1. 使用 mammoth 提取 Word 内容
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      const text = result.value
      
      if (!text || text.trim().length === 0) {
        throw new Error('Word 文档为空或无法提取文本内容')
      }

      // 2. 创建 PDF
      const pdfDoc = await PDFDocument.create()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      
      const pageWidth = 595 // A4
      const pageHeight = 842
      const margin = 50
      const fontSize = 12
      const lineHeight = fontSize * 1.5
      const maxWidth = pageWidth - 2 * margin
      
      let page = pdfDoc.addPage([pageWidth, pageHeight])
      let yPosition = pageHeight - margin
      
      // 3. 处理文本内容
      const paragraphs = text.split('\n')
      let processedLines = 0
      
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          yPosition -= lineHeight / 2
          if (yPosition < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight])
            yPosition = pageHeight - margin
          }
          continue
        }
        
        // 检查是否包含中文
        const hasChinese = /[\u4e00-\u9fa5]/.test(paragraph)
        
        if (hasChinese) {
          // 中文：转换为图片
          const lines = []
          let currentLine = ''
          const words = paragraph.split('')
          
          // 简单的中文分行逻辑
          for (const char of words) {
            const testLine = currentLine + char
            if (testLine.length * fontSize * 0.7 > maxWidth) {
              if (currentLine) lines.push(currentLine)
              currentLine = char
            } else {
              currentLine = testLine
            }
          }
          if (currentLine) lines.push(currentLine)
          
          for (const line of lines) {
            if (yPosition - lineHeight < margin) {
              page = pdfDoc.addPage([pageWidth, pageHeight])
              yPosition = pageHeight - margin
            }
            
            const imageDataUrl = await textToImage(line, fontSize)
            const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer())
            const image = await pdfDoc.embedPng(imageBytes)
            const imageDims = image.scale(1)
            
            page.drawImage(image, {
              x: margin,
              y: yPosition - imageDims.height,
              width: Math.min(imageDims.width, maxWidth),
              height: imageDims.height,
            })
            
            yPosition -= imageDims.height + 5
            processedLines++
          }
        } else {
          // 英文：使用标准字体
          const words = paragraph.split(' ')
          let currentLine = ''
          
          for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word
            const textWidth = font.widthOfTextAtSize(testLine, fontSize)
            
            if (textWidth > maxWidth && currentLine) {
              if (yPosition < margin) {
                page = pdfDoc.addPage([pageWidth, pageHeight])
                yPosition = pageHeight - margin
              }
              
              page.drawText(currentLine, {
                x: margin,
                y: yPosition,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
              })
              
              yPosition -= lineHeight
              currentLine = word
              processedLines++
            } else {
              currentLine = testLine
            }
          }
          
          if (currentLine) {
            if (yPosition < margin) {
              page = pdfDoc.addPage([pageWidth, pageHeight])
              yPosition = pageHeight - margin
            }
            
            page.drawText(currentLine, {
              x: margin,
              y: yPosition,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
            })
            
            yPosition -= lineHeight
            processedLines++
          }
        }
      }
      
      // 4. 保存 PDF
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
      saveAs(blob, file.name.replace(/\.(doc|docx)$/i, '.pdf'))
      
      setSuccess(`✅ Word 已成功转换为 PDF！\n\n转换信息：\n• 页数：${pdfDoc.getPageCount()}\n• 处理行数：${processedLines}\n• 文件大小：${(blob.size / 1024).toFixed(2)} KB\n\n💡 100% 浏览器本地处理`)
    } catch (err) {
      console.error('Word → PDF 转换失败:', err)
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // PDF → Word（100% 本地）
  const pdfToWord = async (file: File) => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // 1. 使用 PDF.js 提取文本
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      
      const paragraphs: string[] = []
      let totalChars = 0
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const content = await page.getTextContent()
        
        // 添加页码标记
        paragraphs.push(`\n========== 第 ${pageNum} 页 ==========\n`)
        
        let pageText = ''
        content.items.forEach((item: any) => {
          if (item.str) {
            pageText += item.str
            totalChars += item.str.length
          }
        })
        
        // 简单的段落分割
        const pageParagraphs = pageText.split(/\n+/).filter(p => p.trim())
        paragraphs.push(...pageParagraphs)
      }
      
      if (totalChars === 0) {
        throw new Error('PDF 中没有可提取的文本内容（可能是扫描版 PDF）')
      }
      
      // 2. 使用 docx 库创建 Word 文档
      const sections = []
      
      // 添加标题
      sections.push(
        new Paragraph({
          text: file.name.replace('.pdf', ''),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 200,
          },
        })
      )
      
      // 添加内容段落
      for (const para of paragraphs) {
        if (!para.trim()) continue
        
        // 检查是否是页码标记
        if (para.includes('========')) {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: para,
                  bold: true,
                  color: '666666',
                  size: 20,
                }),
              ],
              spacing: {
                before: 200,
                after: 100,
              },
              alignment: AlignmentType.CENTER,
            })
          )
        } else {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: para,
                  size: 24, // 12pt
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          )
        }
      }
      
      // 3. 创建文档
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: sections,
          },
        ],
      })
      
      // 4. 生成并保存
      const blob = await Packer.toBlob(doc)
      saveAs(blob, file.name.replace('.pdf', '.docx'))
      
      setSuccess(`✅ PDF 已成功转换为 Word！\n\n转换信息：\n• PDF 页数：${pdf.numPages}\n• 提取字符：${totalChars} 个\n• 段落数：${paragraphs.filter(p => p.trim() && !p.includes('==========')).length}\n• 文件大小：${(blob.size / 1024).toFixed(2)} KB\n\n💡 100% 浏览器本地处理`)
    } catch (err) {
      console.error('PDF → Word 转换失败:', err)
      setError('转换失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (mode === 'word-to-pdf') {
      await wordToPDF(file)
    } else {
      await pdfToWord(file)
    }
  }

  return (
    <div className="pdf-word-converter">
      <h2 className="tool-header">PDF ↔ Word </h2>

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

      <div className="conversion-mode-selector">
        <button
          className={`mode-button ${mode === 'word-to-pdf' ? 'active' : ''}`}
          onClick={() => setMode('word-to-pdf')}
        >
          <FileText size={32} />
          <ArrowRight size={24} />
          <FileText size={32} />
          <div className="mode-label">{t('conversion.wordToPdf')}</div>
        </button>
        <button
          className={`mode-button ${mode === 'pdf-to-word' ? 'active' : ''}`}
          onClick={() => setMode('pdf-to-word')}
        >
          <FileText size={32} />
          <ArrowRight size={24} />
          <FileText size={32} />
          <div className="mode-label">{t('conversion.pdfToWord')}</div>
        </button>
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept={mode === 'word-to-pdf' ? '.doc,.docx' : '.pdf'}
            onChange={handleFileUpload}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? t('common.processing') : mode === 'word-to-pdf' ? t('common.selectWordFile') : t('encryption.selectFile')}
        </label>
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Info size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#0066cc' }} />
          <div>
            <p><strong>🚀 {t('conversion.localProcessing')}</strong></p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>{t('conversion.wordToPdf')}：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>✅ {t('conversion.wordToPdfDesc1')}</li>
                  <li>✅ {t('conversion.wordToPdfDesc2')}</li>
                  <li>✅ {t('conversion.wordToPdfDesc3')}</li>
                  <li>✅ {t('conversion.wordToPdfDesc4')}</li>
                  <li>⚠️ {t('conversion.wordToPdfDesc5')}</li>
                </ul>
              </li>
              <li><strong>{t('conversion.pdfToWord')}：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>✅ {t('conversion.pdfToWordDesc1')}</li>
                  <li>✅ {t('conversion.pdfToWordDesc2')}</li>
                  <li>✅ {t('conversion.pdfToWordDesc3')}</li>
                  <li>✅ {t('conversion.pdfToWordDesc4')}</li>
                  <li>⚠️ {t('conversion.pdfToWordDesc5')}</li>
                </ul>
              </li>
              <li><strong>💡 {t('common.advantages')}：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>🔒 {t('common.localProcessing')}</li>
                  <li>⚡ {t('common.noUpload')}</li>
                  <li>🆓 {t('common.free')}</li>
                  <li>🌐 {t('common.offlineSupport')}</li>
                </ul>
              </li>
              <li><strong>⚠️ {t('common.limitations')}：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>{t('conversion.note1')}</li>
                  <li>{t('conversion.note2')}</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
