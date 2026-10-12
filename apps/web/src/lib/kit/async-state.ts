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
  if (query.isPaused) return { status: "failed", error: appError("offline") };
  if (query.isPending && !query.isFetching) return { status: "idle" };
  return { status: "loading" };
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
