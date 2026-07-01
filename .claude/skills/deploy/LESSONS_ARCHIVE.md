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

### Run 6 — unified "Add workouts" (web + iOS + backend) (2026-07-01) — REDEPLOY on existing infra ✅
- Targets: **web → Vercel `rasifiters`** (`dpl_AdPBg3tbfE3pYx97cd1fJ9P1Duvw`, READY, prod, aliased
  `www.rasifiters.com`; ~31s build). **backend → Render `rasifiters-api`** auto-deploys on the push
  (`apps/backend/services/logService.js` changed); Render MCP had no workspace selected this session so
  status was dashboard-owed, not MCP-verified. iOS ships via Xcode (user); compiled clean via `ios-build`
  run 69.
- What the deploy needed: nothing new — pure code redeploy (merge single+bulk workout-add → one multi-row
  form; backend batch-auth relaxation D-C8). No env/secret/schema/bucket change.
- **Gotcha hit + fix — the ignored-build-step PUSH-TIP skip (already a Converged lesson, now confirmed +
  simplified):** the push ended with two `chore(skills)` lesson commits (no `apps/web` diff) after the web
  feature commit. Vercel's `commandForIgnoringBuildStep` = `git diff --quiet HEAD^ HEAD -- .` diffs ONLY the
  tip commit → skipped the web build; production stayed on the 3h-old deployment (old commit `124bfc2`, user
  screenshot). **Fix:** `vercel deploy --prod --yes` from the **repo root** — force-builds from the working
  tree, bypassing the git ignore step; READY in ~30s, aliased `www.rasifiters.com`. Simpler than the
  previously-documented PATCH-ignore→redeploy→PATCH-back dance.
- Verify done (headless): `next build` locally ✓ + Vercel remote build ✓ (route list confirms
  `/summary/bulk-log-workout` removed, `/summary/log-workout` present). Owed: signed-in visual on `/summary`
  (user) + Render deploy-id confirmation (MCP blocked this session).
- Flip call: 🚀 web live + verified; backend 🏗️ pending user's Render-dashboard glance.
- New durable pattern promoted: enhanced the ignored-build-step Converged lesson with the **prevention**
  (don't end a web-changing push on a docs/skills commit) + the **simplest recovery** (`vercel deploy --prod`
  from repo root).

### Run 5 — splash tap-to-skip (web + iOS) (2026-06-30) — REDEPLOY on existing infra ✅
- Targets: **web → Vercel `rasifiters` only** (`dpl_8915e42Qb4kDDtmtpq5u8SixRM1y`, READY, prod, aliased
  `rasifiters.com`/`www`). Backend **NOT** deployed (no `apps/backend` change — splash makes no API call;
  Render correctly skips). iOS ships via Xcode (user) — compile-checked clean via `ios-build` run 68.
- What the deploy needed: nothing new — a pure client-side code redeploy (tap-to-skip on the splash intro).
  No env/secret/schema/bucket/auth change. Grepped the diff first → only `apps/web/src/app/splash/page.tsx`
  + page specs; zero new infra.
- **Push-tip footgun HIT AGAIN (as documented):** the push tip was `chore(skills): ios-build lessons — run
  68` (no `apps/web` diff), so the git-triggered web build **Canceled** (confirmed via `vercel list`: 26s-old
  deploy, 2s, Canceled). Fix: **manual `vercel deploy --prod --scope personal-vinayak` from the REPO ROOT**
  (canonical `.vercel` there; rootDir `apps/web`). Build READY in one shot, aliased clean.
- Verify done (headless): `rasifiters.com/splash` → **200**; root → 307→www (expected). Headline absent from
  server HTML is EXPECTED — it types char-by-char client-side from `useState("")`, so SSR ships it empty.
  The tap behavior itself is client-JS → owed to the user's manual live test.
- Flip call: 🚀 web live; the tap-to-skip interaction is user-verified in-browser / in-simulator (client-side,
  not headless-checkable).
- New durable pattern promoted: none — reinforces the existing "push-tip docs-chore self-cancels the web
  git-deploy; manual prod deploy from root is the clean one-off fix" lesson (now hit on runs 4 AND 5).

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

### Run 4 — web reset-password client-neutral (native iOS forgot-password) (2026-06-30) — REDEPLOY on existing infra ✅
- Targets: **web → Vercel `rasifiters` only** (`dpl_CaaPzRUfNer5JtgXwCf2o334sPdu`, READY, aliased
  `www.rasifiters.com`). Backend **NOT** deployed (no `apps/backend` change — the iOS native forgot-password
  reuses the existing `POST /auth/forgot-password`; Render correctly skips). iOS ships via Xcode (user).
- What the deploy needed: nothing new — a plain code redeploy (removed the `/reset-password` "Back to login"
  link). No env/secret/schema/bucket/auth change. Verified before provisioning anything: grepped the diff,
  confirmed backend untouched → zero new infra.
- **Push-tip footgun HIT (as documented):** the push to `main` had the `chore(skills): ios-build lessons`
  commit as its TIP, which has NO `apps/web` diff — so Vercel's ignore-build-step
  (`git diff --quiet HEAD^ HEAD -- .`, rootDir `apps/web`) would CANCEL the git-triggered web build even
  though the web change was in the *earlier* commit. Fix used: **manual `vercel deploy --prod --scope
  personal-vinayak --yes` from the REPO ROOT** (the canonical `.vercel` link lives there; rootDir is
  `apps/web`, so deploying from `apps/web` cwd would double-nest). Build 35s, aliased clean.
- Smoke test: `/reset-password` → 200, `grep -c "Back to login"` = **0** (removed), "Set a new password"
  still present; `/forgot-password` → "Back to login" = **1** (kept, web-only entry). Confirmed the served
  HTML reflects the change end-to-end.
- Lesson reinforced: when a session ends on a docs/lessons `chore` commit, the web git-deploy self-cancels —
  either order the app-touching commit as the push tip, or just do the manual prod deploy from root (cleaner
  than the PATCH-ignore-step dance for a one-off).

### Run 3 — RaSi Fiters web: custom-domain cutover + favicon (2026-06-29) — POST-DEPLOY ✅
- Context: user did the DNS "domain transfer" then said the site was live. It wasn't the new app — see below.
- **The domain was attached to the WRONG (old) Vercel project.** `www.rasifiters.com` was on a SEPARATE
  legacy project `rasi-fiters` (hyphen), serving the old Netlify-era build, NOT our `rasifiters` project.
  It *looked* fine ("works, no input entry") because the OLD webapp hits the OLD backend, which we'd just
  write-blocked — so the symptom mimicked the new app. **Always verify WHICH project serves a domain after a
  "transfer"** — `vercel projects ls` shows the production URL per project; a net-new route is the cleanest
  discriminator (here `/forgot-password` + `/reset-password` → 200 on the new build, 404 on the legacy one;
  also `og:url=rasifiters.netlify.app` betrayed the old build). User moved the domain themselves
  (project → project, one Vercel domain can only live on one project); verified the new app then served it.
- **Manual `vercel deploy` from the repo ROOT with NO `.vercel` link creates a STRAY project** named after
  the dir (`rasifiters-master`) instead of redeploying the real one. Because `rootDirectory=apps/web` was set
  (for git deploys), the correct manual path is: link the REPO ROOT to the real project
  (`vercel link --yes --project rasifiters` at root) THEN `vercel deploy --prod` from root → Vercel applies
  `rootDirectory=apps/web` and builds the app. Deploying from `apps/web` cwd double-nests; deploying from an
  unlinked root forks a new project. Cleanup: `DELETE /v9/projects/{name}?teamId=…` (the CLI `project rm` is
  interactive, no `--yes`); removed the now-redundant `apps/web/.vercel` so the root link is canonical.
- **Re-baking `NEXT_PUBLIC_APP_URL`:** swapped vercel.app→`https://rasifiters.com`, redeployed (fresh build,
  not `redeploy` which reuses build output) — confirmed `og:url` flipped. NEXT_PUBLIC_* bake at build time.
- **Favicon/icons were missing → browser tab + Vercel card showed the generic "N".** The foundation port
  copied `public/brand/*.png` but missed the legacy `src/app/{favicon.ico,icon.png,apple-icon.png}` App
  Router icon files, so `/favicon.ico` 404'd. Next App Router serves `/favicon.ico` ONLY if the file exists
  under `app/`; `metadata.icons` adds `<link>` tags but does NOT create `/favicon.ico`. Ported the 3 legacy
  files 1:1 (coexists with `metadata.icons` — legacy shipped both); pushed (apps/web subtree → git
  auto-deploy); verified `/favicon.ico` → 200 `image/x-icon` on the domain.
- What changed: `apps/web/src/app/{favicon.ico,icon.png,apple-icon.png}` (ported); `apps/web/CONTEXT.md`,
  root `CONTEXT.md`, `ICM.md`, `PROGRESS.md` (domain live + APP_URL=rasifiters.com); this archive + SKILL.md
  converged lessons.
- New durable patterns promoted: verify which project serves a domain after a transfer; manual deploy from
  the repo-root link (unlinked root forks a stray project); App Router `/favicon.ico` needs the file under
  `app/` (metadata.icons ≠ favicon.ico).
