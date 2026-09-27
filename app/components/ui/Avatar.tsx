const GRADIENTS = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-indigo-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
  "from-fuchsia-400 to-purple-600",
  "from-lime-400 to-emerald-600",
];

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-2xl",
  xl: "h-24 w-24 text-4xl",
} as const;

export const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

// Stable colour per name so the same person always gets the same avatar.
export const getAvatarGradient = (name: string) => {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
};

type AvatarProps = {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
};

export const Avatar = ({ name, size = "md", className = "" }: AvatarProps) => (
  <span
    className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-inner ${getAvatarGradient(name)} ${SIZES[size]} ${className}`}
    title={name}
    aria-hidden
  >
    {getInitial(name)}
  </span>
);
