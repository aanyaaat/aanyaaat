import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type {
  GpsFix,
  GpsStatus,
  HomeLocation,
  NavPhase,
  NetworkStatus,
  OfflineRegionSummary,
  RegionPresetKm,
  RouteResult,
  RouteError,
  TravelMode,
  SavedPlace,
  DownloadProgress,
  RoutingPreferences,
} from '@/navigation/domain/types';
import { getHome, setHome, deleteHome } from '@/navigation/storage/homeStorage';
import {
  startGpsWatch,
  snapToRoute,
  haversineMeters,
  type GpsWatcher,
} from '@/navigation/gps/gps';
import {
  listRegionSummaries,
  installRegion,
  deleteRegionData,
  savePlace,
  listSavedPlaces,
  deletePlace,
  getRegionData,
  isAreaAlreadyCovered,
} from '@/navigation/offline/regions';
import { createRoutingService, type RoutingService } from '@/navigation/routing/routingService';
import { routeOnline } from '@/navigation/routing/onlineRouter';
import { maybeCacheArea, setAutoCacheEnabled, isAutoCacheEnabled } from '@/navigation/offline/autoCache';
import { uid } from '@/data/localDb';

interface NavState {
  home: HomeLocation | null;
  destination: { lat: number; lng: number; label: string } | null;
  gpsFix: GpsFix | null;
  snappedFix: GpsFix | null;
  gpsStatus: GpsStatus;
  network: NetworkStatus;
  phase: NavPhase;
  route: RouteResult | null;
  routeError: RouteError | null;
  regions: OfflineRegionSummary[];
  installing: boolean;
  downloadProgress: DownloadProgress | null;
  travelMode: TravelMode;
  routingPrefs: RoutingPreferences;
  offRoute: boolean;
  remainingDistance: number;
  remainingDuration: number;
  nextInstructionIndex: number;
  currentSpeed: number;
  savedPlaces: SavedPlace[];
  followMode: boolean;
  autoCacheEnabled: boolean;
  recenterSignal: number;

  setHomeLocation: (home: HomeLocation) => void;
  removeHome: () => void;
  setDestination: (dest: { lat: number; lng: number; label: string } | null) => void;
  swapEndpoints: () => void;
  startGpsOnly: () => void;
  startNavigation: (dest?: { lat: number; lng: number; label: string }) => Promise<void>;
  stopNavigation: () => void;
  setTravelMode: (m: TravelMode) => void;
  setRoutingPrefs: (prefs: Partial<RoutingPreferences>) => void;
  installOfflineRegion: (radiusKm: RegionPresetKm, label?: string, center?: { lat: number; lng: number }) => Promise<void>;
  removeOfflineRegion: (id: string) => Promise<void>;
  addSavedPlace: (place: Omit<SavedPlace, 'id' | 'createdAt'>) => Promise<void>;
  removeSavedPlace: (id: string) => Promise<void>;
  setFollowMode: (follow: boolean) => void;
  setAutoCache: (enabled: boolean) => void;
  recenter: () => void;
}

const Ctx = createContext<NavState | null>(null);

export function useNav(): NavState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [home, setHomeState] = useState<HomeLocation | null>(getHome());
  const [destination, setDestinationState] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [snappedFix, setSnappedFix] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [network, setNetwork] = useState<NetworkStatus>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'
  );
  const [phase, setPhase] = useState<NavPhase>('idle');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<RouteError | null>(null);
  const [regions, setRegions] = useState<OfflineRegionSummary[]>([]);
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('drive');
  const [routingPrefs, setRoutingPrefsState] = useState<RoutingPreferences>({
    avoidTolls: false,
    avoidHighways: false,
    routeType: 'fastest',
  });
  const [offRoute, setOffRoute] = useState(false);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingDuration, setRemainingDuration] = useState(0);
  const [nextInstructionIndex, setNextInstructionIndex] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [followMode, setFollowMode] = useState(true);
  const [autoCacheEnabledState, setAutoCacheEnabledState] = useState(isAutoCacheEnabled());
  const [recenterSignal, setRecenterSignal] = useState(0);

  const watcherRef = useRef<GpsWatcher | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routingServiceRef = useRef<RoutingService | null>(null);
  const offRouteCountRef = useRef(0);
  const phaseRef = useRef<NavPhase>('idle');
  const homeRef = useRef<HomeLocation | null>(home);
  const destRef = useRef<{ lat: number; lng: number; label: string } | null>(null);
  const routeRef = useRef<RouteResult | null>(null);
  const networkRef = useRef<NetworkStatus>(network);
  const regionsRef = useRef<OfflineRegionSummary[]>([]);
  const travelModeRef = useRef<TravelMode>(travelMode);
  const routingPrefsRef = useRef<RoutingPreferences>(routingPrefs);
  const offRouteRef = useRef(false);
  const gpsFixRef = useRef<GpsFix | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { homeRef.current = home; }, [home]);
  useEffect(() => { destRef.current = destination; }, [destination]);
  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { networkRef.current = network; }, [network]);
  useEffect(() => { regionsRef.current = regions; }, [regions]);
  useEffect(() => { travelModeRef.current = travelMode; }, [travelMode]);
  useEffect(() => { routingPrefsRef.current = routingPrefs; }, [routingPrefs]);
  useEffect(() => { offRouteRef.current = offRoute; }, [offRoute]);
  useEffect(() => { gpsFixRef.current = gpsFix; }, [gpsFix]);

  // Lazy-initialize Web Worker routing service
  const getRoutingService = useCallback((): RoutingService => {
    if (!routingServiceRef.current) {
      routingServiceRef.current = createRoutingService();
    }
    return routingServiceRef.current;
  }, []);

  useEffect(() => {
    return () => {
      routingServiceRef.current?.dispose();
      routingServiceRef.current = null;
    };
  }, []);

  // Network status tracking
  useEffect(() => {
    const onOnline = () => setNetwork('online');
    const onOffline = () => setNetwork('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const [regionsLoaded, setRegionsLoaded] = useState(false);

  // Load region summaries and saved places on mount
  useEffect(() => {
    void (async () => {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          await navigator.storage.persist();
        }
      }
      const [rSummaries, places] = await Promise.all([listRegionSummaries(), listSavedPlaces()]);
      setRegions(rSummaries);
      setSavedPlaces(places);
      setRegionsLoaded(true);
    })();
  }, []);

  const setHomeLocation = useCallback((h: HomeLocation) => {
    setHome(h);
    setHomeState(h);
  }, []);

  const removeHome = useCallback(() => {
    deleteHome();
    setHomeState(null);
  }, []);

  const setDestination = useCallback((dest: { lat: number; lng: number; label: string } | null) => {
    setDestinationState(dest);
    destRef.current = dest;
    if (dest) {
      const fix = gpsFixRef.current ?? (homeRef.current ? {
        latitude: homeRef.current.latitude,
        longitude: homeRef.current.longitude,
        accuracy: 50,
        heading: null,
        speed: null,
        timestamp: Date.now(),
      } : null);
      if (fix) {
        void calculateRouteRef.current(fix, dest, false);
      }
    } else {
      setRoute(null);
      setRouteError(null);
    }
  }, []);

  const swapEndpoints = useCallback(() => {
    if (!gpsFix || !destination) return;
    const oldDest = destination;
    setDestinationState({ lat: gpsFix.latitude, lng: gpsFix.longitude, label: 'Current location' });
    setHomeLocation({ label: oldDest.label, latitude: oldDest.lat, longitude: oldDest.lng });
  }, [gpsFix, destination, setHomeLocation]);

  const stopNavigation = useCallback(() => {
    watcherRef.current?.stop();
    watcherRef.current = null;
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    getRoutingService().cancelActiveRoute();
    setPhase('idle');
    setRoute(null);
    setRouteError(null);
    setOffRoute(false);
    setRemainingDistance(0);
    setRemainingDuration(0);
    setNextInstructionIndex(0);
    setCurrentSpeed(0);
    setGpsStatus('idle');
  }, [getRoutingService]);

  const recenter = useCallback(() => {
    setFollowMode(true);
    setRecenterSignal((s) => s + 1);
  }, []);

  const setFollowModeCb = useCallback((follow: boolean) => {
    setFollowMode(follow);
  }, []);

  const setAutoCacheCb = useCallback((enabled: boolean) => {
    setAutoCacheEnabledState(enabled);
    setAutoCacheEnabled(enabled);
  }, []);

  const startGpsOnly = useCallback(() => {
    if (watcherRef.current) return;
    watcherRef.current = startGpsWatch({
      onStatus: (s) => setGpsStatus(s),
      onFix: (fix) => {
        setGpsFix(fix);
        if (networkRef.current === 'online' && isAutoCacheEnabled()) {
          void maybeCacheArea(fix);
        }
        const p = phaseRef.current;
        if (p === 'navigating' || p === 'recalculating') {
          checkOffRouteRef.current(fix);
        }
      },
    });
  }, []);

  const calculateRouteRef = useRef<(fix: GpsFix, dest: { lat: number; lng: number; label: string }, isReroute: boolean) => Promise<void>>(async () => {});
  const checkOffRouteRef = useRef<(fix: GpsFix) => void>(() => {});

  const calculateRoute = useCallback(
    async (fix: GpsFix, dest: { lat: number; lng: number; label: string }, isReroute: boolean) => {
      routeAbortRef.current?.abort();
      const controller = new AbortController();
      routeAbortRef.current = controller;

      if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) ||
          !Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) {
        setRouteError({
          reason: 'invalid-coordinates',
          message: 'Invalid GPS or destination coordinates.',
        });
        setPhase('route-unavailable');
        return;
      }

      setPhase('calculating');
      setRouteError(null);
      if (isReroute) setOffRoute(true);

      try {
        let result: RouteResult | null = null;

        // Option 1: Online routing
        try {
          result = await routeOnline(
            fix.latitude,
            fix.longitude,
            dest.lat,
            dest.lng,
            travelModeRef.current,
            controller.signal
          );
        } catch {
          result = null;
        }

        // Option 2: Offline Worker routing over installed vector region data
        if (!result) {
          const installedRegionSummaries = regionsRef.current.filter((r) => r.status === 'ready');
          const regionIds = installedRegionSummaries.map((r) => r.id);

          if (regionIds.length > 0) {
            const regionPayloadsFallback = await Promise.all(
              regionIds.map((id) => getRegionData(id))
            ).then((list) => list.filter(Boolean) as any[]);

            const workerResult = await getRoutingService().requestRoute({
              startLat: fix.latitude,
              startLng: fix.longitude,
              destLat: dest.lat,
              destLng: dest.lng,
              mode: travelModeRef.current,
              regionIds,
              regionPayloadsFallback,
              prefs: routingPrefsRef.current,
            });

            if (workerResult.route) {
              result = workerResult.route;
            }
          }
        }

        if (result) {
          setRoute(result);
          setRouteError(null);
          setOffRoute(false);
          offRouteCountRef.current = 0;
          setRemainingDistance(result.distanceMeters);
          setRemainingDuration(result.durationSeconds);
          setNextInstructionIndex(0);
          setPhase(isReroute ? 'navigating' : 'idle');
        } else {
          setRoute(null);
          setRouteError({
            reason: 'no-road-path',
            message: 'No road route found between start and destination.',
            details: 'Ensure internet connection is active or download local area map in Offline Maps.',
          });
          setPhase('route-unavailable');
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setRoute(null);
          setRouteError({
            reason: 'worker-error',
            message: 'Route calculation error.',
            details: String(e),
          });
          setPhase('route-unavailable');
        }
      }
    },
    [getRoutingService]
  );

  useEffect(() => { calculateRouteRef.current = calculateRoute; }, [calculateRoute]);

  const startNavigation = useCallback(async (targetParam?: { lat: number; lng: number; label?: string } | SavedPlace) => {
    const dest = destRef.current;
    const rawTarget = targetParam ?? dest ?? (homeRef.current ? { lat: homeRef.current.latitude, lng: homeRef.current.longitude, label: homeRef.current.label } : null);

    const targetLat = rawTarget ? ('latitude' in rawTarget ? rawTarget.latitude : rawTarget.lat) : undefined;
    const targetLng = rawTarget ? ('longitude' in rawTarget ? rawTarget.longitude : rawTarget.lng) : undefined;
    const targetLabel = rawTarget ? rawTarget.label || 'Destination' : 'Destination';

    if (targetLat === undefined || targetLng === undefined || !Number.isFinite(targetLat) || !Number.isFinite(targetLng)) {
      setRouteError({
        reason: 'invalid-coordinates',
        message: 'Please set a valid destination first.',
      });
      setPhase('idle');
      return;
    }

    const target = { lat: targetLat, lng: targetLng, label: targetLabel };

    setDestinationState(target);
    destRef.current = target;

    // If route already exists for this destination, enter navigating phase immediately
    if (routeRef.current && phaseRef.current !== 'navigating') {
      setPhase('navigating');
      setFollowMode(true);
      setRecenterSignal(Date.now());
      setRouteError(null);
      return;
    }

    setRouteError(null);
    setPhase('locating');
    setOffRoute(false);
    offRouteCountRef.current = 0;

    const gpsStart = gpsFixRef.current;
    const homeStart = homeRef.current;
    const startLat = gpsStart?.latitude ?? homeStart?.latitude;
    const startLng = gpsStart?.longitude ?? homeStart?.longitude;

    if (startLat !== undefined && startLng !== undefined &&
        Number.isFinite(startLat) && Number.isFinite(startLng)) {
      const startFix: GpsFix = gpsStart ?? {
        latitude: startLat,
        longitude: startLng,
        accuracy: 50,
        heading: null,
        speed: null,
        timestamp: Date.now(),
      };
      setPhase('calculating');
      await calculateRouteRef.current(startFix, target, false);
      setPhase('navigating');
      setFollowMode(true);
      setRecenterSignal(Date.now());
    }

    watcherRef.current?.stop();
    watcherRef.current = startGpsWatch({
      onStatus: (s) => setGpsStatus(s),
      onFix: async (fix) => {
        setGpsFix(fix);
        if (networkRef.current === 'online' && isAutoCacheEnabled()) {
          void maybeCacheArea(fix);
        }
        const p = phaseRef.current;
        if (p === 'locating' || p === 'idle') {
          setPhase('calculating');
          await calculateRouteRef.current(fix, target, false);
        } else if (p === 'navigating' || p === 'recalculating') {
          checkOffRouteRef.current(fix);
        }
      },
    });
  }, [gpsFix]);

  const checkOffRoute = useCallback((fix: GpsFix) => {
    const currentRoute = routeRef.current;
    if (!currentRoute || currentRoute.coordinates.length < 2) return;

    const snap = snapToRoute(fix, currentRoute.coordinates);
    if (snap) {
      setSnappedFix({
        ...fix,
        latitude: snap.lat,
        longitude: snap.lng,
      });

      if (snap.distanceFromRoute > 35) {
        offRouteCountRef.current += 1;
        if (offRouteCountRef.current >= 3 && !offRouteRef.current) {
          setOffRoute(true);
          setPhase('recalculating');
          const rawDest = destRef.current ?? homeRef.current;
          if (rawDest) {
            const destTarget: { lat: number; lng: number; label: string } =
              'latitude' in rawDest
                ? { lat: rawDest.latitude, lng: rawDest.longitude, label: rawDest.label }
                : { lat: rawDest.lat, lng: rawDest.lng, label: rawDest.label };
            void calculateRouteRef.current(fix, destTarget, true);
          }
        }
      } else {
        offRouteCountRef.current = 0;
        if (offRouteRef.current) {
          setOffRoute(false);
        }
        updateProgress(fix, snap.segmentIndex);
      }
    }

    if (fix.speed !== null && !isNaN(fix.speed)) {
      setCurrentSpeed(fix.speed * 3.6);
    }
  }, []);

  useEffect(() => { checkOffRouteRef.current = checkOffRoute; }, [checkOffRoute]);

  const updateProgress = useCallback((fix: GpsFix, nearestIdx: number) => {
    const currentRoute = routeRef.current;
    if (!currentRoute || currentRoute.coordinates.length < 2) return;

    let rem = 0;
    for (let i = nearestIdx; i < currentRoute.coordinates.length - 1; i++) {
      rem += haversineMeters(
        currentRoute.coordinates[i].lat,
        currentRoute.coordinates[i].lng,
        currentRoute.coordinates[i + 1].lat,
        currentRoute.coordinates[i + 1].lng
      );
    }
    const snapDist = haversineMeters(
      fix.latitude,
      fix.longitude,
      currentRoute.coordinates[nearestIdx].lat,
      currentRoute.coordinates[nearestIdx].lng
    );
    rem += snapDist;
    setRemainingDistance(Math.round(rem));

    const totalDist = currentRoute.distanceMeters;
    const totalDur = currentRoute.durationSeconds;
    if (totalDist > 0) {
      setRemainingDuration(Math.round((rem / totalDist) * totalDur));
    }

    const traveled = Math.max(0, totalDist - rem);
    let instrIdx = 0;
    for (let i = 0; i < currentRoute.instructions.length; i++) {
      if (currentRoute.instructions[i].cumulativeMeters > traveled) {
        instrIdx = Math.max(0, i - 1);
        break;
      }
      instrIdx = i;
    }
    setNextInstructionIndex(instrIdx);

    if (rem < 25) {
      setPhase('arrived');
    }
  }, []);

  const installOfflineRegion = useCallback(
    async (radiusKm: RegionPresetKm, label?: string, center?: { lat: number; lng: number }) => {
      const c = center ?? { lat: home?.latitude, lng: home?.longitude };
      if (c.lat === undefined || c.lng === undefined) {
        setRouteError({
          reason: 'invalid-coordinates',
          message: 'Set a center point for the download area first.',
        });
        return;
      }
      setInstalling(true);
      setDownloadProgress({
        phase: 'downloading',
        message: 'Connecting to OpenStreetMap…',
        bytesReceived: 0,
        totalBytes: null,
        percent: 0,
        speed: 0,
        etaSeconds: null,
        regionId: '',
      });
      setRouteError(null);
      try {
        const summary = await installRegion(
          c.lat,
          c.lng,
          radiusKm,
          label ?? `Area · ${radiusKm} km`,
          (msg, bytesReceived, totalBytes) => {
            const received = bytesReceived ?? 0;
            const total = totalBytes ?? null;
            const percent = total ? (received / total) * 100 : 0;
            setDownloadProgress({
              phase: 'downloading',
              message: msg,
              bytesReceived: received,
              totalBytes: total,
              percent,
              speed: 0,
              etaSeconds: null,
              regionId: '',
            });
          }
        );
        setRegions((prev) => [...prev, summary]);
        setDownloadProgress(null);
      } catch (e) {
        setRouteError({
          reason: 'corrupt-region',
          message: `Failed to download offline map: ${String(e)}`,
        });
        setDownloadProgress(null);
      } finally {
        setInstalling(false);
      }
    },
    [home]
  );

  const removeOfflineRegion = useCallback(async (id: string) => {
    await deleteRegionData(id);
    setRegions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addSavedPlace = useCallback(async (place: Omit<SavedPlace, 'id' | 'createdAt'>) => {
    const full: SavedPlace = { ...place, id: uid(), createdAt: Date.now() };
    await savePlace(full);
    setSavedPlaces((prev) => [...prev, full]);
    if (place.type === 'home') {
      setHomeLocation({ label: place.label, latitude: place.latitude, longitude: place.longitude });
    }
  }, [setHomeLocation]);

  const removeSavedPlace = useCallback(async (id: string) => {
    await deletePlace(id);
    setSavedPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const setRoutingPrefsCb = useCallback((prefs: Partial<RoutingPreferences>) => {
    setRoutingPrefsState((prev) => ({ ...prev, ...prefs }));
  }, []);

  const setTravelModeCb = useCallback((mode: TravelMode) => {
    setTravelMode(mode);
    travelModeRef.current = mode;
    if (destRef.current) {
      const fix = gpsFixRef.current ?? (homeRef.current ? {
        latitude: homeRef.current.latitude,
        longitude: homeRef.current.longitude,
        accuracy: 50,
        heading: null,
        speed: null,
        timestamp: Date.now(),
      } : null);
      if (fix) {
        void calculateRouteRef.current(fix, destRef.current, false);
      }
    }
  }, []);

  // Intelligent 30km Auto-Download:
  // 1. On page load: If 0 maps exist, immediately download the 30km map around user position/home.
  // 2. Subsequent locations: If user moves to an entirely new location (no quadrant overlap / not already covered), download. Never download overlapping/same quadrants twice.
  const autoDownloadInProgressRef = useRef(false);

  useEffect(() => {
    if (!regionsLoaded || installing || networkRef.current === 'offline' || autoDownloadInProgressRef.current) return;

    const targetLat = gpsFix?.latitude ?? home?.latitude ?? 28.6139;
    const targetLng = gpsFix?.longitude ?? home?.longitude ?? 77.2090;

    // Case 1: On page load, no maps exist -> Immediately download initial 30km map
    if (regions.length === 0) {
      autoDownloadInProgressRef.current = true;
      const label = home?.label ? `${home.label} Area (30km)` : 'Local Area (30km)';
      void installOfflineRegion(30, label, { lat: targetLat, lng: targetLng }).finally(() => {
        autoDownloadInProgressRef.current = false;
      });
      return;
    }

    // Case 2: Check if current position is an entirely new location with no quadrant/region coverage
    if (regions.length > 0) {
      const alreadyCovered = isAreaAlreadyCovered(targetLat, targetLng, regions, 30);
      if (!alreadyCovered) {
        // Completely new location / no same quadrants -> download new 30km region
        autoDownloadInProgressRef.current = true;
        void installOfflineRegion(30, `Area (${targetLat.toFixed(2)}°, ${targetLng.toFixed(2)}°)`, {
          lat: targetLat,
          lng: targetLng,
        }).finally(() => {
          autoDownloadInProgressRef.current = false;
        });
      }
    }
  }, [regionsLoaded, regions, gpsFix, home, installing, installOfflineRegion]);

  const value = useMemo<NavState>(
    () => ({
      home,
      destination,
      gpsFix,
      snappedFix,
      gpsStatus,
      network,
      phase,
      route,
      routeError,
      regions,
      installing,
      downloadProgress,
      travelMode,
      routingPrefs,
      offRoute,
      remainingDistance,
      remainingDuration,
      nextInstructionIndex,
      currentSpeed,
      savedPlaces,
      followMode,
      autoCacheEnabled: autoCacheEnabledState,
      recenterSignal,
      setHomeLocation,
      removeHome,
      setDestination,
      swapEndpoints,
      startGpsOnly,
      startNavigation,
      stopNavigation,
      setTravelMode: setTravelModeCb,
      setRoutingPrefs: setRoutingPrefsCb,
      installOfflineRegion,
      removeOfflineRegion,
      addSavedPlace,
      removeSavedPlace,
      setFollowMode: setFollowModeCb,
      setAutoCache: setAutoCacheCb,
      recenter,
    }),
    [
      home, destination, gpsFix, snappedFix, gpsStatus, network, phase, route,
      routeError, regions, installing, downloadProgress, travelMode, routingPrefs,
      offRoute, remainingDistance, remainingDuration, nextInstructionIndex,
      currentSpeed, savedPlaces, followMode, autoCacheEnabledState, recenterSignal,
      setHomeLocation, removeHome, setDestination, swapEndpoints, startGpsOnly,
      startNavigation, stopNavigation, setTravelMode, setRoutingPrefsCb,
      installOfflineRegion, removeOfflineRegion, addSavedPlace, removeSavedPlace,
      setFollowModeCb, setAutoCacheCb, recenter,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
