# SCOPE BRIEF: Phase 1b backend hotfixes, H1 (auth stateless proxy plus refresh/JWT error classification) and H3 (analytics membership check)

- **Features**:
  - auth@0.9.0 (SPEC: specs/features/auth/SPEC.md) · consumed_by [web, ios, android] · depends_on [program-memberships] · ref backend `routes/auth.js, services/authService.js, middleware/auth.js`
  - analytics@0.3.2 (SPEC: specs/features/analytics/SPEC.md) · consumed_by [web, ios, android] · ref backend `routes/analytics.js, services/analyticsService.js`
  - analytics-v2@0.1.0 (SPEC: specs/features/analytics-v2/SPEC.md) · consumed_by [web, ios, android] · ref backend `routes/analytics.js, services/analyticsService.js`
  - Suggested bumps, for git-version to decide: auth → 0.10.0 (adds 503 and a `code` field), analytics → 0.4.0 and analytics-v2 → 0.2.0 (new 403; closes §10 F2 in both).
- **Pages/screens**: none are modified. These pages consume analytics and are listed only for verification: web/program, web/lifestyle; ios/admin-summary, summary-*-detail, lifestyle-*; android/summary, summary-*-detail, lifestyle, lifestyle-*.
- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js` — Stop exporting and using the shared `supabaseAuth` (L26, L60). Add a per-request anon client factory whose `global.fetch` has a 5 s `AbortSignal.timeout`. Update the header comment (L4-6). Keep `supabaseAdmin`, `makeEphemeralAuthClient` and `verifySupabaseJwt` as they are (see open question 3).
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js` — Change these call sites:
    - L74 `supabaseSignIn`, L417 `socialSignIn`, L599 `changeEmail` re-auth, L660 `requestPasswordReset`: use a fresh timed client per request.
    - L155-168 `refreshAccessToken`: call the new direct-HTTP helper. The success shape stays byte-identical: `{token, refresh_token, message:'Token refreshed'}`.
    - L270 `exchangeGoogleAuthCode`: add `signal: AbortSignal.timeout(5000)`. The existing catch already maps a failure to 502.
    - L13: update the imports.
    - Do not touch `logout` (L170-187).
  - backend/ — NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/supabaseTokenRefresh.js` (the planner can rename it) — One `POST ${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token` with:
    - headers `apikey` and `Authorization: Bearer <anon>`, plus `X-Supabase-Api-Version: 2024-01-01` as auth-js sends today, so error bodies carry `error_code`;
    - a 5 s timeout and no retry.
    - Error classification: a definitive rejection → 401 `session_invalid`. Supabase 429, 5xx, a network error or a timeout → 503 `auth_unavailable` with Retry-After. This lives in its own module because authService.js is already 729 lines.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/response.js` — Optionally give `AppError` an optional `code` (and `retryAfter`) argument. This is additive: every existing `{error: err.message}` catch is unaffected.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/auth.js` — Change only the `/refresh` catch (L54-63): add `code` to the body and set the `Retry-After` header on 503.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js` — Two changes:
    - In the `authenticateToken` catch (L51-53), return 401 for jose JWT/JWS validation errors (JWTExpired, JWSSignatureVerificationFailed, JWTClaimValidationFailed, JWSInvalid, JWTInvalid, JWKSNoMatchingKey, JOSEAlgNotAllowed) and for the existing "no member" null path. Return 503 `{error, code:'auth_unavailable'}` for `JWKSTimeout`, plain `JOSEError` (ERR_JOSE_GENERIC: JWKS returned non-200 or bad JSON; see jose 5.10.0 `runtime/fetch_jwks.js:27-40`), JWKSInvalid, Node network errors and Sequelize errors.
    - Add the analytics program-access guard (see H3 notes). Alternatively, the guard can live locally in routes/analytics.js.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js` — Attach the guard after `authenticateToken` on all 14 routes: 9 v1 (L13-124) and 5 v2 (L130-183). Do NOT modify `services/analyticsService.js`; member-analytics imports helpers from it.
  - docs (via git-version) — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md` (§3 error contract, §4 middleware table, §9 new D-rule, §11), `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics/SPEC.md` (§3 error contract adds 403, §9 D-C8, §10 F2 becomes "Changed", §11), `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics-v2/SPEC.md` (same, plus the D-REF consumed_by fix), `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/PROGRESS.md`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/HANDOFF.md`.
  - web/ — none. Verified read-only that `apps/web/src/lib/api/summary.ts:106-141` and `lifestyle.ts:59-116` pass the selected program. `apps/web/src/app/programs/page.tsx:332` `canOpen` = global admin OR status null (only possible for a global admin) OR `active`.
  - ios/ — none. Verified read-only: `apps/ios/RaSi-Fiters-App/Shared/Services/APIClient+Analytics.swift` (all 14 routes) is called through `ProgramContext+Analytics.swift`. `Features/Home/ProgramPickerView.swift:349` `canOpen` = global admin OR nil OR `active`. The widget (`RaSi-Fiters-App-Widgets/AddWorkoutWidget.swift`) never calls analytics.
  - android/ — none. Verified read-only: `apps/android/app/src/main/java/com/app/rasifiters/net/ApiService.kt:80-140`. `ui/programs/ProgramPickerScreen.kt:292` `canOpen` = global admin OR `myStatus == "active"`.
  - **Parity result:** no legitimate client call gets a new 403. Invited and requested programs cannot be opened on any surface. Program admins and loggers are active members. A global admin bypasses the check.
- **H3 guard notes (for the planner)**:
  - Copy the "resolve-or-pass-through" pattern from `routes/programWorkouts.js:24-39` and the access rule from `services/memberAnalyticsService.js:6-13 ensureProgramAccess`: global_admin passes; otherwise there must be a `ProgramMembership.findOne({program_id, member_id: req.user.id, status:'active'})`. That is one indexed query per request, so no N+1.
  - If `req.query.programId` is missing, call `next()` so the service still returns today's `400 "programId is required"`.
  - The 403 body must keep the existing `{error}` shape, e.g. "Access denied. Program membership required." (the message used at memberAnalyticsService.js:76).
  - The guard MUST try/catch. The existing `requireProgramMember` (`middleware/auth.js:158-186`) has no catch. On Express 4.22.2, a rejected promise inside async middleware is not caught, and server.js has no `unhandledRejection` handler. A DB error there (for example a non-UUID `programId` hitting the UUID column) becomes an unhandled rejection, which can crash the process on Node ≥15.
- **DB surface**: H1 none. H3 reads `program_memberships` read-only (one indexed lookup). No migration.
- **Flags/env/config involved**:
  - Existing `SUPABASE_URL` and `SUPABASE_ANON_KEY` (render.yaml L40, L67); no new env.
  - Supabase Auth config, read-only context: rotation on, reuse interval 10 s, `rate_limit_token_refresh` 150. H2 is excluded.
  - Pinned `@supabase/auth-js` 2.108.2. The line refs are verified: `_callRefreshToken` L4057-4065 (shared `refreshingDeferred`), `__loadSession` L2431+, `_refreshAccessToken` retryable backoff, `this.lock = null` L141.
  - jose 5.10.0, express 4.22.2.
  - Deploy: Render Blueprint, `autoDeployTrigger: commit` on `main` for `rootDir: apps/backend`. The user confirms the deploy.
- **Blast radius**:
  - auth middleware: every feature with `depends_on` auth (members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, apple-health, health-connect). Their 401 behavior only changes for infrastructure failures (now 503), so none of them needs a new version.
  - analytics: dependents are analytics-v2 and member-analytics. member-analytics is unaffected because analyticsService.js is unchanged.
  - Surfaces to keep in parity: web, ios, android. No client changes in this phase.
- **Live-binary compat**: this changes the backend contract, so it must degrade gracefully for the LIVE iOS and Android binaries (iOS 1.4.2 (56) public, 1.4.3 (57) on TestFlight, with some 1.4.0/1.4.1 installs; Android 1.0.0 (4), possibly (3)), and the backend deploys first (it is the only change).
  - `/refresh` 200 shape stays byte-identical. Android Dtos require a non-null `refresh_token`.
  - Errors stay `{error}` with `code` added.
  - iOS signs out only on 401/403 from refresh, so a 503 protects it.
  - Android 1.0.0 signs out on any non-2xx (accepted, no shim).
  - Web is unchanged and still clears the session on any refresh error, including 503. That is no worse than today's 401.
  - A 503 from `authenticateToken` is safe for all binaries (W1 §8).
- **Doc↔code mismatches found**:
  - auth SPEC §4 middleware table line refs are stale. It says `authenticateToken 4-19` (actual 35-54), `requireProgramAdmin 65-93` (128-156), `requireProgramMember 95-123` (158-186). It says `authenticateStream` is in `routes/notifications.js:11-28`; it is actually in `middleware/auth.js:61-82`.
  - auth SPEC §7 treats `requireProgramMember` and `requireProgramAdmin` as live gates. No route uses either: `routes/programWorkouts.js:24` defines its own local `requireProgramAdmin`.
  - auth SPEC §6 does not list `SUPABASE_ANON_KEY` and says the service-role key powers the "sign-in proxy". The code uses the anon key (`config/supabase.js:26`).
  - analytics-v2 SPEC D-REF says `consumed_by = [web, ios]`; registry.json and the code (Android `ApiService.kt:80,122-140`) say [web, ios, android].
  - Confirmed, no mismatch: the task's line refs (authService L74/158/270/417/599/660; analyticsService L151/L200; GoTrueClient ~L4057-4065).
- **Out of scope (explicitly)**:
  - H2 (Supabase rate-limit change).
  - Logout scope and the logout ephemeral-client body (L170-187).
  - link/unlink `setSession` (L342/L383). This is a known separate issue: if the access token has expired, `setSession` rotates the user's refresh token on the server and the new token is discarded. Not fixed here.
  - `supabaseAdmin`: shared but stateless (admin API, no user session).
  - `authenticateStream` and `/oauth/complete` JWT handling (see open question 4).
  - `Sb-Forwarded-For`, the secret key and `trust proxy` (Phase 3).
  - SQL logging and request logs (Phase 2A).
  - All client changes (Phase 3).
  - `services/analyticsService.js` and member-analytics routes.
  - The console tour in the built-in browser from the user's relayed request. HANDOFF.md lists it as a separate next step; it is not part of this plan.
- **Open questions for the orchestrator**:
  1. **Other refresh 4xx codes.** Some refresh 4xx responses are in neither list, e.g. `validation_failed` (17 in 90 days), `bad_json` or `bad_jwt`. They are not on the definitive list but are not transient either. Recommendation: any 4xx except 429 → 401 `session_invalid`, and only 429, 5xx, network errors and timeouts → 503. Otherwise a malformed token loops on 503 forever.
  2. **Non-refresh calls (login, `/oauth`, `changeEmail` re-auth).** On a timeout, Supabase 429 or 5xx they currently return 401 "Invalid credentials" / "Sign-in failed…". Keep that mapping (minimal; the task only requires the timeouts), or also map those to 503 `auth_unavailable`?
  3. **Where the timeout goes.** Should the timed fetch go into a NEW factory, so `makeEphemeralAuthClient` (logout, link, unlink) stays byte-identical? Or into `makeEphemeralAuthClient` itself? Note: auth-js treats an aborted fetch as retryable on refresh and setSession paths (up to 30 s). Recommendation: a new factory.
  4. **SSE stream.** Should `authenticateStream` get the same 503 classification? The task names only `authenticateToken`. Recommendation: leave it.
  5. **Analytics guard failure cases.**
     - A DB error or non-UUID `programId` returns 500 "Failed to …" today. Inside the guard, choose between 500 via `next(err)` (body "Internal server error.") and 503 `auth_unavailable` to match H1(3).
     - A non-member asking for a nonexistent program will now get 403, where `/summary` returned 404 before. Accept this?
  6. **Reusing `requireProgramMember`.** It is unused today, so it could be changed to pass through when `programId` is missing and to try/catch. Or add a new guard and leave it as is. Either is safe; pick one so the SPEC §4 table stays accurate.
  7. **Local smoke test.** It runs against the live Supabase project via `apps/backend/.env` (per the dev-against-live rule), so it rotates a real session. Use a testbed account other than ava.rivera, who is the store-reviewer demo login.