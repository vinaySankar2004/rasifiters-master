# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** The single source of truth for *where we are* and *what's next*.
> Cross-session loop: start → read this → work → at session end, update this file + commit (via
> `git-version`). A condensed run history (2026-06-28 → 2026-06-30) is in **`PROGRESS_ARCHIVE.md`**
> (one line per run, not auto-loaded); full per-run detail lives in this file's git history.

## Current phase

**Rebuild COMPLETE + SHIPPED: iOS is on TestFlight (approved, in beta use — user-announced 2026-07-05). Remaining: go-public on GitHub + pre-cutover smoke tests.**

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

> ### ⏭️ TestFlight SHIPPED (2026-07-05) — remaining: go-public + pre-cutover smoke tests

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
   (memory: ios-live-binary-compatibility). User plans a **second TestFlight push** later and will announce it.
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

## Coverage

- Features: **15** (backend coverage complete) — `specs/features/REGISTRY.md` + `registry.json`.
- Web page SPECs: **34** · iOS screen SPECs: **31** — `specs/pages/REGISTRY.md`.
- Legacy-parity coverage: `COVERAGE.md`.

## Open items (carry until resolved)

- ~~**Push + deploy the program-picker reorder (`programs` 0.2.0)**~~ **DONE 2026-07-05** — migration 005 run
  by user; pushed + tagged; Render auto-deployed (live); Vercel auto-deploys were canceled (known flake) →
  manual `vercel --prod` fallback, Ready on `rasifiters.com`. Search UI iterated twice on user feedback
  (collapsed floating pill; iOS toggle floats above the "+", page specs web 0.2.1 / ios 0.2.2). **User
  live-tested end-to-end on both clients — reorder persists + syncs, search works.** Outcome recorded in the
  SPECs §11 changelogs; delete this entry next pass.
- **Re-auth the Render + Vercel MCPs** — both OAuth sessions are stale (400/403 in this session); re-connect
  via `/mcp` interactively when next needed. REST (`tools/render-env.sh`) + local `vercel` CLI work meanwhile.
- **Make the GitHub repo public** — pre-public health check done 2026-07-01 (no tracked secrets; contact emails
  kept as-is per user; cosmetic infra-identifier anonymization applied). Flip visibility when ready.
- ~~**iOS runtime + TestFlight**~~ **DONE 2026-07-05** — uploaded, approved, in beta use (user-announced).
  **LIVE binary = TestFlight beta**; a second TestFlight push is planned (user will announce).
- ~~**`APNS_PRODUCTION`**~~ **DONE 2026-07-05** — confirmed `true` on Render + redeploy triggered to apply
  (was also already the effective mode via the `NODE_ENV === "production"` fallback).
- **Backend runtime smoke-tests** are batched to a pre-cutover pass needing a live admin JWT (user supplies).
- **`notifications` cross-feature emits** are intentionally deferred in backend services (documented in-code
  TODOs) — wire when that work is scheduled; not blocking ship.
