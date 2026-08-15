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
  rotatePoint,
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
  rotation?: number;
  onRotate?: (newRotation: number) => void;
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

interface PinchInfo {
  dist: number;
  zoom: number;
  angle: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

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
  rotation = 0,
  onRotate,
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
  const dragRef = useRef<{ x: number; y: number; moved: boolean; isRotating?: boolean } | null>(null);
  const pinchRef = useRef<PinchInfo | null>(null);
  const userPannedRef = useRef(false);
  const initialCenteredRef = useRef(false);
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
    rotation,
    onRotate,
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
      rotation,
      onRotate,
      mapStyle,
      onTap,
      onLongPress,
      onSelectPin,
    };
  }, [regions, route, gpsFix, home, destination, savedPlaces, poiMarkers, followMode, rotation, onRotate, mapStyle, onTap, onLongPress, onSelectPin]);

  const requestRender = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        renderMap();
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial center on GPS/Home position ONLY ONCE on startup
  useEffect(() => {
    if (!initialCenteredRef.current) {
      const curGps = gpsFix ?? (home ? { latitude: home.latitude, longitude: home.longitude } : null);
      if (curGps) {
        initialCenteredRef.current = true;
        vpRef.current.centerLat = curGps.latitude;
        vpRef.current.centerLng = curGps.longitude;
        requestRender();
      }
    }
  }, [gpsFix, home, requestRender]);

  // Recenter map camera explicitly on GPS position ONLY when recenterSignal changes
  useEffect(() => {
    if (recenterSignal > 0) {
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
    }
  }, [recenterSignal, requestRender]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smoothly track GPS during active navigation ONLY IF user hasn't manually panned away
  useEffect(() => {
    if (followMode && !userPannedRef.current && gpsFix) {
      vpRef.current.centerLat = gpsFix.latitude;
      vpRef.current.centerLng = gpsFix.longitude;
      requestRender();
    }
  }, [gpsFix, followMode, requestRender]);

  // Center on destination preview when newly selected
  useEffect(() => {
    if (destination && !followMode) {
      userPannedRef.current = false;
      vpRef.current.centerLat = destination.lat;
      vpRef.current.centerLng = destination.lng;
      requestRender();
    }
  }, [destination, followMode, requestRender]);

  // Re-render when rotation changes
  useEffect(() => {
    requestRender();
  }, [rotation, requestRender]);

  const renderMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vp = vpRef.current;
    const props = propsRef.current;
    const isDark = props.mapStyle === 'dark';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    // Reset and apply DPR scale so all drawing coordinates match CSS pixels (vp.width, vp.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Fill background
    ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f9fa';
    ctx.fillRect(0, 0, vp.width, vp.height);

    const bearingRad = ((props.rotation || 0) * Math.PI) / 180;
    const isRotated = Math.abs(bearingRad) > 1e-4;

    ctx.save();

    // Apply viewport rotation around screen center
    if (isRotated) {
      ctx.translate(vp.width / 2, vp.height / 2);
      ctx.rotate(-bearingRad);
      ctx.translate(-vp.width / 2, -vp.height / 2);
    }

    // 2. Render Tile Pyramids (expanded tile coverage to avoid corner clipping when rotated)
    const tileZoom = Math.max(0, Math.min(19, Math.floor(vp.zoom)));
    const tileScale = Math.pow(2, vp.zoom - tileZoom);
    const tileSize = 256 * tileScale;

    const halfW = vp.width / 2;
    const halfH = vp.height / 2;

    const globalCenterPxX = lngToGlobalX(vp.centerLng, tileZoom) * tileScale;
    const globalCenterPxY = latToGlobalY(vp.centerLat, tileZoom) * tileScale;

    const diag = Math.hypot(vp.width, vp.height);
    const tilesAcross = Math.ceil(diag / tileSize) + 2;
    const tilesDown = Math.ceil(diag / tileSize) + 2;

    const minTileX = Math.floor((globalCenterPxX - diag / 2) / tileSize);
    const maxTileX = Math.ceil((globalCenterPxX + diag / 2) / tileSize);
    const minTileY = Math.floor((globalCenterPxY - diag / 2) / tileSize);
    const maxTileY = Math.ceil((globalCenterPxY + diag / 2) / tileSize);

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

    // Pre-fetch surrounding tiles quietly in background for pan responsiveness
    prefetchSurroundingTiles(tileZoom, minTileX, maxTileX, minTileY, maxTileY, isDark);

    // 3. Render Offline Region Vector Roads (Ultra-fast Spatial Grid Index Culling < 1ms)
    if (vp.zoom >= 13) {
      const bounds = viewportBounds(vp);
      const minClass = vp.zoom < 14 ? 3 : 1;

      for (const regionSummary of props.regions) {
        if (
          bounds.north < regionSummary.bbox.south ||
          bounds.south > regionSummary.bbox.north ||
          bounds.east < regionSummary.bbox.west ||
          bounds.west > regionSummary.bbox.east
        ) {
          continue;
        }

        const visibleRoads = regionDataManager.getVisibleRoads(regionSummary.id, bounds, minClass);
        if (visibleRoads.length === 0) {
          if (!regionDataManager.getCachedData(regionSummary.id)) {
            void regionDataManager.requestData(regionSummary.id).then((d) => {
              if (d) requestRender();
            });
          }
          continue;
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Group only visible roads by class (at most ~50-200 roads)
        const classRoadsMap = new Map<number, GeoJsonRoad[]>();
        for (const road of visibleRoads) {
          let list = classRoadsMap.get(road.roadClass);
          if (!list) {
            list = [];
            classRoadsMap.set(road.roadClass, list);
          }
          list.push(road);
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
      if (pt.x >= -30 && pt.x <= vp.width + 30 && pt.y >= -30 && pt.y <= vp.height + 30) {
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

    // 7. GPS Location Marker with Directional Vision Cone & 3D Navigation Arrow
    if (props.gpsFix) {
      const pt = project(props.gpsFix.latitude, props.gpsFix.longitude, vp);
      const heading = props.gpsFix.heading ?? (props.followMode ? props.rotation : null);

      // Accuracy Pulsating Halo
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 24, 0, Math.PI * 2);
      ctx.fill();

      if (heading !== null && Number.isFinite(heading)) {
        const rad = ((heading - 90) * Math.PI) / 180;
        const spreadRad = (35 * Math.PI) / 180;

        // Directional Cone of Vision Beam
        const gradient = ctx.createRadialGradient(pt.x, pt.y, 5, pt.x, pt.y, 45);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.45)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.arc(pt.x, pt.y, 45, rad - spreadRad, rad + spreadRad);
        ctx.closePath();
        ctx.fill();

        // 3D Navigation Arrowhead Pointer
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(rad + Math.PI / 2);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(9, 10);
        ctx.lineTo(0, 5);
        ctx.lineTo(-9, 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(7, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      } else {
        // Standard dot marker when stationary / no heading
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore(); // Restore unrotated context for UI Scale Bar

    // 8. Scale Bar (Screen-aligned, sharp at bottom)
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
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const targetWidth = Math.round(rect.width * dpr);
      const targetHeight = Math.round(rect.height * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      vpRef.current.width = rect.width;
      vpRef.current.height = rect.height;
      requestRender();
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(canvas);
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, [requestRender]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        isRotating: e.shiftKey || e.altKey || e.button === 2,
      };

      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        if (dragRef.current && !dragRef.current.moved) {
          const rect = canvas.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const bearingRad = ((propsRef.current.rotation || 0) * Math.PI) / 180;
          const center = { x: vpRef.current.width / 2, y: vpRef.current.height / 2 };
          const unrotated = rotatePoint({ x: clickX, y: clickY }, center, bearingRad);

          const coords = unproject(unrotated, vpRef.current);
          propsRef.current.onLongPress?.(coords.lat, coords.lng);
        }
      }, 500);
    } else if (pointersRef.current.size === 2) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchRef.current = {
        dist,
        zoom: vpRef.current.zoom,
        angle,
        rotation: propsRef.current.rotation || 0,
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
        userPannedRef.current = true;
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      }
    }

    if (pointersRef.current.size === 1 && dragRef.current?.moved) {
      userPannedRef.current = true;

      // Check if user is rotating via Shift+drag / Right-click drag on desktop
      if (dragRef.current.isRotating || e.shiftKey || e.altKey) {
        const curRot = propsRef.current.rotation || 0;
        const newRot = (curRot + dx * 0.4 + 360) % 360;
        propsRef.current.onRotate?.(newRot);
        requestRender();
      } else {
        // Natural rotated panning
        const bearingRad = ((propsRef.current.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(bearingRad);
        const sin = Math.sin(bearingRad);
        const worldDx = dx * cos - dy * sin;
        const worldDy = dx * sin + dy * cos;
        vpRef.current = panViewportByPixels(vpRef.current, worldDx, worldDy);
        requestRender();
      }
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      userPannedRef.current = true;
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);

      // Pinch zoom
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
      }

      // Two-Finger Twist Rotation (Google Maps style)
      let deltaAngleRad = angle - pinchRef.current.angle;
      while (deltaAngleRad > Math.PI) deltaAngleRad -= 2 * Math.PI;
      while (deltaAngleRad < -Math.PI) deltaAngleRad += 2 * Math.PI;

      const deltaDeg = (deltaAngleRad * 180) / Math.PI;
      if (Math.abs(deltaDeg) > 1.5) {
        const newRotation = (pinchRef.current.rotation - deltaDeg + 360) % 360;
        propsRef.current.onRotate?.(newRotation);
      }

      requestRender();
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

        const bearingRad = ((propsRef.current.rotation || 0) * Math.PI) / 180;
        const center = { x: vpRef.current.width / 2, y: vpRef.current.height / 2 };
        const unrotated = rotatePoint({ x: clickX, y: clickY }, center, bearingRad);

        const coords = unproject(unrotated, vpRef.current);
        propsRef.current.onTap?.(coords.lat, coords.lng);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    userPannedRef.current = true;
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
      onContextMenu={(e) => e.preventDefault()}
      className="h-full w-full touch-none select-none"
      data-testid="canvas-map"
    />
  );
}
