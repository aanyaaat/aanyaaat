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

// ---- Tile system ----
// We use multiple OSM tile servers and round-robin to speed up loading
// and avoid hitting rate limits on a single server.

const TILE_SERVERS = [
  'https://tile.openstreetmap.org',
  'https://tile.openstreetmap.org',
];

const tileCache = new Map<string, HTMLImageElement>();
const tileLoading = new Set<string>();
const tileCallbacks = new Map<string, Array<(img: HTMLImageElement | null) => void>>();

function tileUrl(z: number, x: number, y: number): string {
  const server = TILE_SERVERS[(x + y) % TILE_SERVERS.length];
  return `${server}/${z}/${x}/${y}.png`;
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached && cached.complete) return Promise.resolve(cached);
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
    // No crossOrigin — OSM tiles don't need CORS and it causes loading failures
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
    img.src = tileUrl(z, x, y);
  });
}

function pruneTileCache() {
  if (tileCache.size > 300) {
    const keys = Array.from(tileCache.keys());
    for (let i = 0; i < 100; i++) tileCache.delete(keys[i]);
  }
}

// ---- Tile coordinate math ----

function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

// ---- Road styling ----

const ROAD_COLORS: Record<number, string> = {
  7: '#e892a2', 6: '#f2a678', 5: '#ffc090', 4: '#ffd8a8',
  3: '#e8e0d0', 2: '#d8d0c0', 1: '#c8c0b8',
};
const ROAD_WIDTHS: Record<number, number> = {
  7: 5, 6: 4.5, 5: 3.5, 4: 2.5, 3: 2, 2: 1.5, 1: 1,
};
const ROAD_CASING: Record<number, string> = {
  7: '#c87888', 6: '#d08858', 5: '#d89868', 4: '#d8a878',
  3: '#c0b0a0', 2: '#b8b0a0', 1: '#a8a098',
};

const POI_COLORS: Record<string, string> = {
  hospital: '#e63946', police: '#3a86ff', station: '#ffbe0b',
  bus_stop: '#52b788', landmark: '#9d4edd',
};
const PLACE_COLORS: Record<string, string> = {
  home: '#e63946', work: '#3a86ff', favorite: '#ffbe0b', recent: '#52b788',
};

interface PointerInfo { id: number; x: number; y: number; }

export function CanvasMap({
  regions, route, gpsFix, home, destination, savedPlaces,
  recenterSignal, followMode, rotation, onTap, onLongPress,
}: CanvasMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vpRef = useRef<Viewport>({
    centerLat: gpsFix?.latitude ?? home?.latitude ?? 28.6139,
    centerLng: gpsFix?.longitude ?? home?.longitude ?? 77.2090,
    zoom: 14,
    width: 400,
    height: 400,
  });
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const userPannedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef({ regions, route, gpsFix, home, destination, savedPlaces, rotation });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<{ fromZoom: number; toZoom: number; start: number; duration: number } | null>(null);
  const initializedRef = useRef(false);

  dataRef.current = { regions, route, gpsFix, home, destination, savedPlaces, rotation };

  // ---- Drawing ----

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

    // Background
    ctx.fillStyle = isOnline || hasOfflineData ? '#e8e4dd' : '#252530';
    ctx.fillRect(0, 0, w, h);

    // Apply rotation around center
    if (rotation !== 0) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-w / 2, -h / 2);
    }

    // Draw online raster tiles (always when online, even with offline data for context)
    if (isOnline) {
      drawTiles(ctx, vp, w, h);
    }

    // Draw offline vector data on top of tiles
    if (hasOfflineData) {
      drawOfflineData(ctx, vp, w, h, data);
    }

    // If offline and no data, show message
    if (!isOnline && !hasOfflineData) {
      ctx.fillStyle = '#888';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No offline maps downloaded', w / 2, h / 2 - 10);
      ctx.fillStyle = '#666';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Connect to internet or download an area', w / 2, h / 2 + 12);
    }

    // Markers and route always on top
    drawMarkers(ctx, vp, w, h, data);
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // ---- Tile drawing ----

  function drawTiles(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number) {
    const z = Math.max(0, Math.min(19, Math.floor(vp.zoom)));
    const fracX = lngToTileX(vp.centerLng, z);
    const fracY = latToTileY(vp.centerLat, z);

    // Number of tiles needed to cover viewport
    const numX = Math.ceil(w / TILE_SIZE) + 2;
    const numY = Math.ceil(h / TILE_SIZE) + 2;

    // The center of the viewport in tile-pixel space:
    // fracX * TILE_SIZE = global pixel x of center lng at this zoom
    // w/2 = viewport center x
    // So tile (tx, ty) draws at: (tx - fracX) * TILE_SIZE + w/2, (ty - fracY) * TILE_SIZE + h/2

    const startTx = Math.floor(fracX - numX / 2);
    const startTy = Math.floor(fracY - numY / 2);
    const endTx = Math.ceil(fracX + numX / 2);
    const endTy = Math.ceil(fracY + numY / 2);
    const maxTile = Math.pow(2, z);

    let needsRedraw = false;

    for (let tx = startTx; tx <= endTx; tx++) {
      for (let ty = startTy; ty <= endTy; ty++) {
        if (tx < 0 || ty < 0 || tx >= maxTile || ty >= maxTile) continue;

        // Pixel position: tile (tx,ty) starts at this screen position
        const drawX = Math.round((tx - fracX) * TILE_SIZE + w / 2);
        const drawY = Math.round((ty - fracY) * TILE_SIZE + h / 2);

        const key = `${z}/${tx}/${ty}`;
        const cached = tileCache.get(key);
        if (cached && cached.complete) {
          try {
            ctx.drawImage(cached, drawX, drawY, TILE_SIZE, TILE_SIZE);
          } catch {
            // ignore draw errors from tainted canvas
          }
        } else if (!tileLoading.has(key)) {
          needsRedraw = true;
          loadTile(z, tx, ty).then((img) => {
            if (img) scheduleDraw();
          });
        }
      }
    }

    // Draw subtle placeholder rectangles for pending tiles
    if (needsRedraw) {
      ctx.fillStyle = '#ddd8d0';
      for (let tx = startTx; tx <= endTx; tx++) {
        for (let ty = startTy; ty <= endTy; ty++) {
          if (tx < 0 || ty < 0 || tx >= maxTile || ty >= maxTile) continue;
          const key = `${z}/${tx}/${ty}`;
          if (!tileCache.get(key)) {
            const drawX = Math.round((tx - fracX) * TILE_SIZE + w / 2);
            const drawY = Math.round((ty - fracY) * TILE_SIZE + h / 2);
            ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }
  }

  // ---- Offline vector data ----

  function drawOfflineData(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number, data: typeof dataRef.current) {
    const mpp = metersPerPixel(vp.centerLat, vp.zoom);
    const marginDeg = (Math.max(w, h) * mpp * 1.3) / 111000;
    const minLat = vp.centerLat - marginDeg;
    const maxLat = vp.centerLat + marginDeg;
    const minLng = vp.centerLng - marginDeg;
    const maxLng = vp.centerLng + marginDeg;

    const roads: { coords: [number, number][]; cls: number }[] = [];
    for (const region of data.regions) {
      for (const road of region.roads) {
        if (road.coords.length < 2) continue;
        let inView = false;
        for (const [lng, lat] of road.coords) {
          if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
            inView = true;
            break;
          }
        }
        if (inView) roads.push({ coords: road.coords, cls: road.roadClass });
      }
    }

    roads.sort((a, b) => a.cls - b.cls);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Casing pass
    for (const road of roads) {
      ctx.strokeStyle = ROAD_CASING[road.cls] ?? '#b0a898';
      ctx.lineWidth = (ROAD_WIDTHS[road.cls] ?? 1.5) + 2;
      ctx.beginPath();
      for (let i = 0; i < road.coords.length; i++) {
        const p = project(road.coords[i][1], road.coords[i][0], vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Fill pass
    for (const road of roads) {
      ctx.strokeStyle = ROAD_COLORS[road.cls] ?? '#d0c8b8';
      ctx.lineWidth = ROAD_WIDTHS[road.cls] ?? 1.5;
      ctx.beginPath();
      for (let i = 0; i < road.coords.length; i++) {
        const p = project(road.coords[i][1], road.coords[i][0], vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // POIs
    for (const region of data.regions) {
      for (const poi of region.pois) {
        if (poi.lat < minLat || poi.lat > maxLat || poi.lng < minLng || poi.lng > maxLng) continue;
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

  // ---- Markers ----

  function drawMarkers(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number, data: typeof dataRef.current) {
    // Saved places
    for (const place of data.savedPlaces) {
      const p = project(place.latitude, place.longitude, vp);
      if (p.x < -30 || p.x > w + 30 || p.y < -30 || p.y > h + 30) continue;
      ctx.fillStyle = PLACE_COLORS[place.type] ?? '#9d4edd';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Destination
    if (data.destination) {
      const p = project(data.destination.lat, data.destination.lng, vp);
      drawPin(ctx, p.x, p.y, '#3a86ff');
    }

    // Home
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

    // User position
    if (data.gpsFix && Number.isFinite(data.gpsFix.latitude) && Number.isFinite(data.gpsFix.longitude)) {
      const p = project(data.gpsFix.latitude, data.gpsFix.longitude, vp);
      const mpp = metersPerPixel(vp.centerLat, vp.zoom);
      const accRadius = Math.max(8, (data.gpsFix.accuracy ?? 50) / mpp);
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

  // ---- Effects ----

  // Init viewport
  useEffect(() => {
    if (initializedRef.current) return;
    const center = gpsFix ?? (home ? { latitude: home.latitude, longitude: home.longitude } : null);
    if (center && Number.isFinite(center.latitude) && Number.isFinite(center.longitude)) {
      vpRef.current.centerLat = center.latitude;
      vpRef.current.centerLng = center.longitude;
      initializedRef.current = true;
      scheduleDraw();
    }
  }, [gpsFix, home, scheduleDraw]);

  // Redraw on data changes
  useEffect(() => {
    scheduleDraw();
  }, [regions, route, gpsFix, home, destination, savedPlaces, rotation, scheduleDraw]);

  // Recenter
  useEffect(() => {
    if (recenterSignal > 0 && gpsFix && Number.isFinite(gpsFix.latitude)) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      userPannedRef.current = false;
      scheduleDraw();
    }
  }, [recenterSignal, gpsFix, scheduleDraw]);

  // Follow mode — track user
  useEffect(() => {
    if (gpsFix && followMode && !userPannedRef.current && Number.isFinite(gpsFix.latitude)) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      scheduleDraw();
    }
  }, [gpsFix, followMode, scheduleDraw]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // Zoom animation loop
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
        if (t >= 1) animRef.current = null;
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

  // Prune cache
  useEffect(() => {
    const interval = setInterval(pruneTileCache, 30000);
    return () => clearInterval(interval);
  }, []);

  // ---- Gestures ----

  const animateZoom = useCallback((target: number, duration = 200) => {
    animRef.current = {
      fromZoom: vpRef.current.zoom,
      toZoom: Math.max(1, Math.min(19, target)),
      start: performance.now(),
      duration,
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
      if (onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          if (dragRef.current && !dragRef.current.moved) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const { lat, lng } = unproject(
                { x: e.clientX - rect.left, y: e.clientY - rect.top },
                vpRef.current,
              );
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
      pinchRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: vpRef.current.zoom,
      };
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const existing = pointersRef.current.get(e.pointerId);
    if (existing) {
      existing.x = e.clientX;
      existing.y = e.clientY;
    }

    // Pinch zoom
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / pinchRef.current.dist;
      vpRef.current.zoom = Math.max(1, Math.min(19, pinchRef.current.zoom + Math.log2(scale)));
      userPannedRef.current = true;
      animRef.current = null;
      scheduleDraw();
      return;
    }

    // Pan
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
    vp.centerLng -= dx * mpp;
    vp.centerLat += dy * mpp;
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
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (pointersRef.current.size === 0) {
      const wasDrag = dragRef.current?.moved;
      dragRef.current = null;
      if (!wasDrag && onTap) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const { lat, lng } = unproject(
            { x: e.clientX - rect.left, y: e.clientY - rect.top },
            vpRef.current,
          );
          onTap(lat, lng);
        }
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    animateZoom(vpRef.current.zoom + (e.deltaY > 0 ? -0.5 : 0.5), 150);
  };

  const onDoubleClick = () => {
    animateZoom(vpRef.current.zoom + 1, 250);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
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
