/**
 * 设备检测工具
 * 解析User-Agent获取设备类型、浏览器、操作系统等信息
 */

export interface DeviceInfo {
  deviceType: 'PC' | 'MOBILE' | 'TABLET' | 'UNKNOWN'
  browser: string
  os: string
  userAgent: string
}

/**
 * 检测设备类型
 */
function detectDeviceType(userAgent: string): 'PC' | 'MOBILE' | 'TABLET' | 'UNKNOWN' {
  const ua = userAgent.toLowerCase()
  
  // 检测平板设备
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'TABLET'
  }
  
  // 检测移动设备
  if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'MOBILE'
  }
  
  // 默认PC
  return 'PC'
}

/**
 * 检测浏览器
 */
function detectBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  
  if (ua.includes('edg/')) {
    return 'Edge'
  }
  if (ua.includes('chrome/') && !ua.includes('edg/')) {
    return 'Chrome'
  }
  if (ua.includes('firefox/')) {
    return 'Firefox'
  }
  if (ua.includes('safari/') && !ua.includes('chrome/')) {
    return 'Safari'
  }
  if (ua.includes('opera/') || ua.includes('opr/')) {
    return 'Opera'
  }
  if (ua.includes('msie') || ua.includes('trident/')) {
    return 'IE'
  }
  if (ua.includes('samsungbrowser/')) {
    return 'Samsung Internet'
  }
  
  return 'Unknown'
}

/**
 * 检测操作系统
 */
function detectOS(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  
  if (ua.includes('windows nt')) {
    const version = ua.match(/windows nt (\d+\.\d+)/)
    if (version) {
      const ver = parseFloat(version[1])
      if (ver >= 10) return 'Windows 10/11'
      if (ver >= 6.3) return 'Windows 8.1'
      if (ver >= 6.2) return 'Windows 8'
      if (ver >= 6.1) return 'Windows 7'
    }
    return 'Windows'
  }
  if (ua.includes('mac os x') || ua.includes('macintosh')) {
    return 'macOS'
  }
  if (ua.includes('linux')) {
    return 'Linux'
  }
  if (ua.includes('android')) {
    const version = ua.match(/android ([\d.]+)/)
    return version ? `Android ${version[1]}` : 'Android'
  }
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    const version = ua.match(/os ([\d_]+)/)
    return version ? `iOS ${version[1].replace(/_/g, '.')}` : 'iOS'
  }
  if (ua.includes('ubuntu')) {
    return 'Ubuntu'
  }
  if (ua.includes('fedora')) {
    return 'Fedora'
  }
  if (ua.includes('debian')) {
    return 'Debian'
  }
  
  return 'Unknown'
}

/**
 * 获取设备信息
 */
export function getDeviceInfo(): DeviceInfo {
  const userAgent = navigator.userAgent
  
  return {
    deviceType: detectDeviceType(userAgent),
    browser: detectBrowser(userAgent),
    os: detectOS(userAgent),
    userAgent: userAgent.substring(0, 500) // 限制长度
  }
}

/**
 * 获取IP地址（需要后端支持）
 * 这里返回null，实际IP应该由后端从请求头中获取
 */
export function getIPAddress(): string | null {
  // 前端无法直接获取真实IP，需要后端从请求头获取
  // 这里返回null，实际IP由后端处理
  return null
}
