import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Navigation,
  MapPin,
  WifiOff,
  Wifi,
  LocateFixed,
  Square,
  AlertTriangle,
  Home,
  Footprints,
  Car,
  Bike,
  Layers,
  Compass,
  RefreshCw,
  Loader2,
  Info,
  Pencil,
  Search,
  ArrowUpDown,
  Clock,
  Star,
  Briefcase,
  History,
  Plus,
  Gauge,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { CanvasMap } from '@/navigation/maps/CanvasMap';
import { CompassFallback } from '@/navigation/ui/CompassFallback';
import { EmergencyFallback } from '@/navigation/ui/EmergencyFallback';
import { OfflineMapsPanel } from '@/navigation/ui/OfflineMapsPanel';
import { HomeSetup } from '@/navigation/ui/HomeSetup';
import { RouteSearchPanel } from '@/navigation/ui/RouteSearchPanel';
import { Tulip } from '@/ui/components/Tulip';
import { formatDistance, formatDuration } from '@/navigation/gps/gps';
import type { TravelMode, InstructionType, SavedPlace } from '@/navigation/domain/types';

export function NavigationScreen({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [showOfflineMaps, setShowOfflineMaps] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const [showRouteSearch, setShowRouteSearch] = useState<'from' | 'to' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);

  const needsSetup = !nav.home;
  const hasRoute = nav.route !== null;
  const isOffCoverage = nav.phase === 'off-coverage';
  const isNavigating = nav.phase === 'navigating' || nav.phase === 'recalculating';

  useEffect(() => {
    nav.startGpsOnly();
    return () => {
      nav.stopNavigation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-fade-in">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-3 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-200 text-accent-700">
              <Navigation size={16} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink">Navigate</h1>
              <p className="text-[11px] leading-tight text-ink-faint">{statusLabel(nav)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge
            icon={nav.network === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
            label={nav.network === 'online' ? 'ONLINE' : 'OFFLINE'}
            tone={nav.network === 'online' ? 'success' : 'warning'}
          />
          <StatusBadge
            icon={<MapPin size={12} />}
            label={gpsLabel(nav.gpsStatus)}
            tone={nav.gpsStatus === 'found' ? 'success' : nav.gpsStatus === 'weak' || nav.gpsStatus === 'stale' ? 'warning' : 'error'}
          />
        </div>
      </header>

      {needsSetup ? (
        <NeedsSetup onSetup={() => setShowHomeSetup(true)} gpsStatus={nav.gpsStatus} />
      ) : isOffCoverage && !hasRoute ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-5 py-3 text-sm text-warning">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{nav.routeError ?? 'Outside offline coverage. Showing fallback navigation.'}</span>
          </div>
          {showCompass ? <CompassFallback /> : <EmergencyFallback onSetupHome={() => setShowHomeSetup(true)} />}
          <div className="flex justify-center gap-3 p-4">
            <button
              onClick={() => setShowCompass(!showCompass)}
              className="flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <Compass size={16} /> {showCompass ? 'Show coordinates' : 'Show compass'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Map */}
          <div className="relative flex-1 overflow-hidden bg-black">
            <CanvasMap
              regions={nav.regions}
              route={nav.route}
              gpsFix={nav.snappedFix ?? nav.gpsFix}
              home={nav.home}
              destination={nav.destination}
              savedPlaces={nav.savedPlaces}
              recenterSignal={nav.recenterSignal}
              followMode={nav.followMode}
              rotation={0}
              onTap={(lat, lng) => {
                nav.setDestination({ lat, lng, label: 'Dropped pin' });
              }}
              onLongPress={(lat, lng) => {
                nav.setDestination({ lat, lng, label: 'Dropped pin' });
              }}
            />

            {/* Floating controls */}
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              <button
                onClick={nav.recenter}
                className={`flex h-10 w-10 items-center justify-center rounded-full shadow-float transition-all active:scale-95 ${
                  nav.followMode ? 'bg-accent-300 text-white' : 'bg-surface-raised text-ink hover:bg-surface-subtle'
                }`}
                aria-label="Recenter"
              >
                <LocateFixed size={18} />
              </button>
              <button
                onClick={() => setShowOfflineMaps(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-ink shadow-float transition-all hover:bg-surface-subtle active:scale-95"
                aria-label="Offline maps"
              >
                <Layers size={18} />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-ink shadow-float transition-all hover:bg-surface-subtle active:scale-95"
                aria-label="Route settings"
              >
                <Settings2 size={18} />
              </button>
            </div>

            {/* Recalculating overlay */}
            {nav.phase === 'recalculating' && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-raised px-6 py-4 shadow-float">
                <div className="flex items-center gap-2 text-sm font-medium text-accent-600">
                  <RefreshCw size={16} className="animate-spin" />
                  RECALCULATING…
                </div>
              </div>
            )}

            {/* Speed indicator (while navigating) */}
            {isNavigating && nav.currentSpeed > 0 && (
              <div className="absolute left-3 top-3 rounded-2xl bg-surface-raised/90 px-3 py-2 shadow-float backdrop-blur-sm">
                <div className="flex items-center gap-1.5">
                  <Gauge size={14} className="text-accent-400" />
                  <span className="text-lg font-bold text-ink">{Math.round(nav.currentSpeed)}</span>
                  <span className="text-xs text-ink-faint">km/h</span>
                </div>
              </div>
            )}

            {/* OSM attribution */}
            <div className="absolute bottom-1 right-2 text-[10px] text-white/60">
              © OpenStreetMap contributors
            </div>
          </div>

          {/* From/To selection bar (when not navigating) */}
          {!isNavigating && !hasRoute && (
            <div className="border-t border-line bg-surface-raised px-4 py-3">
              <div className="flex items-center gap-2">
                {/* From */}
                <button
                  onClick={() => setShowRouteSearch('from')}
                  className="flex flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-accent-300"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100">
                    <div className="h-2 w-2 rounded-full bg-accent-400" />
                  </div>
                  <span className="truncate text-ink-muted">
                    {nav.gpsFix ? 'Current location' : 'Starting point'}
                  </span>
                </button>

                {/* Swap */}
                <button
                  onClick={nav.swapEndpoints}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink active:scale-90"
                  aria-label="Swap endpoints"
                >
                  <ArrowUpDown size={15} />
                </button>

                {/* To */}
                <button
                  onClick={() => setShowRouteSearch('to')}
                  className="flex flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-accent-300"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100">
                    <Navigation size={12} className="text-accent-400" />
                  </div>
                  <span className="truncate text-ink-muted">
                    {nav.destination?.label ?? nav.home?.label ?? 'Choose destination'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Partial route indicator */}
          {hasRoute && nav.route?.partial && (
            <div className="flex items-center gap-2.5 border-t border-warning/20 bg-warning/5 px-4 py-2.5 text-xs text-warning">
              <Info size={14} className="shrink-0" />
              <span>
                {nav.route.partial.reason === 'no-road-path'
                  ? `Continue ${nav.route.partial.cardinal} for ${formatDistance(nav.route.partial.remainingStraightMeters)} to reach destination.`
                  : `Mapped route ends here. Continue ${nav.route.partial.cardinal} for ${formatDistance(nav.route.partial.remainingStraightMeters)} to reach destination.`}
              </span>
            </div>
          )}

          {/* Instruction bar */}
          {hasRoute && nav.phase !== 'locating' && nav.phase !== 'calculating' && (
            <InstructionBar nav={nav} />
          )}

          {/* Calculating */}
          {(nav.phase === 'locating' || nav.phase === 'calculating') && (
            <div className="flex items-center justify-center gap-2 border-t border-line bg-surface-raised px-6 py-5 text-sm font-medium text-accent-600">
              <Loader2 size={16} className="animate-spin" />
              {nav.phase === 'locating' ? 'LOCATING YOU…' : 'CALCULATING ROUTE…'}
            </div>
          )}

          {/* Travel mode + quick destinations (when idle) */}
          {(nav.phase === 'idle' || nav.phase === 'arrived') && (
            <div className="border-t border-line bg-surface-raised px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Travel mode</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['drive', 'walk', 'bike'] as TravelMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => nav.setTravelMode(m)}
                    className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-medium transition-all ${
                      nav.travelMode === m
                        ? 'border-accent-300 bg-accent-50/40 text-accent-600'
                        : 'border-line text-ink-muted hover:bg-surface-subtle'
                    }`}
                  >
                    {m === 'walk' && <Footprints size={16} />}
                    {m === 'drive' && <Car size={16} />}
                    {m === 'bike' && <Bike size={16} />}
                    {m === 'walk' ? 'Walk' : m === 'drive' ? 'Drive' : 'Bike'}
                  </button>
                ))}
              </div>

              {/* Quick destination chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                <QuickChip
                  icon={<Home size={13} />}
                  label="Home"
                  onClick={() => {
                    if (nav.home) {
                      nav.setDestination({ lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label });
                      void nav.startNavigation({ lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label });
                    }
                  }}
                />
                {nav.savedPlaces
                  .filter((p) => p.type === 'work' || p.type === 'favorite')
                  .slice(0, 3)
                  .map((p) => (
                    <QuickChip
                      key={p.id}
                      icon={p.type === 'work' ? <Briefcase size={13} /> : <Star size={13} />}
                      label={p.label}
                      onClick={() => {
                        nav.setDestination({ lat: p.latitude, lng: p.longitude, label: p.label });
                        void nav.startNavigation({ lat: p.latitude, lng: p.longitude, label: p.label });
                      }}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Bottom action bar */}
          <div className="flex items-center gap-3 border-t border-line bg-surface-raised px-5 py-4 safe-bottom">
            {isNavigating ? (
              <button
                onClick={nav.stopNavigation}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-error px-6 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-95"
              >
                <Square size={16} fill="currentColor" />END NAVIGATION
              </button>
            ) : (
              <button
                onClick={() => {
                  const dest = nav.destination ?? (nav.home ? { lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label } : null);
                  if (dest) void nav.startNavigation(dest);
                }}
                disabled={nav.installing}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-300 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95 disabled:opacity-50"
              >
                <Navigation size={18} fill="currentColor" />
                {nav.route ? 'RESUME' : 'START NAVIGATION'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Overlays */}
      {showOfflineMaps && <OfflineMapsPanel onClose={() => setShowOfflineMaps(false)} />}
      {showHomeSetup && <HomeSetup onClose={() => setShowHomeSetup(false)} onProceed={() => setShowHomeSetup(false)} />}
      {typeof showRouteSearch === 'string' && (
        <RouteSearchPanel mode={showRouteSearch} onClose={() => setShowRouteSearch(null)} />
      )}
      {showSettings && <RouteSettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function NeedsSetup({ onSetup, gpsStatus }: { onSetup: () => void; gpsStatus: string }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center p-6">
      <Tulip size={28} className="absolute left-[15%] bottom-[18%] -rotate-12 text-accent-200 opacity-50" />
      <Tulip size={22} className="absolute right-[18%] bottom-[20%] rotate-12 text-accent-200 opacity-40" />
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-500">
        <Home size={36} />
      </div>
      <p className="mt-5 text-xl font-semibold text-ink">Set Your Home</p>
      <p className="mt-2 max-w-xs text-center text-sm text-ink-faint">
        Set your home location to enable offline navigation.
      </p>
      <button
        onClick={onSetup}
        className="mt-6 flex items-center gap-2 rounded-full bg-accent-300 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95"
      >
        <MapPin size={18} /> Set home location
      </button>
      {gpsStatus === 'denied' && (
        <p className="mt-4 max-w-xs text-center text-xs text-error">
          Location permission denied. Enable location access in your browser settings.
        </p>
      )}
    </div>
  );
}

function QuickChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-all hover:border-accent-300 hover:text-ink active:scale-95"
    >
      {icon}
      {label}
    </button>
  );
}

function InstructionBar({ nav }: { nav: ReturnType<typeof useNav> }) {
  if (!nav.route || nav.route.instructions.length === 0) return null;
  const idx = Math.min(nav.nextInstructionIndex, nav.route.instructions.length - 1);
  const instr = nav.route.instructions[idx];
  const nextInstr = nav.route.instructions[idx + 1];

  return (
    <div className="border-t border-line bg-surface-raised px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-500">
          <TurnIcon type={instr.type} />
        </div>
        <div className="min-w-0 flex-1">
          {instr.type === 'arrive' ? (
            <p className="text-lg font-semibold text-ink">Arriving at {nav.destination?.label ?? nav.home?.label}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink-faint">
                {formatDistance(instr.distanceMeters)} · then
              </p>
              <p className="text-lg font-semibold leading-tight text-ink">
                {instructionText(instr.type, instr.roadName)}
              </p>
            </>
          )}
          {nextInstr && nextInstr.type !== 'arrive' && (
            <p className="mt-0.5 text-xs text-ink-faint">
              Then {formatDistance(nextInstr.distanceMeters)}: {instructionText(nextInstr.type, nextInstr.roadName)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-ink">{formatDistance(nav.remainingDistance)}</p>
          <p className="text-xs text-ink-faint">{formatDuration(nav.remainingDuration)}</p>
        </div>
      </div>
    </div>
  );
}

function RouteSettingsPanel({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-slide-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="font-display text-xl text-ink">Route Options</h2>
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Route Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {(['fastest', 'shortest'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => nav.setRoutingPrefs({ routeType: t })}
                  className={`rounded-2xl border py-3 text-sm font-medium capitalize transition-all ${
                    nav.routingPrefs.routeType === t
                      ? 'border-accent-300 bg-accent-50/40 text-accent-600'
                      : 'border-line text-ink-muted hover:bg-surface-subtle'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Avoid</h3>
            <label className="flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-4">
              <span className="text-sm font-medium text-ink">Highways</span>
              <Switch checked={nav.routingPrefs.avoidHighways} onChange={(v) => nav.setRoutingPrefs({ avoidHighways: v })} />
            </label>
            <label className="mt-2.5 flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-4">
              <span className="text-sm font-medium text-ink">Tolls</span>
              <Switch checked={nav.routingPrefs.avoidTolls} onChange={(v) => nav.setRoutingPrefs({ avoidTolls: v })} />
            </label>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Auto-Cache</h3>
            <label className="flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-4">
              <div>
                <p className="text-sm font-medium text-ink">Smart Caching</p>
                <p className="mt-0.5 text-xs text-ink-faint">Auto-download roads you travel on</p>
              </div>
              <Switch checked={nav.autoCacheEnabled} onChange={nav.setAutoCache} />
            </label>
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
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent-300' : 'bg-line-strong'}`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function statusLabel(nav: ReturnType<typeof useNav>): string {
  switch (nav.phase) {
    case 'idle': return 'Ready to navigate';
    case 'locating': return 'Locating you…';
    case 'calculating': return 'Calculating route…';
    case 'navigating': return `${nav.regions.length} offline area${nav.regions.length !== 1 ? 's' : ''} · ${nav.savedPlaces.length} saved`;
    case 'recalculating': return 'Recalculating route…';
    case 'off-coverage': return 'Outside offline coverage';
    case 'arrived': return 'You have arrived';
    default: return '';
  }
}

function gpsLabel(status: string): string {
  switch (status) {
    case 'found': return 'GPS OK';
    case 'locating': return 'LOCATING…';
    case 'weak': return 'GPS WEAK';
    case 'stale': return 'GPS STALE';
    case 'denied': return 'GPS DENIED';
    case 'unavailable': return 'NO GPS';
    default: return 'GPS OFF';
  }
}

function instructionText(type: InstructionType, roadName: string): string {
  const name = roadName || 'the road';
  switch (type) {
    case 'depart': return `Head out on ${name}`;
    case 'turn-left': return `Turn left onto ${name}`;
    case 'turn-right': return `Turn right onto ${name}`;
    case 'slight-left': return `Slight left onto ${name}`;
    case 'slight-right': return `Slight right onto ${name}`;
    case 'sharp-left': return `Sharp left onto ${name}`;
    case 'sharp-right': return `Sharp right onto ${name}`;
    case 'straight': return `Continue on ${name}`;
    case 'uturn': return `U-turn onto ${name}`;
    case 'arrive': return `Arrive at ${name}`;
    default: return `Continue on ${name}`;
  }
}

function TurnIcon({ type }: { type: InstructionType }) {
  const size = 28;
  switch (type) {
    case 'turn-left': return <Navigation size={size} style={{ transform: 'rotate(-90deg)' }} />;
    case 'turn-right': return <Navigation size={size} style={{ transform: 'rotate(90deg)' }} />;
    case 'slight-left': return <Navigation size={size} style={{ transform: 'rotate(-45deg)' }} />;
    case 'slight-right': return <Navigation size={size} style={{ transform: 'rotate(45deg)' }} />;
    case 'sharp-left': return <Navigation size={size} style={{ transform: 'rotate(-135deg)' }} />;
    case 'sharp-right': return <Navigation size={size} style={{ transform: 'rotate(135deg)' }} />;
    case 'uturn': return <RefreshCw size={size} />;
    case 'arrive': return <Home size={size} />;
    case 'depart': return <Navigation size={size} />;
    default: return <Navigation size={size} />;
  }
}

function StatusBadge({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: 'success' | 'warning' | 'error' }) {
  const tones = {
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    error: 'bg-error/15 text-error',
  };
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tones[tone]}`}>
      {icon}
      {label}
    </span>
  );
}
