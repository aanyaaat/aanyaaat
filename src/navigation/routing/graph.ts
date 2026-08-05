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
}

export interface RoadGraph {
  nodes: Map<number, GraphNode>;
  adjacency: Map<number, GraphEdge[]>;
}

/**
 * Build an adjacency-list road graph from the stored offline region.
 */
export function buildGraph(region: OfflineRegion): RoadGraph {
  const nodes = new Map<number, GraphNode>();
  const adjacency = new Map<number, GraphEdge[]>();

  for (const [id, [lat, lng]] of Object.entries(region.nodes)) {
    const numId = Number(id);
    nodes.set(numId, { id: numId, lat, lng });
    adjacency.set(numId, []);
  }

  for (const [from, to, roadClass, name] of region.edges) {
    const fromNode = nodes.get(from);
    const toNode = nodes.get(to);
    if (!fromNode || !toNode) continue;

    const dist = haversine(
      fromNode.lat,
      fromNode.lng,
      toNode.lat,
      toNode.lng,
    );
    // Weight: distance / speed factor. Higher road class = faster.
    const speedFactor = Math.max(0.3, roadClass / 7);
    const weight = dist / speedFactor;

    adjacency.get(from)!.push({ to, roadClass, name, weight });
  }

  return { nodes, adjacency };
}

/**
 * Find the nearest graph node to a given coordinate.
 */
export function nearestNode(
  graph: RoadGraph,
  lat: number,
  lng: number,
): GraphNode | null {
  let nearest: GraphNode | null = null;
  let minDist = Infinity;
  for (const node of graph.nodes.values()) {
    const d = (node.lat - lat) ** 2 + (node.lng - lng) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = node;
    }
  }
  return nearest;
}

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
