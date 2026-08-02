import { WEBLLM_MODELS } from '@/engine/WebLLMEngine';
import type { ModelInfo, ModelId } from '@/domain/types';

/**
 * Detects and describes model files. In the Android build this scans
 * `/storage/emulated/0/OfflineAI/models/`; in this web build it exposes the
 * real WebLLM model catalog (actual on-device LLMs that run via WebGPU) plus
 * any models the user adds manually.
 */

/** Build the model list from the real WebLLM catalog. */
export function buildModelList(): ModelInfo[] {
  return WEBLLM_MODELS.map((m) => ({
    id: m.id,
    fileName: m.id,
    name: m.name,
    sizeBytes: m.vramMb * 1024 * 1024,
    architecture: m.architecture,
    quantization: m.quantization,
    contextLength: m.contextLength,
    estimatedRamBytes: m.vramMb * 1024 * 1024,
    engine: 'llama.cpp' as const,
    supported: true,
  })).sort((a, b) => a.estimatedRamBytes - b.estimatedRamBytes);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 ? 2 : 1)} ${units[i]}`;
}

export interface ModelScanResult {
  models: ModelInfo[];
  corrupted: string[];
}

export async function scanModels(): Promise<ModelScanResult> {
  const models = buildModelList();
  const userAdded = readUserModels();
  const seen = new Set<ModelId>();
  const merged: ModelInfo[] = [];
  for (const m of [...models, ...userAdded]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  merged.sort((a, b) => a.estimatedRamBytes - b.estimatedRamBytes);
  return { models: merged, corrupted: [] };
}

const USER_MODELS_KEY = 'offlineai.userModels';

export function addUserModel(file: File): ModelInfo {
  const info = detectFromFile(file);
  const list = readUserModels();
  list.push(info);
  saveUserModels(list);
  return info;
}

export function removeUserModel(id: ModelId): void {
  const list = readUserModels().filter((m) => m.id !== id);
  saveUserModels(list);
}

function detectFromFile(file: File): ModelInfo {
  const lower = file.name.toLowerCase();
  const isGguf = lower.endsWith('.gguf');
  const isOnnx = lower.endsWith('.onnx') || lower.endsWith('.ort');
  return {
    id: file.name,
    fileName: file.name,
    name: prettifyName(file.name),
    sizeBytes: file.size,
    architecture: parseArch(file.name),
    quantization: parseQuant(file.name),
    contextLength: 4096,
    estimatedRamBytes: file.size + 512 * 1024 * 1024,
    engine: isOnnx ? 'onnx' : isGguf ? 'llama.cpp' : 'unknown',
    supported: false,
  };
}

function parseArch(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('phi-3') || l.includes('phi3')) return 'phi3';
  if (l.includes('gemma')) return 'gemma';
  if (l.includes('qwen')) return 'qwen2';
  if (l.includes('mistral')) return 'mistral';
  if (l.includes('tinyllama')) return 'llama';
  if (l.includes('smollm')) return 'smollm';
  if (l.includes('llama')) return 'llama';
  return 'unknown';
}

function parseQuant(name: string): string {
  const m = name.match(/q([0-9]f[0-9_]+)/i);
  return m ? m[0].toUpperCase() : 'unknown';
}

function prettifyName(fileName: string): string {
  return fileName.replace(/\.(gguf|onnx|ort)$/i, '').replace(/[-_]/g, ' ');
}

function readUserModels(): ModelInfo[] {
  try {
    const raw = localStorage.getItem(USER_MODELS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ModelInfo[];
  } catch {
    return [];
  }
}

function saveUserModels(list: ModelInfo[]): void {
  localStorage.setItem(USER_MODELS_KEY, JSON.stringify(list));
}
