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
  + `X-Time-Zone` (Phase 4) (`net/ClientHeaders.kt`). Requests time out at **15 s end to end** (`callTimeout`). Bearer from the one token store
  with a proactive + single-flight refresh (`net/TokenRefresher.kt`); a 426 opens the blocking update screen.
- Storage: tokens + identity in **EncryptedSharedPreferences** `rasi.fiters.session` = the ONE token store
  (`core/Session.kt`, a `StateFlow`; rotation + corruption rules: auth D-C17). Appearance + the version-gate dismissal: `rasi.fiters.prefs`. Push registration + the one-time permission flag
  (+ the `inbox_registered_token` memo, Phase 4): `rasi.push`. The per-member People notice flag: `rasi.people`. Health Connect state: `rasi.health`, **per member** (`m.<memberId>.*`). `noBackupFilesDir`: `install_id`,
  `client_events.json` (observability queue), `launch_cache/` (instant opens). Auto Backup / device transfer exclude
  session, health and push (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`). DataStore is declared but unused.
- Real-time: SSE (okhttp-sse). Push: **FCM** — six channels since Phase 4 (`rasi_default`, high-importance
  `rasi_invites`, `rasi_activity`, `rasi_reminders`, `rasi_digest`, `rasi_announcements`), created in `App.onCreate` before
  the container; the monochrome `ic_stat_notification` small icon.
- applicationId / package: `com.app.rasifiters` (matches the iOS bundle-id root). URL scheme `rasifiters://`.
- Version: the next-out version is whatever `app/build.gradle.kts` says (`versionName` / `versionCode`);
  what is **live per channel** is tracked in `RELEASES.md` (the SoT — don't restate numbers here).
  Beta convention: bump `versionCode` per push; `versionName` moves only for production submissions.

## Build & toolchain
- **Pure-CLI build** (Claude runs it; iOS builds are the user's ⌘B in Xcode). Compile-check: `cd apps/android && ./gradlew
  :app:assembleDebug`. Install to a running emulator/device: `./gradlew :app:installDebug`. See the
  **`android-build`** skill for the loop.
- Compose BOM **2025.04.01** (`gradle/libs.versions.toml`; Compose UI 1.8 — `ContentType` autofill on the credential fields,
  Phase 4 polish #35, auth D-C22).
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

## Surface (screens — mirror web + iOS; index: `specs/pages/REGISTRY.md`)
Splash · Login · CreateAccount · ForgotPassword · ProgramPicker (signed-in home) · per-program tab shell
(**Summary / Members / Lifestyle / Program**, admin + standard variants) · summary details (activity /
distribution / workout-types / log-workout / log-health) · member details (list/detail/metrics/history/
recent/health/streaks/invite) · lifestyle (timeline / steps timeline / workouts) · program settings (edit/roles/profile/
password/appearance/privacy + Health Connect settings) · two quick-add Glance widgets (`specs/pages/android/widgets/`) ·
Phase 4: the Inbox (`ui/inbox/`), People list + person profile + full stats (`ui/people/`, `MemberFullStatsScreen`).

## Auth (client side)
Supabase-Auth-proxied through the Express backend — **no Supabase SDK on the client** (same as web + iOS).
Mobile login = `POST /auth/login/app` (returns `member_id`); login + Google OAuth ride along `push_token` +
`device_id` (the install id) + `platform:"android"` (`push/DeviceRegistry`). `GET /auth/me` self-heals identity on
relaunch. Sessions — `net/TokenRefresher.kt` (the one refresh path: interceptor, 401 authenticator, SSE),
`core/Session.kt`, one teardown in `core/{AppContainer,ProgramContext}.kt`, "Sign out everywhere" in My Profile:
[`auth`](../../specs/features/auth/SPEC.md) D-C16 / D-C17. Google = `GetSignInWithGoogleOption` + nonce (the login /
create-account / my-profile page SPECs); credential-screen messages: `toCredentialMessage`
([`frontend-kit`](../../specs/features/frontend-kit/SPEC.md)).

## Health (Health Connect)
`androidx.health.connect:connect-client` — the HealthKit analog (it also carries Samsung Health data), speaking
health-sync v2 since 1.1.0. Contract + run sequence: [`health-connect`](../../specs/features/health-connect/SPEC.md)
and [`health-sync`](../../specs/features/health-sync/SPEC.md) §8; screens: `specs/pages/android/health-connect/`.
Code: `health/*` (`HealthSyncRunner`, `HealthSyncUpgrade`, `HealthStore` = the per-member `rasi.health` prefs) +
`ui/health/*`. **No background sync** (H-1 / board D-6) — runs on app triggers only.

## Push + real-time
`push/{DeviceRegistry,RaSiFirebaseMessagingService}.kt` (FCM, the six channels, ask-once permission after the first
sign-in), `net/NotificationStreamClient.kt` (foreground-only SSE, `?inbox=1` + a catch-up — no `/unacknowledged`
since Phase 4), the toast + Inbox in `ui/inbox/` (`NotificationModal.kt` is gone); taps and the toast's `View` route
by `target`. Rules: [`notifications`](../../specs/features/notifications/SPEC.md) §3.1–§3.3, §3.9, D-C31 + the
[notifications-alerts](../../specs/pages/android/notifications-alerts/SPEC.md) page SPEC. Invites (`GET /my-invites`,
global admins `GET /all-invites`, `PUT /invite-response`): [`invites`](../../specs/features/invites/SPEC.md).

## Frontend kit
Contract: [`frontend-kit`](../../specs/features/frontend-kit/SPEC.md) (§5 connectivity, §8 files). Android pieces:
`core/kit/{AppError,ConnectivityObserver,KitCopy,UiState}.kt`, `ui/components/kit/{ErrorView,FloatingBanner,KitLoad}.kt`
(`KitLoad` = the detail-load helper, D-KIT-21), `ui/components/TapTarget.kt` (48 dp targets + labels, D-KIT-22),
instant opens `core/LaunchCache.kt` (picker + Summary). Version gate: `core/VersionGate.kt` → the blocking
`ui/components/UpdateRequiredScreen.kt` ([`app-config`](../../specs/features/app-config/SPEC.md)). Events:
`core/events/ClientEventQueue.kt` ([`observability`](../../specs/features/observability/SPEC.md) §8).

## Deploy
Signed AAB from the CLI (`./gradlew :app:bundleRelease`, upload key via the gitignored `keystore.properties`) → Play
Console **internal testing** + **closed testing** (the user's Pixel only gets builds through closed testing) →
**production** (live since 2026-08-06). Routine: the `deploy` skill §D; channel state + build numbers: `RELEASES.md`
(the SoT). Bump `versionCode` right after every upload — Play never accepts a consumed code again. Health Connect
access needs the Play Console permissions declaration. FCM push live since 2026-07-08.

## Status
🚀 **LIVE on the public Google Play Store (production, 2026-08-06)** — 100% rollout, 176 countries + rest of world.
Channel specifics: `RELEASES.md`.

**Build history** (dated detail: this file's git history + `PROGRESS_ARCHIVE.md`; per-screen deviations: the thin
SPECs under `specs/pages/android/`):
- **2026-07-08 — Phases A→J:** A foundation (Gradle, DI `AppContainer`, `ProgramContext`, session, Retrofit + 401
  authenticator, M3 theme) · B auth path · C program picker · D Summary + its details · E Members tab + 8 details ·
  F Lifestyle · G Program tab + settings sub-routes · H Health Connect (deviation **H-1**) · I SSE + FCM · J
  de-scaffold (`ui/StubScreen.kt` deleted — no placeholder remains).
- **2026-10-13 — 1.1.0 (reliability Phase 3 C3):** sessions contract, health-sync v2, push registry + invite inbox,
  the Google nonce flow, instant opens + kit, offline banner, version gate.
- **2026-10-13 — 1.2.0 (Phase 4):** quick wins, Notifications (Inbox, toast, six channels) + People, polish #9–#45.
