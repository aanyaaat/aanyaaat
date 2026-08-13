import { describe, it, expect } from 'vitest';
import { routeOfflineWithDiagnostics } from './astar';
import type { OfflineRegionData } from '@/navigation/domain/types';

describe('astar routing engine', () => {
  const sampleRegionData: OfflineRegionData = {
    regionId: 'test_reg',
    nodes: {
      1: [37.77, -122.41],
      2: [37.77, -122.40],
      3: [37.78, -122.40],
      4: [37.85, -122.30], // Disconnected node far away
    },
    edges: [
      [1, 2, 5, 'Main St'],
      [2, 1, 5, 'Main St'],
      [2, 3, 4, 'Broadway'],
      [3, 2, 4, 'Broadway'],
    ],
    roads: [],
    pois: [],
    version: 1,
  };

  it('computes road route between connected nodes', () => {
    const result = routeOfflineWithDiagnostics(
      37.77, -122.41,
      37.78, -122.40,
      'drive',
      [sampleRegionData]
    );

    expect(result.error).toBeNull();
    expect(result.route).not.toBeNull();
    expect(result.route?.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(result.route?.source).toBe('offline');
    expect(result.route?.instructions.some((i) => i.type === 'arrive')).toBe(true);
  });

  it('returns explicit error when start is outside coverage', () => {
    const result = routeOfflineWithDiagnostics(
      0.0, 0.0,
      37.78, -122.40,
      'drive',
      [sampleRegionData]
    );

    expect(result.route).toBeNull();
    expect(result.error?.reason).toBe('outside-coverage');
  });

  it('returns explicit error when no connected road path exists (NEVER straight line)', () => {
    const result = routeOfflineWithDiagnostics(
      37.77, -122.41,
      37.85, -122.30, // Disconnected node
      'drive',
      [sampleRegionData]
    );

    expect(result.route).toBeNull();
    expect(result.error?.reason).toBe('no-road-path');
  });

  it('returns explicit error when no regions are provided', () => {
    const result = routeOfflineWithDiagnostics(
      37.77, -122.41,
      37.78, -122.40,
      'drive',
      []
    );

    expect(result.route).toBeNull();
    expect(result.error?.reason).toBe('no-region');
  });
});
