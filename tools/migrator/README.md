# tools/migrator — Render PG → Supabase migrator (temporary)

A one-purpose, re-runnable tool that moves RaSi Fiters off the legacy Render Postgres onto the new
Supabase project. It is deleted after cutover.

**What it does**
1. **Copies** the 13 canonical tables legacy → Supabase **preserving every value** — `members.id` UUIDs
   and all FKs stay identical (R5) — in FK-safe order, idempotent (upsert on PK).
2. **Imports auth**: for each member it creates a Supabase `auth.users` row with the legacy **bcrypt
   `password_hash` imported** (passwords keep working, no forced reset), then backfills
   `members.auth_user_id`. Members with no email get a synthesized placeholder
   (`<username>@<PLACEHOLDER_EMAIL_DOMAIN>`); username login still resolves to it server-side.
3. **Reconciles** row counts on both sides and writes `migration-report.json`.

It does **not** copy `member_credentials` / `refresh_tokens` / `auth_identities` /
`email_verification_tokens` — those retire under Supabase Auth (`METHODOLOGY.md` R1).

## Resolved build decisions (was "open questions")
- **No-email member → placeholder.** Exactly one legacy member (the `admin` account) has no email; it gets
  `admin@<PLACEHOLDER_EMAIL_DOMAIN>` so it can still sign in. (`PROGRESS.md` open question, resolved.)
- **Bcrypt import → Supabase Admin API `password_hash`** (not raw `auth.users` SQL) — GoTrue accepts the
  legacy `$2a$/$2b$` hashes directly.
- **`member_push_tokens` migrated as-is** (faithful — APNs tokens carry over).

## Prerequisites
1. **Apply the schema first.** Run [`apps/backend/sql/001_schema.sql`](../../apps/backend/sql/) against
   the Supabase project (the migrator refuses to run if the tables are missing).
2. `cp .env.example .env` and fill it (legacy DSN, target DSN, Supabase URL + **service role** key).
   `.env` is gitignored — never commit it.
3. `npm install`.

## Run

```bash
npm run dry-run    # plan only — counts source rows, lists who'd get a placeholder. No writes.
npm run migrate    # full: copy data → import auth → reconcile → report
npm run verify     # read-only: schema check + row-count reconcile + auth-link stats
npm run copy       # data copy only
npm run auth       # auth import only
```

All modes are **idempotent** — re-run freely. `migrate` upserts rows on PK and skips members already
linked to an auth user, so it doubles as the **pre-cutover sync** (run it again right before the flip to
pull any rows that changed on the legacy app in the meantime).

## Output
`migration-report.json` (gitignored) holds the per-table copy counts, the row-count reconciliation, and
the full per-member auth-import outcome (create / link-existing / skip / error, and any placeholder
emails). A non-zero exit code means a count mismatch or an auth error to investigate.

## Notes
- **Connection strings:** the target DSN can be the Supabase **direct** (`db.<ref>.supabase.co:5432`,
  IPv6) or **session pooler** (`aws-1-...pooler.supabase.com:5432`, IPv4) form — both work for a one-off
  local run. Source is the legacy Render DSN (read-only use).
- This tool only ever **writes to the new Supabase project** — it never modifies the legacy DB.
