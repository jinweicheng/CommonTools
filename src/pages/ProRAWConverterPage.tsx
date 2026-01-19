import { Helmet } from 'react-helmet-async'
import { useI18n } from '../i18n/I18nContext'
import ProRAWConverter from '../components/ProRAWConverter'
import './PageStyles.css'

export default function ProRAWConverterPage() {
  const { language } = useI18n()

  const title = language === 'zh-CN' ? 'ProRAW/HEIF 专业转换 - iPhone 摄影师工具' : 'ProRAW/HEIF Pro Converter - iPhone Photographer Tool'
  const description = language === 'zh-CN' 
    ? '专为 iPhone ProRAW (.DNG) 和 HEIF Burst 设计的专业转换工具，批量转 JPG，可选择性保留 EXIF 元数据，完全本地处理，保护隐私。'
    : 'Professional converter designed for iPhone ProRAW (.DNG) and HEIF Burst, batch convert to JPG with selective EXIF metadata retention, all processed locally, protecting your privacy.'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content="ProRAW,DNG,HEIF,HEIC,iPhone,摄影,JPG转换,EXIF,元数据,批量处理" />
        <link rel="canonical" href="https://commontools.top/tools/proraw-converter" />
        <meta property="og:url" content="https://commontools.top/tools/proraw-converter" />
      </Helmet>

      <div className="page-container proraw-converter-page">
        <ProRAWConverter />

        <div className="page-info">
          <div className="info-card">
            <h3>{language === 'zh-CN' ? '📷 专为摄影师设计' : '📷 Designed for Photographers'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '完美支持 iPhone ProRAW (.DNG) 和 HEIF Burst 连拍，专业摄影师的得力工具。' 
                : 'Perfect support for iPhone ProRAW (.DNG) and HEIF Burst, the essential tool for professional photographers.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '⚡ 快速批量处理' : '⚡ Fast Batch Processing'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '一次处理多张 ProRAW 照片，自动转换为 JPG 格式，节省大量存储空间。' 
                : 'Process multiple ProRAW photos at once, automatically convert to JPG format, saving significant storage space.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🔐 智能元数据管理' : '🔐 Smart Metadata Management'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '可选择性保留拍摄时间、相机型号、曝光参数等重要 EXIF 信息，移除不必要的数据。' 
                : 'Selectively retain important EXIF info like shooting time, camera model, exposure settings, and remove unnecessary data.'}
            </p>
          </div>

          <div className="info-card">
            <h3>{language === 'zh-CN' ? '🔒 完全本地处理' : '🔒 Fully Local Processing'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '所有转换都在浏览器中完成，照片不会上传到服务器，保护作品版权和隐私。' 
                : 'All conversions are done in browser, photos never uploaded to servers, protecting your work copyright and privacy.'}
            </p>
          </div>
        </div>

        <div className="faq-section">
          <h2>{language === 'zh-CN' ? '常见问题' : 'FAQ'}</h2>
          
          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '什么是 ProRAW？' : 'What is ProRAW?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'ProRAW 是 Apple 在 iPhone 12 Pro 及更高机型上推出的专业 RAW 格式（.DNG 文件），包含未处理的传感器数据，提供最大的后期处理空间，但文件体积通常达到 20-80MB。' 
                : 'ProRAW is Apple\'s professional RAW format (.DNG files) introduced on iPhone 12 Pro and higher models, containing unprocessed sensor data for maximum post-processing flexibility, but file sizes typically range from 20-80MB.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '为什么要转换为 JPG？' : 'Why convert to JPG?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'ProRAW 文件太大，不便分享和存储。转换为 JPG 后文件大小通常只有原来的 5-10%，同时保持优秀的视觉质量，非常适合网络分享和日常查看。' 
                : 'ProRAW files are too large for sharing and storage. Converting to JPG reduces file size to typically 5-10% of the original while maintaining excellent visual quality, perfect for online sharing and daily viewing.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? 'EXIF 元数据有什么用？' : 'What is EXIF metadata used for?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? 'EXIF 包含拍摄信息（时间、地点、相机、镜头、ISO、光圈、快门等）。摄影师通常需要保留这些信息用于版权声明、作品管理和技术参考，但GPS位置信息可能涉及隐私，需谨慎保留。' 
                : 'EXIF contains shooting info (time, location, camera, lens, ISO, aperture, shutter, etc.). Photographers typically need to retain this information for copyright, work management and technical reference, but GPS location may involve privacy concerns, should be kept with caution.'}
            </p>
          </div>

          <div className="faq-item">
            <h3>{language === 'zh-CN' ? '支持哪些文件格式？' : 'What file formats are supported?'}</h3>
            <p>
              {language === 'zh-CN' 
                ? '支持 iPhone ProRAW (.DNG)、HEIF (.heif) 和 HEIC (.heic) 格式，包括 HEIF Burst 连拍文件。建议使用 Safari 或 Chrome 最新版本以获得最佳兼容性。' 
                : 'Supports iPhone ProRAW (.DNG), HEIF (.heif) and HEIC (.heic) formats, including HEIF Burst files. Recommend using latest Safari or Chrome for best compatibility.'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
