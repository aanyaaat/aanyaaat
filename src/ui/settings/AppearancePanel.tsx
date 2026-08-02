import {
  Palette,
  X,
  Sun,
  Moon,
  Contrast,
  Type,
  Check,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import type { AccentSeed, ThemeMode } from '@/domain/types';

const ACCENTS: { id: AccentSeed; label: string; color: string }[] = [
  { id: 'blue', label: 'Blue', color: 'rgb(38 128 245)' },
  { id: 'green', label: 'Green', color: 'rgb(34 168 104)' },
  { id: 'teal', label: 'Teal', color: 'rgb(20 168 164)' },
  { id: 'amber', label: 'Amber', color: 'rgb(245 158 11)' },
  { id: 'rose', label: 'Rose', color: 'rgb(244 63 94)' },
  { id: 'violet', label: 'Violet', color: 'rgb(139 92 246)' },
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Palette size={20} className="text-accent-500" />
            <h2 className="text-lg font-semibold text-ink">Appearance</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-7">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Theme</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => app.updateAppearance({ theme: t.id })}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                    a.theme === t.id
                      ? 'border-accent-500 bg-accent-50/30'
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
            <div className="grid grid-cols-3 gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => app.updateAppearance({ accent: c.id })}
                  className={`flex items-center gap-2 rounded-xl border p-3 transition-all ${
                    a.accent === c.id
                      ? 'border-accent-500 bg-accent-50/30'
                      : 'border-line bg-surface-raised hover:border-line-strong'
                  }`}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full"
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
            <label className="flex items-center justify-between rounded-xl border border-line bg-surface-raised p-4">
              <div>
                <p className="text-sm font-medium text-ink">Dynamic Color</p>
                <p className="text-xs text-ink-faint">Adapt accent to system wallpaper</p>
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
            <label className="mb-2 flex items-center justify-between rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center gap-2">
                <Contrast size={16} className="text-ink-muted" />
                <div>
                  <p className="text-sm font-medium text-ink">High Contrast</p>
                  <p className="text-xs text-ink-faint">Stronger borders and text</p>
                </div>
              </div>
              <Switch
                checked={a.highContrast}
                onChange={(v) => app.updateAppearance({ highContrast: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center gap-2">
                <Type size={16} className="text-ink-muted" />
                <div>
                  <p className="text-sm font-medium text-ink">Large Fonts</p>
                  <p className="text-xs text-ink-faint">Increase base text size</p>
                </div>
              </div>
              <Switch
                checked={a.largeFonts}
                onChange={(v) => app.updateAppearance({ largeFonts: v })}
              />
            </label>
          </section>
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
  );
}
