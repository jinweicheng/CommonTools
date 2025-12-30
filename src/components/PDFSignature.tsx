import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Upload, Download, PenTool, X, Calendar, Maximize2, Droplet } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'
import { PDFDocument, rgb } from 'pdf-lib'
import { saveAs } from 'file-saver'
import * as pdfjsLib from 'pdfjs-dist'
import './PDFSignature.css'

// 配置pdf.js worker
try {
  // 尝试使用本地安装的worker文件
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
} catch (e) {
  // 如果本地worker不可用，使用CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

interface Signature {
  id: string
  type: 'signature' | 'date'
  x: number
  y: number
  width: number
  height: number
  data?: string // 签名/日期图片数据（手写）
  backgroundColor?: string // 背景颜色
}

export default function PDFSignature() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPreview, setPdfPreview] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // const [pdfDocument, setPdfDocument] = useState<any>(null) // 暂未使用
  // const [currentPage, setCurrentPage] = useState(1) // 暂未使用
  // const [renderScale, setRenderScale] = useState(1.5) // PDF渲染缩放比例 // 暂未使用
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [showSignaturePanel, setShowSignaturePanel] = useState(false)
  const [showDatePanel, setShowDatePanel] = useState(false)
  const signatureCanvasRef = useRef<SignatureCanvas>(null)
  const dateCanvasRef = useRef<SignatureCanvas>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [backgroundColor, setBackgroundColor] = useState('#ffffff') // 默认白色背景
  const [pdfBackgroundColor, setPdfBackgroundColor] = useState('#ffffff')
  const [colorPickerMode, setColorPickerMode] = useState(false)
  const pdfPreviewRef = useRef<HTMLDivElement>(null)
  // const pdfIframeRef = useRef<HTMLIFrameElement>(null) // 暂未使用
  // const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null) // 暂未使用
  const [penSize, setPenSize] = useState(2) // 默认笔大小（日常笔的大小，2px）
  // const [pdfPageInfo, setPdfPageInfo] = useState<{ width: number; height: number; viewport: any } | null>(null) // 暂未使用
  // const [iframeScale, setIframeScale] = useState<{ scaleX: number; scaleY: number; offsetX: number; offsetY: number } | null>(null) // 暂未使用

  // 计算iframe内PDF的缩放比例
  const _calculateIframeScale = useCallback((pdfWidth: number, pdfHeight: number) => {
    const previewContainer = pdfPreviewRef.current
    if (!previewContainer) return

    const previewWidth = previewContainer.offsetWidth
    const previewHeight = previewContainer.offsetHeight

    // 计算PDF的宽高比和预览容器的宽高比
    const pdfAspectRatio = pdfWidth / pdfHeight
    const previewAspectRatio = previewWidth / previewHeight

    // 根据宽高比计算PDF在预览容器中的实际显示区域
    let displayWidth = previewWidth
    let displayHeight = previewHeight
    let offsetX = 0
    let offsetY = 0

    if (pdfAspectRatio > previewAspectRatio) {
      // PDF更宽，以宽度为准，上下会有空白
      displayHeight = previewWidth / pdfAspectRatio
      offsetY = (previewHeight - displayHeight) / 2
    } else {
      // PDF更高，以高度为准，左右会有空白
      displayWidth = previewHeight * pdfAspectRatio
      offsetX = (previewWidth - displayWidth) / 2
    }

    // 计算缩放比例
    const scaleX = pdfWidth / displayWidth
    const scaleY = pdfHeight / displayHeight

    // setIframeScale({ scaleX, scaleY, offsetX, offsetY }) // 暂未使用
    const _scale2 = { scaleX, scaleY, offsetX, offsetY }
    
    console.log('iframe缩放信息:', _scale2, {
      pdfWidth,
      pdfHeight,
      previewWidth,
      previewHeight,
      displayWidth,
      displayHeight,
      offsetX,
      offsetY,
      scaleX,
      scaleY
    })
  }, [])
  void _calculateIframeScale // 保留以备将来使用

  // 检测PDF背景色（优化：减少不必要的处理）
  const _detectPdfBackgroundColor = useCallback(async (_file: File) => {
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
  void _detectPdfBackgroundColor // 保留以备将来使用

  // 使用canvas渲染PDF
  const renderPdfToCanvas = useCallback(async (pdf: any, pageNum: number, scale: number) => {
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      
      const canvas = canvasRef.current
      if (!canvas) return
      
      const context = canvas.getContext('2d')
      if (!context) return
      
      // 设置canvas尺寸
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      // 清空canvas
      context.clearRect(0, 0, canvas.width, canvas.height)
      
      // 渲染PDF到canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }
      
      await page.render(renderContext).promise
      
      // 更新页面信息和canvas尺寸
      // setPdfPageInfo({ // 暂未使用
      //   width: viewport.width,
      //   height: viewport.height,
      //   viewport: viewport,
      // })
      
      setCanvasSize({
        width: viewport.width,
        height: viewport.height,
      })
      
      // 计算缩放信息
      const container = pdfPreviewRef.current
      if (container) {
        // const containerWidth = container.offsetWidth // 暂未使用
        // const containerHeight = container.offsetHeight // 暂未使用
        
        // setIframeScale({ // 暂未使用
        const _scale = {
          scaleX: viewport.width / viewport.width, // 1:1，因为canvas直接显示
          scaleY: viewport.height / viewport.height,
          offsetX: 0,
          offsetY: 0
        }
        console.log('Scale:', _scale) // 调试用
      }
    } catch (err) {
      console.error('渲染PDF失败', err)
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

    // 使用pdf.js加载并渲染PDF
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      
      // setPdfDocument(pdf) // 暂未使用
      // setCurrentPage(1) // 暂未使用
      console.log('PDF loaded:', pdf) // 调试用
      
      // 计算合适的渲染缩放比例
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.0 })
      
      // 根据容器大小计算合适的缩放比例
      const container = pdfPreviewRef.current
      if (container) {
        const containerWidth = container.offsetWidth || 900
        const containerHeight = container.offsetHeight || 900
        
        const scaleX = containerWidth / viewport.width
        const scaleY = containerHeight / viewport.height
        const scale = Math.min(scaleX, scaleY) * 0.95 // 留5%边距
        
        // setRenderScale(scale) // 暂未使用
        console.log('Render scale:', scale)
        
        // 渲染PDF到canvas
        await renderPdfToCanvas(pdf, 1, scale)
      }
    } catch (err) {
      console.error('加载PDF失败', err)
      setError('加载PDF失败：' + (err instanceof Error ? err.message : '未知错误'))
    }

    // 检测PDF背景色（异步，不阻塞）
    // detectPdfBackgroundColor(file).catch(() => {}) // 暂未使用
  }, [renderPdfToCanvas])

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
    if (!dateCanvasRef.current) return

    const dataURL = dateCanvasRef.current.toDataURL()
    if (!dataURL || dataURL === 'data:,') {
      setError('请先手写日期')
      return
    }

    const newDate: Signature = {
      id: Date.now().toString(),
      type: 'date',
      x: 100,
      y: 200,
      width: 180,
      height: 60,
      data: dataURL, // 使用图片数据而不是文本
      backgroundColor: backgroundColor,
    }

    setSignatures(prev => [...prev, newDate])
    setShowDatePanel(false)
    dateCanvasRef.current.clear()
  }, [backgroundColor])

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
    // 获取overlay的rect（与canvas对齐）
    const overlay = document.querySelector('.pdf-overlay') as HTMLElement
    if (!overlay) return
    
    const rect = overlay.getBoundingClientRect()

    if (resizing) {
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      // 计算新的宽度和高度（基于鼠标位置和初始右下角位置）
      const newWidth = Math.max(100, mouseX - resizeStart.x + resizeStart.width)
      const newHeight = Math.max(50, mouseY - resizeStart.y + resizeStart.height)

      setSignatures(prevSignatures => 
        prevSignatures.map(sig => {
          if (sig.id === resizing) {
            const maxWidth = canvasSize.width - sig.x
            const maxHeight = canvasSize.height - sig.y
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
            ? { ...sig, x: Math.max(0, Math.min(x, canvasSize.width - sig.width)), y: Math.max(0, Math.min(y, canvasSize.height - sig.height)) }
            : sig
        )
      )
    }
  }, [resizing, dragging, resizeStart, dragOffset, canvasSize])

  const handleMouseUp = () => {
    setDragging(null)
    setResizing(null)
  }

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const sig = signatures.find(s => s.id === id)
    if (!sig) return

    const overlay = (e.currentTarget as HTMLElement).closest('.pdf-overlay') as HTMLElement
    if (!overlay) return

    // const overlayRect = overlay.getBoundingClientRect() // 暂未使用
    // const mouseX = e.clientX - overlayRect.left // 暂未使用
    // const mouseY = e.clientY - overlayRect.top // 暂未使用
    
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

      // 使用canvas渲染的方式，坐标计算更准确
      const canvas = canvasRef.current
      if (!canvas) {
        throw new Error('无法找到PDF画布')
      }
      
      // canvas的尺寸就是PDF的渲染尺寸
      const canvasWidth = canvas.width
      const canvasHeight = canvas.height
      
      // PDF文档的实际尺寸（pdf-lib中的尺寸）
      const pdfWidth = width
      const pdfHeight = height
      
      // 计算从canvas坐标到PDF坐标的缩放比例
      const scaleX = pdfWidth / canvasWidth
      const scaleY = pdfHeight / canvasHeight

      console.log('坐标计算信息:', {
        canvasWidth,
        canvasHeight,
        pdfWidth,
        pdfHeight,
        scaleX,
        scaleY,
        signaturesCount: signatures.length
      })

      let processedCount = 0
      let skippedCount = 0
      
      for (const sig of signatures) {
        try {
          // 检查签名数据是否存在
          if (!sig.data) {
            console.warn(`签名 ${sig.id} 没有数据，跳过`)
            skippedCount++
            continue
          }
          
          // 直接使用canvas坐标转换为PDF坐标
          // Canvas坐标系：原点在左上角，Y向下（与预览一致）
          // PDF坐标系：原点在左下角，Y向上
          
          // 1. 将预览坐标转换为PDF坐标（X轴）
          const pdfX = sig.x * scaleX
          
          // 2. 将预览坐标转换为PDF坐标（Y轴，需要翻转）
          const pdfY = pdfHeight - (sig.y + sig.height) * scaleY
          
          // 3. 计算PDF中的尺寸
          const pdfSigWidth = sig.width * scaleX
          const pdfSigHeight = sig.height * scaleY
          
          console.log(`签名 ${sig.id} 坐标转换:`, {
            type: sig.type,
            canvas: { x: sig.x, y: sig.y, width: sig.width, height: sig.height },
            pdf: { x: pdfX, y: pdfY, width: pdfSigWidth, height: pdfSigHeight },
            pdfPage: { width: pdfWidth, height: pdfHeight },
            scale: { x: scaleX, y: scaleY }
          })
          
          // 验证坐标是否在PDF页面范围内
          if (pdfX < 0 || pdfY < 0 || pdfX + pdfSigWidth > pdfWidth || pdfY + pdfSigHeight > pdfHeight) {
            console.warn(`签名 ${sig.id} 超出PDF页面范围，将被裁剪`, { 
              pdfX, 
              pdfY, 
              pdfSigWidth, 
              pdfSigHeight,
              pdfWidth,
              pdfHeight
            })
          }

        if (sig.type === 'signature' && sig.data) {
          // 将签名图片嵌入PDF
          const imageBytes = await fetch(sig.data).then(res => res.arrayBuffer())
          const image = await pdfDoc.embedPng(imageBytes)
          
          // 如果有背景色，先绘制背景矩形
          if (sig.backgroundColor && sig.backgroundColor !== '#ffffff') {
            const bgColor = hexToRgb(sig.backgroundColor)
            if (bgColor) {
              firstPage.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: pdfSigWidth,
                height: pdfSigHeight,
                color: rgb(bgColor.r / 255, bgColor.g / 255, bgColor.b / 255),
              })
            }
          }
          
          firstPage.drawImage(image, {
            x: pdfX,
            y: pdfY,
            width: pdfSigWidth,
            height: pdfSigHeight,
          })
          
          processedCount++

        } else if (sig.type === 'date' && sig.data) {
          // 日期也是图片（手写）
          // 如果有背景色，先绘制背景矩形
          if (sig.backgroundColor && sig.backgroundColor !== '#ffffff') {
            const bgColor = hexToRgb(sig.backgroundColor)
            if (bgColor) {
              firstPage.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: pdfSigWidth,
                height: pdfSigHeight,
                color: rgb(bgColor.r / 255, bgColor.g / 255, bgColor.b / 255),
              })
            }
          }
          
          // 将日期图片嵌入PDF
          try {
            const dateImageBytes = await fetch(sig.data).then(res => res.arrayBuffer())
            const dateImage = await pdfDoc.embedPng(dateImageBytes)
            
            firstPage.drawImage(dateImage, {
              x: pdfX,
              y: pdfY,
              width: pdfSigWidth,
              height: pdfSigHeight,
            })
            
            processedCount++
          } catch (err) {
            console.warn(`无法绘制日期 ${sig.id}`, err)
            skippedCount++
          }
        }
        } catch (err) {
          console.error(`处理签名 ${sig.id} 时出错:`, err)
          skippedCount++
        }
      }
      
      console.log(`签名处理完成: 成功 ${processedCount} 个, 跳过 ${skippedCount} 个, 总计 ${signatures.length} 个`)
      
      if (processedCount === 0) {
        throw new Error('没有成功处理任何签名，请检查签名位置和大小')
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
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

  const clearDate = () => {
    if (dateCanvasRef.current) {
      dateCanvasRef.current.clear()
    }
  }

  // 修复canvas坐标系统
  const fixCanvasCoordinates = useCallback((canvas: HTMLCanvasElement | null): void => {
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    // const dpr = window.devicePixelRatio || 1 // 暂未使用
    
    // 确保canvas的实际尺寸与显示尺寸匹配
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // 保存当前内容
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        
        // 设置新的尺寸
        canvas.width = rect.width
        canvas.height = rect.height
        
        // 恢复内容
        ctx.putImageData(imageData, 0, 0)
      }
    }
  }, [])

  // 当面板打开或笔大小改变时，更新canvas的笔大小
  useEffect(() => {
    if (showSignaturePanel && signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current.getCanvas()
      // @ts-ignore
      fixCanvasCoordinates(canvas)
      
      (signatureCanvasRef.current as any).penColor = '#000000';
      (signatureCanvasRef.current as any).minWidth = penSize;
      (signatureCanvasRef.current as any).maxWidth = penSize
    }
  }, [showSignaturePanel, penSize])

  useEffect(() => {
    if (showDatePanel && dateCanvasRef.current) {
      const canvas = dateCanvasRef.current.getCanvas()
      // @ts-ignore
      fixCanvasCoordinates(canvas)
      
      (dateCanvasRef.current as any).penColor = '#000000';
      (dateCanvasRef.current as any).minWidth = penSize;
      (dateCanvasRef.current as any).maxWidth = penSize
    }
  }, [showDatePanel, penSize])

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
  const _rgbToHex = (r: number, g: number, b: number) => {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }).join('')
  }
  void _rgbToHex // 保留以备将来使用

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
      setBackgroundColor(color)
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
  const _textToImage = async (text: string, fontSize: number = 12, color: string = '#000000'): Promise<string> => {
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
  // 保留函数以备将来使用
  void _textToImage

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
          <div className="canvas-controls">
            <div className="pen-size-control">
              <label className="pen-size-label">
                笔大小: {penSize}px
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={penSize}
                onChange={(e) => {
                  const newSize = parseFloat(e.target.value)
                  setPenSize(newSize)
                  // 实时更新笔大小
                  setTimeout(() => {
                    if (signatureCanvasRef.current) {
                      (signatureCanvasRef.current as any).penColor = '#000000';
                      (signatureCanvasRef.current as any).minWidth = newSize;
                      (signatureCanvasRef.current as any).maxWidth = newSize
                    }
                  }, 0)
                }}
                className="pen-size-slider"
              />
            </div>
          </div>
          <div className="signature-canvas-wrapper" style={{ width: '600px', height: '250px' }}>
            <SignatureCanvas
              ref={signatureCanvasRef}
              penColor="#000000"
              minWidth={penSize}
              maxWidth={penSize}
              velocityFilterWeight={0.7}
              canvasProps={{
                className: 'signature-canvas',
                width: 600,
                height: 250,
                style: {
                  touchAction: 'none',
                  display: 'block',
                  width: '600px',
                  height: '250px',
                  margin: 0,
                  padding: 0,
                },
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
            <h3>手写日期</h3>
            <button className="panel-close" onClick={() => setShowDatePanel(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="canvas-controls">
            <div className="pen-size-control">
              <label className="pen-size-label">
                笔大小: {penSize}px
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={penSize}
                onChange={(e) => {
                  const newSize = parseFloat(e.target.value)
                  setPenSize(newSize)
                  // 实时更新笔大小
                  setTimeout(() => {
                    if (dateCanvasRef.current) {
                      (dateCanvasRef.current as any).penColor = '#000000';
                      (dateCanvasRef.current as any).minWidth = newSize;
                      (dateCanvasRef.current as any).maxWidth = newSize
                    }
                  }, 0)
                }}
                className="pen-size-slider"
              />
            </div>
          </div>
          <div className="signature-canvas-wrapper" style={{ width: '600px', height: '180px' }}>
            <SignatureCanvas
              ref={dateCanvasRef}
              penColor="#000000"
              minWidth={penSize}
              maxWidth={penSize}
              velocityFilterWeight={0.7}
              canvasProps={{
                className: 'signature-canvas',
                width: 600,
                height: 180,
                style: {
                  touchAction: 'none',
                  display: 'block',
                  width: '600px',
                  height: '180px',
                  margin: 0,
                  padding: 0,
                },
              }}
            />
          </div>
          <div className="panel-actions">
            <button className="action-button secondary" onClick={clearDate}>
              清除
            </button>
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
              <canvas
                ref={canvasRef}
                className="pdf-canvas"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  display: 'block',
                  margin: '0 auto',
                }}
              />
              <div className="pdf-overlay" style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${canvasSize.width}px`,
                height: `${canvasSize.height}px`,
                pointerEvents: 'none',
              }}>
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
                ) : sig.type === 'date' && sig.data ? (
                  <img src={sig.data} alt="日期" className="signature-image" />
                ) : null}
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

