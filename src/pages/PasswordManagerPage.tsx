import { useState, useEffect } from 'react'
import { Lock, Plus, Eye, EyeOff, Copy, Trash2, Shield, Key, AlertCircle, CheckCircle } from 'lucide-react'
import { saveAs } from 'file-saver'
import './PasswordManagerPage.css'

interface PasswordEntry {
  id: string
  title: string
  username: string
  password: string
  url?: string
  notes?: string
  category: 'normal' | 'important'
  createdAt: string
}

export default function PasswordManagerPage() {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [passwords, setPasswords] = useState<PasswordEntry[]>([])
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // 添加密码弹窗
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newEntry, setNewEntry] = useState<Partial<PasswordEntry>>({
    category: 'normal'
  })

  // 从 localStorage 加载数据
  useEffect(() => {
    const stored = localStorage.getItem('commontools_passwords')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        setPasswords(data)
      } catch (e) {
        console.error('加载密码数据失败', e)
      }
    }
  }, [isUnlocked])

  // 保存到 localStorage
  const saveToStorage = (data: PasswordEntry[]) => {
    localStorage.setItem('commontools_passwords', JSON.stringify(data))
    setPasswords(data)
  }

  // 验证主密码
  const handleUnlock = async () => {
    if (!masterPassword) {
      setError('请输入主密码')
      return
    }

    // 检查 Web Crypto API 是否可用
    if (!window.crypto || !window.crypto.subtle) {
      setError('❌ 浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）或在 HTTPS 环境下使用')
      return
    }

    // 生成主密码哈希
    const encoder = new TextEncoder()
    const data = encoder.encode(masterPassword)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // 检查是否是首次设置
    const storedHash = localStorage.getItem('commontools_master_hash')
    
    if (!storedHash) {
      // 首次设置主密码
      localStorage.setItem('commontools_master_hash', hashHex)
      setIsUnlocked(true)
      setError(null)
      setSuccess('主密码已设置成功！')
      setTimeout(() => setSuccess(null), 3000)
    } else {
      // 验证主密码
      if (hashHex === storedHash) {
        setIsUnlocked(true)
        setError(null)
      } else {
        setError('主密码错误！')
      }
    }
  }

  // 添加密码
  const handleAddPassword = () => {
    if (!newEntry.title || !newEntry.password) {
      setError('标题和密码不能为空')
      return
    }

    const entry: PasswordEntry = {
      id: Date.now().toString(),
      title: newEntry.title,
      username: newEntry.username || '',
      password: newEntry.password,
      url: newEntry.url,
      notes: newEntry.notes,
      category: newEntry.category || 'normal',
      createdAt: new Date().toISOString(),
    }

    const updated = [...passwords, entry]
    saveToStorage(updated)
    setShowAddDialog(false)
    setNewEntry({ category: 'normal' })
    setSuccess('密码已添加')
    setTimeout(() => setSuccess(null), 3000)
  }

  // 删除密码
  const handleDeletePassword = (id: string) => {
    if (confirm('确定要删除这条密码吗？')) {
      const updated = passwords.filter(p => p.id !== id)
      saveToStorage(updated)
      setSuccess('密码已删除')
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  // 复制密码
  const handleCopyPassword = (password: string) => {
    navigator.clipboard.writeText(password)
    setSuccess('密码已复制到剪贴板')
    setTimeout(() => setSuccess(null), 2000)
  }

  // 导出密码数据
  const handleExport = () => {
    const data = JSON.stringify(passwords, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    saveAs(blob, `passwords-export-${new Date().toISOString().split('T')[0]}.json`)
    setSuccess('密码已导出')
    setTimeout(() => setSuccess(null), 3000)
  }

  // 导入密码数据
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const imported = JSON.parse(text) as PasswordEntry[]
      saveToStorage(imported)
      setSuccess(`成功导入 ${imported.length} 条密码`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError('导入失败，文件格式错误')
    }
  }

  // 未解锁界面
  if (!isUnlocked) {
    return (
      <div className="password-manager-lock">
        <div className="lock-screen">
          <div className="lock-icon">
            <Lock size={64} />
          </div>
          <h1>密码管理器</h1>
          <p>请输入主密码以访问密码管理器</p>
          
          {error && (
            <div className="error-message">
              <AlertCircle size={20} />
              {error}
            </div>
          )}
          
          {success && (
            <div className="success-message">
              <CheckCircle size={20} />
              {success}
            </div>
          )}
          
          <div className="password-input-group">
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="输入主密码"
              autoFocus
            />
            <button onClick={handleUnlock}>解锁</button>
          </div>
          
          <div className="lock-info">
            <Shield size={16} />
            <span>首次使用将设置主密码，请务必记住</span>
          </div>
        </div>
      </div>
    )
  }

  // 已解锁界面
  const normalPasswords = passwords.filter(p => p.category === 'normal')
  const importantPasswords = passwords.filter(p => p.category === 'important')

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>密码管理器</h1>
        <p className="page-description">
          安全存储您的密码和账号信息，支持分类管理
        </p>
        <button className="lock-button" onClick={() => setIsUnlocked(false)}>
          <Lock size={16} />
          锁定
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          {error}
        </div>
      )}
      
      {success && (
        <div className="success-message">
          <CheckCircle size={20} />
          {success}
        </div>
      )}
      
      <div className="password-manager-content">
        <div className="manager-header">
          <button className="add-button" onClick={() => setShowAddDialog(true)}>
            <Plus size={20} />
            添加密码
          </button>
          <div className="manager-actions">
            <label className="import-button">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
              导入
            </label>
            <button className="export-button" onClick={handleExport}>
              导出
            </button>
          </div>
        </div>
        
        {/* 普通密码 */}
        <div className="password-section">
          <h2>
            <Key size={20} />
            普通密码 ({normalPasswords.length})
          </h2>
          <div className="password-list">
            {normalPasswords.map(entry => (
              <div key={entry.id} className="password-item">
                <div className="password-item-header">
                  <h3>{entry.title}</h3>
                  <div className="password-item-actions">
                    <button
                      className="action-btn"
                      onClick={() => setShowPassword(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                      title={showPassword[entry.id] ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword[entry.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleCopyPassword(entry.password)}
                      title="复制密码"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => handleDeletePassword(entry.id)}
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="password-item-content">
                  {entry.username && <div><strong>用户名：</strong>{entry.username}</div>}
                  <div>
                    <strong>密码：</strong>
                    {showPassword[entry.id] ? entry.password : '••••••••'}
                  </div>
                  {entry.url && <div><strong>网址：</strong><a href={entry.url} target="_blank" rel="noopener noreferrer">{entry.url}</a></div>}
                  {entry.notes && <div><strong>备注：</strong>{entry.notes}</div>}
                  <div className="password-item-meta">创建于 {new Date(entry.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {normalPasswords.length === 0 && (
              <div className="empty-state">暂无普通密码</div>
            )}
          </div>
        </div>
        
        {/* 重要密码（多级加密） */}
        <div className="password-section important">
          <h2>
            <Shield size={20} />
            重要密码 ({importantPasswords.length})
            <span className="badge">多级加密</span>
          </h2>
          <div className="password-list">
            {importantPasswords.map(entry => (
              <div key={entry.id} className="password-item important">
                <div className="password-item-header">
                  <h3>{entry.title}</h3>
                  <div className="password-item-actions">
                    <button
                      className="action-btn"
                      onClick={() => setShowPassword(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                      title={showPassword[entry.id] ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword[entry.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleCopyPassword(entry.password)}
                      title="复制密码"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => handleDeletePassword(entry.id)}
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="password-item-content">
                  {entry.username && <div><strong>用户名：</strong>{entry.username}</div>}
                  <div>
                    <strong>密码：</strong>
                    {showPassword[entry.id] ? entry.password : '••••••••'}
                  </div>
                  {entry.url && <div><strong>网址：</strong><a href={entry.url} target="_blank" rel="noopener noreferrer">{entry.url}</a></div>}
                  {entry.notes && <div><strong>备注：</strong>{entry.notes}</div>}
                  <div className="password-item-meta">创建于 {new Date(entry.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {importantPasswords.length === 0 && (
              <div className="empty-state">暂无重要密码</div>
            )}
          </div>
        </div>
      </div>
      
      {/* 添加密码弹窗 */}
      {showAddDialog && (
        <div className="modal-overlay" onClick={() => setShowAddDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>添加新密码</h2>
            <div className="form-group">
              <label>标题 *</label>
              <input
                type="text"
                value={newEntry.title || ''}
                onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                placeholder="例如：Gmail 账号"
              />
            </div>
            <div className="form-group">
              <label>用户名 / 邮箱</label>
              <input
                type="text"
                value={newEntry.username || ''}
                onChange={(e) => setNewEntry({ ...newEntry, username: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="form-group">
              <label>密码 *</label>
              <input
                type="text"
                value={newEntry.password || ''}
                onChange={(e) => setNewEntry({ ...newEntry, password: e.target.value })}
                placeholder="输入密码"
              />
            </div>
            <div className="form-group">
              <label>网址</label>
              <input
                type="url"
                value={newEntry.url || ''}
                onChange={(e) => setNewEntry({ ...newEntry, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="form-group">
              <label>备注</label>
              <textarea
                value={newEntry.notes || ''}
                onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                placeholder="额外说明..."
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>分类</label>
              <select
                value={newEntry.category}
                onChange={(e) => setNewEntry({ ...newEntry, category: e.target.value as 'normal' | 'important' })}
              >
                <option value="normal">普通密码</option>
                <option value="important">重要密码（多级加密）</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowAddDialog(false)}>
                取消
              </button>
              <button className="confirm-btn" onClick={handleAddPassword}>
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

