import type { GpsFix, OfflineRegionSummary, OfflineRegionData } from '@/navigation/domain/types';
import { listRegionSummaries, saveRegionData, deleteRegionData, canStoreBytes } from '@/navigation/offline/regions';
import { fetchOsmBbox } from '@/navigation/offline/overpass';

/**
 * Smart Automatic Offline Cache Manager.
 *
 * Automatic Overpass background downloads are DISABLED by default to keep the application
 * predictable, user-controlled, and policy-compliant.
 *
 * When explicitly enabled by the user, strict bounds are enforced:
 * - Maximum 3 auto-cached regions
 * - Maximum 32 MB total auto-cache size
 * - Minimum 10 minutes between downloads
 * - Minimum 1,000m movement
 */

const AUTO_CACHE_RADIUS_KM = 3;
const AUTO_CACHE_MIN_INTERVAL_MS = 600_000; // 10 minutes
const AUTO_CACHE_MIN_DISTANCE_M = 1000; // 1 km
const MAX_AUTO_REGIONS = 3;
const MAX_AUTO_STORAGE_BYTES = 32 * 1024 * 1024; // 32 MB

interface CachePoint {
  lat: number;
  lng: number;
  timestamp: number;
}

let lastCachePoint: CachePoint | null = null;
let isCaching = false;
let autoCacheEnabled = false; // Disabled by default

/** Enable or disable automatic background caching. */
export function setAutoCacheEnabled(enabled: boolean): void {
  autoCacheEnabled = enabled;
}

export function isAutoCacheEnabled(): boolean {
  return autoCacheEnabled;
}

/** Check if auto-caching is currently running. */
export function isAutoCaching(): boolean {
  return isCaching;
}

/**
 * Called on GPS fixes. Only executes if explicitly enabled and bounds are satisfied.
 */
export async function maybeCacheArea(fix: GpsFix): Promise<void> {
  if (!autoCacheEnabled || isCaching) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const now = Date.now();

  if (lastCachePoint) {
    const dist = haversineMeters(fix.latitude, fix.longitude, lastCachePoint.lat, lastCachePoint.lng);
    const timeSince = now - lastCachePoint.timestamp;
    if (dist < AUTO_CACHE_MIN_DISTANCE_M || timeSince < AUTO_CACHE_MIN_INTERVAL_MS) {
      return;
    }
  }

  const existingSummaries = await listRegionSummaries();
  const alreadyCovered = existingSummaries.some(
    (r) =>
      r.status === 'ready' &&
      fix.latitude >= r.bbox.south &&
      fix.latitude <= r.bbox.north &&
      fix.longitude >= r.bbox.west &&
      fix.longitude <= r.bbox.east
  );

  if (alreadyCovered) {
    lastCachePoint = { lat: fix.latitude, lng: fix.longitude, timestamp: now };
    return;
  }

  // Manage auto-cache limits before starting
  await evictAutoCacheIfNeeded(existingSummaries);

  const okToStore = await canStoreBytes(8 * 1024 * 1024);
  if (!okToStore) return;

  isCaching = true;
  try {
    const deg = AUTO_CACHE_RADIUS_KM / 111 + 0.005;
    const south = fix.latitude - deg;
    const north = fix.latitude + deg;
    const west = fix.longitude - deg;
    const east = fix.longitude + deg;

    const rawRegion = await fetchOsmBbox(south, west, north, east, undefined);
    const regionId = `auto_${Math.round(fix.latitude * 1000)}_${Math.round(fix.longitude * 1000)}`;

    const summary: OfflineRegionSummary = {
      id: regionId,
      label: `Auto-cached area`,
      centerLat: fix.latitude,
      centerLng: fix.longitude,
      radiusKm: AUTO_CACHE_RADIUS_KM,
      createdAt: now,
      updatedAt: now,
      bbox: { south, west, north, east },
      sizeBytes: rawRegion.sizeBytes,
      version: 1,
      roadCount: rawRegion.roads?.length || 0,
      poiCount: rawRegion.pois?.length || 0,
      status: 'ready',
      auto: true,
    };

    const data: OfflineRegionData = {
      regionId,
      nodes: rawRegion.nodes || {},
      edges: rawRegion.edges || [],
      roads: rawRegion.roads || [],
      pois: rawRegion.pois || [],
      version: 1,
    };

    await saveRegionData(summary, data);
    lastCachePoint = { lat: fix.latitude, lng: fix.longitude, timestamp: now };
  } catch {
    // Silent failure for background auto-cache
  } finally {
    isCaching = false;
  }
}

async function evictAutoCacheIfNeeded(existingSummaries: OfflineRegionSummary[]): Promise<void> {
  const autoSummaries = existingSummaries
    .filter((s) => s.auto)
    .sort((a, b) => a.createdAt - b.createdAt); // Oldest first

  let totalSizeBytes = autoSummaries.reduce((sum, s) => sum + s.sizeBytes, 0);

  while (autoSummaries.length >= MAX_AUTO_REGIONS || totalSizeBytes > MAX_AUTO_STORAGE_BYTES) {
    const oldest = autoSummaries.shift();
    if (!oldest) break;
    totalSizeBytes -= oldest.sizeBytes;
    await deleteRegionData(oldest.id);
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
