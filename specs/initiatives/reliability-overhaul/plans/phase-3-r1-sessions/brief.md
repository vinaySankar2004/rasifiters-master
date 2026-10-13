# Phase 3 track R1 — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Reliability Phase 3, track R1 (sessions/auth backend)

- **Features**:
  - auth@0.12.1 (SPEC: specs/features/auth/SPEC.md) · consumed_by [web, ios, android] · depends_on [program-memberships] · ref_impl backend `routes/auth.js, services/authService.js, middleware/auth.js, config/supabase.js, services/supabaseTokenRefresh.js, utils/stagingGuard.js, …` · **proposed bump: 0.13.0 MINOR** (additive plus board-approved deliberate changes; precedent D-C11 = MINOR). Likely new D-C14, plus D-C15 if the logout and error items are split.
  - observability@0.1.1 (SPEC: specs/features/observability/SPEC.md) · consumed_by [] · depends_on [auth] · owns `middleware/errorHandler.js` · **proposed bump: 0.2.0 MINOR**, because F2 changes the malformed-JSON status on every route from 500 to 400.
  - frontend-kit@0.1.0 (SPEC: specs/features/frontend-kit/SPEC.md): read only. Its vocabulary already covers this track: status decides the kind, 400 → invalidInput, 503/429 → unavailable. No change.
  - notifications@0.3.1 (SPEC: specs/features/notifications/SPEC.md): touched only if R1 owns the SPEC text for F12 (stream 503). See open questions.
- **Pages/screens**: none touched in this track. Future consumers (the bundled client release) are the account-settings screens for "sign out everywhere" and the password change: web/program/password, web/program/profile, ios/change-password, ios/my-profile, android/change-password, android/my-profile (specs/pages/<surface>/<slug>/SPEC.md).
- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js
    - (a) Pick the key: `SUPABASE_SECRET_KEY` if set, else `SUPABASE_ANON_KEY`. Applies to `makeRequestAuthClient` (:54-55) and `makeEphemeralAuthClient` (:46).
    - Both factories take the caller IP and add it through `global.headers['Sb-Forwarded-For']`, only when the secret key is present. auth-js merges these headers into every auth request (supabase-js `dist/index.cjs:1404-1407`).
    - Export one header builder for the direct-fetch module.
    - F15: `global.fetch: timedFetch` on `supabaseAdmin` (:41) and on the ephemeral client.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/supabaseTokenRefresh.js
    - (a) The direct `/token` fetch (:43-53) uses the secret key plus `Sb-Forwarded-For`. Recommended simplest path for every user-session call: direct fetch, no SDK.
    - Add the sibling direct call `POST /auth/v1/logout?scope=local|others|global` with the user's JWT as Bearer.
    - Export the `authUnavailable()` / classifier for reuse by F14 and F12.
    - The file is 80 lines, so there is room.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js
    - Thread `ip` through every call.
    - (b) `logout` (:182-201): scope local everywhere. Drop the `isStaging()` branch at :194, and the extra refresh rotation if a Bearer is used.
    - `changePassword` (:578-593): after `updateUserById`, revoke scope `others` using the caller's access token.
    - (d) F14: classify `supabaseSignIn` (:83-89), `socialSignIn` (:434-446) and the `changeEmail` re-auth (:615-619). A 429, 5xx, or auth-js `AuthRetryableFetchError`/status 0 (our 5 s timeout) becomes 503 `auth_unavailable`.
    - F13: `linkProvider` (:357-376) and `unlinkProvider` (:400-404) stop using `setSession` / `_useSession`. They call GoTrue directly with the verified Bearer: `POST /token?grant_type=id_token` with `link_identity:true`, and `DELETE /user/identities/{id}`.
    - F15: classify admin-call timeouts. `register` currently maps any `createErr` to 400 "Email already exists" (:227-229).
    - **The file is 759 lines.** Put net-new code in the new file below, not here.
    - **Do NOT touch `upsertPushToken` / `removePushToken` (:94-125); R3 territory.**
  - backend/ — NEW /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authSessionService.js (name is the planner's call)
    - logout (local), logoutEverywhere (global, plus `assertStagingAccount` on staging per board §8), and revokeOtherSessions. This keeps authService.js from growing.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/auth.js (259 lines)
    - Pass `req.ip` to the services.
    - New authenticated route for "sign out everywhere" (e.g. `POST /logout-all`).
    - Pass the Bearer into `/change-password` (:224-233) and `/reset-password` (:213-222).
    - One local `sendAuthError(res, err)` that echoes `code` and sets `Retry-After` for every AppError. Today only `/refresh` does (:59-66).
    - F12 for `/oauth/complete` (:121-126 verify catch, plus `getUserById` infra failures in `completeSocialRegistration` :520-521) returns 503 instead of 401.
    - F8: the 16 `console.error("…", err)` catch blocks (:16, 32, 67, 78, 89, 107, 136, 149, 164, 179, 189, 202, 219, 230, 243, 254).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js
    - F12: `authenticateStream`'s catch (:113-115) reuses `isVerifyInfraFailure` + `sendAuthUnavailable` (:50-63).
    - Export both for `/oauth/complete`.
    - **Shared with R3.** Keep edits minimal.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/errorHandler.js
    - F2: body-parser errors (string `err.type` + numeric `err.status`) return a 4xx in the kit vocabulary, mirroring `routes/clientEvents.js:42-48`:
      - 400 `{error:"Invalid request body.", code:"invalid_body"}`
      - 413 `payload_too_large`
      - 415 `invalid_body`
    - F8: the non-body branch (:18) logs name/code/message only.
    - **Shared, and observability-owned.**
  - backend/ — NEW /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/logError.js
    - F8 one-liner other tracks reuse, e.g. `logError(tag, err)` → `console.error("%s %s %s %s", tag, err?.name, err?.parent?.code || err?.code || "", err?.message)`. Never the error object, `err.sql` or `err.parameters`.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example — add a `SUPABASE_SECRET_KEY=` line (docs only).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/render.yaml — append a `SUPABASE_SECRET_KEY` entry with `sync: false` (docs only; already set on both services). Append-only.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md
    - §3 gets the full client contract:
      - `/logout` scope, and whether it accepts a Bearer
      - the new route
      - `/change-password` and `/reset-password` side effects
      - 503 `auth_unavailable` + `Retry-After` on login, `/oauth`, `/oauth/complete`, `PUT /email`
      - `refresh_token` on link/unlink becomes optional
      - the error envelope `{error, code?}`
    - §4: middleware table (stream 503).
    - §6: env.
    - §9: D-C14.
    - §10: F12–F15 resolved, plus any new flags.
    - §11: changelog 0.13.0.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md
    - F2 and F8 resolved; the `logError` pattern; D-C9 updated.
    - §8: register the `auth.*` event types/reasons (e.g. `auth.forced_sign_out` with `props.reason`).
    - Changelog 0.2.0.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json and /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md — auth 0.13.0, observability 0.2.0. Own rows only. Add `utils/response.js` and the new files to auth `reference_impl.paths`.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md
    - §3: the `SUPABASE_SECRET_KEY` row (:107) changes from "No code reads it yet" to read by the backend.
    - New subsection for Supabase Auth settings: `security_sb_forwarded_for_enabled`, `sessions_inactivity_timeout`, and the H2 `rate_limit_token_refresh` = 1,500 (today recorded only in HANDOFF.md:17).
    - §Staging: auth test notes.
  - web/ — none (client release planned separately against the auth SPEC contract).
  - ios/ — none.
  - android/ — none.
- **DB surface**: none. No migration, so 011 is not needed. If server-side auth events are approved (open question 3), `app_events` already allows `source='server'` (`sql/007_app_events.sql:35`) and still needs no migration.
- **Flags/env/config involved**:
  - **Env**
    - `SUPABASE_SECRET_KEY` (sb_secret_…, set on prod and staging Render, D-4). Absent → anon key, no forwarded header, today's behavior.
    - `SUPABASE_ANON_KEY` stays as the fallback. `SUPABASE_SERVICE_ROLE_KEY` stays for `supabaseAdmin` (admin endpoints aren't IP rate-limited, and `register` uses `admin.createUser`, not `/signup`).
    - `APP_ENV=staging`: logoutEverywhere must call `assertStagingAccount`.
    - `trust proxy` = 2 (`server.js:39`) makes `req.ip` the client IP. The planner decides whether to normalize IPv4-mapped `::ffff:` addresses.
  - **Supabase settings** (live, read 2026-10-12 via read-only token):

    | Setting | Today | Target |
    |---|---|---|
    | `security_sb_forwarded_for_enabled` | false | true |
    | `sessions_inactivity_timeout` | 0 | 90 days (unit to confirm) |
    | `rate_limit_token_refresh` | 1500 | unchanged |
    | `security_refresh_token_reuse_interval` | 10 | unchanged |

    Both changes are user-approved admin-token steps (token-guard asks):
    `PATCH https://api.supabase.com/v1/projects/kpadxjekpiwfkqcxtrio/config/auth`, header `Authorization: Bearer $SUPABASE_ADMIN_TOKEN`, body `{"security_sb_forwarded_for_enabled":true}`, and separately `{"sessions_inactivity_timeout":<90 d in API unit>}`.
  - **Order:**
    1. Backend on staging (opt-in, +stg accounts, wake the free instance first): login, refresh, logout-local with 2 devices, change-password signs out the other device, sign-out-everywhere, link/unlink with a +stg account and a test Google account.
    2. Backend to prod. User-run prod smoke: malformed JSON → 400, login/refresh/logout.
    3. Flip forwarded-for. Auth settings are shared by staging and prod.
    4. Set the inactivity timeout.
  - The build is gated on the Phase 1b watch ending clean on 2026-10-19 (HANDOFF.md:11-12, 56-63).
- **Blast radius**:
  - **Dependents of auth** (use the auth middleware; behavior unchanged): members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, observability, apple-health, health-connect.
  - **Direct behavior reach**
    - F15 `supabaseAdmin` timeout also hits `services/memberService.js:70,106,180` (members) and `services/membershipService.js:68,113` (program-memberships). No file edits there, but a timed-out `createUser` may still have created the user (orphan) and is currently mis-mapped.
    - F2 changes malformed-JSON responses on every route.
    - F12 changes notifications `GET /stream`.
  - **Surfaces in parity later**: web, ios, android (all in auth `consumed_by`).
  - **Cross-track risks**
    - `middleware/auth.js`: R3 SSE / unauthenticated unregister.
    - `middleware/errorHandler.js`: all tracks.
    - `services/authService.js`: R3's device registry may change `upsertPushToken`; R1 must stay out of those functions.
    - New `utils/logError.js`: R2/R3 should import it, not redefine it, so its signature must be fixed in the R1 plan.
    - `utils/response.js`: only if a shared `sendAppError` is chosen; the recommendation is to keep it local in `routes/auth.js`.
    - `render.yaml`, `.env.example`, `ENV_RUNBOOK.md`, `registry.json`, `REGISTRY.md`: append/own-rows only.
    - `server.js` and `models/index.js`: R1 needs **no** edits.
- **Live-binary compat**: backend contract changes are additive and safe for every RELEASES.md binary (iOS 1.4.0–1.4.2(56), 1.4.3(57) TF; Android 1.0.0 (3)/(4)). Backend deploys first.
  - `/refresh` 200 shape is unchanged.
  - `/logout` response is ignored by all clients. iOS sends the body only (`APIClient+Auth.swift:197-209`). Android sends Bearer + body (`ProgramContext.kt:326-336`). Web never calls it.
  - **503 on login, `/oauth`, `/oauth/complete`, `PUT /email`:**
    - iOS: `APIClient.swift:53-93` refreshes only on 401; non-2xx becomes `APIError(message)`.
    - Android: `AuthAuthenticator` fires on 401 only (`Network.kt:68-103`); 503 becomes `ApiException` (`ApiException.kt:17-31`).
    - Web: `client.ts:51` refreshes on 401 only.
    - Strictly safer than today's 401.
  - **Stream 503:**
    - iOS `NotificationStreamClient.swift` ignores the status.
    - Android's stream uses its own OkHttpClient with no authenticator, and failures are swallowed (`NotificationStreamClient.kt`).
    - Web `EventSource` closes on any non-200, same as 401 (`NotificationsGate.tsx:154-171`).
  - **Password change revoking others:** other live devices get `401 session_invalid` on their next refresh and sign out. This is intended.
- **Doc↔code mismatches found**:
  1. auth §10 F13 says rotation happens only "with an expired access token". In fact auth-js `_useSession` refreshes within **90 s** of expiry (`EXPIRY_MARGIN_MS`, GoTrueClient.js:2459/4001), which `linkIdentityIdToken` (:3800) and `unlinkIdentity` (:3871) go through. `_setSession` (:2949) refreshes only when the token has already expired, and `authenticateToken` already rejects expired tokens. F13 also says the token dies "after the 10 s reuse window", but W1 E6 shows a token one rotation old is accepted. Restate F13 precisely.
  2. observability D-C9 / §5 / §7 say R1 writes `source='server'` auth events; this task's (f) scopes R1 to confirm-only.
  3. ENV_RUNBOOK.md:107 says "No code reads it yet". No runbook section records the Supabase Auth settings.
  4. notifications SPEC :95/:118 say the stream returns "401 on missing/invalid"; this becomes 503 on infrastructure failure.
  5. `authService.js` is 759 lines and `routes/auth.js` is 259, against the ~200-line standard.
  6. specs/pages/REGISTRY.md:142 says android change-password uses `POST /auth/change-password`. Both code and backend use PUT (`ApiService.kt:262`, `routes/auth.js:224`).
  7. registry.json auth `reference_impl.paths` omits `utils/response.js` (D-C11 `code`/`retryAfter`).
- **Out of scope (explicitly)**:
  - All client code: sessions contract, sign-out UI, event senders.
  - R2 sync / migration 009. R3 invites, push, devices, SSE reconnect / migration 010, and push-token functions in authService.
  - `server.js`. The version-gate switch. HANDOFF.md / BRIEF.md, which the orchestrator owns.
  - Refactoring authService beyond moving the touched logic.
  - Any direct DB or settings change by the implementer.
- **Open questions for the orchestrator**:
  1. **Inactivity timeout may need Pro.** Supabase documents session inactivity timeout / timebox as a Pro-plan feature. The read-only token can't see the org plan (`GET /v1/organizations/lxehyprifvuozciizlem` → 403). Also confirm the API unit (hours → 2160?). If the project is on Free, D-5 can't be applied and must be recorded as deferred.
  2. **Secret key in the Bearer header.** Confirm GoTrue accepts an `sb_secret_…` key as both `apikey` and `Authorization: Bearer` (supabase-js sends both) on `/token`, `/recover` and `/logout`. Prove it on staging before prod. A bad key would make every login return 401 "Invalid credentials".
  3. Are server-side auth events (refresh failure + Supabase code, `source='server'`) in R1 or deferred? Either way, update observability D-C9.
  4. Which password paths revoke other sessions? Recommendation:
     - `/change-password`: yes
     - `/reset-password` (shares `changePassword`): yes
     - `/set-password`: no
     - If the revoke step fails after the password changed: still 200, and log it?
  5. Sign out everywhere: route name; scope `global`; and should it also delete all of the member's `member_push_tokens`? That is R3's device-registry boundary.
  6. `/logout` with a Bearer present (Android sends one): use it directly to avoid an extra rotation, falling back to the refresh-token exchange?
  7. F15 budgets: admin writes (`createUser`, `updateUserById`) can succeed server-side after we time out. Use a longer budget and 503 classification? `/recover` sends the email inside the request under the 5 s cap.
  8. Pre-existing bug, outside F14: a 401 on authenticated credential routes means the wrong password, not a dead session. This applies to `PUT /email` "Current password is incorrect." and `/link`/`/unlink` 401s. Live iOS treats it as an expired session: it refreshes, retries, gets 401 and calls `authFailureHandler`, which signs the user out (`APIClient.swift:66-80`). Live Android refreshes on that 401 (`Network.kt:79-103`). Remapping these to 400/403 is safe for every binary. Include it in R1?
  9. F14: should the `/oauth` Google code-exchange failure (502 "Could not reach Google.", `authService.js:296-297`) become 503 `auth_unavailable`?
  10. Who edits the notifications SPEC for F12, R1 or R3?
  11. The user asked to "start phase 3", but HANDOFF gates the build on a clean watch on 10-19. Is that gate unchanged (plan now, build after 10-19)?
