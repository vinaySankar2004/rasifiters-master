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
- Networking: **Retrofit + OkHttp + kotlinx.serialization**. Bearer header on every request + a
  single-flight 401 refresh in an OkHttp `Authenticator` (mirrors the iOS `APIClient`).
- Tokens in **EncryptedSharedPreferences** (Android Keystore-backed — the Keychain analog); session/prefs
  in DataStore.
- Real-time: SSE (okhttp-sse) — Phase I. Push: **FCM** — Phase I.
- applicationId / package: `com.app.rasifiters` (matches the iOS bundle-id root). URL scheme `rasifiters://`.
- Version: `versionName` 1.0.0, `versionCode` 1. Beta convention (Play internal testing): bump
  `versionCode` per push; `versionName` moves only for production submissions.

## Build & toolchain
- **Pure-CLI build** (no MCP needed, unlike iOS). Compile-check: `cd apps/android && ./gradlew
  :app:assembleDebug`. Install to a running emulator/device: `./gradlew :app:installDebug`. See the
  **`android-build`** skill for the loop.
- Toolchain already present on this Mac (2026-07-08): Android Studio, SDK (platform **android-36**,
  build-tools, adb, emulator), Temurin **JDK 21**. Gradle wrapper pinned to **8.11.1** (committed);
  `gradle` was brew-installed once only to generate the wrapper.
- `local.properties` (gitignored) carries `sdk.dir`. Base URL (`BuildConfig` field): **both debug and
  release → `https://rasifiters-api.onrender.com/api`** — we always develop/test against the **main live
  backend** (Render → live Supabase Auth/DB), even in dev. Local-backend testing is the exception:
  temporarily swap debug to `http://10.0.2.2:5001/api` (the emulator's alias for the host Mac's localhost).
- **User-run (like iOS):** create an AVD (Device Manager → Pixel, **API 34+** system image — API 34+ ships
  Health Connect built-in) and run the visual/live checks. Claude compiles; the user verifies on device.

## Surface (screens — mirror web + iOS)
Splash · Login · CreateAccount · ForgotPassword · ProgramPicker (signed-in home) · per-program tab shell
(**Summary / Members / Lifestyle / Program**, admin + standard variants) · summary details (activity /
distribution / workout-types / log-workout / log-health) · member details (list/detail/metrics/history/
recent/health/streaks/invite) · lifestyle (timeline/workouts) · program settings (edit/roles/profile/
password/appearance/privacy + Health Connect settings). Widgets (Glance) deferred.

## Auth (client side)
Supabase-Auth-proxied through the Express backend — **no Supabase SDK on the client** (same as web + iOS).
Mobile login = `POST /auth/login/app` (returns `member_id`, accepts `push_token`+`device_id`).
`GET /auth/me` self-heals identity on relaunch. `POST /auth/refresh` rotates the refresh token — persisted
each time. 401 → single-flight refresh + one retry, else sign-out.

## Health (Samsung Health)
Via **Health Connect** (`androidx.health.connect`) — the HealthKit analog. Reads `ExerciseSessionRecord`
→ `POST /workout-logs` (idempotent applied-ledger, `on_duplicate:"sum"`) and `SleepSessionRecord` →
`daily-health-logs` upsert. Per-program toggles, data-lock aware. Phase H. New `health-connect` feature
spec (parallels iOS `apple-health`, which stays iOS-only).

## Deploy
Android Studio → signed AAB → Google Play Console **internal testing** (TestFlight analog) → closed test
(≥12 testers / 14 days, one-time for personal accounts) → production. Health Connect access needs a
permissions declaration. Push (FCM) needs the net-new backend `platform:"android"` + FCM sender (Phase I).

## Status
🟡 **Phase E COMPLETE (2026-07-08).** The **Members tab (Tab 2)** + **all 8 detail screens** are ported +
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

### Scaffold-removal tracker (temporary — folds away by Phase J)
Stub screens live in `ui/StubScreen.kt` usages. Deleted as real screens land:
~~Splash/Login/CreateAccount/ForgotPassword (Phase B — DONE)~~ · ~~Summary landing (D — DONE)~~ ·
~~Summary details + log forms (D details — DONE)~~ · ~~Members tab + details (E — DONE)~~ · Lifestyle (F) ·
Program/settings (G). Remaining `StubScreen(...)` call-sites in `ui/shell/AppScaffold.kt`: **2** bottom tabs
(Lifestyle/Program). By Phase J: zero remain. _(Phase E also lit up the invite/roster/member-editor cluster
that nominally belongs to the Program tab (G) — reused there when G lands; no rework.)_
_(Phase C added the program-picker, a NEW screen that precedes the shell — it did not remove a stub; the
picker's own forward-nav (create/edit + account destinations) is deferred per iOS D-SCOPE, folded in G/H.)_
