# ICM.md — L1 Map / Routing Directive (rasifiters-master)

> The L1 layer of the RaSi Fiters ICM environment. This file maps the apps → specs and points to the
> methodology docs. It is the first thing a Claude session reads when operating in this repo (right after
> **`PROGRESS.md`**, the current-state tracker).
>
> Methodology (the "why" + decision log + spec contract) is in-repo: **`METHODOLOGY.md`**. Operational
> how-to lives in the **skills** (`question-asker` · `git-version` · `deploy` · `audit` · `supabase` ·
> `health-check` · `ios-build` · `android-build` · `multiplex`). Current state + next action: **`PROGRESS.md`**.

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
| `android` | Jetpack Compose (Kotlin) | Play Store | The Android client — 4th surface, a faithful 1:1 Compose port; code-complete (all 4 tabs, build green, de-scaffolded 2026-07-08) and **live on Play closed testing** (current build per `RELEASES.md`). Consumes `backend` like web/iOS. |

`web`, `ios`, and `android` all consume `backend`. Supabase project ref: **`kpadxjekpiwfkqcxtrio`** (org `RaSi Fiters`
/ `lxehyprifvuozciizlem`, region `us-east-1`; read-only MCP `supabase-rasifiters`, repointed). **All four
surfaces are built:** `web` → Vercel project `rasifiters`, LIVE at
**`https://rasifiters.com`**; `backend` → Render `rasifiters-api`, LIVE at `https://rasifiters-api.onrender.com`;
`ios` → SwiftUI (iOS 18.6 target), code-complete (native build green), **LIVE on the App Store + TestFlight**; `android` →
Compose, code-complete (Gradle build green), **live on Play closed testing**. Current per-channel binary
versions live in **`RELEASES.md`** (the SoT for what's on which channel); page/screen counts live in
`specs/pages/REGISTRY.md`.

## Layer map

| ICM layer | Artifact in this repo |
|-----------|------------------------|
| L1 Map | `ICM.md` (this file) + `PROGRESS.md` (current state) |
| L2 Rooms | `CONTEXT.md` (project: brand + infra + migration source), `apps/{web,ios,android,backend}/CONTEXT.md` |
| L3 Tools | `.claude/skills/` (question-asker, git-version, deploy, audit, supabase, health-check, ios-build, android-build, multiplex) + `.claude/agents/` (multiplex role-agents) + `.claude/workflows/` (plan-pipeline), `.mcp.json` |
| L4 Specs | `specs/features/` (shared capabilities) + `specs/pages/{web,ios,android}/` (per page/screen) + `specs/features/registry.json` |
| L5 Pipelines | `git-version` skill + Vercel / Render / Supabase MCP flows |

## Specs: features vs pages

- **Feature spec** (`specs/features/<feature>/SPEC.md`) — a cross-cutting capability: `auth`,
  `notifications`, `analytics-engine`, etc. Each declares `consumed_by` — which apps use it. A feature may
  be **shared** (`[web, ios, android]`), or scoped to any subset (`[web]` web-only, `[ios]` ios-only,
  `[android]` android-only) — e.g. iOS widgets / deep links are ios-only, Health Connect is android-only,
  some bulk admin tools may be web-only.
- **Page/screen spec** (`specs/pages/web/<page>/SPEC.md`, `specs/pages/ios/<screen>/SPEC.md`,
  `specs/pages/android/<screen>/SPEC.md`) — one page or
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
- **Make a nontrivial / multi-surface change** → the `multiplex` skill (the role-agent pipeline: scout →
  plan → plan-adversary → USER approves → per-surface implementer(s) → impl-adversary → compile-check →
  git-version → you test on prod). Small changes use PARTS of it (e.g. just `impl-adversary` on a hand-written
  diff, or just `scout` for a file fence). Compile-check `apps/ios`/`apps/android` via the `ios-build`/`android-build` skills.
- **Provision + deploy** → the `deploy` skill (Vercel / Render / Supabase).
- **Check web↔iOS↔android parity** for a shared feature → the `audit` skill.
- **Inspect the DB read-only** → the `supabase` skill. **Doc-health review** → `health-check`.
- **Commit + version** → the `git-version` skill (this repo's git skill).
