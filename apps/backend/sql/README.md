# apps/backend/sql — Supabase schema migrations

Numbered, idempotent SQL migrations for the RaSi Fiters Supabase Postgres. **Faithful to the legacy
Render schema** (R5: same table names, no prefixes). Apply them in numeric order.

> **Who runs these:** the **user**, not Claude — per `CLAUDE.md` Claude never executes schema/data SQL
> against the live DB. Claude only authors the files here.

## Files

| File | What it does |
|------|--------------|
| `001_schema.sql` | Creates all 13 canonical tables + indexes + FKs, idempotent (`IF NOT EXISTS`). Adds the one migration delta — `members.auth_user_id` → `auth.users(id)`. |

Retired vs legacy (NOT created — Supabase Auth owns them): `member_credentials`, `refresh_tokens`,
`auth_identities`, `email_verification_tokens`. The `legacy_*` backup tables are excluded as cruft.

## How to apply

**Option A — Supabase SQL editor:** paste `001_schema.sql` → Run.

**Option B — psql** (session-pooler / direct connection string from your password manager):

```bash
psql "$SUPABASE_DATABASE_URL" -f apps/backend/sql/001_schema.sql
```

Re-running is safe (every statement is `IF NOT EXISTS`).

## After the schema exists

Run the data + auth migration from [`tools/migrator/`](../../../tools/migrator/) — it copies the legacy
rows (preserving `members.id` UUIDs) and imports bcrypt credentials into Supabase Auth, backfilling
`members.auth_user_id`.

## Order of operations (whole cutover)

1. Apply `001_schema.sql` (this dir) to the Supabase project.
2. `tools/migrator/` → `npm run migrate` (copy data → import auth → report).
3. Point the rebuilt backend at Supabase; verify signed-in path.
