type RecordIconProps = {
  className?: string;
};

export const RecordIcon = ({ className = "h-5 w-5" }: RecordIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <circle cx="12" cy="12" r="8" />
  </svg>
);
