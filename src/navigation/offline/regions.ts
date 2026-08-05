import type { OfflineRegion, RegionPresetKm, SavedPlace } from '@/navigation/domain/types';
import { fetchOsmBbox } from '@/navigation/offline/overpass';

const DB_NAME = 'aanyaa_nav';
const DB_VERSION = 2;
const REGION_STORE = 'regions';
const PLACE_STORE = 'places';
const META_STORE = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REGION_STORE)) {
        db.createObjectStore(REGION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PLACE_STORE)) {
        const store = db.createObjectStore(PLACE_STORE, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/* --------------------------- Regions --------------------------- */

export async function listRegions(): Promise<OfflineRegion[]> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(REGION_STORE, 'readonly');
      const req = tx.objectStore(REGION_STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineRegion[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getRegion(id: string): Promise<OfflineRegion | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(REGION_STORE, 'readonly');
      const req = tx.objectStore(REGION_STORE).get(id);
      req.onsuccess = () => resolve((req.result as OfflineRegion) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** @deprecated Use listRegions + getRegion instead. Kept for backward compat. */
export async function getInstalledRegion(): Promise<OfflineRegion | null> {
  const all = await listRegions();
  return all[0] ?? null;
}

export async function saveRegion(region: OfflineRegion): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REGION_STORE, 'readwrite');
    tx.objectStore(REGION_STORE).put(region);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRegion(id: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(REGION_STORE, 'readwrite');
      tx.objectStore(REGION_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** @deprecated Use deleteRegion(id) instead. */
export async function deleteAllRegions(): Promise<void> {
  const all = await listRegions();
  for (const r of all) {
    await deleteRegion(r.id);
  }
}

/** Check if a point is within any installed region's bbox. */
export async function findRegionForPoint(
  lat: number,
  lng: number,
): Promise<OfflineRegion | null> {
  const regions = await listRegions();
  for (const r of regions) {
    if (
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

/** Get all regions that contain a given point (for multi-region routing). */
export async function getRegionsForPoint(
  lat: number,
  lng: number,
): Promise<OfflineRegion[]> {
  const regions = await listRegions();
  return regions.filter(
    (r) =>
      lat >= r.bbox.south &&
      lat <= r.bbox.north &&
      lng >= r.bbox.west &&
      lng <= r.bbox.east,
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

/** Get places by type (home, work, favorite, recent). */
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

export async function setMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* --------------------------- Install --------------------------- */

/**
 * Estimate region size before download.
 */
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
  onProgress: (msg: string, bytesReceived?: number, totalBytes?: number | null) => void,
): Promise<OfflineRegion> {
  onProgress('Calculating download area…');

  const deg = radiusKm / 111 + 0.01;
  const south = centerLat - deg;
  const north = centerLat + deg;
  const west = centerLng - deg;
  const east = centerLng + deg;

  onProgress('Downloading road network from OpenStreetMap…');
  const osmData = await fetchOsmBbox(south, west, north, east, onProgress);

  onProgress('Building road graph…');
  const region = osmData;
  region.id = `region_${Date.now()}_${Math.round(centerLat * 1000)}_${Math.round(centerLng * 1000)}`;
  region.label = label || `Area · ${radiusKm} km`;
  region.centerLat = centerLat;
  region.centerLng = centerLng;
  region.radiusKm = radiusKm;
  region.createdAt = Date.now();
  region.updatedAt = Date.now();
  region.version = 1;
  region.bbox = { south, west, north, east };

  onProgress('Saving to device…');
  await saveRegion(region);

  onProgress('Done.');
  return region;
}
