import { API_BASE_URL } from "@/lib/config";
import { expiresWithin, isTokenExpired, tokenSubject } from "@/lib/auth/jwt";
import { KIT_COPY } from "@/lib/kit/copy"; // copy.ts imports app-error types only — no runtime cycle
import { reportHttpResponse, reportNoConnection } from "@/lib/kit/use-online-status";

// The one HTTP client: auth SPEC §3.1 (sessions), observability §4.1 + §8 (identity headers), frontend-kit D-KIT-5
// (code / Retry-After capture). Session calls send the CURRENT token at send time (read through the bridge
// AuthProvider registers) and refresh first when it expires within 60 s. A 401 sent with an outdated token is
// retried once with the current one, otherwise once after one coalesced refresh — a 401 means the call never ran,
// so this is safe for the password writes too (auth rule 6 forbids re-sending only after an unknown outcome).
// bearer:"explicit" tokens (recovery link, pending social sign-up, logout, client events) are sent exactly as given:
// never swapped, never refreshed. Every request: 15 s timeout, X-App-Platform / X-App-Version, a fresh X-Request-Id.

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /** Backend machine code ("session_invalid", "auth_unavailable", ...). Never decides the kit kind. */
  code?: string;
  /** Whole seconds from Retry-After. */
  retryAfter?: number;
  /** The response's X-Request-Id (else the one sent) — quoted in client events. */
  requestId?: string;
  constructor(
    message: string,
    status: number,
    details?: unknown,
    extra: { code?: string; retryAfter?: number; requestId?: string } = {}
  ) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = extra.code;
    this.retryAfter = extra.retryAfter;
    this.requestId = extra.requestId;
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  /** bearer "session" (default): marks the call authenticated — the CURRENT session token is sent. */
  token?: string | null;
  /** "explicit": send `token` exactly as given (never swapped, never refreshed). */
  bearer?: "session" | "explicit";
  headers?: Record<string, string>;
};

type SessionBridge = { getToken: () => string | null; refresh: () => Promise<string> };
type RawResponse = { status: number; ok: boolean; text: string; requestId: string; retryAfter?: number };

const TIMEOUT_MS = 15_000;
export const REFRESH_WINDOW_S = 60;
// Clock-skew guard: no proactive or forced refresh within 5 min of the last one (a device clock running ahead would
// otherwise refresh before every request). A server 401 on an API call still refreshes.
const MIN_REFRESH_GAP_MS = 5 * 60_000;
// observability §4.1: web has no marketing version or build — the short Vercel commit SHA (system env exposed).
const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev";

let bridge: SessionBridge | null = null;
let inflightRefresh: Promise<string> | null = null;
let lastRefreshAt = 0;
const neverSent = new WeakSet<object>();

export function setSessionBridge(next: SessionBridge | null): void {
  bridge = next;
}

export function currentSessionToken(): string | null {
  return bridge?.getToken() ?? null;
}

/** RFC 4122 v4: crypto.randomUUID where available (Safari 15.4+), else getRandomValues. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Retry-After → whole seconds within Int32 (Android's range); anything else (incl. an HTTP-date) → undefined. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isSafeInteger(n) && n <= 2147483647 ? n : undefined;
}

function markNeverSent(error: unknown): unknown {
  if (typeof error === "object" && error !== null) neverSent.add(error);
  return error;
}

/** True when the call failed before it ran on the server (its refresh failed before sending, or after a 401). */
export function wasNeverSent(error: unknown): boolean {
  return typeof error === "object" && error !== null && neverSent.has(error);
}

function coalescedRefresh(): Promise<string> {
  if (!inflightRefresh) {
    const run = bridge ? bridge.refresh() : Promise.reject(new ApiError("Not signed in", 401));
    inflightRefresh = run
      .then((token) => {
        lastRefreshAt = Date.now();
        return token;
      })
      .finally(() => {
        inflightRefresh = null;
      });
  }
  return inflightRefresh;
}

/** The current session token, refreshed first when it expires within 60 s. Also used by the SSE stream. */
export async function freshSessionToken(): Promise<string | null> {
  const current = currentSessionToken();
  if (!current || Date.now() - lastRefreshAt < MIN_REFRESH_GAP_MS || !expiresWithin(current, REFRESH_WINDOW_S)) {
    return current;
  }
  try {
    return await coalescedRefresh();
  } catch (error) {
    // The refresh failed but the session was kept (503 / offline / timeout): an unexpired token is still usable.
    if (currentSessionToken() === current && !isTokenExpired(current)) return current;
    throw error;
  }
}

/** Refresh now even if the token looks valid locally (the SSE stream can't see a 401) — at most once per 5 min. */
export async function forceSessionRefresh(): Promise<string | null> {
  const current = currentSessionToken();
  if (!current || Date.now() - lastRefreshAt < MIN_REFRESH_GAP_MS) return current;
  return coalescedRefresh();
}

function timeoutError(): Error {
  const error = new Error("Request timed out");
  error.name = "TimeoutError";
  return error;
}

// AbortSignal.timeout / AbortSignal.any are missing on older iOS Safari: one controller + setTimeout instead.
async function send(path: string, options: ApiRequestOptions, token: string | null): Promise<RawResponse> {
  const sentId = uuid();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-App-Platform": "web",
        "X-App-Version": APP_VERSION,
        "X-Request-Id": sentId,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    // polish-1: a real HTTP answer clears "proven offline" — never /app-config, which the browser may serve from its
    // 5-min HTTP cache (the connectivity probe fetches it with no-store itself).
    if (!path.startsWith("/app-config")) reportHttpResponse();
    const text = response.status === 204 ? "" : await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      requestId: response.headers.get("X-Request-Id") ?? sentId,
      retryAfter: parseRetryAfter(response.headers.get("Retry-After"))
    };
  } catch (error) {
    // polish-1: a network-error rejection (TypeError) proves offline; our own timeout abort never does.
    if (!timedOut && error instanceof TypeError) reportNoConnection();
    throw timedOut ? timeoutError() : error;
  } finally {
    clearTimeout(timer);
  }
}

function toResult<T>(raw: RawResponse): T {
  if (raw.ok) return (raw.text ? JSON.parse(raw.text) : {}) as T;
  let message = `Request failed (${raw.status})`;
  let details: unknown;
  let code: string | undefined;
  try {
    const data = JSON.parse(raw.text) as { error?: unknown; message?: unknown; rowErrors?: unknown; code?: unknown } | null;
    const text = data?.error || data?.message;
    if (typeof text === "string" && text) message = text;
    details = data?.rowErrors;
    if (typeof data?.code === "string") code = data.code;
  } catch {
    // non-JSON error body
  }
  throw new ApiError(message, raw.status, details, { code, retryAfter: raw.retryAfter, requestId: raw.requestId });
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const sessionCall = (options.bearer ?? "session") === "session" && !!options.token && bridge !== null;
  let sent: string | null;
  try {
    sent = sessionCall ? await freshSessionToken() : options.token ?? null;
  } catch (error) {
    throw markNeverSent(error);
  }
  const first = await send(path, options, sent);
  if (first.status !== 401 || !sessionCall || !sent) return toResult<T>(first);
  let retryToken: string;
  try {
    const latest = currentSessionToken();
    retryToken = latest && latest !== sent ? latest : await coalescedRefresh();
  } catch (error) {
    throw markNeverSent(error); // the 401 call never ran
  }
  // Never re-send account A's request with account B's token (a sign-in elsewhere changed the session meanwhile).
  if (tokenSubject(retryToken) !== tokenSubject(sent)) {
    throw markNeverSent(new ApiError(KIT_COPY.errors.signedOut, 401, undefined, { requestId: first.requestId }));
  }
  return toResult<T>(retryToken === sent ? first : await send(path, options, retryToken));
}
