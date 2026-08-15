import { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Download,
  Trash2,
  Loader2,
  HardDrive,
  Check,
  AlertCircle,
  Clock,
  WifiOff,
  Wifi,
  Plus,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { estimateRegionSizeBytes, formatBytes, getStorageEstimate } from '@/navigation/offline/regions';
import { resolveHumanAreaDetails, type HumanAreaInfo } from '@/navigation/search/placeSearch';
import type { RegionPresetKm } from '@/navigation/domain/types';

const PRESETS: RegionPresetKm[] = [10, 20, 30];

export function OfflineMapsPanel({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [selectedRadius, setSelectedRadius] = useState<RegionPresetKm>(30);
  const [showDownloadForm, setShowDownloadForm] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number; free: number } | null>(null);
  const [humanDetails, setHumanDetails] = useState<Record<string, HumanAreaInfo>>({});

  useEffect(() => {
    void getStorageEstimate().then(setStorageInfo);
  }, [nav.regions]);

  useEffect(() => {
    nav.regions.forEach((r) => {
      if (!humanDetails[r.id]) {
        void resolveHumanAreaDetails(r.centerLat, r.centerLng, r.radiusKm).then((info) => {
          setHumanDetails((prev) => ({ ...prev, [r.id]: info }));
        });
      }
    });
  }, [nav.regions]);

  const totalSize = nav.regions.reduce((sum, r) => sum + r.sizeBytes, 0);
  const estimatedSizeBytes = estimateRegionSizeBytes(selectedRadius);
  const estimatedSizeFormatted = formatBytes(estimatedSizeBytes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" data-testid="offline-maps-panel">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-line bg-surface shadow-float animate-scale-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <MapPin size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Offline Maps</h2>
              <p className="text-[11px] text-ink-faint">
                {nav.regions.length} region{nav.regions.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
              </p>
            </div>
          </div>
          <button onClick={onClose} data-testid="close-offline-panel-btn" className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {storageInfo && (
            <div className="rounded-2xl border border-line bg-surface-subtle p-3.5 text-xs text-ink-muted" data-testid="storage-estimate-box">
              <div className="flex justify-between font-medium">
                <span>Storage Usage</span>
                <span>{formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent-500"
                  style={{ width: `${Math.min(100, (storageInfo.usage / storageInfo.quota) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {nav.routeError && (
            <div className="flex items-center gap-2 rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error" data-testid="offline-panel-error">
              <AlertCircle size={16} className="shrink-0" />
              <span>{nav.routeError.message}</span>
            </div>
          )}

          {/* Download progress banner */}
          {nav.installing && nav.downloadProgress && (
            <div className="rounded-3xl border border-accent-300/60 bg-accent-50/40 p-5 shadow-xs animate-fade-in" data-testid="download-progress-card">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent-700">
                <Loader2 size={16} className="animate-spin text-accent-500" />
                {nav.downloadProgress.message}
              </div>
              {nav.downloadProgress.totalBytes && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-all duration-300"
                    style={{ width: `${nav.downloadProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Installed region summaries */}
          {nav.regions.length > 0 && (
            <div className="space-y-3.5" data-testid="installed-regions-list">
              {nav.regions.map((r) => {
                const info = humanDetails[r.id];
                const areaTitle = r.placeName && !r.label.startsWith('Local Area')
                  ? r.label
                  : info?.title || r.label;
                const areaSubtitle = r.placeName || info?.subtitle || 'Regional Street & Highway Network';
                const keyAreas = r.keyAreas && r.keyAreas.length > 0
                  ? r.keyAreas
                  : info?.keyAreas || [];

                return (
                  <div
                    key={r.id}
                    className="rounded-3xl border border-line bg-surface-raised p-5 shadow-xs transition-all hover:border-accent-400"
                    data-testid={`region-card-${r.id}`}
                  >
                    <div className="mb-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-ink">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                            <Check size={13} />
                          </span>
                          <span className="truncate">{areaTitle}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-accent-600 dark:text-accent-400">
                          {areaSubtitle}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {r.radiusKm} km radius full-coverage offline area
                        </p>
                      </div>

                      {/* Always clickable delete button */}
                      <button
                        onClick={() => nav.removeOfflineRegion(r.id)}
                        data-testid={`delete-region-${r.id}`}
                        className="flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50/80 px-3.5 py-1.5 text-xs font-bold text-red-600 transition-all hover:bg-red-600 hover:text-white dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 active:scale-95 shadow-xs"
                        title="Delete this downloaded map"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>

                    {/* Key Area Tags */}
                    {keyAreas.length > 0 && (
                      <div className="mb-3.5 flex flex-wrap gap-1.5 pt-1.5">
                        {keyAreas.slice(0, 6).map((area, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-line bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 border-t border-line/60 pt-3 text-xs">
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <HardDrive size={13} className="text-accent-500" />
                        <span>{formatBytes(r.sizeBytes)} (Compressed)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <MapPin size={13} className="text-emerald-500" />
                        <span>{r.roadCount?.toLocaleString() || 0} roads mapped</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <Clock size={13} className="text-ink-faint" />
                        <span>{new Date(r.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <Gauge size={13} className="text-amber-500" />
                        <span>{r.radiusKm} km radius</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <Sparkles size={13} />
                      <span>Ready for Instant Offline Routing · Auto-decompressed on demand</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Download form */}
          {showDownloadForm ? (
            <div className="space-y-4 rounded-3xl border border-line bg-surface-subtle p-5" data-testid="download-region-form">
              <div>
                <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-ink-muted">Choose Area Coverage Size</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRESETS.map((km) => (
                    <button
                      key={km}
                      onClick={() => setSelectedRadius(km)}
                      data-testid={`preset-radius-${km}`}
                      className={`rounded-2xl border p-4 text-center transition-all ${
                        selectedRadius === km
                          ? 'border-accent-500 bg-accent-500 text-white shadow-md'
                          : 'border-line bg-surface text-ink hover:border-line-strong'
                      }`}
                    >
                      <span className={`block text-xl font-bold ${selectedRadius === km ? 'text-white' : 'text-ink'}`}>{km}</span>
                      <span className={`text-[11px] ${selectedRadius === km ? 'text-white/90' : 'text-ink-faint'}`}>km radius</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                    <HardDrive size={15} className="text-accent-500" /> Estimated Storage Size
                  </span>
                  <span className="font-mono text-sm font-bold text-ink">{estimatedSizeFormatted}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  Downloads full vector road network with lossless stream compression.
                </p>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    const center = nav.gpsFix ? { lat: nav.gpsFix.latitude, lng: nav.gpsFix.longitude } : nav.destination ? { lat: nav.destination.lat, lng: nav.destination.lng } : nav.home ? { lat: nav.home.latitude, lng: nav.home.longitude } : { lat: 28.6139, lng: 77.2090 };
                    void nav.installOfflineRegion(selectedRadius, `Area · ${selectedRadius}km`, center);
                    setShowDownloadForm(false);
                  }}
                  disabled={nav.network === 'offline'}
                  data-testid="start-download-btn"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent-500 px-6 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-accent-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint"
                >
                  <Download size={16} />
                  <span>Download {selectedRadius}km Region</span>
                </button>
                <button
                  onClick={() => setShowDownloadForm(false)}
                  data-testid="cancel-download-form-btn"
                  className="rounded-2xl border border-line bg-surface px-5 py-3.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDownloadForm(true)}
              data-testid="add-new-area-btn"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-400/80 bg-accent-50/10 py-4 text-sm font-bold text-accent-600 transition-all hover:border-accent-500 hover:bg-accent-50/20 active:scale-98"
            >
              <Plus size={18} /> Add new region area
            </button>
          )}

          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-subtle/50 px-4 py-3 text-xs text-ink-faint" data-testid="network-status-badge">
            {nav.network === 'online' ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-amber-500" />}
            <span>{nav.network === 'online' ? 'Online — downloads available' : 'Offline — connect to internet to download'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
