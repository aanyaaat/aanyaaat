import type { OfflineRegion, GpsFix } from '@/navigation/domain/types';
import { listRegions, saveRegion } from '@/navigation/offline/regions';
import { fetchOsmBbox } from '@/navigation/offline/overpass';

/**
 * Smart Automatic Offline Cache Manager.
 *
 * When the device is online, this module intelligently builds an offline
 * cache based on actual usage — without requiring the user to manually
 * download every area.
 *
 * It caches:
 * - Roads the user drives/walks on (via GPS tracking)
 * - Surrounding areas around the current location
 * - Routes to Home and Work
 *
 * The cache continuously improves over time based on actual usage.
 */

const AUTO_CACHE_RADIUS_KM = 3; // Small radius for auto-cache tiles
const AUTO_CACHE_MIN_INTERVAL_MS = 60_000; // Don't re-cache the same area more than once per minute
const AUTO_CACHE_MIN_DISTANCE_M = 500; // Only cache if moved 500m from last cache point

interface CachePoint {
  lat: number;
  lng: number;
  timestamp: number;
}

let lastCachePoint: CachePoint | null = null;
let isCaching = false;
let autoCacheEnabled = true;

/** Enable or disable automatic caching. */
export function setAutoCacheEnabled(enabled: boolean): void {
  autoCacheEnabled = enabled;
}

/** Check if auto-caching is currently running. */
export function isAutoCaching(): boolean {
  return isCaching;
}

/**
 * Called on each GPS fix while online. Decides whether to cache the
 * surrounding area based on distance moved and time since last cache.
 */
export async function maybeCacheArea(fix: GpsFix): Promise<void> {
  if (!autoCacheEnabled || isCaching) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const now = Date.now();

  // Check if we've moved enough or enough time has passed
  if (lastCachePoint) {
    const dist = haversineMeters(fix.latitude, fix.longitude, lastCachePoint.lat, lastCachePoint.lng);
    const timeSince = now - lastCachePoint.timestamp;
    if (dist < AUTO_CACHE_MIN_DISTANCE_M && timeSince < AUTO_CACHE_MIN_INTERVAL_MS) {
      return;
    }
  }

  // Check if this area is already covered by an installed region
  const existing = await listRegions();
  const alreadyCovered = existing.some(
    (r) =>
      fix.latitude >= r.bbox.south &&
      fix.latitude <= r.bbox.north &&
      fix.longitude >= r.bbox.west &&
      fix.longitude <= r.bbox.east,
  );

  if (alreadyCovered) {
    lastCachePoint = { lat: fix.latitude, lng: fix.longitude, timestamp: now };
    return;
  }

  // Cache the surrounding area
  isCaching = true;
  try {
    const deg = AUTO_CACHE_RADIUS_KM / 111 + 0.005;
    const south = fix.latitude - deg;
    const north = fix.latitude + deg;
    const west = fix.longitude - deg;
    const east = fix.longitude + deg;

    const region = await fetchOsmBbox(south, west, north, east, () => {});
    region.id = `auto_${Math.round(fix.latitude * 1000)}_${Math.round(fix.longitude * 1000)}`;
    region.label = `Auto-cached area`;
    region.centerLat = fix.latitude;
    region.centerLng = fix.longitude;
    region.radiusKm = AUTO_CACHE_RADIUS_KM;
    region.createdAt = now;
    region.updatedAt = now;
    region.version = 1;
    region.bbox = { south, west, north, east };

    await saveRegion(region);
    lastCachePoint = { lat: fix.latitude, lng: fix.longitude, timestamp: now };
  } catch {
    // Auto-cache failures are silent — this is a background enhancement
  } finally {
    isCaching = false;
  }
}

/**
 * Predictively cache a route corridor — caches a thin strip along a route
 * so the user can navigate it offline later.
 */
export async function cacheRouteCorridor(
  coordinates: { lat: number; lng: number }[],
  corridorWidthKm = 2,
): Promise<void> {
  if (!autoCacheEnabled || isCaching) return;
  if (coordinates.length < 2) return;

  isCaching = true;
  try {
    // Sample points along the route at ~2km intervals
    const samplePoints: { lat: number; lng: number }[] = [];
    let accumulated = 0;
    samplePoints.push(coordinates[0]);

    for (let i = 1; i < coordinates.length; i++) {
      const d = haversineMeters(
        coordinates[i - 1].lat,
        coordinates[i - 1].lng,
        coordinates[i].lat,
        coordinates[i].lng,
      );
      accumulated += d;
      if (accumulated >= 2000) {
        samplePoints.push(coordinates[i]);
        accumulated = 0;
      }
    }

    // Cache each sample point area (deduplicating overlapping ones)
    const existing = await listRegions();
    for (const pt of samplePoints) {
      const alreadyCovered = existing.some(
        (r) =>
          pt.lat >= r.bbox.south &&
          pt.lat <= r.bbox.north &&
          pt.lng >= r.bbox.west &&
          pt.lng <= r.bbox.east,
      );
      if (alreadyCovered) continue;

      const deg = corridorWidthKm / 111 + 0.005;
      const south = pt.lat - deg;
      const north = pt.lat + deg;
      const west = pt.lng - deg;
      const east = pt.lng + deg;

      try {
        const region = await fetchOsmBbox(south, west, north, east, () => {});
        region.id = `corridor_${Math.round(pt.lat * 1000)}_${Math.round(pt.lng * 1000)}`;
        region.label = `Route corridor`;
        region.centerLat = pt.lat;
        region.centerLng = pt.lng;
        region.radiusKm = corridorWidthKm;
        region.createdAt = Date.now();
        region.updatedAt = Date.now();
        region.version = 1;
        region.bbox = { south, west, north, east };
        await saveRegion(region);
      } catch {
        // Continue to next point even if one fails
      }
    }
  } finally {
    isCaching = false;
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
