import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Upload, Download, X, AlertCircle, Pause, Play, Trash2, GripVertical, Settings, Eye, EyeOff, CheckSquare, Square, Video, Maximize2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './VideoCompression.css'

// 任务状态
type TaskStatus = 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled'

// 压缩模式
type CompressionMode = 'crf' | 'bitrate' | 'size'
type VideoCodec = 'h264' | 'vp9'

interface CompressionOptions {
  mode: CompressionMode
  crf: number // 18-28 (越小质量越高)
  bitrate?: number // kbps
  targetSize?: number // MB
  codec: VideoCodec
  resolution?: string // 'original' | '1080p' | '720p' | '480p'
  fps?: number // 帧率限制
}

interface CompressionTask {
  id: string
  file: File
  status: TaskStatus
  progress: number
  originalSize: number
  compressedSize?: number
  originalPreview?: string
  compressedPreview?: string
  error?: string
  options: CompressionOptions
  order: number
  duration?: number
  videoInfo?: {
    width: number
    height: number
    fps: number
    bitrate: number
    duration: number
  }
}

interface CompressionStats {
  totalOriginalSize: number
  totalCompressedSize: number
  savedSize: number
  savedPercentage: number
  totalFiles: number
  completedFiles: number
}

const MAX_FILES = 5
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export default function VideoCompression() {
  const { language } = useI18n()
  const [tasks, setTasks] = useState<CompressionTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [globalOptions, setGlobalOptions] = useState<CompressionOptions>({
    mode: 'crf',
    crf: 23,
    codec: 'h264',
    resolution: 'original'
  })
  const [showPreview, setShowPreview] = useState(true)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState('')
  const currentTaskRef = useRef<string | null>(null)
  const tasksRef = useRef<CompressionTask[]>([])
  const isProcessingRef = useRef(false)
  const isPausedRef = useRef(false)

  // 同步 tasks 到 tasksRef
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  // 环境检查
  const checkEnvironment = useCallback(() => {
    const issues: string[] = []
    
    // 检查 SharedArrayBuffer 支持
    if (typeof SharedArrayBuffer === 'undefined') {
      issues.push(language === 'zh-CN' 
        ? '❌ SharedArrayBuffer 不可用（需要 COOP/COEP 头部）'
        : '❌ SharedArrayBuffer unavailable (requires COOP/COEP headers)')
      console.error('SharedArrayBuffer is not available. FFmpeg.wasm requires it.')
      console.error('This typically means the server is not sending the required headers:')
      console.error('  Cross-Origin-Opener-Policy: same-origin')
      console.error('  Cross-Origin-Embedder-Policy: require-corp')
    } else {
      console.log('✅ SharedArrayBuffer is available')
    }
    
    // 检查 WebAssembly 支持
    if (typeof WebAssembly === 'undefined') {
      issues.push(language === 'zh-CN' 
        ? '❌ WebAssembly 不支持'
        : '❌ WebAssembly not supported')
    } else {
      console.log('✅ WebAssembly is supported')
    }
    
    return issues
  }, [language])


  const loadFFmpegWithTimeout = useCallback(
    async (timeout: number = 90000): Promise<boolean> => {
      return new Promise(async (resolve) => {
        const envIssues = checkEnvironment();
        if (envIssues.length > 0) {
          console.error("Environment check failed:", envIssues);
          setLoadingProgress(envIssues.join("\n"));
          setTimeout(() => resolve(false), 3000);
          return;
        }

        const timer = setTimeout(() => {
          console.error("❌ FFmpeg initialization timeout");
          setLoadingProgress(
            language === "zh-CN" ? "FFmpeg 加载超时" : "FFmpeg load timeout",
          );
          resolve(false);
        }, timeout);

        try {
          // 检查关键环境
          if (!window.crossOriginIsolated) {
            throw new Error(
              "crossOriginIsolated is false - check server headers",
            );
          }

          let ffmpeg = new FFmpeg();

          // let lastLog = "";
          ffmpeg.on("log", ({ message }) => {
            console.log(`[FFmpeg]:`, message);
            // lastLog = message;
            setLoadingProgress(`${message.substring(0, 80)}`);
          });

          console.log("🔄 Loading FFmpeg...");
          setLoadingProgress(
            language === "zh-CN" ? "正在加载 FFmpeg..." : "Loading FFmpeg...",
          );

          // 优先尝试本地文件（更可靠）
          // 在开发环境中使用完整 URL，避免 Vite 模块解析错误
          const isDev = import.meta.env.DEV;
          const baseURL = isDev 
            ? window.location.origin 
            : (window.location.origin + import.meta.env.BASE_URL);
          const localCore = `${baseURL}/ffmpeg-core.js`;
          const localWasm = `${baseURL}/ffmpeg-core.wasm`;

          // 检查本地文件是否存在
          try {
            const coreRes = await fetch(localCore, { method: "HEAD" });
            const wasmRes = await fetch(localWasm, { method: "HEAD" });

            if (coreRes.ok && wasmRes.ok) {
              const coreSize = parseInt(coreRes.headers.get('content-length') || '0', 10);
              const wasmSize = parseInt(wasmRes.headers.get('content-length') || '0', 10);
              
              console.log("✅ Using local files");
              console.log(`   Core: ${localCore} (${(coreSize / 1024).toFixed(1)} KB)`);
              console.log(`   WASM: ${localWasm} (${(wasmSize / 1024 / 1024).toFixed(1)} MB)`);
              
              // 验证文件大小（粗略检查）
              if (coreSize < 100000) {
                console.warn("⚠️ Core file seems too small, may be corrupted");
              }
              if (wasmSize < 30000000) {
                console.warn("⚠️ WASM file seems too small, may be corrupted");
              }
              
              // 验证文件内容（检查是否是有效的 JavaScript）
              try {
                const coreContentRes = await fetch(localCore);
                const coreText = await coreContentRes.text();
                const firstChars = coreText.substring(0, 100);
                console.log(`📄 Core file starts with: ${firstChars}...`);
                
                // 检查是否是有效的 JavaScript（应该以 function, var, const, 或 (function 开头）
                if (!/^(function|var|const|let|\(function|export|import)/.test(coreText.trim())) {
                  console.warn("⚠️ Core file doesn't look like valid JavaScript");
                } else {
                  console.log("✅ Core file appears to be valid JavaScript");
                }
              } catch (verifyErr) {
                console.warn("⚠️ Could not verify core file content:", verifyErr);
              }
              
              setLoadingProgress(
                language === "zh-CN" ? "正在加载本地文件..." : "Loading local files...",
              );

              try {
                // 方法1：直接使用 toBlobURL（这是 FFmpeg.wasm 官方推荐的方式）
                console.log("🔄 Using toBlobURL (official method)...");
                setLoadingProgress(
                  language === "zh-CN" ? "正在转换文件格式..." : "Converting file format...",
                );
                
                // toBlobURL 会正确处理文件下载和 Blob URL 创建
                const coreBlobURL = await toBlobURL(localCore, "text/javascript");
                const wasmBlobURL = await toBlobURL(localWasm, "application/wasm");
                
                console.log("✅ Blob URLs created with toBlobURL");
                console.log(`   Core Blob URL: ${coreBlobURL.substring(0, 50)}...`);
                console.log(`   WASM Blob URL: ${wasmBlobURL.substring(0, 50)}...`);
                
                setLoadingProgress(
                  language === "zh-CN" ? "正在初始化 FFmpeg..." : "Initializing FFmpeg...",
                );
                
                // 使用 Blob URL 加载
                await ffmpeg.load({
                  coreURL: coreBlobURL,
                  wasmURL: wasmBlobURL,
                });
                
                console.log("✅ FFmpeg loaded successfully with toBlobURL");
              } catch (blobErr) {
                console.log("⚠️ toBlobURL failed, trying direct URL...");
                console.error("toBlobURL error:", blobErr);
                
                try {
                  // 方法2：回退到直接 URL
                  console.log("🔄 Attempting direct URL load...");
                  setLoadingProgress(
                    language === "zh-CN" ? "正在使用直接 URL 加载..." : "Loading with direct URL...",
                  );
                  
                  await ffmpeg.load({
                    coreURL: localCore,
                    wasmURL: localWasm,
                  });
                  
                  console.log("✅ FFmpeg loaded with direct URLs");
                } catch (directErr) {
                  console.log("⚠️ Direct URL also failed, trying fetchFile...");
                  console.error("Direct URL error:", directErr);
                  
                  // 方法3：最后尝试 fetchFile + 手动创建 Blob
                  setLoadingProgress(
                    language === "zh-CN" ? "正在下载文件..." : "Downloading files...",
                  );
                  
                  const coreFile = await fetchFile(localCore);
                  const wasmFile = await fetchFile(localWasm);
                  
                  console.log("✅ Files fetched, creating Blob URLs manually...");
                  const coreBlobURL = URL.createObjectURL(new Blob([coreFile as any], { type: "text/javascript" }));
                  const wasmBlobURL = URL.createObjectURL(new Blob([wasmFile as any], { type: "application/wasm" }));
                  
                  setLoadingProgress(
                    language === "zh-CN" ? "正在初始化 FFmpeg..." : "Initializing FFmpeg...",
                  );
                  
                  await ffmpeg.load({
                    coreURL: coreBlobURL,
                    wasmURL: wasmBlobURL,
                  });
                  
                  console.log("✅ FFmpeg loaded with fetchFile");
                }
              }
            } else {
              throw new Error(`Local files not found: core=${coreRes.status}, wasm=${wasmRes.status}`);
            }
          } catch (localErr) {
            console.log("⚠️ Local file load failed:", localErr);
            console.log("🔄 Trying CDN as fallback...");
            setLoadingProgress(
              language === "zh-CN" ? "本地文件加载失败，尝试 CDN..." : "Local load failed, trying CDN...",
            );

            // 创建新的 FFmpeg 实例（避免状态污染）
            const ffmpegCDN = new FFmpeg();
            ffmpegCDN.on("log", ({ message }) => {
              console.log(`[FFmpeg CDN]:`, message);
            });

            // CDN 回退 - 尝试 ESM 版本（可能比 UMD 更兼容）
            // 注意：如果 ESM 失败，会回退到 UMD
            let cdnBase = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
            let coreCDN = `${cdnBase}/ffmpeg-core.js`;
            let wasmCDN = `${cdnBase}/ffmpeg-core.wasm`;
            
            console.log("📦 Trying ESM version from CDN first...");

            try {
              // 方法1：直接使用 toBlobURL（官方推荐）
              console.log("🔄 Using toBlobURL from CDN (official method)...");
              setLoadingProgress(
                language === "zh-CN" ? "正在从 CDN 转换文件格式..." : "Converting CDN files...",
              );
              
              const coreBlobURL = await toBlobURL(coreCDN, "text/javascript");
              const wasmBlobURL = await toBlobURL(wasmCDN, "application/wasm");
              
              console.log("✅ Blob URLs created from CDN with toBlobURL");
              setLoadingProgress(
                language === "zh-CN" ? "正在初始化 FFmpeg..." : "Initializing FFmpeg...",
              );

              await ffmpegCDN.load({
                coreURL: coreBlobURL,
                wasmURL: wasmBlobURL,
              });
              
              // 成功，替换实例并重新设置事件监听
              ffmpeg = ffmpegCDN;
              ffmpeg.on("log", ({ message }) => {
                console.log(`[FFmpeg]:`, message);
                setLoadingProgress(`${message.substring(0, 80)}`);
              });
              console.log("✅ FFmpeg loaded successfully with toBlobURL from CDN");
            } catch (blobErr) {
              console.log("⚠️ toBlobURL from CDN failed, trying direct URL...");
              console.error("toBlobURL error:", blobErr);
              
              try {
                // 方法2：回退到直接 URL
                console.log("🔄 Attempting direct CDN URL load...");
                setLoadingProgress(
                  language === "zh-CN" ? "正在使用直接 CDN URL 加载..." : "Loading with direct CDN URL...",
                );
                
                await ffmpegCDN.load({
                  coreURL: coreCDN,
                  wasmURL: wasmCDN,
                });
                console.log("✅ FFmpeg loaded with direct CDN URLs");
                
                // 成功，替换实例
                ffmpeg = ffmpegCDN;
                ffmpeg.on("log", ({ message }) => {
                  console.log(`[FFmpeg]:`, message);
                  setLoadingProgress(`${message.substring(0, 80)}`);
                });
              } catch (directErr) {
                console.log("⚠️ Direct CDN URL also failed, trying fetchFile...");
                console.error("Direct URL error:", directErr);
                
                // 方法3：最后尝试 fetchFile
                setLoadingProgress(
                  language === "zh-CN" ? "正在从 CDN 下载文件..." : "Downloading files from CDN...",
                );
                
                const coreFile = await fetchFile(coreCDN);
                const wasmFile = await fetchFile(wasmCDN);
                
                console.log("✅ CDN files fetched, creating Blob URLs manually...");
                const coreBlobURL = URL.createObjectURL(new Blob([coreFile as any], { type: "text/javascript" }));
                const wasmBlobURL = URL.createObjectURL(new Blob([wasmFile as any], { type: "application/wasm" }));
                
                setLoadingProgress(
                  language === "zh-CN" ? "正在初始化 FFmpeg..." : "Initializing FFmpeg...",
                );

                await ffmpegCDN.load({
                  coreURL: coreBlobURL,
                  wasmURL: wasmBlobURL,
                });
                
                // 成功，替换实例并重新设置事件监听
                ffmpeg = ffmpegCDN;
                ffmpeg.on("log", ({ message }) => {
                  console.log(`[FFmpeg]:`, message);
                  setLoadingProgress(`${message.substring(0, 80)}`);
                });
                console.log("✅ FFmpeg loaded with fetchFile from CDN");
              }
            }
          }

          clearTimeout(timer);
          ffmpegRef.current = ffmpeg;
          setFfmpegLoaded(true);
          console.log("✅ FFmpeg loaded successfully");
          setLoadingProgress(
            language === "zh-CN" ? "FFmpeg 已就绪" : "FFmpeg ready",
          );
          resolve(true);
        } catch (err) {
          clearTimeout(timer);
          console.error("❌ FFmpeg load failed:", err);

          // 更详细的错误信息
          const errorMsg =
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : String(err);
          
          // 收集完整的错误信息
          const errorDetails: any = {
            type: typeof err,
            message: errorMsg,
            crossOriginIsolated: window.crossOriginIsolated,
            sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
            userAgent: navigator.userAgent,
            browser: {
              name: navigator.userAgent.includes("Chrome") ? "Chrome" : 
                    navigator.userAgent.includes("Firefox") ? "Firefox" :
                    navigator.userAgent.includes("Safari") ? "Safari" : "Unknown",
            },
            error: err,
          };
          
          // 如果是 Error 对象，添加堆栈信息
          if (err instanceof Error) {
            errorDetails.stack = err.stack;
            errorDetails.name = err.name;
          }
          
          console.error("❌ Complete error details:", errorDetails);
          
          // 检查是否是已知的 FFmpeg.wasm bug
          if (errorMsg.includes("failed to import")) {
            console.error("🔍 This is a known FFmpeg.wasm issue:");
            console.error("   - The file cannot be dynamically imported as a module");
            console.error("   - This may be a browser compatibility issue");
            console.error("   - Or a version mismatch between @ffmpeg/ffmpeg and @ffmpeg/core");
            console.error("   - Try: Clear browser cache, use Chrome/Edge latest version");
          }

          // 检查是否是导入错误
          if (errorMsg.includes("failed to import")) {
            const helpMsg = language === "zh-CN"
              ? "FFmpeg 导入失败。这可能是版本不匹配或浏览器兼容性问题。\n\n建议：\n1. 确保使用 Chrome/Edge 最新版本\n2. 清除浏览器缓存后重试\n3. 检查控制台是否有其他错误"
              : "FFmpeg import failed. This may be a version mismatch or browser compatibility issue.\n\nSuggestions:\n1. Use latest Chrome/Edge\n2. Clear cache and retry\n3. Check console for other errors";
            
            setLoadingProgress(helpMsg);
            alert(helpMsg);
          } else {
            setLoadingProgress(
              language === "zh-CN"
                ? `加载失败: ${errorMsg}。请检查网络连接或刷新页面重试。`
                : `Load failed: ${errorMsg}. Please check network or refresh.`,
            );
          }
          
          setTimeout(() => resolve(false), 3000);
        }
      });
    },
    [language, checkEnvironment],
  );

  // 带超时的 FFmpeg 加载
  // const loadFFmpegWithTimeout = useCallback(async (timeout: number = 30000): Promise<boolean> => {
  //   return new Promise(async (resolve) => {
  //     // 环境检查
  //     const envIssues = checkEnvironment()
  //     if (envIssues.length > 0) {
  //       console.error('Environment check failed:', envIssues)
  //       setLoadingProgress(envIssues.join('\n'))
  //       setTimeout(() => resolve(false), 3000)
  //       return
  //     }

  //     const timer = setTimeout(() => {
  //       console.error('❌ FFmpeg initialization timeout')
  //       resolve(false)
  //     }, timeout)

  //     try {
  //       const ffmpeg = new FFmpeg()
        
  //       // 添加所有可能的事件监听
  //       let logCount = 0
  //       ffmpeg.on('log', ({ type, message }) => {
  //         logCount++
  //         console.log(`[FFmpeg Log #${logCount} ${type}]:`, message)
  //         setLoadingProgress(`FFmpeg: ${message.substring(0, 100)}`)
          
  //         if (message.includes('error') || message.includes('failed')) {
  //           console.error('❌ FFmpeg error detected:', message)
  //         }
  //       })
        
  //       ffmpeg.on('progress', ({ progress, time }) => {
  //         console.log(`[FFmpeg Progress]: ${(progress * 100).toFixed(1)}% (${time}s)`)
  //       })
        
  //       // 尝试监听可能的错误事件
  //       window.addEventListener('error', (e) => {
  //         console.error('🔴 Global error during FFmpeg load:', e.error)
  //       }, { once: true })
        
  //       window.addEventListener('unhandledrejection', (e) => {
  //         console.error('🔴 Unhandled promise rejection during FFmpeg load:', e.reason)
  //       }, { once: true })
        
  //       // 优先使用本地文件（自动使用 Vite 的 base 路径）
  //       const baseURL = import.meta.env.BASE_URL
  //       // 🔥 方案2：使用官方 CDN（最可靠）
  //       // const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
        
  //       const coreURL = `${baseURL}ffmpeg-core.js`
  //       const wasmURL = `${baseURL}ffmpeg-core.wasm`
        
  //       console.log(`📂 Loading FFmpeg from: ${baseURL}`)
  //       console.log(`   Core: ${coreURL}`)
  //       console.log(`   WASM: ${wasmURL}`)
        
  //       // 检查文件是否可访问
  //       setLoadingProgress(language === 'zh-CN' ? '检查 FFmpeg 文件...' : 'Checking FFmpeg files...')
  //       try {
  //         const coreRes = await fetch(coreURL, { method: 'HEAD' })
  //         const wasmRes = await fetch(wasmURL, { method: 'HEAD' })
          
  //         if (!coreRes.ok) {
  //           throw new Error(`Core file not accessible: ${coreRes.status}`)
  //         }
  //         if (!wasmRes.ok) {
  //           throw new Error(`WASM file not accessible: ${wasmRes.status}`)
  //         }
          
  //         console.log(`✅ Core file accessible (${coreRes.headers.get('content-length')} bytes)`)
  //         console.log(`✅ WASM file accessible (${wasmRes.headers.get('content-length')} bytes)`)
  //       } catch (err) {
  //         console.error('❌ File accessibility check failed:', err)

  //         // 后备：使用 CDN
  //         const cdnBaseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
  //         await ffmpeg.load({
  //           coreURL: `${cdnBaseURL}/ffmpeg-core.js`,
  //           wasmURL: `${cdnBaseURL}/ffmpeg-core.wasm`,
  //         })
  //         throw err
  //       }
        
  //       setLoadingProgress(language === 'zh-CN' 
  //         ? '正在初始化 FFmpeg（这可能需要 10-30 秒）...' 
  //         : 'Initializing FFmpeg (may take 10-30 seconds)...')
        
  //       // 使用 toBlobURL 转换为 Blob URL（推荐方式，避免 CORS 问题）
  //       console.log('🔄 Converting to Blob URLs...')
  //       const coreBlobURL = await toBlobURL(coreURL, 'text/javascript')
  //       const wasmBlobURL = await toBlobURL(wasmURL, 'application/wasm')
  //       console.log('✅ Blob URLs created')
        
  //       await ffmpeg.load({
  //         coreURL: coreBlobURL,
  //         wasmURL: wasmBlobURL
  //       })
        
  //       clearTimeout(timer)
  //       ffmpegRef.current = ffmpeg
  //       setFfmpegLoaded(true)
  //       console.log('✅ FFmpeg loaded and initialized successfully')
  //       resolve(true)
        
  //     } catch (err) {
  //       clearTimeout(timer)
  //       console.error('❌ FFmpeg load error:', err)
  //       setLoadingProgress(`Error: ${err instanceof Error ? err.message : String(err)}`)
  //       setTimeout(() => resolve(false), 3000)
  //     }
  //   })
  // }, [language, checkEnvironment])

  // 初始化 FFmpeg（使用本地文件 + 超时控制）
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegLoaded || ffmpegLoading) return true
    
    setFfmpegLoading(true)
    setLoadingProgress(language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...')

    // 尝试加载（30秒超时）
    const success = await loadFFmpegWithTimeout(30000)
    
    setFfmpegLoading(false)
    setLoadingProgress('')
    
    if (!success) {
      const errorMessage = language === 'zh-CN'
        ? 'FFmpeg 加载失败或超时（30秒）。\n\n这是 FFmpeg.wasm 的已知问题，初始化可能会卡住。\n\n建议方案：\n1. 刷新页面重试\n2. 使用较小的视频文件测试\n3. 如需处理大文件，建议使用桌面软件\n\n技术限制：\n- FFmpeg.wasm 无硬件加速\n- 浏览器环境性能受限\n- 大文件处理可能不稳定'
        : 'FFmpeg loading failed or timeout (30s).\n\nThis is a known issue with FFmpeg.wasm initialization.\n\nSuggestions:\n1. Refresh and retry\n2. Try smaller video files\n3. For large files, use desktop software\n\nTechnical limitations:\n- No hardware acceleration\n- Browser performance limits\n- Large file processing may be unstable'
      
      alert(errorMessage)
    }
    
    return success
  }, [ffmpegLoaded, ffmpegLoading, language, loadFFmpegWithTimeout])

  // 支持的视频格式
  const supportedFormats = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v']

  // 文件上传处理
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    
    // 检查文件数量限制
    if (tasks.length + fileArray.length > MAX_FILES) {
      const message = language === 'zh-CN' 
        ? `最多只能处理 ${MAX_FILES} 个视频，当前已有 ${tasks.length} 个，请删除部分后再添加`
        : `Maximum ${MAX_FILES} videos allowed. You have ${tasks.length} videos. Please remove some before adding more.`
      alert(message)
      return
    }

    const newTasks: CompressionTask[] = []
    let order = tasks.length

    for (const file of fileArray) {
      // 检查文件类型
      const isVideo = supportedFormats.some(format => file.type === format) || 
                     /\.(mp4|mov|avi|webm|m4v)$/i.test(file.name)
      
      if (!isVideo) {
        continue
      }

      // 检查文件大小
      if (file.size > MAX_FILE_SIZE) {
        const message = language === 'zh-CN'
          ? `文件 ${file.name} 超过 500MB 限制`
          : `File ${file.name} exceeds 500MB limit`
        alert(message)
        continue
      }

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const preview = URL.createObjectURL(file)

      // 获取视频信息
      try {
        const videoInfo = await getVideoInfo(file, preview)
        
        newTasks.push({
          id: taskId,
          file,
          status: 'pending',
          progress: 0,
          originalSize: file.size,
          originalPreview: preview,
          options: { ...globalOptions },
          order: order++,
          videoInfo
        })
      } catch (err) {
        console.error('Failed to get video info:', err)
        newTasks.push({
          id: taskId,
          file,
          status: 'pending',
          progress: 0,
          originalSize: file.size,
          originalPreview: preview,
          options: { ...globalOptions },
          order: order++
        })
      }
    }

    setTasks(prev => {
      const updatedTasks = [...prev, ...newTasks]
      tasksRef.current = updatedTasks
      return updatedTasks
    })
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [tasks.length, globalOptions, language, supportedFormats])

  // 获取视频信息
  const getVideoInfo = useCallback((file: File, preview: string): Promise<{ width: number; height: number; fps: number; bitrate: number; duration: number }> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = preview
      
      video.onloadedmetadata = () => {
        const duration = video.duration
        const width = video.videoWidth
        const height = video.videoHeight
        
        // 估算帧率和码率
        const fps = 30 // 默认值，实际需要更复杂的检测
        const bitrate = Math.round((file.size * 8) / duration / 1000) // kbps
        
        resolve({ width, height, fps, bitrate, duration })
      }
      
      video.onerror = () => {
        reject(new Error('Failed to load video metadata'))
      }
    })
  }, [])

  // 拖拽上传
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    
    if (tasks.length + files.length > MAX_FILES) {
      const message = language === 'zh-CN' 
        ? `最多只能处理 ${MAX_FILES} 个视频`
        : `Maximum ${MAX_FILES} videos allowed`
      alert(message)
      return
    }

    const dataTransfer = new DataTransfer()
    files.forEach(file => dataTransfer.items.add(file))
    
    const input = fileInputRef.current
    if (input) {
      input.files = dataTransfer.files
      const event = new Event('change', { bubbles: true })
      input.dispatchEvent(event)
    }
  }, [tasks.length, language])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // 处理单个任务
  const processTask = useCallback(async (task: CompressionTask): Promise<void> => {
    if (!ffmpegRef.current) {
      throw new Error('FFmpeg not loaded')
    }

    const ffmpeg = ffmpegRef.current
    currentTaskRef.current = task.id

    try {
      // 读取文件
      const fileData = await fetchFile(task.file)
      await ffmpeg.writeFile('input.mp4', fileData)

      // 构建 FFmpeg 命令
      const args = buildFFmpegArgs(task.options, task.videoInfo)
      
      // 设置进度监听
      ffmpeg.on('progress', ({ progress: prog }) => {
        const progressValue = Math.round(prog * 100)
        setTasks(prev => {
          const newTasks = prev.map(t => 
            t.id === task.id 
              ? { ...t, progress: progressValue, status: 'processing' as TaskStatus }
              : t
          )
          tasksRef.current = newTasks
          return newTasks
        })
      })

      // 执行压缩
      await ffmpeg.exec(args)

      // 读取输出文件
      const data = await ffmpeg.readFile('output.mp4')
      // 创建 Blob（FFmpeg 返回 Uint8Array）
      // @ts-ignore - FFmpeg FileData type compatibility
      const blob = new Blob([data], { type: 'video/mp4' })
      const compressedPreview = URL.createObjectURL(blob)

      // 更新任务状态
      setTasks(prev => {
        const newTasks = prev.map(t => 
          t.id === task.id 
            ? {
                ...t,
                status: 'completed' as TaskStatus,
                progress: 100,
                compressedSize: blob.size,
                compressedPreview
              }
            : t
        )
        tasksRef.current = newTasks
        return newTasks
      })

      // 清理 FFmpeg 文件系统
      try {
        await ffmpeg.deleteFile('input.mp4')
        await ffmpeg.deleteFile('output.mp4')
      } catch (err) {
        console.warn('Failed to clean up FFmpeg files:', err)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setTasks(prev => {
        const newTasks = prev.map(t => 
          t.id === task.id 
            ? {
                ...t,
                status: 'failed' as TaskStatus,
                error: errorMessage
              }
            : t
        )
        tasksRef.current = newTasks
        return newTasks
      })
      throw error
    } finally {
      currentTaskRef.current = null
    }
  }, [])

  // 构建 FFmpeg 参数
  const buildFFmpegArgs = useCallback((options: CompressionOptions, videoInfo?: CompressionTask['videoInfo']): string[] => {
    const args = ['-i', 'input.mp4']

    // 编码器
    if (options.codec === 'h264') {
      args.push('-c:v', 'libx264')
    } else {
      args.push('-c:v', 'libvpx-vp9')
    }

    // 压缩模式
    if (options.mode === 'crf') {
      args.push('-crf', options.crf.toString())
    } else if (options.mode === 'bitrate' && options.bitrate) {
      args.push('-b:v', `${options.bitrate}k`)
    } else if (options.mode === 'size' && options.targetSize && videoInfo?.duration) {
      // 计算目标码率
      const targetBitrate = Math.floor((options.targetSize * 8 * 1024) / videoInfo.duration)
      args.push('-b:v', `${targetBitrate}k`)
    }

    // 分辨率
    if (options.resolution && options.resolution !== 'original' && videoInfo) {
      const resMap: Record<string, string> = {
        '1080p': '1920:-2',
        '720p': '1280:-2',
        '480p': '854:-2'
      }
      if (resMap[options.resolution]) {
        args.push('-vf', `scale=${resMap[options.resolution]}`)
      }
    }

    // 帧率
    if (options.fps) {
      args.push('-r', options.fps.toString())
    }

    // 音频
    args.push('-c:a', 'aac', '-b:a', '128k')

    // 输出
    args.push('output.mp4')

    return args
  }, [])

  // 处理队列
  const processQueue = useCallback(async () => {
    if (isPausedRef.current || !isProcessingRef.current) return

    const currentTasks = tasksRef.current
    const pendingTasks = currentTasks.filter(t => t.status === 'pending' || t.status === 'paused')
    
    if (pendingTasks.length === 0) {
      isProcessingRef.current = false
      setIsProcessing(false)
      return
    }

    const task = pendingTasks[0]

    try {
      await processTask(task)
      // 继续处理下一个
      setTimeout(() => processQueue(), 100)
    } catch (err) {
      console.error('Task processing error:', err)
      // 即使失败也继续下一个任务
      setTimeout(() => processQueue(), 100)
    }
  }, [processTask])

  // 开始处理
  const handleStart = useCallback(async () => {
    if (tasks.length === 0) return

    // 加载 FFmpeg
    const loaded = await loadFFmpeg()
    if (!loaded) {
      const message = language === 'zh-CN'
        ? 'FFmpeg 加载失败，请刷新页面重试'
        : 'FFmpeg loading failed, please refresh the page and try again'
      alert(message)
      return
    }

    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused')
    if (pendingTasks.length === 0) return

    tasksRef.current = tasks
    isProcessingRef.current = true
    isPausedRef.current = false
    setIsProcessing(true)
    setIsPaused(false)
    processQueue()
  }, [tasks, loadFFmpeg, processQueue, language])

  // 暂停
  const handlePause = useCallback(() => {
    isPausedRef.current = true
    setIsPaused(true)
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.status === 'processing' ? { ...t, status: 'paused' as TaskStatus } : t
      )
      tasksRef.current = newTasks
      return newTasks
    })
  }, [])

  // 继续
  const handleResume = useCallback(() => {
    isPausedRef.current = false
    setIsPaused(false)
    processQueue()
  }, [processQueue])

  // 取消
  const handleCancel = useCallback(() => {
    isProcessingRef.current = false
    isPausedRef.current = false
    setIsProcessing(false)
    setIsPaused(false)
    
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.status === 'processing' || t.status === 'paused' 
          ? { ...t, status: 'cancelled' as TaskStatus, progress: 0 }
          : t
      )
      tasksRef.current = newTasks
      return newTasks
    })
    currentTaskRef.current = null
  }, [])

  // 删除任务
  const handleRemoveTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId)
      if (task?.originalPreview) URL.revokeObjectURL(task.originalPreview)
      if (task?.compressedPreview) URL.revokeObjectURL(task.compressedPreview)
      const newTasks = prev.filter(t => t.id !== taskId).map((t, idx) => ({ ...t, order: idx }))
      tasksRef.current = newTasks
      return newTasks
    })
  }, [])

  // 批量应用全局设置
  const handleApplyGlobalToSelected = useCallback(() => {
    setTasks(prev => {
      const newTasks = prev.map(t => {
        const shouldUpdate = selectedTasks.size === 0
          ? (t.status === 'pending' || t.status === 'completed' || t.status === 'failed')
          : selectedTasks.has(t.id)
        
        return shouldUpdate
          ? { 
              ...t, 
              options: { ...globalOptions }, 
              status: 'pending' as TaskStatus, 
              progress: 0,
              compressedSize: undefined,
              compressedPreview: undefined,
              error: undefined
            }
          : t
      })
      tasksRef.current = newTasks
      return newTasks
    })
  }, [selectedTasks, globalOptions])

  // 切换任务选中状态
  const handleToggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }, [])

  // 全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(tasks.map(t => t.id)))
    }
  }, [selectedTasks, tasks])

  // 拖拽排序
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOverItem = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    setTasks(prev => {
      const newTasks = [...prev]
      const draggedTask = newTasks[draggedIndex]
      newTasks.splice(draggedIndex, 1)
      newTasks.splice(index, 0, draggedTask)
      const reorderedTasks = newTasks.map((t, idx) => ({ ...t, order: idx }))
      tasksRef.current = reorderedTasks
      return reorderedTasks
    })
    setDraggedIndex(index)
  }, [draggedIndex])

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
  }, [])

  // 计算统计信息
  const stats: CompressionStats = useMemo(() => {
    const completedTasks = tasks.filter(t => t.status === 'completed')
    const totalOriginal = tasks.reduce((sum, t) => sum + t.originalSize, 0)
    const totalCompressed = completedTasks.reduce((sum, t) => sum + (t.compressedSize || 0), 0)
    const saved = totalOriginal - totalCompressed
    const savedPercentage = totalOriginal > 0 ? (saved / totalOriginal) * 100 : 0

    return {
      totalOriginalSize: totalOriginal,
      totalCompressedSize: totalCompressed,
      savedSize: saved,
      savedPercentage,
      totalFiles: tasks.length,
      completedFiles: completedTasks.length
    }
  }, [tasks])

  // 下载单个文件
  const handleDownloadSingle = useCallback((task: CompressionTask) => {
    if (!task.compressedPreview) return
    fetch(task.compressedPreview)
      .then(res => res.blob())
      .then(blob => {
        const fileName = task.file.name.replace(/\.[^/.]+$/, '') + '_compressed.mp4'
        saveAs(blob, fileName)
      })
  }, [])

  // 下载全部
  const handleDownloadAll = useCallback(async () => {
    const completedTasks = tasks.filter(t => t.status === 'completed')
    if (completedTasks.length === 0) return

    if (completedTasks.length === 1) {
      handleDownloadSingle(completedTasks[0])
      return
    }

    const zip = new JSZip()
    
    for (const task of completedTasks) {
      if (!task.compressedPreview) continue
      const blob = await fetch(task.compressedPreview).then(r => r.blob())
      const fileName = task.file.name.replace(/\.[^/.]+$/, '') + '_compressed.mp4'
      zip.file(fileName, blob)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    saveAs(zipBlob, 'compressed_videos.zip')
  }, [tasks, handleDownloadSingle])

  // 播放完成音效
  const playSuccessSound = useCallback(() => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MTqTj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDE6k4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC')
      audio.volume = 0.3
      audio.play().catch(() => {})
    } catch (err) {
      // 忽略音效错误
    }
  }, [])

  // 当所有任务完成时播放音效
  useEffect(() => {
    const allCompleted = tasks.length > 0 && tasks.every(t => t.status === 'completed' || t.status === 'failed')
    if (allCompleted && isProcessing) {
      playSuccessSound()
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [tasks, isProcessing, playSuccessSound])

  // 清理对象 URL
  useEffect(() => {
    return () => {
      tasksRef.current.forEach(task => {
        if (task.originalPreview) URL.revokeObjectURL(task.originalPreview)
        if (task.compressedPreview) URL.revokeObjectURL(task.compressedPreview)
      })
    }
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="video-compression-container">
      {/* FFmpeg 加载提示 */}
      {ffmpegLoading && (
        <div className="ffmpeg-loading">
          <div className="loading-spinner"></div>
          <p className="loading-title">
            {language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...'}
          </p>
          {loadingProgress && (
            <p className="loading-progress">{loadingProgress}</p>
          )}
          <p className="loading-hint">
            {language === 'zh-CN' 
              ? '首次加载需要下载约 30MB 文件，请耐心等待...' 
              : 'First load requires ~30MB download, please wait...'}
          </p>
        </div>
      )}

      {/* 上传区域 */}
      <div 
        className="upload-area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <Upload size={48} />
        <p className="upload-text">
          {language === 'zh-CN' 
            ? `拖拽视频到此处或点击上传（最多${MAX_FILES}个，每个≤500MB）`
            : `Drag videos here or click to upload (max ${MAX_FILES}, ≤500MB each)`}
        </p>
        <button 
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          {language === 'zh-CN' ? '选择文件' : 'Select Files'}
        </button>
        <p className="supported-formats">
          {language === 'zh-CN' ? '支持格式：' : 'Supported: '}MP4, MOV, AVI, WebM, M4V
        </p>
      </div>

      {/* 全局设置 */}
      {tasks.length > 0 && (
        <div className="global-settings">
          <h3>
            <Settings size={20} />
            {language === 'zh-CN' ? '压缩设置' : 'Compression Settings'}
          </h3>
          <div className="settings-grid">
            <div className="setting-item">
              <label>{language === 'zh-CN' ? '压缩模式' : 'Mode'}</label>
              <select 
                value={globalOptions.mode}
                onChange={(e) => setGlobalOptions(prev => ({ ...prev, mode: e.target.value as CompressionMode }))}
              >
                <option value="crf">{language === 'zh-CN' ? 'CRF（画质优先）' : 'CRF (Quality Priority)'}</option>
                <option value="bitrate">{language === 'zh-CN' ? '目标码率（流媒体）' : 'Target Bitrate (Streaming)'}</option>
                <option value="size">{language === 'zh-CN' ? '目标大小（办公）' : 'Target Size (Office)'}</option>
              </select>
            </div>
            
            {globalOptions.mode === 'crf' && (
              <div className="setting-item">
                <label>{language === 'zh-CN' ? 'CRF 值' : 'CRF Value'}</label>
                <input 
                  type="range" 
                  min="18" 
                  max="28" 
                  value={globalOptions.crf}
                  onChange={(e) => setGlobalOptions(prev => ({ ...prev, crf: parseInt(e.target.value) }))}
                />
                <span>{globalOptions.crf} {language === 'zh-CN' ? '(越小质量越高)' : '(lower = better)'}</span>
              </div>
            )}
            
            {globalOptions.mode === 'bitrate' && (
              <div className="setting-item">
                <label>{language === 'zh-CN' ? '码率 (kbps)' : 'Bitrate (kbps)'}</label>
                <input 
                  type="number" 
                  min="500"
                  max="10000"
                  step="500"
                  placeholder="2000"
                  value={globalOptions.bitrate || ''}
                  onChange={(e) => setGlobalOptions(prev => ({ 
                    ...prev, 
                    bitrate: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                />
              </div>
            )}
            
            {globalOptions.mode === 'size' && (
              <div className="setting-item">
                <label>{language === 'zh-CN' ? '目标大小 (MB)' : 'Target Size (MB)'}</label>
                <input 
                  type="number" 
                  min="1"
                  max="500"
                  placeholder="50"
                  value={globalOptions.targetSize || ''}
                  onChange={(e) => setGlobalOptions(prev => ({ 
                    ...prev, 
                    targetSize: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                />
              </div>
            )}
            
            <div className="setting-item">
              <label>{language === 'zh-CN' ? '编码器' : 'Codec'}</label>
              <select 
                value={globalOptions.codec}
                onChange={(e) => setGlobalOptions(prev => ({ ...prev, codec: e.target.value as VideoCodec }))}
              >
                <option value="h264">H.264 ({language === 'zh-CN' ? '通用' : 'Universal'})</option>
                <option value="vp9">VP9 ({language === 'zh-CN' ? '高效' : 'Efficient'})</option>
              </select>
            </div>
          </div>
          
          <div className="settings-advanced-toggle">
            <button 
              className="btn-link"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            >
              <Maximize2 size={16} />
              {language === 'zh-CN' ? '高级设置' : 'Advanced Settings'}
            </button>
            {selectedTasks.size > 0 && (
              <button 
                className="btn-primary-small"
                onClick={handleApplyGlobalToSelected}
              >
                {language === 'zh-CN' ? `应用到选中 (${selectedTasks.size})` : `Apply to Selected (${selectedTasks.size})`}
              </button>
            )}
            <button 
              className="btn-primary-small"
              onClick={handleApplyGlobalToSelected}
            >
              {language === 'zh-CN' ? '应用到全部' : 'Apply to All'}
            </button>
          </div>
          
          {showAdvancedSettings && (
            <div className="settings-advanced">
              <div className="settings-grid">
                <div className="setting-item">
                  <label>{language === 'zh-CN' ? '分辨率' : 'Resolution'}</label>
                  <select
                    value={globalOptions.resolution || 'original'}
                    onChange={(e) => setGlobalOptions(prev => ({ 
                      ...prev, 
                      resolution: e.target.value 
                    }))}
                  >
                    <option value="original">{language === 'zh-CN' ? '保持原始' : 'Keep Original'}</option>
                    <option value="1080p">1080p (1920x1080)</option>
                    <option value="720p">720p (1280x720)</option>
                    <option value="480p">480p (854x480)</option>
                  </select>
                </div>
                <div className="setting-item">
                  <label>{language === 'zh-CN' ? '帧率限制' : 'FPS Limit'}</label>
                  <select
                    value={globalOptions.fps || ''}
                    onChange={(e) => setGlobalOptions(prev => ({ 
                      ...prev, 
                      fps: e.target.value ? parseInt(e.target.value) : undefined 
                    }))}
                  >
                    <option value="">{language === 'zh-CN' ? '保持原始' : 'Keep Original'}</option>
                    <option value="60">60 FPS</option>
                    <option value="30">30 FPS</option>
                    <option value="24">24 FPS</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      {tasks.length > 0 && (
        <div className="tasks-container">
          <div className="tasks-header">
            <div className="tasks-header-left">
              <h3>
                {language === 'zh-CN' ? '处理队列' : 'Processing Queue'} 
                <span className="task-count">({tasks.length}/{MAX_FILES})</span>
              </h3>
              {tasks.length > 0 && (
                <button 
                  className="btn-link"
                  onClick={handleToggleSelectAll}
                  title={language === 'zh-CN' ? '全选/取消全选' : 'Select All / Deselect All'}
                >
                  {selectedTasks.size === tasks.length ? <CheckSquare size={18} /> : <Square size={18} />}
                  {language === 'zh-CN' 
                    ? selectedTasks.size === tasks.length ? '取消全选' : '全选'
                    : selectedTasks.size === tasks.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
            <div className="action-buttons">
              {!isProcessing && (
                <button className="btn-primary" onClick={handleStart} disabled={ffmpegLoading}>
                  <Play size={16} />
                  {language === 'zh-CN' ? '开始处理' : 'Start'}
                </button>
              )}
              {isProcessing && !isPaused && (
                <button className="btn-secondary" onClick={handlePause}>
                  <Pause size={16} />
                  {language === 'zh-CN' ? '暂停' : 'Pause'}
                </button>
              )}
              {isProcessing && isPaused && (
                <button className="btn-primary" onClick={handleResume}>
                  <Play size={16} />
                  {language === 'zh-CN' ? '继续' : 'Resume'}
                </button>
              )}
              {isProcessing && (
                <button className="btn-danger" onClick={handleCancel}>
                  <X size={16} />
                  {language === 'zh-CN' ? '取消' : 'Cancel'}
                </button>
              )}
              <button 
                className="btn-icon"
                onClick={() => setShowPreview(!showPreview)}
                title={language === 'zh-CN' ? '切换预览' : 'Toggle Preview'}
              >
                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="tasks-list">
            {tasks.map((task, index) => (
              <div 
                key={task.id}
                className={`task-item ${task.status} ${selectedTasks.has(task.id) ? 'selected' : ''}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOverItem(e, index)}
                onDragEnd={handleDragEnd}
              >
                <button
                  className="task-checkbox"
                  onClick={() => handleToggleTaskSelection(task.id)}
                  title={language === 'zh-CN' ? '选择/取消选择' : 'Select / Deselect'}
                >
                  {selectedTasks.has(task.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
                <div className="task-drag-handle">
                  <GripVertical size={16} />
                </div>
                
                {showPreview && (
                  <div className="task-preview">
                    {task.originalPreview && (
                      <video 
                        src={task.originalPreview} 
                        controls={false}
                        muted
                        style={{ maxHeight: '100px' }}
                      />
                    )}
                    {task.compressedPreview && (
                      <video 
                        src={task.compressedPreview} 
                        controls={false}
                        muted
                        style={{ maxHeight: '100px' }}
                      />
                    )}
                  </div>
                )}

                <div className="task-info">
                  <div className="task-name">
                    <Video size={16} />
                    {task.file.name}
                  </div>
                  <div className="task-details">
                    <span>{formatFileSize(task.originalSize)}</span>
                    {task.videoInfo && (
                      <>
                        <span>•</span>
                        <span>{task.videoInfo.width}x{task.videoInfo.height}</span>
                        <span>•</span>
                        <span>{formatDuration(task.videoInfo.duration || 0)}</span>
                      </>
                    )}
                    {task.compressedSize && (
                      <>
                        <span>→</span>
                        <span>{formatFileSize(task.compressedSize)}</span>
                        <span className="saved">
                          ({((1 - task.compressedSize / task.originalSize) * 100).toFixed(1)}% {language === 'zh-CN' ? '节省' : 'saved'})
                        </span>
                      </>
                    )}
                  </div>
                  {task.status === 'processing' && (
                    <div className="task-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        {language === 'zh-CN' ? '压缩中' : 'Compressing'}: {task.progress}%
                      </span>
                    </div>
                  )}
                  {task.status === 'failed' && task.error && (
                    <div className="task-error">
                      <AlertCircle size={14} />
                      {task.error}
                    </div>
                  )}
                </div>

                <div className="task-actions">
                  {task.status === 'completed' && (
                    <button 
                      className="btn-icon"
                      onClick={() => handleDownloadSingle(task)}
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                    >
                      <Download size={16} />
                    </button>
                  )}
                  <button 
                    className="btn-icon"
                    onClick={() => handleRemoveTask(task.id)}
                    title={language === 'zh-CN' ? '删除' : 'Remove'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 统计信息 */}
      {stats.completedFiles > 0 && (
        <div className="stats-container">
          <div className="stats-card">
            <div className="stats-label">{language === 'zh-CN' ? '原始大小' : 'Original Size'}</div>
            <div className="stats-value">{formatFileSize(stats.totalOriginalSize)}</div>
          </div>
          <div className="stats-card">
            <div className="stats-label">{language === 'zh-CN' ? '压缩后' : 'Compressed'}</div>
            <div className="stats-value">{formatFileSize(stats.totalCompressedSize)}</div>
          </div>
          <div className="stats-card highlight">
            <div className="stats-label">{language === 'zh-CN' ? '节省' : 'Saved'}</div>
            <div className="stats-value-large">
              {formatFileSize(stats.savedSize)}
            </div>
            <div className="stats-percentage">
              {stats.savedPercentage.toFixed(1)}%
            </div>
          </div>
          <div className="stats-actions">
            <button className="btn-primary" onClick={handleDownloadAll}>
              <Download size={20} />
              {language === 'zh-CN' ? '下载全部' : 'Download All'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
