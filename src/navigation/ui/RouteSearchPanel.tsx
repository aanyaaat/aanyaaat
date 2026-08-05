import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Search,
  Loader2,
  MapPin,
  Home,
  Briefcase,
  Star,
  History,
  Navigation,
  Plus,
  WifiOff,
  Check,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { getSingleFix, haversineMeters, formatDistance } from '@/navigation/gps/gps';
import { searchPlaces, abortSearch, debounce, type SearchResult } from '@/navigation/search/placeSearch';
import { searchOffline, type OfflineSearchResult } from '@/navigation/search/offlineSearch';

type SearchMode = 'from' | 'to';

export function RouteSearchPanel({ mode, onClose }: { mode: SearchMode; onClose: () => void }) {
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState<SearchResult[]>([]);
  const [offlineResults, setOfflineResults] = useState<OfflineSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [refCoords, setRefCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);

  // Get GPS for local-biased search
  useEffect(() => {
    if (nav.gpsFix) {
      setRefCoords({ lat: nav.gpsFix.latitude, lng: nav.gpsFix.longitude });
    } else {
      getSingleFix(5000)
        .then((fix) => setRefCoords({ lat: fix.latitude, lng: fix.longitude }))
        .catch(() => {});
    }
  }, [nav.gpsFix]);

  // Offline search (instant, always runs)
  useEffect(() => {
    if (query.trim().length >= 2) {
      const results = searchOffline(
        query,
        nav.regions,
        refCoords?.lat,
        refCoords?.lng,
        10,
      );
      setOfflineResults(results);
    } else {
      setOfflineResults([]);
    }
  }, [query, nav.regions, refCoords]);

  // Online search (debounced, only when online)
  const doOnlineSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2 || nav.network === 'offline') {
        setOnlineResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await searchPlaces(q, refCoords?.lat, refCoords?.lng);
        setOnlineResults(results);
      } catch {
        // Ignore — offline results still available
      } finally {
        setSearching(false);
      }
    },
    [refCoords, nav.network],
  );

  const debouncedRef = useRef(debounce(doOnlineSearch, 280));
  useEffect(() => {
    debouncedRef.current = debounce(doOnlineSearch, 280);
  }, [doOnlineSearch]);

  useEffect(() => {
    if (query.trim().length >= 2) {
      debouncedRef.current.debounced(query);
    } else {
      setOnlineResults([]);
    }
    return () => debouncedRef.current.cancel();
  }, [query]);

  useEffect(() => {
    return () => abortSearch();
  }, []);

  const selectOnlineResult = (r: SearchResult) => {
    const main = r.name || r.display_name.split(',')[0]?.trim() || r.display_name;
    const dest = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: main };
    if (mode === 'to') {
      nav.setDestination(dest);
    } else {
      // For "from", we could set a custom start, but for now we just use GPS
      nav.setDestination(dest);
    }
    onClose();
  };

  const selectOfflineResult = (r: OfflineSearchResult) => {
    const dest = { lat: r.latitude, lng: r.longitude, label: r.name };
    nav.setDestination(dest);
    onClose();
  };

  const selectSavedPlace = (place: { latitude: number; longitude: number; label: string }) => {
    const dest = { lat: place.latitude, lng: place.longitude, label: place.label };
    nav.setDestination(dest);
    onClose();
  };

  const useCurrentLocation = () => {
    if (nav.gpsFix) {
      // Current location is always the "from" — just close
      onClose();
    }
  };

  const recentPlaces = nav.savedPlaces.filter((p) => p.type === 'recent').slice(0, 5);
  const favorites = nav.savedPlaces.filter((p) => p.type === 'favorite').slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-fade-in">
      {/* Header with search bar */}
      <div className="border-b border-line bg-surface-raised px-4 py-3 safe-top">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === 'to' ? 'Where to?' : 'Starting from…'}
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
            />
            {searching && (
              <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-accent-400" />
            )}
          </div>
        </div>
        {nav.network === 'offline' && (
          <div className="mt-2 flex items-center gap-1.5 px-2 text-xs text-warning">
            <WifiOff size={12} />
            Offline — searching downloaded areas only
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {/* Current location option */}
        {mode === 'from' && !query && (
          <button
            onClick={useCurrentLocation}
            className="flex w-full items-center gap-3 border-b border-line/50 px-5 py-3.5 text-left transition-colors hover:bg-surface-subtle"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
              <Navigation size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Current location</p>
              <p className="text-xs text-ink-faint">{nav.gpsFix ? 'GPS active' : 'Waiting for GPS…'}</p>
            </div>
          </button>
        )}

        {/* Offline results (from downloaded data) */}
        {offlineResults.length > 0 && (
          <div className="py-2">
            <div className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              From downloaded maps
            </div>
            {offlineResults.map((r, i) => (
              <button
                key={`${r.regionId}-${i}`}
                onClick={() => selectOfflineResult(r)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                  {r.type === 'poi' ? <MapPin size={15} /> : <Navigation size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                  <p className="text-xs text-ink-faint">
                    {r.type === 'poi' ? r.poiType : 'Road'}
                    {r.distanceMeters !== undefined && ` · ${formatDistance(r.distanceMeters)} away`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Online results */}
        {onlineResults.length > 0 && (
          <div className="py-2">
            <div className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Online results
            </div>
            {onlineResults.map((r) => {
              const parts = r.display_name.split(',');
              const main = r.name || parts[0]?.trim() || r.display_name;
              const context = parts.slice(1, 4).join(',').trim();
              const isBusStop = r.category === 'highway' && r.type === 'bus_stop';
              const dist = r._distanceMeters;
              return (
                <button
                  key={r.place_id}
                  onClick={() => selectOnlineResult(r)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-subtle"
                >
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isBusStop ? 'bg-success/15 text-success' : 'bg-accent-100 text-accent-500'}`}>
                    {isBusStop ? <MapPin size={15} /> : <MapPin size={15} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{main}</p>
                    {context && <p className="truncate text-xs text-ink-faint">{context}</p>}
                    {dist !== undefined && dist < 100000 && (
                      <p className="mt-0.5 text-[10px] font-medium text-ink-faint">{formatDistance(dist)} away</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {query.trim().length >= 2 && offlineResults.length === 0 && onlineResults.length === 0 && !searching && (
          <div className="px-5 py-10 text-center text-sm text-ink-faint">
            No results found. {nav.network === 'offline' && 'Download an offline map to search locally.'}
          </div>
        )}

        {/* Quick destinations (when no query) */}
        {!query && (
          <div className="py-2">
            {/* Home */}
            {nav.home && (
              <button
                onClick={() => selectSavedPlace({ latitude: nav.home!.latitude, longitude: nav.home!.longitude, label: nav.home!.label })}
                className="flex w-full items-center gap-3 border-b border-line/50 px-5 py-3.5 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-error/15 text-error">
                  <Home size={16} fill="currentColor" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Home</p>
                  <p className="text-xs text-ink-faint">{nav.home.label}</p>
                </div>
              </button>
            )}

            {/* Work */}
            {nav.savedPlaces.filter((p) => p.type === 'work').map((p) => (
              <button
                key={p.id}
                onClick={() => selectSavedPlace(p)}
                className="flex w-full items-center gap-3 border-b border-line/50 px-5 py-3.5 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-500">
                  <Briefcase size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Work</p>
                  <p className="text-xs text-ink-faint">{p.label}</p>
                </div>
              </button>
            ))}

            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Favorites</div>
            )}
            {favorites.map((p) => (
              <button
                key={p.id}
                onClick={() => selectSavedPlace(p)}
                className="flex w-full items-center gap-3 border-b border-line/50 px-5 py-3.5 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15 text-warning">
                  <Star size={16} fill="currentColor" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{p.label}</p>
                </div>
              </button>
            ))}

            {/* Recent */}
            {recentPlaces.length > 0 && (
              <div className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Recent</div>
            )}
            {recentPlaces.map((p) => (
              <button
                key={p.id}
                onClick={() => selectSavedPlace(p)}
                className="flex w-full items-center gap-3 border-b border-line/50 px-5 py-3.5 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
                  <History size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{p.label}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
