import type { SearchResult } from '@/navigation/domain/types';
export type { SearchResult };

let abortController: AbortController | null = null;

/**
 * Perform an explicit place search (triggered on form submit or Enter key).
 * Respects OpenStreetMap Nominatim usage policy by avoiding client-side keystroke autocomplete.
 */
export async function searchPlaces(
  query: string,
  refLat?: number,
  refLng?: number
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Online search requires network connectivity. Use installed regional search offline.');
  }

  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  const isPincode = /^\d{4,6}$/.test(q);

  let viewbox = '';
  if (refLat !== undefined && refLng !== undefined) {
    const d = 0.45;
    const south = refLat - d;
    const north = refLat + d;
    const west = refLng - d;
    const east = refLng + d;
    viewbox = `&viewbox=${west}%2C${north}%2C${east}%2C${south}&bounded=0`;
  }

  const fetches: Promise<SearchResult[]>[] = [];

  if (isPincode) {
    fetches.push(
      fetchNominatim(
        `q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1&limit=8${viewbox}`,
        signal
      )
    );
  } else {
    fetches.push(
      fetchNominatim(
        `q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1&limit=10${viewbox}`,
        signal
      )
    );
  }

  try {
    const results = await Promise.all(fetches);
    let merged: SearchResult[] = results.flat();

    const seen = new Set<number>();
    merged = merged.filter((r) => {
      if (seen.has(r.place_id)) return false;
      seen.add(r.place_id);
      return true;
    });

    if (refLat !== undefined && refLng !== undefined) {
      for (const r of merged) {
        const rLat = parseFloat(r.lat);
        const rLng = parseFloat(r.lon);
        if (!isNaN(rLat) && !isNaN(rLng)) {
          r._distanceMeters = haversine(refLat, refLng, rLat, rLng);
        }
      }
    }

    return merged;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return [];
    throw e;
  }
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): { debounced: (...args: Parameters<T>) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delayMs);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return { debounced, cancel };
}

export function abortSearch() {
  abortController?.abort();
  abortController = null;
}

async function fetchNominatim(params: string, signal: AbortSignal): Promise<SearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&${params}`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en' },
    signal,
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return (await res.json()) as SearchResult[];
}

import { regionDataManager } from '@/navigation/maps/regionDataManager';

interface ReverseGeocodeResult {
  label: string;
  address?: string;
}

const REVERSE_CACHE = new Map<string, ReverseGeocodeResult>();

/**
 * High-speed offline & online reverse geocoding.
 * 1. Checks local offline vector roads and POIs in memory.
 * 2. If online, queries OpenStreetMap Nominatim reverse API.
 * 3. Falls back gracefully to null / coordinates.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  offlineRegions?: { id: string }[]
): Promise<ReverseGeocodeResult | null> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (REVERSE_CACHE.has(cacheKey)) {
    return REVERSE_CACHE.get(cacheKey)!;
  }

  // 1. Check offline region vector roads and POIs first
  if (offlineRegions && offlineRegions.length > 0) {
    for (const reg of offlineRegions) {
      const data = regionDataManager.getCachedData(reg.id);
      if (data) {
        // Check POIs within 150m
        for (const poi of data.pois || []) {
          const d = haversine(lat, lng, poi.lat, poi.lng);
          if (d <= 150 && poi.name) {
            const res: ReverseGeocodeResult = {
              label: poi.name,
              address: poi.type ? `${poi.type.charAt(0).toUpperCase() + poi.type.slice(1)}` : `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
            };
            REVERSE_CACHE.set(cacheKey, res);
            return res;
          }
        }

        // Check named roads within 80m
        for (const road of data.roads || []) {
          if (road.name && !road.name.toLowerCase().includes('unnamed')) {
            for (const [rLng, rLat] of road.coords || []) {
              const d = haversine(lat, lng, rLat, rLng);
              if (d <= 80) {
                const res: ReverseGeocodeResult = {
                  label: road.name,
                  address: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
                };
                REVERSE_CACHE.set(cacheKey, res);
                return res;
              }
            }
          }
        }
      }
    }
  }

  // 2. Online Reverse Geocode with fast 2.5s timeout
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json && (json.name || json.address || json.display_name)) {
          const addr = json.address || {};
          const road = addr.road || addr.pedestrian || addr.highway || addr.street;
          const suburb = addr.suburb || addr.neighbourhood || addr.residential || addr.village || addr.town || addr.city_district;
          const city = addr.city || addr.town || addr.county || addr.state;

          const primaryName = json.name || road || suburb || city;
          const addressParts = [road, suburb, city].filter(Boolean);
          const shortAddress = addressParts.length > 0 ? addressParts.slice(0, 2).join(', ') : json.display_name?.split(',').slice(0, 2).join(',');

          if (primaryName) {
            const result: ReverseGeocodeResult = {
              label: primaryName,
              address: shortAddress || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
            };
            if (REVERSE_CACHE.size >= 100) {
              const first = REVERSE_CACHE.keys().next().value;
              if (first) REVERSE_CACHE.delete(first);
            }
            REVERSE_CACHE.set(cacheKey, result);
            return result;
          }
        }
      }
    } catch {
      /* fallback */
    }
  }

  return null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface HumanAreaInfo {
  title: string;
  subtitle: string;
  keyAreas: string[];
}

const KNOWN_METRO_REGIONS = [
  {
    name: 'New Delhi & Central NCR',
    state: 'Delhi & National Capital Region, India',
    south: 28.25, north: 28.95, west: 76.85, east: 77.55,
    areas: ['Connaught Place', 'India Gate', 'Karol Bagh', 'Lajpat Nagar', 'Janpath', 'Chanakyapuri', 'Rohini', 'Noida']
  },
  {
    name: 'Bengaluru Metropolitan Area',
    state: 'Bengaluru Urban & Rural, Karnataka, India',
    south: 12.70, north: 13.45, west: 77.30, east: 77.90,
    areas: ['MG Road', 'Indiranagar', 'Koramangala', 'Whitefield', 'Hebbal', 'Jayanagar', 'Devanahalli', 'Electronic City']
  },
  {
    name: 'Mumbai Metropolitan Region',
    state: 'Mumbai & MMR, Maharashtra, India',
    south: 18.80, north: 19.40, west: 72.70, east: 73.20,
    areas: ['Bandra', 'Andheri', 'Colaba', 'Dadar', 'Juhu', 'Powai', 'Thane', 'Navi Mumbai']
  },
  {
    name: 'Hyderabad City & Cyberabad',
    state: 'Hyderabad, Telangana, India',
    south: 17.15, north: 17.65, west: 78.15, east: 78.70,
    areas: ['HITEC City', 'Gachibowli', 'Banjara Hills', 'Jubilee Hills', 'Charminar', 'Secunderabad', 'Madhapur']
  },
  {
    name: 'Chennai Metropolitan Region',
    state: 'Chennai, Tamil Nadu, India',
    south: 12.80, north: 13.30, west: 80.00, east: 80.40,
    areas: ['T. Nagar', 'Adyar', 'Anna Nagar', 'Mylapore', 'Velachery', 'OMR Road', 'Guindy', 'Marina Beach']
  },
  {
    name: 'Pune & PCMC Area',
    state: 'Pune, Maharashtra, India',
    south: 18.30, north: 18.80, west: 73.60, east: 74.10,
    areas: ['Kothrud', 'Viman Nagar', 'Koregaon Park', 'Hinjawadi', 'Shivajinagar', 'Hadapsar', 'Baner', 'Wakad']
  },
  {
    name: 'Kolkata Metropolitan Area',
    state: 'Kolkata, West Bengal, India',
    south: 22.30, north: 22.80, west: 88.15, east: 88.60,
    areas: ['Park Street', 'Salt Lake', 'New Town', 'Howrah', 'Ballygunge', 'Esplanade', 'Alipore']
  },
  {
    name: 'San Francisco Bay Area',
    state: 'California, United States',
    south: 37.25, north: 38.00, west: -122.60, east: -122.10,
    areas: ['Downtown SF', 'Mission District', 'SOMA', 'Oakland', 'Berkeley', 'Palo Alto', 'San Jose']
  },
  {
    name: 'Greater London Region',
    state: 'Greater London, United Kingdom',
    south: 51.25, north: 51.75, west: -0.55, east: 0.35,
    areas: ['Westminster', 'City of London', 'Camden', 'Greenwich', 'Kensington', 'Shoreditch', 'Canary Wharf']
  }
];

export async function resolveHumanAreaDetails(
  lat: number,
  lng: number,
  radiusKm = 30
): Promise<HumanAreaInfo> {
  // 1. Check known metro bounds for instant 0ms offline recognition
  for (const m of KNOWN_METRO_REGIONS) {
    if (lat >= m.south && lat <= m.north && lng >= m.west && lng <= m.east) {
      return {
        title: `${m.name} (${radiusKm}km)`,
        subtitle: m.state,
        keyAreas: m.areas,
      };
    }
  }

  // 2. If online, reverse geocode to fetch real human city and state name
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const addr = json.address || {};
        const town = addr.city || addr.town || addr.municipality || addr.district || addr.county || addr.suburb || json.name;
        const state = [addr.state, addr.country].filter(Boolean).join(', ');
        if (town) {
          return {
            title: `${town} Area (${radiusKm}km)`,
            subtitle: state || 'Offline Map Coverage',
            keyAreas: [town, addr.suburb, addr.neighbourhood, addr.county].filter(Boolean) as string[],
          };
        }
      }
    } catch {
      /* fallback */
    }
  }

  // 3. Fallback
  return {
    title: `Local Coverage Area (${radiusKm}km)`,
    subtitle: 'Highways, Arterial Roads & Local Streets',
    keyAreas: ['Major Arterials', 'Connecting Highways', 'Local Roads', 'Places of Interest'],
  };
}
