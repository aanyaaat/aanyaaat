/** Navigation domain types for the offline mapping and navigation system. */

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
  | 'uturn'
  | 'merge'
  | 'roundabout';

export interface TurnInstruction {
  type: InstructionType;
  roadName: string;
  distanceMeters: number;
  cumulativeMeters: number;
  point: { lat: number; lng: number };
  /** Spoken instruction text for TTS. */
  spoken?: string;
  /** Lane guidance info if available. */
  lanes?: string;
}

export interface RouteResult {
  coordinates: { lat: number; lng: number }[];
  distanceMeters: number;
  durationSeconds: number;
  instructions: TurnInstruction[];
  mode: TravelMode;
  /** Route type: fastest or shortest. */
  routeType?: 'fastest' | 'shortest';
  /** When the route only covers part of the journey. */
  partial?: PartialRouteInfo;
  /** Alternative routes if available. */
  alternatives?: RouteResult[];
}

export interface PartialRouteInfo {
  remainingStraightMeters: number;
  bearingDeg: number;
  cardinal: string;
  reason: string;
  /** Distance from start to the end of mapped coverage. */
  coveredMeters: number;
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
  /** Bounding box for quick coverage checks. */
  bbox: { south: number; west: number; north: number; east: number };
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
  /** Version for incremental updates. */
  version: number;
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
  type: 'hospital' | 'police' | 'station' | 'bus_stop' | 'landmark';
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

/** Saved place types for favorites, recent destinations, etc. */
export type SavedPlaceType = 'home' | 'work' | 'favorite' | 'recent';

export interface SavedPlace {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: SavedPlaceType;
  createdAt: number;
}

/** Download progress info for the download manager. */
export interface DownloadProgress {
  phase: 'idle' | 'downloading' | 'parsing' | 'saving' | 'done' | 'error' | 'paused';
  message: string;
  bytesReceived: number;
  totalBytes: number | null;
  percent: number;
  speed: number; // bytes/sec
  etaSeconds: number | null;
  regionId: string;
}

/** Navigation settings for routing preferences. */
export interface RoutingPreferences {
  avoidTolls: boolean;
  avoidHighways: boolean;
  routeType: 'fastest' | 'shortest';
}
