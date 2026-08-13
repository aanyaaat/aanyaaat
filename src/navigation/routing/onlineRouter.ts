import type { RouteResult, TravelMode, InstructionType } from '@/navigation/domain/types';

/**
 * High-reliability online routing service using official OSRM endpoints.
 * Only returns real OSM road network geometry. Never returns synthetic or off-road lines.
 */

interface OsrmProvider {
  name: string;
  getUrl: (startLng: number, startLat: number, destLng: number, destLat: number, mode: TravelMode) => string;
}

const PROVIDERS: OsrmProvider[] = [
  {
    name: 'OSRM Official',
    getUrl: (startLng, startLat, destLng, destLat, mode) => {
      const s = mode === 'drive' ? 'driving' : mode === 'bike' ? 'biking' : 'walking';
      return `https://router.project-osrm.org/route/v1/${s}/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    },
  },
  {
    name: 'OSM Germany',
    getUrl: (startLng, startLat, destLng, destLat, mode) => {
      const p = mode === 'drive' ? 'car' : mode === 'bike' ? 'bike' : 'foot';
      const s = mode === 'drive' ? 'driving' : mode === 'bike' ? 'biking' : 'walking';
      return `https://routing.openstreetmap.de/routed-${p}/route/v1/${s}/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    },
  },
];

export async function routeOnline(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  signal?: AbortSignal
): Promise<RouteResult | null> {
  if (!Number.isFinite(startLat) || !Number.isFinite(startLng) ||
      !Number.isFinite(destLat) || !Number.isFinite(destLng)) {
    return null;
  }

  // Try online OSRM providers
  for (const provider of PROVIDERS) {
    if (signal?.aborted) return null;
    try {
      const url = provider.getUrl(startLng, startLat, destLng, destLat, mode);
      const fetchSignal = signal || AbortSignal.timeout(10000);
      const res = await fetch(url, { signal: fetchSignal });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data.routes || data.routes.length === 0) continue;

      const r = data.routes[0];
      const coordinates: { lat: number; lng: number }[] = (r.geometry.coordinates as [number, number][]).map(
        ([lng, lat]) => ({ lat, lng })
      );

      // Verify that returned route geometry has at least 2 points
      if (coordinates.length < 2) continue;

      const instructions = buildOsrmInstructions(r.legs ?? []);

      return {
        coordinates,
        distanceMeters: Math.round(r.distance),
        durationSeconds: Math.round(r.duration),
        instructions,
        mode,
        source: 'online',
      };
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) return null;
    }
  }

  return null;
}

function buildOsrmInstructions(
  legs: Array<{
    steps?: Array<{
      maneuver: { type: string; modifier?: string };
      name?: string;
      distance: number;
      geometry: { coordinates: [number, number][] };
    }>;
  }>
): RouteResult['instructions'] {
  const instructions: RouteResult['instructions'] = [];
  let cumulative = 0;

  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      const type = mapOsrmType(step.maneuver.type, step.maneuver.modifier);
      const name = step.name || '';
      const dist = step.distance ?? 0;
      const coords = step.geometry?.coordinates;
      const point = coords && coords.length > 0
        ? { lat: coords[0][1], lng: coords[0][0] }
        : { lat: 0, lng: 0 };

      instructions.push({
        type,
        roadName: name,
        distanceMeters: Math.round(dist),
        cumulativeMeters: Math.round(cumulative),
        point,
      });
      cumulative += dist;
    }
  }

  return instructions;
}

function mapOsrmType(
  type: string,
  modifier?: string
): InstructionType {
  if (type === 'depart') return 'depart';
  if (type === 'arrive') return 'arrive';
  if (type === 'turn') {
    if (modifier === 'left') return 'turn-left';
    if (modifier === 'right') return 'turn-right';
    if (modifier === 'slight left') return 'slight-left';
    if (modifier === 'slight right') return 'slight-right';
    if (modifier === 'sharp left') return 'sharp-left';
    if (modifier === 'sharp right') return 'sharp-right';
    if (modifier === 'uturn') return 'uturn';
  }
  if (type === 'new name') return 'straight';
  if (type === 'continue') {
    if (modifier === 'slight left') return 'slight-left';
    if (modifier === 'slight right') return 'slight-right';
    return 'straight';
  }
  return 'straight';
}
