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
} from '@/navigation/domain/types';
import { getHome, setHome, deleteHome } from '@/navigation/storage/homeStorage';
import { startGpsWatch, type GpsWatcher } from '@/navigation/gps/gps';
import {
  getInstalledRegion,
  installRegion,
  deleteRegion,
  estimateRegionSizeBytes,
} from '@/navigation/offline/regions';
import { routeOffline } from '@/navigation/routing/astar';
import { routeOnline } from '@/navigation/routing/onlineRouter';

interface NavState {
  home: HomeLocation | null;
  gpsFix: GpsFix | null;
  gpsStatus: GpsStatus;
  network: NetworkStatus;
  phase: NavPhase;
  route: RouteResult | null;
  routeError: string | null;
  region: OfflineRegion | null;
  installing: boolean;
  installProgress: string | null;
  travelMode: TravelMode;
  offRoute: boolean;
  remainingDistance: number;
  nextInstructionIndex: number;

  setHomeLocation: (home: HomeLocation) => void;
  removeHome: () => void;
  startGpsOnly: () => void;
  startNavigation: () => Promise<void>;
  stopNavigation: () => void;
  setTravelMode: (m: TravelMode) => void;
  installOfflineRegion: (radiusKm: RegionPresetKm) => Promise<void>;
  removeOfflineRegion: () => Promise<void>;
  recenter: () => void;
  recenterSignal: number;
}

const Ctx = createContext<NavState | null>(null);

export function useNav(): NavState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [home, setHomeState] = useState<HomeLocation | null>(getHome());
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [network, setNetwork] = useState<NetworkStatus>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline',
  );
  const [phase, setPhase] = useState<NavPhase>('idle');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [region, setRegion] = useState<OfflineRegion | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  const [offRoute, setOffRoute] = useState(false);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [nextInstructionIndex, setNextInstructionIndex] = useState(0);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const watcherRef = useRef<GpsWatcher | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const offRouteCountRef = useRef(0);
  const phaseRef = useRef<NavPhase>('idle');
  const homeRef = useRef<HomeLocation | null>(home);
  const routeRef = useRef<RouteResult | null>(null);
  const networkRef = useRef<NetworkStatus>(network);
  const regionRef = useRef<OfflineRegion | null>(null);
  const travelModeRef = useRef<TravelMode>(travelMode);
  const offRouteRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { homeRef.current = home; }, [home]);
  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { networkRef.current = network; }, [network]);
  useEffect(() => { regionRef.current = region; }, [region]);
  useEffect(() => { travelModeRef.current = travelMode; }, [travelMode]);
  useEffect(() => { offRouteRef.current = offRoute; }, [offRoute]);

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

  // Load installed region on mount
  useEffect(() => {
    void (async () => {
      const r = await getInstalledRegion();
      setRegion(r);
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

  const stopNavigation = useCallback(() => {
    watcherRef.current?.stop();
    watcherRef.current = null;
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    setPhase('idle');
    setRoute(null);
    setOffRoute(false);
    setRemainingDistance(0);
    setNextInstructionIndex(0);
    setGpsStatus('idle');
  }, []);

  const recenter = useCallback(() => {
    setRecenterSignal((s) => s + 1);
  }, []);

  const startGpsOnly = useCallback(() => {
    if (watcherRef.current) return; // already watching
    watcherRef.current = startGpsWatch({
      onStatus: (s) => setGpsStatus(s),
      onFix: (fix) => {
        setGpsFix(fix);
        const p = phaseRef.current;
        if (p === 'navigating' || p === 'recalculating') {
          checkOffRouteRef.current(fix);
        }
      },
    });
  }, []);

  const startNavigation = useCallback(async () => {
    const currentHome = homeRef.current;
    if (!currentHome) {
      setRouteError('Set your home location first.');
      return;
    }
    setRouteError(null);
    setPhase('locating');
    setOffRoute(false);
    offRouteCountRef.current = 0;

    watcherRef.current?.stop();
    watcherRef.current = startGpsWatch({
      onStatus: (s) => setGpsStatus(s),
      onFix: async (fix) => {
        setGpsFix(fix);
        const p = phaseRef.current;

        if (p === 'locating' || p === 'idle') {
          setPhase('calculating');
          await calculateRouteRef.current(fix, currentHome, false);
        } else if (p === 'navigating' || p === 'recalculating') {
          checkOffRouteRef.current(fix);
        }
      },
    });
  }, []);

  const calculateRouteRef = useRef<(fix: GpsFix, dest: HomeLocation, isReroute: boolean) => Promise<void>>(async () => {});
  const checkOffRouteRef = useRef<(fix: GpsFix) => void>(() => {});

  const calculateRoute = useCallback(
    async (fix: GpsFix, dest: HomeLocation, isReroute: boolean) => {
      routeAbortRef.current?.abort();
      const controller = new AbortController();
      routeAbortRef.current = controller;

      setPhase('calculating');
      if (isReroute) setOffRoute(true);

      try {
        let result: RouteResult | null = null;

        // Try online routing first if available (enhancement)
        if (networkRef.current === 'online') {
          try {
            result = await routeOnline(
              fix.latitude,
              fix.longitude,
              dest.latitude,
              dest.longitude,
              travelModeRef.current,
            );
          } catch {
            result = null; // fall through to offline
          }
        }

        // Offline routing (core requirement)
        if (!result && regionRef.current) {
          const r = regionRef.current;
          const inCoverage = isPointInRegion(fix.latitude, fix.longitude, r);
          const destInCoverage = isPointInRegion(
            dest.latitude,
            dest.longitude,
            r,
          );
          if (!inCoverage || !destInCoverage) {
            setPhase('off-coverage');
            setRoute(null);
            return;
          }
          result = routeOffline(
            fix.latitude,
            fix.longitude,
            dest.latitude,
            dest.longitude,
            travelModeRef.current,
            r,
          );
        }

        if (!result && networkRef.current === 'offline' && !regionRef.current) {
          setRouteError(
            'No offline map installed. Install a home area in Offline Maps first.',
          );
          setPhase('off-coverage');
          return;
        }

        if (!result) {
          setRouteError('Could not calculate a route.');
          setPhase('off-coverage');
          return;
        }

        setRoute(result);
        setOffRoute(false);
        offRouteCountRef.current = 0;
        setRemainingDistance(result.distanceMeters);
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

  // Keep ref in sync
  useEffect(() => { calculateRouteRef.current = calculateRoute; }, [calculateRoute]);

  const checkOffRoute = useCallback(
    (fix: GpsFix) => {
      const currentRoute = routeRef.current;
      if (!currentRoute || currentRoute.coordinates.length < 2) return;

      // Distance from current GPS to nearest point on route
      let minDist = Infinity;
      for (const c of currentRoute.coordinates) {
        const d = haversineMetersSimple(
          fix.latitude,
          fix.longitude,
          c.lat,
          c.lng,
        );
        if (d < minDist) minDist = d;
      }

      // Threshold: 50 meters, with persistence check (3 consecutive reads)
      if (minDist > 50) {
        offRouteCountRef.current += 1;
        if (offRouteCountRef.current >= 3 && !offRouteRef.current) {
          setOffRoute(true);
          setPhase('recalculating');
          void calculateRouteRef.current(fix, homeRef.current!, true);
        }
      } else {
        offRouteCountRef.current = 0;
        if (offRouteRef.current) {
          setOffRoute(false);
        }
        updateProgress(fix);
      }
    },
    [],
  );

  useEffect(() => { checkOffRouteRef.current = checkOffRoute; }, [checkOffRoute]);

  const updateProgress = useCallback(
    (fix: GpsFix) => {
      const currentRoute = routeRef.current;
      if (!currentRoute || currentRoute.coordinates.length < 2) return;

      // Find nearest route point index
      let minDist = Infinity;
      let nearestIdx = 0;
      for (let i = 0; i < currentRoute.coordinates.length; i++) {
        const c = currentRoute.coordinates[i];
        const d = haversineMetersSimple(
          fix.latitude,
          fix.longitude,
          c.lat,
          c.lng,
        );
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }

      // Remaining distance from nearestIdx to end
      let rem = 0;
      for (let i = nearestIdx; i < currentRoute.coordinates.length - 1; i++) {
        rem += haversineMetersSimple(
          currentRoute.coordinates[i].lat,
          currentRoute.coordinates[i].lng,
          currentRoute.coordinates[i + 1].lat,
          currentRoute.coordinates[i + 1].lng,
        );
      }
      setRemainingDistance(rem);

      // Find next instruction
      let instrIdx = 0;
      for (let i = 0; i < currentRoute.instructions.length; i++) {
        if (
          currentRoute.instructions[i].cumulativeMeters <=
          currentRoute.distanceMeters - rem + 20
        ) {
          instrIdx = i;
        }
      }
      setNextInstructionIndex(instrIdx);

      // Arrived?
      if (rem < 25) {
        setPhase('arrived');
      }
    },
    [],
  );

  const installOfflineRegion = useCallback(
    async (radiusKm: RegionPresetKm) => {
      if (!home) {
        setRouteError('Set your home location first.');
        return;
      }
      setInstalling(true);
      setInstallProgress('Connecting to OpenStreetMap…');
      setRouteError(null);
      try {
        const r = await installRegion(
          home.latitude,
          home.longitude,
          radiusKm,
          (msg: string) => setInstallProgress(msg),
        );
        setRegion(r);
        setInstallProgress(null);
      } catch (e) {
        setRouteError(`Failed to download offline map: ${String(e)}`);
      } finally {
        setInstalling(false);
      }
    },
    [home],
  );

  const removeOfflineRegion = useCallback(async () => {
    await deleteRegion();
    setRegion(null);
  }, []);

  const value = useMemo<NavState>(
    () => ({
      home,
      gpsFix,
      gpsStatus,
      network,
      phase,
      route,
      routeError,
      region,
      installing,
      installProgress,
      travelMode,
      offRoute,
      remainingDistance,
      nextInstructionIndex,
      setHomeLocation,
      removeHome,
      startGpsOnly,
      startNavigation,
      stopNavigation,
      setTravelMode,
      installOfflineRegion,
      removeOfflineRegion,
      recenter,
      recenterSignal,
    }),
    [
      home,
      gpsFix,
      gpsStatus,
      network,
      phase,
      route,
      routeError,
      region,
      installing,
      installProgress,
      travelMode,
      offRoute,
      remainingDistance,
      nextInstructionIndex,
      setHomeLocation,
      removeHome,
      startGpsOnly,
      startNavigation,
      stopNavigation,
      setTravelMode,
      installOfflineRegion,
      removeOfflineRegion,
      recenter,
      recenterSignal,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------ helpers ------------------------------ */

function isPointInRegion(
  lat: number,
  lng: number,
  region: OfflineRegion,
): boolean {
  // Check if point is within the bbox of the region
  const lats = Object.values(region.nodes).map((n) => n[0]);
  const lngs = Object.values(region.nodes).map((n) => n[1]);
  if (lats.length === 0) return false;
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

function haversineMetersSimple(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}