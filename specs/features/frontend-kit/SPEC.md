# Feature: `frontend-kit` — shared loading / error / offline / banner kit (web + iOS + Android)

> **Status:** 🧩 adopted (Phase 3 client release: web live; iOS 1.5.0 (58) + Android 1.1.0 (5) built — 🚀 deployed once
> both store builds are live) · **Version:** 0.2.0 ·
> **Apps (`consumed_by`):** `web` `ios` `android`
> **Provenance:** net-new — reliability overhaul Phase 2 track D. Contract = [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md)
> §6 (W7) + W7-D1 (one palette = web's) + W7-D2 (keep data + "Couldn't refresh — Retry"); evidence =
> [`discovery/W7-frontend-consistency.md`](../../initiatives/reliability-overhaul/discovery/W7-frontend-consistency.md).
> **Depends on:** `workout-logs` + `daily-health-logs` (imports their `BulkRowError` row types only; it *labels* the [`auth`](../auth/SPEC.md) 0.10.0 envelope — `401 session_invalid`,
> `503 auth_unavailable` + `Retry-After` — without importing auth code). **Reference impl:** web
> `src/lib/kit/` + `src/components/kit/`; iOS `Shared/Kit/` + `Shared/Theme/AppPalette.swift`; Android
> `core/kit/`, `ui/components/kit/`, `core/theme/Palette.kt`.

---

## 1. What it is
One small, self-contained kit per surface: a five-state async model, one error vocabulary with one human
message per kind, a connectivity monitor, a floating banner (offline / stale / error / update-available), an
error-with-no-data view, and the shared palette tokens. Phase 2 shipped the kits only; the Phase 3 client release
adopts them on the touched screens (0.2.0 — D-KIT-13–15).

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
| timeout | 408; web `TimeoutError` / `AbortError`; iOS `URLError.timedOut`; Android `InterruptedIOException` (incl. `SocketTimeoutException`) and coroutine `TimeoutCancellationException` (checked **before** the cancellation rule below) | yes |
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
`retryAfter` = whole non-negative seconds from `Retry-After`, at most 2147483647 (Int32 — Android's `Int`
range; web and iOS clamp to match); an HTTP-date or a larger value → none. The kit **never signs
anyone out** — sign-out policy is the sessions contract (DESIGN_BOARD §2 client rule 3).
**Scope rule — credential endpoints:** ~~on login, sign-up, OAuth, link/unlink, set/change password and the
email re-auth, a 401 means *wrong credentials* — those screens keep the server's own text and do not route a 401
through `signedOut`~~ — superseded at v0.2.0 by D-KIT-14: the server's text for 400 / 401 / 409 / 422 only on the
**public sign-in** routes; on the authenticated credential routes a 401 is the ended session (auth D-C15d) → `signedOut`.

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
**Screen readers** announce the message politely: web `role="status"` + `aria-live="polite"`; Android
`Modifier.semantics { liveRegion = LiveRegionMode.Polite }` on the banner `Surface` (re-announced when the text
changes); iOS posts a VoiceOver `.announcement` of the message `onAppear` (once per appearance — a variant
change while it stays on screen is not re-announced).
**Placement + clearance (D-KIT-8):** bottom, above the tab bar / bottom nav, never in a header, **never over
bottom-anchored controls**.
- Web bakes the clearance in: fixed, `bottom = nav offset + 7.5rem` clears the pill nav and the `/programs`
  mobile FAB stack on every page; z-40 = over in-page z-30 cards, under modals / menus (z-50+). Render it at
  the page root, never inside a `.glass-card`, `backdrop-blur`, `transform` or `filter` ancestor — any of those
  becomes the containing block for `position: fixed` and pins the banner to that box instead of the viewport.
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
  *(Adoption half superseded at v0.2.0 by D-KIT-13; the existing tokens stay untouched — D-KIT-10.)*
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
  Android caveat: `ProgramContext.asApiError()` turns `HttpException` into `ApiException`, dropping `Retry-After`,
  and `sendProgramInvite` rethrows an `IOException` as `ApiException(0)` → unknown, not offline — so Phase 3
  adoption maps the raw throwable, or `ApiException` gains `retryAfter`.
  *(Superseded at v0.2.0 by D-KIT-13: `code` / `Retry-After` are captured on all three — web `ApiError`, iOS
  `APIHTTPError` (status, `code`, `retryAfter`, `requestId`), Android `ApiException.retryAfter`.)*
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
- **D-KIT-13 Adoption (0.2.0) — the same rules on all three** (Phase 3 client release; approval amendments A6, A7,
  A13, A14 in [`phase-3-client-amendments.md`](../../initiatives/reliability-overhaul/plans/phase-3-client-amendments.md)).
  - **Offline banner is global (A6):** one connectivity monitor → one floating banner at the app root, lifted above
    the visible screen's bottom chrome; while it shows, a screen's own stale / error / update banner hides (offline
    wins) and lists get extra bottom room.
  - **Launch screens (program picker + Summary)** run on the five states: instant open from the launch cache, then the
    network; `failed` → ErrorView + Retry; `stale` → content + `Couldn't refresh` · Retry; refetch on reconnect.
    Partial failures keep the parts that loaded and never show fake zeros (a missing value is `—`); the error view never
    sits over another program's or zero values (A13). Pull-to-refresh on both screens on iOS + Android; a Summary pull
    reloads now, syncs health in the background, and reloads again if the sync applied data.
  - **Launch cache (D-9, A14):** per member — the last good program list + per-program Summary; written only while a
    session exists (a response that lands after a sign-out is dropped); cleared by the sign-out teardown; invites are
    never cached (a stale invite would 404 on accept). Web `localStorage` `rasi.fiters.cache.<member>:` (schema v1, Summary
    entries for the member's 10 most recently loaded programs); iOS `Caches/launch-cache/` (raw 2xx bodies); Android
    `noBackupFilesDir/launch_cache`.
  - **15 s request timeout** on all three (web `fetch` abort, iOS `timeoutIntervalForRequest`, Android `callTimeout`).
    Web `QueryClient` defaults: queries retry at most twice and only on a retryable kind (never a 4xx other than
    408 / 429), waiting `Retry-After` (≤ 30 s) else exponential to 30 s; mutations never auto-retry.
  - **Update-available banner:** the program picker only (A7 — [`app-config`](../app-config/SPEC.md) D-C7).
  - **Capture:** `code` / `Retry-After` on every error (closes D-KIT-5); web `parseRetryAfter` lives in
    `lib/api/client.ts`, re-exported from `app-error.ts`.
- **D-KIT-14 Credential-screen messages (0.2.0; supersedes the §4 scope rule).** Public sign-in routes (login,
  sign-up, `/oauth`, `/oauth/complete`): the server's text for 400 / 401 / 409 / 422, the kit copy otherwise.
  Authenticated credential routes (link / unlink, set / change password, email re-auth): 400 / 409 / 422 keep the
  server's text (so the link 409 collision text survives), a 401 is the ended session → `signedOut` (auth D-C15d), the
  rest the kit copy. No response while offline → the offline copy. Web `credentialErrorMessage(error, "signIn" |
  "account")`; iOS `SessionCopy.credentialMessage` (sign-in, link / unlink, email — a 401 there shows the server's own
  "Session expired. Sign in again to …" text) and `kitMessage` (password writes, profile save); Android
  `toCredentialMessage`. A Google provider failure on web shows the kit `unknown` copy (A8).
- **D-KIT-15 Per-surface realization (0.2.0; platform idiom only).** **Web:** the offline banner sits in `app/shell.tsx`
  outside `<main>` + a spacer while offline; pages hide their stale banner while offline; the launch cache is read only
  in `useLaunchSeed`'s effect (never in render — no hydration mismatch). **iOS:** the root `.floatingBanner(bottomInset:
  floatingBannerInset)` in `AppRootView` — the visible stack publishes its inset (picker FAB stack 150, AdminHomeView's
  tab bar 64, pushed screens 0) and a root `safeAreaInset` reserves 76 pt on every screen while it shows; a screen's
  banner goes through `ScreenBanner` (hidden while offline); picker banner
  priority = action error > stale > update-available. **Android:** the offline banner in `RootScreen` with per-screen
  placement + a content reserve (picker list clearance 238 dp + the nav-bar inset); Summary merges a partial failure
  with `—` placeholders (no longer fails all seven reads); `core/LaunchCache.kt`; the blocking
  `ui/components/UpdateRequiredScreen.kt`.

## 10. Not in 0.2.0 / open
Loading skeleton, empty view, toast (board §6.6); spacing/type/radius tokens; Next.js `error.tsx`; web: the TanStack
query `signal` is not combined with the request's own 15 s abort (the fetchers take no signal). Delivered in 0.2.0
(D-KIT-13): `QueryClient` defaults, the 15 s timeout, the on-device cache (D-9), the offline banner (it replaced iOS's
"You're offline. We'll reconnect…" alert), pull-to-refresh on the launch screens (iOS + Android), the Android blocking
update screen.

## 11. Changelog
- **v0.2.0** (2026-10-13) — **adopted** (reliability-overhaul Phase 3 client release — web live, iOS 1.5.0 (58),
  Android 1.1.0 (5)); status built → adopted. D-KIT-13 adoption rules (global offline banner, launch screens on the five
  states + partial failures + pull-to-refresh, per-member launch cache written only while signed in, 15 s timeout, web
  `QueryClient` defaults, picker-only update banner, `code` / `Retry-After` capture — D-KIT-5 closed); D-KIT-14
  credential-screen messages (§4 scope rule superseded: a 401 on an authenticated credential route is `signedOut`);
  D-KIT-15 per-surface realization; §10 updated (web TanStack `signal` deferral). No copy-table change.
- **v0.1.0** (2026-10-12) — kits on web / iOS / Android (async state, error vocabulary, connectivity,
  floating banner, error view, palette tokens); no screen adoption — reliability overhaul Phase 2 track D.
