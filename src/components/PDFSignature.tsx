import { useState, useRef } from 'react'
import { Upload, Download, PenTool, X, Calendar, User } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'
import { PDFDocument, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
import { format } from 'date-fns'
import './PDFSignature.css'

interface Signature {
  id: string
  type: 'signature' | 'date'
  x: number
  y: number
  width: number
  height: number
  data?: string // 签名图片数据
  date?: string // 日期文本
  label?: string // 标签（甲方/乙方）
}

export default function PDFSignature() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPreview, setPdfPreview] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [showSignaturePanel, setShowSignaturePanel] = useState(false)
  const [showDatePanel, setShowDatePanel] = useState(false)
  const [currentLabel, setCurrentLabel] = useState('甲方')
  const signatureCanvasRef = useRef<SignatureCanvas>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPdfFile(file)
    setError(null)

    // 创建预览URL
    const url = URL.createObjectURL(file)
    setPdfPreview(url)
  }

  const handleAddSignature = () => {
    if (!signatureCanvasRef.current) return

    const dataURL = signatureCanvasRef.current.toDataURL()
    if (!dataURL || dataURL === 'data:,') {
      setError('请先绘制签名')
      return
    }

    const newSignature: Signature = {
      id: Date.now().toString(),
      type: 'signature',
      x: 100,
      y: 100,
      width: 200,
      height: 80,
      data: dataURL,
      label: currentLabel,
    }

    setSignatures([...signatures, newSignature])
    setShowSignaturePanel(false)
    signatureCanvasRef.current.clear()
  }

  const handleAddDate = () => {
    const dateStr = format(new Date(), 'yyyy年MM月dd日')
    const newDate: Signature = {
      id: Date.now().toString(),
      type: 'date',
      x: 100,
      y: 200,
      width: 150,
      height: 30,
      date: dateStr,
      label: currentLabel,
    }

    setSignatures([...signatures, newDate])
    setShowDatePanel(false)
  }

  const handleDeleteSignature = (id: string) => {
    setSignatures(signatures.filter(sig => sig.id !== id))
  }

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragging(id)
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return

    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left - dragOffset.x
    const y = e.clientY - rect.top - dragOffset.y

    setSignatures(prevSignatures => 
      prevSignatures.map(sig => 
        sig.id === dragging 
          ? { ...sig, x: Math.max(0, Math.min(x, rect.width - sig.width)), y: Math.max(0, Math.min(y, rect.height - sig.height)) }
          : sig
      )
    )
  }

  const handleMouseUp = () => {
    setDragging(null)
  }

  const handleApplySignatures = async () => {
    if (!pdfFile || signatures.length === 0) {
      setError('请先上传PDF文件并添加签名')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await pdfFile.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const pages = pdfDoc.getPages()

      // 将签名添加到第一页（可以根据需要添加到其他页）
      const firstPage = pages[0]
      const { width, height } = firstPage.getSize()

      for (const sig of signatures) {
        if (sig.type === 'signature' && sig.data) {
          // 将签名图片嵌入PDF
          const imageBytes = await fetch(sig.data).then(res => res.arrayBuffer())
          const image = await pdfDoc.embedPng(imageBytes)
          
          // 计算PDF坐标（假设预览区域为800x600）
          const scaleX = width / 800
          const scaleY = height / 600
          
          firstPage.drawImage(image, {
            x: sig.x * scaleX,
            y: height - (sig.y + sig.height) * scaleY,
            width: sig.width * scaleX,
            height: sig.height * scaleY,
          })

          // 添加标签
          if (sig.label) {
            firstPage.drawText(sig.label, {
              x: sig.x * scaleX,
              y: height - (sig.y - 10) * scaleY,
              size: 10,
              color: rgb(0, 0, 0),
            })
          }
        } else if (sig.type === 'date' && sig.date) {
          const scaleX = width / 800
          const scaleY = height / 600
          
          firstPage.drawText(sig.date, {
            x: sig.x * scaleX,
            y: height - (sig.y + sig.height) * scaleY,
            size: 12,
            color: rgb(0, 0, 0),
          })

          if (sig.label) {
            firstPage.drawText(sig.label, {
              x: sig.x * scaleX,
              y: height - (sig.y - 10) * scaleY,
              size: 10,
              color: rgb(0, 0, 0),
            })
          }
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      saveAs(blob, pdfFile.name.replace('.pdf', '-signed.pdf'))

      alert('签名添加成功！')
    } catch (err) {
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const clearSignature = () => {
    if (signatureCanvasRef.current) {
      signatureCanvasRef.current.clear()
    }
  }

  return (
    <div className="pdf-signature">
      <h2 className="tool-header">PDF 甲乙方签名</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="signature-controls">
        <div className="control-group">
          <label className="control-label">
            <User size={20} />
            签名方
          </label>
          <select
            className="control-select"
            value={currentLabel}
            onChange={(e) => setCurrentLabel(e.target.value)}
          >
            <option value="甲方">甲方</option>
            <option value="乙方">乙方</option>
          </select>
        </div>

        <div className="control-buttons">
          <button
            className="control-button"
            onClick={() => {
              setShowSignaturePanel(true)
              setShowDatePanel(false)
            }}
          >
            <PenTool size={20} />
            添加签名
          </button>
          <button
            className="control-button"
            onClick={() => {
              setShowDatePanel(true)
              setShowSignaturePanel(false)
            }}
          >
            <Calendar size={20} />
            添加日期
          </button>
        </div>
      </div>

      {showSignaturePanel && (
        <div className="signature-panel">
          <div className="panel-header">
            <h3>手写签名</h3>
            <button className="panel-close" onClick={() => setShowSignaturePanel(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="signature-canvas-wrapper">
            <SignatureCanvas
              ref={signatureCanvasRef}
              canvasProps={{
                className: 'signature-canvas',
                width: 400,
                height: 200,
              }}
            />
          </div>
          <div className="panel-actions">
            <button className="action-button secondary" onClick={clearSignature}>
              清除
            </button>
            <button className="action-button primary" onClick={handleAddSignature}>
              确认添加
            </button>
          </div>
        </div>
      )}

      {showDatePanel && (
        <div className="date-panel">
          <div className="panel-header">
            <h3>日期面板</h3>
            <button className="panel-close" onClick={() => setShowDatePanel(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="date-preview">
            {format(new Date(), 'yyyy年MM月dd日')}
          </div>
          <div className="panel-actions">
            <button className="action-button primary" onClick={handleAddDate}>
              确认添加
            </button>
          </div>
        </div>
      )}

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          上传PDF文件
        </label>
      </div>

      {pdfPreview && (
        <div className="pdf-preview-container">
          <div className="preview-label">PDF预览（拖拽签名面板到合适位置）</div>
          <div
            className="pdf-preview"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <iframe
              src={pdfPreview}
              className="pdf-iframe"
              title="PDF Preview"
            />
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className={`signature-item ${sig.type}`}
                style={{
                  left: `${sig.x}px`,
                  top: `${sig.y}px`,
                  width: `${sig.width}px`,
                  height: `${sig.height}px`,
                }}
                onMouseDown={(e) => handleMouseDown(e, sig.id)}
              >
                {sig.type === 'signature' && sig.data ? (
                  <img src={sig.data} alt="签名" />
                ) : (
                  <div className="date-display">{sig.date}</div>
                )}
                <div className="signature-label">{sig.label}</div>
                <button
                  className="signature-delete"
                  onClick={() => handleDeleteSignature(sig.id)}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pdfFile && signatures.length > 0 && (
        <div className="apply-section">
          <button
            className="apply-button"
            onClick={handleApplySignatures}
            disabled={loading}
          >
            <Download size={20} />
            {loading ? '处理中...' : '应用签名并下载'}
          </button>
        </div>
      )}
    </div>
  )
}

