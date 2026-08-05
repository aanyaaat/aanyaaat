/**
 * Web Mercator projection helpers for the canvas map renderer.
 * Projects lat/lng to pixel coordinates for a given zoom level and center.
 */

export interface Viewport {
  centerLat: number;
  centerLng: number;
  zoom: number;
  width: number;
  height: number;
}

export interface Pixel {
  x: number;
  y: number;
}

const TILE_SIZE = 256;

/** Global pixel X for a longitude at a given zoom (Web Mercator). */
function lngToGlobalX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
}

/** Global pixel Y for a latitude at a given zoom (Web Mercator). */
function latToGlobalY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    TILE_SIZE *
    Math.pow(2, zoom)
  );
}

export function project(lat: number, lng: number, vp: Viewport): Pixel {
  const gx = lngToGlobalX(lng, vp.zoom);
  const gy = latToGlobalY(lat, vp.zoom);
  const cx = lngToGlobalX(vp.centerLng, vp.zoom);
  const cy = latToGlobalY(vp.centerLat, vp.zoom);
  return {
    x: gx - cx + vp.width / 2,
    y: gy - cy + vp.height / 2,
  };
}

export function unproject(px: Pixel, vp: Viewport): { lat: number; lng: number } {
  const cx = lngToGlobalX(vp.centerLng, vp.zoom);
  const cy = latToGlobalY(vp.centerLat, vp.zoom);
  const gx = px.x - vp.width / 2 + cx;
  const gy = px.y - vp.height / 2 + cy;

  const scale = TILE_SIZE * Math.pow(2, vp.zoom);
  const lng = (gx / scale) * 360 - 180;
  const n = Math.PI - (2 * gy) / scale;
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat, lng };
}

/** Meters per pixel at a given latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    (40075016.686 * Math.cos(latRad)) /
    (TILE_SIZE * Math.pow(2, zoom))
  );
}
