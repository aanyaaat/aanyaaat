import { useEffect, useRef, useCallback } from 'react';
import type { OfflineRegion, RouteResult, GpsFix, HomeLocation } from '@/navigation/domain/types';
import { project, unproject, metersPerPixel, type Viewport } from '@/navigation/maps/projection';

interface CanvasMapProps {
  region: OfflineRegion | null;
  route: RouteResult | null;
  gpsFix: GpsFix | null;
  home: HomeLocation | null;
  recenterSignal: number;
  onViewportChange?: (vp: Viewport) => void;
}

const ROAD_COLORS: Record<number, string> = {
  7: '#e8a0a0', // motorway
  6: '#e8a0a0', // trunk
  5: '#e8b8b8', // primary
  4: '#d4c0c0', // secondary
  3: '#c0c0c0', // tertiary
  2: '#b8b8b8', // unclassified/residential
  1: '#a0a0a0', // service/footway
};

const ROAD_WIDTHS: Record<number, number> = {
  7: 4,
  6: 3.5,
  5: 3,
  4: 2.5,
  3: 2,
  2: 1.5,
  1: 1,
};

export function CanvasMap({
  region,
  route,
  gpsFix,
  home,
  recenterSignal,
  onViewportChange,
}: CanvasMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vpRef = useRef<Viewport>({
    centerLat: gpsFix?.latitude ?? home?.latitude ?? 0,
    centerLng: gpsFix?.longitude ?? home?.longitude ?? 0,
    zoom: 14,
    width: 400,
    height: 400,
  });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const userPannedRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const vp = vpRef.current;
    vp.width = rect.width;
    vp.height = rect.height;

    // Background
    ctx.fillStyle = 'rgb(20 20 24)';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Grid for spatial reference
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridSpacing = 80;
    for (let x = 0; x < rect.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    // Draw roads
    if (region) {
      for (const road of region.roads) {
        if (road.coords.length < 2) continue;
        ctx.strokeStyle = ROAD_COLORS[road.roadClass] ?? '#888';
        ctx.lineWidth = ROAD_WIDTHS[road.roadClass] ?? 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

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
      for (const poi of region.pois) {
        const p = project(poi.lat, poi.lng, vp);
        const colors: Record<string, string> = {
          hospital: '#ff6b6b',
          police: '#4dabf7',
          station: '#ffd43b',
          landmark: '#a78bfa',
        };
        ctx.fillStyle = colors[poi.type] ?? '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw route
    if (route && route.coordinates.length >= 2) {
      ctx.strokeStyle = '#4dabf7';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#4dabf7';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < route.coordinates.length; i++) {
        const c = route.coordinates[i];
        const p = project(c.lat, c.lng, vp);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw home marker
    if (home) {
      const p = project(home.latitude, home.longitude, vp);
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      // Star shape (simplified: circle with ring)
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner dot
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw user marker
    if (gpsFix) {
      const p = project(gpsFix.latitude, gpsFix.longitude, vp);
      // Accuracy circle
      const mpp = metersPerPixel(gpsFix.latitude, vp.zoom);
      const accRadius = Math.max(8, gpsFix.accuracy / mpp);
      ctx.fillStyle = 'rgba(77,171,247,0.15)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, accRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(77,171,247,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // User dot
      ctx.fillStyle = '#4dabf7';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Heading arrow
      if (gpsFix.heading !== null && !isNaN(gpsFix.heading)) {
        const rad = (gpsFix.heading * Math.PI) / 180;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(p.x + Math.sin(rad) * 14, p.y - Math.cos(rad) * 14);
        ctx.lineTo(p.x + Math.sin(rad + 0.3) * 6, p.y - Math.cos(rad + 0.3) * 6);
        ctx.lineTo(p.x + Math.sin(rad - 0.3) * 6, p.y - Math.cos(rad - 0.3) * 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    onViewportChange?.(vp);
  }, [region, route, gpsFix, home, onViewportChange]);

  // Redraw on data change
  useEffect(() => {
    draw();
  }, [draw]);

  // Recenter on signal
  useEffect(() => {
    if (recenterSignal > 0 && gpsFix) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      userPannedRef.current = false;
      draw();
    }
  }, [recenterSignal, gpsFix, draw]);

  // Auto-center on GPS if user hasn't panned
  useEffect(() => {
    if (gpsFix && !userPannedRef.current) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      draw();
    }
  }, [gpsFix, draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // Pan + zoom handlers
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };

    const vp = vpRef.current;
    const mpp = metersPerPixel(vp.centerLat, vp.zoom);
    vp.centerLng -= (dx * mpp) / 1;
    vp.centerLat += (dy * mpp) / 1;
    userPannedRef.current = true;
    draw();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const vp = vpRef.current;
    const delta = e.deltaY > 0 ? -1 : 1;
    vp.zoom = Math.max(10, Math.min(18, vp.zoom + delta));
    draw();
  };

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    />
  );
}
