# Phase 2 track D — plan

# PLAN: Reliability overhaul Phase 2, track D. Frontend kits on web, iOS and Android (new modules only, no adoption). Revision 2

**Brief accepted**: yes. The brief lists 24 files: web 6, iOS 7, Android 8 (7 new plus the manifest), and 3 optional CONTEXT pointers. Resolving open question 1 adds `specs/features/frontend-kit/SPEC.md`, written before fan-out, plus `registry.json` and `REGISTRY.md`. The orchestrator edits the two registry files only inside the git-version step (step 29), after any other track's registry commit (fixes adversary objection 1).

**Feature/version prediction**: `frontend-kit` (new) goes from none to v0.1.0. The git-version rule is "new feature → v0.1.0". No existing feature is bumped, because no kit path matches any `reference_impl` and no page SPEC is touched.

**Surfaces in scope**: [web, ios, android]. Backend has none. The three D file sets are disjoint from each other. Track B edits files inside the same `apps/web`, `apps/ios` and `apps/android` trees and runs its own builds, so **each D implementer runs with `isolation: "worktree"`** (HANDOFF item 3; objection 5). Implementers must **not commit** in the worktree. The orchestrator merges them in step 23.

### Answers to the brief's open questions (binding on implementers)
1. **Canonical home.** `specs/features/frontend-kit/SPEC.md` plus a registry entry (v0.1.0, status `built`). The SPEC §3 copy table is the source of truth.
2. **Error kinds.** There are 11: the board's 9, plus `updateRequired` (426) and `unavailable` (429/503, which carries `retryAfter`).
   - The status decides the kind. `code` is carried but never decides it.
   - A plain 401 maps to signedOut **for display only**. The kit never signs anyone out.
   - Errors that carry `rowErrors` keep the server text and the rows (objection 7).
   - The existing iOS "You're offline…" alert stays until Phase 3.
3. **Capturing `code` and `Retry-After` is deferred** to Phase 3 sessions.
   - Each surface exposes a pure `fromHttp`.
   - Web reads `code`/`retryAfter` defensively.
   - Android reads `Retry-After` from the `HttpException` headers.
   - iOS `APIError` has no status, so it maps to unknown.
4. **Deferred to adoption**: skeleton, empty view, toast and pull-to-refresh.
5. **There is no web update-available variant** (D-KIT-9). The strings still exist in `copy.ts`.
6. **426 uses the kit's own platform-neutral copy.** Track C only needs to send status 426.

## Steps — docs (orchestrator, before fan-out; new directory only)

1. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/frontend-kit/SPEC.md`
````markdown
# Feature: `frontend-kit` — shared loading / error / offline / banner kit (web + iOS + Android)

> **Status:** 🏗️ built (kits compile on all three; **no screen adopts them yet**) · **Version:** 0.1.0 ·
> **Apps (`consumed_by`):** `web` `ios` `android`
> **Provenance:** net-new — reliability overhaul Phase 2 track D. Contract = [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md)
> §6 (W7) + W7-D1 (one palette = web's) + W7-D2 (keep data + "Couldn't refresh — Retry"); evidence =
> [`discovery/W7-frontend-consistency.md`](../../initiatives/reliability-overhaul/discovery/W7-frontend-consistency.md).
> **Depends on:** nothing (it *labels* the [`auth`](../auth/SPEC.md) 0.10.0 envelope — `401 session_invalid`,
> `503 auth_unavailable` + `Retry-After` — but imports no feature code). **Reference impl:** web
> `src/lib/kit/` + `src/components/kit/`.

---

## 1. What it is
One small, self-contained kit per surface: a five-state async model, one error vocabulary with one human
message per kind, a connectivity monitor, a floating banner (offline / stale / error / update-available), an
error-with-no-data view, and the shared palette tokens. Phase 2 ships the kits only; screens adopt them in
reliability Phase 3 ("kit adoption on touched screens").

## 2. Why it exists
Today an error looks like "no data" on all three surfaces, spinners never end, raw server / OS text reaches
users, nothing retries and nothing knows it is offline (W7 §1–§4). One kit per surface, with identical states,
kinds and copy, makes every screen handle loading / error / offline the same way.

## 3. Copy table (canonical — web `copy.ts`, iOS `KitCopy.swift`, Android `KitCopy.kt` mirror it verbatim)
| Key | String |
|---|---|
| retry | `Retry` |
| update | `Update` |
| dismiss | `Dismiss` |
| bannerOffline | `You're offline` |
| bannerStale | `Couldn't refresh` |
| bannerUpdate | `A new version of RaSi Fiters is available` |
| errorViewTitle | `Couldn't load this` |
| offline | `Can't connect. Check your internet connection and try again.` |
| timeout | `This is taking longer than usual. Try again.` |
| signedOut | `Your session has ended. Please sign in again.` |
| forbidden | `You don't have access to this.` |
| notFound | `We couldn't find that. It may have been removed.` |
| conflict | `That conflicts with something already saved. Refresh and try again.` |
| invalidInput | `Some details aren't valid. Check them and try again.` |
| updateRequired | `This version of RaSi Fiters is no longer supported. Please update the app.` |
| unavailable | `RaSi Fiters is busy right now. Try again in a moment.` |
| server | `Something went wrong on our end. Try again.` |
| unknown | `Something went wrong. Try again.` |

ASCII apostrophes only. Banner strings carry no trailing period.

## 4. Error vocabulary
| Kind | From | Retryable |
|---|---|---|
| offline | transport failure — web `TypeError` with a network message (`Failed to fetch` / `Load failed` / `NetworkError…` / `Network request failed`); iOS any `URLError` except `.timedOut` / `.cancelled`; Android any `IOException` except `InterruptedIOException` | yes |
| timeout | 408; web `TimeoutError` / `AbortError`; iOS `URLError.timedOut`; Android `InterruptedIOException` (incl. `SocketTimeoutException`) | yes |
| signedOut | 401 (with or without `code:"session_invalid"`) — **display only** | no |
| forbidden | 403 | no |
| notFound | 404 | no |
| conflict | 409 | no |
| invalidInput | 400, 422; iOS `APIClient.BulkWorkoutError` **with** rowErrors (no status until Phase 3) | no |
| updateRequired | 426 (server text ignored — platform-neutral copy) | no |
| unavailable | 429, 503 (incl. `auth_unavailable`); carries `retryAfter` | yes |
| server | any other 5xx | yes |
| unknown | other statuses, decoding errors (`DecodingError` / `SerializationException`), iOS `APIError` and `BulkWorkoutError` without rowErrors (no status until Phase 3), anything else | yes |
| *(not an error)* | cancellation — iOS `AppError(_:)` returns `nil` for `CancellationError` / `URLError.cancelled`; Android rethrows `CancellationException`; web: TanStack swallows its own cancellations | — |

Rules: the **status decides the kind**; `code` is carried, never decisive. The message is the kind's copy,
except the server's own text is shown (unless empty or the generic `Request failed (N)`) for **invalidInput**
and for **any error carrying `rowErrors`** (the batch log endpoints' 400 / 409); `rowErrors` is carried for
row highlighting (web `BulkRowError[]`, iOS `[APIClient.BulkRowError]`, Android `List<BulkRowError>`).
`retryAfter` = whole non-negative seconds from `Retry-After` (an HTTP-date → none). The kit **never signs
anyone out** — sign-out policy is the sessions contract (DESIGN_BOARD §2 client rule 3).

## 5. Async state + connectivity
| State | Carries | Meaning | UI at adoption |
|---|---|---|---|
| idle | — | not requested (e.g. a disabled query) | nothing |
| loading | — | first load, no data yet | loading view |
| loaded | data, fetchedAt, refreshing | good data (`refreshing` = reload in flight) | content ("empty" is a view decision on loaded data) |
| failed | error | load failed, no data | ErrorView (+ Retry) |
| stale | data, fetchedAt, error | reload failed, last good data kept | content + stale banner (W7-D2) |

Transitions (same on all three): `fresh(data)` → loaded now; `refreshing()` → loaded/stale keep data with
`refreshing = true`, else loading; `failing(error)` → loaded/stale become stale, else failed. Web derives the
state from TanStack v5 with `fromQuery`, matching the transitions: data + error + not fetching → stale ·
data → loaded (refreshing = isFetching — a Retry from stale shows loaded-refreshing, exactly like
`refreshing()`) · error → failed · paused with no data → failed(offline) (never an endless spinner) ·
pending + not fetching → idle · else loading.
Connectivity is link-level everywhere (D-KIT-7): web `navigator.onLine` + `online`/`offline` events; iOS
`NWPathMonitor` `.satisfied`; Android default network has `NET_CAPABILITY_INTERNET`. One monitor per app,
started once at adoption.

## 6. Banner + error view
| Variant | Dot | Text | Action |
|---|---|---|---|
| offline | warning | bannerOffline | none |
| stale | warning | bannerStale | Retry (if handler) |
| error | danger | the AppError message | Retry (if handler **and** retryable) |
| update-available (iOS + Android only) | accent | bannerUpdate | Update (if handler) |

Every variant shows a dismiss × when a dismiss handler is given. Chrome: neutral surface + 1px border + soft
shadow, 8pt status dot, accent action text, max 520 wide, min height 52, tap targets ≥ 44pt / 48dp.
**Placement + clearance (D-KIT-8):** bottom, above the tab bar / bottom nav, never in a header, **never over
bottom-anchored controls**.
- Web bakes the clearance in: fixed, `bottom = nav offset + 7.5rem` clears the pill nav and the `/programs`
  mobile FAB stack on every page; z-40 = over in-page z-30 cards, under modals / menus (z-50+).
- iOS `.floatingBanner(bottomInset:) { … }` and Android `FloatingBanner(…, bottomInset =)` float 12pt/dp above
  the screen's bottom safe edge **plus `bottomInset`**. A screen with bottom-anchored floating actions passes
  `bottomInset` = its action stack height + bottom offset (program picker: iOS `150` = 56+14+56+24; Android
  `146.dp` = 56+14+56+20). Android screens outside AppScaffold (edge-to-edge, e.g. the program picker) also
  pass `Modifier.navigationBarsPadding()`; inside AppScaffold the innerPadding already clears the
  NavigationBar.

ErrorView = `errorViewTitle` + the message + a Retry pill (only if a handler is given and retryable).
Adoption recipe — web: `const s = fromQuery(q)`; `failed` → `<ErrorView error={s.error} onRetry={() => q.refetch()} />`;
`stale` → `<FloatingBanner variant="stale" onRetry={() => q.refetch()} />`. iOS: screen root
`.floatingBanner { if case .stale = state { FloatingBanner(variant: .stale, onRetry: reload) } }`. Android, inside
the screen's `Box`: `FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = ::reload)`.

## 7. Palette tokens (= web rf-*, light / dark)
| Token | Light | Dark |
|---|---|---|
| accent | `#ff8b1f` | `#ff9c3a` |
| accentStrong | `#ff7a00` | `#ff8b1f` |
| danger | `#ef4444` | `#f87171` |
| success | `#2fb861` | `#36c56f` |
| warning | `#f59e0b` | `#fbbf24` |
| info | `#2563eb` | `#60a5fa` |
Web: the existing `rf-*` tokens (unchanged). iOS: `Color.rfAccent` … `Color.rfInfo`. Android: `rfPalette()`.

## 8. Files per surface
- **web:** `src/lib/kit/{copy,app-error,async-state,use-online-status}.ts`, `src/components/kit/{FloatingBanner,ErrorView}.tsx`
- **ios:** `Shared/Kit/{KitCopy,AppError,LoadState,NetworkMonitor,FloatingBanner,ErrorStateView}.swift`, `Shared/Theme/AppPalette.swift`
- **android:** `core/kit/{KitCopy,AppError,UiState,ConnectivityObserver}.kt`, `ui/components/kit/{FloatingBanner,ErrorView}.kt`,
  `core/theme/Palette.kt`; `AndroidManifest.xml` declares `ACCESS_NETWORK_STATE`

## 9. Decisions made
- **D-KIT-1 Kits only, no adoption (0.1.0).** No existing screen, component or token changes. Web
  `components/ui/{ErrorState,LoadingState,EmptyState}`, iOS `appOrange`/`appRed`, Android `AppOrange` / M3
  `primary` are untouched. Adoption = reliability Phase 3, on touched screens (net-new UI must not restyle pages).
- **D-KIT-2 One copy table.** §3 is canonical; the three copy files mirror it verbatim; any copy change edits
  all three + §3 in one commit.
- **D-KIT-3 Vocabulary.** Board §6.3's nine kinds + `updateRequired` (426) + `unavailable` (429/503 with
  `retryAfter`). Status decides the kind; `code` is informational; raw server text only for invalidInput and
  for errors carrying `rowErrors` (W7 §7.2 `validation(rowErrors)`), which are carried for row highlighting.
- **D-KIT-4 Transport + cancellation.** Any transport failure → offline, transport timeout → timeout,
  decoding → unknown. Cancellation is not an error (iOS `nil`, Android rethrow, web TanStack-internal).
- **D-KIT-5 Capture deferred.** `code` / `Retry-After` capture in `client.ts` / `APIClient.swift` /
  `ApiException.kt` lands with Phase 3 sessions. Until then web reads them defensively, Android reads
  `Retry-After` from `HttpException`, iOS `APIError` (no status) → unknown, and iOS `BulkWorkoutError` → invalidInput
  with rowErrors / unknown without (a batch 409 is `conflict` on web/Android, `invalidInput` on iOS — same
  server text, both non-retryable; the gap closes when Phase 3 gives iOS errors a status).
- **D-KIT-6 Five states** (§5); "empty" is a view decision; W7-D2 is encoded in `failing()`; web `fromQuery`
  follows the same transitions (a retry in flight is loaded-refreshing, not stale).
- **D-KIT-7 Link-level connectivity on all three** (Android: `NET_CAPABILITY_INTERNET`, NOT `VALIDATED`) so
  the offline banner means the same thing everywhere and never false-alarms on networks that fail Android's
  validation; a reachable-but-failing server surfaces through the vocabulary instead.
- **D-KIT-8 Bottom floating banner, max 520, min height 52, tap targets ≥ 44/48, never over bottom controls**
  (§6 clearance rule). Web: fixed, `bottom: calc(max(1.5rem, safe-area-bottom) + 7.5rem)`, z-40. iOS
  `.floatingBanner(bottomInset:)` inside `adaptiveColumn(max: formMaxWidth)`. Android `bottomInset` +
  `Modifier.align(Alignment.BottomCenter)` (+ `navigationBarsPadding()` outside AppScaffold). Retry only with a
  handler (and, for errors, only if retryable).
- **D-KIT-9 Update-available = iOS + Android only.** Web has no store binary and deploys atomically. Trigger
  (`app-config` latest version) + once-per-version dismissal = Phase 3 version gate.
- **D-KIT-10 Palette = web's** (§7) as NEW tokens; repointing existing brand colors is a Phase 3 restyle.
  Android `rfPalette()` reads the active colorScheme's background luminance so the in-app Appearance
  override wins over the system setting.
- **D-KIT-11 Platform idiom (the only sanctioned divergences).** Copy as TS / Swift / Kotlin constants (the
  apps use no string resources); AppError = TS plain object / Swift `Error` / Kotlin data class; dismiss
  glyph × / `xmark` / `Icons.Filled.Close`; ErrorView chrome = web glass-card (matches web's
  LoadingState/EmptyState), mobile centered stack + the platform primary pill (`AppPrimaryButton` / `PillButton`).
- **D-KIT-12 Android declares `ACCESS_NETWORK_STATE`** (normal permission, no prompt; previously only
  merged in transitively from Firebase).

## 10. Not in 0.1.0 (deferred to adoption) / open
Loading skeleton, empty view, toast, pull-to-refresh (board §6.6); spacing/type/radius tokens; Next.js
`error.tsx`; `QueryClient` defaults; the 15 s timeout; on-device cache (D-9); the blocking update screen. The
existing iOS "You're offline. We'll reconnect…" alert (`AppRootView.swift`, `ProgramContext+Auth.swift`) stays
until Phase 3 replaces it with the offline banner (`bannerOffline`).

## 11. Changelog
- **v0.1.0** (2026-10-12) — kits on web / iOS / Android (async state, error vocabulary, connectivity,
  floating banner, error view, palette tokens); no screen adoption — reliability overhaul Phase 2 track D.
````

## Steps — web (implementer, own worktree: `apps/web/src/lib/kit/**` and `apps/web/src/components/kit/**` ONLY; do not commit)

2. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/kit/copy.ts`
```ts
import type { AppErrorKind } from "@/lib/kit/app-error";

// Every user-facing string the frontend kit shows — verbatim the frontend-kit SPEC §3 copy table.
// iOS (Shared/Kit/KitCopy.swift) and Android (core/kit/KitCopy.kt) carry the identical strings: change all
// three + the SPEC table in one commit (D-KIT-2). update/bannerUpdate are unused on web (D-KIT-9).

const ERROR_MESSAGES: Record<AppErrorKind, string> = {
  offline: "Can't connect. Check your internet connection and try again.",
  timeout: "This is taking longer than usual. Try again.",
  signedOut: "Your session has ended. Please sign in again.",
  forbidden: "You don't have access to this.",
  notFound: "We couldn't find that. It may have been removed.",
  conflict: "That conflicts with something already saved. Refresh and try again.",
  invalidInput: "Some details aren't valid. Check them and try again.",
  updateRequired: "This version of RaSi Fiters is no longer supported. Please update the app.",
  unavailable: "RaSi Fiters is busy right now. Try again in a moment.",
  server: "Something went wrong on our end. Try again.",
  unknown: "Something went wrong. Try again."
};

export const KIT_COPY = {
  retry: "Retry",
  update: "Update",
  dismiss: "Dismiss",
  bannerOffline: "You're offline",
  bannerStale: "Couldn't refresh",
  bannerUpdate: "A new version of RaSi Fiters is available",
  errorViewTitle: "Couldn't load this",
  errors: ERROR_MESSAGES
} as const;
```

3. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/kit/app-error.ts`
```ts
import { ApiError } from "@/lib/api/client";
import type { BulkRowError } from "@/lib/api/logs";
import { KIT_COPY } from "@/lib/kit/copy";

// The shared error vocabulary (frontend-kit SPEC §4) — identical kinds, status rules and copy on iOS
// (Shared/Kit/AppError.swift) and Android (core/kit/AppError.kt). The kit only LABELS errors; it never signs
// anyone out (sign-out policy is the sessions contract, DESIGN_BOARD §2).

export type AppErrorKind =
  | "offline"
  | "timeout"
  | "signedOut"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "invalidInput"
  | "updateRequired"
  | "unavailable"
  | "server"
  | "unknown";

export type AppError = {
  kind: AppErrorKind;
  /** User-facing copy (raw server text only for invalidInput or when rowErrors are present). */
  message: string;
  status?: number;
  /** Backend machine code when known ("session_invalid", "auth_unavailable"). Never changes `kind`. */
  code?: string;
  /** Whole seconds from a Retry-After header (unavailable). */
  retryAfter?: number;
  /** Per-row errors from the batch log endpoints (Add-workouts / Add-health row highlighting). */
  rowErrors?: BulkRowError[];
  retryable: boolean;
};

type AppErrorExtra = {
  message?: string;
  status?: number;
  code?: string;
  retryAfter?: number;
  rowErrors?: BulkRowError[];
};

const RETRYABLE_KINDS: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>([
  "offline",
  "timeout",
  "unavailable",
  "server",
  "unknown"
]);

const GENERIC_SERVER_PREFIX = "Request failed (";
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

export function appError(kind: AppErrorKind, extra: AppErrorExtra = {}): AppError {
  return {
    kind,
    message: extra.message ?? KIT_COPY.errors[kind],
    status: extra.status,
    code: extra.code,
    retryAfter: extra.retryAfter,
    rowErrors: extra.rowErrors,
    retryable: RETRYABLE_KINDS.has(kind)
  };
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 400 || status === 422) return "invalidInput";
  if (status === 401) return "signedOut";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 408) return "timeout";
  if (status === 409) return "conflict";
  if (status === 426) return "updateRequired";
  if (status === 429 || status === 503) return "unavailable";
  if (status >= 500) return "server";
  return "unknown";
}

/** The server's text when it is specific (non-empty, not the generic "Request failed (N)"), else undefined. */
function serverText(message: string | undefined): string | undefined {
  const text = message?.trim() ?? "";
  return text === "" || text.startsWith(GENERIC_SERVER_PREFIX) ? undefined : text;
}

/** Pure HTTP → AppError mapping: the status decides the kind; `code` is carried, never decisive. */
export function fromHttp(
  status: number,
  code?: string,
  retryAfter?: number,
  serverMessage?: string,
  rowErrors?: BulkRowError[]
): AppError {
  const kind = kindForStatus(status);
  const rows = rowErrors && rowErrors.length > 0 ? rowErrors : undefined;
  const useServerText = kind === "invalidInput" || rows !== undefined;
  return appError(kind, {
    message: useServerText ? serverText(serverMessage) : undefined,
    status,
    code,
    retryAfter,
    rowErrors: rows
  });
}

/** Retry-After → whole seconds; anything else (incl. an HTTP-date) → undefined. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  const text = value?.trim() ?? "";
  return /^\d+$/.test(text) ? Number(text) : undefined;
}

function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value && "retryable" in value;
}

function errorName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

/** Any thrown value → AppError (D-KIT-4). */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ApiError) {
    // `code` / `retryAfter` are read defensively: ApiError gains them in Phase 3 sessions (D-KIT-5).
    const extra = error as ApiError & { code?: unknown; retryAfter?: unknown };
    return fromHttp(
      error.status,
      typeof extra.code === "string" ? extra.code : undefined,
      typeof extra.retryAfter === "number" ? extra.retryAfter : undefined,
      error.message,
      Array.isArray(error.details) ? (error.details as BulkRowError[]) : undefined
    );
  }
  const name = errorName(error);
  if (name === "TimeoutError" || name === "AbortError") return appError("timeout");
  if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) return appError("offline");
  return appError("unknown");
}
```

4. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/kit/async-state.ts`
```ts
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
```

5. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/kit/use-online-status.ts`
```ts
import { useSyncExternalStore } from "react";

// Link-level connectivity (frontend-kit SPEC §5, D-KIT-7): navigator.onLine + the online/offline events.
// SSR-safe (the server snapshot is "online"). Not used by any page until Phase 3 adoption.

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getSnapshot = (): boolean => navigator.onLine;
const getServerSnapshot = (): boolean => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

6. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/kit/FloatingBanner.tsx`
```tsx
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
      <p className="min-w-0 flex-1 py-1.5 font-semibold leading-snug">{message}</p>
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
```

7. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/kit/ErrorView.tsx`
```tsx
"use client";

import { Button } from "@/components/ui/Button";
import type { AppError } from "@/lib/kit/app-error";
import { KIT_COPY } from "@/lib/kit/copy";

// Error-with-no-data view (frontend-kit SPEC §6): never an endless spinner, never fake zeros. Same glass-card
// chrome as components/ui/LoadingState + EmptyState (the web majority idiom). Retry renders only when a
// handler is given AND the error is retryable (D-KIT-8).
export function ErrorView({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass-card flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
      <p className="text-base font-semibold text-rf-text">{KIT_COPY.errorViewTitle}</p>
      <p className="text-sm text-rf-text-muted">{error.message}</p>
      {onRetry && error.retryable && (
        <Button variant="primary" size="lg" className="mt-1 w-40" onClick={onRetry}>
          {KIT_COPY.retry}
        </Button>
      )}
    </div>
  );
}
```
   **Web worktree gate:** `cd <worktree>/apps/web && npm ci && npm run build`. It passes when the output reads "Compiled successfully" with no type errors. Do not run lint (see step 27).

## Steps — ios (implementer, own worktree: `apps/ios/RaSi-Fiters-App/Shared/Kit/**` and `Shared/Theme/AppPalette.swift` ONLY; do NOT edit `project.pbxproj`, because the synchronized root group picks up new files; do not commit)

8. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Theme/AppPalette.swift`
```swift
import SwiftUI

/// The shared brand palette = web's rf-* tokens, light / dark (frontend-kit SPEC §7, DESIGN_BOARD W7-D1).
/// NEW tokens only — `appOrange` / `appRed` stay as-is until Phase 3 adoption (repointing them restyles
/// every screen, D-KIT-1 / D-KIT-10).
extension Color {
    static let rfAccent = Color(light: Color(hex: "FF8B1F"), dark: Color(hex: "FF9C3A"))
    static let rfAccentStrong = Color(light: Color(hex: "FF7A00"), dark: Color(hex: "FF8B1F"))
    static let rfDanger = Color(light: Color(hex: "EF4444"), dark: Color(hex: "F87171"))
    static let rfSuccess = Color(light: Color(hex: "2FB861"), dark: Color(hex: "36C56F"))
    static let rfWarning = Color(light: Color(hex: "F59E0B"), dark: Color(hex: "FBBF24"))
    static let rfInfo = Color(light: Color(hex: "2563EB"), dark: Color(hex: "60A5FA"))
}
```

9. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Kit/KitCopy.swift`
```swift
import Foundation

/// Every user-facing string the frontend kit shows — verbatim the frontend-kit SPEC §3 copy table.
/// Web (`src/lib/kit/copy.ts`) and Android (`core/kit/KitCopy.kt`) carry the identical strings: change all
/// three + the SPEC table in one commit (D-KIT-2).
enum KitCopy {
    static let retry = "Retry"
    static let update = "Update"
    static let dismiss = "Dismiss"
    static let bannerOffline = "You're offline"
    static let bannerStale = "Couldn't refresh"
    static let bannerUpdate = "A new version of RaSi Fiters is available"
    static let errorViewTitle = "Couldn't load this"

    static func message(for kind: AppErrorKind) -> String {
        switch kind {
        case .offline: return "Can't connect. Check your internet connection and try again."
        case .timeout: return "This is taking longer than usual. Try again."
        case .signedOut: return "Your session has ended. Please sign in again."
        case .forbidden: return "You don't have access to this."
        case .notFound: return "We couldn't find that. It may have been removed."
        case .conflict: return "That conflicts with something already saved. Refresh and try again."
        case .invalidInput: return "Some details aren't valid. Check them and try again."
        case .updateRequired: return "This version of RaSi Fiters is no longer supported. Please update the app."
        case .unavailable: return "RaSi Fiters is busy right now. Try again in a moment."
        case .server: return "Something went wrong on our end. Try again."
        case .unknown: return "Something went wrong. Try again."
        }
    }
}
```

10. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Kit/AppError.swift`
```swift
import Foundation

/// The shared error vocabulary (frontend-kit SPEC §4) — identical kinds, status rules and copy on web
/// (`src/lib/kit/app-error.ts`) and Android (`core/kit/AppError.kt`). The kit only LABELS errors; it never
/// signs anyone out (sign-out policy is the sessions contract, DESIGN_BOARD §2).
enum AppErrorKind: String {
    case offline, timeout, signedOut, forbidden, notFound, conflict, invalidInput, updateRequired, unavailable, server, unknown
}

struct AppError: LocalizedError {
    let kind: AppErrorKind
    /// User-facing copy (raw server text only for `.invalidInput` or when `rowErrors` are present).
    let message: String
    let status: Int?
    /// Backend machine code when known (`session_invalid`, `auth_unavailable`). Never changes `kind`.
    let code: String?
    /// Whole seconds from a `Retry-After` header (`.unavailable`).
    let retryAfter: Int?
    /// Per-row errors from the batch log endpoints (Add-workouts / Add-health row highlighting).
    let rowErrors: [APIClient.BulkRowError]

    var errorDescription: String? { message }

    var isRetryable: Bool {
        switch kind {
        case .offline, .timeout, .unavailable, .server, .unknown: return true
        case .signedOut, .forbidden, .notFound, .conflict, .invalidInput, .updateRequired: return false
        }
    }

    init(
        kind: AppErrorKind,
        message: String? = nil,
        status: Int? = nil,
        code: String? = nil,
        retryAfter: Int? = nil,
        rowErrors: [APIClient.BulkRowError] = []
    ) {
        self.kind = kind
        self.message = message ?? KitCopy.message(for: kind)
        self.status = status
        self.code = code
        self.retryAfter = retryAfter
        self.rowErrors = rowErrors
    }

    /// Any thrown error → AppError. `nil` for cancellation: a superseded load is not a failure (D-KIT-4).
    init?(_ error: Error) {
        if let appError = error as? AppError {
            self = appError
        } else if error is CancellationError {
            return nil
        } else if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled: return nil
            case .timedOut: self = AppError(kind: .timeout)
            default: self = AppError(kind: .offline)
            }
        } else if let httpError = error as? APIHTTPError {
            self = AppError.fromHTTP(status: httpError.statusCode, serverMessage: httpError.message)
        } else if let bulkError = error as? APIClient.BulkWorkoutError {
            // No status until Phase 3 (D-KIT-5). With rowErrors it is the batch forms' row-level 400 / 409 →
            // invalidInput + the server's text (web / Android label a 409 `conflict`; same text shown).
            // Without rowErrors the status is unknowable → unknown.
            self = bulkError.rowErrors.isEmpty
                ? AppError(kind: .unknown)
                : AppError(kind: .invalidInput, message: AppError.serverText(bulkError.message), rowErrors: bulkError.rowErrors)
        } else {
            // `APIError` carries no status until Phase 3 sessions adds one (D-KIT-5); `DecodingError` and
            // anything else → unknown.
            self = AppError(kind: .unknown)
        }
    }

    /// Pure HTTP → AppError mapping: the status decides the kind; `code` is carried, never decisive.
    static func fromHTTP(
        status: Int,
        code: String? = nil,
        retryAfter: Int? = nil,
        serverMessage: String? = nil,
        rowErrors: [APIClient.BulkRowError] = []
    ) -> AppError {
        let resolved = Self.kindFor(status: status)
        let useServerText = resolved == .invalidInput || !rowErrors.isEmpty
        return AppError(
            kind: resolved,
            message: useServerText ? serverText(serverMessage) : nil,
            status: status,
            code: code,
            retryAfter: retryAfter,
            rowErrors: rowErrors
        )
    }

    /// The server's text when it is specific (non-empty, not the generic `Request failed (N)`), else nil.
    static func serverText(_ message: String?) -> String? {
        let text = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty || text.hasPrefix("Request failed (") ? nil : text
    }

    /// `Retry-After` → whole seconds; anything else (incl. an HTTP-date) → nil.
    static func parseRetryAfter(_ value: String?) -> Int? {
        guard let text = value?.trimmingCharacters(in: .whitespaces), !text.isEmpty,
              text.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        return Int(text)
    }

    private static func kindFor(status: Int) -> AppErrorKind {
        switch status {
        case 400, 422: return .invalidInput
        case 401: return .signedOut
        case 403: return .forbidden
        case 404: return .notFound
        case 408: return .timeout
        case 409: return .conflict
        case 426: return .updateRequired
        case 429, 503: return .unavailable
        case 500...: return .server
        default: return .unknown
        }
    }
}
```

11. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Kit/LoadState.swift`
```swift
import Foundation

/// One async state per screen (frontend-kit SPEC §5) — the same five states as web `AsyncState` and
/// Android `UiState`. "Empty" is a view decision on `.loaded` data, not a state.
enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value, fetchedAt: Date, refreshing: Bool)
    case failed(AppError)
    case stale(Value, fetchedAt: Date, error: AppError)

    /// A just-fetched value.
    static func fresh(_ value: Value) -> LoadState {
        .loaded(value, fetchedAt: Date(), refreshing: false)
    }

    var value: Value? {
        switch self {
        case .loaded(let value, _, _), .stale(let value, _, _): return value
        case .idle, .loading, .failed: return nil
        }
    }

    var error: AppError? {
        switch self {
        case .failed(let error), .stale(_, _, let error): return error
        case .idle, .loading, .loaded: return nil
        }
    }

    /// A reload starts: keep any data (W7-D2), otherwise show loading.
    func refreshing() -> LoadState {
        switch self {
        case .loaded(let value, let fetchedAt, _), .stale(let value, let fetchedAt, _):
            return .loaded(value, fetchedAt: fetchedAt, refreshing: true)
        case .idle, .loading, .failed:
            return .loading
        }
    }

    /// A load failed: with data → stale (keep data + banner), without → failed (error view).
    func failing(with error: AppError) -> LoadState {
        switch self {
        case .loaded(let value, let fetchedAt, _), .stale(let value, let fetchedAt, _):
            return .stale(value, fetchedAt: fetchedAt, error: error)
        case .idle, .loading, .failed:
            return .failed(error)
        }
    }
}
```

12. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Kit/NetworkMonitor.swift`
```swift
import Foundation
import Network
import Observation

/// One app-wide, link-level connectivity monitor (frontend-kit SPEC §5, D-KIT-7) — the web
/// `useOnlineStatus` / Android `ConnectivityObserver` analog. NOT started in Phase 2; Phase 3 calls
/// `NetworkMonitor.shared.start()` once at launch. Updates are delivered on the main queue, so the
/// MainActor-isolated state is only touched on the main thread.
@Observable
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    @ObservationIgnored private var isStarted = false

    /// Idempotent. Runs for the app's lifetime (an `NWPathMonitor` cannot restart after `cancel()`).
    func start() {
        guard !isStarted else { return }
        isStarted = true
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            MainActor.assumeIsolated {
                self?.isOnline = online
            }
        }
        monitor.start(queue: .main)
    }
}
```
   *Pre-decided fallback.* This applies only if the compiler rejects the `MainActor.assumeIsolated` block. Replace those 3 lines with `Task { @MainActor [weak self] in self?.isOnline = online }` and keep `.main`.

13. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Kit/FloatingBanner.swift`
```swift
import SwiftUI

/// Slim floating status banner (frontend-kit SPEC §6) — offline / stale data / error / update available.
/// Net-new; not placed on any screen until Phase 3 adoption. Place it with `.floatingBanner(bottomInset:) { … }`
/// (D-KIT-8). Min height 52, 44-pt tap targets.
struct FloatingBanner: View {
    enum Variant {
        case offline
        case stale
        case error(AppError)
        case updateAvailable
    }

    let variant: Variant
    var onRetry: (() -> Void)? = nil
    var onDismiss: (() -> Void)? = nil
    var onUpdate: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: AppSpacing.smd) {
            Circle()
                .fill(dotColor)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(message)
                .font(AppTypography.footnote)
                .fontWeight(.semibold)
                .foregroundColor(Color(.label))
                .lineLimit(2)
                .padding(.vertical, AppSpacing.xs)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let action = primaryAction {
                Button(action: action.perform) {
                    Text(action.title)
                        .font(AppTypography.footnote)
                        .fontWeight(.semibold)
                        .foregroundColor(.rfAccent)
                        .padding(.horizontal, AppSpacing.sm)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let onDismiss {
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(KitCopy.dismiss)
            }
        }
        .padding(.leading, AppSpacing.lg)
        .padding(.trailing, AppSpacing.xxs)
        .padding(.vertical, AppSpacing.xxs)
        .frame(minHeight: 52)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
    }

    private struct BannerAction {
        let title: String
        let perform: () -> Void
    }

    private var message: String {
        switch variant {
        case .offline: return KitCopy.bannerOffline
        case .stale: return KitCopy.bannerStale
        case .error(let error): return error.message
        case .updateAvailable: return KitCopy.bannerUpdate
        }
    }

    private var dotColor: Color {
        switch variant {
        case .offline, .stale: return .rfWarning
        case .error: return .rfDanger
        case .updateAvailable: return .rfAccent
        }
    }

    private var primaryAction: BannerAction? {
        switch variant {
        case .offline:
            return nil
        case .stale:
            guard let onRetry else { return nil }
            return BannerAction(title: KitCopy.retry, perform: onRetry)
        case .error(let error):
            guard let onRetry, error.isRetryable else { return nil }
            return BannerAction(title: KitCopy.retry, perform: onRetry)
        case .updateAvailable:
            guard let onUpdate else { return nil }
            return BannerAction(title: KitCopy.update, perform: onUpdate)
        }
    }
}

extension View {
    /// Floats a kit banner at the bottom of this view (above the tab bar), centered and capped at the 520-pt
    /// form column on iPad / Mac. Apply to a screen's root, not inside a ScrollView. `bottomInset` lifts it
    /// above bottom-anchored floating actions (program picker: 150 = 56 + 14 + 56 + 24) — D-KIT-8.
    func floatingBanner<Banner: View>(bottomInset: CGFloat = 0, @ViewBuilder _ banner: () -> Banner) -> some View {
        let content = banner()
        return overlay(alignment: .bottom) {
            content
                .adaptiveColumn(max: AdaptiveLayout.formMaxWidth)
                .padding(.horizontal, AppSpacing.lg)
                .padding(.bottom, AppSpacing.md + bottomInset)
        }
    }
}

#Preview {
    VStack(spacing: AppSpacing.md) {
        FloatingBanner(variant: .offline)
        FloatingBanner(variant: .stale, onRetry: {}, onDismiss: {})
        FloatingBanner(variant: .error(AppError(kind: .offline)), onRetry: {}, onDismiss: {})
        FloatingBanner(variant: .updateAvailable, onDismiss: {}, onUpdate: {})
    }
    .padding()
}
```

14. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Kit/ErrorStateView.swift`
```swift
import SwiftUI

/// Error-with-no-data view (frontend-kit SPEC §6): never an endless spinner, never fake zeros. Retry shows
/// only when a handler is given AND the error is retryable (D-KIT-8). Uses the app's primary pill
/// (`AppPrimaryButton`, the majority CTA idiom).
struct ErrorStateView: View {
    let error: AppError
    var onRetry: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: AppSpacing.md) {
            Text(KitCopy.errorViewTitle)
                .font(AppTypography.headline)
                .foregroundColor(Color(.label))
                .multilineTextAlignment(.center)
            Text(error.message)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .multilineTextAlignment(.center)
            if let onRetry, error.isRetryable {
                AppPrimaryButton(title: KitCopy.retry, maxWidth: 160, action: onRetry)
                    .padding(.top, AppSpacing.xxs)
            }
        }
        .padding(AppSpacing.xxl)
        .adaptiveColumn(max: AdaptiveLayout.contentMaxWidth)
    }
}

#Preview {
    ErrorStateView(error: AppError(kind: .server), onRetry: {})
}
```
   **iOS worktree gate:** none. The xcode MCP builds the project open in Xcode on main, so the iOS gate runs after the merge (step 27).

## Steps — android (implementer, own worktree: `core/kit/**`, `ui/components/kit/**`, `core/theme/Palette.kt`, and the `AndroidManifest.xml` permission line ONLY; base `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/`; do not commit)

15. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/AndroidManifest.xml`. Insert this line directly after the `<uses-permission android:name="android.permission.INTERNET" />` line (today line 4):
```xml
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

16. **NEW** `…/core/theme/Palette.kt`
```kotlin
package com.app.rasifiters.core.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/**
 * The shared brand palette = web's rf-* tokens, light / dark (frontend-kit SPEC §7, DESIGN_BOARD W7-D1).
 * NEW tokens only — `AppOrange` (Color.kt) and the M3 `primary` (Theme.kt) stay as-is until Phase 3 adoption
 * (repointing them restyles every screen, D-KIT-1 / D-KIT-10).
 */
@Immutable
data class RfPalette(
    val accent: Color,
    val accentStrong: Color,
    val danger: Color,
    val success: Color,
    val warning: Color,
    val info: Color,
)

val RfLightPalette = RfPalette(
    accent = Color(0xFFFF8B1F),
    accentStrong = Color(0xFFFF7A00),
    danger = Color(0xFFEF4444),
    success = Color(0xFF2FB861),
    warning = Color(0xFFF59E0B),
    info = Color(0xFF2563EB),
)

val RfDarkPalette = RfPalette(
    accent = Color(0xFFFF9C3A),
    accentStrong = Color(0xFFFF8B1F),
    danger = Color(0xFFF87171),
    success = Color(0xFF36C56F),
    warning = Color(0xFFFBBF24),
    info = Color(0xFF60A5FA),
)

/** The palette for the active theme — reads the colorScheme (not the system setting), so the in-app
 *  Appearance override wins. */
@Composable
@ReadOnlyComposable
fun rfPalette(): RfPalette =
    if (MaterialTheme.colorScheme.background.luminance() < 0.5f) RfDarkPalette else RfLightPalette
```

17. **NEW** `…/core/kit/KitCopy.kt`
```kotlin
package com.app.rasifiters.core.kit

/** Every user-facing string the frontend kit shows — verbatim the frontend-kit SPEC §3 copy table. Web
 *  (`src/lib/kit/copy.ts`) and iOS (`Shared/Kit/KitCopy.swift`) carry the identical strings: change all three
 *  + the SPEC table in one commit (D-KIT-2). */
object KitCopy {
    const val RETRY = "Retry"
    const val UPDATE = "Update"
    const val DISMISS = "Dismiss"
    const val BANNER_OFFLINE = "You're offline"
    const val BANNER_STALE = "Couldn't refresh"
    const val BANNER_UPDATE = "A new version of RaSi Fiters is available"
    const val ERROR_VIEW_TITLE = "Couldn't load this"

    fun messageFor(kind: AppErrorKind): String = when (kind) {
        AppErrorKind.OFFLINE -> "Can't connect. Check your internet connection and try again."
        AppErrorKind.TIMEOUT -> "This is taking longer than usual. Try again."
        AppErrorKind.SIGNED_OUT -> "Your session has ended. Please sign in again."
        AppErrorKind.FORBIDDEN -> "You don't have access to this."
        AppErrorKind.NOT_FOUND -> "We couldn't find that. It may have been removed."
        AppErrorKind.CONFLICT -> "That conflicts with something already saved. Refresh and try again."
        AppErrorKind.INVALID_INPUT -> "Some details aren't valid. Check them and try again."
        AppErrorKind.UPDATE_REQUIRED -> "This version of RaSi Fiters is no longer supported. Please update the app."
        AppErrorKind.UNAVAILABLE -> "RaSi Fiters is busy right now. Try again in a moment."
        AppErrorKind.SERVER -> "Something went wrong on our end. Try again."
        AppErrorKind.UNKNOWN -> "Something went wrong. Try again."
    }
}
```

18. **NEW** `…/core/kit/AppError.kt`
```kotlin
package com.app.rasifiters.core.kit

import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.toApiException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import java.io.IOException
import java.io.InterruptedIOException
import kotlin.coroutines.cancellation.CancellationException

/** The shared error vocabulary (frontend-kit SPEC §4) — identical kinds, status rules and copy on web
 *  (`src/lib/kit/app-error.ts`) and iOS (`Shared/Kit/AppError.swift`). The kit only LABELS errors; it never
 *  signs anyone out (sign-out policy is the sessions contract, DESIGN_BOARD §2). */
enum class AppErrorKind {
    OFFLINE, TIMEOUT, SIGNED_OUT, FORBIDDEN, NOT_FOUND, CONFLICT, INVALID_INPUT, UPDATE_REQUIRED, UNAVAILABLE, SERVER, UNKNOWN,
}

data class AppError(
    val kind: AppErrorKind,
    /** User-facing copy (raw server text only for INVALID_INPUT or when [rowErrors] are present). */
    val message: String = KitCopy.messageFor(kind),
    val status: Int? = null,
    /** Backend machine code when known (session_invalid, auth_unavailable). Never changes [kind]. */
    val code: String? = null,
    /** Whole seconds from a Retry-After header (UNAVAILABLE). */
    val retryAfterSeconds: Int? = null,
    /** Per-row errors from the batch log endpoints (Add-workouts / Add-health row highlighting). */
    val rowErrors: List<BulkRowError>? = null,
) {
    val retryable: Boolean
        get() = when (kind) {
            AppErrorKind.OFFLINE, AppErrorKind.TIMEOUT, AppErrorKind.UNAVAILABLE,
            AppErrorKind.SERVER, AppErrorKind.UNKNOWN -> true
            AppErrorKind.SIGNED_OUT, AppErrorKind.FORBIDDEN, AppErrorKind.NOT_FOUND, AppErrorKind.CONFLICT,
            AppErrorKind.INVALID_INPUT, AppErrorKind.UPDATE_REQUIRED -> false
        }

    companion object {
        private const val GENERIC_SERVER_PREFIX = "Request failed ("

        /** Pure HTTP → AppError mapping: the status decides the kind; `code` is carried, never decisive. */
        fun fromHttp(
            status: Int,
            code: String? = null,
            retryAfterSeconds: Int? = null,
            serverMessage: String? = null,
            rowErrors: List<BulkRowError>? = null,
        ): AppError {
            val kind = kindFor(status)
            val rows = rowErrors?.takeIf { it.isNotEmpty() }
            val text = if (kind == AppErrorKind.INVALID_INPUT || rows != null) serverText(serverMessage) else null
            return AppError(
                kind = kind,
                message = text ?: KitCopy.messageFor(kind),
                status = status,
                code = code,
                retryAfterSeconds = retryAfterSeconds,
                rowErrors = rows,
            )
        }

        /** Retry-After → whole seconds; anything else (incl. an HTTP-date) → null. */
        fun parseRetryAfter(value: String?): Int? {
            val text = value?.trim().orEmpty()
            return if (text.isNotEmpty() && text.all { it in '0'..'9' }) text.toIntOrNull() else null
        }

        /** The server's text when it is specific (non-empty, not the generic "Request failed (N)"), else null. */
        private fun serverText(message: String?): String? {
            val text = message?.trim().orEmpty()
            return if (text.isEmpty() || text.startsWith(GENERIC_SERVER_PREFIX)) null else text
        }

        private fun kindFor(status: Int): AppErrorKind = when {
            status == 400 || status == 422 -> AppErrorKind.INVALID_INPUT
            status == 401 -> AppErrorKind.SIGNED_OUT
            status == 403 -> AppErrorKind.FORBIDDEN
            status == 404 -> AppErrorKind.NOT_FOUND
            status == 408 -> AppErrorKind.TIMEOUT
            status == 409 -> AppErrorKind.CONFLICT
            status == 426 -> AppErrorKind.UPDATE_REQUIRED
            status == 429 || status == 503 -> AppErrorKind.UNAVAILABLE
            status >= 500 -> AppErrorKind.SERVER
            else -> AppErrorKind.UNKNOWN
        }
    }
}

/** Any throwable → AppError (D-KIT-4). Cancellation is never an error: it is always rethrown. */
fun Throwable.toAppError(): AppError = when (this) {
    is CancellationException -> throw this
    is ApiException -> AppError.fromHttp(status, serverMessage = message, rowErrors = rowErrors)
    is HttpException -> {
        val retryAfter = AppError.parseRetryAfter(response()?.headers()?.get("Retry-After"))
        val api = toApiException()
        AppError.fromHttp(api.status, retryAfterSeconds = retryAfter, serverMessage = api.message, rowErrors = api.rowErrors)
    }
    is InterruptedIOException -> AppError(AppErrorKind.TIMEOUT)
    is IOException -> AppError(AppErrorKind.OFFLINE)
    is SerializationException -> AppError(AppErrorKind.UNKNOWN)
    else -> AppError(AppErrorKind.UNKNOWN)
}
```

19. **NEW** `…/core/kit/UiState.kt`
```kotlin
package com.app.rasifiters.core.kit

/** One async state per screen (frontend-kit SPEC §5) — the same five states as web `AsyncState` and iOS
 *  `LoadState`. "Empty" is a view decision on [Loaded] data, not a state. */
sealed interface UiState<out T> {
    data object Idle : UiState<Nothing>
    data object Loading : UiState<Nothing>
    data class Loaded<out T>(val data: T, val fetchedAt: Long, val refreshing: Boolean = false) : UiState<T>
    data class Failed(val error: AppError) : UiState<Nothing>
    data class Stale<out T>(val data: T, val fetchedAt: Long, val error: AppError) : UiState<T>

    companion object {
        /** A just-fetched value. */
        fun <T> fresh(data: T): UiState<T> = Loaded(data, System.currentTimeMillis())
    }
}

val <T> UiState<T>.dataOrNull: T?
    get() = when (this) {
        is UiState.Loaded -> data
        is UiState.Stale -> data
        else -> null
    }

val UiState<*>.errorOrNull: AppError?
    get() = when (this) {
        is UiState.Failed -> error
        is UiState.Stale -> error
        else -> null
    }

/** A reload starts: keep any data (W7-D2), otherwise show loading. */
fun <T> UiState<T>.refreshing(): UiState<T> = when (this) {
    is UiState.Loaded -> UiState.Loaded(data, fetchedAt, refreshing = true)
    is UiState.Stale -> UiState.Loaded(data, fetchedAt, refreshing = true)
    else -> UiState.Loading
}

/** A load failed: with data → Stale (keep data + banner), without → Failed (error view). */
fun <T> UiState<T>.failing(error: AppError): UiState<T> = when (this) {
    is UiState.Loaded -> UiState.Stale(data, fetchedAt, error)
    is UiState.Stale -> UiState.Stale(data, fetchedAt, error)
    else -> UiState.Failed(error)
}
```

20. **NEW** `…/core/kit/ConnectivityObserver.kt`
```kotlin
package com.app.rasifiters.core.kit

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn

/**
 * One app-wide, link-level connectivity monitor (frontend-kit SPEC §5) — the iOS `NetworkMonitor` / web
 * `useOnlineStatus` analog. Online = the default network has NET_CAPABILITY_INTERNET (NOT VALIDATED, so a
 * network that fails Android's validation never shows a false "offline", D-KIT-7). NOT instantiated in
 * Phase 2; Phase 3 creates one in AppContainer.
 */
class ConnectivityObserver(context: Context) {

    private val connectivityManager: ConnectivityManager =
        context.applicationContext.getSystemService(ConnectivityManager::class.java)

    /** Emits the current state, then every change; unregisters when the collector stops. */
    val isOnline: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                trySend(capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
            }

            override fun onLost(network: Network) {
                trySend(false)
            }
        }
        trySend(currentlyOnline())
        connectivityManager.registerDefaultNetworkCallback(callback)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()

    /** Hot, app-scoped state for Compose (`collectAsStateWithLifecycle()`). */
    fun onlineState(scope: CoroutineScope): StateFlow<Boolean> =
        isOnline.stateIn(scope, SharingStarted.WhileSubscribed(5_000), currentlyOnline())

    private fun currentlyOnline(): Boolean {
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
```

21. **NEW** `…/ui/components/kit/FloatingBanner.kt`
```kotlin
package com.app.rasifiters.ui.components.kit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.core.theme.rfPalette

/** Which kit banner to show (frontend-kit SPEC §6). */
sealed interface FloatingBannerVariant {
    data object Offline : FloatingBannerVariant
    data object Stale : FloatingBannerVariant
    data class Error(val error: AppError) : FloatingBannerVariant
    data object UpdateAvailable : FloatingBannerVariant
}

/**
 * Slim floating status banner — net-new, not placed on any screen until Phase 3 adoption. Place it inside the
 * screen's Box: `FloatingBanner(variant, Modifier.align(Alignment.BottomCenter))`. Inside AppScaffold the
 * innerPadding already clears the NavigationBar; screens outside it (edge-to-edge, e.g. the program picker) also
 * pass `Modifier.navigationBarsPadding()`. [bottomInset] lifts it above bottom-anchored floating actions
 * (program picker: 146.dp = 56 + 14 + 56 + 20) — D-KIT-8. Min height 52dp, 48dp tap targets. Neutral M3 surface
 * roles only. Distinct from the private `ErrorBanner`s in SummaryScreen / ProgramPickerScreen (untouched).
 */
@Composable
fun FloatingBanner(
    variant: FloatingBannerVariant,
    modifier: Modifier = Modifier,
    bottomInset: Dp = 0.dp,
    onRetry: (() -> Unit)? = null,
    onDismiss: (() -> Unit)? = null,
    onUpdate: (() -> Unit)? = null,
) {
    val palette = rfPalette()
    val message = when (variant) {
        FloatingBannerVariant.Offline -> KitCopy.BANNER_OFFLINE
        FloatingBannerVariant.Stale -> KitCopy.BANNER_STALE
        is FloatingBannerVariant.Error -> variant.error.message
        FloatingBannerVariant.UpdateAvailable -> KitCopy.BANNER_UPDATE
    }
    val dotColor = when (variant) {
        FloatingBannerVariant.Offline, FloatingBannerVariant.Stale -> palette.warning
        is FloatingBannerVariant.Error -> palette.danger
        FloatingBannerVariant.UpdateAvailable -> palette.accent
    }
    val action: Pair<String, () -> Unit>? = when (variant) {
        FloatingBannerVariant.Offline -> null
        FloatingBannerVariant.Stale -> onRetry?.let { KitCopy.RETRY to it }
        is FloatingBannerVariant.Error -> onRetry?.takeIf { variant.error.retryable }?.let { KitCopy.RETRY to it }
        FloatingBannerVariant.UpdateAvailable -> onUpdate?.let { KitCopy.UPDATE to it }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 12.dp + bottomInset),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            shadowElevation = 6.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Row(
                modifier = Modifier
                    .heightIn(min = 52.dp)
                    .padding(start = 16.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(dotColor))
                Text(
                    message,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                action?.let { (label, run) ->
                    TextButton(onClick = run) {
                        Text(label, color = palette.accent, fontWeight = FontWeight.SemiBold)
                    }
                }
                onDismiss?.let { dismiss ->
                    IconButton(onClick = dismiss) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = KitCopy.DISMISS,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun FloatingBannerPreview() {
    RaSiFitersTheme(darkTheme = false) {
        Column {
            FloatingBanner(FloatingBannerVariant.Offline)
            FloatingBanner(FloatingBannerVariant.Stale, onRetry = {}, onDismiss = {})
            FloatingBanner(FloatingBannerVariant.Error(AppError(AppErrorKind.OFFLINE)), onRetry = {}, onDismiss = {})
            FloatingBanner(FloatingBannerVariant.UpdateAvailable, onDismiss = {}, onUpdate = {})
        }
    }
}
```

22. **NEW** `…/ui/components/kit/ErrorView.kt`
```kotlin
package com.app.rasifiters.ui.components.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.ui.auth.PillButton

/** Error-with-no-data view (frontend-kit SPEC §6): never an endless spinner, never fake zeros. Retry shows
 *  only when a handler is given AND the error is retryable (D-KIT-8). Uses the app's capsule CTA
 *  ([PillButton]). */
@Composable
fun ErrorView(error: AppError, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            KitCopy.ERROR_VIEW_TITLE,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            error.message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null && error.retryable) {
            PillButton(label = KitCopy.RETRY, onClick = onRetry, modifier = Modifier.widthIn(max = 160.dp))
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ErrorViewPreview() {
    RaSiFitersTheme(darkTheme = false) {
        ErrorView(error = AppError(AppErrorKind.SERVER), onRetry = {})
    }
}
```
   **Android worktree gate:**
   1. Copy the two gitignored files from main into the worktree:
      - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/local.properties` → `<worktree>/apps/android/local.properties`
      - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/google-services.json` → `<worktree>/apps/android/app/google-services.json`
   2. Run `cd <worktree>/apps/android && ./gradlew :app:assembleDebug`. It passes on `BUILD SUCCESSFUL`.
   3. Delete the two copied files afterwards.

## Endgame

23. **Merge the worktrees into main (orchestrator; uncommitted).** Run this once per surface. Fill in that implementer's worktree path as `WT` and the matching `PATHS` and `SURFACE` values:
   - web: `PATHS="apps/web/src/lib/kit apps/web/src/components/kit"`
   - ios: `PATHS="apps/ios/RaSi-Fiters-App/Shared/Kit apps/ios/RaSi-Fiters-App/Shared/Theme/AppPalette.swift"`
   - android: `PATHS="apps/android/app/src/main/java/com/app/rasifiters/core/kit apps/android/app/src/main/java/com/app/rasifiters/ui/components/kit apps/android/app/src/main/java/com/app/rasifiters/core/theme/Palette.kt apps/android/app/src/main/AndroidManifest.xml"`
```bash
MAIN=/Users/vinayaksankaranarayanan/Developer/rasifiters-master
PATCHDIR=$(mktemp -d)
git -C "$WT" add -A -- $PATHS
git -C "$WT" diff --cached --binary -- $PATHS > "$PATCHDIR/d-$SURFACE.patch"
git -C "$MAIN" apply --check "$PATCHDIR/d-$SURFACE.patch" && git -C "$MAIN" apply "$PATCHDIR/d-$SURFACE.patch"
```
   If `apply --check` fails, it will be on the manifest line, because another track touched the manifest. In that case, add the step-15 line by hand right after the INTERNET permission line, and apply the patch without the manifest.

24. **Parity, no-adoption and fence checks (orchestrator, main tree).**
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps
for s in "Retry" "Update" "Dismiss" "You're offline" "Couldn't refresh" "A new version of RaSi Fiters is available" "Couldn't load this" "Can't connect. Check your internet connection and try again." "This is taking longer than usual. Try again." "Your session has ended. Please sign in again." "You don't have access to this." "We couldn't find that. It may have been removed." "That conflicts with something already saved. Refresh and try again." "Some details aren't valid. Check them and try again." "This version of RaSi Fiters is no longer supported. Please update the app." "RaSi Fiters is busy right now. Try again in a moment." "Something went wrong on our end. Try again." "Something went wrong. Try again."; do
  for f in web/src/lib/kit/copy.ts ios/RaSi-Fiters-App/Shared/Kit/KitCopy.swift android/app/src/main/java/com/app/rasifiters/core/kit/KitCopy.kt; do
    grep -qF "\"$s\"" "$f" || echo "MISSING in $f: $s"
  done
done
grep -rlE "lib/kit/|components/kit/" web/src | grep -v "/kit/"
grep -rlE "FloatingBanner|ErrorStateView|LoadState|NetworkMonitor|KitCopy|AppErrorKind|\.rf(Accent|Danger|Warning|Success|Info)" ios/RaSi-Fiters-App | grep -vE "Shared/Kit/|AppPalette.swift"
grep -rlE "core\.kit\.|components\.kit\.|rfPalette|RfLightPalette|RfDarkPalette" android/app/src/main/java | grep -vE "/kit/|Palette.kt"
cd .. && git status --porcelain -uall -- apps/web/src/lib/kit apps/web/src/components/kit apps/web/src/app/kit-preview apps/ios/RaSi-Fiters-App/Shared/Kit apps/ios/RaSi-Fiters-App/Shared/Theme/AppPalette.swift apps/android/app/src/main/java/com/app/rasifiters/core/kit apps/android/app/src/main/java/com/app/rasifiters/ui/components/kit apps/android/app/src/main/java/com/app/rasifiters/core/theme/Palette.kt apps/android/app/src/main/AndroidManifest.xml specs/features/frontend-kit
```
   Expected result:
   - No `MISSING` lines, and all three greps are empty.
   - Exactly 22 status lines:
     - 20 `??` code files (web 6, iOS 7, Android 7)
     - ` M apps/android/app/src/main/AndroidManifest.xml`
     - `?? specs/features/frontend-kit/SPEC.md`
   - Nothing under `apps/web/src/app/kit-preview`. Step 25 creates that page and deletes it again.

25. **Web visual-fit check (temporary, never committed; the orchestrator sets it up and the USER looks).** It covers the "UI must fit" gate for the only kit with no preview path (objection 8).
   1. Create the throwaway page `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/kit-preview/page.tsx`. It sits outside the auth middleware matcher.
```tsx
"use client";

// TEMPORARY visual-fit check for the frontend kit — NEVER commit; delete before step 27 (step 24 enforces).
import { useState } from "react";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner, type FloatingBannerVariant } from "@/components/kit/FloatingBanner";
import { appError } from "@/lib/kit/app-error";

const VARIANTS: FloatingBannerVariant[] = ["offline", "stale", "error"];

export default function KitPreviewPage() {
  const [index, setIndex] = useState(0);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
      <button type="button" className="text-rf-accent" onClick={() => setIndex((index + 1) % VARIANTS.length)}>
        Next banner ({VARIANTS[index]})
      </button>
      <ErrorView error={appError("offline")} onRetry={() => undefined} />
      <ErrorView error={appError("forbidden")} onRetry={() => undefined} />
      <FloatingBanner variant={VARIANTS[index]} error={appError("offline")} onRetry={() => undefined} onDismiss={() => undefined} />
    </div>
  );
}
```
   2. Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run dev -- -p 3100`.
   3. The **user** opens `http://localhost:3100/kit-preview` at 390px and at 1280px or wider, in light and dark. For dark, set `document.documentElement.dataset.theme = "dark"` in devtools. The user checks:
      - Nothing clips or overflows.
      - The 2-line offline error message wraps cleanly beside Retry and ×.
      - The banner stays at or under 520px wide.
   4. Stop the dev server, then delete the page: `rm -rf /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/kit-preview`.
   5. Re-run the step 24 status command and confirm it shows nothing under `kit-preview`.

26. **CONTEXT pointers (orchestrator, only after track B has merged its CONTEXT edits).** Append one bullet as the last item of `## Stack` in each file:
   - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/CONTEXT.md`, after the line ending "Domain cutover done 2026-06-29.":
     `- **Frontend kit** (async state, error vocabulary, online hook, floating banner, error view): \`src/lib/kit/\` + \`src/components/kit/\` — contract + copy table: [\`specs/features/frontend-kit/SPEC.md\`](../../specs/features/frontend-kit/SPEC.md). Not adopted by any page until reliability Phase 3.`
   - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/CONTEXT.md`, after the line ending "to check).":
     `- **Frontend kit:** \`Shared/Kit/\` (\`KitCopy\`, \`AppError\`, \`LoadState\`, \`NetworkMonitor\`, \`FloatingBanner\`, \`ErrorStateView\`) + \`Shared/Theme/AppPalette.swift\` (\`Color.rf*\`) — contract + copy table: [\`specs/features/frontend-kit/SPEC.md\`](../../specs/features/frontend-kit/SPEC.md). Not adopted until reliability Phase 3.`
   - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/CONTEXT.md`, after the line ending "moves only for production submissions.":
     `- **Frontend kit:** \`core/kit/\` (\`KitCopy\`, \`AppError\`, \`UiState\`, \`ConnectivityObserver\`) + \`ui/components/kit/\` (\`FloatingBanner\`, \`ErrorView\`) + \`core/theme/Palette.kt\` (\`rfPalette()\`) — contract + copy table: [\`specs/features/frontend-kit/SPEC.md\`](../../specs/features/frontend-kit/SPEC.md). Not adopted until reliability Phase 3.`

   If B has not merged by commit time, skip this step. It becomes a one-line `docs(frontend-kit)` follow-up with no version bump.

27. **Compile-check on main after the merge, one per surface.**
   - **Attribution rule.** Before each gate, run `git status --porcelain -- apps/<surface>`. If another track's uncommitted edits show up (B: `config.ts`, `APIConfig.swift`, `project.pbxproj`, schemes, `build.gradle.kts`), still run the gate, but treat any error outside D's paths as that track's problem. Report it; do not fix it.
   - **Web:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build`. It passes on "Compiled successfully" with no type errors. **Do not run `npm run lint`.** There is no ESLint config, so `next lint` would start an interactive setup.
   - **Android:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`. It passes on `BUILD SUCCESSFUL`. If it fails on iCloud " 2"/" 3" duplicates under `app/build`, first confirm none exist in `src/`, then `rm -rf app/build` and rebuild.
   - **iOS:** the **user** runs `BuildProject` through the `xcode` MCP, with Xcode open on the main `apps/ios` and "Allow external agents" enabled. It passes on `** BUILD SUCCEEDED **`.
   - **Visual and live testing is the user's.** There is no staging and no test suite. The prod check is regression only: web, iPhone and Pixel must look and behave exactly as before. The user can view the kits through the Xcode `#Preview` blocks, the Android Studio `@Preview`s, and step 25.

28. **Migration:** none (no DB surface).

29. **git-version (orchestrator; the registry edits live HERE, not before fan-out).**
   1. **Precondition (objection 1).** `git diff --quiet -- specs/features/registry.json specs/features/REGISTRY.md` must exit 0. That means no other track (C's app-config 0.2.0, or A) has uncommitted hunks in these files. If it exits 1, wait until that track's git-version commit lands, then re-check.
   2. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`** (anchor by content, not line number). Make `frontend-kit` the **last** member of `"features"`:
      - Find the `    }` that closes the last feature entry. Today that is `health-connect`; if another track has since appended a feature, use that one.
      - Change it to `    },`.
      - Insert the block below between it and the `  }` that closes `features`.
      - Validate with `node -e 'JSON.parse(require("fs").readFileSync("/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json","utf8"))'`.
```json
    "frontend-kit": {
      "version": "0.1.0",
      "spec": "specs/features/frontend-kit/SPEC.md",
      "status": "built",
      "consumed_by": [
        "web",
        "ios",
        "android"
      ],
      "depends_on": [],
      "reference_impl": {
        "app": "web",
        "paths": [
          "src/lib/kit/copy.ts",
          "src/lib/kit/app-error.ts",
          "src/lib/kit/async-state.ts",
          "src/lib/kit/use-online-status.ts",
          "src/components/kit/FloatingBanner.tsx",
          "src/components/kit/ErrorView.tsx"
        ]
      }
    }
```
   3. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`.** Insert this as the last row of the feature table. Today that means right after the `health-connect` row; if a track has appended a row since, put it after that row.
```
| `frontend-kit` | 0.1.0 | 🏗️ | `web` `ios` `android` | `web` (`src/lib/kit/{copy,app-error,async-state,use-online-status}.ts`, `src/components/kit/{FloatingBanner,ErrorView}.tsx`; mirrors: iOS `Shared/Kit/*` + `Shared/Theme/AppPalette.swift`, Android `core/kit/*` + `ui/components/kit/*` + `core/theme/Palette.kt`; not adopted by any screen until reliability Phase 3) | [frontend-kit/SPEC.md](frontend-kit/SPEC.md) |
```
   4. **Blast radius.** The report reads `editing frontend-kit → dependents: [] · apps: [web, ios, android]`. This is first-time node creation, so it is FYI only. Confirm the v0.1.0 bump with the user.
   5. **Stage explicitly, never `-A`.** Stage the 20 code files, `AndroidManifest.xml`, `specs/features/frontend-kit/SPEC.md`, `registry.json` and `REGISTRY.md`. Add the 3 CONTEXT files only if step 26 ran. Then check that `git diff --cached -- specs/features/registry.json specs/features/REGISTRY.md` contains only the `frontend-kit` hunks.
   6. **Commit:** `feat(frontend-kit): v0.1.0 — loading/error/offline/banner kits on web, iOS, Android (no adoption)`.
   7. **Tag:** `feature/frontend-kit@v0.1.0`.
   8. Make a separate `chore(skills)` commit for the git-version `LESSONS_ARCHIVE.md` append. No other feature is bumped.
   9. **Push** only on the user's OK. Afterwards, check `vercel ls` and fall back to a manual prod deploy if the build was cancelled. The web deploy is invisible.
   10. There is no mobile release now: the kit ships in the Phase 3 bundled release (D-13). Update `HANDOFF.md`.

## Risks the implementer must watch
- **Cross-track shared files.**
  - `registry.json`/`REGISTRY.md` are also edited by track C (app-config 0.2.0, including a `reference_impl` line that shifts the line numbers below it), and possibly by A. That is why D edits them only in step 29, anchored by content, after the clean-diff precondition.
  - Do not touch `apps/*/CONTEXT.md` (B documents env switches there) until step 26.
  - `AndroidManifest.xml` is D's only shared-config-like edit, and it is one line.
  - D never touches `config.ts`, `.env*`, `next.config.mjs`, `APIConfig.swift`, `Info.plist`, `project.pbxproj`, schemes or `build.gradle.kts`.
- **Worktrees are mandatory for D** (B builds in the same app trees). Implementers do not commit. Gates run in the worktree for web and Android, and again on main after the merge for all three surfaces. The iOS gate runs only on main.
- **Track C** must block unversioned Android with HTTP **426**. Mapping is by status only, so the body text and `code:"update_required"` don't matter.
- **No restyle.** Do not edit:
  - Web: `components/ui/{ErrorState,LoadingState,EmptyState}.tsx`, `globals.css`, `tailwind.config.ts`, `providers.tsx`, `client.ts`, `logs.ts` (only imported as a type).
  - iOS: `AppTheme.swift`, `APIClient*.swift`.
  - Android: `Color.kt`, `Theme.kt`, `ApiException.kt`, `Network.kt`, `Dtos.kt`.

  Also: nothing may start `NetworkMonitor`, instantiate `ConnectivityObserver`, touch `AppContainer.kt`, or render a kit component outside the step-25 throwaway. Step 24 enforces this.
- **iOS.**
  - The project uses default MainActor isolation in Swift 5 mode. Keep `monitor.start(queue: .main)` and add no `nonisolated`.
  - `AppError` and `FloatingBanner.Variant` are deliberately **not `Equatable`**, because `APIClient.BulkRowError` is not Equatable. Phase 3 can add a manual `==` if an animation needs it.
  - The local `resolved` in `fromHTTP` must not be renamed to `kind`.
  - `bottomInset` defaults to 0. The program picker needs `150` at adoption.
- **Kotlin.**
  - `toAppError()` rethrows `CancellationException`, so never wrap it in `runCatching` at adoption.
  - `onlineState(scope)` must not be renamed to `stateIn`.
  - `IconButton` uses its default 48dp size; don't shrink it.
  - At adoption, the program picker needs `Modifier.navigationBarsPadding()` plus `bottomInset = 146.dp`.
- **Web.**
  - The `+7.5rem` offset is tied to the pill-nav height (~82px) and the `/programs` FAB stack (108px). Recheck it if either changes.
  - Use z-40, not z-30. `<main>` is a z-10 stacking context that contains z-30 cards.
  - `className` cannot override `bottom-*`, because there is no tailwind-merge.
  - `AbortError` maps to timeout, so at adoption a non-TanStack unmount abort must not render an error.
  - `fromQuery` returns stale only when `isError && !isFetching`.
- **rowErrors (iOS gap until Phase 3).** A batch 409 is `conflict` on web and Android but `invalidInput` on iOS. The server text and row highlighting are the same, and both kinds are non-retryable. iOS `BulkWorkoutError` without rowErrors maps to unknown.
- **Copy parity is law (D-KIT-2).** Use ASCII apostrophes only, and no trailing period on banner strings. Any wording change edits all three copy files plus SPEC §3 in the same commit.
