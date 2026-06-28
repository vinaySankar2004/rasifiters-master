# METHODOLOGY — the ICM "why" (in-repo, durable)

> The durable rationale + contracts for this repo. **rasifiters-master is self-contained**: this file
> is the in-repo home for the ICM decision log + the feature-spec contract; everything *operational*
> (how to document, stitch, version, deploy) lives in `.claude/skills/`.
>
> ICM = the markdown-as-source-of-truth methodology: companies → products → versioned features,
> with Claude Code (+ Vercel / Railway / Supabase MCPs) as the operator.
>
> This is the **ICM-methodology rebuild of "RaSi Fiters"** — a fitness program tracker
> (Members ↔ Programs ↔ Workouts/logs) with **web + iOS clients sharing ONE backend API**. The
> "reference implementation" for every feature is the **legacy app** at
> `/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/{rasifiters-webapp, ios-mobile, backend}` —
> the rebuild is a faithful **1:1** migration (R2), not a redesign.

## ICM layer model

| Layer | In this repo |
|-------|--------------|
| L1 Map | `ICM.md` (routing: companies → products → features) |
| L2 Rooms | `companies/rasifiters/CONTEXT.md` + `companies/rasifiters/products/{web,ios,backend}/CONTEXT.md` |
| L3 Tools | `.claude/skills/` + `.mcp.json` |
| L4 Feature registry | `features/REGISTRY.md` + `features/registry.json` + `features/<feature>/<version>/` |
| L5 Pipelines | `git-version` skill + Vercel / Railway / Supabase MCP flows |

## Products in this company

`rasifiters` is a single company with **three products that share one backend API**:

| Product | What it is | Stack | Host |
|---------|-----------|-------|------|
| `web` | Member/admin web app | Next.js 14 App Router (TypeScript) | Vercel |
| `ios` | Native mobile app | SwiftUI (+ widgets) | App Store (APNs push) |
| `backend` | The shared REST API | Node/Express + Sequelize | Railway |

Both clients (`web`, `ios`) talk to the **same** `backend`. There is no per-client backend; the
backend is its own L2 room with its own CONTEXT.md, env, and deploy target.

## Feature-spec contract (Vision §B)

Each `features/<feature>/<version>/` documents the feature so any product can rebuild it. Full file
set (rolled out as the contract proves out — shipped features are single-file SPECs today):
- **SPEC.md** — what it is · why · functionality · feature list · data/schema touchpoints · flags/env
  · dependencies · the **reference-implementation pointer** (canonical product+paths for this version).
- **FLOWS.md** — user flows + key path sequences.
- **SCHEMA.md** — tables/columns/migrations this feature owns or touches.
- **QUESTIONS.md** — the questions to ask before building/adapting into a new app (auth? brand?
  client = web or iOS? table names? flags?) — the `stitch` adaptation knobs.
- **CHANGELOG.md** — semver history + audit notes.

> RaSi is a shared-backend app, so most feature SPECs touch **all three** rooms: the backend route(s)
> + model(s), the web client surface, and the iOS client surface. The SPEC's reference-implementation
> pointer names the legacy paths in each of `{backend, rasifiters-webapp, ios-mobile}`.

## Versioning + cohesion (Vision §C/§F)

- Feature semver `MAJOR.MINOR.PATCH`; recorded in `registry.json` + the SPEC §12 changelog; git tag
  `feature/<feature>@<version>`.
- `registry.json` is a **dependency graph**: `depends_on` (forward) + `consumed_by` (reverse). Any
  change emits a **blast-radius report** before commit. The `git-version` skill owns this pipeline.
  In a shared-backend app the graph is load-bearing: a backend route change fans out to both the web
  and iOS consumers — the report catches the clients a backend edit silently breaks.

## Methodology concern → the skill that now owns it

| Concern (old doc) | Operational home |
|-------------------|------------------|
| Bootstrap a monorepo/company/product + deploy (Scaffold §5) | `deploy` skill |
| Per-page documentation question loop (Playbook §2–3) | `question-asker` skill |
| Assemble/rebuild a product from features (Vision §D) | `stitch` skill |
| Commit + version + registry + blast-radius (Vision §C/§F) | `git-version` skill |
| Cross-product feature diff / drift catch (Vision §E) | `audit` skill (web↔iOS parity per feature) |
| Inspect/query the company's Supabase DB read-only | `supabase` skill (Supabase MCP-first) |
| Periodic doc-health cross-review (drift / redundancy / structure) | `health-check` skill (read-only, report-only via plan mode) |

## Where each fact lives (single source of truth — don't duplicate)

| Fact | Canonical home |
|------|----------------|
| The "why" / decision log | **this file** |
| How to do X (operational) | the relevant `.claude/skills/<skill>` |
| Current state / what's next | `ICM.md` ("How to operate here") |
| Feature inventory + graph | `features/registry.json` + `features/REGISTRY.md` |
| Per-feature truth | `features/<feature>/<version>/SPEC.md` |
| Per-product infra (IDs, env, ports) | `companies/rasifiters/products/<p>/CONTEXT.md` |
| Env var inventory + how to inspect/change | `ENV_RUNBOOK.md` |
| Fresh-clone bootstrap (MCP OAuth, .mcp.json) | `SETUP.md` |
| Skill run history (verbose) | `<skill>/LESSONS_ARCHIVE.md` (not auto-loaded) |

## Log retention & pruning (when a dated log earns its keep)

Two classes of doc carry dated/strikethrough entries; the discipline differs:

| Class | Docs | Rule |
|-------|------|------|
| **Durable / append-only** (the audit trail) | METHODOLOGY decision log (R-entries), feature SPEC §12 Changelogs, `<skill>/LESSONS_ARCHIVE.md`, `companies/**/manifest.md` milestone logs, `ENV_RUNBOOK.md` strikethrough rows | **Append, never prune.** History is the value; mark superseded entries, don't delete them. |
| **Volatile / prune-on-resolve** (current state only) | `ICM.md` "How to operate here" (Open follow-ups) + any "current state / next steps" list | **Don't accumulate.** On resolve: strike `~~item~~` + `DONE <date>` for one session of visibility, then **delete it on the next pass that touches the doc.** `CONTEXT.md` holds no logs at all — reference data only. |

**Doc blast-radius check** (required before deleting any volatile-doc log entry — the doc-side
sibling of git-version's blast-radius report): before pruning a resolved item, confirm its durable
outcome already lives in a canonical home (per the SoT table), else the fact is lost —
1. **Feature/contract change?** → it must be in that feature's SPEC §12 Changelog (+ registry).
2. **Methodology/decision?** → it must be an R-entry in this file's decision log.
3. **Pure verification / transient task, no durable artifact?** → nothing to capture; safe to delete (say so in the prune commit).
Only delete once the home is verified. A still-relevant fact with no home is a *homeless fact* — give
it one before pruning. Enforced at commit time by `git-version`; `health-check` carries a backstop.

---

## Decisions log (R1 → R5) — the audit trail

> RaSi's decision log starts fresh at the locked scaffolding decisions. Append new R-entries here as
> the rebuild proceeds; never prune. The Higgins ICM's own R-history (its gen-4→gen-5 cutover) is not
> carried over — RaSi inherits the *methodology*, not Higgins's decisions.

- **2026-06-28 R1 — Auth = Supabase Auth via an Express proxy + bcrypt import + `members.auth_user_id`.**
  The legacy backend issues its own JWTs (`jsonwebtoken` signed with `JWT_SECRET`) and stores bcrypt
  password hashes in `member_credentials`; refresh tokens live in a `refresh_tokens` table with
  `REFRESH_TOKEN_TTL_DAYS`. The rebuild moves identity to **Supabase Auth**, but the **Express backend
  stays the single front door**: it **PROXIES** Supabase Auth (sign-in/sign-up/refresh/sign-out happen
  through backend routes that call Supabase) and **VERIFIES Supabase-issued JWTs** on every request
  (replacing the `jwt.verify(token, JWT_SECRET)` in `middleware/auth.js`). Members are linked to
  Supabase identities by a **new `members.auth_user_id` column**; the existing `members.id` UUIDs are
  **preserved** (every downstream FK — program_memberships, workout_logs, etc. — keeps pointing at the
  same member ids). Existing passwords are migrated by **bcrypt-hash import** into Supabase (no forced
  reset). Retired: `JWT_SECRET`, the self-issued access/refresh JWT machinery, the `refresh_tokens`
  table, `REFRESH_TOKEN_TTL_DAYS`.
- **2026-06-28 R2 — Keep the Node/Express + Sequelize backend; faithful 1:1 rebuild.** The backend is
  **NOT** rewritten in another stack — wherever the Higgins ICM source says FastAPI / uvicorn / Python /
  pip / `requirements.txt`, read it as **Node / Express / npm / `package.json`**. The legacy
  `/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/backend` (Express + Sequelize, `pg`, `bcrypt`,
  `apn`) is the reference implementation; the rebuild reproduces its routes, models, and behavior 1:1,
  documenting + de-drifting as it goes (rebuild-as-audit). Same stance for the clients: the legacy
  `rasifiters-webapp` (Next.js 14) and `ios-mobile` (SwiftUI) are the canonical references for `web`
  and `ios`.
- **2026-06-28 R3 — Products = `web` + `ios` + a shared `backend`.** One company, `rasifiters`, with
  three products. `web` (Next.js, Vercel) and `ios` (SwiftUI, App Store) are **clients of the same**
  `backend` (Express, Railway) — there is exactly one API for both. The backend is a first-class L2
  room (its own CONTEXT.md / env / deploy), not an implementation detail of a client.
- **2026-06-28 R4 — Hosts: API → Railway, Web → Vercel, DB → Supabase.** The backend moves off Render
  (legacy `DB_URL` pointed at `*.oregon-postgres.render.com`) to **Railway**. The web app moves off
  Netlify (legacy `netlify.toml`) to **Vercel**. The database moves to **Supabase Postgres** (same
  project also provides Supabase Auth per R1). iOS ships through the App Store and uses **APNs** for
  push (the legacy `apn`-based push path is preserved). Infra is **NOT provisioned yet** — concrete
  Railway/Vercel/Supabase IDs are `TODO(provision)` placeholders until created (see `SETUP.md` +
  `ENV_RUNBOOK.md`).
- **2026-06-28 R5 — No table prefixes; keep the legacy plain schema names.** Unlike the Higgins ICM
  (which re-prefixes to `<company>_gen_5_*`), RaSi keeps the **legacy plain table names** —
  `members`, `member_credentials`, `programs`, `program_memberships`, `program_invites`, `workouts`,
  `program_workouts`, `workout_logs`, `daily_health_logs`, `notifications`, etc. — for a **faithful
  1:1 migration** with zero rename churn (existing FKs and the preserved `members.id` UUIDs stay
  valid). The one additive schema change at the auth cutover is the **new `members.auth_user_id`
  column** (R1). Schema changes are only ever via migration files the user reviews/runs — no direct
  SQL from Claude.
