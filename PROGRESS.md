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
`admin@no-email.rasifiters.com`. Migration is idempotent (re-run = 48 skips, 0 dupes).

**Phase 2 — backend `auth`: DEPLOYED + VERIFIED LIVE (2026-06-28).** Render web service `rasifiters-api`
(`srv-d90tgmv7f7vs73cudptg`) at `https://rasifiters-api.onrender.com` via Blueprint
`apps/backend/render.yaml` (host = **Render, not Railway** — METHODOLOGY R7). Full auth round-trip green
against migrated data (admin): login→200 (bcrypt password verified, ES256 JWT), guarded route via JWKS
verify + `auth_user_id` mapping→200, garbage token→401, refresh→200, logout→200. Fixed a migration gap
en route (placeholder members had no `member_emails` row → `002` migration + migrator patch). Vercel still
deferred (no web code yet).

> NOTE: the user reset the Supabase DB password on 2026-06-28 — the value in the earlier scratchpad secrets
> file is STALE; the live one is in the user's password manager + `tools/migrator/.env` (gitignored).

## Next action

> **On "continue": start the `programs` feature** — run `question-asker` to spec it (legacy
> `../backend/routes/programs.js` + `services/programService.js`; watch the `admin_only_data_entry`
> flag + the `created_by` ownership the members delete-cascade reassigns), then port it to
> `apps/backend/` and mount `/api/programs` in `server.js`. It's the natural next node: memberships,
> workouts, and analytics all hang off `programs`. Follow the same loop the `auth` + `members` runs used.

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
3. ~~Provision Render + deploy the auth backend + smoke-test login→verify→refresh→logout.~~ **DONE +
   VERIFIED 2026-06-28** — live at `https://rasifiters-api.onrender.com` (`srv-d90tgmv7f7vs73cudptg`);
   full round-trip green against migrated data (see auth SPEC §12 / session log). Service id recorded in
   `CONTEXT.md` + the `deploy-scope-guard.sh` allow-list; auth status flipped 🏗️→🚀.
4. ~~Spec + port `members`.~~ **DONE 2026-06-28** — see [`specs/features/members/SPEC.md`](specs/features/members/SPEC.md)
   v0.1.0 (📄→🏗️). Ported `services/memberService.js` + `routes/members.js`, mounted `/api/members`. Faithful
   except the one deliberate change **D-C2** (`createMember` now creates a loginable member via Supabase
   `admin.createUser` + requires `email`); `DELETE /:id` deferred → 501 (**D-C1**, the auth `/account`
   pattern); `getAllMembers` excludes the migration-added `auth_user_id`. `POST`+`DELETE` are vestigial
   (called by neither client — **D-REF**). Boot check passes; **runtime smoke-test vs live Supabase pending**.
5. **NEXT — spec + port the remaining backend features** (programs, program-memberships, invites, logs,
   workouts, notifications, analytics…) via `question-asker`, mounting each route group in `server.js` as it
   lands; wire the deferred `DELETE /account` + `members DELETE /:id` cascades when program-memberships +
   notifications are ported. Each backend commit auto-deploys to Render (push to `main` touching `apps/backend/**`).

Re-run `tools/migrator/ → npm run migrate` right before cutover to sync any rows that changed on the legacy
app in the meantime (it's the pre-cutover sync, idempotent).

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [~] **Provision infra** — Supabase DONE 2026-06-28. **Render `rasifiters-api` PROVISIONED + LIVE
       2026-06-28** (`srv-d90tgmv7f7vs73cudptg`, Blueprint `apps/backend/render.yaml`, id recorded in
       `CONTEXT.md` + the deploy-scope hook). Vercel `rasifiters-web` deferred until the web app has code.
3. [x] **Migrator** (`tools/migrator/`) — BUILT + EXECUTED against Supabase 2026-06-28. Preserved
       `members.id` UUIDs, imported bcrypt hashes → `auth.users` (48/48), backfilled `members.auth_user_id`,
       idempotent re-runnable sync. Schema in `apps/backend/sql/001_schema.sql` (applied). _DONE._
4. [~] **`backend`** — point Express at Supabase, swap auth middleware to verify Supabase JWTs (proxy
       login/refresh/logout), deploy to Render (Blueprint). Spec features as we go. _Auth feature SPEC'd
       (v0.1.0) + PORTED + **DEPLOYED to Render + verified live 2026-06-28** (`/api/auth` 🚀). Remaining
       backend features (members, programs, logs, notifications, analytics…) pending._
5. [ ] **`web`** — feature/page by feature/page (`question-asker` → spec → port code → `deploy` to Vercel
       temp domain). Proves the auth path end-to-end.
6. [ ] **`ios`** — feature/screen by feature/screen.
7. [ ] **Cutover** — switch `rasifiters.com` (Vercel) + ship the iOS build.

## Coverage snapshot

- Shared features documented: **2** — `auth` (🚀), `members` (🏗️) (see `specs/features/REGISTRY.md`)
- Web page specs: **0** · iOS screen specs: **0** (see `specs/pages/REGISTRY.md`)
- Legacy surface coverage: see `COVERAGE.md` (all unchecked)

## Open questions (carry until resolved)

- ~~**Migrator — members without a primary email:** placeholder vs skip?~~ **RESOLVED 2026-06-28** —
  placeholder (`<username>@no-email.rasifiters.com`). Affects exactly 1 row (the `admin` account); keeps
  admin able to sign in. **Gap found + fixed during deploy verify:** the migrator wrote the placeholder to
  `auth.users` but NOT to `member_emails`, so admin 401'd at login (no email to resolve) → backfilled via
  `apps/backend/sql/002_*.sql` (user ran it) + patched `tools/migrator/src/importAuth.js` to write the row.
- **iOS auth approach:** backend-proxy (clients ~unchanged) vs embed `supabase-swift`. Leaning proxy.
- **Two deferred delete cascades return 501** — `DELETE /api/auth/account` and `DELETE /api/members/:id`.
  Both run the same faithful cross-feature cascade (invites/notifications/membership-exit + delete the
  Supabase auth user) owned by the program-memberships + invites + notifications features (auth D-C1 /
  members D-C1); wire both when those features are ported. Temporary implementation gaps, not spec changes.
- ~~**Supabase JWT signing keys must be asymmetric (ECC P-256/ES256)** for the JWKS verify path (D-C2).~~
  **RESOLVED 2026-06-28** — the project's JWKS endpoint (`/auth/v1/.well-known/jwks.json`) serves a live
  `ES256`/P-256 key (`kid 0f6cd324…`), so JWKS verify finds a key. No further action needed at deploy.
- ~~**`SUPABASE_ANON_KEY` not stored locally**~~ **OBTAINED 2026-06-28** — the user supplied the anon key
  (a public anon JWT). Kept OUT of git per policy; paste it into Render as the `SUPABASE_ANON_KEY`
  `sync: false` Blueprint secret at provisioning (alongside `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
  both in `tools/migrator/.env`). All four backend env values are now in hand for the Render deploy.

## Session log (newest first)

- **2026-06-28 (pm-8)** — **Specced + ported the `members` feature** (2nd feature). `question-asker`: read
  the legacy `routes/members.js` + `services/memberService.js` in full, fanned 2 `Explore` agents over web +
  iOS consumption. Key finding — **`POST`/`DELETE /api/members` are called by neither client** (both use
  `/auth/register` + `/program-memberships`), reframing it as read + self-profile-update with two vestigial
  admin routes. User chose to **fix** the latent bug in `createMember` (legacy destructured `password` but
  never persisted it → unloggable member): D-C2 wires it to Supabase `admin.createUser` + requires `email`.
  Wrote `specs/features/members/SPEC.md` v0.1.0 (D-C1/D-C2/D-REF/D-S1, F1–F6); committed
  (`docs(members)` + `chore(skills)`) + tagged `feature/members@v0.1.0` + pushed. Then **ported**:
  `services/memberService.js` (faithful reads/update; `createMember` change reusing
  `authService.validatePassword`/`normalizeEmail`; `getAllMembers` excludes `auth_user_id`;
  `deleteMember`→501 per D-C1), `routes/members.js` (faithful 1:1), mounted `/api/members` in `server.js`.
  Boot check (module load + 5-route stack) passes. Status 📄→🏗️. **Pending:** runtime smoke-test vs live
  Supabase (the auto-deploy to Render on push). Next: the remaining backend features.
- **2026-06-28 (pm-7)** — **Deployed the auth backend to Render + verified it live.** User provisioned the
  Blueprint (`apps/backend/render.yaml`) and connected GitHub auto-deploy; service `rasifiters-api`
  (`srv-d90tgmv7f7vs73cudptg`) live at `https://rasifiters-api.onrender.com`. Smoke test: `GET /`→200
  (DB connected), `/api/app-config`+`/api/test`→200, guarded route no-token→401, bogus login→401. Full
  signed-in round-trip against migrated `admin`: login→200 (**imported bcrypt password verified**, ES256
  JWT `kid 0f6cd324…`); guarded route w/ valid token→200 (`authenticateToken` JWKS verify +
  `sub`→`members.auth_user_id`, the D-C2 path); garbage token→401; refresh→200; logout→200. **Found + fixed
  a migration gap:** placeholder (no-email) members had no `member_emails` row → `admin` 401'd before the
  password check; shipped `apps/backend/sql/002_backfill_placeholder_member_emails.sql` (user ran it) +
  patched `tools/migrator/src/importAuth.js` (writes the placeholder row on create/link/re-run). Recorded
  the deploy: `CONTEXT.md` + `apps/backend/CONTEXT.md` (URL + service id), filled the
  `deploy-scope-guard.sh` allow-list (+ a real render-srv guard, tested), flipped `auth` 🏗️→🚀 in
  registry/REGISTRY/SPEC §12. Next: spec + port the remaining backend features.
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
