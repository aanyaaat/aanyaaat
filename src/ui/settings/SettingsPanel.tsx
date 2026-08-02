import {
  SlidersHorizontal,
  X,
  Thermometer,
  Percent,
  Hash,
  RotateCw,
  Maximize2,
  ScrollText,
  Cpu,
  Layers,
  Dices,
  MessageSquareCode,
  UserCircle2,
  Radio,
  Lock,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { DEFAULT_SETTINGS, type GenerationSettings } from '@/domain/types';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const s = app.settings;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-slide-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={20} className="text-accent-500" />
            <h2 className="text-lg font-semibold text-ink">Generation Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
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
                placeholder="e.g. a concise technical writer"
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

            <div className="rounded-xl border border-line bg-surface-subtle p-4">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Lock size={14} />
                <span>All settings stored locally. Nothing leaves your device.</span>
              </div>
            </div>

            <button
              onClick={() => app.updateSettings(DEFAULT_SETTINGS)}
              className="w-full rounded-xl border border-line py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      <div className="space-y-4">{children}</div>
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
      <div className="mb-1.5 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm text-ink-muted">
          {icon}
          {label}
        </label>
        <span className="font-mono text-sm font-medium text-ink">{value}</span>
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
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
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
          checked ? 'bg-accent-600' : 'bg-line-strong'
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
      <label className="mb-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
        {icon}
        {label}
      </label>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-lg border border-line bg-surface-raised p-3 text-sm text-ink focus:border-accent-500 focus:outline-none"
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
      <label className="mb-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
        {icon}
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface-raised p-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
      />
    </div>
  );
}
