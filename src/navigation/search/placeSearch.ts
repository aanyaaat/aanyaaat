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
