import type { InferenceEngine } from '@/engine/InferenceEngine';
import { localEngine } from '@/engine/LocalStreamEngine';
import { webllmEngine } from '@/engine/WebLLMEngine';

class EngineRegistry {
  private engines = new Map<string, InferenceEngine>();
  private activeId = webllmEngine.id;

  constructor() {
    this.register(webllmEngine);
    this.register(localEngine);
  }

  register(engine: InferenceEngine): void {
    this.engines.set(engine.id, engine);
  }

  list(): InferenceEngine[] {
    return [...this.engines.values()];
  }

  get(id: string): InferenceEngine | undefined {
    return this.engines.get(id);
  }

  get active(): InferenceEngine {
    const engine = this.engines.get(this.activeId);

    if (!engine) {
      throw new Error(`Active engine "${this.activeId}" was not found.`);
    }

    return engine;
  }

  setActive(id: string): void {
    if (!this.engines.has(id)) {
      throw new Error(`Unknown engine "${id}"`);
    }

    this.activeId = id;
  }

  async selectBest(): Promise<InferenceEngine> {
    const webllm = this.engines.get(webllmEngine.id);

    if (!webllm) {
      throw new Error("WebLLM engine is not registered.");
    }

    try {
      const available = await webllm.isAvailable();

      if (!available) {
        throw new Error(
          "WebGPU is unavailable. WebLLM cannot run on this device."
        );
      }

      this.activeId = webllm.id;
      return webllm;
    } catch (err) {
      console.error("WebLLM initialization failed:", err);
      throw err;
    }
  }
}

export const engineRegistry = new EngineRegistry();