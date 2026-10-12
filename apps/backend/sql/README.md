# apps/backend/sql — Supabase schema migrations

Numbered, idempotent SQL migrations for the RaSi Fiters Supabase Postgres. **Faithful to the legacy
Render schema** (R5: same table names, no prefixes). Apply them in numeric order.

> **Who runs these:** the **user**, not Claude — per `CLAUDE.md` Claude never executes schema/data SQL
> against the live DB. Claude only authors the files here.

## Files

| File | What it does |
|------|--------------|
| `001_schema.sql` | Creates all 13 canonical tables + indexes + FKs, idempotent (`IF NOT EXISTS`). Adds the one migration delta — `members.auth_user_id` → `auth.users(id)`. |
| `002_backfill_placeholder_member_emails.sql` | Backfills placeholder emails for members missing one. |
| `003_widen_gender_column.sql` | Widens `members.gender` to `varchar(32)` so all profile options fit. |
| `004_seed_healthkit_workout_types.sql` | Seeds `workouts_library` with the Apple Health (HealthKit) workout types (additive, `ON CONFLICT DO NOTHING`) so iOS HealthKit auto-sync maps onto real library rows. See `specs/features/apple-health`. |
| `005_member_program_order.sql` | Creates `member_program_order` (per-member program-card order for the picker surfaces; `programs` 0.2.0). |
| `006_add_steps_to_daily_health_logs.sql` | Adds the optional `daily_health_logs.steps` column + its checks (steps tracking). |
| `007_app_events.sql` | Creates `app_events` (the observability event trail) + 2 indexes, enables RLS on the `public` copy, enables `pg_cron` and schedules the nightly 90-day retention job. **First schema-neutral migration** (no `public.` — DESIGN_BOARD §8): run as-is for prod; for a `staging` schema run `psql "$DSN" -c "SET search_path TO staging" -f apps/backend/sql/007_app_events.sql` over the **session pooler / direct connection (port 5432)** — never the transaction pooler (6543), where `SET search_path` doesn't persist. **If the `pg_cron` part fails on permissions**, enable Cron at Dashboard → Integrations → Cron (or Database → Extensions → `pg_cron`), then re-run the whole file (idempotent). Run it **before** the backend deploy that adds `POST /api/client-events`. See `specs/features/observability`. |

Retired vs legacy (NOT created — Supabase Auth owns them): `member_credentials`, `refresh_tokens`,
`auth_identities`, `email_verification_tokens`. The `legacy_*` backup tables are excluded as cruft.

## How to apply

**Option A — Supabase SQL editor:** paste `001_schema.sql` → Run.

**Option B — psql** (session-pooler / direct connection string from your password manager):

```bash
psql "$SUPABASE_DATABASE_URL" -f apps/backend/sql/001_schema.sql
```

Re-running is safe (every statement is `IF NOT EXISTS`).

## Data + auth migration (historical)

The one-time data + auth migration ran at cutover (2026-06-28): the original rows were copied
(preserving `members.id` UUIDs) and bcrypt credentials imported into Supabase Auth, backfilling
`members.auth_user_id`. The migrator that performed it has since been removed. Ongoing schema changes
are the numbered files above, applied by the user in order.
