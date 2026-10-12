# PLAN VERDICT — OBJECTIONS (8): all ADVISORY, none BLOCKING

1. **[ADVISORY] Other SPECs will still say analytics has no access check.** After H3 these docs will be wrong, and none of them are in the plan:
   - The "inherited F1/F3 — no per-program read authz" rows in 16 page SPECs, matched by grep for "no per-program" / "per-program read authz" / `authenticateToken`-only. That includes `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/web/summary/activity/SPEC.md:10,67,111` and `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/ios/summary-activity-detail/SPEC.md:101`; the other matches are the web `summary/{distribution,workout-types}`, `lifestyle/{timeline,steps-timeline}`, `members/{metrics,history,health,streaks,invite}` pages and the ios `lifestyle-*`, `summary-*-detail`, `my-profile` pages.
   - member-analytics SPEC F1 (L233, "unlike analytics v1/v2, which are authenticateToken-only").
   - The D-S1 "faithful … error contract ported exactly" rows: analytics L223 (lists only D-C2–D-C5) and analytics-v2 L199 ("except D-C2"). D5/D6 add a new 403 but never update these rows.
   - Analytics L14 already undercounts: D-C2…D-C7 is 6 changes, so changing it to "(5" is still wrong.
   - The brief's file list doesn't include these files. Add a follow-up docs-only commit (no bump) or a HANDOFF item. Workspace Standard "Docs".
   - Failure scenario: the next audit or health-check finds two sources contradicting each other.

2. **[ADVISORY] Stale line numbers in D9.**
   - HANDOFF "L86" is actually L116.
   - "Next action item 1 (L132-134)" is actually L162-164.
   - The quoted text is unique, so the steps still work, but the numbers should be fixed.
   - D1 says it fixes the §4 line refs, but auth SPEC L71 keeps a stale `authService.js:223-227` (real location: L155-168).

3. **[ADVISORY] The plan says gaps are recorded as F12–F14, but one isn't.**
   - The Risks section says "`supabaseAdmin` calls still have no explicit timeout … recorded as F12–F14".
   - The F12/F13/F14 rows as written cover SSE + `/oauth/complete`, link/unlink `setSession`, and the login 401 mapping. None of them mentions timeouts on `supabaseAdmin` or on the ephemeral client (logout/link/unlink).
   - DESIGN_BOARD §2 backend contract item 1 says "Every outbound auth call … gets an explicit timeout". Add an F15 row so this gap against the approved board is tracked.

4. **[ADVISORY] The refresh error rules go beyond the approved board, so the user should approve that explicitly.**
   - Board §2 item 2 and the task say 401 "only for a definitive rejection".
   - The plan returns 401 for any 4xx that carries an error code (e.g. `validation_failed`, and 400 `invalid_request` from GoTrue's OAuth-style error).
   - It also adds 408 and 409 to the 503 list.
   - The reasoning holds (otherwise a dead token loops on 503 forever), and it is recorded as D-C11. The approval prompt should name it as a change from the board's wording.

5. **[ADVISORY] The web app can't read the new `Retry-After` header.**
   - D-C11 makes `Retry-After: 5` part of the contract.
   - The web calls the API cross-origin, and `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js:31-39` configures CORS without `exposedHeaders`. Browsers hide `Retry-After` unless it is exposed.
   - Phase 3's web retry logic therefore can't use it. Record this in an F-row or as a Phase 3 prerequisite; `server.js` is outside this brief.

6. **[ADVISORY] A timed-out password-reset request fails silently.**
   - `requestPasswordReset` (authService L655-668) now has a 5 s limit on GoTrue `/recover`, which probably sends the email inside the request (not checked); D-15 moves sending to Resend.
   - auth-js returns `{error}` for a timeout instead of throwing, and the result is thrown away, so a timeout is never logged.
   - Suggest logging `error?.status` / `error?.code` on the server. This leaks nothing to the client.

7. **[ADVISORY] The rewritten §4 middleware table is incomplete.**
   - `canModifyLog` is also not used by any route; only `isAdmin` is (`routes/members.js:34,56`).
   - The new table marks only `requireProgramAdmin` and `requireProgramMember` as "Not mounted".

8. **[ADVISORY] Some JWKS fetch failures still return 401.**
   - jose fetches the JWKS with Node `https.get` (`node_modules/jose/dist/node/cjs/runtime/fetch_jwks.js`).
   - TLS-level failures (`EPROTO`, `CERT_HAS_EXPIRED`, `ERR_TLS_CERT_ALTNAME_INVALID`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) are not in `NETWORK_ERROR_CODES`, so they fall to 401.
   - Failure scenario: the JWKS TLS handshake fails → 401 → iOS refreshes → retries → 401 → `authFailureHandler` signs the user out. Rare.

## What I checked

**Live code.**
- Read `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js`, `services/authService.js`, `routes/auth.js`, `middleware/auth.js`, `routes/analytics.js`, `utils/response.js`, `middleware/errorHandler.js` and `server.js`.
- Every edit anchor matches exactly once:
  - the `authorization_code` block occurs once;
  - there are 14 `authenticateToken, async (req, res) =>` routes;
  - there are two `catch (error)` blocks at L51 and L79;
  - the middleware/auth.js line math (217 lines, 60-83 / 90-111 / 157-185 / 187-215, programId at 166 and 196) is correct;
  - E1 expects the route-handler name `<anonymous>` and the sorted export list; both are correct.

**Consumers.**
- `supabaseAuth` is imported only by authService across `apps/` and `tools/`.
- `refreshAccessToken` is only called from `routes/auth.js`.
- Every `supabaseAdmin` call goes through `.auth.admin` (no user session).
- `requireProgramAdmin`, `requireProgramMember` and `canModifyLog` are not mounted on any route.

**Libraries.**
- Installed versions: express 4.22.2, jose 5.10.0, supabase-js / auth-js 2.108.2.
- jose's JWKS fetch throws only `JWKSTimeout` / generic `JOSEError` for infrastructure failures, and network errors keep their `code`.
- supabase-js passes `global.fetch` to the auth client.
- auth-js's error parsing (`code` in the 2024-01-01 body, else `error_code`) matches `readErrorCode`.

**H3 data scope.**
- Every analyticsService function filters by `program_id`, and `memberId` is always combined with it, so checking the program is enough.
- An array `programId` would bypass the check through a Sequelize `IN`; the plan's guard blocks it.
- `program_memberships` has primary key `(program_id, member_id)` and a lowercase status CHECK constraint.

**Parity (web / iOS / Android).**
- `canOpen` at `apps/web/src/app/programs/page.tsx:332`, `ProgramPickerView.swift:349` and `ProgramPickerScreen.kt:292` only opens active programs (or anything for a global admin).
- Every iOS analytics caller is inside the program home (AdminSummary, WorkoutTypes and Detail views).
- iOS signs out only on a 401 on retry, or a 401/403 from refresh; a 403 on a data call never signs out.
- Android's `Authenticator` only runs on 401, and its JSON parsers use `ignoreUnknownKeys`, so the extra `code` field is safe.
- The web client only refreshes on 401.

**Live binaries.** The refresh 200 shape is unchanged. The W1 §8 rules hold. GoTrue's reuse handling, which hands back the active child token when the parent is re-sent, limits the damage from a 503 after Supabase has already rotated. GoTrue p95 is 24 ms (W6 E7), so 5 s is a safe budget.

**Approved decisions.** DESIGN_BOARD §2 and D-1/D-3, BRIEF §7 and the auth / analytics / analytics-v2 §9 sections. The next free IDs D-C11, D-C8, D-C3 and F12 are all unused. Tag format and MINOR rules are per the `git-version` SKILL.

**Smoke test and deploy.**
- The testbed roster in `tools/testbed/seed.mjs` matches the fixtures: mason.w is admin of Spring, a member of Summer and not in Winter; zoe.chen is in Winter.
- `/programs` returns a plain array with `my_status` and `my_role`.
- `.env.local` does not exist, and inline env vars win over `.env`.
- `connectDB` only runs `authenticate`, with no schema sync.
- Prod `SUPABASE_URL` has no trailing slash, and the JWKS/issuer overrides are unset.
- The service ID, buildFilter and health check in render.yaml match the plan.