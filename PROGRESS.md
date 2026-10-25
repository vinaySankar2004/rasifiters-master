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
| `ios` | App Store (public) | 2026-07-15 |
| `android` | **Google Play (production, 100% rollout)** | 2026-08-06 |

Per-channel binary versions are in `RELEASES.md` (the SoT — don't restate build numbers here). Both repos'
mobile trains are pre-bumped one ahead, so the next upload is ready on either platform.

## Next action

> ### 🚀 Reliability overhaul — shipped 2026-10-15 (since 2026-10-10)
>
> Made sessions/auth, push + invites, iOS + Android health sync, Android Google sign-in and realtime
> industry-standard, consistent across all three frontends, and observable; then the notification redesign + a
> light social layer. [`HANDOFF.md`](specs/initiatives/reliability-overhaul/HANDOFF.md) (what's live, follow-ups) →
> [`BRIEF.md`](specs/initiatives/reliability-overhaul/BRIEF.md) (scope + phase plan §7).
>
> **Status 2026-10-15:** every phase (1b, 2, 3, polish 1, 4) is public on all four surfaces — Notifications, People,
> polish #1–#48 and the pooled parity release (METHODOLOGY R9 + the D4/D5 badge/streak fixes). **Next:** only the
> dated follow-ups in HANDOFF "Next action".
>
> **2026-10-24 → 25:** Hide my activity is now reciprocal (people D-C16 — hide yours, see no one else's; staff
> exempt), iOS runs full-screen on iPhone Duo, and both store listings are refreshed
> ([`STORE_GRAPHICS_BRIEF.md`](specs/marketing/STORE_GRAPHICS_BRIEF.md)). Public on all four surfaces; each new store
> release is its platform's minimum (`RELEASES.md`). No open step.
>
> **Standing constraint:** any backend change must degrade gracefully for **every** live binary — both
> public store releases *and* the older installs users haven't updated (`RELEASES.md` lists them). Backend
> deploys first, clients after. See memory `ios-live-binary-compatibility`.

## Surface state

- **`backend`** — All features live on Render (`specs/features/REGISTRY.md`), incl. Phase 4's notification
  inbox / preferences / scheduler / composer and People. Push = APNs (iOS) + FCM (Android).
- **`web`** — All pages live on `rasifiters.com`, plus the net-new public pages (landing, password recovery,
  legal). Page SPECs indexed in `specs/pages/REGISTRY.md`.
- **`ios`** — Code-complete (screens, widgets, Apple Health sync of workouts / sleep / steps). Builds green in
  Xcode (the user's ⌘B); visual/runtime verification is the user's — memory [[ios-user-verifies-builds-visually]].
- **`android`** — Code-complete (4 tabs, Health Connect, SSE + FCM, widgets). `./gradlew :app:assembleDebug` green.
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

- Features: `specs/features/REGISTRY.md` + `registry.json`; page/screen SPECs: `specs/pages/REGISTRY.md` (the
  canonical indexes — don't restate hard counts elsewhere, they drift).
- Legacy-parity coverage: `COVERAGE.md`.

## Open items (carry until resolved)

- **Search Console (web indexing)** — canonical host (landing **D-LAND-11**, 2026-08-20) + displayed site name
  (**D-LAND-12**, 2026-10-13) are live. Owner steps done 2026-10-13: sitemap resubmitted, Rich Results valid,
  indexing requested for the home page + the 5 "Discovered – not indexed" pages. The 2 "Page with redirect" rows
  are the `http://` hosts redirecting to `https://` apex — expected, no action. "RaSi Fiters" as the shown name
  takes days–weeks (schema is a hint, not a switch) — recheck ~2026-10-27 before doing anything more.
- **Self-serve account deletion (`DELETE /api/auth/account`) is effectively unexercised.** Live traffic
  proves the common paths, not the destructive rare ones. Nuance: the cascade itself
  (`cascadeMemberDeletion`, `apps/backend/utils/programMemberships.js:167`) is **shared** with the admin path
  `DELETE /api/members/:id` (`services/memberService.js:171`), so it is not wholly untested — what's rarely
  hit is this specific self-serve route (`apps/backend/routes/auth.js:241` →
  `services/authService.js:692`), which pairs that cascade with the Supabase auth-user delete for the
  *caller's own* account. Irreversible, touches every table. **Not scheduled** — verifying it means seeding a
  throwaway account via `tools/testbed/`, deleting through the app, then checking for orphaned rows. Low
  likelihood, high blast radius; flagged so the risk stays explicit rather than forgotten. NOT a blocker.
