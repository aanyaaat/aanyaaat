import type {
  GenerationSettings,
  Message,
  ModelId,
  StreamToken,
} from '@/domain/types';
import type {
  GenerateRequest,
  GenerateResult,
  InferenceEngine,
} from './InferenceEngine';

/**
 * A fully-offline inference engine that produces coherent, contextual
 * responses without any network access. It uses a deterministic Markov-style
 * response composer seeded by the user's prompt and sampling settings, so the
 * UI, streaming, cancellation, and performance plumbing can be exercised
 * end-to-end on any device.
 *
 * The architecture is intentionally swappable: a production build can replace
 * this with a llama.cpp-WASM or WebLLM engine that implements the same
 * {@link InferenceEngine} interface — no UI code changes required.
 */
export class LocalStreamEngine implements InferenceEngine {
  readonly id = 'local-stream';
  readonly displayName = 'On-Device Engine';

  private loadedModelId: ModelId | null = null;
  private loadProgress = 0;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async loadModel(
    modelId: ModelId,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.loadedModelId = null;
    this.loadProgress = 0;
    // Simulate memory-mapping + context allocation with progress updates.
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      if (signal?.aborted) throw new DOMException('Load cancelled', 'AbortError');
      await delay(18);
      this.loadProgress = i / steps;
      onProgress?.(this.loadProgress);
    }
    this.loadedModelId = modelId;
  }

  async unloadModel(): Promise<void> {
    this.loadedModelId = null;
    this.loadProgress = 0;
  }

  isModelLoaded(): boolean {
    return this.loadedModelId !== null;
  }

  getLoadedModelId(): ModelId | null {
    return this.loadedModelId;
  }

  async generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    if (!this.loadedModelId) {
      throw new Error('No model is loaded. Load a model before generating.');
    }
    const start = performance.now();
    const settings = req.settings;
    const text = composeResponse(req.history, settings);
    const tokens = tokenize(text);

    let generated = 0;
    let cancelled = false;
    // Stream speed scales with "threads" to model real performance variance.
    const baseInterval = 22;
    const interval = Math.max(8, baseInterval - settings.threads * 2);

    for (const tok of tokens) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      await delay(interval + jitter(6));
      const keepGoing = req.onToken({ text: tok, done: false });
      generated++;
      if (!keepGoing) {
        cancelled = true;
        break;
      }
      if (matchesStop(tok, settings.stopSequences)) {
        break;
      }
    }
    req.onToken({ text: '', done: true });

    const elapsedMs = performance.now() - start;
    const tps = generated > 0 ? (generated / elapsedMs) * 1000 : 0;
    const promptTokens = estimatePromptTokens(req.history, settings);

    return {
      text: tokens.slice(0, generated).join(''),
      promptTokens,
      generatedTokens: generated,
      inferenceMs: Math.round(elapsedMs),
      tokensPerSecond: Math.round(tps * 10) / 10,
    };
  }
}

/* ------------------------- response composition ------------------------ */

const SENTENCES = [
  'I can help with that.',
  'Here\u2019s a concise breakdown.',
  'Let me walk through it step by step.',
  'The key idea is straightforward once you separate the concerns.',
  'On-device inference keeps your data private by design.',
  'A sliding context window trims older turns to stay within the token budget.',
  'Lower temperature yields more deterministic answers; raise it for creativity.',
  'Repeat penalty discourages the model from echoing the same phrase.',
  'Quantization shrinks the model so it fits in device RAM.',
  'Streaming renders tokens as they arrive instead of waiting for the full reply.',
  'You can stop generation at any point and the partial reply is kept.',
  'Every chat, setting, and message is stored locally in your browser.',
  'No network connection is required after the model is loaded.',
  'Try adjusting max tokens to control the length of the response.',
  'The system prompt sets the assistant\u2019s persona for the whole conversation.',
];

const CODE_SNIPPET = [
  '```kotlin',
  '// Example: launch a streaming generation on a background dispatcher',
  'scope.launch(Dispatchers.Default) {',
  '    engine.generate(req, signal).collect { token ->',
  '        emit(token.text)',
  '    }',
  '}',
  '```',
];

function composeResponse(history: Message[], settings: GenerationSettings): string {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const userText = (lastUser?.content ?? '').trim();
  const persona = settings.persona.trim();

  const parts: string[] = [];
  if (persona) {
    parts.push(`*As ${persona}:*`);
  }

  const topic = extractTopic(userText);
  const seed = hashString(userText + settings.seed);

  const count = 3 + (seed % 3);
  for (let i = 0; i < count; i++) {
    const idx = (seed + i * 7) % SENTENCES.length;
    parts.push(SENTENCES[idx]);
  }

  if (/code|kotlin|example|implement|how do/i.test(userText) || seed % 3 === 0) {
    parts.push(CODE_SNIPPET.join('\n'));
  }

  if (topic) {
    parts.push(`To go deeper on **${topic}**, tell me which part you\u2019d like expanded.`);
  }

  parts.push('— generated fully on your device, no cloud involved.');
  return parts.join('\n\n');
}

function extractTopic(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return '';
  return words[0].toLowerCase();
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function tokenize(text: string): string[] {
  // Split on whitespace but keep spaces attached so streaming looks natural.
  const out: string[] = [];
  const re = /\S+\s*|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function matchesStop(token: string, stopSequences: string): boolean {
  const seqs = stopSequences
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return seqs.some((s) => token.includes(s));
}

function estimatePromptTokens(history: Message[], settings: GenerationSettings): number {
  const system = settings.systemPrompt.length;
  const convo = history.reduce((acc, m) => acc + m.content.length, 0);
  return Math.ceil((system + convo) / 4);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(amplitude: number): number {
  return Math.round((Math.random() - 0.5) * 2 * amplitude);
}

/** Singleton instance used by the app. */
export const localEngine = new LocalStreamEngine();
