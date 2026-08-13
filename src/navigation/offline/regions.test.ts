import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  listRegionSummaries,
  getRegionSummary,
  getRegionData,
  saveRegionData,
  deleteRegionData,
  validateRegionData,
  closeDb,
  canStoreBytes,
} from './regions';
import type { OfflineRegionSummary, OfflineRegionData } from '@/navigation/domain/types';

describe('regions store (v3)', () => {
  beforeEach(async () => {
    await closeDb();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('aanyaa_nav');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it('saves and retrieves region summary and payload separately', async () => {
    const summary: OfflineRegionSummary = {
      id: 'reg_1',
      label: 'Test Area',
      centerLat: 37.77,
      centerLng: -122.41,
      radiusKm: 5,
      createdAt: 1000,
      updatedAt: 1000,
      bbox: { south: 37.7, west: -122.5, north: 37.8, east: -122.3 },
      sizeBytes: 5000,
      version: 1,
      roadCount: 10,
      poiCount: 2,
      status: 'ready',
    };

    const data: OfflineRegionData = {
      regionId: 'reg_1',
      nodes: { 1: [37.77, -122.41], 2: [37.78, -122.42] },
      edges: [[1, 2, 1, 'Main St']],
      roads: [{ coords: [[-122.41, 37.77], [-122.42, 37.78]], roadClass: 1, name: 'Main St' }],
      pois: [{ lat: 37.77, lng: -122.41, name: 'Hospital', type: 'hospital' }],
      version: 1,
    };

    await saveRegionData(summary, data);

    const summaries = await listRegionSummaries();
    expect(summaries.length).toBe(1);
    expect(summaries[0].id).toBe('reg_1');
    expect(summaries[0].roadCount).toBe(10);

    const retrievedData = await getRegionData('reg_1');
    expect(retrievedData).not.toBeNull();
    expect(retrievedData?.edges.length).toBe(1);
    expect(retrievedData?.roads[0].name).toBe('Main St');
  });

  it('deletes region summary and data', async () => {
    const summary: OfflineRegionSummary = {
      id: 'reg_2',
      label: 'Area 2',
      centerLat: 0,
      centerLng: 0,
      radiusKm: 5,
      createdAt: 1000,
      updatedAt: 1000,
      bbox: { south: -1, west: -1, north: 1, east: 1 },
      sizeBytes: 1000,
      version: 1,
      roadCount: 0,
      poiCount: 0,
      status: 'ready',
    };

    const data: OfflineRegionData = {
      regionId: 'reg_2',
      nodes: {},
      edges: [],
      roads: [],
      pois: [],
      version: 1,
    };

    await saveRegionData(summary, data);
    await deleteRegionData('reg_2');

    const s = await getRegionSummary('reg_2');
    const d = await getRegionData('reg_2');
    expect(s).toBeNull();
    expect(d).toBeNull();
  });

  it('validates region data structure', () => {
    expect(validateRegionData(null)).toBe(false);
    expect(validateRegionData({ regionId: 'x', nodes: {}, edges: [], roads: [], pois: [], version: 1 })).toBe(true);
    expect(validateRegionData({ regionId: 'x', nodes: 'invalid' as any, edges: [], roads: [], pois: [], version: 1 })).toBe(false);
  });

  it('checks storage quota availability', async () => {
    const result = await canStoreBytes(1024 * 1024);
    expect(typeof result).toBe('boolean');
  });
});
