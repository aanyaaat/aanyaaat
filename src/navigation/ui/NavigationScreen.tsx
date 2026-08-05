import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { CanvasMap } from '@/navigation/maps/CanvasMap';
import { CompassFallback } from '@/navigation/ui/CompassFallback';
import { EmergencyFallback } from '@/navigation/ui/EmergencyFallback';
import { OfflineMapsPanel } from '@/navigation/ui/OfflineMapsPanel';
import { HomeSetup } from '@/navigation/ui/HomeSetup';
import { Tulip } from '@/ui/components/Tulip';
import { formatDistance, formatDuration } from '@/navigation/gps/gps';
import type { TravelMode, InstructionType } from '@/navigation/domain/types';

export function NavigationScreen({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [showOfflineMaps, setShowOfflineMaps] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);

  const needsSetup = !nav.home;
  const hasRoute = nav.route !== null;
  const isOffCoverage = nav.phase === 'off-coverage';

  // Auto-start GPS when the screen opens
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
              <Home size={16} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink">GET ME HOME</h1>
              <p className="text-[11px] leading-tight text-ink-faint">{statusLabel(nav)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {nav.home && (
            <button
              onClick={() => setShowHomeSetup(true)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted transition-all hover:border-accent-300 hover:bg-surface-subtle hover:text-ink active:scale-95"
              title="Change or reset your home location"
            >
              <Pencil size={12} />
              <span className="hidden sm:inline max-w-[120px] truncate">{nav.home.label}</span>
              <span className="sm:hidden">Change</span>
            </button>
          )}
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

      {/* Needs home setup */}
      {needsSetup ? (
        <div className="relative flex flex-1 flex-col items-center justify-center p-6">
          <Tulip size={28} className="absolute left-[15%] bottom-[18%] -rotate-12 text-accent-200 opacity-50" />
          <Tulip size={22} className="absolute right-[18%] bottom-[20%] rotate-12 text-accent-200 opacity-40" />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-500">
            <Home size={36} />
          </div>
          <p className="mt-5 text-xl font-semibold text-ink">Set Your Home</p>
          <p className="mt-2 max-w-xs text-center text-sm text-ink-faint">
            GET ME HOME needs to know where home is before it can navigate you there.
          </p>
          <button
            onClick={() => setShowHomeSetup(true)}
            className="mt-6 flex items-center gap-2 rounded-full bg-accent-300 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95"
          >
            <MapPin size={18} /> Set home location
          </button>
          {nav.gpsStatus === 'denied' && (
            <p className="mt-4 max-w-xs text-center text-xs text-error">
              Location permission was denied. Enable location access in your browser settings to use GPS navigation.
            </p>
          )}
          {nav.gpsStatus === 'unavailable' && (
            <p className="mt-4 max-w-xs text-center text-xs text-warning">
              GPS is unavailable on this device. You can still set home manually by entering coordinates.
            </p>
          )}
        </div>
      ) : isOffCoverage ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Off-coverage: show emergency fallback + compass */}
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-5 py-3 text-sm text-warning">
            <AlertTriangle size={16} className="shrink-0" />
            <span>Offline map doesn't cover your current location. Showing fallback navigation.</span>
          </div>
          {showCompass ? <CompassFallback /> : <EmergencyFallback onSetupHome={() => {}} />}
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
              region={nav.region}
              route={nav.route}
              gpsFix={nav.gpsFix}
              home={nav.home}
              recenterSignal={nav.recenterSignal}
            />

            {/* Map overlay controls */}
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              <button
                onClick={nav.recenter}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-ink shadow-float transition-all hover:bg-surface-subtle active:scale-95"
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

            {/* OSM attribution */}
            <div className="absolute bottom-1 right-2 text-[10px] text-white/60">
              © OpenStreetMap contributors
            </div>
          </div>

          {/* Partial route indicator */}
          {hasRoute && nav.route?.partial && (
            <div className="flex items-center gap-2.5 border-t border-warning/20 bg-warning/5 px-4 py-2.5 text-xs text-warning">
              <Info size={14} className="shrink-0" />
              <span>
                Mapped route ends here. Continue {nav.route.partial.cardinal} for{' '}
                {formatDistance(nav.route.partial.remainingStraightMeters)} to reach home.
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

          {/* Travel mode selector */}
          {nav.phase === 'idle' || nav.phase === 'arrived' ? (
            <div className="border-t border-line bg-surface-raised px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Travel mode</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['walk', 'drive', 'bike'] as TravelMode[]).map((m) => (
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
            </div>
          ) : null}

          {/* Bottom action bar */}
          <div className="flex items-center gap-3 border-t border-line bg-surface-raised px-5 py-4 safe-bottom">
            {nav.phase === 'navigating' || nav.phase === 'recalculating' ? (
              <button
                onClick={nav.stopNavigation}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-error px-6 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-95"
              >
                <Square size={16} fill="currentColor" /> END ROUTE
              </button>
            ) : (
              <button
                onClick={nav.startNavigation}
                disabled={nav.installing}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-300 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95 disabled:opacity-50"
              >
                <Navigation size={18} fill="currentColor" />
                {nav.route ? 'RESUME' : 'GET ME HOME'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Offline maps sub-panel */}
      {showOfflineMaps && (
        <OfflineMapsOverlay onClose={() => setShowOfflineMaps(false)} />
      )}

      {/* Home setup sub-panel */}
      {showHomeSetup && (
        <HomeSetup
          onClose={() => setShowHomeSetup(false)}
          onProceed={() => setShowHomeSetup(false)}
        />
      )}
    </div>
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
        {/* Turn icon */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-500">
          <TurnIcon type={instr.type} />
        </div>
        {/* Instruction text */}
        <div className="min-w-0 flex-1">
          {instr.type === 'arrive' ? (
            <p className="text-lg font-semibold text-ink">Arriving at {nav.home?.label}</p>
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
        {/* Distance + ETA */}
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-ink">{formatDistance(nav.remainingDistance)}</p>
          <p className="text-xs text-ink-faint">{formatDuration(nav.route.durationSeconds)}</p>
        </div>
      </div>
    </div>
  );
}

function OfflineMapsOverlay({ onClose }: { onClose: () => void }) {
  return <OfflineMapsPanel onClose={onClose} />;
}

function statusLabel(nav: ReturnType<typeof useNav>): string {
  switch (nav.phase) {
    case 'idle': return 'Ready to navigate';
    case 'locating': return 'Locating you…';
    case 'calculating': return 'Calculating route…';
    case 'navigating': return 'Navigation active';
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
