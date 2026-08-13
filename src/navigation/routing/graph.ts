import type { OfflineRegionData, OfflineRegion } from '@/navigation/domain/types';

export interface GraphNode {
  id: number;
  lat: number;
  lng: number;
}

export interface GraphEdge {
  to: number;
  roadClass: number;
  name?: string;
  weight: number;
  oneway?: boolean;
}

export interface SpatialGridIndex {
  cellSizeDeg: number;
  cells: Map<string, number[]>; // key "gridLat,gridLng" -> array of nodeIds
}

export interface RoadGraph {
  nodes: Map<number, GraphNode>;
  adjacency: Map<number, GraphEdge[]>;
  spatialIndex: SpatialGridIndex;
  bbox: { south: number; west: number; north: number; east: number };
  versionKey: string;
}

/** Speed factors by road class (higher = faster). */
const SPEED_FACTORS: Record<number, number> = {
  7: 1.0,   // motorway
  6: 0.9,   // trunk
  5: 0.75,  // primary
  4: 0.6,   // secondary
  3: 0.5,   // tertiary
  2: 0.35,  // unclassified/residential
  1: 0.2,   // service/footway
};

const GRID_CELL_DEG = 0.01; // ~1.1km grid cells

/**
 * Build an adjacency-list road graph from offline region payloads.
 */
export function buildGraph(regions: OfflineRegionData | OfflineRegionData[] | OfflineRegion | OfflineRegion[]): RoadGraph {
  const list = Array.isArray(regions) ? regions : [regions];
  const nodes = new Map<number, GraphNode>();
  const adjacency = new Map<number, GraphEdge[]>();
  const gridCells = new Map<string, number[]>();

  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  const versionParts: string[] = [];

  for (const region of list) {
    if (!region) continue;
    const regionId = 'regionId' in region ? region.regionId : region.id;
    versionParts.push(`${regionId}_${region.version || 1}`);

    const nodeEntries = 'nodes' in region ? Object.entries(region.nodes || {}) : [];
    for (const [idStr, coords] of nodeEntries) {
      const numId = Number(idStr);
      if (!nodes.has(numId) && Array.isArray(coords) && coords.length >= 2) {
        const [lat, lng] = coords;
        nodes.set(numId, { id: numId, lat, lng });
        adjacency.set(numId, []);

        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;

        // Add to spatial grid cell
        const cellX = Math.floor(lat / GRID_CELL_DEG);
        const cellY = Math.floor(lng / GRID_CELL_DEG);
        const cellKey = `${cellX},${cellY}`;
        let cell = gridCells.get(cellKey);
        if (!cell) {
          cell = [];
          gridCells.set(cellKey, cell);
        }
        cell.push(numId);
      }
    }
  }

  for (const region of list) {
    if (!region) continue;
    const edges = 'edges' in region ? region.edges || [] : [];
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length < 3) continue;
      const [from, to, roadClass, name] = edge;
      const fromNode = nodes.get(from);
      const toNode = nodes.get(to);
      if (!fromNode || !toNode) continue;

      const dist = haversine(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng);
      const speedFactor = SPEED_FACTORS[roadClass] ?? 0.3;
      const weight = dist / Math.max(0.15, speedFactor);

      const adj = adjacency.get(from);
      if (adj) {
        adj.push({ to, roadClass, name, weight });
      }
    }
  }

  return {
    nodes,
    adjacency,
    spatialIndex: {
      cellSizeDeg: GRID_CELL_DEG,
      cells: gridCells,
    },
    bbox: { south, west, north, east },
    versionKey: versionParts.sort().join('|'),
  };
}

/**
 * Find the nearest graph node to a given coordinate using spatial grid lookup.
 */
export function nearestNode(
  graph: RoadGraph,
  lat: number,
  lng: number,
  maxDistMeters = 2500
): GraphNode | null {
  const cellX = Math.floor(lat / GRID_CELL_DEG);
  const cellY = Math.floor(lng / GRID_CELL_DEG);

  let nearest: GraphNode | null = null;
  let minDistSq = Infinity;
  // ~0.025 degrees ≈ 2.7km max search radius in degrees
  const maxDegSq = (maxDistMeters / 111000) ** 2;

  // Search candidate grid cells (3x3 grid around cell)
  const candidateNodeIds: number[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cellX + dx},${cellY + dy}`;
      const ids = graph.spatialIndex.cells.get(key);
      if (ids) {
        for (let i = 0; i < ids.length; i++) {
          candidateNodeIds.push(ids[i]);
        }
      }
    }
  }

  // If spatial grid had nodes, search candidates; otherwise fallback to linear scan
  const searchPool = candidateNodeIds.length > 0
    ? candidateNodeIds.map((id) => graph.nodes.get(id)!).filter(Boolean)
    : graph.nodes.values();

  for (const node of searchPool) {
    const d = (node.lat - lat) ** 2 + (node.lng - lng) ** 2;
    if (d < minDistSq && d <= maxDegSq) {
      minDistSq = d;
      nearest = node;
    }
  }

  return nearest;
}

/** Check if a point is within the graph's bounding box. */
export function isPointInGraph(
  lat: number,
  lng: number,
  graph: RoadGraph
): boolean {
  const b = graph.bbox;
  if (b.south === Infinity) return false;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/**
 * Binary min-heap for A* open set.
 * Each entry is [nodeId, fScore]. Provides O(log n) push and pop.
 */
class MinHeap {
  private items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: [number, number]): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): [number, number] | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    const item = this.items[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.items[parentIdx];
      if (item[1] >= parent[1]) break;
      this.items[idx] = parent;
      idx = parentIdx;
    }
    this.items[idx] = item;
  }

  private bubbleDown(idx: number): void {
    const n = this.items.length;
    const item = this.items[idx];
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && this.items[left][1] < this.items[smallest][1]) smallest = left;
      if (right < n && this.items[right][1] < this.items[smallest][1]) smallest = right;
      if (smallest === idx) break;
      this.items[idx] = this.items[smallest];
      this.items[smallest] = item;
      idx = smallest;
    }
  }
}

export { MinHeap };

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
