/**
 * 用户ID管理服务
 * 自动生成并保存UUID到localStorage，确保同一浏览器使用相同的用户ID
 */

const USER_ID_STORAGE_KEY = 'commontools_user_id'

/**
 * 生成UUID v4
 */
function generateUUID(): string {
  // 使用crypto API生成UUID（如果可用）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // 降级方案：手动生成UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 获取或创建用户ID
 * 如果localStorage中已存在，则返回；否则创建新的UUID并保存
 */
export function getUserId(): string {
  try {
    // 尝试从localStorage读取
    const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY)
    
    if (storedUserId) {
      // 验证UUID格式
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (uuidRegex.test(storedUserId)) {
        return storedUserId
      }
      // 如果格式不正确，删除并重新生成
      localStorage.removeItem(USER_ID_STORAGE_KEY)
    }
    
    // 生成新的UUID
    const newUserId = generateUUID()
    localStorage.setItem(USER_ID_STORAGE_KEY, newUserId)
    
    return newUserId
  } catch (error) {
    // localStorage可能不可用（隐私模式等），使用sessionStorage作为降级
    console.warn('Failed to access localStorage, using sessionStorage:', error)
    try {
      const sessionUserId = sessionStorage.getItem(USER_ID_STORAGE_KEY)
      if (sessionUserId) {
        return sessionUserId
      }
      const newUserId = generateUUID()
      sessionStorage.setItem(USER_ID_STORAGE_KEY, newUserId)
      return newUserId
    } catch (e) {
      // 如果都不可用，生成临时ID（仅本次会话有效）
      console.error('Failed to access storage:', e)
      return generateUUID()
    }
  }
}

/**
 * 重置用户ID（用于测试或用户清除数据）
 */
export function resetUserId(): string {
  try {
    localStorage.removeItem(USER_ID_STORAGE_KEY)
    sessionStorage.removeItem(USER_ID_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to reset user ID:', error)
  }
  return getUserId()
}

/**
 * 获取用户ID（不创建新ID，如果不存在返回null）
 */
export function getExistingUserId(): string | null {
  try {
    const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY)
    if (storedUserId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (uuidRegex.test(storedUserId)) {
        return storedUserId
      }
    }
  } catch (error) {
    console.error('Failed to get existing user ID:', error)
  }
  return null
}
