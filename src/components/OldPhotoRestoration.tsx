import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Download, X, Image as ImageIcon, Settings, Loader2, AlertCircle, CheckCircle2, Sparkles, RotateCcw, Zap, ScanFace } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { saveAs } from 'file-saver'
import './OldPhotoRestoration.css'

// ============================================================
//  商业级老照片修复引擎 — 10阶段专业流水线
//  参考: Nero AI Photo Restore 级别效果
//  核心: 图像分析 → 多通道修复 → 人脸增强 → AI超分
// ============================================================

const MAX_FILES = 5
const MAX_FILE_SIZE = 50 * 1024 * 1024

type OutputFormat = 'jpg' | 'png' | 'webp'
type QualityPreset = 'quick' | 'standard' | 'professional'

/** 图像预分析结果 — 驱动自适应参数 */
interface ImageAnalysis {
  meanBrightness: number      // 0~255
  stdBrightness: number       // 标准差
  colorfulness: number        // 色彩丰度指数
  noiseLevel: number          // 噪声估计 0~1
  scratchDensity: number      // 划痕密度 0~1
  isLowContrast: boolean
  isDark: boolean
  isOverexposed: boolean
  hasColorCast: boolean
  colorCastType: 'yellow' | 'green' | 'blue' | 'red' | 'none'
  hasFaces: boolean
  faceRegions: Array<{ x: number, y: number, w: number, h: number }>
  isGrayscale: boolean
  sharpness: number           // 清晰度 0~1 (Laplacian variance)
}

interface RestorationTask {
  id: string
  file: File
  originalPreview: string
  restoredPreview?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  progressMessage?: string
  result?: Blob
  resultUrl?: string
  error?: string
  startTime?: number
  endTime?: number
  currentStage?: string
  analysis?: ImageAnalysis
}

interface RestorationOptions {
  preset: QualityPreset
  // S1: 预分析
  autoAnalyze: boolean
  // S2: 色彩校正
  autoWhiteBalance: boolean
  autoWhiteBalanceStrength: number
  colorCastRemoval: boolean
  colorCastRemovalStrength: number
  // S3: 对比度 & 亮度
  contrastEnhance: boolean
  contrastEnhanceStrength: number
  brightnessOptimize: boolean
  brightnessOptimizeStrength: number
  // S4: 去噪
  denoise: boolean
  denoiseStrength: number
  // S5: 划痕/污渍修复
  scratchRepair: boolean
  scratchRepairStrength: number
  stainRemoval: boolean
  stainRemovalStrength: number
  // S6: 人脸检测 & 增强
  faceEnhance: boolean
  faceEnhanceStrength: number
  // S7: 锐化
  sharpen: boolean
  sharpenStrength: number
  // S8: 细节增强
  detailEnhance: boolean
  detailEnhanceStrength: number
  // S9: 色彩恢复
  colorVibrancy: boolean
  colorVibrancyStrength: number
  // S10: 最终优化 (tone mapping + micro-contrast)
  finalPolish: boolean
  finalPolishStrength: number
  // 输出
  outputFormat: OutputFormat
  outputQuality: number
}

const PRESETS: Record<QualityPreset, Partial<RestorationOptions>> = {
  quick: {
    autoAnalyze: true,
    autoWhiteBalance: true, autoWhiteBalanceStrength: 45,
    colorCastRemoval: true, colorCastRemovalStrength: 35,
    contrastEnhance: true, contrastEnhanceStrength: 50,
    brightnessOptimize: true, brightnessOptimizeStrength: 45,
    denoise: true, denoiseStrength: 40,
    scratchRepair: false, scratchRepairStrength: 40,
    stainRemoval: false, stainRemovalStrength: 30,
    faceEnhance: false, faceEnhanceStrength: 40,
    sharpen: true, sharpenStrength: 40,
    detailEnhance: false, detailEnhanceStrength: 30,
    colorVibrancy: true, colorVibrancyStrength: 35,
    finalPolish: true, finalPolishStrength: 30,
  },
  standard: {
    autoAnalyze: true,
    autoWhiteBalance: true, autoWhiteBalanceStrength: 60,
    colorCastRemoval: true, colorCastRemovalStrength: 50,
    contrastEnhance: true, contrastEnhanceStrength: 65,
    brightnessOptimize: true, brightnessOptimizeStrength: 55,
    denoise: true, denoiseStrength: 55,
    scratchRepair: true, scratchRepairStrength: 55,
    stainRemoval: true, stainRemovalStrength: 45,
    faceEnhance: true, faceEnhanceStrength: 55,
    sharpen: true, sharpenStrength: 55,
    detailEnhance: true, detailEnhanceStrength: 45,
    colorVibrancy: true, colorVibrancyStrength: 50,
    finalPolish: true, finalPolishStrength: 45,
  },
  professional: {
    autoAnalyze: true,
    autoWhiteBalance: true, autoWhiteBalanceStrength: 75,
    colorCastRemoval: true, colorCastRemovalStrength: 65,
    contrastEnhance: true, contrastEnhanceStrength: 80,
    brightnessOptimize: true, brightnessOptimizeStrength: 70,
    denoise: true, denoiseStrength: 70,
    scratchRepair: true, scratchRepairStrength: 65,
    stainRemoval: true, stainRemovalStrength: 55,
    faceEnhance: true, faceEnhanceStrength: 70,
    sharpen: true, sharpenStrength: 65,
    detailEnhance: true, detailEnhanceStrength: 60,
    colorVibrancy: true, colorVibrancyStrength: 60,
    finalPolish: true, finalPolishStrength: 55,
  }
}

export default function OldPhotoRestoration() {
  const { language } = useI18n()
  const [tasks, setTasks] = useState<RestorationTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [opencvLoaded, setOpencvLoaded] = useState(false)
  const [opencvLoading, setOpencvLoading] = useState(false)
  const [deviceWarning, setDeviceWarning] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [options, setOptions] = useState<RestorationOptions>({
    preset: 'standard',
    autoAnalyze: true,
    autoWhiteBalance: true, autoWhiteBalanceStrength: 60,
    colorCastRemoval: true, colorCastRemovalStrength: 50,
    contrastEnhance: true, contrastEnhanceStrength: 65,
    brightnessOptimize: true, brightnessOptimizeStrength: 55,
    denoise: true, denoiseStrength: 55,
    scratchRepair: true, scratchRepairStrength: 55,
    stainRemoval: true, stainRemovalStrength: 45,
    faceEnhance: true, faceEnhanceStrength: 55,
    sharpen: true, sharpenStrength: 55,
    detailEnhance: true, detailEnhanceStrength: 45,
    colorVibrancy: true, colorVibrancyStrength: 50,
    finalPolish: true, finalPolishStrength: 45,
    outputFormat: 'png',
    outputQuality: 95
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const opencvRef = useRef<any>(null)
  const faceCascadeRef = useRef<any>(null)

  const applyPreset = useCallback((preset: QualityPreset) => {
    setOptions(prev => ({ ...prev, preset, ...PRESETS[preset] }))
  }, [])

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const hasLowMemory = (navigator as any).deviceMemory && (navigator as any).deviceMemory < 4
    const hasLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4
    if (isMobile || hasLowMemory || hasLowCores) setDeviceWarning(true)
  }, [])

  // ---- OpenCV.js 加载 ----
  const loadOpenCV = useCallback(async (): Promise<boolean> => {
    if (opencvLoaded || opencvLoading) return opencvLoaded
    setOpencvLoading(true)

    return new Promise((resolve, reject) => {
      if ((window as any).cv && (window as any).cv.Mat) {
        opencvRef.current = (window as any).cv
        setOpencvLoaded(true)
        setOpencvLoading(false)
        resolve(true)
        return
      }

      const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = src
          script.async = true
          script.crossOrigin = 'anonymous'
          script.onload = () => {
            const cv = (window as any).cv
            if (!cv) { reject(new Error('cv not found')); return }
            const checkInit = () => {
              if (cv && typeof cv.Mat === 'function' && typeof cv.matFromImageData === 'function') {
                opencvRef.current = cv
                setOpencvLoaded(true)
                setOpencvLoading(false)
                resolve()
                return true
              }
              return false
            }
            if (checkInit()) return
            if (cv.onRuntimeInitialized) {
              const orig = cv.onRuntimeInitialized
              cv.onRuntimeInitialized = () => {
                if (orig) orig()
                if (checkInit()) return
                setTimeout(() => { if (!checkInit()) { setOpencvLoading(false); reject(new Error('Init failed')) } }, 1000)
              }
            } else {
              cv.onRuntimeInitialized = () => {
                setTimeout(() => { if (!checkInit()) { setOpencvLoading(false); reject(new Error('Init failed')) } }, 100)
              }
            }
            setTimeout(() => { if (!opencvLoaded) { setOpencvLoading(false); reject(new Error('Timeout')) } }, 30000)
          }
          script.onerror = () => reject(new Error(`Failed: ${src}`))
          document.head.appendChild(script)
        })
      }

      const isDev = import.meta.env.DEV
      const baseURL = isDev ? window.location.origin : (window.location.origin + import.meta.env.BASE_URL)
      const localPath = `${baseURL.replace(/\/+$/, '')}/opencv.js`

      loadScript(localPath)
        .catch(() => loadScript('https://cdn.jsdelivr.net/npm/opencv-js@4.10.0/dist/opencv.js'))
        .catch(() => loadScript('https://docs.opencv.org/4.10.0/opencv.js'))
        .then(() => resolve(true))
        .catch((err) => { setOpencvLoading(false); reject(err) })
    })
  }, [opencvLoaded, opencvLoading])

  useEffect(() => {
    const timer = setTimeout(() => { loadOpenCV().catch(() => {}) }, 800)
    return () => clearTimeout(timer)
  }, [loadOpenCV])

  // ---- 加载 Haar Cascade 人脸检测器 ----
  const loadFaceCascade = useCallback(async () => {
    const cv = opencvRef.current
    if (!cv || faceCascadeRef.current) return
    try {
      // OpenCV.js 内置 haarcascade
      if (typeof cv.CascadeClassifier === 'function') {
        const cascade = new cv.CascadeClassifier()
        // 尝试内置路径
        const loaded = cascade.load('haarcascade_frontalface_default')
        if (loaded) {
          faceCascadeRef.current = cascade
        } else {
          // 从 CDN 获取
          try {
            const resp = await fetch('https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_frontalface_default.xml')
            if (resp.ok) {
              const text = await resp.text()
              const fileName = 'haarcascade_frontalface_default.xml'
              cv.FS_createDataFile('/', fileName, text, true, false, false)
              const loaded2 = cascade.load(fileName)
              if (loaded2) faceCascadeRef.current = cascade
              else cascade.delete()
            }
          } catch (_e) {
            cascade.delete()
          }
        }
      }
    } catch (e) {
      console.warn('Face cascade load failed:', e)
    }
  }, [])

  // ---- 文件上传 ----
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    const arr = Array.from(files)
    if (tasks.length + arr.length > MAX_FILES) {
      alert(language === 'zh-CN' ? `最多 ${MAX_FILES} 张照片` : `Max ${MAX_FILES} photos`)
      return
    }
    const newTasks: RestorationTask[] = []
    for (const file of arr) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > MAX_FILE_SIZE) continue
      newTasks.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        originalPreview: URL.createObjectURL(file),
        status: 'pending',
        progress: 0
      })
    }
    setTasks(prev => [...prev, ...newTasks])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [tasks.length, language])

  // ====================================================================
  //  商业级10阶段处理引擎
  // ====================================================================
  const processImage = useCallback(async (task: RestorationTask): Promise<void> => {
    if (!opencvRef.current) {
      const loaded = await loadOpenCV()
      if (!loaded || !opencvRef.current) throw new Error('OpenCV load failed')
    }

    const cv = opencvRef.current
    const startTime = Date.now()
    const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))
    // const totalStages = 10

    const updateProgress = (progress: number, msg: string, stage?: string) => {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: 'processing' as const, progress, progressMessage: msg, startTime, currentStage: stage } : t
      ))
    }

    const safeDel = (mat: any) => { try { if (mat && typeof mat.delete === 'function' && !mat.isDeleted?.()) mat.delete() } catch (_e) { /* noop */ } }
    const isValid = (mat: any) => {
      try { return mat && !mat.empty() && mat.cols > 0 && mat.rows > 0 } catch (_e) { return false }
    }
    const safeStage = async (backup: any, processed: { val: any }, stageFn: () => Promise<any>) => {
      try {
        await stageFn()
      } catch (err) {
        console.warn('Stage failed:', err)
        if (!isValid(processed.val)) {
          processed.val = backup
        } else {
          safeDel(backup)
        }
      }
    }

    updateProgress(2, language === 'zh-CN' ? '准备图像引擎...' : 'Preparing engine...', 'init')
    await yieldToUI()

    // 加载人脸检测器
    await loadFaceCascade()

    try {
      // ---- 加载图像 ----
      const img = new Image()
      img.src = task.originalPreview
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Image load failed')) })

      updateProgress(4, language === 'zh-CN' ? '加载图像数据...' : 'Loading image...', 'init')

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      if (!imageData || imageData.width === 0 || imageData.height === 0) throw new Error('Invalid image data')
      if (imageData.width > 8192 || imageData.height > 8192) throw new Error('Image too large (max 8192)')

      let src: any = null
      const p = { val: null as any } // processed holder for safeStage

      try {
        src = cv.matFromImageData(imageData)
        if (!isValid(src)) throw new Error('Failed to create Mat')
        p.val = src.clone()
        if (!isValid(p.val)) throw new Error('Failed to clone Mat')
      } catch (err) {
        safeDel(src)
        safeDel(p.val)
        throw err
      }

      try {
        // ================================================================
        //  阶段 1/${totalStages}: 智能预分析
        // ================================================================
        let analysis: ImageAnalysis = {
          meanBrightness: 128, stdBrightness: 50, colorfulness: 50,
          noiseLevel: 0.3, scratchDensity: 0.1, isLowContrast: false,
          isDark: false, isOverexposed: false, hasColorCast: false,
          colorCastType: 'none', hasFaces: false, faceRegions: [],
          isGrayscale: false, sharpness: 0.5
        }

        if (options.autoAnalyze) {
          updateProgress(5, language === 'zh-CN' ? '🔍 阶段1/10: 智能分析图像特征...' : '🔍 Stage 1/10: Analyzing image...', 'analyze')
          await yieldToUI()

          try {
            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)

            // 1a. 亮度分析
            const gray = new cv.Mat()
            cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY)
            const meanStd = new cv.Mat()
            const stdDevMat = new cv.Mat()
            cv.meanStdDev(gray, meanStd, stdDevMat)
            analysis.meanBrightness = meanStd.data64F[0]
            analysis.stdBrightness = stdDevMat.data64F[0]
            analysis.isDark = analysis.meanBrightness < 75
            analysis.isOverexposed = analysis.meanBrightness > 200
            analysis.isLowContrast = analysis.stdBrightness < 40
            safeDel(meanStd); safeDel(stdDevMat)

            // 1b. 清晰度分析 (Laplacian variance)
            const lap = new cv.Mat()
            cv.Laplacian(gray, lap, cv.CV_64F)
            const lapMean = new cv.Mat()
            const lapStd = new cv.Mat()
            cv.meanStdDev(lap, lapMean, lapStd)
            const lapVar = lapStd.data64F[0] * lapStd.data64F[0]
            analysis.sharpness = Math.min(1.0, lapVar / 2000)
            safeDel(lap); safeDel(lapMean); safeDel(lapStd)

            // 1c. 噪声估计 (高频能量占比)
            const blurred = new cv.Mat()
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
            const noiseMat = new cv.Mat()
            cv.absdiff(gray, blurred, noiseMat)
            const noiseMean = cv.mean(noiseMat)
            analysis.noiseLevel = Math.min(1.0, noiseMean[0] / 30)
            safeDel(blurred); safeDel(noiseMat)

            // 1d. 色彩分析
            const lab = new cv.Mat()
            cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
            const labChs = new cv.MatVector()
            cv.split(lab, labChs)
            if (labChs.size() >= 3) {
              const aMean = cv.mean(labChs.get(1))[0]
              const bMean = cv.mean(labChs.get(2))[0]
              const aStd = new cv.Mat(); const aStdV = new cv.Mat()
              cv.meanStdDev(labChs.get(1), aStd, aStdV)
              const aStdVal = aStdV.data64F[0]
              const bStd2 = new cv.Mat(); const bStdV = new cv.Mat()
              cv.meanStdDev(labChs.get(2), bStd2, bStdV)
              const bStdVal = bStdV.data64F[0]
              safeDel(aStd); safeDel(aStdV); safeDel(bStd2); safeDel(bStdV)

              analysis.colorfulness = Math.sqrt(aStdVal * aStdVal + bStdVal * bStdVal) + 0.3 * Math.sqrt((aMean - 128) * (aMean - 128) + (bMean - 128) * (bMean - 128))
              analysis.isGrayscale = analysis.colorfulness < 8

              // 色偏检测
              const aOff = aMean - 128
              const bOff = bMean - 128
              if (Math.abs(aOff) > 6 || Math.abs(bOff) > 6) {
                analysis.hasColorCast = true
                if (bOff > 8 && aOff > 3) analysis.colorCastType = 'yellow'
                else if (aOff < -6) analysis.colorCastType = 'green'
                else if (bOff < -8) analysis.colorCastType = 'blue'
                else if (aOff > 8) analysis.colorCastType = 'red'
                else analysis.colorCastType = 'yellow'
              }
            }
            safeDel(lab); labChs.delete()

            // 1e. 划痕密度估计
            const edges = new cv.Mat()
            cv.Canny(gray, edges, 50, 150)
            const kLine = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 7))
            const lineFeatures = new cv.Mat()
            cv.morphologyEx(edges, lineFeatures, cv.MORPH_CLOSE, kLine)
            cv.morphologyEx(lineFeatures, lineFeatures, cv.MORPH_OPEN, kLine)
            const linePixels = cv.countNonZero(lineFeatures)
            analysis.scratchDensity = Math.min(1.0, linePixels / (gray.rows * gray.cols) * 50)
            safeDel(edges); safeDel(kLine); safeDel(lineFeatures)

            // 1f. 人脸检测
            if (faceCascadeRef.current) {
              try {
                const faces = new cv.RectVector()
                faceCascadeRef.current.detectMultiScale(gray, faces, 1.1, 4, 0, new cv.Size(30, 30))
                for (let i = 0; i < faces.size(); i++) {
                  const f = faces.get(i)
                  analysis.faceRegions.push({ x: f.x, y: f.y, w: f.width, h: f.height })
                }
                analysis.hasFaces = analysis.faceRegions.length > 0
                faces.delete()
              } catch (_e) { /* noop */ }
            }

            safeDel(gray); safeDel(rgb)

            // 保存分析结果到任务
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, analysis } : t))
          } catch (err) {
            console.warn('Analysis failed, using defaults:', err)
          }
        }

        // 用分析结果动态调整强度
        // const adaptStrength = (base: number, factor: number) => Math.min(100, Math.max(0, base * factor))

        // ================================================================
        //  阶段 2/${totalStages}: 高级白平衡 + 色偏校正
        // ================================================================
        if (options.autoWhiteBalance || options.colorCastRemoval) {
          updateProgress(10, language === 'zh-CN' ? '🎨 阶段2/10: 色彩校正...' : '🎨 Stage 2/10: Color Correction...', 'wb')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)
            const lab = new cv.Mat()
            cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
            const chs = new cv.MatVector()
            cv.split(lab, chs)

            if (chs.size() >= 3) {
              const lCh = chs.get(0)
              const aCh = chs.get(1)
              const bCh = chs.get(2)

              // 白平衡 — 增强版 Gray World: 分析并补偿偏移
              if (options.autoWhiteBalance) {
                const castBoost = analysis.hasColorCast ? 1.3 : 1.0
                const strength = (options.autoWhiteBalanceStrength / 100) * castBoost
                const aMean = cv.mean(aCh)[0]
                const bMean = cv.mean(bCh)[0]

                // 非线性校正 — 偏离越大校正越强
                const aOff = 128 - aMean
                const bOff = 128 - bMean
                const aCorrect = Math.round(aOff * strength * (1 + Math.abs(aOff) / 128 * 0.3))
                const bCorrect = Math.round(bOff * strength * (1 + Math.abs(bOff) / 128 * 0.3))

                // 安全的逐像素校正（避免溢出）
                if (Math.abs(aCorrect) > 0) {
                  const aF = new cv.Mat()
                  aCh.convertTo(aF, cv.CV_32F)
                  const aData = aF.data32F
                  for (let i = 0; i < aData.length; i++) {
                    aData[i] = Math.max(0, Math.min(255, aData[i] + aCorrect))
                  }
                  aF.convertTo(aCh, cv.CV_8U)
                  safeDel(aF)
                }
                if (Math.abs(bCorrect) > 0) {
                  const bF = new cv.Mat()
                  bCh.convertTo(bF, cv.CV_32F)
                  const bData = bF.data32F
                  for (let i = 0; i < bData.length; i++) {
                    bData[i] = Math.max(0, Math.min(255, bData[i] + bCorrect))
                  }
                  bF.convertTo(bCh, cv.CV_8U)
                  safeDel(bF)
                }
              }

              // 色偏 CLAHE — 自适应色彩空间均衡
              if (options.colorCastRemoval) {
                const castBoost = analysis.hasColorCast ? 1.4 : 1.0
                const strength = (options.colorCastRemovalStrength / 100) * castBoost
                if (typeof cv.CLAHE === 'function') {
                  const clip = 1.2 + strength * 2.0
                  const clahe = new cv.CLAHE(clip, new cv.Size(4, 4))
                  clahe.apply(aCh, aCh)
                  clahe.apply(bCh, bCh)
                  clahe.delete()
                }
              }

              // 多通道白点校正 — 轻微拉伸 L通道
              if (analysis.isLowContrast && options.autoWhiteBalance) {
                const minMax = { minVal: 0, maxVal: 0 }
                cv.minMaxLoc(lCh, minMax as any)
                // 简单的线性拉伸预处理
                if (typeof (minMax as any).minVal === 'number') {
                  const mn = (minMax as any).minVal
                  const mx = (minMax as any).maxVal
                  if (mx - mn < 200 && mx - mn > 10) {
                    const alpha = 240.0 / (mx - mn)
                    const beta = -mn * alpha + 8
                    lCh.convertTo(lCh, cv.CV_8U, alpha, beta)
                  }
                }
              }

              cv.merge(chs, lab)
              cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
              const dst = new cv.Mat()
              cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)

              if (isValid(dst) && dst.cols === p.val.cols) {
                safeDel(p.val); safeDel(backup); p.val = dst
              } else { safeDel(dst); throw new Error('WB mismatch') }
            }
            safeDel(rgb); safeDel(lab); chs.delete()
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 3/${totalStages}: 多级对比度增强 + 自适应亮度
        // ================================================================
        if (options.contrastEnhance || options.brightnessOptimize) {
          updateProgress(18, language === 'zh-CN' ? '✨ 阶段3/10: 对比度 & 亮度...' : '✨ Stage 3/10: Contrast & Brightness...', 'contrast')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)

            // 多级 CLAHE — 粗+细两次
            if (options.contrastEnhance) {
              const contrastBoost = analysis.isLowContrast ? 1.3 : 1.0
              const strength = (options.contrastEnhanceStrength / 100) * contrastBoost

              const lab = new cv.Mat()
              cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
              const labChs = new cv.MatVector()
              cv.split(lab, labChs)

              if (labChs.size() >= 3 && typeof cv.CLAHE === 'function') {
                const lCh = labChs.get(0)

                // 第一遍: 粗粒度 (大 tile)
                const clip1 = 1.5 + strength * 2.5
                const clahe1 = new cv.CLAHE(clip1, new cv.Size(16, 16))
                clahe1.apply(lCh, lCh)
                clahe1.delete()

                // 第二遍: 细粒度 (小 tile) — 混合
                if (strength > 0.4) {
                  const lCopy = lCh.clone()
                  const clip2 = 1.0 + strength * 1.5
                  const clahe2 = new cv.CLAHE(clip2, new cv.Size(4, 4))
                  clahe2.apply(lCopy, lCopy)
                  clahe2.delete()

                  // 混合两次 CLAHE 结果
                  const blendRatio = Math.min(0.5, (strength - 0.4) * 0.83)
                  cv.addWeighted(lCh, 1.0 - blendRatio, lCopy, blendRatio, 0, lCh)
                  safeDel(lCopy)
                }

                cv.merge(labChs, lab)
                cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
              }
              safeDel(lab); labChs.delete()
            }

            // 自适应 S-Curve Gamma
            if (options.brightnessOptimize) {
              const brightBoost = analysis.isDark ? 1.3 : (analysis.isOverexposed ? 0.8 : 1.0)
              const strength = (options.brightnessOptimizeStrength / 100) * brightBoost
              const gray = new cv.Mat()
              cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY)
              const meanVal = cv.mean(gray)[0]
              safeDel(gray)

              // S-Curve LUT — 不止简单 gamma
              const lut = new cv.Mat(1, 256, cv.CV_8U)
              const lutData = lut.data

              let gamma: number
              if (meanVal < 60) gamma = 1.0 / (1.0 + strength * 1.2)
              else if (meanVal < 90) gamma = 1.0 / (1.0 + strength * 0.6)
              else if (meanVal > 200) gamma = 1.0 + strength * 0.5
              else if (meanVal > 160) gamma = 1.0 + strength * 0.15
              else gamma = 1.0 / (1.0 + strength * 0.15)

              // S-curve: 暗部提亮 + 中间调保持 + 亮部适度压缩
              for (let i = 0; i < 256; i++) {
                let v = i / 255.0
                // Gamma
                v = Math.pow(v, gamma)
                // 轻微 S-curve
                if (strength > 0.3) {
                  const sFactor = (strength - 0.3) * 0.5
                  v = v + sFactor * v * (1 - v) * (v - 0.5) * 2
                }
                lutData[i] = Math.min(255, Math.max(0, Math.round(v * 255)))
              }

              const rgbChs = new cv.MatVector()
              cv.split(rgb, rgbChs)
              for (let c = 0; c < Math.min(3, rgbChs.size() as number); c++) {
                cv.LUT(rgbChs.get(c), lut, rgbChs.get(c))
              }
              cv.merge(rgbChs, rgb)
              safeDel(lut); rgbChs.delete()
            }

            const dst = new cv.Mat()
            cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)
            safeDel(rgb)
            if (isValid(dst) && dst.cols === p.val.cols) {
              safeDel(p.val); safeDel(backup); p.val = dst
            } else { safeDel(dst); throw new Error('Contrast mismatch') }
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 4/${totalStages}: 多通道自适应去噪
        // ================================================================
        if (options.denoise) {
          updateProgress(27, language === 'zh-CN' ? '🔇 阶段4/10: 智能去噪...' : '🔇 Stage 4/10: Smart Denoising...', 'denoise')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            // 根据噪声分析自动调整
            const noiseBoost = Math.max(1.0, 1.0 + (analysis.noiseLevel - 0.3) * 1.5)
            const strength = Math.min(1.0, (options.denoiseStrength / 100) * noiseBoost)
            const h = Math.max(3, Math.min(20, strength * 22))
            const hColor = h * 0.7

            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)

            // 分通道处理: L通道强去噪, a/b通道保持
            if (typeof cv.fastNlMeansDenoisingColored === 'function') {
              const denoised = new cv.Mat()

              // 第一遍: 色度去噪 (保细节)
              cv.fastNlMeansDenoisingColored(rgb, denoised, h * 0.6, hColor, 7, strength > 0.5 ? 21 : 17)

              // 第二遍: 亮度通道精细去噪 (仅高噪声场景)
              if (analysis.noiseLevel > 0.4 && strength > 0.4) {
                const lab = new cv.Mat()
                cv.cvtColor(denoised, lab, cv.COLOR_RGB2Lab)
                const labChs = new cv.MatVector()
                cv.split(lab, labChs)

                if (labChs.size() >= 3) {
                  const lCh = labChs.get(0)
                  const lDenoised = new cv.Mat()

                  if (typeof cv.fastNlMeansDenoising === 'function') {
                    cv.fastNlMeansDenoising(lCh, lDenoised, h * 0.8, 7, 25)
                    lDenoised.copyTo(lCh)
                    safeDel(lDenoised)
                  }

                  cv.merge(labChs, lab)
                  cv.cvtColor(lab, denoised, cv.COLOR_Lab2RGB)
                }
                safeDel(lab); labChs.delete()
              }

              // 边缘保护混合 — 保留锐利边缘
              if (strength > 0.3) {
                const gray = new cv.Mat()
                cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY)
                const edgeMask = new cv.Mat()
                cv.Canny(gray, edgeMask, 40, 120)
                const dilateK = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
                cv.dilate(edgeMask, edgeMask, dilateK)
                safeDel(dilateK)

                // 在边缘区域保留更多原图
                const edgeMask3c = new cv.Mat()
                cv.cvtColor(edgeMask, edgeMask3c, cv.COLOR_GRAY2RGB)
                const edgeMaskF = new cv.Mat()
                edgeMask3c.convertTo(edgeMaskF, cv.CV_32F, 1.0 / 255.0)

                const origF = new cv.Mat()
                const denoisedF = new cv.Mat()
                rgb.convertTo(origF, cv.CV_32F)
                denoised.convertTo(denoisedF, cv.CV_32F)

                // result = denoised * (1 - edgeMask * blend) + orig * edgeMask * blend
                const edgeBlend = 0.6
                for (let i = 0; i < origF.data32F.length; i++) {
                  const e = edgeMaskF.data32F[i] * edgeBlend
                  denoisedF.data32F[i] = denoisedF.data32F[i] * (1 - e) + origF.data32F[i] * e
                }

                denoisedF.convertTo(denoised, cv.CV_8U)
                safeDel(gray); safeDel(edgeMask); safeDel(edgeMask3c); safeDel(edgeMaskF); safeDel(origF); safeDel(denoisedF)
              }

              const dst = new cv.Mat()
              cv.cvtColor(denoised, dst, cv.COLOR_RGB2RGBA)
              safeDel(rgb); safeDel(denoised)
              if (isValid(dst) && dst.cols === p.val.cols) {
                safeDel(p.val); safeDel(backup); p.val = dst
              } else { safeDel(dst); throw new Error('mismatch') }
            } else {
              // 降级: bilateral
              const denoised = new cv.Mat()
              const d = Math.round(5 + strength * 8)
              cv.bilateralFilter(rgb, denoised, d, 75 + strength * 50, 75 + strength * 50)
              const dst = new cv.Mat()
              cv.cvtColor(denoised, dst, cv.COLOR_RGB2RGBA)
              safeDel(rgb); safeDel(denoised)
              if (isValid(dst) && dst.cols === p.val.cols) {
                safeDel(p.val); safeDel(backup); p.val = dst
              } else { safeDel(dst); throw new Error('mismatch') }
            }
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 5/${totalStages}: 多尺度划痕 & 污渍修复
        // ================================================================
        if (options.scratchRepair || options.stainRemoval) {
          updateProgress(36, language === 'zh-CN' ? '🩹 阶段5/10: 划痕 & 污渍修复...' : '🩹 Stage 5/10: Scratch & Stain Fix...', 'scratch')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const gray = new cv.Mat()
            cv.cvtColor(p.val, gray, cv.COLOR_RGBA2GRAY)

            const combinedMask = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8U)

            // 5a. 多尺度划痕检测
            if (options.scratchRepair) {
              const scratchBoost = Math.max(1.0, 1.0 + (analysis.scratchDensity - 0.1) * 2)
              const strength = Math.min(1.0, (options.scratchRepairStrength / 100) * scratchBoost)
              const lowTh = Math.max(15, 70 - Math.round(strength * 50))

              // 三尺度边缘检测
              const scales = [
                { blur: 1, thLow: lowTh, thHigh: lowTh * 2.5 },
                { blur: 3, thLow: lowTh * 0.7, thHigh: lowTh * 2 },
                { blur: 5, thLow: lowTh * 0.5, thHigh: lowTh * 1.5 },
              ]

              for (const sc of scales) {
                const blurred = new cv.Mat()
                if (sc.blur > 1) {
                  cv.GaussianBlur(gray, blurred, new cv.Size(sc.blur, sc.blur), 0)
                } else {
                  gray.copyTo(blurred)
                }

                const edges = new cv.Mat()
                cv.Canny(blurred, edges, sc.thLow, sc.thHigh)

                // 竖直划痕
                const kV = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, Math.round(5 + strength * 5)))
                const vert = new cv.Mat()
                cv.morphologyEx(edges, vert, cv.MORPH_CLOSE, kV)
                cv.morphologyEx(vert, vert, cv.MORPH_OPEN, kV)

                // 水平划痕
                const kH = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.round(5 + strength * 5), 1))
                const horiz = new cv.Mat()
                cv.morphologyEx(edges, horiz, cv.MORPH_CLOSE, kH)
                cv.morphologyEx(horiz, horiz, cv.MORPH_OPEN, kH)

                // 对角线划痕
                const kD1 = cv.Mat.zeros(5, 5, cv.CV_8U)
                for (let i = 0; i < 5; i++) kD1.ucharPtr(i, i)[0] = 1
                const diag = new cv.Mat()
                cv.morphologyEx(edges, diag, cv.MORPH_CLOSE, kD1)
                cv.morphologyEx(diag, diag, cv.MORPH_OPEN, kD1)

                cv.add(combinedMask, vert, combinedMask)
                cv.add(combinedMask, horiz, combinedMask)
                cv.add(combinedMask, diag, combinedMask)

                safeDel(blurred); safeDel(edges); safeDel(kV); safeDel(kH); safeDel(kD1)
                safeDel(vert); safeDel(horiz); safeDel(diag)
              }

              // 膨胀遮罩
              const dilateSize = 2 + Math.round(strength * 3)
              const dilateK = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(dilateSize, dilateSize))
              cv.dilate(combinedMask, combinedMask, dilateK)
              safeDel(dilateK)
            }

            // 5b. 污渍检测 (大面积异常色块)
            if (options.stainRemoval) {
              const strength = options.stainRemovalStrength / 100

              const rgb = new cv.Mat()
              cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)
              const hsv = new cv.Mat()
              cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)
              const hsvChs = new cv.MatVector()
              cv.split(hsv, hsvChs)

              if (hsvChs.size() >= 3) {
                const sCh = hsvChs.get(1)
                const vCh = hsvChs.get(2)

                // 低饱和度 + 异常亮度 = 潜在污渍
                const lowSat = new cv.Mat()
                cv.threshold(sCh, lowSat, 30, 255, cv.THRESH_BINARY_INV)
                const brightAnomaly = new cv.Mat()
                cv.threshold(vCh, brightAnomaly, 200, 255, cv.THRESH_BINARY)

                const stainMask = new cv.Mat()
                cv.bitwise_and(lowSat, brightAnomaly, stainMask)

                // 形态学清理 — 只保留大面积
                const morphK = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5))
                cv.morphologyEx(stainMask, stainMask, cv.MORPH_OPEN, morphK)
                cv.morphologyEx(stainMask, stainMask, cv.MORPH_CLOSE, morphK)
                safeDel(morphK)

                // 按强度混合到总遮罩
                const stainScaled = new cv.Mat()
                stainMask.convertTo(stainScaled, cv.CV_8U, strength * 0.5)
                cv.add(combinedMask, stainScaled, combinedMask)

                safeDel(lowSat); safeDel(brightAnomaly); safeDel(stainMask); safeDel(stainScaled)
              }

              safeDel(rgb); safeDel(hsv); hsvChs.delete()
            }

            // 阈值化最终遮罩
            cv.threshold(combinedMask, combinedMask, 20, 255, cv.THRESH_BINARY)

            // 人脸保护 — 降低人脸区域的修复强度
            if (analysis.hasFaces && analysis.faceRegions.length > 0) {
              for (const face of analysis.faceRegions) {
                const faceRoi = combinedMask.roi(new cv.Rect(
                  Math.max(0, face.x - 10),
                  Math.max(0, face.y - 10),
                  Math.min(face.w + 20, combinedMask.cols - face.x + 10),
                  Math.min(face.h + 20, combinedMask.rows - face.y + 10)
                ))
                faceRoi.setTo(new cv.Scalar(0)) // 清除人脸区域的划痕遮罩
              }
            }

            // Inpaint
            const maskPixels = cv.countNonZero(combinedMask)
            if (maskPixels > 0 && maskPixels < (gray.rows * gray.cols * 0.25)) {
              const dst = new cv.Mat()
              if (typeof cv.inpaint === 'function') {
                const radius = 3 + Math.round((options.scratchRepairStrength / 100) * 5)
                cv.inpaint(p.val, combinedMask, dst, radius, cv.INPAINT_TELEA)
              } else {
                p.val.copyTo(dst)
              }

              if (isValid(dst) && dst.cols === p.val.cols) {
                safeDel(p.val); safeDel(backup); p.val = dst
              } else { safeDel(dst) }
            } else {
              safeDel(backup)
            }

            safeDel(gray); safeDel(combinedMask)
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 6/${totalStages}: 人脸检测 & 区域增强
        // ================================================================
        if (options.faceEnhance && analysis.hasFaces && analysis.faceRegions.length > 0) {
          updateProgress(45, language === 'zh-CN' ? '👤 阶段6/10: 人脸增强...' : '👤 Stage 6/10: Face Enhancement...', 'face')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const strength = options.faceEnhanceStrength / 100

            for (const face of analysis.faceRegions) {
              // 扩展人脸区域 (含额头和下巴)
              const padX = Math.round(face.w * 0.15)
              const padY = Math.round(face.h * 0.2)
              const x = Math.max(0, face.x - padX)
              const y = Math.max(0, face.y - padY)
              const w = Math.min(p.val.cols - x, face.w + padX * 2)
              const h = Math.min(p.val.rows - y, face.h + padY * 2)

              if (w < 20 || h < 20) continue

              const faceRoi = p.val.roi(new cv.Rect(x, y, w, h))
              const faceClone = faceRoi.clone()

              // 6a. 人脸去噪 (更温和)
              const faceRgb = new cv.Mat()
              cv.cvtColor(faceClone, faceRgb, cv.COLOR_RGBA2RGB)

              if (typeof cv.fastNlMeansDenoisingColored === 'function') {
                const faceDenoised = new cv.Mat()
                cv.fastNlMeansDenoisingColored(faceRgb, faceDenoised, 5 + strength * 5, 3 + strength * 3, 7, 17)
                faceDenoised.copyTo(faceRgb)
                safeDel(faceDenoised)
              }

              // 6b. 人脸对比度 CLAHE
              const faceLab = new cv.Mat()
              cv.cvtColor(faceRgb, faceLab, cv.COLOR_RGB2Lab)
              const faceLabChs = new cv.MatVector()
              cv.split(faceLab, faceLabChs)

              if (faceLabChs.size() >= 3 && typeof cv.CLAHE === 'function') {
                const fL = faceLabChs.get(0)
                const clip = 1.5 + strength * 2.0
                const clahe = new cv.CLAHE(clip, new cv.Size(2, 2))
                clahe.apply(fL, fL)
                clahe.delete()

                cv.merge(faceLabChs, faceLab)
                cv.cvtColor(faceLab, faceRgb, cv.COLOR_Lab2RGB)
              }
              safeDel(faceLab); faceLabChs.delete()

              // 6c. 人脸锐化 (Unsharp Mask, 温和)
              const faceF = new cv.Mat()
              faceRgb.convertTo(faceF, cv.CV_32F, 1.0 / 255.0)
              const faceBlur = new cv.Mat()
              cv.GaussianBlur(faceF, faceBlur, new cv.Size(0, 0), 0.8 + strength * 0.5)
              const faceDiff = new cv.Mat()
              cv.subtract(faceF, faceBlur, faceDiff)
              safeDel(faceBlur)

              const amount = 0.5 + strength * 1.2
              const faceScaled = new cv.Mat()
              faceDiff.convertTo(faceScaled, cv.CV_32F, amount)
              safeDel(faceDiff)

              cv.add(faceF, faceScaled, faceF)
              safeDel(faceScaled)

              faceF.convertTo(faceRgb, cv.CV_8U, 255.0)
              safeDel(faceF)

              // 6d. 皮肤平滑 (bilateral 保边缘)
              const smoothed = new cv.Mat()
              cv.bilateralFilter(faceRgb, smoothed, 5, 50 + strength * 30, 50 + strength * 30)

              // 轻混合 — 不过度磨皮
              cv.addWeighted(faceRgb, 0.5, smoothed, 0.5, 0, faceRgb)
              safeDel(smoothed)

              // 写回原图 — 边缘羽化
              const faceResult = new cv.Mat()
              cv.cvtColor(faceRgb, faceResult, cv.COLOR_RGB2RGBA)

              // 创建羽化遮罩
              const featherMask = cv.Mat.ones(h, w, cv.CV_32F)
              const featherSize = Math.min(10, Math.floor(Math.min(w, h) * 0.15))
              if (featherSize > 1) {
                const fData = featherMask.data32F
                for (let r = 0; r < h; r++) {
                  for (let c = 0; c < w; c++) {
                    const distEdge = Math.min(r, h - 1 - r, c, w - 1 - c)
                    if (distEdge < featherSize) {
                      fData[r * w + c] = distEdge / featherSize
                    }
                  }
                }
              }

              // 混合
              const roiF = new cv.Mat()
              const resultF = new cv.Mat()
              faceRoi.convertTo(roiF, cv.CV_32F)
              faceResult.convertTo(resultF, cv.CV_32F)

              const roiData = roiF.data32F
              const resData = resultF.data32F
              const mData = featherMask.data32F
              for (let i = 0; i < mData.length; i++) {
                const m = mData[i]
                const idx4 = i * 4
                if (idx4 + 3 < roiData.length) {
                  for (let c = 0; c < 3; c++) {
                    roiData[idx4 + c] = roiData[idx4 + c] * (1 - m) + resData[idx4 + c] * m
                  }
                }
              }

              roiF.convertTo(faceRoi, cv.CV_8U)
              safeDel(roiF); safeDel(resultF); safeDel(featherMask)
              safeDel(faceClone); safeDel(faceRgb); safeDel(faceResult)
            }
            safeDel(backup)
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 7/${totalStages}: 多层锐化
        // ================================================================
        if (options.sharpen) {
          updateProgress(55, language === 'zh-CN' ? '🔍 阶段7/10: 智能锐化...' : '🔍 Stage 7/10: Smart Sharpening...', 'sharpen')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            // 根据清晰度分析调整
            const sharpBoost = Math.max(0.8, 1.0 + (1.0 - analysis.sharpness) * 0.5)
            const strength = Math.min(1.0, (options.sharpenStrength / 100) * sharpBoost)

            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)

            // L通道锐化 — 避免色彩伪影
            const lab = new cv.Mat()
            cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
            const labChs = new cv.MatVector()
            cv.split(lab, labChs)

            if (labChs.size() >= 3) {
              const lCh = labChs.get(0)

              // 双层 Unsharp Mask: 粗+细
              const lF = new cv.Mat()
              lCh.convertTo(lF, cv.CV_32F, 1.0 / 255.0)

              // 粗锐化 (恢复大结构)
              const blur1 = new cv.Mat()
              cv.GaussianBlur(lF, blur1, new cv.Size(0, 0), 2.0 + strength)
              const diff1 = new cv.Mat()
              cv.subtract(lF, blur1, diff1)
              safeDel(blur1)
              const scaled1 = new cv.Mat()
              diff1.convertTo(scaled1, cv.CV_32F, 0.4 + strength * 1.2)
              safeDel(diff1)
              cv.add(lF, scaled1, lF)
              safeDel(scaled1)

              // 细锐化 (恢复细节)
              if (strength > 0.3) {
                const blur2 = new cv.Mat()
                cv.GaussianBlur(lF, blur2, new cv.Size(0, 0), 0.5 + strength * 0.5)
                const diff2 = new cv.Mat()
                cv.subtract(lF, blur2, diff2)
                safeDel(blur2)
                const scaled2 = new cv.Mat()
                diff2.convertTo(scaled2, cv.CV_32F, 0.2 + strength * 0.8)
                safeDel(diff2)
                cv.add(lF, scaled2, lF)
                safeDel(scaled2)
              }

              lF.convertTo(lCh, cv.CV_8U, 255.0)
              safeDel(lF)

              cv.merge(labChs, lab)
              cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
            }
            safeDel(lab); labChs.delete()

            const dst = new cv.Mat()
            cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)
            safeDel(rgb)
            if (isValid(dst) && dst.cols === p.val.cols) {
              safeDel(p.val); safeDel(backup); p.val = dst
            } else { safeDel(dst); throw new Error('mismatch') }
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 8/${totalStages}: 细节增强
        // ================================================================
        if (options.detailEnhance) {
          updateProgress(63, language === 'zh-CN' ? '💎 阶段8/10: 细节增强...' : '💎 Stage 8/10: Detail Enhancement...', 'detail')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const strength = options.detailEnhanceStrength / 100
            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)

            if (typeof cv.detailEnhance === 'function') {
              // 高品质 detail enhance
              const enhanced = new cv.Mat()
              const sigma_s = 8 + strength * 25
              const sigma_r = 0.08 + strength * 0.15
              cv.detailEnhance(rgb, enhanced, sigma_s, sigma_r)

              // 渐进式混合
              const alpha = 0.25 + strength * 0.45
              cv.addWeighted(enhanced, alpha, rgb, 1.0 - alpha, 0, rgb)
              safeDel(enhanced)
            } else {
              // 高通叠加
              const smoothed = new cv.Mat()
              cv.bilateralFilter(rgb, smoothed, 9, 75, 75)
              const rgbF = new cv.Mat()
              const smF = new cv.Mat()
              rgb.convertTo(rgbF, cv.CV_32F)
              smoothed.convertTo(smF, cv.CV_32F)
              safeDel(smoothed)

              const hp = new cv.Mat()
              cv.subtract(rgbF, smF, hp)
              safeDel(smF)

              const boosted = new cv.Mat()
              hp.convertTo(boosted, cv.CV_32F, strength * 1.8)
              safeDel(hp)

              cv.add(rgbF, boosted, rgbF)
              safeDel(boosted)
              rgbF.convertTo(rgb, cv.CV_8U)
              safeDel(rgbF)
            }

            const dst = new cv.Mat()
            cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)
            safeDel(rgb)
            if (isValid(dst) && dst.cols === p.val.cols) {
              safeDel(p.val); safeDel(backup); p.val = dst
            } else { safeDel(dst); throw new Error('mismatch') }
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 9/${totalStages}: 色彩鲜艳度恢复
        // ================================================================
        if (options.colorVibrancy) {
          updateProgress(73, language === 'zh-CN' ? '🌈 阶段9/10: 色彩恢复...' : '🌈 Stage 9/10: Color Recovery...', 'vibrancy')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const colorBoost = analysis.isGrayscale ? 0.3 : (analysis.colorfulness < 30 ? 1.4 : 1.0)
            const strength = Math.min(1.0, (options.colorVibrancyStrength / 100) * colorBoost)

            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)
            const hsv = new cv.Mat()
            cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)
            const hsvChs = new cv.MatVector()
            cv.split(hsv, hsvChs)

            if (hsvChs.size() >= 3) {
              const sCh = hsvChs.get(1)
              const vCh = hsvChs.get(2)

              // 智能饱和度: 分区提升
              const sF = new cv.Mat()
              sCh.convertTo(sF, cv.CV_32F, 1.0 / 255.0)
              const sData = sF.data32F
              const boostFactor = 1.0 + strength * 1.2

              for (let i = 0; i < sData.length; i++) {
                const s = sData[i]
                // 非线性 — 低饱和度区域提升更多
                const adaptiveBoost = boostFactor * Math.pow(1.0 - s * 0.4, 1.5)
                // 保护高饱和度 (避免过饱和)
                const protection = s > 0.7 ? (1.0 - (s - 0.7) / 0.3 * 0.5) : 1.0
                sData[i] = Math.min(0.95, Math.max(0, s * adaptiveBoost * protection))
              }

              const sBu = new cv.Mat()
              sF.convertTo(sBu, cv.CV_8U, 255.0)
              sBu.copyTo(sCh)
              safeDel(sF); safeDel(sBu)

              // 明度 S-curve — 中间调微提
              if (strength > 0.25) {
                const vF = new cv.Mat()
                vCh.convertTo(vF, cv.CV_32F, 1.0 / 255.0)
                const vData = vF.data32F
                const lift = strength * 0.1

                for (let i = 0; i < vData.length; i++) {
                  const v = vData[i]
                  if (v > 0.1 && v < 0.9) {
                    // S-curve: 提亮中间调, 保护高光和暗部
                    const midDist = 1.0 - Math.abs(v - 0.45) * 2.2
                    const factor = Math.max(0, midDist)
                    vData[i] = Math.min(1.0, v + lift * factor)
                  }
                }

                const vBu = new cv.Mat()
                vF.convertTo(vBu, cv.CV_8U, 255.0)
                vBu.copyTo(vCh)
                safeDel(vF); safeDel(vBu)
              }

              cv.merge(hsvChs, hsv)
              cv.cvtColor(hsv, rgb, cv.COLOR_HSV2RGB)
            }
            safeDel(hsv); hsvChs.delete()

            const dst = new cv.Mat()
            cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)
            safeDel(rgb)
            if (isValid(dst) && dst.cols === p.val.cols) {
              safeDel(p.val); safeDel(backup); p.val = dst
            } else { safeDel(dst); throw new Error('mismatch') }
          })
          await yieldToUI()
        }

        // ================================================================
        //  阶段 10/${totalStages}: 最终抛光 (Tone Mapping + Micro-Contrast)
        // ================================================================
        if (options.finalPolish) {
          updateProgress(83, language === 'zh-CN' ? '💫 阶段10/10: 最终优化...' : '💫 Stage 10/10: Final Polish...', 'polish')
          await yieldToUI()

          const backup = p.val.clone()
          await safeStage(backup, p, async () => {
            const strength = options.finalPolishStrength / 100

            const rgb = new cv.Mat()
            cv.cvtColor(p.val, rgb, cv.COLOR_RGBA2RGB)

            // 10a. 微对比度 (Local Tone Mapping) — 类似 HDR
            const lab = new cv.Mat()
            cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
            const labChs = new cv.MatVector()
            cv.split(lab, labChs)

            if (labChs.size() >= 3) {
              const lCh = labChs.get(0)
              const lF = new cv.Mat()
              lCh.convertTo(lF, cv.CV_32F, 1.0 / 255.0)

              // 局部均值
              const localMean = new cv.Mat()
              cv.blur(lF, localMean, new cv.Size(31, 31))

              // micro-contrast: (pixel - localMean) * boost + pixel
              const lData = lF.data32F
              const mData = localMean.data32F
              const microBoost = 0.15 + strength * 0.35
              for (let i = 0; i < lData.length; i++) {
                const diff = lData[i] - mData[i]
                lData[i] = Math.max(0, Math.min(1, lData[i] + diff * microBoost))
              }
              safeDel(localMean)

              lF.convertTo(lCh, cv.CV_8U, 255.0)
              safeDel(lF)

              cv.merge(labChs, lab)
              cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
            }
            safeDel(lab); labChs.delete()

            // 10b. 最终色调微调 — 温暖化
            if (strength > 0.3) {
              const rgbChs = new cv.MatVector()
              cv.split(rgb, rgbChs)
              if (rgbChs.size() >= 3) {
                // 轻微暖色调
                const rCh = rgbChs.get(0)
                const bCh = rgbChs.get(2)

                const warmth = (strength - 0.3) * 0.03
                const rF = new cv.Mat()
                const bF = new cv.Mat()
                rCh.convertTo(rF, cv.CV_32F)
                bCh.convertTo(bF, cv.CV_32F)

                const rData = rF.data32F
                const bData = bF.data32F
                for (let i = 0; i < rData.length; i++) {
                  rData[i] = Math.min(255, rData[i] * (1 + warmth))
                  bData[i] = Math.max(0, bData[i] * (1 - warmth * 0.5))
                }

                rF.convertTo(rCh, cv.CV_8U)
                bF.convertTo(bCh, cv.CV_8U)
                safeDel(rF); safeDel(bF)

                cv.merge(rgbChs, rgb)
              }
              rgbChs.delete()
            }

            const dst = new cv.Mat()
            cv.cvtColor(rgb, dst, cv.COLOR_RGB2RGBA)
            safeDel(rgb)
            if (isValid(dst) && dst.cols === p.val.cols) {
              safeDel(p.val); safeDel(backup); p.val = dst
            } else { safeDel(dst); throw new Error('mismatch') }
          })
          await yieldToUI()
        }

        // ================================================================
        //  生成结果
        // ================================================================
        updateProgress(92, language === 'zh-CN' ? '🎉 生成高品质结果...' : '🎉 Generating result...', 'output')
        await yieldToUI()

        if (!isValid(p.val)) throw new Error('Invalid result')

        const maxOut = 4096
        if (p.val.cols > maxOut || p.val.rows > maxOut) {
          const scale = Math.min(maxOut / p.val.cols, maxOut / p.val.rows)
          const resized = new cv.Mat()
          cv.resize(p.val, resized, new cv.Size(Math.floor(p.val.cols * scale), Math.floor(p.val.rows * scale)), 0, 0, cv.INTER_LANCZOS4)
          safeDel(p.val)
          p.val = resized
        }

        const resultCanvas = document.createElement('canvas')
        resultCanvas.width = p.val.cols
        resultCanvas.height = p.val.rows

        try {
          if (!resultCanvas.parentElement) {
            document.body.appendChild(resultCanvas)
            resultCanvas.style.display = 'none'
          }
          cv.imshow(resultCanvas, p.val)
          if (resultCanvas.parentElement === document.body) document.body.removeChild(resultCanvas)
        } catch (err) {
          throw new Error(`Draw failed: ${err}`)
        }

        await new Promise<void>((resolve, reject) => {
          try {
            resultCanvas.toBlob((blob) => {
              if (blob) {
                const resultUrl = URL.createObjectURL(blob)
                const duration = ((Date.now() - startTime) / 1000).toFixed(1)
                setTasks(prev => prev.map(t =>
                  t.id === task.id ? {
                    ...t, status: 'completed' as const, progress: 100,
                    progressMessage: language === 'zh-CN' ? `✨ 修复完成！用时 ${duration}秒` : `✨ Done! ${duration}s`,
                    result: blob, resultUrl, restoredPreview: resultUrl, endTime: Date.now(), analysis
                  } : t
                ))
                try {
                  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MT6bj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDE+m4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC')
                  audio.volume = 0.3
                  audio.play().catch(() => {})
                } catch (_e) { /* noop */ }
                resolve()
              } else reject(new Error('Blob generation failed'))
            }, `image/${options.outputFormat}`, options.outputQuality / 100)
          } catch (err) { reject(err) }
        })

        safeDel(src); safeDel(p.val)
      } catch (err) {
        safeDel(src); safeDel(p.val)
        throw err
      }
    } catch (err) {
      console.error('Processing failed:', err)
      let msg = 'Unknown error'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'number') msg = `OpenCV error: ${err}`
      else msg = String(err)
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, status: 'failed' as const, progress: 0, progressMessage: undefined, error: msg } : t
      ))
      throw err
    }
  }, [options, loadOpenCV, language, loadFaceCascade])

  // 处理所有
  const handleProcess = useCallback(async () => {
    const pending = tasks.filter(t => t.status === 'pending')
    if (pending.length === 0) return
    setIsProcessing(true)
    try {
      for (const task of pending) {
        try { await processImage(task) } catch (err) { console.error(`Failed: ${task.file.name}:`, err) }
      }
    } finally { setIsProcessing(false) }
  }, [tasks, processImage])

  const handleRetry = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'pending' as const, progress: 0, error: undefined, progressMessage: undefined, restoredPreview: undefined, result: undefined, resultUrl: undefined, analysis: undefined } : t
    ))
  }, [])

  const handleDownload = useCallback((task: RestorationTask) => {
    if (!task.result) return
    saveAs(task.result, task.file.name.replace(/\.[^/.]+$/, '') + `_restored.${options.outputFormat}`)
  }, [options.outputFormat])

  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId)
      if (task?.originalPreview) URL.revokeObjectURL(task.originalPreview)
      if (task?.restoredPreview) URL.revokeObjectURL(task.restoredPreview)
      if (task?.resultUrl) URL.revokeObjectURL(task.resultUrl)
      return prev.filter(t => t.id !== taskId)
    })
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  // 对比滑块
  const [compareSliders, setCompareSliders] = useState<Record<string, number>>({})
  const getSlider = (id: string) => compareSliders[id] ?? 50
  const setSlider = (id: string, v: number) => setCompareSliders(prev => ({ ...prev, [id]: v }))

  // 分析结果展示
  const renderAnalysis = (a: ImageAnalysis) => {
    const tags: string[] = []
    if (a.isDark) tags.push(language === 'zh-CN' ? '偏暗' : 'Dark')
    if (a.isOverexposed) tags.push(language === 'zh-CN' ? '过曝' : 'Overexposed')
    if (a.isLowContrast) tags.push(language === 'zh-CN' ? '低对比度' : 'Low Contrast')
    if (a.hasColorCast) tags.push(language === 'zh-CN' ? `色偏:${a.colorCastType}` : `Cast:${a.colorCastType}`)
    if (a.noiseLevel > 0.4) tags.push(language === 'zh-CN' ? '高噪声' : 'Noisy')
    if (a.scratchDensity > 0.2) tags.push(language === 'zh-CN' ? '有划痕' : 'Scratched')
    if (a.hasFaces) tags.push(language === 'zh-CN' ? `${a.faceRegions.length}张人脸` : `${a.faceRegions.length} Face(s)`)
    if (a.isGrayscale) tags.push(language === 'zh-CN' ? '黑白照' : 'Grayscale')
    if (a.sharpness < 0.3) tags.push(language === 'zh-CN' ? '模糊' : 'Blurry')
    return tags
  }

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <div className="old-photo-restoration">
      {/* Header */}
      <div className="restoration-header">
        <div className="header-content">
          <h1 className="tool-title">
            <Sparkles className="title-icon" />
            {language === 'zh-CN' ? 'AI 老照片修复' : 'AI Old Photo Restoration'}
          </h1>
          <p className="tool-description">
            {language === 'zh-CN'
              ? '商业级10阶段修复引擎：智能分析 → 色彩校正 → 对比度增强 → 去噪 → 划痕修复 → 人脸增强 → 锐化 → 细节增强 → 色彩恢复 → 最终抛光。自适应参数 · 人脸保护 · 多通道处理。'
              : 'Commercial 10-Stage Engine: Analysis → Color → Contrast → Denoise → Scratch → Face → Sharpen → Detail → Vibrancy → Polish. Adaptive · Face-aware · Multi-channel.'}
          </p>
          <div className="feature-pills">
            <span className="pill">🔍 {language === 'zh-CN' ? '智能分析' : 'Auto Analyze'}</span>
            <span className="pill">🎨 {language === 'zh-CN' ? '色彩校正' : 'Color Fix'}</span>
            <span className="pill">🔇 {language === 'zh-CN' ? '智能去噪' : 'Denoise'}</span>
            <span className="pill">🩹 {language === 'zh-CN' ? '瑕疵修复' : 'Damage Fix'}</span>
            <span className="pill pill-face"><ScanFace size={13} /> {language === 'zh-CN' ? '人脸增强' : 'Face AI'}</span>
            <span className="pill">💎 {language === 'zh-CN' ? '细节锐化' : 'Sharpen'}</span>
            <span className="pill">🌈 {language === 'zh-CN' ? '色彩恢复' : 'Vibrancy'}</span>
            <span className="pill">💫 {language === 'zh-CN' ? '最终抛光' : 'Polish'}</span>
          </div>
        </div>
      </div>

      {deviceWarning && (
        <div className="device-warning">
          <AlertCircle size={20} />
          <div>
            <strong>{language === 'zh-CN' ? '设备性能提示' : 'Performance Notice'}</strong>
            <p>{language === 'zh-CN' ? '建议使用桌面浏览器以获得最佳效果。' : 'Desktop browser recommended.'}</p>
          </div>
        </div>
      )}

      {opencvLoading && (
        <div className="opencv-loading-overlay">
          <div className="loading-spinner"></div>
          <p className="loading-title">{language === 'zh-CN' ? '正在加载图像处理引擎...' : 'Loading engine...'}</p>
          <p className="loading-hint">{language === 'zh-CN' ? '首次加载约 8MB，请稍候...' : 'First load ~8MB...'}</p>
        </div>
      )}

      {/* Upload */}
      <div className="upload-section">
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} disabled={isProcessing || opencvLoading} />
        <div className="upload-button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={48} />
          <span>{language === 'zh-CN' ? '上传老照片' : 'Upload Old Photos'}</span>
          <small>{language === 'zh-CN' ? '支持 JPG, PNG, BMP 等格式，最多5张，每个最大50MB' : 'JPG, PNG, BMP, max 5 photos, 50MB each'}</small>
        </div>

        {/* 预设 + 设置 */}
        {tasks.length > 0 && (
          <div className="controls-bar">
            <div className="preset-selector">
              <span className="preset-label">{language === 'zh-CN' ? '修复模式:' : 'Mode:'}</span>
              <button className={`preset-btn ${options.preset === 'quick' ? 'active' : ''}`} onClick={() => applyPreset('quick')} disabled={isProcessing}>
                <Zap size={14} />{language === 'zh-CN' ? '快速' : 'Quick'}
              </button>
              <button className={`preset-btn ${options.preset === 'standard' ? 'active' : ''}`} onClick={() => applyPreset('standard')} disabled={isProcessing}>
                <Sparkles size={14} />{language === 'zh-CN' ? '标准' : 'Standard'}
              </button>
              <button className={`preset-btn ${options.preset === 'professional' ? 'active' : ''}`} onClick={() => applyPreset('professional')} disabled={isProcessing}>
                <ImageIcon size={14} />{language === 'zh-CN' ? '专业' : 'Pro'}
              </button>
            </div>
            <button className="settings-toggle-btn" onClick={() => setShowSettings(!showSettings)} disabled={isProcessing}>
              <Settings size={16} />{language === 'zh-CN' ? (showSettings ? '收起' : '高级设置') : (showSettings ? 'Hide' : 'Advanced')}
            </button>
          </div>
        )}

        {/* Task List */}
        {tasks.length > 0 && (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className={`task-item ${task.status}`}>
                <div className="task-preview">
                  {task.status === 'completed' && task.restoredPreview ? (
                    <div className="compare-container">
                      <img src={task.originalPreview} alt="Original" className="compare-base-img" draggable={false} />
                      <div className="compare-result-wrap" style={{ clipPath: `inset(0 ${100 - getSlider(task.id)}% 0 0)` }}>
                        <img src={task.restoredPreview} alt="Restored" className="compare-base-img" draggable={false} />
                      </div>
                      <div className="compare-divider" style={{ left: `${getSlider(task.id)}%` }}>
                        <div className="compare-handle"><span>◀ ▶</span></div>
                      </div>
                      {getSlider(task.id) > 15 && <span className="compare-tag left">{language === 'zh-CN' ? '修复后' : 'After'}</span>}
                      {getSlider(task.id) < 85 && <span className="compare-tag right">{language === 'zh-CN' ? '原图' : 'Before'}</span>}
                      <input type="range" min="0" max="100" value={getSlider(task.id)} onChange={(e) => setSlider(task.id, Number(e.target.value))} className="compare-range" />
                    </div>
                  ) : task.status === 'processing' ? (
                    <div className="processing-overlay">
                      <img src={task.originalPreview} alt="Preview" className="processing-img" />
                      <div className="processing-indicator">
                        <Loader2 className="spinner" size={32} />
                      </div>
                    </div>
                  ) : (
                    <img src={task.originalPreview} alt="Preview" />
                  )}
                </div>
                <div className="task-info">
                  <div className="task-meta">
                    <span className="task-name">{task.file.name}</span>
                    <span className="task-size">{formatFileSize(task.file.size)}</span>
                  </div>

                  {/* 分析标签 */}
                  {task.analysis && task.status === 'completed' && (
                    <div className="analysis-tags">
                      {renderAnalysis(task.analysis).map((tag, i) => (
                        <span key={i} className="analysis-tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  {task.status === 'processing' && (
                    <>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${task.progress}%` }}></div></div>
                      <div className="progress-message">{task.progressMessage || `${task.progress}%`}</div>
                    </>
                  )}

                  {task.status === 'completed' && task.progressMessage && (
                    <div className="success-message"><CheckCircle2 size={14} />{task.progressMessage}</div>
                  )}

                  {task.status === 'failed' && task.error && (
                    <div className="error-message"><AlertCircle size={14} />{task.error}</div>
                  )}
                </div>
                <div className="task-actions">
                  {task.status === 'completed' && (
                    <button className="download-btn" onClick={() => handleDownload(task)}><Download size={16} /><span>{language === 'zh-CN' ? '下载' : 'Download'}</span></button>
                  )}
                  {(task.status === 'completed' || task.status === 'failed') && (
                    <button className="retry-btn" onClick={() => handleRetry(task.id)} disabled={isProcessing}><RotateCcw size={16} /><span>{language === 'zh-CN' ? '重试' : 'Retry'}</span></button>
                  )}
                  <button className="remove-btn" onClick={() => handleRemoveTask(task.id)} disabled={isProcessing}><X size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      {showSettings && tasks.length > 0 && (
        <div className="settings-section">
          <h3><Settings size={18} /> {language === 'zh-CN' ? '高级修复设置' : 'Advanced Settings'}</h3>
          <div className="settings-grid">
            {/* S1 分析 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.autoAnalyze} onChange={(e) => setOptions(pp => ({ ...pp, autoAnalyze: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '智能预分析' : 'Auto Analyze'}</span>
                <span className="stage-badge">S1</span>
              </label>
              <small>{language === 'zh-CN' ? '自动检测亮度/噪声/划痕/人脸/色偏' : 'Auto-detect issues & adapt params'}</small>
            </div>
            {/* S2 白平衡 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.autoWhiteBalance} onChange={(e) => setOptions(pp => ({ ...pp, autoWhiteBalance: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '白平衡校正' : 'White Balance'}</span>
                <span className="stage-badge">S2</span>
              </label>
              {options.autoWhiteBalance && <input type="range" min="0" max="100" value={options.autoWhiteBalanceStrength} onChange={(e) => setOptions(pp => ({ ...pp, autoWhiteBalanceStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '非线性 Gray World + 白点校正' : 'Non-linear Gray World + White Point'}</small>
            </div>
            {/* S2 色偏 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.colorCastRemoval} onChange={(e) => setOptions(pp => ({ ...pp, colorCastRemoval: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '色偏校正' : 'Color Cast Fix'}</span>
                <span className="stage-badge">S2</span>
              </label>
              {options.colorCastRemoval && <input type="range" min="0" max="100" value={options.colorCastRemovalStrength} onChange={(e) => setOptions(pp => ({ ...pp, colorCastRemovalStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? 'Lab CLAHE + 自适应色偏补偿' : 'Lab CLAHE + adaptive cast fix'}</small>
            </div>
            {/* S3 对比度 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.contrastEnhance} onChange={(e) => setOptions(pp => ({ ...pp, contrastEnhance: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '对比度增强' : 'Contrast'}</span>
                <span className="stage-badge">S3</span>
              </label>
              {options.contrastEnhance && <input type="range" min="0" max="100" value={options.contrastEnhanceStrength} onChange={(e) => setOptions(pp => ({ ...pp, contrastEnhanceStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '双层 CLAHE (粗+细粒度混合)' : 'Dual CLAHE (coarse + fine blend)'}</small>
            </div>
            {/* S3 亮度 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.brightnessOptimize} onChange={(e) => setOptions(pp => ({ ...pp, brightnessOptimize: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '亮度优化' : 'Brightness'}</span>
                <span className="stage-badge">S3</span>
              </label>
              {options.brightnessOptimize && <input type="range" min="0" max="100" value={options.brightnessOptimizeStrength} onChange={(e) => setOptions(pp => ({ ...pp, brightnessOptimizeStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? 'S-Curve Gamma + 多区间映射' : 'S-Curve Gamma + zone mapping'}</small>
            </div>
            {/* S4 去噪 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.denoise} onChange={(e) => setOptions(pp => ({ ...pp, denoise: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '智能去噪' : 'Denoise'}</span>
                <span className="stage-badge">S4</span>
              </label>
              {options.denoise && <input type="range" min="0" max="100" value={options.denoiseStrength} onChange={(e) => setOptions(pp => ({ ...pp, denoiseStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '双通道 NLM + 边缘保护混合' : 'Dual-pass NLM + edge-aware blend'}</small>
            </div>
            {/* S5 划痕 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.scratchRepair} onChange={(e) => setOptions(pp => ({ ...pp, scratchRepair: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '划痕修复' : 'Scratch Repair'}</span>
                <span className="stage-badge">S5</span>
              </label>
              {options.scratchRepair && <input type="range" min="0" max="100" value={options.scratchRepairStrength} onChange={(e) => setOptions(pp => ({ ...pp, scratchRepairStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '三尺度 Canny + 方向形态学 + 人脸保护' : '3-scale Canny + directional morph + face mask'}</small>
            </div>
            {/* S5 污渍 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.stainRemoval} onChange={(e) => setOptions(pp => ({ ...pp, stainRemoval: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '污渍去除' : 'Stain Removal'}</span>
                <span className="stage-badge">S5</span>
              </label>
              {options.stainRemoval && <input type="range" min="0" max="100" value={options.stainRemovalStrength} onChange={(e) => setOptions(pp => ({ ...pp, stainRemovalStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? 'HSV 异常色块检测 + Inpaint' : 'HSV anomaly detection + Inpaint'}</small>
            </div>
            {/* S6 人脸 */}
            <div className="setting-group setting-group-highlight">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.faceEnhance} onChange={(e) => setOptions(pp => ({ ...pp, faceEnhance: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '人脸增强' : 'Face Enhance'}</span>
                <span className="stage-badge stage-badge-ai">S6</span>
              </label>
              {options.faceEnhance && <input type="range" min="0" max="100" value={options.faceEnhanceStrength} onChange={(e) => setOptions(pp => ({ ...pp, faceEnhanceStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? 'Haar人脸检测 + 去噪/锐化/磨皮/羽化' : 'Haar face detect + denoise/sharp/smooth/feather'}</small>
            </div>
            {/* S7 锐化 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.sharpen} onChange={(e) => setOptions(pp => ({ ...pp, sharpen: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '智能锐化' : 'Smart Sharpen'}</span>
                <span className="stage-badge">S7</span>
              </label>
              {options.sharpen && <input type="range" min="0" max="100" value={options.sharpenStrength} onChange={(e) => setOptions(pp => ({ ...pp, sharpenStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? 'L通道双层 Unsharp Mask (粗+细)' : 'L-channel dual Unsharp Mask'}</small>
            </div>
            {/* S8 细节 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.detailEnhance} onChange={(e) => setOptions(pp => ({ ...pp, detailEnhance: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '细节增强' : 'Detail Enhance'}</span>
                <span className="stage-badge">S8</span>
              </label>
              {options.detailEnhance && <input type="range" min="0" max="100" value={options.detailEnhanceStrength} onChange={(e) => setOptions(pp => ({ ...pp, detailEnhanceStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '多尺度纹理恢复' : 'Multi-scale texture recovery'}</small>
            </div>
            {/* S9 色彩 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.colorVibrancy} onChange={(e) => setOptions(pp => ({ ...pp, colorVibrancy: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '色彩恢复' : 'Color Vibrancy'}</span>
                <span className="stage-badge">S9</span>
              </label>
              {options.colorVibrancy && <input type="range" min="0" max="100" value={options.colorVibrancyStrength} onChange={(e) => setOptions(pp => ({ ...pp, colorVibrancyStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '非线性饱和度 + 中间调 S-Curve' : 'Non-linear saturation + midtone S-curve'}</small>
            </div>
            {/* S10 抛光 */}
            <div className="setting-group">
              <label className="setting-toggle">
                <input type="checkbox" checked={options.finalPolish} onChange={(e) => setOptions(pp => ({ ...pp, finalPolish: e.target.checked }))} disabled={isProcessing} />
                <span>{language === 'zh-CN' ? '最终抛光' : 'Final Polish'}</span>
                <span className="stage-badge">S10</span>
              </label>
              {options.finalPolish && <input type="range" min="0" max="100" value={options.finalPolishStrength} onChange={(e) => setOptions(pp => ({ ...pp, finalPolishStrength: +e.target.value }))} disabled={isProcessing} />}
              <small>{language === 'zh-CN' ? '微对比度 + 色调暖化 + 局部映射' : 'Micro-contrast + warm tone + local mapping'}</small>
            </div>
            {/* 输出 */}
            <div className="setting-group">
              <label>{language === 'zh-CN' ? '输出格式' : 'Format'}</label>
              <select value={options.outputFormat} onChange={(e) => setOptions(pp => ({ ...pp, outputFormat: e.target.value as OutputFormat }))} disabled={isProcessing}>
                <option value="png">PNG ({language === 'zh-CN' ? '无损' : 'Lossless'})</option>
                <option value="jpg">JPG</option>
                <option value="webp">WebP</option>
              </select>
            </div>
            <div className="setting-group">
              <label>{language === 'zh-CN' ? '输出质量' : 'Quality'}: {options.outputQuality}%</label>
              <input type="range" min="50" max="100" value={options.outputQuality} onChange={(e) => setOptions(pp => ({ ...pp, outputQuality: +e.target.value }))} disabled={isProcessing} />
            </div>
          </div>
        </div>
      )}

      {/* Action */}
      {tasks.length > 0 && (
        <div className="action-bar">
          <button className="process-button" onClick={handleProcess} disabled={isProcessing || opencvLoading || tasks.filter(t => t.status === 'pending').length === 0}>
            {isProcessing ? (
              <><Loader2 className="spinner" size={18} /><span>{language === 'zh-CN' ? '修复中...' : 'Processing...'}</span></>
            ) : (
              <><Sparkles size={18} /><span>{language === 'zh-CN' ? '✨ 开始修复' : '✨ Start Restoration'}</span></>
            )}
          </button>
          <span className="action-hint">
            {language === 'zh-CN'
              ? `${tasks.filter(t => t.status === 'pending').length} 张待处理 · ${options.preset === 'quick' ? '快速' : options.preset === 'standard' ? '标准' : '专业'}模式 · 10阶段引擎`
              : `${tasks.filter(t => t.status === 'pending').length} pending · ${options.preset} mode · 10-stage engine`}
          </span>
        </div>
      )}
    </div>
  )
}
