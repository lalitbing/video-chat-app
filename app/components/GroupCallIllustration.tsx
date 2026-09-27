/* eslint-disable @next/next/no-img-element -- static SVG with its own CSS animation */

type GroupCallIllustrationProps = {
  className?: string;
};

// Animated Storyset illustration (the animation lives inside the SVG).
export const GroupCallIllustration = ({ className = "" }: GroupCallIllustrationProps) => (
  <img
    src="/illustrations/group-call.svg"
    alt="Four people on a group video call"
    className={`select-none drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)] ${className}`}
    draggable={false}
  />
);
