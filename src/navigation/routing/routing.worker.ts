import type {
  OfflineRegionData,
  TravelMode,
  RoutingPreferences,
} from '@/navigation/domain/types';
import { routeOfflineWithDiagnostics } from '@/navigation/routing/astar';

const DB_NAME = 'aanyaa_nav';
const DB_VERSION = 3;
const DATA_REGION_STORE = 'regionData';

interface WorkerLoadRegionsMsg {
  type: 'LOAD_REGIONS';
  regionIds: string[];
}

interface WorkerRouteRequestMsg {
  type: 'ROUTE_REQUEST';
  requestId: string;
  startLat: number;
  startLng: number;
  destLat: number;
  destLng: number;
  mode: TravelMode;
  regionIds: string[];
  prefs?: RoutingPreferences;
}

interface WorkerCancelRouteMsg {
  type: 'CANCEL_ROUTE';
  requestId: string;
}

type WorkerIncomingMsg = WorkerLoadRegionsMsg | WorkerRouteRequestMsg | WorkerCancelRouteMsg;

let activeRequestId: string | null = null;
let activePayloads: OfflineRegionData[] = [];
let loadedRegionIds: string[] = [];

async function loadRegionDataFromIdb(regionId: string): Promise<OfflineRegionData | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DATA_REGION_STORE)) {
          resolve(null);
          return;
        }
        const tx = db.transaction(DATA_REGION_STORE, 'readonly');
        const getReq = tx.objectStore(DATA_REGION_STORE).get(regionId);
        getReq.onsuccess = () => resolve((getReq.result as OfflineRegionData) ?? null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function ensurePayloadsLoaded(regionIds: string[]): Promise<OfflineRegionData[]> {
  const idsKey = regionIds.sort().join('|');
  const loadedKey = loadedRegionIds.sort().join('|');

  if (idsKey === loadedKey && activePayloads.length > 0) {
    return activePayloads;
  }

  const loaded: OfflineRegionData[] = [];
  for (const id of regionIds) {
    const data = await loadRegionDataFromIdb(id);
    if (data) {
      loaded.push(data);
    }
  }

  activePayloads = loaded;
  loadedRegionIds = regionIds;
  return activePayloads;
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMsg>) => {
  const msg = event.data;

  if (msg.type === 'LOAD_REGIONS') {
    await ensurePayloadsLoaded(msg.regionIds);
    self.postMessage({ type: 'REGIONS_LOADED', regionIds: msg.regionIds });
    return;
  }

  if (msg.type === 'CANCEL_ROUTE') {
    if (activeRequestId === msg.requestId) {
      activeRequestId = null;
    }
    return;
  }

  if (msg.type === 'ROUTE_REQUEST') {
    activeRequestId = msg.requestId;
    const currentId = msg.requestId;

    try {
      const payloads = await ensurePayloadsLoaded(msg.regionIds);

      if (activeRequestId !== currentId) {
        self.postMessage({
          type: 'ROUTE_ERROR',
          requestId: currentId,
          error: { reason: 'cancelled', message: 'Route calculation was cancelled.' },
        });
        return;
      }

      const result = routeOfflineWithDiagnostics(
        msg.startLat,
        msg.startLng,
        msg.destLat,
        msg.destLng,
        msg.mode,
        payloads,
        {
          prefs: msg.prefs,
          shouldAbort: () => activeRequestId !== currentId,
        }
      );

      if (activeRequestId !== currentId) {
        self.postMessage({
          type: 'ROUTE_ERROR',
          requestId: currentId,
          error: { reason: 'cancelled', message: 'Route calculation was cancelled.' },
        });
        return;
      }

      if (result.route) {
        self.postMessage({
          type: 'ROUTE_RESULT',
          requestId: currentId,
          route: result.route,
        });
      } else {
        self.postMessage({
          type: 'ROUTE_ERROR',
          requestId: currentId,
          error: result.error || { reason: 'no-road-path', message: 'No connected road path found.' },
        });
      }
    } catch (err) {
      self.postMessage({
        type: 'ROUTE_ERROR',
        requestId: currentId,
        error: { reason: 'worker-error', message: (err as Error)?.message || 'Worker route calculation error.' },
      });
    } finally {
      if (activeRequestId === currentId) {
        activeRequestId = null;
      }
    }
  }
};
