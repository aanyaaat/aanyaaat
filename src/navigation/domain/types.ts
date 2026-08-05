/** Navigation domain types for the GET ME HOME feature. */

export interface HomeLocation {
  label: string;
  latitude: number;
  longitude: number;
}

export type GpsStatus =
  | 'idle'
  | 'locating'
  | 'found'
  | 'weak'
  | 'denied'
  | 'unavailable'
  | 'stale';

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type TravelMode = 'walk' | 'drive' | 'bike';

export type InstructionType =
  | 'depart'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'straight'
  | 'arrive'
  | 'uturn';

export interface TurnInstruction {
  type: InstructionType;
  roadName: string;
  distanceMeters: number;
  /** Cumulative distance from start to this instruction, in meters. */
  cumulativeMeters: number;
  /** Coordinate where this maneuver begins. */
  point: { lat: number; lng: number };
}

export interface RouteResult {
  coordinates: { lat: number; lng: number }[];
  distanceMeters: number;
  durationSeconds: number;
  instructions: TurnInstruction[];
  mode: TravelMode;
}

export type RegionPresetKm = 5 | 10 | 20 | 30;

export interface OfflineRegion {
  id: string;
  label: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  createdAt: number;
  updatedAt: number;
  /** Road graph nodes (id → [lat, lng]). */
  nodes: Record<number, [number, number]>;
  /** Edges: [fromId, toId, roadClass, name?]. */
  edges: [number, number, number, string?][];
  /** GeoJSON LineStrings for rendering. */
  roads: GeoJsonRoad[];
  /** Points of interest. */
  pois: Poi[];
  /** Size in bytes (approx). */
  sizeBytes: number;
}

export interface GeoJsonRoad {
  coords: [number, number][]; // [lng, lat] pairs
  roadClass: number;
  name?: string;
}

export interface Poi {
  lat: number;
  lng: number;
  name: string;
  type: 'hospital' | 'police' | 'station' | 'landmark';
}

export type NetworkStatus = 'online' | 'offline';

export type NavPhase =
  | 'idle'
  | 'locating'
  | 'calculating'
  | 'navigating'
  | 'recalculating'
  | 'off-coverage'
  | 'arrived';

export type BearingCardinal =
  | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
