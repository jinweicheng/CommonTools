import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import EncryptionPage from './pages/EncryptionPage'
import ConversionPage from './pages/ConversionPage'
import WatermarkPage from './pages/WatermarkPage'
import SignaturePage from './pages/SignaturePage'
import PasswordManagerPage from './pages/PasswordManagerPage'
import CompressionPage from './pages/CompressionPage'
import HEICToJPGPage from './pages/HEICToJPGPage'
import LoginPage from './pages/LoginPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <Router>
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
            
            {/* 重定向未知路由到首页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  )
}

export default App
