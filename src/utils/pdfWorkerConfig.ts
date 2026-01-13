import * as pdfjsLib from 'pdfjs-dist'

/**
 * PDF.js Worker 配置
 * 支持多个 CDN 备选方案和本地降级
 */
const WORKER_CDNS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
]

/**
 * 测试 Worker URL 是否可用
 */
async function testWorkerUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      cache: 'no-cache',
      signal: AbortSignal.timeout(5000) // 5秒超时
    })
    const contentType = response.headers.get('content-type') || ''
    return response.ok && contentType.includes('javascript')
  } catch {
    return false
  }
}

/**
 * 配置 PDF.js Worker（带重试机制）
 */
export async function configurePDFWorker(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false // 服务端渲染环境，跳过
  }

  // 如果已经配置过，直接返回
  if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
    console.log('✅ PDF.js Worker already configured:', pdfjsLib.GlobalWorkerOptions.workerSrc)
    return true
  }

  // 检查是否为开发环境
  const isDevelopment = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '' ||
                       window.location.protocol === 'file:'
  
  // 1. 优先尝试 CDN（按顺序测试）
  for (const cdnUrl of WORKER_CDNS) {
    try {
      const isAvailable = await testWorkerUrl(cdnUrl)
      if (isAvailable) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl
        console.log('✅ PDF.js Worker: Using CDN -', cdnUrl)
        return true
      }
    } catch (err) {
      console.warn('CDN test failed:', cdnUrl, err)
      continue
    }
  }

  // 2. CDN 都失败，尝试本地 worker（开发环境）
  if (isDevelopment) {
    try {
      const localUrl = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href
      
      const isAvailable = await testWorkerUrl(localUrl)
      if (isAvailable) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = localUrl
        console.log('✅ PDF.js Worker: Using LOCAL -', localUrl)
        return true
      }
    } catch (err) {
      console.warn('Local worker test failed:', err)
    }
  }

  // 3. 所有方案都失败，使用第一个 CDN 作为默认值（让浏览器尝试加载）
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDNS[0]
  console.warn('⚠️ PDF.js Worker: All tests failed, using default CDN -', WORKER_CDNS[0])
  return false
}

/**
 * 同步配置 PDF.js Worker（立即执行，不等待测试）
 */
export function configurePDFWorkerSync() {
  if (typeof window === 'undefined') {
    return
  }

  if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
    return
  }

  // 直接使用第一个 CDN（最快）
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDNS[0]
  console.log('📌 PDF.js Worker: Configured (sync) -', WORKER_CDNS[0])
  
  // 异步测试并切换到最佳 CDN
  configurePDFWorker().catch(err => {
    console.warn('PDF.js Worker async configuration failed:', err)
  })
}

// 自动配置（立即执行同步版本）
configurePDFWorkerSync()

// 导出配置函数供组件使用
export default configurePDFWorker

