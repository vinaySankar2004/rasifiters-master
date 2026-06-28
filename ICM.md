# ICM.md — L1 Map / Routing Directive (rasifiters-master)

> The L1 layer of the RaSi Fiters ICM environment. This file maps the apps → specs and points to the
> methodology docs. It is the first thing a Claude session reads when operating in this repo (right after
> **`PROGRESS.md`**, the current-state tracker).
>
> Methodology (the "why" + decision log + spec contract) is in-repo: **`METHODOLOGY.md`**. Operational
> how-to lives in the **skills** (`question-asker` · `git-version` · `deploy` · `audit` · `supabase` ·
> `health-check`). Current state + next action: **`PROGRESS.md`**. Fresh-clone setup: **`SETUP.md`**.

## What this is

The ICM-methodology rebuild of **RaSi Fiters** — a fitness-program tracker (Members ↔ Programs ↔
Workouts/logs, with admin/logger/member roles, analytics, health logging, push notifications). We are
recreating the existing app **faithfully (1:1 behavior)** while moving the stack to Supabase + Railway +
Vercel and replacing custom JWT auth with Supabase Auth. See `METHODOLOGY.md` for the decision log.

Markdown is the source of truth; Claude Code (with Vercel / Railway / Supabase MCPs) is the operator. We
document each surface as a spec, then port the code faithfully from the legacy app — there is no
"stitch/assemble" step; this is one app, not a multi-company factory.

**Reference implementation (the thing we're rebuilding)** lives OUTSIDE this repo, in the legacy app at
`../{rasifiters-webapp, ios-mobile, backend}` (the parent `RaSi-Fiters/` folder). Every spec cites it as
the source of truth for the faithful rebuild.

## The apps

| App | Stack | Host | Role |
|-----|-------|------|------|
| `backend` | Node/Express + Sequelize | Railway | The single API + data source for both clients. Talks to Supabase Postgres + proxies Supabase Auth. |
| `web` | Next.js 14 (App Router) + TS | Vercel | The web client. |
| `ios` | SwiftUI (iOS 18.6) | App Store | The iOS client. |

`web` and `ios` both consume `backend`. Supabase project ref: `TODO(provision)` (read-only MCP
`supabase-rasifiters`). Infra is not provisioned yet — refs are `TODO(provision)`, filled by the `deploy`
skill / `SETUP.md`.

## Layer map

| ICM layer | Artifact in this repo |
|-----------|------------------------|
| L1 Map | `ICM.md` (this file) + `PROGRESS.md` (current state) |
| L2 Rooms | `CONTEXT.md` (project: brand + infra + migration source), `apps/{web,ios,backend}/CONTEXT.md` |
| L3 Tools | `.claude/skills/` (question-asker, git-version, deploy, audit, supabase, health-check), `.mcp.json` |
| L4 Specs | `specs/features/` (shared capabilities) + `specs/pages/{web,ios}/` (per page/screen) + `specs/features/registry.json` |
| L5 Pipelines | `git-version` skill + Vercel / Railway / Supabase MCP flows |

## Specs: features vs pages

- **Feature spec** (`specs/features/<feature>/SPEC.md`) — a cross-cutting capability: `auth`,
  `notifications`, `analytics-engine`, etc. Each declares `consumed_by` — which apps use it. A feature may
  be **shared** (`[web, ios]`), **web-only** (`[web]`), or **ios-only** (`[ios]`) — e.g. iOS widgets /
  deep links / push-token registration are ios-only; some bulk admin tools may be web-only.
- **Page/screen spec** (`specs/pages/web/<page>/SPEC.md`, `specs/pages/ios/<screen>/SPEC.md`) — one page or
  screen: its purpose, contents, the features it consumes, and **role-based view rules** (what each role —
  global_admin / program admin / logger / member — sees and can do, incl. the `admin_only_data_entry`
  effect). These rule-based views are first-class for RaSi.

No per-feature version folders — history lives in each spec's Changelog + git tags (see the `git-version`
skill). Coverage of the legacy app is tracked in `COVERAGE.md`; progress + next action in `PROGRESS.md`.

## How to operate here

> **Read `PROGRESS.md` first** — it holds the current phase, what's done, and the next concrete action.
> Work is **new scope** — propose + confirm with the user before implementing; follow the locked
> sequencing in `METHODOLOGY.md` rather than re-deciding it.
>
> **Cross-session loop:** start → read `PROGRESS.md` → work → at session end, update `PROGRESS.md` +
> commit (via `git-version`). Next session the user says "continue" and you resume from `PROGRESS.md`.
>
> **Log hygiene:** resolved follow-ups get struck `~~…~~` + `DONE <date>`, then deleted next pass (after a
> doc blast-radius check that the outcome lives in its canonical home). See `METHODOLOGY.md` → "Log
> retention & pruning".

- **Document a NEW / undocumented surface (write its spec)** → the `question-asker` skill (handles both
  feature and page/screen specs).
- **Implement a documented feature/page** → port the code directly + faithfully from the legacy reference
  app; commit via `git-version`.
- **Provision + deploy** → the `deploy` skill (Vercel / Railway / Supabase).
- **Check web↔iOS parity** for a shared feature → the `audit` skill.
- **Inspect the DB read-only** → the `supabase` skill. **Doc-health review** → `health-check`.
- **Commit + version** → the `git-version` skill (this repo's git skill).
