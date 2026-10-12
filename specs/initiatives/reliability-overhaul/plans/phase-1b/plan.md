# PLAN: Phase 1b backend hotfixes. H1 makes the auth proxy stateless and classifies refresh/JWT failures (D-1). H3 adds a membership check to the analytics routes (D-3).

**Brief accepted**: yes (14 files: 7 backend code files, one of them new; 7 docs).
**Feature/version prediction**: three MINOR bumps (owned interface changes, pre-1.0, backward-compatible for every legitimate caller):
- `auth` v0.9.0 → v0.10.0: `/refresh` gains a 503 and a `code` field; `authenticateToken` returns 503 on infrastructure failures; `reference_impl` paths are added.
- `analytics` v0.3.2 → v0.4.0: a new 403 gate; closes F2.
- `analytics-v2` v0.1.0 → v0.2.0: the same gate, plus the `consumed_by` doc fix.

**Surfaces in scope**: [backend] only. Web, iOS and Android need no changes (checked read-only, see below). Docs edits are made by the orchestrator inside git-version. The two file sets do not overlap.

**Execution order**: B1–B7 (implementer) → E1 compile → E2 local smoke → E3 no migration → E4 git-version (D1–D9, two commits) → E5 deploy (user confirms) → E6 prod smoke → E7 docs commit → E8 7-day log watch.

## Decisions resolved (brief's open questions)
- **Q1 (other 4xx on refresh).**
  - **401 `session_invalid`** for any non-transient 4xx that carries an auth error code. This covers the definitive codes plus things like `validation_failed`. A 503 here would make the client retry a token that can never work, forever.
  - **503 `auth_unavailable`** for:
    - 408, 409 (concurrent refresh), 429 and 5xx;
    - a 4xx with no auth error code (a gateway response);
    - `bad_jwt` / `no_authorization` (our API key is wrong, not the user's token);
    - a network error, a timeout, or a 2xx without tokens.
  - This is wider than the task's "ONLY definitive codes". It is recorded as auth D-C11.
- **Q2.** Login, `/oauth` and the re-auth keep their current 401 mappings. They only gain timeouts. Recorded as F14 (Phase 3).
- **Q3.** Add a new factory `makeRequestAuthClient`. `makeEphemeralAuthClient` stays byte-identical, so logout/link/unlink are unchanged and are never put through a timed fetch (auth-js would replay an aborted setSession/refresh for 30 s).
- **Q4.** `authenticateStream` and `/oauth/complete` are left alone. Recorded as F12.
- **Q5.**
  - A DB error in the guard goes to `next(err)` → `errorHandler` → `500 {"error":"Internal server error."}`. This matches the guard pattern in `programWorkouts.js`.
  - A non-member asking about a nonexistent program gets 403. This is accepted: member-analytics `getMemberMetrics` also checks access before its 404, and it avoids revealing whether a program exists.
- **Q6.** Add a new local guard `requireProgramAccess` in `routes/analytics.js`. `requireProgramMember` is left untouched; the auth SPEC §4 records that it (and `requireProgramAdmin`) is not used by any route.
- **Q7.** Smoke tests use `mason.w` and `zoe.chen`, never `ava.rivera`.
- **Added.** A non-string `programId` (for example a repeated query param, which arrives as an array) gets 403 from non-admins. Otherwise the services would aggregate every listed program, bypassing the gate.

## Steps — backend (implementer; touch ONLY these 7 files)

1. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/response.js`**: replace the whole file with:
```js
// AppError — an operational error with an HTTP status. `options` is additive (auth SPEC D-C11): `code` is a
// machine-readable reason a route may echo as `{ error, code }`; `retryAfter` (seconds) a route may send as a
// Retry-After header. Only routes that opt in read them (today: POST /auth/refresh). Without options nothing
// changes — every existing `{ error: err.message }` catch keeps working.
class AppError extends Error {
    constructor(statusCode, message, options = {}) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        if (options.code) this.code = options.code;
        if (options.retryAfter) this.retryAfter = options.retryAfter;
    }
}

module.exports = { AppError };
```

2. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js`**: replace the whole file with the code below. It removes `supabaseAuth` and adds `makeRequestAuthClient` plus two budget constants. `supabaseAdmin`, `makeEphemeralAuthClient` and `verifySupabaseJwt` are verbatim.
```js
// Supabase clients + JWT verification — the R1 auth migration plumbing.
// See specs/features/auth/SPEC.md §6/§7 + METHODOLOGY R1.
//
// NO module-level client ever holds a USER session (auth SPEC D-C11 — reliability-overhaul D-1). On a server,
// auth-js runs lock-less, so a shared anon client could hand one user's in-flight refresh to another caller,
// refresh its last stored session (someone else's) first, and silently replay a refresh token for up to 30 s.
//   • makeRequestAuthClient()   — a FRESH anon client per request for the proxied public flows
//                                 (signInWithPassword, signInWithIdToken, resetPasswordForEmail); every
//                                 fetch it makes times out after AUTH_HTTP_TIMEOUT_MS.
//   • makeEphemeralAuthClient() — a throwaway anon client bound to ONE user session (logout, link, unlink).
//   • supabaseAdmin             — service-role key; admin ops (createUser / updateUserById / deleteUser /
//                                 getUserById). Holds no user session, so it stays shared.
//   • POST /auth/refresh uses no client: services/supabaseTokenRefresh.js calls the token endpoint directly.
// Plus verifySupabaseJwt(): verify a Supabase-issued access token via the project's JWKS (D-C2 —
// asymmetric ES256 keys), returning the decoded payload (its `sub` = auth.users.id).
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// D-C11 budgets: every outbound auth call the proxy makes (Supabase Auth, Google's token endpoint) gives up
// after 5 s; a 503 auth_unavailable tells the client to retry after AUTH_RETRY_AFTER_SECONDS.
const AUTH_HTTP_TIMEOUT_MS = 5000;
const AUTH_RETRY_AFTER_SECONDS = 5;

// flowType "implicit" is REQUIRED for the password-recovery path (auth SPEC D-C5): the backend calls
// resetPasswordForEmail, but an arbitrary browser (the user's, at /reset-password) completes the flow —
// PKCE would store the code verifier on the initiating client (here, server-side, persistSession:false),
// so the user's browser could never exchange it. Implicit makes the email link land with the session in
// the URL fragment (#access_token=...&type=recovery), consumable by any browser + forwarded through
// Express. Implicit is already supabase-js's default; pinned explicitly to survive a future default flip.
// (No effect on signInWithPassword / refreshSession — flowType governs only the code-exchange flows.)
const serverClientOptions = {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" }
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serverClientOptions);

// A throwaway anon client bound to a single user session — used by logout to revoke one session
// (set the session from the supplied refresh token, then sign out).
const makeEphemeralAuthClient = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, serverClientOptions);

// fetch with the D-C11 timeout. A caller-supplied signal (auth-js passes none today) is kept as-is.
const timedFetch = (input, init = {}) =>
    fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(AUTH_HTTP_TIMEOUT_MS) });

// A FRESH anon client per request (D-C11): its in-memory session dies with the request, so no other caller
// can ever read, refresh or inherit it. Same auth options as above (implicit flow — D-C5 recovery emails).
const makeRequestAuthClient = () =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { ...serverClientOptions, global: { fetch: timedFetch } });

// --- JWT verification via remote JWKS (jose) ------------------------------------------------------
// jose is ESM-only; lazy-import it once from this CommonJS module.
let _josePromise = null;
const getJose = () => {
    if (!_josePromise) _josePromise = import("jose");
    return _josePromise;
};

let _jwks = null;
const jwksUrl = () =>
    process.env.SUPABASE_JWKS_URL || `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const expectedIssuer = () =>
    process.env.SUPABASE_JWT_ISS || `${SUPABASE_URL}/auth/v1`;

async function verifySupabaseJwt(token) {
    const jose = await getJose();
    if (!_jwks) {
        _jwks = jose.createRemoteJWKSet(new URL(jwksUrl()));
    }
    const { payload } = await jose.jwtVerify(token, _jwks, {
        issuer: expectedIssuer(),
        audience: "authenticated"
    });
    return payload;
}

module.exports = {
    supabaseAdmin,
    makeEphemeralAuthClient,
    makeRequestAuthClient,
    verifySupabaseJwt,
    AUTH_HTTP_TIMEOUT_MS,
    AUTH_RETRY_AFTER_SECONDS
};
```

3. **NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/supabaseTokenRefresh.js`**:
```js
// Stateless Supabase refresh-token exchange — auth SPEC D-C11 (reliability-overhaul D-1).
// ONE direct POST to GoTrue's token endpoint per call: no client object, no stored session, a 5 s timeout and
// NO automatic retry. (auth-js re-sends a refresh token for up to 30 s on network/5xx errors; a token re-sent
// after Supabase already rotated it trips reuse detection and revokes the whole session.)
// Failures are classified so a client signs out only when its token is truly dead:
//   401 session_invalid  — Supabase rejected THIS token with a non-transient 4xx: refresh_token_not_found,
//                          refresh_token_already_used, session_not_found, session_expired, user_not_found,
//                          user_banned, invalid_grant — or any other non-retryable 4xx with an auth error code
//                          (e.g. validation_failed): re-sending the same token can never succeed.
//   503 auth_unavailable — 408 / 409 (concurrent refresh) / 429 / 5xx, a 4xx with no auth error code (gateway)
//                          or an API-key fault (bad_jwt / no_authorization — our config, not the user's token),
//                          a network error, our 5 s timeout, or a 2xx without tokens. Sent with Retry-After.
const { AppError } = require("../utils/response");
const { AUTH_HTTP_TIMEOUT_MS, AUTH_RETRY_AFTER_SECONDS } = require("../config/supabase");

const TRANSIENT_STATUSES = new Set([408, 409, 429]);
const CONFIG_FAULT_CODES = new Set(["bad_jwt", "no_authorization"]);

const sessionInvalid = () => new AppError(401, "Invalid refresh token", { code: "session_invalid" });

const authUnavailable = () =>
    new AppError(503, "Authentication service temporarily unavailable", {
        code: "auth_unavailable",
        retryAfter: AUTH_RETRY_AFTER_SECONDS
    });

// GoTrue error bodies: API version 2024-01-01 → { code: "<error_code>", message }; legacy →
// { code: <http status>, error_code, msg }; OAuth-style → { error: "invalid_grant", error_description }.
const readErrorCode = (body) => {
    if (!body || typeof body !== "object") return null;
    if (typeof body.code === "string") return body.code;
    if (typeof body.error_code === "string") return body.error_code;
    if (typeof body.error === "string") return body.error;
    return null;
};

// Exchange a refresh token for { access_token, refresh_token } or throw a classified AppError.
// Logs carry status + Supabase error code only — never a token or a user identifier.
async function exchangeRefreshToken(refreshToken) {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    let res;
    try {
        res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                "X-Supabase-Api-Version": "2024-01-01"
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
            signal: AbortSignal.timeout(AUTH_HTTP_TIMEOUT_MS)
        });
    } catch (err) {
        // TimeoutError (our 5 s budget) or TypeError "fetch failed" (DNS / connect / reset).
        console.error("[refresh] auth_unavailable: %s %s", err?.name || "Error", err?.cause?.code || "");
        throw authUnavailable();
    }

    const body = await res.json().catch(() => null);

    if (res.ok) {
        if (body?.access_token && body?.refresh_token) {
            return { access_token: body.access_token, refresh_token: body.refresh_token };
        }
        console.error("[refresh] auth_unavailable: status=%d without tokens", res.status);
        throw authUnavailable();
    }

    const code = readErrorCode(body);
    if (res.status >= 500 || TRANSIENT_STATUSES.has(res.status) || !code || CONFIG_FAULT_CODES.has(code)) {
        console.error("[refresh] auth_unavailable: status=%d code=%s", res.status, code || "none");
        throw authUnavailable();
    }

    console.warn("[refresh] session_invalid: status=%d code=%s", res.status, code);
    throw sessionInvalid();
}

module.exports = { exchangeRefreshToken };
```

4. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js`**: make exactly these eight content replacements. Line numbers are the original ones. Do NOT touch `logout` (L170-187), `linkProvider`/`unlinkProvider` (`setSession`) or any `supabaseAdmin` call.
   - **A (L4)**: replace `//   • refresh      → Supabase refreshSession (Supabase owns refresh-token rotation; refresh_tokens retires).` with:
     ```js
     //   • refresh      → ONE direct, 5 s-timed, never-retried POST to Supabase's /token endpoint
     //                    (services/supabaseTokenRefresh.js — SPEC D-C11; Supabase owns rotation; refresh_tokens retires).
     //   • sign-in/oauth/re-auth/recovery → a FRESH per-request anon client (makeRequestAuthClient — D-C11);
     //                    no module-level client ever holds a user session.
     ```
   - **B (L13)**: replace `const { supabaseAuth, supabaseAdmin, makeEphemeralAuthClient } = require("../config/supabase");` with:
     ```js
     const {
         supabaseAdmin,
         makeEphemeralAuthClient,
         makeRequestAuthClient,
         AUTH_HTTP_TIMEOUT_MS
     } = require("../config/supabase");
     const { exchangeRefreshToken } = require("./supabaseTokenRefresh");
     ```
   - **C (L74)**: `await supabaseAuth.auth.signInWithPassword({ email, password });` → `await makeRequestAuthClient().auth.signInWithPassword({ email, password });`
   - **D (L155-168)**: replace the whole `refreshAccessToken` function with:
     ```js
     async function refreshAccessToken(refreshTokenRaw) {
         if (!refreshTokenRaw) throw new AppError(400, "Refresh token required");

         // D-C11: one direct, timed, never-retried token-endpoint call — no shared SDK session machinery. Throws
         // AppError 401 {code:"session_invalid"} or 503 {code:"auth_unavailable", retryAfter} (see routes/auth.js).
         const session = await exchangeRefreshToken(refreshTokenRaw);

         // Shape is contract (live iOS/Android/web): exactly { token, refresh_token, message }, in this order.
         return {
             token: session.access_token,
             refresh_token: session.refresh_token,
             message: "Token refreshed"
         };
     }
     ```
   - **E (L278-280, Google exchange)**: replace
     ```js
                     grant_type: "authorization_code"
                 })
             });
     ```
     with
     ```js
                     grant_type: "authorization_code"
                 }),
                 signal: AbortSignal.timeout(AUTH_HTTP_TIMEOUT_MS) // D-C11 — a hung Google call → the 502 below
             });
     ```
   - **F (L417)**: `await supabaseAuth.auth.signInWithIdToken({` → `await makeRequestAuthClient().auth.signInWithIdToken({`
   - **G (L599)**: `await supabaseAuth.auth.signInWithPassword({ email: currentEmail, password });` → `await makeRequestAuthClient().auth.signInWithPassword({ email: currentEmail, password });`
   - **H (L660)**: `await supabaseAuth.auth.resetPasswordForEmail(` → `await makeRequestAuthClient().auth.resetPasswordForEmail(`

5. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/auth.js`** (L54-63): replace the `/refresh` handler with the code below. Nothing else in the file changes.
```js
router.post("/refresh", async (req, res) => {
    try {
        const result = await authService.refreshAccessToken(req.body.refresh_token);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) {
            // auth SPEC D-C11: classified failures add a machine `code` (session_invalid / auth_unavailable) and,
            // on 503, a Retry-After header. The 400 "Refresh token required" stays `{ error }` only.
            if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
            const body = { error: err.message };
            if (err.code) body.code = err.code;
            return res.status(err.statusCode).json(body);
        }
        console.error("[refresh] error:", err);
        res.status(500).json({ error: "Server error during refresh" });
    }
});
```

6. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js`**:
   - **(a) L6**: → `const { verifySupabaseJwt, AUTH_RETRY_AFTER_SECONDS } = require("../config/supabase");`
   - **(b)** Insert these 25 lines (24 plus a trailing blank line) immediately before `const authenticateToken = async (req, res, next) => {` (original L35), so that the classifier occupies new L35-58:
```js
// D-C11 (auth 0.10.0 — reliability-overhaul D-1): tell an INFRASTRUCTURE failure apart from a bad token.
// JWKS timeout / non-200 / bad JSON (jose ERR_JWKS_TIMEOUT / ERR_JOSE_GENERIC / ERR_JWKS_INVALID), a network
// error, or a DB (Sequelize) error in the member lookup → 503 + Retry-After, so the client keeps its session
// and retries instead of refreshing and then signing out on a second 401. Every token fault (expired, forged,
// malformed, wrong iss/aud, unknown kid) and anything unclassified stays 401 exactly as before.
const INFRA_JOSE_CODES = new Set(["ERR_JWKS_TIMEOUT", "ERR_JOSE_GENERIC", "ERR_JWKS_INVALID"]);
const NETWORK_ERROR_CODES = new Set([
    "ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN",
    "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH"
]);

const isVerifyInfraFailure = (err) => {
    if (!err) return false;
    if (INFRA_JOSE_CODES.has(err.code) || NETWORK_ERROR_CODES.has(err.code)) return true;
    return typeof err.name === "string" && err.name.startsWith("Sequelize");
};

const sendAuthUnavailable = (res) => {
    res.set("Retry-After", String(AUTH_RETRY_AFTER_SECONDS));
    return res.status(503).json({
        error: "Authentication service temporarily unavailable",
        code: "auth_unavailable"
    });
};

```
   - **(c)** In `authenticateToken` ONLY (original L51-53; leave `authenticateStream`'s identical catch untouched), replace the catch with:
```js
    } catch (error) {
        if (isVerifyInfraFailure(error)) {
            console.error("[auth] token verification unavailable: %s", error.code || error.name);
            return sendAuthUnavailable(res);
        }
        return res.status(401).json({ error: "Invalid token." });
    }
```
   - **Expected result**: a 217-line file.
     - `resolveReqUser` 13-33, classifier 35-58, `authenticateToken` 60-83, `authenticateStream` 90-111, `isAdmin` 113-125, `canModifyLog` 127-155, `requireProgramAdmin` 157-185, `requireProgramMember` 187-215.
     - The `programId` resolution lines are 166 and 196.
     - `requireProgramAdmin` and `requireProgramMember` are unchanged.

7. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js`**:
   - **(a)** After L2, add `const { ProgramMembership } = require("../models");`
   - **(b)** After `const v2Router = express.Router();` (original L7), insert a blank line, then:
```js
// D-C8 (analytics 0.4.0) + D-C3 (analytics-v2 0.2.0) — program-scoped read authorization (reliability-overhaul
// D-3). Same rule as member-analytics' ensureProgramAccess: a global_admin reads any program; anyone else needs
// an ACTIVE program_memberships row (any role) for ?programId — one indexed lookup per request. Pass-through
// when programId is absent so the service still answers its native 400 "programId is required". A non-string
// programId (?programId=a&programId=b → array) is refused: the services would aggregate every listed program.
// try/catch → next(err): Express 4 doesn't catch a rejected async middleware (a non-UUID programId makes the
// UUID lookup throw) — the shared errorHandler answers 500 and the process stays up.
const requireProgramAccess = async (req, res, next) => {
    try {
        if (req.user.global_role === "global_admin") return next();

        const programId = req.query.programId;
        if (!programId) return next();
        if (typeof programId !== "string") {
            return res.status(403).json({ error: "Access denied. Program membership required." });
        }

        const membership = await ProgramMembership.findOne({
            where: { program_id: programId, member_id: req.user.id, status: "active" }
        });
        if (!membership) return res.status(403).json({ error: "Access denied. Program membership required." });

        next();
    } catch (err) {
        next(err);
    }
};
```
   - **(c)** Replace all 14 occurrences of `authenticateToken, async (req, res) =>` with `authenticateToken, requireProgramAccess, async (req, res) =>`. There are 9 `v1Router` routes and 5 `v2Router` routes. Handlers are unchanged.
   - Do NOT modify `services/analyticsService.js`.

## Steps — web
None. Checked read-only:
- `apps/web/src/lib/api/summary.ts` and `lifestyle.ts` pass the selected program.
- `apps/web/src/app/programs/page.tsx:332` `canOpen` = `isGlobalAdmin || my_status === null || "active"`.
- For standard users, `getPrograms` only returns active, invited and requested programs, so a null status means a global admin.
- On a data call, a 403 shows an error; the session is only cleared on 401.

## Steps — ios
None. Checked read-only:
- `ProgramPickerView.swift:349` `canOpen` follows the same rule as web.
- `APIClient.swift` signs the user out only after a 401 on the retry, or after a 401/403 from refresh. A 403 on a data call, or a 503 anywhere, only raises an error.
- The widget never calls analytics.

## Steps — android
None. Checked read-only:
- `ProgramPickerScreen.kt:292` `canOpen` = `isGlobalAdmin || myStatus == "active"`.
- `ApiService.kt:80,122-140` always sends `programId`.
- Android 1.0.0 signs out on any non-2xx from refresh. This was accepted under D-1 (no shim).

## Steps — docs (orchestrator, inside git-version, after E1 and E2 pass)

**D1. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md`**
- **L3**: `**Version:** 0.9.0` → `**Version:** 0.10.0`.
- **L71**: after ``{ token, refresh_token, message: "Token refreshed" }`.`` append:
  > ` **Unchanged byte-for-byte** (D-C11). Errors (D-C11): `400 { error: "Refresh token required" }`; `401 { error: "Invalid refresh token", code: "session_invalid" }` (Supabase rejected this token — retrying it can never succeed); `503 { error: "Authentication service temporarily unavailable", code: "auth_unavailable" }` + `Retry-After: 5` (Supabase 408/409/429/5xx, gateway/API-key fault, network error, 5 s timeout) — keep the session and retry.`
- **L104-106 (error contract paragraph)**: replace it with:
  > `AppError(statusCode, message, { code?, retryAfter? })` → `{ error: message }` at that status (plus `code` and a `Retry-After` header when set — only `/refresh` sets them, D-C11); any other throw → `500` with a generic `"Server error during <op>"`. Status codes used: `400` (missing/invalid input), `401` (invalid credentials / token; `/refresh` adds `code: "session_invalid"`), `403` (global-admin delete block), `404` (credentials/account not found), `503` (`code: "auth_unavailable"` + `Retry-After: 5` — `/refresh` on a transient Supabase failure and `authenticateToken` on an infrastructure verification failure, D-C11).
- **L163-174 (§4 middleware table + the following paragraph)**: replace with the block below.
  - Before writing it, confirm the ranges with `grep -n "^const \(resolveReqUser\|INFRA_JOSE_CODES\|authenticateToken\|authenticateStream\|isAdmin\|canModifyLog\|requireProgramAdmin\|requireProgramMember\)" apps/backend/middleware/auth.js`.
  - Each range ends at the line before the next symbol's comment/blank.
  - If grep differs, use grep's numbers.

  ```
  | Middleware | Lines (`middleware/auth.js`) | Rule |
  |------------|-------|------|
  | `authenticateToken` | `60-83` (+ `resolveReqUser` `13-33`, infra classifier `35-58`) | Verify the bearer JWT → `req.user`. **This is the piece that changed** in the migration (§7). Token fault → `401 { error: "Invalid token." }`; JWKS/network/DB failure → `503 { error, code: "auth_unavailable" }` + `Retry-After: 5` (D-C11). |
  | `authenticateStream` | `90-111` | SSE variant: token from the header **or** `?token=`; same `resolveReqUser`; returns 401 for every failure (§10 F12). |
  | `isAdmin` | `113-125` | Pass if `req.user.role === "admin"` **or** `global_role === "global_admin"`; else 403. |
  | `requireProgramAdmin` | `157-185` | `global_admin` bypasses; else require an `active` `program_memberships` row with `role "admin"` for the resolved `program_id`; else 403. **Not mounted on any route** — `routes/programWorkouts.js` defines its own resolve-or-pass-through `requireProgramAdmin`. |
  | `requireProgramMember` | `187-215` | `global_admin` bypasses; else require any `active` membership; attaches `req.programMembership`; else 403. **Not mounted on any route** (400s a missing id, no try/catch) — analytics/analytics-v2 use their local `requireProgramAccess` (analytics D-C8). |
  | `canModifyLog` | `127-155` | `role "admin"` bypasses; else the request's `member_id`/`member_name` must equal the caller's; else 403. |

  `program_id` is resolved from `req.body.program_id || req.query.programId || req.params.programId`
  (`middleware/auth.js:166, 196`). Both JWT verifiers live in `middleware/auth.js` and share `resolveReqUser` (§10 F5).
  ```
- **L202**: replace ``**`SUPABASE_SERVICE_ROLE_KEY`** (admin API for sign-in proxy / createUser / updateUser / deleteUser)`` with:
  > **`SUPABASE_ANON_KEY`** (the proxied public flows — per-request sign-in / id-token / recovery clients + the direct `/token` refresh call, D-C11), **`SUPABASE_SERVICE_ROLE_KEY`** (admin API only — createUser / updateUserById / deleteUser / getUserById)
- **L225**: replace ``- **`/refresh`** proxies Supabase's token-refresh; **`/logout`** revokes via Supabase.`` with:
  > - **`/refresh`** proxies Supabase's token-refresh — since 0.10.0 as one direct, 5 s-timed, never-retried `POST /auth/v1/token?grant_type=refresh_token` with classified errors (D-C11); **`/logout`** revokes via Supabase.
- **§9**: insert a new row after the D-C10 row and before `| **D-REF** |`:
  > | **D-C11** | **Deliberate change (0.10.0) — stateless auth proxy + classified auth failures (reliability-overhaul D-1).** (a) **No shared client holds a user session:** the module-level `supabaseAuth` is removed. `/refresh` = ONE direct `POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token` (`services/supabaseTokenRefresh.js`; headers `apikey` + `Authorization: Bearer <anon>` + `X-Supabase-Api-Version: 2024-01-01`), **5 s timeout, no automatic retry** — auth-js 2.108.2 runs server clients lock-less, so the shared client could hand one user's in-flight refresh to another caller, refresh its last-stored (another user's) session first, and replay a refresh token for up to 30 s (tripping reuse detection). Login / `/oauth` / `PUT /email` re-auth / `/forgot-password` use a **fresh per-request anon client** (`makeRequestAuthClient`, every fetch `AbortSignal.timeout(5000)`); logout/link/unlink keep `makeEphemeralAuthClient` unchanged; the Google code exchange gets the same 5 s timeout. (b) **`/refresh` errors:** `401 {error:"Invalid refresh token", code:"session_invalid"}` when Supabase rejects the token with a non-transient 4xx — the definitive codes (`refresh_token_not_found`, `refresh_token_already_used`, `session_not_found`, `session_expired`, `user_not_found`, `user_banned`, `invalid_grant`) and any other non-retryable 4xx carrying an auth error code (e.g. `validation_failed` — a 503 would loop forever); `503 {error:"Authentication service temporarily unavailable", code:"auth_unavailable"}` + `Retry-After: 5` for 408/409/429/5xx, a code-less (gateway) 4xx, an API-key fault (`bad_jwt`/`no_authorization`), a network error, the timeout, or a 2xx without tokens. (c) **`authenticateToken`** returns the same 503 for jose `ERR_JWKS_TIMEOUT` / `ERR_JOSE_GENERIC` / `ERR_JWKS_INVALID`, Node network errors and Sequelize errors; every token fault and every unclassified error stays `401 {error:"Invalid token."}`. **Live-binary safe:** `/refresh` 200 shape byte-identical; errors keep `error` and only ADD `code`; live iOS signs out only on 401/403 from refresh; live Android 1.0.0 signs out on any non-2xx (accepted, board principle 3 — no shim); web unchanged. Out of scope: F12–F14. MINOR (additive). | reliability-overhaul DESIGN_BOARD §2 + D-1; discovery W1 §4 F3–F5/F9, E6; `config/supabase.js`; `services/supabaseTokenRefresh.js`; `services/authService.js`; `routes/auth.js`; `middleware/auth.js`; `utils/response.js`. |
- **§10**:
  - Replace the F5 row with:
    > | **F5** | **Two JWT verifiers** — `authenticateToken` and `authenticateStream` (SSE; also accepts `?token=`), both in `middleware/auth.js`, sharing `resolveReqUser`. | `middleware/auth.js` | Done — consolidated in `resolveReqUser`; only error mapping differs (D-C11 / F12). |
  - Then append after F11:
    > | **F12** | **`authenticateStream` and `/oauth/complete` return 401 for every verification failure** — D-C11's 503 infra classification covers `authenticateToken` only. | `middleware/auth.js` `authenticateStream`; `routes/auth.js` `/oauth/complete` | Yes — Phase 3 (W2 SSE contract). |
    > | **F13** | **link/unlink `setSession` with an expired access token rotates the user's refresh token server-side and the new pair is discarded** — the client keeps a token one rotation old (dies on its next refresh after the 10 s reuse window). | `authService.linkProvider` / `unlinkProvider` | Yes — Phase 3 (W1 sessions). |
    > | **F14** | **Login / `/oauth` / `PUT /email` re-auth map a Supabase timeout, 429 or 5xx to their existing 401** ("Invalid credentials" / "Sign-in failed: …" / "Current password is incorrect.") — D-C11 only added the 5 s timeouts there. | `supabaseSignIn`, `socialSignIn`, `changeEmail` | Yes — Phase 3 (W7 error vocabulary). |
- **§11**: prepend a new first data row:
  > | 0.10.0 | 2026-10-11 | **D-C11 — stateless auth proxy + classified auth failures (reliability-overhaul Phase 1b, H1 / board D-1).** Removed the shared `supabaseAuth` client: `/refresh` → one direct `POST /auth/v1/token?grant_type=refresh_token` (`services/supabaseTokenRefresh.js`, 5 s timeout, no retry); login / `/oauth` / `PUT /email` re-auth / `/forgot-password` → a fresh per-request anon client (`makeRequestAuthClient`, 5 s fetch timeout); Google code exchange → 5 s timeout. `/refresh` errors: `401 code:"session_invalid"` vs `503 code:"auth_unavailable"` + `Retry-After: 5`. `authenticateToken` → 503 on JWKS/network/DB failures (token faults stay 401). `AppError` gains optional `{ code, retryAfter }` (additive). Doc drift fixed: §4 anchors + `authenticateStream` location + unmounted `requireProgramAdmin`/`requireProgramMember`, §6 `SUPABASE_ANON_KEY`. Flagged F12–F14. `/refresh` 200 shape byte-identical → **MINOR**, zero dependent re-version. Backend-only; deploys alone. |

**D2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`** (`"auth"` object only):
- `"version": "0.9.0"` → `"0.10.0"`.
- In `reference_impl.paths`, after `"middleware/auth.js"`, add `"config/supabase.js"` and `"services/supabaseTokenRefresh.js"`.

**D3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md` L13 (`auth` row):**
- Version `0.9.0` → `0.10.0`.
- Reference-impl cell → ``` `backend` (`routes/auth.js`, `services/authService.js`, `services/supabaseTokenRefresh.js`, `middleware/auth.js`, `config/supabase.js`) ```.

**D4. Commit 1 + tag.**
- Stage exactly:
  - `apps/backend/config/supabase.js`
  - `apps/backend/services/supabaseTokenRefresh.js`
  - `apps/backend/services/authService.js`
  - `apps/backend/utils/response.js`
  - `apps/backend/routes/auth.js`
  - `apps/backend/middleware/auth.js`
  - `specs/features/auth/SPEC.md`
  - `specs/features/registry.json`
  - `specs/features/REGISTRY.md`
- Message: `fix(auth): stateless Supabase auth proxy + classified refresh/JWT errors (D-C11, v0.10.0)`, with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.
- `git tag feature/auth@v0.10.0`.
- The git-version blast-radius gate for the owned-interface change shows auth's dependents (members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, apple-health, health-connect). None needs a new version, because their 401 behavior for token faults is unchanged. The user acknowledges this.

**D5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics/SPEC.md`**
- **L3**: `**Version:** 0.3.2` → `**Version:** 0.4.0`.
- **L14**: `(4, the rest faithful 1:1)` → `(5, the rest faithful 1:1)`.
- **L18**: `legacy provenance). Read-only aggregation` → ``legacy provenance) · **D-C8** (0.4.0) every route requires an ACTIVE membership in `programId` or global admin (reliability-overhaul D-3). Read-only aggregation``.
- **L59-60**: replace ``Authorization is just`` + newline + ``` `authenticateToken` (any authenticated member may read a program's analytics — no per-program gate, §10 F2).``` with:
  > Authorization (0.4.0, D-C8): `authenticateToken` + `requireProgramAccess` — only an ACTIVE member of `programId` (any role) or a global admin may read a program's analytics (was: any signed-in member, §10 F2).
- **L65-66**: ``Every`` + newline + ``route is `authenticateToken`-only.`` → ``Every route is `authenticateToken` → `requireProgramAccess` (D-C8).``
- **L87**: replace ``generic. `400` (missing `programId`), `404` (program not found, `getSummary` only).`` with:
  > generic. `400` (missing `programId` — the D-C8 gate passes a missing id through), `403 { error: "Access denied. Program membership required." }` (D-C8: not an ACTIVE member of `programId` and not a global admin, or `programId` is not a single string), `404` (program not found, `getSummary` only — reached only by members/global admins, so a non-member asking for a nonexistent program gets `403`). A DB error inside the gate (e.g. a non-UUID `programId` from a non-admin) → the shared `errorHandler`'s `500 { error: "Internal server error." }`.
- **L115**: ``  Same `authenticateToken`-only posture as the rest of v1 (F2).`` → `  Same D-C8 gate as the rest of v1.`
- **§9**: insert after the D-C7 row:
  > | **D-C8** | **Deliberate change (0.4.0) — program-membership read gate (reliability-overhaul D-3; closes §10 F2).** Every v1 route (and every v2 route — analytics-v2 D-C3) runs `requireProgramAccess` after `authenticateToken` (local to `routes/analytics.js`, mirroring `routes/programWorkouts.js`' guard and member-analytics' `ensureProgramAccess` rule): `global_admin` passes; otherwise an `active` `program_memberships` row (any role — admin / logger / member) for `req.query.programId`, else `403 { error: "Access denied. Program membership required." }`. One indexed lookup per request. Missing `programId` passes through (native `400` kept); a non-string `programId` (repeated param → array) → the same 403 (the services would aggregate every listed program); DB errors → `next(err)`. `services/analyticsService.js` untouched. **Why:** these routes return member first/last names; any signed-in account could read any program by id. **Live-binary safe:** every client opens a program only when `my_status` is `active` or the caller is a global admin (web `programs/page.tsx`, iOS `ProgramPickerView.swift`, Android `ProgramPickerScreen.kt` `canOpen`), and standard users' program lists contain only active/invited/requested programs. | reliability-overhaul DESIGN_BOARD D-3; `routes/analytics.js` `requireProgramAccess`; `services/memberAnalyticsService.js` `ensureProgramAccess`; `routes/programWorkouts.js`. |
- **§10**: replace the F2 row with:
  > | **F2** | **No per-program authorization on reads (legacy)** — every route was `authenticateToken`-only; any authenticated member could read any program's analytics by `programId`. | legacy `analytics.js:11-122` | **Changed (D-C8, 0.4.0)** — active membership or global admin required. |
- **§11**: prepend:
  > | 0.4.0 | 2026-10-11 | **D-C8 — program-membership read gate (reliability-overhaul Phase 1b, H3 / board D-3).** `routes/analytics.js` gains a local `requireProgramAccess` (global admin, or an ACTIVE `program_memberships` row for `?programId`; missing id → native 400; non-string id → 403; try/catch → `next(err)`) after `authenticateToken` on all 9 v1 routes (+ the 5 v2 routes — analytics-v2 0.2.0). New `403 { error: "Access denied. Program membership required." }`; a non-member asking for a nonexistent program now gets 403 instead of `/summary`'s 404. `services/analyticsService.js` unchanged. Closes F2. No legitimate client call gets a 403 (clients open only active-membership programs; global admins bypass). **MINOR**; dependents analytics-v2 (bumped) + member-analytics (unaffected). Backend-only. |

**D6. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics-v2/SPEC.md`**
- **L3**: `**Version:** 0.1.0` → `**Version:** 0.2.0`, and the trailing ``` `web`, `ios` ``` → ``` `web`, `ios`, `android` ```.
- **L14**: `(1, the rest faithful 1:1)` → `(2, the rest faithful 1:1)`.
- **L15**: `the mirror of v1's D-C2). The 5 live routes'` → ``the mirror of v1's D-C2) · **D-C3** (0.2.0) every route requires an ACTIVE membership in `programId` or global admin (reliability-overhaul D-3). The 5 live routes'``.
- **L58-59**: replace ``Authorization is just `authenticateToken` (any authenticated member may read a program's analytics — no`` + newline + `per-program gate, §10 F2, inherited from v1).` with:
  > Authorization (0.2.0, D-C3): `authenticateToken` + the shared `requireProgramAccess` gate — only an ACTIVE member of `programId` or a global admin (was: any signed-in member, §10 F2).
- **L65**: ``Every route is `authenticateToken`-only.`` → ``Every route is `authenticateToken` → `requireProgramAccess` (D-C3).``
- **L83**: ``There is no `404` path (no program lookup in the v2 half). Status codes preserved 1:1.`` → 
  > There is no `404` path (no program lookup in the v2 half). **D-C3 (0.2.0):** the gate adds `403 { error: "Access denied. Program membership required." }` (not an ACTIVE member of `programId` and not a global admin, or a non-string `programId`); a missing `programId` still reaches the fn's `400`; a DB error in the gate (e.g. a non-UUID `programId` from a non-admin) → `500 { error: "Internal server error." }`. Other status codes preserved 1:1.
- **L180**: ``- **Consumers:** **`web` + `ios`** — the 5 live routes used 1:1 by both clients, **no divergence**.`` → ``- **Consumers:** **`web` + `ios` + `android`** — the 5 live routes used 1:1 by all three clients, **no divergence**.``
- **After L190**, add the bullet:
  > `  - **android:** `net/ApiService.kt:80` (`participation/mtd`) + `:122-140` (the 4 workout-type aggregates; `memberId` optional), called through `core/ProgramContext.kt` from the Summary + Lifestyle screens.`
- **§9 D-REF**: replace ``` `consumed_by = [web, ios]`** — the 5 live routes used 1:1 by both clients``` with ``` `consumed_by = [web, ios, android]`** (android added 0.2.0 — doc↔code lag fix; registry.json already listed it) — the 5 live routes used 1:1 by all three clients```.
- **§9**: insert after D-C2:
  > | **D-C3** | **Deliberate change (0.2.0) — program-membership read gate (reliability-overhaul D-3; closes §10 F2).** The 5 v2 routes run the same local `requireProgramAccess` as v1 (analytics D-C8; one guard in the shared `routes/analytics.js`): global admin passes; otherwise an ACTIVE `program_memberships` row for `?programId` (any role) or `403 { error: "Access denied. Program membership required." }`; missing `programId` → the fn's `400`; non-string `programId` → 403; DB errors → `next(err)`. One authorization contract for the whole analytics surface. Live-binary safe (clients open only active-membership programs; global admins bypass). | analytics D-C8; `routes/analytics.js` `requireProgramAccess`; DESIGN_BOARD D-3. |
- **§10**: replace the F2 row with:
  > | **F2** | **No per-program authorization on reads (legacy)** — every route was `authenticateToken`-only; any authenticated member could read any program's v2 analytics by `programId`. Inherited from v1 (its F2). | legacy `analytics.js:140-193` | **Changed (D-C3, 0.2.0)** — active membership or global admin required. |
- **§11**: prepend:
  > | 0.2.0 | 2026-10-11 | **D-C3 — program-membership read gate (reliability-overhaul Phase 1b, H3 / board D-3).** The 5 v2 routes mount the shared local `requireProgramAccess` after `authenticateToken` (analytics 0.4.0 / D-C8): new `403 { error: "Access denied. Program membership required." }`; missing `programId` still 400s; closes F2. Fixed the header / §8 / D-REF `consumed_by` lag → `[web, ios, android]`. `services/analyticsService.js` unchanged. **MINOR**; no dependents. Backend-only. |

**D7. registry.json and REGISTRY.md.**
- In `registry.json`, `"analytics"` object: `"version": "0.3.2"` → `"0.4.0"`. `"analytics-v2"` object: `"version": "0.1.0"` → `"0.2.0"`.
- In `REGISTRY.md`:
  - L23 Version `0.3.2` → `0.4.0`.
  - L24 Version `0.1.0` → `0.2.0`.
  - L24 Apps cell ``` `web` `ios` ``` → ``` `web` `ios` `android` ```.

**D8. Commit 2 + tags.**
- Stage:
  - `apps/backend/routes/analytics.js`
  - `specs/features/analytics/SPEC.md`
  - `specs/features/analytics-v2/SPEC.md`
  - `specs/features/registry.json`
  - `specs/features/REGISTRY.md`
- Message: `fix(analytics): program-membership read gate on /api/analytics + /api/analytics-v2 (D-C8 v0.4.0, D-C3 v0.2.0)`, plus the trailer.
- `git tag feature/analytics@v0.4.0` and `git tag feature/analytics-v2@v0.2.0`.
- Two separate commits mean H3 can be reverted on its own.

**D9 (only after E6 passes). Commit 3, docs only, no tag. `docs(initiative): Phase 1b H1+H3 deployed; post-deploy watch`.**
- **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/PROGRESS.md`**: replace `> **Next:** Phase 1b backend hotfixes, then Phase 2 foundations (parallel tracks — BRIEF §7).` with:
  > `> **Phase 1b (2026-10-11):** H1 auth hotfix (auth 0.10.0 / D-C11) + H3 analytics membership gate (analytics 0.4.0 / D-C8, analytics-v2 0.2.0 / D-C3) **deployed**; 7-day Supabase-log watch running (HANDOFF → Next action). H2 (refresh rate limit) = one admin-token call awaiting the user's OK. **Next:** Phase 2 foundations (parallel tracks — BRIEF §7).`
- **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/HANDOFF.md`**:
  - **(a) L12-13**: replace the sentence starting `**Next: Phase 1b hotfixes (H1 auth,` and ending `plan needs the user's approval before code.` with:
    > `**Phase 1b: H1 + H3 DEPLOYED 2026-10-11** (auth 0.10.0 / D-C11; analytics 0.4.0 / D-C8 + analytics-v2 0.2.0 / D-C3) — 7-day log watch running (Next action); **H2 pending** (admin-token call).`
  - **(b) L21-22**: wrap the "Task chips dismissed" bullet text in `~~…~~` and append ` **DONE 2026-10-11** — auth SPEC D-C11, analytics SPEC D-C8.`
  - **(c) L86**: wrap `**Two out-of-scope security fixes offered as task chips (user decides; not part of the board):**` in `~~…~~` and append ` **DONE 2026-10-11** (H1 → auth D-C11; H3 → analytics D-C8):`
  - **(d) "Next action" item 1 (L132-134)**: replace with:
    > `1. **Phase 1b — finish:** (a) **H2** — one admin-token Management API call, rate_limit_token_refresh 150 → 1,500 (user approves; record its timestamp — it confounds the 429 trend). (b) **7-day watch** (E8 queries): refresh_token_already_used/day (baseline ≈ 1.6/day: 47 in the prior 30 d), 429 over_request_rate_limit/day (baseline ≈ 1.3/day: 118 in 90 d), Render "[refresh] auth_unavailable|session_invalid" + "[auth] token verification unavailable" counts, cross-user token pairs < 200 ms (baseline 59/30 d → expect ≈ 0). Gate to Phase 2 (board §12): reuse kills + 429s drop; no cross-user refresh.`
  - **(e) Workstream table, W1 row**:
    - Build cell → `1b hotfix (H1) done`.
    - Shipped cell → `partial — H1 live 2026-10-11`.
  - **(f)** Append to the Session log:
    > `- **2026-10-11** — Phase 1b: H1 (stateless auth proxy + classified refresh/JWT errors, auth 0.10.0) + H3 (analytics membership gate, analytics 0.4.0 / analytics-v2 0.2.0) planned → adversary → implemented → deployed; H2 pending.`

## Endgame

**E1. Compile and boot check (backend; the implementer runs it before handing over).**
- Syntax check:
  ```
  cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && for f in config/supabase.js services/supabaseTokenRefresh.js services/authService.js utils/response.js routes/auth.js middleware/auth.js routes/analytics.js; do node --check "$f" || echo "FAIL $f"; done
  ```
- Confirm the shared client is gone and the guard is mounted:
  - `grep -rn "supabaseAuth" --include='*.js' --exclude-dir=node_modules apps/backend` → no output.
  - `grep -c "authenticateToken, requireProgramAccess, async" apps/backend/routes/analytics.js` → `14`.
- Boot check:
  ```
  cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node -r dotenv/config -e 'const {v1Router,v2Router}=require("./routes/analytics");let n=0;for(const r of [v1Router,v2Router])for(const l of r.stack){n++;console.log(l.route.path,l.route.stack.map(s=>s.name).join(","))}console.log("routes:",n);console.log(Object.keys(require("./config/supabase")).sort().join(","));require("./routes/auth");console.log("ok");process.exit(0)'
  ```
  Expected:
  - 14 lines, each ending in `authenticateToken,requireProgramAccess,<anonymous>`;
  - `routes: 14`;
  - `AUTH_HTTP_TIMEOUT_MS,AUTH_RETRY_AFTER_SECONDS,makeEphemeralAuthClient,makeRequestAuthClient,supabaseAdmin,verifySupabaseJwt`;
  - `ok`.
- Web, Android and iOS: nothing is touched, so there is no build to run.
- iOS and all live/visual checks belong to the USER. This repo has no staging and no test suite.

**E2. Local smoke test (Claude runs it; local backend connected to the live Supabase).**
- Make sure `apps/backend/.env.local` does not exist (`.env` must not override the inline env).
- Start three servers in the background from `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`:
  - `PORT=5055 node server.js` (normal);
  - `PORT=5056 SUPABASE_URL=http://127.0.0.1:9 SUPABASE_JWKS_URL=http://127.0.0.1:9/auth/v1/.well-known/jwks.json node server.js` (connection refused);
  - `PORT=5057 SUPABASE_URL=http://10.255.255.1 SUPABASE_JWKS_URL=http://10.255.255.1/auth/v1/.well-known/jwks.json node server.js` (black hole → timeout).
- Wait (until-loop) until `GET /` on all three returns 200.
- Write the script below to the session scratchpad as `phase1b-smoke.sh`.
- Run it with `TESTBED_PASSWORD` set to the shared testbed password (memory `testbed-seeder`; never write it to a file) and `FORCED=1 bash phase1b-smoke.sh`.
- Every line must say PASS.
- Then stop the servers: `kill $(lsof -ti tcp:5055 -ti tcp:5056 -ti tcp:5057 -sTCP:LISTEN)`.
```bash
#!/usr/bin/env bash
# Phase 1b smoke (H1 + H3). Prints PASS/FAIL only — never a token.
#   Local: TESTBED_PASSWORD=… FORCED=1 bash phase1b-smoke.sh
#   Prod:  TESTBED_PASSWORD=… SMOKE_BASE=https://rasifiters-api.onrender.com/api bash phase1b-smoke.sh
set -uo pipefail
: "${TESTBED_PASSWORD:?set TESTBED_PASSWORD}"
A="${SMOKE_BASE:-http://localhost:5055/api}"; B="http://localhost:5056/api"; C="http://localhost:5057/api"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1 — expected [$3] got [$2]"; FAIL=$((FAIL+1)); fi; }
req() { local u="$1"; shift; curl -s -m 20 -o "$T/body" -D "$T/hdr" -w '%{http_code}' -H 'Content-Type: application/json' "$@" "$u"; }
body() { jq -c . "$T/body" 2>/dev/null || cat "$T/body"; }
hdr() { grep -i "^$1:" "$T/hdr" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
login() { req "$A/auth/login/app" -X POST -d "$(jq -nc --arg u "$1" --arg p "$TESTBED_PASSWORD" '{identifier:$u,password:$p}')" >/dev/null; cat "$T/body"; }

echo "== H1 (base $A)"
L=$(login mason.w); AT=$(jq -r '.token // empty' <<<"$L"); RT=$(jq -r '.refresh_token // empty' <<<"$L")
check "login mason.w" "$(jq -r .message <<<"$L")" "Login successful"
s=$(req "$A/auth/refresh" -X POST -d "$(jq -nc --arg t "$RT" '{refresh_token:$t}')")
check "refresh valid → 200" "$s" "200"
check "refresh shape byte-identical" "$(jq -c keys_unsorted "$T/body")" '["token","refresh_token","message"]'
check "refresh message" "$(jq -r .message "$T/body")" "Token refreshed"
NRT=$(jq -r '.refresh_token // empty' "$T/body"); AT=$(jq -r '.token // empty' "$T/body")
check "refresh rotated token" "$([ -n "$NRT" ] && [ "$NRT" != "$RT" ] && echo yes || echo no)" "yes"
# NEVER re-send $RT (reuse after 10 s revokes the session family).
s=$(req "$A/auth/refresh" -X POST -d '{"refresh_token":"phase1b-smoke-not-a-token"}')
check "refresh garbage → 401" "$s" "401"
check "refresh garbage body" "$(body)" '{"error":"Invalid refresh token","code":"session_invalid"}'
check "refresh garbage no Retry-After" "$(hdr Retry-After)" ""
s=$(req "$A/auth/refresh" -X POST -d '{}'); check "refresh missing → 400" "$s" "400"
check "refresh missing body" "$(body)" '{"error":"Refresh token required"}'
s=$(req "$A/auth/me" -H "Authorization: Bearer $AT"); check "/me valid → 200" "$s" "200"
s=$(req "$A/auth/me" -H "Authorization: Bearer not.a.jwt"); check "/me garbage → 401" "$s" "401"
check "/me garbage body" "$(body)" '{"error":"Invalid token."}'

if [ "${FORCED:-0}" = "1" ]; then
  echo "== H1 forced failures"
  U='{"error":"Authentication service temporarily unavailable","code":"auth_unavailable"}'
  for X in "$B" "$C"; do
    t0=$(date +%s); s=$(req "$X/auth/refresh" -X POST -d '{"refresh_token":"phase1b-smoke-not-a-token"}'); dt=$(( $(date +%s) - t0 ))
    check "refresh $X → 503" "$s" "503"; check "refresh $X body" "$(body)" "$U"
    check "refresh $X Retry-After" "$(hdr Retry-After)" "5"
    check "refresh $X ≤ 7 s (no 30 s replay)" "$([ "$dt" -le 7 ] && echo yes || echo "no(${dt}s)")" "yes"
    s=$(req "$X/auth/me" -H "Authorization: Bearer $AT"); check "/me $X → 503" "$s" "503"; check "/me $X body" "$(body)" "$U"
  done
fi

echo "== H3 analytics gate"
Z=$(login zoe.chen); ZT=$(jq -r '.token // empty' <<<"$Z")
req "$A/programs" -H "Authorization: Bearer $ZT" >/dev/null
WINTER=$(jq -r '.[] | select(.name=="RaSi Winter Reset") | .id' "$T/body")
req "$A/programs" -H "Authorization: Bearer $AT" >/dev/null
SPRING=$(jq -r '.[] | select(.name=="RaSi Spring Shred" and .my_status=="active") | .id' "$T/body")
SUMMER=$(jq -r '.[] | select(.name=="RaSi Summer Strong" and .my_status=="active" and .my_role=="member") | .id' "$T/body")
check "fixtures resolved" "$([ -n "$WINTER" ] && [ -n "$SPRING" ] && [ -n "$SUMMER" ] && echo yes || echo no)" "yes"
D='{"error":"Access denied. Program membership required."}'; H=(-H "Authorization: Bearer $AT")
s=$(req "$A/analytics/summary?programId=$SPRING" "${H[@]}"); check "v1 own program (admin) → 200" "$s" "200"
s=$(req "$A/analytics-v2/workouts/types/total?programId=$SUMMER" "${H[@]}"); check "v2 own program (member) → 200" "$s" "200"
s=$(req "$A/analytics/summary?programId=$WINTER" "${H[@]}"); check "v1 foreign → 403" "$s" "403"; check "403 body" "$(body)" "$D"
s=$(req "$A/analytics-v2/participation/mtd?programId=$WINTER" "${H[@]}"); check "v2 foreign → 403" "$s" "403"
s=$(req "$A/analytics/health/steps?programId=$WINTER" "${H[@]}"); check "v1 health/steps foreign → 403" "$s" "403"
s=$(req "$A/analytics/workouts/total" "${H[@]}"); check "missing programId → 400" "$s" "400"; check "400 body" "$(body)" '{"error":"programId is required"}'
s=$(req "$A/analytics/summary?programId=$SPRING&programId=$WINTER" "${H[@]}"); check "array programId → 403" "$s" "403"
s=$(req "$A/analytics/summary?programId=not-a-uuid" "${H[@]}"); check "non-UUID → 500" "$s" "500"; check "500 body" "$(body)" '{"error":"Internal server error."}'
s=$(req "${A%/api}/"); check "process alive after 500" "$s" "200"
s=$(req "$A/analytics/summary?programId=$SPRING"); check "no token → 401" "$s" "401"
echo "== $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
```

**E3. Migration**: none. H1 changes no schema. H3 makes one read-only indexed lookup on `program_memberships`. There is no new env var and no Render config change.

**E4. git-version**: run D1–D8 in order (commit 1 = H1, commit 2 = H3). The user confirms the bumps:
- `auth` 0.9.0 → 0.10.0;
- `analytics` 0.3.2 → 0.4.0;
- `analytics-v2` 0.1.0 → 0.2.0.

All three are MINOR because each changes an owned interface, pre-1.0, and stays backward-compatible. No dependent feature needs a new version. The skill's own LESSONS_ARCHIVE append happens in its own `chore(skills)` commit, per the skill.

**E5. Deploy (the USER confirms the push).**
- `git push origin main && git push origin feature/auth@v0.10.0 feature/analytics@v0.4.0 feature/analytics-v2@v0.2.0`.
- Render auto-deploys `rasifiters-api` (buildFilter `apps/backend/**`). Health check `/` gives zero-downtime deploys.
- Check with the render MCP `list_deploys`:
  - `workspaceId: tea-cv3u7a3tq21c73ald2ig`, `serviceId: srv-d90tgmv7f7vs73cudptg`;
  - status `live` on commit 2's SHA;
  - `curl -s -o /dev/null -w '%{http_code}' https://rasifiters-api.onrender.com/` → 200.
- There is no web change; whatever Vercel build fires is irrelevant.
- **Rollback**, independent per hotfix:
  - H3: `git revert --no-edit <commit-2 sha> && git push origin main`.
  - H1: revert commit 1. This brings the shared-client risk back, so only in an emergency.

**E6. Prod smoke and user check.**
- Run `TESTBED_PASSWORD=… SMOKE_BASE=https://rasifiters-api.onrender.com/api bash phase1b-smoke.sh` (FORCED off). Every line must PASS.
- Then the USER checks on prod:
  - the live iOS app, the live Android app and rasifiters.com, as a standard member and as the global admin;
  - Summary, Lifestyle and the detail screens load for opened programs;
  - the global admin can open any program;
  - nobody is signed out.

**E7.** Docs commit 3 (D9) and push. It does not redeploy the backend (paths outside the buildFilter).

**E8. 7-day log watch (once a day; record H2's timestamp).**
- **(a) Supabase auth logs:**
  ```
  tools/supabase-logs.sh "select log_attributes['status'] as status, log_attributes['error_code'] as error_code, count(*) as n from logs where source = 'auth_logs' and log_attributes['msg'] = 'request completed' and log_attributes['path'] = '/token' and log_attributes['grant_type'] = 'refresh_token' group by status, error_code order by n desc"
  ```
  - Track `refresh_token_already_used` per day against the ≈1.6/day baseline.
  - Track 429 `over_request_rate_limit` against ≈1.3/day.
  - The smoke runs add one `refresh_token_not_found` per run.
- **(b) Cross-user token pairs** (supabase-rasifiters MCP `execute_sql`, read-only):
  ```sql
  with t as (select user_id, created_at, lag(user_id) over (order by created_at) prev_user, lag(created_at) over (order by created_at) prev_at from auth.refresh_tokens where created_at > now() - interval '7 days') select count(*) as cross_user_pairs_lt_200ms from t where prev_user is not null and prev_user <> user_id and created_at - prev_at < interval '200 milliseconds';
  ```
  Expect about 0 (baseline 59 per 30 days).
- **(c) Render logs** (`list_logs`, same `workspaceId` and resource) for these texts: `[refresh] auth_unavailable`, `[refresh] session_invalid`, `[auth] token verification unavailable`. Look for unexpected `code=` values in session_invalid.
- **Gate to Phase 2:** reuse kills and 429s drop, and there is no cross-user refresh.

## Risks the implementer must watch
- The `/refresh` 200 body must be exactly `{token, refresh_token, message:"Token refreshed"}` in that key order, with no extra fields. Android Dtos require a non-null `refresh_token`.
- Never re-send a rotated refresh token in any test. Reuse after 10 s revokes the session family and pollutes the `already_used` metric.
- `makeEphemeralAuthClient`, `logout`, link/unlink `setSession`, `supabaseAdmin`, `authenticateStream`, `/oauth/complete`, `errorHandler` and `server.js` stay untouched. Do NOT route the ephemeral client through `timedFetch`, because auth-js would retry an aborted refresh/setSession for 30 s.
- Change only `authenticateToken`'s catch, not `authenticateStream`'s identical one.
- Unclassified errors in `authenticateToken` stay 401, as today, by design. Only the listed infrastructure codes and Sequelize errors become 503.
- The 401/503 boundary in `supabaseTokenRefresh.js` is load-bearing:
  - wrong toward 503 means a dead token loops forever;
  - wrong toward 401 means users are signed out.
  - Keep the status checks first (≥500, 408, 409, 429), then code-less responses, then config-fault codes. Only then return 401.
- The `requireProgramAccess` guard must:
  - keep its try/catch: Express 4.22 does not catch a rejected async middleware, and there is no `unhandledRejection` handler, so the process would crash;
  - keep the `typeof programId !== "string"` check, which blocks the array-param bypass;
  - pass through a missing `programId`, so the native 400 stays.
- Live Android 1.0.0 still signs out on a 503 from refresh (accepted, D-1, no shim). Web still clears the session on any refresh error. Both are unchanged and fixed in Phase 3.
- A client that remembers a program the user has since left will now get 403 on analytics. That is correct; every client treats a 403 on a data call as an error, not a sign-out.
- Line budgets: `middleware/auth.js` will be about 217 lines and `routes/analytics.js` about 214. This is accepted; splitting them would need files outside the brief.
- Not fixed here, recorded as F12–F14: `supabaseAdmin` calls still have no explicit timeout; login/oauth/re-auth still map transient Supabase failures to 401; the link/unlink `setSession` rotation issue remains.
- H2 (the rate-limit change) is a separate, user-approved admin call and is not part of this code change. Note its timestamp, because it affects the 429 trend in E8.