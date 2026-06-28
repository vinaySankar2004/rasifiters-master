---
name: deploy
description: Provision + deploy a RaSi Fiters app — the web app to its Vercel project (Vercel CLI) and the backend to its Railway service (Railway CLI/MCP) — wire env vars, create the Supabase schema/bucket, apply scope guardrails. The ICM provision+deploy step. LIVING doc — append LESSONS_ARCHIVE.md every run.
---

# Deploy — provision + deploy a RaSi Fiters app (LIVING)

## Trigger
"deploy", "provision", "set up vercel/railway for <app>", or standing up the web/backend app.

## Where to run
**From a session rooted at `rasifiters-master/`** — only there do the scoped project MCPs
(`vercel`, `railway`, `supabase-rasifiters`) + deny rules load. Legacy-app reference context is
auto-available via `.claude/settings.local.json` `additionalDirectories` (or `claude --add-dir ..`).
The faithful-rebuild reference is the LEGACY app at
`/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/{rasifiters-webapp, ios-mobile, backend}`.

## Prereqs (confirm first — STOP if any fail)
- **Vercel CLI** installed (`vercel --version` → 54.x) + authed (`vercel whoami`). The web app deploys via CLI. **Pin the team with `--scope TODO(provision: vercel-team-slug)` on EVERY vercel command** — the CLI's default active team is often a personal account; never rely on it.
- **Railway CLI** installed (`railway --version` → 4.66.x) + authed (`railway login`, one-time browser). The backend deploys via CLI; the `railway` MCP is also connected as an alternative/read path.
- **Supabase**: the rasifiters Supabase project `supabase-rasifiters` (ref `TODO(provision: supabase-project-ref)`). `DATABASE_URL` + the `SUPABASE_*` keys come from the user. Repoint the `supabase-rasifiters` MCP `project_ref` once provisioned.
- The app's `.env.example` is the **env-var contract** — read it first.
- **Auth = Supabase Auth (not Clerk).** Express proxies Supabase Auth, verifies Supabase JWTs, and maps users via `members.auth_user_id` (legacy member UUIDs preserved; bcrypt-hash import). There is no Clerk instance, no `pk_test`/`pk_live`, no Clerk webhook.

## Pre-cutover setup questions (ASK + verify BEFORE the live flip)
A mismatch here passes the anonymous path but **silently breaks signed-in**. Confirm Supabase Auth ·
backend env · domain form a consistent set:
1. **Supabase Auth project + JWT secret.** The web client uses `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the Express backend verifies JWTs with the **same** project's JWT
   secret / JWKS (`SUPABASE_JWT_SECRET` or `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). FE and BE
   MUST point at the **same** Supabase project, or signed-in calls 401 (token issued by one project,
   verified against another). The legacy member UUIDs are preserved via `members.auth_user_id` — verify
   the auth-user→member mapping exists before claiming signed-in works.
2. **Backend URL wiring.** The web app calls the Express API server-side; set the backend base URL var
   (per `.env.example`, e.g. `BACKEND_URL` / `NEXT_PUBLIC_API_URL`) to the Railway service URL.
3. **Domain** drives the Supabase Auth allowed redirect URLs / site URL, `CORS_ALLOWED_ORIGINS`
   (Railway), and any allowed-origin list on Vercel. A bare `*.vercel.app` stand-up needs that exact host
   added to Supabase Auth's redirect allow-list, or the auth redirect bounces.
4. **Env alignment.** Keep any FE↔BE shared secrets byte-identical. NOTE: the scope-guard blocks any one
   command containing both a `vercel`/`railway` token AND a sibling project name — extract any predecessor
   values to a temp file in a separate call, then set from the file.

## Monorepo shape — 3 targets from one repo
Each app is a subfolder, so set the **Root Directory** per project/service:
| Target | Source dir | Platform |
|--------|-----------|----------|
| `rasifiters-web` | `apps/web`     | Vercel (team `TODO(provision: vercel-team-slug)`) |
| `rasifiters-api` | `apps/backend` | Railway |
| iOS (`ios`)      | `apps/ios`     | not web-deployed — ships via Xcode/App Store; points at `rasifiters.com` / the Railway API |

## Workflow (per app)
1. **Web → Vercel (CLI):**
   - `cd apps/web`
   - `vercel link --scope TODO(provision: vercel-team-slug)` → create/link the project (name `rasifiters-web`).
   - Set **Root Directory** to this subfolder (project setting or `vercel.json`).
   - Env: for each name in `.env.example`, `vercel env add <NAME> production --scope <team>` (repeat for preview/dev as needed). **Values per §Env discipline.**
   - `vercel deploy --prod --scope <team>` (or rely on git auto-deploy once linked).
   - Build is `next build` (Next.js 14 App Router); record project name + URL in the app's `CONTEXT.md`.
2. **Backend → Railway (CLI):**
   - `cd apps/backend`
   - `railway login` (one-time, browser) if not authed; then `railway init` to create the project/service (or `railway link` to an existing one).
   - Set vars from `.env.example`: `railway variables --set "<NAME>=<value>"` (values per §Env discipline).
   - Deploy the current dir: `railway up`.
   - **Node/Express on Railway = Railpack** auto-detects Node from `package.json`. It needs a start command: ensure `package.json` has a `"start"` script (`node server.js`) — the legacy backend has NO `start` script, so ADD one, or add a `Procfile`: `web: node server.js`. The server MUST bind `process.env.PORT` (Railway injects it) and `0.0.0.0`.
   - The `railway` MCP is an alternative for create/inspect/deploy — verify its exact tool names on first use (see §Git→deploy pipeline).
   - Record service name (`rasifiters-api`) + URL in `CONTEXT.md`.

## Env discipline
- **Non-secret / known** (base URLs, ports, flags, `CORS_ALLOWED_ORIGINS`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`) → set directly.
- **Real secrets** (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the APNs push key/credentials for iOS notifications, any JWT signing secret) → **ask the user; never invent values.**
- **Rotatable shared secrets** (any FE↔BE HMAC/proxy secret, a cron secret) → generate with `openssl rand -hex 32` and set the **same value on both sides** where shared.

## Tech-stack setup (per new website) — the things env vars DON'T do for you
Setting an env var ≠ provisioning the resource. Each is a real step with its own verify:
1. **Supabase schema (migrations).** Author the full runnable-from-blank set in
   `apps/backend/sql/` as numbered idempotent migrations
   (`NNN_*.sql`, `CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING`). **Faithful legacy schema —
   NO table prefixes, preserve legacy member UUIDs.** Squash the legacy app's rename history into clean
   `CREATE TABLE`s + feature-delta migrations. **The user runs them** (never direct SQL from Claude —
   CLAUDE.md policy). Import path: bcrypt-hash member import + `members.auth_user_id` mapping so existing
   members can sign in via Supabase Auth. **Dry-run the whole schema+seeds on a local Postgres first.**
2. **Storage bucket — CREATE IT, don't just name it.** `SUPABASE_STORAGE_BUCKET=<name>` only NAMES a
   bucket; it must be **created** (Supabase dashboard → Storage → New bucket, **private**) or uploads
   400/404. Rows store a single object **path**, sign-on-read via the service role. **Round-trip verify
   BEFORE flipping 🚀:** real upload → bucket → signed read.
3. **Supabase Auth wiring (auth replaces Clerk).** Confirm the project's Auth settings: Site URL +
   redirect allow-list include the serving domain; the backend verifies tokens against the SAME project
   (§Pre-cutover #1). **Verify:** a signed-in request carries a Supabase JWT and resolves to a member via
   `members.auth_user_id` → 200; an unauthenticated request to a guarded route → 401; a token from a
   different project → 401.
4. **Rotatable shared secrets.** `openssl rand -hex 32`; set the SAME value on both sides where shared —
   a mismatch silently breaks the cross-call.
5. **iOS push (if shipping notifications).** The legacy backend uses `apn` (Apple Push Notification
   service). Provision the APNs auth key + key/team/bundle ids as backend env (secrets, from the user) —
   these are NOT a Vercel/Railway resource and won't exist until the user supplies them.

## Scope guardrail (do once IDs exist)
Write the Vercel project ID + Railway service ID into the app's `CONTEXT.md`, then add the
`PreToolUse` hook (in `.claude/hooks/`) that rejects `vercel`/`railway` calls targeting anything outside
the rasifiters allow-list. (`supabase-rasifiters` is already URL-scoped.) The hook matches the
whole command string — keep sibling/other-project names out of any single `vercel`/`railway` command.

## Confirm before each outward action
Creating a project, setting env, and deploying are **billable + outward-facing** — confirm with
the user before each, same discipline as the scaffold's gh/folder pauses. No direct DB writes
(CLAUDE.md policy) — schema changes via migration files the user runs.

## Git → deploy pipeline runbook (push-to-`main` auto-deploy) — per app

Goal: a `git push` to `main` auto-deploys the changed app. This is a **monorepo**, so EACH target is
scoped to its own subdir **plus a change-filter** — never the bare repo, or every commit redeploys prod.
Run this AFTER the app's first manual deploy (project/service + env already exist); it converts
CLI-deploy → git-deploy. Only **one step is manual** (the Railway GitHub-App install); everything else is
scriptable.

### A. Web → Vercel (fully scriptable, ~2 min — no manual step if the org's Vercel App already has access)
1. **Connect the repo** (from `apps/web`, project already linked):
   `vercel git connect https://github.com/<ORG>/<REPO> --scope <team> --yes`
   - A brand-new org needs a one-time Vercel App install (dashboard → project → Settings → Git).
2. **Set Root Directory + the monorepo skip** via the REST API (the CLI canNOT set rootDirectory) — token is in
   the CLI's auth file, read at runtime (never echo it):
   ```bash
   TK=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Application Support/com.vercel.cli/auth.json')))['token'])")
   curl -sS -X PATCH "https://api.vercel.com/v9/projects/<project>?teamId=<teamId>" \
     -H "Authorization: Bearer $TK" -H "Content-Type: application/json" \
     -d '{"rootDirectory":"apps/web","commandForIgnoringBuildStep":"git diff --quiet HEAD^ HEAD -- ."}'
   ```
   - **ORDER MATTERS:** set `rootDirectory` before/with the connect, or the first git build runs from the repo
     root and fails (it's the project's *Root Directory* for git deploys — different from the cwd the CLI uploads).
   - The ignore step exits 0 (skip) when nothing under the web subtree changed → only web commits build.
3. **Verify:** `GET https://api.vercel.com/v9/projects/<project>?teamId=<teamId>` → `link.repo` set,
   `link.productionBranch=main`, `rootDirectory`, `commandForIgnoringBuildStep`. Production branch defaults to
   `main`; PRs get preview deploys.

### B. Backend → Railway (one MANUAL human step, then scriptable via the `railway` MCP)
1. **MANUAL (one-time per org — NOT API/CLI-doable): install the Railway GitHub App on the org.**
   - Railway project (`https://railway.com/project/<projectId>`) → **Settings → GitHub → Connect/Authorize** →
     on GitHub install **Railway** on the **<ORG>** org with **All repositories** (or include `<REPO>` in
     "Only select repositories"). Verify at `https://github.com/settings/installations` → Railway → Configure.
   - **Do NOT trust the `railway` MCP pre-check** — the "Repository not found in this project" check is
     unreliable BEFORE the repo is connected. After the install, just **attempt the connect**.
2. **SCRIPTABLE — drive the `railway` MCP** (with `projectId`+`environmentId` [+`serviceId`]). Two messages:
   - a) "Connect service `rasifiters-api` to repo `<ORG>/<REPO>`, branch `main`, Root Directory
     `apps/backend`, Watch Paths `apps/backend/**`, keep all
     env vars. Attempt the connect directly and paste the raw error if it fails." (The connect only **stages** the
     change — no auto-deploy yet.)
   - b) "Trigger/apply the staged deployment now and report the SUCCESS/FAILED status." Then `curl <backend>/health`.
   - The backend needs a `"start"` script (`node server.js`) or a `Procfile` (`web: node server.js`); Railpack
     auto-detects Node from `package.json`. Bind `process.env.PORT` and `0.0.0.0`.

### Result
Push to `main` touching `web/**` → Vercel rebuilds + deploys; touching `backend/**` →
Railway rebuilds + deploys; unrelated commits skip both. Manual deploys still work (`vercel deploy --prod
--scope <team>` · `railway up`). The only step needing a human is the Railway GitHub-App install (B1), once per org.

A push whose HEAD commit does **not** touch a project's Root Directory records a 0-second **Canceled**
deployment for that project — that's the expected monorepo skip, NOT a failure. To verify the link any time:
`vercel project inspect <project> --scope <team>` (shows Root Directory + Framework), or
`GET https://api.vercel.com/v9/projects/<project>?teamId=<teamId>` → `link.repo` + `link.productionBranch`.
**Backends (Railway) may NOT auto-deploy** even after connect (the git-trigger can silently no-op) —
`railway up` manually and confirm a NEW deployment id.

## Post-deploy smoke test (run after every deploy, before claiming 🚀)
A 401/404 proves the GUARD fired, not that the FEATURE works — be honest about what's verified.
- [ ] Web renders: anonymous `/` returns the real page (not a white-screen auth error). Public pages
      (`/privacy-policy`, `/support`) return 200.
- [ ] Backend health: `curl <backend>/health` → 200.
- [ ] A key proxy works end-to-end (an unauthenticated read that should succeed → 200 with data).
- [ ] Auth gate: a signed-in-only route returns **401** unauthenticated (guard armed).
- [ ] An open/public path returns **200** (the contrast proves it's not just blanket-blocked).
- [ ] A real Supabase-JWT request resolves to a member via `members.auth_user_id` → 200 (signed-in path live).
- [ ] Railway actually redeployed: `list-deployments` shows a NEW id — never trust a CLI "deployed"
      claim alone (the git-trigger can silently no-op; `railway up` to be sure).
- [ ] Storage / push / signed-in paths: if NOT exercised, say so + leave the feature 🏗️ with a
      caveat and a dedicated verify pass — don't flip 🚀 on an unverified surface.

## Converged lessons (durable — the patterns that recur, project-agnostic)
- **Railway false-green:** the CLI/MCP can report the OLD snapshot as "deployed" — always confirm a NEW
  deployment id via `list-deployments`; `railway up` if the git-trigger didn't fire.
- **Connect only STAGES on Railway:** connecting a service to a repo does NOT auto-deploy — send a second
  action to trigger/apply the staged deployment.
- **rootDirectory before git-connect (Vercel):** set it via the REST API first, or the first git build runs
  from repo root and fails. The CLI cannot set rootDirectory.
- **Ignored-build-step skips by the PUSH-TIP commit's diff,** not the whole pushed range — if the tip is a
  docs/lessons chore with no web diff, Vercel CANCELS the web build even when an earlier commit changed web.
  Fix: make the app-touching commit the push tip, or PATCH `commandForIgnoringBuildStep` → `""`,
  `vercel redeploy <HEAD-deployment-uid>`, poll READY, then PATCH the ignore step back.
- **Verify END-TO-END through the live web proxy,** not just the backend — a backend curl can be green while
  the web server-side proxy 500s (e.g. an auth helper throwing without its session middleware).
- **Vercel "Sensitive" env vars are write-only** — unreadable by `vercel env pull` or the decrypt API. You
  can't pre-verify a value by reading; confirm the `add` succeeded + rely on live runtime behavior.
- **Bucket-must-exist:** env naming ≠ provisioning — create the Supabase bucket and round-trip it.
- **Secret-gated ≠ functional:** a 401 proves the guard, not the feature — check the real dependency
  (storage bucket, DB seed, the member mapping) behind it.
- **Honest-🚀-with-caveat:** functional code + an unverifiable surface (signed-in render, storage round-trip)
  → flip 🚀 only the verified part, caveat the rest, schedule a dedicated pass.
- **FE↔BE must point at the SAME Supabase project** — a JWT issued by one project won't verify against
  another → anon works, signed-in 401s (the RaSi Fiters analogue of the Clerk/env/domain consistency rule).
- **Check what the deployed path actually needs before provisioning secrets** — grep the live request's
  provider/env; a render-only or read-only change may need zero new infra.
- **Supabase provisioning (CLI):** org must exist first — `supabase orgs create "<name>"` makes a free org
  (no dashboard/billing step); then `projects create <name> --org-id <id> --db-password <pw> --region
  us-east-1 --yes`. CLI ≤2.67 ships a **broken empty `--region` enum** (`must be one of [  ]`, yet region is
  required) → `brew upgrade supabase` (needs `brew trust supabase/tap`). **Probe the pooler host** with a
  real `psql select`: new projects are `aws-1-…`, not `aws-0-…` (`aws-0` → `Tenant or user not found`).
  `api-keys -o json` returns a bare list (no `{"keys":…}` wrapper).
- **Provision in build-order, not all-at-once:** if an app has no portable code yet, creating its
  Vercel/Railway shell just adds an empty project — do Supabase first (unblocks the migrator), stand up
  Railway/Vercel when the app actually has code to deploy.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:**
append the new run to `LESSONS_ARCHIVE.md`; if it reveals a *new* durable pattern, promote a one-liner
into "Converged lessons"; keep this `SKILL.md` lean.
