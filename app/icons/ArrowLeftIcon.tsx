type ArrowLeftIconProps = {
  className?: string;
};

export const ArrowLeftIcon = ({ className = "h-5 w-5" }: ArrowLeftIconProps) => (
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
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);
