import {
  Palette,
  X,
  Sun,
  Moon,
  Contrast,
  Type,
  Check,
  Heart,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import type { AccentSeed, ThemeMode } from '@/domain/types';

const ACCENTS: { id: AccentSeed; label: string; color: string }[] = [
  { id: 'rose', label: 'Rose', color: 'rgb(247 200 216)' },
  { id: 'blue', label: 'Blue', color: 'rgb(40 120 200)' },
  { id: 'green', label: 'Green', color: 'rgb(60 168 112)' },
  { id: 'teal', label: 'Teal', color: 'rgb(26 168 164)' },
  { id: 'amber', label: 'Amber', color: 'rgb(240 158 12)' },
  { id: 'violet', label: 'Violet', color: 'rgb(142 110 208)' },
];

const THEMES: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'Light', icon: <Sun size={16} /> },
  { id: 'dark', label: 'Dark', icon: <Moon size={16} /> },
  { id: 'amoled', label: 'AMOLED', icon: <Contrast size={16} /> },
];

export function AppearancePanel({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const a = app.appearance;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-slide-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <Palette size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Appearance</h2>
              <p className="text-[11px] text-ink-faint">Make it feel like home</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-7 p-6">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Theme</h3>
            <div className="grid grid-cols-3 gap-2.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => app.updateAppearance({ theme: t.id })}
                  className={`flex flex-col items-center gap-2 rounded-3xl border p-5 transition-all ${
                    a.theme === t.id
                      ? 'border-accent-300 bg-accent-50/40 shadow-card'
                      : 'border-line bg-surface-raised hover:border-line-strong'
                  }`}
                >
                  {t.icon}
                  <span className="text-xs font-medium text-ink">{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Accent Color
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {ACCENTS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => app.updateAppearance({ accent: c.id })}
                  className={`flex items-center gap-2 rounded-3xl border p-4 transition-all ${
                    a.accent === c.id
                      ? 'border-accent-300 bg-accent-50/40 shadow-card'
                      : 'border-line bg-surface-raised hover:border-line-strong'
                  }`}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full shadow-soft"
                    style={{ background: c.color }}
                  />
                  <span className="text-xs font-medium text-ink">{c.label}</span>
                  {a.accent === c.id && <Check size={14} className="ml-auto text-accent-600" />}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Material You
            </h3>
            <label className="flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-5">
              <div>
                <p className="text-sm font-medium text-ink">Dynamic Color</p>
                <p className="mt-0.5 text-xs text-ink-faint">Adapt accent to system wallpaper</p>
              </div>
              <Switch
                checked={a.dynamicColor}
                onChange={(v) => app.updateAppearance({ dynamicColor: v })}
              />
            </label>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Accessibility
            </h3>
            <label className="mb-2.5 flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-5">
              <div className="flex items-center gap-2.5">
                <Contrast size={16} className="text-ink-muted" />
                <div>
                  <p className="text-sm font-medium text-ink">High Contrast</p>
                  <p className="mt-0.5 text-xs text-ink-faint">Stronger borders and text</p>
                </div>
              </div>
              <Switch
                checked={a.highContrast}
                onChange={(v) => app.updateAppearance({ highContrast: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-5">
              <div className="flex items-center gap-2.5">
                <Type size={16} className="text-ink-muted" />
                <div>
                  <p className="text-sm font-medium text-ink">Large Fonts</p>
                  <p className="mt-0.5 text-xs text-ink-faint">Increase base text size</p>
                </div>
              </div>
              <Switch
                checked={a.largeFonts}
                onChange={(v) => app.updateAppearance({ largeFonts: v })}
              />
            </label>
          </section>

          <div className="rounded-3xl border border-line bg-surface-subtle/60 p-5 text-center">
            <Heart size={16} className="mx-auto mb-2 text-accent-400" fill="currentColor" />
            <p className="text-xs leading-relaxed text-ink-faint">
              Your choices are saved on your device only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
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
  );
}
