-- 012_people_hide_activity_kudos.sql — People server slice S1 (reliability-overhaul Phase 4;
-- specs/features/people/SPEC.md §6; phase-4 DECISIONS D-P4–D-P7).
--
-- WHAT
--   PART 1  members.hide_activity — "Hide my activity" (D-P6/D-P7). boolean NOT NULL DEFAULT false: every existing member
--           stays visible. A constant default is a catalog-only change on PostgreSQL 11+ (no table rewrite).
--   PART 2  kudos — one row per giver per recipient per RECIPIENT-LOCAL day (D-P4/D-P5): UNIQUE (giver_id, recipient_id,
--           kudos_date) + CHECK giver_id <> recipient_id. program_id = the program it was given in (context + deep link
--           only; not part of the key). notification_id = its activity.kudos_received notification (SET NULL when the
--           notification is deleted — retention or undo).
--   PART 3  RLS on the `public` copy only; on `staging`: grants for rasifiters_staging + RLS off for every staging table.
--   PART 4  verification row.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema(). Run TWICE, STAGING FIRST:
--   SQL editor: first line `SET search_path TO staging;` + this whole file → Run; then the same with
--               `SET search_path TO public;`. If the editor offers "Run and enable RLS", run WITHOUT it.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/012_people_hide_activity_kudos.sql
--               then the same with public — SESSION pooler or direct connection (port 5432) ONLY.
-- ORDER: run + verify on BOTH schemas BEFORE any People S1 code is committed. The backend's Member model reads
--   members.hide_activity on EVERY authenticated request (the auth middleware's member lookup) — a backend that has the
--   attribute without the column answers every call 503. The running backend ignores the new column, so running this
--   early is safe. SQL independent of 011 (either order); the S1 CODE requires 011 on the schema first (kudos reads the
--   recipient's time zone from notification_preferences and emits through createNotification).
-- IDEMPOTENT: IF NOT EXISTS everywhere; the RLS / GRANT block re-runs safely.
-- LOCK TIMEOUT: the ALTER on members takes a brief exclusive lock, capped at 5 s. On "canceling statement due to lock
--   timeout" nothing changed — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — Hide my activity ==================================================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS hide_activity boolean DEFAULT false NOT NULL;

-- ===== PART 2 — kudos =============================================================================================
CREATE TABLE IF NOT EXISTS kudos (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    giver_id         uuid NOT NULL,
    recipient_id     uuid NOT NULL,
    program_id       uuid NOT NULL,
    kudos_date       date NOT NULL,
    notification_id  uuid,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT kudos_pkey PRIMARY KEY (id),
    CONSTRAINT kudos_not_self_check CHECK (giver_id <> recipient_id),
    CONSTRAINT kudos_giver_recipient_day_key UNIQUE (giver_id, recipient_id, kudos_date),
    CONSTRAINT kudos_giver_id_fkey FOREIGN KEY (giver_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT kudos_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT kudos_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    CONSTRAINT kudos_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
);

-- The profile's count + "given today" reads (recipient first); the UNIQUE key already serves giver-first lookups.
CREATE INDEX IF NOT EXISTS idx_kudos_recipient_id_kudos_date ON kudos USING btree (recipient_id, kudos_date);
-- FK indexes: a program delete / the nightly notification retention never scans kudos.
CREATE INDEX IF NOT EXISTS idx_kudos_program_id ON kudos USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_kudos_notification_id ON kudos USING btree (notification_id);

-- ===== PART 3 — RLS (public) / grants + RLS off (staging) =========================================================
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON kudos TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', current_schema(), t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 4 — verification (read-only; the SQL editor shows this last result) ===================================
SELECT current_schema()                                                          AS schema_name,          -- staging, then public
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'members' AND column_name = 'hide_activity'
           AND is_nullable = 'NO' AND column_default = 'false')                  AS hide_activity_column, -- 1
       (SELECT count(*) FROM members WHERE hide_activity)                        AS hidden_members,       -- 0 on the first run
       to_regclass('kudos') IS NOT NULL                                          AS kudos_table,          -- t
       (SELECT count(*) FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'kudos')            AS kudos_indexes,        -- 5
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid = to_regclass('kudos') AND contype IN ('c', 'u', 'f'))   AS kudos_constraints,    -- 6
       (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('kudos'))    AS rls_on,               -- public t · staging f
       has_table_privilege('rasifiters_staging', to_regclass('kudos'), 'INSERT') AS staging_role_writes;  -- staging t · public f
