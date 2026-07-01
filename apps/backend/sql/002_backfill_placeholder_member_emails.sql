-- 002_backfill_placeholder_member_emails.sql
-- ---------------------------------------------------------------------------
-- Backfill member_emails for placeholder (no-email) members.
--
-- WHY: the one-time migrator synthesized a placeholder email
-- (`<username>@no-email.rasifiters.com`) into `auth.users` for members with no email — the `admin`
-- account — but did NOT insert the matching `member_emails` row. The backend logs in by resolving
-- member -> primary email (`member_emails`) -> Supabase `signInWithPassword(email, …)`, so these
-- members 401 with "Invalid credentials" (no email to sign in with) even though `auth.users` holds a
-- valid imported bcrypt password. (See PROGRESS.md / specs/features/auth/SPEC.md §7 resolvePrimaryEmail.)
--
-- WHAT: insert one `member_emails` row per member that currently has NONE, copying the EXACT email
-- from `auth.users` (so it matches what Supabase Auth knows; the placeholder is already lowercase).
-- Marks it primary. Faithful completion of the placeholder decision — it touches ONLY no-email members
-- (every member with a real email already copied its member_emails row from legacy).
--
-- IDEMPOTENT: the NOT EXISTS guard + ON CONFLICT (member_emails_email_key) make re-runs a no-op.
-- Affects exactly the placeholder members (currently 1: `admin`).
-- ---------------------------------------------------------------------------

INSERT INTO public.member_emails (member_id, email, is_primary)
SELECT m.id, lower(u.email), true
FROM public.members m
JOIN auth.users u ON u.id = m.auth_user_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.member_emails me WHERE me.member_id = m.id
)
ON CONFLICT ON CONSTRAINT member_emails_email_key DO NOTHING;
