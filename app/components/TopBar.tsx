"use client";

type TopBarProps = {
  userName: string;
};

export const TopBar = ({ userName }: TopBarProps) => {
  const initial = userName.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        VC meet
      </div>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        title={userName}
      >
        {initial}
      </div>
    </header>
  );
};
