# Product: rasifiters / backend (L2)

The shared API for RaSi Fiters. All three clients (`web`, `ios`, `android`) consume it. Node/Express + Sequelize.

**Provenance (legacy, archived):** ported 1:1 from the original Express API, except the DB target
(→ Supabase) and the auth layer (→ Supabase Auth, proxied + JWT-verified). Legacy source archived, not tracked here.

## Stack
- Node 18 · Express 4 · Sequelize 6 · `pg`
- bcrypt (legacy hashing — hashes are imported into Supabase Auth, then bcrypt leaves the app)
- `apn` (Apple Push Notifications) · Server-Sent Events for the notification stream
- Host: **Render** web service `rasifiters-api` (`srv-d90tgmv7f7vs73cudptg`) via Blueprint `render.yaml`,
  live at `https://rasifiters-api.onrender.com`

## Data
- **Supabase Postgres**, schema migrated faithfully from the legacy Render DB — **same table names, no
  prefix** (R5). Core tables: `members`, `member_emails`, `member_push_tokens`, `programs`,
  `program_memberships`, `program_invites`, `program_invite_blocks`, `workouts_library`,
  `program_workouts`, `workout_logs`, `daily_health_logs`, `notifications`, `notification_recipients`.
- **Retired at migration:** `member_credentials`, `refresh_tokens` (Supabase Auth owns these).
- **Added at migration:** `members.auth_user_id` (UUID, unique) → maps to `auth.users.id`.
- **Added post-parity:** `member_program_order` (per-member program-card order for the picker surfaces;
  migration `sql/005`, `programs` feature 0.2.0 D-N1).
- **Added (reliability overhaul Phase 2):** `app_events` (observability event trail — `POST /api/client-events`, 90-day `pg_cron` retention; migration `sql/007`, [`observability`](../../specs/features/observability/SPEC.md)).
- **Added (reliability overhaul Phase 3 R2):** `health_sync_samples` (permanent per-sample health-sync ledger) + `health_sync_state` (review-once + last successful sync per member/program/integration/kind) + `daily_health_logs.sleep_source` / `steps_source` (per-field provenance, not mapped by the `DailyHealthLog` model) — migration `sql/009`, routes `/api/health-sync/{batch,state}` mounted before the global body parser ([`health-sync`](../../specs/features/health-sync/SPEC.md)).
- Migrations: `sql/` (numbered, idempotent, user-reviewed/run).

## Auth (see CLAUDE.md + METHODOLOGY.md R1)
- Express **proxies** Supabase Auth for `/auth/login`, `/auth/refresh`, `/auth/logout` so clients change
  minimally. Login resolves username→email server-side (privacy-safe), then signs in via Supabase.
- Middleware **verifies Supabase JWTs** (JWKS), reads `sub`, loads the member via `auth_user_id`.
- Authorization (global_role, per-program admin/logger checks) stays in Express, unchanged from legacy.

## Endpoints
~11 route groups (auth, members, programs, program-memberships, invites, workouts, program-workouts,
workout-logs, daily-health-logs, notifications, analytics v1+v2, member-analytics). Documented
feature-by-feature in `specs/features/` as they're rebuilt; cross-checked against the legacy routes.

## Deploy
**LIVE** on Render — web service `rasifiters-api` (`srv-d90tgmv7f7vs73cudptg`),
`https://rasifiters-api.onrender.com`. Defined as IaC in `render.yaml` (`rootDir: apps/backend`,
`buildFilter.paths: [apps/backend/**]`, `autoDeployTrigger: commit`, `healthCheckPath: /`); GitHub
auto-deploy on push to `main` touching `apps/backend/**`. The 3 secrets (`DATABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are dashboard-entered `sync: false` Blueprint vars. Env
per `ENV_RUNBOOK.md`. See the `deploy` skill (Render runbook).

## Staging (reliability-overhaul Phase 2 B — DESIGN_BOARD §8, auth SPEC D-C13)
- **Service:** Render web service `rasifiters-api-staging` (`srv-db6m3u2vcj2c738he7b0`) (**free**, region `virginia`, branch `staging`,
  auto-deploy on commit, `apps/backend`, `npm ci` / `npm start`) → `https://rasifiters-api-staging.onrender.com`.
  Created via the render MCP — not in `render.yaml`. Sleeps after 15 min idle: **wake it before a test session**
  (open `https://rasifiters-api-staging.onrender.com/`, wait for "Rasi Fiters API is running!", ~1 min cold).
- **Deploy on demand:** push the commit to test to the `staging` branch (`git push origin main:staging`, or
  `git push --force-with-lease origin <branch>:staging` for unmerged work). The Vercel staging alias
  (`https://rasifiters-git-staging-personal-vinayak.vercel.app`) builds from the same branch.
- **Data:** the `staging` Postgres schema (`sql/008`, plus `sql/007` re-applied there), reached by `DATABASE_URL`
  logging in as role `rasifiters_staging` (`search_path = staging, extensions`; no privilege on `public`). Backend
  JS never names a schema. Boot check: staging refuses to start unless `current_schema()` = `staging` and
  `current_user` = `rasifiters_staging`; prod never refuses — it only logs
  `[staging-guard] DATABASE_URL logs in as the staging role…` if it finds itself on `staging`.
- **Env (staging only):** `APP_ENV=staging` (turns on `utils/stagingGuard.js`), `CORS_EXTRA_ORIGINS`,
  `APNS_PRODUCTION=false`, `PASSWORD_RESET_REDIRECT_URL` → the staging alias; the rest equals prod
  (`ENV_RUNBOOK.md` §Staging). **Never set `APP_ENV` on prod.**
- **Shared auth:** one `auth.users` for both. Staging accounts use `name+stg@…` / `name+stg-tag@…` emails; the guard
  refuses (create / update → 403) or skips (delete) every login-level change for any other account, and sends reset
  mail only to `+stg` addresses outside `@rasifiters.com` (auth SPEC D-C13).
- **Seed:** `tools/testbed/seed.mjs` with `TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api` and
  `TESTBED_STAGING_MAILBOX` (wakes the service, registers missing `+stg-<username>` accounts, seeds) —
  `tools/testbed/README.md` §Staging. No `global_admin` exists on staging (none can be created through the API),
  so `POST /members`, member delete and workout-library CRUD are untestable there until a staging-only migration
  adds one.

## Runtime + observability (as of 2026-10-12)
- Render plan **Starter**: 1 instance, 0.5 vCPU / 512 MB, region `virginia` (next to Supabase `us-east-1`
  on purpose — one screen issues many queries). Fronted by Cloudflare (TLS terminates at the nearest edge).
  Typical load: ~0.1% CPU, ~120 MB RAM, ~4.5–6k requests/day.
- **Logs:** Render keeps **app logs only** (7 days; no `http_latency` metric — `http_request_count` by status
  works). The app writes **one JSON line per request** (`"type":"request"`) and **SQL logging is off**
  (`DB_LOG_SQL=true` re-enables it locally); every response except the Render health check (`GET`/`HEAD /`,
  not logged) carries `X-Request-Id`. `trust proxy` = 2 hops (Cloudflare edge + Render LB; observability 0.1.1). The global `errorHandler` never prints a request
  body. Event trail: `app_events` via `POST /api/client-events`. Contract + fields:
  [`observability`](../../specs/features/observability/SPEC.md).
- Live binaries hard-code `https://rasifiters-api.onrender.com/api` (iOS `Config/APIConfig.swift`, Android
  `app/build.gradle.kts`) — a host/domain change needs an app release + adoption window first.

## Status
🚀 **Feature-complete + LIVE on Render.** All ~11 route groups (see §Endpoints) are mounted and serving
all three clients + the public store binaries; backend feature coverage is complete — every feature except
the two client-only health integrations (`apple-health`, `health-connect`) has a backend half; the canonical
list is `specs/features/registry.json` (don't restate the count here).
The 2026-06-28 auth-first port (data-layer foundation + `/api/auth`, deployed + verified live same day) was
the seed; every remaining route group landed feature-by-feature — the per-feature record is
`specs/features/registry.json` + each SPEC's changelog. `DELETE /api/auth/account` runs the full
cross-feature cascade (`cascadeMemberDeletion` + Supabase auth-user delete) — the early 501 gap is closed.

**Operational invariants:**
- **Live-binary compatibility:** the backend must degrade gracefully for every binary listed live in
  `RELEASES.md` (oldest included); backend deploys first.
- Supabase JWT signing keys are **asymmetric (ECC P-256 / ES256)** — JWKS verification (D-C2) depends on
  this; `SUPABASE_*` env per `ENV_RUNBOOK.md` / `.env.example`.
