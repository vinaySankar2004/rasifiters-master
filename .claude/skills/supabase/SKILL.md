---
name: supabase
description: Read-only Supabase DB inspection for RaSi Fiters. psql-first against a gitignored DATABASE_URL wrapped in a read-only transaction; the supabase-rasifiters MCP is the secondary path. Strictly read-only; any write/DDL goes to a numbered migration file in apps/backend/sql/ that the user runs. Trigger: "check supabase", "query the db", "what's in <table>", "how many …", /supabase.
---

# supabase — read-only DB inspection (psql-first, MCP secondary)

On-demand way to inspect RaSi Fiters' Supabase Postgres without fighting MCP auth. **Read-only
by default** — the `db-readonly-guard.sh` hook + a server-side read-only flag block inline writes;
any change goes to a numbered migration file the user runs.

## Trigger

"check supabase", "query the db", "what's in `<table>`", "how many …", "look up <x> in the db", `/supabase`.

## Where to run

A session rooted at `rasifiters-master/` (only here do the scoped `supabase-rasifiters` MCP + Bash
hooks load).

## Prereqs

- `psql` on PATH (`psql --version` → 16.x).
- `apps/backend/.env` exists with a `DATABASE_URL` line. If missing, recreate it from the user's
  password manager or the Render service's env:
  ```bash
  cd apps/backend
  # From the Render REST API (keys+values; needs RENDER_API_KEY + the service id):
  curl -s https://api.render.com/v1/services/<serviceId>/env-vars \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    | jq -r '.[].envVar | select(.key=="DATABASE_URL") | "DATABASE_URL=" + .value' > .env
  ```
  (`.env` is gitignored — only `.env.example` is tracked. Or just copy `DATABASE_URL` from the
  Render Dashboard → service → Environment.)

## Connection facts

| Project | Supabase project ref | MCP server (`read_only=true`) | Table prefixes |
|---|---|---|---|
| **supabase-rasifiters** | `TODO(provision: supabase-project-ref)` | `supabase-rasifiters` | **none** (faithful legacy schema) |

One Supabase Postgres backs all three clients (web + iOS + the Express backend). **No table prefixes
and no dev/prod prefix split** — the faithful legacy schema uses bare table names (`members`,
`programs`, `workouts`, etc.). Existing member UUIDs are preserved; Supabase Auth users map to members
via `members.auth_user_id`.

> **Read-only enforcement, two layers:** (1) the `db-readonly-guard.sh` PreToolUse hook blocks any
> `psql` command carrying an inline write/DDL keyword — this is the hard guard; (2) wrapping reads in
> `BEGIN TRANSACTION READ ONLY … COMMIT` makes the DB itself reject writes. The MCP server is
> `read_only=true` by URL, so the MCP path is read-only too.

## Workflow

1. **psql-first (the default path).** Wrap each read in an explicit read-only transaction — the server
   then rejects any write, on top of the guard hook:
   ```bash
   DBURL=$(grep -E '^DATABASE_URL=' apps/backend/.env | cut -d= -f2-)
   psql "$DBURL" -v ON_ERROR_STOP=1 \
     -c "BEGIN TRANSACTION READ ONLY; SELECT … LIMIT …; COMMIT;"
   ```
   > Use `BEGIN TRANSACTION READ ONLY`, **not** `PGOPTIONS=-c default_transaction_read_only=on` —
   > Supabase's connection layer (Supavisor) silently drops libpq startup `options`, so PGOPTIONS
   > leaves the session read-write. The explicit read-only transaction is honored.
   Handy meta-commands (catalog reads, inherently safe): `\dt public.*` to list tables, `\d <table>`
   to inspect a table.
2. **MCP secondary.** Use `mcp__supabase-rasifiters__execute_sql` only when psql is unavailable or the
   user explicitly says "use the MCP". It's `read_only=true`; if it's stuck authenticating it may need a
   one-time `claude /mcp` login in a standalone Terminal.
3. **Writes → STOP.** Never run inline `INSERT/UPDATE/DELETE/DDL` (the hook blocks it anyway). Author a
   numbered migration in `apps/backend/sql/` mirroring the existing `NNN_*.sql`
   files (idempotent `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), flag the blast radius, and let the
   user review + run it. The guard hook allows `psql -f <migration.sql>`.

## Gotchas

- The DB secret lives only in the gitignored `.env` (and Render / the user's password manager) — never
  print `DATABASE_URL`, never commit a `.env`.
- The `db-readonly-guard.sh` hook scans the whole command line for write/DDL keywords — a write word
  inside a SELECT **string literal** (e.g. `WHERE name = 'DELETE'`) can false-positive. Rephrase, or
  it's harmless under the read-only flag anyway.
- Auto-mode's "Production Reads" classifier may still prompt on a prod SELECT even though it's
  read-only — approve it; that's expected.
- `PGOPTIONS=-c default_transaction_read_only=on` is **silently ignored** by Supabase's connection
  layer (Supavisor drops libpq startup `options`) — it leaves the session read-write, so it's false
  comfort. Always use `BEGIN TRANSACTION READ ONLY … COMMIT` for the DB-level guarantee.
- **No table prefixes** — query bare names in the `public` schema (faithful legacy schema). Don't
  prepend an env prefix; there is none.
