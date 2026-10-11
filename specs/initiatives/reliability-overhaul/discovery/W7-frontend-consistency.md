# W7 — Frontend state / error / design consistency (Phase 0 discovery)

> Read-only evidence brief, 2026-10-11. Code at `main` (20e014f). All paths are relative to `apps/`. Abbreviations:
> `PC` = iOS `Shared/Models/ProgramContext*.swift` (suffix = extension) or Android `core/ProgramContext.kt`; `API` = iOS
> `Shared/Services/APIClient.swift`. Line numbers were checked against the files.

## 1. Summary

- **None of the three surfaces has a shared async-state model.** Web uses TanStack Query (44 `useQuery`) with default config, and its 3 shared state components have no retry. iOS has one **global** `errorMessage`/`isLoading` that almost no screen reads. Android has a 1,269-line `ProgramContext` singleton with no ViewModel, and 29 screen reads discard their `Result`.
- **Failures are mostly silent: an error looks like empty data.** Affected: web Members (0 of 7 query errors shown) and Lifestyle (0/8); iOS and Android Members, Lifestyle and Program. **No retry button anywhere.** Pull-to-refresh only in 3 iOS sections.
- **Raw error text reaches users:** the server's `error` string, the browser's "Failed to fetch", iOS `URLError` text, the Kotlin `IOException` message ("Unable to resolve host …").
- **None of the three has** offline detection, a timeout policy, an on-device cache, or guarding against late responses. Loads run serially: iOS Summary 8 calls, Android Summary and Lifestyle 7 each. **S9 is confirmed on web and Android:** any failed refresh (network or 5xx) signs the user out; iOS only on 401/403.
- **W2 lead:** Android reads pending invites from a different table than web and iOS (§6).

## 2. How it works today

| | Web (Next.js) | iOS (SwiftUI) | Android (Compose) |
|---|---|---|---|
| **Client** | `fetch`, no `AbortSignal` and no timeout (`web/src/lib/api/client.ts:40-49`) | `URLSession.shared`, default 60 s timeout (`API:18,24`) | OkHttp defaults, 10 s connect/read/write, no call timeout (`net/Network.kt:32-36`) |
| **Error type** | `ApiError{message,status,details}` (`client.ts:3-11`). A network failure is a raw `TypeError` that is not wrapped (`client.ts:40`) | `APIError{message}` with **no status code** (`API:3-6`). `APIHTTPError{statusCode}` is only thrown by refresh (`APIClient+Auth.swift:192`). `URLError` and `DecodingError` pass through raw | `ApiException{status,message,rowErrors}` (`net/ApiException.kt:8-12`). Only `HttpException` is mapped (`PC:1245-1246`); IO and serialization exceptions pass through raw |
| **Where the message comes from** | Server `error`, else `message`, else `"Request failed (N)"` (`client.ts:86-96`) | Same rule (`API:92-95,152-157`) | Same rule (`ApiException.kt:30`) |
| **Async-state model** | TanStack Query v5, `new QueryClient()` with no options (`app/providers.tsx:9`): 3 retries (about 7 s before an error shows, even on 403/404), always stale, refetch on focus. Auth forms, invite and the log forms use `useState` | One `ObservableObject` with about 90 `@Published` fields. Global `isLoading` (`PC.swift:95`) and `isOffline` (`:99`) are read by no view. `errorMessage` (`:96`) is written 49 times, copied by 6 views and shown by 3. Screens keep their own `@State` flags | 34 `MutableStateFlow`s; loaders return `kotlin.Result`. `_summaryLoading` and `_lifestyleLoading` (`PC:550,1018`) are never collected. The only error flow is `_summaryError` (`PC:553`). `runCatching` also catches cancellation (`PC:583`) |
| **Cache** | In-memory, keyed per `programId`. Keys don't include the user, and the cache is never cleared on sign-out (there is no `queryClient.clear`) | In-memory `@Published` only | In-memory flows. The roster is cached once per program (`PC:774-776`) |
| **Dedup / cancel** | TanStack deduplicates by key. Nothing is cancelled | `.task` auto-cancels (30 uses). But 19 `.onChange { Task {} }` are never cancelled, and `guard !isLoading` **drops** newer requests (`AdminSummaryTab.swift:147`) | `LaunchedEffect` cancels on leave. No guard against late responses: `selectProgram` only sets `_activeProgram` (`PC:393-395`) |
| **401 handling** | One shared refresh, then one retry (`client.ts:27-34,51-84`) | Refreshes early when within 300 s of expiry, plus refresh-and-retry on 401 (`API:52-90`). If the retry itself fails, that error is swallowed and the original 401 message is shown instead (`API:85-95`) | Single-flight synchronized `Authenticator` (`Network.kt:79-103`) |
| **Shared UI kit** | `ui/LoadingState`, `ErrorState`, `EmptyState`, 9 lines each; `ErrorState` takes no retry (`ErrorState.tsx:3`). No `error.tsx` boundary under `app/` | No Loading/Error/Empty views. `AppCard`, `AppGlassCard`, `AppSectionHeader` and `AppSettingsRow` have **0 consumers**. `AppPrimaryButton` is used in 7 files | `PillButton` (`ui/auth/AuthComponents.kt:309`) and `FormErrorText` (`ui/summary/DetailChrome.kt:114`). No loading or empty component; `SkeletonCard` is defined inside a screen file (`MemberMetricsDetailScreen.kt:218`) |

## 3. Screen × surface matrix

Key: **L** = loading, **E** = empty, **Err** = error, **R** = refresh. **SILENT** means an error renders as empty or stale data. **STUCK** means a loading indicator that never ends. No screen on any surface handles offline (see §4 F6).

| Screen | Web | iOS | Android |
|---|---|---|---|
| Summary | 8 parallel queries. L: "—" and one "Loading…" [w1]. E: "No workouts logged yet." also shows on error. Err: raw text for **1 of 8** queries [w2]. R: refetch on focus | **8 serial** loads [i1]. L: none at tab level. E: chart cards show spinner + "No data yet" **STUCK** [i2]. Err: raw banner; errors from earlier loads are wiped by a later success [i3] | **7 serial** loads [a1]. L: none. Err: raw banner [a2]; data from the previous program is kept on failure |
| Members tab | 7 queries, **SILENT** (0 of 7 errors read). Metrics subtitle "Loading…" **STUCK** on error [w3] | Admin: an unstructured `Task`, no L, **SILENT** [i4]. Standard: `ProgressView`; `errorMessage` is set but never shown [i5] | 5 serial loads whose results are discarded [a3], **SILENT**. Standard: spinner. The previous member's data stays after a "View as" switch |
| Member detail | `members/list`: L, E and Err all use the shared components [w4] (the only fully consistent screen). Health/workouts query errors **SILENT** | Grey-box "skeletons". Health loader returns `[]` on failure, so an error looks empty [i6]. Mutation errors shown as alerts | Skeleton only when the list is empty [a4]. Load **SILENT**. Mutation errors shown as dialogs |
| Lifestyle | 8 queries, **SILENT**: errors display as "N/A" / "—" [w5] | Error copied but never shown [i7], **SILENT**. Spinner used as the empty state, **STUCK** [i8] | 7 serial calls, all-or-nothing; the `Result` is ignored [a5], **SILENT**. L: none |
| Program mgmt | Query errors show as "0 active" and "No admins or loggers assigned" [w6], **SILENT** | Load errors **SILENT**. **The only pull-to-refresh in the app** (3 sections) [i9] | 3 loads discarded [a6], **SILENT** |
| Picker + invites | Error **and** "No programs yet" render together [w7]. Invite errors raw | Error and empty can show together. A failed invite load shows as "No pending invitations" [i10] | Dismissable raw banner **plus** "No programs yet" [a7] |
| Notifications | Every error swallowed; the token is sent in the SSE query string [w8] | Stream errors ignored [i11] | A failed acknowledge quietly re-fetches [a8] |
| Profile / settings | No L. If loading linked accounts fails, it shows "Password: Enabled" / "Google: Not linked" as if they were true [w9] | Read failures caught with empty `catch` blocks [i12] | Same false defaults, e.g. `hasPassword = true` [a9] |
| Sign-in | Inline box with raw text, hard-coded `red-*` colors [w10] | Raw text in an alert [i13] | Raw text in a dialog, including IO messages [a10] |

[w1] `web/src/app/summary/page.tsx:209` · [w2] `:65-111,165-167` · [w3] `members/page.tsx:291` · [w4] `members/list/page.tsx:52-56` · [w5] `lifestyle/page.tsx:221-281` · [w6] `program/page.tsx:154,188` · [w7] `programs/page.tsx:301-311` · [w8] `components/NotificationsGate.tsx:72,140,170,188,196,154` · [w9] `program/profile/page.tsx:197,368` · [w10] `login/page.tsx:192-196`
[i1] `Features/Home/Tabs/AdminSummaryTab.swift:146-160` · [i2] `SummaryChartCards.swift:92-99` · [i3] `PC+Analytics.swift:138` · [i4] `AdminMembersTab.swift:126-128`, `PC+Members.swift:82-273` · [i5] `StandardMembersTab.swift:9,163` · [i6] `PC+Members.swift:246-249` · [i7] `AdminWorkoutTypesTab.swift:147` · [i8] `WorkoutTypesCards.swift:268-272` · [i9] `MemberManagementSection.swift:106`, `RoleManagementSection.swift:221`, `WorkoutTypesSection.swift:145` · [i10] `InvitesTabView.swift:46-56`, `PC+ProgramManagement.swift:124-126` · [i11] `PC+Notifications.swift:20` · [i12] `MyProfileView.swift:283,386` · [i13] `LoginView.swift:148-154`
[a1] `PC:578-598` · [a2] `ui/summary/SummaryScreen.kt:81,165` · [a3] `ui/members/MembersScreen.kt:103-112` · [a4] `MemberRecentDetailScreen.kt:138` · [a5] `PC:1056-1071`, `LifestyleScreen.kt:67-75` · [a6] `ProgramScreen.kt:71-77` · [a7] `ProgramPickerScreen.kt:139,147-151` · [a8] `PC:456-462` · [a9] `ProfileScreen.kt:90` · [a10] `LoginScreen.kt:51-58`

**Duplicate implementations (counts)**
- **Web:** 29 hand-written "Loading…" strings (summary, members, lifestyle, program and programs never use `LoadingState`). 45 uses of `text-rf-danger` against 13 of `ErrorState`. 52 places show a raw `err.message`.
- **iOS:** 31 loading `ProgressView`s in 4 patterns. 4 private error banners and 7 private empty states. 64 uses of `localizedDescription`.
- **Android:** 6 loading patterns. 2 different private `ErrorBanner`s (`SummaryScreen.kt:165`, `ProgramPickerScreen.kt:477`) and 4 private empty states. About 40 places show `it.message ?: …`.

## 4. Failure modes

| # | Trigger → mechanism → symptom | Likelihood |
|---|---|---|
| F1 | A read fails → the error is discarded (web: `isError` never read; iOS: global `errorMessage` that no view reads; Android: `Result` thrown away) → the screen shows zeros or "No data", which the user takes as real | **High.** This is the default on all three |
| F2 | Network blip during token refresh → web `auth-provider.tsx:90-95` / Android `Network.kt:113,117-119` → session cleared → "randomly logged out" | **High.** Every app open after more than 1 h hits a refresh (S6/S8) |
| F3 | Error or empty data → never-ending spinner: iOS `SummaryChartCards.swift:94`, `WorkoutTypesCards.swift:270`; web `members/page.tsx:291` → "doesn't load" | High for new or empty programs |
| F4 | Program or member switch → no guard against a late response; Android keeps old flows (`PC:393-395`) → previous program's or member's numbers appear under the new name | Medium |
| F5 | iOS period change or refresh-token bump while a load is running → `guard !isLoading` drops it (`AdminSummaryTab.swift:147`) → data for the old period, or no refresh after a save | Medium |
| F6 | Offline → web: browser shows "Failed to fetch" after about 7 s of retries; Android: raw "Unable to resolve host…"; iOS: alert only during launch/foreground refresh (`AppRootView.swift:164-178`), and its promise "We'll reconnect" has no reconnect logic behind it | High on mobile data |
| F7 | Slow link (India/Tanzania) → serial loading on mobile (8 × 300 ms ≈ 2.5 s, iOS Summary) with no loading UI → a blank-looking tab | High worldwide |
| F8 | Android tab switch during `loadSummary` → `runCatching` catches the cancellation → the cancellation text becomes `_summaryError` (`PC:595`) | Low. Inferred from the code, not reproduced |
| F9 | Web render exception → no `error.tsx` → Next.js's generic "Application error" page | Low |

## 5. Suspect notes for W1 (S9)

Every place where an error causes sign-out or navigation:

- **Web:** any refresh failure clears the session (`auth-provider.tsx:90-95`), as does an expired stored token plus a failed refresh at bootstrap (`:108-119`). `useAuthGuard` then pushes `/login` (`use-auth-guard.ts:19-23`). No `?reason` is set, so the "session expired" message (`login/page.tsx:39-40`) never shows on this path.
- **Android:** `refreshBlocking` returns `null` on any non-2xx or any exception (`Network.kt:113,117-119`) → `session.clear()` + `onAuthFailure` (`:92-96`) → `PC:338-340` → `RootScreen.kt:108-112` shows the login graph.
- **iOS:** a second 401 on retry, or a 401/403 from refresh, calls `authFailureHandler` (`API:78-80,85-88`) → `signOut()` (`PC+Auth.swift:30-34`). The foreground refresh retries once on 401/403, then calls `signOut()` (`:105-116`); network errors are treated as offline instead (`:98-104`).
- **Not S9 (user actions or deliberate):** account delete and the sign-out buttons (web `programs/page.tsx:553`, iOS `ProgramPickerView.swift:198`, Android `ProgramPickerScreen.kt:282`).

## 6. Cross-surface divergences

- **Pending invites come from different sources (W2 lead).** Web and iOS list `program_invites` via `GET /program-memberships/my-invites` (`web/src/lib/api/invites.ts`, `APIClient+Invites.swift:71`) and answer via `invite-response`. Android derives invites from `GET /programs` filtered to `my_status ∈ {invited, requested}` (`ProgramActionsSheet.kt:83`) and "accepts" via `PUT /program-memberships` (`PC:385-391`). The backend invite flow creates only a `ProgramInvite`, never a membership (`backend/services/inviteService.js:64-73`), so such an invite likely **never appears on Android**. This matches BRIEF §3: the invitee saw no in-app invite.
- **Brand colors differ per surface:**

  | | Web | iOS | Android |
  |---|---|---|---|
  | Accent | `#ff8b1f`, dark `#ff9c3a` (`globals.css:15,39`) | system `.orange`, dark `FFB347` (`AppTheme.swift:55`) | `#F5761A` in both themes (`Color.kt:7`) |
  | Danger | `#ef4444` | `.red` / `FF6B6B` (`:69`) | `#E5484D` (`:17`) |
  | Background | `#f4f3f7` / `#070809` | white / black (`:103`) | `#F7F7F8` / `#0E0F11` (`:38,42`) |
- **Tokens:** web has color tokens only (`tailwind.config.ts:11-29`). iOS has `AppSpacing`/`AppTypography`/`AppCornerRadius`, but Features use them 37/0/16 times against 697 raw paddings, 638 raw fonts and 129 inline `RoundedRectangle` cards. Android has stock M3 `Typography()` (`Type.kt:6`), no spacing tokens, and 863 raw `.dp`.
- **Same case, different presentation:** errors are an inline box (web), an alert or banner (iOS), a dialog or banner (Android). Success is a Snackbar only on Android (`AppScaffold.kt:86-89`).
- **Timeouts and fetch strategy:** none / 60 s / 10 s. Web loads in parallel; iOS and Android load serially.

## 7. Industry-standard target (contract, not a plan)

1. **One async-state type per surface:** `Idle | Loading(previous?) | Loaded(data, fetchedAt) | Empty | Failed(AppError, previous?)`.
   - **Web:** TanStack Query everywhere, with a configured `QueryClient`: no retry on 4xx, at most 2 on network/5xx, a set `staleTime`, user-scoped keys, `clear()` on sign-out, `signal` passed to `fetch`.
   - **iOS:** a per-screen `@Observable` loader holding `LoadState<T>`, driven by `.task(id:)` so a new request cancels the old. No global `errorMessage`.
   - **Android:** a ViewModel per screen with `StateFlow<UiState>`, `stateIn(WhileSubscribed)` and `collectLatest`; never catch `CancellationException`.
2. **One error taxonomy for all surfaces:** `offline | timeout | unauthorized | forbidden | notFound | conflict | validation(rowErrors) | server | decoding | unknown`. Each maps to one human message per surface; raw server text only for `validation`. Only `unauthorized` (a definitive 401 after refresh) may sign out.
3. **Offline and cache:** one connectivity monitor (`NWPathMonitor` / `NetworkCallback` / browser `online`/`offline`) driving one persistent banner. Stale-while-revalidate from an on-device cache (TanStack persister / disk / Room or DataStore). Explicit timeouts of about 15 s. Independent loads in parallel (`async let` / `coroutineScope { async }`).
4. **Shared kit per surface:** `LoadingView`/skeleton, `EmptyView(message, action?)`, `ErrorView(error, retry)`, `OfflineBanner`, toast/snackbar, pull-to-refresh on every data tab, one card/button/banner, and color/spacing/type/radius tokens with one brand palette across the three.

## 8. Constraints

- New UI must fit cleanly and be responsive, on web mobile **and** desktop. Error and offline banners must not restyle pages; they stay collapsed or floating until needed.
- "Standardize" means bringing the odd screens in line with the majority style. iOS follows the current web app. Android keeps its neutral M3 surface palette and its single shared chart tooltip, and every chart keeps a tooltip.
- **Live binaries:** iOS 1.4.2 (56) on the App Store and Android 1.0.0 (4) on Play (`RELEASES.md`) keep today's behavior until users update. Any backend error-envelope change must be additive (keep `error` and `message`, then add `code`).
- The target is mostly client-side; today's `{error|message}` envelope is enough to build the taxonomy from status codes. Fixing the invite divergence (§6) needs an Android release.

## 9. Open questions for the user

1. Should one brand accent and danger color be adopted across all three surfaces, and if so whose: web `#ff8b1f`, iOS system orange, or Android `#F5761A`?
2. On error, show the last good data with a banner (SWR style), or replace the content with an error view?
3. Is on-device caching between app launches in scope for Phase 2, or only in-memory caching for the session?
4. Should Android's success Snackbar become a cross-surface pattern (toasts on web and iOS too)?
5. Should the invite flow keep reporting "Invitation sent" when the server returns 4xx/5xx? All three surfaces do today: web `members/invite/page.tsx:37-45`, iOS `InviteMemberView.swift:161-172`, Android `PC:999-1007`. It is deliberate privacy behavior, but it also hides real 5xx errors and timeouts, which matters for W2. The alternative is to keep it for 4xx and show an error for 5xx and timeouts.
