/**
 * 使用统计服务
 * 收集用户使用情况并上报到后端API
 */

import { getUserId } from './userIdService'
import { getDeviceInfo, type DeviceInfo } from './deviceDetector'

export interface UsageStatisticsData {
  module: string
  action: string
  endpoint: string
  ipAddress?: string | null
  userAgent?: string
  deviceType?: string
  browser?: string
  os?: string
  statDate: string // YYYY-MM-DD HH:mm:ss
}

// API基础URL（从环境变量或配置中获取）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// 统计数据队列（批量上报）
let statisticsQueue: UsageStatisticsData[] = []
let queueTimer: number | null = null
const QUEUE_FLUSH_INTERVAL = 5000 // 5秒刷新一次
const MAX_QUEUE_SIZE = 50 // 最大队列长度

/**
 * 获取当前日期时间（YYYY-MM-DD HH:mm:ss格式）
 */
function getCurrentDateTime(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * 上报统计数据到后端
 */
async function reportStatistics(data: UsageStatisticsData[]): Promise<void> {
  if (data.length === 0) return

  try {
    const userId = getUserId()
    
    // 准备请求数据
    const requestData = {
      userId,
      statistics: data
    }

    const response = await fetch(`${API_BASE_URL}/statistics/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
      // 不等待响应，避免阻塞用户操作
      keepalive: true
    })

    if (!response.ok) {
      // 开发环境下，如果后端API未实现（404），静默处理
      if (response.status === 404 && import.meta.env.DEV) {
        console.debug('Statistics API not implemented yet (404). Data:', data)
        return
      }
      console.warn('Failed to report statistics:', response.status, response.statusText)
    }
  } catch (error) {
    // 静默失败，不影响用户体验
    // 开发环境下，如果是网络错误（后端未启动），静默处理
    if (import.meta.env.DEV) {
      console.debug('Statistics API unavailable (development mode). Error:', error)
      return
    }
    console.warn('Failed to report statistics:', error)
  }
}

/**
 * 刷新队列（批量上报）
 */
function flushQueue(): void {
  if (statisticsQueue.length === 0) return

  const dataToReport = [...statisticsQueue]
  statisticsQueue = []

  // 异步上报，不阻塞
  reportStatistics(dataToReport).catch(error => {
    console.warn('Failed to flush statistics queue:', error)
    // 如果上报失败，重新加入队列（限制重试次数）
    if (dataToReport.length < MAX_QUEUE_SIZE) {
      statisticsQueue.unshift(...dataToReport)
    }
  })
}

/**
 * 初始化队列刷新定时器
 */
function initQueueTimer(): void {
  if (queueTimer !== null) return

  queueTimer = window.setInterval(() => {
    flushQueue()
  }, QUEUE_FLUSH_INTERVAL)

  // 页面卸载时刷新队列
  window.addEventListener('beforeunload', () => {
    flushQueue()
  })
}

/**
 * 记录使用统计
 * @param module 模块名称：files, passwords, feedback, users等
 * @param action 操作名称：upload, download, create, update, delete, list, view等
 * @param endpoint API端点路径（可选，默认为当前路径）
 */
export function trackUsage(
  module: string,
  action: string,
  endpoint?: string
): void {
  try {
    const deviceInfo: DeviceInfo = getDeviceInfo()
    const currentPath = endpoint || window.location.pathname

    const statisticsData: UsageStatisticsData = {
      module,
      action,
      endpoint: currentPath,
      userAgent: deviceInfo.userAgent,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      statDate: getCurrentDateTime(),
      // IP地址由后端从请求头获取
      ipAddress: null
    }

    // 添加到队列
    statisticsQueue.push(statisticsData)

    // 如果队列达到最大长度，立即刷新
    if (statisticsQueue.length >= MAX_QUEUE_SIZE) {
      flushQueue()
    }

    // 初始化定时器（如果尚未初始化）
    initQueueTimer()
  } catch (error) {
    // 静默失败，不影响用户体验
    console.warn('Failed to track usage:', error)
  }
}

/**
 * 立即上报所有待上报的统计数据
 */
export function flushStatistics(): void {
  flushQueue()
}

/**
 * 记录页面访问统计
 */
export function trackPageView(pageName: string): void {
  trackUsage('pages', 'view', `/tools/${pageName}`)
}

/**
 * 记录文件上传统计
 */
export function trackFileUpload(module: string, fileType?: string): void {
  const endpoint = fileType ? `/tools/${module}?type=${fileType}` : `/tools/${module}`
  trackUsage(module, 'upload', endpoint)
}

/**
 * 记录文件下载统计
 */
export function trackFileDownload(module: string, fileType?: string): void {
  const endpoint = fileType ? `/tools/${module}?type=${fileType}` : `/tools/${module}`
  trackUsage(module, 'download', endpoint)
}

/**
 * 记录工具使用统计
 */
export function trackToolUsage(toolName: string, action: string): void {
  trackUsage(toolName, action, `/tools/${toolName}`)
}
