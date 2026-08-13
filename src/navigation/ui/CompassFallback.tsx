import { useMemo } from 'react';
import { Navigation, Heart, ArrowLeft, X } from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';
import { bearingDeg, cardinalFromBearing, haversineMeters, formatDistance } from '@/navigation/gps/gps';

/**
 * Lightweight compass view pointing towards home/destination.
 * Includes explicit Back to Map controls for smooth user navigation.
 */
export function CompassFallback({ onClose }: { onClose?: () => void }) {
  const nav = useNav();

  const targetPoint = nav.destination ? { lat: nav.destination.lat, lng: nav.destination.lng, label: nav.destination.label } : nav.home ? { lat: nav.home.latitude, lng: nav.home.longitude, label: nav.home.label } : null;

  const bearing = useMemo(() => {
    if (!nav.gpsFix || !targetPoint) return 0;
    return bearingDeg(
      nav.gpsFix.latitude,
      nav.gpsFix.longitude,
      targetPoint.lat,
      targetPoint.lng
    );
  }, [nav.gpsFix, targetPoint]);

  const cardinal = cardinalFromBearing(bearing);
  const distance = useMemo(() => {
    if (!nav.gpsFix || !targetPoint) return 0;
    return haversineMeters(
      nav.gpsFix.latitude,
      nav.gpsFix.longitude,
      targetPoint.lat,
      targetPoint.lng
    );
  }, [nav.gpsFix, targetPoint]);

  return (
    <div className="flex h-full w-full flex-col bg-surface animate-fade-in" data-testid="compass-view">
      {/* Top Header with Back to Map button */}
      <header className="flex items-center justify-between border-b border-line bg-surface-raised px-4 py-3 safe-top">
        <button
          onClick={onClose}
          data-testid="compass-back-btn"
          className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-subtle"
        >
          <ArrowLeft size={16} />
          <span>Back to Map</span>
        </button>

        <div className="text-center">
          <h2 className="text-sm font-semibold text-ink">Compass Bearing</h2>
          <p className="text-[11px] text-ink-faint">{targetPoint?.label || 'Direct Heading'}</p>
        </div>

        {onClose && (
          <button onClick={onClose} className="rounded-full p-2 text-ink-muted hover:bg-surface-subtle hover:text-ink">
            <X size={20} />
          </button>
        )}
      </header>

      {/* Main compass body */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="relative flex h-64 w-64 items-center justify-center">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-accent-300/40 bg-surface-raised shadow-float" />
          
          {/* Cardinal direction labels */}
          {['N', 'E', 'S', 'W'].map((dir, i) => (
            <span
              key={dir}
              className={`absolute font-bold ${dir === 'N' ? 'text-accent-500 text-base' : 'text-ink-faint text-sm'}`}
              style={{
                top: i === 0 ? '12px' : i === 2 ? 'auto' : '50%',
                bottom: i === 2 ? '12px' : 'auto',
                left: i === 1 ? 'auto' : i === 3 ? '12px' : '50%',
                right: i === 1 ? '12px' : 'auto',
                transform: i === 0 || i === 2 ? 'translateX(-50%)' : 'translateY(-50%)',
              }}
            >
              {dir}
            </span>
          ))}

          {/* Needle pointing to target */}
          <div
            className="absolute flex h-52 w-2 origin-bottom items-start justify-center transition-transform duration-500"
            style={{ transform: `rotate(${bearing}deg)`, bottom: '50%' }}
          >
            <div className="h-20 w-2.5 rounded-full bg-accent-500 shadow-float" />
            <Navigation size={24} className="absolute -top-2 text-accent-500" fill="currentColor" />
          </div>

          {/* Center dot */}
          <div className="z-10 flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-accent-600 shadow-soft border border-accent-300">
            <Heart size={16} fill="currentColor" />
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs uppercase tracking-wider text-ink-faint">Heading to {targetPoint?.label || 'Home'}</p>
          <p className="mt-1 font-display text-3xl font-bold text-ink">{formatDistance(distance)}</p>
          <p className="mt-1 text-xl font-semibold text-accent-500">{cardinal} ({Math.round(bearing)}°)</p>
        </div>

        <button
          onClick={onClose}
          className="mt-8 rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-600 active:scale-95"
        >
          Return to Interactive Map
        </button>
      </div>
    </div>
  );
}
