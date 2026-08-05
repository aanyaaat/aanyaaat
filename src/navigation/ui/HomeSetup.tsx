import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  MapPin,
  Home,
  Trash2,
  Search,
  Loader2,
  Check,
  Navigation,
  Bus,
  Navigation2,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { getSingleFix, haversineMeters, formatDistance } from '@/navigation/gps/gps';
import type { HomeLocation } from '@/navigation/domain/types';
import {
  searchPlaces,
  abortSearch,
  debounce,
  type SearchResult,
} from '@/navigation/search/placeSearch';

export function HomeSetup({ onClose, onProceed }: { onClose: () => void; onProceed: () => void }) {
  const nav = useNav();
  const [label, setLabel] = useState(nav.home?.label ?? 'Home');
  const [lat, setLat] = useState<string>(nav.home ? String(nav.home.latitude) : '');
  const [lng, setLng] = useState<string>(nav.home ? String(nav.home.longitude) : '');
  const [locating, setLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refCoords, setRefCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Try to get GPS for local-biased search (non-blocking, best-effort)
  useEffect(() => {
    getSingleFix(5000)
      .then((fix) => setRefCoords({ lat: fix.latitude, lng: fix.longitude }))
      .catch(() => {});
  }, []);

  // Debounced search function
  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setSuggestions([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await searchPlaces(q, refCoords?.lat, refCoords?.lng);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (e) {
        setError(`Search failed: ${(e as Error).message}`);
      } finally {
        setSearching(false);
      }
    },
    [refCoords],
  );

  // Create debounced version
  const debouncedRef = useRef(debounce(doSearch, 280));
  useEffect(() => {
    debouncedRef.current = debounce(doSearch, 280);
  }, [doSearch]);

  // Trigger debounced search on input
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      debouncedRef.current.debounced(searchQuery);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    return () => debouncedRef.current.cancel();
  }, [searchQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortSearch();
  }, []);

  const useCurrentLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const fix = await getSingleFix();
      setLat(String(fix.latitude));
      setLng(String(fix.longitude));
      setRefCoords({ lat: fix.latitude, lng: fix.longitude });
    } catch (e) {
      setError(`Could not get your location: ${(e as Error).message}`);
    } finally {
      setLocating(false);
    }
  };

  const selectResult = (r: SearchResult) => {
    setLat(r.lat);
    setLng(r.lon);
    const main = r.name || r.display_name.split(',')[0]?.trim() || r.display_name;
    if (!label || label === 'Home') setLabel(main);
    setShowSuggestions(false);
    setSearchQuery('');
    setSuggestions([]);
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

          {/* Search with live suggestions */}
          <div className="relative">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Search (online)</label>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Search place, bus stop, or pincode…"
                className="w-full rounded-2xl border border-line bg-surface-raised py-3 pl-10 pr-10 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
              />
              {searching && (
                <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-accent-400" />
              )}
            </div>

            {/* Live suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-line bg-surface-raised shadow-float">
                {suggestions.map((r) => {
                  const parts = r.display_name.split(',');
                  const main = r.name || parts[0]?.trim() || r.display_name;
                  const context = parts.slice(1, 4).join(',').trim();
                  const isBusStop = r.category === 'highway' && r.type === 'bus_stop';
                  const dist = r._distanceMeters;
                  const isExact = (r._score ?? 0) >= 0.95;
                  return (
                    <button
                      key={r.place_id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectResult(r);
                      }}
                      className="flex w-full items-start gap-2.5 border-b border-line/50 px-3.5 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-subtle"
                    >
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isBusStop ? 'bg-success/15 text-success' : 'bg-accent-100 text-accent-500'}`}>
                        {isBusStop ? <Bus size={14} /> : <MapPin size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-ink">{main}</p>
                          {isExact && (
                            <span className="shrink-0 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-600">
                              Exact
                            </span>
                          )}
                        </div>
                        {context && <p className="truncate text-xs text-ink-faint">{context}</p>}
                        {dist !== undefined && dist < 100000 && (
                          <p className="mt-0.5 text-[10px] font-medium text-ink-faint">
                            {formatDistance(dist)} away
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty state hint */}
            {showSuggestions && suggestions.length === 0 && !searching && searchQuery.trim().length >= 2 && (
              <div className="absolute z-10 mt-1.5 w-full rounded-2xl border border-line bg-surface-raised px-4 py-3 text-center text-sm text-ink-faint shadow-float">
                No results found. Try a different spelling.
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
