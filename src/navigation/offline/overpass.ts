import type {
  GeoJsonRoad,
  OfflineRegion,
  Poi,
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
}

export async function fetchOsmBbox(
  south: number,
  west: number,
  north: number,
  east: number,
  onProgress: (msg: string) => void,
): Promise<OfflineRegion> {
  const bbox = `${south},${west},${north},${east}`;
  // Request highways (roads) + emergency/transit amenities
  const query = `
    [out:json][timeout:90];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|footway|path|cycleway|pedestrian|track)$"](${bbox});
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
    try {
      onProgress(`Fetching from ${new URL(endpoint).hostname}…`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      data = (await res.json()) as { elements: (OverpassNode | OverpassWay)[] };
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e as Error;
    }
  }

  if (!data || lastErr) {
    throw new Error(
      `Overpass download failed: ${lastErr?.message ?? 'unknown error'}`,
    );
  }

  onProgress(`Received ${data.elements.length} elements. Parsing…`);

  const nodes = new Map<number, [number, number]>();
  const nodeTags = new Map<number, Record<string, string>>();
  const ways: OverpassWay[] = [];
  const poiNodes: OverpassNode[] = [];

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
      if (el.tags) {
        nodeTags.set(el.id, el.tags);
        if (
          el.tags.amenity === 'hospital' ||
          el.tags.amenity === 'police' ||
          el.tags.railway === 'station' ||
          el.tags.railway === 'subway_entrance' ||
          el.tags.railway === 'tram_stop' ||
          el.tags.public_transport === 'station' ||
          el.tags.public_transport === 'platform' ||
          el.tags.highway === 'bus_stop' ||
          el.tags.bus === 'yes'
        ) {
          poiNodes.push(el);
        }
      }
    } else if (el.type === 'way') {
      ways.push(el);
      // For ways with geometry (out geom), nodes are included with coords
      if ((el as OverpassWay & { geometry?: { lat: number; lon: number }[] }).geometry) {
        const geom = (el as OverpassWay & { geometry: { lat: number; lon: number }[] }).geometry;
        for (let i = 0; i < el.nodes.length; i++) {
          if (!nodes.has(el.nodes[i])) {
            nodes.set(el.nodes[i], [geom[i].lat, geom[i].lon]);
          }
        }
      }
    }
  }

  onProgress('Extracting roads…');

  // Build road graph + render geometry
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

    for (const nodeId of way.nodes) {
      const n = nodes.get(nodeId);
      if (!n) continue;
      graphNodes[nodeId] = n;
      coords.push([n[1], n[0]]); // [lng, lat]
    }

    if (coords.length < 2) continue;

    roads.push({ coords, roadClass, name });

    // Build edges between consecutive nodes
    const oneway = tags.oneway === 'yes';
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = way.nodes[i];
      const b = way.nodes[i + 1];
      if (!nodes.has(a) || !nodes.has(b)) continue;
      graphEdges.push([a, b, roadClass, name]);
      if (!oneway) {
        graphEdges.push([b, a, roadClass, name]);
      }
    }
  }

  onProgress('Extracting points of interest…');

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

  // Estimate size
  const sizeBytes =
    Object.keys(graphNodes).length * 24 +
    graphEdges.length * 32 +
    roads.length * 120 +
    pois.length * 80;

  return {
    id: '',
    label: '',
    centerLat: 0,
    centerLng: 0,
    radiusKm: 0,
    createdAt: 0,
    updatedAt: 0,
    nodes: graphNodes,
    edges: graphEdges,
    roads,
    pois,
    sizeBytes,
  };
}

function classifyRoad(highway: string): number {
  // Higher = more important/faster
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
