"use client";

import { useEffect } from "react";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmButtonClassName?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmButtonClassName = "bg-red-500 text-white hover:bg-red-600",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/65 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm cursor-default rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-300">{description}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${confirmButtonClassName}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
