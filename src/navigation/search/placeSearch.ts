/**
 * Intelligent place search with fuzzy matching, local priority, and debounced suggestions.
 *
 * Strategy:
 * 1. If GPS is available, bias results to a ~50km viewbox around the user.
 * 2. Fetch from Nominatim with country bias (India first) + address details.
 * 3. If query looks like a bus stop / transit query, also fetch bus stops specifically.
 * 4. Rank results: exact-name matches first, then nearby (within 50km), then by
 *    fuzzy similarity score (Levenshtein) to handle misspellings.
 * 5. Suggestions are debounced (350ms) and abortable for performance.
 */

export interface SearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  category?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  /** Computed: distance from reference point in meters, if available. */
  _distanceMeters?: number;
  /** Computed: fuzzy similarity score [0..1], higher = better. */
  _score?: number;
}

let abortController: AbortController | null = null;

/**
 * Perform an intelligent place search. Returns ranked, deduplicated results.
 * @param query User's search text
 * @param refLat Optional reference latitude (user's GPS) for local priority
 * @param refLng Optional reference longitude
 */
export async function searchPlaces(
  query: string,
  refLat?: number,
  refLng?: number,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  const isPincode = /^\d{4,6}$/.test(q);
  const isBusQuery = /bus\s*(stop|stand|station|depot)|stage|terminus|transit/i.test(q);

  const fetches: Promise<SearchResult[]>[] = [];

  // Build viewbox for local bias (±0.45 deg ≈ ±50km)
  let viewbox = '';
  if (refLat !== undefined && refLng !== undefined) {
    const d = 0.45;
    const south = refLat - d;
    const north = refLat + d;
    const west = refLng - d;
    const east = refLng + d;
    viewbox = `&viewbox=${west}%2C${north}%2C${east}%2C${south}&bounded=0`;
  }

  if (isPincode) {
    fetches.push(
      fetchNominatim(
        `q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1&limit=8${viewbox}`,
        signal,
      ),
    );
  } else {
    // General search with local bias
    fetches.push(
      fetchNominatim(
        `q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1&limit=10${viewbox}`,
        signal,
      ),
    );

    // Bus stop specific search
    if (isBusQuery) {
      fetches.push(
        fetchNominatim(
          `q=${encodeURIComponent(q + ' bus stop')}&countrycodes=in&addressdetails=1&limit=8${viewbox}`,
          signal,
        ),
      );
    }
  }

  try {
    const results = await Promise.all(fetches);
    let merged: SearchResult[] = results.flat();

    // Deduplicate by place_id
    const seen = new Set<number>();
    merged = merged.filter((r) => {
      if (seen.has(r.place_id)) return false;
      seen.add(r.place_id);
      return true;
    });

    // Compute distance from reference point
    if (refLat !== undefined && refLng !== undefined) {
      for (const r of merged) {
        const rLat = parseFloat(r.lat);
        const rLng = parseFloat(r.lon);
        if (!isNaN(rLat) && !isNaN(rLng)) {
          r._distanceMeters = haversine(refLat, refLng, rLat, rLng);
        }
      }
    }

    // Compute fuzzy similarity score
    const qLower = q.toLowerCase();
    for (const r of merged) {
      const name = (r.name || r.display_name.split(',')[0] || '').toLowerCase();
      r._score = fuzzyScore(qLower, name);
    }

    // Rank:
    // 1. Exact name match (score >= 0.95)
    // 2. Within 50km, sorted by distance then score
    // 3. Beyond 50km, sorted by score then distance
    merged.sort((a, b) => {
      const aExact = (a._score ?? 0) >= 0.95;
      const bExact = (b._score ?? 0) >= 0.95;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aNear = (a._distanceMeters ?? Infinity) <= 50000;
      const bNear = (b._distanceMeters ?? Infinity) <= 50000;
      if (aNear && !bNear) return -1;
      if (!aNear && bNear) return 1;

      if (aNear && bNear) {
        // Both nearby: closer first, then by score
        const dDiff = (a._distanceMeters ?? Infinity) - (b._distanceMeters ?? Infinity);
        if (Math.abs(dDiff) > 100) return dDiff;
        return (b._score ?? 0) - (a._score ?? 0);
      }

      // Both far: higher score first, then closer
      const sDiff = (b._score ?? 0) - (a._score ?? 0);
      if (Math.abs(sDiff) > 0.01) return sDiff;
      return (a._distanceMeters ?? Infinity) - (b._distanceMeters ?? Infinity);
    });

    return merged;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return [];
    throw e;
  }
}

/** Abort any in-flight search. */
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

/**
 * Fuzzy similarity score [0..1].
 * Uses a normalized Levenshtein distance + substring bonus.
 */
function fuzzyScore(query: string, target: string): number {
  if (!target) return 0;
  if (query === target) return 1;

  // Substring bonus: query appears inside target
  if (target.includes(query)) return 0.98;

  // Token-based: any query token matches any target token
  const qTokens = query.split(/\s+/);
  const tTokens = target.split(/\s+/);
  let tokenMatches = 0;
  for (const qt of qTokens) {
    for (const tt of tTokens) {
      if (tt.includes(qt) || qt.includes(tt)) {
        tokenMatches++;
        break;
      }
    }
  }
  const tokenScore = qTokens.length > 0 ? tokenMatches / qTokens.length : 0;

  // Levenshtein-based score
  const dist = levenshtein(query, target);
  const maxLen = Math.max(query.length, target.length);
  const levScore = 1 - dist / maxLen;

  // Weighted: token score matters more for multi-word queries
  if (qTokens.length > 1) {
    return Math.max(tokenScore * 0.7 + levScore * 0.3, levScore);
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
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
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

/**
 * Create a debounced version of a function. Returns the debounced function
 * and a cancel function.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): { debounced: (...args: Parameters<T>) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    debounced: (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
