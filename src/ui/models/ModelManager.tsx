import { useRef } from 'react';
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Layers,
  X,
  Check,
  Loader2,
  Upload,
  Trash2,
  Zap,
  AlertCircle,
  Heart,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { formatBytes } from '@/data/modelCatalog';
import type { ModelInfo } from '@/domain/types';

export function ModelManager({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const f of Array.from(files)) {
      await app.installModel(f);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-line bg-surface shadow-float animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Models</h2>
              <p className="text-[11px] text-ink-faint">Pick one to bring me to life</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status banner */}
        <div className="border-b border-line bg-surface-subtle/60 px-6 py-4">
          {app.loadState.status === 'ready' ? (
            <div className="flex items-center gap-2.5 text-sm text-success">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/20">
                <Check size={14} />
              </div>
              <span>
                Ready to chat — <strong className="font-semibold">{loadedName(app.models, app.loadState.modelId)}</strong>
              </span>
            </div>
          ) : app.loadState.status === 'loading' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-sm text-accent-600">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100">
                  <Heart size={13} fill="currentColor" className="aanyaa-breathe" />
                </div>
                <span>Waking up… just a moment ❤️ {Math.round(app.loadState.progress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent-300 transition-all"
                  style={{ width: `${app.loadState.progress * 100}%` }}
                />
              </div>
            </div>
          ) : app.loadState.status === 'error' ? (
            <div className="flex items-center gap-2.5 text-sm text-error">
              <AlertCircle size={16} />
              <span>{app.loadState.error ?? 'Failed to load model'}</span>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-ink-muted">
              No model loaded yet. Pick one below — the first load downloads it to your device, then it runs offline forever.
            </p>
          )}
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">
              {app.models.length} model{app.models.length !== 1 ? 's' : ''} available
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <Upload size={14} />
              Add model file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".onnx,.ort"
              multiple
              onChange={onFile}
              className="hidden"
            />
          </div>

          {app.models.map((m) => (
            <ModelRow key={m.id} model={m} />
          ))}
        </div>

        {/* Footer note */}
        <div className="border-t border-line px-6 py-4">
          <p className="text-xs leading-relaxed text-ink-faint">
            Models download once via WebGPU, then run fully offline. On Android, place GGUF files in <code className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px]">/storage/emulated/0/OfflineAI/models/</code> for auto-detection.
          </p>
        </div>
      </div>
    </div>
  );
}

function loadedName(models: ModelInfo[], id: string | null): string {
  if (!id) return '';
  return models.find((m) => m.id === id)?.name ?? id;
}

function ModelRow({ model }: { model: ModelInfo }) {
  const app = useApp();
  const isLoaded = app.loadState.modelId === model.id && app.loadState.status === 'ready';
  const isLoading = app.loadState.modelId === model.id && app.loadState.status === 'loading';
  const isBundled = !model.id.includes('.') || model.sizeBytes > 100_000_000;

  return (
    <div
      className={`mb-2.5 rounded-3xl border p-5 transition-all ${
        isLoaded
          ? 'border-accent-300 bg-accent-50/40 shadow-card'
          : 'border-line bg-surface-raised hover:border-line-strong hover:shadow-card'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-ink">{model.name}</h3>
            {isLoaded && (
              <span className="flex items-center gap-1 rounded-full bg-accent-100 px-2.5 py-0.5 text-[11px] font-medium text-accent-700">
                <Check size={10} /> Active
              </span>
            )}
            {!model.supported && (
              <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-[11px] font-medium text-warning">
                Unsupported
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <HardDrive size={12} /> {formatBytes(model.sizeBytes)}
            </span>
            <span className="flex items-center gap-1">
              <Cpu size={12} /> {model.architecture}
            </span>
            <span className="flex items-center gap-1">
              <Layers size={12} /> {model.quantization}
            </span>
            <span className="flex items-center gap-1">
              <MemoryStick size={12} /> {formatBytes(model.estimatedRamBytes)} RAM
            </span>
            <span className="flex items-center gap-1">
              <Zap size={12} /> {model.contextLength.toLocaleString()} ctx
            </span>
          </div>
          <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{model.fileName}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isLoaded ? (
            <button
              onClick={() => app.unloadModel()}
              className="rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              Unload
            </button>
          ) : (
            <button
              onClick={() => app.loadModel(model.id)}
              disabled={isLoading || !model.supported}
              className="flex items-center gap-1.5 rounded-full bg-accent-300 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
              {isLoading ? 'Loading…' : 'Load'}
            </button>
          )}
          {!isBundled && (
            <button
              onClick={() => app.uninstallModel(model.id)}
              className="flex items-center justify-center gap-1 rounded-full border border-line px-4 py-1.5 text-xs text-ink-faint transition-colors hover:bg-error/10 hover:text-error"
            >
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
