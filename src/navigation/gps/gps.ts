import type { BearingCardinal, GpsFix, GpsStatus } from '@/navigation/domain/types';

export interface GpsWatcher {
  stop: () => void;
}

export interface GpsOptions {
  onFix: (fix: GpsFix) => void;
  onStatus: (status: GpsStatus) => void;
}

export function startGpsWatch(opts: GpsOptions): GpsWatcher {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    opts.onStatus('unavailable');
    return { stop: () => {} };
  }

  opts.onStatus('locating');

  let lastFixTime = 0;
  let staleTimer: ReturnType<typeof setInterval> | null = null;

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      lastFixTime = Date.now();
      const fix: GpsFix = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      };
      opts.onFix(fix);
      opts.onStatus(fix.accuracy > 50 ? 'weak' : 'found');

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
        // Timeout is often temporary — don't mark as permanently unavailable
        opts.onStatus('locating');
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
