# PROGRESS_ARCHIVE.md — condensed run history (historical)

> A concise, one-entry-per-run chronological record of the RaSi Fiters rebuild (2026-06-28 → 2026-06-30):
> each run's date, headline, and gist. **Append-only history — not auto-loaded.** For current phase +
> next action, read `PROGRESS.md`; for full per-run detail, see the git history of `PROGRESS.md`
> (this file was condensed from the verbose 2,545-line session log on 2026-06-30). Some entries reference
> the legacy app + the removed one-time migrator as they were written — kept as the audit trail.

## Run history (newest first)

- **2026-06-30 (run 65)** — **Ported the 2 iOS widget entry views → the iOS DEFERRED LAYER IS CLOSED.** `question-asker` on the last 2 deferred stubs (`QuickAddWorkout`/`QuickAddHealthWidgetEntryView`, the Home-Screen widget deep-link targets).
- **2026-06-30** — **Web polish + live-test fixes (post-launch side-quests; web surface stays CLOSED → next is `ios`).** Three user-reported fixes against the LIVE site, all committed + deployed + manually verified by the user: **(1) Profile page (`/program/profile`) gender fix + net-new email change** (commit `e4712d5`; **members→0.3.0**, **auth→0.5.0**,…
- **2026-06-29 (pm-10)** — **Specced + ported the `program` page (10th web page) — the FOURTH & LAST WORKSPACE TAB (`/program`), the program settings hub. All 4 workspace tabs now live; the landing layer is complete.** `question-asker` run 24.
- **2026-06-29 (pm-9)** — **Specced + ported the `lifestyle` page (9th web page) — the THIRD WORKSPACE TAB (`/lifestyle`), the workout-type-analytics / health-timeline overview.** `question-asker` run 23.
- **2026-06-29 (pm-8)** — **Specced + ported the `members` page (8th web page) — the SECOND WORKSPACE TAB (`/members`), the per-member overview / "view as" dashboard.** `question-asker` run 22.
- **2026-06-29 (pm-7)** — **Specced + ported the `summary` page (7th web page) — the FIRST WORKSPACE TAB (`/summary`), the program-overview dashboard + the desktop log-form write path.** `question-asker` run 21.
- **2026-06-29 (pm-6)** — **Specced + ported the `programs` hub (6th web page) — the FIRST PROTECTED route — and RESOLVED the standing `middleware.ts` HS256→ES256 open question.** `question-asker` run 20.
- **2026-06-29 (pm-5)** — **Specced + ported the `create-account` page (5th web page) — the public/auth path (splash → login → forgot → reset → create-account) is now COMPLETE.** `question-asker` run 19.
- **2026-06-29 (pm-4)** — **Specced + ported the `reset-password` page (4th web page, 2nd net-new) + the NET-NEW backend `POST /auth/reset-password` (auth 0.3.0→0.4.0); the auth-recovery path is now END-TO-END.** `question-asker` run 18.
- **2026-06-29 (pm-3)** — **Specced + ported the `forgot-password` page (3rd web page, the FIRST net-new one) + the NET-NEW backend `POST /auth/forgot-password` (auth 0.2.0→0.3.0).** `question-asker` run 17.
- **2026-06-29 (pm-2)** — **Specced + ported the `login` page (2nd web page spec) + established the auth-recovery path plan.** User opened by mandating the auth follow-up set: Supabase Auth was chosen for easy self-service recovery, so login/sign-up/account pages must GAIN forgot/reset-password (web first, then iOS), with a **dual** forgot-password (emailed rese…
- **2026-06-29 (pm)** — **Phase 3 (`web`) STARTED — ported the web foundation scaffold + it builds green.** Backend feature coverage having closed (14 features), began the web phase.
- **2026-06-29 (am-6)** — **Specced + ported `app-config` — the 14th and LAST backend feature; backend feature coverage is now COMPLETE.** First confirmed (per the carried Next-action) what remained of `app-config`/push: **nothing to port** — `GET /api/app-config` was already inline + byte-identical in `server.js`; the push/APNs device lifecycle (`PUT`/`DELETE /api/notifica…
- **2026-06-29 (am-5)** — **Specced + ported the `member-analytics` feature.** (13th feature — the per-member analytics surface; **its own file pair**, not the analytics/analytics-v2 pair).
- **2026-06-29 (am-4)** — **Specced + ported the `analytics-v2` feature.** (12th feature — the v2 half of the shared `routes/analytics.js`/`analyticsService.js` file pair; the file pair is now whole, like the logs + workout services).
- **2026-06-29 (am-3)** — **Specced + ported the `analytics` (v1) feature.** (11th feature — the program-level read-aggregation API; the `v1Router` half of the shared `routes/analytics.js`/`analyticsService.js`).
- **2026-06-29 (am-2)** — **Specced + ported the `daily-health-logs` feature.** (10th feature — the OTHER half of the shared `routes/logs.js`/`services/logService.js` file pair).
- **2026-06-29 (am)** — **Specced + ported the `workout-logs` feature.** (9th feature — the workout-logging write surface, and the `workoutLogRouter` half of the shared `routes/logs.js`/`services/logService.js`).
- **2026-06-28 (pm-15)** — **Specced + ported the `program-workouts` feature.** (8th feature — the program-scoped other half of the shared `workoutService.js`).
- **2026-06-28 (pm-14)** — **Specced + ported the `workouts` feature.** (7th feature — the global workout library).
- **2026-06-28 (pm-13)** — **Wired the two deferred 501 delete cascades.** (`members DELETE /:id` + auth `DELETE /account`) now that program-memberships/invites/notifications are ported.
- **2026-06-28 (pm-12)** — **Specced + ported the `invites` feature.** (6th feature — the co-mounted other half of `/api/program-memberships`).
- **2026-06-28 (pm-11)** — **Specced + ported the `notifications` feature.** (5th feature — **the keystone**).
- **2026-06-28 (pm-10)** — **Specced + ported the `program-memberships` feature.** (4th feature).
- **2026-06-28 (pm-9)** — **Specced + ported the `programs` feature.** (3rd feature).
- **2026-06-28 (pm-8)** — **Specced + ported the `members` feature.** (2nd feature).
- **2026-06-28 (pm-7)** — **Deployed the auth backend to Render + verified it live.** User provisioned the Blueprint (`apps/backend/render.yaml`) and connected GitHub auto-deploy; service `rasifiters-api` (`srv-d90tgmv7f7vs73cudptg`) live at `https://rasifiters-api.onrender.com`.
- **2026-06-28 (pm-6)** — **Switched the backend host Railway → Render.** (user decision; METHODOLOGY R7).
- **2026-06-28 (pm-5)** — **Ported the backend foundation + `auth` feature.** into `apps/backend/`.
- **2026-06-28 (pm-4)** — **Specced the backend `auth` feature.** (first SPEC in the repo) via `question-asker`.
- **2026-06-28 (pm-3)** — **Ran the migration against live Supabase.** User applied `apps/backend/sql/001_schema.sql` + reset the DB password + handed over creds; filled `tools/migrator/.env`.
- **2026-06-28 (pm-2)** — **Built the migrator + faithful schema.** Mapped the live legacy schema via `pg_dump --schema-only` (richer than the Sequelize models: real CHECKs, `programs.created_by NOT NULL`, composite FKs, partial unique index; found `auth_identities`/`email_verification_tokens` empty + `l…
- **2026-06-28 (pm)** — **Provisioned Supabase.** Created a new org `RaSi Fiters` (`lxehyprifvuozciizlem`) + project `rasifiters` (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY) via the Supabase CLI (upgraded 2.67→2.108 to fix the broken `--region` enum; trusted the `supabase/…
- **2026-06-28** — Scaffolded the ICM repo from higgins-master; then restructured to fit RaSi: dropped `companies/` → `apps/`; split specs into `specs/features/` + `specs/pages/` (with role-based view rules); removed the `stitch` skill (faithful direct por…
