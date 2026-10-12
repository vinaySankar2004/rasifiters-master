"use client";

import type { AppError } from "@/lib/kit/app-error";
import { KIT_COPY } from "@/lib/kit/copy";
import { cn } from "@/lib/utils";

// Slim floating status banner (frontend-kit SPEC §6). Net-new: no page renders it until Phase 3 adoption.
// Fixed above the bottom nav on every page (D-KIT-8): `bottom` = the nav's own offset + 7.5rem, which also
// clears the /programs mobile FAB stack (2 x 48px + 12px gap). z-40: pages render inside <main class="z-10">,
// where some cards are z-30 — z-40 wins regardless of DOM order; modals / menus (z-50+) stay above.
// Min height 52px, 44px tap targets. No "update available" variant on web (D-KIT-9).
// `className` is for additions only (no tailwind-merge).

export type FloatingBannerVariant = "offline" | "stale" | "error";

const DOT_CLASS: Record<FloatingBannerVariant, string> = {
  offline: "bg-rf-warning",
  stale: "bg-rf-warning",
  error: "bg-rf-danger"
};

/**
 * Render at the page root, never inside a `.glass-card`, `backdrop-blur`, `transform` or `filter` ancestor:
 * any of those becomes the containing block for `position: fixed`, pinning the banner to that box instead
 * of the viewport. The message wraps to as many lines as it needs (never clamped).
 */
export function FloatingBanner({
  variant,
  error,
  onRetry,
  onDismiss,
  className
}: {
  variant: FloatingBannerVariant;
  error?: AppError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const message =
    variant === "offline"
      ? KIT_COPY.bannerOffline
      : variant === "stale"
        ? KIT_COPY.bannerStale
        : error?.message ?? KIT_COPY.errors.unknown;
  const showRetry =
    Boolean(onRetry) && (variant === "stale" || (variant === "error" && (error?.retryable ?? true)));

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 z-40 flex min-h-[52px] w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-rf-border bg-rf-surface py-1 pl-4 pr-1 text-sm text-rf-text shadow-rf-pill",
        "bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))+7.5rem)]",
        className
      )}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[variant])} />
      <p className="min-w-0 flex-1 break-words py-1.5 font-semibold leading-snug">{message}</p>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-11 shrink-0 rounded-full px-3 font-semibold text-rf-accent transition hover:text-rf-accent-strong"
        >
          {KIT_COPY.retry}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={KIT_COPY.dismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-rf-text-muted transition hover:text-rf-text"
        >
          ×
        </button>
      )}
    </div>
  );
}
