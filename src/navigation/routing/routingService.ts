import type {
  RouteResult,
  RouteError,
  TravelMode,
  RoutingPreferences,
  OfflineRegionData,
} from '@/navigation/domain/types';
import { routeOfflineWithDiagnostics } from '@/navigation/routing/astar';

export interface RoutingService {
  requestRoute(params: {
    startLat: number;
    startLng: number;
    destLat: number;
    destLng: number;
    mode: TravelMode;
    regionIds: string[];
    regionPayloadsFallback?: OfflineRegionData[];
    prefs?: RoutingPreferences;
  }): Promise<{ route: RouteResult | null; error: RouteError | null }>;
  cancelActiveRoute(): void;
  dispose(): void;
}

export function createRoutingService(): RoutingService {
  let worker: Worker | null = null;
  let activeRequestId: string | null = null;
  let activeReject: ((reason: any) => void) | null = null;

  try {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' });
    }
  } catch {
    worker = null;
  }

  const cancelActiveRoute = () => {
    if (activeRequestId && worker) {
      worker.postMessage({ type: 'CANCEL_ROUTE', requestId: activeRequestId });
    }
    if (activeReject) {
      activeReject({ reason: 'cancelled', message: 'Route cancelled by user.' });
      activeReject = null;
    }
    activeRequestId = null;
  };

  const requestRoute: RoutingService['requestRoute'] = async (params) => {
    cancelActiveRoute();

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    activeRequestId = requestId;

    if (!worker) {
      // Main-thread synchronous fallback if Worker API is not supported (e.g. basic unit test setup)
      if (!params.regionPayloadsFallback || params.regionPayloadsFallback.length === 0) {
        return {
          route: null,
          error: { reason: 'no-region', message: 'No offline map regions available.' },
        };
      }
      return routeOfflineWithDiagnostics(
        params.startLat,
        params.startLng,
        params.destLat,
        params.destLng,
        params.mode,
        params.regionPayloadsFallback,
        { prefs: params.prefs }
      );
    }

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        if (activeRequestId === requestId) {
          cancelActiveRoute();
          resolve({
            route: null,
            error: { reason: 'worker-error', message: 'Route calculation timed out.' },
          });
        }
      }, 15000);

      activeReject = (err) => {
        clearTimeout(timeoutTimer);
        resolve({ route: null, error: err });
      };

      const handleMessage = (event: MessageEvent) => {
        const msg = event.data;
        if (msg.requestId !== requestId) return;

        clearTimeout(timeoutTimer);
        worker?.removeEventListener('message', handleMessage);

        if (activeRequestId === requestId) {
          activeRequestId = null;
          activeReject = null;
        }

        if (msg.type === 'ROUTE_RESULT') {
          resolve({ route: msg.route, error: null });
        } else if (msg.type === 'ROUTE_ERROR') {
          resolve({ route: null, error: msg.error });
        } else {
          resolve({
            route: null,
            error: { reason: 'worker-error', message: 'Unexpected worker message.' },
          });
        }
      };

      const activeWorker = worker;
      if (activeWorker) {
        activeWorker.addEventListener('message', handleMessage);
        activeWorker.postMessage({
          type: 'ROUTE_REQUEST',
          requestId,
          startLat: params.startLat,
          startLng: params.startLng,
          destLat: params.destLat,
          destLng: params.destLng,
          mode: params.mode,
          regionIds: params.regionIds,
          prefs: params.prefs,
        });
      }
    });
  };

  const dispose = () => {
    cancelActiveRoute();
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  return {
    requestRoute,
    cancelActiveRoute,
    dispose,
  };
}
