import { useState, useRef, useCallback, useMemo } from 'react'
import { Upload, Download, PenTool, X, Calendar, Maximize2, Droplet } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'
import { PDFDocument, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
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
  backgroundColor?: string // 背景颜色
}

export default function PDFSignature() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPreview, setPdfPreview] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [showSignaturePanel, setShowSignaturePanel] = useState(false)
  const [showDatePanel, setShowDatePanel] = useState(false)
  const [dateInput, setDateInput] = useState('') // 手动输入的日期
  const signatureCanvasRef = useRef<SignatureCanvas>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [backgroundColor, setBackgroundColor] = useState('#ffffff') // 默认白色背景
  const [pdfBackgroundColor, setPdfBackgroundColor] = useState('#ffffff')
  const [colorPickerMode, setColorPickerMode] = useState(false)
  const pdfPreviewRef = useRef<HTMLDivElement>(null)
  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null)

  // 检测PDF背景色（优化：减少不必要的处理）
  const detectPdfBackgroundColor = useCallback(async (file: File) => {
    try {
      // 简化处理，直接使用白色背景
      setPdfBackgroundColor('#ffffff')
      setBackgroundColor('#ffffff')
    } catch (err) {
      console.warn('无法检测PDF背景色，使用默认白色', err)
      setPdfBackgroundColor('#ffffff')
      setBackgroundColor('#ffffff')
    }
  }, [])

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPdfFile(file)
    setError(null)
    setSignatures([]) // 清空之前的签名

    // 创建预览URL
    const url = URL.createObjectURL(file)
    setPdfPreview(url)

    // 检测PDF背景色（异步，不阻塞）
    detectPdfBackgroundColor(file).catch(() => {})
  }, [detectPdfBackgroundColor])

  const handleAddSignature = useCallback(() => {
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
      width: 250,
      height: 100,
      data: dataURL,
      backgroundColor: backgroundColor,
    }

    setSignatures(prev => [...prev, newSignature])
    setShowSignaturePanel(false)
    signatureCanvasRef.current.clear()
  }, [backgroundColor])

  const handleAddDate = useCallback(() => {
    if (!dateInput.trim()) {
      setError('请输入日期')
      return
    }

    const newDate: Signature = {
      id: Date.now().toString(),
      type: 'date',
      x: 100,
      y: 200,
      width: 180,
      height: 40,
      date: dateInput.trim(),
      backgroundColor: backgroundColor,
    }

    setSignatures(prev => [...prev, newDate])
    setShowDatePanel(false)
    setDateInput('')
  }, [dateInput, backgroundColor])

  const handleDeleteSignature = useCallback((id: string) => {
    setSignatures(prev => prev.filter(sig => sig.id !== id))
  }, [])

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragging(id)
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()

    if (resizing) {
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      // 计算新的宽度和高度（基于鼠标位置和初始右下角位置）
      const newWidth = Math.max(100, mouseX - resizeStart.x + resizeStart.width)
      const newHeight = Math.max(50, mouseY - resizeStart.y + resizeStart.height)

      setSignatures(prevSignatures => 
        prevSignatures.map(sig => {
          if (sig.id === resizing) {
            const maxWidth = rect.width - sig.x
            const maxHeight = rect.height - sig.y
            return {
              ...sig,
              width: Math.min(newWidth, maxWidth),
              height: Math.min(newHeight, maxHeight)
            }
          }
          return sig
        })
      )
    } else if (dragging) {
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
  }, [resizing, dragging, resizeStart, dragOffset])

  const handleMouseUp = () => {
    setDragging(null)
    setResizing(null)
  }

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const sig = signatures.find(s => s.id === id)
    if (!sig) return

    const container = (e.currentTarget as HTMLElement).closest('.pdf-preview') as HTMLElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const mouseX = e.clientX - containerRect.left
    const mouseY = e.clientY - containerRect.top
    
    setResizing(id)
    setResizeStart({
      x: sig.x + sig.width, // 右下角X坐标
      y: sig.y + sig.height, // 右下角Y坐标
      width: sig.width,
      height: sig.height,
    })
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

      // 获取预览容器尺寸用于计算缩放比例
      const previewContainer = document.querySelector('.pdf-preview') as HTMLElement
      const previewWidth = previewContainer?.offsetWidth || 800
      const previewHeight = previewContainer?.offsetHeight || 600

      for (const sig of signatures) {
        // 计算PDF坐标缩放比例
        const scaleX = width / previewWidth
        const scaleY = height / previewHeight

        if (sig.type === 'signature' && sig.data) {
          // 将签名图片嵌入PDF
          const imageBytes = await fetch(sig.data).then(res => res.arrayBuffer())
          const image = await pdfDoc.embedPng(imageBytes)
          
          // 如果有背景色，先绘制背景矩形
          if (sig.backgroundColor && sig.backgroundColor !== '#ffffff') {
            const bgColor = hexToRgb(sig.backgroundColor)
            if (bgColor) {
              firstPage.drawRectangle({
                x: sig.x * scaleX,
                y: height - (sig.y + sig.height) * scaleY,
                width: sig.width * scaleX,
                height: sig.height * scaleY,
                color: rgb(bgColor.r / 255, bgColor.g / 255, bgColor.b / 255),
              })
            }
          }
          
          firstPage.drawImage(image, {
            x: sig.x * scaleX,
            y: height - (sig.y + sig.height) * scaleY,
            width: sig.width * scaleX,
            height: sig.height * scaleY,
          })

        } else if (sig.type === 'date' && sig.date) {
          // 如果有背景色，先绘制背景矩形
          if (sig.backgroundColor && sig.backgroundColor !== '#ffffff') {
            const bgColor = hexToRgb(sig.backgroundColor)
            if (bgColor) {
              firstPage.drawRectangle({
                x: sig.x * scaleX,
                y: height - (sig.y + sig.height) * scaleY,
                width: sig.width * scaleX,
                height: sig.height * scaleY,
                color: rgb(bgColor.r / 255, bgColor.g / 255, bgColor.b / 255),
              })
            }
          }
          
          // 将日期文本转换为图片（支持中文）
          try {
            const dateImageData = await textToImage(sig.date, 12, '#000000')
            const dateImageBytes = await fetch(dateImageData).then(res => res.arrayBuffer())
            const dateImage = await pdfDoc.embedPng(dateImageBytes)
            const dateImageDims = dateImage.scale(0.5)
            
            firstPage.drawImage(dateImage, {
              x: sig.x * scaleX + 5 * scaleX,
              y: height - (sig.y + sig.height - 10) * scaleY,
              width: dateImageDims.width * scaleX,
              height: dateImageDims.height * scaleY,
            })
          } catch (err) {
            console.warn('无法绘制日期', err)
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

  // 将十六进制颜色转换为RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  // RGB转十六进制
  const rgbToHex = (r: number, g: number, b: number) => {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }).join('')
  }

  // 使用EyeDropper API取色
  const handleEyeDropperPick = async () => {
    if (!('EyeDropper' in window)) {
      setError('您的浏览器不支持取色器功能')
      return
    }

    try {
      const eyeDropper = new (window as any).EyeDropper()
      const result = await eyeDropper.open()
      const color = result.sRGBHex
      setBackgroundColor(color)
      setPdfBackgroundColor(color)
      setColorPickerMode(false)
      setPickedColor(color)
    } catch (err) {
      // 用户取消了取色
      if ((err as Error).name !== 'AbortError') {
        console.warn('取色失败', err)
        setError('取色失败，请重试')
      }
      setColorPickerMode(false)
    }
  }

  // 将中文文本转换为图片
  const textToImage = async (text: string, fontSize: number = 12, color: string = '#000000'): Promise<string> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建canvas上下文')

    // 设置字体
    ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`
    ctx.fillStyle = color
    ctx.textBaseline = 'top'

    // 测量文本宽度
    const metrics = ctx.measureText(text)
    const textWidth = metrics.width
    const textHeight = fontSize * 1.2

    // 设置canvas尺寸
    canvas.width = textWidth + 20
    canvas.height = textHeight + 10

    // 重新设置上下文（因为canvas尺寸改变会重置）
    ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`
    ctx.fillStyle = color
    ctx.textBaseline = 'top'

    // 绘制文本
    ctx.fillText(text, 10, 5)

    return canvas.toDataURL('image/png')
  }

  // 更新签名背景色
  const updateSignatureBackground = useCallback((id: string, color: string) => {
    setSignatures(prevSignatures =>
      prevSignatures.map(sig =>
        sig.id === id ? { ...sig, backgroundColor: color } : sig
      )
    )
  }, [])

  // 使用useMemo缓存签名列表，减少重渲染
  const signatureItems = useMemo(() => signatures, [signatures])

  return (
    <div className="pdf-signature">
      <h2 className="tool-header">PDF 签名</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="signature-controls">
        <div className="control-group">
          <label className="control-label">
            背景颜色
          </label>
          <div className="color-picker-wrapper">
            <input
              type="color"
              className="color-picker"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              title="选择签名面板背景色"
            />
            <button
              className={`color-picker-button ${colorPickerMode ? 'active' : ''}`}
              onClick={() => {
                if ('EyeDropper' in window) {
                  setColorPickerMode(true)
                  handleEyeDropperPick()
                } else {
                  setError('您的浏览器不支持取色器功能，请使用颜色选择器手动选择')
                }
              }}
              title="从PDF中取色"
            >
              <Droplet size={16} />
            </button>
            <button
              className="color-reset-button"
              onClick={() => setBackgroundColor(pdfBackgroundColor)}
              title="使用PDF背景色"
            >
              匹配PDF
            </button>
          </div>
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
          <div className="date-input-wrapper">
            <input
              type="text"
              className="date-input"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              placeholder="请输入日期，例如：2024年12月31日"
            />
            <p className="date-hint">支持任意格式的日期文本</p>
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
          <div className="preview-label">
            PDF预览（拖拽签名面板到合适位置，拖拽右下角调整大小）
            {colorPickerMode && (
              <span className="color-picker-hint">点击取色器按钮，然后在屏幕上选择颜色</span>
            )}
          </div>
          <div
            ref={pdfPreviewRef}
            className={`pdf-preview ${colorPickerMode ? 'color-picker-active' : ''}`}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="pdf-preview-wrapper">
              <iframe
                src={pdfPreview}
                className="pdf-iframe"
                title="PDF Preview"
                loading="lazy"
              />
              <div className="pdf-overlay">
                {signatureItems.map((sig) => (
              <div
                key={sig.id}
                className={`signature-item ${sig.type}`}
                style={{
                  left: `${sig.x}px`,
                  top: `${sig.y}px`,
                  width: `${sig.width}px`,
                  height: `${sig.height}px`,
                  backgroundColor: sig.backgroundColor || backgroundColor,
                }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).classList.contains('resize-handle')) {
                    return
                  }
                  handleMouseDown(e, sig.id)
                }}
              >
                {sig.type === 'signature' && sig.data ? (
                  <img src={sig.data} alt="签名" className="signature-image" />
                ) : (
                  <div className="date-display">{sig.date}</div>
                )}
                <div className="signature-actions">
                  <input
                    type="color"
                    className="signature-color-picker"
                    value={sig.backgroundColor || backgroundColor}
                    onChange={(e) => updateSignatureBackground(sig.id, e.target.value)}
                    title="调整背景色"
                  />
                  <button
                    className="signature-delete"
                    onClick={() => handleDeleteSignature(sig.id)}
                    title="删除"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div
                  className="resize-handle"
                  onMouseDown={(e) => handleResizeStart(e, sig.id)}
                  title="拖拽调整大小"
                >
                  <Maximize2 size={12} />
                </div>
              </div>
            ))}
            </div>
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

