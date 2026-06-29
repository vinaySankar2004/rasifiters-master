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
`admin@no-email.rasifiters.com`. Migration is idempotent (re-run = 48 skips, 0 dupes). Render + Vercel
deferred. Nothing deployed yet. **Backend host = Render (Blueprint), not Railway** (METHODOLOGY R7,
decided 2026-06-28).

> NOTE: the user reset the Supabase DB password on 2026-06-28 — the value in the earlier scratchpad secrets
> file is STALE; the live one is in the user's password manager + `tools/migrator/.env` (gitignored).

## Next action

**Phase 2 — backend.** Point the Express app at Supabase + swap auth to verify Supabase JWTs:
1. ~~Spec the backend **`auth`** feature via `question-asker`.~~ **DONE 2026-06-28** — see
   [`specs/features/auth/SPEC.md`](specs/features/auth/SPEC.md) v0.1.0 (decisions D-C1 whole-module scope /
   D-C2 JWKS+per-request DB-lookup verify / D-C3 clients-unchanged proxy / D-S1 faithful; flagged F1–F7).
   Registry + COVERAGE ticked.
2. ~~Port the backend foundation + `auth` feature into `apps/backend/`.~~ **DONE 2026-06-28** — data
   layer (13 models + index, `config/database.js`→`DATABASE_URL`, response/errorHandler) + auth slice
   (`config/supabase.js`, JWKS-verify `middleware/auth.js`, `services/authService.js`, `routes/auth.js`,
   `server.js` mounting only `/api/auth`). `npm install` + boot-check pass. **Two follow-ups carried**
   below (`/account` 501; asymmetric JWT keys).
3. **NEXT — provision Render + deploy the auth backend** (`deploy` skill, Blueprint
   `apps/backend/render.yaml`): in the Render Dashboard → New → **Blueprint** → connect the repo →
   Blueprint path `apps/backend/render.yaml` → Apply; paste the `sync: false` secrets when prompted
   (`DATABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — `SUPABASE_URL` + `MIN_IOS_VERSION`
   are baked into the YAML). The user is doing the GitHub auto-deploy connection. **Asymmetric Supabase
   JWT keys are DONE** — the JWKS endpoint serves a live ES256/P-256 key (verified 2026-06-28), so the
   D-C2 verify path will find a key. Then smoke-test the real login→verify→refresh→logout path against
   the migrated data (e.g. the `admin` placeholder account). **All 3 secrets are in hand** —
   `SUPABASE_ANON_KEY` was supplied by the user (held out of git); `DATABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` are in `tools/migrator/.env`.
4. Then spec + port the remaining backend features (members, programs, logs, …) via `question-asker`,
   mounting each route group as it lands; wire the deferred `DELETE /account` cascade when
   program-memberships + notifications are ported.

Re-run `tools/migrator/ → npm run migrate` right before cutover to sync any rows that changed on the legacy
app in the meantime (it's the pre-cutover sync, idempotent).

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [~] **Provision infra** — Supabase project DONE 2026-06-28 (`project_ref` filled in `.mcp.json` + `ICM.md`
       + `CONTEXT.md`). Render `rasifiters-api` (Blueprint `apps/backend/render.yaml`) + Vercel
       `rasifiters-web` deferred until those apps have code to deploy; record their IDs in
       `apps/*/CONTEXT.md` + the deploy-scope hook when created.
3. [x] **Migrator** (`tools/migrator/`) — BUILT + EXECUTED against Supabase 2026-06-28. Preserved
       `members.id` UUIDs, imported bcrypt hashes → `auth.users` (48/48), backfilled `members.auth_user_id`,
       idempotent re-runnable sync. Schema in `apps/backend/sql/001_schema.sql` (applied). _DONE._
4. [~] **`backend`** — point Express at Supabase, swap auth middleware to verify Supabase JWTs (proxy
       login/refresh/logout), deploy to Render (Blueprint). Spec features as we go. _Auth feature SPEC'd
       (v0.1.0) + PORTED to `apps/backend/` 2026-06-28 (foundation + `/api/auth`); `render.yaml` authored;
       Render deploy + remaining features pending._
5. [ ] **`web`** — feature/page by feature/page (`question-asker` → spec → port code → `deploy` to Vercel
       temp domain). Proves the auth path end-to-end.
6. [ ] **`ios`** — feature/screen by feature/screen.
7. [ ] **Cutover** — switch `rasifiters.com` (Vercel) + ship the iOS build.

## Coverage snapshot

- Shared features documented: **1** — `auth` (see `specs/features/REGISTRY.md`)
- Web page specs: **0** · iOS screen specs: **0** (see `specs/pages/REGISTRY.md`)
- Legacy surface coverage: see `COVERAGE.md` (all unchecked)

## Open questions (carry until resolved)

- ~~**Migrator — members without a primary email:** placeholder vs skip?~~ **RESOLVED 2026-06-28** —
  placeholder (`<username>@no-email.rasifiters.com`). Affects exactly 1 row (the `admin` account); keeps
  admin able to sign in. Implemented in `tools/migrator/`.
- **iOS auth approach:** backend-proxy (clients ~unchanged) vs embed `supabase-swift`. Leaning proxy.
- **`DELETE /api/auth/account` returns 501** in the ported backend — the faithful cross-feature delete
  cascade (invites/notifications/membership-exit) is owned by the program-memberships + notifications
  features (SPEC D-C1); wire it when those are ported. Temporary implementation gap, not a spec change.
- ~~**Supabase JWT signing keys must be asymmetric (ECC P-256/ES256)** for the JWKS verify path (D-C2).~~
  **RESOLVED 2026-06-28** — the project's JWKS endpoint (`/auth/v1/.well-known/jwks.json`) serves a live
  `ES256`/P-256 key (`kid 0f6cd324…`), so JWKS verify finds a key. No further action needed at deploy.
- ~~**`SUPABASE_ANON_KEY` not stored locally**~~ **OBTAINED 2026-06-28** — the user supplied the anon key
  (a public anon JWT). Kept OUT of git per policy; paste it into Render as the `SUPABASE_ANON_KEY`
  `sync: false` Blueprint secret at provisioning (alongside `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
  both in `tools/migrator/.env`). All four backend env values are now in hand for the Render deploy.

## Session log (newest first)

- **2026-06-28 (pm-6)** — **Switched the backend host Railway → Render** (user decision; METHODOLOGY R7).
  Researched Render's mechanics (Blueprint spec, monorepo `rootDir`+`buildFilter`, env-var model, hosted
  MCP, health checks, PORT/host). Authored **`apps/backend/render.yaml`** (Blueprint: `type: web`,
  `rootDir: apps/backend`, `npm ci`/`npm start`, `healthCheckPath: /`, `autoDeployTrigger: commit`,
  `buildFilter.paths: [apps/backend/**]`; non-secret vars inline, the 3 secrets as `sync: false`).
  `server.js` now binds `0.0.0.0` (Render injects `PORT`, default 10000). Swept every Railway reference →
  Render across the repo: `.mcp.json` (`railway`→`render` MCP `https://mcp.render.com/mcp`),
  `.env.mcp.example`, the `deploy-scope-guard.sh` hook, the **`deploy` skill** (prereqs, workflow §2,
  git→deploy pipeline §B, smoke test, converged lessons, frontmatter), `ENV_RUNBOOK.md` (§1/§2 Render
  inspect+change mechanics, §3/§6 host delta), `METHODOLOGY.md` (R4 amended + new **R7**), `ICM.md`,
  `CLAUDE.md`, `CONTEXT.md`, `SETUP.md`, `README.md`, `apps/{web,backend}/CONTEXT.md`, the `supabase` +
  `health-check` skills, the auth SPEC changelog, `package.json`. Also **verified the asymmetric Supabase
  JWT keys are already live** (JWKS serves an ES256/P-256 key) — that open blocker is resolved. NOT
  committed yet (use `git-version`). Next: provision the Render Blueprint + deploy (needs the user's
  `SUPABASE_ANON_KEY`), then smoke-test the auth path.
- **2026-06-28 (pm-5)** — **Ported the backend foundation + `auth` feature** into `apps/backend/`. Data
  layer (faithful 1:1 via a subagent): `config/database.js` (`DB_URL`→`DATABASE_URL`, kept
  `rejectUnauthorized:false` per F6), 13 models + `models/index.js` with the R1 deltas
  (`Member.auth_user_id` added; `member_credentials`/`refresh_tokens` models + associations dropped),
  `utils/response.js`, `middleware/errorHandler.js`. Auth slice (hand-written per SPEC §7):
  `config/supabase.js` (anon + service clients + `verifySupabaseJwt` via jose JWKS), `middleware/auth.js`
  (Supabase-JWT verify + `sub`→`auth_user_id` member lookup rebuilding the legacy `req.user`; authz gates
  unchanged), `services/authService.js` (proxy login/refresh/logout via Supabase, register/change-password
  via admin API; `/account` deferred → 501), `routes/auth.js` (faithful), `server.js` (mounts only
  `/api/auth`). `package.json` drops `jsonwebtoken`/`bcrypt`, adds `@supabase/supabase-js`+`jose`+`uuid`.
  `npm install` + boot-check pass (syntax, module load, models wired, jose JWKS wire reached). Next:
  Railway deploy (needs asymmetric Supabase JWT keys + env) and the remaining backend features.
- **2026-06-28 (pm-4)** — **Specced the backend `auth` feature** (first SPEC in the repo) via
  `question-asker`. 3 parallel Explore agents mapped the legacy auth (route+service · middleware+authz ·
  models+config); re-read `authService.js`/`middleware/auth.js`/`routes/auth.js` in full to verify every
  `file:line`. 4 decisions confirmed (all faithful): **D-C1** scope = whole `middleware/auth.js` module
  (authN + authZ gates) as one unit; **D-C2** verify Supabase JWTs via **JWKS (ES256) + per-request
  `sub`→`members.auth_user_id` lookup** to rebuild `req.user` (deliberate change from legacy's
  lookup-free token); **D-C3** clients unchanged, `consumed_by=[web,ios]`, login proxies Supabase sign-in
  via username→primary-email resolution, refresh/logout proxy Supabase, `refresh_tokens` retires;
  **D-S1** faithful 1:1 (flagged F1–F7: dual payloads, no rate-limit, unused auth_identities/
  email_verification_tokens, rejectUnauthorized:false, two JWT verifiers, vestigial `userId`). Wrote
  `specs/features/auth/SPEC.md` v0.1.0; updated REGISTRY.md + registry.json + COVERAGE (auth ticked `[x]`).
  Not committed yet (use `git-version`). Next: port the backend per §7.
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
