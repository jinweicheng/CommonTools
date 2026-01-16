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
import LoginPage from './pages/LoginPage'
import SupportPage from './pages/SupportPage'
import SupportPolicyPage from './pages/SupportPolicyPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import './App.css'

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Router basename="/tools">
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
              
              {/* Support & Policy Pages */}
              <Route path="/support" element={<SupportPage />} />
              <Route path="/support-policy" element={<SupportPolicyPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="/terms-of-service" element={<TermsOfServicePage />} />
              
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
