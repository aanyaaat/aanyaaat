import { useState, useEffect, useRef, useCallback } from 'react';
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
  Search,
  ArrowUpDown,
  Clock,
  Star,
  Briefcase,
  History,
  Plus,
  Gauge,
  ChevronRight,
  Settings2,
  Volume2,
  VolumeX,
  Share2,
  Bookmark,
  ExternalLink,
  PlusCircle,
  Minus,
  Eye,
  Coffee,
  Utensils,
  Fuel,
  Hotel,
  Hospital,
  Building,
  TreePine,
  ShoppingCart,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { CanvasMap, type MapStyle } from '@/navigation/maps/CanvasMap';
import { CompassFallback } from '@/navigation/ui/CompassFallback';
import { EmergencyFallback } from '@/navigation/ui/EmergencyFallback';
import { OfflineMapsPanel } from '@/navigation/ui/OfflineMapsPanel';
import { HomeSetup } from '@/navigation/ui/HomeSetup';
import { RouteSearchPanel } from '@/navigation/ui/RouteSearchPanel';
import { Tulip } from '@/ui/components/Tulip';
import { formatDistance, formatDuration } from '@/navigation/gps/gps';
import { searchPlaces } from '@/navigation/search/placeSearch';
import type { TravelMode, InstructionType, SavedPlace } from '@/navigation/domain/types';

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
  const [showSettings, setShowSettings] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('standard');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(14);

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

  // Street view mock modal
  const [showStreetView, setShowStreetView] = useState(false);

  const needsSetup = !nav.home;
  const hasRoute = nav.route !== null;
  const isOffCoverage = nav.phase === 'off-coverage';
  const isNavigating = nav.phase === 'navigating' || nav.phase === 'recalculating';

  useEffect(() => {
    nav.startGpsOnly();
    return () => {
      nav.stopNavigation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Voice guidance announcement when instruction changes
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

  // Reverse geocode tap on map
  const handleMapTap = async (lat: number, lng: number) => {
    setSelectedPin({
      lat,
      lng,
      label: 'Dropped Pin',
      type: 'landmark',
      address: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
    });

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          const shortName = data.name || data.display_name.split(',')[0] || 'Dropped Pin';
          setSelectedPin({
            lat,
            lng,
            label: shortName,
            type: 'landmark',
            address: data.display_name,
          });
        }
      }
    } catch {
      // Keep coordinate fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-fade-in">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-3 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink" data-testid="close-nav-btn">
            <X size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-200 text-accent-700">
              <Navigation size={16} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink">Google Maps Pro</h1>
              <p className="text-[11px] leading-tight text-ink-faint">{statusLabel(nav)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Voice Guidance Toggle */}
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border ${voiceEnabled ? 'border-accent-300 bg-accent-50 text-accent-600' : 'border-line text-ink-muted'}`}
            title={voiceEnabled ? 'Voice Guidance On' : 'Voice Guidance Muted'}
            data-testid="voice-toggle-btn"
          >
            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          <StatusBadge
            icon={nav.network === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
            label={nav.network === 'online' ? 'LIVE' : 'OFFLINE'}
            tone={nav.network === 'online' ? 'success' : 'warning'}
          />
          <StatusBadge
            icon={<MapPin size={12} />}
            label={gpsLabel(nav.gpsStatus)}
            tone={nav.gpsStatus === 'found' ? 'success' : nav.gpsStatus === 'weak' || nav.gpsStatus === 'stale' ? 'warning' : 'error'}
          />
        </div>
      </header>

      {needsSetup ? (
        <NeedsSetup onSetup={() => setShowHomeSetup(true)} gpsStatus={nav.gpsStatus} />
      ) : isOffCoverage && !hasRoute ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-5 py-3 text-sm text-warning">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{nav.routeError ?? 'Outside offline coverage. Showing fallback navigation.'}</span>
          </div>
          {showCompass ? <CompassFallback /> : <EmergencyFallback onSetupHome={() => setShowHomeSetup(true)} />}
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
          {/* Map view container */}
          <div className="relative flex-1 overflow-hidden bg-black">
            <CanvasMap
              regions={nav.regions}
              route={nav.route}
              gpsFix={nav.snappedFix ?? nav.gpsFix}
              home={nav.home}
              destination={nav.destination}
              savedPlaces={nav.savedPlaces}
              poiMarkers={poiMarkers}
              recenterSignal={nav.recenterSignal}
              followMode={nav.followMode}
              rotation={0}
              mapStyle={mapStyle}
              onTap={handleMapTap}
              onLongPress={handleMapTap}
              onSelectPin={(pin) => {
                setSelectedPin({
                  lat: pin.lat,
                  lng: pin.lng,
                  label: pin.label,
                  type: pin.type,
                  address: `${pin.lat.toFixed(4)}°, ${pin.lng.toFixed(4)}°`,
                });
              }}
            />

            {/* POI Category Quick Filter Bar */}
            <div className="absolute top-3 left-3 right-16 z-10 flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
              {[
                { key: 'gas', label: 'Gas', query: 'gas station', icon: <Fuel size={13} /> },
                { key: 'food', label: 'Restaurants', query: 'restaurant', icon: <Utensils size={13} /> },
                { key: 'cafe', label: 'Coffee', query: 'cafe coffee', icon: <Coffee size={13} /> },
                { key: 'hotel', label: 'Hotels', query: 'hotel', icon: <Hotel size={13} /> },
                { key: 'hospital', label: 'Hospitals', query: 'hospital clinic', icon: <Hospital size={13} /> },
                { key: 'atm', label: 'ATMs', query: 'atm bank', icon: <Building size={13} /> },
                { key: 'supermarket', label: 'Groceries', query: 'supermarket grocery', icon: <ShoppingCart size={13} /> },
                { key: 'park', label: 'Parks', query: 'park garden', icon: <TreePine size={13} /> },
              ].map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => handlePoiCategoryClick(cat.key, cat.query)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-md transition-all ${
                    activePoiCategory === cat.key
                      ? 'bg-accent-300 text-white font-bold scale-105'
                      : 'bg-white/90 text-ink hover:bg-white'
                  }`}
                  data-testid={`poi-chip-${cat.key}`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
              {loadingPoi && (
                <div className="flex items-center bg-white/90 rounded-full px-3 py-1 shadow-md">
                  <Loader2 size={13} className="animate-spin text-accent-500" />
                </div>
              )}
            </div>

            {/* Floating controls on right */}
            <div className="absolute right-3 top-16 z-10 flex flex-col gap-2">
              <button
                onClick={nav.recenter}
                className={`flex h-10 w-10 items-center justify-center rounded-full shadow-float transition-all active:scale-95 ${
                  nav.followMode ? 'bg-accent-300 text-white' : 'bg-surface-raised text-ink hover:bg-surface-subtle'
                }`}
                aria-label="Recenter"
                data-testid="recenter-btn"
              >
                <LocateFixed size={18} />
              </button>

              {/* Layer Switcher Toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowLayerPicker(!showLayerPicker)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-ink shadow-float transition-all hover:bg-surface-subtle active:scale-95"
                  aria-label="Map layers"
                  data-testid="layer-switcher-btn"
                >
                  <Layers size={18} />
                </button>

                {/* Layer Picker Dropdown */}
                {showLayerPicker && (
                  <div className="absolute right-12 top-0 z-20 w-44 rounded-2xl border border-line bg-surface-raised p-2 shadow-float animate-slide-in">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Map Type</p>
                    {[
                      { key: 'standard', label: 'Standard OSM' },
                      { key: 'satellite', label: 'Satellite Imagery' },
                      { key: 'terrain', label: 'Terrain Topo' },
                      { key: 'dark', label: 'Dark Mode' },
                      { key: 'transit', label: 'Transit & Streets' },
                    ].map((style) => (
                      <button
                        key={style.key}
                        onClick={() => {
                          setMapStyle(style.key as MapStyle);
                          setShowLayerPicker(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                          mapStyle === style.key
                            ? 'bg-accent-100 text-accent-700 font-bold'
                            : 'text-ink hover:bg-surface-subtle'
                        }`}
                      >
                        {style.label}
                        {mapStyle === style.key && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowOfflineMaps(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-ink shadow-float transition-all hover:bg-surface-subtle active:scale-95"
                aria-label="Offline maps"
                data-testid="offline-maps-btn"
              >
                <Compass size={18} />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-ink shadow-float transition-all hover:bg-surface-subtle active:scale-95"
                aria-label="Route settings"
                data-testid="settings-btn"
              >
                <Settings2 size={18} />
              </button>
            </div>

            {/* Recalculating overlay */}
            {nav.phase === 'recalculating' && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-2xl bg-surface-raised px-6 py-4 shadow-float">
                <div className="flex items-center gap-2 text-sm font-medium text-accent-600">
                  <RefreshCw size={16} className="animate-spin" />
                  RECALCULATING ROUTE…
                </div>
              </div>
            )}

            {/* Speed indicator */}
            {isNavigating && nav.currentSpeed >= 0 && (
              <div className="absolute left-3 bottom-20 z-10 rounded-2xl bg-surface-raised/95 px-3.5 py-2 shadow-float backdrop-blur-sm border border-line">
                <div className="flex items-center gap-2">
                  <Gauge size={16} className="text-accent-500" />
                  <div>
                    <p className="text-lg font-bold text-ink leading-none">{Math.round(nav.currentSpeed)}</p>
                    <p className="text-[10px] text-ink-faint uppercase font-medium">km/h</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Location Info Card Bottom Sheet (Google Maps Style) */}
          {selectedPin && (
            <div className="absolute bottom-0 left-0 right-0 z-30 rounded-t-3xl border-t border-line bg-surface-raised p-5 shadow-float animate-slide-in">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-600">
                    <MapPin size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">{selectedPin.label}</h3>
                    <p className="mt-0.5 text-xs text-ink-faint line-clamp-2">{selectedPin.address || 'Selected Location'}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-accent-600">
                      <span>{selectedPin.lat.toFixed(4)}°, {selectedPin.lng.toFixed(4)}°</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPin(null)}
                  className="rounded-full p-1.5 text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  data-testid="close-pin-card"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Action buttons */}
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-4">
                <button
                  onClick={() => {
                    const dest = { lat: selectedPin.lat, lng: selectedPin.lng, label: selectedPin.label };
                    nav.setDestination(dest);
                    void nav.startNavigation(dest);
                    setSelectedPin(null);
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-accent-300 py-2.5 text-xs font-semibold text-white transition-all hover:bg-accent-400 active:scale-95"
                  data-testid="pin-directions-btn"
                >
                  <Navigation size={16} />
                  Directions
                </button>
                <button
                  onClick={() => {
                    nav.addSavedPlace({
                      label: selectedPin.label,
                      latitude: selectedPin.lat,
                      longitude: selectedPin.lng,
                      type: 'favorite',
                    });
                    alert(`Saved "${selectedPin.label}" to Favorites!`);
                    setSelectedPin(null);
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface py-2.5 text-xs font-semibold text-ink transition-all hover:bg-surface-subtle active:scale-95"
                  data-testid="pin-save-btn"
                >
                  <Bookmark size={16} className="text-warning" />
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowStreetView(true);
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface py-2.5 text-xs font-semibold text-ink transition-all hover:bg-surface-subtle active:scale-95"
                  data-testid="pin-streetview-btn"
                >
                  <Eye size={16} className="text-accent-500" />
                  Street View
                </button>
                <button
                  onClick={() => {
                    const url = `https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`;
                    navigator.clipboard.writeText(url);
                    alert('Location link copied to clipboard!');
                  }}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface py-2.5 text-xs font-semibold text-ink transition-all hover:bg-surface-subtle active:scale-95"
                  data-testid="pin-share-btn"
                >
                  <Share2 size={16} className="text-ink-muted" />
                  Share
                </button>
              </div>
            </div>
          )}

          {/* From/To selection bar (when not navigating) */}
          {!isNavigating && !hasRoute && !selectedPin && (
            <div className="border-t border-line bg-surface-raised px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRouteSearch('from')}
                  className="flex flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-accent-300"
                  data-testid="search-from-btn"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100">
                    <div className="h-2 w-2 rounded-full bg-accent-400" />
                  </div>
                  <span className="truncate text-ink-muted">
                    {nav.gpsFix ? 'Current location' : 'Starting point'}
                  </span>
                </button>

                <button
                  onClick={nav.swapEndpoints}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink active:scale-90"
                  aria-label="Swap endpoints"
                >
                  <ArrowUpDown size={15} />
                </button>

                <button
                  onClick={() => setShowRouteSearch('to')}
                  className="flex flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:border-accent-300"
                  data-testid="search-to-btn"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100">
                    <Navigation size={12} className="text-accent-400" />
                  </div>
                  <span className="truncate text-ink-muted">
                    {nav.destination?.label ?? nav.home?.label ?? 'Choose destination'}
                  </span>
                </button>
              </div>
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
              {nav.phase === 'locating' ? 'LOCATING GPS…' : 'CALCULATING REAL-WORLD ROUTE…'}
            </div>
          )}

          {/* Travel mode + quick destinations (when idle) */}
          {(nav.phase === 'idle' || nav.phase === 'arrived') && !selectedPin && (
            <div className="border-t border-line bg-surface-raised px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Travel mode</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['drive', 'walk', 'bike'] as TravelMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => nav.setTravelMode(m)}
                    className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-medium transition-all ${
                      nav.travelMode === m
                        ? 'border-accent-300 bg-accent-50/40 text-accent-600'
                        : 'border-line text-ink-muted hover:bg-surface-subtle'
                    }`}
                    data-testid={`travel-mode-${m}`}
                  >
                    {m === 'walk' && <Footprints size={16} />}
                    {m === 'drive' && <Car size={16} />}
                    {m === 'bike' && <Bike size={16} />}
                    {m === 'walk' ? 'Walk' : m === 'drive' ? 'Drive' : 'Bike'}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <QuickChip
                  icon={<Home size={13} />}
                  label="Home"
                  onClick={() => {
                    if (nav.home) {
                      nav.setDestination({ lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label });
                      void nav.startNavigation({ lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label });
                    }
                  }}
                />
                {nav.savedPlaces
                  .filter((p) => p.type === 'work' || p.type === 'favorite')
                  .slice(0, 3)
                  .map((p) => (
                    <QuickChip
                      key={p.id}
                      icon={p.type === 'work' ? <Briefcase size={13} /> : <Star size={13} />}
                      label={p.label}
                      onClick={() => {
                        nav.setDestination({ lat: p.latitude, lng: p.longitude, label: p.label });
                        void nav.startNavigation({ lat: p.latitude, lng: p.longitude, label: p.label });
                      }}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Bottom action bar */}
          <div className="flex items-center gap-3 border-t border-line bg-surface-raised px-5 py-4 safe-bottom">
            {isNavigating ? (
              <button
                onClick={nav.stopNavigation}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-error px-6 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-95"
                data-testid="end-navigation-btn"
              >
                <Square size={16} fill="currentColor" />END NAVIGATION
              </button>
            ) : (
              <button
                onClick={() => {
                  const dest = nav.destination ?? (nav.home ? { lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label } : null);
                  if (dest) void nav.startNavigation(dest);
                }}
                disabled={nav.installing}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-300 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95 disabled:opacity-50"
                data-testid="start-navigation-btn"
              >
                <Navigation size={18} fill="currentColor" />
                {nav.route ? 'RESUME NAVIGATION' : 'START NAVIGATION'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Street View Mock Modal */}
      {showStreetView && selectedPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-surface p-6 shadow-float">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-lg font-bold text-ink">Street View Preview</h3>
              <button onClick={() => setShowStreetView(false)} className="rounded-full p-2 text-ink-muted hover:bg-surface-subtle">
                <X size={20} />
              </button>
            </div>
            <div className="relative mt-4 h-64 w-full overflow-hidden rounded-2xl bg-black/80 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
              {/* Simulated panoramic street view photo */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-accent-600/40 via-surface-raised/20 to-black/90 opacity-90" />
              <div className="z-20 text-center px-4">
                <Compass size={40} className="mx-auto text-accent-400 animate-pulse" />
                <p className="mt-3 text-sm font-bold text-white">{selectedPin.label}</p>
                <p className="mt-1 text-xs text-white/70">{selectedPin.address || 'Real-World Street View'}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowStreetView(false)}
                className="rounded-full bg-accent-300 px-6 py-2.5 text-xs font-semibold text-white transition-all hover:bg-accent-400"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      {showOfflineMaps && <OfflineMapsPanel onClose={() => setShowOfflineMaps(false)} />}
      {showHomeSetup && <HomeSetup onClose={() => setShowHomeSetup(false)} onProceed={() => setShowHomeSetup(false)} />}
      {typeof showRouteSearch === 'string' && (
        <RouteSearchPanel mode={showRouteSearch} onClose={() => setShowRouteSearch(null)} />
      )}
      {showSettings && <RouteSettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function NeedsSetup({ onSetup, gpsStatus }: { onSetup: () => void; gpsStatus: string }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center p-6">
      <Tulip size={28} className="absolute left-[15%] bottom-[18%] -rotate-12 text-accent-200 opacity-50" />
      <Tulip size={22} className="absolute right-[18%] bottom-[20%] rotate-12 text-accent-200 opacity-40" />
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-500">
        <Home size={36} />
      </div>
      <p className="mt-5 text-xl font-semibold text-ink">Set Your Home</p>
      <p className="mt-2 max-w-xs text-center text-sm text-ink-faint">
        Set your home location to enable real-world Google Maps routing & navigation.
      </p>
      <button
        onClick={onSetup}
        className="mt-6 flex items-center gap-2 rounded-full bg-accent-300 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-400 active:scale-95"
        data-testid="set-home-btn"
      >
        <MapPin size={18} /> Set home location
      </button>
      {gpsStatus === 'denied' && (
        <p className="mt-4 max-w-xs text-center text-xs text-error">
          Location permission denied. Enable location access in your browser settings.
        </p>
      )}
    </div>
  );
}

function QuickChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-all hover:border-accent-300 hover:text-ink active:scale-95"
    >
      {icon}
      {label}
    </button>
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
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-500">
          <TurnIcon type={instr.type} />
        </div>
        <div className="min-w-0 flex-1">
          {instr.type === 'arrive' ? (
            <p className="text-lg font-semibold text-ink">Arriving at {nav.destination?.label ?? nav.home?.label}</p>
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
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-ink">{formatDistance(nav.remainingDistance)}</p>
          <p className="text-xs text-ink-faint">{formatDuration(nav.remainingDuration)}</p>
        </div>
      </div>
    </div>
  );
}

function RouteSettingsPanel({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-slide-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col overflow-hidden border-l border-line bg-surface shadow-float animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="font-display text-xl text-ink">Route Options</h2>
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Route Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {(['fastest', 'shortest'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => nav.setRoutingPrefs({ routeType: t })}
                  className={`rounded-2xl border py-3 text-sm font-medium capitalize transition-all ${
                    nav.routingPrefs.routeType === t
                      ? 'border-accent-300 bg-accent-50/40 text-accent-600'
                      : 'border-line text-ink-muted hover:bg-surface-subtle'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Avoid</h3>
            <label className="flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-4">
              <span className="text-sm font-medium text-ink">Highways</span>
              <Switch checked={nav.routingPrefs.avoidHighways} onChange={(v) => nav.setRoutingPrefs({ avoidHighways: v })} />
            </label>
            <label className="mt-2.5 flex items-center justify-between rounded-3xl border border-line bg-surface-raised p-4">
              <span className="text-sm font-medium text-ink">Tolls</span>
              <Switch checked={nav.routingPrefs.avoidTolls} onChange={(v) => nav.setRoutingPrefs({ avoidTolls: v })} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent-300' : 'bg-line-strong'}`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function statusLabel(nav: ReturnType<typeof useNav>): string {
  switch (nav.phase) {
    case 'idle': return 'Ready · Google Maps Real-World';
    case 'locating': return 'Locating GPS…';
    case 'calculating': return 'Calculating route…';
    case 'navigating': return `${nav.regions.length} offline area${nav.regions.length !== 1 ? 's' : ''} · Live GPS`;
    case 'recalculating': return 'Recalculating route…';
    case 'off-coverage': return 'Outside coverage';
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

function Check({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
