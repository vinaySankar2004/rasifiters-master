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
- **RaSi-Fiters-App** — the main app.
- **RaSi-Fiters-App-Widgets** — home-screen widgets: quick-add workout (`rasifiters://quick-add-workout`)
  + quick-add health (`rasifiters://quick-add-health`). Self-contained `WidgetKit` extension (no app-code
    deps) — copied verbatim and kept in the scaffold.

## Surface (screens — index: `specs/pages/REGISTRY.md`)
Splash · Login · CreateAccount · ProgramPicker · AdminHome (Summary / Members / Lifestyle / Program tabs,
admin + standard variants) · member detail/metrics/streaks/history · Settings (profile / password /
appearance / notifications / **Apple Health**) · widget entry views · Phase 4: the Inbox (`Features/Home/Inbox/`;
toast `Shared/Views/NotificationToast.swift`), People (`Features/Home/People/`), Members-card state
(`Features/Home/Tabs/MemberCardsState.swift`). Kit: `Shared/Kit/` (incl. `LoadStateContent.swift`, frontend-kit
D-KIT-21) + `Shared/Components/TapTarget.swift` (`.minTapTarget()`, D-KIT-22). **Debt:** `Shared/Models/ProgramContext.swift` still
declares fields nothing writes any more (`healthTimeline*`, `stepsStats`, `workoutType*` incl. `workoutTypesTotal`, + their
init parameters) — harmless; delete in a later cleanup.

## Apple Health auto-sync (2026-06-30; health-sync v2 since 1.5.0)
HealthKit workout / sleep / steps sync (native, zero third-party deps). Contract + run sequence:
[`apple-health`](../../specs/features/apple-health/SPEC.md) and [`health-sync`](../../specs/features/health-sync/SPEC.md) §8.
Where it lives: `HealthSyncEngine` (a singleton, so a HealthKit background wake syncs without a scene; observers +
background delivery register in `AppDelegate.didFinishLaunching`), `HealthSyncPlanner`, the per-member
`HealthSyncPrefs` (`healthsync.<member>.<kind>.*`), `HealthKitWorkoutTypeMap`; a batch is ≤ 300 items and ≤ 250 kB
(the server's parser takes 256 kb). Requires the HealthKit +
Background-Delivery + Background-Modes capabilities (entitlements shipped; no `BGTaskScheduler` id).

## Auth (client side)
- Keychain + `APIClient` networking; the **backend proxy** issues Supabase tokens — no `supabase-swift`.
- **Sessions** (`Shared/Services/{SessionStore,APIClient+Session,KeychainService}.swift`,
  `Shared/Models/ProgramContext+Session.swift`): one keychain pair item, read at send time; `SessionTeardown.end` is
  the single teardown; `ProgramContext.authToken` is a UI mirror only. Policy + iOS realization:
  [`auth`](../../specs/features/auth/SPEC.md) D-C16 / D-C17. Offline detection (`Shared/Kit/NetworkMonitor.swift`):
  [`frontend-kit`](../../specs/features/frontend-kit/SPEC.md) §5. 15 s request timeout; headers per
  [`observability`](../../specs/features/observability/SPEC.md) §4.1 + `X-Time-Zone`.
- **Push + real-time** (`DeviceRegistry`, `NotificationStreamClient`, `ProgramContext+Notifications` / `+Inbox`):
  foreground-only SSE `?inbox=1` + a catch-up (no `/unacknowledged` since Phase 4); taps and the toast's `View` route
  by `target`; the app-icon badge only via `setBadgeCount`. Rules + `UserDefaults` keys:
  [`notifications`](../../specs/features/notifications/SPEC.md) §3.1–§3.3, D-C31 (+ D-IOS-PUSH-1).

## Foundation port (run 50, 2026-06-30)

The iOS kickoff mirrors the web foundation scaffold: port the page-independent infra directly (NOT via
question-asker — that loop is for screens), get it building green, then port feature screens one-by-one.

**What was ported (faithful 1:1 copy of the legacy Xcode project):** the whole `RaSi-Fiters-App.xcodeproj`
(folder-synchronized groups, same bundle ids, same version) + the foundation sources — `App/`
(`RaSi_Fiters_AppApp`, `AppDelegate`, `AppRootView`), `Config/APIConfig`, `Shared/Services/*` (APIClient +
all 9 category extensions, `KeychainService`, `SessionStore`, `NotificationStreamClient`, `ShareSheet`),
`Shared/Theme/*`, `Shared/Models/*` (`ProgramContext` + 8 extensions, `AuthResponse`, `AnalyticsSummary`),
`Shared/Components/*`, `Shared/Views/NotificationModalView` (incl. `ForcedUpdateModalView` — since Phase 4 the file
holds only `ForcedUpdateModalView`), `Assets.xcassets`,
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

### Toolchain (2026-10-24)
**Xcode 27.1 / iOS 27.1 SDK** — required from 1.5.3: a binary built with the 27.1 SDK runs full-screen on the
**iPhone Duo** (inner display regular/regular; the system moves the tab bar and nav buttons into a vertical rail
beside the status column). The app needs no Duo-specific code: it never sizes from `UIScreen.main`, orientation
or idiom, every `ignoresSafeArea` is a background layer, and wide screens use the iPad adaptive column. Simulator
runtimes kept on this Mac: **iOS 27.1** (iPhone Duo only — regular iPhone / iPad simulators need the iOS 27.0
runtime, downloaded per job: `store-assets/README.md`) and **iOS 18.6** (the deployment target). Xcode 27's
simulator app is **DeviceHub** (`Xcode.app/Contents/Applications/DeviceHub.app`) — it is the only way to fold /
unfold the Duo. CLI green check (no signing):
`xcodebuild -project apps/ios/RaSi-Fiters-App.xcodeproj -scheme RaSi-Fiters-App -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build`.

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
