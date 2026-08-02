import { useEffect, useState } from 'react';
import {
  Menu,
  Layers,
  SlidersHorizontal,
  Palette,
  Gauge,
  Bot,
  WifiOff,
  X,
  AlertTriangle,
} from 'lucide-react';
import { AppProvider, useApp } from '@/state/AppStore';
import { useThemeSync } from '@/ui/theme/theme';
import { Sidebar } from '@/ui/chat/Sidebar';
import { MessageList } from '@/ui/chat/MessageList';
import { Composer } from '@/ui/chat/Composer';
import { ModelManager } from '@/ui/models/ModelManager';
import { SettingsPanel } from '@/ui/settings/SettingsPanel';
import { AppearancePanel } from '@/ui/settings/AppearancePanel';
import { PerformancePanel } from '@/ui/settings/PerformancePanel';

function Shell() {
  const app = useApp();
  useThemeSync(app.appearance);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  useEffect(() => {
    void app.init();
  }, [app.init]);

  const activeChat = app.chats.find((c) => c.id === app.activeChatId);
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
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full animate-slide-in">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-line bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink md:hidden"
              aria-label="Open conversations"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white">
                <Bot size={18} />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold leading-tight text-ink">
                  {activeChat?.title ?? 'Offline AI'}
                </h1>
                <p className="text-[11px] leading-tight text-ink-faint">
                  {loadedModel
                    ? loadedModel.name
                    : app.loadState.status === 'loading'
                      ? 'Loading model…'
                      : 'No model loaded'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <OfflineBadge />
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
          </div>
        </header>

        {/* Error banner */}
        {app.error && !errorDismissed && (
          <div className="flex items-center justify-between gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning animate-fade-in">
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
                className="shrink-0 rounded p-0.5 hover:bg-warning/20"
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
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showAppearance && <AppearancePanel onClose={() => setShowAppearance(false)} />}
      {showPerf && <PerformancePanel onClose={() => setShowPerf(false)} />}
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
      className={`rounded-lg p-2 transition-colors ${
        active ? 'bg-accent-50/40 text-accent-600' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function OfflineBadge() {
  return (
    <span
      className="hidden items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success sm:flex"
      title="Works fully offline — no internet required"
    >
      <WifiOff size={11} />
      Offline
    </span>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
