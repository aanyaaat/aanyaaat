import type {
  OfflineRegion,
  RouteResult,
  TravelMode,
  TurnInstruction,
  InstructionType,
  PartialRouteInfo,
  RoutingPreferences,
} from '@/navigation/domain/types';
import {
  buildGraph,
  nearestNode,
  isPointInGraph,
  MinHeap,
  type RoadGraph,
} from '@/navigation/routing/graph';

/**
 * Offline A* router over locally stored OSM road graphs.
 * Uses a binary min-heap for the open set (O(log n) operations).
 *
 * Multi-region: all installed regions are merged into a single graph.
 *
 * Distance safety: all distances are computed via haversine and validated
 * against the straight-line distance. A route should never be longer than
 * ~3x the straight-line distance for normal road networks.
 */

const MODE_SPEEDS: Record<TravelMode, number> = {
  walk: 5,
  drive: 40,
  bike: 15,
};

/** Maximum ratio of route distance to straight-line distance. */
const MAX_DETOUR_RATIO = 4.0;

export function routeOffline(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  regions: OfflineRegion | OfflineRegion[],
  prefs?: RoutingPreferences,
): RouteResult | null {
  const graph = buildGraph(regions);

  if (graph.nodes.size === 0) return null;

  const straightLine = haversine(startLat, startLng, destLat, destLng);

  const startNode = nearestNode(graph, startLat, startLng);
  const destNode = nearestNode(graph, destLat, destLng);

  if (!startNode || !destNode) return null;

  // Same node → arrive
  if (startNode.id === destNode.id) {
    return {
      coordinates: [
        { lat: startLat, lng: startLng },
        { lat: destLat, lng: destLng },
      ],
      distanceMeters: Math.round(straightLine),
      durationSeconds: Math.round((straightLine / 1000 / MODE_SPEEDS[mode]) * 3600),
      instructions: [{
        type: 'arrive',
        roadName: 'Destination',
        distanceMeters: 0,
        cumulativeMeters: 0,
        point: { lat: destLat, lng: destLng },
      }],
      mode,
    };
  }

  const path = aStar(graph, startNode.id, destNode.id, prefs);

  if (path && path.length >= 2) {
    // Build coordinates from path
    const coordinates: { lat: number; lng: number }[] = [];
    for (const nodeId of path) {
      const n = graph.nodes.get(nodeId)!;
      coordinates.push({ lat: n.lat, lng: n.lng });
    }

    // Calculate distance + duration
    let totalDistance = 0;
    let totalDuration = 0;
    const speed = MODE_SPEEDS[mode];

    for (let i = 0; i < path.length - 1; i++) {
      const a = graph.nodes.get(path[i])!;
      const b = graph.nodes.get(path[i + 1])!;
      const dist = haversine(a.lat, a.lng, b.lat, b.lng);
      totalDistance += dist;
      totalDuration += (dist / 1000 / speed) * 3600;
    }

    // Add access distances: start→startNode and destNode→dest
    const startAccess = haversine(startLat, startLng, startNode.lat, startNode.lng);
    const destAccess = haversine(destNode.lat, destNode.lng, destLat, destLng);
    totalDistance += startAccess + destAccess;
    totalDuration += ((startAccess + destAccess) / 1000 / speed) * 3600;

    // Sanity check: if route is absurdly long, fall back to straight line
    if (straightLine > 100 && totalDistance > straightLine * MAX_DETOUR_RATIO) {
      return buildStraightLineRoute(startLat, startLng, destLat, destLng, mode, 'route-too-long');
    }

    // Check if destination is outside all region bboxes → partial route
    const regionList = Array.isArray(regions) ? regions : [regions];
    const destInCoverage = regionList.some(
      (r) =>
        destLat >= r.bbox.south &&
        destLat <= r.bbox.north &&
        destLng >= r.bbox.west &&
        destLng <= r.bbox.east,
    );
    let partial: PartialRouteInfo | undefined;
    if (!destInCoverage) {
      const lastCoord = coordinates[coordinates.length - 1];
      const remaining = haversine(lastCoord.lat, lastCoord.lng, destLat, destLng);
      const bearing = bearingBetween(lastCoord.lat, lastCoord.lng, destLat, destLng);
      partial = {
        remainingStraightMeters: Math.round(remaining),
        bearingDeg: Math.round(bearing),
        cardinal: cardinalFromBearing(bearing),
        reason: 'outside-mapped-area',
        coveredMeters: Math.round(totalDistance),
      };
    }

    const instructions = buildInstructions(graph, path, coordinates, mode);

    return {
      coordinates,
      distanceMeters: Math.round(totalDistance),
      durationSeconds: Math.round(totalDuration),
      instructions,
      mode,
      routeType: prefs?.routeType ?? 'fastest',
      partial,
    };
  }

  // No path found — provide a straight-line fallback with guidance
  return buildStraightLineRoute(startLat, startLng, destLat, destLng, mode, 'no-road-path');
}

/**
 * Build a straight-line route with bearing guidance.
 * Used as a last-resort fallback when no road path exists.
 */
function buildStraightLineRoute(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  reason: string,
): RouteResult {
  const dist = haversine(startLat, startLng, destLat, destLng);
  const bearing = bearingBetween(startLat, startLng, destLat, destLng);
  const cardinal = cardinalFromBearing(bearing);
  const speed = MODE_SPEEDS[mode];
  const duration = (dist / 1000 / speed) * 3600;

  return {
    coordinates: [
      { lat: startLat, lng: startLng },
      { lat: destLat, lng: destLng },
    ],
    distanceMeters: Math.round(dist),
    durationSeconds: Math.round(duration),
    instructions: [
      {
        type: 'depart',
        roadName: `Head ${cardinal} toward destination`,
        distanceMeters: Math.round(dist),
        cumulativeMeters: 0,
        point: { lat: startLat, lng: startLng },
        spoken: `Head ${cardinal} toward your destination`,
      },
      {
        type: 'arrive',
        roadName: 'Destination',
        distanceMeters: 0,
        cumulativeMeters: Math.round(dist),
        point: { lat: destLat, lng: destLng },
        spoken: 'You have arrived at your destination',
      },
    ],
    mode,
    partial: {
      remainingStraightMeters: Math.round(dist),
      bearingDeg: Math.round(bearing),
      cardinal,
      reason,
      coveredMeters: 0,
    },
  };
}

/**
 * A* with binary heap. O(E log V).
 */
function aStar(
  graph: RoadGraph,
  startId: number,
  goalId: number,
  prefs?: RoutingPreferences,
): number[] | null {
  const openHeap = new MinHeap();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const closed = new Set<number>();

  const goalNode = graph.nodes.get(goalId)!;
  const startH = heuristic(graph.nodes.get(startId)!, goalNode);

  gScore.set(startId, 0);
  openHeap.push([startId, startH]);

  let iterations = 0;
  const maxIter = 500000;

  while (openHeap.size > 0 && iterations < maxIter) {
    iterations++;
    const [current] = openHeap.pop()!;

    if (closed.has(current)) continue;

    if (current === goalId) {
      return reconstructPath(cameFrom, current);
    }

    closed.add(current);
    const edges = graph.adjacency.get(current) ?? [];

    for (const edge of edges) {
      if (closed.has(edge.to)) continue;

      if (prefs?.avoidHighways && edge.roadClass >= 6) continue;

      const tentativeG = (gScore.get(current) ?? Infinity) + edge.weight;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentativeG);
        const h = heuristic(graph.nodes.get(edge.to)!, goalNode);
        openHeap.push([edge.to, tentativeG + h]);
      }
    }
  }

  return null;
}

function reconstructPath(cameFrom: Map<number, number>, current: number): number[] {
  const path = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    path.unshift(current);
  }
  return path;
}

function heuristic(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversine(a.lat, a.lng, b.lat, b.lng);
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

function bearingBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function cardinalFromBearing(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(bearing / 45) % 8];
}

function buildInstructions(
  graph: RoadGraph,
  path: number[],
  coords: { lat: number; lng: number }[],
  mode: TravelMode,
): TurnInstruction[] {
  const instructions: TurnInstruction[] = [];

  const firstName = getEdgeName(graph, path[0], path[1]);
  instructions.push({
    type: 'depart',
    roadName: firstName || 'Start',
    distanceMeters: 0,
    cumulativeMeters: 0,
    point: coords[0],
    spoken: `Head out on ${firstName || 'the current road'}`,
  });

  let cumulative = 0;

  for (let i = 1; i < path.length - 1; i++) {
    const prevName = getEdgeName(graph, path[i - 1], path[i]);
    const currName = getEdgeName(graph, path[i], path[i + 1]);

    const a = graph.nodes.get(path[i])!;
    const b = graph.nodes.get(path[i + 1])!;
    cumulative += haversine(a.lat, a.lng, b.lat, b.lng);

    if (prevName !== currName && currName) {
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
      const spoken = buildSpoken(turnType, currName);
      instructions.push({
        type: turnType,
        roadName: currName,
        distanceMeters: Math.round(segDist),
        cumulativeMeters: Math.round(cumulative),
        point: { lat: a.lat, lng: a.lng },
        spoken,
      });
    }
  }

  const lastNode = graph.nodes.get(path[path.length - 1])!;
  instructions.push({
    type: 'arrive',
    roadName: 'Destination',
    distanceMeters: 0,
    cumulativeMeters: Math.round(cumulative),
    point: { lat: lastNode.lat, lng: lastNode.lng },
    spoken: 'You have arrived at your destination',
  });

  return instructions;
}

function buildSpoken(type: InstructionType, roadName: string): string {
  const name = roadName || 'the road';
  switch (type) {
    case 'turn-left': return `Turn left onto ${name}`;
    case 'turn-right': return `Turn right onto ${name}`;
    case 'slight-left': return `Slight left onto ${name}`;
    case 'slight-right': return `Slight right onto ${name}`;
    case 'sharp-left': return `Sharp left onto ${name}`;
    case 'sharp-right': return `Sharp right onto ${name}`;
    case 'straight': return `Continue on ${name}`;
    case 'uturn': return `Make a U-turn onto ${name}`;
    case 'arrive': return 'You have arrived at your destination';
    case 'depart': return `Head out on ${name}`;
    default: return `Continue on ${name}`;
  }
}

function getEdgeName(graph: RoadGraph, from: number, to: number): string | undefined {
  const edges = graph.adjacency.get(from);
  if (!edges) return undefined;
  for (const e of edges) {
    if (e.to === to) return e.name;
  }
  return undefined;
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
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
