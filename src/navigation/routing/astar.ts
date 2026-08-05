import type {
  OfflineRegion,
  RouteResult,
  TravelMode,
  TurnInstruction,
  InstructionType,
} from '@/navigation/domain/types';
import { buildGraph, nearestNode, type RoadGraph } from '@/navigation/routing/graph';

/**
 * Offline A* router over the locally stored OSM road graph.
 * No network calls. Uses haversine heuristic + road-class weighting.
 */
export function routeOffline(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  region: OfflineRegion,
): RouteResult | null {
  const graph = buildGraph(region);
  const startNode = nearestNode(graph, startLat, startLng);
  const destNode = nearestNode(graph, destLat, destLng);

  if (!startNode || !destNode) return null;
  if (startNode.id === destNode.id) {
    return {
      coordinates: [
        { lat: startLat, lng: startLng },
        { lat: destLat, lng: destLng },
      ],
      distanceMeters: 0,
      durationSeconds: 0,
      instructions: [
        {
          type: 'arrive',
          roadName: 'Home',
          distanceMeters: 0,
          cumulativeMeters: 0,
          point: { lat: destLat, lng: destLng },
        },
      ],
      mode,
    };
  }

  const path = aStar(graph, startNode.id, destNode.id);
  if (!path || path.length < 2) return null;

  // Build coordinates from path
  const coordinates: { lat: number; lng: number }[] = [];
  for (const nodeId of path) {
    const n = graph.nodes.get(nodeId)!;
    coordinates.push({ lat: n.lat, lng: n.lng });
  }

  // Calculate distance + duration
  let totalDistance = 0;
  let totalDuration = 0;
  const speeds: Record<TravelMode, number> = {
    walk: 5, // km/h
    drive: 40,
    bike: 15,
  };

  for (let i = 0; i < path.length - 1; i++) {
    const a = graph.nodes.get(path[i])!;
    const b = graph.nodes.get(path[i + 1])!;
    const dist = haversine(a.lat, a.lng, b.lat, b.lng);
    totalDistance += dist;
    totalDuration += (dist / 1000 / speeds[mode]) * 3600;
  }

  // Build turn-by-turn instructions
  const instructions = buildInstructions(graph, path, coordinates, mode);

  return {
    coordinates,
    distanceMeters: Math.round(totalDistance),
    durationSeconds: Math.round(totalDuration),
    instructions,
    mode,
  };
}

function aStar(
  graph: RoadGraph,
  startId: number,
  goalId: number,
): number[] | null {
  const openSet = new Set<number>([startId]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  gScore.set(startId, 0);
  const goalNode = graph.nodes.get(goalId)!;
  fScore.set(startId, heuristic(graph.nodes.get(startId)!, goalNode));

  let iterations = 0;
  const maxIter = 50000;

  while (openSet.size > 0 && iterations < maxIter) {
    iterations++;

    // Find node with lowest fScore
    let current = -1;
    let lowestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = id;
      }
    }

    if (current === goalId) {
      return reconstructPath(cameFrom, current);
    }

    openSet.delete(current);
    const edges = graph.adjacency.get(current) ?? [];

    for (const edge of edges) {
      const tentativeG = (gScore.get(current) ?? Infinity) + edge.weight;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentativeG);
        fScore.set(
          edge.to,
          tentativeG + heuristic(graph.nodes.get(edge.to)!, goalNode),
        );
        openSet.add(edge.to);
      }
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Map<number, number>,
  current: number,
): number[] {
  const path = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    path.unshift(current);
  }
  return path;
}

function heuristic(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return haversine(a.lat, a.lng, b.lat, b.lng);
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

function buildInstructions(
  graph: RoadGraph,
  path: number[],
  coords: { lat: number; lng: number }[],
  mode: TravelMode,
): TurnInstruction[] {
  const instructions: TurnInstruction[] = [];

  // Depart
  const firstName = getEdgeName(graph, path[0], path[1]);
  instructions.push({
    type: 'depart',
    roadName: firstName || 'Start',
    distanceMeters: 0,
    cumulativeMeters: 0,
    point: coords[0],
  });

  let cumulative = 0;
  let segStart = 0;

  // Group consecutive edges by road name → produce a turn when the name changes
  for (let i = 1; i < path.length - 1; i++) {
    const prevName = getEdgeName(graph, path[i - 1], path[i]);
    const currName = getEdgeName(graph, path[i], path[i + 1]);

    // Distance for this segment
    const a = graph.nodes.get(path[i])!;
    const b = graph.nodes.get(path[i + 1])!;
    cumulative += haversine(a.lat, a.lng, b.lat, b.lng);

    if (prevName !== currName && currName) {
      // Compute turn type from bearing change
      const prevBearing = bearing(
        graph.nodes.get(path[i - 1])!,
        graph.nodes.get(path[i])!,
      );
      const newBearing = bearing(
        graph.nodes.get(path[i])!,
        graph.nodes.get(path[i + 1])!,
      );
      const turnType = classifyTurn(prevBearing, newBearing);

      const segDist = cumulative - instructions[instructions.length - 1].cumulativeMeters;
      instructions.push({
        type: turnType,
        roadName: currName,
        distanceMeters: Math.round(segDist),
        cumulativeMeters: Math.round(cumulative),
        point: { lat: a.lat, lng: a.lng },
      });
      segStart = i;
    }
  }

  // Arrive
  const lastNode = graph.nodes.get(path[path.length - 1])!;
  instructions.push({
    type: 'arrive',
    roadName: 'Home',
    distanceMeters: 0,
    cumulativeMeters: Math.round(cumulative),
    point: { lat: lastNode.lat, lng: lastNode.lng },
  });

  return instructions;
}

function getEdgeName(
  graph: RoadGraph,
  from: number,
  to: number,
): string | undefined {
  const edges = graph.adjacency.get(from);
  if (!edges) return undefined;
  for (const e of edges) {
    if (e.to === to) return e.name;
  }
  return undefined;
}

function bearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function classifyTurn(prevBearing: number, newBearing: number): InstructionType {
  let diff = ((newBearing - prevBearing + 360) % 360);
  if (diff > 180) diff -= 360;

  if (Math.abs(diff) < 25) return 'straight';
  if (diff >= 25 && diff < 60) return 'slight-right';
  if (diff >= 60 && diff < 120) return 'turn-right';
  if (diff >= 120) return 'sharp-right';
  if (diff <= -25 && diff > -60) return 'slight-left';
  if (diff <= -60 && diff > -120) return 'turn-left';
  if (diff <= -120) return 'sharp-left';
  return 'straight';
}
