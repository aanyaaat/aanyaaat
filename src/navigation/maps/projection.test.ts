import { describe, it, expect } from 'vitest';
import {
  project,
  unproject,
  panViewportByPixels,
  zoomViewportAtPixel,
  clampLatitude,
  normalizeLongitude,
  Viewport,
} from './projection';

describe('projection', () => {
  const defaultVp: Viewport = {
    centerLat: 37.7749,
    centerLng: -122.4194,
    zoom: 14,
    width: 800,
    height: 600,
  };

  it('project and unproject roundtrip center coordinate', () => {
    const centerPx = project(defaultVp.centerLat, defaultVp.centerLng, defaultVp);
    expect(centerPx.x).toBeCloseTo(400, 1);
    expect(centerPx.y).toBeCloseTo(300, 1);

    const geo = unproject({ x: 400, y: 300 }, defaultVp);
    expect(geo.lat).toBeCloseTo(defaultVp.centerLat, 4);
    expect(geo.lng).toBeCloseTo(defaultVp.centerLng, 4);
  });

  it('panViewportByPixels shifts viewport accurately', () => {
    // Dragging right by 100px moves center left
    const panned = panViewportByPixels(defaultVp, 100, 0);
    const oldCenterInNewVp = project(defaultVp.centerLat, defaultVp.centerLng, panned);

    // Old center should now be 100px to the right of screen center (400 + 100 = 500)
    expect(oldCenterInNewVp.x).toBeCloseTo(500, 1);
  });

  it('zoomViewportAtPixel preserves anchor point location', () => {
    const anchor = { x: 200, y: 150 };
    const anchorGeo = unproject(anchor, defaultVp);

    const zoomed = zoomViewportAtPixel(defaultVp, 16, anchor);
    const newAnchorPx = project(anchorGeo.lat, anchorGeo.lng, zoomed);

    expect(newAnchorPx.x).toBeCloseTo(anchor.x, 1);
    expect(newAnchorPx.y).toBeCloseTo(anchor.y, 1);
  });

  it('clampLatitude limits extreme values', () => {
    expect(clampLatitude(90)).toBeCloseTo(85.05112878, 4);
    expect(clampLatitude(-100)).toBeCloseTo(-85.05112878, 4);
    expect(clampLatitude(30)).toBe(30);
  });

  it('normalizeLongitude wraps angles correctly', () => {
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-190)).toBe(170);
    expect(normalizeLongitude(0)).toBe(0);
  });
});
