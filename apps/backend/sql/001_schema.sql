-- 001_schema.sql — RaSi Fiters faithful schema (Render Postgres → Supabase)
--
-- Source of truth: a `pg_dump --schema-only` of the legacy Render DB (rasi_fiters_db).
-- Faithful 1:1 (R5: same table names, NO prefixes; legacy UUIDs preserved by the migrator).
--
-- Deltas vs legacy (deliberate — see METHODOLOGY.md R1):
--   • RETIRED (Supabase Auth owns these) — NOT recreated here:
--       member_credentials, refresh_tokens, auth_identities, email_verification_tokens
--   • ADDED: members.auth_user_id uuid UNIQUE → auth.users(id)  (maps a member to its Supabase Auth user)
--   • The legacy_* backup tables are migration cruft and are intentionally excluded.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS (inline PK/UNIQUE/CHECK/FK) + CREATE INDEX IF NOT EXISTS.
-- Safe to re-run. Tables are ordered so every inline FK references an already-created table.
--
-- HOW TO RUN: the user applies this (Supabase SQL editor or psql against the project DB).
--   Claude never executes schema SQL against the live DB (CLAUDE.md DB-write policy).

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- members  (id has NO default — supplied by the app/migrator, faithful to legacy)
-- ADDED: auth_user_id → auth.users(id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
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

-- ---------------------------------------------------------------------------
-- workouts_library
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workouts_library (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    name        text NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT workouts_library_pkey PRIMARY KEY (id),
    CONSTRAINT workouts_library_name_key UNIQUE (name)
);

-- ---------------------------------------------------------------------------
-- programs  (created_by → members; NOT NULL, faithful to live DB)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.programs (
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
    CONSTRAINT programs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.members(id)
);

-- ---------------------------------------------------------------------------
-- program_memberships  (composite PK; the active-membership join)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_memberships (
    program_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    role        text DEFAULT 'member'::text NOT NULL,
    status      text DEFAULT 'active'::text NOT NULL,
    joined_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at     timestamp with time zone,
    CONSTRAINT program_memberships_pkey1 PRIMARY KEY (program_id, member_id),
    CONSTRAINT program_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'logger'::text, 'member'::text]))),
    CONSTRAINT program_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'requested'::text, 'removed'::text]))),
    CONSTRAINT program_memberships_program_id_fkey1 FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_memberships_member_id_fkey1 FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- program_workouts  (library_workout_id → workouts_library)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_workouts (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id          uuid NOT NULL,
    library_workout_id  uuid,
    workout_name        text NOT NULL,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_hidden           boolean DEFAULT false NOT NULL,
    CONSTRAINT program_workouts_pkey PRIMARY KEY (id),
    CONSTRAINT program_workouts_program_id_workout_name_key UNIQUE (program_id, workout_name),
    CONSTRAINT program_workouts_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_workouts_library_workout_id_fkey FOREIGN KEY (library_workout_id) REFERENCES public.workouts_library(id)
);

-- ---------------------------------------------------------------------------
-- workout_logs  (composite PK; composite FK → program_memberships)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_logs (
    program_id          uuid NOT NULL,
    member_id           uuid NOT NULL,
    program_workout_id  uuid NOT NULL,
    log_date            date NOT NULL,
    duration            integer,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT workout_logs_pkey PRIMARY KEY (program_id, member_id, program_workout_id, log_date),
    CONSTRAINT workout_logs_program_id_member_id_fkey FOREIGN KEY (program_id, member_id) REFERENCES public.program_memberships(program_id, member_id) ON DELETE CASCADE,
    CONSTRAINT workout_logs_program_workout_id_fkey FOREIGN KEY (program_workout_id) REFERENCES public.program_workouts(id)
);

-- ---------------------------------------------------------------------------
-- daily_health_logs  (composite PK; composite FK → program_memberships)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_health_logs (
    program_id    uuid NOT NULL,
    member_id     uuid NOT NULL,
    log_date      date NOT NULL,
    sleep_hours   numeric(4,2),
    diet_quality  smallint,
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT daily_health_logs_pkey PRIMARY KEY (program_id, member_id, log_date),
    CONSTRAINT daily_health_logs_at_least_one_check CHECK (((sleep_hours IS NOT NULL) OR (diet_quality IS NOT NULL))),
    CONSTRAINT daily_health_logs_diet_quality_check CHECK (((diet_quality >= 0) AND (diet_quality <= 5))),
    CONSTRAINT daily_health_logs_sleep_hours_check CHECK (((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric))),
    CONSTRAINT daily_health_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE,
    CONSTRAINT daily_health_logs_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE,
    CONSTRAINT daily_health_logs_program_membership_fkey FOREIGN KEY (program_id, member_id) REFERENCES public.program_memberships(program_id, member_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- member_emails  (member_id → members)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_emails (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id    uuid NOT NULL,
    email        text NOT NULL,
    is_primary   boolean DEFAULT true NOT NULL,
    verified_at  timestamp with time zone,
    created_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_emails_pkey PRIMARY KEY (id),
    CONSTRAINT member_emails_email_key UNIQUE (email),
    CONSTRAINT member_emails_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- member_push_tokens  (member_id → members)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_push_tokens (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id     uuid NOT NULL,
    device_token  character varying(512) NOT NULL,
    platform      character varying(16) DEFAULT 'ios'::character varying NOT NULL,
    device_id     character varying(256),
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_push_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT member_push_tokens_device_token_key UNIQUE (device_token),
    CONSTRAINT member_push_tokens_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- program_invites  (program_id → programs; invited_by → members)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_invites (
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
    CONSTRAINT program_invites_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.members(id)
);

-- ---------------------------------------------------------------------------
-- program_invite_blocks  (program_id → programs; member_id → members)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_invite_blocks (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT program_invite_blocks_pkey PRIMARY KEY (id),
    CONSTRAINT program_invite_blocks_program_id_member_id_key UNIQUE (program_id, member_id),
    CONSTRAINT program_invite_blocks_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_invite_blocks_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- notifications  (program_id → programs SET NULL; actor_member_id → members SET NULL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    type             text NOT NULL,
    program_id       uuid,
    actor_member_id  uuid,
    title            text NOT NULL,
    body             text NOT NULL,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL,
    CONSTRAINT notifications_actor_member_id_fkey FOREIGN KEY (actor_member_id) REFERENCES public.members(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- notification_recipients  (composite PK; → notifications, → members)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_recipients (
    notification_id  uuid NOT NULL,
    member_id        uuid NOT NULL,
    acknowledged_at  timestamp with time zone,
    CONSTRAINT notification_recipients_pkey PRIMARY KEY (notification_id, member_id),
    CONSTRAINT notification_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE,
    CONSTRAINT notification_recipients_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Secondary indexes (faithful to legacy; partial unique on pending invites)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON public.members USING btree (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_member_emails_member_id ON public.member_emails USING btree (member_id);

CREATE INDEX IF NOT EXISTS idx_member_push_tokens_member_id ON public.member_push_tokens USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_member_push_tokens_platform ON public.member_push_tokens USING btree (platform);

CREATE INDEX IF NOT EXISTS idx_program_memberships_member_id ON public.program_memberships USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_program_memberships_program_id ON public.program_memberships USING btree (program_id);

CREATE INDEX IF NOT EXISTS idx_program_workouts_library_workout_id ON public.program_workouts USING btree (library_workout_id);
CREATE INDEX IF NOT EXISTS idx_program_workouts_program_id ON public.program_workouts USING btree (program_id);

CREATE INDEX IF NOT EXISTS idx_workout_logs_log_date ON public.workout_logs USING btree (log_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_member_id ON public.workout_logs USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_id ON public.workout_logs USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_workout_id ON public.workout_logs USING btree (program_workout_id);

CREATE INDEX IF NOT EXISTS idx_daily_health_logs_log_date ON public.daily_health_logs USING btree (log_date);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_member_id ON public.daily_health_logs USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_program_id ON public.daily_health_logs USING btree (program_id);

CREATE INDEX IF NOT EXISTS idx_program_invite_blocks_member_id ON public.program_invite_blocks USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_program_invite_blocks_program_id ON public.program_invite_blocks USING btree (program_id);

CREATE INDEX IF NOT EXISTS idx_program_invites_invited_by ON public.program_invites USING btree (invited_by);
CREATE INDEX IF NOT EXISTS idx_program_invites_program_id ON public.program_invites USING btree (program_id);

CREATE INDEX IF NOT EXISTS idx_notifications_actor_member_id ON public.notifications USING btree (actor_member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_program_id ON public.notifications USING btree (program_id);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_ack ON public.notification_recipients USING btree (member_id, acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_member_id ON public.notification_recipients USING btree (member_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_program_invites_program_username_pending
    ON public.program_invites USING btree (program_id, invited_username)
    WHERE ((invited_username IS NOT NULL) AND (status = 'pending'::text));
