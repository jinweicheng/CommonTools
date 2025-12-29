import { Link, useLocation } from 'react-router-dom'
import { FileText } from 'lucide-react'
import './Layout.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <FileText className="logo-icon" />
            <span>CommonTools</span>
          </Link>
          <nav className="nav">
            <Link 
              to="/" 
              className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}
            >
              首页
            </Link>
            <Link 
              to="/pdf-tools" 
              className={location.pathname === '/pdf-tools' ? 'nav-link active' : 'nav-link'}
            >
              PDF工具
            </Link>
          </nav>
        </div>
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

