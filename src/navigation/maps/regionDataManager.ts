import type { OfflineRegionData, GeoJsonRoad, Bbox } from '@/navigation/domain/types';
import { getRegionData, validateRegionData } from '@/navigation/offline/regions';

const GRID_CELL_DEG = 0.04; // ~4.4km spatial grid cell size

export interface IndexedRegionData {
  data: OfflineRegionData;
  grid: Map<string, GeoJsonRoad[]>;
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
}

function getCellKey(x: number, y: number): string {
  return `${x}_${y}`;
}

function buildSpatialGrid(data: OfflineRegionData): IndexedRegionData {
  const grid = new Map<string, GeoJsonRoad[]>();
  let minCellX = Infinity;
  let maxCellX = -Infinity;
  let minCellY = Infinity;
  let maxCellY = -Infinity;

  for (const road of data.roads) {
    if (!road.coords || road.coords.length < 2) continue;

    let rSouth = Infinity, rNorth = -Infinity, rWest = Infinity, rEast = -Infinity;
    if (road.bbox) {
      rSouth = road.bbox.south;
      rNorth = road.bbox.north;
      rWest = road.bbox.west;
      rEast = road.bbox.east;
    } else {
      for (const [lng, lat] of road.coords) {
        if (lat < rSouth) rSouth = lat;
        if (lat > rNorth) rNorth = lat;
        if (lng < rWest) rWest = lng;
        if (lng > rEast) rEast = lng;
      }
    }

    const startCellX = Math.floor(rWest / GRID_CELL_DEG);
    const endCellX = Math.floor(rEast / GRID_CELL_DEG);
    const startCellY = Math.floor(rSouth / GRID_CELL_DEG);
    const endCellY = Math.floor(rNorth / GRID_CELL_DEG);

    if (startCellX < minCellX) minCellX = startCellX;
    if (endCellX > maxCellX) maxCellX = endCellX;
    if (startCellY < minCellY) minCellY = startCellY;
    if (endCellY > maxCellY) maxCellY = endCellY;

    for (let cx = startCellX; cx <= endCellX; cx++) {
      for (let cy = startCellY; cy <= endCellY; cy++) {
        const key = getCellKey(cx, cy);
        let list = grid.get(key);
        if (!list) {
          list = [];
          grid.set(key, list);
        }
        list.push(road);
      }
    }
  }

  return { data, grid, minCellX, maxCellX, minCellY, maxCellY };
}

/**
 * Bounded LRU data manager for active offline map vector payloads with Spatial Grid Index.
 */
class RegionDataManager {
  private cache = new Map<string, IndexedRegionData>();
  private maxCacheSize = 2;
  private pendingLoads = new Set<string>();
  private listeners = new Set<() => void>();

  public getCachedData(regionId: string): OfflineRegionData | undefined {
    const indexed = this.cache.get(regionId);
    if (indexed) {
      this.cache.delete(regionId);
      this.cache.set(regionId, indexed);
      return indexed.data;
    }
    return undefined;
  }

  public getIndexedData(regionId: string): IndexedRegionData | undefined {
    return this.cache.get(regionId);
  }

  public getVisibleRoads(regionId: string, bounds: Bbox, minClass = 1): GeoJsonRoad[] {
    const indexed = this.cache.get(regionId);
    if (!indexed) return [];

    const startCellX = Math.floor(bounds.west / GRID_CELL_DEG);
    const endCellX = Math.floor(bounds.east / GRID_CELL_DEG);
    const startCellY = Math.floor(bounds.south / GRID_CELL_DEG);
    const endCellY = Math.floor(bounds.north / GRID_CELL_DEG);

    const seenRoads = new Set<GeoJsonRoad>();
    const result: GeoJsonRoad[] = [];

    for (let cx = startCellX; cx <= endCellX; cx++) {
      for (let cy = startCellY; cy <= endCellY; cy++) {
        const list = indexed.grid.get(getCellKey(cx, cy));
        if (!list) continue;

        for (const road of list) {
          if (road.roadClass < minClass) continue;
          if (!seenRoads.has(road)) {
            seenRoads.add(road);
            if (road.bbox) {
              if (
                road.bbox.north < bounds.south ||
                road.bbox.south > bounds.north ||
                road.bbox.east < bounds.west ||
                road.bbox.west > bounds.east
              ) {
                continue;
              }
            }
            result.push(road);
          }
        }
      }
    }

    return result;
  }

  public async requestData(regionId: string): Promise<OfflineRegionData | null> {
    const existing = this.getCachedData(regionId);
    if (existing) return existing;

    if (this.pendingLoads.has(regionId)) return null;

    this.pendingLoads.add(regionId);

    try {
      const data = await getRegionData(regionId);
      if (data && validateRegionData(data)) {
        const indexed = buildSpatialGrid(data);
        this.cache.set(regionId, indexed);
        this.prune();
        this.notify();
        return data;
      }
      return null;
    } catch {
      return null;
    } finally {
      this.pendingLoads.delete(regionId);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private prune(): void {
    while (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }

  public clear(): void {
    this.cache.clear();
    this.pendingLoads.clear();
  }
}

export const regionDataManager = new RegionDataManager();
