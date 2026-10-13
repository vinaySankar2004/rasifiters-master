# Product: rasifiters / android (L2)

The RaSi Fiters Android app. Pure Jetpack Compose. Consumes the `backend` API. Built after `web` + `ios`,
as a faithful 1:1 port of the same app on the same backend contract.

**Provenance:** ported from the built `web` (Next.js) and `ios` (SwiftUI) surfaces — same 4-tab IA, same
DTOs, same endpoints. Deviations are Android-idiom only (Material 3 vs Cupertino, Health Connect vs
HealthKit, FCM vs APNs) and are recorded per-screen in `specs/pages/android/<screen>/SPEC.md`.

## Stack
- Jetpack Compose + Material 3 · Kotlin 2.0.21 · **minSdk 26, compile/targetSdk 36** · JDK 17 bytecode
- Architecture: one app-scoped `ProgramContext` state hub (`StateFlow`) — the analog of the iOS
  `ProgramContext` ObservableObject / web `AuthProvider`. Manual DI via `core/AppContainer`.
- Networking: **Retrofit + OkHttp + kotlinx.serialization**. Every client (main, refresh, SSE) sends the
  observability §4.1 headers (`X-App-Platform: android`, `X-App-Version`, `X-App-Build`) + a fresh `X-Request-Id`
  (`net/ClientHeaders.kt`). Requests time out at **15 s end to end** (`callTimeout`). Bearer from the one token store
  with a proactive + single-flight refresh (`net/TokenRefresher.kt`); a 426 opens the blocking update screen.
- Storage: tokens + identity in **EncryptedSharedPreferences** `rasi.fiters.session` = the ONE token store
  (`core/Session.kt`, a `StateFlow`; rotation is compare-and-set; only keyset / decrypt corruption resets it →
  `token_store_unreadable` + the sign-out notice; a transient failure keeps the file and the session is absent for that
  process).
  Appearance + the version-gate dismissal: `rasi.fiters.prefs`. Push registration + the one-time permission flag:
  `rasi.push`. Health Connect state: `rasi.health`, **per member** (`m.<memberId>.*`). `noBackupFilesDir`: `install_id`,
  `client_events.json` (observability queue), `launch_cache/` (instant opens). Auto Backup / device transfer exclude
  session, health and push (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`). DataStore is declared but unused.
- Real-time: SSE (okhttp-sse). Push: **FCM** (channels `rasi_default` + high-importance `rasi_invites`).
- applicationId / package: `com.app.rasifiters` (matches the iOS bundle-id root). URL scheme `rasifiters://`.
- Version: the next-out version is whatever `app/build.gradle.kts` says (`versionName` / `versionCode`);
  what is **live per channel** is tracked in `RELEASES.md` (the SoT — don't restate numbers here).
  Beta convention: bump `versionCode` per push; `versionName` moves only for production submissions.

## Build & toolchain
- **Pure-CLI build** (Claude runs it; iOS builds are the user's ⌘B in Xcode). Compile-check: `cd apps/android && ./gradlew
  :app:assembleDebug`. Install to a running emulator/device: `./gradlew :app:installDebug`. See the
  **`android-build`** skill for the loop.
- Toolchain already present on this Mac (2026-07-08): Android Studio, SDK (platform **android-36**,
  build-tools, adb, emulator), Temurin **JDK 21**. Gradle wrapper pinned to **8.11.1** (committed);
  `gradle` was brew-installed once only to generate the wrapper.
- `local.properties` (gitignored) carries `sdk.dir`. Base URL (`BuildConfig.API_BASE_URL`): **debug + release →
  prod** `https://rasifiters-api.onrender.com/api` (debug mirrors iOS's main scheme). **Staging is opt-in:** the
  `staging` build type (`initWith(debug)`; pick it in Android Studio's Build Variants panel, or
  `./gradlew :app:assembleStaging`) → `https://rasifiters-api-staging.onrender.com/api` (auth D-C13) — use it only
  for risky changes (migrations, auth/session); wake the staging API first (open its `/`, wait ~1 min) and sign in
  with a `+stg` staging account. Debug and staging builds share `com.app.rasifiters` with the Play build — uninstall
  the Play build first (signature mismatch). Local-backend testing is the exception: temporarily swap debug to
  `http://10.0.2.2:5001/api` (the emulator's alias for the host Mac's localhost).
- `adb` is not on PATH: `~/Library/Android/sdk/platform-tools/adb`. The user's Pixel 7 (Play build) is USB-debug
  authorized for this Mac — read-only `logcat` / `dumpsys` diagnostics only.
- **User-run (like iOS):** create an AVD (Device Manager → Pixel, **API 34+** system image — API 34+ ships
  Health Connect built-in) and run the visual/live checks. Claude compiles; the user verifies on device.

## Surface (screens — mirror web + iOS)
Splash · Login · CreateAccount · ForgotPassword · ProgramPicker (signed-in home) · per-program tab shell
(**Summary / Members / Lifestyle / Program**, admin + standard variants) · summary details (activity /
distribution / workout-types / log-workout / log-health) · member details (list/detail/metrics/history/
recent/health/streaks/invite) · lifestyle (timeline/workouts) · program settings (edit/roles/profile/
password/appearance/privacy + Health Connect settings) · two quick-add Glance widgets (`specs/pages/android/widgets/`).

## Auth (client side)
Supabase-Auth-proxied through the Express backend — **no Supabase SDK on the client** (same as web + iOS).
Mobile login = `POST /auth/login/app` (returns `member_id`); login + Google OAuth ride along `push_token` +
`device_id` (the install id) + `platform:"android"` (`push/DeviceRegistry`). `GET /auth/me` self-heals identity on
relaunch. Sessions (auth §3.1, reliability Phase 3 / 1.1.0):
- `net/TokenRefresher` — the one refresh path (interceptor, 401 authenticator, SSE): single-flight; proactive when the
  access token expires within 60 s (lifetime-based: `receivedAt + (exp − iat)`, clock-skew safe); one quick retry after
  `min(Retry-After ?: 2, 5)` s, then backoff 30 / 60 / 120 / 300 s; **sign-out only on `401 session_invalid`** —
  503 / 429 / 5xx / timeout / offline keep the session (`auth.refresh_failed` once per failure cycle).
- One teardown on every sign-out path (own sign-out revokes this device via `/auth/logout`; `session_invalid`;
  `logout-all`; delete account): unregister the device, clear state + launch cache, stop the stream, reset the refresher.
  A forced sign-out shows the kit `signedOut` copy once on Login.
- **"Sign out everywhere"** in My Profile (above Delete Account, every role) → `POST /auth/logout-all`.
- Password writes (`change-password`, `set-password`) are one-shot (never replayed by OkHttp); a 401 re-sends once;
  a timeout / 5xx says "couldn't confirm" (rule 6).
- Credential screens show the server's text for 400/401/409/422 on the public sign-in routes; authenticated routes map
  a 401 through the kit (`toCredentialMessage`). Google = `GetSignInWithGoogleOption` + nonce (raw nonce to `/auth/oauth`
  and `/auth/link`), mapped Credential Manager errors, `auth.sign_in_failed kind:provider`.

## Health (Samsung Health)
Via **Health Connect** (`androidx.health.connect:connect-client`) — the HealthKit analog. Since 1.1.0 it speaks
**health-sync v2** (`POST /health-sync/batch` + `GET|PUT /health-sync/state`); the old POST→409→PUT /
`on_duplicate:"sum"` paths are gone. One run per device (`health/HealthSyncRunner`): read → one item per workout
sample / sleep night / steps day × selected in-window, unlocked, non-excluded program → batches of ≤ 300 (halved on
413; legacy items first) → `PUT /state` (`sync_success` per (program, kind) minus held keys) → one `sync.run` event.
Workouts use the **Changes API** incl. deletions (`DeletionChange.recordId`); a missing / expired token reads the
**catch-up window** `max(last_success − 1 d, today − 30 d)` (first sync: connect date; a reconnect never reads before
the reconnect date); sleep / steps read the same catch-up window (first sync 14 d). Every read pages (`pageToken`).
**Review once:** the first-sync review shows only when no integration has `review_done_at`; `review_done` is sent
only after a user confirm (a 0-row first sync and a same-integration `last_success_at` confirm locally). D-LOCK holds
the token on `skipped_locked`. Upgrade from 1.0.0 (`health/HealthSyncUpgrade`): the old ledger's samples go up as
`legacy` items, the token is discarded once, the confirmed lists carry over as `review_done`. Disconnect keeps
exclusions + confirmed reviews and sends nothing. Triggers: `launch` / `foreground` / `program_entry` (≥ 60 s apart),
`connect` / `manual` / `pull_to_refresh` (wait for an in-flight run). A run is tied to its member (pinned store; it
aborts once the session moves on; sign-out cancels it). A revoked permission shows "Reconnect Health
Connect". **No background sync** (H-1 / D-6). Code: `health/*` + `ui/health/*`.

## Push + real-time
- FCM: `onNewToken` → `push/DeviceRegistry` (one serial queue; install id in `noBackupFilesDir/install_id`; `PUT /device`
  at most every 12 h unless the token / permission changed; `POST /device/unregister` — no login — on every sign-out
  and once when notifications are turned off). POST_NOTIFICATIONS is asked once, right after the first sign-in
  (settings fallback = the Notifications screen). A foreground FCM message is posted to the tray (on `rasi_invites` /
  `rasi_default`) only while the SSE stream is disconnected. A tap acknowledges; an invite opens the program picker's
  actions sheet on its invites tab, any other type re-fetches its data.
- SSE (`net/NotificationStreamClient`): foreground only (ON_START / ON_STOP); reconnect on every close / error with
  1 s × 2 backoff, 30 s cap, full jitter, paused while offline; 60 s idle timeout; `ready` resets the backoff and
  re-fetches `/unacknowledged` (recent acks filtered; an invite among them reloads the inbox).
- Invites: the ONE inbox is `GET /my-invites` (global admins `GET /all-invites` + Revoke), answered via
  `PUT /invite-response` (decline offers "Block future invites"); program cards no longer accept inline.

## Frontend kit (reliability Phase 3)
Program picker + Summary: this member's cached data first (`core/LaunchCache`, `noBackupFilesDir`, written only while
signed in, cleared by the teardown), then refresh; programs + invites load in parallel; Summary's 7 reads in
parallel (a partial failure keeps the parts that loaded); a first load that fails with no data → `ErrorView`; pull to
refresh on both. One app-wide connectivity monitor → one floating offline banner (picker: above the FABs; program
shell: above the nav bar; elsewhere at the bottom — the content gives up its height while it shows); stale →
"Couldn't refresh"; the picker also shows "update available". `core/VersionGate` reads `GET /app-config` on launch /
foreground / before a widget replay (≤ 3 s): below `min_android_version_code` or any 426 → the blocking
`ui/components/UpdateRequiredScreen` (plain Play Store intent, no in-app-update library). Observability events
(`auth.*`, `sync.run`) go through `core/events/ClientEventQueue` (persisted, batches ≤ 25, survives sign-out).

## Deploy
Android Studio → signed AAB → Google Play Console **closed testing** (went straight to closed, skipping
internal — no personal Android device) → **production, now LIVE** (the ≥12-testers / 14-days gate and the
production-access application are both cleared; current channel state + build numbers per `RELEASES.md`, the
SoT). Bump `versionCode` before every upload — the live production build's code is consumed. Health Connect
access needs a Play Console permissions declaration at submission. FCM push is wired end-to-end (backend
sender + `platform:"android"` registration, live since 2026-07-08).

## Status
🚀 **LIVE on the public Google Play Store (production, 2026-08-06).** The first Android production release
rolled out at 100% to 176 countries + rest of world; the repo is pre-bumped one train ahead for the next
upload. Version/channel specifics live in `RELEASES.md` (don't restate build numbers here).

🟢 **Reliability Phase 3, track C3 (2026-10-13): the 1.1.0 client release.** Sessions (one token store, the
`TokenRefresher` policy, one teardown, Sign out everywhere), health-sync v2 for Health Connect, push + SSE + the
invite inbox, the Google nonce flow, instant opens + kit adoption on the picker / Summary, the app-wide offline
banner and the version gate — see the Auth / Health / Push / Frontend kit sections above and the page SPECs.

🟢 **Phase H (2026-07-08, Run 14): Health Connect — workout + sleep auto-sync.** The Android analog of the
iOS `apple-health` feature, re-expressed on **Health Connect** (`androidx.health.connect:connect-client
1.1.0-alpha07`; new `health-connect` feature SPEC 0.1.0). New `health/` module: `HealthConnectManager`
(availability `getSdkStatus`, read auth via `PermissionController` — not a runtime dialog; **incremental
workouts via the Changes API** = the HKAnchoredObjectQuery analog, first sync `readRecords` from the connect
date; **rolling 14-day sleep window** via `readRecords`; aggregation), `HealthConnectWorkoutTypeMap`
(`ExerciseSessionRecord.EXERCISE_TYPE_*` → the library names `apple-health`'s migration `004` already seeded —
targets ⊆ the iOS map, verified), `HealthStore` (a plain `rasi.health` `SharedPreferences` = the
`UserDefaults` analog: workout/sleep settings + first-sync gating + the sum-on-conflict applied-sample
ledger), `HealthModels`/`HealthDates`/`HealthSyncNotifier`, and `HealthSyncController` — the four iOS
`ProgramContext+HealthKit{,Sleep,Windows}`/`+HealthSyncGating` extensions ported 1:1: single-flight
(`AtomicBoolean`), per-program date-window scoping **D-S5**, first-sync confirmation gating **D-CONF**,
admin-lock skip **D-LOCK**, sum-on-conflict + ledger **D-SUM**, silent auto-retry **D-SIL**, and the
status-code write classification (created/summed/duplicate/skipped/retryable). UI: `ui/health/
HealthConnectSettingsScreen` (workout + sleep toggles, program selection with locked non-selectable rows,
sync status + Sync Now + inline/passive error, disconnect) + `ui/health/HealthSyncConfirmationScreen` (one
program per page, checkable rows default-on, tick=commit-checked+advance, system-back=defer — a full-screen
overlay from `RootScreen`, the iOS `AppRootView` fullScreenCover analog). Wiring: `ProgramContext` gained
`isDataEntryLocked(programId)` + owns a `HealthSyncController` (constructed with `appContext`); `ApiService`
gained the raw status-code writes (`postWorkoutLog` / `postDailyHealthLogRaw` / `putDailyHealthLogRaw` →
`retrofit2.Response<Unit>` so 200/201/409/400-403-404 classify; the OkHttp Authenticator still does the 401
refresh); account rows on the Program tab + picker sheet → `Routes.HEALTH_CONNECT`; launch/auth (`RootScreen`
`LaunchedEffect(token)`), foreground (`ON_RESUME`), and program-entry (`AppScaffold`) sync triggers via
`health.onTrigger()`. Manifest: `health.READ_EXERCISE`/`READ_SLEEP` permissions, the
`com.google.android.apps.healthdata` provider `<queries>`, and the permissions-rationale intent-filters
(`SHOW_PERMISSIONS_RATIONALE` on MainActivity + a `ViewPermissionUsageActivity` alias). **No backend change,
no migration** — reuses the already-live `workout-logs` D-C9 (`on_duplicate:"sum"`) + the daily-health
POST-then-PUT-on-409 upsert. **Deviation H-1:** Health Connect has no HealthKit-style immediate background
delivery, so sync runs on app triggers (no OS-push background sync; a future `WorkManager` job could
approximate it). `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Thin SPEC
`specs/pages/android/health-connect/`. **Phase J (de-scaffold) DONE 2026-07-08 — `ui/StubScreen.kt` deleted.**

🟢 **Phase I (2026-07-08, Runs 10–11): notifications — in-app SSE + FCM push.** I-b (FCM) built on top of I-a:
Firebase project `rasi-fiters` (user-provisioned; `google-services.json` gitignored — public repo, sole
builder), google-services plugin + `firebase-messaging` (BOM 33.7.0), `push/RaSiFirebaseMessagingService`
(`onNewToken`→register; `onMessageReceived` no-op — the SSE modal owns foreground), a `rasi_default` channel
(`App.onCreate`), `POST_NOTIFICATIONS` runtime request (`RootScreen`, Android 13+), device-token registration
(`ProgramContext.registerPushTokenIfNeeded`/`onNewPushToken` → `PUT /notifications/device` `platform:"android"`,
deduped; sign-out `DELETE /device`). **Backend delta (DEPLOYED + push verified to the Pixel_8 tray):**
`utils/pushNotifications.js`
gained a `firebase-admin` FCM sender fired alongside APNs by `sendPushToMembers`; `authService.upsertPushToken`
+ the login/`PUT /device` routes thread a `platform` param (**default `"ios"`** so the LIVE iOS binary is
unchanged); `FIREBASE_SERVICE_ACCOUNT` (base64) already on Render `sync:false`; **no migration** (the
`platform` column pre-existed). `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. **I-a below.**

🟢 **Phase I-a (2026-07-08, Run 10): in-app real-time notifications (SSE + modal queue).** The in-app half of
the `notifications` feature. New `net/NotificationStreamClient.kt` (okhttp-sse `EventSource`,
`GET /notifications/stream`, Bearer header, `readTimeout(0)`; restart-on-resume recovery, no internal
reconnect loop — iOS parity) + `ui/components/NotificationModal.kt` (Compose `Dialog`, neutral surface +
orange OK). `ProgramContext` gained a `baseUrl` ctor param + the notification state (`notificationQueue`) +
`start/stopNotificationStream`, `loadUnacknowledgedNotifications`, `acknowledgeNotification` (optimistic,
re-backfill on failure), `enqueueNotification`, `refreshDataForNotification` (invite → `loadPrograms`;
membership/program change → `loadPrograms` + `loadMembershipDetails`). `net` gained `NotificationDTO` +
`GET /notifications/unacknowledged` + `POST /notifications/{id}/acknowledge`; `RootScreen` mounts the modal
queue as an app-root overlay (iOS `AppRootView` ZStack analog) + drives the stream lifecycle on the auth token
+ `ON_RESUME`. No Gradle change (okhttp-sse already declared). Single-notification modal QUEUE (web F7),
optimistic acknowledge (F8). `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Thin SPEC
`specs/pages/android/notifications-alerts/`. Next: **Phase I-b (FCM push) or Phase H (Health Connect)**.

🟢 **Pre-Phase-H cleanup (2026-07-08, Run 9).** User-reported fixes + a 4-tab functional audit, before the
next phase. (1) **Background standardized** — the faint orange gradient lived only on the auth screens; every
screen now uses the **solid theme background** (auth included). The gradient brush was removed. (2) The picker
**"+" now works** — new `ui/programs/ProgramActionsSheet.kt` (My Invites / Create segmented sheet); Create →
`POST /programs` (`createProgram` on ApiService + ProgramContext + `CreateProgramRequest/Response`), reloads
the list; invites reuse the loaded-list Accept/Decline. Tab-content region pinned to a fixed height so the
sheet doesn't resize between tabs. (3) The picker **account sheet is wired** — Profile/Change-Password/
Appearance/Notifications navigate to the real settings screens (registered in `SignedInGraph`, reusing the
Program-tab screens); the dead **Health Connect** row was removed (matches `ProgramAccountSection`; still
Phase H/J). (4) **Edge-back**: on any of the 4 main tabs, system back / left-edge-swipe pops straight to the
picker (`AppScaffold` `BackHandler`). **Audit fixes:** member workout/health log Edit+Delete now surface
mutation errors (were `onSuccess`-only); the workout log form clears a row's stale server error on edit; the
member workout-history detail resets the shared timeline to "week" on leave (new
`ProgramContext.resetMemberHistoryToWeek`); the **Lifestyle load is now sequenced like iOS** — the admin
"View as" default is applied before the first `loadLifestyle`, so program-admins no longer see a brief
program-wide flash (a `loadedOnce`-gated effect handles later picks without double-fetching).
`./gradlew :app:assembleDebug` = BUILD SUCCESSFUL.
Next: **Phase H (Health Connect) / Phase I (SSE + FCM)**.

🟡 **Phase G COMPLETE (2026-07-08).** The **Program tab (Tab 4)** + its settings/admin sub-routes are ported
+ green (`ui/program/`). Role-bifurcated on `isProgramAdmin`: **standard** = read-only Program Info card
(client date math) + Switch + Leave + My Account; **admin/global-admin** = Program Info action section
(Select/Edit/Leave) + Members (View/Invite) + Role Management (if canEdit) + Workout Types + My Account. Sub-
routes: **My Profile** (name/gender edit + password-confirmed email change + delete account), **Change
Password** (live 5-rule policy), **Appearance** (System/Light/Dark → new `core/AppearanceStore` wired into
`MainActivity`/`RaSiFitersTheme`), **Notifications** (OS-status card + Open-Settings deep link), **Edit
Program** (name/status/dates/admin-lock, no-op skip), **Manage Roles** (segmented Admin/Logger/Member +
last-admin guard + per-row spinner). `net` gained `MemberDTO` + the account/program mutation DTOs + 7
endpoints (`GET/PUT members/:id`, `PUT auth/change-password`, `PUT auth/email`, `DELETE auth/account`,
`PUT programs/:id`, `PUT program-memberships/leave`); `ProgramContext` gained the account actions +
`updateProgram`/`leaveProgram`/`updateMemberRole` + a `loggedInGender` seed. Members/Workout-Types sections
reuse the Phase E `MEMBER_ROSTER`/`MEMBER_INVITE` + Phase F `LIFESTYLE_WORKOUT_TYPES` routes (no new screens).
Deviations: Apple-Health account row omitted (Health Connect = Phase H/J, user-confirmed); Switch/Leave →
`popBackStack(PICKER)`; dialogs not alerts. 7 thin SPECs under `specs/pages/android/`.
`./gradlew :app:assembleDebug` = BUILD SUCCESSFUL (Run 8). Next: **Phase H (Health Connect) / Phase I
(SSE + FCM)**.

_(Phase E, 2026-07-08:)_ The **Members tab (Tab 2)** + **all 8 detail screens** are ported +
green (`ui/members/`). Role-bifurcated tab body on `isProgramAdmin` (admin: Invite + metrics preview +
View-as picker [global-admin "None" / program-admin auto-self] + 5 member cards; logger/member: own cards
+ logger logs-only view-as). Details: metrics table (search + Sort/Filter sheets, server-driven, CSV) ·
Workout History (W/M/Y/P chart) · Streak Stats (tiles + ✓ milestone ladder) · View Workouts + View Health
(per-row ⋮ Edit/Delete + sort/filter + CSV, `admin_only_data_entry` lock hides mutations) · Invite
(privacy-safe) · roster (searchable; global-admin → editor) · member editor (joined-date + active + remove).
`net` gained the member DTOs + 12 endpoints (DELETE-with-body + a metrics `@QueryMap`); `ProgramContext`
gained `isProgramAdmin`/`loggedInUserProgramRole` + focused-member slot + 8 loaders + 7 writes (health
update via `JsonObject` so explicit-null clears survive `explicitNulls=false`). New **FileProvider**
(`res/xml/file_paths.xml`) for CSV export. Deviations: per-row ⋮ (not swipe); minutes filter fields; the
invite/roster/editor cluster (nominally Phase G) lit up now for the Members entry points. Thin SPECs under
`specs/pages/android/`. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Next: **Phase F (Lifestyle).**

_(Phase D-landing, 2026-07-08:)_ The **Summary dashboard** (Tab 1 of the shell) is ported +
green: `ui/summary/{SummaryScreen,SummaryCards,SummaryCharts}.kt`. Program-progress ring (server
`progress_percent` + client date math) + status pill; MTD Participation / Total Workouts / Total Duration /
Avg Duration metric cards (change badges); Canvas activity-timeline (bars + active-members line) +
distribution-by-day charts; Top Workout Types (top 5 + Others, dot palette); two gradient action cards.
Web-parity error banner (D-C1) + `admin_only_data_entry` data-lock (D-C2). `ProgramContext` gained
`summary`/`summaryLoading`/`summaryError` + `dataEntryLocked` + `loadSummary()`; `net` gained 7 analytics
DTOs + `SummaryData` + 7 GET endpoints; theme gained secondary accents + `ChartPalette`/
`workoutTypePaletteColor`. Android-idiom deviations A-1..A-4 (no card reorder; signed-in-user avatar per web;
`ProgramDTO` progress source; Canvas charts). The 5 forward targets (activity/distribution/workout-types
detail + log-workout/log-health forms) are `StubScreen` routes per the iOS D-SCOPE. Thin SPEC
`specs/pages/android/summary/`. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Next: **Phase D details.**

_(Phase C, 2026-07-08:)_ The **program-picker** (signed-in home / "My Programs") is ported +
wired + green. New `ui/programs/{ProgramPickerScreen,AccountMenuSheet}.kt`; `ProgramContext` gained
programs/activeProgram state + `loadPrograms`/`moveProgram`/`persistProgramOrder`/`deleteProgram`/
`respondToInvite`/`selectProgram`; `net/{Dtos,ApiService}` gained `ProgramDTO` + order/membership DTOs + 4
endpoints (`GET /programs`, `PUT /programs/order`, `DELETE /programs/:id`, `PUT /program-memberships`).
`RootScreen` now routes token→**picker**→shell (`SignedInGraph`) — the first authenticated screen, so it
exercises the Bearer header + 401 authenticator + `GET /auth/me` self-heal against live data. Faithful to
the iOS/web SPECs (cards, role gating, inline invites, delete, account sheet, floating "+" badge) incl. the
D-C1 error banner + D-N1 drag-reorder/search; Android-idiom deviations (overflow-⋮ Edit/Delete, long-press-
drag reorder, `ModalBottomSheet` account sheet) in the thin SPEC `specs/pages/android/program-picker/`.
Forward-nav (create/edit, account destinations) deferred per iOS D-SCOPE. `./gradlew :app:assembleDebug` =
BUILD SUCCESSFUL. Next: **Phase D** (Summary tab + details). See the plan + `PROGRESS.md`.

_(Phase B, 2026-07-08:) Logged-out auth path — `ui/auth/{AuthComponents,SplashScreen,LoginScreen,
CreateAccountScreen,ForgotPasswordScreen}.kt` + `core/AppLinks.kt`; brand mark assets; `AuthGraph` runs the
real splash→login→create-account/forgot-password flow; 4 auth stubs deleted. Login = `POST /auth/login/app`._

_(Phase A, 2026-07-08:) Foundation green — Gradle project, DI (`AppContainer`), state hub (`ProgramContext`),
session/Keychain (`Session`), Retrofit/OkHttp + 401 authenticator, auth DTOs, Material 3 theme, bottom-nav
scaffold._

### Scaffold-removal — CLOSED (Phase J, 2026-07-08)
The scaffold is fully de-scaffolded. Every screen was ported in order (each stub deleted as its real screen
landed): Splash/Login/CreateAccount/ForgotPassword (B) · Summary landing (D) · Summary details + log forms
(D details) · Members tab + details (E) · Lifestyle (F) · Program/settings (G). `StubScreen(...)` call-sites
in `ui/shell/AppScaffold.kt` reached **0** at Phase G, and **Phase J deleted the now-unused
`ui/StubScreen.kt` file itself** — no scaffold placeholder remains anywhere in `apps/android`. Notes:
Phase C added the program-picker (a NEW screen preceding the shell — removed no stub); Phase H added the
Health Connect settings + first-sync confirmation (NEW account-reached screens — removed no stub); Phase E
lit up the invite/roster/member-editor cluster that Program-tab (G) then reused with no rework.
