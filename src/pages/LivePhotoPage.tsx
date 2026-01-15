import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import LivePhotoConverter from '../components/LivePhotoConverter'
import { useI18n } from '../i18n/I18nContext'
import './LivePhotoPage.css'

export default function LivePhotoPage() {
  const { t, language } = useI18n()
  const [showFeatures, setShowFeatures] = useState(false)
  const [activeTab, setActiveTab] = useState<'converter' | 'guide' | 'faq'>('converter')
  
  // 页面加载动画
  useEffect(() => {
    const timer = setTimeout(() => setShowFeatures(true), 300)
    return () => clearTimeout(timer)
  }, [])

  // SEO 元数据
  const pageTitle = language === 'zh-CN' 
    ? 'Live Photo 转换 - MOV转GIF/MP4 - 免费在线工具'
    : 'Live Photo Converter - MOV to GIF/MP4 - Free Online Tool'
  
  const pageDescription = language === 'zh-CN'
    ? '免费的 Live Photo 转换工具。将 iPhone Live Photo (HEIC + MOV) 转换为 GIF 或 MP4 格式。支持批量处理，无需上传，本地转换，保护隐私。'
    : 'Free Live Photo converter. Convert iPhone Live Photos (HEIC + MOV) to GIF or MP4 format. Supports batch processing, no upload required, local conversion, privacy protected.'

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={language === 'zh-CN' 
          ? 'Live Photo转换,MOV转GIF,MOV转MP4,HEIC转JPG,iPhone照片转换,在线转换工具'
          : 'Live Photo converter,MOV to GIF,MOV to MP4,HEIC to JPG,iPhone photo converter,online conversion tool'
        } />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="live-photo-page">
        {/* 页面头部 */}
        <div className="page-header">
          <h1>
            <span className="title-emoji">📸</span>
            <span className="title-text">{t('livePhoto.title')}</span>
          </h1>
          <p className="page-subtitle">{t('livePhoto.subtitle')}</p>
        </div>

        {/* 标签导航 */}
        <div className="live-photo-tabs">
          <button
            className={`tab-button ${activeTab === 'converter' ? 'active' : ''}`}
            onClick={() => setActiveTab('converter')}
            aria-label={language === 'zh-CN' ? '转换工具' : 'Converter'}
          >
            <span className="tab-icon">🔄</span>
            <span>{language === 'zh-CN' ? '转换工具' : 'Converter'}</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
            aria-label={language === 'zh-CN' ? '使用指南' : 'Guide'}
          >
            <span className="tab-icon">📖</span>
            <span>{language === 'zh-CN' ? '使用指南' : 'Guide'}</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}
            onClick={() => setActiveTab('faq')}
            aria-label={language === 'zh-CN' ? '常见问题' : 'FAQ'}
          >
            <span className="tab-icon">❓</span>
            <span>{language === 'zh-CN' ? '常见问题' : 'FAQ'}</span>
          </button>
        </div>

        {/* 转换器内容 */}
        {activeTab === 'converter' && (
          <div className="tab-content fade-in">
            <LivePhotoConverter />
            
            {/* 特性展示 */}
            {showFeatures && (
              <div className="features-section fade-in-up">
                <h2 className="features-title">
                  {language === 'zh-CN' ? '✨ 核心特性' : '✨ Key Features'}
                </h2>
                <div className="features-grid">
                  <div className="feature-card">
                    <div className="feature-icon">🔒</div>
                    <h3>{language === 'zh-CN' ? '隐私保护' : 'Privacy Protected'}</h3>
                    <p>
                      {language === 'zh-CN' 
                        ? '100% 本地转换，文件不上传服务器，保护您的隐私安全'
                        : '100% local conversion, files not uploaded to server, protecting your privacy'
                      }
                    </p>
                  </div>
                  
                  <div className="feature-card">
                    <div className="feature-icon">⚡</div>
                    <h3>{language === 'zh-CN' ? '快速高效' : 'Fast & Efficient'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '使用 WebAssembly 技术，转换速度快，5秒视频约需10秒'
                        : 'Using WebAssembly technology, fast conversion, 5s video takes ~10s'
                      }
                    </p>
                  </div>
                  
                  <div className="feature-card">
                    <div className="feature-icon">🎨</div>
                    <h3>{language === 'zh-CN' ? '灵活配置' : 'Flexible Settings'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '支持自定义质量、帧率、尺寸，满足不同场景需求'
                        : 'Supports custom quality, frame rate, size for different scenarios'
                      }
                    </p>
                  </div>
                  
                  <div className="feature-card">
                    <div className="feature-icon">🌐</div>
                    <h3>{language === 'zh-CN' ? '跨平台支持' : 'Cross-Platform'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '支持所有现代浏览器，Windows、Mac、iOS、Android 均可使用'
                        : 'Supports all modern browsers, works on Windows, Mac, iOS, Android'
                      }
                    </p>
                  </div>
                  
                  <div className="feature-card">
                    <div className="feature-icon">💰</div>
                    <h3>{language === 'zh-CN' ? '完全免费' : 'Completely Free'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '无需注册，无需付费，无限次使用，无水印'
                        : 'No registration, no payment, unlimited use, no watermark'
                      }
                    </p>
                  </div>
                  
                  <div className="feature-card">
                    <div className="feature-icon">📦</div>
                    <h3>{language === 'zh-CN' ? '批量处理' : 'Batch Processing'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '支持同时处理多个文件，提高工作效率'
                        : 'Supports processing multiple files simultaneously, improving efficiency'
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 使用指南 */}
        {activeTab === 'guide' && (
          <div className="tab-content fade-in">
            <div className="guide-section">
              <h2>{language === 'zh-CN' ? '📖 使用指南' : '📖 User Guide'}</h2>
              
              <div className="guide-steps">
                <div className="guide-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3>{language === 'zh-CN' ? '上传文件' : 'Upload Files'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '点击"上传 MOV"按钮，选择您的 Live Photo 视频文件（.MOV 格式）。如果需要转换静态照片，也可以上传 HEIC 文件。'
                        : 'Click "Upload MOV" button, select your Live Photo video file (.MOV format). If you need to convert static photos, you can also upload HEIC files.'
                      }
                    </p>
                  </div>
                </div>
                
                <div className="guide-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>{language === 'zh-CN' ? '选择格式' : 'Choose Format'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '选择目标格式：GIF（推荐，兼容性好）或 MP4（需要浏览器支持）。GIF 适合分享到社交媒体，MP4 文件更小。'
                        : 'Choose target format: GIF (recommended, better compatibility) or MP4 (requires browser support). GIF is suitable for sharing on social media, MP4 files are smaller.'
                      }
                    </p>
                  </div>
                </div>
                
                <div className="guide-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>{language === 'zh-CN' ? '调整设置（可选）' : 'Adjust Settings (Optional)'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '点击"高级设置"可以调整质量（1-20）、帧率（5-30 FPS）和宽度（240-1080px）。默认设置已经平衡了质量和文件大小。'
                        : 'Click "Advanced Settings" to adjust quality (1-20), frame rate (5-30 FPS), and width (240-1080px). Default settings already balance quality and file size.'
                      }
                    </p>
                    <div className="settings-tips">
                      <div className="tip-item">
                        <strong>{language === 'zh-CN' ? '质量：' : 'Quality:'}</strong>
                        {language === 'zh-CN' ? '越小越好（但文件越大），建议 5-15' : 'Lower is better (but larger file), recommend 5-15'}
                      </div>
                      <div className="tip-item">
                        <strong>{language === 'zh-CN' ? '帧率：' : 'Frame Rate:'}</strong>
                        {language === 'zh-CN' ? '越高越流畅（但文件越大），建议 8-12 FPS' : 'Higher is smoother (but larger file), recommend 8-12 FPS'}
                      </div>
                      <div className="tip-item">
                        <strong>{language === 'zh-CN' ? '宽度：' : 'Width:'}</strong>
                        {language === 'zh-CN' ? '越大越清晰（但文件越大），建议 320-640px' : 'Larger is clearer (but larger file), recommend 320-640px'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="guide-step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>{language === 'zh-CN' ? '开始转换' : 'Start Conversion'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '点击"转换"按钮，等待转换完成。转换过程在您的浏览器中进行，通常需要 5-20 秒。您可以看到实时进度。'
                        : 'Click "Convert" button and wait for completion. Conversion happens in your browser, usually takes 5-20 seconds. You can see real-time progress.'
                      }
                    </p>
                  </div>
                </div>
                
                <div className="guide-step">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h3>{language === 'zh-CN' ? '下载结果' : 'Download Result'}</h3>
                    <p>
                      {language === 'zh-CN'
                        ? '转换完成后，点击"下载"按钮保存文件到您的设备。您可以预览转换结果后再下载。'
                        : 'After conversion, click "Download" button to save the file to your device. You can preview the result before downloading.'
                      }
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="guide-tips">
                <h3>{language === 'zh-CN' ? '💡 使用技巧' : '💡 Usage Tips'}</h3>
                <ul>
                  <li>
                    {language === 'zh-CN'
                      ? '推荐使用 Chrome、Edge 或 Safari 浏览器以获得最佳性能'
                      : 'Recommend using Chrome, Edge, or Safari for best performance'
                    }
                  </li>
                  <li>
                    {language === 'zh-CN'
                      ? '对于长视频（>10秒），建议降低帧率和宽度以减少文件大小'
                      : 'For long videos (>10s), recommend reducing frame rate and width to reduce file size'
                    }
                  </li>
                  <li>
                    {language === 'zh-CN'
                      ? '如果转换失败，尝试刷新页面或使用不同的浏览器'
                      : 'If conversion fails, try refreshing the page or using a different browser'
                    }
                  </li>
                  <li>
                    {language === 'zh-CN'
                      ? '所有转换在本地完成，关闭页面不会影响已下载的文件'
                      : 'All conversions are done locally, closing the page will not affect downloaded files'
                    }
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 常见问题 */}
        {activeTab === 'faq' && (
          <div className="tab-content fade-in">
            <div className="faq-section">
              <h2>{language === 'zh-CN' ? '❓ 常见问题' : '❓ Frequently Asked Questions'}</h2>
              
              <div className="faq-list">
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '什么是 Live Photo？' : 'What is a Live Photo?'}</summary>
                  <p>
                    {language === 'zh-CN'
                      ? 'Live Photo 是 Apple 设备上的一种照片格式，包含一张静态照片（HEIC 格式）和一段 3 秒左右的短视频（MOV 格式）。拍摄时，会记录按下快门前后 1.5 秒的动作和声音。'
                      : 'Live Photo is a photo format on Apple devices that includes a static photo (HEIC format) and a short video of about 3 seconds (MOV format). When shooting, it records 1.5 seconds of motion and sound before and after pressing the shutter.'
                    }
                  </p>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '为什么需要转换 Live Photo？' : 'Why convert Live Photos?'}</summary>
                  <p>
                    {language === 'zh-CN'
                      ? 'Live Photo 的 MOV 格式在非 Apple 设备上可能无法正常播放。转换为 GIF 或 MP4 格式后，可以在任何设备和平台上分享和查看，包括 Windows、Android、社交媒体等。'
                      : 'Live Photo MOV format may not play properly on non-Apple devices. After converting to GIF or MP4 format, it can be shared and viewed on any device and platform, including Windows, Android, social media, etc.'
                    }
                  </p>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? 'GIF 和 MP4 有什么区别？' : 'What is the difference between GIF and MP4?'}</summary>
                  <div>
                    <p>{language === 'zh-CN' ? '两种格式各有优势：' : 'Both formats have their advantages:'}</p>
                    <ul>
                      <li>
                        <strong>GIF：</strong>
                        {language === 'zh-CN'
                          ? '兼容性最好，所有设备和浏览器都支持，适合分享到社交媒体。但文件较大，质量略低。'
                          : 'Best compatibility, supported by all devices and browsers, suitable for sharing on social media. But larger file size and slightly lower quality.'
                        }
                      </li>
                      <li>
                        <strong>MP4：</strong>
                        {language === 'zh-CN'
                          ? '文件更小，质量更高，适合存储和分享。但需要浏览器支持 FFmpeg WASM，可能会初始化失败。'
                          : 'Smaller file size, higher quality, suitable for storage and sharing. But requires browser support for FFmpeg WASM, may fail to initialize.'
                        }
                      </li>
                    </ul>
                    <p className="recommendation">
                      <strong>{language === 'zh-CN' ? '推荐：' : 'Recommendation:'}</strong>
                      {language === 'zh-CN' ? '优先使用 GIF 格式' : 'Prefer GIF format'}
                    </p>
                  </div>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '转换需要多长时间？' : 'How long does conversion take?'}</summary>
                  <div>
                    <p>{language === 'zh-CN' ? '转换时间取决于视频长度和设置：' : 'Conversion time depends on video length and settings:'}</p>
                    <ul>
                      <li>3 秒视频：约 3-5 秒</li>
                      <li>5 秒视频：约 5-10 秒</li>
                      <li>10 秒视频：约 10-20 秒</li>
                      <li>30 秒视频：约 30-60 秒</li>
                    </ul>
                    <p>
                      {language === 'zh-CN'
                        ? '实际时间还受到设备性能和浏览器的影响。'
                        : 'Actual time is also affected by device performance and browser.'
                      }
                    </p>
                  </div>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '文件会上传到服务器吗？' : 'Are files uploaded to the server?'}</summary>
                  <p>
                    {language === 'zh-CN'
                      ? '不会！所有转换都在您的浏览器中本地完成，文件不会上传到任何服务器。这保证了您的隐私和数据安全。转换完成后，您可以关闭页面，不会有任何数据残留。'
                      : 'No! All conversions are done locally in your browser, files are not uploaded to any server. This ensures your privacy and data security. After conversion, you can close the page without any data residue.'
                    }
                  </p>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '如何获得最佳质量？' : 'How to get the best quality?'}</summary>
                  <div>
                    <p>{language === 'zh-CN' ? '推荐设置：' : 'Recommended settings:'}</p>
                    <ul>
                      <li>{language === 'zh-CN' ? '质量：5-8（数字越小质量越好）' : 'Quality: 5-8 (lower number = better quality)'}</li>
                      <li>{language === 'zh-CN' ? '帧率：12-15 FPS' : 'Frame Rate: 12-15 FPS'}</li>
                      <li>{language === 'zh-CN' ? '宽度：640-800px' : 'Width: 640-800px'}</li>
                    </ul>
                    <p>
                      {language === 'zh-CN'
                        ? '注意：高质量设置会增加文件大小和转换时间。'
                        : 'Note: High quality settings will increase file size and conversion time.'
                      }
                    </p>
                  </div>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '为什么 MP4 转换失败？' : 'Why does MP4 conversion fail?'}</summary>
                  <p>
                    {language === 'zh-CN'
                      ? 'MP4 转换需要加载 FFmpeg WASM 库，这需要浏览器支持 WebAssembly 和一定的网络条件。如果初始化超时或失败，建议：1) 使用 GIF 格式；2) 刷新页面重试；3) 更换浏览器（推荐 Chrome）；4) 检查网络连接。'
                      : 'MP4 conversion requires loading FFmpeg WASM library, which needs browser support for WebAssembly and certain network conditions. If initialization times out or fails, recommend: 1) Use GIF format; 2) Refresh page and retry; 3) Switch browser (recommend Chrome); 4) Check network connection.'
                    }
                  </p>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '支持哪些浏览器？' : 'Which browsers are supported?'}</summary>
                  <div>
                    <p>{language === 'zh-CN' ? '推荐使用以下现代浏览器：' : 'Recommend using the following modern browsers:'}</p>
                    <ul>
                      <li>Chrome 90+ ✅</li>
                      <li>Edge 90+ ✅</li>
                      <li>Safari 14+ ✅</li>
                      <li>Firefox 88+ ✅</li>
                    </ul>
                    <p>
                      {language === 'zh-CN'
                        ? '移动端浏览器（iOS Safari、Android Chrome）也完全支持。'
                        : 'Mobile browsers (iOS Safari, Android Chrome) are also fully supported.'
                      }
                    </p>
                  </div>
                </details>
                
                <details className="faq-item">
                  <summary>{language === 'zh-CN' ? '有文件大小限制吗？' : 'Is there a file size limit?'}</summary>
                  <p>
                    {language === 'zh-CN'
                      ? '没有硬性限制，但建议单个文件不超过 100MB。非常大的文件可能导致浏览器内存不足或转换缓慢。对于大文件，建议降低输出质量和尺寸。'
                      : 'No hard limit, but recommend single file not exceeding 100MB. Very large files may cause browser out of memory or slow conversion. For large files, recommend reducing output quality and size.'
                    }
                  </p>
                </details>
              </div>
            </div>
          </div>
        )}

        {/* 页脚信息 */}
        <footer className="live-photo-footer">
          <div className="footer-content">
            <p className="footer-text">
              {language === 'zh-CN'
                ? '💡 提示：所有转换都在浏览器本地完成，您的文件不会上传到任何服务器。'
                : '💡 Tip: All conversions are done locally in your browser, your files are not uploaded to any server.'
              }
            </p>
            <p className="footer-tech">
              {language === 'zh-CN'
                ? '技术支持：WebAssembly • Canvas API • gif.js'
                : 'Powered by: WebAssembly • Canvas API • gif.js'
              }
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
