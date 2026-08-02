import {
  Gauge,
  X,
  Zap,
  Clock,
  Cpu,
  MemoryStick,
  Battery,
  Activity,
  Heart,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';

export function PerformancePanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const perf = app.performance;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-slide-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <Gauge size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Performance</h2>
              <p className="text-[11px] text-ink-faint">How things are running</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto p-6">
          {/* Current stats */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Last Response
            </h3>
            {perf ? (
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Zap size={16} />}
                  label="Tokens / sec"
                  value={perf.tokensPerSecond.toFixed(1)}
                  accent
                />
                <StatCard
                  icon={<Clock size={16} />}
                  label="Inference Time"
                  value={`${(perf.inferenceMs / 1000).toFixed(2)}s`}
                />
                <StatCard
                  icon={<Activity size={16} />}
                  label="Prompt Tokens"
                  value={String(perf.promptTokens)}
                />
                <StatCard
                  icon={<Activity size={16} />}
                  label="Generated Tokens"
                  value={String(perf.generatedTokens)}
                />
              </div>
            ) : (
              <div className="rounded-3xl border border-line bg-surface-raised p-6 text-center shadow-card">
                <Heart size={20} className="mx-auto mb-2 text-accent-300" fill="currentColor" />
                <p className="text-sm text-ink-faint">No conversation yet. Say hello and I'll show you the numbers.</p>
              </div>
            )}
          </section>

          {/* Resource usage */}
          {perf && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Resource Usage
              </h3>
              <div className="space-y-3.5">
                <ResourceBar
                  icon={<MemoryStick size={14} />}
                  label="RAM"
                  value={perf.ramUsedMb}
                  unit="MB"
                  max={4096}
                />
                <ResourceBar
                  icon={<Cpu size={14} />}
                  label="CPU"
                  value={perf.cpuPercent}
                  unit="%"
                  max={100}
                />
                <ResourceBar
                  icon={<Activity size={14} />}
                  label="GPU"
                  value={perf.gpuPercent}
                  unit="%"
                  max={100}
                />
                <ResourceBar
                  icon={<Battery size={14} />}
                  label="Battery"
                  value={perf.batteryPercent}
                  unit="%"
                  max={100}
                />
              </div>
            </section>
          )}

          {/* History */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Recent Responses
            </h3>
            {app.performanceHistory.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing here yet.</p>
            ) : (
              <div className="space-y-2">
                {app.performanceHistory.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-2xl border border-line bg-surface-raised px-4 py-3 shadow-card"
                  >
                    <div className="flex items-center gap-2">
                      <Zap size={13} className="text-accent-400" />
                      <span className="text-sm font-medium text-ink">
                        {p.tokensPerSecond.toFixed(1)} tok/s
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ink-faint">
                      <span>{p.generatedTokens} tok</span>
                      <span>{(p.inferenceMs / 1000).toFixed(1)}s</span>
                      <span>{new Date(p.sampledAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-card ${
        accent ? 'border-accent-300 bg-accent-50/40' : 'border-line bg-surface-raised'
      }`}
    >
      <div className={`mb-2 flex items-center gap-1.5 ${accent ? 'text-accent-600' : 'text-ink-faint'}`}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${accent ? 'text-accent-700' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function ResourceBar({
  icon,
  label,
  value,
  unit,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  max: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-ink-muted">
          {icon}
          {label}
        </span>
        <span className="font-mono text-ink">
          {value.toFixed(unit === '%' ? 0 : 0)} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
        <div
          className="h-full rounded-full bg-accent-300 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
