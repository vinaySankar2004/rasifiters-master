# Product: rasifiters / ios (L2)

The RaSi Fiters iOS app. Pure SwiftUI. Consumes the `backend` API. Built after `web`.

**Provenance (legacy, archived):** ported 1:1 from the original iOS app; the only intended change was the
auth path (Supabase-issued tokens via the backend proxy). Legacy source archived, not tracked here.

## Stack
- SwiftUI (no UIKit) · Swift 5 · iOS 18.6 target · zero third-party deps (native frameworks only)
- Architecture: MVVM via one central `ProgramContext` ObservableObject (extended by feature categories)
- Tokens in **Keychain**; session metadata in UserDefaults
- Real-time: Server-Sent Events stream; Push: APNs
- Bundle id: `com.app.rasifiters` (app) · `com.app.rasifiters.widgets` (widgets) · URL scheme `rasifiters://`
- Version: the next-out version is whatever `project.pbxproj` says (`MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION`; app + widgets unified — the widget Info.plist inherits via
  `$(CURRENT_PROJECT_VERSION)`); what is **live per channel** is tracked in `RELEASES.md` (the SoT — don't
  restate numbers here). Beta convention: bump the **build number only** per TestFlight push
  (same-version builds skip beta review); the marketing version moves only for App Store submissions
  (one-train-ahead — see `RELEASES.md`).
  Pre-upload gate: the build number must exceed the last-shipped one
  (`git log -S "CURRENT_PROJECT_VERSION = <n>"` to check).

## Targets
- **RaSi-Fiters-App** — the main app (78 Swift files in the legacy app; 41 foundation files in the scaffold).
- **RaSi-Fiters-App-Widgets** — home-screen widgets: quick-add workout (`rasifiters://quick-add-workout`)
  + quick-add health (`rasifiters://quick-add-health`). Self-contained `WidgetKit` extension (no app-code
    deps) — copied verbatim and kept in the scaffold.

## Surface (screens, from the legacy app)
Splash · Login · CreateAccount · ProgramPicker · AdminHome (Summary / Members / Lifestyle / Program tabs,
admin + standard variants) · member detail/metrics/streaks/history · Settings (profile / password /
appearance / notifications / **Apple Health**) · widget entry views · notification modal.

## Apple Health auto-sync (2026-06-30; health-sync v2 since 1.5.0)
The [`apple-health`](../../specs/features/apple-health/SPEC.md) feature — iOS-only HealthKit workout / sleep / steps
sync over [`health-sync`](../../specs/features/health-sync/SPEC.md) §8 (native **HealthKit**, zero third-party deps;
maps every `HKWorkoutActivityType` → a library name via `HealthKitWorkoutTypeMap`). Since **1.5.0** (reliability
Phase 3 C2):
- **`HealthSyncEngine`** — a singleton (not the view-owned `ProgramContext`), so a HealthKit background wake syncs
  without a scene. Observers + background delivery register in `AppDelegate.didFinishLaunching` (every launch) and
  HealthKit's completion handler is called after the run, inside `beginBackgroundTask`. One run in flight; screen
  triggers (launch / foreground / program entry, and a HealthKit wake while the app is active) are spaced ≥ 60 s;
  Sync Now / connect / pull-to-refresh wait for a run in flight and then run.
- A run = the rule-9 upgrade (once, BEFORE the state read) → `GET /programs` + `GET /api/health-sync/state` →
  HealthKit reads (`HealthSyncPlanner`) → `POST /api/health-sync/batch` (per-sample workout items incl. deletions;
  day totals for sleep / steps; ≤ 300 items / 250 kB, halved on 413) → `PUT /state` (`sync_success`) → advance or
  hold the workout anchor (lock, pending review, `skipped_locked`, upload error, read failure, no program window) →
  one `sync.run` event. Catch-up window = max(oldest `last_success_at` − 1 d, today − 30 d); workouts never read before
  the (re)connect date unless the upgrade marker is set (only a device that held the old ledger).
- **Per-member `HealthSyncPrefs`** (`healthsync.<member>.<kind>.*`): toggles, programs, status, anchor, exclusions,
  local 0-row confirms. Sign-out pauses (prefs kept); **Disconnect** clears the connection prefs + anchor only and
  sends nothing. The first-sync review is server-side (`review_done_at`, any integration) and `review_done` is sent
  only when the user confirms a review page.
- The old `POST /api/workout-logs` `on_duplicate:"sum"` / daily-health POST→409→PUT sync paths and the client ledger
  are gone (health-sync rule 11). Requires the HealthKit + Background-Delivery + Background-Modes capabilities
  (entitlements shipped; no `BGTaskScheduler` id).

## Auth (client side)
- **Locked (de-risked by web):** keep the existing Keychain + APIClient networking and have the **backend
  proxy** issue Supabase tokens — clients change minimally, no `supabase-swift`. The web surface PROVED this
  exact path live on `rasifiters.com`, so the only client change is the API base URL (see §Foundation port).
  Formally transcribed into the iOS `auth` SPEC when the auth screens are ported (question-asker).
- **Sessions (auth §3.1, 1.5.0):** ONE token store — `SessionStore` caches one keychain pair item
  (`AfterFirstUnlockThisDeviceOnly`, update-or-add; the pre-1.5 two-item store migrates on first read). Only a
  stored item that won't decode (or has no refresh token) forces a sign-out (`token_store_unreadable`); any other
  keychain status reads as "locked" and is re-read on unlock / the next foreground. `ProgramContext.authToken` is a
  UI mirror only. `APIClient+Session` reads the token at send time; refresh within 60 s of expiry (by the token's
  own lifetime from `receivedAt`, so a wrong device clock doesn't matter) or on a 401; single-flight; one quick retry
  after min(Retry-After ?? 2, 5) s, then back-off 30 / 60 / 120 / 300 s. Sign-out ONLY on `/refresh`
  `401 session_invalid`. `SessionTeardown.end(_:)` is the single teardown (logout this device, unregister the device,
  pause health sync, clear the launch cache + tokens + `session.*`); the client event queue survives it. A forced
  sign-out is explained once (splash subheadline, else the login alert); any sign-in clears it. Offline → one
  app-wide banner whose band is a bottom safe-area inset on both stacks; reconnecting clears the refresh back-off.
  "Sign out everywhere" lives in My Profile above Delete Account. The change-password / email `PUT`s send a one-shot
  body (no silent CFNetwork replay).
  15 s request timeout; every call sends `X-App-Platform` / `X-App-Version` / `X-App-Build` + a fresh `X-Request-Id`.
- **Push (notifications §3.1–3.3):** `DeviceRegistry` = keychain install id + one serial register / unregister
  queue (PUT /device ≤ once per 12 h per token; unregister on every sign-out and once per permission denial, the
  sign-in ride-along then omits `push_token`; sign-out forgets the memo, keeps the token — D-IOS-PUSH-1). The SSE
  stream lives in the foreground only, reconnects with 1 s × 2 / 30 s full-jitter backoff (paused offline) and
  re-fetches `/unacknowledged` on every `ready`. An invite push tap opens the Invites tab; others re-fetch.

## Foundation port (run 50, 2026-06-30)

The iOS kickoff mirrors the web foundation scaffold: port the page-independent infra directly (NOT via
question-asker — that loop is for screens), get it building green, then port feature screens one-by-one.

**What was ported (faithful 1:1 copy of the legacy Xcode project):** the whole `RaSi-Fiters-App.xcodeproj`
(folder-synchronized groups, same bundle ids, same version) + the foundation sources — `App/`
(`RaSi_Fiters_AppApp`, `AppDelegate`, `AppRootView`), `Config/APIConfig`, `Shared/Services/*` (APIClient +
all 9 category extensions, `KeychainService`, `SessionStore`, `NotificationStreamClient`, `ShareSheet`),
`Shared/Theme/*`, `Shared/Models/*` (`ProgramContext` + 8 extensions, `AuthResponse`, `AnalyticsSummary`),
`Shared/Components/*`, `Shared/Views/NotificationModalView` (incl. `ForcedUpdateModalView`), `Assets.xcassets`,
`Info.plist`, `.entitlements` — plus the self-contained `RaSi-Fiters-App-Widgets` extension verbatim.

**Deviations (all migration-justified):**
1. **API base URL** — `APIConfig.renderBaseURL` repointed `rasi-fiters-api.onrender.com` → the new
   `rasifiters-api.onrender.com/api` (the Supabase-Auth proxy backend; matches the web prod API). The one
   auth-path change. `simulatorBaseURL`/`deviceBaseURL` (local dev) kept as-is.
2. **`Features/` deferred** — at foundation time all 37 feature-screen files were removed and then ported
   per-screen via question-asker (auth splash/login/create-account first); all are now ported. The legacy
   originals (`ios-mobile/RaSi-Fiters-App/Features/**`) are archived, not tracked here.
3. **`App/_DeferredScreenStubs.swift`** — **DELETED (run 65, 2026-06-30): the iOS deferred layer is CLOSED.** It
   was the only foundation→feature coupling — placeholder `View`s for the four screens `AppRootView` instantiates
   (`SplashView`, `ProgramPickerView`, `QuickAddWorkoutWidgetEntryView`, `QuickAddHealthWidgetEntryView`), the iOS
   analogue of web's `NotificationsGate` stub. Each stub was deleted as its real screen landed; the last two (the
   widget entry views) landed run 65 in `Features/Widgets/`, so the file is gone and every feature screen is now
   ported. `AppRootView` stayed **byte-faithful** throughout.
4. **Stripped** `xcuserdata`/`*.xcuserstate`/`.DS_Store` from the copy; added `apps/ios/.gitignore`.

**Build:** target = `RaSi-Fiters-App` scheme. See §Toolchain note below for the local Xcode caveat.

### Toolchain note (local machine, 2026-06-30)
This Mac's **Xcode 26.5** could not build from the CLI at scaffold time: (a) the **iOS 26.5 device platform
was not installed** (`xcodebuild ... -downloadPlatform iOS` resolves this), and (b) the **CoreSimulator
service had a version mismatch** (bundled `1051.54` vs stale launchd job `1051.17.7`) so xcodebuild
enumerated **zero simulator destinations**. `xcodebuild -runFirstLaunch` fixed the `IDESimulatorFoundation`
plugin load error. To restore simulator builds the user may need to **open Xcode.app once** (installs
components) and/or **reboot** (clears the stale CoreSimulator launchd job). Green-check command once healthy:
`xcodebuild -project apps/ios/RaSi-Fiters-App.xcodeproj -scheme RaSi-Fiters-App -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` (device, no signing) — or a simulator destination once enumerated.

## Deploy
Xcode → TestFlight → App Store (the user handles signing/upload). Bump the version one higher at push time.
App config served by the backend `/app-config`: `min_ios_version` → the blocking `ForcedUpdateModalView`;
`latest_ios_version` → the dismissable "Update available" banner on the program picker (once per version, 1.5.0+).

## Staging (opt-in scheme — reliability-overhaul Phase 2 B, auth D-C13)
- `Config/APIConfig.swift`: `#if DEBUG` → `stagingBaseURL` (`https://rasifiters-api-staging.onrender.com/api`);
  Release → `renderBaseURL` (prod). The loopback constants stay for ad-hoc local-backend runs.
- **Shared schemes:** `RaSi-Fiters-App` — Run = **Release** → **prod** (unchanged); `RaSi-Fiters-App-Staging` —
  Run = **Debug** → **staging**. Archive = Release (prod) in both. Pick the scheme in Xcode's scheme menu; the
  project file is unchanged (Debug/Release differ only by the `DEBUG` flag + `-Onone`). Use the Staging scheme only
  for risky changes (migrations, auth/session); Android mirrors it with an opt-in `staging` build type.
- Wake the staging API first (open `https://rasifiters-api-staging.onrender.com/`, wait for the reply), then sign in
  with a `+stg` staging account (testbed: `ava.rivera` + the shared test password). Sign out before switching
  schemes — tokens are valid on both (one Supabase project) but map to different members.
- Push: Xcode builds hold sandbox APNs tokens; staging runs `APNS_PRODUCTION=false`, so staging pushes reach them.
- Run session / auth checks (sign out everywhere, password change) on the Staging scheme first. The launch cache,
  health-sync prefs and the event queue are per member / per install, so switching schemes after a sign-out is safe.

## Auth screens port (run 51, 2026-06-30)

The iOS public/auth path — **`SplashView` · `LoginView` · `CreateAccountView`** — ported into
`Features/{Onboarding,Auth}/` via question-asker (3 screen SPECs at `specs/pages/ios/{splash,login,
create-account}/`); the `SplashView` deferred stub removed (Login/CreateAccount were never stubbed —
`AppRootView` only instantiates Splash + ProgramPicker + the 2 widget views).

**Stance — match the CURRENT built web app, not just legacy iOS** (the web is now a co-equal reference
point; see the project memory). Faithful 1:1 to the legacy iOS screens **except** the cross-app divergences
the web SPECs flagged for this port, all resolved toward web parity:
1. **Real brand icon** — new `Shared/Components/BrandMark.swift` + `Assets.xcassets/BrandIcon.imageset`
   (built from the `AppIcon` PNGs) replaces the legacy orange-circle/`chart.bar.fill` placeholder on all
   three screens (closes web splash F3).
2. **Login "Forgot your password?" link** → `APIConfig.forgotPasswordURL` (`rasifiters.com/forgot-password`)
   opened in the browser — the reset always completes in-browser via the Supabase email link, so iOS opens
   the live web recovery flow rather than duplicating it natively (closes web login F3).
3. **CreateAccount — 4 web cleanups:** inline email-format validation + muted hint, a live password-policy
   checklist (replacing the static hint), a muted mismatch hint, and autoFocus First Name. (Web's
   authed→redirect cleanup is N/A — `AppRootView`'s `authToken` bifurcation already handles it.)

**New deps (the only additions beyond the foundation):** `BrandMark.swift`, `BrandIcon.imageset`, and the
`APIConfig.forgotPasswordURL` constant. Every other component (`AppInputField`, `AppPasswordToggleButton`,
`AppGradient`, `Color.appOrange/appGreen`, `ProgramContext+Auth`, `APIClient.loginGlobal/registerAccount`)
was already ported in the foundation (run 50).

## Status
🟢 **Code-complete + LIVE (App Store + TestFlight).** All screens + widgets + Apple Health auto-sync
(workouts + sleep) ported; the deferred-stub layer is closed (no stubs remain). Builds green in Xcode (the user
presses ⌘B; Claude doesn't call the `xcode` MCP build). Screen-SPEC count lives in `specs/pages/REGISTRY.md`
(the canonical index). What's live on each channel is tracked in `RELEASES.md`. Visual/runtime verification is
the user's, in Xcode.
