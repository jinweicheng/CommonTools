import axios from 'axios'
import { refreshAccessToken } from './auth'

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (import.meta.env.VITE_API_BASE as string) ||
  '/api'

const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // allow sending httpOnly refresh cookie if backend uses it
})

let isRefreshing = false
let refreshQueue: Array<(token: string | null) => void> = []

function processQueue(token: string | null) {
  refreshQueue.forEach((cb) => cb(token))
  refreshQueue = []
}

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalReq = err.config
    if (!originalReq || originalReq._retry) return Promise.reject(err)

    const url = String(originalReq.url || '')
    const isAuthEndpoint = /\/auth\/(login|register|refresh|logout)\b/.test(url)
    if (isAuthEndpoint) {
      return Promise.reject(err)
    }

    if (err.response && err.response.status === 401) {
      originalReq._retry = true
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((token) => {
            if (token) {
              originalReq.headers = originalReq.headers || {}
              originalReq.headers.Authorization = `Bearer ${token}`
              resolve(apiClient(originalReq))
            } else {
              reject(err)
            }
          })
        })
      }

      isRefreshing = true
      try {
        const newToken = await refreshAccessToken()
        processQueue(newToken)
        isRefreshing = false
        if (newToken) {
          originalReq.headers = originalReq.headers || {}
          originalReq.headers.Authorization = `Bearer ${newToken}`
          return apiClient(originalReq)
        }
      } catch (e) {
        processQueue(null)
        isRefreshing = false
        return Promise.reject(e)
      }
    }

    return Promise.reject(err)
  }
)

export default apiClient
