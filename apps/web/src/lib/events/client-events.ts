import { ApiError, apiRequest, currentSessionToken, uuid } from "@/lib/api/client";
import { toAppError } from "@/lib/kit/app-error";

// Client event sender (observability SPEC §8). A localStorage queue that SURVIVES sign-out. UUID ids are kept across
// retries (the server stores each id once). Batches of <= 25 go out with fetch + JSON to /client-events, with a
// Bearer only when a session exists. 429 waits Retry-After · 413 halves the batch (a single event that still 413s is
// dropped) · other 4xx drop it · 5xx / network / timeout back off. No new dependency.

const QUEUE_KEY = "rasi.fiters.events";
const MAX_QUEUE = 200;
const BATCH_MAX = 25;
const FLUSH_DELAY_MS = 1_000;
const BACKOFF_START_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;

type QueuedEvent = { id: string; type: string; occurred_at: string; request_id?: string; props: Record<string, unknown> };
export type FailureKind =
  | "wrong_credentials" | "invalid_input" | "conflict" | "unavailable"
  | "offline" | "timeout" | "server" | "provider" | "unknown";

let flushing = false;
let nextAttemptAt = 0;
let backoffMs = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function readQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(events: QueuedEvent[]): void {
  try {
    if (events.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)));
  } catch {
    // storage full / disabled: drop
  }
}

function removeIds(ids: string[]): void {
  const drop = new Set(ids);
  writeQueue(readQueue().filter((event) => !drop.has(event.id)));
}

function scheduleFlush(delayMs: number): void {
  if (typeof window === "undefined" || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushEvents();
  }, Math.max(delayMs, nextAttemptAt - Date.now()));
}

export function reportEvent(type: string, props: Record<string, unknown> = {}, requestId?: string): void {
  if (typeof window === "undefined") return;
  const event: QueuedEvent = {
    id: uuid(),
    type,
    occurred_at: new Date().toISOString(),
    props,
    ...(requestId ? { request_id: requestId } : {})
  };
  writeQueue([...readQueue(), event]);
  scheduleFlush(FLUSH_DELAY_MS);
}

/** Sends the queue now. `bearer` overrides the session token (a forced sign-out flushes with the last one). */
export async function flushEvents(bearer?: string | null): Promise<void> {
  if (typeof window === "undefined" || flushing) return;
  if (Date.now() < nextAttemptAt) {
    scheduleFlush(0);
    return;
  }
  flushing = true;
  const token = bearer ?? currentSessionToken();
  let size = BATCH_MAX;
  try {
    for (let batch = readQueue().slice(0, size); batch.length > 0; batch = readQueue().slice(0, size)) {
      try {
        await apiRequest("/client-events", { method: "POST", body: { events: batch }, token, bearer: "explicit" });
        removeIds(batch.map((event) => event.id));
        backoffMs = 0;
        size = BATCH_MAX;
      } catch (error) {
        const status = error instanceof ApiError ? error.status : undefined;
        if (status === 413 && batch.length > 1) {
          size = Math.ceil(batch.length / 2);
          continue;
        }
        if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          removeIds(batch.map((event) => event.id));
          continue;
        }
        const retryAfterMs = error instanceof ApiError && status === 429 && error.retryAfter !== undefined
          ? error.retryAfter * 1000
          : undefined;
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : BACKOFF_START_MS, BACKOFF_MAX_MS);
        nextAttemptAt = Date.now() + (retryAfterMs ?? backoffMs);
        scheduleFlush(0);
        return;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Called once AuthProvider has bootstrapped (so a stored session's Bearer is used); again on every `online`. */
export function startClientEvents(): () => void {
  const onOnline = () => void flushEvents();
  window.addEventListener("online", onOnline);
  void flushEvents();
  return () => window.removeEventListener("online", onOnline);
}

/** observability §8 `kind` (+ status / code). `publicSignIn` = a 401 means wrong credentials. */
export function failureProps(error: unknown, publicSignIn = true): { kind: FailureKind; status?: number; code?: string } {
  if (error instanceof ApiError) {
    const s = error.status;
    const kind: FailureKind =
      s === 401 ? (publicSignIn ? "wrong_credentials" : "unknown")
      : s === 400 || s === 422 ? "invalid_input"
      : s === 409 ? "conflict"
      : s === 429 || s === 503 ? "unavailable"
      : s === 408 ? "timeout"
      : s >= 500 ? "server"
      : "unknown";
    return { kind, status: s, ...(error.code ? { code: error.code.slice(0, 64) } : {}) };
  }
  const kitKind = toAppError(error).kind;
  return { kind: kitKind === "offline" || kitKind === "timeout" ? kitKind : "unknown" };
}

export function requestIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.requestId : undefined;
}

export function reportSignInFailure(method: "password" | "google", error: unknown): void {
  reportEvent("auth.sign_in_failed", { method, ...failureProps(error) }, requestIdOf(error));
}

export function reportProviderFailure(method: "google", code: string): void {
  reportEvent("auth.sign_in_failed", { method, kind: "provider", code: code.slice(0, 64) });
}
