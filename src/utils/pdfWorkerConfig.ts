import * as pdfjsLib from 'pdfjs-dist'

/**
 * 配置 PDF.js Worker
 * 强制使用 CDN 确保在生产环境中正常工作
 * 避免服务器 MIME type 配置问题
 */
export function configurePDFWorker() {
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // 检查是否为开发环境
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname === ''
    
    if (isDevelopment) {
      // 开发环境：尝试使用本地 worker
      try {
        const workerUrl = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).href
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
        console.log('✅ PDF.js Worker: Using LOCAL -', workerUrl)
      } catch (error) {
        // 开发环境失败也用 CDN
        const cdnUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl
        console.log('⚠️ PDF.js Worker: Fallback to CDN -', cdnUrl)
      }
    } else {
      // 生产环境：强制使用 CDN
      const cdnUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl
      console.log('🌐 PDF.js Worker: Using CDN (Production) -', cdnUrl)
      console.log('📌 This avoids server MIME type configuration issues')
    }
  }
}

// 自动配置
configurePDFWorker()

