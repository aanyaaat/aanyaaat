import type { OfflineRegion, RegionPresetKm } from '@/navigation/domain/types';
import { fetchOsmBbox } from '@/navigation/offline/overpass';

const DB_NAME = 'aanyaa_nav';
const STORE = 'regions';
const REGION_KEY = 'home_region';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getInstalledRegion(): Promise<OfflineRegion | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(REGION_KEY);
      req.onsuccess = () => resolve((req.result as OfflineRegion) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveRegion(region: OfflineRegion): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(region, REGION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRegion(): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(REGION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Estimate region size before download.
 * Based on typical OSM road density: ~1.5 km road per km² urban,
 * each road segment ~50 bytes stored. Refined after actual fetch.
 */
export function estimateRegionSizeBytes(radiusKm: RegionPresetKm): number {
  const areaKm2 = Math.PI * radiusKm * radiusKm;
  const roadKm = areaKm2 * 1.5;
  const segments = (roadKm * 1000) / 50; // 50m avg segment
  const bytesPerSegment = 80; // node refs + edge + name
  const roadRenderBytes = segments * 120; // GeoJSON coords
  const poiBytes = 200 * 50; // ~200 POIs
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
  onProgress: (msg: string) => void,
): Promise<OfflineRegion> {
  onProgress('Calculating download area…');

  // bbox: 1 degree lat ≈ 111 km. Add margin.
  const deg = radiusKm / 111 + 0.01;
  const south = centerLat - deg;
  const north = centerLat + deg;
  const west = centerLng - deg;
  const east = centerLng + deg;

  onProgress('Downloading road network from OpenStreetMap…');
  const osmData = await fetchOsmBbox(south, west, north, east, onProgress);

  onProgress('Building road graph…');
  const region = osmData;
  region.id = 'home_region';
  region.label = `Home area · ${radiusKm} km`;
  region.centerLat = centerLat;
  region.centerLng = centerLng;
  region.radiusKm = radiusKm;
  region.createdAt = Date.now();
  region.updatedAt = Date.now();

  onProgress('Saving to device…');
  await saveRegion(region);

  onProgress('Done.');
  return region;
}
