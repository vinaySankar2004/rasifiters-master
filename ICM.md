# ICM.md — L1 Map / Routing Directive (rasifiters-master)

> The L1 layer of the RaSi Fiters ICM environment. This file routes companies → products →
> features and points to the methodology docs. It is the first thing a Claude session reads
> when operating in this repo.
>
> Methodology (the "why" + decision log + feature-spec contract) is in-repo: **`METHODOLOGY.md`**.
> Operational how-to lives in the **skills** (`deploy` · `stitch` · `git-version` · `question-asker` ·
> `audit` · `supabase` · `health-check`). Current state + open follow-ups: **"How to operate here"**
> below. Fresh-clone setup: **`SETUP.md`**.

## What this is

The ICM-methodology rebuild of **RaSi Fiters** — a fitness-program tracker (Members ↔ Programs ↔
Workouts/logs, with admin/logger/member roles, analytics, health logging, push notifications). We are
recreating the existing app **faithfully (1:1 behavior)** while moving the stack to Supabase + Railway +
Vercel and replacing custom JWT auth with Supabase Auth. See `METHODOLOGY.md` for the decision log.

**Reference implementation (the thing we're rebuilding)** lives OUTSIDE this repo, in the legacy app at
`../{rasifiters-webapp, ios-mobile, backend}` (the parent `RaSi-Fiters/` folder). Every feature SPEC cites
it as the source of truth for faithful rebuild.

## Routing table

| Company | Products | Supabase project | Notes |
|---------|----------|------------------|-------|
| `rasifiters` | `web`, `ios`, `backend` | `TODO(provision)` (read-only MCP `supabase-rasifiters`) | single company; `web` (Next.js) + `ios` (SwiftUI) both consume the one `backend` (Express) API |

_Infra is not provisioned yet — refs are `TODO(provision)`, filled by the `deploy` skill / `SETUP.md`._

## Layer map

| ICM layer | Artifact in this repo |
|-----------|------------------------|
| L1 Map | `ICM.md` (this file) |
| L2 Rooms | `companies/rasifiters/CONTEXT.md`, `companies/rasifiters/products/{web,ios,backend}/CONTEXT.md` |
| L3 Tools | `.claude/skills/` (question-asker, git-version, stitch, deploy, audit, supabase, health-check), `.mcp.json` |
| L4 Feature registry | `features/REGISTRY.md` + `features/registry.json` + `features/<feature>/<version>/` |
| L5 Pipelines | `git-version` skill + Vercel / Railway / Supabase MCP flows |

## Product model

- **`backend`** — Node/Express + Sequelize API. The single source of data for both clients. Deploys to
  **Railway**. Talks to **Supabase Postgres** + proxies **Supabase Auth**.
- **`web`** — Next.js 14 (App Router) web app. Deploys to **Vercel**.
- **`ios`** — SwiftUI app. Ships via the App Store / TestFlight.

Features are company-agnostic SPECs in `features/`. A feature like `auth` or `summary-analytics` may be
`consumed_by` multiple products (e.g. both `web` and `ios` consume `backend` feature SPECs).

## How to operate here

> **This is a fresh scaffold.** Nothing is built or deployed yet. Work is **new scope** — propose +
> confirm with the user before implementing; follow the locked sequencing in `METHODOLOGY.md` rather than
> re-deciding it.
>
> **Log hygiene:** the Open follow-ups below are current-state only — on resolve, strike `~~…~~` +
> `DONE <date>`, then delete on the next pass (after a doc blast-radius check that the outcome lives in its
> canonical home). See `METHODOLOGY.md` → "Log retention & pruning".

- **Locked build sequence (see `METHODOLOGY.md` decision log):**
  1. ~~Scaffold the ICM repo (L1–L5 + skills + hooks).~~ **DONE 2026-06-28** (this file + siblings).
  2. **Build the temporary migrator** (`tools/migrator/`): Render Postgres → Supabase, preserving
     `members.id` UUIDs; create `auth.users` from `member_credentials` via **bcrypt-hash import**; backfill
     `members.auth_user_id`. Re-runnable sync.
  3. **Stand up the `backend` product**: point Express at Supabase, swap auth middleware to verify Supabase
     JWTs (proxy login/refresh/logout), deploy to Railway.
  4. **Rebuild `web`** feature-by-feature (`question-asker` → SPEC → `stitch` → `deploy` to Vercel, temp
     domain). This also proves the auth path end-to-end.
  5. **Rebuild `ios`** feature-by-feature.
  6. **Cutover**: switch `rasifiters.com` (Vercel) + ship the iOS build.

- **Open follow-ups (propose + confirm):**
  - **Provision infra** — create the Supabase project (fill `project_ref` in `.mcp.json` + the routing
    table), the Railway `rasifiters-api` service, and the Vercel `rasifiters-web` project; record IDs in the
    product CONTEXT.md files and fill the allow-list in `.claude/hooks/deploy-scope-guard.sh`.
  - **iOS auth approach** — confirm proxy-via-backend (clients unchanged, backend wraps Supabase Auth) vs
    embedding `supabase-swift`. Leaning proxy for seamlessness; settle in the iOS `auth` SPEC.

- **Document a NEW / undocumented surface (write its SPEC)** → the `question-asker` skill.
- **Rebuild / assemble a product from feature SPECs** → the `stitch` skill (Mode R faithful rebuild, or
  Mode S for a new company) → deploy via the `deploy` skill.
- **Commit + version** → the `git-version` skill (this repo's git skill).
