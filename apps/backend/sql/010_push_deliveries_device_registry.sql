-- 010_push_deliveries_device_registry.sql — push delivery records + the device registry (reliability-overhaul
-- Phase 3 track R3; specs/features/notifications/SPEC.md 0.4.0 — D-C11, D-C14, D-C15).
--
-- WHAT
--   PART 1  member_push_tokens.last_seen_at — stamped by every PUT /device (and the login push_token ride-along) once
--           the notifications 0.4.0 backend runs. ORDER MATTERS: the column is added with NO default, THEN the
--           default is set (it applies to new rows only), THEN existing rows are backfilled from updated_at (their last
--           registration). `ADD COLUMN … DEFAULT now()` would stamp every old install as seen today; a row the
--           still-running old backend inserts mid-run gets now() from the default (it was just seen).
--           + uniq_member_push_tokens_device_id: device_id is the install id (one row per installation). Pre-flight P1
--           (sql/README.md, 010 row) must return 0 rows, or this index fails.
--   PART 2  push_deliveries — one row per push attempt (+ one `no_device` row per recipient with no registered device).
--   PART 3  RLS on the `public` copy only; on `staging`: grants for rasifiters_staging + RLS off (008 §5).
--   PART 4  pg_cron, per schema: push_deliveries_retention_<schema> (older than 90 days, 04:22 UTC) and
--           member_push_tokens_prune_<schema> (last_seen_at AND updated_at older than 60 days, 04:27 UTC). The
--           updated_at clause keeps the prune safe if the backend is ever rolled back to pre-0.4.0 code, which bumps
--           updated_at on every registration but never last_seen_at; under 0.4.0 the two move together.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8): no schema names outside PART 3's staging-only branch; every object lands in
-- current_schema(). Run it TWICE, staging first (sql/README.md §Staging schema step 4):
--   SQL editor: first line `SET search_path TO staging;` + this file → Run → the VERIFY block at the end; then the
--               same with `SET search_path TO public;`.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/010_push_deliveries_device_registry.sql
--               — session pooler / direct connection (port 5432) ONLY; on the transaction pooler (6543)
--               `SET search_path` does not persist and the run silently lands in `public`.
--   If the SQL editor offers "Run and enable RLS", run WITHOUT it (PART 3 sets RLS per schema).
-- ORDER: run + verify on `public` BEFORE the notifications 0.4.0 backend reaches `main` (Render auto-deploys main;
-- its PUT /device writes last_seen_at). Independent of 009 — either may run first.
-- IDEMPOTENT: IF NOT EXISTS everywhere; the backfill touches NULLs only; SET DEFAULT / SET NOT NULL / GRANT / the RLS
-- block / cron.schedule (same job name → updated) all re-run safely.
-- LOCK TIMEOUT: the ALTERs take a brief exclusive lock on member_push_tokens, capped at 5 s. If it fires, nothing is
-- broken (the SQL editor rolls the run back) — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — device registry ================================================================================

ALTER TABLE member_push_tokens ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;
ALTER TABLE member_push_tokens ALTER COLUMN last_seen_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE member_push_tokens SET last_seen_at = updated_at WHERE last_seen_at IS NULL;
ALTER TABLE member_push_tokens ALTER COLUMN last_seen_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_member_push_tokens_last_seen_at ON member_push_tokens USING btree (last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_push_tokens_device_id
    ON member_push_tokens USING btree (device_id) WHERE (device_id IS NOT NULL);

-- ===== PART 2 — push_deliveries ================================================================================

CREATE TABLE IF NOT EXISTS push_deliveries (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notification_id  uuid NOT NULL,
    member_id        uuid NOT NULL,
    push_token_id    uuid,
    platform         character varying(16),
    outcome          character varying(16) NOT NULL,
    error_code       character varying(64),
    CONSTRAINT push_deliveries_pkey PRIMARY KEY (id),
    CONSTRAINT push_deliveries_outcome_check
        CHECK (outcome IN ('sent', 'failed', 'pruned', 'no_device', 'not_configured')),
    -- push_token_id has NO FK on purpose: tokens are pruned, the delivery record stays.
    CONSTRAINT push_deliveries_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    CONSTRAINT push_deliveries_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_created_at ON push_deliveries USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_member_id_created_at ON push_deliveries USING btree (member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_notification_id ON push_deliveries USING btree (notification_id);

-- ===== PART 3 — RLS (public) / grants + RLS off (staging) ======================================================
-- public: RLS on, no policies — the posture of every public table (PostgREST reads nothing; the backend is the owner).
-- staging: explicit DML grant for the non-owner staging role, and RLS off for every staging table (008 §5).

DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON push_deliveries TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'staging' LOOP
            EXECUTE format('ALTER TABLE staging.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 4 — nightly retention + unseen-token prune (pg_cron is already enabled by 007) ======================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'push_deliveries_retention_' || current_schema(),
    '22 4 * * *',
    format('DELETE FROM %I.push_deliveries WHERE created_at < now() - interval %L', current_schema(), '90 days')
);

SELECT cron.schedule(
    'member_push_tokens_prune_' || current_schema(),
    '27 4 * * *',
    format('DELETE FROM %I.member_push_tokens WHERE last_seen_at < now() - interval %L AND updated_at < now() - interval %L',
           current_schema(), '60 days', '60 days')
);

-- ===== VERIFY (read-only — run after each schema's run, with the same `SET search_path TO <schema>;` first) =====
-- SELECT column_default, is_nullable FROM information_schema.columns
--  WHERE table_schema = current_schema() AND table_name = 'member_push_tokens' AND column_name = 'last_seen_at';
--     → CURRENT_TIMESTAMP | NO
-- SELECT count(*) AS total, count(*) FILTER (WHERE last_seen_at = updated_at) AS backfilled FROM member_push_tokens;
--     → backfilled = total (a few fewer only if a device re-registered since the run)
-- SELECT count(*) FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN (
--   'idx_member_push_tokens_last_seen_at', 'uniq_member_push_tokens_device_id', 'push_deliveries_pkey',
--   'idx_push_deliveries_created_at', 'idx_push_deliveries_member_id_created_at', 'idx_push_deliveries_notification_id');
--     → 6
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'push_deliveries'::regclass;     → public: t · staging: f
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname IN
--   ('push_deliveries_retention_' || current_schema(), 'member_push_tokens_prune_' || current_schema()) ORDER BY 1;
--     → member_push_tokens_prune_<schema> | 27 4 * * * | t ;  push_deliveries_retention_<schema> | 22 4 * * * | t
-- staging only:
-- SELECT has_table_privilege('rasifiters_staging', 'staging.push_deliveries', 'INSERT') AS can_insert,
--        (SELECT count(*) FROM pg_class WHERE relnamespace = 'staging'::regnamespace AND relkind = 'r'
--          AND relrowsecurity) AS staging_rls_on;                                   → t | 0
