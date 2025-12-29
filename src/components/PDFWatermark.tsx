import { useState } from 'react'
import { Upload, Download, Type, Slider } from 'lucide-react'
import { PDFDocument, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './PDFWatermark.css'

export default function PDFWatermark() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watermarkText, setWatermarkText] = useState('水印')
  const [opacity, setOpacity] = useState(0.3)
  const [fontSize, setFontSize] = useState(48)
  const [angle, setAngle] = useState(-45)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const pages = pdfDoc.getPages()

      // 为每一页添加水印
      for (const page of pages) {
        const { width, height } = page.getSize()

        // 计算水印位置（居中）
        const textWidth = watermarkText.length * fontSize * 0.6
        const textHeight = fontSize

        // 在页面中心添加水印
        page.drawText(watermarkText, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: fontSize,
          color: rgb(0.5, 0.5, 0.5),
          opacity: opacity,
          rotate: { angleInDegrees: angle },
        })

        // 添加多个水印以覆盖整个页面
        const spacing = 200
        for (let x = 0; x < width + spacing; x += spacing) {
          for (let y = 0; y < height + spacing; y += spacing) {
            if (x > 0 || y > 0) {
              page.drawText(watermarkText, {
                x: x - textWidth / 2,
                y: y - textHeight / 2,
                size: fontSize,
                color: rgb(0.5, 0.5, 0.5),
                opacity: opacity,
                rotate: { angleInDegrees: angle },
              })
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('.pdf', '-watermarked.pdf'))

      alert('水印添加成功！')
    } catch (err) {
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pdf-watermark">
      <h2 className="tool-header">PDF 水印</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="watermark-settings">
        <div className="setting-group">
          <label className="setting-label">
            <Type size={20} />
            水印文本
          </label>
          <input
            type="text"
            className="setting-input"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="输入水印文本"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            <Slider size={20} />
            透明度: {Math.round(opacity * 100)}%
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="setting-slider"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            字体大小: {fontSize}px
          </label>
          <input
            type="range"
            min="24"
            max="120"
            step="4"
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value))}
            className="setting-slider"
          />
        </div>

        <div className="setting-group">
          <label className="setting-label">
            旋转角度: {angle}°
          </label>
          <input
            type="range"
            min="-90"
            max="90"
            step="15"
            value={angle}
            onChange={(e) => setAngle(parseInt(e.target.value))}
            className="setting-slider"
          />
        </div>
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
          {loading ? '处理中...' : '选择PDF文件并添加水印'}
        </label>
      </div>

      <div className="preview-box">
        <div className="preview-label">预览效果：</div>
        <div className="watermark-preview">
          <div
            className="preview-text"
            style={{
              fontSize: `${fontSize * 0.3}px`,
              opacity: opacity,
              transform: `rotate(${angle}deg)`,
            }}
          >
            {watermarkText || '水印'}
          </div>
        </div>
      </div>
    </div>
  )
}

