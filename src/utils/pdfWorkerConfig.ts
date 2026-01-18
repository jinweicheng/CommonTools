import * as pdfjsLib from 'pdfjs-dist'

/**
 * PDF.js Worker 配置
 * 优先使用本地 worker（避免 CSP 问题），CDN 作为降级方案
 * 
 * 策略：
 * - 开发环境：使用 public 目录的 worker 文件（/pdf.worker.min.mjs）
 * - 生产环境：使用 public 目录的 worker 文件（带 base path）
 * - 降级：如果都失败，尝试 CDN（可能被 CSP 阻止）
 */

const WORKER_CDNS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
]

/**
 * 获取本地 Worker URL（从 public 目录）
 * 支持本地开发和生产环境
 */
function getLocalWorkerUrl(): string {
  // 本地开发环境：Vite 的 public 目录文件在根路径
  if (import.meta.env.DEV) {
    return '/pdf.worker.min.mjs'
  }
  
  // 生产环境：根据 base path 构建 URL
  const basePath = import.meta.env.BASE_URL || '/tools/'
  // 移除末尾的斜杠（如果有）
  const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return `${cleanBasePath}/pdf.worker.min.mjs`
}

/**
 * 测试 Worker URL 是否可用（快速测试，默认3秒超时）
 * 在开发环境中，即使测试失败也允许使用（让 PDF.js 自己尝试加载）
 */
async function testWorkerUrl(url: string, timeout: number = 3000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    // 使用 GET 请求，只读取前几个字节来测试文件是否存在
    const response = await fetch(url, { 
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal,
      headers: {
        'Range': 'bytes=0-100' // 只请求前100字节，节省带宽
      }
    })
    
    clearTimeout(timeoutId)
    
    // 在开发环境中，只要响应状态是 200 或 206（部分内容），就认为可用
    if (import.meta.env.DEV) {
      return response.ok || response.status === 206
    }
    
    // 生产环境：检查 MIME 类型和状态码
    const contentType = response.headers.get('content-type') || ''
    const isValidJS = contentType.includes('javascript') || 
                      contentType.includes('text/javascript') ||
                      contentType.includes('application/javascript') ||
                      contentType.includes('application/octet-stream') ||
                      contentType.includes('text/plain') // 某些服务器可能返回这个
    return (response.ok || response.status === 206) && isValidJS
  } catch (err) {
    // 在开发环境中，对于本地路径，即使测试失败也允许尝试（Vite 可能无法通过 Range 请求测试）
    if (import.meta.env.DEV && (url.startsWith('/') || url.startsWith(window.location.origin))) {
      return true
    }
    return false
  }
}

/**
 * 配置 PDF.js Worker（带重试机制）
 * 优先使用本地 worker（避免 CSP 问题），CDN 作为降级
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

  // 1. 优先尝试本地 worker（避免 CSP 问题）
  // 在开发环境中，尝试多个可能的路径
  if (import.meta.env.DEV) {
    // 开发环境：尝试多个路径
    const devPaths = [
      '/pdf.worker.min.mjs',  // public 目录（标准路径）
      new URL('/pdf.worker.min.mjs', window.location.origin).href  // 完整 URL
    ]

    for (const devUrl of devPaths) {
      try {
        // 快速测试文件是否存在
        const isAvailable = await testWorkerUrl(devUrl, 2000)
        if (isAvailable) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = devUrl
          console.log('✅ PDF.js Worker: Using LOCAL (dev) -', devUrl)
          return true
        }
      } catch {
        // 继续尝试下一个路径
        continue
      }
    }
    
    // 如果测试都失败，仍然使用 public 目录路径（让 PDF.js 自己尝试加载）
    // 这可能是因为 Vite 开发服务器对某些文件类型的处理方式不同
    const fallbackUrl = '/pdf.worker.min.mjs'
    pdfjsLib.GlobalWorkerOptions.workerSrc = fallbackUrl
    console.log('✅ PDF.js Worker: Using LOCAL (dev fallback) -', fallbackUrl)
    return true
  }

  // 生产环境：尝试多个本地路径
  const localPaths = [
    getLocalWorkerUrl(),  // 带 base path
    '/pdf.worker.min.mjs'   // 根路径（某些服务器配置）
  ]

  for (const localUrl of localPaths) {
    try {
      const isAvailable = await testWorkerUrl(localUrl, 3000)
      if (isAvailable) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = localUrl
        console.log('✅ PDF.js Worker: Using LOCAL -', localUrl)
        return true
      }
    } catch (err) {
      // 继续尝试下一个路径
      continue
    }
  }

  // 2. 本地 worker 失败，尝试 CDN（降级方案，可能被 CSP 阻止）
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

  // 3. 所有方案都失败，使用本地 worker 作为默认值（即使测试失败也尝试）
  const fallbackUrl = getLocalWorkerUrl()
  pdfjsLib.GlobalWorkerOptions.workerSrc = fallbackUrl
  console.warn('⚠️ PDF.js Worker: All tests failed, using local worker as fallback -', fallbackUrl)
  return false
}

/**
 * 同步配置 PDF.js Worker（立即执行，不等待测试）
 * 优先使用本地 worker（避免 CSP 问题）
 * 在开发环境中直接使用，不等待测试
 */
export function configurePDFWorkerSync() {
  if (typeof window === 'undefined') {
    return
  }

  if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
    return
  }

  // 优先使用本地 worker（避免 CSP 问题）
  // 开发环境：直接使用根路径（Vite public 目录）
  // 生产环境：使用带 base path 的路径
  const localUrl = import.meta.env.DEV 
    ? '/pdf.worker.min.mjs'
    : getLocalWorkerUrl()
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = localUrl
  console.log('📌 PDF.js Worker: Configured (sync) -', localUrl)
  
  // 在开发环境中，不进行异步测试（直接使用）
  // 在生产环境中，异步测试并优化配置
  if (!import.meta.env.DEV) {
    configurePDFWorker().catch(err => {
      console.warn('PDF.js Worker async configuration failed:', err)
    })
  }
}

// 自动配置（立即执行同步版本）
configurePDFWorkerSync()

// 导出配置函数供组件使用
export default configurePDFWorker

