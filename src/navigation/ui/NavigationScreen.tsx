import { useState, useEffect, useRef } from 'react';
import {
  X,
  Navigation,
  MapPin,
  LocateFixed,
  Square,
  Home,
  Footprints,
  Car,
  Bike,
  Layers,
  Compass,
  Search,
  Volume2,
  VolumeX,
  Coffee,
  Utensils,
  Fuel,
  Bed,
  HeartPulse,
  Building,
  TreePine,
  ShoppingCart,
  ShieldAlert,
  Star,
  Plus,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { CanvasMap, type MapStyle } from '@/navigation/maps/CanvasMap';
import { CompassFallback } from '@/navigation/ui/CompassFallback';
import { OfflineMapsPanel } from '@/navigation/ui/OfflineMapsPanel';
import { HomeSetup } from '@/navigation/ui/HomeSetup';
import { RouteSearchPanel } from '@/navigation/ui/RouteSearchPanel';
import { formatDistance, formatDuration } from '@/navigation/gps/gps';
import { searchPlaces } from '@/navigation/search/placeSearch';
import type { TravelMode } from '@/navigation/domain/types';

interface PoiItem {
  lat: number;
  lng: number;
  label: string;
  type: string;
}

export function NavigationScreen({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [showOfflineMaps, setShowOfflineMaps] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const [showRouteSearch, setShowRouteSearch] = useState<'from' | 'to' | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('standard');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Selected dropped pin / clicked POI card
  const [selectedPin, setSelectedPin] = useState<{
    lat: number;
    lng: number;
    label: string;
    type: string;
    address?: string;
  } | null>(null);

  // POI category filters
  const [activePoiCategory, setActivePoiCategory] = useState<string | null>(null);
  const [poiMarkers, setPoiMarkers] = useState<PoiItem[]>([]);
  const [loadingPoi, setLoadingPoi] = useState(false);

  const needsSetup = !nav.home;
  const hasRoute = nav.route !== null;
  const isRouteUnavailable = nav.phase === 'route-unavailable';
  const isNavigating = nav.phase === 'navigating' || nav.phase === 'recalculating';

  useEffect(() => {
    nav.startGpsOnly();
    return () => {
      nav.stopNavigation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Voice guidance announcement
  const lastSpokenIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!voiceEnabled || !nav.route || nav.route.instructions.length === 0) return;
    const idx = Math.min(nav.nextInstructionIndex, nav.route.instructions.length - 1);
    if (idx !== lastSpokenIndexRef.current) {
      lastSpokenIndexRef.current = idx;
      const instr = nav.route.instructions[idx];
      if (instr && 'speechSynthesis' in window) {
        const text = instr.spoken || `${instr.type} in ${formatDistance(instr.distanceMeters)}`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [nav.nextInstructionIndex, nav.route, voiceEnabled]);

  // Fetch POIs when category clicked
  const handlePoiCategoryClick = async (categoryKey: string, queryTerm: string) => {
    if (activePoiCategory === categoryKey) {
      setActivePoiCategory(null);
      setPoiMarkers([]);
      return;
    }
    if (nav.network === 'offline') {
      return;
    }
    setActivePoiCategory(categoryKey);
    setLoadingPoi(true);
    const refLat = nav.gpsFix?.latitude ?? nav.home?.latitude ?? 28.6139;
    const refLng = nav.gpsFix?.longitude ?? nav.home?.longitude ?? 77.2090;

    try {
      const results = await searchPlaces(queryTerm, refLat, refLng);
      const items: PoiItem[] = results.map((r) => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: r.name || r.display_name.split(',')[0] || queryTerm,
        type: categoryKey,
      }));
      setPoiMarkers(items);
    } catch {
      setPoiMarkers([]);
    } finally {
      setLoadingPoi(false);
    }
  };

  const handleMapTap = (lat: number, lng: number) => {
    setSelectedPin({
      lat,
      lng,
      label: 'Selected Location',
      type: 'landmark',
      address: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
    });
  };

  const setPinAsHome = () => {
    if (!selectedPin) return;
    nav.setHomeLocation({
      label: selectedPin.label || 'Home',
      latitude: selectedPin.lat,
      longitude: selectedPin.lng,
    });
    setSelectedPin(null);
  };

  const savePinToFavorites = () => {
    if (!selectedPin) return;
    nav.addSavedPlace({
      label: selectedPin.label,
      latitude: selectedPin.lat,
      longitude: selectedPin.lng,
      type: 'favorite',
    });
    setSelectedPin(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-fade-in" data-testid="navigation-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-3 safe-top shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            title="Go back"
            data-testid="close-nav-btn"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-500 text-white shadow-md">
              <Navigation size={16} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink">Aanyaa Navigation</h1>
              <p className="text-[11px] leading-tight text-ink-faint">{statusLabel(nav)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Home Setup / Quick Home button */}
          <button
            onClick={() => {
              if (nav.home) {
                nav.setDestination({ lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label });
              } else {
                setShowHomeSetup(true);
              }
            }}
            data-testid="header-home-btn"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-subtle px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
          >
            <Home size={14} className={nav.home ? 'text-accent-500' : 'text-ink-faint'} />
            <span className="max-w-[80px] truncate">{nav.home ? nav.home.label : 'Set Home'}</span>
          </button>

          {/* Route Source Badge */}
          {hasRoute && nav.route?.source && (
            <span
              data-testid="route-source-badge"
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                nav.route.source === 'offline'
                  ? 'bg-accent-100 text-accent-700 border border-accent-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
            >
              {nav.route.source === 'offline' ? 'Offline Road Route' : 'Online Route'}
            </span>
          )}

          {/* Voice Guidance Toggle */}
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`rounded-full p-2 transition-colors ${voiceEnabled ? 'bg-accent-100 text-accent-600' : 'bg-surface-subtle text-ink-muted'}`}
            title={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
            data-testid="voice-toggle-btn"
          >
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Offline Maps Button */}
          <button
            onClick={() => setShowOfflineMaps(true)}
            data-testid="offline-maps-btn"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-subtle px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
          >
            <MapPin size={14} className="text-accent-500" />
            <span>{nav.regions.length} Maps</span>
          </button>
        </div>
      </header>

      {/* Main map canvas area */}
      <div className="relative flex-1 bg-surface-subtle">
        <CanvasMap
          regions={nav.regions}
          route={nav.route}
          gpsFix={nav.gpsFix}
          home={nav.home}
          destination={nav.destination}
          savedPlaces={nav.savedPlaces}
          poiMarkers={poiMarkers}
          recenterSignal={nav.recenterSignal}
          followMode={nav.followMode}
          rotation={0}
          mapStyle={mapStyle}
          onTap={handleMapTap}
          onLongPress={(lat, lng) => handleMapTap(lat, lng)}
          onSelectPin={(pin) => setSelectedPin({ ...pin, address: `${pin.lat.toFixed(4)}°, ${pin.lng.toFixed(4)}°` })}
        />

        {/* POI Category Chips Bar */}
        <div className="absolute top-3 left-3 right-3 z-10 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'gas', label: 'Gas', icon: Fuel, query: 'petrol pump' },
            { key: 'food', label: 'Food', icon: Utensils, query: 'restaurant' },
            { key: 'cafe', label: 'Cafe', icon: Coffee, query: 'cafe' },
            { key: 'hospital', label: 'Hospital', icon: HeartPulse, query: 'hospital' },
            { key: 'hotel', label: 'Hotel', icon: Bed, query: 'hotel' },
            { key: 'supermarket', label: 'Groceries', icon: ShoppingCart, query: 'supermarket' },
            { key: 'bank', label: 'ATM', icon: Building, query: 'atm' },
            { key: 'park', label: 'Park', icon: TreePine, query: 'park' },
          ].map((cat) => {
            const Icon = cat.icon;
            const isActive = activePoiCategory === cat.key;
            return (
              <button
                key={cat.key}
                disabled={nav.network === 'offline'}
                onClick={() => handlePoiCategoryClick(cat.key, cat.query)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-md transition-all active:scale-95 ${
                  isActive
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface/90 text-ink border border-line backdrop-blur-md hover:bg-surface'
                } ${nav.network === 'offline' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Icon size={14} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Floating action buttons stack right */}
        <div className="absolute top-16 right-3 z-10 flex flex-col gap-2.5">
          {/* Map style layer picker */}
          <div className="relative">
            <button
              onClick={() => setShowLayerPicker(!showLayerPicker)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-lg backdrop-blur-md transition-all hover:bg-surface active:scale-95"
              title="Map layers"
            >
              <Layers size={20} />
            </button>

            {showLayerPicker && (
              <div className="absolute right-14 top-0 z-20 flex flex-col gap-1 rounded-2xl border border-line bg-surface/95 p-2 shadow-float backdrop-blur-md">
                {[
                  { key: 'standard', label: 'Standard Map' },
                  { key: 'dark', label: 'Dark Mode Map' },
                ].map((st) => (
                  <button
                    key={st.key}
                    onClick={() => {
                      setMapStyle(st.key as MapStyle);
                      setShowLayerPicker(false);
                    }}
                    className={`rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                      mapStyle === st.key ? 'bg-accent-100 text-accent-700 font-semibold' : 'text-ink hover:bg-surface-subtle'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compass view button */}
          <button
            onClick={() => setShowCompass(!showCompass)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-line shadow-lg backdrop-blur-md transition-all active:scale-95 ${
              showCompass ? 'bg-accent-500 text-white' : 'bg-surface/90 text-ink hover:bg-surface'
            }`}
            title="Compass bearing view"
          >
            <Compass size={20} />
          </button>

          {/* Recenter button */}
          <button
            onClick={() => nav.recenter()}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-lg backdrop-blur-md transition-all hover:bg-surface active:scale-95"
            title="Recenter map"
            data-testid="recenter-btn"
          >
            <LocateFixed size={20} className={nav.followMode ? 'text-accent-500' : 'text-ink-muted'} />
          </button>
        </div>

        {/* Personalized Aanyaa Loading Pill Overlay */}
        {(nav.phase === 'calculating' || nav.phase === 'locating' || loadingPoi) && (
          <div
            data-testid="aanyaa-loading-indicator"
            className="absolute top-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-accent-300 bg-surface/95 px-4.5 py-2.5 text-xs font-semibold text-accent-700 shadow-float backdrop-blur-md animate-fade-in"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-white animate-spin">
              <Loader2 size={13} />
            </div>
            <span>
              {nav.phase === 'calculating'
                ? 'Aanyaa is calculating your route…'
                : nav.phase === 'locating'
                ? 'Aanyaa is locating your position…'
                : 'Aanyaa is searching nearby places…'}
            </span>
          </div>
        )}

        {/* Active Navigation Top Maneuver Card */}
        {isNavigating && nav.route && nav.route.instructions[nav.nextInstructionIndex] && (
          <div
            data-testid="top-maneuver-card"
            className="absolute top-16 left-3 right-3 z-30 flex items-center gap-3.5 rounded-2xl border border-accent-400 bg-accent-500 p-4 text-white shadow-float animate-slide-down"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner">
              <Navigation size={22} className="rotate-45" fill="currentColor" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                In {formatDistance(nav.route.instructions[nav.nextInstructionIndex].distanceMeters || 150)}
              </p>
              <p className="text-base font-bold leading-tight text-white">
                {nav.route.instructions[nav.nextInstructionIndex].roadName
                  ? `Follow ${nav.route.instructions[nav.nextInstructionIndex].roadName}`
                  : 'Continue on current route'}
              </p>
            </div>
          </div>
        )}

        {/* Selected Pin / POI Card popup */}
        {selectedPin && (
          <div className="absolute bottom-4 left-4 right-4 z-20 rounded-3xl border border-line bg-surface/95 p-4 shadow-float backdrop-blur-md animate-slide-up" data-testid="selected-pin-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{selectedPin.label}</h3>
                {selectedPin.address && <p className="mt-0.5 text-xs text-ink-faint">{selectedPin.address}</p>}
              </div>
              <button onClick={() => setSelectedPin(null)} className="rounded-full p-1 text-ink-muted hover:bg-surface-subtle">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  nav.setDestination({
                    lat: selectedPin.lat,
                    lng: selectedPin.lng,
                    label: selectedPin.label || `${selectedPin.lat.toFixed(4)}°, ${selectedPin.lng.toFixed(4)}°`,
                  });
                  setSelectedPin(null);
                }}
                data-testid="navigate-to-pin-btn"
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-500 px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-accent-600 active:scale-95 shadow-md"
              >
                <Navigation size={14} /> Navigate Here
              </button>

              <button
                onClick={setPinAsHome}
                data-testid="set-pin-home-btn"
                className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface-subtle px-3.5 py-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface"
              >
                <Home size={14} className="text-accent-500" /> Set as Home
              </button>

              <button
                onClick={savePinToFavorites}
                data-testid="save-pin-fav-btn"
                className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface-subtle px-3.5 py-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface"
              >
                <Star size={14} className="text-warning" /> Favorite
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compass View Overlay */}
      {showCompass && (
        <div className="absolute inset-0 z-30 bg-surface">
          <CompassFallback onClose={() => setShowCompass(false)} />
        </div>
      )}

      {/* Route Error Panel (when road routing fails) */}
      {isRouteUnavailable && nav.routeError && (
        <div className="border-t border-warning/40 bg-warning/5 p-4 safe-bottom shadow-lg" data-testid="route-unavailable-panel">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning-700">
              <ShieldAlert size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-ink">Route Unavailable</h3>
              <p className="mt-0.5 text-xs text-ink">{nav.routeError.message}</p>
              {nav.routeError.details && (
                <p className="mt-1 text-[11px] text-ink-faint">{nav.routeError.details}</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowOfflineMaps(true)}
              className="flex-1 rounded-full bg-accent-500 text-white font-medium px-4 py-2.5 text-xs shadow-md transition-all hover:bg-accent-600 active:scale-95"
            >
              Download Offline Map
            </button>
            {nav.destination && (
              <button
                onClick={() => {
                  nav.setDestination(nav.destination);
                }}
                className="rounded-full bg-surface-raised border border-line px-4 py-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                Retry
              </button>
            )}
            <button
              onClick={() => nav.stopNavigation()}
              className="rounded-full border border-line px-3 py-2.5 text-xs text-ink-muted hover:bg-surface-subtle"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bottom Panel / Navigation Dashboard */}
      {!isRouteUnavailable && (
        <div className="border-t border-line bg-surface-raised p-4 safe-bottom shadow-lg">
          {isNavigating && nav.route ? (
            <div className="space-y-3" data-testid="active-nav-dashboard">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-2xl font-bold text-ink">
                      {formatDistance(nav.remainingDistance)}
                    </span>
                    <span className="text-sm font-medium text-ink-muted">
                      · {formatDuration(nav.remainingDuration)}
                    </span>
                  </div>
                  {nav.route.instructions[nav.nextInstructionIndex] && (
                    <p className="mt-1 text-xs font-medium text-accent-600">
                      Next: {nav.route.instructions[nav.nextInstructionIndex].roadName || 'Ahead'}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => nav.stopNavigation()}
                  data-testid="stop-nav-btn"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-error/10 text-error transition-colors hover:bg-error/20"
                  title="Stop navigation"
                >
                  <Square size={18} fill="currentColor" />
                </button>
              </div>
            </div>
          ) : nav.destination || nav.route ? (
            /* Route Preview Card */
            <div className="space-y-3.5" data-testid="route-preview-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-accent-500" />
                    <h3 className="text-base font-semibold text-ink">{nav.destination?.label || 'Selected Destination'}</h3>
                  </div>
                  {nav.route ? (
                    <p className="mt-0.5 text-xs font-medium text-ink-muted">
                      {formatDistance(nav.route.distanceMeters)} · {formatDuration(nav.route.durationSeconds)} ({nav.travelMode})
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-accent-600 animate-pulse">Calculating road route…</p>
                  )}
                </div>

                <div className="flex gap-1 bg-surface-subtle p-1 rounded-full border border-line">
                  {(['drive', 'bike', 'walk'] as TravelMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => nav.setTravelMode(m)}
                      className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                        nav.travelMode === m ? 'bg-accent-500 text-white shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                      title={m}
                    >
                      {m === 'drive' && <Car size={14} />}
                      {m === 'bike' && <Bike size={14} />}
                      {m === 'walk' && <Footprints size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => nav.startNavigation()}
                  data-testid="start-navigation-btn"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-500 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-600 active:scale-95 shadow-md"
                >
                  <Navigation size={16} fill="currentColor" />
                  Start Navigation
                </button>

                <button
                  onClick={() => nav.setDestination(null)}
                  data-testid="clear-destination-btn"
                  className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface-subtle px-4 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            /* Home / Search Start State */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Mode</span>
                <div className="flex gap-1">
                  {(['drive', 'bike', 'walk'] as TravelMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => nav.setTravelMode(m)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        nav.travelMode === m ? 'bg-accent-500 text-white' : 'bg-surface-subtle text-ink-muted hover:text-ink'
                      }`}
                    >
                      {m === 'drive' && <Car size={14} />}
                      {m === 'bike' && <Bike size={14} />}
                      {m === 'walk' && <Footprints size={14} />}
                      <span className="capitalize">{m}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (needsSetup) {
                      setShowHomeSetup(true);
                    } else {
                      void nav.startNavigation();
                    }
                  }}
                  data-testid="start-get-me-home-btn"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-500 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-600 active:scale-95 shadow-md"
                >
                  <Home size={16} />
                  {needsSetup ? 'Set Home First' : 'Get Me Home'}
                </button>

                <button
                  onClick={() => setShowRouteSearch('to')}
                  data-testid="search-route-btn"
                  className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface-subtle px-5 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  <Search size={16} />
                  <span>Search</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCompass && (
        <div className="fixed inset-0 z-50 bg-surface">
          <CompassFallback onClose={() => setShowCompass(false)} />
        </div>
      )}
      {showHomeSetup && <HomeSetup onClose={() => setShowHomeSetup(false)} onProceed={() => setShowHomeSetup(false)} />}
      {showOfflineMaps && <OfflineMapsPanel onClose={() => setShowOfflineMaps(false)} />}
      {showRouteSearch && <RouteSearchPanel mode={showRouteSearch} onClose={() => setShowRouteSearch(null)} />}
    </div>
  );
}

function statusLabel(nav: ReturnType<typeof useNav>): string {
  if (nav.phase === 'navigating') return 'Navigating';
  if (nav.phase === 'calculating') return 'Calculating road route…';
  if (nav.phase === 'route-unavailable') return 'Route unavailable';
  if (nav.phase === 'arrived') return 'Arrived at destination';
  if (nav.regions.length > 0) return `${nav.regions.length} offline map regions ready`;
  return 'Interactive Map Ready';
}
