import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import ScreenRecordingProcessor from '../components/ScreenRecordingProcessor'
import './PageStyles.css'

export default function ScreenRecordingPage() {
  const { language } = useI18n()

  const title = language === 'zh-CN' ? 'iPhone 屏幕录像处理 - 裁剪、压缩、去水印' : 'iPhone Screen Recording Processor - Crop, Compress, Remove Watermark'
  const description = language === 'zh-CN' 
    ? '专业的 iPhone 屏幕录像处理工具，裁剪顶部红点和状态栏，压缩视频体积，模糊敏感信息，纯本地处理，隐私安全。'
    : 'Professional iPhone screen recording processor, crop top red dot and status bar, compress video size, blur sensitive info, 100% local processing, privacy-friendly.'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content="iPhone,屏幕录像,录屏,去水印,压缩视频,裁剪视频,视频处理" />
      </Helmet>

      <div className="page-container screen-recording-page">
        <ScreenRecordingProcessor />

        <div className="page-info">
          <div className="info-card">
            <h3>{language === 'zh-CN' ? '✂️ 智能裁剪' : '✂️ Smart Cropping'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '自动或手动裁剪顶部状态栏（红点、时间戳）和底部 Home bar，清理屏幕录像画面。' 
                : 'Automatically or manually crop top status bar (red dot, timestamp) and bottom Home bar, clean up screen recordings.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🗜️ 高效压缩' : '🗜️ Efficient Compression'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '使用 H.264 编码压缩视频，平均压缩 70%+ 体积，方便邮件发送和社交媒体分享。' 
                : 'Use H.264 encoding to compress videos, average 70%+ size reduction, easy for email and social media sharing.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🔒 隐私保护' : '🔒 Privacy Protection'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '模糊或遮挡敏感区域（通知、消息预览、个人信息），分享前保护隐私。' 
                : 'Blur or mask sensitive areas (notifications, message previews, personal info), protect privacy before sharing.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '⚡ 本地处理' : '⚡ Local Processing'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '所有视频处理在浏览器中完成，使用 FFmpeg WebAssembly 技术，视频不上传服务器。' 
                : 'All video processing done in browser using FFmpeg WebAssembly, videos never uploaded to servers.'}
            </p>
          </div>
        </div>

        <div className="faq-section">
          <h2>{language === 'zh-CN' ? '常见问题' : 'FAQ'}</h2>
          
          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '为什么要裁剪 iPhone 录屏？' : 'Why crop iPhone screen recordings?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'iPhone 录屏会显示顶部红点、时间、状态栏和底部 Home bar，分享时可能暴露隐私或看起来不专业。裁剪后画面更干净，适合教程、演示和社交分享。' 
                : 'iPhone screen recordings show top red dot, time, status bar and bottom Home bar, which may expose privacy or look unprofessional when sharing. Cropped videos are cleaner, perfect for tutorials, demos and social sharing.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '压缩会损失画质吗？' : 'Does compression reduce quality?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '使用智能压缩算法，"中等"质量下视觉效果几乎无损，但体积减少 70%+。"高"质量适合专业用途，"低"质量适合快速分享。您可以根据需求选择。' 
                : 'Using smart compression, "Medium" quality has almost no visible loss but reduces size by 70%+. "High" quality for professional use, "Low" quality for quick sharing. Choose based on your needs.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '处理速度快吗？' : 'Is processing fast?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '处理速度取决于视频时长和电脑性能。1分钟的视频通常需要 30-60 秒处理。建议：单个视频不超过 10 分钟，文件不超过 500MB，使用桌面版 Chrome 或 Edge 浏览器。' 
                : 'Processing speed depends on video length and computer performance. 1-minute video typically takes 30-60 seconds. Recommend: single video under 10 minutes, file under 500MB, use desktop Chrome or Edge browser.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '支持哪些格式？' : 'What formats are supported?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '支持 iPhone 录屏常用的 .MOV 和 .MP4 格式，输出统一为 MP4 格式，兼容所有平台和设备。' 
                : 'Supports common iPhone recording formats .MOV and .MP4, output as MP4 format, compatible with all platforms and devices.'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
