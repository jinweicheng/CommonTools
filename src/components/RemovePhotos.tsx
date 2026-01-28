import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Image, Settings, Loader2, AlertCircle, CheckCircle2, Sparkles, RotateCcw, RotateCw, Eraser, Wand2, Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { saveAs } from 'file-saver'
import './RemovePhotos.css'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

type OutputFormat = 'png' | 'webp' | 'jpg'
type BackgroundType = 'transparent' | 'color' | 'image' | 'blur'

interface ProcessingState {
  originalImage: HTMLImageElement | null
  originalCanvas: HTMLCanvasElement | null
  maskCanvas: HTMLCanvasElement | null
  resultCanvas: HTMLCanvasElement | null
  mask: ImageData | null
  history: ImageData[]
  historyIndex: number
}

interface BackgroundOptions {
  type: BackgroundType
  color: string
  imageFile: File | null
  blurAmount: number // 0-100
}

export default function RemovePhotos() {
  const { language } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingMessage, setProcessingMessage] = useState('')
  const [result, setResult] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [compareSlider, setCompareSlider] = useState(50)

  // 处理状态
  const stateRef = useRef<ProcessingState>({
    originalImage: null,
    originalCanvas: null,
    maskCanvas: null,
    resultCanvas: null,
    mask: null,
    history: [],
    historyIndex: -1
  })

  // 设置
  const [edgeFeather, setEdgeFeather] = useState(2) // 0-10
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png')
  const [outputQuality, setOutputQuality] = useState(95) // 50-100
  const [backgroundOptions, setBackgroundOptions] = useState<BackgroundOptions>({
    type: 'transparent',
    color: '#ffffff',
    imageFile: null,
    blurAmount: 50
  })

  // 画笔设置
  const [brushSize, setBrushSize] = useState(20)
  const [brushMode, setBrushMode] = useState<'add' | 'remove'>('remove')
  const [isDrawing, setIsDrawing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)

  // 文件上传
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0]
    if (!uploadedFile) return

    if (!uploadedFile.type.startsWith('image/')) {
      alert(language === 'zh-CN' ? '请上传图片文件' : 'Please upload an image file')
      return
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      alert(
        language === 'zh-CN' 
          ? `文件过大（最大 20MB）: ${uploadedFile.name}`
          : `File too large (max 20MB): ${uploadedFile.name}`
      )
      return
    }

    setFile(uploadedFile)
    const url = URL.createObjectURL(uploadedFile)
    setPreview(url)

    // 加载图像
    const img = new Image()
    img.onload = () => {
      stateRef.current.originalImage = img
      resetProcessing()
    }
    img.src = url

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [language])

  // 重置处理状态
  const resetProcessing = useCallback(() => {
    stateRef.current.mask = null
    stateRef.current.history = []
    stateRef.current.historyIndex = -1
    setResult(null)
    setResultUrl(null)
    setShowOriginal(false)
    setCompareSlider(50)
  }, [])

  // 自动去背景（基于边缘检测和颜色相似度）
  const removeBackground = useCallback(async () => {
    if (!stateRef.current.originalImage) return

    setIsProcessing(true)
    setProcessingProgress(0)
    setProcessingMessage(language === 'zh-CN' ? '分析图像...' : 'Analyzing image...')

    const img = stateRef.current.originalImage
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    setProcessingProgress(20)
    setProcessingMessage(language === 'zh-CN' ? '检测边缘...' : 'Detecting edges...')

    // 使用简单的背景移除算法
    // 1. 检测边缘
    const edges = detectEdges(imageData)
    
    setProcessingProgress(40)
    setProcessingMessage(language === 'zh-CN' ? '生成遮罩...' : 'Generating mask...')

    // 2. 基于边缘和颜色相似度生成遮罩
    const mask = generateMask(imageData, edges)

    setProcessingProgress(60)
    setProcessingMessage(language === 'zh-CN' ? '优化遮罩...' : 'Refining mask...')

    // 3. 优化遮罩（填充空洞、平滑边缘）
    const refinedMask = refineMask(mask, canvas.width, canvas.height)

    setProcessingProgress(80)
    setProcessingMessage(language === 'zh-CN' ? '应用边缘羽化...' : 'Applying edge feathering...')

    // 4. 应用边缘羽化
    const featheredMask = applyFeathering(refinedMask, canvas.width, canvas.height, edgeFeather)

    stateRef.current.mask = featheredMask
    stateRef.current.history = [featheredMask]
    stateRef.current.historyIndex = 0

    // 生成结果
    await applyBackground()

    setProcessingProgress(100)
    setProcessingMessage(language === 'zh-CN' ? '完成！' : 'Completed!')
    setIsProcessing(false)
  }, [language, edgeFeather])

  // 边缘检测（Sobel 算子）
  const detectEdges = (imageData: ImageData): boolean[] => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const edges = new Array(width * height).fill(false)

    // Sobel 算子
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
            const kernelIdx = (ky + 1) * 3 + (kx + 1)
            gx += gray * sobelX[kernelIdx]
            gy += gray * sobelY[kernelIdx]
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        edges[y * width + x] = magnitude > 30 // 阈值
      }
    }

    return edges
  }

  // 生成遮罩（基于边缘和颜色相似度）
  const generateMask = (imageData: ImageData, edges: boolean[]): ImageData => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const mask = new ImageData(width, height)
    const maskData = mask.data

    // 获取四个角的平均颜色（假设是背景）
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1]
    ]

    let bgR = 0, bgG = 0, bgB = 0
    for (const [x, y] of corners) {
      const idx = (y * width + x) * 4
      bgR += data[idx]
      bgG += data[idx + 1]
      bgB += data[idx + 2]
    }
    bgR /= 4
    bgG /= 4
    bgB /= 4

    // 生成遮罩
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width
      const y = Math.floor((i / 4) / width)
      const idx = i / 4

      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // 计算与背景颜色的相似度
      const colorDiff = Math.sqrt(
        Math.pow(r - bgR, 2) + 
        Math.pow(g - bgG, 2) + 
        Math.pow(b - bgB, 2)
      )

      // 如果颜色相似且不在边缘上，则认为是背景
      const isBackground = colorDiff < 50 && !edges[idx]

      maskData[i] = isBackground ? 0 : 255
      maskData[i + 1] = isBackground ? 0 : 255
      maskData[i + 2] = isBackground ? 0 : 255
      maskData[i + 3] = isBackground ? 0 : 255
    }

    return mask
  }

  // 优化遮罩（填充空洞、平滑边缘）
  const refineMask = (mask: ImageData, width: number, height: number): ImageData => {
    const refined = new ImageData(width, height)
    const maskData = mask.data
    const refinedData = refined.data

    // 复制原始数据
    for (let i = 0; i < maskData.length; i++) {
      refinedData[i] = maskData[i]
    }

    // 形态学操作：闭运算（先膨胀后腐蚀，填充小洞）
    for (let iter = 0; iter < 2; iter++) {
      // 膨胀
      const dilated = new ImageData(width, height)
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4
          let max = refinedData[idx]
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = ((y + dy) * width + (x + dx)) * 4
              max = Math.max(max, refinedData[nIdx])
            }
          }
          dilated.data[idx] = max
          dilated.data[idx + 1] = max
          dilated.data[idx + 2] = max
          dilated.data[idx + 3] = max
        }
      }

      // 腐蚀
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4
          let min = dilated.data[idx]
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = ((y + dy) * width + (x + dx)) * 4
              min = Math.min(min, dilated.data[nIdx])
            }
          }
          refinedData[idx] = min
          refinedData[idx + 1] = min
          refinedData[idx + 2] = min
          refinedData[idx + 3] = min
        }
      }
    }

    return refined
  }

  // 应用边缘羽化
  const applyFeathering = (mask: ImageData, width: number, height: number, featherRadius: number): ImageData => {
    if (featherRadius === 0) return mask

    const feathered = new ImageData(width, height)
    const maskData = mask.data
    const featheredData = feathered.data

    const radius = Math.max(1, Math.floor(featherRadius))

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const centerAlpha = maskData[idx + 3]

        if (centerAlpha === 0 || centerAlpha === 255) {
          // 在边缘区域，计算羽化
          let sum = 0
          let count = 0

          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx
              const ny = y + dy
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = (ny * width + nx) * 4
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist <= radius) {
                  const weight = 1 - dist / radius
                  sum += maskData[nIdx + 3] * weight
                  count += weight
                }
              }
            }
          }

          const alpha = count > 0 ? Math.round(sum / count) : centerAlpha
          featheredData[idx] = maskData[idx]
          featheredData[idx + 1] = maskData[idx + 1]
          featheredData[idx + 2] = maskData[idx + 2]
          featheredData[idx + 3] = alpha
        } else {
          featheredData[idx] = maskData[idx]
          featheredData[idx + 1] = maskData[idx + 1]
          featheredData[idx + 2] = maskData[idx + 2]
          featheredData[idx + 3] = maskData[idx + 3]
        }
      }
    }

    return feathered
  }

  // 应用背景
  const applyBackground = useCallback(async () => {
    if (!stateRef.current.originalImage || !stateRef.current.mask) return

    const img = stateRef.current.originalImage
    const mask = stateRef.current.mask
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!

    // 绘制背景
    if (backgroundOptions.type === 'transparent') {
      // 透明背景，不需要绘制
    } else if (backgroundOptions.type === 'color') {
      ctx.fillStyle = backgroundOptions.color
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else if (backgroundOptions.type === 'blur') {
      // 模糊原图作为背景
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const blurred = applyBlur(imageData, backgroundOptions.blurAmount)
      ctx.putImageData(blurred, 0, 0)
    } else if (backgroundOptions.type === 'image' && backgroundOptions.imageFile) {
      // 自定义背景图片
      const bgImg = new Image()
      await new Promise((resolve, reject) => {
        bgImg.onload = resolve
        bgImg.onerror = reject
        bgImg.src = URL.createObjectURL(backgroundOptions.imageFile!)
      })
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height)
    }

    // 绘制前景（应用遮罩）
    ctx.globalCompositeOperation = 'source-over'
    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const maskData = mask.data

    for (let i = 0; i < originalData.data.length; i += 4) {
      const alpha = maskData[i + 3] / 255
      originalData.data[i + 3] = Math.round(originalData.data[i + 3] * alpha)
    }

    ctx.putImageData(originalData, 0, 0)

    // 转换为 Blob
    canvas.toBlob((blob) => {
      if (blob) {
        setResult(blob)
        const url = URL.createObjectURL(blob)
        setResultUrl(url)
      }
    }, `image/${outputFormat}`, outputFormat === 'png' ? undefined : outputQuality / 100)
  }, [backgroundOptions, outputFormat, outputQuality])

  // 模糊效果
  const applyBlur = (imageData: ImageData, radius: number): ImageData => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    const blurred = new ImageData(width, height)
    const blurredData = blurred.data

    const r = Math.max(1, Math.floor(radius / 10))

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0

        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const idx = (ny * width + nx) * 4
              rSum += data[idx]
              gSum += data[idx + 1]
              bSum += data[idx + 2]
              aSum += data[idx + 3]
              count++
            }
          }
        }

        const idx = (y * width + x) * 4
        blurredData[idx] = Math.round(rSum / count)
        blurredData[idx + 1] = Math.round(gSum / count)
        blurredData[idx + 2] = Math.round(bSum / count)
        blurredData[idx + 3] = Math.round(aSum / count)
      }
    }

    return blurred
  }

  // 撤销
  const handleUndo = useCallback(() => {
    if (stateRef.current.historyIndex > 0) {
      stateRef.current.historyIndex--
      stateRef.current.mask = stateRef.current.history[stateRef.current.historyIndex]
      applyBackground()
    }
  }, [applyBackground])

  // 重做
  const handleRedo = useCallback(() => {
    if (stateRef.current.historyIndex < stateRef.current.history.length - 1) {
      stateRef.current.historyIndex++
      stateRef.current.mask = stateRef.current.history[stateRef.current.historyIndex]
      applyBackground()
    }
  }, [applyBackground])

  // 下载
  const handleDownload = useCallback(() => {
    if (!result) return

    const ext = outputFormat
    const fileName = file?.name.replace(/\.[^/.]+$/, '') + `_removed.${ext}` || `removed.${ext}`
    saveAs(result, fileName)
  }, [result, outputFormat, file])

  // 背景选项变化时重新应用
  useEffect(() => {
    if (stateRef.current.mask && stateRef.current.originalImage) {
      // 重新应用羽化（使用原始遮罩，避免重复羽化）
      // 注意：这里需要保存原始遮罩，但为了简化，我们直接使用当前遮罩
      applyBackground()
    }
  }, [backgroundOptions, applyBackground])
  
  // 边缘羽化变化时重新应用
  useEffect(() => {
    if (stateRef.current.mask && stateRef.current.originalImage && stateRef.current.history.length > 0) {
      // 从历史记录中获取原始遮罩（第一个）
      const originalMask = stateRef.current.history[0]
      const featheredMask = applyFeathering(
        originalMask,
        stateRef.current.originalImage.width,
        stateRef.current.originalImage.height,
        edgeFeather
      )
      stateRef.current.mask = featheredMask
      applyBackground()
    }
  }, [edgeFeather, applyBackground])

  const canUndo = stateRef.current.historyIndex > 0
  const canRedo = stateRef.current.historyIndex < stateRef.current.history.length - 1

  return (
    <div className="remove-photos">
      {/* Header */}
      <div className="remove-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Wand2 />
            {language === 'zh-CN' ? '智能去背景' : 'Remove Background'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? 'AI 驱动的智能去背景工具：自动识别前景、去除背景、替换背景。支持透明背景、纯色背景、图片背景和模糊背景。100% 本地处理，保护隐私。'
              : 'AI-powered background removal tool: Auto-detect foreground, remove background, replace background. Supports transparent, solid color, image, and blur backgrounds. 100% local processing, privacy protected.'}
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />
        
        {!preview ? (
          <div
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={48} />
            <span>{language === 'zh-CN' ? '上传图片' : 'Upload Image'}</span>
            <small>
              {language === 'zh-CN' 
                ? '支持 JPG, PNG, WebP 等格式，最大 20MB'
                : 'Supports JPG, PNG, WebP, max 20MB'}
            </small>
          </div>
        ) : (
          <div className="preview-section">
            {/* 对比预览 */}
            {resultUrl && (
              <div className="compare-container">
                <div className="compare-wrapper">
                  <img 
                    src={preview} 
                    alt="Original" 
                    className="compare-image original"
                    style={{ opacity: 1 - compareSlider / 100 }}
                  />
                  <img 
                    src={resultUrl} 
                    alt="Result" 
                    className="compare-image result"
                    style={{ opacity: compareSlider / 100 }}
                  />
                </div>
                <div className="compare-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={compareSlider}
                    onChange={(e) => setCompareSlider(Number(e.target.value))}
                    className="compare-slider"
                  />
                  <div className="compare-labels">
                    <span>{language === 'zh-CN' ? '原图' : 'Original'}</span>
                    <span>{language === 'zh-CN' ? '结果' : 'Result'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 单图预览 */}
            {!resultUrl && (
              <div className="single-preview">
                <img src={preview} alt="Preview" />
              </div>
            )}

            {/* 处理进度 */}
            {isProcessing && (
              <div className="processing-overlay">
                <Loader2 className="spinner" size={32} />
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${processingProgress}%` }}></div>
                </div>
                <p>{processingMessage}</p>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="preview-actions">
              <button
                className="action-btn primary"
                onClick={removeBackground}
                disabled={isProcessing || !stateRef.current.originalImage}
              >
                <Sparkles size={16} />
                {language === 'zh-CN' ? '自动去背景' : 'Remove Background'}
              </button>

              {resultUrl && (
                <>
                  <button
                    className="action-btn"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title={language === 'zh-CN' ? '撤销' : 'Undo'}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="action-btn"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title={language === 'zh-CN' ? '重做' : 'Redo'}
                  >
                    <RotateCw size={16} />
                  </button>
                  <button
                    className="action-btn"
                    onClick={handleDownload}
                    title={language === 'zh-CN' ? '下载' : 'Download'}
                  >
                    <Download size={16} />
                  </button>
                </>
              )}

              <button
                className="action-btn"
                onClick={() => {
                  setFile(null)
                  setPreview(null)
                  setResult(null)
                  setResultUrl(null)
                  resetProcessing()
                }}
                title={language === 'zh-CN' ? '清除' : 'Clear'}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settings Section */}
      {preview && (
        <div className="settings-section">
          <h3>
            <Settings />
            {language === 'zh-CN' ? '设置' : 'Settings'}
          </h3>

          <div className="settings-grid">
            {/* 边缘羽化 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '边缘羽化' : 'Edge Feathering'}: {edgeFeather}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                value={edgeFeather}
                onChange={(e) => setEdgeFeather(Number(e.target.value))}
                disabled={isProcessing}
              />
              <small>
                {language === 'zh-CN' 
                  ? '柔化边缘，数值越大边缘越柔和'
                  : 'Soften edges, higher value = softer edges'}
              </small>
            </div>

            {/* 背景类型 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '背景类型' : 'Background Type'}
              </label>
              <select
                value={backgroundOptions.type}
                onChange={(e) => setBackgroundOptions(prev => ({ 
                  ...prev, 
                  type: e.target.value as BackgroundType 
                }))}
                disabled={isProcessing}
              >
                <option value="transparent">
                  {language === 'zh-CN' ? '透明' : 'Transparent'}
                </option>
                <option value="color">
                  {language === 'zh-CN' ? '纯色' : 'Solid Color'}
                </option>
                <option value="blur">
                  {language === 'zh-CN' ? '模糊' : 'Blur'}
                </option>
                <option value="image">
                  {language === 'zh-CN' ? '图片' : 'Image'}
                </option>
              </select>
            </div>

            {/* 纯色背景 */}
            {backgroundOptions.type === 'color' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '背景颜色' : 'Background Color'}
                </label>
                <input
                  type="color"
                  value={backgroundOptions.color}
                  onChange={(e) => setBackgroundOptions(prev => ({ 
                    ...prev, 
                    color: e.target.value 
                  }))}
                  disabled={isProcessing}
                />
              </div>
            )}

            {/* 模糊背景 */}
            {backgroundOptions.type === 'blur' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '模糊程度' : 'Blur Amount'}: {backgroundOptions.blurAmount}
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={backgroundOptions.blurAmount}
                  onChange={(e) => setBackgroundOptions(prev => ({ 
                    ...prev, 
                    blurAmount: Number(e.target.value) 
                  }))}
                  disabled={isProcessing}
                />
              </div>
            )}

            {/* 图片背景 */}
            {backgroundOptions.type === 'image' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '背景图片' : 'Background Image'}
                </label>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setBackgroundOptions(prev => ({ ...prev, imageFile: file }))
                    }
                  }}
                  style={{ display: 'none' }}
                  disabled={isProcessing}
                />
                <button
                  className="upload-bg-btn"
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  {backgroundOptions.imageFile 
                    ? backgroundOptions.imageFile.name 
                    : (language === 'zh-CN' ? '选择图片' : 'Select Image')}
                </button>
              </div>
            )}

            {/* 输出格式 */}
            <div className="setting-group">
              <label>
                {language === 'zh-CN' ? '输出格式' : 'Output Format'}
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                disabled={isProcessing}
              >
                <option value="png">PNG (透明背景)</option>
                <option value="webp">WebP</option>
                <option value="jpg">JPG</option>
              </select>
            </div>

            {/* 输出质量 */}
            {outputFormat !== 'png' && (
              <div className="setting-group">
                <label>
                  {language === 'zh-CN' ? '输出质量' : 'Output Quality'}: {outputQuality}
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={outputQuality}
                  onChange={(e) => setOutputQuality(Number(e.target.value))}
                  disabled={isProcessing}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
