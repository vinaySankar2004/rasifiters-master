# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** It is the single source of truth for *where we are* and *what's
> next*. The cross-session loop: start → read this → work → at session end, update this file + commit
> (via `git-version`). Next session the user says **"continue"** and you resume from here.
>
> Keep it current: update **Current phase**, tick the **Build sequence**, and append a **Session log**
> entry each time. Durable decisions go in `METHODOLOGY.md` (decision log); legacy-coverage tracking in
> `COVERAGE.md`; this file is the live state + next-step pointer.

## Current phase

**Phase 1 — Provisioning (in progress).** Scaffolding done. **Supabase is provisioned** (2026-06-28): org
`RaSi Fiters` (`lxehyprifvuozciizlem`), project `rasifiters` ref **`kpadxjekpiwfkqcxtrio`**, region
`us-east-1`, ACTIVE_HEALTHY; `.mcp.json` repointed; secrets in the user's password manager. Railway +
Vercel projects are **not yet created** (deferred — `web`/`backend` have no code to deploy yet). Nothing is
deployed.

## Next action

**Build the migrator** (`tools/migrator/`) — its target (Supabase) now exists. First resolve the one open
decision it needs: members with **no primary email** in the Supabase Auth import (placeholder vs skip+flag).
The connection strings (direct/session-pooler/txn-pooler) are captured in the user's secrets file.

Alternatively, to validate the methodology first: run `question-asker` on the backend **`auth`** feature to
produce the first spec. (Railway + Vercel provisioning can wait until `backend`/`web` have portable code.)

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [~] **Provision infra** — Supabase project DONE 2026-06-28 (`project_ref` filled in `.mcp.json` + `ICM.md`
       + `CONTEXT.md`). Railway `rasifiters-api` + Vercel `rasifiters-web` deferred until those apps have
       code to deploy; record their IDs in `apps/*/CONTEXT.md` + the deploy-scope hook when created.
3. [ ] **Migrator** (`tools/migrator/`) — Render PG → Supabase, preserve `members.id` UUIDs; create
       `auth.users` via bcrypt-hash import; backfill `members.auth_user_id`. Re-runnable sync.
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

- **Migrator — members without a primary email:** synthesize a placeholder email vs skip + flag? (Supabase
  Auth needs an email per user.)
- **iOS auth approach:** backend-proxy (clients ~unchanged) vs embed `supabase-swift`. Leaning proxy.

## Session log (newest first)

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
