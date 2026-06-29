# rasifiters-master — Claude Code Project Rules

The ICM repo for the **RaSi Fiters** rebuild — one app, three surfaces (`web`, `ios`, `backend`),
documented as specs then ported faithfully from the legacy app. Markdown is the source of truth; Claude
Code (with Vercel / Render / Supabase MCPs) is the operator. Read **`PROGRESS.md`** (current state) and
**`ICM.md`** (L1 map) first, then **`SETUP.md`** if this is a fresh clone.

Methodology (the "why" + decision log + feature-spec contract) lives in-repo at `METHODOLOGY.md`; all
operational how-to lives in `.claude/skills/`. Current state + open follow-ups: `ICM.md` ("How to operate
here").

## The mission (faithful rebuild)

We are recreating the existing RaSi Fiters app **1:1** — same features, same behavior — on a new stack
(Supabase DB + Auth, Render API, Vercel web). The **reference implementation** is the legacy app at
`../{rasifiters-webapp, ios-mobile, backend}`. Default stance for every feature is **faithful-as-is**;
deliberate changes are called out explicitly in the SPEC (§9/§10). Don't "improve" silently.

## Database Write Policy

**Never write, suggest, or generate SQL that modifies data or schema directly** — no `INSERT`,
`UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, or `CREATE TABLE` against the live database.
The `supabase-rasifiters` MCP is **read-only** by URL, and a PreToolUse hook blocks inline `psql`
writes. If asked to modify data/schema:
1. Say no clearly.
2. Redirect: create a numbered SQL migration file in `apps/backend/sql/`
   (idempotent — `IF NOT EXISTS` / `ON CONFLICT`).
3. If the user insists on direct execution, ask "Are you sure? This should go in a migration file."

The schema is migrated faithfully from the legacy Render Postgres — **same table names, no prefixes**
(R5). The one structural change is auth: `member_credentials`/`refresh_tokens` retire (Supabase Auth owns
credentials) and `members` gains an `auth_user_id` column mapping to `auth.users`. See `METHODOLOGY.md` R1.

## Auth model (the load-bearing migration detail)

Auth = **Supabase Auth**, but the **Express backend stays the auth-facing API**: it proxies Supabase Auth
(login/refresh/logout) and **verifies Supabase-issued JWTs** in middleware, mapping `sub` → a member via
`members.auth_user_id`. Existing `members.id` UUIDs are preserved (all FKs/data migrate untouched).
Passwords migrate by **bcrypt-hash import** into `auth.users` (users keep their passwords). Username login
is preserved via privacy-safe server-side username→email resolution. Authorization (program admin/logger
checks) stays in Express exactly as today — we do not rely on RLS. See `METHODOLOGY.md` R1.

## Workspace Standards

- **Modularization**: small, focused modules. Max ~200 lines per file where practical.
- **Abstraction**: route handlers thin; business logic in services; DB access in models/dedicated modules
  (matches the legacy backend's routes/ → services/ → models/ layering).
- **Consistency**: snake_case (DB), camelCase (JS/TS API boundary). Follow existing legacy patterns.
- **Non-breaking**: preserve existing behavior; the whole point is a seamless transfer.
- **Scalability**: no N+1; explicit I/O timeouts; idempotent writes where retries exist.
- **Docs**: update CONTEXT.md / feature SPECs / READMEs when schema or behavior changes.

## Planning Standards

Plans must be prescriptive and executable: full file paths, exact values, ordered numbered steps,
copy-paste-ready code, no "as needed"/TBD/figure-it-out.

## MCP Servers (see `.mcp.json` + `SETUP.md`)

- **vercel** — `https://mcp.vercel.com` (account-level OAuth; all projects in the team).
- **render** — `https://mcp.render.com/mcp` (account/workspace-level OAuth; all services). The backend
  deploys as a Blueprint (`apps/backend/render.yaml`); this MCP is the create/inspect/deploy path.
- **supabase-rasifiters** — read-only, scoped to the rasifiters project (`project_ref` is
  `TODO(provision)` until the Supabase project is created).

All three are OAuth-based remote HTTP MCPs — **no secrets in `.mcp.json`**; first use triggers a one-time
browser login per server.

**Use ONLY these project MCP servers in this workspace.** The claude.ai-managed connectors
(`claude.ai Supabase`, `claude.ai Vercel`, `claude.ai Google Drive`) and `n8n` are **denied** in
`.claude/settings.json` — they grant broad account-level access and bypass our scoping.

**Scope guardrail.** Vercel + Render OAuth grant access to *all* account projects/services. The
`deploy-scope-guard.sh` PreToolUse hook restricts `vercel`/`render` commands to the rasifiters
allow-list. When the `deploy` skill provisions the Vercel project + Render service, record their IDs in
the product `CONTEXT.md` and fill the allow-list/scope in the hook.

## Skills (`.claude/skills/`)

`git-version` (this repo's git skill; ICM commit + version pipeline) · `question-asker` (the spec question
loop — writes both feature specs and page/screen specs incl. role-based view rules) · `deploy` (provision +
deploy to Vercel/Render, create Supabase schema/buckets) · `audit` (web↔iOS parity check for shared
features) · `supabase` (read-only DB inspection; writes → migration file) · `health-check` (periodic
read-only doc-health cross-review; strict, report-only via plan mode). Each living skill keeps a slim
"Converged lessons" section; full run history is in its `LESSONS_ARCHIVE.md`. See `METHODOLOGY.md` for the
"concern → skill" map. (There is no `stitch` skill — we port code directly from the legacy app, not
assemble it from modules.)

**Run sessions rooted HERE (`rasifiters-master/`).** The legacy reference apps in the parent
`../RaSi-Fiters/{rasifiters-webapp, ios-mobile, backend}` stay readable via
`.claude/settings.local.json` `additionalDirectories` (machine-local) or `claude --add-dir ..`.

## Structure

```
ICM.md  METHODOLOGY.md  CLAUDE.md  SETUP.md  ENV_RUNBOOK.md  COVERAGE.md  PROGRESS.md
CONTEXT.md                                   (project: brand + infra + migration source)
apps/<web|ios|backend>/CONTEXT.md
specs/features/REGISTRY.md, registry.json, <feature>/SPEC.md
specs/pages/<web|ios>/<page>/SPEC.md
tools/migrator/                              (temporary Render-PG → Supabase migrator)
```
