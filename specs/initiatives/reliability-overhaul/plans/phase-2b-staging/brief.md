# Phase 2 track B — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Reliability overhaul Phase 2 Track B, staging (schema + role, free Render service, Vercel branch alias, client env switches, login-change guard, seeding)

- **Features**:
  - auth@0.10.0 (SPEC: specs/features/auth/SPEC.md) · consumed_by [web, ios, android]. This is where the login-change guard lives.
  - members@0.3.0 (SPEC: specs/features/members/SPEC.md) · consumed_by [web, ios, android]. Only if the guard is placed per-function: `createMember` / `deleteMember` create and delete auth users.
  - program-memberships@0.2.0 (SPEC: specs/features/program-memberships/SPEC.md) · consumed_by [web, ios, android]. Same condition: `createMemberAndEnroll` creates auth users.
  - notifications@0.3.1 · consumed_by [web, ios, android]. Env only (`APNS_PRODUCTION=false` on staging), no code.
  - None of these change behaviour in prod. Every new path is gated behind a staging env var.
- **Pages/screens**: none edited. On staging only, the guard's error appears through the error display that already exists on: web/program/profile, web/program/password, web/reset-password, web/create-account; ios/my-profile, ios/change-password; android/my-profile, android/change-password.

- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - **backend/**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/007_staging_schema.sql` (NEW; the number depends on open question 1).
      - Creates schema `staging` and role `rasifiters_staging` (`LOGIN NOINHERIT`, no password; `ALTER ROLE … SET search_path = staging, extensions`).
      - Grants `USAGE` on `staging` and DML on all its tables, plus `ALTER DEFAULT PRIVILEGES IN SCHEMA staging`.
      - Creates the one-time base tables in `staging` at today's shape (001 + 003 + 005 + 006 merged), all UUID PKs (no sequences).
      - Keeps the FK `members.auth_user_id → auth.users(id)`. The FK check runs as the table owner, so the staging role needs no grant on `auth`.
      - Idempotent. Run by the user. No password in the file.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/stagingGuard.js` (NEW, ~40 lines). Exports `isStaging()` (true only when the env flag is set, e.g. `APP_ENV==="staging"`) and `isStagingEmail()` / `assertStagingAccount(email)`. When the flag is absent, every call is a no-op, so prod is unchanged.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js` — guard points (refuse unless the auth user's email is staging-only):
      - `changePassword` :571. This also covers `/reset-password` and `/change-password`.
      - `setPassword` :403.
      - `changeEmail` :595. Both the current and the new email must be staging-only.
      - `linkProvider` :337 and `unlinkProvider` :376.
      - `deleteAccount` :699.
      - `register` :198. Its `createUser` uses the shared `auth.users`, so a non-staging email would block that real person's prod sign-up.
      - `completeSocialRegistration` :552. Its compensating `deleteUser` could delete a real prod auth user, because a real Google login on staging returns the prod auth user.
      - `requestPasswordReset` :665. Silently skip non-staging emails and keep the same generic 200.
      - `logout` :189. `signOut()` defaults to global scope; staging must force `scope:'local'`.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberService.js`:
      - `createMember` :70 and `deleteMember` :180 (`createUser` / `deleteUser`).
      - Touch this file ONLY if the planner rejects the choke-point option below.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/membershipService.js`:
      - `createMemberAndEnroll` :68/:113 (`createUser` / `deleteUser`).
      - Same condition as `memberService.js`. The board §8 guard list misses this path.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js` — alternative choke point. In staging only, wrap `supabaseAdmin.auth.admin.createUser` (check the email param) and `updateUserById` / `deleteUser` (look up the email with `getUserById`). That one wrapper covers all three services. Planner picks either this or the per-function edits.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js` :30-38 — **SHARED (Track A CORS preflight `maxAge`, A request-log and client-events mount, C app-config block :44-62)**. B's change is only to append env-driven origins (e.g. `CORS_EXTRA_ORIGINS`, comma-separated) to the CORS `origin` array. When the var is unset the list is identical.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md` — document the per-schema run procedure (`psql -c "SET search_path TO staging" -f NNN.sql`, then `public`), the role-password step the user runs in the SQL editor, and the Supavisor username format `rasifiters_staging.<project-ref>`.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md` — staging service, env flag, wake-before-test.
    - **NOT touched by B:** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/database.js`. Track A owns `logging:false`. B picks the schema purely through the role's `search_path` in `DATABASE_URL`. Backend JS never names a schema (grep confirmed: no `public.` in any `.js`).
    - **NOT touched by B:** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/render.yaml`, provided the staging service is created via the MCP (see open question 10). Track C edits this file.
  - **web/**
    - No app code. Staging is reached through Vercel Preview env vars scoped to git branch `staging`:
      - `NEXT_PUBLIC_API_ENV=prod`
      - `NEXT_PUBLIC_API_BASE_URL_PROD=https://rasifiters-api-staging.onrender.com/api`
      - `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` (same value as prod)
      - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/config.ts` already reads exactly these. All 4 existing vars are Production-scoped only, so Preview builds today fall back to `127.0.0.1`.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/CONTEXT.md` — document the staging branch alias and its env.
  - **ios/**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Config/APIConfig.swift`:
      - Add `stagingBaseURL`. Point the `#if DEBUG` branch of `activeBaseURL` (:30-40) at it; today it points at loopback.
      - Release stays `renderBaseURL`.
      - Possible overlap with Track D if the kit puts timeout constants here.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App.xcodeproj/xcshareddata/xcschemes/RaSi-Fiters-App.xcscheme`:
      - Today `LaunchAction buildConfiguration = "Release"` (:34). That is why Xcode Run hits prod and the DEBUG branch is never used.
      - Either flip Run to Debug, or add a sibling `RaSi-Fiters-App-Staging.xcscheme` (open question 8).
      - Debug and Release signing and entitlements are identical in the pbxproj. The only differences are the `DEBUG` flag and `-Onone`. **Do not touch `project.pbxproj`.**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/CONTEXT.md`
  - **android/**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/build.gradle.kts` :47-53:
      - Point the debug `API_BASE_URL` at staging and update the "always live backend" comment.
      - The release block (:69) is unchanged.
      - **Possible overlap with Track D** if the kit adds dependencies.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/CONTEXT.md` :31-34.
  - **tools/ops/docs**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/testbed/seed.mjs`:
      - Add a bootstrap step: when login fails against a non-prod `TESTBED_API_BASE`, `POST /auth/register` with a staging-only email (`<username>+stg@…`) and names derived from the username.
      - Then run the existing `--reset` against staging.
      - The existing 3×3 s cold-start retry is too short for a free-instance wake, so either wake the service first or lengthen the retry.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/testbed/README.md`
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/hooks/deploy-scope-guard.sh` — add the new staging `srv-` id to the allow-list once Render creates it. Until then any Bash `render` command naming it is blocked.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/skills/deploy/SKILL.md` — staging deploy and wake procedure.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md` — a staging section, backend vars (`APP_ENV`, `CORS_EXTRA_ORIGINS`), and the §4 drift fix (see mismatches). **SHARED doc.**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/CONTEXT.md` — staging infra line. **SHARED doc.**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md` — new §9 D-rule for the staging guard plus a MINOR bump. Add the members / program-memberships SPEC only if those services are touched.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json` and `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md` — **SHARED across all tracks; serialize at git-version.**

- **DB surface**: migration needed. One new file in `apps/backend/sql/` (schema `staging` + role + grants + base tables, and possibly `workouts_library` reference rows). The user runs it in the SQL editor, then runs `ALTER ROLE rasifiters_staging WITH PASSWORD …` themselves. `public` tables are read-only to this track. No direct writes by Claude.

- **Flags/env/config involved**:
  - **New backend env, staging service only:**
    - `APP_ENV=staging` (name to confirm)
    - `CORS_EXTRA_ORIGINS=<staging web origin>`
    - `DATABASE_URL` with role `rasifiters_staging.<ref>` on the Supavisor pooler (user pastes)
    - `APNS_PRODUCTION=false`
    - `PASSWORD_RESET_REDIRECT_URL=<staging web>/reset-password`
  - **Same as prod** (secrets pasted by the user): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_*_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET`, `APPLE_SERVICES_ID`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `MIN_IOS_VERSION`, plus Track C's new version-gate vars.
  - **Console actions** (each needs the user's explicit yes; secrets are pasted by the user, never typed by Claude):
    1. **Supabase SQL editor:** the user runs the migration and sets the role password.
    2. **Supabase Auth:** add the staging reset URL to Redirect URLs. supabase.com won't open in the browser pane, so this is an admin-token PATCH to `uri_allow_list`, asked per call.
    3. **Render MCP `create_web_service`:** `rasifiters-api-staging`, plan free, region virginia, rootDir `apps/backend`, `npm ci` / `npm start`, health `/`, branch per open question 5. Then set the env vars above.
    4. **Vercel:** Preview env vars scoped to branch `staging`. Create and push branch `staging` (git push needs the user's OK). The address is the branch alias, expected `rasifiters-git-staging-personal-vinayak.vercel.app`; read the actual alias after the first deploy. The project has `ssoProtection: all_except_custom_domains`, so the alias sits behind Vercel login.
    5. **Google Cloud:** add the staging origin to the Web OAuth client's Authorized JavaScript origins (the web Google popup needs it).
    6. **Seed:** wake the staging API (`GET /`), then run `TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD=… node tools/testbed/seed.mjs --reset` with the bootstrap step.

- **Blast radius**:
  - Dependents of auth (members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, apple-health, health-connect) see **no prod change**. All new paths are gated on the staging env var, so no dependent needs a new version.
  - Surfaces in parity: web/ios/android debug builds all point at staging; all release builds and `rasifiters.com` stay on prod.
  - **Files likely shared with parallel tracks:**
    - `server.js` (A, C)
    - `services/authService.js` and `routes/auth.js` (A may add auth app_events)
    - `config/database.js` (A only; B stays out)
    - `render.yaml` (C; B stays out if the MCP path is chosen)
    - `APIConfig.swift` and `build.gradle.kts` (D, possibly)
    - `registry.json`, `REGISTRY.md`, `ENV_RUNBOOK.md`, `CONTEXT.md` (all tracks)

- **Live-binary compat**: none. No route, response shape or prod env changes. CORS gets an additive origin only when the var is set. Release iOS (Archive = Release config) and the Android release block are untouched. Compatible with iOS App Store 1.4.2 (56), TestFlight 1.4.3 (57) and Android 1.0.0 (4).

- **Doc↔code mismatches found**:
  1. `ENV_RUNBOOK.md` §4 says the web reads `NEXT_PUBLIC_API_BASE_URL` and that `NEXT_PUBLIC_API_ENV` is retired. The code (`apps/web/src/lib/config.ts`) and Vercel actually use `NEXT_PUBLIC_API_ENV` + `NEXT_PUBLIC_API_BASE_URL_PROD` / `_LOCAL`. `apps/web/CONTEXT.md:51` is correct.
  2. iOS "debug tests against the live backend" is not done through a debug build. `APIConfig.activeBaseURL` DEBUG points at loopback (`127.0.0.1` / `192.168.0.100`). Prod is reached only because the shared scheme's Run uses Release (`.xcscheme:34`).
  3. Board §8's guard list leaves out the `createUser` paths (`authService.register`, `memberService.createMember`, `membershipService.createMemberAndEnroll`), `forgot-password`, and that `logout`'s `signOut()` defaults to global scope.
  4. Members SPEC §6 says `deleteMember`'s `deleteUser` happens "when un-deferred", but it is already wired (`memberService.js:180`).
  5. `tools/testbed/seed.mjs:10` and its README cite `apps/backend/CLAUDE.md`, which does not exist.
  6. Board claim "Backend JS never names a schema" is confirmed true.

- **Out of scope (explicitly)**:
  - Track A: request log, SQL logging off, `app_events` / `client-events`, pg_cron, CORS `maxAge`.
  - Track C: `app-config` fields and the unversioned-Android switch.
  - Track D: kits.
  - Phase 3: logout local-scope for prod (B forces local scope only in staging), `exposedHeaders: ["Retry-After"]` (F16), secret API key.
  - Copying any prod user data into staging.
  - A second Supabase project.
  - Paid Render/Vercel features (custom environments, Pro).
  - `tools/render-env.sh` staging support (use the Render MCP instead).
  - Any `project.pbxproj` edit.
  - A staging badge in the UI.

- **Open questions for the orchestrator**:
  1. **Migration number collision.** Tracks A and B both need the next number (007). Assign them, e.g. A=007, B=008.
  2. **A's tables in staging.** Track A's `app_events` table (and its cleanup job) must also exist in `staging`, or staging request/event writes will fail. Either require A's migration to be schema-neutral and re-run it with `search_path=staging` after B's base exists, or have B's base include it if A lands first.
  3. **How to build the staging base.** Two options: a hand-written schema-neutral baseline (001+003+005+006), or `CREATE TABLE staging.x (LIKE public.x INCLUDING ALL)` plus re-declared FKs (LIKE doesn't copy FKs). Either way, the planner should first check prod for drift from the migrations with a read-only `information_schema` query through the Supabase MCP.
  4. **`workouts_library` in staging.** Copy the reference rows from `public` (they are reference data, not personal data), or only run the 004 seed? The seeder works without them (it falls back to custom workouts), but the UI pickers and HealthKit mapping would be thin.
  5. **Branch for the staging API.** Recommended: the Render staging service tracks a `staging` git branch with auto-deploy, so "on demand" means pushing to `staging`. The Vercel staging alias tracks the same branch, which lets code be tested before `main`. The alternative is `main` with manual deploys only.
  6. **Names.** The staging-only email pattern (recommend the `+stg@` local-part tag, so Gmail-delivered reset tests work) and the env flag name (`APP_ENV=staging`).
  7. **Guard design.** Where it lives: a choke point in `config/supabase.js` (covers 3 services; `memberService` and `membershipService` stay untouched) or per-function checks. What it does: refuse the whole request, or skip only the auth-user part. This matters for a staging member linked to a real Google account trying to delete their account.
  8. **iOS switch.** Flip the shared scheme's Run to Debug, or add a second "Staging" shared scheme?
  9. **Vercel login wall.** Keep Vercel Authentication on the staging preview (it puts a login wall in front of iPhone Safari) or turn it off for previews?
  10. **How to create the Render service.** Via the MCP (keeps `render.yaml` out of this fence and avoids clashing with Track C) or as a second Blueprint service?
  11. **Real Google accounts on staging.** A real Google sign-in on staging attaches a staging member to the user's real prod auth user. Brand-new Google users created via staging stay in the shared `auth.users`. Accept both, given the guard blocks every login-level change for them?
