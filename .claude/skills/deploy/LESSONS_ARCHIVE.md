# Deploy — LESSONS ARCHIVE (verbose run-by-run history)

> Full run history, moved out of `SKILL.md` to keep it lean (not auto-loaded into context).
> Durable patterns are distilled in `SKILL.md` → "Converged lessons". Append new runs HERE.

## Lessons log (append every run — the self-learning loop)

### Entry template
- **Run N — <product> <milestone> (YYYY-MM-DD) — <FIRST DEPLOY | REDEPLOY on existing infra> ✅/🏗️**
  - Targets: web → Vercel `<project>` (`<url>`); backend → Render `rasifiters-api` (`<url>`).
  - What the deploy actually needed (env/secrets/schema/bucket/auth): …
  - Gotchas hit + the fix: …
  - Verify done (headless) vs owed (signed-in/storage/push): …
  - Flip call (🚀 full / 🚀 partial + caveat / 🏗️ hold) + why: …
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs

### Run 1 — RaSi Fiters Supabase provisioning (2026-06-28) — PROVISION (no code deploy) ✅
- Targets: **Supabase only.** Created org `RaSi Fiters` (`lxehyprifvuozciizlem`) + project `rasifiters`
  (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY). Railway/Vercel deferred — `apps/web` +
  `apps/backend` are still empty CONTEXT-only shells, so there's nothing to deploy; provisioning their
  shells now would only add empty projects. Correct order = Supabase first (unblocks the migrator, step 3).
- What it needed: a NEW org (user choice) → `supabase orgs create`; a DB password (`openssl rand -hex 24`,
  URL-safe hex); region `us-east-1`. Captured anon/service_role (legacy JWT) **and** the new
  publishable/secret keys, plus 3 DATABASE_URL forms, to a gitignored scratchpad env file for the user's
  password manager.
- Gotchas hit + fix:
  - **`supabase` CLI v2.67 `--region` enum is empty/broken** → every `projects create --region …` errors
    `must be one of [  ]`, and region is required. Fix: upgrade the CLI (`brew upgrade supabase`, needed
    `brew trust supabase/tap` first). v2.108 accepts `us-east-1`.
  - **Org must exist before project create** (`--org-id` is required); the CLI *can* create orgs
    (`supabase orgs create "<name>"`) — no dashboard/billing step needed for a free org.
  - **Pooler host is project-specific:** new projects are NOT on `aws-0-…` (returns `Tenant or user not
    found`); this one is `aws-1-us-east-1.pooler.supabase.com` (`:6543` txn, `:5432` session). Always probe
    with a real `psql select` rather than assuming `aws-0`. Direct host `db.<ref>.supabase.co` resolves
    IPv6 — fine for a local migrator, but a Railway server should use the IPv4 session pooler (`:5432`).
  - **`api-keys -o json` returns a bare list**, not `{"keys":[…]}` (the default/no-`-o` form is the dict).
  - **Transcript-leak care:** building DATABASE_URL strings inline puts the password mid-string where a
    trailing-value mask won't catch it — assemble secrets in a script writing to a 600 file, print only
    lengths/REDACTED.
- Verify done: `psql select` succeeded on direct + session-pooler + txn-pooler; all 4 keys non-empty;
  `.mcp.json` repointed + JSON-valid. Owed: nothing for this step (no app surface deployed).
- Flip call: ✅ provision complete for Supabase; Railway/Vercel intentionally held to their build steps.
- New durable patterns promoted to Converged lessons: Supabase-CLI region-enum/upgrade; org-create-first;
  probe-the-pooler-host (`aws-1`, not `aws-0`).

### Entry — RaSi Fiters backend host swap Railway → Render (2026-06-28) — DOC/IaC CHANGE (no deploy) ✅
- Targets: none deployed this run. Rewrote the skill + repo docs for Render; authored the backend Blueprint.
- Trigger: user chose **Render** over Railway for the API (legacy backend was already a Render service;
  keep the platform, use Render's native Blueprint + GitHub auto-deploy). Railway was never provisioned →
  clean swap, zero migration cost. Recorded as METHODOLOGY R7 (R4 amended in place).
- What changed: `apps/backend/render.yaml` (NEW Blueprint), `server.js` (explicit `0.0.0.0` bind),
  `.mcp.json` (`railway`→`render` MCP `https://mcp.render.com/mcp`), `deploy-scope-guard.sh`, this skill
  (prereqs, workflow §2, git→deploy §B, smoke test, converged lessons, frontmatter), `ENV_RUNBOOK.md`,
  `METHODOLOGY.md`, `ICM.md`, `CLAUDE.md`, `CONTEXT.md`, `SETUP.md`, `README.md`, `apps/{web,backend}/CONTEXT.md`,
  `supabase`+`health-check` skills, auth SPEC changelog, `package.json`.
- Render facts researched + baked in:
  - **Blueprint = IaC**: `render.yaml` with `type: web`, `runtime: node`, `rootDir`, `buildCommand`,
    `startCommand`, `healthCheckPath`, `autoDeployTrigger: commit`, `buildFilter`, `envVars`.
  - **Monorepo**: `rootDir: apps/backend` makes commands relative + limits autodeploy to that subtree;
    `buildFilter.paths` are **repo-root-relative** (`apps/backend/**`), NOT relative to `rootDir` — footgun.
  - **Env model**: `value:` vars live in the YAML; `sync: false` secrets are prompted ONCE at first
    Blueprint sync (dashboard), editable later via dashboard / REST API (`PUT /v1/services/{id}/env-vars`),
    never overwritten by YAML edits. `generateValue: true` = Render's random-secret generator.
  - **PORT/host**: Render injects `PORT` (default 10000); app MUST bind `0.0.0.0`.
  - **Health check**: no `healthCheckPath` → TCP probe; with it → expects 2xx/3xx, gates zero-downtime
    deploys (cancels after 15 min unhealthy). Set it to `/`.
  - **Hosted MCP** exists at `https://mcp.render.com/mcp` (OAuth) — a clean analogue of the railway MCP.
- Verify done: full-repo `grep -i railway` clean except the intentional R7/switch descriptions + historical
  session-log/lessons entries; `.mcp.json` JSON-valid with the render entry; the live Supabase JWKS endpoint
  confirmed serving an ES256/P-256 key (the deploy's asymmetric-key prereq is already satisfied).
- Owed: actual Render provision + deploy + auth smoke-test (needs the user's `SUPABASE_ANON_KEY`).
- New durable patterns promoted to Converged lessons: Render false-green (confirm a NEW deploy id);
  Blueprint provisions AND auto-wires in one step; `buildFilter` is repo-root-relative; `sync:false`
  secrets are dashboard-owned.

### Run 2 — RaSi Fiters web → Vercel (2026-06-29) — FIRST DEPLOY ✅
- Targets: **web → Vercel only.** Project `rasifiters` (`prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u`), team
  `personal-vinayak` (`team_VWBSWxM5pHvWjCraHUWB73v5`), live at `https://rasifiters.vercel.app`. No
  custom-domain switch (staging-ready; `rasifiters.com` left unpointed). Backend already live on Render.
- What the deploy actually needed: **3 env vars, NO secrets, NO Supabase keys.** The web app has no
  `@supabase` dep / no `createClient` — it talks ONLY to the Express backend `/auth/*` proxy. So the whole
  env contract (there's no `.env.example`; `src/lib/config.ts` IS the contract) is the 8 `NEXT_PUBLIC_*`,
  of which only 3 need non-default values: `NEXT_PUBLIC_API_ENV=prod` (else config falls back to
  `127.0.0.1:5001` localBase — the silent footgun), `NEXT_PUBLIC_API_BASE_URL_PROD=…onrender.com/api`,
  `NEXT_PUBLIC_APP_URL=https://rasifiters.vercel.app` (metadataBase/og:url only). The skill's generic
  "Supabase anon/JWT keys on the FE" step is N/A for THIS app — always grep the FE for an actual supabase
  client before provisioning FE auth keys.
- Flow: `vercel link --yes --project … --scope personal-vinayak` (creates) → set the 3 env (Production) →
  `vercel deploy --prod` (built in 48s, 39 routes) → smoke test. Then git auto-deploy: PATCH
  `rootDirectory=apps/web` + `commandForIgnoringBuildStep=git diff --quiet HEAD^ HEAD -- .` via REST →
  `vercel git connect https://github.com/vinaySankar2004/rasifiters-master` → verified `link.repo` +
  `productionBranch=main` + rootDirectory + ignoreCmd.
- Gotchas hit + the fix:
  - **zsh does NOT word-split unquoted `$VAR`** — `S="--scope x"; vercel … $S` passed `--scope x` as ONE
    arg → "unknown option". Inline the flags (or use a bash array); never stuff multi-token flags in a
    var in zsh.
  - **Renaming a Vercel project does NOT swap its auto-assigned `<name>.vercel.app` domain.** PATCH
    `{"name":"rasifiters"}` succeeded but `rasifiters.vercel.app` 404'd while `rasifiters-web.vercel.app`
    stayed the live prod domain. Fix: POST `/v10/projects/{id}/domains {"name":"rasifiters.vercel.app"}`
    then redeploy `--prod` to alias the latest build to it. The old domain persists (harmless).
  - **`NEXT_PUBLIC_*` are inlined at build time** — the prod URL must be known + set in env BEFORE the
    build that bakes it. The stable prod alias is `<project>.vercel.app`, so it's predictable pre-deploy;
    on a rename, re-set `NEXT_PUBLIC_APP_URL` + redeploy (a runtime env edit alone won't re-bake it).
  - **rootDirectory vs CLI-cwd double-nest:** with `rootDirectory=apps/web` set for git deploys, a manual
    `vercel deploy` must run from the REPO ROOT (deploying from `apps/web` cwd would look for
    `apps/web/apps/web`). Recorded in CONTEXT.md.
  - Root `/` is a verbatim Server-Component `redirect("/splash")` → returns a 307 with NO curl-visible
    `Location` (Next RSC encodes the redirect for the client); `/splash` is 200 and browsers land fine.
    Not a deploy defect — don't chase it.
- Verified: `/splash`·`/login`·`/privacy-policy`·`/support` → 200; `/summary`·`/members` unauth → 307 →
  `/login?from=…` (edge decode+expiry guard armed); `og:url` baked to the live origin; Render backend
  `/` → 200. NOT exercised: signed-in web→backend proxy round-trip (no test creds) — backend auth
  round-trip itself was verified live in Phase 2.
- What changed: `apps/web/CONTEXT.md` (Deploy/Stack/Status — IDs + URL + git-deploy + smoke test),
  `deploy-scope-guard.sh` (VERCEL_SCOPE=`personal-vinayak`, allow-list = project `rasifiters`/id),
  this skill's SKILL.md (team-slug + supabase-ref placeholders filled, project renamed `rasifiters-web`→
  `rasifiters`), `PROGRESS.md` (next action → iOS surface).
- New durable patterns promoted to Converged lessons: zsh no-word-split; Vercel rename keeps the old
  `.vercel.app` domain (add the new one + redeploy); grep the FE for a real supabase client before
  provisioning FE auth keys.
