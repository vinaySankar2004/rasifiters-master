-- 006: daily_health_logs gains an optional steps count (steps tracking feature).
ALTER TABLE public.daily_health_logs ADD COLUMN IF NOT EXISTS steps integer;

DO $$ BEGIN
    ALTER TABLE public.daily_health_logs
        ADD CONSTRAINT daily_health_logs_steps_check CHECK (steps >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Recreate the at-least-one check to admit steps-only rows (steps-only sync days must be valid).
ALTER TABLE public.daily_health_logs DROP CONSTRAINT IF EXISTS daily_health_logs_at_least_one_check;
ALTER TABLE public.daily_health_logs
    ADD CONSTRAINT daily_health_logs_at_least_one_check
    CHECK (sleep_hours IS NOT NULL OR diet_quality IS NOT NULL OR steps IS NOT NULL);
