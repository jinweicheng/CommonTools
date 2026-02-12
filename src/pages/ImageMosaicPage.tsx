import { Helmet } from 'react-helmet-async'
import ImageMosaic from '../components/ImageMosaic'
import { useI18n } from '../i18n/I18nContext'
import './PageStyles.css'

export default function ImageMosaicPage() {
  const { t } = useI18n()

  const title = t('imageMosaic.pageTitle') + ' - CommonTools'
  const description = t('imageMosaic.pageSubtitle')

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="keywords" content="图片马赛克,图片打码,模糊处理,像素化,隐私保护,在线马赛克工具,image mosaic,pixelate,blur,censor" />
        <link rel="canonical" href="https://commontools.top/tools/image-mosaic" />
        <meta property="og:url" content="https://commontools.top/tools/image-mosaic" />
      </Helmet>

      <div className="page-container image-mosaic-page">
        <div className="page-header">
          <h1 className="page-title">
            <span className="title-emoji" style={{ filter: 'none' }}>🟩</span>
            <span className="title-text">{t('imageMosaic.pageTitle')}</span>
          </h1>
          <p className="page-subtitle">
            {t('imageMosaic.pageSubtitle')}
          </p>

          <div className="features-badges" style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="feature-badge">
              <span className="badge-icon">🎯</span>
              {t('imageMosaic.badgePrecise')}
            </span>
            <span className="feature-badge">
              <span className="badge-icon">🖌️</span>
              {t('imageMosaic.badgeMultiMode')}
            </span>
            <span className="feature-badge">
              <span className="badge-icon">⚡</span>
              {t('imageMosaic.badgeLocal')}
            </span>
          </div>
        </div>

        <div className="page-content">
          <ImageMosaic />
        </div>
      </div>
    </>
  )
}
