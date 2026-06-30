"use client";

import { useEffect } from "react";

export function NotificationModal({
  open,
  title,
  body,
  confirmLabel = "OK",
  onConfirm
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const pageBody = document.body;
    const previousOverflow = pageBody.style.overflow;
    pageBody.style.overflow = "hidden";
    pageBody.classList.add("modal-open");
    return () => {
      pageBody.style.overflow = previousOverflow;
      pageBody.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="modal-surface relative z-10 w-full max-w-md rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-rf-text">{title}</h3>
        <p className="mt-2 text-sm text-rf-text-muted">{body}</p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onConfirm}
            className="pill-button w-full rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
