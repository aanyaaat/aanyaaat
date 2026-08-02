import type {
  GenerationSettings,
  ModelId,
  StreamToken,
} from '@/domain/types';
import type {
  GenerateRequest,
  GenerateResult,
  InferenceEngine,
} from './InferenceEngine';

/**
 * Real on-device inference engine backed by WebLLM (MLC-LLM compiled to
 * WebGPU). The WebLLM library is loaded dynamically from a CDN at runtime so
 * it doesn't need to be bundled — this avoids Vite dev-server resolution
 * issues with the large WebLLM package.
 *
 * Models are downloaded once from a public CDN and cached in the browser;
 * after that, inference runs entirely on-device with no network access
 * required.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMLCEngine = any;

import * as webllm from "@mlc-ai/web-llm";

// A curated list of real WebLLM models that run well on consumer hardware.
// Each entry maps our internal id to the WebLLM model_id.
export const WEBLLM_MODELS: {
  id: string;
  name: string;
  architecture: string;
  quantization: string;
  contextLength: number;
  vramMb: number;
}[] = [
    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B Instruct', architecture: 'llama3', quantization: 'Q4F16', contextLength: 4096, vramMb: 879 },
    { id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', name: 'Llama 3.2 1B Instruct', architecture: 'llama3', quantization: 'Q4F32', contextLength: 4096, vramMb: 1129 },
    { id: 'TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC', name: 'TinyLlama 1.1B Chat', architecture: 'llama', quantization: 'Q4F16', contextLength: 2048, vramMb: 638 },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 1.5B Instruct', architecture: 'qwen2', quantization: 'Q4F16', contextLength: 4096, vramMb: 1186 },
    { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B Instruct', architecture: 'smollm', quantization: 'Q4F16', contextLength: 8192, vramMb: 1129 },
    { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B Instruct', architecture: 'gemma2', quantization: 'Q4F16', contextLength: 8192, vramMb: 1590 },
    { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini Instruct', architecture: 'phi3', quantization: 'Q4F16', contextLength: 4096, vramMb: 2010 },
    { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B Instruct', architecture: 'llama3', quantization: 'Q4F16', contextLength: 4096, vramMb: 2264 },
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 3B Instruct', architecture: 'qwen2', quantization: 'Q4F16', contextLength: 4096, vramMb: 2264 },
    { id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC', name: 'Llama 3.2 3B Instruct', architecture: 'llama3', quantization: 'Q4F32', contextLength: 4096, vramMb: 2952 },
    { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral 7B Instruct v0.3', architecture: 'mistral', quantization: 'Q4F16', contextLength: 4096, vramMb: 5001 },
    { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B Instruct', architecture: 'llama3', quantization: 'Q4F16', contextLength: 4096, vramMb: 5001 },
  ];

export class WebLLMEngine implements InferenceEngine {
  readonly id = 'webllm';
  readonly displayName = 'WebLLM (WebGPU)';

  private engine: AnyMLCEngine | null = null;
  private loadedModelId: ModelId | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webllmModule: any = null;

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    return !!(navigator as unknown as { gpu?: unknown }).gpu;
  }

  private async loadModule(): Promise<void> {
    if (this.webllmModule) return;
    // Dynamically import from CDN to avoid bundling issues.
    this.webllmModule = webllm;
  }

  async loadModel(
    modelId: ModelId,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.loadModule();

    if (this.engine && this.loadedModelId) {
      await this.engine.unload();
    }

    const config = {
      initProgressCallback: (report: { progress: number }) => {
        onProgress?.(report.progress);
      },
    };

    if (!this.engine) {
      this.engine = await this.webllmModule.CreateMLCEngine(modelId, config);
    } else {
      await this.engine.reload(modelId);
    }

    if (signal?.aborted) {
      await this.engine.unload();
      this.engine = null;
      this.loadedModelId = null;
      throw new DOMException('Load cancelled', 'AbortError');
    }
    this.loadedModelId = modelId;
  }

  async unloadModel(): Promise<void> {
    if (this.engine && this.loadedModelId) {
      await this.engine.unload();
    }
    this.loadedModelId = null;
  }

  isModelLoaded(): boolean {
    return this.loadedModelId !== null && this.engine !== null;
  }

  getLoadedModelId(): ModelId | null {
    return this.loadedModelId;
  }

  async generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    if (!this.engine || !this.loadedModelId) {
      throw new Error('No model loaded.');
    }

    const messages = buildMessages(req.history, req.settings);
    const stopSeqs = parseStop(req.settings.stopSequences);

    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature: req.settings.temperature,
      top_p: req.settings.topP,
      max_tokens: req.settings.maxTokens,
      stop: stopSeqs.length > 0 ? stopSeqs : undefined,
    });

    const start = performance.now();
    let text = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let decodeTps = 0;

    for await (const chunk of stream) {
      if (signal?.aborted) {
        await this.engine.interruptGenerate();
        break;
      }
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        text += delta;
        const keepGoing = req.onToken({ text: delta, done: false } as StreamToken);
        if (!keepGoing) {
          await this.engine.interruptGenerate();
          break;
        }
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
        decodeTps = chunk.usage.extra?.decode_tokens_per_s ?? 0;
      }
    }
    req.onToken({ text: '', done: true });

    const elapsedMs = performance.now() - start;
    const tps = decodeTps > 0 ? decodeTps : completionTokens > 0 ? (completionTokens / elapsedMs) * 1000 : 0;

    return {
      text,
      promptTokens,
      generatedTokens: completionTokens,
      inferenceMs: Math.round(elapsedMs),
      tokensPerSecond: Math.round(tps * 10) / 10,
    };
  }
}

/* ------------------------------ helpers ------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMessages(history: { role: string; content: string }[], settings: GenerationSettings): any[] {
  const msgs: { role: string; content: string }[] = [];

  if (settings.systemPrompt.trim()) {
    const sys = settings.persona.trim()
      ? `${settings.systemPrompt.trim()}\n\nPersona: ${settings.persona.trim()}`
      : settings.systemPrompt.trim();
    msgs.push({ role: 'system', content: sys });
  }

  for (const m of history) {
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return msgs;
}

function parseStop(stopSequences: string): string[] {
  return stopSequences
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Singleton instance. */
export const webllmEngine = new WebLLMEngine();
