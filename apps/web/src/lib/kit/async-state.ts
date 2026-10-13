import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { appError, toAppError, type AppError } from "@/lib/kit/app-error";

// One async state per screen (frontend-kit SPEC §5) — the same five states as iOS LoadState and Android
// UiState. "Empty" is a view decision on loaded data, not a state.

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: T; fetchedAt: number; refreshing: boolean }
  | { status: "failed"; error: AppError }
  | { status: "stale"; data: T; fetchedAt: number; error: AppError };

/** The TanStack v5 query-result fields the mapper reads (a `useQuery` result satisfies it). */
export type QueryLike<T> = {
  data: T | undefined;
  error: unknown;
  dataUpdatedAt: number;
  isPending: boolean;
  isFetching: boolean;
  isPaused: boolean;
  isError: boolean;
  /** Failed tries of the current fetch (TanStack v5 — reset when a new fetch starts or one succeeds). */
  failureCount: number;
  failureReason: unknown;
};

export function fromQuery<T>(query: QueryLike<T>): AsyncState<T> {
  if (query.data !== undefined) {
    // TanStack keeps status "error" during a refetch that has data — a retry in flight is loaded-refreshing,
    // exactly like refreshing() on iOS / Android (D-KIT-6).
    if (query.isError && !query.isFetching) {
      return { status: "stale", data: query.data, fetchedAt: query.dataUpdatedAt, error: toAppError(query.error) };
    }
    return { status: "loaded", data: query.data, fetchedAt: query.dataUpdatedAt, refreshing: query.isFetching };
  }
  if (query.isError) return { status: "failed", error: toAppError(query.error) };
  // Polish #6 (D-KIT-18): with nothing on screen, show the error after the FIRST failed try while TanStack keeps
  // retrying quietly — never a "Loading…" that waits out every retry (~48 s on a stuck connection).
  if (query.failureCount > 0) return { status: "failed", error: toAppError(query.failureReason) };
  if (query.isPaused) return { status: "failed", error: appError("offline") };
  if (query.isPending && !query.isFetching) return { status: "idle" };
  return { status: "loading" };
}

/**
 * The kit Retry action for a TanStack query (polish #6, D-KIT-18). With no data and a live retryer, `refetch()` only
 * resumes that retryer's backoff (query-core Query.fetch), so a tap would do nothing for up to ~33 s. Cancel it first
 * (reverts to pending, failureCount 0 → "Loading…"), then start a fresh fetch.
 */
export async function retryNow(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  const state = queryClient.getQueryState(queryKey);
  if (state && state.data === undefined && state.fetchStatus !== "idle") {
    await queryClient.cancelQueries({ queryKey, exact: true });
  }
  await queryClient.refetchQueries({ queryKey, exact: true });
}

export function fresh<T>(data: T): AsyncState<T> {
  return { status: "loaded", data, fetchedAt: Date.now(), refreshing: false };
}

export function refreshing<T>(state: AsyncState<T>): AsyncState<T> {
  if (state.status === "loaded" || state.status === "stale") {
    return { status: "loaded", data: state.data, fetchedAt: state.fetchedAt, refreshing: true };
  }
  return { status: "loading" };
}

export function failing<T>(state: AsyncState<T>, error: AppError): AsyncState<T> {
  if (state.status === "loaded" || state.status === "stale") {
    return { status: "stale", data: state.data, fetchedAt: state.fetchedAt, error };
  }
  return { status: "failed", error };
}

export function stateData<T>(state: AsyncState<T>): T | undefined {
  return state.status === "loaded" || state.status === "stale" ? state.data : undefined;
}

export function stateError<T>(state: AsyncState<T>): AppError | undefined {
  return state.status === "failed" || state.status === "stale" ? state.error : undefined;
}
