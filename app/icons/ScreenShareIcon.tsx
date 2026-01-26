type ScreenShareIconProps = {
  className?: string;
};

export const ScreenShareIcon = ({
  className = "h-5 w-5",
}: ScreenShareIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7v2H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 13H4V5h16Z" />
    <path d="M12 7l-4 4h3v3h2v-3h3l-4-4Z" />
  </svg>
);
