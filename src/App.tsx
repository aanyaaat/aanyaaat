import { useEffect, useState } from 'react';
import {
  Menu,
  Layers,
  SlidersHorizontal,
  Palette,
  Gauge,
  Heart,
  WifiOff,
  X,
  AlertTriangle,
  Info,
  Download,
} from 'lucide-react';
import { AppProvider, useApp } from '@/state/AppStore';
import { NavProvider } from '@/navigation/state/NavStore';
import { useThemeSync } from '@/ui/theme/theme';
import { Sidebar } from '@/ui/chat/Sidebar';
import { MessageList } from '@/ui/chat/MessageList';
import { Composer } from '@/ui/chat/Composer';
import { ModelManager } from '@/ui/models/ModelManager';
import { SettingsPanel } from '@/ui/settings/SettingsPanel';
import { AppearancePanel } from '@/ui/settings/AppearancePanel';
import { PerformancePanel } from '@/ui/settings/PerformancePanel';
import { AboutPanel } from '@/ui/settings/AboutPanel';
import { Onboarding, hasOnboarded } from '@/ui/onboarding/Onboarding';
import { GetMeHomeButton } from '@/navigation/ui/GetMeHomeButton';
import { HomeSetup } from '@/navigation/ui/HomeSetup';
import { NavigationScreen } from '@/navigation/ui/NavigationScreen';

function Shell() {
  const app = useApp();
  useThemeSync(app.appearance);

  const [onboarded, setOnboarded] = useState(hasOnboarded());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showNav, setShowNav] = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);

  useEffect(() => {
    void app.init();
  }, [app.init]);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Window title sync
  useEffect(() => {
    document.title = app.isGenerating ? 'Aanyaa is thinking…' : 'Aanyaa ❤️';
  }, [app.isGenerating]);

  const doInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  if (!onboarded) {
    return <Onboarding onComplete={() => setOnboarded(true)} />;
  }

  const loadedModel = app.models.find((m) => m.id === app.loadState.modelId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-ink">
      {/* Sidebar — desktop */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Sidebar — mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full animate-slide-in">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink md:hidden"
              aria-label="Open conversations"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-200 text-accent-700 shadow-soft">
                <Heart size={17} fill="currentColor" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display text-lg leading-tight text-ink">
                  Aanyaa <span className="text-accent-400">❤️</span>
                </h1>
                <p className="text-[11px] leading-tight text-ink-faint">
                  {loadedModel
                    ? loadedModel.name
                    : app.loadState.status === 'loading'
                      ? 'Waking up…'
                      : 'Always here when you need me.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <OfflineBadge />
            <GetMeHomeButton onClick={() => setShowNav(true)} />
            <TopBtn label="Models" onClick={() => setShowModels(true)} active={showModels}>
              <Layers size={18} />
            </TopBtn>
            <TopBtn label="Performance" onClick={() => setShowPerf(true)} active={showPerf}>
              <Gauge size={18} />
            </TopBtn>
            <TopBtn label="Appearance" onClick={() => setShowAppearance(true)} active={showAppearance}>
              <Palette size={18} />
            </TopBtn>
            <TopBtn label="Settings" onClick={() => setShowSettings(true)} active={showSettings}>
              <SlidersHorizontal size={18} />
            </TopBtn>
            <TopBtn label="About" onClick={() => setShowAbout(true)} active={showAbout}>
              <Info size={18} />
            </TopBtn>
          </div>
        </header>

        {/* Install prompt */}
        {installEvent && (
          <div className="flex items-center justify-between gap-3 border-b border-accent-200/40 bg-accent-50/40 px-5 py-3 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-200 text-accent-700">
                <Download size={15} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">Keep Aanyaa with you</p>
                <p className="text-xs text-ink-faint">Install once. Use anytime. Even offline.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={doInstall}
                className="rounded-full bg-accent-300 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-accent-400 active:scale-95"
              >
                Install
              </button>
              <button
                onClick={() => setInstallEvent(null)}
                className="rounded-full p-1.5 text-ink-faint transition-colors hover:bg-surface-subtle"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {app.error && !errorDismissed && (
          <div className="flex items-center justify-between gap-3 border-b border-error/20 bg-error/5 px-5 py-2.5 text-sm text-error animate-fade-in">
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="min-w-0 flex-1">{app.error}</span>
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => window.location.reload()} className="shrink-0 text-xs underline">
                Reload
              </button>
              <button
                onClick={() => setErrorDismissed(true)}
                className="shrink-0 rounded-full p-1 transition-colors hover:bg-error/10"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Chat scroll area */}
        <div className="flex-1 overflow-y-auto">
          <MessageList />
        </div>

        {/* Composer */}
        <Composer />
      </div>

      {/* Overlays */}
      {showModels && <ModelManager onClose={() => setShowModels(false)} />}
      {showSettings && <SettingsPanel onShowAbout={() => setShowAbout(true)} onClose={() => setShowSettings(false)} />}
      {showAppearance && <AppearancePanel onClose={() => setShowAppearance(false)} />}
      {showPerf && <PerformancePanel onClose={() => setShowPerf(false)} />}
      {showAbout && <AboutPanel onClose={() => setShowAbout(false)} />}
      {showHomeSetup && <HomeSetup onClose={() => setShowHomeSetup(false)} onProceed={() => { setShowHomeSetup(false); setShowNav(true); }} />}
      {showNav && <NavigationScreen onClose={() => setShowNav(false)} />}
    </div>
  );
}

function TopBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-full p-2.5 transition-all ${
        active ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function OfflineBadge() {
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-[11px] font-medium text-success sm:flex"
      title="Offline mode active — everything continues working normally"
    >
      <WifiOff size={11} />
      Offline mode active
    </span>
  );
}

// Minimal type for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  return (
    <AppProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </AppProvider>
  );
}
