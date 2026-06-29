"use client";

import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  children
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    body.classList.add("modal-open");
    return () => {
      body.style.overflow = previousOverflow;
      body.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex min-h-0 w-full max-h-[90vh] justify-center overflow-auto">
        {children}
      </div>
    </div>
  );
}
