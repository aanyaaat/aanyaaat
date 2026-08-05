import { Home, Navigation } from 'lucide-react';
import { useNav } from '@/navigation/state/NavStore';

export function GetMeHomeButton({ onClick }: { onClick: () => void }) {
  const nav = useNav();
  const hasHome = nav.home !== null;
  const hasRegion = nav.regions.length > 0;

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-full bg-gradient-to-r from-accent-300 to-accent-400 px-5 py-2.5 text-sm font-semibold text-white shadow-float transition-all hover:from-accent-400 hover:to-accent-500 active:scale-95"
    >
      <Home size={18} fill="currentColor" className="transition-transform group-hover:scale-110" />
      <span>GET ME HOME</span>
      <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium">
        <Navigation size={10} />
        {hasHome && hasRegion ? 'READY' : hasHome ? 'SETUP MAP' : 'SETUP'}
      </span>
    </button>
  );
}
