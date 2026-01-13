// 加密工具函数
export class CryptoUtils {
  // 检查 Web Crypto API 是否可用
  private static checkCryptoSupport(): void {
    if (typeof window === 'undefined') {
      const error = new Error('Web Crypto API 仅在浏览器环境中可用')
      console.error('[CryptoUtils] 环境检查失败:', error)
      throw error
    }
    
    if (!window.crypto) {
      const error = new Error('浏览器不支持 Web Crypto API，请使用现代浏览器（Chrome、Firefox、Edge、Safari）')
      console.error('[CryptoUtils] crypto 对象不存在')
      throw error
    }
    
    if (!window.crypto.subtle) {
      const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname === '[::1]'
      const isHttps = window.location.protocol === 'https:'
      const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)
      const currentUrl = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '')
      
      console.error('[CryptoUtils] crypto.subtle 不可用', {
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        isLocalhost,
        isHttps,
        isIpAddress,
        userAgent: navigator.userAgent
      })
      
      if (!isLocalhost && !isHttps) {
        // 判断是否是 IP 地址访问
        if (isIpAddress) {
          throw new Error(
            `❌ Web Crypto API 需要 HTTPS 安全连接！\n\n` +
            `当前访问地址：${currentUrl}\n` +
            `检测到您使用 IP 地址通过 HTTP 协议访问（不安全）\n\n` +
            `⚠️ 重要说明：\n` +
            `Chrome、Firefox 等现代浏览器出于安全考虑，要求 Web Crypto API 必须在以下环境运行：\n` +
            `• HTTPS 协议（https://...）\n` +
            `• localhost（本地开发）\n` +
            `• 127.0.0.1（本地开发）\n\n` +
            `🔧 解决方案：\n` +
            `方案 1（推荐）：配置 HTTPS\n` +
            `  1. 在服务器上配置 SSL 证书\n` +
            `  2. 使用 https://120.26.182.246/ 访问\n` +
            `  3. 或配置域名并申请证书，使用 https://yourdomain.com 访问\n\n` +
            `方案 2：使用本地开发环境\n` +
            `  1. 在本地运行：npm run dev\n` +
            `  2. 使用 http://localhost:5173 访问（localhost 允许 HTTP）\n\n` +
            `方案 3：使用自签名证书（仅测试环境）\n` +
            `  1. 生成自签名证书\n` +
            `  2. 在 Chrome 中访问 https://120.26.182.246/\n` +
            `  3. 点击"高级" → "继续访问"（不安全）\n\n` +
            `💡 提示：生产环境强烈建议使用正式的 SSL 证书（如 Let's Encrypt 免费证书）`
          )
        } else {
          throw new Error(
            `❌ Web Crypto API 需要 HTTPS 安全连接！\n\n` +
            `当前访问地址：${currentUrl}\n` +
            `检测到您使用的是 HTTP 协议（不安全）\n\n` +
            `解决方案：\n` +
            `1. 请使用 HTTPS 地址访问（如 https://yourdomain.com）\n` +
            `2. 或在本地开发环境使用 localhost\n\n` +
            `注意：Chrome、Firefox 等现代浏览器要求加密功能必须在 HTTPS 环境下运行，以保护用户隐私和安全。`
          )
        }
      } else {
        throw new Error(
          `❌ 浏览器环境异常\n\n` +
          `当前环境：${currentUrl} (${isHttps ? 'HTTPS' : isLocalhost ? 'localhost' : 'HTTP'})\n` +
          `浏览器：${navigator.userAgent}\n\n` +
          `可能的原因：\n` +
          `1. 浏览器版本过旧，请更新到最新版本\n` +
          `2. 浏览器设置禁用了 Web Crypto API\n` +
          `3. 使用了不支持的浏览器（请使用 Chrome、Firefox、Edge、Safari）\n` +
          `4. 浏览器扩展或安全软件阻止了 crypto.subtle\n\n` +
          `建议：请使用最新版 Chrome 或 Firefox 浏览器，并确保没有安全扩展阻止加密功能。`
        )
      }
    }
  }

  // 生成随机密钥
  static async generateKey(): Promise<CryptoKey> {
    this.checkCryptoSupport()
    
    try {
      // 使用局部变量保存引用
      const subtle = window.crypto?.subtle
      if (!subtle) {
        throw new Error('crypto.subtle 在执行时不可用')
      }
      
      return await subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['encrypt', 'decrypt']
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[CryptoUtils] 生成密钥失败:', {
        error: errorMessage,
        hasCrypto: typeof window !== 'undefined' && !!window.crypto,
        hasSubtle: typeof window !== 'undefined' && window.crypto && !!window.crypto.subtle
      })
      throw new Error('生成密钥失败：' + errorMessage)
    }
  }

  // 从密码派生密钥
  static async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    // 在方法开始时检查
    this.checkCryptoSupport()
    
    try {
      // 在实际使用前再次检查，确保 crypto.subtle 仍然可用
      if (!window.crypto || !window.crypto.subtle) {
        const isLocalhost = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' ||
                            window.location.hostname === '[::1]'
        const isHttps = window.location.protocol === 'https:'
        
        console.error('[CryptoUtils] crypto.subtle 在使用时不可用', {
          hostname: window.location.hostname,
          protocol: window.location.protocol,
          isLocalhost,
          isHttps,
          hasCrypto: !!window.crypto,
          hasSubtle: !!(window.crypto && window.crypto.subtle)
        })
        
        if (!isLocalhost && !isHttps) {
          throw new Error('Web Crypto API 需要 HTTPS 连接。当前环境：' + window.location.protocol + '//' + window.location.hostname + '。请在 HTTPS 环境下使用，或使用 localhost 进行本地开发')
        } else {
          throw new Error('浏览器不支持 Web Crypto API，请更新浏览器或使用其他现代浏览器（Chrome、Firefox、Edge、Safari）')
        }
      }
      
      const encoder = new TextEncoder()
      const passwordData = encoder.encode(password)
      
      // 使用局部变量保存引用，避免在异步操作中丢失
      const subtle = window.crypto.subtle
      
      if (!subtle) {
        throw new Error('crypto.subtle 在执行时不可用，可能是环境变化导致')
      }
      
      const keyMaterial = await subtle.importKey(
        'raw',
        passwordData,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      )

      const derivedKey = await subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt.buffer as ArrayBuffer,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )
      
      return derivedKey
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[CryptoUtils] 密钥派生失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        stack: err instanceof Error ? err.stack : undefined,
        hasCrypto: typeof window !== 'undefined' && !!window.crypto,
        hasSubtle: typeof window !== 'undefined' && window.crypto && !!window.crypto.subtle
      })
      throw new Error('密钥派生失败：' + errorMessage)
    }
  }

  // 加密数据
  static async encrypt(data: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
    this.checkCryptoSupport()
    
    try {
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error('crypto.subtle 在执行时不可用')
      }
      
      // 使用局部变量保存引用
      const crypto = window.crypto
      const subtle = crypto.subtle
      
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        data
      )

      return { encrypted, iv }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[CryptoUtils] 加密失败:', {
        error: errorMessage,
        errorType: err?.constructor?.name,
        dataSize: data.byteLength,
        stack: err instanceof Error ? err.stack : undefined,
        hasCrypto: typeof window !== 'undefined' && !!window.crypto,
        hasSubtle: typeof window !== 'undefined' && window.crypto && !!window.crypto.subtle
      })
      throw new Error('加密失败：' + errorMessage)
    }
  }

  // 解密数据
  static async decrypt(encrypted: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
    this.checkCryptoSupport()
    
    try {
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error('crypto.subtle 在执行时不可用')
      }
      
      // 使用局部变量保存引用
      const subtle = window.crypto.subtle
      
      return await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv.buffer as ArrayBuffer,
        },
        key,
        encrypted
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (errorMessage.includes('password') || errorMessage.includes('decrypt') || errorMessage.includes('密码错误')) {
        throw new Error('密码错误或数据已损坏')
      }
      console.error('[CryptoUtils] 解密失败:', {
        error: errorMessage,
        hasCrypto: typeof window !== 'undefined' && !!window.crypto,
        hasSubtle: typeof window !== 'undefined' && window.crypto && !!window.crypto.subtle
      })
      throw new Error('解密失败：' + errorMessage)
    }
  }

  // 生成文档ID
  static generateDocId(): string {
    if (typeof window === 'undefined' || !window.crypto) {
      // 降级方案：使用时间戳和随机数
      return Date.now().toString(36) + Math.random().toString(36).substr(2, 6).toUpperCase()
    }
    
    try {
      return Array.from(window.crypto.getRandomValues(new Uint8Array(6)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    } catch (err) {
      // 降级方案
      return Date.now().toString(36) + Math.random().toString(36).substr(2, 6).toUpperCase()
    }
  }

  // 将ArrayBuffer转换为Base64
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // 将Base64转换为ArrayBuffer
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
}

