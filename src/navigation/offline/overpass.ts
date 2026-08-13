import type {
  GeoJsonRoad,
  OfflineRegion,
  Poi,
  Bbox,
} from '@/navigation/domain/types';

/**
 * Fetches OpenStreetMap data for a bounding box from the Overpass API.
 * Overpass is the legitimate bulk-download endpoint for OSM data (ODbL).
 * We request highways + key amenities (hospitals, police, stations) only,
 * keeping the dataset small and focused on emergency navigation.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const MAX_BBOX_DEGREE_SPAN = 0.85; // ~55km max span to support 30km radius
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

  const bbox = `${south},${west},${north},${east}`;
  const query = `
    [out:json][timeout:120];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"](${bbox});
      node["amenity"="hospital"](${bbox});
      node["amenity"="police"](${bbox});
      node["railway"="station"](${bbox});
      node["railway"="subway_entrance"](${bbox});
      node["railway"="tram_stop"](${bbox});
      node["public_transport"="station"](${bbox});
      node["public_transport"="platform"](${bbox});
      node["highway"="bus_stop"](${bbox});
      node["bus"="yes"](${bbox});
      way["amenity"="hospital"](${bbox});
      way["amenity"="police"](${bbox});
      way["railway"="station"](${bbox});
    );
    out body geom;
  `;

  let data: { elements: (OverpassNode | OverpassWay)[] } | null = null;
  let lastErr: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) {
      throw new Error('Download aborted by user.');
    }

    try {
      onProgress?.(`Fetching from ${new URL(endpoint).hostname}…`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal,
      });

      if (!res.ok) throw new Error(`Overpass ${res.status}`);

      const contentLength = res.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : null;

      if (res.body && typeof ReadableStream !== 'undefined') {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          if (signal?.aborted) {
            reader.cancel();
            throw new Error('Download aborted by user.');
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (received > MAX_ALLOWED_RESPONSE_BYTES) {
              reader.cancel();
              throw new Error(`Download size exceeded limit (${formatBytes(MAX_ALLOWED_RESPONSE_BYTES)}).`);
            }
            onProgress?.(`Downloading… ${formatBytes(received)}`, received, total);
          }
        }
        const text = new TextDecoder().decode(concatChunks(chunks));
        data = JSON.parse(text);
      } else {
        onProgress?.('Downloading…');
        data = (await res.json()) as { elements: (OverpassNode | OverpassWay)[] };
      }

      lastErr = null;
      break;
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) {
        throw new Error('Download aborted by user.');
      }
      lastErr = e as Error;
      onProgress?.(`Retrying with alternate server…`);
    }
  }

  if (!data || lastErr) {
    throw new Error(`Overpass download failed: ${lastErr?.message ?? 'unknown error'}`);
  }

  onProgress?.(`Received ${data.elements.length} elements. Parsing…`);

  const nodes = new Map<number, [number, number]>();
  const ways: OverpassWay[] = [];
  const poiNodes: OverpassNode[] = [];

  for (const el of data.elements) {
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

  onProgress?.('Extracting roads…');

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

  onProgress?.('Extracting points of interest…');

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
    tags.railway === 'subway_entrance' ||
    tags.railway === 'tram_stop' ||
    tags.public_transport === 'station' ||
    tags.public_transport === 'platform' ||
    tags.highway === 'bus_stop' ||
    tags.bus === 'yes'
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
    pedestrian: 1,
    footway: 1,
    path: 1,
    cycleway: 2,
    track: 1,
  };
  return classes[highway] ?? -1;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
