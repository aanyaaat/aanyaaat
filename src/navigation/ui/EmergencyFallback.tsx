import { useState } from 'react';
import {
  Copy,
  Check,
  Share2,
  MapPin,
  Phone,
  Home,
  Navigation,
  AlertTriangle,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { haversineMeters, bearingDeg, cardinalFromBearing, formatDistance } from '@/navigation/gps/gps';

/**
 * Emergency fallback screen — works even when routing and maps fail.
 * Shows coordinates, straight-line distance, bearing, and share/copy/emergency actions.
 */
export function EmergencyFallback({ onSetupHome }: { onSetupHome: () => void }) {
  const nav = useNav();
  const [copied, setCopied] = useState<string | null>(null);

  if (!nav.gpsFix) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/15 text-warning">
          <AlertTriangle size={28} />
        </div>
        <p className="mt-4 text-lg font-medium text-ink">Waiting for GPS…</p>
        <p className="mt-2 text-sm text-ink-faint">Go outside for a clearer signal.</p>
      </div>
    );
  }

  if (!nav.home) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-100 text-accent-500">
          <Home size={28} />
        </div>
        <p className="mt-4 text-lg font-medium text-ink">No home set</p>
        <p className="mt-2 text-sm text-ink-faint">Set your home location to enable navigation.</p>
        <button
          onClick={onSetupHome}
          className="mt-5 flex items-center gap-2 rounded-full bg-accent-300 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-accent-400 active:scale-95"
        >
          <MapPin size={16} /> Set home
        </button>
      </div>
    );
  }

  const distance = haversineMeters(
    nav.gpsFix.latitude,
    nav.gpsFix.longitude,
    nav.home.latitude,
    nav.home.longitude,
  );
  const bearing = bearingDeg(
    nav.gpsFix.latitude,
    nav.gpsFix.longitude,
    nav.home.latitude,
    nav.home.longitude,
  );
  const cardinal = cardinalFromBearing(bearing);

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const share = async () => {
    const text = `My location: ${nav.gpsFix!.latitude.toFixed(6)}, ${nav.gpsFix!.longitude.toFixed(6)} (±${Math.round(nav.gpsFix!.accuracy)}m). Heading to ${nav.home!.label}.`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* user cancelled */
      }
    } else {
      copy(text, 'share');
    }
  };

  const openInMapsApp = () => {
    const url = `geo:${nav.gpsFix!.latitude},${nav.gpsFix!.longitude}?q=${nav.gpsFix!.latitude},${nav.gpsFix!.longitude}`;
    window.open(url, '_blank');
  };

  const callEmergency = () => {
    window.location.href = 'tel:112';
  };

  return (
    <div className="space-y-5 p-6">
      {/* Location */}
      <div className="rounded-3xl border border-line bg-surface-raised p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <MapPin size={16} className="text-accent-400" /> Your Location
        </div>
        <div className="space-y-1 font-mono text-sm text-ink-muted">
          <div className="flex items-center justify-between">
            <span>Lat</span>
            <span>{nav.gpsFix.latitude.toFixed(6)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Lng</span>
            <span>{nav.gpsFix.longitude.toFixed(6)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Accuracy</span>
            <span>±{Math.round(nav.gpsFix.accuracy)} m</span>
          </div>
        </div>
        <button
          onClick={() => copy(`${nav.gpsFix!.latitude}, ${nav.gpsFix!.longitude}`, 'loc')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        >
          {copied === 'loc' ? <Check size={14} /> : <Copy size={14} />}
          {copied === 'loc' ? 'Copied' : 'Copy my location'}
        </button>
      </div>

      {/* Home */}
      <div className="rounded-3xl border border-line bg-surface-raised p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <Home size={16} className="text-accent-400" /> {nav.home.label}
        </div>
        <div className="space-y-1 font-mono text-sm text-ink-muted">
          <div className="flex items-center justify-between">
            <span>Lat</span>
            <span>{nav.home.latitude.toFixed(6)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Lng</span>
            <span>{nav.home.longitude.toFixed(6)}</span>
          </div>
        </div>
        <button
          onClick={() => copy(`${nav.home!.latitude}, ${nav.home!.longitude}`, 'home')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        >
          {copied === 'home' ? <Check size={14} /> : <Copy size={14} />}
          {copied === 'home' ? 'Copied' : 'Copy home location'}
        </button>
      </div>

      {/* Distance + direction */}
      <div className="rounded-3xl border border-accent-300/40 bg-accent-50/30 p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Straight-line to home</p>
        <p className="mt-2 text-3xl font-semibold text-accent-600">{formatDistance(distance)}</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-lg font-medium text-ink">
          <Navigation size={18} className="text-accent-400" style={{ transform: `rotate(${bearing}deg)` }} />
          {cardinal}
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={share}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent-200 px-4 py-3.5 text-sm font-medium text-accent-700 transition-all hover:bg-accent-300 active:scale-95"
        >
          <Share2 size={16} /> Share location
        </button>
        <button
          onClick={openInMapsApp}
          className="flex items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        >
          <MapPin size={16} /> Open in maps app
        </button>
      </div>

      <button
        onClick={callEmergency}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-error px-4 py-4 text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-95"
      >
        <Phone size={18} /> Call emergency (112)
      </button>
    </div>
  );
}
