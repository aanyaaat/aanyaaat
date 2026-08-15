import type {
  OfflineRegion,
  OfflineRegionSummary,
  OfflineRegionData,
  RegionPresetKm,
  SavedPlace,
} from '@/navigation/domain/types';
import { fetchOsmBbox } from '@/navigation/offline/overpass';

const DB_NAME = 'aanyaa_nav';
const DB_VERSION = 3;

const META_REGION_STORE = 'regionMeta';
const DATA_REGION_STORE = 'regionData';
const DOWNLOAD_JOB_STORE = 'downloadJobs';
const LEGACY_REGION_STORE = 'regions';
const PLACE_STORE = 'places';
const META_STORE = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(META_REGION_STORE)) {
        const store = db.createObjectStore(META_REGION_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(DATA_REGION_STORE)) {
        db.createObjectStore(DATA_REGION_STORE, { keyPath: 'regionId' });
      }

      if (!db.objectStoreNames.contains(DOWNLOAD_JOB_STORE)) {
        db.createObjectStore(DOWNLOAD_JOB_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(PLACE_STORE)) {
        const store = db.createObjectStore(PLACE_STORE, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }

      // Migrate from legacy single-record 'regions' store if upgrading from v1/v2
      if (oldVersion > 0 && oldVersion < 3 && db.objectStoreNames.contains(LEGACY_REGION_STORE)) {
        const tx = req.transaction;
        if (tx) {
          const legacyStore = tx.objectStore(LEGACY_REGION_STORE);
          const metaStore = tx.objectStore(META_REGION_STORE);
          const dataStore = tx.objectStore(DATA_REGION_STORE);

          const getAllReq = legacyStore.getAll();
          getAllReq.onsuccess = () => {
            const records = getAllReq.result as any[];
            if (Array.isArray(records)) {
              for (const record of records) {
                if (!record || !record.id) continue;
                const summary: OfflineRegionSummary = {
                  id: record.id,
                  label: record.label || 'Offline Region',
                  centerLat: record.centerLat || 0,
                  centerLng: record.centerLng || 0,
                  radiusKm: record.radiusKm || 10,
                  createdAt: record.createdAt || Date.now(),
                  updatedAt: record.updatedAt || Date.now(),
                  bbox: record.bbox || { south: -90, west: -180, north: 90, east: 180 },
                  sizeBytes: record.sizeBytes || 0,
                  version: record.version || 1,
                  roadCount: Array.isArray(record.roads) ? record.roads.length : 0,
                  poiCount: Array.isArray(record.pois) ? record.pois.length : 0,
                  status: 'ready',
                };
                const data: OfflineRegionData = {
                  regionId: record.id,
                  nodes: record.nodes || {},
                  edges: record.edges || [],
                  roads: record.roads || [],
                  pois: record.pois || [],
                  version: record.version || 1,
                };

                metaStore.put(summary);
                dataStore.put(data);
              }
            }
          };
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
  }
}

/** Reset cached db promise if database connection drops or resets in tests */
export function resetDbCache(): void {
  void closeDb();
}

/* --------------------------- Storage Quota & Compression --------------------------- */

export async function compressData(obj: any): Promise<any> {
  if (typeof CompressionStream !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      const jsonStr = JSON.stringify(obj);
      const stream = new Blob([jsonStr]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
      const response = new Response(compressedStream);
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      return obj;
    }
  }
  return obj;
}

export async function decompressData<T = any>(data: any): Promise<T | null> {
  if (!data) return null;
  if (data instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer)) {
    if (typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const stream = new Blob([data]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'));
        const response = new Response(decompressedStream);
        const text = await response.text();
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    }
  }
  return data as T;
}

export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if a target location / quadrant is already covered by existing offline map regions.
 * Avoids redundant downloads of overlapping or identical quadrants.
 */
export function isAreaAlreadyCovered(
  targetLat: number,
  targetLng: number,
  existingRegions: OfflineRegionSummary[],
  coverageRadiusKm = 30
): boolean {
  if (!existingRegions || existingRegions.length === 0) return false;

  for (const region of existingRegions) {
    const distKm = calculateDistanceKm(targetLat, targetLng, region.centerLat, region.centerLng);
    // If user is within 85% of coverage radius of any region center, it is covered
    if (distKm < (region.radiusKm || coverageRadiusKm) * 0.85) {
      return true;
    }

    // If within bounding box (with slight buffer)
    if (
      region.bbox &&
      targetLat >= region.bbox.south - 0.02 &&
      targetLat <= region.bbox.north + 0.02 &&
      targetLng >= region.bbox.west - 0.02 &&
      targetLng <= region.bbox.east + 0.02
    ) {
      return true;
    }
  }

  return false;
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number; free: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1024 * 1024 * 1024; // 1 GB fallback
      const free = Math.max(0, quota - usage);
      return { usage, quota, free };
    } catch {
      // Fallback
    }
  }
  return { usage: 0, quota: 1024 * 1024 * 1024, free: 1024 * 1024 * 1024 };
}

export async function canStoreBytes(requiredBytes: number): Promise<boolean> {
  const { free } = await getStorageEstimate();
  // Safe buffer: require at least requiredBytes + 10MB free space
  return free > requiredBytes + 10 * 1024 * 1024;
}

/* --------------------------- Region Summaries & Payloads --------------------------- */

export async function listRegionSummaries(): Promise<OfflineRegionSummary[]> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(META_REGION_STORE, 'readonly');
      const req = tx.objectStore(META_REGION_STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineRegionSummary[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getRegionSummary(id: string): Promise<OfflineRegionSummary | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(META_REGION_STORE, 'readonly');
      const req = tx.objectStore(META_REGION_STORE).get(id);
      req.onsuccess = () => resolve((req.result as OfflineRegionSummary) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function getRegionData(regionId: string): Promise<OfflineRegionData | null> {
  try {
    const db = await getDb();
    const rawRecord = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(DATA_REGION_STORE, 'readonly');
      const req = tx.objectStore(DATA_REGION_STORE).get(regionId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });

    if (!rawRecord) return null;

    if (rawRecord.compressed) {
      const decompressed = await decompressData<OfflineRegionData>(rawRecord.compressed);
      return decompressed;
    }

    return rawRecord as OfflineRegionData;
  } catch {
    return null;
  }
}

export function validateRegionData(data: OfflineRegionData | null | undefined): boolean {
  if (!data || !data.regionId) return false;
  if (typeof data.nodes !== 'object' || data.nodes === null) return false;
  if (!Array.isArray(data.edges)) return false;
  if (!Array.isArray(data.roads)) return false;
  if (!Array.isArray(data.pois)) return false;
  return true;
}

export async function saveRegionData(
  summary: OfflineRegionSummary,
  data: OfflineRegionData
): Promise<void> {
  const db = await getDb();
  const compressed = await compressData(data);
  const dataRecord = compressed !== data
    ? { regionId: data.regionId, compressed, version: data.version }
    : data;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_REGION_STORE, DATA_REGION_STORE], 'readwrite');
    tx.objectStore(META_REGION_STORE).put(summary);
    tx.objectStore(DATA_REGION_STORE).put(dataRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRegionData(id: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_REGION_STORE, DATA_REGION_STORE], 'readwrite');
      tx.objectStore(META_REGION_STORE).delete(id);
      tx.objectStore(DATA_REGION_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function deleteAllNavigationData(): Promise<void> {
  const summaries = await listRegionSummaries();
  for (const s of summaries) {
    await deleteRegionData(s.id);
  }
}

/* --------------------------- Composite API (Backward Compat) --------------------------- */

export async function listRegions(): Promise<OfflineRegion[]> {
  const summaries = await listRegionSummaries();
  const result: OfflineRegion[] = [];

  for (const s of summaries) {
    const data = await getRegionData(s.id);
    if (data && validateRegionData(data)) {
      result.push({
        ...s,
        nodes: data.nodes,
        edges: data.edges,
        roads: data.roads,
        pois: data.pois,
      });
    } else {
      // Mark region as corrupt if data payload is missing or invalid
      s.status = 'corrupt';
    }
  }

  return result;
}

export async function getRegion(id: string): Promise<OfflineRegion | null> {
  const s = await getRegionSummary(id);
  if (!s) return null;
  const data = await getRegionData(id);
  if (!data || !validateRegionData(data)) return null;

  return {
    ...s,
    nodes: data.nodes,
    edges: data.edges,
    roads: data.roads,
    pois: data.pois,
  };
}

export async function saveRegion(region: OfflineRegion): Promise<void> {
  const summary: OfflineRegionSummary = {
    id: region.id,
    label: region.label,
    placeName: region.placeName,
    keyAreas: region.keyAreas,
    centerLat: region.centerLat,
    centerLng: region.centerLng,
    radiusKm: region.radiusKm,
    createdAt: region.createdAt,
    updatedAt: region.updatedAt,
    bbox: region.bbox,
    sizeBytes: region.sizeBytes,
    version: region.version,
    roadCount: region.roads?.length || 0,
    poiCount: region.pois?.length || 0,
    status: region.status || 'ready',
    auto: region.auto,
  };

  const data: OfflineRegionData = {
    regionId: region.id,
    nodes: region.nodes || {},
    edges: region.edges || [],
    roads: region.roads || [],
    pois: region.pois || [],
    version: region.version || 1,
  };

  await saveRegionData(summary, data);
}

export async function deleteRegion(id: string): Promise<void> {
  await deleteRegionData(id);
}

export async function deleteAllRegions(): Promise<void> {
  await deleteAllNavigationData();
}

export async function findRegionForPoint(
  lat: number,
  lng: number
): Promise<OfflineRegionSummary | null> {
  const summaries = await listRegionSummaries();
  for (const r of summaries) {
    if (
      r.status === 'ready' &&
      lat >= r.bbox.south &&
      lat <= r.bbox.north &&
      lng >= r.bbox.west &&
      lng <= r.bbox.east
    ) {
      return r;
    }
  }
  return null;
}

export async function getRegionsForPoint(
  lat: number,
  lng: number
): Promise<OfflineRegionSummary[]> {
  const summaries = await listRegionSummaries();
  return summaries.filter(
    (r) =>
      r.status === 'ready' &&
      lat >= r.bbox.south &&
      lat <= r.bbox.north &&
      lng >= r.bbox.west &&
      lng <= r.bbox.east
  );
}

/* --------------------------- Saved Places --------------------------- */

export async function listSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PLACE_STORE, 'readonly');
      const req = tx.objectStore(PLACE_STORE).getAll();
      req.onsuccess = () => resolve((req.result as SavedPlace[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function savePlace(place: SavedPlace): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PLACE_STORE, 'readwrite');
    tx.objectStore(PLACE_STORE).put(place);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePlace(id: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PLACE_STORE, 'readwrite');
      tx.objectStore(PLACE_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function getPlacesByType(type: SavedPlace['type']): Promise<SavedPlace[]> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PLACE_STORE, 'readonly');
      const idx = tx.objectStore(PLACE_STORE).index('type');
      const req = idx.getAll(type);
      req.onsuccess = () => resolve((req.result as SavedPlace[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/* --------------------------- Meta --------------------------- */

export async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/* --------------------------- Download Checkpoints --------------------------- */

export interface DownloadJobCheckpoint {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusKm: RegionPresetKm;
  label: string;
  south: number;
  west: number;
  north: number;
  east: number;
  completedQuadrants: number[];
  quadrantElements: Record<number, any[]>;
  timestamp: number;
}

export async function saveDownloadJobCheckpoint(job: DownloadJobCheckpoint): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DOWNLOAD_JOB_STORE, 'readwrite');
      tx.objectStore(DOWNLOAD_JOB_STORE).put(job);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function getDownloadJobCheckpoint(id: string): Promise<DownloadJobCheckpoint | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DOWNLOAD_JOB_STORE, 'readonly');
      const req = tx.objectStore(DOWNLOAD_JOB_STORE).get(id);
      req.onsuccess = () => resolve((req.result as DownloadJobCheckpoint) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearDownloadJobCheckpoint(id: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DOWNLOAD_JOB_STORE, 'readwrite');
      tx.objectStore(DOWNLOAD_JOB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/* --------------------------- Install --------------------------- */

export function estimateRegionSizeBytes(radiusKm: RegionPresetKm): number {
  const areaKm2 = Math.PI * radiusKm * radiusKm;
  const roadKm = areaKm2 * 1.5;
  const segments = (roadKm * 1000) / 50;
  const bytesPerSegment = 80;
  const roadRenderBytes = segments * 120;
  const poiBytes = 200 * 50;
  return Math.round(segments * bytesPerSegment + roadRenderBytes + poiBytes);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function installRegion(
  centerLat: number,
  centerLng: number,
  radiusKm: RegionPresetKm,
  label: string,
  onProgress?: (msg: string, bytesReceived?: number, totalBytes?: number | null) => void,
  signal?: AbortSignal
): Promise<OfflineRegionSummary> {
  onProgress?.('Calculating download area…');

  const estimatedSize = estimateRegionSizeBytes(radiusKm);
  const okToStore = await canStoreBytes(estimatedSize);
  if (!okToStore) {
    throw new Error('Storage quota exceeded or insufficient disk space.');
  }

  const deg = radiusKm / 111 + 0.01;
  const south = centerLat - deg;
  const north = centerLat + deg;
  const west = centerLng - deg;
  const east = centerLng + deg;

  onProgress?.('Downloading road network from OpenStreetMap…');
  const rawRegion = await fetchOsmBbox(south, west, north, east, onProgress, signal);

  // Extract major named roads and localities to populate keyAreas
  const areaNameCounts = new Map<string, number>();
  for (const road of rawRegion.roads || []) {
    if (road.name && !road.name.toLowerCase().includes('unnamed') && road.name.length > 2) {
      const clean = road.name.trim();
      areaNameCounts.set(clean, (areaNameCounts.get(clean) || 0) + 1);
    }
  }
  for (const poi of rawRegion.pois || []) {
    if (poi.name && poi.name.length > 2) {
      const clean = poi.name.trim();
      areaNameCounts.set(clean, (areaNameCounts.get(clean) || 0) + 1);
    }
  }

  const sortedKeyAreas = Array.from(areaNameCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  // Try fast reverse lookup for exact locality/town name
  let resolvedPlaceName = '';
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${centerLat}&lon=${centerLng}&zoom=14&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const addr = json.address || {};
        const town = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || addr.county;
        const state = addr.state || '';
        if (town) {
          resolvedPlaceName = state ? `${town}, ${state}` : town;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!resolvedPlaceName && sortedKeyAreas.length > 0) {
    resolvedPlaceName = `${sortedKeyAreas[0]} Area`;
  }

  let finalLabel = label;
  if (!label || label.startsWith('Area ·') || label.startsWith('Local Area') || label.startsWith('Area (')) {
    if (resolvedPlaceName) {
      finalLabel = `${resolvedPlaceName.split(',')[0]} (${radiusKm}km)`;
    } else {
      finalLabel = `Region (${centerLat.toFixed(2)}°, ${centerLng.toFixed(2)}°) · ${radiusKm}km`;
    }
  }

  const regionId = `region_${Date.now()}_${Math.round(centerLat * 1000)}_${Math.round(centerLng * 1000)}`;

  const summary: OfflineRegionSummary = {
    id: regionId,
    label: finalLabel,
    placeName: resolvedPlaceName || undefined,
    keyAreas: sortedKeyAreas.length > 0 ? sortedKeyAreas : undefined,
    centerLat,
    centerLng,
    radiusKm,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bbox: { south, west, north, east },
    sizeBytes: rawRegion.sizeBytes || estimatedSize,
    version: 1,
    roadCount: rawRegion.roads?.length || 0,
    poiCount: rawRegion.pois?.length || 0,
    status: 'ready',
  };

  const data: OfflineRegionData = {
    regionId,
    nodes: rawRegion.nodes || {},
    edges: rawRegion.edges || [],
    roads: rawRegion.roads || [],
    pois: rawRegion.pois || [],
    version: 1,
  };

  onProgress?.('Saving to device…');
  await saveRegionData(summary, data);

  onProgress?.('Done.');
  return summary;
}
