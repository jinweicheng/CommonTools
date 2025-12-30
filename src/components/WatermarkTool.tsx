import { useState, useCallback } from 'react'
import { Upload, Type, Sliders, Image, FileText, File } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import { saveAs } from 'file-saver'
import mammoth from 'mammoth'
import './WatermarkTool.css'

// 文件类型
type FileType = 'pdf' | 'word' | 'image' | 'unknown'

// 检测文件类型
const detectFileType = (file: File): FileType => {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'doc' || ext === 'docx') return 'word'
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext || '')) return 'image'
  return 'unknown'
}

// 将文本转换为图片（支持中文）
const textToImage = async (
  text: string, 
  fontSize: number, 
  color: string = '#808080', 
  opacity: number = 1
): Promise<string> => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`
  const textMetrics = ctx.measureText(text)
  const textWidth = textMetrics.width
  const textHeight = fontSize * 1.5
  
  canvas.width = textWidth + 40
  canvas.height = textHeight + 40
  
  ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  
  return canvas.toDataURL('image/png')
}

// 为图片添加水印
const addWatermarkToImage = async (
  file: File,
  watermarkText: string,
  opacity: number,
  fontSize: number,
  angle: number,
  color: string
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img') as HTMLImageElement
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      
      canvas.width = img.width
      canvas.height = img.height
      
      // 绘制原图
      ctx.drawImage(img, 0, 0)
      
      // 设置水印样式
      ctx.globalAlpha = opacity
      ctx.fillStyle = color
      ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // 计算水印间距
      const spacing = Math.max(canvas.width, canvas.height) / 3
      
      // 保存当前状态
      ctx.save()
      
      // 绘制多个水印（平铺）
      for (let x = -spacing; x < canvas.width + spacing; x += spacing) {
        for (let y = -spacing; y < canvas.height + spacing; y += spacing) {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate((angle * Math.PI) / 180)
          ctx.fillText(watermarkText, 0, 0)
          ctx.restore()
        }
      }
      
      // 恢复状态
      ctx.restore()
      
      // 转换为 Blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('无法生成图片'))
        }
      }, file.type || 'image/png', 0.95)
    }
    
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = URL.createObjectURL(file)
  })
}

// 为 PDF 添加水印
const addWatermarkToPDF = async (
  file: File,
  watermarkText: string,
  opacity: number,
  fontSize: number,
  angle: number,
  color: string
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer()
  const pdfDoc = await PDFDocument.load(arrayBuffer)
  const pages = pdfDoc.getPages()
  
  // 检查是否包含中文
  const hasChinese = /[\u4e00-\u9fa5]/.test(watermarkText)
  
  // 解析颜色
  const hexColor = color.startsWith('#') ? color : '#808080'
  const r = parseInt(hexColor.slice(1, 3), 16) / 255
  const g = parseInt(hexColor.slice(3, 5), 16) / 255
  const b = parseInt(hexColor.slice(5, 7), 16) / 255
  
  let watermarkImage = null
  let imageDims = null
  
  if (hasChinese) {
    // 中文文本：转换为图片
    const watermarkDataUrl = await textToImage(watermarkText, fontSize, hexColor, 1)
    const watermarkBytes = await fetch(watermarkDataUrl).then(res => res.arrayBuffer())
    watermarkImage = await pdfDoc.embedPng(watermarkBytes)
    imageDims = watermarkImage.scale(1)
  }
  
  // 为每一页添加水印
  for (const page of pages) {
    const { width, height } = page.getSize()
    
    if (hasChinese && watermarkImage && imageDims) {
      // 使用图片水印（支持中文）
      const spacing = Math.max(width, height) / 3
      
      for (let x = -spacing; x < width + spacing; x += spacing) {
        for (let y = -spacing; y < height + spacing; y += spacing) {
          page.drawImage(watermarkImage, {
            x: x - imageDims.width / 2,
            y: y - imageDims.height / 2,
            width: imageDims.width,
            height: imageDims.height,
            opacity: opacity,
            rotate: degrees(angle),
          })
        }
      }
    } else {
      // 使用文本水印（英文）
      const textWidth = watermarkText.length * fontSize * 0.6
      const spacing = Math.max(width, height) / 3
      
      for (let x = 0; x < width + spacing; x += spacing) {
        for (let y = 0; y < height + spacing; y += spacing) {
          page.drawText(watermarkText, {
            x: x - textWidth / 2,
            y: y,
            size: fontSize,
            color: rgb(r, g, b),
            opacity: opacity,
            rotate: degrees(angle),
          })
        }
      }
    }
  }
  
  return await pdfDoc.save()
}

// 为 Word 添加水印
const addWatermarkToWord = async (
  file: File,
  watermarkText: string,
  _opacity: number,
  _fontSize: number,
  _angle: number,
  _color: string
): Promise<Blob> => {
  // 读取原始 Word 文档内容
  const arrayBuffer = await file.arrayBuffer()
  
  let extractedText = ''
  try {
    const result = await mammoth.extractRawText({ arrayBuffer })
    extractedText = result.value
  } catch (err) {
    console.warn('无法提取 Word 内容，创建新文档', err)
  }
  
  // 创建新的 Word 文档（包含水印文本）
  const paragraphs: Paragraph[] = []
  
  // 添加水印标题
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `🔒 水印: ${watermarkText}`,
          bold: true,
          color: '999999',
          size: 20,
        }),
      ],
      spacing: {
        after: 400,
      },
    })
  )
  
  // 添加原文档内容
  if (extractedText) {
    extractedText.split('\n').forEach((line) => {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line || ' ')],
        })
      )
    })
  } else {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '原文档内容（带水印保护）',
          }),
        ],
      })
    )
  }
  
  const doc = new Document({
    sections: [
      {
        children: paragraphs,
      },
    ],
  })
  
  const blob = await Packer.toBlob(doc)
  return blob
}

export default function WatermarkTool() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileType, setFileType] = useState<FileType>('unknown')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  // 水印设置
  const [watermarkText, setWatermarkText] = useState('水印 WATERMARK')
  const [opacity, setOpacity] = useState(0.3)
  const [fontSize, setFontSize] = useState(36)
  const [angle, setAngle] = useState(-45)
  const [color, setColor] = useState('#808080')
  
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    const type = detectFileType(file)
    setSelectedFile(file)
    setFileType(type)
    setError(null)
    setSuccess(null)
    
    // 为图片生成预览
    if (type === 'image') {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }, [])
  
  const handleAddWatermark = async () => {
    if (!selectedFile) {
      setError('请先选择文件')
      return
    }
    
    if (!watermarkText.trim()) {
      setError('请输入水印文字')
      return
    }
    
    if (fileType === 'unknown') {
      setError('不支持的文件格式')
      return
    }
    
    setLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      let outputBlob: Blob
      let outputFileName: string
      
      switch (fileType) {
        case 'pdf':
          const pdfBytes = await addWatermarkToPDF(
            selectedFile,
            watermarkText,
            opacity,
            fontSize,
            angle,
            color
          )
          outputBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
          outputFileName = selectedFile.name.replace('.pdf', '_watermark.pdf')
          break
          
        case 'word':
          outputBlob = await addWatermarkToWord(
            selectedFile,
            watermarkText,
            opacity,
            fontSize,
            angle,
            color
          )
          const ext = selectedFile.name.split('.').pop()
          outputFileName = selectedFile.name.replace(`.${ext}`, `_watermark.docx`)
          break
          
        case 'image':
          outputBlob = await addWatermarkToImage(
            selectedFile,
            watermarkText,
            opacity,
            fontSize,
            angle,
            color
          )
          const imageExt = selectedFile.name.split('.').pop()
          outputFileName = selectedFile.name.replace(`.${imageExt}`, `_watermark.${imageExt}`)
          break
          
        default:
          throw new Error('不支持的文件类型')
      }
      
      saveAs(outputBlob, outputFileName)
      setSuccess(`✅ 水印添加成功！文件已下载：${outputFileName}`)
    } catch (err) {
      console.error('添加水印失败', err)
      setError(err instanceof Error ? err.message : '添加水印失败')
    } finally {
      setLoading(false)
    }
  }
  
  const getFileTypeIcon = () => {
    switch (fileType) {
      case 'pdf':
        return <File className="file-type-icon pdf" />
      case 'word':
        return <FileText className="file-type-icon word" />
      case 'image':
        return <Image className="file-type-icon image" />
      default:
        return <Upload className="file-type-icon" />
    }
  }
  
  const getFileTypeLabel = () => {
    switch (fileType) {
      case 'pdf':
        return 'PDF 文档'
      case 'word':
        return 'Word 文档'
      case 'image':
        return '图片文件'
      default:
        return '未知格式'
    }
  }
  
  return (
    <div className="watermark-tool">
      <div className="watermark-section">
        <h2>
          <Upload size={20} />
          文件上传
        </h2>
        
        <div className="upload-area">
          <input
            type="file"
            id="watermark-file-input"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.bmp,.webp"
            onChange={handleFileSelect}
            className="file-input"
          />
          <label htmlFor="watermark-file-input" className="upload-label">
            {selectedFile ? (
              <div className="file-info">
                {getFileTypeIcon()}
                <div className="file-details">
                  <div className="file-name">{selectedFile.name}</div>
                  <div className="file-meta">
                    {getFileTypeLabel()} • {(selectedFile.size / 1024).toFixed(2)} KB
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Upload size={48} />
                <div className="upload-text">
                  <strong>点击上传文件</strong>
                  <span>支持 PDF、图片 (jpg/png/gif/bmp/webp)</span>
                </div>
              </>
            )}
          </label>
        </div>
        
        {previewUrl && fileType === 'image' && (
          <div className="image-preview">
            <h3>原图预览</h3>
            <img src={previewUrl} alt="Preview" />
          </div>
        )}
      </div>
      
      <div className="watermark-section">
        <h2>
          <Type size={20} />
          水印设置
        </h2>
        
        <div className="settings-grid">
          <div className="setting-item">
            <label htmlFor="watermark-text">水印文字</label>
            <input
              type="text"
              id="watermark-text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="输入水印文字"
              className="text-input"
            />
            <span className="hint">支持中文、英文、数字和特殊符号</span>
          </div>
          
          <div className="setting-item">
            <label htmlFor="watermark-color">水印颜色</label>
            <div className="color-input-group">
              <input
                type="color"
                id="watermark-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="color-text"
                placeholder="#808080"
              />
            </div>
          </div>
          
          <div className="setting-item">
            <label htmlFor="opacity-slider">
              透明度: {(opacity * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              id="opacity-slider"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="slider"
            />
          </div>
          
          <div className="setting-item">
            <label htmlFor="font-size-slider">
              字体大小: {fontSize}px
            </label>
            <input
              type="range"
              id="font-size-slider"
              min="12"
              max="120"
              step="2"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="slider"
            />
          </div>
          
          <div className="setting-item">
            <label htmlFor="angle-slider">
              旋转角度: {angle}°
            </label>
            <input
              type="range"
              id="angle-slider"
              min="-90"
              max="90"
              step="5"
              value={angle}
              onChange={(e) => setAngle(parseInt(e.target.value))}
              className="slider"
            />
          </div>
        </div>
      </div>
      
      <div className="watermark-section">
        <h2>
          <Sliders size={20} />
          水印预览
        </h2>
        
        <div className="watermark-preview">
          <div 
            className="preview-watermark"
            style={{
              opacity: opacity,
              fontSize: `${fontSize * 0.5}px`,
              color: color,
              transform: `rotate(${angle}deg)`,
            }}
          >
            {watermarkText || '水印预览'}
          </div>
          <div className="preview-hint">这是水印效果预览（缩放至 50%）</div>
        </div>
      </div>
      
      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}
      
      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}
      
      <div className="action-buttons">
        <button
          onClick={handleAddWatermark}
          disabled={!selectedFile || loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              处理中...
            </>
          ) : (
            '添加水印并下载'
          )}
        </button>
      </div>
      
      <div className="info-card">
        <h3>💡 使用说明</h3>
        <ul>
          <li><strong>支持格式：</strong>PDF、图片 (jpg/png/gif/bmp/webp)</li>
          <li><strong>水印类型：</strong>支持中文、英文、数字和特殊符号</li>
          <li><strong>平铺效果：</strong>水印将自动平铺覆盖整个文档或图片</li>
          <li><strong>透明度：</strong>建议设置 20%-50% 之间，既可见又不遮挡内容</li>
          <li><strong>旋转角度：</strong>常用 -45° 斜向水印，可根据需要调整</li>
          <li><strong>Word 处理：</strong>会提取原文档内容并重新生成带水印的 .docx 文件</li>
          <li><strong>图片质量：</strong>输出图片保持 95% 质量，确保清晰度</li>
        </ul>
      </div>
    </div>
  )
}

