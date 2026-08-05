import { useState, useEffect } from 'react';
import {
  Heart,
  ShieldCheck,
  WifiOff,
  Palette,
  ArrowRight,
  Check,
  Sun,
  Moon,
  Contrast,
  Home,
  Navigation,
  MapPin,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { applyTheme } from '@/ui/theme/theme';
import type { ThemeMode } from '@/domain/types';

const ONBOARDED_KEY = 'aanyaa_onboarded';

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

type Step = 'splash' | 'welcome' | 'privacy' | 'offline' | 'getme-home' | 'theme' | 'done';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const app = useApp();
  const [step, setStep] = useState<Step>('splash');

  // Apply current appearance so theme selection previews live
  useEffect(() => {
    applyTheme(app.appearance);
  }, [app.appearance]);

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      /* ignore */
    }
    onComplete();
  };

  const skip = () => finish();

  if (step === 'splash') {
    return <Splash onContinue={() => setStep('welcome')} />;
  }
  if (step === 'welcome') {
    return <Welcome onNext={() => setStep('privacy')} onSkip={skip} />;
  }
  if (step === 'privacy') {
    return <Privacy onNext={() => setStep('offline')} onSkip={skip} />;
  }
  if (step === 'offline') {
    return <Offline onNext={() => setStep('getme-home')} onSkip={skip} />;
  }
  if (step === 'getme-home') {
    return <GetMeHomeIntro onNext={() => setStep('theme')} onSkip={skip} />;
  }
  return <ThemePick onDone={finish} onSkip={skip} />;
}

/* ---------- Steps ---------- */

function Splash({ onContinue }: { onContinue: () => void }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 2200);
    return () => clearTimeout(t);
  }, [onContinue]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-surface">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-accent-100 text-accent-400 shadow-float aanyaa-breathe">
        <Heart size={56} fill="currentColor" />
      </div>
      <h1 className="mt-8 font-display text-5xl text-ink">Aanyaa</h1>
      <p className="mt-2 text-sm tracking-wide text-ink-muted">
        Always here,
        <br />
        even offline.
      </p>
    </div>
  );
}

function Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <OnboardingShell onSkip={onSkip}>
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-400 shadow-float aanyaa-breathe">
        <Heart size={36} fill="currentColor" />
      </div>
      <h2 className="font-display text-4xl text-ink">
        Hi <span className="text-accent-400">❤️</span>
      </h2>
      <p className="mt-2 font-display text-2xl text-ink-muted">I'm Aanyaa.</p>
      <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-muted">
        I'm your personal companion — here to chat, think, and keep you company.
        Everything we talk about stays safely on your device.
      </p>
      <ContinueBtn onClick={onNext} label="Let's begin" />
    </OnboardingShell>
  );
}

function Privacy({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <OnboardingShell onSkip={onSkip}>
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success shadow-soft">
        <ShieldCheck size={36} />
      </div>
      <h2 className="font-display text-3xl text-ink">Private by design</h2>
      <div className="mt-6 w-full max-w-sm space-y-4">
        {[
          { t: 'Everything stays on your device', d: 'Your conversations never leave your phone or computer.' },
          { t: 'No cloud', d: 'No servers processing your messages.' },
          { t: 'No tracking', d: 'No analytics, no ads, no data collection.' },
        ].map((item) => (
          <div key={item.t} className="flex items-start gap-3 rounded-3xl border border-line bg-surface-raised p-4 shadow-card">
            <Check size={18} className="mt-0.5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-medium text-ink">{item.t}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{item.d}</p>
            </div>
          </div>
        ))}
      </div>
      <ContinueBtn onClick={onNext} label="Continue" />
    </OnboardingShell>
  );
}

function Offline({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <OnboardingShell onSkip={onSkip}>
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-500 shadow-soft">
        <WifiOff size={36} />
      </div>
      <h2 className="font-display text-3xl text-ink">Works offline</h2>
      <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-muted">
        Aanyaa runs an AI model directly on your device. Once it's loaded,
        you can chat without any internet connection — on a plane, on a road trip,
        anywhere.
      </p>
      <div className="mt-6 flex items-center gap-2.5 rounded-3xl border border-line bg-surface-raised px-5 py-4 shadow-card">
        <WifiOff size={16} className="text-success" />
        <span className="text-sm text-ink-muted">Offline mode active — everything continues working normally.</span>
      </div>
      <ContinueBtn onClick={onNext} label="Continue" />
    </OnboardingShell>
  );
}

function ThemePick({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const app = useApp();
  const themes: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <Sun size={20} /> },
    { id: 'dark', label: 'Dark', icon: <Moon size={20} /> },
    { id: 'amoled', label: 'AMOLED', icon: <Contrast size={20} /> },
  ];

  return (
    <OnboardingShell onSkip={onSkip}>
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-500 shadow-soft">
        <Palette size={36} />
      </div>
      <h2 className="font-display text-3xl text-ink">Make it yours</h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-muted">
        Pick a theme that feels right. You can always change it later.
      </p>
      <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => app.updateAppearance({ theme: t.id })}
            className={`flex flex-col items-center gap-3 rounded-3xl border p-6 transition-all ${
              app.appearance.theme === t.id
                ? 'border-accent-300 bg-accent-50/40 shadow-card'
                : 'border-line bg-surface-raised hover:border-line-strong'
            }`}
          >
            {t.icon}
            <span className="text-sm font-medium text-ink">{t.label}</span>
          </button>
        ))}
      </div>
      <ContinueBtn onClick={onDone} label="Enter Aanyaa" />
    </OnboardingShell>
  );
}

function GetMeHomeIntro({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <OnboardingShell onSkip={onSkip}>
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-500 shadow-float aanyaa-breathe">
        <Home size={36} fill="currentColor" />
      </div>
      <h2 className="font-display text-3xl text-ink">Get me home, anytime</h2>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
        Lost or unfamiliar with an area? Aanyaa can guide you home —
        with turn-by-turn directions that work even without internet.
      </p>
      <div className="mt-8 w-full max-w-sm space-y-3">
        <button
          onClick={() => { window.location.hash = 'set-home'; onSkip(); }}
          className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-raised p-4 text-left shadow-card transition-all hover:border-accent-300 hover:shadow-card-hover active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-500 transition-transform group-hover:scale-105">
            <MapPin size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">Set your home once</p>
            <p className="mt-0.5 text-xs text-ink-faint">Search any address or bus stop — even with misspellings.</p>
          </div>
          <ArrowRight size={15} className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
        </button>
        <button
          onClick={() => { window.location.hash = 'get-me-home'; onSkip(); }}
          className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-raised p-4 text-left shadow-card transition-all hover:border-accent-300 hover:shadow-card-hover active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success transition-transform group-hover:scale-105">
            <Navigation size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">Navigate offline</p>
            <p className="mt-0.5 text-xs text-ink-faint">Download your area once. Directions work without signal.</p>
          </div>
          <ArrowRight size={15} className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
      <p className="mt-6 max-w-sm text-xs text-ink-faint">
        You'll find this in the sidebar menu whenever you need it.
      </p>
      <ContinueBtn onClick={onNext} label="Continue" />
    </OnboardingShell>
  );
}

/* ---------- Shared shell ---------- */

function OnboardingShell({ children, onSkip }: { children: React.ReactNode; onSkip: () => void }) {
  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-surface px-6 text-center animate-fade-in">
      <button
        onClick={onSkip}
        className="absolute right-6 top-6 rounded-full px-4 py-2 text-sm text-ink-faint transition-colors hover:bg-surface-subtle hover:text-ink"
      >
        Skip
      </button>
      {children}
    </div>
  );
}

function ContinueBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-10 flex items-center gap-2 rounded-full bg-accent-300 px-8 py-3.5 text-sm font-medium text-white transition-all hover:bg-accent-400 active:scale-95"
    >
      {label}
      <ArrowRight size={16} />
    </button>
  );
}
