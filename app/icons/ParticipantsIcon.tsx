type ParticipantsIconProps = {
  className?: string;
};

export const ParticipantsIcon = ({ className = "h-5 w-5" }: ParticipantsIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M8.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    <path d="M2 18.5c0-2.76 2.24-5 5-5h3c2.76 0 5 2.24 5 5V20H2v-1.5Zm2 .5h9c0-1.93-1.57-3.5-3.5-3.5h-2C5.57 15.5 4 17.07 4 19Z" />
    <path d="M17.5 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    <path d="M16 15.5h2c2.21 0 4 1.79 4 4V20h-2v-.5c0-1.1-.9-2-2-2h-2v-2Z" />
  </svg>
);
