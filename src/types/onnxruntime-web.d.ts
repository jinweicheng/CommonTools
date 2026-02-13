/**
 * Minimal type declarations for onnxruntime-web
 * (The package ships types.d.ts but its package.json "exports" field
 * prevents TypeScript from resolving them under moduleResolution: bundler.)
 */
declare module 'onnxruntime-web' {
  export interface Tensor {
    readonly data: Float32Array | Int32Array | BigInt64Array | Uint8Array
    readonly dims: readonly number[]
    readonly type: string
  }

  export const Tensor: {
    new(
      type: 'float32' | 'int32' | 'int64' | 'uint8' | 'bool' | 'string',
      data: Float32Array | Int32Array | BigInt64Array | Uint8Array | boolean[] | string[],
      dims: readonly number[],
    ): Tensor
  }

  export interface InferenceSession {
    readonly inputNames: readonly string[]
    readonly outputNames: readonly string[]
    run(feeds: Record<string, Tensor>, options?: RunOptions): Promise<Record<string, Tensor>>
    release(): Promise<void>
  }

  export interface RunOptions {
    logSeverityLevel?: number
  }

  export interface SessionOptions {
    executionProviders?: string[]
    graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all'
    intraOpNumThreads?: number
    interOpNumThreads?: number
    logSeverityLevel?: number
  }

  export namespace InferenceSession {
    function create(
      model: string | ArrayBuffer | Uint8Array,
      options?: SessionOptions,
    ): Promise<InferenceSession>
  }

  export const env: {
    wasm: {
      numThreads: number
      wasmPaths?: string | Record<string, string>
      proxy?: boolean
    }
    logLevel?: string
  }
}
