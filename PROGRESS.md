# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** The single source of truth for *where we are* and *what's next* —
> current state only. Finished work lives in **`PROGRESS_ARCHIVE.md`** (one line per run, not auto-loaded);
> release-channel state lives in **`RELEASES.md`**; the load-bearing decisions live in the SPECs. Don't
> restate any of those here. At session end, update this file + commit via `git-version`.

## Current phase

**🚀 SHIPPED AND PUBLIC ON ALL FOUR SURFACES.** The rebuild is complete, feature-complete, and live to the
public everywhere:

| Surface | Where it's live | Since |
|---|---|---|
| `backend` | Render — `https://rasifiters-api.onrender.com` | 2026-06-28 |
| `web` | Vercel — `https://rasifiters.com` (git auto-deploy on `main`) | 2026-06-29 |
| `ios` | App Store (public) + TestFlight ahead-train | 2026-07-15 |
| `android` | **Google Play (production, 100% rollout)** | 2026-08-06 |

Per-channel binary versions are in `RELEASES.md` (the SoT — don't restate build numbers here). Both repos'
mobile trains are pre-bumped one ahead, so the next upload is ready on either platform.

## Next action

> ### ⏭️ NO OPEN WORK — the app is feature-complete and public on all four surfaces.
>
> There is no pending port, phase, or ship step. Work from here is user-driven change requests, which run
> through the `multiplex` pipeline for anything nontrivial.
>
> **Standing constraint:** any backend change must degrade gracefully for **every** live binary — both
> public store releases *and* the older installs users haven't updated (`RELEASES.md` lists them). Backend
> deploys first, clients after. See memory `ios-live-binary-compatibility`.

## Surface state

- **`backend`** — All features ported + live on Render (`specs/features/REGISTRY.md`). Auth round-trip
  verified live against migrated data. Push = APNs (iOS) + FCM (Android).
- **`web`** — All pages ported + live on `rasifiters.com`, plus the net-new public pages: the marketing
  `landing` (`/`), `forgot-password`/`reset-password` recovery, and `privacy-policy`/`support`/
  `delete-account` legal (the last three are linked from both store listings). Page SPECs indexed in
  `specs/pages/REGISTRY.md`.
- **`ios`** — Code-complete; all screens, widgets, and Apple Health auto-sync (workouts + sleep) ported, no
  stubs left. Native build green via the `xcode` MCP. `apple-health` is at 0.6.0 (per-program date-window
  scoping, gated first-sync confirmation, admin-lock-aware sync, sum-on-conflict via `on_duplicate:"sum"`,
  silent auto-retry). Visual/runtime verification is the user's, in Xcode — memory
  [[ios-user-verifies-builds-visually]].
- **`android`** — Code-complete; all 4 tabs, Health Connect, SSE + FCM notifications ported, scaffold fully
  removed. `./gradlew :app:assembleDebug` green.
- **Data/auth** — Supabase (`kpadxjekpiwfkqcxtrio`); schema + 48/48 members migrated (bcrypt hashes
  imported, no resets). The one-time migrator was removed post-cutover.

## Build sequence

1. [x] Scaffold the ICM repo — 2026-06-28
2. [x] Provision infra — Supabase + Render + Vercel LIVE (2026-06-28/29)
3. [x] Migrate data + auth to Supabase — 2026-06-28 (migrator since removed)
4. [x] `backend` — all features ported + deployed + auth verified live
5. [x] `web` — all pages ported + deployed + LIVE on `rasifiters.com`
6. [x] `ios` — all screens/widgets/Apple-Health ported; native build green
7. [x] Cutover — web domain LIVE; iOS on TestFlight — 2026-07-05
8. [x] `android` — 4th surface (Compose port), phases A→J complete 2026-07-08; signed AAB → Play closed
   testing 2026-07-10
9. [x] **Public on all four surfaces** — the Android production release closed the ship sequence 2026-08-06

## Coverage

- Features: **16** (incl. the Android-only `health-connect`) — `specs/features/REGISTRY.md` + `registry.json`.
- Page/screen SPECs: `specs/pages/REGISTRY.md` (the canonical index — don't restate hard counts elsewhere,
  they drift).
- Legacy-parity coverage: `COVERAGE.md`.

## Open items (carry until resolved)

- **Re-auth the Render + Vercel MCPs** — both OAuth sessions have gone stale before (400/403); re-connect
  via `/mcp` interactively when next needed. REST (`tools/render-env.sh`) + the local `vercel` CLI work
  meanwhile.
- **Self-serve account deletion (`DELETE /api/auth/account`) is effectively unexercised.** Live traffic
  proves the common paths, not the destructive rare ones. Nuance: the cascade itself
  (`cascadeMemberDeletion`, `apps/backend/utils/programMemberships.js:167`) is **shared** with the admin path
  `DELETE /api/members/:id` (`services/memberService.js:171`), so it is not wholly untested — what's rarely
  hit is this specific self-serve route (`apps/backend/routes/auth.js:241` →
  `services/authService.js:692`), which pairs that cascade with the Supabase auth-user delete for the
  *caller's own* account. Irreversible, touches every table. **Not scheduled** — verifying it means seeding a
  throwaway account via `tools/testbed/`, deleting through the app, then checking for orphaned rows. Low
  likelihood, high blast radius; flagged so the risk stays explicit rather than forgotten. NOT a blocker.
- **`notifications` cross-feature emits** are intentionally deferred in backend services (documented in-code
  TODOs) — wire when that work is scheduled; not blocking.
