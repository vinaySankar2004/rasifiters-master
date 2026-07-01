---
name: deploy
description: Provision + deploy a RaSi Fiters app — the web app to its Vercel project (Vercel CLI) and the backend to its Render web service (Blueprint apps/backend/render.yaml + GitHub auto-deploy) — wire env vars, create the Supabase schema/bucket, apply scope guardrails. The ICM provision+deploy step. LIVING doc — append LESSONS_ARCHIVE.md every run.
---

# Deploy — provision + deploy a RaSi Fiters app (LIVING)

## Trigger
"deploy", "provision", "set up vercel/render for <app>", or standing up the web/backend app.

## Where to run
**From a session rooted at `rasifiters-master/`** — only there do the scoped project MCPs
(`vercel`, `render`, `supabase-rasifiters`) + deny rules load. The repo is standalone; no external
reference directories are needed.

## Prereqs (confirm first — STOP if any fail)
- **Vercel CLI** installed (`vercel --version` → 54.x) + authed (`vercel whoami`). The web app deploys via CLI. **Pin the team with `--scope personal-vinayak` on EVERY vercel command** — the CLI's default active team is often a personal account; never rely on it.
- **Render**: the backend deploys as a **Blueprint** (`apps/backend/render.yaml`, IaC) — NOT a CLI push. The primary path is GitHub-connected auto-deploy (Dashboard → New → Blueprint → pick the repo → Blueprint path `apps/backend/render.yaml`); on the first sync Render prompts for every `sync: false` secret. Alternatives/inspection: the hosted `render` MCP (`https://mcp.render.com/mcp`, OAuth, sees all workspace services), the REST API (`Authorization: Bearer $RENDER_API_KEY`, base `https://api.render.com/v1`), and the optional local `render` CLI. Render injects `PORT` (default `10000`); the app must bind `0.0.0.0` (server.js does).
- **Supabase**: the rasifiters Supabase project `supabase-rasifiters` (ref `kpadxjekpiwfkqcxtrio`). `DATABASE_URL` + the `SUPABASE_*` keys come from the user. Repoint the `supabase-rasifiters` MCP `project_ref` once provisioned.
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
   (per `.env.example`, e.g. `BACKEND_URL` / `NEXT_PUBLIC_API_URL`) to the Render service URL
   (`https://rasifiters-api.onrender.com`).
3. **Domain** drives the Supabase Auth allowed redirect URLs / site URL, the backend CORS allow-list
   (the `cors({ origin: [...] })` list in `server.js`), and any allowed-origin list on Vercel. A bare
   `*.vercel.app` stand-up needs that exact host added to Supabase Auth's redirect allow-list AND to the
   `server.js` CORS list, or the auth redirect / API call bounces.
4. **Env alignment.** Keep any FE↔BE shared secrets byte-identical. NOTE: the scope-guard blocks any one
   command containing both a `vercel`/`render` token AND a sibling project name — extract any predecessor
   values to a temp file in a separate call, then set from the file.

## Monorepo shape — 3 targets from one repo
Each app is a subfolder, so set the **Root Directory** per project/service:
| Target | Source dir | Platform |
|--------|-----------|----------|
| `rasifiters` | `apps/web`     | Vercel (team `personal-vinayak`) |
| `rasifiters-api` | `apps/backend` | Render (Blueprint `apps/backend/render.yaml`, `rootDir: apps/backend`) |
| iOS (`ios`)      | `apps/ios`     | not web-deployed — ships via Xcode/App Store; points at `rasifiters.com` / the Render API |

## Workflow (per app)
1. **Web → Vercel (CLI):**
   - `cd apps/web`
   - `vercel link --scope personal-vinayak` → create/link the project (name `rasifiters`).
   - Set **Root Directory** to this subfolder (project setting or `vercel.json`).
   - Env: for each name in `.env.example`, `vercel env add <NAME> production --scope <team>` (repeat for preview/dev as needed). **Values per §Env discipline.**
   - `vercel deploy --prod --scope <team>` (or rely on git auto-deploy once linked).
   - Build is `next build` (Next.js 14 App Router); record project name + URL in the app's `CONTEXT.md`.
2. **Backend → Render (Blueprint, GitHub auto-deploy):**
   - The service is declared in `apps/backend/render.yaml` (committed) — `type: web`, `runtime: node`,
     `rootDir: apps/backend`, `buildCommand: npm ci`, `startCommand: npm start`, `healthCheckPath: /`,
     `autoDeployTrigger: commit`, and `buildFilter.paths: [apps/backend/**]` so only backend commits deploy.
   - **Provision (one-time, in the Render Dashboard):** New → **Blueprint** → connect the GitHub repo →
     set the Blueprint file to **`apps/backend/render.yaml`** → Apply. Render reads the YAML, creates the
     `rasifiters-api` web service, and **prompts for each `sync: false` secret** (`DATABASE_URL`,
     `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — paste them there (values per §Env discipline; the
     user owns them). Non-secret vars (`SUPABASE_URL`, `MIN_IOS_VERSION`) are baked into the YAML.
   - **After provision, env edits** go in the Dashboard (Service → Environment), bulk **Add from .env**, or
     the REST API: `PUT https://api.render.com/v1/services/{serviceId}/env-vars` (replace-all) /
     single-key upsert, `Authorization: Bearer $RENDER_API_KEY`. The hosted `render` MCP can also
     create/inspect/deploy. Editing the committed `render.yaml` only changes `value:` vars on the next
     sync — it never overwrites `sync: false` secrets.
   - **PORT/host:** Render injects `PORT` (default `10000`); never set it. `server.js` binds
     `process.env.PORT` on `0.0.0.0` — required, or Render can't route to the service.
   - **`npm ci` needs the committed `package-lock.json`** in sync with `package.json` (it is) — else the
     build fails; regenerate the lockfile if you change deps.
   - Record service name (`rasifiters-api`) + the `onrender.com` URL + the Render service ID in `CONTEXT.md`.

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
   these are NOT a Vercel/Render resource and won't exist until the user supplies them.

## Scope guardrail (do once IDs exist)
Write the Vercel project ID + Render service ID into the app's `CONTEXT.md`, then add the
`PreToolUse` hook (in `.claude/hooks/`) that rejects `vercel`/`render` calls targeting anything outside
the rasifiters allow-list. (`supabase-rasifiters` is already URL-scoped.) The hook matches the
whole command string — keep sibling/other-project names out of any single `vercel`/`render` command.

## Confirm before each outward action
Creating a project, setting env, and deploying are **billable + outward-facing** — confirm with
the user before each, same discipline as the scaffold's gh/folder pauses. No direct DB writes
(CLAUDE.md policy) — schema changes via migration files the user runs.

## Git → deploy pipeline runbook (push-to-`main` auto-deploy) — per app

Goal: a `git push` to `main` auto-deploys the changed app. This is a **monorepo**, so EACH target is
scoped to its own subdir **plus a change-filter** — never the bare repo, or every commit redeploys prod.
For the **backend this is the default model** — the Render Blueprint connects the repo at provision time
and `autoDeployTrigger: commit` + `buildFilter` already wire push-to-`main`. For the **web app** this
section converts CLI-deploy → git-deploy. The only manual steps are the GitHub connections (Render
Blueprint / Vercel App), done once per repo in the dashboard; everything else is config-as-code.

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

### B. Backend → Render (Blueprint — auto-deploy is built in at provision)
1. **MANUAL (one-time per repo, in the Render Dashboard): create the Blueprint + connect GitHub.**
   - New → **Blueprint** → authorize the **Render GitHub App** on the **<ORG>** org (All repositories, or
     include `<REPO>`) → pick the repo → set the Blueprint file to **`apps/backend/render.yaml`** → Apply.
     Verify the install at `https://github.com/settings/installations` → Render → Configure.
   - Render reads the YAML and creates `rasifiters-api`; it **prompts for the `sync: false` secrets** on
     this first sync (§Workflow B2 / §Env discipline). This single step both provisions AND wires
     auto-deploy — there is no separate "connect" call afterward.
2. **Auto-deploy is now live — no second action needed.** `autoDeployTrigger: commit` + `buildFilter`
   (`paths: [apps/backend/**]`) mean any push to `main` that touches `apps/backend/**` deploys; commits
   that don't are recorded as a skipped/“no changes” deploy (the expected monorepo skip, NOT a failure).
   - **Trigger a manual deploy** (e.g. after a secret change) from the Dashboard (Manual Deploy → Deploy
     latest commit / Clear build cache & deploy), via the `render` MCP, or
     `POST https://api.render.com/v1/services/{serviceId}/deploys` (`Authorization: Bearer $RENDER_API_KEY`).
   - **Verify the deploy went live:** `GET /v1/services/{serviceId}/deploys?limit=1` shows a NEW deploy id
     with `status: live` — never trust a "deployed" claim without a fresh id. Then `curl <backend>/` → 200.
   - `npm ci` requires the committed `package-lock.json` in sync; the server binds `process.env.PORT` on
     `0.0.0.0` (Render injects `PORT`, default `10000`).

### Result
Push to `main` touching `apps/web/**` → Vercel rebuilds + deploys; touching `apps/backend/**` →
Render rebuilds + deploys; unrelated commits skip both. Manual deploys still work (`vercel deploy --prod
--scope <team>` · Render Dashboard "Manual Deploy" or `POST /v1/services/{id}/deploys`). The only steps
needing a human are the GitHub connections (Render Blueprint + Vercel App), once per repo.

A push whose HEAD commit does **not** touch a project's filter records a skipped deployment (Vercel: a
0-second **Canceled**; Render: a "no changes that affect the deploy" skip) — the expected monorepo skip,
NOT a failure. To verify the links any time: `vercel project inspect <project> --scope <team>` /
`GET https://api.vercel.com/v9/projects/<project>?teamId=<teamId>` → `link.repo` + `link.productionBranch`;
Render → `GET https://api.render.com/v1/services/{serviceId}` (`autoDeploy`, `repo`, `branch`,
`rootDir`, `buildFilter`). Confirm a NEW Render deploy id (`GET …/deploys?limit=1` → `status: live`) — a
git-trigger can silently no-op; trigger a manual deploy to be sure.

## Post-deploy smoke test (run after every deploy, before claiming 🚀)
A 401/404 proves the GUARD fired, not that the FEATURE works — be honest about what's verified.
- [ ] Web renders: anonymous `/` returns the real page (not a white-screen auth error). Public pages
      (`/privacy-policy`, `/support`) return 200.
- [ ] Backend health: `curl <backend>/` → 200 "Rasi Fiters API is running!" (this is `healthCheckPath`).
- [ ] A key proxy works end-to-end (an unauthenticated read that should succeed → 200 with data).
- [ ] Auth gate: a signed-in-only route returns **401** unauthenticated (guard armed).
- [ ] An open/public path returns **200** (the contrast proves it's not just blanket-blocked).
- [ ] A real Supabase-JWT request resolves to a member via `members.auth_user_id` → 200 (signed-in path live).
- [ ] Render actually redeployed: `GET /v1/services/{id}/deploys?limit=1` shows a NEW id with
      `status: live` — never trust a "deployed" claim alone (the git-trigger can silently no-op; trigger a
      manual deploy to be sure).
- [ ] Storage / push / signed-in paths: if NOT exercised, say so + leave the feature 🏗️ with a
      caveat and a dedicated verify pass — don't flip 🚀 on an unverified surface.

## Converged lessons (durable — the patterns that recur, project-agnostic)
- **Render false-green:** a "deployed" claim can reflect the OLD snapshot — always confirm a NEW deploy id
  with `status: live` via `GET /v1/services/{id}/deploys?limit=1`; trigger a manual deploy if the
  git-trigger didn't fire.
- **Render Blueprint provisions AND auto-wires** the git deploy in one step — unlike a bare CLI push, there
  is no separate "connect" call. `buildFilter.paths` are **repo-root-relative** (`apps/backend/**`), NOT
  relative to `rootDir` — a common monorepo footgun that silently deploys on every commit if mis-scoped.
- **Render `sync: false` secrets are dashboard-owned:** the Blueprint prompts for them only at the FIRST
  sync; editing `render.yaml` later never changes them — update them in the Dashboard / REST API. Only
  `value:` vars sync from the YAML.
- **rootDirectory before git-connect (Vercel):** set it via the REST API first, or the first git build runs
  from repo root and fails. The CLI cannot set rootDirectory.
- **Ignored-build-step skips by the PUSH-TIP commit's diff,** not the whole pushed range — the ignore command
  is `git diff --quiet HEAD^ HEAD -- .` (only `HEAD^..HEAD`, scoped to `rootDirectory=apps/web`). So if the
  push TIP is a docs/lessons `chore` with no web diff, Vercel SKIPS the web build even when an earlier commit
  in the same push changed `apps/web` — production silently stays on the prior deployment (confirmed
  2026-07-01: the `git-version`/`ios-build` lesson commits landed after the web feature commit → no build).
  **Prevent:** when a push changes `apps/web`, make an app-touching commit the push tip — i.e. commit the
  `chore(skills)` lessons FIRST or in a separate later push, not as the tip of a web-feature push.
  **Recover (simplest — used 2026-07-01):** `vercel deploy --prod --yes` from the **repo root** (linked
  `.vercel/` there) — the CLI uploads the working tree and force-builds, bypassing the git ignore step
  entirely; ~30s build, aliases `www.rasifiters.com` on READY. (Heavier alternative: PATCH
  `commandForIgnoringBuildStep` → `""`, `vercel redeploy <uid>`, poll READY, PATCH back.)
  **Always confirm** the new production deployment's source commit in the dashboard/`vercel inspect` — a
  stale "Created Nh ago" on an old commit means the auto-build never fired.
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
  Vercel/Render shell just adds an empty project — do Supabase first (unblocks the migrator), stand up
  Render/Vercel when the app actually has code to deploy.
- **Grep the FE for a real Supabase client before provisioning FE auth keys:** the web app talks only to
  the Express `/auth/*` proxy (no `@supabase` dep / no `createClient`), so its Vercel env is just the
  `NEXT_PUBLIC_*` app vars — no anon/JWT keys. The generic "Supabase keys on the FE" step is per-app;
  verify it applies. Silent footgun: omit `NEXT_PUBLIC_API_ENV=prod` and `config.ts` falls back to the
  `127.0.0.1` localBase.
- **Renaming a Vercel project keeps its old `<name>.vercel.app` domain:** PATCH `{"name":…}` does NOT
  re-assign the auto domain — the new `<name>.vercel.app` 404s until you POST it as a project domain
  (`/v10/projects/{id}/domains`) and redeploy `--prod` to alias it. `NEXT_PUBLIC_*` bake at build time, so
  re-set `NEXT_PUBLIC_APP_URL` + redeploy on a rename (a runtime env edit alone won't re-bake the origin).
- **rootDirectory vs CLI-cwd double-nest:** once `rootDirectory=apps/web` is set for git deploys, a manual
  `vercel deploy` must run from the REPO ROOT — deploying from the `apps/web` cwd makes Vercel look for
  `apps/web/apps/web` and fail.
- **zsh doesn't word-split unquoted `$VAR`:** `S="--scope x"; vercel … $S` passes one arg `--scope x` →
  "unknown option". Inline multi-token flags (or use a bash array); don't stuff them in a var under zsh.
- **Verify WHICH project serves a domain after a "transfer":** a DNS transfer points the domain at Vercel,
  but the domain is attached to ONE project — easily the OLD one. `vercel projects ls` shows each project's
  production URL; a net-new route is the cleanest discriminator (200 on the new build, 404 on the legacy).
  A live-looking old app can mask the mismatch (esp. if the old + new backends behave alike). Move the domain
  project→project to cut over.
- **Manual deploy must run from the repo-root link, not `apps/web` and not an unlinked dir:** once
  `rootDirectory=apps/web` is set, `vercel link --project <p>` at the REPO ROOT then `vercel deploy --prod`
  from root is the only correct manual path. From `apps/web` cwd it double-nests; from an UNLINKED root it
  forks a stray project named after the dir. Delete strays via `DELETE /v9/projects/{name}?teamId=…` (CLI
  `project rm` is interactive). Keep the canonical `.vercel` at the repo root.
- **App Router `/favicon.ico` needs the file under `app/`:** `metadata.icons` only emits `<link>` tags — it
  does NOT create `/favicon.ico`, so the browser tab + Vercel card fall back to the generic icon. Ship
  `app/{favicon.ico,icon.png,apple-icon.png}` (they coexist with `metadata.icons`). Verify `/favicon.ico`
  → 200 on the live host.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:**
append the new run to `LESSONS_ARCHIVE.md`; if it reveals a *new* durable pattern, promote a one-liner
into "Converged lessons"; keep this `SKILL.md` lean.
