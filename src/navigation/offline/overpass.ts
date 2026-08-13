import type {
  GeoJsonRoad,
  OfflineRegion,
  Poi,
  Bbox,
} from '@/navigation/domain/types';

/**
 * Fetches OpenStreetMap vector data from Overpass API.
 * Uses sub-quadrant grid fetching for large bounding boxes (e.g., 30km radius)
 * to avoid HTTP 504 Gateway Timeouts and maximize download speed.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];

const MAX_BBOX_DEGREE_SPAN = 0.85; // ~55km max span
const MAX_ALLOWED_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB max download safety limit

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export function validateDownloadBounds(south: number, west: number, north: number, east: number): void {
  if (north <= south || east <= west) {
    throw new Error('Invalid download coordinates bounds.');
  }
  if (north - south > MAX_BBOX_DEGREE_SPAN || east - west > MAX_BBOX_DEGREE_SPAN) {
    throw new Error(`Requested region exceeds max permitted area span (${MAX_BBOX_DEGREE_SPAN}°).`);
  }
}

export async function fetchOsmBbox(
  south: number,
  west: number,
  north: number,
  east: number,
  onProgress?: (msg: string, bytesReceived?: number, totalBytes?: number | null) => void,
  signal?: AbortSignal
): Promise<OfflineRegion> {
  validateDownloadBounds(south, west, north, east);

  // If bbox is large (> 0.28° span, e.g. 30km radius), split into 4 sub-quadrants to prevent 504 Gateway Timeout
  const latSpan = north - south;
  const lngSpan = east - west;

  if (latSpan > 0.28 || lngSpan > 0.28) {
    onProgress?.('Downloading map region in 4 fast sub-quadrants…');
    const midLat = (south + north) / 2;
    const midLng = (west + east) / 2;

    const quads = [
      { s: south, w: west, n: midLat, e: midLng }, // SW
      { s: south, w: midLng, n: midLat, e: east }, // SE
      { s: midLat, w: west, n: north, e: midLng }, // NW
      { s: midLat, w: midLng, n: north, e: east }, // NE
    ];

    const elementsMap = new Map<number | string, OverpassNode | OverpassWay>();

    for (let i = 0; i < quads.length; i++) {
      if (signal?.aborted) throw new Error('Download aborted by user.');
      const q = quads[i];
      onProgress?.(`Fetching quadrant ${i + 1}/4…`);
      const quadElements = await fetchSingleBboxElements(q.s, q.w, q.n, q.e, signal);
      for (const el of quadElements) {
        const key = `${el.type}_${el.id}`;
        if (!elementsMap.has(key)) {
          elementsMap.set(key, el);
        }
      }
    }

    const combinedElements = Array.from(elementsMap.values());
    return parseElementsToRegion(south, west, north, east, combinedElements, onProgress);
  }

  const singleElements = await fetchSingleBboxElements(south, west, north, east, signal, onProgress);
  return parseElementsToRegion(south, west, north, east, singleElements, onProgress);
}

async function fetchSingleBboxElements(
  south: number,
  west: number,
  north: number,
  east: number,
  signal?: AbortSignal,
  onProgress?: (msg: string, bytesReceived?: number, totalBytes?: number | null) => void
): Promise<(OverpassNode | OverpassWay)[]> {
  const bbox = `${south},${west},${north},${east}`;
  const query = `
    [out:json][timeout:60];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"](${bbox});
      node["amenity"="hospital"](${bbox});
      node["amenity"="police"](${bbox});
      node["railway"="station"](${bbox});
      node["highway"="bus_stop"](${bbox});
    );
    out body geom;
  `;

  let lastErr: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) throw new Error('Download aborted by user.');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: signal || AbortSignal.timeout(30000),
      });

      if (!res.ok) throw new Error(`Overpass ${res.status}`);

      const data = (await res.json()) as { elements: (OverpassNode | OverpassWay)[] };
      if (data && Array.isArray(data.elements)) {
        return data.elements;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) {
        throw new Error('Download aborted by user.');
      }
      lastErr = e as Error;
    }
  }

  throw new Error(`Overpass download failed: ${lastErr?.message ?? '504 Gateway Timeout'}`);
}

function parseElementsToRegion(
  south: number,
  west: number,
  north: number,
  east: number,
  elements: (OverpassNode | OverpassWay)[],
  onProgress?: (msg: string) => void
): OfflineRegion {
  onProgress?.(`Parsing ${elements.length} elements into offline road graph…`);

  const nodes = new Map<number, [number, number]>();
  const ways: OverpassWay[] = [];
  const poiNodes: OverpassNode[] = [];

  for (const el of elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
      if (el.tags && isPoiNode(el.tags)) {
        poiNodes.push(el);
      }
    } else if (el.type === 'way') {
      ways.push(el);
      if (el.geometry) {
        for (let i = 0; i < el.nodes.length; i++) {
          if (!nodes.has(el.nodes[i]) && el.geometry[i]) {
            nodes.set(el.nodes[i], [el.geometry[i].lat, el.geometry[i].lon]);
          }
        }
      }
    }
  }

  const graphNodes: Record<number, [number, number]> = {};
  const graphEdges: [number, number, number, string?][] = [];
  const roads: GeoJsonRoad[] = [];

  for (const way of ways) {
    const tags = way.tags ?? {};
    const highway = tags.highway;
    if (!highway) continue;
    const roadClass = classifyRoad(highway);
    if (roadClass < 0) continue;

    const name = tags.name ?? tags.ref;
    const coords: [number, number][] = [];

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

    for (const nodeId of way.nodes) {
      const n = nodes.get(nodeId);
      if (!n) continue;
      graphNodes[nodeId] = n;
      coords.push([n[1], n[0]]); // [lng, lat]

      if (n[0] < minLat) minLat = n[0];
      if (n[0] > maxLat) maxLat = n[0];
      if (n[1] < minLng) minLng = n[1];
      if (n[1] > maxLng) maxLng = n[1];
    }

    if (coords.length < 2) continue;

    const roadBbox: Bbox = { south: minLat, west: minLng, north: maxLat, east: maxLng };
    roads.push({ coords, roadClass, name, bbox: roadBbox });

    const onewayVal = (tags.oneway || '').toLowerCase();
    const isOnewayForward = onewayVal === 'yes' || onewayVal === '1' || onewayVal === 'true';
    const isOnewayReverse = onewayVal === '-1';

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = way.nodes[i];
      const b = way.nodes[i + 1];
      if (!nodes.has(a) || !nodes.has(b)) continue;

      if (!isOnewayReverse) {
        graphEdges.push([a, b, roadClass, name]);
      }
      if (!isOnewayForward) {
        graphEdges.push([b, a, roadClass, name]);
      }
    }
  }

  const pois: Poi[] = [];
  for (const node of poiNodes) {
    const tags = node.tags ?? {};
    let type: Poi['type'] = 'landmark';
    if (tags.amenity === 'hospital') type = 'hospital';
    else if (tags.amenity === 'police') type = 'police';
    else if (tags.railway === 'station' || tags.public_transport === 'station')
      type = 'station';
    else if (
      tags.highway === 'bus_stop' ||
      tags.bus === 'yes' ||
      tags.railway === 'tram_stop' ||
      tags.public_transport === 'platform'
    )
      type = 'bus_stop';

    pois.push({
      lat: node.lat,
      lng: node.lon,
      name: tags.name ?? type,
      type,
    });
  }

  const sizeBytes =
    Object.keys(graphNodes).length * 24 +
    graphEdges.length * 32 +
    roads.length * 120 +
    pois.length * 80;

  return {
    id: '',
    label: '',
    centerLat: (south + north) / 2,
    centerLng: (west + east) / 2,
    radiusKm: 0,
    createdAt: 0,
    updatedAt: 0,
    bbox: { south, west, north, east },
    nodes: graphNodes,
    edges: graphEdges,
    roads,
    pois,
    sizeBytes,
    version: 1,
    roadCount: roads.length,
    poiCount: pois.length,
    status: 'ready',
  };
}

function isPoiNode(tags: Record<string, string>): boolean {
  return (
    tags.amenity === 'hospital' ||
    tags.amenity === 'police' ||
    tags.railway === 'station' ||
    tags.highway === 'bus_stop'
  );
}

function classifyRoad(highway: string): number {
  const classes: Record<string, number> = {
    motorway: 7,
    trunk: 6,
    primary: 5,
    secondary: 4,
    tertiary: 3,
    unclassified: 2,
    residential: 2,
    living_street: 1,
    service: 1,
  };
  return classes[highway] ?? -1;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
