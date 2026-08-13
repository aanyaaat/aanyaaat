import type { OfflineRegionData, OfflineRegionSummary, OfflineRegion, Poi } from '@/navigation/domain/types';
import { haversineMeters } from '@/navigation/gps/gps';

export interface OfflineSearchResult {
  name: string;
  type: 'poi' | 'road';
  poiType?: Poi['type'];
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  score: number;
  regionId: string;
}

export function searchOffline(
  query: string,
  regions: OfflineRegionData[] | OfflineRegionSummary[] | OfflineRegion[],
  refLat?: number,
  refLng?: number,
  limit = 20
): OfflineSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q || regions.length === 0) return [];

  const results: OfflineSearchResult[] = [];

  for (const region of regions) {
    const regionId = 'regionId' in region ? region.regionId : region.id;
    const pois = 'pois' in region ? region.pois || [] : [];
    const roads = 'roads' in region ? region.roads || [] : [];

    // Search POIs
    for (const poi of pois) {
      const name = poi.name.toLowerCase();
      const score = fuzzyScore(q, name);
      if (score > 0.3) {
        results.push({
          name: poi.name,
          type: 'poi',
          poiType: poi.type,
          latitude: poi.lat,
          longitude: poi.lng,
          distanceMeters:
            refLat !== undefined && refLng !== undefined
              ? haversineMeters(refLat, refLng, poi.lat, poi.lng)
              : undefined,
          score,
          regionId,
        });
      }
    }

    // Search road names (deduplicated)
    const seenRoads = new Set<string>();
    for (const road of roads) {
      if (!road.name) continue;
      const name = road.name.toLowerCase();
      if (seenRoads.has(name)) continue;
      seenRoads.add(name);

      const score = fuzzyScore(q, name);
      if (score > 0.3 && road.coords && road.coords.length > 0) {
        const mid = road.coords[Math.floor(road.coords.length / 2)];
        results.push({
          name: road.name,
          type: 'road',
          latitude: mid[1],
          longitude: mid[0],
          distanceMeters:
            refLat !== undefined && refLng !== undefined
              ? haversineMeters(refLat, refLng, mid[1], mid[0])
              : undefined,
          score,
          regionId,
        });
      }
    }
  }

  results.sort((a, b) => {
    const aExact = a.score >= 0.95;
    const bExact = b.score >= 0.95;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aDist = a.distanceMeters ?? Infinity;
    const bDist = b.distanceMeters ?? Infinity;
    if (Math.abs(aDist - bDist) > 100) return aDist - bDist;
    return b.score - a.score;
  });

  return results.slice(0, limit);
}

function fuzzyScore(query: string, target: string): number {
  if (!target) return 0;
  if (query === target) return 1;
  if (target.includes(query)) return 0.98;

  const qTokens = query.split(/\s+/).filter(Boolean);
  const tTokens = target.split(/\s+/).filter(Boolean);

  let totalTokenScore = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const tt of tTokens) {
      if (tt === qt) {
        best = 1;
        break;
      }
      if (tt.startsWith(qt) && qt.length >= 3) {
        best = Math.max(best, 0.9);
      } else if (qt.startsWith(tt) && tt.length >= 3) {
        best = Math.max(best, 0.7);
      } else if (tt.includes(qt) && qt.length >= 3) {
        best = Math.max(best, 0.6);
      }
    }
    totalTokenScore += best;
  }
  const tokenScore = qTokens.length > 0 ? totalTokenScore / qTokens.length : 0;

  const dist = levenshtein(query, target);
  const maxLen = Math.max(query.length, target.length);
  const levScore = maxLen > 0 ? 1 - dist / maxLen : 0;

  if (qTokens.length > 1) {
    return Math.max(tokenScore * 0.8 + levScore * 0.2, levScore);
  }
  return Math.max(tokenScore, levScore);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}
