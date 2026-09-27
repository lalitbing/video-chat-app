type CheckIconProps = {
  className?: string;
};

export const CheckIcon = ({ className = "h-5 w-5" }: CheckIconProps) => (
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
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
