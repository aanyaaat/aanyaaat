import { useState, useEffect } from 'react';
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
  WifiOff,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { getSingleFix, formatDistance } from '@/navigation/gps/gps';
import { searchPlaces, abortSearch, type SearchResult } from '@/navigation/search/placeSearch';
import { searchOffline, type OfflineSearchResult } from '@/navigation/search/offlineSearch';
import { getRegionData } from '@/navigation/offline/regions';
import type { OfflineRegionData } from '@/navigation/domain/types';

type SearchMode = 'from' | 'to';

export function RouteSearchPanel({ mode, onClose }: { mode: SearchMode; onClose: () => void }) {
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState<SearchResult[]>([]);
  const [offlineResults, setOfflineResults] = useState<OfflineSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [refCoords, setRefCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (nav.gpsFix) {
      setRefCoords({ lat: nav.gpsFix.latitude, lng: nav.gpsFix.longitude });
    } else {
      getSingleFix(5000)
        .then((fix) => setRefCoords({ lat: fix.latitude, lng: fix.longitude }))
        .catch(() => {});
    }
  }, [nav.gpsFix]);

  const handleSearchSubmit = async () => {
    const q = query.trim();
    if (q.length < 2) return;

    setSearching(true);

    // 1. Instant offline regional search
    try {
      const regionPayloads = await Promise.all(
        nav.regions.map((r) => getRegionData(r.id))
      ).then((list) => list.filter(Boolean) as OfflineRegionData[]);

      const offRes = searchOffline(
        q,
        regionPayloads,
        refCoords?.lat,
        refCoords?.lng,
        10
      );
      setOfflineResults(offRes);
    } catch {
      setOfflineResults([]);
    }

    // 2. Explicit online search if network is online
    if (nav.network === 'online') {
      try {
        const onRes = await searchPlaces(q, refCoords?.lat, refCoords?.lng);
        setOnlineResults(onRes);
      } catch {
        setOnlineResults([]);
      }
    } else {
      setOnlineResults([]);
    }

    setSearching(false);
  };

  useEffect(() => {
    return () => abortSearch();
  }, []);

  const selectOnlineResult = (r: SearchResult) => {
    const main = r.name || r.display_name.split(',')[0]?.trim() || r.display_name;
    const dest = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: main };
    nav.setDestination(dest);
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
      onClose();
    }
  };

  const recentPlaces = nav.savedPlaces.filter((p) => p.type === 'recent').slice(0, 5);
  const favorites = nav.savedPlaces.filter((p) => p.type === 'favorite').slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-fade-in" data-testid="route-search-panel">
      {/* Header with search bar */}
      <div className="border-b border-line bg-surface-raised px-4 py-3 safe-top">
        <div className="flex items-center gap-2">
          <button onClick={onClose} data-testid="close-route-search-btn" className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
          <div className="relative flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                autoFocus
                data-testid="route-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                placeholder={mode === 'to' ? 'Where to? (press Enter)' : 'Starting from…'}
                className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-faint focus:border-accent-300 focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearchSubmit}
              disabled={searching || query.trim().length < 2}
              data-testid="route-search-submit-btn"
              className="rounded-full bg-accent-500 px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-accent-600 disabled:opacity-50"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </div>
        </div>
        {nav.network === 'offline' && (
          <div className="mt-2 flex items-center gap-1.5 px-2 text-xs text-warning">
            <WifiOff size={12} />
            Offline — searching downloaded vector areas only
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
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

        {/* Offline results (from downloaded vector data) */}
        {offlineResults.length > 0 && (
          <div className="py-2">
            <div className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              From downloaded map vector data
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
              return (
                <button
                  key={r.place_id}
                  onClick={() => selectOnlineResult(r)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-subtle"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-500">
                    <MapPin size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{main}</p>
                    {context && <p className="truncate text-xs text-ink-faint">{context}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!query && (
          <div className="py-2">
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
