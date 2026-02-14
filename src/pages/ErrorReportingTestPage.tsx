import React, { useEffect } from 'react'
import { initErrorReporting } from '../utils/errorReporting'

const ErrorReportingTestPage: React.FC = () => {
  useEffect(() => {
    initErrorReporting()
  }, [])

  const triggerConsoleError = () => {
    console.error('Test console.error triggered', { sample: 123 })
  }

  const triggerWindowError = () => {
    setTimeout(() => {
      // @ts-ignore - intentionally call undefined to throw
      ;(window as any).thisFunctionDoesNotExist()
    }, 0)
  }

  const triggerUnhandledRejection = () => {
    setTimeout(() => {
      // create an unhandled rejection
      Promise.reject(new Error('Test unhandled rejection'))
    }, 0)
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Error Reporting Test</h2>
      <p>Click the buttons to trigger different frontend error scenarios.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={triggerConsoleError}>Trigger console.error</button>
        <button onClick={triggerWindowError}>Trigger uncaught runtime error</button>
        <button onClick={triggerUnhandledRejection}>Trigger unhandledrejection</button>
      </div>
    </div>
  )
}

export default ErrorReportingTestPage
