# rasifiters-master — Claude Code Project Rules

The ICM repo for **RaSi Fiters** — one app, three surfaces (`web`, `ios`, `backend`), documented as
specs and ported faithfully from the original app (now archived). Markdown is the source of truth; Claude
Code (with Vercel / Render / Supabase MCPs) is the operator. Read **`PROGRESS.md`** (current state) and
**`ICM.md`** (L1 map) first.

Methodology (the "why" + decision log + feature-spec contract) lives in-repo at `METHODOLOGY.md`; all
operational how-to lives in `.claude/skills/`. Current state + open follow-ups: `ICM.md` ("How to operate
here").

## The mission (faithful rebuild — complete, now standalone)

RaSi Fiters was rebuilt **1:1** — same features, same behavior — on a new stack (Supabase DB + Auth,
Render API, Vercel web) from the original app. That rebuild is complete and **this repo stands alone**:
the app code under `apps/` is the source of truth, and the legacy app it was ported from is **archived and
no longer tracked here**. Default stance for any remaining or future work stays **faithful-as-is** —
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

Auth = **Supabase Auth** with the **Express backend as the auth-facing API** — it proxies Supabase Auth
and **verifies Supabase-issued JWTs**, mapping `sub` → a member via `members.auth_user_id`. Full rationale
and the migration details (preserved `members.id` UUIDs, bcrypt-hash password import, username→email
resolution, authorization stays in Express — no RLS) are the single source of truth in **`METHODOLOGY.md` R1**.

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

## MCP Servers (see `.mcp.json`)

- **vercel** — `https://mcp.vercel.com` (account-level OAuth; all projects in the team).
- **render** — `https://mcp.render.com/mcp` (account/workspace-level OAuth; all services). The backend
  deploys as a Blueprint (`apps/backend/render.yaml`); this MCP is the create/inspect/deploy path.
- **supabase-rasifiters** — read-only, scoped to the rasifiters project (`project_ref` in
  `CONTEXT.md` §Infrastructure).
- **xcode** — local **stdio** bridge (`xcrun mcpbridge`, Apple-native, Xcode 26.3+). The iOS build-check
  path: builds the **open** `apps/ios` project + returns structured compiler diagnostics. Requires Xcode
  running with the project open and **Settings → Intelligence → "Allow external agents to use Xcode tools"**
  enabled. Native-only by choice — we do NOT add the community XcodeBuildMCP (~80 tools, simulator control
  we don't want, heavy token cost). The user runs the simulator/visual checks; the MCP is for compile only.
  See the `ios-build` skill.

The three HTTP servers are OAuth-based remote MCPs — **no secrets in `.mcp.json`**; first use triggers a
one-time browser login per server. `xcode` is local (no auth, no network).

**Use ONLY these project MCP servers in this workspace** (the three OAuth servers + the local `xcode`
bridge). The claude.ai-managed connectors (`claude.ai Supabase`, `claude.ai Vercel`, `claude.ai Google
Drive`) and `n8n` are **denied** in `.claude/settings.json` — they grant broad account-level access and
bypass our scoping.

**Scope guardrail.** Vercel + Render OAuth grant access to *all* account projects/services. The
`deploy-scope-guard.sh` PreToolUse hook restricts `vercel`/`render` commands to the rasifiters
allow-list. When the `deploy` skill provisions the Vercel project + Render service, record their IDs in
the product `CONTEXT.md` and fill the allow-list/scope in the hook.

## Skills (`.claude/skills/`)

`git-version` (this repo's git skill; ICM commit + version pipeline) · `question-asker` (the spec question
loop — writes both feature specs and page/screen specs incl. role-based view rules) · `deploy` (provision +
deploy to Vercel/Render, create Supabase schema/buckets) · `audit` (web↔iOS parity check for shared
features) · `supabase` (read-only DB inspection; writes → migration file) · `health-check` (periodic
read-only doc-health cross-review; strict, report-only via plan mode) · `ios-build` (the iOS compile-check
loop via the native `xcode` MCP — build `apps/ios`, read structured diagnostics, fix, repeat; NO
screenshots/simulator, the user runs those). Each living skill keeps a slim
"Converged lessons" section; full run history is in its `LESSONS_ARCHIVE.md`. See `METHODOLOGY.md` for the
"concern → skill" map. (There is no `stitch` skill — code was ported directly from the legacy app, not
assembled from modules.)

**Run sessions rooted HERE (`rasifiters-master/`).** The legacy apps are archived and no longer
referenced by this repo — no external directories need to be added.

## Structure

```
ICM.md  METHODOLOGY.md  CLAUDE.md  ENV_RUNBOOK.md  COVERAGE.md  PROGRESS.md
PROGRESS_ARCHIVE.md                          (condensed run history, one line per run; not auto-loaded)
CONTEXT.md                                   (project: brand + infra + migration source)
apps/<web|ios|backend>/CONTEXT.md
specs/features/REGISTRY.md, registry.json, <feature>/SPEC.md
specs/pages/<web|ios>/<page>/SPEC.md
```
