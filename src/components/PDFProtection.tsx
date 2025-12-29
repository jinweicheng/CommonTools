import { useState } from 'react'
import { Upload, Download, Shield, CheckSquare } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './PDFProtection.css'

export default function PDFProtection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preventCopy, setPreventCopy] = useState(true)
  const [preventPrint, setPreventPrint] = useState(true)
  const [preventModify, setPreventModify] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)

      // 设置PDF权限（需要设置所有者密码）
      const ownerPassword = 'owner123' // 实际应用中应该让用户设置

      await pdfDoc.encrypt({
        userPassword: '', // 用户不需要密码即可查看
        ownerPassword: ownerPassword, // 所有者密码用于控制权限
        permissions: {
          printing: preventPrint ? 'lowResolution' : 'allowAll',
          modifying: preventModify ? 'denyAll' : 'allowAll',
          copying: preventCopy ? 'denyAll' : 'allowAll',
          annotating: preventModify ? 'denyAll' : 'allowAll',
          fillingForms: preventModify ? 'denyAll' : 'allowAll',
          contentAccessibility: preventCopy ? 'denyAll' : 'allowAll',
          assembling: preventModify ? 'denyAll' : 'allowAll',
        },
      })

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      
      let filename = file.name.replace('.pdf', '')
      if (preventCopy) filename += '-防复制'
      if (preventPrint) filename += '-防打印'
      if (preventModify) filename += '-防修改'
      
      saveAs(blob, `${filename}.pdf`)

      alert('PDF保护设置成功！')
    } catch (err) {
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pdf-protection">
      <h2 className="tool-header">PDF 防复制/打印</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="protection-settings">
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preventCopy}
              onChange={(e) => setPreventCopy(e.target.checked)}
              className="checkbox-input"
            />
            <Shield size={20} />
            <span>禁止复制文本和内容</span>
          </label>
          <p className="setting-description">启用后，用户无法复制PDF中的文本和内容</p>
        </div>

        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preventPrint}
              onChange={(e) => setPreventPrint(e.target.checked)}
              className="checkbox-input"
            />
            <Shield size={20} />
            <span>禁止打印</span>
          </label>
          <p className="setting-description">启用后，用户无法打印PDF文档</p>
        </div>

        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preventModify}
              onChange={(e) => setPreventModify(e.target.checked)}
              className="checkbox-input"
            />
            <Shield size={20} />
            <span>禁止修改</span>
          </label>
          <p className="setting-description">启用后，用户无法修改PDF文档内容</p>
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
          {loading ? '处理中...' : '选择PDF文件并设置保护'}
        </label>
      </div>

      <div className="info-box">
        <p><strong>说明：</strong>PDF保护功能通过设置文档权限实现。请注意，某些PDF阅读器可能不完全遵守这些限制。建议结合水印等其他保护措施使用。</p>
      </div>
    </div>
  )
}

