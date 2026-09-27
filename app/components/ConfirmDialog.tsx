"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertIcon, LinkIcon } from "@/app/icons";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "accent";
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusFirstElement = () => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
      focusable?.[0]?.focus();
    };

    const focusTimer = window.setTimeout(() => {
      focusFirstElement();
    }, 0);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const container = dialogRef.current;
      if (!container) {
        event.preventDefault();
        return;
      }

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!container.contains(activeElement)) {
        event.preventDefault();
        if (event.shiftKey) {
          last.focus();
        } else {
          first.focus();
        }
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = tone === "danger";

  return (
    <DialogBackdrop onDismiss={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        ref={dialogRef}
        className={dialogPanelClass}
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
            isDanger ? "bg-danger/15 text-[#ff8a8e]" : "bg-accent-soft text-[#8fb8ff]"
          }`}
        >
          {icon ?? (isDanger ? <AlertIcon className="h-5 w-5" /> : <LinkIcon className="h-5 w-5" />)}
        </span>
        <h2 id="confirm-dialog-title" className="mt-4 text-lg font-bold tracking-tight text-ink">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="mt-1.5 text-sm leading-relaxed text-muted">
          {description}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className={dialogSecondaryButtonClass}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={isDanger ? dialogDangerButtonClass : dialogPrimaryButtonClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
};

// Shared dialog styling, also used by the host leave/end dialog.
export const dialogPanelClass =
  "w-full max-w-sm animate-pop-in cursor-default rounded-[26px] bg-panel p-6 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/10";
const dialogButtonBase =
  "h-11 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
export const dialogSecondaryButtonClass = `${dialogButtonBase} bg-white/[0.06] text-ink ring-1 ring-white/10 hover:bg-white/10`;
export const dialogPrimaryButtonClass = `${dialogButtonBase} bg-accent text-white hover:bg-accent-strong`;
export const dialogDangerButtonClass = `${dialogButtonBase} bg-danger text-white hover:bg-danger-strong`;

export const DialogBackdrop = ({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) => (
  <div
    className="fixed inset-0 z-50 flex animate-fade-in cursor-pointer items-center justify-center bg-[#03060c]/70 px-4 backdrop-blur-sm"
    onClick={onDismiss}
  >
    {children}
  </div>
);
