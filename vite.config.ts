import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore
import obfuscatorPlugin from 'rollup-plugin-obfuscator'

const enableObfuscation = process.env.VITE_ENABLE_OBFUSCATION === 'true'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 只在生产环境使用 /tools/ 前缀，开发环境使用根路径
  base: mode === 'production' ? '/tools/' : '/',
  plugins: [react()],
  build: {
    // 构建优化配置
    minify: 'terser',                    // 使用 terser 进行压缩（比 esbuild 压缩率更高）
    terserOptions: {
      compress: {
        drop_console: false,             // 保留 console（可根据需要移除）
        drop_debugger: true,             // 移除 debugger
        pure_funcs: ['console.log']      // 移除指定的纯函数调用（可选）
      },
      format: {
        comments: false                  // 移除注释
      }
    },
    // 代码分割配置
    rollupOptions: {
      plugins: [
        // 代码混淆配置（仅在生产环境启用）
        ...(mode === 'production' && enableObfuscation ? [
          obfuscatorPlugin({
            // 混淆选项配置
            options: {
              compact: true,                    // 压缩代码
              controlFlowFlattening: true,      // 控制流扁平化
              controlFlowFlatteningThreshold: 0.75,  // 控制流扁平化阈值
              deadCodeInjection: true,          // 死代码注入
              deadCodeInjectionThreshold: 0.4,  // 死代码注入阈值
              debugProtection: false,           // 调试保护（可能影响开发，生产环境可开启）
              debugProtectionInterval: 0,      // 调试保护间隔
              disableConsoleOutput: false,      // 禁用 console（可选，根据需要开启）
              identifierNamesGenerator: 'hexadecimal', // 标识符名称生成器
              log: false,                       // 不输出日志
              numbersToExpressions: true,       // 数字转表达式
              renameGlobals: false,             // 重命名全局变量（可能影响第三方库）
              selfDefending: true,              // 自我防御（防止格式化）
              simplify: true,                   // 简化代码
              splitStrings: true,               // 分割字符串
              splitStringsChunkLength: 10,      // 字符串分割长度
              stringArray: true,                // 字符串数组
              stringArrayCallsTransform: true,  // 字符串数组调用转换
              stringArrayEncoding: ['base64'],  // 字符串数组编码
              stringArrayIndexShift: true,      // 字符串数组索引偏移
              stringArrayRotate: true,          // 字符串数组旋转
              stringArrayShuffle: true,        // 字符串数组洗牌
              stringArrayWrappersCount: 2,     // 字符串数组包装器数量
              stringArrayWrappersChainedCalls: true, // 字符串数组包装器链式调用
              stringArrayWrappersParametersMaxCount: 4, // 字符串数组包装器参数最大数量
              stringArrayWrappersType: 'function', // 字符串数组包装器类型
              stringArrayThreshold: 0.75,      // 字符串数组阈值
              transformObjectKeys: true,        // 转换对象键
              unicodeEscapeSequence: false      // Unicode 转义序列（可开启增强混淆）
            },
            // 排除 node_modules 和 PDF.js 相关文件（不混淆第三方库和 PDF.js）
            exclude: [
              'node_modules/**',
              '**/pdfjs-dist/**',
              '**/pdf.worker*',
              '**/pdfWorkerConfig*'
            ],
            // 仅混淆 JS 文件
            include: ['**/*.js', '**/*.mjs']
          })
        ] : [])
      ],
      output: {
        // 手动代码分割，优化加载性能
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'pdf-vendor': ['pdf-lib', 'pdfjs-dist'],
          'utils-vendor': ['file-saver', 'html2canvas', 'jspdf', 'marked']
        },
        // 混淆后的文件名格式
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // 生成 source map（生产环境建议关闭以提高安全性）
    sourcemap: false,
    // 提高构建警告阈值（避免大文件警告）
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000, // Change the port to avoid conflicts
    strictPort: true, // Fail if the port is already in use
    host: '127.0.0.1',
    open: true,
    // 配置文件服务，确保 WASM 和 worker 文件正确提供
    fs: {
      allow: ['..', '.']
    },
    // 添加响应头以支持 FFmpeg.wasm（SharedArrayBuffer）和 ONNX Runtime WASM
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // credentialless: 启用 SharedArrayBuffer 的同时允许跨域资源（AI 模型 CDN）
      'Cross-Origin-Embedder-Policy': 'credentialless',
      // 'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    },
    // 注意：Vite 默认支持 SPA 路由，无需额外配置
    // API 代理配置（开发环境）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        // 如果后端API路径不需要/api前缀，可以重写路径
        // rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  preview: {
    port: 3000,
    // 添加响应头以支持 FFmpeg.wasm（SharedArrayBuffer）
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      // 使用与Nginx生产环境一致的策略
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
    // 注意：Vite 预览模式默认支持 SPA 路由
  },

  // 🔥 添加：优化 WASM 和大文件处理
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'onnxruntime-web'],
    include: ['@imgly/background-removal']
  },

  // 🔥 配置 WASM 文件处理以支持 ONNX Runtime
  worker: {
    format: 'es'
  }
}))

