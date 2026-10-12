# Phase 2 track B — plan-adversary verdict

# PLAN VERDICT — OBJECTIONS (8), all ADVISORY, none blocking

1. **[ADVISORY] The step-22 expected output for the staging `createUser` check is wrong, and the check can hang.**
   - Evidence: in the plan's `guardAdminAuth`, `console.log("[staging] APP_ENV=staging — login-change guard active")` runs when `config/supabase.js` is required. That puts three lines on stdout, not the two the plan says ("`refused 403` then `passed guard`").
   - Evidence: the `+stg` case makes a real call to `example.supabase.co`. `supabaseAdmin` has no fetch timeout (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js:38`).
   - Failure: the implementer sees 3 lines and reports a false failure, or the check stalls inside a sandbox.
   - Fix: expect the banner line first (or pipe through `tail -2`) and wrap the command in `timeout 20`.

2. **[ADVISORY] There is no local boot test before C3a, so the new boot path first runs on the prod deploy.**
   - Evidence: `node --check` only checks syntax. It cannot catch a runtime require or destructuring error in the new `require("./utils/stagingGuard")` or in `assertDatabaseSchema()` inside `startServer`.
   - Evidence: track C already has a boot-smoke script that uses the local `.env` (`specs/initiatives/reliability-overhaul/plans/phase-2c-version-gate/plan.md:345-349`).
   - Failure: C3a's prod deploy fails its health check. Render keeps the old build, but tracks A, C and D's changes in the same push are held back with it.
   - Fix: run C's `boot-smoke.sh` from `apps/backend` twice:
     - `APP_ENV` unset → expect `Server running`.
     - `APP_ENV=staging` → expect exit 1 with `database schema is "public"`.

3. **[ADVISORY] Two approved-text departures need their own yes/no in the approval prompt.** Approving the plan should not silently cover them.
   - (a) The prod-side boot check adds a boot-time query and a new way for prod to exit. The task says "prod behaviour must not change at all when the staging env vars are absent." Simple option: make the not-staging branch log with `console.error` instead of throwing.
   - (b) The `workouts_library` copy contradicts board §8, "Schema only, no copy of prod data."
   - Both are announced in D-C12, so neither is blocking.

4. **[ADVISORY] The plan misses shared files with track D.**
   - Evidence: track D's brief (`plans/phase-2d-frontend-kits/brief.md:34`) edits `apps/web/CONTEXT.md`, `apps/ios/CONTEXT.md` and `apps/android/CONTEXT.md`. B edits all three.
   - Evidence: B's "shared" list instead names `APIConfig.swift` and `build.gradle.kts`, which D's brief (`brief.md:36-39`) explicitly hands to B and promises not to touch.
   - Failure: there is no interactive staging, so B's explicit `git add` of those CONTEXT files pulls D's uncommitted hunks into B's commit 1, or the other way round.
   - Fix: serialize these three files at git-version.

5. **[ADVISORY] Track C's plan and B's plan contradict each other about `render.yaml`.**
   - Evidence: C's plan (`phase-2c plan.md:300`, `:418`) writes into the app-config SPEC F4 row that "track B adds the staging service there."
   - Evidence: B's Q10 decision never touches `render.yaml`.
   - Failure: a committed SPEC ends up stating something false.
   - Fix: the orchestrator rewrites C's F4 wording.

6. **[ADVISORY] The CORS env var name needs agreement with track A.**
   - Evidence: I listed the live prod Render env keys (read-only, keys only). There are 17, and none is `CORS_ALLOWED_ORIGINS`.
   - Evidence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md:110` says that var is "Externalized to env… Set on Render (live)". In fact `server.js:30-38` hard-codes the list.
   - Failure: if A fixes that drift by moving the list into `CORS_ALLOWED_ORIGINS`, B's `CORS_EXTRA_ORIGINS` becomes a second, overlapping origin variable. B's text anchor (`"https://www.rasifiters.com"\n    ],`) also disappears.
   - Fix: tell A now. Either A keeps the hard-coded array, or A adopts B's variable.

7. **[ADVISORY] The README's step-4 psql form can silently run a migration against `public`.**
   - The command is `psql … -c "SET search_path TO staging" -f NNN.sql`.
   - Evidence: the Supabase pooler config read-only API reports `pool_mode = transaction`. On port 6543 a session-level `SET` does not carry over between statements.
   - Failure: a schema-neutral migration runs on `public` twice and never on `staging`.
   - Fix: add "session pooler (:5432) or direct connection only — never 6543" to step 4.

8. **[ADVISORY] Two smaller gaps.**
   - (a) Staging has no global_admin, and the API cannot create one. `isAdmin` gates `POST` and `DELETE /members` (`routes/members.js:34,56`) and workout-library CRUD. D-C12's staging behaviour for `POST /members` and member delete therefore can't be tested. Record this as a known gap: a staging-only follow-up migration would be needed.
   - (b) The P0 drift query lists every `pg_proc` in `public` without excluding functions that belong to extensions. Any extension installed in `public` would produce a false STOP. That failure is safe, but the fix is cheap: add `AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`.

**What I checked and found sound:**
- **Login-change guard covers every path:**
  - The backend has exactly 3 `createUser`, 4 `updateUserById` and 6 `deleteUser` call sites. Every `deleteUser` is a best-effort `try/catch` (`authService.js:255,552,723`, `memberService.js:106,180`, `membershipService.js:113`). Nothing else mutates auth.
  - In auth-js 2.108.2 the admin methods live on the prototype, and `supabaseAdmin.auth.admin` is a stable object (checked live). So the wrapper works, and the "prints 0" prod check is valid.
  - Every route maps `AppError.statusCode`, so a refusal reaches the client as a 403.
  - No client treats a non-refresh 403 as a logout: iOS only on the refresh path (`APIClient.swift:159-161`), Android and web only on 401.
  - The email checks in all three clients accept `+`.
- **Schema `staging`:**
  - Backend JS has no `public.`, schema option, extension call or privileged SQL.
  - `008` matches 001 + 003 + 005 + 006 constraint for constraint and index for index.
- **Anchors:** every text anchor in `server.js`, `config/supabase.js`, `authService.js`, `seed.mjs` and its README, the hook, the gradle file, the xcscheme (line 34), all CONTEXT files, ENV_RUNBOOK §3-§6, sql/README, and the auth, members and program-memberships SPECs is verified.
- **Staging Render env:** C6 covers all 17 prod env keys. The prod service is rootDir `apps/backend`, starter plan, virginia, health check `/`.
- **Vercel:** 4 production-only, sensitive env vars. The ignore step is `VERCEL_GIT_PREVIOUS_SHA`-based with a fallback that builds. SSO is `all_except_custom_domains`. The repo root is linked to the project.
- **Supabase Auth:** `uri_allow_list = https://rasifiters.com/**`, the recovery email uses `{{ .ConfirmationURL }}`, and network restrictions are open.
- **iOS:** there is a single `#if DEBUG`. `APIClient` and `NotificationStreamClient` both read `activeBaseURL`. The widget makes no network calls.
- **Android:** `BuildConfig.API_BASE_URL` has one consumer (`AppContainer.kt:22,28`).
- **git-version mapping:** `server.js` appears in 14 features' `reference_impl` paths; `config/supabase.js` and `authService.js` map to auth only.
- **Live binaries:** iOS 1.4.2 (56), TestFlight 1.4.3 (57) and Android 1.0.0 (4) are unaffected.
