/**
 * Ultra-reliable, high-performance map tile loader and cache.
 * Uses uniform OSM tile endpoints + IndexedDB persistence (`tileDb.ts`) + Chrome CacheStorage (`caches.open`).
 * Seamless multi-level parent tile scaling fallback so tiles NEVER look blank.
 */

import { saveTileToDb, getTileFromDb } from './tileDb';

const MEMORY_CACHE = new Map<string, HTMLImageElement>();
const IN_FLIGHT_KEYS = new Set<string>();
const MAX_MEMORY_TILES = 1200;
const CHROME_TILE_CACHE = 'aanyaa_map_tiles_chrome_v1';

async function cacheUrlInChromeCache(url: string) {
  if ('caches' in window && url) {
    try {
      const cache = await caches.open(CHROME_TILE_CACHE);
      const match = await cache.match(url);
      if (!match) {
        await cache.add(url);
      }
    } catch {
      /* ignore CORS/cache policy error */
    }
  }
}

export function getTileUrl(z: number, x: number, y: number, dark = false): string {
  const maxTile = Math.pow(2, z);
  const wrappedX = ((x % maxTile) + maxTile) % maxTile;
  if (y < 0 || y >= maxTile) return '';

  if (dark) {
    const servers = ['a', 'b', 'c'];
    const s = servers[Math.abs(x + y) % servers.length];
    return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${wrappedX}/${y}.png`;
  }

  // Use standard OpenStreetMap tiles consistently
  return `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`;
}

export function getCachedTile(z: number, x: number, y: number, dark = false): HTMLImageElement | null {
  const key = `${dark ? 'd' : 's'}_${z}_${x}_${y}`;
  const cached = MEMORY_CACHE.get(key);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  return null;
}

/**
 * Scale up lower-zoom parent tile if exact tile is still loading,
 * ensuring screen NEVER has blank boxes or missing tiles while scrolling/panning.
 */
export function getParentTileFallback(
  z: number,
  x: number,
  y: number,
  dark = false
): { img: HTMLImageElement; cropX: number; cropY: number; cropSize: number } | null {
  for (let delta = 1; delta <= 3; delta++) {
    const parentZ = z - delta;
    if (parentZ < 0) break;
    const factor = Math.pow(2, delta);
    const parentX = Math.floor(x / factor);
    const parentY = Math.floor(y / factor);

    const parentImg = getCachedTile(parentZ, parentX, parentY, dark);
    if (parentImg) {
      const subX = Math.abs(x % factor);
      const subY = Math.abs(y % factor);
      const cropSize = parentImg.naturalWidth / factor;
      return {
        img: parentImg,
        cropX: subX * cropSize,
        cropY: subY * cropSize,
        cropSize,
      };
    }
  }
  return null;
}

export function loadTile(
  z: number,
  x: number,
  y: number,
  dark: boolean,
  onLoaded?: () => void
): HTMLImageElement | null {
  const key = `${dark ? 'd' : 's'}_${z}_${x}_${y}`;

  if (MEMORY_CACHE.has(key)) {
    const img = MEMORY_CACHE.get(key)!;
    if (img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }

  if (IN_FLIGHT_KEYS.has(key)) {
    return null;
  }

  IN_FLIGHT_KEYS.add(key);

  // 1. Try to load from IndexedDB persistent tile store first asynchronously
  void getTileFromDb(key).then((dataUrl) => {
    if (dataUrl && !MEMORY_CACHE.has(key)) {
      const dbImg = new Image();
      dbImg.onload = () => {
        IN_FLIGHT_KEYS.delete(key);
        MEMORY_CACHE.set(key, dbImg);
        onLoaded?.();
      };
      dbImg.src = dataUrl;
    }
  });

  const url = getTileUrl(z, x, y, dark);
  if (!url) {
    IN_FLIGHT_KEYS.delete(key);
    return null;
  }

  void cacheUrlInChromeCache(url);

  const img = new Image();

  img.onload = () => {
    IN_FLIGHT_KEYS.delete(key);
    if (MEMORY_CACHE.size >= MAX_MEMORY_TILES) {
      const firstKey = MEMORY_CACHE.keys().next().value;
      if (firstKey) MEMORY_CACHE.delete(firstKey);
    }
    MEMORY_CACHE.set(key, img);
    onLoaded?.();

    // Persist tile asynchronously in background via blob without freezing canvas thread
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => {
        void persistTileBlob(url, key);
      });
    }
  };

  img.onerror = () => {
    const fallbackUrl = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
    const fallbackImg = new Image();
    fallbackImg.onload = () => {
      IN_FLIGHT_KEYS.delete(key);
      MEMORY_CACHE.set(key, fallbackImg);
      onLoaded?.();
    };
    fallbackImg.onerror = () => {
      IN_FLIGHT_KEYS.delete(key);
    };
    fallbackImg.src = fallbackUrl;
  };

  img.src = url;
  return null;
}

async function persistTileBlob(url: string, key: string) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const blob = await resp.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        void saveTileToDb(key, reader.result);
      }
    };
    reader.readAsDataURL(blob);
  } catch {
    /* ignore offline/CORS save error */
  }
}

let lastPrefetchTime = 0;

/** Pre-fetch surrounding tiles quietly in the background without triggering render loops */
export function prefetchSurroundingTiles(
  z: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  dark: boolean
) {
  const now = Date.now();
  if (now - lastPrefetchTime < 400) return;
  lastPrefetchTime = now;

  const margin = 1;
  const pMinX = minX - margin;
  const pMaxX = maxX + margin;
  const pMinY = minY - margin;
  const pMaxY = maxY + margin;

  for (let x = pMinX; x <= pMaxX; x++) {
    for (let y = pMinY; y <= pMaxY; y++) {
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
      if (!getCachedTile(z, x, y, dark)) {
        loadTile(z, x, y, dark); // no onLoaded callback to prevent cascade render storm
      }
    }
  }
}
