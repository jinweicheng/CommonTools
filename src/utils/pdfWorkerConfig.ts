import * as pdfjsLib from 'pdfjs-dist'

/**
 * PDF.js Worker 配置
 * 优先使用 CDN（MIME 类型正确），本地作为降级方案
 */

const WORKER_CDNS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
]

/**
 * 获取本地 Worker URL（从 public 目录）
 */
function getLocalWorkerUrl(): string {
  // 根据 base path 构建 URL
  const basePath = import.meta.env.BASE_URL || '/tools/'
  // 移除末尾的斜杠（如果有）
  const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return `${cleanBasePath}/pdf.worker.min.mjs`
}

/**
 * 测试 Worker URL 是否可用（快速测试，2秒超时）
 * 注意：只接受正确的 JavaScript MIME 类型，不接受 application/octet-stream
 */
async function testWorkerUrl(url: string, timeout: number = 2000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    const response = await fetch(url, { 
      method: 'HEAD',
      cache: 'no-cache',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    const contentType = response.headers.get('content-type') || ''
    // 只接受正确的 JavaScript MIME 类型
    const isValidJS = contentType.includes('javascript') || 
                      contentType.includes('text/javascript') ||
                      contentType.includes('application/javascript')
    
    if (!isValidJS && response.ok) {
      console.warn(`❌ Invalid MIME type for ${url}: ${contentType}. Expected application/javascript.`)
    }
    
    return response.ok && isValidJS
  } catch {
    return false
  }
}

/**
 * 配置 PDF.js Worker（带重试机制）
 * 优先使用 CDN（MIME 类型正确，更可靠），本地作为降级
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

  // 1. 优先尝试 CDN（MIME 类型正确，更可靠）
  for (const cdnUrl of WORKER_CDNS) {
    try {
      const isAvailable = await testWorkerUrl(cdnUrl, 2000)
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

  // 2. CDN 都失败，尝试本地 worker（降级方案）
  const localUrl = getLocalWorkerUrl()
  try {
    const isAvailable = await testWorkerUrl(localUrl, 2000)
    if (isAvailable) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = localUrl
      console.log('✅ PDF.js Worker: Using LOCAL -', localUrl)
      return true
    }
  } catch (err) {
    console.warn('Local worker test failed:', err)
  }

  // 3. 所有方案都失败，使用第一个 CDN 作为默认值（让浏览器尝试加载）
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDNS[0]
  console.warn('⚠️ PDF.js Worker: All tests failed, using default CDN -', WORKER_CDNS[0])
  return false
}

/**
 * 同步配置 PDF.js Worker（立即执行，不等待测试）
 * 优先使用 CDN（最快，MIME 类型正确）
 */
export function configurePDFWorkerSync() {
  if (typeof window === 'undefined') {
    return
  }

  if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
    return
  }

  // 优先使用第一个 CDN（最快，MIME 类型正确）
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDNS[0]
  console.log('📌 PDF.js Worker: Configured (sync) -', WORKER_CDNS[0])
  
  // 异步测试并优化配置（如果需要）
  configurePDFWorker().catch(err => {
    console.warn('PDF.js Worker async configuration failed:', err)
  })
}

// 自动配置（立即执行同步版本）
configurePDFWorkerSync()

// 导出配置函数供组件使用
export default configurePDFWorker

