"use client";

import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_COPY, type InboxItem } from "@/lib/api/notifications";
import { KIT_COPY } from "@/lib/kit/copy";

const TOAST_MS = 5_000;
// What is on screen decides, never body.modal-open: a nested Modal / Select removes that class on close while the
// outer sheet stays open. Every page modal / sheet / dialog renders a .modal-surface (components/ui/Modal users,
// ConfirmDialog, the log forms); the mobile select sheet is an aria-modal dialog.
const MODAL_SELECTOR = ".modal-surface, [aria-modal='true']";

export function modalOnScreen(): boolean {
  return typeof document !== "undefined" && document.querySelector(MODAL_SELECTOR) !== null;
}

/** True while any modal / sheet is in the page (re-checked at most once a frame on DOM changes). */
export function useModalOnScreen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setOpen(modalOnScreen());
    };
    update();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(update);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return open;
}

// The toast rule (frontend-kit; D-N3 replaced the blocking pop-up): "<title> · View · ×", top-centre under the safe
// area, banner chrome, max 520 wide, 44px tap targets, 5 s, the newest replaces the previous, announced politely.
// View marks read + routes (the gate); × or the timeout only hides it (the item stays unread). The gate renders it
// OUTSIDE <main> (a z-10 stacking context), so its z-40 sits above every page element INCLUDING page modals — the gate
// therefore never shows it while a modal / sheet is on screen and drops it the moment one opens. Top-centre: never
// meets the bottom FloatingBanner, the bottom nav or the /programs FAB stack.
export function NotificationToast({
  item,
  onView,
  onDismiss
}: {
  item: InboxItem;
  onView: () => void;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [item.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-40 flex min-h-[52px] w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-rf-border bg-rf-surface py-1 pl-4 pr-1 text-sm text-rf-text shadow-rf-pill"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-rf-accent" />
      <p className="min-w-0 flex-1 truncate py-1.5 font-semibold">
        {item.title?.trim() || NOTIFICATION_COPY.toastFallbackTitle}
      </p>
      <button
        type="button"
        onClick={onView}
        className="h-11 shrink-0 rounded-full px-3 font-semibold text-rf-accent transition hover:text-rf-accent-strong"
      >
        {NOTIFICATION_COPY.toastView}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={KIT_COPY.dismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-rf-text-muted transition hover:text-rf-text"
      >
        ×
      </button>
    </div>
  );
}
