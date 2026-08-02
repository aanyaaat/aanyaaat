import type { GenerationSettings, Message, ModelId, StreamToken } from '@/domain/types';

/**
 * A request to generate a completion for an existing conversation.
 * The engine is responsible for assembling the prompt from the message
 * history according to its own chat template.
 */
export interface GenerateRequest {
  modelId: ModelId;
  /** Full conversation in order, excluding the assistant turn to be generated. */
  history: Message[];
  settings: GenerationSettings;
  /** Called for each streamed token. Return false to request cancellation. */
  onToken: (token: StreamToken) => boolean;
  /** Optional progress callback for prompt evaluation. */
  onProgress?: (progress: number) => void;
}

export interface GenerateResult {
  text: string;
  promptTokens: number;
  generatedTokens: number;
  inferenceMs: number;
  tokensPerSecond: number;
}

/**
 * Abstraction over an on-device inference backend (llama.cpp, ONNX Runtime,
 * or a WebLLM/llama.cpp-WASM engine in the browser). Implementations must run
 * entirely offline — no network calls.
 */
export interface InferenceEngine {
  readonly id: string;
  readonly displayName: string;

  /** Whether this engine is available in the current runtime. */
  isAvailable(): Promise<boolean>;

  /** Load a model into memory. Returns a progress updater. */
  loadModel(
    modelId: ModelId,
    onProgress?: (progress: number) => void,
  signal?: AbortSignal,
  ): Promise<void>;

  /** Unload the currently loaded model, freeing memory. */
  unloadModel(): Promise<void>;

  /** Whether a model is currently loaded. */
  isModelLoaded(): boolean;

  /** The id of the currently loaded model, if any. */
  getLoadedModelId(): ModelId | null;

  /**
   * Generate a completion, streaming tokens via the request callback.
   * Resolves with summary statistics when generation completes (either
   * naturally, by stop sequence, or by cancellation).
   */
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
}
