-- 007_app_events.sql — the observability event trail (reliability-overhaul Phase 2 track A;
-- specs/features/observability/SPEC.md §5, D-C5/D-C6).
--
-- Creates `app_events`: one row per client- or server-reported event (forced sign-outs, sync runs, client
-- errors). Written ONLY by the backend (POST /api/client-events now; server-side auth events in Phase 3).
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema().
--   Prod:    run as-is (current_schema() = public).
--   Staging: psql "$DSN" -c "SET search_path TO staging" -f apps/backend/sql/007_app_events.sql   (owner role)
--            $DSN = the SESSION pooler or a direct connection (port 5432) ONLY. On the transaction pooler
--            (port 6543) `SET search_path` does not persist to the next statement, so the run silently targets
--            `public`.
-- Idempotent: IF NOT EXISTS everywhere; the RLS step and cron.schedule (same job name → updated) re-run safely.
--
-- HOW TO RUN: the USER applies this (Supabase SQL editor → paste → Run, or psql) BEFORE the backend deploy
-- that adds POST /api/client-events. Claude never executes schema SQL against the live DB (CLAUDE.md).
-- If PART 2 fails on permissions (pg_cron can't be created from SQL): enable it at Dashboard → Integrations →
-- Cron (or Database → Extensions → pg_cron), then re-run the WHOLE file.

-- ===== PART 1 — the table ======================================================================================

CREATE TABLE IF NOT EXISTS app_events (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    occurred_at  timestamp with time zone,
    source       character varying(16) DEFAULT 'client'::character varying NOT NULL,
    type         character varying(64) NOT NULL,
    member_id    uuid,
    platform     character varying(16),
    app_version  character varying(32),
    app_build    integer,
    request_id   character varying(64),
    props        jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT app_events_pkey PRIMARY KEY (id),
    CONSTRAINT app_events_source_check CHECK (source IN ('client', 'server')),
    -- CASCADE: account deletion (cascadeMemberDeletion → members row delete) removes the member's events.
    CONSTRAINT app_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON app_events USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_app_events_member_id_created_at ON app_events USING btree (member_id, created_at);

-- RLS: every public table in this project has RLS enabled with NO policies, so PostgREST (anon / authenticated)
-- reads nothing; the backend connects as the table owner and is unaffected. Only the PostgREST-exposed `public`
-- schema gets it — a staging copy must stay writable by the non-owner staging role.
DO $$
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ===== PART 2 — 90-day retention (DESIGN_BOARD §7.2; user-approved 2026-10-12) =================================
-- Enables the pg_cron extension (new on this project) and schedules one nightly job per schema, 04:17 UTC.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'app_events_retention_' || current_schema(),
    '17 4 * * *',
    format('DELETE FROM %I.app_events WHERE created_at < now() - interval %L', current_schema(), '90 days')
);
