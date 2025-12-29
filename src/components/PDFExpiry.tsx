import { useState } from 'react'
import { Upload, Download, Calendar, Clock } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { format } from 'date-fns'
import './PDFExpiry.css'

export default function PDFExpiry() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryTime, setExpiryTime] = useState('23:59')

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!expiryDate) {
      setError('请选择有效期日期')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)

      // 计算过期时间戳
      const expiryDateTime = new Date(`${expiryDate}T${expiryTime}:00`)
      const expiryTimestamp = expiryDateTime.getTime()

      // 将过期信息添加到PDF元数据
      pdfDoc.setTitle(`${pdfDoc.getTitle() || 'Document'} (有效期至: ${format(expiryDateTime, 'yyyy-MM-dd HH:mm')})`)
      pdfDoc.setSubject(`此文档有效期至: ${format(expiryDateTime, 'yyyy-MM-dd HH:mm')}`)
      
      // 在PDF的第一页添加有效期提示
      const pages = pdfDoc.getPages()
      if (pages.length > 0) {
        const firstPage = pages[0]
        const { width, height } = firstPage.getSize()

        // 在页面顶部添加有效期信息
        firstPage.drawText(`有效期至: ${format(expiryDateTime, 'yyyy年MM月dd日 HH:mm')}`, {
          x: 50,
          y: height - 30,
          size: 10,
          color: { r: 1, g: 0, b: 0 },
        })
      }

      // 保存过期时间到自定义属性（注意：pdf-lib的限制，实际应用中可能需要使用其他方法）
      // 这里我们将信息编码到文档标题中
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      
      // 在文件名中包含有效期信息
      const expiryStr = format(expiryDateTime, 'yyyyMMdd-HHmm')
      saveAs(blob, file.name.replace('.pdf', `-有效期至${expiryStr}.pdf`))

      alert(`文件有效期设置成功！有效期至: ${format(expiryDateTime, 'yyyy-MM-dd HH:mm')}`)
    } catch (err) {
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 设置默认日期为30天后
  const getDefaultDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString().split('T')[0]
  }

  return (
    <div className="pdf-expiry">
      <h2 className="tool-header">PDF 文件有效期</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="expiry-settings">
        <div className="setting-group">
          <label className="setting-label">
            <Calendar size={20} />
            有效期日期
          </label>
          <input
            type="date"
            className="setting-input"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            placeholder={getDefaultDate()}
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            <Clock size={20} />
            有效期时间
          </label>
          <input
            type="time"
            className="setting-input"
            value={expiryTime}
            onChange={(e) => setExpiryTime(e.target.value)}
          />
        </div>

        {expiryDate && (
          <div className="expiry-info">
            <p>文件有效期将设置为：</p>
            <p className="expiry-date">
              {format(new Date(`${expiryDate}T${expiryTime}:00`), 'yyyy年MM月dd日 HH:mm')}
            </p>
          </div>
        )}
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading || !expiryDate}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : '选择PDF文件并设置有效期'}
        </label>
      </div>

      <div className="info-box">
        <p><strong>说明：</strong>有效期信息将添加到PDF文档的元数据和第一页。建议在文件名中也包含有效期信息以便管理。</p>
      </div>
    </div>
  )
}

