type ChevronDownIconProps = {
  className?: string;
};

export const ChevronDownIcon = ({ className = "h-5 w-5" }: ChevronDownIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);
