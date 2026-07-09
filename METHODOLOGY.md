# METHODOLOGY — the ICM "why" (in-repo, durable)

> The durable rationale + contracts for this repo. **rasifiters-master is self-contained**: this file
> is the in-repo home for the ICM decision log + the feature-spec contract; everything *operational*
> (how to document, port, version, deploy) lives in `.claude/skills/`.
>
> ICM = the markdown-as-source-of-truth methodology: one app → four apps (surfaces) → documented
> features + pages, with Claude Code (+ Vercel / Render / Supabase MCPs) as the operator.
>
> This is the **ICM-methodology rebuild of "RaSi Fiters"** — a fitness program tracker
> (Members ↔ Programs ↔ Workouts/logs) with **web + iOS + Android clients sharing ONE backend API**. The rebuild
> was a faithful **1:1** migration (R2) of the original app, not a redesign; it is now complete and this
> repo stands alone. The original app is archived — each SPEC's `Provenance` header records where it was
> ported from, as history.

## ICM layer model

| Layer | In this repo |
|-------|--------------|
| L1 Map | `ICM.md` (routing: app → apps/surfaces → features + pages) |
| L2 Rooms | `CONTEXT.md` (project-level) + `apps/{web,ios,android,backend}/CONTEXT.md` |
| L3 Tools | `.claude/skills/` + `.mcp.json` |
| L4 Feature registry | `specs/features/REGISTRY.md` + `specs/features/registry.json` + `specs/features/<feature>/SPEC.md` + `specs/pages/{web,ios,android}/<page>/SPEC.md` |
| L5 Pipelines | `git-version` skill + Vercel / Render / Supabase MCP flows |

## The apps (surfaces)

"RaSi Fiters" is **one app** with **four surfaces** (called **apps**) that share one backend API:

| App | What it is | Stack | Host |
|---------|-----------|-------|------|
| `web` | Member/admin web app | Next.js 14 App Router (TypeScript) | Vercel |
| `ios` | Native mobile app | SwiftUI (+ widgets) | App Store (APNs push) |
| `android` | Native mobile app | Jetpack Compose (Kotlin, Material 3) | Play Store (FCM push) |
| `backend` | The shared REST API | Node/Express + Sequelize | Render (Blueprint) |

All three clients (`web`, `ios`, `android`) talk to the **same** `backend`. There is no per-client backend; the
backend is its own L2 room with its own CONTEXT.md, env, and deploy target.

## Feature-spec contract (Vision §B)

Each `specs/features/<feature>/SPEC.md` documents the feature so any surface can rebuild it. Full file
set (rolled out as the contract proves out — shipped features are single-file SPECs today):
- **SPEC.md** — what it is · why · functionality · feature list · data/schema touchpoints · flags/env
  · dependencies · the **provenance pointer** (the app + paths it was ported from).
- **FLOWS.md** — user flows + key path sequences.
- **SCHEMA.md** — tables/columns/migrations this feature owns or touches.
- **QUESTIONS.md** — the questions to ask before building/porting (auth? brand?
  client = web or iOS? table names? flags?) asked by `question-asker`.
- **CHANGELOG.md** — semver history + audit notes.

> RaSi is a shared-backend app, so most feature SPECs touch **all three** rooms: the backend route(s)
> + model(s), the web client surface, and the iOS client surface. The SPEC's provenance header records
> the original paths it was ported from in each of `{backend, rasifiters-webapp, ios-mobile}` (archived).
> But a feature can also be **client-specific** — its `consumed_by` may be `[web]` or `[ios]` only (e.g.
> iOS widgets / deep links are ios-only) — so not every SPEC touches all three rooms.

## Page/screen-spec template (web + iOS + Android pages)

A **page/screen SPEC** lives at `specs/pages/{web,ios,android}/<page>/SPEC.md` and documents a single
page/screen; it was ported faithfully from the original app. Like features, a page is tied to a
surface (`web` or `ios`). **Role-based view rules are first-class for RaSi** — what each role sees /
can do on a page is a load-bearing part of the contract, not an afterthought. Sections:

1. **What it is + who uses it** — one-line identity and the audience (which roles land here).
2. **Why it exists** — the job the page does in the product.
3. **Route/location** — which app (`web`/`ios`) + the path/route (and the legacy equivalent).
4. **Contents/sections** — the blocks on the page, top to bottom; cite the provenance `file:line`
   for each block.
5. **Components + shared features consumed** — the shared components and feature SPECs this page
   draws on (link them).
6. **Data/API** — the backend endpoints the page calls (method + path), and what it reads/writes.
7. **Role-based view rules** — a table mapping each role to what's visible / which actions are enabled:

   | Role | Visible | Actions enabled |
   |------|---------|-----------------|
   | `global_admin` | … | … |
   | program admin | … | … |
   | logger | … | … |
   | member | … | … |

   Include the **`admin_only_data_entry`** effect (when a program locks data entry to admins, what
   changes for logger/member here).
8. **States & edge cases** — loading / empty / error / offline / permission-denied / etc.
9. **Decisions made** — a `D-xx` table of page-specific decisions (faithful-by-default; call out any
   deliberate change).
10. **Flagged characteristics kept as-is** — legacy quirks intentionally preserved.
11. **Changelog** — semver history + audit notes.

## Versioning + cohesion (Vision §C/§F)

- Feature semver `MAJOR.MINOR.PATCH`; recorded in the registry `version` field + the SPEC changelog
  section; git tag `feature/<feature>@<version>`. **There are no per-feature version folders** —
  version history is the SPEC's Changelog section + git tags + the registry `version` field, not a
  `/<version>/` directory.
- `registry.json` is a **dependency graph**: `depends_on` (forward) + `consumed_by` (reverse). A
  feature may be **shared** (`consumed_by: [web, ios]`) or **client-specific** (`[web]` or `[ios]`
  only — e.g. iOS widgets/deep links). Any change emits a **blast-radius report** before commit. The
  `git-version` skill owns this pipeline. In a shared-backend app the graph is load-bearing: a
  backend route change fans out to its consumers — the report catches the clients a backend edit
  silently breaks.

## Methodology concern → the skill that now owns it

| Concern (old doc) | Operational home |
|-------------------|------------------|
| Bootstrap the monorepo/app + deploy (Scaffold §5) | `deploy` skill |
| Per-page documentation question loop (Playbook §2–3) | `question-asker` skill (writes the SPEC) |
| Implement a documented feature/page → port directly from the reference app | hand-written code (faithful 1:1 port; no stitch step), committed via `git-version` |
| Orchestrate a nontrivial / multi-surface change (plan → adversary → build → review) | `multiplex` skill (5 role-agents in `.claude/agents/` + `plan-pipeline` workflow; parallel per-surface implementers; compile-check gate, no staging — user tests on prod) |
| Commit + version + registry + blast-radius (Vision §C/§F) | `git-version` skill |
| Cross-surface feature diff / drift catch (Vision §E) | `audit` skill (web↔iOS↔android parity per feature) |
| iOS compile-check loop (build `apps/ios`, read diagnostics, fix) | `ios-build` skill (native `xcode` MCP; compile-only) |
| Android compile-check loop (build `apps/android`, read diagnostics, fix) | `android-build` skill (Gradle CLI `./gradlew`; compile-only) |
| Inspect/query the Supabase DB read-only | `supabase` skill (Supabase MCP-first) |
| Periodic doc-health cross-review (drift / redundancy / structure) | `health-check` skill (read-only, report-only via plan mode) |

## Where each fact lives (single source of truth — don't duplicate)

| Fact | Canonical home |
|------|----------------|
| The "why" / decision log | **this file** |
| How to do X (operational) | the relevant `.claude/skills/<skill>` |
| Cross-session state (read first each session) | `PROGRESS.md` (replaces the old `manifest.md` milestone log) |
| Current state / what's next | `ICM.md` ("How to operate here") |
| Feature inventory + graph | `specs/features/registry.json` + `specs/features/REGISTRY.md` |
| Per-feature truth | `specs/features/<feature>/SPEC.md` |
| Per-page/screen truth | `specs/pages/{web,ios,android}/<page>/SPEC.md` |
| Per-app infra (IDs, env, ports) | `apps/<app>/CONTEXT.md` |
| Env var inventory + how to inspect/change | `ENV_RUNBOOK.md` |
| Skill run history (verbose) | `<skill>/LESSONS_ARCHIVE.md` (not auto-loaded) |

## Log retention & pruning (when a dated log earns its keep)

Two classes of doc carry dated/strikethrough entries; the discipline differs:

| Class | Docs | Rule |
|-------|------|------|
| **Durable / append-only** (the audit trail) | METHODOLOGY decision log (R-entries), feature SPEC §12 Changelogs, `<skill>/LESSONS_ARCHIVE.md`, `PROGRESS_ARCHIVE.md` (the condensed run history), `ENV_RUNBOOK.md` strikethrough rows | **Append, never prune.** History is the value; mark superseded entries, don't delete them. |
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

## Decisions log (R1 → R7) — the audit trail

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
  pip / `requirements.txt`, read it as **Node / Express / npm / `package.json`**. The legacy backend
  (Express + Sequelize, `pg`, `bcrypt`, `apn`) was the reference implementation; the rebuild reproduces
  its routes, models, and behavior 1:1,
  documenting + de-drifting as it goes (rebuild-as-audit). Same stance for the clients: the legacy
  `rasifiters-webapp` (Next.js 14) and `ios-mobile` (SwiftUI) were the canonical references for `web`
  and `ios`.
- **2026-06-28 R3 — Apps = `web` + `ios` + a shared `backend`.** One app, "RaSi Fiters", with three
  surfaces (called apps). `web` (Next.js, Vercel) and `ios` (SwiftUI, App Store) are **clients of the
  same** `backend` (Express, Render) — there is exactly one API for both. The backend is a
  first-class L2 room (its own CONTEXT.md / env / deploy), not an implementation detail of a client.
- **2026-06-28 R4 — Hosts: API → Render, Web → Vercel, DB → Supabase.**
  _(Amended 2026-06-28 — API host was originally Railway; see R7. Railway was never provisioned, so this
  entry is restated to Render.)_ The backend stays on **Render** but as a **brand-new web service**
  provisioned via Blueprint (the legacy backend ran on Render too; legacy `DB_URL` pointed at
  `*.oregon-postgres.render.com`). The web app moves off Netlify (legacy `netlify.toml`) to **Vercel**.
  The database moves to **Supabase Postgres** (same project also provides Supabase Auth per R1). iOS
  ships through the App Store and uses **APNs** for push (the legacy `apn`-based push path is preserved).
  Infra is provisioned in build-order — concrete Render/Vercel IDs were pending until each app had code
  to deploy; all three are now provisioned + live (IDs in `CONTEXT.md` §Infrastructure).
- **2026-06-28 R5 — No table prefixes; keep the legacy plain schema names.** Unlike the Higgins ICM
  (which re-prefixes to `<prefix>_gen_5_*`), RaSi keeps the **legacy plain table names** —
  `members`, `member_credentials`, `programs`, `program_memberships`, `program_invites`, `workouts`,
  `program_workouts`, `workout_logs`, `daily_health_logs`, `notifications`, etc. — for a **faithful
  1:1 migration** with zero rename churn (existing FKs and the preserved `members.id` UUIDs stay
  valid). The one additive schema change at the auth cutover is the **new `members.auth_user_id`
  column** (R1). Schema changes are only ever via migration files the user reviews/runs — no direct
  SQL from Claude.
- **2026-06-28 R6 — Restructure: `apps/` (not `companies/`), specs split into features + pages, no
  stitch, no version folders.** The methodology layer is collapsed: there is no `companies/` layer —
  "RaSi Fiters" is **one app** with three surfaces (also called apps) under **`apps/{web,ios,backend}`**.
  Specs split into **`specs/features/<feature>/SPEC.md`** (shared or client-specific behavior) and
  **`specs/pages/{web,ios}/<page>/SPEC.md`** (per-page/screen, with first-class role-based view
  rules). The **`stitch` skill is removed**: there is no "assemble a product from SPECs" step —
  `question-asker` writes the SPEC and we **implement the code directly as a faithful 1:1 port** from
  the legacy reference app, committing via `git-version`. The **`audit` skill is repurposed** as a
  web↔iOS **parity checker** per feature. There are **no per-feature version folders** — version
  history is the SPEC Changelog section + git tags + the registry `version` field. Features/pages may
  be **client-specific** (`consumed_by` = `[web]` or `[ios]` only — e.g. iOS widgets/deep links), not
  always shared. (R1–R5 stand unchanged.)
- **2026-06-28 R7 — Backend host: Render, not Railway (supersedes R4's original Railway choice).** The
  API deploys to a **Render web service** defined as Infrastructure-as-Code in
  `apps/backend/render.yaml` (a Blueprint), not Railway. Railway was never provisioned, so this is a
  clean swap with no migration cost. Rationale: keep the API on the platform the team already runs
  (the legacy backend was a Render service), use Render's native **Blueprint + GitHub auto-deploy** as
  the deploy model (`rootDir: apps/backend`, `buildFilter.paths: [apps/backend/**]` for the monorepo,
  `autoDeployTrigger: commit`), and manage the account via Render's hosted MCP (`https://mcp.render.com/mcp`).
  Concrete deltas: `.mcp.json` `railway`→`render`; the `deploy` skill + `deploy-scope-guard.sh` +
  `ENV_RUNBOOK.md` rewritten for Render; `server.js` binds `0.0.0.0` (Render injects `PORT`, default
  `10000`); secrets are `sync: false` Blueprint vars entered in the dashboard at first sync. DB
  (Supabase) and web (Vercel) hosts are unaffected. (R1–R6 stand unchanged; R4 amended in place.)
