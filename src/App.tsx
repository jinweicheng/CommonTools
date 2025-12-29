import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import PDFTools from './pages/PDFTools'
import './App.css'

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pdf-tools" element={<PDFTools />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App

