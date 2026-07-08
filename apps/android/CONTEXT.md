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
🟡 **Phase B COMPLETE (2026-07-08).** The logged-out auth path is ported + wired + green. New
`ui/auth/{AuthComponents,SplashScreen,LoginScreen,CreateAccountScreen,ForgotPasswordScreen}.kt` +
`core/AppLinks.kt`; brand mark assets (`res/drawable/brand_icon(_dark).png`, from iOS). `AuthGraph`
(`ui/RootScreen.kt`) now runs the real screens — splash→login→create-account/forgot-password — with the
**4 auth stubs deleted**. Login = `POST /auth/login/app`; create-account does register→auto-login; a
successful login/register flips `authToken` so the root gate swaps to the shell (no explicit nav). Thin
port-note SPECs under `specs/pages/android/`. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. Next:
**Phase C** (program-picker — the signed-in home). See the plan + `PROGRESS.md`.

_(Phase A, 2026-07-08:) Foundation green — Gradle project, DI (`AppContainer`), state hub (`ProgramContext`),
session/Keychain (`Session`), Retrofit/OkHttp + 401 authenticator, auth DTOs, Material 3 theme, bottom-nav
scaffold._

### Scaffold-removal tracker (temporary — folds away by Phase J)
Stub screens live in `ui/StubScreen.kt` usages. Deleted as real screens land:
~~Splash/Login/CreateAccount/ForgotPassword (Phase B — DONE)~~ · Summary+details (D) · Members (E) ·
Lifestyle (F) · Program/settings (G). Remaining `StubScreen(...)` call-sites: the 4 bottom tabs in
`ui/shell/AppScaffold.kt` (Summary/Members/Lifestyle/Program). By Phase J: zero remain.
