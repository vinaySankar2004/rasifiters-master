# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** It is the single source of truth for *where we are* and *what's
> next*. The cross-session loop: start → read this → work → at session end, update this file + commit
> (via `git-version`). Next session the user says **"continue"** and you resume from here.
>
> Keep it current: update **Current phase**, tick the **Build sequence**, and append a **Session log**
> entry each time. Durable decisions go in `METHODOLOGY.md` (decision log); legacy-coverage tracking in
> `COVERAGE.md`; this file is the live state + next-step pointer.

## Current phase

**Phase 1 — Provisioning + migration: DONE.** Scaffolding done. **Supabase provisioned** (2026-06-28): org
`RaSi Fiters` (`lxehyprifvuozciizlem`), project `rasifiters` ref **`kpadxjekpiwfkqcxtrio`**, `us-east-1`,
ACTIVE_HEALTHY; `.mcp.json` repointed. **Schema applied + data/auth MIGRATED to Supabase** (2026-06-28): all
13 tables reconcile with legacy (members 48 … notification_recipients 1304), **48/48 members created in
`auth.users` (bcrypt hashes imported, no resets) and linked via `auth_user_id`**, admin on
`admin@no-email.rasifiters.com`. Migration is idempotent (re-run = 48 skips, 0 dupes). Railway + Vercel
deferred. Nothing deployed yet.

> NOTE: the user reset the Supabase DB password on 2026-06-28 — the value in the earlier scratchpad secrets
> file is STALE; the live one is in the user's password manager + `tools/migrator/.env` (gitignored).

## Next action

**Phase 2 — backend.** Point the Express app at Supabase + swap auth to verify Supabase JWTs:
1. Spec the backend **`auth`** feature via `question-asker` (proxy login/refresh/logout, username→email
   resolution, JWKS verification, `auth_user_id` mapping), then port the rebuilt backend into `apps/backend/`.
2. Provision the Railway service (`deploy` skill) once the backend has code; deploy + smoke-test the
   signed-in path against the migrated data.

Re-run `tools/migrator/ → npm run migrate` right before cutover to sync any rows that changed on the legacy
app in the meantime (it's the pre-cutover sync, idempotent).

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [~] **Provision infra** — Supabase project DONE 2026-06-28 (`project_ref` filled in `.mcp.json` + `ICM.md`
       + `CONTEXT.md`). Railway `rasifiters-api` + Vercel `rasifiters-web` deferred until those apps have
       code to deploy; record their IDs in `apps/*/CONTEXT.md` + the deploy-scope hook when created.
3. [x] **Migrator** (`tools/migrator/`) — BUILT + EXECUTED against Supabase 2026-06-28. Preserved
       `members.id` UUIDs, imported bcrypt hashes → `auth.users` (48/48), backfilled `members.auth_user_id`,
       idempotent re-runnable sync. Schema in `apps/backend/sql/001_schema.sql` (applied). _DONE._
4. [ ] **`backend`** — point Express at Supabase, swap auth middleware to verify Supabase JWTs (proxy
       login/refresh/logout), deploy to Railway. Spec features as we go.
5. [ ] **`web`** — feature/page by feature/page (`question-asker` → spec → port code → `deploy` to Vercel
       temp domain). Proves the auth path end-to-end.
6. [ ] **`ios`** — feature/screen by feature/screen.
7. [ ] **Cutover** — switch `rasifiters.com` (Vercel) + ship the iOS build.

## Coverage snapshot

- Shared features documented: **0** (see `specs/features/REGISTRY.md`)
- Web page specs: **0** · iOS screen specs: **0** (see `specs/pages/REGISTRY.md`)
- Legacy surface coverage: see `COVERAGE.md` (all unchecked)

## Open questions (carry until resolved)

- ~~**Migrator — members without a primary email:** placeholder vs skip?~~ **RESOLVED 2026-06-28** —
  placeholder (`<username>@no-email.rasifiters.com`). Affects exactly 1 row (the `admin` account); keeps
  admin able to sign in. Implemented in `tools/migrator/`.
- **iOS auth approach:** backend-proxy (clients ~unchanged) vs embed `supabase-swift`. Leaning proxy.

## Session log (newest first)

- **2026-06-28 (pm-3)** — **Ran the migration against live Supabase.** User applied
  `apps/backend/sql/001_schema.sql` + reset the DB password + handed over creds; filled
  `tools/migrator/.env`. Dry-run → `npm run migrate`: all 13 tables copied + reconciled vs legacy, **48
  `auth.users` created (bcrypt imported) and 48/48 members linked**, admin on the placeholder email
  (confirmed via `auth.users` join). Idempotency re-run = 48 skips, `auth.users` still 48. Migration done;
  next is Phase 2 (backend). Fixed two migrator bugs found while wiring it (auth/verify modes need the
  legacy DSN; added `sslmode=disable` escape hatch).
- **2026-06-28 (pm-2)** — **Built the migrator + faithful schema.** Mapped the live legacy schema via
  `pg_dump --schema-only` (richer than the Sequelize models: real CHECKs, `programs.created_by NOT NULL`,
  composite FKs, partial unique index; found `auth_identities`/`email_verification_tokens` empty +
  `legacy_*` cruft). Wrote `apps/backend/sql/001_schema.sql` (13 canonical tables, idempotent
  `IF NOT EXISTS`, the `members.auth_user_id`→`auth.users` delta; retired
  member_credentials/refresh_tokens/auth_identities/email_verification_tokens) and `tools/migrator/` (Node:
  generic FK-ordered upsert copy + bcrypt→Supabase-Auth import + backfill + reconciliation report).
  Resolved the no-email question → placeholder for `admin`. **Validated locally** against the real Render
  data into a throwaway Postgres: schema applies + is idempotent; all 13 tables row-count match
  (members 48 … notification_recipients 1304); auth dry-run = 48/48 with bcrypt hash, 1 placeholder.
  Awaits the user to apply the schema + run against Supabase.
- **2026-06-28 (pm)** — **Provisioned Supabase.** Created a new org `RaSi Fiters` (`lxehyprifvuozciizlem`)
  + project `rasifiters` (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY) via the Supabase CLI
  (upgraded 2.67→2.108 to fix the broken `--region` enum; trusted the `supabase/tap`). DB password generated
  with `openssl rand -hex 24`; captured all keys (anon/service_role + new publishable/secret) + the three
  DATABASE_URL forms (direct IPv6 / session-pooler `aws-1-us-east-1` :5432 / txn-pooler :6543, all verified
  with `psql select`) into the gitignored scratchpad secrets file for the user's password manager. Repointed
  `.mcp.json` `supabase-rasifiters` to the real ref; updated `ICM.md` + `CONTEXT.md`. Railway/Vercel
  deferred (no app code yet). Next: build `tools/migrator/`.
- **2026-06-28** — Scaffolded the ICM repo from higgins-master; then restructured to fit RaSi: dropped
  `companies/` → `apps/`; split specs into `specs/features/` + `specs/pages/` (with role-based view rules);
  removed the `stitch` skill (faithful direct port instead); repurposed `audit` as a web↔iOS parity check;
  dropped per-feature version folders; made features client-specific-capable; added this `PROGRESS.md`.
