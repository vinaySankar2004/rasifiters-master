"use client";

import { useEffect, useId, useRef } from "react";

// Shared pop-up (polish #37): announced as a modal dialog (named by its first heading), Escape closes the TOPMOST open
// one, focus moves into it on open (unless a child already took it, e.g. autoFocus) and returns to the opener on
// close. Every Modal and ConfirmDialog inherits this. The panel itself takes focus, so no mobile keyboard pops up.
// Escape is decided on the event's TARGET (fixed at dispatch; the app-wide use-dismiss-keyboard capture listener blurs
// the focused input before this bubble listener runs, so activeElement would already be <body>): it is left alone
// when the key came from outside the panel (a Select's search box is portaled to <body>), while an IME composition is
// being cancelled, and when `closeOnEscape` is false (forms whose loss would hurt, e.g. the desktop bulk-log forms).
// Accepted debt: no Tab trap, so Tab can leave the panel (aria-modal is set).
const openModals: object[] = [];

export function Modal({
  open,
  onClose,
  closeOnEscape = true,
  children
}: {
  open: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const entry = {};
    openModals.push(entry);
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    body.style.overflow = "hidden";
    body.classList.add("modal-open");

    const panel = panelRef.current;
    if (panel) {
      const heading = panel.querySelector<HTMLElement>("h1, h2, h3");
      if (heading) {
        if (!heading.id) heading.id = titleId;
        panel.setAttribute("aria-labelledby", heading.id);
      }
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      if (openModals[openModals.length - 1] !== entry) return; // only the topmost pop-up
      const target = event.target;
      if (target instanceof Node && target !== document.body && !panelRef.current?.contains(target)) return;
      if (!closeOnEscapeRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openModals.splice(openModals.indexOf(entry), 1);
      body.style.overflow = previousOverflow;
      if (openModals.length === 0) body.classList.remove("modal-open");
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, titleId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative z-10 flex min-h-0 w-full max-h-[90dvh] justify-center overflow-auto outline-none"
      >
        {children}
      </div>
    </div>
  );
}
