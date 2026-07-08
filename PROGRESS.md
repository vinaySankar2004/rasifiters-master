# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** The single source of truth for *where we are* and *what's next*.
> Cross-session loop: start → read this → work → at session end, update this file + commit (via
> `git-version`). A condensed run history (2026-06-28 → 2026-06-30) is in **`PROGRESS_ARCHIVE.md`**
> (one line per run, not auto-loaded); full per-run detail lives in this file's git history.

## Current phase

**ACTIVE WORKSTREAM (2026-07-08): Android port — the 4th surface (`apps/android`).** A faithful 1:1
Compose port of the same app against the same backend contract. Plan approved; phased scaffold→port→
de-scaffold sequence (A→J). **Phase A COMPLETE (foundation builds green).** Next = **Phase B (auth path)**.
Full plan + decisions are in `apps/android/CONTEXT.md` and the approved plan
(`~/.claude/plans/immutable-jingling-hamming.md`). v1 scope = all screens + SSE notifications + auth +
Health Connect + FCM push; widgets deferred. Specs = thin port-notes per screen.

_(Prior milestone — still true:) Rebuild COMPLETE + SHIPPED across the first 3 surfaces: iOS on TestFlight
(approved, in beta use — user-announced 2026-07-05); web LIVE; backend LIVE. Remaining tail: go-public on
GitHub + pre-cutover smoke tests (below)._

- **`android`** — 🟡 **Phase A DONE (2026-07-08).** Gradle project + DI (`AppContainer`) + state hub
  (`ProgramContext`) + Keychain-analog `Session` (EncryptedSharedPreferences) + Retrofit/OkHttp networking
  with a 401 single-flight `Authenticator` + auth DTOs + Material 3 theme + bottom-nav scaffold (Summary/
  Members/Lifestyle/Program) wired to **stub screens**. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL.
  Toolchain (Android Studio, SDK android-36, Temurin JDK 21) already on the Mac; wrapper pinned to 8.11.1.
  New `android-build` skill (pure-CLI compile loop, no MCP). Next: **Phase B** — port Splash/Login/
  CreateAccount/ForgotPassword, delete the 4 auth stubs.

- **`backend`** — DEPLOYED + LIVE on Render (`rasifiters-api`, `https://rasifiters-api.onrender.com`); auth
  round-trip verified live against migrated data. All backend features ported (`specs/features/REGISTRY.md`).
- **`web`** — COMPLETE + LIVE on `https://rasifiters.com` (Vercel `rasifiters`, git auto-deploy on `main`).
  34 page SPECs (legacy-parity + the net-new `forgot-password`/`reset-password` recovery pages); signed-in
  proxy round-trip user-verified live (profile edit, email change, password recovery).
- **`ios`** — CODE-COMPLETE (runs 50→74). All screens + widgets + Apple Health auto-sync (workouts **+ sleep**,
  the latter net-new in `apple-health` 0.2.0 → `daily_health_logs.sleep_hours`, no backend/migration change)
  ported; the deferred-stub layer is closed (no stubs remain). Native build GREEN via the `xcode` MCP. 31 iOS
  screen SPECs. `apple-health` polished to **0.6.0** (2026-07-05): per-program date-window scoping (0.3.0),
  gated first-sync confirmation (0.4.0), admin-lock-aware sync (0.5.0), and the two user-reported sync
  fixes (0.6.0): **sum-on-conflict** — same-type later-in-the-day workouts now add minutes to the day's
  row via the new `on_duplicate:"sum"` flag on `POST /api/workout-logs` (`workout-logs` 0.4.0 D-C9, the
  one backend change; client `HealthKitAppliedLedger` guarantees replay idempotency) — and **silent
  auto-retry** — the "sync failed" banner is gone; failures surface as a passive settings caption + an
  inline Sync Now error (D-SIL). Visual/runtime verification is the user's, in Xcode — memory
  [[ios-user-verifies-builds-visually]].
- **Data/auth** — Supabase (`kpadxjekpiwfkqcxtrio`) provisioned; schema + 48/48 members migrated (bcrypt
  hashes imported, no resets). The one-time migrator was removed post-cutover.
- **Legacy detachment (2026-06-30)** — the repo now stands alone: SPEC `Reference impl` headers → `Provenance`
  (no live legacy paths), mission framing past-tense, `tools/migrator/` deleted, the `additionalDirectories`
  instruction dropped. App code under `apps/` is the sole source of truth; `PROGRESS.md` slimmed (log → archive).

## Next action

> ### ⏭️ ANDROID PORT — Phase B (auth path). Say "continue" to resume.

Resume the Android port at **Phase B**: port the logged-out auth path — `SplashView` · `LoginView` ·
`CreateAccountView` · `ForgotPasswordView` — into `apps/android` Compose screens, wired to the real backend
(`POST /auth/login/app`, `/auth/register`, `/auth/forgot-password`, `/auth/me` self-heal), and **delete the
4 auth stubs** in `ui/RootScreen.kt`'s `AuthGraph`. Match the iOS/web SPECs 1:1
(`specs/pages/{ios,web}/{splash,login,create-account}`), Android-idiom deviations only. Gate with the
`android-build` skill (`./gradlew :app:assembleDebug`), then the user runs it on the Pixel 8 emulator
(API 37.1, already created). Write thin port-note SPECs under `specs/pages/android/`. Phase list A→J is in
`apps/android/CONTEXT.md`.

---

> ### ⏭️ (Parallel tail, first 3 surfaces) TestFlight SHIPPED (2026-07-05) — remaining: go-public + pre-cutover smoke tests

Repo is standalone at `~/Desktop/rasifiters-master`. Ship checklist (7 = the one open step):

1. [x] **Move the repo** → `~/Desktop/rasifiters-master` (standalone; legacy no longer a sibling).
2. [x] **Run migration `apps/backend/sql/004_seed_healthkit_workout_types.sql` on Supabase** — done by user.
3. [x] **iOS HealthKit + Background capabilities** — CONFIRMED already present in the project config (not a
   pending to-do): `RaSi-Fiters-App.entitlements` carries `com.apple.developer.healthkit` +
   `com.apple.developer.healthkit.background-delivery`; `Info.plist` carries `UIBackgroundModes=[fetch]` plus
   the two `NSHealth*UsageDescription` strings. Still user-side in the developer portal / App Store Connect:
   enable HealthKit on the App ID (if not already), on-device test (Simulator has no HealthKit), App Store
   privacy config.
4. [x] **Flip `APNS_PRODUCTION=true` on Render — DONE (verified 2026-07-05).** Value confirmed `true` via
   `tools/render-env.sh get`; a redeploy was triggered the same day to guarantee the live process carries it
   (env-var flips via REST don't auto-redeploy). Note: even unset, the code falls back to
   `NODE_ENV === "production"` (`apps/backend/utils/pushNotifications.js`), so production APNs was already
   the effective mode.
5. [x] **Bump the iOS version/build** — done by user at archive time.
6. [x] **Archive + upload → TestFlight — DONE.** Approved and **in beta use** (user-announced 2026-07-05).
   The LIVE iOS binary is now the TestFlight beta — backend changes must degrade gracefully for it
   (memory: ios-live-binary-compatibility). **Second push SHIPPED same day: 1.3.1 (46)** — carries
   apple-health 0.6.0, program reorder/search 0.2.x, autocapitalization; same-version builds skip beta
   review (auto-approved, live to the external Beta Testers group in minutes — memory:
   testflight-versioning-convention). **LIVE binary = 1.3.1 (46).**
7. [ ] **Pre-cutover backend smoke-tests** (batched; needs a live admin JWT the user supplies) if not already
   covered by the web signed-in round-trip.

## Build sequence

1. [x] Scaffold the ICM repo — 2026-06-28
2. [x] Provision infra — Supabase + Render + Vercel LIVE (2026-06-28/29)
3. [x] Migrate data + auth to Supabase — 2026-06-28 (migrator since removed)
4. [x] `backend` — all features ported + deployed + auth verified live
5. [x] `web` — all pages ported + deployed + LIVE on `rasifiters.com`
6. [x] `ios` — all screens/widgets/Apple-Health ported; native build green (user does visual + TestFlight)
7. [x] Cutover — web domain LIVE; iOS on TestFlight (approved, in beta) — 2026-07-05
8. [~] `android` — 4th surface (Compose port). Phase A foundation green (2026-07-08); Phases B→J pending.

## Coverage

- Features: **15** (backend coverage complete) — `specs/features/REGISTRY.md` + `registry.json`.
- Web page SPECs: **34** · iOS screen SPECs: **31** — `specs/pages/REGISTRY.md`.
- Legacy-parity coverage: `COVERAGE.md`.

## Open items (carry until resolved)

- **Member identity self-heal (2026-07-07)** — fixed a web bug where a member with an empty `session.user.id`
  (never re-derived after login; no `id` claim in the Supabase JWT) was blocked from logging workouts
  ("You can only log workouts for yourself.") and saw a **blank Members tab** (own cards gated on that id).
  Fix: net-new **`GET /api/auth/me`** (`auth` SPEC D-C7, additive/safe for the LIVE iOS binary) + the web
  `AuthProvider` calls it on load to make the id authoritative/self-healing + a log-form guard. Backend =
  correct throughout; both symptoms were web-only. **Immediate user workaround: sign out + back in.**
  Also hardened the **iOS** `StandardMembersTab` to render its member cards unconditionally (each has its own
  empty state) so a member never sees a fully blank tab — **ships in the next TestFlight build** (build-number
  bump only). Deploy order: backend (`/me`) first, then web; iOS on the next archive.


- **Re-auth the Render + Vercel MCPs** — both OAuth sessions are stale (400/403 in this session); re-connect
  via `/mcp` interactively when next needed. REST (`tools/render-env.sh`) + local `vercel` CLI work meanwhile.
- **Make the GitHub repo public** — pre-public health check done 2026-07-01 (no tracked secrets; contact emails
  kept as-is per user; cosmetic infra-identifier anonymization applied). Flip visibility when ready.
- ~~**iOS runtime + TestFlight**~~ **DONE 2026-07-05** — uploaded, approved, in beta use (user-announced).
  Second push **1.3.1 (46)** shipped 2026-07-05 (auto-approved, live to beta testers). **LIVE binary =
  1.3.1 (46).** Beta convention going forward: bump build number only, marketing version reserved for
  App Store submissions (memory: testflight-versioning-convention).
- ~~**`APNS_PRODUCTION`**~~ **DONE 2026-07-05** — confirmed `true` on Render + redeploy triggered to apply
  (was also already the effective mode via the `NODE_ENV === "production"` fallback).
- **Backend runtime smoke-tests** are batched to a pre-cutover pass needing a live admin JWT (user supplies).
- **`notifications` cross-feature emits** are intentionally deferred in backend services (documented in-code
  TODOs) — wire when that work is scheduled; not blocking ship.
