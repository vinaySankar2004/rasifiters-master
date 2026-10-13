-- 011_notifications_inbox_prefs_scheduler.sql — notification preferences, the never-send-twice ledger, the announcement
-- audit, the inbox capability on the device registry and 90-day notification retention (reliability-overhaul Phase 4
-- track N-SRV; specs/features/notifications/SPEC.md — the preference, scheduler, announcement, per-device push and
-- retention rules).
--
-- WHAT
--   PART 1  notification_preferences — one row per member; NO row = the defaults (program, activity, announcements on;
--           reminders + digest OFF; reminder 19:00 local). time_zone = the member's IANA zone (from X-Time-Zone).
--   PART 2  notification_send_keys — the never-send-twice key, PK (member_id, kind, period_key), claimed with
--           INSERT … ON CONFLICT DO NOTHING RETURNING before every scheduled send.
--   PART 3  notification_announcements — the composer's audit + schedule. NO FK to notifications (retention deletes those).
--   PART 4  member_push_tokens.supports_inbox — true once an installation registers from a Phase 4 (inbox) build.
--   PART 5  RLS on the `public` copies only; on `staging`: grants for rasifiters_staging + RLS off (008 §5).
--   PART 6  Retention: ONE-TIME delete of notifications older than 90 days (cascades to notification_recipients and
--           push_deliveries — clears the old unread backlog before the inbox + badge ship, D-N11), then nightly pg_cron per
--           schema: notifications_retention_<schema> 04:32 UTC, notification_send_keys_retention_<schema> 04:37 UTC.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8): no schema names outside PART 5's staging-only branch. Run it TWICE, staging first:
--   SQL editor: first line `SET search_path TO staging;` + this file → Run → VERIFY block; then the same with
--               `SET search_path TO public;`.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/011_notifications_inbox_prefs_scheduler.sql
--               — session pooler / direct connection (port 5432) ONLY (never the 6543 transaction pooler).
--   If the SQL editor offers "Run and enable RLS", run WITHOUT it.
-- ORDER: on each schema BEFORE the Phase 4 notifications backend reaches the branch deploying there (`staging`, then
-- `main`): createNotification reads notification_preferences inside every emit transaction — without this table every
-- invite / role change / leave would fail. Safe while the current backend still runs (it never touches PARTS 1–4).
-- IDEMPOTENT: IF NOT EXISTS everywhere; the delete only removes > 90-day rows; GRANT / RLS / cron.schedule re-run safely.
-- LOCK TIMEOUT: the ALTER takes a brief exclusive lock on member_push_tokens, capped at 5 s — if it fires, re-run.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — notification_preferences =======================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    member_id      uuid NOT NULL,
    program        boolean DEFAULT true  NOT NULL,
    activity       boolean DEFAULT true  NOT NULL,
    reminders      boolean DEFAULT false NOT NULL,
    digest         boolean DEFAULT false NOT NULL,
    announcements  boolean DEFAULT true  NOT NULL,
    reminder_time  time without time zone DEFAULT '19:00' NOT NULL,
    time_zone      character varying(64),
    created_at     timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at     timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notification_preferences_pkey PRIMARY KEY (member_id),
    CONSTRAINT notification_preferences_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- ===== PART 2 — notification_send_keys =========================================================================
CREATE TABLE IF NOT EXISTS notification_send_keys (
    member_id   uuid NOT NULL,
    kind        character varying(32) NOT NULL,
    period_key  character varying(64) NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notification_send_keys_pkey PRIMARY KEY (member_id, kind, period_key),
    CONSTRAINT notification_send_keys_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notification_send_keys_created_at ON notification_send_keys USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_notification_send_keys_kind_period ON notification_send_keys USING btree (kind, period_key);

-- ===== PART 3 — notification_announcements =====================================================================
CREATE TABLE IF NOT EXISTS notification_announcements (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sender_member_id    uuid,
    target_kind         character varying(16) NOT NULL,
    target_program_id   uuid,
    recipient_ids       uuid[] NOT NULL,
    title_template      text NOT NULL,
    body_template       text NOT NULL,
    mode                character varying(8) NOT NULL,
    send_date           date,
    send_time           time without time zone,
    fallback_time_zone  character varying(64),
    status              character varying(16) NOT NULL,
    recipient_count     integer NOT NULL,
    sent_count          integer DEFAULT 0 NOT NULL,
    completed_at        timestamp with time zone,
    CONSTRAINT notification_announcements_pkey PRIMARY KEY (id),
    CONSTRAINT notification_announcements_target_kind_check CHECK (target_kind IN ('program', 'members', 'everyone')),
    CONSTRAINT notification_announcements_mode_check CHECK (mode IN ('now', 'local')),
    CONSTRAINT notification_announcements_status_check CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled')),
    CONSTRAINT notification_announcements_local_check
        CHECK (mode = 'now' OR (send_date IS NOT NULL AND send_time IS NOT NULL AND fallback_time_zone IS NOT NULL)),
    CONSTRAINT notification_announcements_sender_fkey FOREIGN KEY (sender_member_id) REFERENCES members(id) ON DELETE SET NULL,
    CONSTRAINT notification_announcements_program_fkey FOREIGN KEY (target_program_id) REFERENCES programs(id) ON DELETE SET NULL
);

-- ===== PART 4 — device registry: inbox capability ==============================================================
ALTER TABLE member_push_tokens ADD COLUMN IF NOT EXISTS supports_inbox boolean DEFAULT false NOT NULL;

-- ===== PART 5 — RLS (public) / grants + RLS off (staging) ======================================================
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notification_send_keys ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notification_announcements ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON notification_preferences, notification_send_keys, notification_announcements TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'staging' LOOP
            EXECUTE format('ALTER TABLE staging.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 6 — retention (pg_cron is already enabled by 007) ==================================================
DELETE FROM notifications WHERE created_at < now() - interval '90 days';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'notifications_retention_' || current_schema(),
    '32 4 * * *',
    format('DELETE FROM %I.notifications WHERE created_at < now() - interval %L', current_schema(), '90 days')
);

SELECT cron.schedule(
    'notification_send_keys_retention_' || current_schema(),
    '37 4 * * *',
    format('DELETE FROM %I.notification_send_keys WHERE created_at < now() - interval %L', current_schema(), '90 days')
);

-- ===== VERIFY (read-only — run after each schema's run, with the same `SET search_path TO <schema>;` first) =====
-- SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()
--    AND table_name IN ('notification_preferences', 'notification_send_keys', 'notification_announcements');   → 3
-- SELECT column_default, is_nullable FROM information_schema.columns WHERE table_schema = current_schema()
--    AND table_name = 'member_push_tokens' AND column_name = 'supports_inbox';                                → false | NO
-- SELECT count(*) FROM notifications WHERE created_at < now() - interval '90 days';                            → 0
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('notifications_retention_' || current_schema(),
--    'notification_send_keys_retention_' || current_schema()) ORDER BY 1;
--    → notification_send_keys_retention_<schema> | 37 4 * * * | t ; notifications_retention_<schema> | 32 4 * * * | t
-- SELECT relrowsecurity FROM pg_class WHERE oid IN ('notification_preferences'::regclass,
--    'notification_send_keys'::regclass, 'notification_announcements'::regclass);            → public: t t t · staging: f f f
-- staging only:
-- SELECT has_table_privilege('rasifiters_staging', 'staging.notification_preferences', 'INSERT'),
--        has_table_privilege('rasifiters_staging', 'staging.notification_send_keys', 'INSERT'),
--        has_table_privilege('rasifiters_staging', 'staging.notification_announcements', 'INSERT');        → t | t | t
