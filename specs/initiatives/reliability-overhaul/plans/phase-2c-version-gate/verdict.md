# Phase 2 track C — plan-adversary verdict

# PLAN VERDICT — OBJECTIONS (8)

None of the 8 objections is blocking; all are ADVISORY. The code and contract are sound, so the plan can go to the user once these are fixed.

1. **[ADVISORY] The D-C5 "switch on" description is wrong. The SPEC §9 row and the brief both carry it.**
   - Evidence: the gate is mounted before every router, so a header-less okhttp request gets 426 before `authenticateToken` runs. A 401 never happens.
   - `AuthAuthenticator` (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/Network.kt:79-103`) only fires on a 401. So the bare-client refresh at `Network.kt:112-113` never runs, and nobody is signed out.
   - What actually happens: signed-in 1.0.0 users stay signed in. Every call fails with 426. The program picker shows the message via `programContext.loadPrograms().onFailure { errorMessage = it.message ... }` (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/programs/ProgramPickerScreen.kt:107`).
   - Failure scenario: an operator reads D-C5 before turning the switch on and expects a sign-out followed by a login error. In reality users stay signed in and see "Please update…" on each screen.
   - Fix: replace the `Network.kt:113` sign-out evidence with the 426-before-auth path and `ProgramPickerScreen.kt:107`.

2. **[ADVISORY] Step 12 doesn't stop git-version from flagging 13 unrelated features.**
   - Evidence: `server.js` is in `reference_impl.paths` for **14** features in `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`: auth, members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics and app-config.
   - git-version step 2 maps each staged path to every feature that lists it, so it will detect 14 touched features and propose bumps or contract stops for all of them.
   - Fix: step 12 should say that only the app-config block of `server.js` changed. The new `/api`-wide middleware is owned by app-config, so the other 13 features get no bump.

3. **[ADVISORY] The docs never say a changed env var needs a redeploy.**
   - Evidence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/render-env.sh` keeps `set` and `deploy` as separate commands; its usage line is "trigger a deploy (apply env changes)".
   - The ENV_RUNBOOK and SPEC §7 rows only say "set via Render MCP `update_environment_variables`".
   - The `versionGate.js` header ("Env is read per request … no cached copy") suggests changes take effect live. On Render, `process.env` is fixed when the process starts.
   - Failure scenario: an operator sets `BLOCK_UNVERSIONED_ANDROID=true` or raises `MIN_ANDROID_VERSION_CODE` and assumes it is live. Nothing changes until the next deploy.
   - Fix: add "then redeploy (env applies on the next deploy)" to those rows, and reword the code comment.

4. **[ADVISORY] Two §8 bullets in the SPEC go stale, plus one ledger line outside the fence.**
   - Evidence: step 5k edits only lines 107-108, inserts after line 121, and replaces lines 123-124.
   - The §8 D-C3 bullet (lines 117-121) still names `normalizeMinIosVersion`, which no longer exists after this change.
   - The §8 D-C1 bullet (lines 110-113) still says "owns … the `MIN_IOS_VERSION` env … warrants no router/service/model". It is now 5 env vars and a module.
   - Also stale, and outside the fence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/COVERAGE.md:31` still says the route returns `{ min_ios_version }`. Hand that one to the orchestrator.

5. **[ADVISORY] The file count is wrong, and git-version stages from it.**
   - Evidence: the plan says "8 files: 1 new, 7 edited" and step 12 says "Stage only C's 8 files".
   - The brief's fence has **7** files: `versionGate.js`, `server.js`, `.env.example`, `SPEC.md`, `registry.json`, `REGISTRY.md`, `ENV_RUNBOOK.md`.
   - Failure scenario: git-version looks for an 8th file and stages an unrelated parallel-track file. That is the sweep-in the session-scoped rule forbids.

6. **[ADVISORY] The shared-file sequencing names only track A. Track B also edits these files.**
   - Evidence: DESIGN_BOARD §8 says "The staging address is added to the API's CORS list". That is `server.js:31-39`.
   - B also has the auth guard, a staging service and new env vars, which means ENV_RUNBOOK and possibly `.env.example`.
   - Fix: the "C commits before others touch `server.js` / `.env.example` / `ENV_RUNBOOK.md`" rule should cover A **and** B.

7. **[ADVISORY] `X-App-Build` goes beyond the approved board, and the header contract has no single owner.**
   - Evidence: DESIGN_BOARD §1 names exactly two headers, `X-App-Platform` and `X-App-Version`. The plan decides the third one itself under "Decisions" and writes it into D-C6.
   - That extends a user-approved contract, so the user should approve it explicitly at the gate rather than the planner deciding it.
   - D-C6 also puts a cross-cutting, every-request contract in the app-config SPEC while track A (which owns `X-Request-Id`) will document the same headers. That is likely duplication, which a health-check would flag.
   - Fix: name one owning SPEC and have the other link to it.

8. **[ADVISORY] The example threshold values are higher than the next real builds.**
   - Evidence: the `.env.example` comments and ENV_RUNBOOK rows use `MIN_ANDROID_VERSION_CODE=6`, `LATEST_ANDROID_VERSION_CODE=6` and `LATEST_IOS_VERSION=1.5.0`.
   - The repo's next builds are Android versionCode **5** (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/build.gradle.kts:41`) and iOS **1.4.3 (57)** (`project.pbxproj:391`).
   - Failure scenario: an operator copies the example into Render after the Phase 3 build (code 5) ships. That build then blocks itself, or iOS 1.4.3 users are nudged toward a version that doesn't exist.
   - Fix: use 5 and 1.4.3, or `<versionCode>`-style placeholders.

**What I checked with no objection:**
- **Anchors:** every one is accurate: `server.js:8` and `:47-63`, `.env.example:21`, `ENV_RUNBOOK.md:109-110`, `registry.json:343-357`, `REGISTRY.md:26`, and SPEC lines 1-6, 12-14, 20-25, 36-39, 41-51, 62, 66-70, 74, 80-81, 96-102, 107-108, 121, 123-124 and 133-153.
- **Live iOS binaries:** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Services/APIClient.swift:37-47` decodes only `min_ios_version: String?` with the default `JSONDecoder`, so the new keys are ignored.
- **Live prod:** `GET /api/app-config` currently returns `{"min_ios_version":"1.2.0"}` with `cache-control: public, max-age=300`.
- **Live Android binaries:** Android has exactly three OkHttp clients: `Network.kt:32` and `:75`, and `NotificationStreamClient.kt:26`. There are no Coil or other HTTP clients. OkHttp is 4.12.0, the regex matches it, and no client handles 426 anywhere.
- **Other consumers:** web, Android and `tools/` have no `app-config` callers and no okhttp User-Agent.
- **Mount order:** `/` (the health check) is outside `/api`. The app-config route answers before the gate runs. A preflight OPTIONS request is ended by `cors` first.
- **The 426 reply:** `errorHandler.js:5` would drop `code`, so sending the reply directly from the middleware is correct.
- **Boot smoke:** it is read-only against the DB (`sequelize.authenticate()` only, no boot jobs or `sync()`). dotenv won't override env vars that are already set, and `.env.local` does not exist.
- **Size:** `server.js` stays at about 108 lines and the new module is 54.
- **Scope:** no D-rule conflicts with DESIGN_BOARD §0.3, §1 or §12, or with BRIEF §7 row C. No DB surface, no migration needed, and no `depends_on` dependents. MINOR 0.2.0 matches the git-version rules.
