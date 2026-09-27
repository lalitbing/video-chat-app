type PlusIconProps = {
  className?: string;
};

export const PlusIcon = ({ className = "h-5 w-5" }: PlusIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
