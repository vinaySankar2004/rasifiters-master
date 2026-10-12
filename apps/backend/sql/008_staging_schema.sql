-- 008_staging_schema.sql — STAGING schema + dedicated login role (reliability-overhaul Phase 2, track B).
--
-- Design: specs/initiatives/reliability-overhaul/DESIGN_BOARD.md §8 (approved 2026-10-11) · auth SPEC D-C13.
--
-- WHAT
--   1. Schema `staging` with the SAME table names as `public` (R5 — no prefixes), created ONCE at today's shape:
--      001 + 003 + 005 + 006 merged. Checked against prod read-only before (P0) and after (C1-V5) the run.
--   2. Login role `rasifiters_staging` (search_path = staging, extensions). The staging API (Render
--      `rasifiters-api-staging`) connects as it, so its unqualified SQL lands in `staging`. It gets NO privilege on
--      any `public` table — it cannot read or write prod data.
--   3. DML grants on `staging` + default privileges, so tables that later migrations add to `staging` are covered.
--   4. A copy of the `workouts_library` REFERENCE catalog (workout names only — no member data) so the workout
--      pickers and the HealthKit type map behave on staging as on prod. Nothing else is copied (auth D-C13).
--
-- NOT HERE (the repo is public — DESIGN_BOARD §0.6): the role's password. After running this file, run ONCE by
-- hand in the SQL editor:   ALTER ROLE rasifiters_staging WITH PASSWORD '<output of: openssl rand -hex 24>';
--
-- FK note: staging.members.auth_user_id → auth.users(id) — ONE Supabase Auth shared by prod + staging. Postgres
-- runs RI checks as the owner of the referenced/referencing table, so the staging role needs no grant on `auth`.
--
-- IDEMPOTENT: CREATE … IF NOT EXISTS, a guarded CREATE ROLE, ALTER ROLE to fixed values, re-runnable GRANTs,
-- ON CONFLICT DO NOTHING. 007 and every migration from 009 on are schema-neutral and run once per schema
-- (sql/README.md §Staging schema).
--
-- LOCK TIMEOUT: the first statement caps every lock wait at 5 s, so the FK to auth.users can never queue prod
-- sign-ins behind this script. If it fires ("canceling statement due to lock timeout"), nothing is broken — the
-- SQL editor rolls the whole run back (psql: just that statement) — wait a moment and re-run the file.
--
-- WHO RUNS IT: the USER (Supabase SQL editor as `postgres`, or psql) — never Claude (CLAUDE.md DB-write policy).

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Schema + role
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS staging;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rasifiters_staging') THEN
        CREATE ROLE rasifiters_staging LOGIN NOINHERIT;
    END IF;
END
$$;

ALTER ROLE rasifiters_staging SET search_path = staging, extensions;
-- Bounds the free staging API's footprint on the database prod shares: at most 10 sessions, no query over 30 s.
ALTER ROLE rasifiters_staging CONNECTION LIMIT 10;
ALTER ROLE rasifiters_staging SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE postgres TO rasifiters_staging;

-- ---------------------------------------------------------------------------
-- 2. Base tables (= public today)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staging.members (
    id            uuid NOT NULL,
    username      character varying(255) NOT NULL,
    first_name    character varying(255) NOT NULL,
    last_name     character varying(255) NOT NULL,
    gender        character varying(32),
    global_role   text DEFAULT 'standard'::text NOT NULL,
    status        text DEFAULT 'active'::text NOT NULL,
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    auth_user_id  uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT members_pkey PRIMARY KEY (id),
    CONSTRAINT members_username_key UNIQUE (username),
    CONSTRAINT members_global_role_check1 CHECK ((global_role = ANY (ARRAY['standard'::text, 'global_admin'::text]))),
    CONSTRAINT members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE IF NOT EXISTS staging.workouts_library (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    name        text NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT workouts_library_pkey PRIMARY KEY (id),
    CONSTRAINT workouts_library_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS staging.programs (
    id                     uuid DEFAULT gen_random_uuid() NOT NULL,
    name                   text NOT NULL,
    start_date             date,
    end_date               date,
    status                 text DEFAULT 'planned'::text NOT NULL,
    description            text,
    created_by             uuid NOT NULL,
    created_at             timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at             timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted             boolean DEFAULT false NOT NULL,
    admin_only_data_entry  boolean DEFAULT false NOT NULL,
    CONSTRAINT programs_pkey1 PRIMARY KEY (id),
    CONSTRAINT programs_status_check1 CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT programs_created_by_fkey FOREIGN KEY (created_by) REFERENCES staging.members(id)
);

CREATE TABLE IF NOT EXISTS staging.program_memberships (
    program_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    role        text DEFAULT 'member'::text NOT NULL,
    status      text DEFAULT 'active'::text NOT NULL,
    joined_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at     timestamp with time zone,
    CONSTRAINT program_memberships_pkey1 PRIMARY KEY (program_id, member_id),
    CONSTRAINT program_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'logger'::text, 'member'::text]))),
    CONSTRAINT program_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'requested'::text, 'removed'::text]))),
    CONSTRAINT program_memberships_program_id_fkey1 FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_memberships_member_id_fkey1 FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.program_workouts (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id          uuid NOT NULL,
    library_workout_id  uuid,
    workout_name        text NOT NULL,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_hidden           boolean DEFAULT false NOT NULL,
    CONSTRAINT program_workouts_pkey PRIMARY KEY (id),
    CONSTRAINT program_workouts_program_id_workout_name_key UNIQUE (program_id, workout_name),
    CONSTRAINT program_workouts_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_workouts_library_workout_id_fkey FOREIGN KEY (library_workout_id) REFERENCES staging.workouts_library(id)
);

CREATE TABLE IF NOT EXISTS staging.workout_logs (
    program_id          uuid NOT NULL,
    member_id           uuid NOT NULL,
    program_workout_id  uuid NOT NULL,
    log_date            date NOT NULL,
    duration            integer,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT workout_logs_pkey PRIMARY KEY (program_id, member_id, program_workout_id, log_date),
    CONSTRAINT workout_logs_program_id_member_id_fkey FOREIGN KEY (program_id, member_id) REFERENCES staging.program_memberships(program_id, member_id) ON DELETE CASCADE,
    CONSTRAINT workout_logs_program_workout_id_fkey FOREIGN KEY (program_workout_id) REFERENCES staging.program_workouts(id)
);

CREATE TABLE IF NOT EXISTS staging.daily_health_logs (
    program_id    uuid NOT NULL,
    member_id     uuid NOT NULL,
    log_date      date NOT NULL,
    sleep_hours   numeric(4,2),
    diet_quality  smallint,
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    steps         integer,
    CONSTRAINT daily_health_logs_pkey PRIMARY KEY (program_id, member_id, log_date),
    CONSTRAINT daily_health_logs_at_least_one_check CHECK (sleep_hours IS NOT NULL OR diet_quality IS NOT NULL OR steps IS NOT NULL),
    CONSTRAINT daily_health_logs_diet_quality_check CHECK (((diet_quality >= 0) AND (diet_quality <= 5))),
    CONSTRAINT daily_health_logs_sleep_hours_check CHECK (((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric))),
    CONSTRAINT daily_health_logs_steps_check CHECK (steps >= 0),
    CONSTRAINT daily_health_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE,
    CONSTRAINT daily_health_logs_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT daily_health_logs_program_membership_fkey FOREIGN KEY (program_id, member_id) REFERENCES staging.program_memberships(program_id, member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.member_emails (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id    uuid NOT NULL,
    email        text NOT NULL,
    is_primary   boolean DEFAULT true NOT NULL,
    verified_at  timestamp with time zone,
    created_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_emails_pkey PRIMARY KEY (id),
    CONSTRAINT member_emails_email_key UNIQUE (email),
    CONSTRAINT member_emails_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.member_push_tokens (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id     uuid NOT NULL,
    device_token  character varying(512) NOT NULL,
    platform      character varying(16) DEFAULT 'ios'::character varying NOT NULL,
    device_id     character varying(256),
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_push_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT member_push_tokens_device_token_key UNIQUE (device_token),
    CONSTRAINT member_push_tokens_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.program_invites (
    id                uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id        uuid NOT NULL,
    invited_by        uuid NOT NULL,
    invited_username  text,
    invited_email     text,
    token_hash        text NOT NULL,
    status            text DEFAULT 'pending'::text NOT NULL,
    max_uses          integer DEFAULT 1 NOT NULL,
    uses_count        integer DEFAULT 0 NOT NULL,
    expires_at        timestamp with time zone,
    created_at        timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT program_invites_pkey PRIMARY KEY (id),
    CONSTRAINT program_invites_token_hash_key UNIQUE (token_hash),
    CONSTRAINT program_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revoked'::text]))),
    CONSTRAINT program_invites_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES staging.members(id)
);

CREATE TABLE IF NOT EXISTS staging.program_invite_blocks (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT program_invite_blocks_pkey PRIMARY KEY (id),
    CONSTRAINT program_invite_blocks_program_id_member_id_key UNIQUE (program_id, member_id),
    CONSTRAINT program_invite_blocks_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_invite_blocks_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.notifications (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    type             text NOT NULL,
    program_id       uuid,
    actor_member_id  uuid,
    title            text NOT NULL,
    body             text NOT NULL,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE SET NULL,
    CONSTRAINT notifications_actor_member_id_fkey FOREIGN KEY (actor_member_id) REFERENCES staging.members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staging.notification_recipients (
    notification_id  uuid NOT NULL,
    member_id        uuid NOT NULL,
    acknowledged_at  timestamp with time zone,
    CONSTRAINT notification_recipients_pkey PRIMARY KEY (notification_id, member_id),
    CONSTRAINT notification_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES staging.notifications(id) ON DELETE CASCADE,
    CONSTRAINT notification_recipients_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.member_program_order (
    member_id   uuid NOT NULL,
    program_id  uuid NOT NULL,
    position    integer NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_program_order_pkey PRIMARY KEY (member_id, program_id),
    CONSTRAINT member_program_order_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE,
    CONSTRAINT member_program_order_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE
);

-- Secondary indexes (same as public)
CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON staging.members USING btree (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_member_emails_member_id ON staging.member_emails USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_member_push_tokens_member_id ON staging.member_push_tokens USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_member_push_tokens_platform ON staging.member_push_tokens USING btree (platform);
CREATE INDEX IF NOT EXISTS idx_program_memberships_member_id ON staging.program_memberships USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_program_memberships_program_id ON staging.program_memberships USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_program_workouts_library_workout_id ON staging.program_workouts USING btree (library_workout_id);
CREATE INDEX IF NOT EXISTS idx_program_workouts_program_id ON staging.program_workouts USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_log_date ON staging.workout_logs USING btree (log_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_member_id ON staging.workout_logs USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_id ON staging.workout_logs USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_workout_id ON staging.workout_logs USING btree (program_workout_id);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_log_date ON staging.daily_health_logs USING btree (log_date);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_member_id ON staging.daily_health_logs USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_program_id ON staging.daily_health_logs USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_program_invite_blocks_member_id ON staging.program_invite_blocks USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_program_invite_blocks_program_id ON staging.program_invite_blocks USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_program_invites_invited_by ON staging.program_invites USING btree (invited_by);
CREATE INDEX IF NOT EXISTS idx_program_invites_program_id ON staging.program_invites USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_member_id ON staging.notifications USING btree (actor_member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON staging.notifications USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_program_id ON staging.notifications USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_ack ON staging.notification_recipients USING btree (member_id, acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_member_id ON staging.notification_recipients USING btree (member_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_program_invites_program_username_pending
    ON staging.program_invites USING btree (program_id, invited_username)
    WHERE ((invited_username IS NOT NULL) AND (status = 'pending'::text));

-- ---------------------------------------------------------------------------
-- 3. Grants — the staging role gets DML on staging only (nothing on public)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA staging TO rasifiters_staging;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA staging TO rasifiters_staging;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA staging TO rasifiters_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rasifiters_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO rasifiters_staging;

-- ---------------------------------------------------------------------------
-- 4. Reference catalog copy (workout names only; ids preserved; re-runs add only new names)
-- ---------------------------------------------------------------------------
INSERT INTO staging.workouts_library (id, name, created_at, updated_at)
SELECT id, name, created_at, updated_at FROM public.workouts_library
ON CONFLICT DO NOTHING;
