-- 003_widen_gender_column.sql
-- Widen members.gender so all profile gender options fit.
-- Legacy was varchar(10), which rejects "Prefer not to say" (17 chars) with a Postgres
-- "value too long for type character varying(10)" error on save. varchar(32) covers all
-- current options with headroom. Idempotent-safe to re-run (ALTER ... TYPE is a no-op when
-- the column is already the target type).
ALTER TABLE public.members ALTER COLUMN gender TYPE varchar(32);
