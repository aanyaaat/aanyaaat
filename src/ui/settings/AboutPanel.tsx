import { X, Heart, ShieldCheck, WifiOff, Cpu } from 'lucide-react';
import { useApp } from '@/state/AppStore';

const APP_VERSION = '1.0.0';

export function AboutPanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const modelCount = app.models.length;
  const loadedModel = app.models.find((m) => m.id === app.loadState.modelId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[32px] border border-line bg-surface shadow-float animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="font-display text-xl text-ink">About</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 text-center">
          {/* Brand */}
          <div className="mb-6 flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-accent-100 text-accent-400 shadow-float aanyaa-breathe">
            <Heart size={40} fill="currentColor" />
          </div>
          <h3 className="font-display text-3xl text-ink">Aanyaa</h3>
          <p className="mt-1 text-sm text-ink-muted">Offline AI Companion</p>
          <p className="mt-0.5 text-xs text-ink-faint">Version {APP_VERSION}</p>

          {/* Tagline */}
          <p className="mt-6 max-w-xs mx-auto text-[15px] leading-relaxed text-ink-muted">
            Everything stays safely on your device.
            <br />
            No cloud. No tracking.
            <br />
            Made with <span className="text-accent-400">❤️</span>
          </p>

          {/* Feature cards */}
          <div className="mt-8 space-y-3 text-left">
            <FeatureRow
              icon={<ShieldCheck size={18} />}
              title="Private"
              desc="Conversations never leave your device"
            />
            <FeatureRow
              icon={<WifiOff size={18} />}
              title="Offline"
              desc="Works without any internet connection"
            />
            <FeatureRow
              icon={<Cpu size={18} />}
              title="On-device AI"
              desc={loadedModel ? `Running ${loadedModel.name}` : `${modelCount} models available`}
            />
          </div>

          {/* Footer */}
          <div className="mt-8 rounded-3xl border border-line bg-surface-subtle/60 p-5">
            <p className="text-xs leading-relaxed text-ink-faint">
              Aanyaa is an open, offline-first AI companion built with care.
              Your conversations are stored locally and are yours alone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-3xl border border-line bg-surface-raised p-4 shadow-card">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-500">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{desc}</p>
      </div>
    </div>
  );
}
