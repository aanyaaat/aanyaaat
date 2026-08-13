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
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { estimateRegionSizeBytes, formatBytes, getStorageEstimate } from '@/navigation/offline/regions';
import type { RegionPresetKm } from '@/navigation/domain/types';

const PRESETS: RegionPresetKm[] = [5, 10, 20];

export function OfflineMapsPanel({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [selectedRadius, setSelectedRadius] = useState<RegionPresetKm>(10);
  const [showDownloadForm, setShowDownloadForm] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number; free: number } | null>(null);

  useEffect(() => {
    void getStorageEstimate().then(setStorageInfo);
  }, [nav.regions]);

  const totalSize = nav.regions.reduce((sum, r) => sum + r.sizeBytes, 0);
  const estimatedSizeBytes = estimateRegionSizeBytes(selectedRadius);
  const estimatedSizeFormatted = formatBytes(estimatedSizeBytes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" data-testid="offline-maps-panel">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-line bg-surface shadow-float animate-scale-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <MapPin size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Offline Maps</h2>
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

          {/* Download progress */}
          {nav.installing && nav.downloadProgress && (
            <div className="rounded-3xl border border-accent-300/40 bg-accent-50/30 p-5" data-testid="download-progress-card">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent-600">
                <Loader2 size={16} className="animate-spin" />
                {nav.downloadProgress.message}
              </div>
              {nav.downloadProgress.totalBytes && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-all"
                    style={{ width: `${nav.downloadProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Installed region summaries */}
          {nav.regions.length > 0 && (
            <div className="space-y-3" data-testid="installed-regions-list">
              {nav.regions.map((r) => (
                <div key={r.id} className="rounded-3xl border border-accent-300/40 bg-accent-50/30 p-5" data-testid={`region-card-${r.id}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-success">
                      <Check size={16} />
                      {r.label}
                    </div>
                    <button
                      onClick={() => nav.removeOfflineRegion(r.id)}
                      disabled={nav.installing}
                      data-testid={`delete-region-${r.id}`}
                      className="flex items-center justify-center gap-1.5 rounded-full border border-error/30 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-ink-muted">
                      <HardDrive size={12} /> {formatBytes(r.sizeBytes)}
                    </div>
                    <div className="flex items-center gap-1.5 text-ink-muted">
                      <MapPin size={12} /> {r.roadCount?.toLocaleString() || 0} roads
                    </div>
                    <div className="flex items-center gap-1.5 text-ink-muted">
                      <Clock size={12} /> {new Date(r.updatedAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1.5 text-ink-muted">
                      <Gauge size={12} /> {r.radiusKm} km radius
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Download form */}
          {showDownloadForm ? (
            <div className="space-y-4" data-testid="download-region-form">
              <div>
                <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Area Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((km) => (
                    <button
                      key={km}
                      onClick={() => setSelectedRadius(km)}
                      data-testid={`preset-radius-${km}`}
                      className={`rounded-2xl border p-4 text-center transition-all ${
                        selectedRadius === km
                          ? 'border-accent-500 bg-accent-50/40 shadow-card'
                          : 'border-line bg-surface-raised hover:border-line-strong'
                      }`}
                    >
                      <span className={`block text-lg font-semibold ${selectedRadius === km ? 'text-accent-600' : 'text-ink'}`}>{km}</span>
                      <span className="text-[11px] text-ink-faint">km radius</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-line bg-surface-raised p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-ink-muted">
                    <HardDrive size={15} /> Estimated size
                  </span>
                  <span className="font-mono text-lg font-semibold text-ink">{estimatedSizeFormatted}</span>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Downloads raw OpenStreetMap vector network. Data © OpenStreetMap contributors (ODbL).
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => nav.installOfflineRegion(selectedRadius)}
                  disabled={nav.installing || !nav.home || nav.network === 'offline'}
                  data-testid="start-download-btn"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-500 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint"
                >
                  {nav.installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {nav.installing ? 'Downloading…' : 'Download Region'}
                </button>
                <button
                  onClick={() => setShowDownloadForm(false)}
                  data-testid="cancel-download-form-btn"
                  className="rounded-full border border-line px-5 py-3.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>

              {!nav.home && (
                <div className="flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                  <AlertCircle size={16} className="shrink-0" />
                  Set your home location first.
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowDownloadForm(true)}
              disabled={nav.installing}
              data-testid="add-new-area-btn"
              className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-line py-4 text-sm font-medium text-ink-muted transition-all hover:border-accent-300 hover:text-accent-500 disabled:opacity-50"
            >
              <Plus size={18} /> Add new region area
            </button>
          )}

          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-subtle/50 px-4 py-3 text-xs text-ink-faint" data-testid="network-status-badge">
            {nav.network === 'online' ? <Wifi size={14} className="text-success" /> : <WifiOff size={14} className="text-warning" />}
            {nav.network === 'online' ? 'Online — downloads available' : 'Offline — connect to internet to download'}
          </div>
        </div>
      </div>
    </div>
  );
}
