# ICM.md — L1 Map / Routing Directive (rasifiters-master)

> The L1 layer of the RaSi Fiters ICM environment. This file maps the apps → specs and points to the
> methodology docs. It is the first thing a Claude session reads when operating in this repo (right after
> **`PROGRESS.md`**, the current-state tracker).
>
> Methodology (the "why" + decision log + spec contract) is in-repo: **`METHODOLOGY.md`**. Operational
> how-to lives in the **skills** (`question-asker` · `git-version` · `deploy` · `audit` · `supabase` ·
> `health-check` · `ios-build`). Current state + next action: **`PROGRESS.md`**. Fresh-clone setup: **`SETUP.md`**.

## What this is

The ICM-methodology rebuild of **RaSi Fiters** — a fitness-program tracker (Members ↔ Programs ↔
Workouts/logs, with admin/logger/member roles, analytics, health logging, push notifications). The app was
recreated **faithfully (1:1 behavior)** on a new stack (Supabase + Render + Vercel), replacing custom JWT
auth with Supabase Auth. That rebuild is complete; see `METHODOLOGY.md` for the decision log.

Markdown is the source of truth; Claude Code (with Vercel / Render / Supabase MCPs) is the operator. Each
surface was documented as a spec, then the code ported faithfully from the original app — there was no
"stitch/assemble" step; this is one app, not a multi-company factory.

**This repo now stands alone** — the app code under `apps/` is the source of truth. The original app it was
ported from is archived and no longer tracked here; each spec's `Provenance` header records where it came
from, as history.

## The apps

| App | Stack | Host | Role |
|-----|-------|------|------|
| `backend` | Node/Express + Sequelize | Render (Blueprint) | The single API + data source for both clients. Talks to Supabase Postgres + proxies Supabase Auth. |
| `web` | Next.js 14 (App Router) + TS | Vercel | The web client. |
| `ios` | SwiftUI (iOS 18.6) | App Store | The iOS client. |

`web` and `ios` both consume `backend`. Supabase project ref: **`kpadxjekpiwfkqcxtrio`** (org `RaSi Fiters`
/ `lxehyprifvuozciizlem`, region `us-east-1`; read-only MCP `supabase-rasifiters`, repointed). **All three
surfaces are built (as of 2026-07-01):** `web` → Vercel project `rasifiters`, LIVE at
**`https://rasifiters.com`**; `backend` → Render `rasifiters-api`, LIVE at `https://rasifiters-api.onrender.com`;
`ios` → SwiftUI (iOS 18.6 target), code-complete (31 screen SPECs, native build green), TestFlight pending.

## Layer map

| ICM layer | Artifact in this repo |
|-----------|------------------------|
| L1 Map | `ICM.md` (this file) + `PROGRESS.md` (current state) |
| L2 Rooms | `CONTEXT.md` (project: brand + infra + migration source), `apps/{web,ios,backend}/CONTEXT.md` |
| L3 Tools | `.claude/skills/` (question-asker, git-version, deploy, audit, supabase, health-check, ios-build), `.mcp.json` |
| L4 Specs | `specs/features/` (shared capabilities) + `specs/pages/{web,ios}/` (per page/screen) + `specs/features/registry.json` |
| L5 Pipelines | `git-version` skill + Vercel / Render / Supabase MCP flows |

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
- **Provision + deploy** → the `deploy` skill (Vercel / Render / Supabase).
- **Check web↔iOS parity** for a shared feature → the `audit` skill.
- **Inspect the DB read-only** → the `supabase` skill. **Doc-health review** → `health-check`.
- **Commit + version** → the `git-version` skill (this repo's git skill).
