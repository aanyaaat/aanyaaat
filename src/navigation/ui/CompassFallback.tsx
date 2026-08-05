import { useMemo } from 'react';
import { Navigation, Heart } from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { bearingDeg, cardinalFromBearing, haversineMeters, formatDistance } from '@/navigation/gps/gps';

/**
 * Lightweight compass-to-home fallback.
 * Works with GPS coordinates only — no map tiles, no routing.
 * Uses device orientation if available to show a live compass needle.
 */
export function CompassFallback() {
  const nav = useNav();

  const bearing = useMemo(() => {
    if (!nav.gpsFix || !nav.home) return 0;
    return bearingDeg(
      nav.gpsFix.latitude,
      nav.gpsFix.longitude,
      nav.home.latitude,
      nav.home.longitude,
    );
  }, [nav.gpsFix, nav.home]);

  const cardinal = cardinalFromBearing(bearing);
  const distance = useMemo(() => {
    if (!nav.gpsFix || !nav.home) return 0;
    return haversineMeters(
      nav.gpsFix.latitude,
      nav.gpsFix.longitude,
      nav.home.latitude,
      nav.home.longitude,
    );
  }, [nav.gpsFix, nav.home]);

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="relative flex h-48 w-48 items-center justify-center">
        {/* Compass ring */}
        <div className="absolute inset-0 rounded-full border-2 border-accent-300/40 bg-surface-raised shadow-card" />
        {/* Cardinal markers */}
        {['N', 'E', 'S', 'W'].map((dir, i) => (
          <span
            key={dir}
            className="absolute text-sm font-semibold text-ink-faint"
            style={{
              top: i === 0 ? '8px' : i === 2 ? 'auto' : '50%',
              bottom: i === 2 ? '8px' : 'auto',
              left: i === 1 ? 'auto' : i === 3 ? '8px' : '50%',
              right: i === 1 ? '8px' : 'auto',
              transform: i === 0 || i === 2 ? 'translateX(-50%)' : 'translateY(-50%)',
            }}
          >
            {dir}
          </span>
        ))}
        {/* Needle pointing to home */}
        <div
          className="absolute flex h-40 w-2 origin-bottom items-start justify-center transition-transform duration-500"
          style={{ transform: `rotate(${bearing}deg)`, bottom: '50%' }}
        >
          <div className="h-16 w-2 rounded-full bg-accent-400 shadow-float" />
          <Navigation size={20} className="absolute -top-1 text-accent-500" fill="currentColor" />
        </div>
        {/* Center dot */}
        <div className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-accent-200 text-accent-700 shadow-soft">
          <Heart size={14} fill="currentColor" />
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-ink-faint">Home is approximately</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{formatDistance(distance)}</p>
        <p className="mt-1 text-lg font-medium text-accent-500">{cardinal}</p>
      </div>
    </div>
  );
}
