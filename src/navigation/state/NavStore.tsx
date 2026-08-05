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
  OfflineRegion,
  RegionPresetKm,
  RouteResult,
  TravelMode,
  SavedPlace,
  SavedPlaceType,
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
  listRegions,
  installRegion,
  deleteRegion,
  savePlace,
  listSavedPlaces,
  deletePlace,
  getRegionsForPoint,
} from '@/navigation/offline/regions';
import { routeOffline } from '@/navigation/routing/astar';
import { routeOnline } from '@/navigation/routing/onlineRouter';
import { maybeCacheArea, setAutoCacheEnabled } from '@/navigation/offline/autoCache';
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
  routeError: string | null;
  regions: OfflineRegion[];
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
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
  );
  const [phase, setPhase] = useState<NavPhase>('idle');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
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
  const [autoCacheEnabled, setAutoCacheEnabledState] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const watcherRef = useRef<GpsWatcher | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const offRouteCountRef = useRef(0);
  const phaseRef = useRef<NavPhase>('idle');
  const homeRef = useRef<HomeLocation | null>(home);
  const destRef = useRef<{ lat: number; lng: number; label: string } | null>(null);
  const routeRef = useRef<RouteResult | null>(null);
  const networkRef = useRef<NetworkStatus>(network);
  const regionsRef = useRef<OfflineRegion[]>([]);
  const travelModeRef = useRef<TravelMode>(travelMode);
  const routingPrefsRef = useRef<RoutingPreferences>(routingPrefs);
  const offRouteRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { homeRef.current = home; }, [home]);
  useEffect(() => { destRef.current = destination; }, [destination]);
  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { networkRef.current = network; }, [network]);
  useEffect(() => { regionsRef.current = regions; }, [regions]);
  useEffect(() => { travelModeRef.current = travelMode; }, [travelMode]);
  useEffect(() => { routingPrefsRef.current = routingPrefs; }, [routingPrefs]);
  useEffect(() => { offRouteRef.current = offRoute; }, [offRoute]);
  useEffect(() => { setAutoCacheEnabled(autoCacheEnabled); }, [autoCacheEnabled]);

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

  // Load regions and saved places on mount
  useEffect(() => {
    void (async () => {
      // Request persistent storage so downloaded maps survive browser cleanup
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          await navigator.storage.persist();
        }
      }
      const [r, places] = await Promise.all([listRegions(), listSavedPlaces()]);
      setRegions(r);
      setSavedPlaces(places);
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
    setPhase('idle');
    setRoute(null);
    setOffRoute(false);
    setRemainingDistance(0);
    setRemainingDuration(0);
    setNextInstructionIndex(0);
    setCurrentSpeed(0);
    setGpsStatus('idle');
  }, []);

  const recenter = useCallback(() => {
    setFollowMode(true);
    setRecenterSignal((s) => s + 1);
  }, []);

  const setFollowModeCb = useCallback((follow: boolean) => {
    setFollowMode(follow);
  }, []);

  const setAutoCacheCb = useCallback((enabled: boolean) => {
    setAutoCacheEnabledState(enabled);
  }, []);

  const startGpsOnly = useCallback(() => {
    if (watcherRef.current) return;
    watcherRef.current = startGpsWatch({
      onStatus: (s) => setGpsStatus(s),
      onFix: (fix) => {
        setGpsFix(fix);
        // Auto-cache surrounding area when online
        if (networkRef.current === 'online') {
          void maybeCacheArea(fix);
        }
        const p = phaseRef.current;
        if (p === 'navigating' || p === 'recalculating') {
          checkOffRouteRef.current(fix);
        }
      },
    });
  }, []);

  const startNavigation = useCallback(async (dest?: { lat: number; lng: number; label: string }) => {
    const rawTarget = dest ?? destRef.current ?? homeRef.current;
    if (!rawTarget) {
      setRouteError('Set a destination first.');
      return;
    }
    // Normalize: HomeLocation has latitude/longitude, dest has lat/lng
    const target: { lat: number; lng: number; label: string } =
      'latitude' in rawTarget
        ? { lat: rawTarget.latitude, lng: rawTarget.longitude, label: rawTarget.label }
        : { lat: rawTarget.lat, lng: rawTarget.lng, label: rawTarget.label };

    if (!dest && destRef.current === null) {
      setDestinationState(target);
      destRef.current = target;
    }

    setRouteError(null);
    setPhase('locating');
    setOffRoute(false);
    offRouteCountRef.current = 0;

    // Auto-save destination as a recent place (limit to 10)
    const isHome = homeRef.current &&
      Math.abs(homeRef.current.latitude - target.lat) < 0.001 &&
      Math.abs(homeRef.current.longitude - target.lng) < 0.001;
    if (!isHome && target.label !== 'Dropped pin') {
      const recentPlace: SavedPlace = {
        id: uid(),
        label: target.label,
        latitude: target.lat,
        longitude: target.lng,
        type: 'recent',
        createdAt: Date.now(),
      };
      void savePlace(recentPlace);
      setSavedPlaces((prev) => {
        const filtered = prev.filter((p) => p.type !== 'recent' ||
          !(Math.abs(p.latitude - target.lat) < 0.001 && Math.abs(p.longitude - target.lng) < 0.001));
        return [...filtered, recentPlace].filter((p) => p.type === 'recent').slice(-10).concat(
          filtered.filter((p) => p.type !== 'recent')
        );
      });
    }

    // Determine start point: use GPS if available, otherwise fall back to home
    const gpsStart = gpsFix;
    const homeStart = homeRef.current;
    const startLat = gpsStart?.latitude ?? homeStart?.latitude;
    const startLng = gpsStart?.longitude ?? homeStart?.longitude;

    if (startLat !== undefined && startLng !== undefined &&
        Number.isFinite(startLat) && Number.isFinite(startLng)) {
      // We have a valid start point — calculate route immediately
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
    }

    // Start/restart GPS watcher for live navigation
    watcherRef.current?.stop();
    watcherRef.current = startGpsWatch({
      onStatus: (s) => setGpsStatus(s),
      onFix: async (fix) => {
        setGpsFix(fix);
        if (networkRef.current === 'online') {
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

  const calculateRouteRef = useRef<(fix: GpsFix, dest: { lat: number; lng: number; label: string }, isReroute: boolean) => Promise<void>>(async () => {});
  const checkOffRouteRef = useRef<(fix: GpsFix) => void>(() => {});

  const calculateRoute = useCallback(
    async (fix: GpsFix, dest: { lat: number; lng: number; label: string }, isReroute: boolean) => {
      routeAbortRef.current?.abort();
      const controller = new AbortController();
      routeAbortRef.current = controller;

      // Validate coordinates before attempting routing
      if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) ||
          !Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) {
        setRouteError('Invalid coordinates. GPS may be unavailable.');
        setPhase('off-coverage');
        return;
      }

      setPhase('calculating');
      if (isReroute) setOffRoute(true);

      try {
        let result: RouteResult | null = null;

        // Try online routing first if available
        if (networkRef.current === 'online') {
          try {
            result = await routeOnline(
              fix.latitude,
              fix.longitude,
              dest.lat,
              dest.lng,
              travelModeRef.current,
            );
          } catch {
            result = null;
          }
        }

        // Offline routing — merge all installed regions
        if (!result) {
          const allRegions = regionsRef.current;
          if (allRegions.length > 0) {
            result = routeOffline(
              fix.latitude,
              fix.longitude,
              dest.lat,
              dest.lng,
              travelModeRef.current,
              allRegions,
              routingPrefsRef.current,
            );
          }
        }

        // If both online and offline failed, provide a straight-line fallback
        // so the user always gets *some* guidance
        if (!result) {
          const { haversineMeters: hav } = await import('@/navigation/gps/gps');
          const dist = hav(fix.latitude, fix.longitude, dest.lat, dest.lng);
          const speed = travelModeRef.current === 'drive' ? 40 :
            travelModeRef.current === 'bike' ? 15 : 5;
          const bearing = bearingBetween(fix.latitude, fix.longitude, dest.lat, dest.lng);
          const cardinal = cardinalFromBearing(bearing);
          result = {
            coordinates: [
              { lat: fix.latitude, lng: fix.longitude },
              { lat: dest.lat, lng: dest.lng },
            ],
            distanceMeters: Math.round(dist),
            durationSeconds: Math.round((dist / 1000 / speed) * 3600),
            instructions: [
              {
                type: 'depart' as const,
                roadName: `Head ${cardinal} toward ${dest.label}`,
                distanceMeters: Math.round(dist),
                cumulativeMeters: 0,
                point: { lat: fix.latitude, lng: fix.longitude },
                spoken: `Head ${cardinal} toward ${dest.label}`,
              },
              {
                type: 'arrive' as const,
                roadName: dest.label,
                distanceMeters: 0,
                cumulativeMeters: Math.round(dist),
                point: { lat: dest.lat, lng: dest.lng },
                spoken: `You have arrived at ${dest.label}`,
              },
            ],
            mode: travelModeRef.current,
            partial: {
              remainingStraightMeters: Math.round(dist),
              bearingDeg: Math.round(bearing),
              cardinal,
              reason: 'no-road-path',
              coveredMeters: 0,
            },
          };
        }

        setRoute(result);
        setOffRoute(false);
        offRouteCountRef.current = 0;
        setRemainingDistance(result.distanceMeters);
        setRemainingDuration(result.durationSeconds);
        setNextInstructionIndex(0);
        setPhase('navigating');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setRouteError(`Route calculation failed: ${String(e)}`);
          setPhase('off-coverage');
        }
      }
    },
    [],
  );

  useEffect(() => { calculateRouteRef.current = calculateRoute; }, [calculateRoute]);

  const checkOffRoute = useCallback(
    (fix: GpsFix) => {
      const currentRoute = routeRef.current;
      if (!currentRoute || currentRoute.coordinates.length < 2) return;

      // Snap to route
      const snap = snapToRoute(fix, currentRoute.coordinates);
      if (snap) {
        // Update snapped position for display
        setSnappedFix({
          ...fix,
          latitude: snap.lat,
          longitude: snap.lng,
        });

        // Off-route detection: distance from snapped point > 35m
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

      // Update speed
      if (fix.speed !== null && !isNaN(fix.speed)) {
        setCurrentSpeed(fix.speed * 3.6); // m/s → km/h
      }
    },
    [],
  );

  useEffect(() => { checkOffRouteRef.current = checkOffRoute; }, [checkOffRoute]);

  const updateProgress = useCallback(
    (fix: GpsFix, nearestIdx: number) => {
      const currentRoute = routeRef.current;
      if (!currentRoute || currentRoute.coordinates.length < 2) return;

      // Remaining distance from nearestIdx to end of route
      let rem = 0;
      for (let i = nearestIdx; i < currentRoute.coordinates.length - 1; i++) {
        rem += haversineMeters(
          currentRoute.coordinates[i].lat,
          currentRoute.coordinates[i].lng,
          currentRoute.coordinates[i + 1].lat,
          currentRoute.coordinates[i + 1].lng,
        );
      }
      // Add distance from current position to the snapped point on route
      const snapDist = haversineMeters(
        fix.latitude,
        fix.longitude,
        currentRoute.coordinates[nearestIdx].lat,
        currentRoute.coordinates[nearestIdx].lng,
      );
      rem += snapDist;
      setRemainingDistance(Math.round(rem));

      // Estimate remaining duration proportionally
      const totalDist = currentRoute.distanceMeters;
      const totalDur = currentRoute.durationSeconds;
      if (totalDist > 0) {
        setRemainingDuration(Math.round((rem / totalDist) * totalDur));
      }

      // Find next instruction: the first instruction whose cumulative distance
      // is greater than the distance we've already traveled
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

      // Arrived when within 25m of destination
      if (rem < 25) {
        setPhase('arrived');
      }
    },
    [],
  );

  const installOfflineRegion = useCallback(
    async (radiusKm: RegionPresetKm, label?: string, center?: { lat: number; lng: number }) => {
      const c = center ?? { lat: home?.latitude, lng: home?.longitude };
      if (c.lat === undefined || c.lng === undefined) {
        setRouteError('Set a center point for the download area first.');
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
        const r = await installRegion(
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
          },
        );
        setRegions((prev) => [...prev, r]);
        setDownloadProgress(null);
      } catch (e) {
        setRouteError(`Failed to download offline map: ${String(e)}`);
        setDownloadProgress(null);
      } finally {
        setInstalling(false);
      }
    },
    [home],
  );

  const removeOfflineRegion = useCallback(async (id: string) => {
    await deleteRegion(id);
    setRegions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addSavedPlace = useCallback(async (place: Omit<SavedPlace, 'id' | 'createdAt'>) => {
    const full: SavedPlace = { ...place, id: uid(), createdAt: Date.now() };
    await savePlace(full);
    setSavedPlaces((prev) => [...prev, full]);
    // If it's a home place, also update home
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
      autoCacheEnabled,
      recenterSignal,
      setHomeLocation,
      removeHome,
      setDestination,
      swapEndpoints,
      startGpsOnly,
      startNavigation,
      stopNavigation,
      setTravelMode,
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
      currentSpeed, savedPlaces, followMode, autoCacheEnabled, recenterSignal,
      setHomeLocation, removeHome, setDestination, swapEndpoints, startGpsOnly,
      startNavigation, stopNavigation, setTravelMode, setRoutingPrefsCb,
      installOfflineRegion, removeOfflineRegion, addSavedPlace, removeSavedPlace,
      setFollowModeCb, setAutoCacheCb, recenter,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function cardinalFromBearing(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(bearing / 45) % 8];
}
