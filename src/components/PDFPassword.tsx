import { useState } from 'react'
import { Upload, Download, Lock, Eye, EyeOff } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './PDFPassword.css'

export default function PDFPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!password) {
      setError('请输入查看密码')
      return
    }

    if (password.length < 4) {
      setError('密码长度至少为4位')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)

      // 使用pdf-lib设置用户密码（查看密码）
      // 注意：pdf-lib的加密功能有限，这里使用基本加密
      await pdfDoc.encrypt({
        userPassword: password,
        ownerPassword: password, // 可以设置不同的所有者密码
        permissions: {
          printing: 'allowAll',
          modifying: 'allowAll',
          copying: 'allowAll',
          annotating: 'allowAll',
          fillingForms: 'allowAll',
          contentAccessibility: 'allowAll',
          assembling: 'allowAll',
        },
      })

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('.pdf', '-encrypted.pdf'))

      alert('PDF密码保护设置成功！')
      setPassword('') // 清空密码
    } catch (err) {
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pdf-password">
      <h2 className="tool-header">PDF 查看密码</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="password-settings">
        <div className="setting-group">
          <label className="setting-label">
            <Lock size={20} />
            设置查看密码
          </label>
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="setting-input password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码（至少4位）"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="password-strength">
            {password.length > 0 && (
              <div className={`strength-indicator ${password.length < 4 ? 'weak' : password.length < 8 ? 'medium' : 'strong'}`}>
                {password.length < 4 ? '弱' : password.length < 8 ? '中' : '强'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading || !password || password.length < 4}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : '选择PDF文件并添加密码保护'}
        </label>
      </div>

      <div className="info-box">
        <p><strong>说明：</strong>设置密码后，打开PDF文件时需要输入密码才能查看。请妥善保管密码，忘记密码将无法恢复文件。</p>
      </div>
    </div>
  )
}

