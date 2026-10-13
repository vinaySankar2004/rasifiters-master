-- 009_health_sync_ledger.sql — health sync v2 (reliability-overhaul Phase 3 R2; specs/features/health-sync/SPEC.md §5;
-- DESIGN_BOARD §4 items 3-7, D-7).
--
-- WHAT
--   1. health_sync_samples — the PERMANENT per-sample workout ledger: one row per (member, program, integration, Health
--      sample id) the server applied ('applied') or adopted from an old build's device ledger ('legacy'). A Health
--      deletion sets deleted_at; the app never deletes rows (only the FK cascades below do).
--   2. health_sync_state — server-remembered sync state per (member, program, integration, kind): first-sync review
--      done + last successful sync.
--   3. daily_health_logs.sleep_source / steps_source — per-field provenance ('healthkit' | 'health_connect'; NULL = not
--      written by health sync v2). Nullable, no default: existing rows are untouched.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema(). Run TWICE, STAGING FIRST:
--   SQL editor: first line `SET search_path TO staging;` + this whole file → Run; then the same with
--               `SET search_path TO public;`. If the editor offers "Run and enable RLS", run WITHOUT it.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/009_health_sync_ledger.sql
--               then the same with public — SESSION pooler or direct connection (port 5432) ONLY: on the transaction
--               pooler (6543) SET search_path does not persist and the "staging" run silently lands in public.
-- IDEMPOTENT: IF NOT EXISTS everywhere; the RLS / GRANT block re-runs safely.
-- ORDER: before the backend deploy that adds /api/health-sync (those routes 500 without these objects; no other route
--   reads them — the DailyHealthLog model does not map the two new columns).
-- LOCK TIMEOUT: the ALTER on daily_health_logs takes a brief exclusive lock; the first statement caps every lock wait
--   at 5 s so it can never queue live writes. On "canceling statement due to lock timeout" nothing changed (the SQL
--   editor rolls the run back) — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — the sample ledger =================================================================================
CREATE TABLE IF NOT EXISTS health_sync_samples (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id           uuid NOT NULL,
    program_id          uuid NOT NULL,
    integration         character varying(16) NOT NULL,
    sample_id           character varying(128) NOT NULL,
    origin              character varying(255),
    program_workout_id  uuid,
    log_date            date NOT NULL,
    start_at            timestamp with time zone,
    end_at              timestamp with time zone,
    minutes             integer,
    status              character varying(16) DEFAULT 'applied'::character varying NOT NULL,
    applied_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at          timestamp with time zone,
    CONSTRAINT health_sync_samples_pkey PRIMARY KEY (id),
    CONSTRAINT health_sync_samples_sample_key UNIQUE (member_id, program_id, integration, sample_id),
    CONSTRAINT health_sync_samples_integration_check CHECK (integration IN ('healthkit', 'health_connect')),
    CONSTRAINT health_sync_samples_status_check CHECK (status IN ('applied', 'legacy')),
    CONSTRAINT health_sync_samples_minutes_check CHECK (minutes IS NULL OR minutes >= 0),
    -- CASCADE: account deletion (cascadeMemberDeletion → members row delete) removes the member's ledger.
    CONSTRAINT health_sync_samples_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    -- Same pair FK as workout_logs: leaving a program keeps the membership row (status 'removed'), so rows stay.
    CONSTRAINT health_sync_samples_membership_fkey FOREIGN KEY (program_id, member_id)
        REFERENCES program_memberships(program_id, member_id) ON DELETE CASCADE,
    CONSTRAINT health_sync_samples_program_workout_id_fkey FOREIGN KEY (program_workout_id)
        REFERENCES program_workouts(id) ON DELETE SET NULL
);

-- Deletions arrive with a sample id only (no program); duplicate lookups too.
CREATE INDEX IF NOT EXISTS idx_health_sync_samples_member_sample
    ON health_sync_samples USING btree (member_id, sample_id);
-- Overlap rule + 24 h day cap: live rows of a member's programs around the batch's dates.
CREATE INDEX IF NOT EXISTS idx_health_sync_samples_member_program_date
    ON health_sync_samples USING btree (member_id, program_id, log_date);
-- The program_workouts FK (ON DELETE SET NULL) without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_health_sync_samples_program_workout_id
    ON health_sync_samples USING btree (program_workout_id);

-- ===== PART 2 — server-remembered sync state ======================================================================
CREATE TABLE IF NOT EXISTS health_sync_state (
    member_id        uuid NOT NULL,
    program_id       uuid NOT NULL,
    integration      character varying(16) NOT NULL,
    kind             character varying(16) NOT NULL,
    review_done_at   timestamp with time zone,
    last_success_at  timestamp with time zone,
    updated_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT health_sync_state_pkey PRIMARY KEY (member_id, program_id, integration, kind),
    CONSTRAINT health_sync_state_integration_check CHECK (integration IN ('healthkit', 'health_connect')),
    CONSTRAINT health_sync_state_kind_check CHECK (kind IN ('workout', 'sleep', 'steps')),
    CONSTRAINT health_sync_state_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT health_sync_state_membership_fkey FOREIGN KEY (program_id, member_id)
        REFERENCES program_memberships(program_id, member_id) ON DELETE CASCADE
);

-- ===== PART 3 — per-field provenance on daily rows ================================================================
-- On a re-run the columns exist, so each ADD COLUMN (with its CHECK) is skipped with a notice.
ALTER TABLE daily_health_logs
    ADD COLUMN IF NOT EXISTS sleep_source character varying(16)
        CONSTRAINT daily_health_logs_sleep_source_check CHECK (sleep_source IN ('healthkit', 'health_connect')),
    ADD COLUMN IF NOT EXISTS steps_source character varying(16)
        CONSTRAINT daily_health_logs_steps_source_check CHECK (steps_source IN ('healthkit', 'health_connect'));

-- ===== PART 4 — RLS (public) / grants + RLS off (staging) =========================================================
-- public: RLS on, no policies — the posture of every public table (PostgREST anon/authenticated read nothing; the backend
-- connects as the owner). staging: explicit DML grants for the staging role (008's default privileges already cover
-- tables the owner creates there) and RLS OFF for every staging table — the non-owner staging role must use them (008 §5).
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE health_sync_samples ENABLE ROW LEVEL SECURITY;
        ALTER TABLE health_sync_state ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON health_sync_samples, health_sync_state TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', current_schema(), t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 5 — verification (read-only; the SQL editor shows this last result) ====================================
SELECT current_schema()                                                     AS schema_name,         -- staging, then public
       to_regclass('health_sync_samples') IS NOT NULL                       AS samples_table,       -- t
       to_regclass('health_sync_state') IS NOT NULL                         AS state_table,         -- t
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'daily_health_logs'
           AND column_name IN ('sleep_source', 'steps_source'))             AS source_columns,      -- 2
       (SELECT count(*) FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'health_sync_samples') AS sample_indexes, -- 5
       (SELECT bool_and(relrowsecurity) FROM pg_class
         WHERE oid IN (to_regclass('health_sync_samples'), to_regclass('health_sync_state'))) AS rls_on, -- public t · staging f
       has_table_privilege('rasifiters_staging', to_regclass('health_sync_samples'), 'INSERT')
         AND has_table_privilege('rasifiters_staging', to_regclass('health_sync_state'), 'UPDATE') AS staging_role_writes; -- staging t · public f
