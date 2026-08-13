import type { OfflineRegionData } from '@/navigation/domain/types';
import { getRegionData, validateRegionData } from '@/navigation/offline/regions';

/**
 * Bounded LRU data manager for active offline map vector payloads.
 * Keeps a maximum of 2 active vector payloads in memory to avoid memory bloat.
 */
class RegionDataManager {
  private cache = new Map<string, OfflineRegionData>();
  private maxCacheSize = 2;
  private pendingLoads = new Set<string>();
  private listeners = new Set<() => void>();

  public getCachedData(regionId: string): OfflineRegionData | undefined {
    const data = this.cache.get(regionId);
    if (data) {
      // Refresh LRU position
      this.cache.delete(regionId);
      this.cache.set(regionId, data);
    }
    return data;
  }

  public async requestData(regionId: string): Promise<OfflineRegionData | null> {
    const existing = this.getCachedData(regionId);
    if (existing) return existing;

    if (this.pendingLoads.has(regionId)) return null;

    this.pendingLoads.add(regionId);

    try {
      const data = await getRegionData(regionId);
      if (data && validateRegionData(data)) {
        this.cache.set(regionId, data);
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
