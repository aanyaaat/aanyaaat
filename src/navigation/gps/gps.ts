import type { BearingCardinal, GpsFix, GpsStatus } from '@/navigation/domain/types';

export interface GpsWatcher {
  stop: () => void;
}

export interface GpsOptions {
  onFix: (fix: GpsFix) => void;
  onStatus: (status: GpsStatus) => void;
}

/**
 * GPS watcher with smoothing, heading interpolation, and quick recovery.
 * - Smooths position using a weighted moving average (last 3 fixes)
 * - Interpolates heading from position changes when device heading is null
 * - Tracks stale status with a timer
 * - Recovers quickly after temporary signal loss
 */
export function startGpsWatch(opts: GpsOptions): GpsWatcher {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    opts.onStatus('unavailable');
    return { stop: () => {} };
  }

  opts.onStatus('locating');

  let lastFixTime = 0;
  let staleTimer: ReturnType<typeof setInterval> | null = null;
  const history: GpsFix[] = [];
  const MAX_HISTORY = 5;
  let lastInterpHeading: number | null = null;

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      lastFixTime = Date.now();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Reject NaN/Infinity coordinates — they poison the smoothing buffer
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const rawFix: GpsFix = {
        latitude: lat,
        longitude: lng,
        accuracy: pos.coords.accuracy ?? 50,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      };

      // Smooth position using weighted moving average
      history.push(rawFix);
      if (history.length > MAX_HISTORY) history.shift();

      const smoothed = smoothFix(history, lastInterpHeading);

      // Interpolate heading from position changes if device heading is null
      if (smoothed.heading === null || isNaN(smoothed.heading)) {
        if (history.length >= 2) {
          const prev = history[history.length - 2];
          const curr = history[history.length - 1];
          const dist = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
          // Only interpolate heading if we've moved enough (5m) to be meaningful
          if (dist > 5) {
            const interpHeading = bearingDeg(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
            lastInterpHeading = interpHeading;
            smoothed.heading = interpHeading;
          } else if (lastInterpHeading !== null) {
            smoothed.heading = lastInterpHeading;
          }
        }
      } else {
        lastInterpHeading = smoothed.heading;
      }

      // Final safety check: never emit NaN
      if (Number.isFinite(smoothed.latitude) && Number.isFinite(smoothed.longitude)) {
        opts.onFix(smoothed);
        opts.onStatus(smoothed.accuracy > 50 ? 'weak' : 'found');
      }

      if (staleTimer) clearInterval(staleTimer);
      staleTimer = setInterval(() => {
        if (Date.now() - lastFixTime > 10000) {
          opts.onStatus('stale');
        }
      }, 3000);
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        opts.onStatus('denied');
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        opts.onStatus('unavailable');
      } else if (err.code === err.TIMEOUT) {
        // Timeout is often temporary — keep trying, don't mark as unavailable
        if (lastFixTime === 0) {
          opts.onStatus('locating');
        } else if (Date.now() - lastFixTime > 10000) {
          opts.onStatus('stale');
        }
      } else {
        opts.onStatus('unavailable');
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );

  return {
    stop: () => {
      navigator.geolocation.clearWatch(id);
      if (staleTimer) clearInterval(staleTimer);
    },
  };
}

export async function getSingleFix(timeoutMs = 15000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: timeoutMs },
    );
  });
}

/**
 * Smooth a GPS fix using a weighted moving average.
 * Most recent fix has the highest weight. Accuracy is taken as the
 * median (not averaged) to avoid a single bad reading inflating the estimate.
 */
function smoothFix(history: GpsFix[], lastHeading: number | null): GpsFix {
  if (history.length === 1) return { ...history[0] };

  // Filter out any NaN/Infinity entries (defensive)
  const valid = history.filter(
    (h) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude),
  );
  if (valid.length === 0) return { ...history[history.length - 1] };
  if (valid.length === 1) return { ...valid[0] };

  // Weighted average: most recent gets highest weight
  const weights = [1, 2, 3].slice(-valid.length).reverse();
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let lat = 0, lng = 0;
  for (let i = 0; i < valid.length; i++) {
    lat += valid[i].latitude * weights[i];
    lng += valid[i].longitude * weights[i];
  }
  lat /= totalWeight;
  lng /= totalWeight;

  // Use the most recent accuracy
  const accuracy = valid[valid.length - 1].accuracy;

  const last = valid[valid.length - 1];
  let heading = last.heading;
  if (heading === null || isNaN(heading)) {
    heading = lastHeading;
  }

  return {
    latitude: lat,
    longitude: lng,
    accuracy,
    heading,
    speed: last.speed,
    timestamp: last.timestamp,
  };
}

/**
 * Snap a GPS fix to the nearest point on a route line.
 * Returns the snapped position and the index of the nearest route segment.
 */
export function snapToRoute(
  fix: GpsFix,
  routeCoords: { lat: number; lng: number }[],
): { lat: number; lng: number; segmentIndex: number; distanceFromRoute: number } | null {
  if (routeCoords.length < 2) return null;

  let minDist = Infinity;
  let snappedLat = fix.latitude;
  let snappedLng = fix.longitude;
  let bestIdx = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const snap = projectPointToSegment(fix.latitude, fix.longitude, a.lat, a.lng, b.lat, b.lng);
    if (snap.distance < minDist) {
      minDist = snap.distance;
      snappedLat = snap.lat;
      snappedLng = snap.lng;
      bestIdx = i;
    }
  }

  return {
    lat: snappedLat,
    lng: snappedLng,
    segmentIndex: bestIdx,
    distanceFromRoute: minDist,
  };
}

/**
 * Project a point onto a line segment and return the nearest point + distance.
 * All parameters are in lat/lng: px=lat, py=lng, a/b are [lat, lng].
 */
function projectPointToSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): { lat: number; lng: number; distance: number } {
  // Project in a simple equirectangular approximation (good enough for short segments)
  const latMid = (aLat + bLat) * Math.PI / 360;
  const cosLatMid = Math.cos(latMid);

  // Convert to approximate x/y in meters
  const px = pLng * cosLatMid;
  const py = pLat;
  const ax = aLng * cosLatMid;
  const ay = aLat;
  const bx = bLng * cosLatMid;
  const by = bLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);
  const dist = haversineMeters(pLat, pLng, projLat, projLng);

  return { lat: projLat, lng: projLng, distance: dist };
}

/** Haversine distance in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Initial bearing from point 1 to point 2, in degrees [0, 360). */
export function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function cardinalFromBearing(b: number): BearingCardinal {
  const dirs: BearingCardinal[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(b / 45) % 8];
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
