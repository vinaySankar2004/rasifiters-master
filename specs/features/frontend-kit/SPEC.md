# Feature: `frontend-kit` — shared loading / error / offline / banner kit (web + iOS + Android)

> **Status:** 🧩 adopted (Phase 3 client release: web live; iOS 1.5.0 (58) + Android 1.1.0 (5) built — 🚀 deployed once
> both store builds are live) · **Version:** 0.6.0 ·
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
adopts them on the touched screens (0.2.0 — D-KIT-13–15). 0.5.0 adds the notification **toast** (D-KIT-20) and the
Phase 4 screens to the adoption list. 0.6.0 (Phase 4 polish #9–#45) adds the one detail-load helper per surface
(D-KIT-21), tap targets + labels (D-KIT-22), keyed state (D-KIT-23) and web dialogs (D-KIT-24).

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
`refreshing()`) · error → failed · a failed try while TanStack still retries (`failureCount > 0`) → failed with
`failureReason` (D-KIT-18, 0.4.0) · paused with no data → failed(offline) (never an endless spinner) ·
pending + not fetching → idle · else loading.
Connectivity = **link up AND not proven offline** (D-KIT-16, 0.3.0): the link signal (web `navigator.onLine`; iOS
`NWPathMonitor` `.satisfied`; Android `NET_CAPABILITY_INTERNET`) plus request evidence — a no-connection failure flips
to offline at once, any network answer or a probe of `GET /api/app-config` (at once, then every 10 s while
foreground) flips back. One monitor per app, started once at launch.

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

**Toast (D-KIT-20, 0.5.0) — the one exception to the bottom rule.** The notification toast sits at the **top**, under
the status bar / safe area (the bottom band already holds the nav, FABs and the offline / stale banners): `<title>`
(blank → `New notification`) · `View` · ×, FloatingBanner chrome, max 520 wide, tap targets ≥ 44pt / 48dp.

ErrorView = `errorViewTitle` + the message + a Retry pill (only if a handler is given and retryable).
Adoption recipe — web: `const s = fromQuery(q)`; `failed` → `<ErrorView error={s.error} onRetry={() => retryNow(queryClient, key)} />`
(D-KIT-18 — a bare `refetch()` can't cut a live retryer's backoff short);
`stale` → `<FloatingBanner variant="stale" onRetry={() => q.refetch()} />`. iOS: screen root
`.floatingBanner { if case .stale = state { FloatingBanner(variant: .stale, onRetry: reload) } }`. Android, inside
the screen's `Box`: `FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = ::reload)`.
Detail screens and sections use the packaged helper instead (D-KIT-21, 0.6.0).

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
Web muted text (`--rf-text-muted`, light) is `#646a76` app-wide since 0.6.0 (was `#7c828e`; polish #43, user decision U1 —
about 4.9:1 on the page background).

## 8. Files per surface
- **web:** `src/lib/kit/{copy,app-error,async-state,use-online-status}.ts`, `src/components/kit/{FloatingBanner,ErrorView,QueryView}.tsx`
  (QueryView 0.6.0, D-KIT-21); dialogs `src/components/ui/{Modal,ConfirmDialog}.tsx` (D-KIT-24)
- **ios:** `Shared/Kit/{KitCopy,AppError,LoadState,NetworkMonitor,FloatingBanner,ErrorStateView,OfflineBanner,LoadStateContent}.swift`
  (LoadStateContent 0.6.0, D-KIT-21), `Shared/Components/TapTarget.swift` (D-KIT-22), `Shared/Theme/AppPalette.swift`
- **android:** `core/kit/{KitCopy,AppError,UiState,ConnectivityObserver}.kt`, `ui/components/kit/{FloatingBanner,ErrorView,KitLoad}.kt`
  (KitLoad 0.6.0, D-KIT-21), `ui/components/TapTarget.kt` (D-KIT-22), `core/theme/Palette.kt`; `AndroidManifest.xml` declares `ACCESS_NETWORK_STATE`
- **The toast (D-KIT-20, 0.5.0)** lives beside its notifications code on each surface: web
  `src/components/notifications/NotificationToast.tsx` (gated in `src/components/NotificationsGate.tsx`), iOS
  `Shared/Views/NotificationToast.swift`, Android `ui/inbox/NotificationToast.kt` (gated in `ui/RootScreen.kt`)

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
- **D-KIT-7 Link-level connectivity on all three** *(superseded in part at v0.3.0 by D-KIT-16: the link is now only
  half of the signal)* (Android: `NET_CAPABILITY_INTERNET`, NOT `VALIDATED`) so
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
  *0.6.0 additions (Phase 4 polish; user decision U3, amendments PA4):* the **in-flight indicator** — web `…`, iOS a
  spinner per card (`PlaceholderCard`), Android a spinner per section — while `—` (spoken `Unavailable` on iOS) means a
  **settled failure** on all three; a failed picker lookup on iOS shows the full ErrorStateView where web and Android show
  the compact InlineLoadError (same title, message and Retry); the #16 empty-picker hint also lives **inside the picker
  sheet** on the phones (iOS `SearchablePickerSheet(emptyHint:)`, Android `SearchablePickerField(emptyHint:)`); tap
  targets 44 pt vs 48 dp (D-KIT-22).
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
  - **Adoption list += the Phase 4 screens (0.5.0):** the Members tab (the S5 recipe — [member-analytics](../member-analytics/SPEC.md)
    D-C12), the People list and person profile ([people](../people/SPEC.md)), the Inbox, the Notifications settings
    (and web's composer page) — ErrorView + Retry only when nothing for this screen has loaded, kept data + `Couldn't
    refresh` · Retry on a failed refresh, `—` for a failed part, reload on reconnect, never another program's or
    member's values.
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
  in `useLaunchSeed`'s effect (never in render — no hydration mismatch). **iOS:** the root `.floatingBanner` in `AppRootView` at inset 0, with a `safeAreaInset` of 76 pt on both
  NavigationStacks while offline so every screen's content, tab bar and FABs sit above it; a screen's banner goes
  through `ScreenBanner` (hidden while offline); picker banner
  priority = action error > stale > update-available. **Android:** the offline banner in `RootScreen` with per-screen
  placement + a content reserve (picker list clearance 238 dp + the nav-bar inset); Summary merges a partial failure
  with `—` placeholders (no longer fails all seven reads); `core/LaunchCache.kt`; the blocking
  `ui/components/UpdateRequiredScreen.kt`.
- **D-KIT-16 Offline = no real reachability, not just no link (0.3.0; reliability-overhaul polish 1,
  `plans/polish-1-offline-detection.md`).** `isOnline = linkUp && !provenOffline`. *Proven offline* is set by a request
  that fails with a no-connection error — iOS `URLError` notConnectedToInternet · networkConnectionLost · cannotFindHost
  · cannotConnectToHost · dnsLookupFailed · internationalRoamingOff · dataNotAllowed; Android `UnknownHost` · `Connect`
  · `NoRouteToHost` · `PortUnreachable` (cause chain included); web a `fetch` `TypeError` that isn't our own timeout
  abort. **Timeouts and TLS failures are not offline.** It clears on any real network answer (cacheable `/app-config`
  answers excluded), on a link down→up change, or on a probe — `GET /api/app-config` bypassing the HTTP cache, 5 s
  timeout, **at once and then every 10 s** while proven offline, the link is up and the app is in the foreground (web:
  tab visible); iOS also probes at once on a path change while proven offline. Everything keyed on connectivity (the
  banner, screen-banner suppression A6, refresh-backoff reset A3, SSE pause A4, refetch on reconnect D-KIT-13 —
  Android's launch screens now do it too) uses the combined value. With no data while offline the launch screens show
  the offline error view, never a spinner. Web: queries don't auto-retry while offline. Why: the user's iPhone in
  airplane mode (a USB developer link kept the path "satisfied") showed a spinner and never the offline banner.
- **D-KIT-17 Presentations carry the offline banner (0.4.0; reliability-overhaul Phase 4 polish #2).** A sheet / cover
  sits above the app root, so the root banner (D-KIT-13 A6) can't show over it. **iOS:** `.offlineBanner()`
  (`Shared/Kit/OfflineBanner.swift`) applied once at the presented root, inside `.environmentObject(programContext)` —
  the "+" sheet (`ProgramActionsSheet`), the widget covers (`WidgetCoverView`) and the Apple Health review
  (`HealthSyncConfirmationView`) — and, since 0.5.0, the root Inbox sheet (`Shared/Views/NotificationToast.swift`); while
  offline it reserves the root's 76-pt band (bottom `safeAreaInset`), and the "+" sheet's ~~Invites~~ **Inbox** (0.5.0,
  `InboxView(reservesOfflineBand: true)`) + Create tabs add offline-only 116-pt bottom spacers (the inset isn't relied
  on to reach a paged `TabView`'s pages). **Android:** the "+" sheet (`ProgramActionsSheet.kt` — `FloatingBanner` + the tab area gives up
  `OFFLINE_BANNER_RESERVE`, 76dp — the Inbox + Create tabs since 0.5.0) and the Health Connect review overlay
  (`RootScreen` — `offlineReserve` 76dp + the banner). **Invites reload on reconnect on both** (iOS `InvitesTabView` after a failed load; Android the picker's
  reconnect effect reloads a failed / stale inbox beside the program list), and a failed inbox reads offline while
  offline on all three (polish-1 rule 6). Web has no sheets or widgets, so the banner part is n/a there.
- **D-KIT-18 Web fails fast; Retry retries (0.4.0; polish #4 + #6).** `fromQuery` returns `failed`
  (`toAppError(failureReason)`) after the **first** failed try (`failureCount > 0`) while TanStack keeps retrying quietly — never a
  "Loading…" that waits out every retry (~48 s on a stuck link). The kit `retryNow(queryClient, key)`
  (`async-state.ts`) cancels a live retryer (no data + fetching) before refetching, so Retry works mid-retry (a bare
  `refetch()` only resumes the retryer's backoff); programs, invites and Summary use it, and Summary's Retry also
  covers queries with `failureCount > 0`. Mutations use `networkMode: "always"` (`providers.tsx`), so an offline save
  fails at once with the kit offline copy instead of pausing on "Saving…". Scope: the `fromQuery` screens (programs,
  Summary); ~~detail pages keep `isLoading` / `isError` until polish #29~~ *(since 0.6.0 the detail pages too, through
  `QueryView` — D-KIT-21)*.
- **D-KIT-19 Every user-facing save / load error goes through the kit (0.4.0; polish #8 sweep).** Web
  `toAppError(e).message` (reset-password: `credentialErrorMessage` except its 401 "link expired" branch); iOS
  `SessionCopy.kitMessage(for:)` for user actions and `AppError(error)?.message` for `ProgramContext` loads (`nil` →
  a cancelled load stays silent); Android `toAppError().message` (rethrows `CancellationException`). The server's
  useful text survives for 400 / 422 and row-error batches (D-KIT-3) — no raw OS / "Failed to fetch" text. The
  program-order failure reads "Couldn't save program order. <kit message>" on all three.
- **D-KIT-20 The notification toast (0.5.0; reliability-overhaul Phase 4 — NP amendments R3; an explicit exception to
  D-KIT-8's bottom placement, the same answer on all three).** Copy `<title>` (blank → `New notification`) · `View` · ×
  (labelled `Dismiss`); **top** placement under the status bar / safe area; max 520 wide; FloatingBanner chrome; tap
  targets ≥ 44pt / 48dp; **5 s**; the newest replaces the previous; `View` marks the item read and routes it
  (notifications §3.9 rule 8); ×, the timeout (and iOS's swipe up) only hide it — the item stays unread; shown only if
  `categories[item.category] !== false` (missing preferences or an unknown key → show); **never over a modal / sheet /
  cover, never while the Inbox is on screen** — a suppressed toast is dropped, not queued; announced politely to screen
  readers (web `role="status"` + `aria-live="polite"`). Per surface: **web** — top-centre, z-40 outside `<main>`; a modal
  is any `.modal-surface` or `[aria-modal='true']` element (watched live — the "+" sheet that hosts the Inbox is one);
  also never on the page-form routes `/program/profile`, `/program/password`, `/program/edit`, `/members/detail`,
  `/program/announcements` (cleared when one opens). **iOS** — width capped at `formMaxWidth`; suppressed while an
  `InboxView` is visible or anything is presented (`isPresentingModal`); the one notice presenter on `AppRootView`
  yields to covers and returns. **Android** — suppressed while `inboxVisible`, while a form is open (`ROOT_FORMS` +
  `SHELL_FORMS` + a non-blank "+" sheet Create draft) or while a cover is up (a cover counter: the Health Connect
  review, the account menu, the "+" sheet); not composed during the update screen or the Health Connect review; it
  sits under `ModalBottomSheet` windows (the item still lands in the Inbox).
- **D-KIT-21 One detail-load helper per surface (0.6.0; reliability-overhaul Phase 4 polish #29 / #34, amendments PA9).**
  Every detail screen, section and the Lifestyle tab put a load on the five states through ONE helper — the Summary recipe
  for one read: idle / loading → the screen's placeholder; **no data while offline → the offline ErrorView, never a
  spinner** (PA9); failed → ErrorView + Retry (offline-labelled while offline); loaded / stale → content, stale adds
  `Couldn't refresh` · Retry (hidden while the global offline banner shows, A6) with its band reserved; a failed / stale
  read reloads on reconnect (D-KIT-13). One part of a form or card whose read failed shows the compact **InlineLoadError**
  (`Couldn't load this` + the message + Retry when retryable) — never an empty list or a guessed value. **Keyed:** a load is
  keyed on every input (period, member, sort, filters, committed search, program); a key change resets it to loading and a
  result for an older key is dropped; a Retry keeps the data (stale); detail screens own their results and never write
  shared app state (shared state = D-KIT-23). **Web** `src/components/kit/QueryView.tsx`: `QueryView({ query, queryKey,
  loadingMessage })` over `fromQuery` (so detail pages fail fast too, D-KIT-18) + `retryNow` + `useRefetchOnReconnect`;
  `InlineLoadError({ error, onRetry })`; render at page level, never inside a `.glass-card`; on 13 detail pages
  (summary/{activity, distribution, workout-types}, members/{history, streaks, workouts, health, detail, metrics},
  program/roles, lifestyle/{timeline, steps-timeline, workouts}). **iOS** `Shared/Kit/LoadStateContent.swift`:
  `LoadStateContent(state:onRetry:placeholder:content:)`; `.loadStateChrome(_:actionError:onDismissError:onRetry:)` once
  at the screen root — ONE banner, a failed action (dismissable `.error`, polish #9) beating stale, the 76-pt band, reload
  on reconnect; `loadOutcome { … }` (`nil` = cancelled / superseded) + `state = state.applying(outcome)` on the state as it
  is **after** the await, dropped when the screen's key changed; a key change resets via `.onChange(of: key)` and
  `.task(id: key)` loads. **Android** `ui/components/kit/KitLoad.kt`: `rememberLoad(keys…) { … }` (a `LoadHandle`; a new key
  starts fresh — never the previous key's data; `reload()` cancels a load in flight; a failed reload keeps data as Stale),
  `KitLoad(…)` (Loaded and Stale in one branch, so a refresh keeps scroll / selection), `InlineLoadError`,
  `BoxScope.KitStaleBanner`, `RefetchOnReconnect`. **Supersedes** wave-A amendment QA6 (the iOS metrics queued reload):
  the key-drop rule replaces it ([member-analytics](../member-analytics/SPEC.md) D-C9).
- **D-KIT-22 Tap targets + labels (0.6.0; polish #36, amendments PA1 / PA12).** Every tappable control is at least **44 px
  (web) / 44 pt (iOS) / 48 dp (Android)**; icon-only controls carry a spoken label; segments, chips and toggle rows announce
  their selected state. Labels (PA1): `Show password` / `Hide password` · `Remove entry N` · `Back` · `Week` `Month` `Year`
  `Program` · `Program actions` / `Program actions, N new` · `Invite member` · `View members` · `Workout types`. **Web:**
  `BackButton`, `Button` size `sm` and `PeriodSelector` (`role="group"`, `aria-pressed`, full-name labels) are `min-h-[44px]`;
  password toggles `inline-flex min-h-[44px] items-center px-2`; the log-form mobile Remove pill `min-h-[44px] px-4 text-sm`;
  small pills grow `text-xs` → `text-sm`. **iOS** `Shared/Components/TapTarget.swift`: `.minTapTarget(alignment:)` (a 44 × 44
  minimum frame + `contentShape`) on a Button's label after its drawn chrome — the drawn shape keeps its size; fixed-size
  controls in tight rows give the growth back with negative padding (the eye, ✕, the widget back circle); text-sized chips
  grow their row (role chips +8 pt, invite buttons +4 pt, Cancel request +12 pt — accepted); `GlassButton(label:)`.
  **Android** `ui/components/TapTarget.kt`: `Modifier.tapTarget(label, role, enabled, shape, onClick)` first in the chain
  (M3 `minimumInteractiveComponentSize`); `compactTapTarget(footprint, …)` keeps the old visual footprint while the 48 dp
  target overflows it (rows don't move); `selectableTarget` (segments, selected announced) and `toggleTarget` (checked
  rows); segmented controls are 48 dp.
- **D-KIT-23 Keyed state (0.6.0; polish #10 / #31 / #34, amendments PA6).** A program or View-as change resets every affected
  view to loading **in the same event as the pick** — never a frame (or, offline, forever) of the previous program's or
  member's numbers; a pick is never lost (also one made during the first load); a result for an older key is dropped;
  shared member loaders publish only if the program is unchanged and the member is still the focused / selected one.
  **iOS:** `ProgramContext.resetProgramScopedData()` (`ProgramContext+ProgramSwitch.swift`; the picker calls it only when the
  program changes) clears the Members-tab cards, `membershipDetails`, Summary's fields and `programWorkouts`; member loads
  are cancellable tasks (cancelled on a member switch and `onDisappear`); the Lifestyle tab keeps its own
  `LoadState<LifestyleSnapshot>` keyed by (program, member) (`ProgramContext+Lifestyle.swift`, 7 parallel reads, no shared
  writes); the admin View-as `onChange` sets `.loading` on a key change; default scope = `selectedMember?.id ??
  (!hasUserChosenViewAs && !isGlobalAdmin ? loggedInUserId : nil)` (no roster needed). **Android:**
  `ProgramContext.resetProgramScope()` clears the program-scoped flows on a switch (per-member flows on a View-as change;
  new program-scoped teardown goes here, not in `clearSession`); writes land only for the active program + session
  (`afterWorkoutWrite(pid, …)`, `loadAllProgramWorkouts`, `loadMembershipDetails`; the member loaders publish only while
  `stillActive(pid)`); the Members cards render only data whose held key (`memberCardsHeld`, program + member) matches; `setLifestyleViewAs` resets the state to `Idle` + `lifestyleKey = null` and the View-as effect gates on
  `lifestyleDefaultedFor == pid` (`core/LifestyleData.kt`). **Web:** the TanStack query keys carry program + member. The
  iOS Members-tab placeholders are People S5's ([member-analytics](../member-analytics/SPEC.md) D-C12).
- **D-KIT-24 Web dialogs (0.6.0; polish #37 / #9; web only — the phones use native sheets and alerts).**
  `src/components/ui/Modal.tsx`: the panel is `role="dialog"` + `aria-modal="true"`, labelled by its first heading; focus
  moves into it on open (unless a child already took it) and returns to the opener on close; **Escape closes the topmost
  open modal only**, decided on `event.target` (ignored when the key came from outside the panel — a portaled Select search
  box — and while an IME composition is cancelled, `event.isComposing`) and never with `closeOnEscape={false}` (Summary's
  two desktop bulk-log modals); `modal-open` stays while any modal is open. `ConfirmDialog` keep-open mode
  (`closeOnConfirm={false}`): the dialog stays open while the action runs (`loadingLabel` on the disabled confirm), shows the
  failure inside (`errorMessage`, `role="alert"`) and the caller closes it on success; while it runs nothing closes it
  (Cancel, Escape, backdrop). **Recorded debt:** no Tab trap (Tab can leave the panel); `Select.tsx` should own its own
  Escape (and stop removing `modal-open` while a Modal is open).

## 10. Not in 0.6.0 / open
Loading skeleton, empty view (board §6.6); spacing/type/radius tokens; Next.js `error.tsx`; web: the TanStack
query `signal` is not combined with the request's own 15 s abort (the fetchers take no signal); web `Modal` has no Tab
trap and `Select.tsx` doesn't own its Escape (D-KIT-24 debt). Delivered in 0.2.0
(D-KIT-13): `QueryClient` defaults, the 15 s timeout, the on-device cache (D-9), the offline banner (it replaced iOS's
"You're offline. We'll reconnect…" alert), pull-to-refresh on the launch screens (iOS + Android), the Android blocking
update screen. Delivered in 0.5.0 (D-KIT-20): the toast. Delivered in 0.6.0 (D-KIT-21): web detail pages on
`fromQuery` through `QueryView`.

## 11. Changelog
- **v0.6.0** (2026-10-13) — **D-KIT-21** the one detail-load helper per surface (web `QueryView` / `InlineLoadError`; iOS
  `LoadStateContent` / `loadStateChrome(actionError:onDismissError:onRetry:)` / `loadOutcome` / `applying`; Android `KitLoad`
  / `rememberLoad` / `InlineLoadError` / `KitStaleBanner` / `RefetchOnReconnect`; no spinner offline with no data — PA9;
  keyed, older results dropped; QA6 superseded); **D-KIT-22** tap targets 44 px / 44 pt / 48 dp + labels + selected state
  (iOS `TapTarget.swift`, Android `TapTarget.kt` incl. `compactTapTarget`); **D-KIT-23** keyed state on a program / View-as
  change (PA6); **D-KIT-24** web dialogs (Modal semantics, topmost-only Escape on `event.target` + IME skip, focus return,
  `closeOnEscape`, ConfirmDialog keep-open; Tab trap + `Select.tsx` Escape = debt); **D-KIT-11** additions (U3 in-flight
  idiom, "—" only after a settled failure; PA4 iOS full error view; the #16 hint inside the phones' picker sheet); D-KIT-18
  scope extended to the web detail pages; §7 web `--rf-text-muted` `#646a76` (U1); §1 / §6 / §8 / §10 updated. No
  copy-table change. **MINOR** (new rules + `reference_impl` path). Reliability-overhaul Phase 4 polish #9–#45 (web
  `ec13107` live; iOS `05e185a` / Android `0b0a0a3` built).
- **v0.5.0** (2026-10-13) — **D-KIT-20** the notification toast (top — an exception to D-KIT-8; 5 s; `View` marks read +
  routes; category gate; never over a modal / sheet / cover or the Inbox; per-surface suppression rules); D-KIT-13
  adoption list += Members tab, People, person profile, Inbox, Notifications settings; D-KIT-17 wording — the "+"
  sheet's **Inbox** + Create tabs and iOS's root Inbox sheet carry the offline banner; §6 / §8 / §10 updated (the toast
  leaves the open list). No copy-table change. Reliability-overhaul Phase 4 Notifications + People client builds.
- **v0.4.0** (2026-10-13) — **D-KIT-17** offline banner on presentations (iOS `.offlineBanner()` on the "+" sheet,
  widget covers and Apple Health review; Android on the "+" sheet and the Health Connect review; invites reload on
  reconnect); **D-KIT-18** web `fromQuery` fails after the first try, `retryNow`, mutations `networkMode: "always"`;
  **D-KIT-19** the kit-message sweep. §5 / §6 web recipe / §8 (iOS `OfflineBanner.swift`) / §10 updated. No copy-table
  change. Reliability-overhaul Phase 4 Track Q quick wins (polish #2 / #4 / #6 / #8).
- **v0.3.0** (2026-10-13) — **D-KIT-16**: offline = link up AND not proven offline (request evidence + an
  `/app-config` probe at once then every 10 s) on all three; D-KIT-7 superseded in part; Android launch screens refetch
  on reconnect; D-KIT-15 iOS line corrected (root safe-area inset, no per-screen inset plumbing). Polish 1.
- **v0.2.0** (2026-10-13) — **adopted** (reliability-overhaul Phase 3 client release — web live, iOS 1.5.0 (58),
  Android 1.1.0 (5)); status built → adopted. D-KIT-13 adoption rules (global offline banner, launch screens on the five
  states + partial failures + pull-to-refresh, per-member launch cache written only while signed in, 15 s timeout, web
  `QueryClient` defaults, picker-only update banner, `code` / `Retry-After` capture — D-KIT-5 closed); D-KIT-14
  credential-screen messages (§4 scope rule superseded: a 401 on an authenticated credential route is `signedOut`);
  D-KIT-15 per-surface realization; §10 updated (web TanStack `signal` deferral). No copy-table change.
- **v0.1.0** (2026-10-12) — kits on web / iOS / Android (async state, error vocabulary, connectivity,
  floating banner, error view, palette tokens); no screen adoption — reliability overhaul Phase 2 track D.
