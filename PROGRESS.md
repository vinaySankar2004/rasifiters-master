# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** It is the single source of truth for *where we are* and *what's
> next*. The cross-session loop: start → read this → work → at session end, update this file + commit
> (via `git-version`). Next session the user says **"continue"** and you resume from here.
>
> Keep it current: update **Current phase**, tick the **Build sequence**, and append a **Session log**
> entry each time. Durable decisions go in `METHODOLOGY.md` (decision log); legacy-coverage tracking in
> `COVERAGE.md`; this file is the live state + next-step pointer.

## Current phase

**Phase 0 — Scaffolding.** The ICM repo is set up and restructured to fit RaSi (apps/ + specs/features +
specs/pages, no stitch, no version folders, audit = web↔iOS parity). **Nothing is built or deployed.**

## Next action

**Decide before building the migrator** (two open questions): (a) how to handle members with **no primary
email** in the Supabase Auth import (placeholder vs skip+flag); (b) provision the Supabase project so the
migrator has a real target. Then build `tools/migrator/`.

Alternatively, to validate the methodology first: run `question-asker` on the backend **`auth`** feature to
produce the first spec.

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [ ] **Provision infra** — Supabase project (fill `project_ref` in `.mcp.json` + `ICM.md`), Railway
       `rasifiters-api`, Vercel `rasifiters-web`; record IDs in `apps/*/CONTEXT.md` + the deploy-scope hook.
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

- **2026-06-28** — Scaffolded the ICM repo from higgins-master; then restructured to fit RaSi: dropped
  `companies/` → `apps/`; split specs into `specs/features/` + `specs/pages/` (with role-based view rules);
  removed the `stitch` skill (faithful direct port instead); repurposed `audit` as a web↔iOS parity check;
  dropped per-feature version folders; made features client-specific-capable; added this `PROGRESS.md`.
