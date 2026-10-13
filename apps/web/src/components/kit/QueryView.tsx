"use client";

import type { ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { LoadingState } from "@/components/ui/LoadingState";
import { appError, type AppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";
import { KIT_COPY } from "@/lib/kit/copy";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";

/** A useQuery result: the fields fromQuery reads + refetch (for the reconnect rule). */
type ViewableQuery<T> = QueryLike<T> & { refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown> };

// The ONE detail-screen helper (polish #29, frontend-kit "one detail-load helper per surface") = the Summary recipe
// for a single query: loading → LoadingState · failed → ErrorView + Retry (the offline copy while offline, polish-1
// rule 6) · stale → content + "Couldn't refresh · Retry" (hidden while the global offline banner shows, A6) ·
// loaded → content. No data while offline is the offline ErrorView, never a spinner. A failed read refetches by itself
// when the connection comes back (D-KIT-13). idle (a disabled query) renders nothing.
// Render it at page level, never inside a .glass-card (the stale banner is position: fixed).
export function QueryView<T>({
  query,
  queryKey,
  loadingMessage,
  children
}: {
  query: ViewableQuery<T>;
  /** The query's exact key: Retry cancels a live retryer first (retryNow, D-KIT-18). */
  queryKey: QueryKey;
  loadingMessage?: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  useRefetchOnReconnect([query]);
  const state = fromQuery(query);
  const retry = () => void retryNow(queryClient, queryKey);

  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return online ? <LoadingState message={loadingMessage} /> : <ErrorView error={appError("offline")} onRetry={retry} />;
  }
  if (state.status === "failed") {
    return <ErrorView error={online ? state.error : appError("offline")} onRetry={retry} />;
  }
  return (
    <>
      {children}
      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retry} />
        </>
      )}
    </>
  );
}

/**
 * Compact "Couldn't load this · Retry" line for one part of a form or card whose read failed (polish #16 / #18):
 * never an empty list or a guessed value. Retry only when the error is retryable (the ErrorView rule).
 */
export function InlineLoadError({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  const online = useOnlineStatus();
  const shown = online ? error : appError("offline");
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-rf-surface-muted px-4 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rf-text">{KIT_COPY.errorViewTitle}</p>
        <p className="break-words text-xs text-rf-text-muted">{shown.message}</p>
      </div>
      {shown.retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 font-semibold text-rf-accent transition hover:text-rf-accent-strong"
        >
          {KIT_COPY.retry}
        </button>
      )}
    </div>
  );
}
