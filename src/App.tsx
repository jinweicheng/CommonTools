import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { StatisticsProvider } from './contexts/StatisticsProvider'
import Layout from './components/Layout'
import EncryptionPage from './pages/EncryptionPage'
import ConversionPage from './pages/ConversionPage'
import WatermarkPage from './pages/WatermarkPage'
import SignaturePage from './pages/SignaturePage'
import PasswordManagerPage from './pages/PasswordManagerPage'
import CompressionPage from './pages/CompressionPage'
import HEICToJPGPage from './pages/HEICToJPGPage'
import LivePhotoPage from './pages/LivePhotoPage'
import ImageConverterPage from './pages/ImageConverterPage'
import ModernImageConverterPage from './pages/ModernImageConverterPage'
import ProRAWConverterPage from './pages/ProRAWConverterPage'
import ScreenRecordingPage from './pages/ScreenRecordingPage'
import ImageCompressionPage from './pages/ImageCompressionPage'
import VideoCompressionPage from './pages/VideoCompressionPage'
import VideoToGifPage from './pages/VideoToGifPage'
import VideoConverterPage from './pages/VideoConverterPage'
import OldPhotoRestorationPage from './pages/OldPhotoRestorationPage'
import RemovePhotosPage from './pages/RemovePhotosPage'
import ImageWatermarkPage from './pages/ImageWatermarkPage'
import ImageEncryptionPage from './pages/ImageEncryptionPage'
import ImageMosaicPage from './pages/ImageMosaicPage'
import PDFEncryptHTMLPage from './pages/PDFEncryptHTMLPage'
import PDFEncryptPage from './pages/PDFEncryptPage'
import PDFWatermarkToolPage from './pages/PDFWatermarkToolPage'
import PDFSignatureToolPage from './pages/PDFSignatureToolPage'
import LoginPage from './pages/LoginPage'
import SupportPage from './pages/SupportPage'
import SupportPolicyPage from './pages/SupportPolicyPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import RefundPolicyPage from './pages/RefundPolicyPage'
import PricingPage from './pages/PricingPage'
import AboutPage from './pages/AboutPage'
import ContactPage from './pages/ContactPage'
import './App.css'

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Router basename={import.meta.env.BASE_URL}>
          <StatisticsProvider>
            <Layout>
              <Routes>
              {/* 登录页面 */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* 默认首页：加密文件 */}
              <Route path="/" element={<EncryptionPage />} />
              
              {/* 格式转化 */}
              <Route path="/conversion" element={<ConversionPage />} />
              
              {/* 加水印 */}
              <Route path="/watermark" element={<WatermarkPage />} />
              
              {/* 电子签名 */}
              <Route path="/signature" element={<SignaturePage />} />
              
              {/* 密码管理器（需要密码） */}
              <Route path="/password-manager" element={<PasswordManagerPage />} />
              
              {/* 解压/压缩文件 */}
              <Route path="/compression" element={<CompressionPage />} />
              
              {/* HEIC转JPG */}
              <Route path="/heic-to-jpg" element={<HEICToJPGPage />} />
              
              {/* Live Photo转换 */}
              <Route path="/live-photo" element={<LivePhotoPage />} />
              
              {/* 老旧格式图片转换 */}
              <Route path="/legacy-image-converter" element={<ImageConverterPage />} />
              
              {/* 现代图片格式转换 */}
              <Route path="/modern-image-converter" element={<ModernImageConverterPage />} />
              
              {/* ProRAW/HEIF 专业转换 */}
              <Route path="/proraw-converter" element={<ProRAWConverterPage />} />
              
              {/* 屏幕录像处理 */}
              <Route path="/screen-recording" element={<ScreenRecordingPage />} />
              
              {/* 图片压缩 */}
              <Route path="/image-compression" element={<ImageCompressionPage />} />
              
              {/* 视频压缩 */}
              <Route path="/video-compression" element={<VideoCompressionPage />} />
              
              {/* MP4 转 GIF */}
              <Route path="/video-to-gif" element={<VideoToGifPage />} />
              
              {/* 视频格式转换 */}
              <Route path="/video-converter" element={<VideoConverterPage />} />
              
              {/* 老照片修复 */}
              <Route path="/old-photo-restoration" element={<OldPhotoRestorationPage />} />
              
              {/* 智能去背景 */}
              <Route path="/remove-photos" element={<RemovePhotosPage />} />
              
              {/* 图片水印 */}
              <Route path="/image-watermark" element={<ImageWatermarkPage />} />
              
              {/* 图片加密 */}
              <Route path="/image-encryption" element={<ImageEncryptionPage />} />
              
              {/* 图片马赛克 */}
              <Route path="/image-mosaic" element={<ImageMosaicPage />} />
              
              {/* PDF加密HTML */}
              <Route path="/pdf-encrypt-html" element={<PDFEncryptHTMLPage />} />
              
              {/* PDF加密（AES-256） */}
              <Route path="/pdf-encrypt" element={<PDFEncryptPage />} />
              
              {/* PDF水印 */}
              <Route path="/pdf-watermark" element={<PDFWatermarkToolPage />} />
              
              {/* PDF签名 */}
              <Route path="/pdf-signature" element={<PDFSignatureToolPage />} />
              
              {/* Support & Policy Pages */}
              <Route path="/support" element={<SupportPage />} />
              <Route path="/support-policy" element={<SupportPolicyPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="/terms-of-service" element={<TermsOfServicePage />} />
              <Route path="/refund-policy" element={<RefundPolicyPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              
              {/* About and Contact Pages */}
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              
              {/* 重定向未知路由到首页 */}
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </StatisticsProvider>
        </Router>
      </AuthProvider>
    </I18nProvider>
  )
}

export default App
