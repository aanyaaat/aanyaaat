/** Core domain types shared across the app. */

export type ChatId = string;
export type MessageId = string;
export type ModelId = string;

export type Role = 'system' | 'user' | 'assistant';

export interface Chat {
  id: ChatId;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  modelId: ModelId | null;
}

export interface Message {
  id: MessageId;
  chatId: ChatId;
  role: Role;
  content: string;
  createdAt: number;
  /** Tokens reported by the engine for this message (assistant only). */
  promptTokens?: number;
  generatedTokens?: number;
  inferenceMs?: number;
  tokensPerSecond?: number;
}

export interface ModelInfo {
  id: ModelId;
  /** File name on disk, e.g. `phi-3-mini-4k-instruct-q4.gguf`. */
  fileName: string;
  /** Human-friendly display name parsed from the file name. */
  name: string;
  /** Bytes on disk. */
  sizeBytes: number;
  architecture: string;
  quantization: string;
  contextLength: number;
  /** Estimated RAM required to load, in bytes. */
  estimatedRamBytes: number;
  engine: 'llama.cpp' | 'onnx' | 'unknown';
  /** Whether the file is loadable in this build. */
  supported: boolean;
}

export interface ModelLoadState {
  modelId: ModelId | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  error?: string;
}

/** All user-tunable generation parameters. */
export interface GenerationSettings {
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  maxTokens: number;
  contextLength: number;
  threads: number;
  gpuLayers: number;
  seed: number;
  systemPrompt: string;
  persona: string;
  streaming: boolean;
  deterministic: boolean;
  stopSequences: string;
}

export const DEFAULT_SETTINGS: GenerationSettings = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  maxTokens: 512,
  contextLength: 4096,
  threads: 4,
  gpuLayers: 0,
  seed: -1,
  systemPrompt:
    'You are a helpful, knowledgeable assistant that runs entirely on the user\u2019s device. Be concise and clear.',
  persona: '',
  streaming: true,
  deterministic: false,
  stopSequences: '',
};

export type ThemeMode = 'light' | 'dark' | 'amoled';
export type AccentSeed = 'blue' | 'green' | 'teal' | 'amber' | 'rose' | 'violet';

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: AccentSeed;
  dynamicColor: boolean;
  highContrast: boolean;
  largeFonts: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'light',
  accent: 'violet',
  dynamicColor: true,
  highContrast: false,
  largeFonts: false,
};

export interface PerformanceSample {
  modelId: ModelId | null;
  promptTokens: number;
  generatedTokens: number;
  inferenceMs: number;
  tokensPerSecond: number;
  ramUsedMb: number;
  cpuPercent: number;
  gpuPercent: number;
  batteryPercent: number;
  sampledAt: number;
}

export type ExportFormat = 'txt' | 'md' | 'json';

/** A token emitted during streaming. */
export interface StreamToken {
  text: string;
  done: boolean;
}
