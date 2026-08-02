import { SlidersHorizontal, X, Thermometer, Percent, Hash, RotateCw, Maximize2, ScrollText, Cpu, Layers, Dices, MessageSquareCode, CircleUser as UserCircle2, Radio, Lock, RotateCcw, Info, Heart } from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { DEFAULT_SETTINGS } from '@/domain/types';

export function SettingsPanel({ onClose, onShowAbout }: { onClose: () => void; onShowAbout: () => void }) {
  const app = useApp();
  const s = app.settings;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-slide-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Conversation Settings</h2>
              <p className="text-[11px] text-ink-faint">Tune how Aanyaa responds</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <Section title="Sampling">
              <Slider
                icon={<Thermometer size={14} />}
                label="Temperature"
                value={s.temperature}
                min={0}
                max={2}
                step={0.05}
                hint="Higher = more creative, lower = more focused"
                onChange={(v) => app.updateSettings({ temperature: v })}
              />
              <Slider
                icon={<Percent size={14} />}
                label="Top P"
                value={s.topP}
                min={0}
                max={1}
                step={0.01}
                hint="Nucleus sampling cutoff"
                onChange={(v) => app.updateSettings({ topP: v })}
              />
              <Slider
                icon={<Hash size={14} />}
                label="Top K"
                value={s.topK}
                min={0}
                max={100}
                step={1}
                hint="Limit to top-K tokens"
                onChange={(v) => app.updateSettings({ topK: v })}
              />
              <Slider
                icon={<RotateCw size={14} />}
                label="Repeat Penalty"
                value={s.repeatPenalty}
                min={1}
                max={2}
                step={0.01}
                hint="Discourage repetition"
                onChange={(v) => app.updateSettings({ repeatPenalty: v })}
              />
            </Section>

            <Section title="Limits">
              <Slider
                icon={<Maximize2 size={14} />}
                label="Max Tokens"
                value={s.maxTokens}
                min={32}
                max={4096}
                step={32}
                hint="Maximum tokens to generate"
                onChange={(v) => app.updateSettings({ maxTokens: v })}
              />
              <Slider
                icon={<ScrollText size={14} />}
                label="Context Length"
                value={s.contextLength}
                min={512}
                max={32768}
                step={512}
                hint="Sliding window size in tokens"
                onChange={(v) => app.updateSettings({ contextLength: v })}
              />
            </Section>

            <Section title="Performance">
              <Slider
                icon={<Cpu size={14} />}
                label="Threads"
                value={s.threads}
                min={1}
                max={8}
                step={1}
                hint="CPU threads for inference"
                onChange={(v) => app.updateSettings({ threads: v })}
              />
              <Slider
                icon={<Layers size={14} />}
                label="GPU Layers"
                value={s.gpuLayers}
                min={0}
                max={99}
                step={1}
                hint="0 = CPU only"
                onChange={(v) => app.updateSettings({ gpuLayers: v })}
              />
            </Section>

            <Section title="Reproducibility">
              <Slider
                icon={<Dices size={14} />}
                label="Seed"
                value={s.seed}
                min={-1}
                max={999999}
                step={1}
                hint="-1 = random"
                onChange={(v) => app.updateSettings({ seed: v })}
              />
              <Toggle
                label="Deterministic Mode"
                checked={s.deterministic}
                onChange={(v) => app.updateSettings({ deterministic: v })}
              />
            </Section>

            <Section title="Prompting">
              <TextArea
                icon={<MessageSquareCode size={14} />}
                label="System Prompt"
                value={s.systemPrompt}
                rows={4}
                onChange={(v) => app.updateSettings({ systemPrompt: v })}
              />
              <TextInput
                icon={<UserCircle2 size={14} />}
                label="Persona"
                value={s.persona}
                placeholder="e.g. a gentle, encouraging friend"
                onChange={(v) => app.updateSettings({ persona: v })}
              />
              <TextInput
                label="Stop Sequences"
                value={s.stopSequences}
                placeholder="comma-separated"
                onChange={(v) => app.updateSettings({ stopSequences: v })}
              />
            </Section>

            <Section title="Output">
              <Toggle
                icon={<Radio size={14} />}
                label="Streaming Responses"
                checked={s.streaming}
                onChange={(v) => app.updateSettings({ streaming: v })}
              />
            </Section>

            <div className="rounded-3xl border border-line bg-surface-subtle/60 p-5">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Lock size={14} />
                <span>All settings stay on your device. Nothing leaves.</span>
              </div>
            </div>

            <button
              onClick={() => app.updateSettings(DEFAULT_SETTINGS)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <RotateCcw size={14} />
              Reset to defaults
            </button>

            {/* About card */}
            <button
              onClick={onShowAbout}
              className="flex w-full items-center gap-3.5 rounded-3xl border border-line bg-surface-raised p-5 text-left shadow-card transition-all hover:border-line-strong hover:shadow-card-hover active:scale-[0.99]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-500">
                <Info size={18} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">About Aanyaa</p>
                <p className="mt-0.5 text-xs text-ink-faint">Version, privacy, credits</p>
              </div>
              <Heart size={14} className="text-accent-400" fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line bg-surface-raised p-5 shadow-card">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Slider({
  icon,
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm text-ink-muted">
          {icon}
          {label}
        </label>
        <span className="rounded-full bg-surface-subtle px-2.5 py-0.5 font-mono text-sm font-medium text-ink">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function Toggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-1.5 text-sm text-ink-muted">
        {icon}
        {label}
      </label>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-accent-300' : 'bg-line-strong'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function TextArea({
  icon,
  label,
  value,
  rows,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-sm text-ink-muted">
        {icon}
        {label}
      </label>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-[20px] border border-line bg-surface p-3.5 text-sm text-ink transition-colors focus:border-accent-300 focus:outline-none"
      />
    </div>
  );
}

function TextInput({
  icon,
  label,
  value,
  placeholder,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-sm text-ink-muted">
        {icon}
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[20px] border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent-300 focus:outline-none"
      />
    </div>
  );
}
