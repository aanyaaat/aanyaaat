import { useState } from 'react';
import {
  X,
  MapPin,
  Download,
  Trash2,
  Loader2,
  HardDrive,
  Check,
  AlertCircle,
  Home,
  Clock,
  WifiOff,
  Wifi,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { estimateRegionSizeBytes, formatBytes } from '@/navigation/offline/regions';
import type { RegionPresetKm } from '@/navigation/domain/types';

const PRESETS: RegionPresetKm[] = [5, 10, 20, 30];

export function OfflineMapsPanel({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [selectedRadius, setSelectedRadius] = useState<RegionPresetKm>(10);

  const installedSize = nav.region ? formatBytes(nav.region.sizeBytes) : null;
  const estimatedSize = formatBytes(estimateRegionSizeBytes(selectedRadius));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-line bg-surface shadow-float animate-scale-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <MapPin size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Offline Maps</h2>
              <p className="text-[11px] text-ink-faint">Road + routing data for your home area</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {nav.routeError && (
            <div className="flex items-center gap-2 rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
              <AlertCircle size={16} className="shrink-0" />
              <span>{nav.routeError}</span>
            </div>
          )}

          {/* Installed region */}
          {nav.region ? (
            <div className="rounded-3xl border border-accent-300/40 bg-accent-50/30 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-success">
                <Check size={16} />
                Offline map installed
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-ink-muted"><Home size={13} /> Area</span>
                  <span className="font-medium text-ink">{nav.region.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-ink-muted"><HardDrive size={13} /> Map + routing data</span>
                  <span className="font-medium text-ink">{installedSize}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-ink-muted"><Clock size={13} /> Last updated</span>
                  <span className="font-medium text-ink">{new Date(nav.region.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-ink-muted"><MapPin size={13} /> Roads</span>
                  <span className="font-medium text-ink">{nav.region.roads.length.toLocaleString()}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => nav.installOfflineRegion(nav.region!.radiusKm as RegionPresetKm)}
                  disabled={nav.installing}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:opacity-50"
                >
                  {nav.installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Update
                </button>
                <button
                  onClick={nav.removeOfflineRegion}
                  disabled={nav.installing}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-error/30 px-4 py-2.5 text-sm text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                Download a small area around your home. This includes roads, routing data, and key landmarks (hospitals, police, stations). Once downloaded, navigation works fully offline.
              </p>

              {/* Radius selection */}
              <div>
                <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Home Safety Area</label>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((km) => (
                    <button
                      key={km}
                      onClick={() => setSelectedRadius(km)}
                      className={`rounded-2xl border p-4 text-center transition-all ${
                        selectedRadius === km
                          ? 'border-accent-300 bg-accent-50/40 shadow-card'
                          : 'border-line bg-surface-raised hover:border-line-strong'
                      }`}
                    >
                      <span className={`block text-lg font-semibold ${selectedRadius === km ? 'text-accent-600' : 'text-ink'}`}>{km}</span>
                      <span className="text-[11px] text-ink-faint">km</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Size estimate */}
              <div className="rounded-3xl border border-line bg-surface-raised p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-ink-muted">
                    <HardDrive size={15} /> Estimated storage
                  </span>
                  <span className="font-mono text-lg font-semibold text-ink">{estimatedSize}</span>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Actual size may vary based on road density. The download fetches road network data from OpenStreetMap (© OSM contributors, ODbL).
                </p>
              </div>

              {!nav.home && (
                <div className="flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                  <AlertCircle size={16} className="shrink-0" />
                  Set your home location first before downloading an offline area.
                </div>
              )}
            </>
          )}

          {/* Install progress */}
          {nav.installing && nav.installProgress && (
            <div className="rounded-3xl border border-accent-300/40 bg-accent-50/30 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-accent-600">
                <Loader2 size={16} className="animate-spin" />
                {nav.installProgress}
              </div>
            </div>
          )}

          {/* Download button */}
          {!nav.region && (
            <button
              onClick={() => nav.installOfflineRegion(selectedRadius)}
              disabled={nav.installing || !nav.home}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent-300 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint"
            >
              {nav.installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {nav.installing ? 'Downloading…' : `Download ${selectedRadius} km area`}
            </button>
          )}

          {/* Network status */}
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-subtle/50 px-4 py-3 text-xs text-ink-faint">
            {nav.network === 'online' ? <Wifi size={14} className="text-success" /> : <WifiOff size={14} className="text-warning" />}
            {nav.network === 'online' ? 'Online — download available' : 'Offline — connect to internet to download maps'}
          </div>
        </div>
      </div>
    </div>
  );
}
