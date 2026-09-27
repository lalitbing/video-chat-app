import { AlertIcon } from "@/app/icons";

type ToastProps = {
  message: string;
};

export const Toast = ({ message }: ToastProps) =>
  message ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 bg-raised max-w-[calc(100vw-2rem)] animate-slide-down items-center gap-3 rounded-2xl py-2.5 pl-3 pr-4 text-sm font-medium text-ink shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <AlertIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0">{message}</span>
    </div>
  ) : null;
