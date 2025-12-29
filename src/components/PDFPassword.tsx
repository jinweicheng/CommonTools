import { useState } from 'react'
import { Upload, Download, Lock, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import './PDFPassword.css'

export default function PDFPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  // 权限设置
  const [allowPrinting, setAllowPrinting] = useState(true)
  const [allowCopying, setAllowCopying] = useState(true)
  const [allowModifying, setAllowModifying] = useState(false)
  const [allowAnnotating, setAllowAnnotating] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!password) {
      setError('请输入密码')
      return
    }

    if (password.length < 6) {
      setError('密码长度至少为6位')
      return
    }
    
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)

      // ⚠️ 注意：pdf-lib 不支持真正的 PDF 加密
      // 这里我们使用替代方案：在每页添加密码提示和保护标记
      
      const pages = pdfDoc.getPages()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      
      // 将包含 emoji 的文本转换为图片
      const createProtectionImage = async (text: string, fontSize: number): Promise<string> => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        
        ctx.font = `${fontSize}px Arial, "Segoe UI Emoji", sans-serif`
        const textMetrics = ctx.measureText(text)
        const textWidth = textMetrics.width
        const textHeight = fontSize * 1.5
        
        canvas.width = textWidth + 10
        canvas.height = textHeight
        
        ctx.font = `${fontSize}px Arial, "Segoe UI Emoji", sans-serif`
        ctx.fillStyle = '#808080'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, 5, canvas.height / 2)
        
        return canvas.toDataURL('image/png')
      }
      
      // 在第一页顶部添加密码提示
      if (pages.length > 0) {
        const firstPage = pages[0]
        const { width, height } = firstPage.getSize()
        
        try {
          // 添加半透明的保护标记（使用图片支持 emoji）
          const protectionImageUrl = await createProtectionImage('🔒 PROTECTED DOCUMENT', 16)
          const protectionImageBytes = await fetch(protectionImageUrl).then(res => res.arrayBuffer())
          const protectionImage = await pdfDoc.embedPng(protectionImageBytes)
          const protectionDims = protectionImage.scale(0.6)
          
          firstPage.drawImage(protectionImage, {
            x: 50,
            y: height - 30 - protectionDims.height,
            width: protectionDims.width,
            height: protectionDims.height,
            opacity: 0.5,
          })
        } catch (err) {
          console.warn('无法添加保护图标，使用文本替代', err)
          // 如果图片失败，使用纯文本（不含 emoji）
          firstPage.drawText('PROTECTED DOCUMENT', {
            x: 50,
            y: height - 30,
            size: 10,
            font,
            opacity: 0.5,
          })
        }
        
        // 在页面底部添加密码提示（不显示实际密码）
        firstPage.drawText(`Password Protected | ${new Date().toLocaleDateString()}`, {
          x: 50,
          y: 20,
          size: 8,
          font,
          opacity: 0.3,
        })
      }
      
      // 设置文档元数据
      pdfDoc.setTitle('Password Protected Document')
      pdfDoc.setSubject(`Protected on ${new Date().toLocaleDateString()}`)
      
      // 构建权限关键词
      const permissions = []
      if (!allowPrinting) permissions.push('no-print')
      if (!allowCopying) permissions.push('no-copy')
      if (!allowModifying) permissions.push('no-modify')
      if (!allowAnnotating) permissions.push('no-annotate')
      
      pdfDoc.setKeywords([
        'protected',
        'password',
        'secure',
        ...permissions,
        `date:${new Date().toISOString()}`
      ])
      pdfDoc.setCreator('CommonTools PDF Protection')
      
      // 添加自定义元数据（密码哈希，用于验证）
      // 注意：这不是真正的加密，只是基本的保护标记
      const passwordHash = btoa(password) // 简单的base64编码（不安全，仅作演示）
      const permissionsData = JSON.stringify({
        printing: allowPrinting,
        copying: allowCopying,
        modifying: allowModifying,
        annotating: allowAnnotating
      })
      pdfDoc.setProducer(`Protected:${passwordHash}:Permissions:${btoa(permissionsData)}`)

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, file.name.replace('.pdf', '-protected.pdf'))

      const permissionsMsg = []
      if (!allowPrinting) permissionsMsg.push('打印')
      if (!allowCopying) permissionsMsg.push('复制')
      if (!allowModifying) permissionsMsg.push('修改')
      if (!allowAnnotating) permissionsMsg.push('注释')
      
      const permissionsText = permissionsMsg.length > 0 
        ? `\n• 已禁止：${permissionsMsg.join('、')}` 
        : '\n• 未设置权限限制'

      alert(`✅ PDF保护标记已添加！\n\n保护设置：\n• 密码长度：${password.length}位${permissionsText}\n\n⚠️ 重要提示：\n• 由于浏览器限制，无法实现真正的PDF加密\n• 已添加保护标记和权限元数据\n• 如需真正的密码保护，请使用专业工具或后端服务\n\n建议：配合"防复制/打印"功能使用效果更好`)
      
      // 清空密码
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error('处理PDF时出错:', err)
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
              placeholder="请输入密码（至少6位）"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="password-input-wrapper" style={{ marginTop: '10px' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="setting-input password-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入密码"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="password-strength">
            {password.length > 0 && (
              <div className={`strength-indicator ${password.length < 6 ? 'weak' : password.length < 10 ? 'medium' : 'strong'}`}>
                密码强度：{password.length < 6 ? '弱' : password.length < 10 ? '中' : '强'}
              </div>
            )}
            {confirmPassword.length > 0 && (
              <div style={{ marginTop: '5px', fontSize: '0.875rem', color: password === confirmPassword ? '#4caf50' : '#f44336' }}>
                {password === confirmPassword ? '✓ 密码一致' : '✗ 密码不一致'}
              </div>
            )}
          </div>
        </div>
        
        <div className="setting-group">
          <label className="setting-label">
            <Shield size={20} />
            权限设置
          </label>
          <div style={{ paddingLeft: '10px' }}>
            <label className="checkbox-label" style={{ marginBottom: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowPrinting}
                onChange={(e) => setAllowPrinting(e.target.checked)}
                className="checkbox-input"
              />
              <span>允许打印</span>
            </label>
            <label className="checkbox-label" style={{ marginBottom: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowCopying}
                onChange={(e) => setAllowCopying(e.target.checked)}
                className="checkbox-input"
              />
              <span>允许复制内容</span>
            </label>
            <label className="checkbox-label" style={{ marginBottom: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowModifying}
                onChange={(e) => setAllowModifying(e.target.checked)}
                className="checkbox-input"
              />
              <span>允许修改文档</span>
            </label>
            <label className="checkbox-label" style={{ marginBottom: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowAnnotating}
                onChange={(e) => setAllowAnnotating(e.target.checked)}
                className="checkbox-input"
              />
              <span>允许添加注释</span>
            </label>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '10px', paddingLeft: '10px' }}>
            注意：取消勾选即表示禁止该操作
          </p>
        </div>
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading || !password || password.length < 6 || password !== confirmPassword}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : '选择PDF文件并保护'}
        </label>
      </div>

      <div className="info-box" style={{ background: '#fff3cd', borderColor: '#ffc107' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#ff9800' }} />
          <div>
            <p><strong>⚠️ 重要说明：</strong></p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>前端限制：</strong>浏览器环境无法实现真正的PDF加密（需要后端服务）</li>
              <li><strong>当前方案：</strong>在PDF中添加保护标记和密码元数据</li>
              <li><strong>安全性：</strong>这不是真正的加密，仅作基本保护标记使用</li>
              <li><strong>专业方案：</strong>
                <ul style={{ marginTop: '5px' }}>
                  <li>使用 Adobe Acrobat 设置真正的密码保护</li>
                  <li>使用后端服务进行PDF加密（如 iText、Aspose.PDF）</li>
                  <li>结合本工具的"防复制/打印"功能使用</li>
                </ul>
              </li>
            </ul>
            <p style={{ marginTop: '10px', color: '#e65100', fontWeight: 'bold' }}>
              如需真正的密码保护，请使用专业PDF加密工具或后端服务！
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

