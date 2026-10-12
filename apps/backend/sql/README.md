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
| `008_staging_schema.sql` | **Staging** (reliability-overhaul Phase 2 B, auth D-C13): schema `staging` + login role `rasifiters_staging` (`search_path = staging, extensions`, no access to `public`; capped at 10 connections and 30 s per statement) + the base tables at today's shape (001+003+005+006) + grants/default privileges + a copy of the `workouts_library` reference catalog. Staging-only — never re-run against `public`. Run once; the role password is set by hand (§Staging schema). Starts with `SET lock_timeout = '5s'`: if it reports a lock timeout, the run rolled back — just re-run it. |

Retired vs legacy (NOT created — Supabase Auth owns them): `member_credentials`, `refresh_tokens`,
`auth_identities`, `email_verification_tokens`. The `legacy_*` backup tables are excluded as cruft.

## How to apply

**Option A — Supabase SQL editor:** paste `001_schema.sql` → Run.

**Option B — psql** (session-pooler / direct connection string from your password manager):

```bash
psql "$SUPABASE_DATABASE_URL" -f apps/backend/sql/001_schema.sql
```

Re-running is safe (every statement is `IF NOT EXISTS`).

## Staging schema (reliability-overhaul Phase 2 B — DESIGN_BOARD §8, auth SPEC D-C13)

One Supabase project holds both environments: `public` (prod) and `staging` (Render `rasifiters-api-staging`).
Same table names (R5). **`auth.users` is shared.**

0. **Pre-flight drift check (read-only, before step 1).** 008 is a hand-written copy of `public`'s shape, so
   first confirm `public` holds nothing it doesn't know about (extension-owned functions are excluded):
   ```sql
   SELECT 'table' AS kind, tablename AS name FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('members','workouts_library','programs','program_memberships',
      'program_workouts','workout_logs','daily_health_logs','member_emails','member_push_tokens','program_invites',
      'program_invite_blocks','notifications','notification_recipients','member_program_order')
   UNION ALL
   SELECT 'trigger', tg.tgrelid::regclass::text || '.' || tg.tgname FROM pg_trigger tg
     JOIN pg_class c ON c.oid = tg.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal
   UNION ALL
   SELECT 'function', p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
   ORDER BY 1, 2;
   ```
   Pass: expect `app_events` as the only extra table (007 is on prod) and no other row. Any other row: STOP —
   don't run 008; take the rows back to the planner.
1. **Once:** run `008_staging_schema.sql` (SQL editor → paste → Run). **Then apply 007 to staging too** — it
   already ran on `public` before `staging` existed: SQL editor → `SET search_path TO staging;` as the first line +
   the whole of `007_app_events.sql` → Run (or the psql form in step 4). It creates `staging.app_events` and the
   `app_events_retention_staging` cron job; RLS stays off on the staging copy by design.
2. **Once, by hand (never in a file — the repo is public):** generate a password locally with
   `openssl rand -hex 24` (hex needs no URL-encoding) and run in the SQL editor
   `ALTER ROLE rasifiters_staging WITH PASSWORD '<that value>';`
3. **Staging `DATABASE_URL`** = your prod `DATABASE_URL` with the user and password replaced: on the pooler
   host (`*.pooler.supabase.com`) the user is `rasifiters_staging.kpadxjekpiwfkqcxtrio`; on the direct host
   (`db.kpadxjekpiwfkqcxtrio.supabase.co`) it is `rasifiters_staging`. Same host, port, database. You paste it
   into the Render staging service yourself.
4. **007 and every migration from 009 on are schema-neutral** (no `public.` / `staging.` in them) and run
   **twice, staging first**:
   - SQL editor: first line `SET search_path TO staging;` + the file → Run; then again with
     `SET search_path TO public;`.
   - psql: `psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/NNN.sql`, then the
     same with `public`. **Session pooler or direct connection (port 5432) only — never the transaction pooler
     (port 6543):** there `SET search_path` does not carry over to the next statement, so the "staging" run
     silently lands in `public`.
   Tables a migration adds to `staging` get the staging role's grants automatically (008's default
   privileges); re-running 008 re-applies them anyway.
5. **Verify (read-only):**
   ```sql
   SELECT count(*) AS staging_tables FROM pg_tables WHERE schemaname = 'staging';                  -- 15 (14 + app_events; + later tables)
   SELECT rolcanlogin, rolconnlimit, rolconfig FROM pg_roles WHERE rolname = 'rasifiters_staging';
   --   t | 10 | {"search_path=staging, extensions",statement_timeout=30s}
   SELECT has_table_privilege('rasifiters_staging', 'public.members', 'SELECT')  AS reads_prod,    -- f
          has_table_privilege('rasifiters_staging', 'staging.members', 'INSERT') AS writes_staging; -- t
   SELECT (SELECT count(*) FROM staging.workouts_library) AS staging_lib,
          (SELECT count(*) FROM public.workouts_library)  AS prod_lib;                             -- equal
   ```
   **Isolation (read-only)** — the staging role must reach nothing outside `staging`:
   ```sql
   SELECT has_schema_privilege('rasifiters_staging','public','CREATE') AS pub_create,          -- f
          has_schema_privilege('rasifiters_staging','auth','USAGE')    AS auth_usage,          -- f
          has_schema_privilege('rasifiters_staging','storage','USAGE') AS storage_usage;       -- f
   SELECT c.oid::regclass FROM pg_class c WHERE c.relnamespace='public'::regnamespace
      AND has_table_privilege('rasifiters_staging', c.oid, 'SELECT,INSERT,UPDATE,DELETE');    -- 0 rows
   SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND has_function_privilege('rasifiters_staging', p.oid, 'EXECUTE');                     -- 0 rows expected; any row = a public function staging can call — stop and review
   ```

## Data + auth migration (historical)

The one-time data + auth migration ran at cutover (2026-06-28): the original rows were copied
(preserving `members.id` UUIDs) and bcrypt credentials imported into Supabase Auth, backfilling
`members.auth_user_id`. The migrator that performed it has since been removed. Ongoing schema changes
are the numbered files above, applied by the user in order.
