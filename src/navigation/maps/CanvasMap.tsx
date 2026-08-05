import { useEffect, useRef, useCallback } from 'react';
import type { OfflineRegion, RouteResult, GpsFix, HomeLocation, SavedPlace } from '@/navigation/domain/types';
import { project, unproject, metersPerPixel, type Viewport } from '@/navigation/maps/projection';

interface CanvasMapProps {
  regions: OfflineRegion[];
  route: RouteResult | null;
  gpsFix: GpsFix | null;
  home: HomeLocation | null;
  destination: { lat: number; lng: number; label: string } | null;
  savedPlaces: SavedPlace[];
  recenterSignal: number;
  followMode: boolean;
  rotation: number;
  onTap?: (lat: number, lng: number) => void;
  onLongPress?: (lat: number, lng: number) => void;
}

const TILE_SIZE = 256;

const ROAD_COLORS: Record<number, string> = {
  7: '#f5b878',
  6: '#f5c890',
  5: '#ffd0a0',
  4: '#ffe0b8',
  3: '#e8d8c8',
  2: '#d8c8b8',
  1: '#c0b8b0',
};

const ROAD_WIDTHS: Record<number, number> = {
  7: 5,
  6: 4.5,
  5: 3.5,
  4: 2.5,
  3: 2,
  2: 1.5,
  1: 1,
};

const ROAD_CASING: Record<number, string> = {
  7: '#c89858',
  6: '#c8a868',
  5: '#d8a878',
  4: '#d8b888',
  3: '#c0b0a0',
  2: '#b8a898',
  1: '#a8a098',
};

const POI_COLORS: Record<string, string> = {
  hospital: '#e63946',
  police: '#3a86ff',
  station: '#ffbe0b',
  bus_stop: '#52b788',
  landmark: '#9d4edd',
};

const PLACE_COLORS: Record<string, string> = {
  home: '#e63946',
  work: '#3a86ff',
  favorite: '#ffbe0b',
  recent: '#52b788',
};

interface PointerInfo {
  id: number;
  x: number;
  y: number;
}

// ---- Online raster tile cache ----
// When no offline regions are downloaded, we fetch OSM raster tiles
// so the map is always visible and explorable.

const tileCache = new Map<string, HTMLImageElement>();
const tileLoading = new Set<string>();
const tileCallbacks = new Map<string, Array<(img: HTMLImageElement | null) => void>>();

function getTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return Promise.resolve(cached);
  if (tileLoading.has(key)) {
    return new Promise((resolve) => {
      const cbs = tileCallbacks.get(key) ?? [];
      cbs.push(resolve);
      tileCallbacks.set(key, cbs);
    });
  }

  tileLoading.add(key);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      tileCache.set(key, img);
      tileLoading.delete(key);
      resolve(img);
      const cbs = tileCallbacks.get(key);
      if (cbs) {
        for (const cb of cbs) cb(img);
        tileCallbacks.delete(key);
      }
    };
    img.onerror = () => {
      tileLoading.delete(key);
      resolve(null);
      const cbs = tileCallbacks.get(key);
      if (cbs) {
        for (const cb of cbs) cb(null);
        tileCallbacks.delete(key);
      }
    };
    img.src = getTileUrl(z, x, y);
  });
}

// Limit tile cache to 200 entries to avoid memory bloat
function pruneTileCache() {
  if (tileCache.size > 200) {
    const keys = Array.from(tileCache.keys());
    for (let i = 0; i < 50; i++) {
      tileCache.delete(keys[i]);
    }
  }
}

export function CanvasMap({
  regions,
  route,
  gpsFix,
  home,
  destination,
  savedPlaces,
  recenterSignal,
  followMode,
  rotation,
  onTap,
  onLongPress,
}: CanvasMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport>({
    centerLat: gpsFix?.latitude ?? home?.latitude ?? 28.6139,
    centerLng: gpsFix?.longitude ?? home?.longitude ?? 77.2090,
    zoom: 14,
    width: 400,
    height: 400,
  });
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const dragRef = useRef<{ x: number; y: number; moved: boolean; startTime: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null);
  const userPannedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef({ regions, route, gpsFix, home, destination, savedPlaces, rotation });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<{ fromZoom: number; toZoom: number; start: number; duration: number } | null>(null);
  const initializedRef = useRef(false);
  const tilesLoadedRef = useRef(0);

  dataRef.current = { regions, route, gpsFix, home, destination, savedPlaces, rotation };

  // Initialize viewport once when we get first GPS or home
  useEffect(() => {
    if (initializedRef.current) return;
    const center = gpsFix ?? (home ? { latitude: home.latitude, longitude: home.longitude } : null);
    if (center && Number.isFinite(center.latitude) && Number.isFinite(center.longitude)) {
      vpRef.current.centerLat = center.latitude;
      vpRef.current.centerLng = center.longitude;
      initializedRef.current = true;
      scheduleDraw();
    }
  }, [gpsFix, home]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    const vp = vpRef.current;
    vp.width = w;
    vp.height = h;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const data = dataRef.current;
    const hasOfflineData = data.regions.length > 0;
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

    // Background — light gray for map areas, dark for no-data offline
    ctx.fillStyle = hasOfflineData ? '#e8e4dd' : (isOnline ? '#e8e4dd' : '#252530');
    ctx.fillRect(0, 0, w, h);

    // Apply rotation
    if (rotation !== 0) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-w / 2, -h / 2);
    }

    if (!hasOfflineData && isOnline) {
      // Draw online raster tiles
      drawOnlineTiles(ctx, vp, w, h);
    } else if (!hasOfflineData && !isOnline) {
      // Empty state — show message
      ctx.fillStyle = '#888';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No offline maps downloaded', w / 2, h / 2 - 10);
      ctx.fillStyle = '#666';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Connect to internet or download an area', w / 2, h / 2 + 12);
    }

    if (hasOfflineData) {
      drawOfflineData(ctx, vp, w, h, data);
    }

    // Always draw markers and route on top
    drawMarkers(ctx, vp, w, h, data);
  }, []);

  function drawOnlineTiles(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number) {
    const z = Math.floor(vp.zoom);
    const zClamped = Math.max(0, Math.min(19, z));

    // Calculate which tiles are visible
    const cx = lngToTileX(vp.centerLng, zClamped);
    const cy = latToTileY(vp.centerLat, zClamped);
    const tilesX = Math.ceil(w / TILE_SIZE) + 2;
    const tilesY = Math.ceil(h / TILE_SIZE) + 2;
    const startTileX = Math.floor(cx - tilesX / 2);
    const startTileY = Math.floor(cy - tilesY / 2);
    const endTileX = Math.ceil(cx + tilesX / 2);
    const endTileY = Math.ceil(cy + tilesY / 2);

    // Offset to center tiles in viewport
    const offsetX = (w / 2) - (cx - startTileX) * TILE_SIZE - (cx % 1) * TILE_SIZE;
    const offsetY = (h / 2) - (cy - startTileY) * TILE_SIZE - (cy % 1) * TILE_SIZE;

    let tilesRequested = 0;

    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        if (tx < 0 || ty < 0 || tx >= Math.pow(2, zClamped) || ty >= Math.pow(2, zClamped)) continue;

        const drawX = offsetX + (tx - startTileX) * TILE_SIZE;
        const drawY = offsetY + (ty - startTileY) * TILE_SIZE;

        const key = `${zClamped}/${tx}/${ty}`;
        const cached = tileCache.get(key);
        if (cached && cached.complete) {
          ctx.drawImage(cached, drawX, drawY, TILE_SIZE, TILE_SIZE);
        } else if (!tileLoading.has(key)) {
          tilesRequested++;
          loadTile(zClamped, tx, ty).then((img) => {
            if (img) {
              tilesLoadedRef.current++;
              scheduleDraw();
            }
          });
        }
      }
    }

    // Draw tile boundaries (subtle grid) for tiles not yet loaded
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 0.5;
    for (let tx = startTileX; tx <= endTileX + 1; tx++) {
      const x = offsetX + (tx - startTileX) * TILE_SIZE;
      if (x >= 0 && x <= w) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
    for (let ty = startTileY; ty <= endTileY + 1; ty++) {
      const y = offsetY + (ty - startTileY) * TILE_SIZE;
      if (y >= 0 && y <= h) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
  }

  function drawOfflineData(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number, data: typeof dataRef.current) {
    // Viewport bounds for culling
    const mpp = metersPerPixel(vp.centerLat, vp.zoom);
    const halfW = (w / 2) * mpp;
    const halfH = (h / 2) * mpp;
    const marginMeters = Math.max(halfW, halfH) * 1.3;
    const marginDeg = marginMeters / 111000;
    const vpMinLat = vp.centerLat - marginDeg;
    const vpMaxLat = vp.centerLat + marginDeg;
    const vpMinLng = vp.centerLng - marginDeg;
    const vpMaxLng = vp.centerLng + marginDeg;

    // Draw roads — two passes: casing then fill
    const roadsToDraw: { coords: [number, number][]; roadClass: number }[] = [];

    for (const region of data.regions) {
      for (const road of region.roads) {
        if (road.coords.length < 2) continue;
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (let i = 0; i < road.coords.length; i += Math.max(1, Math.floor(road.coords.length / 8))) {
          const lng = road.coords[i][0];
          const lat = road.coords[i][1];
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
        if (maxLat < vpMinLat || minLat > vpMaxLat || maxLng < vpMinLng || minLng > vpMaxLng) continue;
        roadsToDraw.push({ coords: road.coords, roadClass: road.roadClass });
      }
    }

    // Sort by road class (minor roads first, major roads on top)
    roadsToDraw.sort((a, b) => a.roadClass - b.roadClass);

    // Pass 1: Casing
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of roadsToDraw) {
      ctx.strokeStyle = ROAD_CASING[road.roadClass] ?? '#b0a898';
      ctx.lineWidth = (ROAD_WIDTHS[road.roadClass] ?? 1.5) + 2;
      ctx.beginPath();
      for (let i = 0; i < road.coords.length; i++) {
        const [lng, lat] = road.coords[i];
        const p = project(lat, lng, vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Pass 2: Fill
    for (const road of roadsToDraw) {
      ctx.strokeStyle = ROAD_COLORS[road.roadClass] ?? '#d0c8b8';
      ctx.lineWidth = ROAD_WIDTHS[road.roadClass] ?? 1.5;
      ctx.beginPath();
      for (let i = 0; i < road.coords.length; i++) {
        const [lng, lat] = road.coords[i];
        const p = project(lat, lng, vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Draw POIs
    for (const region of data.regions) {
      for (const poi of region.pois) {
        if (poi.lat < vpMinLat || poi.lat > vpMaxLat || poi.lng < vpMinLng || poi.lng > vpMaxLng) continue;
        const p = project(poi.lat, poi.lng, vp);
        if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
        ctx.fillStyle = POI_COLORS[poi.type] ?? '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function drawMarkers(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    w: number,
    h: number,
    data: typeof dataRef.current,
  ) {
    // Saved places
    for (const place of data.savedPlaces) {
      const p = project(place.latitude, place.longitude, vp);
      if (p.x < -30 || p.x > w + 30 || p.y < -30 || p.y > h + 30) continue;
      const color = PLACE_COLORS[place.type] ?? '#9d4edd';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Destination marker
    if (data.destination) {
      const p = project(data.destination.lat, data.destination.lng, vp);
      drawPin(ctx, p.x, p.y, '#3a86ff');
    }

    // Home marker
    if (data.home) {
      const p = project(data.home.latitude, data.home.longitude, vp);
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Route line
    if (data.route && data.route.coordinates.length >= 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < data.route.coordinates.length; i++) {
        const c = data.route.coordinates[i];
        const p = project(c.lat, c.lng, vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < data.route.coordinates.length; i++) {
        const c = data.route.coordinates[i];
        const p = project(c.lat, c.lng, vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // User marker
    if (data.gpsFix && Number.isFinite(data.gpsFix.latitude) && Number.isFinite(data.gpsFix.longitude)) {
      const p = project(data.gpsFix.latitude, data.gpsFix.longitude, vp);
      const mpp = metersPerPixel(vp.centerLat, vp.zoom);
      const accRadius = Math.max(8, data.gpsFix.accuracy / mpp);
      ctx.fillStyle = 'rgba(58,134,255,0.12)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, accRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,134,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a86ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      const heading = data.gpsFix.heading;
      if (heading !== null && !isNaN(heading)) {
        const rad = (heading * Math.PI) / 180;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(p.x + Math.sin(rad) * 18, p.y - Math.cos(rad) * 18);
        ctx.lineTo(p.x + Math.sin(rad + 0.35) * 8, p.y - Math.cos(rad + 0.35) * 8);
        ctx.lineTo(p.x + Math.sin(rad - 0.35) * 8, p.y - Math.cos(rad - 0.35) * 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y - 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Redraw on data change
  useEffect(() => {
    scheduleDraw();
  }, [regions, route, gpsFix, home, destination, savedPlaces, rotation, scheduleDraw]);

  // Recenter
  useEffect(() => {
    if (recenterSignal > 0 && gpsFix) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      userPannedRef.current = false;
      scheduleDraw();
    }
  }, [recenterSignal, gpsFix, scheduleDraw]);

  // Follow mode
  useEffect(() => {
    if (gpsFix && followMode && !userPannedRef.current) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      scheduleDraw();
    }
  }, [gpsFix, followMode, scheduleDraw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // Animation loop for smooth zoom
  useEffect(() => {
    let active = true;
    function tick() {
      if (!active) return;
      const anim = animRef.current;
      if (anim) {
        const elapsed = performance.now() - anim.start;
        const t = Math.min(1, elapsed / anim.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        vpRef.current.zoom = anim.fromZoom + (anim.toZoom - anim.fromZoom) * eased;
        scheduleDraw();
        if (t >= 1) {
          animRef.current = null;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return () => { active = false; };
  }, [scheduleDraw]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Prune tile cache periodically
  useEffect(() => {
    const interval = setInterval(() => {
      pruneTileCache();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // --- Gesture handlers ---

  const animateZoom = useCallback((targetZoom: number, duration = 200) => {
    const clamped = Math.max(1, Math.min(19, targetZoom));
    animRef.current = {
      fromZoom: vpRef.current.zoom,
      toZoom: clamped,
      start: performance.now(),
      duration,
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false, startTime: Date.now() };
      if (onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          if (dragRef.current && !dragRef.current.moved) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
              const { lat, lng } = unproject(px, vpRef.current);
              onLongPress(lat, lng);
            }
          }
        }, 500);
      }
    } else if (pointersRef.current.size === 2) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = { dist, zoom: vpRef.current.zoom, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const existing = pointersRef.current.get(e.pointerId);
    if (existing) {
      existing.x = e.clientX;
      existing.y = e.clientY;
    }

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / pinchRef.current.dist;
      const newZoom = pinchRef.current.zoom + Math.log2(scale);
      vpRef.current.zoom = Math.max(1, Math.min(19, newZoom));
      userPannedRef.current = true;
      animRef.current = null;
      scheduleDraw();
      return;
    }

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;

    const vp = vpRef.current;
    const mpp = metersPerPixel(vp.centerLat, vp.zoom);
    vp.centerLng -= (dx * mpp);
    vp.centerLat += (dy * mpp);
    vp.centerLat = Math.max(-85, Math.min(85, vp.centerLat));
    userPannedRef.current = true;
    animRef.current = null;
    scheduleDraw();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      const wasDrag = dragRef.current?.moved;
      dragRef.current = null;

      if (!wasDrag && onTap) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          const { lat, lng } = unproject(px, vpRef.current);
          onTap(lat, lng);
        }
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    animateZoom(vpRef.current.zoom + delta, 150);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    animateZoom(vpRef.current.zoom + 1, 250);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      />
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-black/40">
        © OpenStreetMap
      </div>
    </div>
  );
}

// ---- Tile coordinate helpers ----

function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2
  ) * Math.pow(2, z);
}
