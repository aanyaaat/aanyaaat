import { useState } from 'react';
import {
  X,
  MapPin,
  Home,
  Trash2,
  Search,
  Loader2,
  Check,
  Navigation,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { getSingleFix } from '@/navigation/gps/gps';
import type { HomeLocation } from '@/navigation/domain/types';

export function HomeSetup({ onClose, onProceed }: { onClose: () => void; onProceed: () => void }) {
  const nav = useNav();
  const [label, setLabel] = useState(nav.home?.label ?? 'Home');
  const [lat, setLat] = useState<string>(nav.home ? String(nav.home.latitude) : '');
  const [lng, setLng] = useState<string>(nav.home ? String(nav.home.longitude) : '');
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const useCurrentLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const fix = await getSingleFix();
      setLat(String(fix.latitude));
      setLng(String(fix.longitude));
    } catch (e) {
      setError(`Could not get your location: ${(e as Error).message}`);
    } finally {
      setLocating(false);
    }
  };

  const search = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = (await res.json()) as NominatimResult[];
      setSearchResults(data);
    } catch (e) {
      setError(`Search failed: ${(e as Error).message}`);
    } finally {
      setSearching(false);
    }
  };

  const save = () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Invalid coordinates.');
      return;
    }
    const home: HomeLocation = {
      label: label.trim() || 'Home',
      latitude: latNum,
      longitude: lngNum,
    };
    nav.setHomeLocation(home);
    setSaved(true);
    setTimeout(() => onProceed(), 800);
  };

  const remove = () => {
    nav.removeHome();
    setLat('');
    setLng('');
    setLabel('Home');
    setSaved(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-line bg-surface shadow-float animate-scale-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <Home size={18} />
            </div>
            <div>
              <h2 className="font-display text-xl text-ink">Set Your Home</h2>
              <p className="text-[11px] text-ink-faint">Stored only on this device</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && (
            <div className="rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}

          {/* Label */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home"
              className="w-full rounded-2xl border border-line bg-surface-raised p-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
            />
          </div>

          {/* Use current location */}
          <button
            onClick={useCurrentLocation}
            disabled={locating}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-200 px-5 py-3.5 text-sm font-medium text-accent-700 transition-all hover:bg-accent-300 active:scale-95 disabled:opacity-50"
          >
            {locating ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
            {locating ? 'Locating you…' : 'Use my current location'}
          </button>

          {/* Search */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Search (online)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                  placeholder="Search for a place…"
                  className="w-full rounded-2xl border border-line bg-surface-raised py-3 pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
                />
              </div>
              <button
                onClick={search}
                disabled={searching || !searchQuery.trim()}
                className="rounded-2xl border border-line px-4 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:opacity-50"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {searchResults.map((r) => (
                  <button
                    key={r.place_id}
                    onClick={() => {
                      setLat(r.lat);
                      setLng(r.lon);
                      if (!label || label === 'Home') setLabel(r.display_name.split(',')[0]);
                    }}
                    className="flex w-full items-start gap-2 rounded-2xl border border-line bg-surface-raised p-3 text-left text-sm transition-colors hover:bg-surface-subtle"
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 text-accent-400" />
                    <span className="text-ink-muted">{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Latitude</label>
              <input
                type="text"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="e.g. 28.6139"
                className="w-full rounded-2xl border border-line bg-surface-raised p-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Longitude</label>
              <input
                type="text"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="e.g. 77.2090"
                className="w-full rounded-2xl border border-line bg-surface-raised p-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
              />
            </div>
          </div>

          {nav.home && (
            <button
              onClick={remove}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-error/30 py-3 text-sm text-error transition-colors hover:bg-error/10"
            >
              <Trash2 size={14} /> Delete saved home
            </button>
          )}
        </div>

        <div className="border-t border-line p-5">
          <button
            onClick={save}
            disabled={!lat || !lng || saved}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent-300 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint"
          >
            {saved ? <><Check size={16} /> Home saved</> : <><Navigation size={16} /> Save & continue</>}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}
