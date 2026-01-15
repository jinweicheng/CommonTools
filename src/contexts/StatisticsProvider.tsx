/**
 * 统计服务Provider
 * 在应用启动时初始化统计功能，并在路由变化时记录页面访问
 */

import { useEffect, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView, flushStatistics } from '../utils/usageStatisticsService'
import { getUserId } from '../utils/userIdService'

interface StatisticsProviderProps {
  children: ReactNode
}

/**
 * 从路径中提取页面名称
 */
function getPageNameFromPath(pathname: string): string {
  // 移除 /tools/ 前缀
  const path = pathname.replace(/^\/tools\/?/, '') || 'home'
  return path
}

export function StatisticsProvider({ children }: StatisticsProviderProps) {
  const location = useLocation()

  // 初始化：确保用户ID已创建
  useEffect(() => {
    const userId = getUserId()
    console.log('Statistics initialized, User ID:', userId)
  }, [])

  // 路由变化时记录页面访问
  useEffect(() => {
    const pageName = getPageNameFromPath(location.pathname)
    trackPageView(pageName)
  }, [location.pathname])

  // 页面卸载时刷新统计数据
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushStatistics()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  return <>{children}</>
}
