# tools/migrator — temporary Render-PG → Supabase migrator

A **throwaway** tool (delete after cutover) that moves the legacy RaSi Fiters data from the Render Postgres
DB into the new Supabase project, and seeds Supabase Auth from the legacy credentials. Designed to be
**re-runnable** (idempotent upserts) so we can keep the new DB in sync with prod until the final cutover.

> Not built yet — this README is the spec. Implemented in build step 2 (see `ICM.md`).

## What it must do

1. **Schema** — apply the faithful migration set from `companies/rasifiters/products/backend/sql/` to the
   Supabase project (same table names as legacy, NO prefix; R5). Plus the two auth deltas:
   - drop/skip `member_credentials` + `refresh_tokens` (Supabase Auth owns credentials),
   - add `members.auth_user_id UUID UNIQUE` → references `auth.users(id)`.
2. **Data copy** — copy every table from Render → Supabase **preserving all primary keys**, especially
   `members.id` (every FK depends on these UUIDs staying identical). Idempotent upserts (`ON CONFLICT`).
3. **Auth seed (bcrypt import)** — for each member with a `member_credentials` row, create a Supabase
   `auth.users` row with the **existing bcrypt hash** imported directly (users keep their passwords — no
   reset). Use the member's primary email (`member_emails.is_primary`) as the auth email. Then backfill
   `members.auth_user_id` with the created auth user id.
   - Members without an email need handling — decide at build time (synthesize a placeholder email? skip and
     flag?). **Open question for the user.**
4. **Re-runnable sync** — safe to run repeatedly: new/changed rows upserted, no duplicates, auth users not
   re-created. Used to catch the new DB up to prod right before cutover.

## Inputs (never committed — see ENV_RUNBOOK.md)
- `RENDER_DATABASE_URL` — read source (legacy Render Postgres).
- `SUPABASE_DB_URL` + Supabase **service-role key** — write target (service key needed to create auth users
  + bcrypt import via the Admin API / SQL).

## Stance
- **Read-only against Render**; all writes go to the new Supabase project.
- Verify counts per table after each run (source vs target) and report a diff.
- This bypasses the repo's read-only DB policy *by design* (it's the one-time migration tool, run manually
  by the user with explicit service credentials) — keep it isolated here, out of the backend product.

## Decisions to confirm before building
- Members with no primary email → placeholder vs skip.
- Bcrypt import mechanism: direct `auth.users` SQL insert vs Supabase Admin API (`encrypted_password`).
- Whether to also migrate `member_push_tokens` (APNs) as-is (yes — faithful) .
