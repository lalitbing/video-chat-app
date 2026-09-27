type SpeakingBarsProps = {
  className?: string;
};

export const SpeakingBars = ({ className = "h-3.5" }: SpeakingBarsProps) => (
  <span className={`flex items-center gap-[3px] ${className}`} aria-hidden>
    <span className="wave-bar h-full" />
    <span className="wave-bar h-full" />
    <span className="wave-bar h-full" />
    <span className="wave-bar h-full" />
  </span>
);
