type BrandMarkProps = {
  compact?: boolean;
};

// Two overlapping "lenses": one camera, one person across the call.
export const BrandMark = ({ compact = false }: BrandMarkProps) => (
  <div className="flex items-center gap-2.5">
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <defs>
        <linearGradient id="brand-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6aa8ff" />
          <stop offset="1" stopColor="#2f7bf6" />
        </linearGradient>
        <linearGradient id="brand-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f7bf6" />
          <stop offset="1" stopColor="#1447b8" />
        </linearGradient>
      </defs>
      <rect x="2" y="6" width="18" height="18" rx="7" fill="url(#brand-b)" />
      <rect x="12" y="8" width="18" height="18" rx="7" fill="url(#brand-a)" opacity="0.92" />
      <circle cx="21" cy="17" r="3.2" fill="#0b1220" />
    </svg>
    {compact ? null : (
      <span className="text-[17px] font-bold tracking-tight text-ink">
        VC<span className="text-accent">·</span>meet
      </span>
    )}
  </div>
);
