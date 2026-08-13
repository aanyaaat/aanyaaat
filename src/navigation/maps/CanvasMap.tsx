import { useEffect, useRef, useCallback } from 'react';
import type {
  OfflineRegionSummary,
  RouteResult,
  GpsFix,
  HomeLocation,
  SavedPlace,
  GeoJsonRoad,
} from '@/navigation/domain/types';
import {
  project,
  unproject,
  panViewportByPixels,
  zoomViewportAtPixel,
  metersPerPixel,
  viewportBounds,
  lngToGlobalX,
  latToGlobalY,
  type Viewport,
} from '@/navigation/maps/projection';
import { regionDataManager } from '@/navigation/maps/regionDataManager';
import { getTileUrl, getCachedTile, getParentTileFallback, loadTile, prefetchSurroundingTiles } from '@/navigation/maps/tileCache';

export type MapStyle = 'standard' | 'dark';

interface PoiMarker {
  lat: number;
  lng: number;
  label: string;
  type: string;
}

interface CanvasMapProps {
  regions: OfflineRegionSummary[];
  route: RouteResult | null;
  gpsFix: GpsFix | null;
  home: HomeLocation | null;
  destination: { lat: number; lng: number; label: string } | null;
  savedPlaces: SavedPlace[];
  poiMarkers?: PoiMarker[];
  recenterSignal: number;
  followMode: boolean;
  rotation: number;
  mapStyle?: MapStyle;
  onTap?: (lat: number, lng: number) => void;
  onLongPress?: (lat: number, lng: number) => void;
  onSelectPin?: (pin: { id: string; label: string; lat: number; lng: number; type: string }) => void;
}

const ROAD_COLORS: Record<number, string> = {
  7: '#e11d48', // Motorway
  6: '#ea580c', // Trunk
  5: '#f59e0b', // Primary
  4: '#10b981', // Secondary
  3: '#06b6d4', // Tertiary
  2: '#94a3b8', // Residential
  1: '#cbd5e1', // Service/Footway
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

const POI_COLORS: Record<string, string> = {
  hospital: '#e63946', police: '#3a86ff', station: '#ffbe0b',
  bus_stop: '#52b788', landmark: '#9d4edd', gas: '#f77f00',
  food: '#d62828', hotel: '#4361ee', atm: '#2a9d8f', park: '#38b000',
  supermarket: '#fb8500', cafe: '#b5179e',
};

interface PointerInfo { id: number; x: number; y: number; }

export function CanvasMap({
  regions,
  route,
  gpsFix,
  home,
  destination,
  savedPlaces,
  poiMarkers = [],
  recenterSignal,
  followMode,
  mapStyle = 'standard',
  onTap,
  onLongPress,
  onSelectPin,
}: CanvasMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vpRef = useRef<Viewport>({
    centerLat: gpsFix?.latitude ?? home?.latitude ?? 28.6139,
    centerLng: gpsFix?.longitude ?? home?.longitude ?? 77.2090,
    zoom: 15,
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number; anchorX: number; anchorY: number } | null>(null);
  const userPannedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const propsRef = useRef({
    regions,
    route,
    gpsFix,
    home,
    destination,
    savedPlaces,
    poiMarkers,
    followMode,
    mapStyle,
    onTap,
    onLongPress,
    onSelectPin,
  });

  useEffect(() => {
    propsRef.current = {
      regions,
      route,
      gpsFix,
      home,
      destination,
      savedPlaces,
      poiMarkers,
      followMode,
      mapStyle,
      onTap,
      onLongPress,
      onSelectPin,
    };
  }, [regions, route, gpsFix, home, destination, savedPlaces, poiMarkers, followMode, mapStyle, onTap, onLongPress, onSelectPin]);

  const requestRender = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        renderMap();
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter map camera on GPS position when recenterSignal changes or followMode is activated
  useEffect(() => {
    userPannedRef.current = false;
    const curGps = gpsFix ?? (home ? { latitude: home.latitude, longitude: home.longitude } : null);
    if (curGps) {
      vpRef.current.centerLat = curGps.latitude;
      vpRef.current.centerLng = curGps.longitude;
      if (followMode) {
        vpRef.current.zoom = 17;
      }
      requestRender();
    }
  }, [recenterSignal, followMode, requestRender]);

  // Center on GPS updates if followMode is active or user hasn't panned
  useEffect(() => {
    const curGps = gpsFix ?? (home ? { latitude: home.latitude, longitude: home.longitude } : null);
    if (curGps && (!userPannedRef.current || followMode)) {
      vpRef.current.centerLat = curGps.latitude;
      vpRef.current.centerLng = curGps.longitude;
      requestRender();
    }
  }, [gpsFix, home, followMode, requestRender]);

  // Center on destination preview when newly set
  useEffect(() => {
    if (destination && !followMode) {
      vpRef.current.centerLat = destination.lat;
      vpRef.current.centerLng = destination.lng;
      requestRender();
    }
  }, [destination, followMode, requestRender]);

  const renderMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vp = vpRef.current;
    const props = propsRef.current;
    const isDark = props.mapStyle === 'dark';

    // 1. Fill background
    ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f9fa';
    ctx.fillRect(0, 0, vp.width, vp.height);

    // 2. Render Tile Pyramids
    const tileZoom = Math.max(0, Math.min(19, Math.floor(vp.zoom)));
    const tileScale = Math.pow(2, vp.zoom - tileZoom);
    const tileSize = 256 * tileScale;

    const halfW = vp.width / 2;
    const halfH = vp.height / 2;

    const globalCenterPxX = lngToGlobalX(vp.centerLng, tileZoom) * tileScale;
    const globalCenterPxY = latToGlobalY(vp.centerLat, tileZoom) * tileScale;

    const minTileX = Math.floor((globalCenterPxX - halfW) / tileSize);
    const maxTileX = Math.floor((globalCenterPxX + halfW) / tileSize);
    const minTileY = Math.floor((globalCenterPxY - halfH) / tileSize);
    const maxTileY = Math.floor((globalCenterPxY + halfH) / tileSize);

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const screenX = halfW + (tx * tileSize - globalCenterPxX);
        const screenY = halfH + (ty * tileSize - globalCenterPxY);

        const img = getCachedTile(tileZoom, tx, ty, isDark);
        if (img) {
          ctx.drawImage(img, screenX, screenY, tileSize, tileSize);
        } else {
          const fallback = getParentTileFallback(tileZoom, tx, ty, isDark);
          if (fallback) {
            ctx.drawImage(
              fallback.img,
              fallback.cropX,
              fallback.cropY,
              fallback.cropSize,
              fallback.cropSize,
              screenX,
              screenY,
              tileSize,
              tileSize
            );
          } else {
            ctx.fillStyle = isDark ? '#242526' : '#e8e7e1';
            ctx.fillRect(screenX, screenY, tileSize, tileSize);
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
            ctx.strokeRect(screenX, screenY, tileSize, tileSize);
          }

          loadTile(tileZoom, tx, ty, isDark, () => requestRender());
        }
      }
    }

    // Pre-fetch surrounding 1-ring tiles for instant pan responsiveness
    prefetchSurroundingTiles(tileZoom, minTileX, maxTileX, minTileY, maxTileY, isDark, () => requestRender());

    // 3. Render Offline Region Vector Roads (Batch-grouped & Viewport Culled for 60 FPS)
    const bounds = viewportBounds(vp);
    for (const regionSummary of props.regions) {
      if (
        bounds.north < regionSummary.bbox.south ||
        bounds.south > regionSummary.bbox.north ||
        bounds.east < regionSummary.bbox.west ||
        bounds.west > regionSummary.bbox.east
      ) {
        continue;
      }

      const regionData = regionDataManager.getCachedData(regionSummary.id);
      if (!regionData) {
        void regionDataManager.requestData(regionSummary.id).then((d) => {
          if (d) requestRender();
        });
        continue;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Group roads by roadClass to minimize stroke calls
      const classRoadsMap = new Map<number, GeoJsonRoad[]>();

      for (const road of regionData.roads) {
        if (!road.coords || road.coords.length < 2) continue;
        if (vp.zoom < 13 && road.roadClass <= 2) continue; // Skip minor roads at low zoom

        // Viewport Bounding Box Culling
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

        const list = classRoadsMap.get(road.roadClass) || [];
        list.push(road);
        classRoadsMap.set(road.roadClass, list);
      }

      for (const [rClass, roadList] of classRoadsMap.entries()) {
        const color = ROAD_COLORS[rClass] || (isDark ? '#404040' : '#d0d0d0');
        const width = (ROAD_WIDTHS[rClass] || 1) * (vp.zoom >= 15 ? 1.5 : 1);

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();

        for (const road of roadList) {
          let started = false;
          for (const [lng, lat] of road.coords) {
            const pt = project(lat, lng, vp);
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          }
        }
        ctx.stroke();
      }
    }

    // 4. Render Active Route Path
    if (props.route && props.route.coordinates.length >= 2) {
      const coords = props.route.coordinates;

      // Casing
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const ptCoord of coords) {
        const pt = project(ptCoord.lat, ptCoord.lng, vp);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else { ctx.lineTo(pt.x, pt.y); }
      }
      ctx.stroke();

      // Inner line
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 5;
      ctx.beginPath();
      started = false;
      for (const ptCoord of coords) {
        const pt = project(ptCoord.lat, ptCoord.lng, vp);
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else { ctx.lineTo(pt.x, pt.y); }
      }
      ctx.stroke();
    }

    // 5. POI Markers
    for (const poi of props.poiMarkers) {
      const pt = project(poi.lat, poi.lng, vp);
      if (pt.x >= -20 && pt.x <= vp.width + 20 && pt.y >= -20 && pt.y <= vp.height + 20) {
        const color = POI_COLORS[poi.type] || '#3b82f6';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (vp.zoom >= 14 && poi.label) {
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.fillStyle = isDark ? '#ffffff' : '#1f2937';
          ctx.textAlign = 'center';
          ctx.fillText(poi.label, pt.x, pt.y - 11);
        }
      }
    }

    // 6. Saved Places (Home, Destination)
    if (props.home) {
      const pt = project(props.home.latitude, props.home.longitude, vp);
      if (pt.x >= -30 && pt.x <= vp.width + 30 && pt.y >= -30 && pt.y <= vp.height + 30) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', pt.x, pt.y);
      }
    }

    if (props.destination) {
      const pt = project(props.destination.lat, props.destination.lng, vp);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('D', pt.x, pt.y);
    }

    // 7. GPS Location Marker
    if (props.gpsFix) {
      const pt = project(props.gpsFix.latitude, props.gpsFix.longitude, vp);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Scale Bar
    const mpp = metersPerPixel(vp.centerLat, vp.zoom);
    const targetPx = 100;
    const targetMeters = targetPx * mpp;

    let scaleMeters = 100;
    if (targetMeters > 500000) scaleMeters = 1000000;
    else if (targetMeters > 200000) scaleMeters = 500000;
    else if (targetMeters > 100000) scaleMeters = 200000;
    else if (targetMeters > 50000) scaleMeters = 100000;
    else if (targetMeters > 20000) scaleMeters = 50000;
    else if (targetMeters > 10000) scaleMeters = 20000;
    else if (targetMeters > 5000) scaleMeters = 10000;
    else if (targetMeters > 2000) scaleMeters = 5000;
    else if (targetMeters > 1000) scaleMeters = 2000;
    else if (targetMeters > 500) scaleMeters = 1000;
    else if (targetMeters > 200) scaleMeters = 500;
    else if (targetMeters > 100) scaleMeters = 200;
    else scaleMeters = 100;

    const scaleWidthPx = scaleMeters / mpp;
    const scaleText = scaleMeters >= 1000 ? `${scaleMeters / 1000} km` : `${scaleMeters} m`;

    const sbX = 16;
    const sbY = vp.height - 18;

    ctx.strokeStyle = isDark ? '#ffffff' : '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sbX, sbY - 4);
    ctx.lineTo(sbX, sbY);
    ctx.lineTo(sbX + scaleWidthPx, sbY);
    ctx.lineTo(sbX + scaleWidthPx, sbY - 4);
    ctx.stroke();

    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = isDark ? '#ffffff' : '#1f2937';
    ctx.textAlign = 'left';
    ctx.fillText(scaleText, sbX + scaleWidthPx + 6, sbY);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      vpRef.current.width = rect.width;
      vpRef.current.height = rect.height;
      requestRender();
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [requestRender]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false };

      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        if (dragRef.current && !dragRef.current.moved) {
          const rect = canvas.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const coords = unproject({ x: clickX, y: clickY }, vpRef.current);
          propsRef.current.onLongPress?.(coords.lat, coords.lng);
        }
      }, 500);
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = {
        dist,
        zoom: vpRef.current.zoom,
        anchorX: (pts[0].x + pts[1].x) / 2,
        anchorY: (pts[0].y + pts[1].y) / 2,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ptr = pointersRef.current.get(e.pointerId);
    if (!ptr) return;

    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    ptr.x = e.clientX;
    ptr.y = e.clientY;

    if (dragRef.current) {
      if (Math.hypot(dx, dy) > 3) {
        dragRef.current.moved = true;
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      }
    }

    if (pointersRef.current.size === 1 && dragRef.current?.moved) {
      userPannedRef.current = true;
      vpRef.current = panViewportByPixels(vpRef.current, dx, dy);
      requestRender();
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / pinchRef.current.dist;
      const newZoom = pinchRef.current.zoom + Math.log2(scale);

      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const anchorPx = {
          x: pinchRef.current.anchorX - rect.left,
          y: pinchRef.current.anchorY - rect.top,
        };
        vpRef.current = zoomViewportAtPixel(vpRef.current, newZoom, anchorPx);
        requestRender();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    const isTap = dragRef.current && !dragRef.current.moved && pointersRef.current.size === 1;

    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;

    if (isTap) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const coords = unproject({ x: clickX, y: clickY }, vpRef.current);
        propsRef.current.onTap?.(coords.lat, coords.lng);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const anchorPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const zoomDelta = e.deltaY < 0 ? 0.35 : -0.35;
    vpRef.current = zoomViewportAtPixel(vpRef.current, vpRef.current.zoom + zoomDelta, anchorPx);
    requestRender();
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      className="h-full w-full touch-none select-none"
      data-testid="canvas-map"
    />
  );
}
