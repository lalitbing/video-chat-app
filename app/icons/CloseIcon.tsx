type CloseIconProps = {
  className?: string;
};

export const CloseIcon = ({ className = "h-5 w-5" }: CloseIconProps) => (
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
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
