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
  Sliders,
  Sparkles,
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
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  RotateCcw,
  Clock,
  Gauge,
  List,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { CanvasMap, type MapStyle } from '@/navigation/maps/CanvasMap';
import { CompassFallback } from '@/navigation/ui/CompassFallback';
import { OfflineMapsPanel } from '@/navigation/ui/OfflineMapsPanel';
import { HomeSetup } from '@/navigation/ui/HomeSetup';
import { RouteSearchPanel } from '@/navigation/ui/RouteSearchPanel';
import { VoiceSettingsModal } from '@/navigation/ui/VoiceSettingsModal';
import { speakPersonalized, loadVoiceSettings } from '@/navigation/voice/voiceService';
import { formatDistance, formatDuration } from '@/navigation/gps/gps';
import { searchPlaces, reverseGeocode } from '@/navigation/search/placeSearch';
import type { TravelMode } from '@/navigation/domain/types';

interface PoiItem {
  lat: number;
  lng: number;
  label: string;
  type: string;
}

function formatEtaTime(durationSeconds: number): string {
  const eta = new Date(Date.now() + durationSeconds * 1000);
  return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderTurnIcon(type: string, size = 22) {
  const t = (type || '').toLowerCase();
  if (t.includes('arrive') || t.includes('destination')) {
    return <MapPin size={size} className="text-emerald-400" />;
  }
  if (t.includes('left') || t.includes('fork-left')) {
    return <CornerUpLeft size={size} className="text-white" />;
  }
  if (t.includes('right') || t.includes('fork-right')) {
    return <CornerUpRight size={size} className="text-white" />;
  }
  if (t.includes('u-turn') || t.includes('uturn')) {
    return <RotateCcw size={size} className="text-white" />;
  }
  return <ArrowUp size={size} className="text-white" />;
}

export function NavigationScreen({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const [showOfflineMaps, setShowOfflineMaps] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showTurnList, setShowTurnList] = useState(false);
  const [showRouteSearch, setShowRouteSearch] = useState<'from' | 'to' | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('standard');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => loadVoiceSettings().enabled);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [mapRotation, setMapRotation] = useState(0);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let h: number | null = null;
      if ((e as any).webkitCompassHeading !== undefined) {
        h = (e as any).webkitCompassHeading;
      } else if (e.alpha !== null) {
        h = 360 - e.alpha;
      }
      if (h !== null && Number.isFinite(h)) {
        setDeviceHeading(h);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  const [selectedPin, setSelectedPin] = useState<{
    lat: number;
    lng: number;
    label: string;
    type: string;
    address?: string;
  } | null>(null);

  const [activePoiCategory, setActivePoiCategory] = useState<string | null>(null);
  const [poiMarkers, setPoiMarkers] = useState<PoiItem[]>([]);
  const [loadingPoi, setLoadingPoi] = useState(false);

  const needsSetup = !nav.home;
  const hasRoute = nav.route !== null;
  const isRouteUnavailable = nav.phase === 'route-unavailable';
  const isNavigating = nav.phase === 'navigating' || nav.phase === 'recalculating';

  const effectiveRotation = mapRotation !== 0
    ? mapRotation
    : (isNavigating ? (nav.gpsFix?.heading ?? deviceHeading ?? 0) : 0);

  useEffect(() => {
    nav.startGpsOnly();
    return () => {
      nav.stopNavigation();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSpokenIndexRef = useRef<number>(-1);
  const prevNavigatingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!prevNavigatingRef.current && isNavigating && nav.route) {
      prevNavigatingRef.current = true;
      const destLabel = nav.destination?.label || 'your destination';
      if (voiceEnabled) {
        speakPersonalized(`starting navigation to ${destLabel}. Have a safe journey!`);
      }
    } else if (!isNavigating) {
      prevNavigatingRef.current = false;
      lastSpokenIndexRef.current = -1;
    }
  }, [isNavigating, nav.destination, nav.route, voiceEnabled]);

  useEffect(() => {
    if (!voiceEnabled || !nav.route || nav.route.instructions.length === 0 || !isNavigating) return;
    const idx = Math.min(nav.nextInstructionIndex, nav.route.instructions.length - 1);
    if (idx !== lastSpokenIndexRef.current) {
      lastSpokenIndexRef.current = idx;
      const instr = nav.route.instructions[idx];
      if (instr) {
        let msg = '';
        if (instr.type === 'arrive') {
          msg = 'you have arrived at your destination!';
        } else if (instr.roadName) {
          msg = `in ${formatDistance(instr.distanceMeters || 150)}, turn towards ${instr.roadName}`;
        } else {
          msg = `in ${formatDistance(instr.distanceMeters || 150)}, follow the route ahead`;
        }
        speakPersonalized(msg);
      }
    }
  }, [nav.nextInstructionIndex, nav.route, voiceEnabled, isNavigating]);

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

  const handleMapTap = async (lat: number, lng: number) => {
    // Show pin immediately with fallback coordinates for instant responsiveness
    setSelectedPin({
      lat,
      lng,
      label: 'Dropped Pin',
      type: 'dropped-pin',
      address: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
    });

    // Check if place/road name can be resolved (offline vector lookup first, then online Nominatim reverse geocode)
    try {
      const placeInfo = await reverseGeocode(lat, lng, nav.regions);
      if (placeInfo && placeInfo.label) {
        setSelectedPin((prev) => {
          if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
          return {
            ...prev,
            label: placeInfo.label,
            address: placeInfo.address || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
          };
        });
      }
    } catch {
      // Graceful fallback to coordinates
    }
  };

  const setPinAsHome = () => {
    if (!selectedPin) return;
    nav.setHomeLocation({
      label: selectedPin.label,
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

  const currentManeuver = nav.route?.instructions[nav.nextInstructionIndex];
  const nextSubsequentManeuver = nav.route?.instructions[nav.nextInstructionIndex + 1];
  const speedKmh = nav.gpsFix?.speed && nav.gpsFix.speed > 0.5 ? Math.round(nav.gpsFix.speed * 3.6) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-fade-in" data-testid="navigation-screen">
      <header className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-3 safe-top shadow-sm z-30">
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
              <p className="text-[11px] leading-tight text-ink-faint">
                {nav.phase === 'navigating' ? 'Turn-by-turn Navigation' : nav.phase === 'locating' ? 'Locating...' : 'Ready'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (nav.home) {
                nav.setDestination({ lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label });
              } else {
                setShowHomeSetup(true);
              }
            }}
            data-testid="header-home-btn"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-subtle px-2.5 sm:px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
          >
            <Home size={14} className={nav.home ? 'text-accent-500' : 'text-ink-faint'} />
            <span className="max-w-[65px] sm:max-w-[90px] truncate">{nav.home ? nav.home.label : 'Set Home'}</span>
          </button>

          <div className="flex items-center gap-1 rounded-full border border-line bg-surface-subtle p-1">
            <button
              onClick={() => {
                const next = !voiceEnabled;
                setVoiceEnabled(next);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                voiceEnabled ? 'bg-accent-500 text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
              title={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
              data-testid="voice-toggle-btn"
            >
              {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button
              onClick={() => setShowVoiceSettings(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink transition-colors"
              title="Customize voice model & Aanya speech settings"
              data-testid="voice-settings-btn"
            >
              <Sliders size={14} />
            </button>
          </div>

          <button
            onClick={() => setShowOfflineMaps(true)}
            data-testid="offline-maps-btn"
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-subtle px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
          >
            <MapPin size={14} className="text-accent-500" />
            <span className="hidden sm:inline">{nav.regions.length} Maps</span>
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="relative flex-1 bg-surface-subtle min-h-0 w-full">
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
            rotation={effectiveRotation}
            onRotate={(r) => setMapRotation(r)}
            mapStyle={mapStyle}
            onTap={handleMapTap}
            onLongPress={(lat, lng) => handleMapTap(lat, lng)}
            onSelectPin={(pin) => setSelectedPin({ ...pin, address: `${pin.lat.toFixed(4)}°, ${pin.lng.toFixed(4)}°` })}
          />

          {!isNavigating && (
            <div className="absolute top-3 left-3 right-16 z-10 flex gap-2 overflow-x-auto pb-1 no-scrollbar md:left-auto md:right-16 md:max-w-xl">
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
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-md transition-all active:scale-95 ${
                      isActive
                        ? 'bg-accent-500 text-white'
                        : 'bg-surface/90 text-ink border border-line backdrop-blur-md hover:bg-surface'
                    } ${nav.network === 'offline' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icon size={13} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="absolute top-3 right-3 z-20 flex flex-col gap-2.5">
            <div className="relative">
              <button
                onClick={() => setShowLayerPicker(!showLayerPicker)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-lg backdrop-blur-md transition-all hover:bg-surface active:scale-95"
                title="Map layers"
              >
                <Layers size={18} />
              </button>

              {showLayerPicker && (
                <div className="absolute right-12 top-0 z-20 flex flex-col gap-1 rounded-2xl border border-line bg-surface/95 p-2 shadow-float backdrop-blur-md">
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

            <button
              onClick={() => {
                if (effectiveRotation !== 0) {
                  setMapRotation(0);
                } else {
                  setShowCompass(!showCompass);
                }
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-line shadow-lg backdrop-blur-md transition-all active:scale-95 ${
                effectiveRotation !== 0
                  ? 'bg-surface/95 text-ink hover:bg-surface'
                  : showCompass
                  ? 'bg-accent-500 text-white'
                  : 'bg-surface/90 text-ink hover:bg-surface'
              }`}
              title={effectiveRotation !== 0 ? 'Click to reset North' : 'Compass bearing view'}
              data-testid="compass-btn"
            >
              <div
                className="transition-transform duration-200"
                style={{ transform: `rotate(${-effectiveRotation}deg)` }}
              >
                {effectiveRotation !== 0 ? (
                  <div className="relative flex h-5 w-5 items-center justify-center">
                    <div className="absolute top-0.5 h-2.5 w-1 rounded-t-full bg-red-500 shadow-sm" />
                    <div className="absolute bottom-0.5 h-2.5 w-1 rounded-b-full bg-slate-400" />
                    <div className="h-1 w-1 rounded-full bg-white z-10" />
                  </div>
                ) : (
                  <Compass size={18} />
                )}
              </div>
            </button>

            <button
              onClick={() => nav.recenter()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-lg backdrop-blur-md transition-all hover:bg-surface active:scale-95"
              title="Recenter map"
              data-testid="recenter-btn"
            >
              <LocateFixed size={18} className={nav.followMode ? 'text-accent-500' : 'text-ink-muted'} />
            </button>
          </div>

          {(nav.phase === 'calculating' || nav.phase === 'locating' || loadingPoi) && (
            <div
              data-testid="aanyaa-loading-indicator"
              className="absolute top-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-accent-300 bg-surface/95 px-4 py-2 text-xs font-semibold text-accent-700 shadow-float backdrop-blur-md animate-fade-in"
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 text-white animate-spin">
                <Loader2 size={12} />
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

          {isNavigating && nav.route && currentManeuver && (
            <div
              data-testid="top-maneuver-card"
              className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-auto md:w-[390px] z-30 rounded-3xl bg-emerald-700 p-3.5 md:p-4 text-white shadow-2xl border border-emerald-600/60 backdrop-blur-xl animate-slide-down"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="flex h-11 w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner">
                    {renderTurnIcon(currentManeuver.type, 24)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg md:text-xl font-extrabold tracking-tight text-white">
                        In {formatDistance(currentManeuver.distanceMeters || 150)}
                      </span>
                    </div>
                    <p className="text-xs md:text-sm font-bold truncate text-white/95">
                      {currentManeuver.roadName ? `Follow ${currentManeuver.roadName}` : 'Continue on current route'}
                    </p>
                  </div>
                </div>

                {/* Quick 1-tap exit / end navigation button on top maneuver HUD */}
                <button
                  onClick={() => nav.stopNavigation()}
                  data-testid="top-exit-nav-btn"
                  className="flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-red-600 text-white transition-all active:scale-95 shadow-sm"
                  title="End Navigation"
                >
                  <X size={16} />
                </button>
              </div>

              {nextSubsequentManeuver && (
                <div className="mt-2 flex items-center gap-2 pt-2 border-t border-white/15 text-[11px] font-semibold text-white/80">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-white">
                    {renderTurnIcon(nextSubsequentManeuver.type, 11)}
                  </span>
                  <span className="truncate">
                    Then in {formatDistance(nextSubsequentManeuver.distanceMeters || 200)}: {nextSubsequentManeuver.roadName || 'Next turn'}
                  </span>
                </div>
              )}
            </div>
          )}

          {selectedPin && (
            <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-80 z-30 rounded-3xl border border-line bg-surface/95 p-4 shadow-float backdrop-blur-md animate-slide-up" data-testid="selected-pin-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-ink">{selectedPin.label}</h3>
                  {selectedPin.address && <p className="mt-0.5 text-xs text-ink-faint">{selectedPin.address}</p>}
                </div>
                <button onClick={() => setSelectedPin(null)} className="rounded-full p-1 text-ink-muted hover:bg-surface-subtle">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent-500 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-accent-600 active:scale-95 shadow-md"
                >
                  <Navigation size={13} fill="currentColor" /> Navigate Here
                </button>

                <button
                  onClick={setPinAsHome}
                  data-testid="set-pin-home-btn"
                  className="flex items-center justify-center gap-1 rounded-full border border-line bg-surface-subtle px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface"
                >
                  <Home size={13} className="text-accent-500" /> Home
                </button>

                <button
                  onClick={savePinToFavorites}
                  data-testid="save-pin-fav-btn"
                  className="flex items-center justify-center gap-1 rounded-full border border-line bg-surface-subtle px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface"
                >
                  <Star size={13} className="text-amber-500" /> Favorite
                </button>
              </div>
            </div>
          )}
        </div>

        {!isRouteUnavailable && (
          <div
            className={`w-full shrink-0 border-t border-line bg-surface/95 backdrop-blur-xl p-3.5 pb-6 safe-bottom shadow-lg z-20 ${
              isNavigating
                ? 'md:absolute md:bottom-4 md:left-4 md:w-[390px] md:rounded-3xl md:border md:border-line md:shadow-2xl md:p-5 md:safe-bottom-0'
                : 'md:absolute md:top-4 md:left-4 md:w-[390px] md:max-h-[calc(100vh-100px)] md:overflow-y-auto md:rounded-3xl md:border md:border-line md:shadow-2xl md:p-5 md:safe-bottom-0'
            }`}
            data-testid="navigation-dashboard-panel"
          >
            {isNavigating && nav.route ? (
              <div className="space-y-4" data-testid="active-nav-dashboard">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-bold text-ink">
                        {formatDistance(nav.remainingDistance)}
                      </span>
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatDuration(nav.remainingDuration)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-ink-faint" />
                        ETA {formatEtaTime(nav.remainingDuration)}
                      </span>
                      {speedKmh !== null && (
                        <span className="flex items-center gap-1 font-semibold text-accent-600">
                          <Gauge size={12} />
                          {speedKmh} km/h
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTurnList(!showTurnList)}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border border-line transition-colors ${
                        showTurnList ? 'bg-accent-500 text-white' : 'bg-surface-subtle text-ink hover:bg-surface'
                      }`}
                      title="Turn-by-turn steps"
                    >
                      <List size={18} />
                    </button>
                    <button
                      onClick={() => nav.stopNavigation()}
                      data-testid="stop-nav-btn"
                      className="flex items-center gap-1.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-2.5 shadow-md active:scale-95 text-xs transition-all"
                      title="End Navigation"
                    >
                      <X size={16} />
                      <span>End Route</span>
                    </button>
                  </div>
                </div>

                {showTurnList && (
                  <div className="max-h-60 overflow-y-auto space-y-2 rounded-2xl border border-line bg-surface-subtle/70 p-3 animate-fade-in no-scrollbar">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Route Directions ({nav.route.instructions.length} steps)</p>
                    {nav.route.instructions.map((step, idx) => {
                      const isCurrent = idx === nav.nextInstructionIndex;
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2.5 rounded-xl p-2 text-xs transition-colors ${
                            isCurrent ? 'bg-accent-100/90 font-semibold text-accent-800 border border-accent-300' : 'text-ink'
                          }`}
                        >
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface shadow-xs">
                            {renderTurnIcon(step.type, 12)}
                          </div>
                          <div className="flex-1">
                            <p>{step.roadName ? `Follow ${step.roadName}` : step.type}</p>
                            <span className="text-[10px] text-ink-faint">In {formatDistance(step.distanceMeters || 100)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : nav.destination || nav.route ? (
              <div className="space-y-4" data-testid="route-preview-card">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                      <MapPin size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-ink truncate">{nav.destination?.label || 'Selected Destination'}</h3>
                      {nav.route ? (
                        <p className="text-xs font-semibold text-emerald-600">
                          {formatDistance(nav.route.distanceMeters)} · {formatDuration(nav.route.durationSeconds)} (ETA {formatEtaTime(nav.route.durationSeconds)})
                        </p>
                      ) : (
                        <p className="text-xs text-accent-600 animate-pulse">Calculating road route…</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 rounded-2xl bg-surface-subtle p-1 border border-line">
                  {(['drive', 'bike', 'walk'] as TravelMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => nav.setTravelMode(m)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold capitalize transition-all ${
                        nav.travelMode === m
                          ? 'bg-accent-500 text-white shadow-sm'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {m === 'drive' && <Car size={14} />}
                      {m === 'bike' && <Bike size={14} />}
                      {m === 'walk' && <Footprints size={14} />}
                      <span>{m}</span>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => nav.startNavigation()}
                    data-testid="start-navigation-btn"
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-98"
                  >
                    <Navigation size={16} fill="currentColor" />
                    <span>Start Navigation</span>
                  </button>

                  <button
                    onClick={() => nav.setDestination(null)}
                    data-testid="clear-destination-btn"
                    className="rounded-2xl border border-line bg-surface-subtle px-4 py-3.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setShowRouteSearch('to')}
                  data-testid="search-route-btn"
                  className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface-subtle px-4 py-3 text-sm text-ink-muted shadow-xs transition-colors hover:bg-surface hover:border-line-strong text-left"
                >
                  <Search size={17} className="text-accent-500" />
                  <span className="flex-1 font-medium">Search destination or address…</span>
                </button>

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (needsSetup) {
                        setShowHomeSetup(true);
                      } else {
                        void nav.startNavigation();
                      }
                    }}
                    data-testid="start-get-me-home-btn"
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent-500 py-3 text-xs font-bold text-white shadow-md transition-all hover:bg-accent-600 active:scale-98"
                  >
                    <Home size={15} />
                    <span>{needsSetup ? 'Set Home Location' : 'Directions to Home'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-line pt-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Mode</span>
                  <div className="flex gap-1">
                    {(['drive', 'bike', 'walk'] as TravelMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => nav.setTravelMode(m)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                          nav.travelMode === m ? 'bg-accent-500 text-white' : 'bg-surface-subtle text-ink-muted hover:text-ink'
                        }`}
                      >
                        {m === 'drive' && <Car size={13} />}
                        {m === 'bike' && <Bike size={13} />}
                        {m === 'walk' && <Footprints size={13} />}
                        <span className="capitalize">{m}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isRouteUnavailable && nav.routeError && (
        <div className="border-t border-warning/40 bg-warning/5 p-4 safe-bottom shadow-lg z-30" data-testid="route-unavailable-panel">
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

      {showCompass && (
        <div className="fixed inset-0 z-50 bg-surface">
          <CompassFallback onClose={() => setShowCompass(false)} />
        </div>
      )}
      {showHomeSetup && <HomeSetup onClose={() => setShowHomeSetup(false)} onProceed={() => setShowHomeSetup(false)} />}
      {showOfflineMaps && <OfflineMapsPanel onClose={() => setShowOfflineMaps(false)} />}
      {showRouteSearch && <RouteSearchPanel mode={showRouteSearch} onClose={() => setShowRouteSearch(null)} />}
      {showVoiceSettings && (
        <VoiceSettingsModal
          onClose={() => setShowVoiceSettings(false)}
          onUpdate={(s) => setVoiceEnabled(s.enabled)}
        />
      )}
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
