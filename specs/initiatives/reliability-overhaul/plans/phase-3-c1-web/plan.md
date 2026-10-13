# Phase 3 track C1 — plan

# PLAN: Reliability Phase 3 client half, Track C1 (web): sessions, invites + SSE, auth events + identity headers, kit adoption, instant opens (rev 2)

**Brief accepted**: yes (28 files: 20 code files, of which 2 are new — `lib/events/client-events.ts` and `lib/cache/launch-cache.ts` — plus `apps/web/CONTEXT.md` and 7 web page SPECs. Both optional files, `GoogleSignInButton.tsx` and `lib/kit/app-error.ts`, are used.)

**Feature/version prediction** (the orchestrator applies these, per git-version step 3):
- frontend-kit v0.1.0 → v0.2.0 (MINOR): web adoption, and `app-error.ts` gains `credentialErrorMessage` plus typed `code`/`retryAfter`.
- observability v0.2.2 → v0.3.0 (MINOR): `consumed_by` gains web.
- auth v0.13.0 → v0.14.0 (MINOR): new behavior written down — shared client constants and the rule-6 401 clarification.
- notifications v0.4.0 → v0.5.0 (MINOR): §3.3 backoff values and the start-fetch rule.
- invites v0.2.0 → v0.2.1 (PATCH): web-adoption row; D-C8/F3 retired on web.
- 7 web page SPECs: MINOR bumps.
- If C2/C3 land the same bumps, the orchestrator folds them into one bump per feature.

**Surfaces in scope**: [web]. The file set does not overlap C2 or C3.
- Backend: none.
- Health sync: not on web (a browser has no HealthKit or Health Connect).
- Version gate / update banner: not on web (atomic deploys, no store binary — D-KIT-9; the gate never sends web a 426).

**Rev 2 changes vs. the adversary verdict**:
- #1 BLOCKING: the F3 card accept path is retired (step 17).
- #2: `/unacknowledged` is fetched again on every stream start, and a forced refresh runs after 3 failed opens (steps 3 and 16).
- #3: test S1 is rewritten.
- #4: `noRetry` is dropped (a 401 means the write never ran), the "never sent" errors are excluded from "couldn't confirm", and the same-password check is tied to the submitted value.
- #5: the two-tab refresh-token adoption guard is added, and `updateUser` replaces the snapshot `setSession` on profile save.
- #6: auth bumps to 0.14.0 and notifications to 0.5.0.
- #7: the first event flush moves after bootstrap; the TanStack signal is dropped and recorded as deferred; the not-awaited `/me` and the ~35 s worst case are documented.

**Line anchors**: line numbers are as of HEAD `962d14b`. Within each file, apply edits bottom-up. In C1-3, `programs/page.tsx` has already been shortened by C1-2, so locate those edits by the quoted content.

## Steps — backend
None. The live API already serves every contract below:
- CORS reflects request headers and exposes `Retry-After` and `X-Request-Id` (`apps/backend/server.js:55-68`).
- `/client-events` works without a login and never answers 401.
- `authSessionService.js:80-81` already expects "401 → refresh once → retry".

## Steps — web

### Commit C1-1: sessions + `auth.*` events + identity headers

**Step 1. `apps/web/src/lib/auth/jwt.ts`**: replace `isTokenExpired` (:28-32) with:
```ts
/** True when the token's `exp` is within `seconds` of now (or past). A token without `exp` never expires. */
export function expiresWithin(token: string, seconds: number): boolean {
  const decoded = decodeJwtPayload<DecodedAuthToken>(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 - Date.now() <= seconds * 1000;
}

export function isTokenExpired(token: string) {
  return expiresWithin(token, 0);
}

/** The Supabase auth user id (`sub`) — tells two stored sessions of the same account apart from another account's. */
export function tokenSubject(token: string): string | undefined {
  const sub = decodeJwtPayload<{ sub?: unknown }>(token)?.sub;
  return typeof sub === "string" && sub ? sub : undefined;
}
```

**Step 2. `apps/web/src/lib/auth/session.ts`**: this stays the one token store. `saveSession`, `clearSession` and the cookie helpers do not change.
- Add `import { decodeJwtPayload, resolveGlobalRole, type DecodedAuthToken } from "@/lib/auth/jwt";`.
- Move `hydrateSessionFromToken` verbatim from `auth-provider.tsx:170-188` into this file as an `export function`.
- Replace `loadSession` (:37-46) with:
```ts
export type StoredSession = { status: "absent" } | { status: "corrupt" } | { status: "ok"; session: SessionState };

/** "corrupt" = a stored value that is not a usable session (reported as token_store_unreadable). */
export function loadSession(): StoredSession {
  if (typeof window === "undefined") return { status: "absent" };
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: "absent" };
  }
  if (!raw) return { status: "absent" };
  try {
    const parsed = JSON.parse(raw) as Partial<SessionState> | null;
    if (!parsed || typeof parsed.token !== "string" || parsed.token.length === 0) return { status: "corrupt" };
    return {
      status: "ok",
      session: {
        token: parsed.token,
        refreshToken: typeof parsed.refreshToken === "string" && parsed.refreshToken ? parsed.refreshToken : undefined,
        user: parsed.user && typeof parsed.user === "object" ? parsed.user : {}
      }
    };
  } catch {
    return { status: "corrupt" };
  }
}
```

**Step 3. `apps/web/src/lib/api/client.ts`**: replace the whole file.
- This fixes the latent recovery-token bug: an explicit Bearer is never swapped or refresh-retried.
- The caller `signal` is deliberately absent: no fetcher passes TanStack's signal, and the fetchers are outside the brief. It is recorded as deferred.
```ts
import { API_BASE_URL } from "@/lib/config";
import { expiresWithin, isTokenExpired } from "@/lib/auth/jwt";

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
    const text = response.status === 204 ? "" : await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      requestId: response.headers.get("X-Request-Id") ?? sentId,
      retryAfter: parseRetryAfter(response.headers.get("Retry-After"))
    };
  } catch (error) {
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
  return toResult<T>(retryToken === sent ? first : await send(path, options, retryToken));
}
```

**Step 4. `apps/web/src/lib/kit/app-error.ts`**:
- (a) Replace `parseRetryAfter` (:112-118) with `export { parseRetryAfter } from "@/lib/api/client";`.
- (b) In `toAppError`, replace the defensive cast block (:133-143) with:
```ts
  if (error instanceof ApiError) {
    return fromHttp(
      error.status,
      error.code,
      error.retryAfter,
      error.message,
      Array.isArray(error.details) ? (error.details as BulkRowError[]) : undefined
    );
  }
```
- (c) Change the header comment's last line (:10) to read "...they show the ApiError's own server text — use `credentialErrorMessage`."
- (d) Append:
```ts
/**
 * Credential screens (scope rule above: login, sign-up, OAuth, link/unlink, set/change password, email re-auth):
 * a 4xx keeps the server's own text (401 = wrong credentials or an ended session there; 409 = the collision text);
 * offline, timeout, 408, 426, 429, 503 and other 5xx get the kit copy.
 */
export function credentialErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 426, 429].includes(error.status)) {
    return serverText(error.message) ?? toAppError(error).message;
  }
  return toAppError(error).message;
}
```

**Step 5. NEW `apps/web/src/lib/events/client-events.ts`** (observability §8):
```ts
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
```

**Step 6. `apps/web/src/lib/api/auth.ts`**:
- Line 1 becomes `import { ApiError, apiRequest, wasNeverSent } from "@/lib/api/client";`.
- In `completeSocialRegistration` (:81) and `resetPassword` (:118-122), add `bearer: "explicit"` to the options. `changePassword` and `setPassword` stay as they are.
- Replace `logout` (:97-102), `linkGoogle` (:158-164) and `unlinkProvider` (:166-171), and append the rest:
```ts
// /auth/logout ends THIS device's session only (auth §3.1). Explicit Bearer + refresh_token (either alone works);
// the caller ignores the outcome.
export async function logout(token: string, refreshToken?: string) {
  return apiRequest<{ message?: string }>("/auth/logout", {
    method: "POST",
    token,
    bearer: "explicit",
    body: refreshToken ? { refresh_token: refreshToken } : undefined
  });
}

// "Sign out everywhere" (auth §3.1): every session ends, this device's included. No body.
export async function logoutAll(token: string) {
  return apiRequest<{ message?: string }>("/auth/logout-all", { method: "POST", token });
}

// Link Google via the web custom-button auth `code`. refresh_token is no longer sent (ignored since 0.13.0, D-C14).
export async function linkGoogle(token: string, code: string) {
  return apiRequest<IdentitiesResponse>("/auth/link", { method: "POST", token, body: { provider: "google", code } });
}

export async function unlinkProvider(token: string, provider: string) {
  return apiRequest<IdentitiesResponse>("/auth/unlink", { method: "POST", token, body: { provider } });
}

// Copy shared 1:1 with iOS + Android (auth §3.1 rules 4 + 6; "Sign out everywhere").
export const AUTH_COPY = {
  passwordChanged: "Password updated. Your other devices will be signed out.",
  passwordSet: "Password set. Your other devices will be signed out.",
  passwordUnconfirmed:
    "We couldn't confirm your password change. It may have gone through, so try signing in with your new password.",
  signOutEverywhere: "Sign Out Everywhere",
  signOutEverywhereHint: "Signs you out on every device, including this one.",
  signOutEverywhereTitle: "Sign Out Everywhere?",
  signOutEverywhereBody: "You'll be signed out on all your devices, including this one.",
  signingOut: "Signing out..."
} as const;

const SAME_PASSWORD_ERROR = "New password must be different from your current password.";

/** Rule 6: the write was sent and its outcome is unknown (5xx / 408 / timeout / dropped connection). */
export function isPasswordWriteUnconfirmed(error: unknown): boolean {
  if (wasNeverSent(error)) return false;
  return error instanceof ApiError ? error.status >= 500 || error.status === 408 : true;
}

/** Rule 6: a manual retry of the same password answered with the same-password 400 = the earlier attempt landed. */
export function isSamePasswordError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.message === SAME_PASSWORD_ERROR;
}
```

**Step 7. `apps/web/src/lib/auth/auth-provider.tsx`**: replace the whole file (~235 lines; over the ~200 guide, accepted).
```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearSession,
  hydrateSessionFromToken,
  loadSession,
  saveSession,
  type SessionState,
  type SessionUser
} from "@/lib/auth/session";
import { clearActiveProgram } from "@/lib/storage";
import { expiresWithin, isTokenExpired, tokenSubject } from "@/lib/auth/jwt";
import { fetchMe, logout as apiLogout, logoutAll as apiLogoutAll, refreshSession as apiRefreshSession } from "@/lib/api/auth";
import { ApiError, REFRESH_WINDOW_S, setSessionBridge } from "@/lib/api/client";
import { KIT_COPY } from "@/lib/kit/copy";
import { failureProps, flushEvents, reportEvent, requestIdOf, startClientEvents } from "@/lib/events/client-events";

// Sessions client contract (auth SPEC §3.1; DESIGN_BOARD §2 client rules 1-6). One token store (session.ts); the HTTP
// client reads the token at send time through the bridge below and refreshes only when needed. Sign-out happens ONLY
// on /auth/refresh 401 session_invalid (or an unreadable store). 503 / 429 / 5xx / timeout / offline keep the session:
// one quick retry within 5 s, then back off. Every sign-out path runs teardown(). Bootstrap does NOT wait for /me
// (instant opens): pages render with the stored identity, which /me then heals.

type ForcedReason = "refresh_session_invalid" | "token_store_unreadable";
/** `?reason=` the auth guard puts on /login after a forced sign-out (login shows the kit's signedOut copy). */
export type SignOutReason = "expired" | null;

type AuthContextValue = {
  session: SessionState | null;
  /** A sign-in (login / sign-up / OAuth). */
  setSession: (session: SessionState | null) => void;
  /** Display-field edits (profile save) — tokens always come from the live session, never a React snapshot. */
  updateUser: (patch: Partial<SessionUser>) => void;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  signOutReason: SignOutReason;
  isBootstrapping: boolean;
};

const QUICK_RETRY_DEFAULT_S = 2;
const QUICK_RETRY_MAX_S = 5;
const REFRESH_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000];

const AuthContext = createContext<AuthContextValue | null>(null);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSessionState] = useState<SessionState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const generationRef = useRef(0); // +1 on every sign-in / sign-out, never on a refresh
  const failuresRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const lastRefreshErrorRef = useRef<unknown>(null);

  const store = useCallback((next: SessionState) => {
    saveSession(next);
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const resetRefreshState = () => {
    failuresRef.current = 0;
    backoffUntilRef.current = 0;
    lastRefreshErrorRef.current = null;
  };

  const teardown = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current = null; // before clear(): mounted queries see no token and stay disabled
    clearSession();
    clearActiveProgram();
    queryClient.clear();
    setSessionState(null);
    resetRefreshState();
  }, [queryClient]);

  const forceSignOut = useCallback((reason: ForcedReason, error?: unknown) => {
    const props: Record<string, unknown> = { reason };
    if (error instanceof ApiError) {
      props.status = error.status;
      if (error.code) props.code = error.code;
    }
    reportEvent("auth.forced_sign_out", props, requestIdOf(error));
    void flushEvents(sessionRef.current?.token); // captures the last token synchronously, before teardown drops it
    teardown();
    setSignOutReason("expired");
  }, [teardown]);

  // Server-authoritative identity (/auth/me, D-C7): heals a stale/missing session.user.id. Failures keep the session.
  const healIdentity = useCallback(async () => {
    const generation = generationRef.current;
    const start = sessionRef.current;
    if (!start) return;
    try {
      const me = await fetchMe(start.token);
      const current = sessionRef.current;
      if (!current || generationRef.current !== generation) return;
      store({
        ...current,
        user: {
          id: me.member_id ?? current.user.id,
          username: me.username ?? current.user.username,
          memberName: me.member_name ?? current.user.memberName,
          globalRole: me.global_role ?? current.user.globalRole
        }
      });
    } catch {
      // Keep the existing session; /me is retried on the next load.
    }
  }, [store]);

  const refreshWithPolicy = useCallback(async (): Promise<string> => {
    const start = sessionRef.current;
    if (!start?.refreshToken) {
      if (start) forceSignOut("token_store_unreadable");
      throw new ApiError(KIT_COPY.errors.signedOut, 401);
    }
    // Another tab shares this store and may already have rotated the refresh token: adopt its fresh pair instead of
    // replaying ours (a replay after Supabase's reuse window ends the session for every tab).
    const stored = loadSession();
    const sub = tokenSubject(start.token);
    if (
      stored.status === "ok" &&
      stored.session.refreshToken &&
      stored.session.refreshToken !== start.refreshToken &&
      sub !== undefined &&
      tokenSubject(stored.session.token) === sub &&
      !expiresWithin(stored.session.token, REFRESH_WINDOW_S)
    ) {
      const adopted = hydrateSessionFromToken({ ...stored.session, user: { ...start.user, ...stored.session.user } });
      sessionRef.current = adopted;
      setSessionState(adopted);
      resetRefreshState();
      return adopted.token;
    }
    if (Date.now() < backoffUntilRef.current) {
      throw lastRefreshErrorRef.current ?? new ApiError(KIT_COPY.errors.unavailable, 503);
    }
    const generation = generationRef.current;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await apiRefreshSession(start.refreshToken);
        if (generationRef.current !== generation) throw new ApiError(KIT_COPY.errors.signedOut, 401);
        const base = sessionRef.current ?? start;
        store(hydrateSessionFromToken({ ...base, token: res.token, refreshToken: res.refresh_token ?? start.refreshToken }));
        resetRefreshState();
        return res.token;
      } catch (error) {
        if (generationRef.current !== generation) throw error;
        if (error instanceof ApiError && error.status === 401 && error.code === "session_invalid") {
          forceSignOut("refresh_session_invalid", error);
          throw error;
        }
        reportEvent("auth.refresh_failed", failureProps(error, false), requestIdOf(error));
        lastRefreshErrorRef.current = error;
        if (attempt === 0) {
          const retryAfter = error instanceof ApiError ? error.retryAfter : undefined;
          await sleep(Math.min(retryAfter ?? QUICK_RETRY_DEFAULT_S, QUICK_RETRY_MAX_S) * 1000);
          if (generationRef.current !== generation) throw error;
          continue;
        }
        backoffUntilRef.current =
          Date.now() + REFRESH_BACKOFF_MS[Math.min(failuresRef.current, REFRESH_BACKOFF_MS.length - 1)];
        failuresRef.current += 1;
        throw error;
      }
    }
  }, [forceSignOut, store]);

  // Declared BEFORE the bootstrap effect (effects run in order), so bootstrap's /me already goes through the bridge.
  useEffect(() => {
    setSessionBridge({ getToken: () => sessionRef.current?.token ?? null, refresh: refreshWithPolicy });
    return () => setSessionBridge(null);
  }, [refreshWithPolicy]);

  useEffect(() => {
    const stored = loadSession();
    if (stored.status === "corrupt") {
      forceSignOut("token_store_unreadable");
    } else if (stored.status === "ok") {
      if (isTokenExpired(stored.session.token) && !stored.session.refreshToken) {
        forceSignOut("token_store_unreadable");
      } else {
        // An expired token is kept: the first request refreshes it, so a temporary failure never signs anyone out.
        generationRef.current += 1;
        store(hydrateSessionFromToken(stored.session));
        void healIdentity();
      }
    }
    setIsBootstrapping(false);
  }, [forceSignOut, store, healIdentity]);

  // After bootstrap, so events left by an earlier visit flush with the restored session's Bearer.
  useEffect(() => {
    if (isBootstrapping) return;
    return startClientEvents();
  }, [isBootstrapping]);

  const setSession = useCallback((next: SessionState | null) => {
    if (!next || isTokenExpired(next.token)) {
      teardown();
      return;
    }
    const hydrated = hydrateSessionFromToken(next);
    const previous = sessionRef.current;
    if (previous?.user.id && hydrated.user.id && previous.user.id !== hydrated.user.id) clearActiveProgram();
    generationRef.current += 1; // a sign-in: in-flight refreshes / /me of an earlier session are discarded
    resetRefreshState();
    store(hydrated);
    setSignOutReason(null);
    void healIdentity();
  }, [teardown, store, healIdentity]);

  const updateUser = useCallback((patch: Partial<SessionUser>) => {
    const current = sessionRef.current;
    if (current) store({ ...current, user: { ...current.user, ...patch } });
  }, [store]);

  // The user's own sign-out (rule 1): revoke THIS device's session (outcome ignored; fetch is already issued when
  // teardown runs), then the full teardown.
  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    if (current) void apiLogout(current.token, current.refreshToken).catch(() => undefined);
    teardown();
    setSignOutReason(null);
  }, [teardown]);

  // POST /auth/logout-all: every session ends, this one included → teardown on 200. Errors propagate (session kept).
  const signOutEverywhere = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    await apiLogoutAll(current.token);
    teardown();
    setSignOutReason(null);
  }, [teardown]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, setSession, updateUser, signOut, signOutEverywhere, signOutReason, isBootstrapping }),
    [session, setSession, updateUser, signOut, signOutEverywhere, signOutReason, isBootstrapping]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
```

**Step 8. `apps/web/src/lib/hooks/use-auth-guard.ts`**:
- :15 becomes `const { session, isBootstrapping, signOutReason } = useAuth();`.
- :19-23 become:
```ts
  useEffect(() => {
    if (!isBootstrapping && !session?.token) {
      router.push(signOutReason ? `/login?reason=${signOutReason}` : "/login");
    }
  }, [isBootstrapping, session?.token, signOutReason, router]);
```

**Step 9. `apps/web/src/components/GoogleSignInButton.tsx`**:
- Add the prop `onProviderError?: (code: string) => void;` with the JSDoc "GSI failed for a reason other than the user cancelling".
- After `codeClientRef` (:78), add `const onProviderErrorRef = useRef(onProviderError); onProviderErrorRef.current = onProviderError;` (a ref, so GSI isn't re-initialised).
- Replace `callback` (:92-94) with:
```ts
          callback: (response: { code?: string; error?: string }) => {
            if (response?.code) onCode(response.code);
            else if (response?.error && response.error !== "access_denied") onProviderErrorRef.current?.(response.error);
          },
          error_callback: (error: { type?: string }) => {
            if (error?.type !== "popup_closed") onProviderErrorRef.current?.(error?.type ?? "unknown");
          }
```

**Step 10. `apps/web/src/app/login/page.tsx`**:
- Add imports: `credentialErrorMessage` from `@/lib/kit/app-error`, `KIT_COPY` from `@/lib/kit/copy`, and `reportProviderFailure, reportSignInFailure` from `@/lib/events/client-events`.
- :40: `"Your session expired. Please sign in again."` becomes `KIT_COPY.errors.signedOut` (this settles OQ3).
- :85-88 catch body becomes `reportSignInFailure("password", error); setErrorMessage(credentialErrorMessage(error));`.
- :119-120 catch body becomes `reportSignInFailure("google", error); setErrorMessage(credentialErrorMessage(error));`.
- :214 becomes `<GoogleSignInButton onCode={handleGoogle} onProviderError={(code) => reportProviderFailure("google", code)} disabled={isLoading} />`.

**Step 11. `apps/web/src/app/create-account/page.tsx`**:
- Add the same imports as step 10, minus `KIT_COPY`.
- :170-171 catch becomes `reportSignInFailure("google", error); setErrorMessage(credentialErrorMessage(error));`.
- In `submitEmail` (:179-199):
  - add `let registered = false;` before the `try`;
  - add `registered = true;` after `await registerAccount({...});`;
  - the catch becomes `if (registered) reportSignInFailure("password", error); setErrorMessage(credentialErrorMessage(error));`.
- :213-214 catch becomes `reportSignInFailure("google", error); setErrorMessage(credentialErrorMessage(error));`.
- Add `onProviderError={(code) => reportProviderFailure("google", code)}` to its `<GoogleSignInButton>`.

**Step 12. `apps/web/src/app/program/password/page.tsx`**:
- :3 becomes `import { useMemo, useRef, useState } from "react";`.
- :5 becomes `import { AUTH_COPY, changePassword, isPasswordWriteUnconfirmed, isSamePasswordError } from "@/lib/api/auth";`.
- Add `import { credentialErrorMessage } from "@/lib/kit/app-error";`.
- Replace :37-47 with:
```ts
  // auth §3.1 rules 4 + 6: this device stays signed in; the others end at their next refresh. Re-sent only after a 401
  // (never ran — client.ts), never by TanStack (mutations retry:false). After a 5xx / timeout / dropped connection the
  // change may have landed: a manual retry of the SAME password answered with the same-password 400 counts as done.
  const unconfirmedRef = useRef<string | null>(null);
  const showChanged = () => {
    unconfirmedRef.current = null;
    setSuccessMessage(AUTH_COPY.passwordChanged);
    setNewPassword("");
    setConfirmPassword("");
  };

  const mutation = useMutation({
    mutationFn: (password: string) => changePassword(token, password),
    onSuccess: () => showChanged(),
    onError: (error, password) => {
      if (unconfirmedRef.current === password && isSamePasswordError(error)) return showChanged();
      if (isPasswordWriteUnconfirmed(error)) {
        unconfirmedRef.current = password;
        setErrorMessage(AUTH_COPY.passwordUnconfirmed);
        return;
      }
      setErrorMessage(credentialErrorMessage(error));
    }
  });
```
- :118 `mutation.mutate();` becomes `mutation.mutate(newPassword);`.

**Step 13. `apps/web/src/app/program/profile/page.tsx`** (bottom-up):
- After the Delete `ConfirmDialog` (:459), add:
```tsx
      <ConfirmDialog
        open={showSignOutAll}
        title={AUTH_COPY.signOutEverywhereTitle}
        description={AUTH_COPY.signOutEverywhereBody}
        confirmLabel={AUTH_COPY.signOutEverywhere}
        danger
        onConfirm={() => signOutAllMutation.mutate()}
        onClose={() => setShowSignOutAll(false)}
      />
```
- Before :434 (`{!isGlobalAdmin && (`), insert the block below. It is shown to every role and uses the existing outlined-button idiom.
```tsx
          <div className="border-t border-rf-border pt-4">
            <button
              type="button"
              disabled={signOutAllMutation.isPending}
              onClick={() => { setSignOutAllError(null); setShowSignOutAll(true); }}
              className="w-full rounded-2xl border border-rf-border px-4 py-3 text-sm font-semibold text-rf-text disabled:opacity-50"
            >
              {signOutAllMutation.isPending ? AUTH_COPY.signingOut : AUTH_COPY.signOutEverywhere}
            </button>
            <p className="mt-2 text-xs text-rf-text-muted">{AUTH_COPY.signOutEverywhereHint}</p>
            {signOutAllError && <p className="mt-2 text-sm font-semibold text-rf-danger">{signOutAllError}</p>}
          </div>
```
- After :431 (pwError line), add `{pwSuccess && <p className="text-sm font-semibold text-rf-success">{AUTH_COPY.passwordSet}</p>}`.
- Delete :427-429 (the "Sign out and back in…" hint).
- :419: `setPasswordMutation.mutate()` becomes `setPasswordMutation.mutate(newPassword)`.
- :397 onClick becomes `{ setShowPwForm((p) => !p); setPwError(null); setPwSuccess(false); setNewPassword(""); }`.
- :383 becomes `disabled={linkGoogleMutation.isPending}`.
- :374: drop `!hasRefreshToken || `.
- After `deleteMutation` (:184), add:
```ts
  const signOutAllMutation = useMutation({
    mutationFn: () => signOutEverywhere(),
    onSuccess: () => router.push("/login"),
    onError: (error) => setSignOutAllError(toAppError(error).message)
  });
```
- :182 becomes `setErrorMessage(toAppError(error).message);`.
- :171 becomes `setEmailError(credentialErrorMessage(error));`.
- :155 becomes `setErrorMessage(toAppError(error).message);`.
- Replace :145-151 (`setSession({...session, user: {...}})`) with `updateUser({ memberName: updatedName });`.
- Replace :87-103 with:
```ts
  const linkGoogleMutation = useMutation({
    mutationFn: (code: string) => linkGoogleApi(token, code),
    onSuccess: (data) => { setLinkError(null); applyIdentities(data); },
    onError: (e) => setLinkError(credentialErrorMessage(e))
  });

  const unlinkMutation = useMutation({
    mutationFn: (provider: string) => unlinkProviderApi(token, provider),
    onSuccess: (data) => { setLinkError(null); applyIdentities(data); },
    onError: (e) => setLinkError(credentialErrorMessage(e))
  });

  // auth §3.1 rules 4 + 6 (same handling as /program/password).
  const passwordSetDone = () => {
    pwUnconfirmedRef.current = null;
    setPwError(null);
    setShowPwForm(false);
    setNewPassword("");
    setPwSuccess(true);
  };

  const setPasswordMutation = useMutation({
    mutationFn: (password: string) => setPasswordApi(token, password),
    onSuccess: (data) => { passwordSetDone(); applyIdentities(data); },
    onError: (e, password) => {
      if (pwUnconfirmedRef.current === password && isSamePasswordError(e)) {
        passwordSetDone();
        void identitiesQuery.refetch();
        return;
      }
      if (isPasswordWriteUnconfirmed(e)) {
        pwUnconfirmedRef.current = password;
        setPwError(AUTH_COPY.passwordUnconfirmed);
        void identitiesQuery.refetch();
        return;
      }
      setPwError(credentialErrorMessage(e));
    }
  });
```
- Delete :71 (`hasRefreshToken`).
- After :63, add:
```ts
  const [pwSuccess, setPwSuccess] = useState(false);
  const pwUnconfirmedRef = useRef<string | null>(null);
  const [showSignOutAll, setShowSignOutAll] = useState(false);
  const [signOutAllError, setSignOutAllError] = useState<string | null>(null);
```
- :33 becomes `const { updateUser, signOut, signOutEverywhere } = useAuth();`.
- Imports:
  - :3 adds `useRef`;
  - the :7-15 import adds `AUTH_COPY, isPasswordWriteUnconfirmed, isSamePasswordError`;
  - add `import { credentialErrorMessage, toAppError } from "@/lib/kit/app-error";`.
- Delete keeps `signOut()`, which runs the full teardown. Its best-effort `/logout` always answers 200.

**Step 14. Checkpoint**: `cd apps/web && npm run build` must be green. Commit C1-1.

### Commit C1-2: invite inbox + SSE + F3 retirement

**Step 15. `apps/web/src/app/members/invite/page.tsx`**: add `import { toAppError } from "@/lib/kit/app-error";`. Replace the catch body (:38-44) with:
```ts
      // invites SPEC §3.1: "Invitation sent" only on 2xx; every other outcome goes through the kit (400 = server text).
      setErrorMessage(toAppError(error).message);
```

**Step 16. `apps/web/src/components/NotificationsGate.tsx`**:
- Add `import { forceSessionRefresh, freshSessionToken } from "@/lib/api/client";`.
- Delete `sourceRef` (:36).
- Above `export function NotificationsGate`, add:
```tsx
// SSE reconnect (notifications SPEC §3.3; values identical on iOS + Android): exponential backoff, full jitter.
const SSE_BASE_DELAY_MS = 1_000;
const SSE_MAX_DELAY_MS = 30_000;
const SSE_FAILURES_BEFORE_REFRESH = 3;

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
```
- In the component, after `queryClient` (:33), add `const visible = useDocumentVisible();`.
- Replace both effects (:131-179) with:
```tsx
  useEffect(() => {
    if (!shouldRun) {
      setQueue([]);
      idsRef.current.clear();
    }
  }, [shouldRun]);

  // Foreground-only stream (§3.3). /unacknowledged is fetched on every start (independent of the stream, so pending
  // modals still pop when it can't open) and on every `ready` (the stream never replays), merged by id. Every close or
  // error = reconnect with a fresh token (a deploy ends streams with a plain close; a 401 leaves EventSource CLOSED for
  // good). EventSource hides the status, so after 3 failed opens in a row one session refresh runs (rate-limited in
  // client.ts) in case the server already treats the token as expired. Re-created on every token change.
  useEffect(() => {
    if (!shouldRun || !visible) return;
    let cancelled = false;
    let attempt = 0;
    let failuresSinceReady = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | null = null;

    const fetchPending = () => {
      fetchUnacknowledgedNotifications(token)
        .then((items) => { if (!cancelled) addNotifications(items); })
        .catch(() => undefined);
    };

    const onNotification = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as NotificationItem;
        if (parsed?.id) addNotifications([parsed]);
      } catch {
        // ignore malformed events
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      failuresSinceReady += 1;
      if (failuresSinceReady === SSE_FAILURES_BEFORE_REFRESH) void forceSessionRefresh().catch(() => undefined);
      const cap = Math.min(SSE_MAX_DELAY_MS, SSE_BASE_DELAY_MS * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), Math.random() * cap);
    };

    async function connect() {
      const fresh = await freshSessionToken().catch(() => null);
      if (cancelled) return;
      if (!fresh) {
        scheduleReconnect();
        return;
      }
      const stream = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(fresh)}`);
      source = stream;
      stream.addEventListener("ready", () => {
        attempt = 0;
        failuresSinceReady = 0;
        fetchPending();
      });
      stream.addEventListener("notification", onNotification);
      stream.onerror = () => {
        stream.close();
        if (source === stream) source = null;
        scheduleReconnect();
      };
    }

    fetchPending();
    void connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [token, shouldRun, visible]);
```
- The `program.invite_received` invalidation (:93-96) stays.
- The file ends up at about 255 lines. That is accepted, to avoid adding a file outside the brief.

**Step 17. `apps/web/src/app/programs/page.tsx`**: retire the F3 card path (invites D-C8: it acts only on `invited`/`requested` membership rows, of which prod has 0 and nothing creates any — W2 E2). Edit bottom-up:
- :736-764: delete the whole `{(isInvited || isRequested) && ( … )}` Accept / Decline / "Cancel request" block plus the blank line after it, so `{canManage && (` follows the progress bar. The "Invitation pending" / "Request pending approval" status text (:719-727) stays.
- :688-690: delete `onAcceptInvite,`, `onDeclineInvite,` and `isUpdating,` from the `ProgramCard` destructure.
- :623-625: delete the same three fields from `ProgramCardProps`.
- :349-355: delete the `onAcceptInvite={…}`, `onDeclineInvite={…}` and `isUpdating={…}` props on `<ReorderableProgramRow>`.
- :104-109: replace `respondInviteMutation`'s `onSuccess` with:
```ts
    onSettled: async (_data, error, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["invites", isGlobalAdmin] });
      if (!error && variables.action === "accept") {
        await queryClient.invalidateQueries({ queryKey: ["programs"] });
      }
    }
```
- :77-91: delete `updateMembershipMutation`.
- :16: delete `updateMembership,` from the `@/lib/api/programs` import. `updateMembership` itself stays in `lib/api/programs.ts`; roles and members-detail still use it.

**Step 18. Checkpoint**: `npm run build` must be green. Commit C1-2.

### Commit C1-3: kit adoption + instant opens

**Step 19. NEW `apps/web/src/lib/cache/launch-cache.ts`**:
```ts
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

// Instant opens (DESIGN_BOARD §6.5, D-9): the last good response of the two launch screens (program picker + Summary),
// per member, in localStorage. Seeded into empty queries only once the member is known (after AuthProvider bootstrap —
// never during SSR/hydration), then refreshed by the normal query. Cleared by the sign-out teardown. Invites are
// never cached (a stale invite would 404 on accept). No new dependency.

const PREFIX = "rasi.fiters.cache.";
const SCHEMA_VERSION = 1; // bump when a cached response shape changes; other versions are ignored

type Entry = { v: number; savedAt: number; data: unknown };

const storageKey = (memberId: string, queryKey: QueryKey) => `${PREFIX}${memberId}:${JSON.stringify(queryKey)}`;

function read(memberId: string, queryKey: QueryKey): Entry | undefined {
  try {
    const raw = localStorage.getItem(storageKey(memberId, queryKey));
    const entry = raw ? (JSON.parse(raw) as Entry) : undefined;
    return entry && entry.v === SCHEMA_VERSION && typeof entry.savedAt === "number" && entry.data !== undefined
      ? entry
      : undefined;
  } catch {
    return undefined;
  }
}

function write(memberId: string, queryKey: QueryKey, data: unknown): void {
  try {
    localStorage.setItem(storageKey(memberId, queryKey), JSON.stringify({ v: SCHEMA_VERSION, savedAt: Date.now(), data }));
  } catch {
    // quota / disabled storage: skip
  }
}

/** queryFn wrapper: every successful network response is saved for the next open. */
export function cachedQueryFn<T>(memberId: string | undefined, queryKey: QueryKey, fetcher: () => Promise<T>) {
  return async (): Promise<T> => {
    const data = await fetcher();
    if (memberId) write(memberId, queryKey, data);
    return data;
  };
}

/** Seeds still-empty queries from the cache once the member is known. */
export function useLaunchSeed(memberId: string | undefined, queryKeys: QueryKey[]): void {
  const queryClient = useQueryClient();
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;
  const signature = JSON.stringify(queryKeys);
  useEffect(() => {
    if (!memberId) return;
    for (const queryKey of keysRef.current) {
      if (queryClient.getQueryData(queryKey) !== undefined) continue;
      const entry = read(memberId, queryKey);
      if (entry) queryClient.setQueryData<unknown>(queryKey, entry.data, { updatedAt: entry.savedAt });
    }
  }, [memberId, signature, queryClient]);
}

export function clearLaunchCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}
```

**Step 20. `apps/web/src/lib/auth/auth-provider.tsx`**: add `import { clearLaunchCache } from "@/lib/cache/launch-cache";`. In `teardown`, after `clearActiveProgram();`, add `clearLaunchCache();`. The events queue is deliberately left alone.

**Step 21. `apps/web/src/app/providers.tsx`**: replace the file.
```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { toAppError } from "@/lib/kit/app-error";

// frontend-kit §10 adoption: queries retry at most twice and only on a retryable kit kind (never a 4xx other than
// 408 / 429), honouring Retry-After; mutations never auto-retry (auth §3.1 rule 6 password writes included).
const MAX_QUERY_RETRIES = 2;

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  const appError = toAppError(error);
  const status = appError.status;
  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return appError.retryable;
}

function queryRetryDelay(attempt: number, error: unknown): number {
  const retryAfter = toAppError(error).retryAfter;
  return retryAfter !== undefined ? Math.min(retryAfter, 30) * 1000 : Math.min(1000 * 2 ** attempt, 30_000);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetryQuery, retryDelay: queryRetryDelay },
          mutations: { retry: false }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Step 22. `apps/web/src/app/shell.tsx`**:
- Add imports `FloatingBanner` from `@/components/kit/FloatingBanner` and `useOnlineStatus` from `@/lib/kit/use-online-status`.
- After `useDismissKeyboard();` (:12), add `const online = useOnlineStatus();`. It must come before the `/` early return.
- After `<NotificationsGate />` (:55), outside `<main>` and the `backdrop-blur` nav, add `{!online && <FloatingBanner variant="offline" />}`.

**Step 23. `apps/web/src/app/programs/page.tsx`** (content anchors; HEAD lines in parentheses):
- Add imports:
```ts
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import type { AppError } from "@/lib/kit/app-error";
import { fromQuery } from "@/lib/kit/async-state";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";
```
- After `const STATUS_OPTIONS = …` (:34), add `const PROGRAMS_KEY = ["programs"];`.
- Replace the `programsQuery` `useQuery` (:65-69) with:
```ts
  // Instant open (D-9): the picker list is seeded from the per-member launch cache after bootstrap, then refreshed.
  const programsQuery = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: cachedQueryFn(memberId, PROGRAMS_KEY, () => fetchPrograms(token ?? "")),
    enabled: !!token
  });
  useLaunchSeed(memberId, [PROGRAMS_KEY]);
```
- After the `invitesQuery` block, add:
```ts
  const programsState = fromQuery(programsQuery);
  const invitesState = fromQuery(invitesQuery);
  const online = useOnlineStatus();
```
- Right after the `visiblePrograms` derivation (:200), add `const programsLoaded = programsState.status === "loaded" || programsState.status === "stale";`.
- `{programsQuery.isLoading && (` (:296) becomes `{programsState.status === "loading" && (`.
- Replace the `{programsQuery.isError && ( … )}` block (:301-305) with `{programsState.status === "failed" && <ErrorView error={programsState.error} onRetry={() => void programsQuery.refetch()} />}`.
- Both `!programsQuery.isLoading &&` (:306, :312) become `programsLoaded &&`.
- After the closing `</PageShell>` of the main page (:367), add:
```tsx
      {programsState.status === "stale" && online && (
        <FloatingBanner variant="stale" onRetry={() => void programsQuery.refetch()} />
      )}
```
- On `<InvitesTab`:
  - `isLoading={invitesQuery.isLoading}` (:398) becomes `isLoading={invitesState.status === "loading"}`;
  - `errorMessage={invitesQuery.isError ? … : null}` (:400) becomes `error={invitesState.status === "failed" ? invitesState.error : null}` plus a new prop `onRetry={() => void invitesQuery.refetch()}`.
- In `function InvitesTab`:
  - the `errorMessage` param and its type (`errorMessage: string | null;`) become `error, onRetry` and `error: AppError | null; onRetry: () => void;`;
  - `if (errorMessage) { return <div …>{errorMessage}</div>; }` (:838-840) becomes `if (error) return <ErrorView error={error} onRetry={onRetry} />;`.

**Step 24. `apps/web/src/app/summary/page.tsx`**:
- Replace the `ErrorState` import (:38) with:
```ts
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { fromQuery } from "@/lib/kit/async-state";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";
```
- After :63 (`dataEntryLocked`), add:
```ts
  const memberId = session?.user.id;
  const online = useOnlineStatus();
  // Instant open (D-9): the 8 independent queries (already parallel) are seeded from the per-member launch cache after
  // bootstrap, then refreshed. Key VALUES are unchanged so the summary sub-pages keep sharing them.
  const keys = {
    analytics: ["summary", programId, summaryPeriod],
    mtd: ["summary", "mtdParticipation", programId],
    totalWorkouts: ["summary", "totalWorkouts", programId],
    totalDuration: ["summary", "totalDuration", programId],
    avgDuration: ["summary", "avgDuration", programId],
    timeline: ["summary", "timeline", programId, summaryPeriod],
    distribution: ["summary", "distribution", programId],
    workoutTypes: ["summary", "workoutTypes", programId]
  };
  useLaunchSeed(memberId, programId ? Object.values(keys) : []);
```
- In each of the 8 `useQuery` calls (:65-111), set `queryKey: keys.<name>` and `queryFn: cachedQueryFn(memberId, keys.<name>, () => <unchanged fetch call>)`. The `enabled` lines don't change. The pairs are:
  - analyticsQuery → analytics
  - mtdParticipationQuery → mtd
  - totalWorkoutsQuery → totalWorkouts
  - totalDurationQuery → totalDuration
  - avgDurationQuery → avgDuration
  - activityTimelineQuery → timeline
  - distributionQuery → distribution
  - workoutTypesQuery → workoutTypes
- After `workoutTypesQuery`, add:
```ts
  const summaryQueries = [analyticsQuery, mtdParticipationQuery, totalWorkoutsQuery, totalDurationQuery,
    avgDurationQuery, activityTimelineQuery, distributionQuery, workoutTypesQuery];
  const summaryStates = summaryQueries.map((query) => fromQuery<unknown>(query));
  const failedState = summaryStates.find((state) => state.status === "failed");
  const summaryError = failedState?.status === "failed" ? failedState.error : null;
  const summaryStale = summaryStates.some((state) => state.status === "stale");
  const retrySummary = () => summaryQueries.forEach((query) => { if (query.isError) void query.refetch(); });
```
- Replace :165-167 (the `ErrorState` block) with `{summaryError && <ErrorView error={summaryError} onRetry={retrySummary} />}`.
- :209 `: "Loading..."` becomes `: fromQuery(mtdParticipationQuery).status === "loading" ? "Loading..." : "—"`.
- Before `</PageShell>` (:280), add `{summaryStale && !summaryError && online && <FloatingBanner variant="stale" onRetry={retrySummary} />}`.

**Step 25. Checkpoint**: `npm run build` must be green. Commit C1-3.

### Commit C1-4: surface docs

**Step 26. Page SPECs** under `specs/pages/web/`. Each gets a header Version bump, new §9 rows and a §11 row dated 2026-10-13 that reads "Reliability Phase 3 C1 — <rows>".

- **`programs/SPEC.md`** 0.2.1 → **0.3.0**:
  - D-REL1 (kit states):
    - the loading view shows only while loading;
    - failed → ErrorView + Retry;
    - stale → floating "Couldn't refresh · Retry" banner, hidden while the global offline banner shows;
    - "No programs yet" shows only on loaded data;
    - the invites tab uses ErrorView, never a banner.
  - D-REL2 (instant open): `["programs"]` is seeded from the per-member launch cache after bootstrap, then refreshed. Invites stay live.
  - D-REL3: the inbox is refreshed after every `/invite-response` (onSettled).
  - D-REL4: the Sign Out row runs the auth teardown, which calls `/auth/logout` for this device only.
  - D-REL5 (F3 retired, invites D-C8):
    - the card Accept / Decline / "Cancel request" buttons and `updateMembership` are removed from this page;
    - an `invited`/`requested` card (none exist; nothing creates them) shows its status text, dimmed, with no actions;
    - invites are handled only through the Program Actions → My Invites inbox.
  - §6: drop the `updateMembership` row.
  - §7: the "invited / requested" row becomes "status text only; no actions (D-REL5)".
  - §8: rewrite the Loading, Error and Expired-token bullets.
- **`summary/SPEC.md`** 0.3.0 → **0.4.0**:
  - D-REL1: the first failed query that has no data → ErrorView with Retry (refetches the failed ones); any stale query → stale banner (offline wins); the MTD subtitle shows "Loading..." only while loading, else "—".
  - D-REL2 (instant open): all 8 queries are seeded per member + program; key values are unchanged.
  - Update §8.
- **`program/profile/SPEC.md`** 0.2.0 → **0.3.0**:
  - D-REL1: "Sign Out Everywhere" sits above Delete Account, for every role, using ConfirmDialog and the `AUTH_COPY` strings. It calls `POST /auth/logout-all`. On 200 → teardown → /login; on failure → the kit message in red under the button.
  - D-REL2: set-password follows rule 6 (a 401 is re-sent once after a refresh; unconfirmed only after a sent 5xx / 408 / timeout; a same-password 400 counts as done only for the same value) and shows the `passwordSet` copy.
  - D-REL3: link/unlink no longer send `refresh_token` (auth D-C14). The `hasRefreshToken` gate and its hint are removed.
  - D-REL4: credential calls use `credentialErrorMessage`; profile save and delete use the kit. Profile save updates only `user.memberName` via `updateUser`.
  - Update §4, §6 and §8.
- **`program/password/SPEC.md`** 0.1.0 → **0.2.0**:
  - D-REL1: success copy `AUTH_COPY.passwordChanged`; rule 6 as on the profile page; errors through `credentialErrorMessage`.
- **`members/invite/SPEC.md`** 0.1.0 → **0.2.0**:
  - D-REL1: the swallow is removed. "Invitation sent." shows only on 2xx; every other outcome shows the kit message (a 400 shows the server text).
  - Mark any §10 swallow entry as resolved, and update §8.
- **`login/SPEC.md`** 0.2.2 → **0.3.0**:
  - D-REL1: `auth.sign_in_failed` for the password and google paths, and for provider failures (GSI `error_callback` / callback error, excluding `popup_closed` / `access_denied`).
  - D-REL2: errors use `credentialErrorMessage`; a 503 gets the kit `unavailable` copy.
  - D-REL3: `?reason=expired` (also the forced sign-out redirect) shows the kit `signedOut` copy.
- **`create-account/SPEC.md`** 0.2.1 → **0.3.0**:
  - D-REL1: `auth.sign_in_failed` for the Google exchange, the post-register login and `oauth/complete`. A register failure is not reported.
  - D-REL2: errors use `credentialErrorMessage`.

**Step 27. `apps/web/CONTEXT.md`**: replace the "## Auth (client side)" bullets with:
- **One token store**: localStorage `rasi.fiters.session`, plus the non-HttpOnly cookie mirror `rasi.fiters.token` for `middleware.ts`. `saveSession`/`clearSession` keep them in sync.
- **Sessions** (`lib/api/client.ts` + `lib/auth/auth-provider.tsx`; auth §3.1):
  - Requests read the current token through the session bridge.
  - A refresh runs when the token expires within 60 s (with a 5-min clock-skew guard) or on a 401, and is coalesced. Before refreshing, a newer same-account pair in localStorage (written by another tab) is adopted instead.
  - A 401 sent with an outdated token retries with the current one. An explicit Bearer (recovery, pending sign-up, logout, events) is never swapped.
  - Sign-out happens only on refresh `401 session_invalid` or an unreadable store. Other failures get a quick retry ≤ 5 s, then 30/60/120/300 s backoff. Worst case, a request waiting on a failing refresh takes ~35 s before failing (15 + 5 + 15); during backoff it fails at once.
  - Bootstrap doesn't wait for `/auth/me`: pages render with the stored identity, and `/me` heals it.
  - Teardown:
    - `/logout` for this device only;
    - clear the store, the active program and the launch cache;
    - `queryClient.clear()`;
    - the SSE stops.
  - "Sign out everywhere" lives in My Profile.
  - Profile edits use `updateUser`.
- **Every request**:
  - 15 s timeout;
  - `X-App-Platform: web`;
  - `X-App-Version` = the short Vercel commit SHA (`dev` locally);
  - a fresh `X-Request-Id`;
  - `ApiError` carries `code`/`retryAfter`/`requestId`.
- **TanStack's abort `signal` is not wired** (the fetchers don't take one). It is deferred.
- **Events** (`lib/events/client-events.ts`): the `auth.*` queue survives sign-out and first flushes after bootstrap.
- **Instant opens** (`lib/cache/launch-cache.ts`): picker + Summary; per member; schema v1.
- **SSE** (`NotificationsGate`):
  - foreground only;
  - fetches `/unacknowledged` on every start and every `ready`;
  - backoff 1 s ×2, capped at 30 s, full jitter;
  - one forced refresh after 3 failed opens.
- **Kit adoption scope**:
  - QueryClient defaults;
  - the global offline banner (`shell.tsx`);
  - `/programs`, `/summary`, `/program/profile`, `/program/password`, `/members/invite`, `/login`, `/create-account`.
- No health sync and no version gate on web.

## Steps — ios
None (Track C2).

## Steps — android
None (Track C3).

## Endgame

**Step 28. Compile check**:
- Run `cd apps/web && npm run build` after steps 14, 18 and 25.
- There is no ESLint config in `apps/web`: `next lint` would launch an interactive setup, so don't run it. The `next build` type check is the gate.
- After the final build, `rm -rf apps/web/.next`.
- iOS/Android are not touched by this track. All visual and live testing is the user's (checklist below).

**Step 29. Migration**: none. `app_events` rows arrive through the live `POST /api/client-events`.

**Step 30. git-version**:
- Four commits, C1-1 … C1-4. The SPEC bumps and tags happen when the orchestrator applies "Docs for the orchestrator": frontend-kit 0.2.0, observability 0.3.0, auth 0.14.0, notifications 0.5.0, invites 0.2.1, plus the 7 page-SPEC MINOR bumps.
- Tag each feature on `main` only after cherry-picking, and push tags by name.
- Web deploy:
  1. After the push, run `vercel ls`.
  2. Fall back to `vercel --prod --yes --scope personal-vinayak` from the repo root.
  3. Verify on the apex `rasifiters.com`.

## User test checklist (desktop Chrome + iPhone Safari)

**Staging first, opt-in** (ENV_RUNBOOK §Staging): `+stg` accounts on the Vercel `staging` preview. Open the `rasifiters-api-staging` health URL first to wake the free instance.

- **S1. A refresh failure keeps the session.**
  1. Sign in and open `/programs` (the list loads and is cached).
  2. DevTools → Network → Request blocking: add `*auth/refresh*`.
  3. DevTools → Application → Local Storage → `rasi.fiters.session`: set `"token"` to `x.eyJleHAiOjF9.x`, then reload (online).
  4. Expect: still signed in, the cached list shows instantly, and after ~5 s "Couldn't refresh · Retry" floats above the bottom; no /login.
  5. Remove the block, wait ~30 s (backoff), press Retry → the list refreshes.
- **S1b. Offline banner.** DevTools Network → Offline → "You're offline" floats on any page; back Online → it's gone. Don't reload while offline: there is no service worker, so the browser would show its own offline page.
- **S2. Sign Out Everywhere.**
  1. Sign in to the same account in Chrome (A) and an Incognito window (B).
  2. B: My Profile → Sign Out Everywhere → confirm → /login.
  3. A: do the S1 step-3 token edit and reload → /login with "Your session has ended. Please sign in again."
- **S3. Change password.** On A, change the password → "Password updated. Your other devices will be signed out." A stays signed in; B, after the token edit and a reload, is forced out.
- **S4. Recovery-link fix.** While signed in, open an already-used reset-password link → it says the link expired, and your current password still works.
- Claude then checks `app_events` on staging (read-only) for `auth.forced_sign_out` / `auth.refresh_failed` rows with `platform='web'`.

**Prod.**
- **P1.** Sign in → `/programs`. Reload: the list appears instantly, then refreshes. Open a program: on the second visit the Summary cards appear instantly.
- **P2.** Block `*/api/programs` → reload: the cached list plus the stale banner. It must fit on mobile and desktop and stay clear of the FABs. Sign out and back in with the block still on → "Couldn't load this" + Retry.
- **P3.** A wrong password shows "Invalid credentials", and an `auth.sign_in_failed` row with `kind: wrong_credentials` appears.
- **P4.** Every API request shows `X-App-Platform: web`, `X-App-Version: <7-char sha>` and `X-Request-Id`. If it shows `dev` after a manual CLI deploy, report it.
- **P5.** An admin browser invites the member browser's username → the member's modal pops. With the member tab in the background during the invite, switching back pops it. Program Actions → My Invites updates after Accept/Decline.
- **P6.** Invite page: an unknown username → "Invitation sent."; offline → the kit offline message (no false "sent").
- **P7.** Sign Out from the account modal → /login; signing back in works.
- **P8.** Profile: link/unlink Google still works. Saving the name keeps you signed in.
- **P9.** Program cards look unchanged (the retired Accept/Decline only ever showed on invited/requested cards, and none exist).

## Docs for the orchestrator

**auth SPEC → 0.14.0.**
- §11 row: web client adopts §3.1.
- New D-rule with the client constants C2/C3 must mirror:
  - proactive refresh window 60 s;
  - skew guard: no proactive or forced refresh within 5 min of the last one;
  - quick retry = `Retry-After` capped at 5 s (default 2 s);
  - backoff 30/60/120/300 s;
  - forced sign-out copy = the kit `signedOut` string;
  - the `AUTH_COPY` strings (step 6);
  - "Sign Out Everywhere" in My Profile above Delete Account, for all roles.
- Rule 6 clarification: a `401` on `/change-password` or `/set-password` means the write never ran (middleware or GoTrue rejected it; `authSessionService.js:80-81`), so one refresh + one re-send is allowed. "Couldn't confirm" applies only after a SENT request got 5xx / 408 / timeout / network. The same-password 400 counts as done only for the same password value.
- Web-only idiom: shared localStorage → before refreshing, adopt a newer same-`sub` pair from storage. Not applicable on mobile.

**notifications SPEC → 0.5.0.** §3.3 gets:
- backoff base 1 s, ×2, cap 30 s, full jitter, attempt reset on `ready`;
- `/unacknowledged` fetched on every stream start and every `ready`;
- one session refresh after 3 consecutive failed opens (rate-limited to once per 5 min);
- web foreground = `document.visibilityState`;
- a §11 row.

**invites SPEC → 0.2.1.** §11 row:
- web swallow removed;
- inbox refetch `onSettled`;
- D-C8/F3 done on web: card Accept/Decline/"Cancel request" retired in C1.

Mark F3 as "Retired (web, C1)".

**observability SPEC → 0.3.0.**
- `consumed_by` += web (header, D-REF, `registry.json`).
- D-rule: web `X-App-Version` = 7-char `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, else `dev`; no `X-App-Build`.
- §11 row.

**frontend-kit SPEC → 0.2.0.**
- §10 web items done: QueryClient defaults, 15 s timeout, launch cache (schema v1, per member, cleared on teardown, picker = programs only), offline banner.
- §10 deferral: the TanStack `signal` is not combined on web (fetchers don't take one).
- New D-rule: credential screens show the server text for 4xx and the kit copy otherwise (`credentialErrorMessage`); C2/C3 mirror it.
- `parseRetryAfter` now lives in `client.ts`, re-exported from `app-error.ts`.
- Status: built → deployed once all surfaces ship.
- §11 row.

**`registry.json` + `REGISTRY.md`**: the versions above; observability `consumed_by`; frontend-kit status.

**`specs/pages/REGISTRY.md`**: programs 0.3.0, summary 0.4.0, program/profile 0.3.0, program/password 0.2.0, members/invite 0.2.0, login 0.3.0, create-account 0.3.0.

**PROGRESS.md / HANDOFF.md / BRIEF §7**: C1 status. **RELEASES.md**: nothing (web has no store channel).

## Risks the implementer must watch

- **Parity constants are fixed here.** C2/C3 must use identical values for:
  - SSE backoff and the 3-failure refresh;
  - refresh retry/backoff, the 60 s window and the 5-min guard;
  - `AUTH_COPY` and the forced sign-out copy;
  - the credential-message rule and the rule-6 401 clarification;
  - the event `kind` mapping;
  - the cache scope (programs only, invites live).

  The orchestrator reconciles if a mobile plan differs.
- **Refresh replay.** No background timer ever replays a refresh. After backoff, the next request re-sends the same refresh token. If Supabase rotated it on the failed call, the result is `session_invalid` → a correct sign-out.
- **Two tabs.** Adoption only takes a same-`sub`, unexpired pair from storage. If another tab signed out (store empty), this tab's refresh hits `session_invalid` and reports `auth.forced_sign_out`. That is expected.
- **`auth.forced_sign_out` attribution.** Rows often arrive with `member_id = null` because the token has expired by then. This is a design note, not a backend change.
- **Teardown order.** `sessionRef = null` must come before `queryClient.clear()`. The cache is read only in `useLaunchSeed`'s effect, never in render or `initialData` (no hydration mismatch).
- **Offline wins.** Pages hide their stale banner while `!online`.
- **Old Safari.** Don't use `AbortSignal.any`/`timeout`. `uuid()` falls back to `getRandomValues`.
- **Cross-origin.** Header reads rely on the live CORS config. Don't add `credentials` or origins.
- **Deliberate additions.** Two are called out:
  - The "Sign Out Everywhere" row on My Profile, mandated by auth §3.1. It uses the existing outlined-button idiom; nothing else on the page is restyled.
  - The F3 card-button removal, mandated by invites D-C8. It is invisible in prod.
- **File sizes.** `auth-provider.tsx` (~235 lines) and `NotificationsGate.tsx` (~255) go over ~200; accepted, to stay inside the brief.
- **Recovery-link fix.** Verify with S4.
- **Backend changes needed**: none.

## Approval amendments

Apply [`../phase-3-client-amendments.md`](../phase-3-client-amendments.md) on top of this plan (user decisions, shared rules,
health-sync rules and this track's fixes). Where they disagree, the amendments win.
