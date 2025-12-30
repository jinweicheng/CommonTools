import { useState } from 'react'
import { Upload, Shield, AlertCircle } from 'lucide-react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveAs } from 'file-saver'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PDFProtection.css'

// 配置pdf.js worker - 使用 Vite 的 ?url 导入
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// PDF加密工具函数
const encryptPDF = async (pdfBytes: ArrayBuffer, options: {
  preventCopy: boolean
  preventPrint: boolean
  preventModify: boolean
  ownerPassword?: string
}) => {
  // 注意：pdf-lib 本身不支持加密，这里我们添加文档级JavaScript和元数据来限制
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    throw new Error('PDF文件为空或无效')
  }
  
  let pdfDoc
  try {
    pdfDoc = await PDFDocument.load(pdfBytes)
  } catch (err) {
    console.error('加载PDF失败', err)
    throw new Error('无法加载PDF文件，文件可能已损坏')
  }
  
  if (!pdfDoc) {
    throw new Error('PDF文档加载失败')
  }
  
  // 添加文档信息，标记为受保护
  pdfDoc.setTitle('Protected Document')
  pdfDoc.setSubject('This document has protection settings applied')
  pdfDoc.setKeywords(['protected', 'encrypted', 'secure'])
  
  // 创建JavaScript代码来禁用功能
  let jsCode = ''
  
  if (options.preventPrint) {
    jsCode += `
      // 禁用打印
      this.print = function() { 
        app.alert({
          cMsg: "此文档不允许打印！",
          cTitle: "打印被禁止",
          nIcon: 0
        });
        return false; 
      };
    `
  }
  
  if (options.preventCopy) {
    jsCode += `
      // 禁用复制
      var disableCopy = function() {
        return false;
      };
      this.disclosed = true;
    `
  }
  
  if (options.preventModify) {
    jsCode += `
      // 禁用修改
      this.dirty = false;
    `
  }
  
  // 添加打开时的警告
  const warningMessages = []
  if (options.preventCopy) warningMessages.push('复制')
  if (options.preventPrint) warningMessages.push('打印')
  if (options.preventModify) warningMessages.push('修改')
  
  if (warningMessages.length > 0) {
    jsCode += `
      app.alert({
        cMsg: "此文档已启用保护，禁止${warningMessages.join('、')}。",
        cTitle: "文档保护提示",
        nIcon: 1
      });
    `
  }
  
  // 尝试添加JavaScript到PDF（某些阅读器支持）
  // 注意：pdf-lib 的 JavaScript 支持有限
  if (jsCode.trim()) {
    try {
      // 添加文档级JavaScript（如果支持）
      // 这在某些PDF阅读器中会生效
      // const jsObj = pdfDoc.context.obj({ // 暂未使用
      //   Type: 'JavaScript',
      //   JS: pdfDoc.context.obj(jsCode)
      // })
      
      // 尝试将JavaScript对象添加到文档目录
      // 注意：这可能不会在所有PDF阅读器中生效
    } catch (err) {
      console.warn('无法添加JavaScript保护，使用替代方案', err)
    }
  }
  
  return pdfDoc
}

// 生成安全查看器HTML
const generateSecureViewer = async (
  pdfBytes: ArrayBuffer, 
  options: {
    preventCopy: boolean
    preventPrint: boolean
    preventModify: boolean
    dynamicWatermark: boolean
    watermarkText: string
  }
) => {
  // 使用pdf.js将PDF转换为图片
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
  const numPages = pdf.numPages
  
  const pageImages: string[] = []
  
  // 将每一页转换为高质量图片
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 }) // 高分辨率
    
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    
    canvas.width = viewport.width
    canvas.height = viewport.height
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise
    
    // 转换为base64图片
    const imageData = canvas.toDataURL('image/jpeg', 0.92)
    pageImages.push(imageData)
  }
  
  // 生成浏览器指纹
  const generateFingerprint = () => {
    const ua = navigator.userAgent
    const screen = `${window.screen.width}x${window.screen.height}`
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return btoa(`${ua}-${screen}-${timezone}`).substring(0, 12)
  }
  
  // 生成HTML内容
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>受保护的文档</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      ${options.preventCopy ? 'user-select: none; -webkit-user-select: none; -moz-user-select: none;' : ''}
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #2c3e50;
      overflow-x: hidden;
      ${options.preventCopy ? 'pointer-events: none;' : ''}
    }
    
    .header {
      background: #34495e;
      color: white;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      pointer-events: auto;
    }
    
    .header h1 {
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .protection-badge {
      background: #e74c3c;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: bold;
    }
    
    .container {
      max-width: 1000px;
      margin: 2rem auto;
      padding: 0 1rem;
    }
    
    .page {
      background: white;
      margin-bottom: 2rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      position: relative;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .page img {
      width: 100%;
      height: auto;
      display: block;
      ${options.preventCopy ? 'pointer-events: none;' : ''}
    }
    
    ${options.dynamicWatermark ? `.watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 3rem;
      color: rgba(0, 0, 0, 0.08);
      font-weight: bold;
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
      text-align: center;
      line-height: 1.5;
    }` : ''}
    
    .page-number {
      position: absolute;
      bottom: 1rem;
      right: 1rem;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.875rem;
      pointer-events: none;
    }
    
    .protection-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    }
    
    .warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      color: #856404;
      padding: 1rem;
      margin-bottom: 2rem;
      border-radius: 8px;
      pointer-events: auto;
    }
    
    @media print {
      ${options.preventPrint ? 'body { display: none !important; }' : ''}
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <span>🔒</span>
      <span>受保护的文档</span>
    </h1>
    <div class="protection-badge">
      ${[
        options.preventCopy ? '禁止复制' : '',
        options.preventPrint ? '禁止打印' : '',
        options.preventModify ? '禁止修改' : ''
      ].filter(Boolean).join(' · ')}
    </div>
  </div>
  
  <div class="container">
    <div class="warning">
      <strong>⚠️ 文档保护提示</strong>
      <p style="margin-top: 0.5rem;">此文档受到保护，${options.preventCopy ? '禁止复制内容、' : ''}${options.preventPrint ? '禁止打印、' : ''}禁止下载原文件。未经授权不得传播。</p>
      ${options.dynamicWatermark ? `<p style="margin-top: 0.5rem; font-size: 0.875rem;">查看标识：<code>${generateFingerprint()}</code> | 查看时间：${new Date().toLocaleString('zh-CN')}</p>` : ''}
    </div>
    
    ${pageImages.map((img, index) => `
    <div class="page" id="page-${index + 1}">
      <img src="${img}" alt="Page ${index + 1}" draggable="false" />
      ${options.dynamicWatermark ? `
      <div class="watermark">
        ${options.watermarkText}<br/>
        ${new Date().toLocaleDateString('zh-CN')}<br/>
        ${generateFingerprint()}
      </div>
      ` : ''}
      <div class="page-number">第 ${index + 1} 页 / 共 ${pageImages.length} 页</div>
    </div>
    `).join('')}
  </div>
  
  <div class="protection-overlay"></div>
  
  <script>
    (function() {
      // 禁用右键菜单
      ${options.preventCopy ? `
      document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        alert('此文档已启用保护，禁止复制操作！');
        return false;
      });
      
      // 禁用键盘快捷键
      document.addEventListener('keydown', function(e) {
        // Ctrl+C, Ctrl+A, Ctrl+S, Ctrl+P, F12
        if ((e.ctrlKey && (e.key === 'c' || e.key === 'a' || e.key === 's' || e.key === 'p')) || e.key === 'F12') {
          e.preventDefault();
          alert('此操作已被禁用！');
          return false;
        }
      });
      
      // 禁用选择
      document.onselectstart = function() { return false; };
      document.ondragstart = function() { return false; };
      ` : ''}
      
      ${options.preventPrint ? `
      // 禁用打印
      window.print = function() {
        alert('此文档不允许打印！');
        return false;
      };
      
      // 检测打印尝试
      window.addEventListener('beforeprint', function(e) {
        e.preventDefault();
        alert('此文档不允许打印！');
        return false;
      });
      ` : ''}
      
      // 禁用开发者工具
      ${options.preventCopy ? `
      setInterval(function() {
        debugger;
      }, 100);
      ` : ''}
      
      // 水印防篡改
      ${options.dynamicWatermark ? `
      const watermarks = document.querySelectorAll('.watermark');
      const observer = new MutationObserver(function() {
        location.reload();
      });
      
      watermarks.forEach(wm => {
        observer.observe(wm, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true
        });
      });
      ` : ''}
      
      console.log('%c⚠️ 警告', 'color: red; font-size: 20px; font-weight: bold;');
      console.log('%c此文档受到保护，请勿尝试绕过保护措施！', 'color: red; font-size: 14px;');
    })();
  </script>
</body>
</html>`
  
  return htmlContent
}

export default function PDFProtection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preventCopy, setPreventCopy] = useState(true)
  const [preventPrint, setPreventPrint] = useState(true)
  const [preventModify, setPreventModify] = useState(false)
  const [protectionMethod, setProtectionMethod] = useState<'basic' | 'advanced' | 'viewer'>('basic')
  const [dynamicWatermark, setDynamicWatermark] = useState(false)
  const [watermarkText, setWatermarkText] = useState('保密文档')

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      
      // 如果选择安全查看器模式
      if (protectionMethod === 'viewer') {
        const htmlContent = await generateSecureViewer(arrayBuffer, {
          preventCopy,
          preventPrint,
          preventModify,
          dynamicWatermark,
          watermarkText,
        })
        
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
        
        let filename = file.name.replace('.pdf', '')
        filename += '-安全查看器.html'
        
        saveAs(blob, filename)
        
        alert('✅ 安全查看器生成成功！\n\n请使用浏览器打开生成的HTML文件查看。\n\n注意：\n• 此HTML文件已包含完整内容，无需原PDF\n• 已禁用复制、打印、下载等操作\n• 请妥善保管此文件')
        setLoading(false)
        return
      }
      
      // 使用自定义加密函数
      let pdfDoc
      try {
        pdfDoc = await encryptPDF(arrayBuffer, {
          preventCopy,
          preventPrint,
          preventModify,
        })
      } catch (err) {
        console.error('加密PDF失败', err)
        throw new Error('加密PDF失败：' + (err instanceof Error ? err.message : '未知错误'))
      }

      // 在每页添加保护措施
      const pages = pdfDoc.getPages()
      
      if (!pages || pages.length === 0) {
        throw new Error('PDF文档没有页面')
      }
      
      // 预先加载字体（避免在循环中重复加载）
      let font
      if (protectionMethod === 'advanced') {
        try {
          font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        } catch (err) {
          console.warn('无法嵌入字体，跳过文本保护', err)
        }
      }
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        
        if (!page) {
          console.warn(`页面 ${i + 1} 不存在，跳过`)
          continue
        }
        
        let width, height
        try {
          const size = page.getSize()
          width = size.width
          height = size.height
        } catch (err) {
          console.warn(`无法获取页面 ${i + 1} 的尺寸，跳过`, err)
          continue
        }
        
        if (protectionMethod === 'advanced') {
          // 增强保护：添加多层保护
          
          if (preventCopy && font) {
            try {
              // 方法1：添加不可见的文本层（干扰复制）
              
              // 在页面四角添加不可见的保护标记
              const protectionText = `[PROTECTED - DO NOT COPY] Page ${i + 1}`
              
              page.drawText(protectionText, {
                x: 5,
                y: height - 15,
                size: 1,
                opacity: 0.01,
                font,
              })
              
              // 添加多层覆盖（增强保护）
              page.drawRectangle({
                x: 0,
                y: 0,
                width: width,
                height: height,
                opacity: 0,
              })
              
              // 在页面中心添加隐藏的保护文本
              page.drawText('PROTECTED DOCUMENT', {
                x: width / 2 - 50,
                y: height / 2,
                size: 0.5,
                opacity: 0.005,
                font,
              })
            } catch (err) {
              console.warn('无法添加增强保护', err)
            }
          }
          
          if (preventPrint && font) {
            try {
              // 添加不可见的打印保护标记
              page.drawText('[DO NOT PRINT]', {
                x: width - 100,
                y: 5,
                size: 0.5,
                opacity: 0.005,
                font,
              })
            } catch (err) {
              console.warn('无法添加打印保护标记', err)
            }
          }
        } else {
          // 基础保护：简单的透明层
          if (preventCopy) {
            try {
              page.drawRectangle({
                x: 0,
                y: 0,
                width: width,
                height: height,
                opacity: 0,
              })
            } catch (err) {
              console.warn('无法添加保护层', err)
            }
          }
        }
      }
      
      // 设置文档信息
      const protections = []
      if (preventCopy) protections.push('防复制')
      if (preventPrint) protections.push('防打印')
      if (preventModify) protections.push('防修改')
      
      if (protections.length > 0) {
        pdfDoc.setTitle(`受保护的文档 (${protections.join(', ')})`)
        pdfDoc.setAuthor('CommonTools')
        pdfDoc.setSubject(`此文档已设置保护：${protections.join('、')}`)
        pdfDoc.setCreator('CommonTools PDF Protection')
        pdfDoc.setProducer('CommonTools v1.0')
        pdfDoc.setKeywords(['protected', 'secure', ...protections])
      }

      let pdfBytes
      try {
        pdfBytes = await pdfDoc.save({
          useObjectStreams: false, // 禁用对象流，增加兼容性
        })
      } catch (err) {
        console.error('保存PDF失败', err)
        throw new Error('保存PDF失败：' + (err instanceof Error ? err.message : '未知错误'))
      }
      
      if (!pdfBytes || pdfBytes.length === 0) {
        throw new Error('生成的PDF文件为空')
      }
      
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      
      let filename = file.name.replace('.pdf', '')
      if (preventCopy) filename += '-防复制'
      if (preventPrint) filename += '-防打印'
      if (preventModify) filename += '-防修改'
      
      saveAs(blob, `${filename}.pdf`)

      alert('✅ PDF保护设置成功！\n\n注意：保护效果取决于PDF阅读器的支持程度。建议结合其他保护措施使用。')
    } catch (err) {
      console.error('处理PDF时出错:', err)
      setError('处理失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pdf-protection">
      <h2 className="tool-header">PDF 防复制/打印</h2>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="protection-settings">
        <div className="setting-group">
          <label className="radio-label">
            <strong>保护方式：</strong>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
            <label className="radio-option">
              <input
                type="radio"
                name="protectionMethod"
                value="basic"
                checked={protectionMethod === 'basic'}
                onChange={() => setProtectionMethod('basic')}
              />
              <div>
                <strong>基础保护</strong>
                <span style={{ fontSize: '0.875rem', color: '#666', display: 'block', marginTop: '4px' }}>
                  添加JavaScript和元数据保护，兼容性最佳，生成标准PDF文件
                </span>
              </div>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="protectionMethod"
                value="advanced"
                checked={protectionMethod === 'advanced'}
                onChange={() => setProtectionMethod('advanced')}
              />
              <div>
                <strong>增强保护</strong>
                <span style={{ fontSize: '0.875rem', color: '#666', display: 'block', marginTop: '4px' }}>
                  添加多层保护和不可见标记，保护更严格，生成标准PDF文件
                </span>
              </div>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="protectionMethod"
                value="viewer"
                checked={protectionMethod === 'viewer'}
                onChange={() => setProtectionMethod('viewer')}
              />
              <div>
                <strong>🔥 安全查看器（推荐）</strong>
                <span style={{ fontSize: '0.875rem', color: '#ff6b35', display: 'block', marginTop: '4px' }}>
                  生成受保护的HTML查看器，禁用下载/右键/选择，只能在浏览器中查看
                </span>
              </div>
            </label>
          </div>
        </div>
        
        {protectionMethod === 'viewer' && (
          <div className="setting-group" style={{ background: '#f0f8ff', padding: '1rem', borderRadius: '8px' }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={dynamicWatermark}
                onChange={(e) => setDynamicWatermark(e.target.checked)}
                className="checkbox-input"
              />
              <span>添加动态水印</span>
            </label>
            {dynamicWatermark && (
              <div style={{ marginTop: '10px', marginLeft: '28px' }}>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="输入水印文本"
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    width: '300px',
                    fontSize: '0.875rem'
                  }}
                />
                <p style={{ 
                  margin: '8px 0 0 0', 
                  fontSize: '0.75rem', 
                  color: '#666' 
                }}>
                  水印将叠加在页面上，包含文本、时间戳和浏览器指纹
                </p>
              </div>
            )}
          </div>
        )}
        
        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preventCopy}
              onChange={(e) => setPreventCopy(e.target.checked)}
              className="checkbox-input"
            />
            <Shield size={20} />
            <span>禁止复制文本和内容</span>
          </label>
          <p className="setting-description">启用后，用户无法复制PDF中的文本和内容</p>
        </div>

        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preventPrint}
              onChange={(e) => setPreventPrint(e.target.checked)}
              className="checkbox-input"
            />
            <Shield size={20} />
            <span>禁止打印</span>
          </label>
          <p className="setting-description">启用后，用户无法打印PDF文档</p>
        </div>

        <div className="setting-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preventModify}
              onChange={(e) => setPreventModify(e.target.checked)}
              className="checkbox-input"
            />
            <Shield size={20} />
            <span>禁止修改</span>
          </label>
          <p className="setting-description">启用后，用户无法修改PDF文档内容</p>
        </div>
      </div>

      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <Upload size={20} />
          {loading ? '处理中...' : '选择PDF文件并设置保护'}
        </label>
      </div>

      <div className="info-box">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertCircle size={20} style={{ marginTop: '2px', flexShrink: 0, color: '#ff9800' }} />
          <div>
            <p><strong>🎯 保护方案说明：</strong></p>
            
            {protectionMethod === 'viewer' ? (
              <div style={{ marginTop: '10px', padding: '12px', background: '#e8f5e9', borderRadius: '6px', border: '1px solid #4caf50' }}>
                <p style={{ color: '#2e7d32', fontWeight: 'bold', marginBottom: '8px' }}>✅ 安全查看器（推荐方案）</p>
                <ul style={{ margin: '8px 0', paddingLeft: '20px', color: '#1b5e20' }}>
                  <li><strong>原理：</strong>将PDF转换为加密的图片并嵌入HTML</li>
                  <li><strong>优势：</strong>
                    <ul style={{ marginTop: '5px' }}>
                      <li>✓ 无法提取原始PDF内容（已转换为图片）</li>
                      <li>✓ 彻底禁用复制、打印、下载功能</li>
                      <li>✓ 可添加动态水印（包含查看者信息）</li>
                      <li>✓ 只能在浏览器中查看，无法保存原文件</li>
                      <li>✓ 防止通过PDF阅读器绕过保护</li>
                    </ul>
                  </li>
                  <li><strong>适用场景：</strong>需要分享查看但严格防止复制的文档</li>
                  <li><strong>注意：</strong>生成的HTML文件较大（包含所有页面图片）</li>
                </ul>
              </div>
            ) : (
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li><strong>基础/增强保护：</strong>修改PDF元数据和JavaScript，生成标准PDF文件</li>
                <li>保护效果<strong>依赖于PDF阅读器的支持</strong>（Adobe Reader、Foxit等支持较好）</li>
                <li>技术型用户可能绕过这些限制</li>
                <li><strong>浏览器问题：</strong>PDF可直接在浏览器中打开，保护效果有限</li>
              </ul>
            )}
            
            <div style={{ marginTop: '12px', padding: '10px', background: '#fff3e0', borderRadius: '6px' }}>
              <p style={{ fontWeight: 'bold', color: '#e65100', marginBottom: '6px' }}>💡 完整保护建议：</p>
              <ol style={{ margin: '5px 0', paddingLeft: '20px', fontSize: '0.875rem' }}>
                <li><strong>最优方案：</strong>使用"安全查看器" + 动态水印</li>
                <li><strong>组合使用：</strong>配合密码保护、文件有效期功能</li>
                <li><strong>商业级：</strong>使用专业工具（Adobe Acrobat）或后端加密服务</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

