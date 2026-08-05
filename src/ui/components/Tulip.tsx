/** Cheerful tulip SVG decoration. Petals inherit currentColor (accent); stem is fixed green. */
export function Tulip({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 24 L12 14" stroke="rgb(124 182 143)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 18 C9 17 7.5 14 7.5 11" stroke="rgb(124 182 143)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path
        d="M12 14 C7.5 13.5 5.5 10.5 5.5 7 C5.5 4 8 3.5 12 4.5 C16 3.5 18.5 4 18.5 7 C18.5 10.5 16.5 13.5 12 14 Z"
        fill="currentColor"
      />
      <path
        d="M12 14 C10 13.5 9 11 9 8 C9 5.5 10.5 5 12 6 C13.5 5 15 5.5 15 8 C15 11 14 13.5 12 14 Z"
        fill="white"
        fillOpacity="0.2"
      />
    </svg>
  );
}
