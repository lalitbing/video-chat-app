type ChatIconProps = {
  className?: string;
};

export const ChatIcon = ({ className = "h-5 w-5" }: ChatIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3l3 3 3-3h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm0 14h-7.59L10 18.59 7.59 16H4V4h16Z" />
    <path d="M7 7h10v2H7zM7 11h7v2H7z" />
  </svg>
);
