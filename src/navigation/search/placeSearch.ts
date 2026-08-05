/**
 * Intelligent place search with fuzzy matching, local priority, and debounced suggestions.
 *
 * Strategy:
 * 1. If GPS is available, bias results to a ~50km viewbox around the user.
 * 2. Fetch from Nominatim with country bias (India first) + address details.
 * 3. If query looks like a bus stop / transit query, also fetch bus stops specifically.
 * 4. Rank results: exact-name matches first, then nearby (within 50km), then by
 *    fuzzy similarity score (Levenshtein) to handle misspellings.
 * 5. Suggestions are debounced (280ms) and abortable for performance.
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

    // Fallback: for multi-word queries, also search with just the first word.
    // This catches cases where the last word is a partial/misspelled token that
    // Nominatim's index can't match (e.g. "palace gutt" → search "palace" to
    // surface "Palace Guttahalli Bus Stop", then prefix-aware scoring ranks it).
    const words = q.split(/\s+/);
    if (words.length >= 2 && words[0].length >= 3) {
      fetches.push(
        fetchNominatim(
          `q=${encodeURIComponent(words[0])}&countrycodes=in&addressdetails=1&limit=8${viewbox}`,
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

    // Compute fuzzy similarity score against both the short name and the
    // full display_name. This catches cases where the place name is generic
    // (e.g. "bus stop") but the full address contains the matching text.
    const qLower = q.toLowerCase();
    for (const r of merged) {
      const shortName = (r.name || r.display_name.split(',')[0] || '').toLowerCase();
      const fullName = r.display_name.toLowerCase();
      r._score = Math.max(
        fuzzyScore(qLower, shortName),
        fuzzyScore(qLower, fullName) * 0.92,
      );
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
 * Uses prefix-aware token matching + normalized Levenshtein distance.
 * Prefix matches (e.g. "palace gutt" vs "palace guttahalli") score very high.
 */
function fuzzyScore(query: string, target: string): number {
  if (!target) return 0;
  if (query === target) return 1;

  // Substring bonus: query appears inside target
  if (target.includes(query)) return 0.98;

  const qTokens = query.split(/\s+/).filter(Boolean);
  const tTokens = target.split(/\s+/).filter(Boolean);

  // Token-based scoring with prefix awareness:
  // - Exact token match: 1.0
  // - Query token is a prefix of a target token: 0.9 ("gutt" → "guttahalli")
  // - Target token is a prefix of a query token: 0.7
  // - Substring overlap: 0.6
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

  // Levenshtein-based score (character-level similarity)
  const dist = levenshtein(query, target);
  const maxLen = Math.max(query.length, target.length);
  const levScore = 1 - dist / maxLen;

  // Weighted: token score matters more for multi-word queries
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
