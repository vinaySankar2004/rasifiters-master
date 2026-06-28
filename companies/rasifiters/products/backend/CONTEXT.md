# Product: rasifiters / backend (L2)

The shared API for RaSi Fiters. Both `web` and `ios` consume it. Node/Express + Sequelize.

**Reference implementation:** `../../../../backend` (the legacy Express API). Faithful 1:1 rebuild except
the DB target (→ Supabase) and the auth layer (→ Supabase Auth, proxied + JWT-verified).

## Stack
- Node 18 · Express 4 · Sequelize 6 · `pg`
- bcrypt (legacy hashing — hashes are imported into Supabase Auth, then bcrypt leaves the app)
- `apn` (Apple Push Notifications) · Server-Sent Events for the notification stream
- Host: **Railway** (`rasifiters-api`, `TODO(provision)`)

## Data
- **Supabase Postgres**, schema migrated faithfully from the legacy Render DB — **same table names, no
  prefix** (R5). Core tables: `members`, `member_emails`, `member_push_tokens`, `programs`,
  `program_memberships`, `program_invites`, `program_invite_blocks`, `workouts_library`,
  `program_workouts`, `workout_logs`, `daily_health_logs`, `notifications`, `notification_recipients`.
- **Retired at migration:** `member_credentials`, `refresh_tokens` (Supabase Auth owns these).
- **Added at migration:** `members.auth_user_id` (UUID, unique) → maps to `auth.users.id`.
- Migrations: `sql/` (numbered, idempotent, user-reviewed/run). _Created during the backend build._

## Auth (see CLAUDE.md + METHODOLOGY.md R1)
- Express **proxies** Supabase Auth for `/auth/login`, `/auth/refresh`, `/auth/logout` so clients change
  minimally. Login resolves username→email server-side (privacy-safe), then signs in via Supabase.
- Middleware **verifies Supabase JWTs** (JWKS), reads `sub`, loads the member via `auth_user_id`.
- Authorization (global_role, per-program admin/logger checks) stays in Express, unchanged from legacy.

## Endpoints
~11 route groups (auth, members, programs, program-memberships, invites, workouts, program-workouts,
workout-logs, daily-health-logs, notifications, analytics v1+v2, member-analytics). Documented
feature-by-feature in `features/` as they're rebuilt; cross-checked against the legacy routes.

## Deploy
Railway service `rasifiters-api`. Env per `ENV_RUNBOOK.md`. See the `deploy` skill (Railway runbook lifted
from higgins-master).

## Status
📄 not built — pending the migrator + Supabase provisioning.
