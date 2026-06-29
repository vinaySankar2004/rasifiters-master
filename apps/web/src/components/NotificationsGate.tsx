"use client";

/**
 * DEFERRED STUB — foundation scaffold (Phase 3 kickoff).
 *
 * The legacy NotificationsGate (rasifiters-webapp/src/components/NotificationsGate.tsx)
 * opens the SSE notification stream, hydrates the active program, and renders the
 * notification modal. It depends on the web `notifications` + `programs` features,
 * which have NOT been ported to the web app yet (only the splash/login auth path is
 * being built first). Wiring the real gate here would drag in that whole stack.
 *
 * This mirrors the backend's deferred-stub pattern (utils/notifications.js no-op,
 * later replaced when the feature landed). The app shell (src/app/shell.tsx) mounts
 * this on every page; returning null keeps the foundation inert until the web
 * notifications feature is ported, at which point this file is REPLACED with the
 * faithful port. Until then it renders nothing.
 */
export function NotificationsGate() {
  return null;
}
