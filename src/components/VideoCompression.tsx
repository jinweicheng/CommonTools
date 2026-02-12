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

type UiMode = 'simple' | 'advanced'
type SimpleLevel = 'low' | 'medium' | 'high'

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
  compressedInfo?: {
    width: number
    height: number
    duration: number
  }
  encodedCodec?: string
  qualityWarning?: string
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

  // 默认：极简模式（目标大小 + 压缩等级），并提供最优默认方案
  const [uiMode, setUiMode] = useState<UiMode>('simple')
  const [simpleTargetSize, setSimpleTargetSize] = useState<number>(50)
  const [simpleLevel, setSimpleLevel] = useState<SimpleLevel>('medium')

  const [globalOptions, setGlobalOptions] = useState<CompressionOptions>({
    mode: 'crf',
    // 推荐默认：H.264 + CRF 23（质量与体积黄金平衡点）
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

  // 预览对比滑块状态 + video refs（用于原始/压缩对比）
  const [compareValue, setCompareValue] = useState<Record<string, number>>({})
  const previewRefs = useRef<Record<string, { original?: HTMLVideoElement | null; compressed?: HTMLVideoElement | null }>>({})

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

  const getSimpleCrf = (level: SimpleLevel): number => {
    // 不允许画质明显模糊：High 也控制在 26 以内
    if (level === 'low') return 21
    if (level === 'high') return 26
    return 23
  }

  const getCompressedVideoInfo = (previewUrl: string): Promise<{ width: number; height: number; duration: number }> => {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.src = previewUrl
      v.onloadedmetadata = () => resolve({ width: v.videoWidth || 0, height: v.videoHeight || 0, duration: v.duration || 0 })
      v.onerror = () => reject(new Error('Failed to load video metadata'))
    })
  }

  // 同步 tasks 到 tasksRef
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  // 清理选中列表中未完成的任务（确保状态一致性）
  useEffect(() => {
    const completedTaskIds = new Set(
      tasks
        .filter(t => t.status === 'completed' && t.compressedPreview)
        .map(t => t.id)
    )
    
    setSelectedTasks(prev => {
      // 检查是否有无效的选中项
      let hasInvalidSelection = false
      const newSet = new Set<string>()
      
      prev.forEach(id => {
        if (completedTaskIds.has(id)) {
          newSet.add(id)
        } else {
          hasInvalidSelection = true
        }
      })
      
      // 如果有无效的选中项或大小变化，返回新集合
      if (hasInvalidSelection || newSet.size !== prev.size) {
        return newSet
      }
      
      // 检查是否有新完成的任务需要自动选中（可选，这里不自动选中）
      return prev
    })
  }, [tasks])

  // 不在页面进入时预加载 FFmpeg：避免每次打开页面都下载 WASM。
  // 改为用户点击“开始处理”时再加载，并仅展示轻量进度提示。

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
          console.error(`❌ FFmpeg initialization timeout after ${timeout / 1000}s`);
          setLoadingProgress(
            language === "zh-CN" 
              ? `FFmpeg 加载超时（${timeout / 1000}秒）。请检查网络连接或刷新页面重试。`
              : `FFmpeg load timeout (${timeout / 1000}s). Please check network or refresh.`,
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
          // 确保 baseURL 正确构建（处理尾部斜杠）
          let baseURL = isDev 
            ? window.location.origin 
            : (window.location.origin + import.meta.env.BASE_URL);
          // 移除尾部斜杠（如果有），然后统一添加
          baseURL = baseURL.replace(/\/+$/, '');
          const localCore = `${baseURL}/ffmpeg-core.js`;
          const localWasm = `${baseURL}/ffmpeg-core.wasm`;

          // 检查本地文件是否存在和有效
          try {
            console.log(`🔍 Checking local files...`);
            console.log(`   Core: ${localCore}`);
            console.log(`   WASM: ${localWasm}`);
            
            const coreRes = await fetch(localCore, { method: "HEAD" });
            const wasmRes = await fetch(localWasm, { method: "HEAD" });

            if (coreRes.ok && wasmRes.ok) {
              // 获取文件大小（可能为 null，需要实际下载验证）
              const coreSizeHeader = coreRes.headers.get('content-length');
              const wasmSizeHeader = wasmRes.headers.get('content-length');
              const coreSize = coreSizeHeader ? parseInt(coreSizeHeader, 10) : null;
              const wasmSize = wasmSizeHeader ? parseInt(wasmSizeHeader, 10) : null;
              
              console.log(`📊 File size from headers: core=${coreSize || 'unknown'} B, wasm=${wasmSize || 'unknown'} B`);
              
              // 如果 content-length 不可用或为 0，实际下载验证文件大小
              let actualCoreSize = coreSize;
              let actualWasmSize = wasmSize;
              
              if (!coreSize || coreSize === 0) {
                console.log("⚠️ Core file size unknown from HEAD, downloading to verify...");
                try {
                  const coreTestRes = await fetch(localCore, { 
                    method: "GET",
                    headers: { "Range": "bytes=0-1023" } // 只下载前 1KB 来验证
                  });
                  if (coreTestRes.ok) {
                    const coreTestData = await coreTestRes.arrayBuffer();
                    actualCoreSize = coreTestData.byteLength;
                    // 如果只下载了 1KB，说明文件可能很小或为空
                    if (actualCoreSize < 1024) {
                      const fullCoreRes = await fetch(localCore);
                      const fullCoreData = await fullCoreRes.arrayBuffer();
                      actualCoreSize = fullCoreData.byteLength;
                    }
                  }
                } catch (testErr) {
                  console.warn("⚠️ Could not verify core file size:", testErr);
                }
              }
              
              // 关键检查：如果文件为 0 B 或过小，直接使用 CDN
              // ffmpeg-core.js 正常大小约 110-120 KB，最小不应小于 50 KB
              // ffmpeg-core.wasm 正常大小约 30-32 MB，最小不应小于 20 MB
              if (!actualCoreSize || actualCoreSize === 0 || actualCoreSize < 50000) {
                console.warn(`⚠️ Local core file invalid (size: ${actualCoreSize || 'unknown'} B), using CDN instead`);
                throw new Error(`Local core file invalid: size=${actualCoreSize || 'unknown'}B`);
              }
              
              if (!actualWasmSize || actualWasmSize === 0 || actualWasmSize < 20000000) {
                console.warn(`⚠️ Local WASM file invalid (size: ${actualWasmSize || 'unknown'} B), using CDN instead`);
                throw new Error(`Local WASM file invalid: size=${actualWasmSize || 'unknown'}B`);
              }
              
              console.log("✅ Local files valid");
              console.log(`   Core: ${localCore} (${(actualCoreSize / 1024).toFixed(1)} KB)`);
              console.log(`   WASM: ${localWasm} (${(actualWasmSize / 1024 / 1024).toFixed(1)} MB)`);
              
              setLoadingProgress(
                language === "zh-CN" ? "正在加载本地文件..." : "Loading local files...",
              );

              try {
                // 使用带超时的 toBlobURL
                console.log("🔄 Using toBlobURL with timeout...");
                setLoadingProgress(
                  language === "zh-CN" ? "正在转换文件格式..." : "Converting file format...",
                );
                
                // 为 toBlobURL 添加超时控制
                const toBlobURLWithTimeout = async (url: string, mimeType: string, timeout: number = 30000): Promise<string> => {
                  return Promise.race([
                    toBlobURL(url, mimeType),
                    new Promise<string>((_, reject) => 
                      setTimeout(() => reject(new Error(`toBlobURL timeout after ${timeout / 1000}s`)), timeout)
                    )
                  ]);
                };
                
                const coreBlobURL = await toBlobURLWithTimeout(localCore, "text/javascript", 30000);
                console.log("✅ Core Blob URL created");
                
                setLoadingProgress(
                  language === "zh-CN" ? "正在转换 WASM 文件格式..." : "Converting WASM file format...",
                );
                
                const wasmBlobURL = await toBlobURLWithTimeout(localWasm, "application/wasm", 60000);
                console.log("✅ WASM Blob URL created");
                
                console.log("✅ All Blob URLs created");
                
                setLoadingProgress(
                  language === "zh-CN" ? "正在初始化 FFmpeg（这可能需要 10-20 秒）..." : "Initializing FFmpeg (may take 10-20 seconds)...",
                );
                
                // 使用带超时的 FFmpeg.load
                const loadPromise = ffmpeg.load({
                  coreURL: coreBlobURL,
                  wasmURL: wasmBlobURL,
                });
                
                const timeoutPromise = new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error("FFmpeg.load timeout after 60s")), 60000)
                );
                
                await Promise.race([loadPromise, timeoutPromise]);
                
                console.log("✅ FFmpeg loaded successfully");
              } catch (blobErr) {
                console.error("❌ Local file load failed:", blobErr);
                throw blobErr; // 直接抛出错误，切换到 CDN
              }
            } else {
              throw new Error(`Local files not found: core=${coreRes.status}, wasm=${wasmRes.status}`);
            }
          } catch (localErr) {
            console.log("⚠️ Local file invalid or missing, using CDN (recommended)...");
            setLoadingProgress(
              language === "zh-CN" ? "正在从 CDN 加载（推荐方式）..." : "Loading from CDN (recommended)...",
            );

            // 创建新的 FFmpeg 实例（避免状态污染）
            const ffmpegCDN = new FFmpeg();
            ffmpegCDN.on("log", ({ message }) => {
              console.log(`[FFmpeg]:`, message);
              // 只显示关键日志，减少 UI 更新
              if (message.includes("error") || message.includes("Error") || message.includes("warning")) {
                setLoadingProgress(`${message.substring(0, 80)}`);
              }
            });

            // CDN 源列表（按优先级排序，jsDelivr 最快最稳定）
            const cdnSources = [
              {
                name: "jsDelivr ESM",
                base: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
              },
              {
                name: "jsDelivr UMD",
                base: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
              },
              {
                name: "UNPKG",
                base: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm",
              },
            ];

            let lastError: Error | null = null;
            let loaded = false;

            // 辅助函数：带超时的下载
            const downloadWithTimeout = async (url: string, timeout: number = 30000): Promise<string> => {
              return new Promise(async (resolve, reject) => {
                const downloadTimer = setTimeout(() => {
                  reject(new Error(`Download timeout after ${timeout / 1000}s: ${url}`));
                }, timeout);

                try {
                  // 方法1：尝试 toBlobURL（官方推荐）
                  try {
                    const blobURL = await toBlobURL(url, url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
                    clearTimeout(downloadTimer);
                    resolve(blobURL);
                    return;
                  } catch (blobErr) {
                    console.warn(`toBlobURL failed, trying fetchFile:`, blobErr);
                  }

                  // 方法2：使用 fetchFile（备选方案）
                  const file = await fetchFile(url);
                  const blob = new Blob([file as any], { 
                    type: url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' 
                  });
                  const blobURL = URL.createObjectURL(blob);
                  clearTimeout(downloadTimer);
                  resolve(blobURL);
                } catch (err) {
                  clearTimeout(downloadTimer);
                  reject(err);
                }
              });
            };

            // 辅助函数：带超时的 FFmpeg.load
            const loadFFmpegInstance = async (
              ffmpegInstance: FFmpeg,
              coreURL: string,
              wasmURL: string,
              timeout: number = 60000
            ): Promise<void> => {
              return new Promise((resolve, reject) => {
                const loadTimer = setTimeout(() => {
                  reject(new Error(`FFmpeg.load timeout after ${timeout / 1000}s`));
                }, timeout);

                ffmpegInstance.load({
                  coreURL,
                  wasmURL,
                })
                  .then(() => {
                    clearTimeout(loadTimer);
                    resolve();
                  })
                  .catch((err) => {
                    clearTimeout(loadTimer);
                    reject(err);
                  });
              });
            };

            for (const source of cdnSources) {
              try {
                const coreCDN = `${source.base}/ffmpeg-core.js`;
                const wasmCDN = `${source.base}/ffmpeg-core.wasm`;
                
                console.log(`📦 Trying ${source.name}...`);
                setLoadingProgress(
                  language === "zh-CN" 
                    ? `正在从 ${source.name} 下载文件（约 30MB）...` 
                    : `Downloading from ${source.name} (~30MB)...`,
                );
                
                // 下载文件（带超时控制）
                const coreBlobURL = await downloadWithTimeout(coreCDN, 45000); // 45秒超时
                console.log(`✅ Core file downloaded from ${source.name}`);
                
                setLoadingProgress(
                  language === "zh-CN" 
                    ? `正在下载 WASM 文件（${source.name}）...` 
                    : `Downloading WASM file (${source.name})...`,
                );
                
                const wasmBlobURL = await downloadWithTimeout(wasmCDN, 90000); // 90秒超时（WASM 文件较大）
                console.log(`✅ WASM file downloaded from ${source.name}`);
                
                console.log(`✅ All files downloaded from ${source.name}`);
                setLoadingProgress(
                  language === "zh-CN" ? "正在初始化 FFmpeg（这可能需要 10-20 秒）..." : "Initializing FFmpeg (may take 10-20 seconds)...",
                );

                // 加载 FFmpeg（带超时控制）
                await loadFFmpegInstance(ffmpegCDN, coreBlobURL, wasmBlobURL, 60000); // 60秒超时
                
                // 成功，替换实例并重新设置事件监听
                ffmpeg = ffmpegCDN;
                ffmpeg.on("log", ({ message }) => {
                  console.log(`[FFmpeg]:`, message);
                });
                console.log(`✅ FFmpeg loaded successfully from ${source.name}`);
                loaded = true;
                break; // 成功，退出循环
              } catch (cdnErr) {
                console.warn(`⚠️ ${source.name} failed:`, cdnErr);
                lastError = cdnErr instanceof Error ? cdnErr : new Error(String(cdnErr));
                setLoadingProgress(
                  language === "zh-CN" 
                    ? `${source.name} 加载失败，尝试下一个源...` 
                    : `${source.name} failed, trying next source...`,
                );
                // 继续尝试下一个源
              }
            }

            if (!loaded) {
              const errorMsg = lastError?.message || "All CDN sources failed";
              console.error("❌ All CDN sources failed:", errorMsg);
              throw lastError || new Error("All CDN sources failed");
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
          
          // 检查是否是文件大小为 0 的问题
          if (errorMsg.includes("Local files invalid") || errorMsg.includes("0 B") || errorMsg.includes("0B")) {
            console.error("❌ 检测到本地文件无效（大小为 0 B）");
            console.error("   解决方案：系统已自动切换到 CDN 加载");
            // 不设置错误状态，因为已经尝试了 CDN
          }
          
          // 检查是否是超时问题
          if (errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
            console.error("❌ 加载超时");
            setLoadingProgress(
              language === "zh-CN" 
                ? "加载超时。可能原因：网络较慢或 CDN 不可用。\n\n建议：\n1. 检查网络连接\n2. 刷新页面重试\n3. 使用 VPN 或更换网络" 
                : "Load timeout. Possible causes: slow network or CDN unavailable.\n\nSuggestions:\n1. Check network connection\n2. Refresh page and retry\n3. Use VPN or change network"
            );
          }
          
          // 收集完整的错误信息（仅用于调试）
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
          } else if (errorMsg.includes("timeout") || errorMsg.includes("超时")) {
            // 超时错误
            const timeoutMsg = language === "zh-CN"
              ? "FFmpeg 初始化超时（90秒）。\n\n可能原因：\n1. 文件下载或加载缓慢\n2. 浏览器性能限制\n3. 网络连接问题\n\n建议：\n1. 刷新页面重试\n2. 检查网络连接\n3. 使用 Chrome/Edge 浏览器\n4. 如果问题持续，可能是服务器文件有问题，请联系管理员"
              : "FFmpeg initialization timeout (90s).\n\nPossible causes:\n1. Slow file download/load\n2. Browser performance limits\n3. Network issues\n\nSuggestions:\n1. Refresh and retry\n2. Check network connection\n3. Use Chrome/Edge browser\n4. If persists, server files may be corrupted, contact admin";
            
            setLoadingProgress(timeoutMsg);
            console.error("⏱️ FFmpeg initialization timeout - this may indicate:");
            console.error("   1. File corruption or incomplete download");
            console.error("   2. Browser performance issues");
            console.error("   3. Network connectivity problems");
          } else if (errorMsg.includes("validation failed") || errorMsg.includes("empty")) {
            // 文件验证失败
            const validationMsg = language === "zh-CN"
              ? "FFmpeg 文件验证失败。\n\n文件可能损坏或未正确上传。\n\n请：\n1. 联系管理员检查服务器文件\n2. 刷新页面重试\n3. 检查控制台错误信息"
              : "FFmpeg file validation failed.\n\nFiles may be corrupted or not properly uploaded.\n\nPlease:\n1. Contact admin to check server files\n2. Refresh and retry\n3. Check console errors";
            
            setLoadingProgress(validationMsg);
            alert(validationMsg);
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
  const loadFFmpeg = useCallback(async (showAlert: boolean = true) => {
    if (ffmpegLoaded || ffmpegLoading) return true
    
    setFfmpegLoading(true)
    setLoadingProgress(language === 'zh-CN' ? '正在加载视频处理引擎...' : 'Loading video processing engine...')

    // 尝试加载（线上环境需要更长时间，120秒超时）
    const success = await loadFFmpegWithTimeout(120000)
    
    setFfmpegLoading(false)
    setLoadingProgress('')
    
    if (!success && showAlert) {
      const errorMessage = language === 'zh-CN'
        ? '视频处理引擎加载失败\n\n可能原因：\n• 网络连接较慢（CDN 下载超时）\n• 本地文件无效（已自动切换到 CDN）\n• 浏览器兼容性问题\n• CDN 服务暂时不可用\n\n解决方案（按优先级）：\n1. 刷新页面重试（Ctrl + F5）\n2. 检查网络连接，确保可以访问 CDN\n3. 使用 Chrome/Edge 最新版本\n4. 清除浏览器缓存后重试\n5. 如果持续失败，请稍后再试\n\n技术说明：\n系统已尝试从多个 CDN 源加载（jsDelivr、UNPKG），\n每个源都有超时保护（45-90秒）。\n如果所有源都失败，可能是网络问题。'
        : 'Video processing engine failed to load\n\nPossible causes:\n• Slow network connection (CDN download timeout)\n• Local files invalid (auto-switched to CDN)\n• Browser compatibility issue\n• CDN service temporarily unavailable\n\nSolutions (by priority):\n1. Refresh page (Ctrl + F5)\n2. Check network connection, ensure CDN access\n3. Use latest Chrome/Edge\n4. Clear browser cache and retry\n5. If persists, try again later\n\nTechnical note:\nSystem tried multiple CDN sources (jsDelivr, UNPKG),\neach with timeout protection (45-90s).\nIf all sources fail, it may be a network issue.'
      
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
             /\.(mp4|mov|mkv|avi|webm|flv|m4v|3gp)$/i.test(file.name)
      
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

    // 进度更新相关变量（需要在 try-catch 外部定义，以便在 catch 中访问）
    let lastProgressUpdate = 0
    const PROGRESS_UPDATE_INTERVAL = 200 // 每 200ms 更新一次
    let isTaskCompleted = false // 标记任务是否已完成
    let logHandler: ((payload: { message: string; type: string }) => void) | undefined
    
    // 进度处理器（需要在 try-catch 外部定义，以便在 catch 中移除）
    const progressHandler = ({ progress: prog }: { progress: number }) => {
      // 如果任务已完成，不再更新进度
      if (isTaskCompleted) {
        return
      }
      
      const now = Date.now()
      if (now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL) return
      
      lastProgressUpdate = now
      const progressValue = Math.round(prog * 100)
      
      setTasks(prev => {
        // 检查任务是否已经完成（防止覆盖完成状态）
        const currentTask = prev.find(t => t.id === task.id)
        if (currentTask?.status === 'completed') {
          isTaskCompleted = true
          return prev // 不更新已完成的任务
        }
        
        const newTasks = prev.map(t => 
          t.id === task.id 
            ? { ...t, progress: progressValue, status: 'processing' as TaskStatus }
            : t
        )
        tasksRef.current = newTasks
        return newTasks
      })
    }

    try {
      // 读取文件
      const fileData = await fetchFile(task.file)
      await ffmpeg.writeFile('input.mp4', fileData)

      // 自动性能优化：根据文件大小和分辨率调整参数
      const optimizedOptions = { ...task.options }
      
      // 如果文件较大（> 50MB）或分辨率较高（> 1080p），自动优化
      if (task.originalSize > 50 * 1024 * 1024 || (task.videoInfo && task.videoInfo.width > 1920)) {
        if (!optimizedOptions.resolution || optimizedOptions.resolution === 'original') {
          optimizedOptions.resolution = '1080p'
        }
        if (!optimizedOptions.fps && task.videoInfo && task.videoInfo.fps > 30) {
          optimizedOptions.fps = 30
        }
        console.log('⚡ Auto-optimizing for large video:', {
          originalSize: (task.originalSize / 1024 / 1024).toFixed(1) + ' MB',
          resolution: optimizedOptions.resolution,
          fps: optimizedOptions.fps || 'auto'
        })
      }
      
      // 构建 FFmpeg 命令（使用优化后的选项）
      const args = buildFFmpegArgs(optimizedOptions, task.videoInfo, task.originalSize)
      console.log('🚀 FFmpeg args (optimized for speed):', args.join(' '))
      
      // 设置日志监听（捕获错误和警告）
      logHandler = ({ message, type }: { message: string; type: string }) => {
        if (type === 'error' || message.toLowerCase().includes('error')) {
          console.error('❌ FFmpeg error:', message)
        } else if (message.toLowerCase().includes('warning')) {
          console.warn('⚠️ FFmpeg warning:', message)
        } else {
          console.log('📝 FFmpeg log:', message)
        }
      }
      ffmpeg.on('log', logHandler)
      
      // 注册进度监听器
      ffmpeg.on('progress', progressHandler)

      // 执行压缩
      console.log('🔄 Executing FFmpeg compression...')
      await ffmpeg.exec(args)
      console.log('✅ FFmpeg execution completed')

      // 检查输出文件是否存在
      try {
        const fileList = await ffmpeg.listDir('/')
        console.log('📁 Files in FFmpeg FS:', fileList)
        
        const outputExists = fileList.some((file: any) => file.name === 'output.mp4')
        if (!outputExists) {
          throw new Error('Output file output.mp4 was not created')
        }
      } catch (listErr) {
        console.warn('⚠️ Could not list FFmpeg filesystem:', listErr)
      }

      // 读取输出文件
      console.log('📖 Reading output file...')
      const data = await ffmpeg.readFile('output.mp4')
      
      // 验证输出文件
      if (!data) {
        throw new Error('Output file data is null or undefined')
      }
      
      // 确保 data 是 Uint8Array
      let uint8Data: Uint8Array
      if (data instanceof Uint8Array) {
        uint8Data = data
      } else if (data && typeof data === 'object' && 'buffer' in data) {
        // 处理 ArrayBuffer 或类似对象
        const buffer = (data as any).buffer || data
        uint8Data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(data as any)
      } else if (typeof data === 'string') {
        // 如果是字符串，转换为 Uint8Array
        uint8Data = new TextEncoder().encode(data)
      } else {
        // 尝试转换为 Uint8Array
        uint8Data = new Uint8Array(data as any)
      }
      
      if (uint8Data.length === 0) {
        throw new Error(`Output file size is 0 bytes. Original file size: ${task.originalSize} bytes`)
      }
      
      const compressedSize = uint8Data.length
      const compressionRatio = ((task.originalSize - compressedSize) / task.originalSize * 100).toFixed(1)
      
      console.log(`✅ Output file size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB (original: ${(task.originalSize / 1024 / 1024).toFixed(2)} MB)`)
      console.log(`📊 Compression ratio: ${compressionRatio}%`)
      
      // 检查压缩效果
      if (compressedSize > task.originalSize) {
        console.warn(`⚠️ Compressed file is LARGER than original! (${((compressedSize - task.originalSize) / task.originalSize * 100).toFixed(1)}% larger)`)
        console.warn('   This usually means:')
        console.warn('   1. CRF value is too low (quality too high)')
        console.warn('   2. Original video is already well compressed')
        console.warn('   3. Preset is too fast (low compression ratio)')
      }
      
      // 创建 Blob（使用类型断言避免类型错误）
      const blob = new Blob([uint8Data as any], { type: 'video/mp4' })
      
      if (blob.size === 0) {
        throw new Error('Blob size is 0 bytes after creation')
      }
      
      const compressedPreview = URL.createObjectURL(blob)

      // 输出信息（用于结果展示）
      let compressedInfo: CompressionTask['compressedInfo'] | undefined
      try {
        const info = await getCompressedVideoInfo(compressedPreview)
        compressedInfo = {
          width: info.width,
          height: info.height,
          duration: info.duration
        }
      } catch {
        // ignore
      }

      // 质量提示：压缩过猛时给出建议（不允许画质明显模糊）
      const savedPct = task.originalSize > 0 ? (1 - compressedSize / task.originalSize) : 0
      const isTooAggressive = savedPct > 0.85 || (optimizedOptions.crf >= 27 && savedPct > 0.75)
      const qualityWarning = isTooAggressive
        ? (language === 'zh-CN'
            ? '⚠️ 压缩可能过猛，画质可能变模糊。建议提高质量（更低 CRF）或选择较低压缩等级。'
            : '⚠️ Compression may be too aggressive. Consider higher quality (lower CRF) or a lower compression level.')
        : undefined

      // 标记任务已完成，防止进度更新覆盖状态
      isTaskCompleted = true
      
      // 移除进度监听器（防止后续进度更新覆盖完成状态）
      try {
        ffmpeg.off('progress', progressHandler)
      } catch (err) {
        console.warn('Failed to remove progress handler:', err)
      }

      // 更新任务状态（使用函数式更新确保原子性）
      setTasks(prev => {
        // 双重检查：确保任务确实还在处理中（防止并发问题）
        const currentTask = prev.find(t => t.id === task.id)
        if (currentTask?.status === 'completed') {
          // 任务已经完成，不重复更新
          return prev
        }
        
        const newTasks = prev.map(t => 
          t.id === task.id 
            ? {
                ...t,
                status: 'completed' as TaskStatus,
                progress: 100,
                compressedSize: blob.size,
                compressedPreview,
                compressedInfo,
                encodedCodec: (optimizedOptions.codec === 'h264' ? 'H.264' : 'VP9') as 'H.264' | 'VP9',
                qualityWarning
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
      // 标记任务已完成（失败也算完成），防止进度更新覆盖状态
      isTaskCompleted = true
      
      // 移除进度监听器
      try {
        ffmpeg.off('progress', progressHandler)
      } catch (err) {
        console.warn('Failed to remove progress handler on error:', err)
      }
      
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
      // 清理任务级日志监听器，避免多任务后监听器累积造成性能下降
      try {
        if (logHandler) {
          ffmpeg.off('log', logHandler)
        }
      } catch (err) {
        console.warn('Failed to remove log handler:', err)
      }
      currentTaskRef.current = null
    }
  }, [])

  // 构建 FFmpeg 参数（性能优化版本）
  const buildFFmpegArgs = useCallback((options: CompressionOptions, videoInfo?: CompressionTask['videoInfo'], originalSize?: number): string[] => {
    const args = ['-i', 'input.mp4']

    // 编码器
    if (options.codec === 'h264') {
      args.push('-c:v', 'libx264')
      // 性能优化：小文件优先速度，大文件优先压缩率
      const isSmall = typeof originalSize === 'number' && originalSize > 0 && originalSize <= 100 * 1024 * 1024
      args.push('-preset', isSmall ? 'veryfast' : 'faster')
      // 性能优化：自动使用所有 CPU 核心
      args.push('-threads', '0')
      // 性能优化：适中的参考帧（平衡速度和压缩率）
      args.push('-refs', '3')
      // 性能优化：使用 B-frames 提升压缩率
      args.push('-bf', '3')
    } else {
      args.push('-c:v', 'libvpx-vp9')
      // VP9 性能优化：最快速度
      args.push('-speed', '4')
      args.push('-threads', '0')
      // 注意：-quality 和 -row-mt 可能在某些 FFmpeg 版本不支持，先移除
      // args.push('-quality', 'realtime')
      // args.push('-row-mt', '1')
    }

    // 压缩模式
    if (options.mode === 'crf') {
      // CRF 模式：值越大文件越小（18-28 是常用范围，28 压缩更激进）
      // 确保 CRF 值在合理范围内（18-32），默认 28 确保压缩效果
      const crfValue = Math.max(18, Math.min(32, options.crf || 28))
      args.push('-crf', crfValue.toString())
      // CRF 模式：可选添加 VBV 限制
      // - 简单模式会设置 targetSize，用目标大小估算 maxrate
      // - 否则使用原始码率的 65% 作为保守上限
      if (options.targetSize && videoInfo?.duration && videoInfo.duration > 0) {
        const targetBitrate = Math.max(200, Math.floor((options.targetSize * 8 * 1024) / videoInfo.duration))
        args.push('-maxrate', `${targetBitrate}k`)
        args.push('-bufsize', `${targetBitrate * 2}k`)
      } else if (videoInfo && videoInfo.bitrate) {
        const targetBitrate = Math.floor(videoInfo.bitrate * 0.65)
        args.push('-maxrate', `${targetBitrate}k`)
        args.push('-bufsize', `${targetBitrate * 2}k`)
      }
    } else if (options.mode === 'bitrate' && options.bitrate) {
      args.push('-b:v', `${options.bitrate}k`)
      args.push('-maxrate', `${options.bitrate * 1.2}k`)
      args.push('-bufsize', `${options.bitrate * 2}k`)
    } else if (options.mode === 'size' && options.targetSize && videoInfo?.duration) {
      const targetBitrate = Math.floor((options.targetSize * 8 * 1024) / videoInfo.duration)
      args.push('-b:v', `${targetBitrate}k`)
      args.push('-maxrate', `${targetBitrate * 1.2}k`)
      args.push('-bufsize', `${targetBitrate * 2}k`)
    }

    // 分辨率（使用快速缩放算法）
    if (options.resolution && options.resolution !== 'original' && videoInfo) {
      const resMap: Record<string, string> = {
        '1080p': '1920:-2',
        '720p': '1280:-2',
        '480p': '854:-2'
      }
      if (resMap[options.resolution]) {
        args.push('-vf', `scale=${resMap[options.resolution]}:flags=fast_bilinear`)
      }
    }

    // 帧率（降低帧率可提升速度）
    if (options.fps) {
      args.push('-r', options.fps.toString())
    } else if (videoInfo && videoInfo.fps > 30) {
      // 自动降低高帧率到 30fps 以提升速度
      args.push('-r', '30')
    }

    // 音频（降低码率以减小文件大小）
    const audioKbps = options.crf >= 26 ? 64 : 96
    args.push('-c:a', 'aac', '-b:a', `${audioKbps}k`)
    args.push('-ac', '2')  // 立体声
    args.push('-ar', '44100')  // 采样率

    // 性能优化：较小的 GOP 大小（提升速度）
    args.push('-g', '30')

    // 性能优化：快速启动（适合流媒体）
    args.push('-movflags', '+faststart')

    // 明确指定输出格式
    args.push('-f', 'mp4')

    // 输出（添加 -y 参数自动覆盖输出文件）
    args.push('-y', 'output.mp4')

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

    // 极简模式：将“目标大小 + 压缩等级”转换为专业参数，并同步到待处理任务
    if (uiMode === 'simple') {
      const crf = getSimpleCrf(simpleLevel)
      const targetSize = clamp(simpleTargetSize || 0, 1, 500)

      const nextOptions: CompressionOptions = {
        mode: 'crf',
        crf,
        codec: 'h264',
        resolution: 'original',
        targetSize
      }

      setGlobalOptions(nextOptions)
      setTasks(prev => {
        const newTasks = prev.map(t =>
          (t.status === 'pending' || t.status === 'paused')
            ? { ...t, options: { ...nextOptions } }
            : t
        )
        tasksRef.current = newTasks
        return newTasks
      })
    }

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
  }, [tasks, uiMode, simpleLevel, simpleTargetSize, loadFFmpeg, processQueue, language])

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
      // 使用最新的 tasks 状态验证任务
      const currentTasks = tasksRef.current
      const task = currentTasks.find(t => t.id === taskId)
      
      // 验证任务是否已完成
      if (!task || task.status !== 'completed' || !task.compressedPreview) {
        console.warn('Cannot select task that is not completed:', taskId)
        // 如果任务未完成但已被选中，移除它
        if (prev.has(taskId)) {
          const newSet = new Set(prev)
          newSet.delete(taskId)
          return newSet
        }
        return prev
      }

      // 切换选中状态
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }, [])

  // 全选/取消全选（只选择已完成的任务）
  const handleToggleSelectAll = useCallback(() => {
    setSelectedTasks(prev => {
      // 使用最新的 tasks 状态
      const currentTasks = tasksRef.current
      const completedTaskIds = currentTasks
        .filter(t => t.status === 'completed' && t.compressedPreview)
        .map(t => t.id)
      
      if (completedTaskIds.length === 0) {
        // 没有已完成的任务，清空选择
        return new Set()
      }
      
      // 检查是否所有已完成的任务都被选中
      const allCompletedSelected = completedTaskIds.length > 0 && 
        completedTaskIds.every(id => prev.has(id))
      
      if (allCompletedSelected) {
        // 取消全选
        return new Set()
      } else {
        // 全选所有已完成的任务
        return new Set(completedTaskIds)
      }
    })
  }, [])

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
  // 下载单个视频
  const handleDownloadSingle = useCallback(async (task: CompressionTask) => {
    if (!task.compressedPreview) {
      console.warn('No compressed preview available for download')
      return
    }

    try {
      // 从 Blob URL 获取 Blob 对象
      const response = await fetch(task.compressedPreview)
      if (!response.ok) {
        throw new Error(`Failed to fetch compressed video: ${response.statusText}`)
      }
      
      const blob = await response.blob()
      if (blob.size === 0) {
        throw new Error('Compressed video file is empty')
      }

      // 生成文件名（保留原文件名，添加 _compressed 后缀）
      const originalName = task.file.name.replace(/\.[^/.]+$/, '')
      const extension = task.file.name.match(/\.[^/.]+$/)?.[0] || '.mp4'
      const fileName = `${originalName}_compressed${extension}`

      // 下载文件
      saveAs(blob, fileName)
      console.log(`✅ Downloaded: ${fileName} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`)
    } catch (error) {
      console.error('❌ Download failed:', error)
      alert(
        language === 'zh-CN' 
          ? `下载失败：${error instanceof Error ? error.message : String(error)}`
          : `Download failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }, [language])

  // 下载全部视频（打包为 ZIP）
  // 如果用户选择了任务，只下载选中的已完成任务
  // 如果用户没有选择任务，下载所有已完成的任务
  const handleDownloadAll = useCallback(async () => {
    // 使用最新的 tasks 状态
    const currentTasks = tasksRef.current
    const currentSelectedTasks = selectedTasks
    
    // 获取所有已完成的任务
    const allCompletedTasks = currentTasks.filter(t => t.status === 'completed' && t.compressedPreview)
    
    if (allCompletedTasks.length === 0) {
      alert(
        language === 'zh-CN' 
          ? '没有可下载的压缩视频'
          : 'No compressed videos available for download'
      )
      return
    }

    // 确定要下载的任务列表
    let tasksToDownload: CompressionTask[]
    
    if (currentSelectedTasks.size > 0) {
      // 用户选择了任务，只下载选中的已完成任务
      // 确保只包含已完成的任务
      const selectedCompletedTasks = allCompletedTasks.filter(t => currentSelectedTasks.has(t.id))
      
      if (selectedCompletedTasks.length === 0) {
        alert(
          language === 'zh-CN' 
            ? '选中的任务中没有已完成的视频'
            : 'No completed videos in selected tasks'
        )
        return
      }
      
      tasksToDownload = selectedCompletedTasks
    } else {
      // 用户没有选择任务，下载所有已完成的任务
      tasksToDownload = allCompletedTasks
    }

    // 如果只有一个文件，直接下载单个文件
    if (tasksToDownload.length === 1) {
      await handleDownloadSingle(tasksToDownload[0])
      return
    }

    try {
      setLoadingProgress(
        language === 'zh-CN' 
          ? `正在打包 ${tasksToDownload.length} 个视频...` 
          : `Packaging ${tasksToDownload.length} videos...`
      )

      const zip = new JSZip()
      let successCount = 0
      let failCount = 0
      
      // 并行下载所有文件（提高速度）
      const downloadPromises = tasksToDownload.map(async (task) => {
        try {
          const response = await fetch(task.compressedPreview!)
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`)
          }
          
          const blob = await response.blob()
          if (blob.size === 0) {
            throw new Error('File is empty')
          }

          // 生成文件名
          const originalName = task.file.name.replace(/\.[^/.]+$/, '')
          const extension = task.file.name.match(/\.[^/.]+$/)?.[0] || '.mp4'
          const fileName = `${originalName}_compressed${extension}`

          // 添加到 ZIP
          zip.file(fileName, blob)
          successCount++
          
          console.log(`✅ Added to ZIP: ${fileName} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`)
        } catch (error) {
          failCount++
          console.error(`❌ Failed to add ${task.file.name} to ZIP:`, error)
        }
      })

      // 等待所有下载完成
      await Promise.all(downloadPromises)

      if (successCount === 0) {
        throw new Error('All files failed to download')
      }

      setLoadingProgress(
        language === 'zh-CN' 
          ? '正在生成 ZIP 文件...' 
          : 'Generating ZIP file...'
      )

      // 生成 ZIP 文件
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      })

      // 下载 ZIP 文件
      const zipFileName = `compressed_videos_${new Date().toISOString().split('T')[0]}.zip`
      saveAs(zipBlob, zipFileName)
      
      console.log(`✅ Downloaded ZIP: ${zipFileName} (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)`)
      console.log(`   Success: ${successCount}, Failed: ${failCount}`)

      setLoadingProgress('')

      // 如果有失败的文件，提示用户
      if (failCount > 0) {
        alert(
          language === 'zh-CN' 
            ? `已下载 ${successCount} 个视频，${failCount} 个失败。请查看控制台了解详情。`
            : `Downloaded ${successCount} videos, ${failCount} failed. Check console for details.`
        )
      }
    } catch (error) {
      console.error('❌ ZIP download failed:', error)
      setLoadingProgress('')
      alert(
        language === 'zh-CN' 
          ? `打包下载失败：${error instanceof Error ? error.message : String(error)}`
          : `ZIP download failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }, [selectedTasks, handleDownloadSingle, language])

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
      {/* FFmpeg 加载提示：轻量内联提示（不全屏阻塞） */}
      {ffmpegLoading && (
        <div className="ffmpeg-inline-status" role="status" aria-live="polite">
          <div className="ffmpeg-inline-row">
            <div className="ffmpeg-inline-spinner" aria-hidden="true" />
            <div className="ffmpeg-inline-text">
              <div className="ffmpeg-inline-title">
                {language === 'zh-CN' ? '正在加载 FFmpeg 引擎（仅首次需要）' : 'Loading FFmpeg engine (first time only)'}
              </div>
              <div className="ffmpeg-inline-subtitle">
                {loadingProgress || (language === 'zh-CN' ? '准备中…' : 'Preparing…')}
              </div>
            </div>
          </div>
          <div className="ffmpeg-inline-bar" aria-hidden="true">
            <div className="ffmpeg-inline-barFill" />
          </div>
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
          accept="video/*,.mp4,.mov,.mkv,.avi,.webm,.flv,.m4v,.3gp"
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
          {language === 'zh-CN' ? '支持格式：' : 'Supported: '}MP4, MOV, MKV, AVI, WebM, FLV, M4V, 3GP
        </p>
      </div>

      {/* 全局设置 */}
      {tasks.length > 0 && (
        <div className="global-settings">
          <h3>
            <Settings size={20} />
            {language === 'zh-CN' ? '压缩设置' : 'Compression Settings'}
          </h3>

          <div className="mode-toggle">
            <button
              className={`mode-btn ${uiMode === 'simple' ? 'active' : ''}`}
              onClick={() => setUiMode('simple')}
              disabled={isProcessing}
            >
              {language === 'zh-CN' ? '极简模式' : 'Simple'}
            </button>
            <button
              className={`mode-btn ${uiMode === 'advanced' ? 'active' : ''}`}
              onClick={() => setUiMode('advanced')}
              disabled={isProcessing}
            >
              {language === 'zh-CN' ? '高级模式' : 'Advanced'}
            </button>
          </div>

          {uiMode === 'simple' ? (
            <div className="simple-settings">
              <div className="setting-item">
                <label>{language === 'zh-CN' ? '目标大小 (MB)' : 'Target Size (MB)'}</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={simpleTargetSize}
                  onChange={(e) => {
                    const v = clamp(parseInt(e.target.value || '50', 10), 1, 500)
                    setSimpleTargetSize(v)
                    const crf = getSimpleCrf(simpleLevel)
                    setGlobalOptions(prev => ({ ...prev, mode: 'crf', crf, codec: 'h264', resolution: 'original', targetSize: v }))
                  }}
                  disabled={isProcessing}
                />
                <span>
                  {language === 'zh-CN'
                    ? '这是期望值：会尽量接近且优先保证清晰。'
                    : 'A target: we try to get close while prioritizing clarity.'}
                </span>
              </div>

              <div className="setting-item">
                <label>{language === 'zh-CN' ? '压缩等级' : 'Compression Level'}</label>
                <div className="level-toggle">
                  <button
                    className={`level-btn ${simpleLevel === 'low' ? 'active' : ''}`}
                    onClick={() => {
                      setSimpleLevel('low')
                      setGlobalOptions(prev => ({ ...prev, mode: 'crf', crf: getSimpleCrf('low'), codec: 'h264', resolution: 'original', targetSize: simpleTargetSize }))
                    }}
                    disabled={isProcessing}
                  >
                    {language === 'zh-CN' ? 'Low（更清晰）' : 'Low (Clearer)'}
                  </button>
                  <button
                    className={`level-btn ${simpleLevel === 'medium' ? 'active' : ''}`}
                    onClick={() => {
                      setSimpleLevel('medium')
                      setGlobalOptions(prev => ({ ...prev, mode: 'crf', crf: getSimpleCrf('medium'), codec: 'h264', resolution: 'original', targetSize: simpleTargetSize }))
                    }}
                    disabled={isProcessing}
                  >
                    {language === 'zh-CN' ? 'Medium（推荐）' : 'Medium (Recommended)'}
                  </button>
                  <button
                    className={`level-btn ${simpleLevel === 'high' ? 'active' : ''}`}
                    onClick={() => {
                      setSimpleLevel('high')
                      setGlobalOptions(prev => ({ ...prev, mode: 'crf', crf: getSimpleCrf('high'), codec: 'h264', resolution: 'original', targetSize: simpleTargetSize }))
                    }}
                    disabled={isProcessing}
                  >
                    {language === 'zh-CN' ? 'High（更小）' : 'High (Smaller)'}
                  </button>
                </div>
                <span>
                  {language === 'zh-CN'
                    ? `默认推荐：H.264 + CRF ${getSimpleCrf(simpleLevel)}（黄金平衡）`
                    : `Recommended: H.264 + CRF ${getSimpleCrf(simpleLevel)} (sweet spot)`}
                </span>
              </div>
            </div>
          ) : (
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
          )}
          
          <div className="settings-advanced-toggle">
            <button 
              className="btn-link"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              disabled={uiMode !== 'advanced'}
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
          
          {uiMode === 'advanced' && showAdvancedSettings && (
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
              {tasks.length > 0 && (() => {
                const completedTaskIds = tasks
                  .filter(t => t.status === 'completed' && t.compressedPreview)
                  .map(t => t.id)
                const allCompletedSelected = completedTaskIds.length > 0 && 
                  completedTaskIds.every(id => selectedTasks.has(id))
                
                return (
                  <button 
                    className="btn-link"
                    onClick={handleToggleSelectAll}
                    title={language === 'zh-CN' ? '全选/取消全选（仅已完成）' : 'Select All / Deselect All (Completed Only)'}
                    disabled={completedTaskIds.length === 0}
                  >
                    {allCompletedSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    {language === 'zh-CN' 
                      ? allCompletedSelected ? '取消全选' : `全选 (${completedTaskIds.length})`
                      : allCompletedSelected ? 'Deselect All' : `Select All (${completedTaskIds.length})`}
                  </button>
                )
              })()}
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
                  className={`task-checkbox ${task.status === 'completed' && task.compressedPreview ? '' : 'disabled'}`}
                  onClick={() => {
                    // 只有已完成的任务才能被选中
                    if (task.status === 'completed' && task.compressedPreview) {
                      handleToggleTaskSelection(task.id)
                    }
                  }}
                  disabled={task.status !== 'completed' || !task.compressedPreview}
                  title={
                    task.status === 'completed' && task.compressedPreview
                      ? (language === 'zh-CN' ? '选择/取消选择' : 'Select / Deselect')
                      : (language === 'zh-CN' ? '仅已完成的任务可选择' : 'Only completed tasks can be selected')
                  }
                >
                  {selectedTasks.has(task.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
                <div className="task-drag-handle">
                  <GripVertical size={16} />
                </div>
                
                {showPreview && (
                  <div className="task-preview">
                    {task.originalPreview && task.compressedPreview ? (
                      <div className="compare-wrap">
                        <div
                          className="compare-viewport"
                          style={{ ['--compare' as any]: `${compareValue[task.id] ?? 50}%` }}
                        >
                          <video
                            ref={(el) => {
                              previewRefs.current[task.id] = { ...(previewRefs.current[task.id] || {}), original: el }
                            }}
                            src={task.originalPreview}
                            controls
                            muted
                            playsInline
                            onPlay={() => {
                              const pair = previewRefs.current[task.id]
                              if (pair?.compressed && pair?.compressed.paused) {
                                pair.compressed.currentTime = pair.original?.currentTime || 0
                                pair.compressed.play().catch(() => {})
                              }
                            }}
                            onPause={() => {
                              const pair = previewRefs.current[task.id]
                              if (pair?.compressed && !pair.compressed.paused) pair.compressed.pause()
                            }}
                            onTimeUpdate={() => {
                              const pair = previewRefs.current[task.id]
                              if (!pair?.compressed || !pair?.original) return
                              const diff = Math.abs(pair.compressed.currentTime - pair.original.currentTime)
                              if (diff > 0.25) pair.compressed.currentTime = pair.original.currentTime
                            }}
                          />
                          <div className="compare-top" aria-hidden="true">
                            <video
                              ref={(el) => {
                                previewRefs.current[task.id] = { ...(previewRefs.current[task.id] || {}), compressed: el }
                              }}
                              src={task.compressedPreview}
                              muted
                              playsInline
                            />
                          </div>
                        </div>
                        <div className="compare-slider">
                          <span className="compare-label">{language === 'zh-CN' ? '原始' : 'Original'}</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={compareValue[task.id] ?? 50}
                            onChange={(e) => setCompareValue(prev => ({ ...prev, [task.id]: parseInt(e.target.value, 10) }))}
                          />
                          <span className="compare-label">{language === 'zh-CN' ? '压缩后' : 'Compressed'}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {task.originalPreview && (
                          <video src={task.originalPreview} controls muted playsInline style={{ maxHeight: '100px' }} />
                        )}
                        {task.compressedPreview && (
                          <video src={task.compressedPreview} controls muted playsInline style={{ maxHeight: '100px' }} />
                        )}
                      </>
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
                    {task.compressedInfo && task.videoInfo && (
                      <>
                        <span>•</span>
                        <span>
                          {language === 'zh-CN' ? '分辨率' : 'Resolution'}: {task.videoInfo.width}×{task.videoInfo.height} → {task.compressedInfo.width}×{task.compressedInfo.height}
                        </span>
                        <span>•</span>
                        <span>
                          {language === 'zh-CN' ? '时长' : 'Duration'}: {formatDuration(task.compressedInfo.duration || task.videoInfo.duration || 0)}
                        </span>
                      </>
                    )}
                    {task.encodedCodec && (
                      <>
                        <span>•</span>
                        <span>{language === 'zh-CN' ? '编码' : 'Codec'}: {task.encodedCodec}</span>
                      </>
                    )}
                  </div>
                  {task.status === 'completed' && task.qualityWarning && (
                    <div className="task-warning">
                      <AlertCircle size={14} />
                      {task.qualityWarning}
                    </div>
                  )}
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
                  {task.status === 'completed' && task.compressedPreview && (
                    <button 
                      className="btn-icon"
                      onClick={() => handleDownloadSingle(task)}
                      title={language === 'zh-CN' ? '下载' : 'Download'}
                      disabled={!task.compressedPreview}
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
              {(() => {
                // 计算实际可下载的数量
                const currentTasks = tasksRef.current
                const allCompletedTasks = currentTasks.filter(t => t.status === 'completed' && t.compressedPreview)
                
                if (selectedTasks.size > 0) {
                  // 计算选中的已完成任务数量
                  const selectedCompletedCount = allCompletedTasks.filter(t => selectedTasks.has(t.id)).length
                  return selectedCompletedCount > 0
                    ? (language === 'zh-CN' 
                        ? `下载选中 (${selectedCompletedCount})` 
                        : `Download Selected (${selectedCompletedCount})`)
                    : (language === 'zh-CN' 
                        ? `下载全部 (${stats.completedFiles})` 
                        : `Download All (${stats.completedFiles})`)
                } else {
                  return language === 'zh-CN' 
                    ? `下载全部 (${stats.completedFiles})` 
                    : `Download All (${stats.completedFiles})`
                }
              })()}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
