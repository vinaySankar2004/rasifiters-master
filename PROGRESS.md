# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** The single source of truth for *where we are* and *what's next*.
> Cross-session loop: start → read this → work → at session end, update this file + commit (via
> `git-version`). A condensed run history (2026-06-28 → 2026-06-30) is in **`PROGRESS_ARCHIVE.md`**
> (one line per run, not auto-loaded); full per-run detail lives in this file's git history.

## Current phase

**Rebuild COMPLETE across all three surfaces; repo detached from legacy + docs slimmed (2026-06-30). Next: TestFlight.**

- **`backend`** — DEPLOYED + LIVE on Render (`rasifiters-api`, `https://rasifiters-api.onrender.com`); auth
  round-trip verified live against migrated data. All backend features ported (`specs/features/REGISTRY.md`).
- **`web`** — COMPLETE + LIVE on `https://rasifiters.com` (Vercel `rasifiters`, git auto-deploy on `main`).
  34 page SPECs (legacy-parity + the net-new `forgot-password`/`reset-password` recovery pages); signed-in
  proxy round-trip user-verified live (profile edit, email change, password recovery).
- **`ios`** — CODE-COMPLETE. All screens + widgets + Apple Health auto-sync ported; the deferred-stub layer is
  closed (no stubs remain). Native build GREEN via the `xcode` MCP. 31 iOS screen SPECs. Visual/runtime
  verification is the user's, in Xcode — memory [[ios-user-verifies-builds-visually]].
- **Data/auth** — Supabase (`kpadxjekpiwfkqcxtrio`) provisioned; schema + 48/48 members migrated (bcrypt
  hashes imported, no resets). The one-time migrator was removed post-cutover.
- **Legacy detachment (2026-06-30)** — the repo now stands alone: SPEC `Reference impl` headers → `Provenance`
  (no live legacy paths), mission framing past-tense, `tools/migrator/` deleted, the `additionalDirectories`
  instruction dropped. App code under `apps/` is the sole source of truth; `PROGRESS.md` slimmed (log → archive).

## Next action

> ### ⏭️ ON "continue" → TestFlight prep for `ios`

The rebuild + cleanup are done. Remaining path to ship:

1. **Move the repo** (this cleanup's final step, done by Claude at session end): `rasifiters-master` →
   `~/Desktop/rasifiters-master` (standalone; legacy no longer a sibling). Reopen Claude there to continue.
2. **Apple Health user to-do** (before that feature works): run migration
   `apps/backend/sql/004_seed_healthkit_workout_types.sql` on Supabase; in Xcode add the **HealthKit
   (Background Delivery)** + **Background Modes (fetch)** capabilities + enable HealthKit on the App ID;
   on-device test (Simulator has no HealthKit) + App Store privacy config.
3. **TestFlight build:** bump the iOS version/build (currently `1.3.0/40` — user bumps +1 at push time);
   **flip `APNS_PRODUCTION=true` on Render** (`tools/render-env.sh set APNS_PRODUCTION true && tools/render-env.sh deploy`)
   — TestFlight/App-Store builds get production APNs tokens (`ENV_RUNBOOK.md` §3). Archive + upload in Xcode.
4. **Pre-cutover backend smoke-tests** (batched; needs a live admin JWT the user supplies) if not already
   covered by the web signed-in round-trip.

## Build sequence

1. [x] Scaffold the ICM repo — 2026-06-28
2. [x] Provision infra — Supabase + Render + Vercel LIVE (2026-06-28/29)
3. [x] Migrate data + auth to Supabase — 2026-06-28 (migrator since removed)
4. [x] `backend` — all features ported + deployed + auth verified live
5. [x] `web` — all pages ported + deployed + LIVE on `rasifiters.com`
6. [x] `ios` — all screens/widgets/Apple-Health ported; native build green (user does visual + TestFlight)
7. [~] Cutover — web domain LIVE; **iOS TestFlight is the remaining step**

## Coverage

- Features: **15** (backend coverage complete) — `specs/features/REGISTRY.md` + `registry.json`.
- Web page SPECs: **34** · iOS screen SPECs: **31** — `specs/pages/REGISTRY.md`.
- Legacy-parity coverage: `COVERAGE.md`.

## Open items (carry until resolved)

- **iOS runtime + TestFlight** is the user's pass (visual in Xcode; Simulator has no HealthKit).
- **`APNS_PRODUCTION`** must flip to `true` at first TestFlight/App-Store distribution (else `BadDeviceToken`
  + the token is auto-pruned).
- **Backend runtime smoke-tests** are batched to a pre-cutover pass needing a live admin JWT (user supplies).
- **`notifications` cross-feature emits** are intentionally deferred in backend services (documented in-code
  TODOs) — wire when that work is scheduled; not blocking ship.
