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
- Version (faithful copy): marketing **1.3.0**, build **40** (widgets 1.2.0/25). The user bumps the version
  **one higher at TestFlight push time** — the scaffold stays at the legacy version.

## Targets
- **RaSi-Fiters-App** — the main app (78 Swift files in the legacy app; 41 foundation files in the scaffold).
- **RaSi-Fiters-App-Widgets** — home-screen widgets: quick-add workout (`rasifiters://quick-add-workout`)
  + quick-add health (`rasifiters://quick-add-health`). Self-contained `WidgetKit` extension (no app-code
    deps) — copied verbatim and kept in the scaffold.

## Surface (screens, from the legacy app)
Splash · Login · CreateAccount · ProgramPicker · AdminHome (Summary / Members / Lifestyle / Program tabs,
admin + standard variants) · member detail/metrics/streaks/history · Settings (profile / password /
appearance / notifications / **Apple Health**) · widget entry views · notification modal.

## Apple Health auto-sync (2026-06-30)
The [`apple-health`](../../specs/features/apple-health/SPEC.md) feature — iOS-only HealthKit workout auto-sync
(net-new, ported from `vinaySankar2004/RaSi-Fiters` PR #4 and corrected for our curated `workouts_library`).
Uses the native **HealthKit** framework (still zero third-party deps). Read-only workout access + background
delivery; maps every `HKWorkoutActivityType` → a library name (`HealthKitWorkoutTypeMap`), aggregates per
type/day, and writes via the existing `POST /api/workout-logs` (skip-on-conflict via a 409). Sync state lives
in `UserDefaults` on `ProgramContext+HealthKit`. Requires the HealthKit + Background-Delivery + Background-Modes
capabilities (entitlements shipped; Xcode capability toggles + App ID enablement are user-run).

## Auth (client side)
- **Locked (de-risked by web):** keep the existing Keychain + APIClient networking and have the **backend
  proxy** issue Supabase tokens — clients change minimally, no `supabase-swift`. The web surface PROVED this
  exact path live on `rasifiters.com`, so the only client change is the API base URL (see §Foundation port).
  Formally transcribed into the iOS `auth` SPEC when the auth screens are ported (question-asker).

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
App config (`min_ios_version`) served by the backend `/app-config`.

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
🟡 **Auth screens ported (run 51)** — Splash · Login · CreateAccount in `Features/`, web-parity deviations
applied, `SplashView` stub removed. **Build-green pending the local Xcode toolchain fix** (see §Toolchain
note); symbols verified present (no duplicate types, `appGreen`/`adaptiveShadow`/`BrandMark` resolve).
Next: port `ProgramPickerView` (the post-auth landing) + program create/edit/invites via question-asker.
