import type { RouteResult, TravelMode } from '@/navigation/domain/types';

/**
 * Online routing provider using OSRM public demo server.
 * This is an ENHANCEMENT only — the app must not depend on it.
 * If it fails, the offline router takes over.
 */

const OSRM_ENDPOINT = 'https://routing.openstreetmap.de/routed';

export async function routeOnline(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
): Promise<RouteResult | null> {
  const profile = mode === 'drive' ? 'car' : mode === 'bike' ? 'bike' : 'foot';
  const url = `${OSRM_ENDPOINT}/${profile}/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();

  if (!data.routes || data.routes.length === 0) return null;
  const r = data.routes[0];

  const coordinates: { lat: number; lng: number }[] = (r.geometry.coordinates as [number, number][]).map(
    ([lng, lat]) => ({ lat, lng }),
  );

  const instructions = buildOsrmInstructions(r.legs ?? []);

  return {
    coordinates,
    distanceMeters: Math.round(r.distance),
    durationSeconds: Math.round(r.duration),
    instructions,
    mode,
  };
}

function buildOsrmInstructions(
  legs: Array<{
    steps?: Array<{
      maneuver: { type: string; modifier?: string; bearing_after?: number };
      name?: string;
      distance: number;
      geometry: { coordinates: [number, number][] };
    }>;
  }>,
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
  modifier?: string,
): import('@/navigation/domain/types').InstructionType {
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
