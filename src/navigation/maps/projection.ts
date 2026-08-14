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
const MAX_LAT = 85.05112878;

export function clampLatitude(lat: number): number {
  if (!Number.isFinite(lat)) return 0;
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

export function normalizeLongitude(lng: number): number {
  if (!Number.isFinite(lng)) return 0;
  let normalized = (lng + 180) % 360;
  if (normalized < 0) normalized += 360;
  return normalized - 180;
}

/** Global pixel X for a longitude at a given zoom (Web Mercator). */
export function lngToGlobalX(lng: number, zoom: number): number {
  const normLng = normalizeLongitude(lng);
  return ((normLng + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
}

/** Global pixel Y for a latitude at a given zoom (Web Mercator). */
export function latToGlobalY(lat: number, zoom: number): number {
  const safeLat = clampLatitude(lat);
  const latRad = (safeLat * Math.PI) / 180;
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
  const lng = normalizeLongitude((gx / scale) * 360 - 180);
  const n = Math.PI - (2 * Math.PI * gy) / scale;
  const lat = clampLatitude((Math.atan(Math.sinh(n)) * 180) / Math.PI);
  return { lat, lng };
}

/** Shift viewport by screen delta pixels (dx right = move center left). */
export function panViewportByPixels(vp: Viewport, dx: number, dy: number): Viewport {
  const cx = lngToGlobalX(vp.centerLng, vp.zoom);
  const cy = latToGlobalY(vp.centerLat, vp.zoom);
  const scale = TILE_SIZE * Math.pow(2, vp.zoom);

  const newGx = cx - dx;
  const newGy = cy - dy;

  const lng = normalizeLongitude((newGx / scale) * 360 - 180);
  const n = Math.PI - (2 * Math.PI * newGy) / scale;
  const lat = clampLatitude((Math.atan(Math.sinh(n)) * 180) / Math.PI);

  return {
    ...vp,
    centerLat: lat,
    centerLng: lng,
  };
}

/** Zoom viewport anchored around a screen pixel. */
export function zoomViewportAtPixel(
  vp: Viewport,
  newZoom: number,
  anchorPx: Pixel = { x: vp.width / 2, y: vp.height / 2 }
): Viewport {
  const targetZoom = Math.max(1, Math.min(20, newZoom));
  if (targetZoom === vp.zoom) return vp;

  // Find geographic point currently under anchorPx
  const geoAnchor = unproject(anchorPx, vp);

  // Return new viewport with targetZoom centered such that geoAnchor remains at anchorPx
  const newScale = TILE_SIZE * Math.pow(2, targetZoom);
  const anchorGx = lngToGlobalX(geoAnchor.lng, targetZoom);
  const anchorGy = latToGlobalY(geoAnchor.lat, targetZoom);

  const newCx = anchorGx - (anchorPx.x - vp.width / 2);
  const newCy = anchorGy - (anchorPx.y - vp.height / 2);

  const lng = normalizeLongitude((newCx / newScale) * 360 - 180);
  const n = Math.PI - (2 * Math.PI * newCy) / newScale;
  const lat = clampLatitude((Math.atan(Math.sinh(n)) * 180) / Math.PI);

  return {
    ...vp,
    zoom: targetZoom,
    centerLat: lat,
    centerLng: lng,
  };
}

/** Meters per pixel at a given latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  const safeLat = clampLatitude(lat);
  const latRad = (safeLat * Math.PI) / 180;
  return (
    (40075016.686 * Math.cos(latRad)) /
    (TILE_SIZE * Math.pow(2, zoom))
  );
}

/** Bounding box of the current viewport. */
export function viewportBounds(vp: Viewport): { south: number; west: number; north: number; east: number } {
  const topLeft = unproject({ x: 0, y: 0 }, vp);
  const bottomRight = unproject({ x: vp.width, y: vp.height }, vp);

  return {
    south: Math.min(topLeft.lat, bottomRight.lat),
    north: Math.max(topLeft.lat, bottomRight.lat),
    west: Math.min(topLeft.lng, bottomRight.lng),
    east: Math.max(topLeft.lng, bottomRight.lng),
  };
}

/** Rotate a pixel point around a center pixel by angleRad radians. */
export function rotatePoint(pt: Pixel, center: Pixel, angleRad: number): Pixel {
  if (Math.abs(angleRad) < 1e-6) return pt;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
  };
}
