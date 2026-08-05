import type { OfflineRegion } from '@/navigation/domain/types';

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
  /** True for oneway streets — can only traverse from→to. */
  oneway?: boolean;
}

export interface RoadGraph {
  nodes: Map<number, GraphNode>;
  adjacency: Map<number, GraphEdge[]>;
  /** Bounding box for quick coverage checks. */
  bbox: { south: number; west: number; north: number; east: number };
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

/**
 * Build an adjacency-list road graph from a stored offline region.
 * Multiple regions can be merged into a single graph.
 */
export function buildGraph(regions: OfflineRegion | OfflineRegion[]): RoadGraph {
  const list = Array.isArray(regions) ? regions : [regions];
  const nodes = new Map<number, GraphNode>();
  const adjacency = new Map<number, GraphEdge[]>();

  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;

  for (const region of list) {
    for (const [id, [lat, lng]] of Object.entries(region.nodes)) {
      const numId = Number(id);
      if (!nodes.has(numId)) {
        nodes.set(numId, { id: numId, lat, lng });
        adjacency.set(numId, []);
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
    }
  }

  for (const region of list) {
    for (const [from, to, roadClass, name] of region.edges) {
      const fromNode = nodes.get(from);
      const toNode = nodes.get(to);
      if (!fromNode || !toNode) continue;

      const dist = haversine(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng);
      const speedFactor = SPEED_FACTORS[roadClass] ?? 0.3;
      const weight = dist / Math.max(0.15, speedFactor);

      adjacency.get(from)!.push({ to, roadClass, name, weight });
    }
  }

  return {
    nodes,
    adjacency,
    bbox: { south, west, north, east },
  };
}

/**
 * Find the nearest graph node to a given coordinate.
 * Limits search to within ~2km to avoid matching nodes from distant regions.
 */
export function nearestNode(
  graph: RoadGraph,
  lat: number,
  lng: number,
): GraphNode | null {
  let nearest: GraphNode | null = null;
  let minDistSq = Infinity;
  // ~0.02 degrees ≈ ~2.2km — max snapping distance
  const maxDistSq = 0.02 * 0.02;
  for (const node of graph.nodes.values()) {
    const d = (node.lat - lat) ** 2 + (node.lng - lng) ** 2;
    if (d < minDistSq && d <= maxDistSq) {
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
  graph: RoadGraph,
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
  lng2: number,
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
