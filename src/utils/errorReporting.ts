import { getUserId } from './userIdService'

type AnyRecord = Record<string, unknown>

export interface FrontendErrorReport {
  userId: string
  message: string
  stack?: string
  name?: string
  source?: 'console.error' | 'window.error' | 'unhandledrejection'
  url?: string
  path?: string
  module?: string
  userAgent?: string
  timestamp: number
  extra?: AnyRecord
}

// 后端约定：POST /api/front-errors
const REPORT_ENDPOINT = '/api/front-errors'

let installed = false
let originalConsoleError: typeof console.error | null = null

let inReporting = false
let queue: FrontendErrorReport[] = []
let flushTimer: number | null = null

const MAX_QUEUE = 30
const FLUSH_INTERVAL_MS = 1500
const DEDUPE_WINDOW_MS = 10_000
const recentFingerprints = new Map<string, number>()

// function agentLog(hypothesisId: string, location: string, message: string, data: AnyRecord = {}) {
  // #region agent log
  // const controller = new AbortController()
  // const timeoutId = setTimeout(() => controller.abort(), 5000) // Set a timeout of 5 seconds

  // Skip fetch entirely if the URL violates CSP
  // const isCSPViolated =
  //   !document ||
  //   !document.querySelector ||
  //   !document.querySelector('meta[http-equiv="Content-Security-Policy"]')
  // if (isCSPViolated) {
  //   console.error('CSP violation detected. Fetch call skipped.')
  //   return
  // }

  // fetch('http://127.0.0.1:7242/ingest/71098a2f-f0c4-4d65-806e-3b09d5bdb25f', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     sessionId: 'debug-session',
  //     runId: 'pre-fix',
  //     hypothesisId,
  //     location,
  //     message,
  //     data,
  //     timestamp: Date.now(),
  //   }),
  //   signal: controller.signal,
  // })
  //   .then(() => {
  //     clearTimeout(timeoutId) // Clear the timeout if the fetch succeeds
  //   })
  //   .catch((e) => {
  //     if (e.name === 'AbortError') {
  //       console.warn('Fetch aborted due to timeout.')
  //     } else {
  //       reportError('agentLog', e, { hypothesisId, location, message, data })
  //     }
  //   })
  //   .finally(() => {
  //     clearTimeout(timeoutId) // Ensure timeout is cleared in all cases
  //   })
  // #endregion agent log
// }

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value
    if (value instanceof Error) return `${value.name}: ${value.message}`
    return JSON.stringify(value)
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable]'
    }
  }
}

function normalizeError(input: unknown): { name?: string; message: string; stack?: string; extra?: AnyRecord } {
  if (input instanceof Error) {
    return { name: input.name, message: input.message || String(input), stack: input.stack }
  }
  if (typeof input === 'string') {
    return { message: input }
  }
  if (input && typeof input === 'object') {
    const anyObj = input as AnyRecord
    const message = typeof anyObj.message === 'string' ? anyObj.message : safeStringify(input)
    const name = typeof anyObj.name === 'string' ? anyObj.name : undefined
    const stack = typeof anyObj.stack === 'string' ? anyObj.stack : undefined
    return { name, message, stack, extra: anyObj }
  }
  return { message: safeStringify(input) }
}

function getCurrentModuleFromPath(pathname: string): string {
  const p = (pathname || '').replace(/^\/tools\/?/, '').replace(/^\/+/, '')
  return p || 'home'
}

function fingerprint(report: FrontendErrorReport): string {
  const stackTop = report.stack ? report.stack.split('\n').slice(0, 3).join('\n') : ''
  return `${report.source || ''}|${report.name || ''}|${report.message}|${stackTop}|${report.path || ''}`
}

function shouldDrop(report: FrontendErrorReport): boolean {
  const now = Date.now()
  const fp = fingerprint(report)
  const last = recentFingerprints.get(fp)
  if (last && now - last < DEDUPE_WINDOW_MS) return true
  recentFingerprints.set(fp, now)

  // 简单清理，避免 Map 无限制增长
  if (recentFingerprints.size > 500) {
    for (const [k, t] of recentFingerprints) {
      if (now - t > 60_000) recentFingerprints.delete(k)
    }
  }
  return false
}

async function postReports(batch: FrontendErrorReport[]): Promise<boolean> {
  if (batch.length === 0) return true

  // 后端要求：body = { userId, module, errorMessage }
  // 为保证不破坏后端解析，这里严格只发送这些字段；
  // 如果一次捕获到多条错误，将合并为一条文本（便于服务端入库）。
  const userId = batch[0]?.userId || getUserId()
  const module = batch[0]?.module || getCurrentModuleFromPath(window.location.pathname)
  const errorMessage = batch
    .map((r, idx) => {
      const head = `[${idx + 1}] source=${r.source || 'unknown'}`
      const main = r.name ? `${r.name}: ${r.message}` : r.message
      const stack = r.stack ? `\n${r.stack}` : ''
      const where = r.path ? `\npath=${r.path}` : ''
      const mod = r.module ? `\nmodule=${r.module}` : `\nmodule=${module}`
      return `${head}\n${main}${mod}${where}${stack}`
    })
    .join('\n\n---\n\n')

  try {
    const res = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, module, errorMessage }),
      keepalive: true,
    })
    // agentLog('H4', 'errorReporting.ts:postReports', 'post result', { ok: res.ok, status: res.status })
    return res.ok
  } catch (e) {
    // agentLog('H4', 'errorReporting.ts:postReports', 'post failed', { error: safeStringify(e) })
    return false
  }
}

async function flushQueue() {
  if (inReporting) return
  if (queue.length === 0) return
  inReporting = true

  const batch = queue.splice(0, Math.min(queue.length, 10))
  // agentLog('H3', 'errorReporting.ts:flushQueue', 'flushing batch', { reason, batchSize: batch.length })

  const ok = await postReports(batch)
  if (!ok) {
    // 失败时回填队列头部（限量），避免无限重试占用内存
    queue = [...batch.slice(0, 5), ...queue].slice(0, MAX_QUEUE)
  }

  inReporting = false
}

function scheduleFlush() {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    flushQueue().catch(() => {})
  }, FLUSH_INTERVAL_MS)
}

function enqueue(report: FrontendErrorReport) {
  if (inReporting) return
  if (shouldDrop(report)) return

  queue.push(report)
  if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE)
  scheduleFlush()
}

function buildBaseReport(): Pick<FrontendErrorReport, 'userId' | 'url' | 'path' | 'userAgent' | 'timestamp'> {
  return {
    userId: getUserId(),
    url: window.location.href,
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
  }
}

function reportError(
  source: 'console.error' | 'window.error' | 'unhandledrejection' | 'agentLog' | undefined,
  error: Error,
  context: { hypothesisId?: string; location?: string; message?: string; data?: any }
) {
  // Ensure the `source` parameter is correctly typed and used.
  if (source === 'agentLog') {
    // Handle agentLog-specific logic here if needed.
  } else {
    const normalized = normalizeError(error)
    const report: FrontendErrorReport = {
      ...buildBaseReport(),
      source,
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
      module: getCurrentModuleFromPath(window.location.pathname),
      extra: {
        ...normalized.extra,
        ...context,
      },
    }

    // agentLog('H2', 'errorReporting.ts:reportError', 'captured', {
    //   source,
    //   name: report.name,
    //   message: report.message,
    // })

    enqueue(report)
  }
}

export function initErrorReporting() {
  if (installed) return
  installed = true

  // 1) console.error hook（用户希望“映射出公共模块收集”）
  originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    // 先调用原始 console.error，确保开发体验不变
    originalConsoleError?.(...args)

    // 再上报（避免递归：reportError 内部不使用 console.error）
    try {
      const msg = args.map(a => safeStringify(a)).join(' ')
      reportError('console.error', new Error(msg), { data: args.map(a => safeStringify(a)) })
    } catch {
      // ignore
    }
  }

  // 2) window.onerror
  window.addEventListener('error', (event) => {
    const errorContext = {
      hypothesisId: undefined,
      location: undefined,
      message: (event as ErrorEvent).message,
      data: undefined
    };
    reportError('window.error', event.error || event.message, errorContext)
  })

  // 3) unhandledrejection
  window.addEventListener('unhandledrejection', (event) => {
    reportError('unhandledrejection', event.reason, {})
  })

  // 4) beforeunload flush（尽量把队列发出去）
  window.addEventListener('beforeunload', () => {
    flushQueue().catch(() => {})
  })

  // agentLog('H1', 'errorReporting.ts:initErrorReporting', 'installed', { endpoint: REPORT_ENDPOINT })
}

