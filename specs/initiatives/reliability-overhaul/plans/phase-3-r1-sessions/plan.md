# Phase 3 track R1 — plan

# PLAN: Reliability Phase 3, track R1 (sessions/auth backend): per-user rate limits, device-scoped sessions, classified auth errors (revision 2)

**Brief accepted**: yes (15 files)

**Feature/version prediction**:
- `auth` v0.12.1 → v0.13.0, MINOR.
- `observability` v0.1.1 → v0.2.0, MINOR.

Why MINOR: this is a pre-1.0 change to an owned interface. It adds one new route and makes deliberate status changes, each additive or safer for live binaries. No dependent feature needs a re-version.

**Surfaces in scope**: [backend] plus its docs.
- web / ios / android: none in this plan. The bundled client release is planned separately against auth SPEC §3.1 and observability §8.

**Build gate**: implementation starts after the Phase 1b watch closes clean on 2026-10-19 (HANDOFF "Next action" 3), unless the user lifts the gate.

**Migration**: none. 011 is not used.

### What changed from the adversary verdict

1. **BLOCKING #1 (accepted and verified against the source).**
   - The facts, from supabase/auth master:
     - The admin password update ends every session (`internal/api/admin.go:268` → `user.UpdatePassword(tx, nil)` → `Logout`, at `internal/models/user.go:458-464`).
     - `PUT /user` passes the caller's session and calls `LogoutAllExceptMe` (`internal/api/user.go:207-214`).
   - Live config, read today:

     | Setting | Value |
     |---|---|
     | `security_update_password_require_reauthentication` | false |
     | `security_update_password_require_current_password` | false |
     | `mailer_notifications_password_changed_enabled` | false |
     | `rate_limit_otp` (which also limits `PUT /user`) | 30 |

   - The fix:
     - `/change-password` and `/set-password` now call GoTrue `PUT /user {password}` with the caller's Bearer. That is scope "others" in one call; this device stays signed in.
     - `/reset-password` keeps the admin update. It already ends every session, which is the intended "global".
     - `revokeAfterPasswordChange` is gone.
   - New behavior to call out: the same password gives `400`. Staging checks for `+stg` accounts explicitly, because `PUT /user` bypasses `guardAdminAuth`.
   - The board premise is corrected (orchestrator handoff H2).
2. **#2:** comments no longer contain `setSession`. The grep also skips full-line comments and uses absolute paths.
3. **#3:** `logError` appends the first 2 stack frames. They are code locations only; message lines are skipped exactly.
4. **#4:** R1 owns `errorHandler.js` for Phase 3 (no other track edits it). `routes/auth.js` keeps every R3-relevant line's shape (`const result = …; res.json(result)`), and only `ip: req.ip` is appended. The merge order is in the cross-track risks.
5. **#5:** the notifications SPEC text is handed to R3 with the exact strings (H1).
6. **#6:** no `…` paths remain.
7. **#7:** the admin budget is now **15 s**, so a slow but successful write is almost never cut off. The user acknowledges F18 at approval (A1).
8. **#8:** D-C9 now says "Done in 0.2.0". §3.1 states that a client read timeout counts like 503.
9. **#9:** the IP-forwarding wording is precise: the header is honoured on secret-key requests only, and the gateway enforces that.

### Resolved open questions

1. **`sessions_inactivity_timeout` unit:** the unit is hours, so 2160 = 90 days (Management API spec; BRIEF records the Pro plan). If the call is refused on plan grounds, D-5 is deferred (G4).
2. **Where the secret key goes:**
   - Direct calls send an `sb_…` key on `apikey` only.
   - The SDK path sends `apikey` plus the key as Bearer, which is what Supabase's own forwarding example does.
   - Any key fault surfaces as 503, never as a sign-out or "Invalid credentials".
   - Staging proves it first (G1). Kill switch = unset `SUPABASE_SECRET_KEY`.
3. **Server-side auth events:** deferred (observability D-C9). Forced sign-outs are client-reported, and the event names are registered in §8.
4. **Password routes:**

   | Route | Call | Sessions ended | Notes |
   |---|---|---|---|
   | `/change-password` | GoTrue `PUT /user` | others | this device stays signed in |
   | `/set-password` | GoTrue `PUT /user` | others | before 0.13.0 it ended every session, this device included |
   | `/reset-password` | admin update | all, the recovery session included | |

   No best-effort second call remains.
5. **Sign out everywhere:** `POST /logout-all`, scope `global` (= "others" + this device). It does not touch push tokens; those are R3's.
6. **`/logout`:** uses the Bearer first. It falls back to exchanging the body refresh token only if GoTrue rejects the Bearer, and never on an outage.
7. **Budgets:**
   - Admin calls: 15 s, classified 503.
   - User-on-behalf calls: 5 s.
   - `/recover`: 5 s.
   - A timed-out `PUT /email` update is reverted fire-and-forget.
   - An orphaned `createUser` is flagged F18.
8. **Credential 401s on authenticated routes:** yes, they become 400 (D-C15d).
   - Live iOS signs the user out after a second 401 (`APIClient.swift:66-80`).
   - Live Android's authenticator has no prior-response check (`Network.kt:79-103`).
9. **Google code-exchange failures:** yes. A timeout, 429, 5xx, or 200 without `id_token` becomes 503.
10. **Notifications SPEC wording:** R3, with exact text (H1).
11. **Gate:** unchanged.

### Approval acknowledgements (user, at plan approval)

- **A1 — admin timeout:** the 15 s timeout also covers `members` / `program-memberships` `createUser`, whose files still map any error to `400 "…already exists"`.
  - On a Supabase hang longer than 15 s they answer that 400 instead of hanging.
  - A write that lands after 15 s leaves an orphan auth user.
  - This is recorded only in auth F18. It is rare: admin calls answer in tens of ms.
- **A2 — password changes:**
  - Changing or setting a password keeps this device signed in and signs out the other devices at their next refresh. That is better than today, where the changing device was signed out too.
  - Re-using the current password now gives a 400.
- **A3 — inactivity timeout:** once G4 is live, a session unused for more than 90 days ends at its next open (W1: 197 of 270 sessions were idle more than 30 days). Reset-password ending every session is unchanged behavior.

### Orchestrator handoffs (outside the implementer's file set)

- **H1 → R3's plan** (R3 owns `specs/features/notifications/SPEC.md`):
  - Line 95: replace `` `401` (stream: no/invalid token) `` with `` `401` (stream: no/invalid token), `503 { error, code: "auth_unavailable" }` + `Retry-After: 5` (stream: JWKS/network/TLS/DB failure while verifying — auth D-C15c, auth 0.13.0) ``.
  - Line 118: replace `` `401` on missing/invalid. `` with `` `401` on missing/invalid; `503 auth_unavailable` on an infrastructure failure (auth D-C15c, 0.13.0). ``.
- **H2 → DESIGN_BOARD.md:55-57.** Replace "(`scope:'others'` — today it revokes nothing)" with "(`scope:'others'` — corrected 2026-10: today GoTrue's admin password update ends *every* session, this device's too; 0.13.0 uses GoTrue `PUT /user`, which ends only the others)".
- **H3 — doc drift:**
  - `specs/pages/REGISTRY.md:142`: change `POST /auth/change-password` to `PUT`.
  - `apps/backend/CONTEXT.md:43`: add `SUPABASE_SECRET_KEY` to its key list.

## Steps — backend

### 1. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/logError.js`

The signature is fixed for R2 and R3: `logError(tag: string, err: unknown): void`.

```js
// One log line for a caught error — observability D-C11 (resolves F8 for every file that adopts it). Prints the tag, the
// error's name, code and HTTP status, its message (≤ 200 chars) and its first two stack frames (code locations only) —
// NEVER the error object: a Sequelize error carries its SQL and bound parameter values (emails, usernames, push tokens)
// and a body-parser error the raw body. A Sequelize* error prints name + Postgres error code only (its message can echo
// inserted values).
// The one pattern every track reuses:   catch (err) { logError("[members] update failed:", err); … }
// Lives next to utils/response.js (auth reference_impl) — every feature already depends on auth, so no graph cycle.
const MAX_MESSAGE_CHARS = 200;
const MAX_FRAMES = 2;

// "at fn (file:line:col)" lines from err.stack — where it failed, never what it carried. The stack's header
// ("<name>: <message>", as many lines as the message has) is skipped whole.
const topFrames = (err) => {
    if (typeof err?.stack !== "string") return [];
    const headerLines = String(err.message ?? "").split("\n").length;
    return err.stack
        .split("\n")
        .slice(headerLines)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("at "))
        .slice(0, MAX_FRAMES);
};

function logError(tag, err) {
    const name = (err && typeof err.name === "string" && err.name) || "Error";
    if (name.startsWith("Sequelize")) {
        console.error("%s %s code=%s", tag, name, err.parent?.code || err.original?.code || "-");
        return;
    }
    const code = (err && (err.code ?? err.cause?.code)) || "-";
    const status = (err && (err.status ?? err.statusCode)) || "-";
    const message = typeof err?.message === "string" ? err.message.slice(0, MAX_MESSAGE_CHARS) : "";
    const frames = topFrames(err);
    console.error("%s %s code=%s status=%s %s%s", tag, name, code, status, message,
        frames.length ? ` [${frames.join(" | ")}]` : "");
}

module.exports = { logError };
```

### 2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/errorHandler.js`

Replace the whole file (22 lines). In Phase 3, R1 is the only track that edits this file.

```js
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");

// An express.json() failure: a 4xx `status` with a string `type` ("entity.parse.failed", "entity.too.large",
// "charset.unsupported", "encoding.unsupported", …) or http-errors' `expose` flag (a corrupt gzip/deflate body carries
// no `type`). Its `err.body` holds the raw request body — never logged (observability D-C10: a malformed-JSON login
// carried its password).
const isBodyParserError = (err) =>
    Boolean(err) &&
    typeof err === "object" &&
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 500 &&
    (typeof err.type === "string" || err.expose === true);

const errorHandler = (err, req, res, _next) => {
    if (err instanceof AppError) {
        // observability D-C11 (b): echo the machine code + Retry-After, like routes/auth.js (additive).
        if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        return res.status(err.statusCode).json(body);
    }

    // observability D-C11 (a) — resolves F2: a body-parser failure keeps its real 4xx in the frontend-kit vocabulary on
    // EVERY route (was 500) — the mapping routes/clientEvents.js has used since 0.1.0.
    if (isBodyParserError(err)) {
        console.warn("Rejected request body: %s %s", err.type || err.name, err.status);
        if (err.status === 413) {
            return res.status(413).json({ error: "Payload too large.", code: "payload_too_large" });
        }
        return res.status(err.status).json({ error: "Invalid request body.", code: "invalid_body" });
    }

    // observability D-C11 (c): name / code / status / message / top frames only — never the error object (a Sequelize
    // error carries its SQL + bound values; any error may carry a request `body`).
    logError("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error." });
};

module.exports = { errorHandler };
```

### 3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js`

Replace the whole file. The JWT-verification block (old lines 57-81) is reproduced unchanged.

```js
// Supabase clients + JWT verification — the R1 auth migration plumbing.
// See specs/features/auth/SPEC.md §6/§7 + METHODOLOGY R1.
//
// NO module-level client ever holds a USER session (auth SPEC D-C11 — reliability-overhaul D-1). On a server,
// auth-js runs lock-less, so a shared client could hand one user's in-flight refresh to another caller,
// refresh its last stored session (someone else's) first, and silently replay a refresh token for up to 30 s.
//   • makeRequestAuthClient(ip) — a FRESH client per request for the proxied public flows (signInWithPassword,
//                                 signInWithIdToken, resetPasswordForEmail); every fetch times out after
//                                 AUTH_HTTP_TIMEOUT_MS.
//   • supabaseAdmin             — service-role key; admin ops (createUser / updateUserById / deleteUser /
//                                 getUserById). Holds no user session, so it stays shared. Every fetch times out
//                                 after ADMIN_HTTP_TIMEOUT_MS (D-C14).
//   • Calls made WITH a user's access or refresh token (refresh, logout, sign out everywhere, own-password change,
//     link, unlink) use no client: services/supabaseTokenRefresh.js gotrueFetch calls GoTrue directly.
//   • Per-user rate limits (D-C14): every call made on a user's behalf authenticates with userAuthKey() — the secret
//     API key SUPABASE_SECRET_KEY (sb_secret_…) when set, else SUPABASE_ANON_KEY — and, with the secret key only,
//     sends the end user's IP as Sb-Forwarded-For (forwardedForHeaders). Supabase honours that header only on
//     secret-key requests (its API gateway enforces this) and only once Auth "IP address forwarding"
//     (security_sb_forwarded_for_enabled) is on; Auth then rate-limits per end user instead of per Render IP.
//   • On staging (APP_ENV=staging) supabaseAdmin's createUser / updateUserById / deleteUser are wrapped once by
//     utils/stagingGuard.guardAdminAuth (SPEC D-C13) — only +stg accounts may be touched. A no-op in prod.
// Plus verifySupabaseJwt(): verify a Supabase-issued access token via the project's JWKS (D-C2 —
// asymmetric ES256 keys), returning the decoded payload (its `sub` = auth.users.id). The JWKS fetch uses jose's own
// 5 s timeout.
const net = require("node:net");
const { createClient } = require("@supabase/supabase-js");
const { guardAdminAuth } = require("../utils/stagingGuard");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// D-C11 budgets: every outbound auth call the proxy makes on a user's behalf (Supabase Auth, Google's token
// endpoint) gives up after 5 s; a 503 auth_unavailable tells the client to retry after AUTH_RETRY_AFTER_SECONDS.
const AUTH_HTTP_TIMEOUT_MS = 5000;
const AUTH_RETRY_AFTER_SECONDS = 5;
// D-C14 (resolves F15): admin calls get 15 s — they normally answer in tens of ms, but createUser / updateUserById are
// writes that can still land after we give up (auth F18), so we wait long before calling Supabase unavailable.
const ADMIN_HTTP_TIMEOUT_MS = 15000;

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

const secretKey = () => (process.env.SUPABASE_SECRET_KEY || "").trim();

// D-C14: the API key for every call made on a user's behalf — the secret key when set, else the anon key (the
// pre-0.13.0 behaviour). Read per call: unsetting SUPABASE_SECRET_KEY + a redeploy is the kill switch.
const userAuthKey = () => secretKey() || process.env.SUPABASE_ANON_KEY;

// D-C14: { "Sb-Forwarded-For": <end-user IP> } — only with the secret key and only for a valid IP literal. `ip` =
// req.ip (Express `trust proxy` 2 — the address Render's edge saw, observability D-C7). An IPv4-mapped IPv6 address
// (::ffff:a.b.c.d) is sent as plain IPv4. Anything else → {} (header omitted).
const forwardedForHeaders = (ip) => {
    if (!secretKey() || typeof ip !== "string") return {};
    const unmapped = ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7)) ? ip.slice(7) : ip;
    return net.isIP(unmapped) ? { "Sb-Forwarded-For": unmapped } : {};
};

// fetch with a fixed timeout. A caller-supplied signal (auth-js passes none today) is kept as-is.
const timedFetch = (ms) => (input, init = {}) =>
    fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(ms) });

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    ...serverClientOptions,
    global: { fetch: timedFetch(ADMIN_HTTP_TIMEOUT_MS) }
});
guardAdminAuth(supabaseAdmin.auth.admin); // staging only (D-C13); returns immediately in prod

// A FRESH client per request (D-C11): its in-memory session dies with the request, so no other caller can ever
// read, refresh or inherit it. D-C14: authenticates with userAuthKey() and forwards the caller's IP.
const makeRequestAuthClient = (ip = null) =>
    createClient(SUPABASE_URL, userAuthKey(), {
        ...serverClientOptions,
        global: { fetch: timedFetch(AUTH_HTTP_TIMEOUT_MS), headers: forwardedForHeaders(ip) }
    });

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
    makeRequestAuthClient,
    userAuthKey,
    forwardedForHeaders,
    verifySupabaseJwt,
    AUTH_HTTP_TIMEOUT_MS,
    AUTH_RETRY_AFTER_SECONDS,
    ADMIN_HTTP_TIMEOUT_MS
};
```

`makeEphemeralAuthClient` is deleted. After steps 5 and 6 it has no callers.

### 4. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/supabaseTokenRefresh.js`

Replace the whole file. The `[refresh] …` log formats are unchanged, because the watch queries grep for them.

```js
// Direct GoTrue calls (no SDK) + auth failure classification — auth SPEC D-C11 / D-C14 / D-C15.
// gotrueFetch = ONE request to {SUPABASE_URL}/auth/v1/… : no client object, no stored session, a 5 s timeout and NO
// automatic retry (auth-js re-sends a refresh token for up to 30 s on network/5xx errors; a token re-sent after
// Supabase already rotated it trips reuse detection and revokes the whole session). It authenticates with
// userAuthKey() (the secret key when set) and forwards the caller's IP as Sb-Forwarded-For (D-C14). Used by
// POST /auth/refresh (exchangeRefreshToken, below) and services/authSessionService.js (logout, sign out everywhere,
// own-password change, identity link / unlink).
// Refresh failures are classified so a client signs out only when its token is truly dead:
//   401 session_invalid  — Supabase rejected THIS token with a non-transient 4xx: refresh_token_not_found,
//                          refresh_token_already_used, session_not_found, session_expired, user_not_found,
//                          user_banned, invalid_grant — or any other non-retryable 4xx with an auth error code
//                          (e.g. validation_failed): re-sending the same token can never succeed.
//   503 auth_unavailable — 408 / 409 (concurrent refresh) / 429 / 5xx, a 4xx with no auth error code (gateway)
//                          or an API-key fault (bad_jwt / no_authorization — our config, not the user's token),
//                          a network error, our 5 s timeout, or a 2xx without tokens. Sent with Retry-After.
// Other paths: isTransientAuthError (an auth-js error from an SDK call) and classifyUserCall (a direct call made with
// the user's own access token). Logs carry status + Supabase error code only — never a token or a user identifier.
const { AppError } = require("../utils/response");
const {
    AUTH_HTTP_TIMEOUT_MS,
    AUTH_RETRY_AFTER_SECONDS,
    userAuthKey,
    forwardedForHeaders
} = require("../config/supabase");

const TRANSIENT_STATUSES = new Set([408, 409, 429]);
const CONFIG_FAULT_CODES = new Set(["bad_jwt", "no_authorization"]);
// Made with the USER's access token, these codes mean that token, its session or its user is gone / invalid.
const SESSION_REJECTION_CODES = new Set([
    "bad_jwt", "no_authorization", "session_not_found", "session_expired", "user_not_found"
]);

const sessionInvalid = () => new AppError(401, "Invalid refresh token", { code: "session_invalid" });

const authUnavailable = () =>
    new AppError(503, "Authentication service temporarily unavailable", {
        code: "auth_unavailable",
        retryAfter: AUTH_RETRY_AFTER_SECONDS
    });

// One log line (tag, error name, HTTP status, Supabase code — never a token, an email or a user id) + the 503.
const authUnavailableFor = (tag, err) => {
    console.error("%s auth_unavailable: %s status=%s code=%s",
        tag, err?.name || "-", err?.status ?? "-", err?.code || "-");
    return authUnavailable();
};

// GoTrue error bodies: API version 2024-01-01 → { code: "<error_code>", message }; legacy →
// { code: <http status>, error_code, msg }; OAuth-style → { error: "invalid_grant", error_description }.
const readErrorCode = (body) => {
    if (!body || typeof body !== "object") return null;
    if (typeof body.code === "string") return body.code;
    if (typeof body.error_code === "string") return body.error_code;
    if (typeof body.error === "string") return body.error;
    return null;
};

// The human text in a GoTrue error body (msg / message / error_description), else "".
const readErrorMessage = (body) => {
    if (!body || typeof body !== "object") return "";
    for (const key of ["msg", "message", "error_description"]) {
        if (typeof body[key] === "string" && body[key]) return body[key];
    }
    return "";
};

const isTransientStatus = (status) => status === 408 || status === 429 || status >= 500;

// D-C15: an auth-js error (returned by an SDK call — sign-in, id-token sign-in, recovery, admin) that means Supabase or
// the network failed, not the user's input: AuthRetryableFetchError (our timeout / a network error, status 0, or a
// 502/503/504/52x gateway), AuthUnknownError (a non-JSON error body), a code-less 401 (the API gateway rejecting our
// key), an API-key fault code, or any 408 / 429 / 5xx. A wrong password (400 invalid_credentials) is NOT transient.
const isTransientAuthError = (error) => {
    if (!error) return false;
    if (error.name === "AuthRetryableFetchError" || error.name === "AuthUnknownError") return true;
    if (!error.code && error.status === 401) return true;
    if (CONFIG_FAULT_CODES.has(error.code)) return true;
    return isTransientStatus(error.status);
};

// D-C14/D-C15: a direct call made with the USER's access token → "ok" (2xx) · "unavailable" (408/429/5xx, or an error
// body without an auth error code — a gateway / API-key fault) · "session" (401, or the token / its session / its
// user rejected) · "rejected" (any other 4xx — GoTrue refused the request itself).
const classifyUserCall = ({ status, code }) => {
    if (status >= 200 && status < 300) return "ok";
    if (isTransientStatus(status) || !code) return "unavailable";
    if (status === 401 || SESSION_REJECTION_CODES.has(code)) return "session";
    return "rejected";
};

// ONE direct GoTrue call. `jwt` = the user's access token for session-bound calls. Without it, a legacy (JWT) key is
// also sent as the Bearer, exactly as before 0.13.0; a new-style sb_… key goes on `apikey` only (Supabase: those keys
// are not JWTs and belong on the apikey header). Resolves { status, ok, body, code } for any HTTP answer (body =
// parsed JSON or null — e.g. /logout's 204); a network error or the 5 s timeout logs one line and throws the 503.
async function gotrueFetch(path, { method = "POST", jwt = null, ip = null, body, tag = "[auth]" } = {}) {
    const key = userAuthKey() || "";
    const bearer = jwt || (key.startsWith("sb_") ? null : key);
    let res;
    try {
        res = await fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
            method,
            headers: {
                ...(body === undefined ? {} : { "Content-Type": "application/json;charset=UTF-8" }),
                apikey: key,
                ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
                "X-Supabase-Api-Version": "2024-01-01",
                ...forwardedForHeaders(ip)
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(AUTH_HTTP_TIMEOUT_MS)
        });
    } catch (err) {
        // TimeoutError (our 5 s budget) or TypeError "fetch failed" (DNS / connect / reset).
        console.error("%s auth_unavailable: %s %s", tag, err?.name || "Error", err?.cause?.code || "");
        throw authUnavailable();
    }
    const parsed = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: parsed, code: readErrorCode(parsed) };
}

// Exchange a refresh token for { access_token, refresh_token } or throw a classified AppError (D-C11). `tag` names the
// caller in the log: "[refresh]" for POST /auth/refresh, "[logout]" when logout exchanges a body refresh token.
async function exchangeRefreshToken(refreshToken, ip = null, tag = "[refresh]") {
    const { status, ok, body, code } = await gotrueFetch("/token?grant_type=refresh_token", {
        body: { refresh_token: refreshToken },
        ip,
        tag
    });

    if (ok) {
        if (body?.access_token && body?.refresh_token) {
            return { access_token: body.access_token, refresh_token: body.refresh_token };
        }
        console.error("%s auth_unavailable: status=%d without tokens", tag, status);
        throw authUnavailable();
    }

    if (status >= 500 || TRANSIENT_STATUSES.has(status) || !code || CONFIG_FAULT_CODES.has(code)) {
        console.error("%s auth_unavailable: status=%d code=%s", tag, status, code || "none");
        throw authUnavailable();
    }

    console.warn("%s session_invalid: status=%d code=%s", tag, status, code);
    throw sessionInvalid();
}

module.exports = {
    exchangeRefreshToken,
    gotrueFetch,
    authUnavailable,
    authUnavailableFor,
    isTransientAuthError,
    classifyUserCall,
    readErrorMessage
};
```

### 5. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authSessionService.js`

```js
// Session-bound GoTrue calls — auth SPEC D-C14 (reliability-overhaul Phase 3 R1; DESIGN_BOARD §2 backend 4).
// Every call here is made WITH the user's own access token, straight to GoTrue through gotrueFetch
// (services/supabaseTokenRefresh.js: no SDK client, no stored session, 5 s timeout, no retry, user IP forwarded):
//   • logout            POST /auth/logout       → THIS device's session only (GoTrue /logout?scope=local)
//   • logoutEverywhere  POST /auth/logout-all   → every session of the user (scope=global)
//   • updateOwnPassword PUT /auth/change-password + POST /auth/set-password → GoTrue PUT /user: sets the password and, in
//                       the same transaction, ends the user's OTHER sessions — this device stays signed in.
//                       (/reset-password keeps the admin update, which ends EVERY session — authService.resetPassword.)
//   • linkIdToken / deleteIdentity → the identity link grant + unlink for authService.linkProvider / unlinkProvider.
//     No SDK session is restored, so there is no refresh-token rotation the client never sees (resolves F13).
// GoTrue ends sessions by the session_id inside the access token. Other devices end at their next refresh (401
// session_invalid); access tokens they already hold stay valid until they expire (≤ 1 h — stateless JWTs, D-C2).
const { supabaseAdmin } = require("../config/supabase");
const {
    gotrueFetch,
    exchangeRefreshToken,
    classifyUserCall,
    authUnavailableFor,
    isTransientAuthError,
    readErrorMessage
} = require("./supabaseTokenRefresh");
const { AppError } = require("../utils/response");
const { isStaging, assertStagingAccount } = require("../utils/stagingGuard");

const SAME_PASSWORD_MESSAGE = "New password must be different from your current password.";

// POST /logout?scope=… with the user's access token → "ok" (revoked) · "session" (the token, its session or its user
// is already gone / invalid) · "rejected" (GoTrue refused for another reason). Throws 503 auth_unavailable on a
// network error, the timeout, 408 / 429 / 5xx or a code-less error.
async function revokeSessions(accessToken, scope, ip) {
    const tag = `[logout:${scope}]`;
    const res = await gotrueFetch(`/logout?scope=${scope}`, { jwt: accessToken, ip, tag });
    const outcome = classifyUserCall(res);
    if (outcome === "unavailable") throw authUnavailableFor(tag, res);
    return outcome;
}

// POST /auth/logout (D-C14). Best-effort + idempotent like the legacy logout: always { message: "Logged out" } once a
// credential is sent. The Bearer (Android sends one) is used first; if GoTrue rejects it (expired, already revoked)
// and a body refresh_token was sent (iOS sends only that), the refresh token is exchanged for a fresh access token
// first — one rotation of a session that is ending. An outage ends the attempt (no second 5 s call).
async function logout({ refreshToken, accessToken, ip }) {
    if (!refreshToken && !accessToken) throw new AppError(400, "Refresh token required");
    try {
        if (accessToken && (await revokeSessions(accessToken, "local", ip)) === "ok") return { message: "Logged out" };
        if (refreshToken) {
            const session = await exchangeRefreshToken(refreshToken, ip, "[logout]");
            await revokeSessions(session.access_token, "local", ip);
        }
    } catch (_) {
        // A dead token, a timeout or an outage — each already logged where it happened. Logout stays best-effort.
    }
    return { message: "Logged out" };
}

// Staging (D-C13; DESIGN_BOARD §8): a login-level change made with the user's own token bypasses guardAdminAuth, so
// the account is checked here — only +stg accounts. Callers invoke it only when isStaging().
async function assertStagingUser(authUserId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    if (isTransientAuthError(error)) throw authUnavailableFor("[staging-guard]", error);
    assertStagingAccount(error ? null : data?.user?.email);
}

// POST /auth/logout-all (D-C14): every session of the user, this device's included. A rejected token → 401 so the
// client refreshes once and retries (if its refresh is rejected too, it is signed out anyway).
async function logoutEverywhere({ accessToken, authUserId, ip }) {
    if (isStaging()) await assertStagingUser(authUserId);
    const outcome = await revokeSessions(accessToken, "global", ip);
    if (outcome !== "ok") throw new AppError(401, "Invalid token.");
    return { message: "Logged out everywhere" };
}

// GoTrue PUT /user { password } with the user's access token (D-C14b). Returns on success; throws 503 on an outage,
// 401 when the session behind the token is gone, 400 when GoTrue refuses the password (same password → its own text;
// weak_password → GoTrue's text; anything else → `failMessage`, the route's pre-0.13.0 400 text).
async function updateOwnPassword(accessToken, password, ip, failMessage) {
    const res = await gotrueFetch("/user", {
        method: "PUT",
        jwt: accessToken,
        ip,
        tag: "[password]",
        body: { password }
    });
    const outcome = classifyUserCall(res);
    if (outcome === "ok") return;
    if (outcome === "unavailable") throw authUnavailableFor("[password]", res);
    if (outcome === "session") throw new AppError(401, "Session expired. Sign in again to change your password.");
    if (res.code === "same_password") throw new AppError(400, SAME_PASSWORD_MESSAGE);
    console.warn("[password] rejected: status=%s code=%s", res.status, res.code);
    throw new AppError(400, (res.code === "weak_password" && readErrorMessage(res.body)) || failMessage);
}

// The identity link grant (what auth-js linkIdentityIdToken does, minus the SDK). GoTrue answers with a NEW session for
// the linked identity; the caller discards it — its refresh token never leaves the server (D-C14).
const linkIdToken = (accessToken, { provider, idToken, nonce }, ip) =>
    gotrueFetch("/token?grant_type=id_token", {
        jwt: accessToken,
        ip,
        tag: "[link]",
        body: { provider, id_token: idToken, link_identity: true, ...(nonce ? { nonce } : {}) }
    });

const deleteIdentity = (accessToken, identityId, ip) =>
    gotrueFetch(`/user/identities/${encodeURIComponent(identityId)}`, {
        method: "DELETE",
        jwt: accessToken,
        ip,
        tag: "[unlink]"
    });

module.exports = { logout, logoutEverywhere, assertStagingUser, updateOwnPassword, linkIdToken, deleteIdentity };
```

### 6. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js`: targeted edits

- Line numbers are those of the ORIGINAL file. Apply the edits **from the bottom up** (6s first, 6a last) so every anchor stays valid.
- **Do NOT touch** `upsertPushToken` / `removePushToken` (91-125), or the push-upsert blocks in `loginGlobal` (151-154) and `socialSignIn` (480-484). Those belong to R3.

**6s.** In `module.exports` (737-759):
- Delete the line `    logout,`.
- Replace the line `    changePassword,` with:

```js
    changePassword,
    resetPassword,
```

**6r.** Changes in `requestPasswordReset`:
- Line 672 becomes `async function requestPasswordReset(emailRaw, ip = null) {`.
- Line 679 becomes `            const { error } = await makeRequestAuthClient(ip).auth.resetPasswordForEmail(`.

**6q.** Replace lines 602-665 (`changeEmail`) with the code below. The comment block at 595-601 stays.

```js
async function changeEmail(memberId, newEmailRaw, password, ip = null) {
    const newEmail = normalizeEmail(newEmailRaw);
    if (!newEmail || !EMAIL_RE.test(newEmail)) {
        throw new AppError(400, "A valid email address is required.");
    }
    if (!password) throw new AppError(400, "Current password is required.");

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Account not found.");

    // Re-auth: verify the current password against the member's current email.
    const currentEmail = await resolvePrimaryEmail(member.id);
    if (!currentEmail) throw new AppError(404, "Account email not found.");
    const { data: signInData, error: signInError } =
        await makeRequestAuthClient(ip).auth.signInWithPassword({ email: currentEmail, password });
    if (isTransientAuthError(signInError)) throw authUnavailableFor("[change-email] re-auth", signInError);
    if (signInError || !signInData?.session) {
        // D-C15d: 400, not 401 — on an authenticated route live clients read a 401 as an ended session.
        throw new AppError(400, "Current password is incorrect.");
    }

    if (newEmail === currentEmail) {
        throw new AppError(400, "This is already your email.");
    }

    // Uniqueness: reject if the email belongs to a different member.
    const existingEmail = await MemberEmail.findOne({ where: { email: newEmail } });
    if (existingEmail && existingEmail.member_id !== member.id) {
        throw new AppError(400, "Email already in use.");
    }

    // Apply to Supabase first (email_confirm:true → no verification step, parity with register).
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
        email: newEmail,
        email_confirm: true
    });
    if (isTransientAuthError(updateErr)) {
        // D-C15: the update may still land after our timeout — put the old email back (best-effort, not awaited so the
        // 503 is not delayed by a second admin budget) so auth.users and member_emails never drift apart.
        void revertAuthEmail(member.auth_user_id, currentEmail);
        throw authUnavailableFor("[change-email] update", updateErr);
    }
    if (updateErr) throw new AppError(400, "Email already in use.");

    // Then move the primary member_emails row. If this fails, revert Supabase so the two stay in sync.
    const primary = await MemberEmail.findOne({
        where: { member_id: member.id, is_primary: true }
    });
    const transaction = await sequelize.transaction();
    try {
        if (primary) {
            await primary.update({ email: newEmail }, { transaction });
        } else {
            await MemberEmail.create(
                { member_id: member.id, email: newEmail, is_primary: true },
                { transaction }
            );
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        await revertAuthEmail(member.auth_user_id, currentEmail);
        throw new AppError(500, "Failed to update email.");
    }

    return { message: "Email updated successfully.", email: newEmail };
}

// Best-effort: set the auth user's email back (changeEmail compensation). Never throws.
async function revertAuthEmail(authUserId, email) {
    try {
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { email, email_confirm: true });
    } catch (_) { /* best-effort revert */ }
}
```

**6p.** Replace lines 578-593 (`changePassword`) with:

```js
// PUT /change-password (D-C14b): GoTrue PUT /user with the member's own Bearer — sets the password and, in the same
// transaction, ends the member's OTHER sessions; this device stays signed in. (Before 0.13.0 this was the admin update,
// which ends EVERY session — this device's too, at its next refresh.)
async function changePassword(memberId, newPassword, { accessToken = null, ip = null } = {}) {
    if (!newPassword) throw new AppError(400, "new_password is required.");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Credentials not found.");
    if (isStaging()) await assertStagingUser(member.auth_user_id); // D-C13 — PUT /user bypasses the admin guard

    await updateOwnPassword(accessToken, newPassword, ip, "Server error during password change.");
    return { message: "Password changed successfully." };
}

// POST /reset-password (D-C5 / D-C14b): the admin update — GoTrue's admin password update ends EVERY session of the
// user, the recovery session included (its refresh token travelled in the email-link URL). Behaviour unchanged since
// 0.4.0; a password write is idempotent, so a 503 is safe to retry.
async function resetPassword(memberId, newPassword) {
    if (!newPassword) throw new AppError(400, "new_password is required.");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Credentials not found.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
        password: newPassword
    });
    if (isTransientAuthError(error)) throw authUnavailableFor("[reset-password]", error);
    if (error) throw new AppError(400, "Server error during password change.");

    return { message: "Password changed successfully." };
}
```

**6o.** In `completeSocialRegistration`, replace lines 520-521 with:

```js
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    if (isTransientAuthError(userErr)) throw authUnavailableFor("[oauth/complete]", userErr);
    if (userErr || !userData?.user) throw new AppError(401, "Invalid session.");
```

**6n.** In `socialSignIn`, replace lines 434-439 (through the `if (error || !data?.session || !data?.user) {` line) with the block below. Lines 440-446 stay.

```js
    const { data, error } = await makeRequestAuthClient(options.ip).auth.signInWithIdToken({
        provider,
        token: id_token,
        ...(nonce ? { nonce } : {})
    });
    if (isTransientAuthError(error)) throw authUnavailableFor("[socialSignIn]", error);
    if (error || !data?.session || !data?.user) {
```

**6m.** Replace lines 410-420 (`setPassword`) with:

```js
// D-C14b: GoTrue PUT /user with the caller's Bearer — the member's OTHER sessions end, this one stays. (Before 0.13.0
// this was the admin update, which ends EVERY session, this one included.)
async function setPassword(memberId, newPassword, { accessToken = null, ip = null } = {}) {
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);
    const { member, user } = await getAuthUser(memberId);
    assertStagingAccount(user.email); // staging only (SPEC D-C13) — PUT /user bypasses the admin guard
    await updateOwnPassword(accessToken, newPassword, ip, "Could not set password.");
    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    // Authoritative: we just set the password, so has_password is true regardless of whether GoTrue surfaced
    // an "email" identity row (login via signInWithPassword works on encrypted_password directly).
    return { message: "Password set successfully.", ...buildIdentitiesResponse(refreshed?.user, { forcePassword: true }) };
}
```

**6l.** Replace lines 342-408 (`linkProvider` and `unlinkProvider`) with:

```js
async function linkProvider(memberId, { provider, id_token, nonce, code, accessToken, ip }) {
    const allowed = ["google", "apple"];
    if (!provider || !allowed.includes(provider)) throw new AppError(400, "Unsupported provider.");
    if (!accessToken) throw new AppError(400, "Session required to link an account.");

    // WEB sends a one-time Google auth `code` (custom-button flow) → exchange for an id_token here. A rejected code is
    // 400 on this authenticated route (D-C15d).
    if (!id_token && code) {
        if (provider !== "google") throw new AppError(400, "Auth-code exchange is Google-only.");
        id_token = await exchangeGoogleAuthCode(code, 400);
    }
    if (!id_token) throw new AppError(400, "Missing provider token.");

    const { member, user } = await getAuthUser(memberId);
    assertStagingAccount(user.email); // staging only (SPEC D-C13) — never re-bind a real login's identities

    // D-C14 (resolves F13): the link grant straight to GoTrue with the caller's verified access token — no SDK session,
    // so no hidden refresh-token rotation. The new session GoTrue answers with is discarded.
    const res = await linkIdToken(accessToken, { provider, idToken: id_token, nonce }, ip);
    const outcome = classifyUserCall(res);
    if (outcome === "unavailable") throw authUnavailableFor("[link]", res);
    if (outcome === "session") throw new AppError(401, "Session expired. Sign in again to manage linked accounts.");
    if (outcome === "rejected") {
        const msg = readErrorMessage(res.body);
        console.error("[linkProvider] provider=%s rejected — code=%s status=%s msg=%s",
            provider, res.code, res.status, msg);
        const lower = msg.toLowerCase();
        if (lower.includes("already") || lower.includes("exists") || res.status === 422) {
            throw new AppError(409, `That ${providerLabel(provider)} account is already linked to a different account.`);
        }
        if (res.code === "manual_linking_disabled" || lower.includes("manual linking") ||
            lower.includes("not enabled") || lower.includes("disabled")) {
            throw new AppError(400, "Account linking is not available right now.");
        }
        // D-C15d: 400 (was 401) — the provider token was refused, not the session.
        throw new AppError(400, msg ? `Link failed: ${msg}` : "Could not link that account.");
    }

    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    return { message: `${providerLabel(provider)} account linked.`, ...buildIdentitiesResponse(refreshed?.user) };
}

async function unlinkProvider(memberId, { provider, accessToken, ip }) {
    const allowed = ["google", "apple"];
    if (!provider || !allowed.includes(provider)) throw new AppError(400, "Unsupported provider.");
    if (!accessToken) throw new AppError(400, "Session required to unlink.");

    const { member, user } = await getAuthUser(memberId);
    assertStagingAccount(user.email); // staging only (SPEC D-C13)
    const identities = user.identities || [];
    const target = identities.find((i) => i.provider === provider);
    if (!target) throw new AppError(400, `No ${providerLabel(provider)} account is linked.`);

    // Guard: never strip the member's last usable sign-in method. Password counts once (whether or not GoTrue
    // materialized an "email" identity row); federated identities count individually.
    const federatedCount = identities.filter((i) => i.provider !== "email").length;
    const hasPassword = buildIdentitiesResponse(user).has_password;
    const remaining = (federatedCount - 1) + (hasPassword ? 1 : 0);
    if (remaining < 1) throw new AppError(400, "You can't remove your only sign-in method.");

    // D-C14 (resolves F13): DELETE /user/identities/{id} with the caller's verified access token — no SDK session.
    const res = await deleteIdentity(accessToken, target.identity_id, ip);
    const outcome = classifyUserCall(res);
    if (outcome === "unavailable") throw authUnavailableFor("[unlink]", res);
    if (outcome === "session") throw new AppError(401, "Session expired. Sign in again to manage linked accounts.");
    if (outcome === "rejected") throw new AppError(400, readErrorMessage(res.body) || "Could not unlink that account.");

    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    return { message: `${providerLabel(provider)} account unlinked.`, ...buildIdentitiesResponse(refreshed?.user) };
}
```

**6k.** Replace lines 329-335 (`getAuthUser`) with:

```js
async function getAuthUser(memberId) {
    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Account not found.");
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    if (isTransientAuthError(error)) throw authUnavailableFor("[auth-user]", error);
    if (error || !data?.user) throw new AppError(404, "Account not found.");
    return { member, user: data.user };
}
```

**6j.** Replace lines 304-309 (the D-C10 comment block) with:

```js
// ---- NET-NEW (SPEC v0.9.0 / D-C10): auth phase-2 — link/unlink provider identities in account settings.
// R1-preserving: the CLIENT obtains the provider token exactly like /oauth (native id_token, or a web Google
// auth `code`) and POSTs to these AUTHENTICATED routes. D-C14: link = GoTrue's link grant
// (POST /token?grant_type=id_token, link_identity:true) and unlink = DELETE /user/identities/{id}, both called
// directly with the caller's verified access token (services/authSessionService.js) — no SDK session, no rotation.
// The identity attaches to the member's EXISTING auth user — NO same-email auto-link toggle, so /oauth's D-C8 409
// stays intact. Both require Supabase "Manual linking".
```

**6i.** Replace lines 278-302 (`exchangeGoogleAuthCode`) with:

```js
async function exchangeGoogleAuthCode(code, rejectStatus = 401) {
    const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new AppError(500, "Google web sign-in is not configured.");
    let res;
    try {
        res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: "postmessage",
                grant_type: "authorization_code"
            }),
            signal: AbortSignal.timeout(AUTH_HTTP_TIMEOUT_MS) // D-C11
        });
    } catch (err) {
        // D-C15: a timeout / network error reaching Google is 503 auth_unavailable (was 502 "Could not reach Google.").
        throw authUnavailableFor("[google]", err);
    }
    const body = await res.json().catch(() => ({}));
    // D-C15: Google throttling or failing (429 / 5xx), or a 200 without an id_token (incl. a stalled body), is not the
    // user's fault → 503.
    if (res.status === 429 || res.status >= 500 || (res.ok && !body.id_token)) {
        throw authUnavailableFor("[google]", { status: res.status });
    }
    // A rejected code (expired / reused / wrong client): 401 on /oauth (unchanged); 400 on the authenticated /link
    // (D-C15d — a 401 there reads as an ended session).
    if (!res.ok) throw new AppError(rejectStatus, "Google authorization failed.");
    return body.id_token;
}
```

**6h.** Replace lines 272-273 with:

```js
// NOTE: signInWithIdToken uses the per-request client (secret key when set, else anon — D-C14); new-user sign-up stays
// gated by the project "Allow new users to sign up" toggle (unlike register()'s admin.createUser, which bypasses it).
```

**6g.** Replace lines 227-229 (in `register`) with:

```js
    if (isTransientAuthError(createErr)) throw authUnavailableFor("[register]", createErr);
    if (createErr || !created?.user) {
        throw new AppError(400, "Email already exists");
    }
```

**6f.** Delete lines 182-201 (the whole `async function logout(...)`) and the blank line 202. Logout now lives in `authSessionService.logout`.

**6e.** Replace lines 167-172 with:

```js
async function refreshAccessToken(refreshTokenRaw, ip = null) {
    if (!refreshTokenRaw) throw new AppError(400, "Refresh token required");

    // D-C11: one direct, timed, never-retried token-endpoint call — no shared SDK session machinery. Throws
    // AppError 401 {code:"session_invalid"} or 503 {code:"auth_unavailable", retryAfter} (see routes/auth.js).
    // D-C14: the caller's IP rides along as Sb-Forwarded-For (per-user rate limits).
    const session = await exchangeRefreshToken(refreshTokenRaw, ip);
```

**6d.** Changes in `loginLegacy` and `loginGlobal`:
- Line 127 becomes `async function loginLegacy(identifier, password, ip = null) {`.
- Line 131 becomes `    const session = await supabaseSignIn(member, password, ip);`.
- Line 148 becomes `    const session = await supabaseSignIn(member, password, options.ip);`. Lines 149-154 stay untouched, because they are R3's.

**6c.** Replace lines 82-89 (`supabaseSignIn`) with:

```js
// Sign in to Supabase with the member's known email + the supplied password. D-C15: a Supabase / network failure is
// 503 auth_unavailable — only a real rejection is "Invalid credentials".
const supabaseSignIn = async (member, password, ip) => {
    const email = await resolvePrimaryEmail(member.id);
    if (!email) throw new AppError(401, "Invalid credentials");
    const { data, error } = await makeRequestAuthClient(ip).auth.signInWithPassword({ email, password });
    if (isTransientAuthError(error)) throw authUnavailableFor("[login]", error);
    if (error || !data?.session) throw new AppError(401, "Invalid credentials");
    return data.session;
};
```

**6b.** Replace lines 16-27 (the requires) with:

```js
const { sequelize } = require("../config/database");
const { Member, MemberEmail, MemberPushToken } = require("../models");
const { supabaseAdmin, makeRequestAuthClient, AUTH_HTTP_TIMEOUT_MS } = require("../config/supabase");
const {
    exchangeRefreshToken,
    authUnavailableFor,
    isTransientAuthError,
    classifyUserCall,
    readErrorMessage
} = require("./supabaseTokenRefresh");
const { linkIdToken, deleteIdentity, updateOwnPassword, assertStagingUser } = require("./authSessionService");
const { cascadeMemberDeletion } = require("../utils/programMemberships");
const { AppError } = require("../utils/response");
const { isStaging, assertStagingAccount, mayEmailFromHere } = require("../utils/stagingGuard");
```

**6a.** Replace lines 1-15 (the header comment) with:

```js
// Auth service — the /api/auth/* business logic.
// MIGRATION DELTA (R1 / SPEC §7): credentials + tokens move to Supabase Auth; Express PROXIES it.
//   • login        → resolve identifier→member→primary email, then Supabase signInWithPassword.
//   • refresh      → ONE direct, 5 s-timed, never-retried POST to Supabase's /token endpoint
//                    (services/supabaseTokenRefresh.js — SPEC D-C11; Supabase owns rotation; refresh_tokens retires).
//   • sign-in/oauth/re-auth/recovery → a FRESH per-request client (makeRequestAuthClient — D-C11) that carries
//                    the caller's IP as Sb-Forwarded-For with the secret key (D-C14 per-user rate limits).
//   • logout / sign out everywhere / own-password change / link / unlink → services/authSessionService.js
//                    (D-C14: direct GoTrue calls with the user's own access token — no SDK session).
//   • failures     → Supabase / Google / network trouble = 503 auth_unavailable (D-C15), never a credential error.
//   • register     → Supabase admin createUser + members + member_emails (+ backfill auth_user_id).
//   • changePass   → GoTrue PUT /user with the member's own Bearer (ends the OTHER sessions — D-C14);
//                    resetPassword (recovery step) → admin updateUserById (ends EVERY session).
//   • deleteAccount→ runs the cross-feature member-exit cascade (owned by program-memberships,
//                    SPEC D-C1) then deletes the Supabase auth user.
//   • staging      → utils/stagingGuard (APP_ENV=staging only): login-level changes only for +stg accounts,
//                    no reset mail to other addresses (SPEC D-C13). No-ops in prod.
// Response shapes are preserved 1:1 so the web + iOS clients are unchanged (D-C3).
```

### 7. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js`

This file is shared with R3. Make only these two edits.

**7a.** Insert these two lines between line 94 (`// EventSource (?token=) and iOS URLSession (either) clients are unchanged.`) and line 95 (`const authenticateStream = …`):

```js
// auth D-C15 (0.13.0, resolves F12): an infrastructure failure (JWKS / network / TLS / DB) answers 503 auth_unavailable
// + Retry-After exactly like authenticateToken; every token fault stays 401.
```

Then replace lines 113-115 (the `catch` of `authenticateStream`) with:

```js
    } catch (error) {
        if (isVerifyInfraFailure(error)) {
            console.error("[auth] stream token verification unavailable: %s", error.code || error.name);
            return sendAuthUnavailable(res);
        }
        return res.status(401).json({ error: "Invalid token." });
    }
```

**7b.** Replace line 243 (the exports) with:

```js
module.exports = { authenticateToken, authenticateStream, optionalAuthenticate, isAdmin, canModifyLog, requireProgramAdmin, requireProgramMember, isVerifyInfraFailure, sendAuthUnavailable };
```

Resulting anchors, used in step 11f:

| Item | Lines |
|---|---|
| `authenticateStream` | 97-122 (comment from 90) |
| `isAdmin` | 124-136 |
| `canModifyLog` | 138-166 |
| `requireProgramAdmin` | 168-196 |
| `requireProgramMember` | 198-226 |
| `optionalAuthenticate` | 232-247 |
| `program_id` reads | 177, 207 |
| exports | 249 |

### 8. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/auth.js`

Replace the whole file. The `handleAppLogin` and `/oauth` bodies keep their original line shapes; only `ip: req.ip` is appended, so R3's rebase is mechanical.

```js
const express = require("express");
const { authenticateToken, isVerifyInfraFailure, sendAuthUnavailable } = require("../middleware/auth");
const authService = require("../services/authService");
const authSessionService = require("../services/authSessionService");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { verifySupabaseJwt } = require("../config/supabase");

const router = express.Router();

// auth D-C15: ONE error path for every route here. An AppError answers { error, code? } at its status, plus a
// Retry-After header when set (503 auth_unavailable → Retry-After: 5). Anything else is logged via logError
// (observability D-C11 — never the error object) and answers the route's own 500 text.
const sendAuthError = (res, err, tag, fallback) => {
    if (err instanceof AppError) {
        if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        return res.status(err.statusCode).json(body);
    }
    logError(tag, err);
    return res.status(500).json({ error: fallback });
};

// The access token exactly as authenticateToken reads it (`Authorization: Bearer <token>`). D-C14: handed to GoTrue for
// the session-bound calls — logout, sign out everywhere, own-password change, link, unlink.
const bearerOf = (req) => (req.headers.authorization || "").split(" ")[1] || null;

router.post("/login", async (req, res) => {
    try {
        const { identifier, username, password } = req.body;
        const result = await authService.loginLegacy(identifier || username, password, req.ip);
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "Login error:", "Server error during login");
    }
});

const handleAppLogin = async (req, res) => {
    try {
        const { identifier, username, password, push_token, device_id, platform } = req.body;
        const result = await authService.loginGlobal(identifier || username, password, {
            push_token,
            device_id,
            platform,
            ip: req.ip
        });
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[global login] error:", "Server error during login");
    }
};

router.post("/login/app", handleAppLogin);
router.post("/login/global", handleAppLogin);

// Server-authoritative identity ("who am I"). Echoes the JWKS-verified, auth_user_id-mapped member
// already resolved onto req.user by authenticateToken — no DB query, no service logic. Lets the web
// self-heal a stale/missing session.user.id (the member's members.id) on load, independent of which
// login path was used or whether the Supabase JWT carries custom claims. Additive: the LIVE iOS binary
// never calls this (it keeps using the login-response member_id).
router.get("/me", authenticateToken, (req, res) => {
    res.json({
        member_id: req.user.id,
        username: req.user.username,
        member_name: req.user.member_name,
        global_role: req.user.global_role
    });
});

// D-C11: 401 session_invalid / 503 auth_unavailable + Retry-After; "Refresh token required" stays a bare 400.
router.post("/refresh", async (req, res) => {
    try {
        const result = await authService.refreshAccessToken(req.body.refresh_token, req.ip);
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[refresh] error:", "Server error during refresh");
    }
});

// D-C14: THIS device's session only (GoTrue scope local). Send the Bearer and/or the body refresh_token (Android sends
// both, iOS the body). Best-effort: always 200 { message: "Logged out" }; 400 only when neither is sent.
router.post("/logout", async (req, res) => {
    try {
        const result = await authSessionService.logout({
            refreshToken: req.body.refresh_token,
            accessToken: bearerOf(req),
            ip: req.ip
        });
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[logout] error:", "Server error during logout");
    }
});

// NET-NEW (D-C14) — "Sign out everywhere": every session of this user ends, this device's included (scope global).
router.post("/logout-all", authenticateToken, async (req, res) => {
    try {
        const result = await authSessionService.logoutEverywhere({
            accessToken: bearerOf(req),
            authUserId: req.authUserId,
            ip: req.ip
        });
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[logout-all] error:", "Server error during logout");
    }
});

router.post("/register", async (req, res) => {
    try {
        const result = await authService.register(req.body);
        res.status(201).json(result);
    } catch (err) {
        sendAuthError(res, err, "Registration error:", "Server error during registration");
    }
});

// NET-NEW (SPEC v0.7.0 / D-C8) — federated sign-in. Public. Exchanges a client-obtained provider id_token
// via Supabase signInWithIdToken (R1: the client never embeds Supabase). Returns a login AuthResponse when
// the member exists, or { needs_profile:true, ... } for a brand-new social user (→ /oauth/complete).
router.post("/oauth", async (req, res) => {
    try {
        const { provider, id_token, code, nonce, first_name, last_name, push_token, device_id, platform } = req.body;
        const result = await authService.socialSignIn(
            { provider, id_token, code, nonce, first_name, last_name },
            { push_token, device_id, platform, ip: req.ip }
        );
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[oauth] error:", "Server error during federated sign-in");
    }
});

// NET-NEW (SPEC v0.7.0 / D-C9) — finish a brand-new federated sign-up. The pending Supabase access_token
// from POST /oauth is the Bearer (verified directly via JWKS — no member row exists yet to map through
// authenticateToken). Creates members + member_emails linked to the already-created auth user, then
// returns the login AuthResponse (echoing the same session the client already holds).
// D-C15 (resolves F12): a JWKS / network / TLS outage while verifying the pending Bearer → 503 auth_unavailable.
router.post("/oauth/complete", async (req, res) => {
    try {
        const authz = req.headers.authorization || "";
        const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
        if (!bearer) return res.status(401).json({ error: "Missing session token." });
        let payload;
        try {
            payload = await verifySupabaseJwt(bearer);
        } catch (verifyErr) {
            if (isVerifyInfraFailure(verifyErr)) {
                console.error("[oauth/complete] token verification unavailable: %s", verifyErr.code || verifyErr.name);
                return sendAuthUnavailable(res);
            }
            return res.status(401).json({ error: "Invalid or expired session token." });
        }
        const { username, gender, first_name, last_name, refresh_token } = req.body;
        const result = await authService.completeSocialRegistration(
            payload.sub,
            { username, gender, first_name, last_name },
            { access_token: bearer, refresh_token }
        );
        res.status(201).json(result);
    } catch (err) {
        sendAuthError(res, err, "[oauth/complete] error:", "Server error during federated sign-up");
    }
});

// NET-NEW (SPEC v0.9.0 / D-C10) — auth phase-2: manage the signed-in member's linked sign-in identities.
// All authenticated + additive. D-C14: link/unlink call GoTrue with the caller's own Bearer — the body
// refresh_token is no longer needed (ignored if a live client still sends it).
router.get("/identities", authenticateToken, async (req, res) => {
    try {
        res.json(await authService.listIdentities(req.user.id));
    } catch (err) {
        sendAuthError(res, err, "[identities] error:", "Server error while reading sign-in methods.");
    }
});

router.post("/link", authenticateToken, async (req, res) => {
    try {
        const { provider, id_token, code, nonce } = req.body;
        res.json(await authService.linkProvider(req.user.id, {
            provider, id_token, code, nonce, accessToken: bearerOf(req), ip: req.ip
        }));
    } catch (err) {
        sendAuthError(res, err, "[link] error:", "Server error while linking account.");
    }
});

router.post("/unlink", authenticateToken, async (req, res) => {
    try {
        res.json(await authService.unlinkProvider(req.user.id, {
            provider: req.body.provider, accessToken: bearerOf(req), ip: req.ip
        }));
    } catch (err) {
        sendAuthError(res, err, "[unlink] error:", "Server error while unlinking account.");
    }
});

// D-C14: GoTrue PUT /user with the caller's Bearer — the member's OTHER sessions end, this device stays signed in.
router.post("/set-password", authenticateToken, async (req, res) => {
    try {
        res.json(await authService.setPassword(req.user.id, req.body.new_password, {
            accessToken: bearerOf(req), ip: req.ip
        }));
    } catch (err) {
        sendAuthError(res, err, "[set-password] error:", "Server error while setting password.");
    }
});

// NET-NEW (SPEC v0.3.0 / D-C4) — self-service password recovery, request step. Public, privacy-safe:
// always 200 with a generic message (no account-enumeration). Pairs with POST /reset-password.
router.post("/forgot-password", async (req, res) => {
    try {
        const result = await authService.requestPasswordReset(req.body.email, req.ip);
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[forgot-password] error:", "Server error during password reset request.");
    }
});

// NET-NEW (SPEC v0.4.0 / D-C5) — self-service password recovery, RESET (consume) step. The web
// /reset-password page extracts the Supabase recovery access_token from the email-link fragment
// (implicit flow) and sends it as the Bearer token here. authenticateToken JWKS-verifies it + maps
// sub -> member. An expired/invalid recovery token -> 401. D-C14: resetPassword uses the admin update, which
// ends EVERY session of the member, the recovery one included. R1: the client never embeds Supabase.
router.post("/reset-password", authenticateToken, async (req, res) => {
    try {
        const result = await authService.resetPassword(req.user.id, req.body.new_password);
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[reset-password] error:", "Server error during password reset.");
    }
});

// D-C14: GoTrue PUT /user with the caller's Bearer — the member's OTHER sessions end, this device stays signed in.
router.put("/change-password", authenticateToken, async (req, res) => {
    try {
        const result = await authService.changePassword(req.user.id, req.body.new_password, {
            accessToken: bearerOf(req), ip: req.ip
        });
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[change-password] error:", "Server error during password change.");
    }
});

// NET-NEW (profile page): self-service email change. Authenticated; password-confirmed direct change
// (no legacy equivalent). authService.changeEmail keeps Supabase auth.users + member_emails in sync.
router.put("/email", authenticateToken, async (req, res) => {
    try {
        const result = await authService.changeEmail(req.user.id, req.body.new_email, req.body.password, req.ip);
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[change-email] error:", "Server error during email change.");
    }
});

router.delete("/account", authenticateToken, async (req, res) => {
    try {
        const result = await authService.deleteAccount(req.user.id);
        res.json(result);
    } catch (err) {
        sendAuthError(res, err, "[delete-account] error:", "Server error during account deletion.");
    }
});

module.exports = router;
```

### 9. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example`

Replace the line `SUPABASE_ANON_KEY=            # public anon key — used for the sign-in / refresh proxy` with:

```
SUPABASE_ANON_KEY=            # anon key — fallback for the sign-in / refresh proxy while SUPABASE_SECRET_KEY is unset
```

Directly after the `SUPABASE_SERVICE_ROLE_KEY=` line, insert:

```
SUPABASE_SECRET_KEY=          # secret API key (sb_secret_…) — calls made on a user's behalf + Sb-Forwarded-For (auth D-C14); unset → anon key, no IP forwarding
```

### 10. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/render.yaml`

Directly after this entry:

```yaml
      - key: SUPABASE_SERVICE_ROLE_KEY    # service-role key — admin createUser/updateUser/deleteUser
        sync: false
```

insert:

```yaml
      - key: SUPABASE_SECRET_KEY          # secret API key (sb_secret_…) — per-user Supabase rate limits (auth D-C14); unset → anon key
        sync: false
```

### 11. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md`

**11a. Header and §1.**
- Line 3: change `**Version:** 0.12.1` to `**Version:** 0.13.0`.
- Line 18: change `login / refresh / logout / register / change-password / delete-account` to `login / refresh / logout / sign-out-everywhere / register / change-password / delete-account`.

**11b. §3 route table.** Replace these rows by their number.

Row 5 (line 48):
```
| 5 | `POST /logout` | `routes/auth.js` → `authSessionService.logout` (legacy `routes/auth.js:49-58`) | no (Bearer optional) | Revoke **this device's** session only — GoTrue `scope=local` with the request Bearer, else with an access token exchanged from the body `refresh_token`. Best-effort, always 200. **D-C14.** |
```

Row 7 (line 50):
```
| 7 | `PUT /change-password` | `routes/auth.js` → `changePassword` (legacy `authService.js:302-315`) | **yes** | Set a new password via GoTrue `PUT /user` with the caller's Bearer — the member's **other** sessions end, this device stays signed in (before 0.13.0 the admin update ended every session, this one too). **D-C14.** |
```

Row 10 (line 53):
```
| 10 | `POST /reset-password` | **NET-NEW** (no legacy handler) → `resetPassword` (`authService.js`) | **yes** (recovery token) | **Self-service password recovery, RESET step.** The web `/reset-password` page sends the Supabase recovery `access_token` as Bearer; `authenticateToken` verifies it + maps `sub`→member, then `resetPassword` sets the new password with the admin API, which ends **every** session of the member, the recovery one included (GoTrue behaviour — unchanged, documented in D-C14). **D-C5.** |
```

Row 16 (line 59):
```
| 16 | `POST /link` | **NET-NEW** (no legacy handler) → `linkProvider` (`authService.js`) | **yes** | **Link a Google/Apple identity to the current member.** Body: `{ provider, id_token \| code (web Google), nonce? (iOS) }` (`refresh_token` is no longer needed and is ignored — D-C14). Calls GoTrue's link grant (`POST /token?grant_type=id_token`, `link_identity:true`) directly with the caller's Bearer — no OAuth redirect, no session rotation. **409** if that identity already belongs to a different auth user; **400** if Supabase "Manual linking" is disabled or the provider token is refused. **D-C10 / D-C14.** |
```

Row 17 (line 60):
```
| 17 | `POST /unlink` | **NET-NEW** (no legacy handler) → `unlinkProvider` (`authService.js`) | **yes** | **Unlink a provider.** Body: `{ provider }` (`refresh_token` ignored — D-C14). GoTrue `DELETE /user/identities/{id}` with the caller's Bearer; **rejects (400)** removing the member's last usable sign-in method. **D-C10 / D-C14.** |
```

Row 18 (line 61):
```
| 18 | `POST /set-password` | **NET-NEW** (no legacy handler) → `setPassword` (`authService.js`) | **yes** | **Add/replace the password** for a social-only member. Body: `{ new_password }`; `validatePassword` → GoTrue `PUT /user { password }` with the caller's Bearer (since 0.13.0; was `admin.updateUserById`, which ended every session) — the member's **other** sessions end, this one stays; returns the refreshed identities with `has_password:true`. **D-C10 / D-C14.** |
```

Insert after row 18:
```
| 19 | `POST /logout-all` | **NET-NEW** (no legacy handler) → `authSessionService.logoutEverywhere` | **yes** | **Sign out everywhere** (account settings): every session of the member ends, this device's included (GoTrue `scope=global`). `200 { message: "Logged out everywhere" }`. Staging: `+stg` accounts only (D-C13). **D-C14.** |
```

**11c. §3 "Response shapes".**

After the `/login/app · /login/global` bullet, add:
```
- **All three login routes:** `401 { error: "Invalid credentials" }` for a wrong identifier/password; `503 { error:
  "Authentication service temporarily unavailable", code: "auth_unavailable" }` + `Retry-After: 5` when Supabase times
  out, throttles or fails (D-C15).
```

Replace the line-78 `/logout` bullet with:
```
- **`/logout`** (`authSessionService.logout`, D-C14): `{ message: "Logged out" }` — always 200 once a `refresh_token`
  or a Bearer is sent (best-effort; ends this device's session only); `400 { error: "Refresh token required" }` when
  neither is sent.
- **`/logout-all`** (NET-NEW, D-C14): `200 { message: "Logged out everywhere" }`; `401 { error: "Invalid token." }`
  (token missing / rejected), `403` (staging, non-`+stg`), `503 auth_unavailable`.
```

Replace the line-81 `/change-password` bullet with:
```
- **`/change-password`** (`changePassword`, GoTrue `PUT /user`): `{ message: "Password changed successfully." }` — the
  member's other sessions end, this one stays (D-C14). `400` adds `"New password must be different from your current
  password."`; `401 { error: "Session expired. Sign in again to change your password." }` when the session behind the
  Bearer is gone; `503 auth_unavailable` on a Supabase outage (D-C15).
- **`/set-password`** (`setPassword`, D-C10): `{ message: "Password set successfully.", identities, has_password: true }`
  — same session effect and errors as `/change-password` (its generic 400 text stays `"Could not set password."`).
```

Replace the lines 82-83 `/email` bullet with:
```
- **`/email`** (`changeEmail`, NET-NEW): on success `200 { message: "Email updated successfully.", email }`.
  `400` (bad/duplicate/no-op email, and since 0.13.0 `"Current password is incorrect."` — was 401, D-C15),
  `404` (account/email not found), `500` (DB write failed after the Supabase update — best-effort reverted),
  `503 auth_unavailable` (re-auth or update hit a Supabase outage; a timed-out update is reverted best-effort).
```

Replace the lines 92-95 `/reset-password` bullet with:
```
- **`/reset-password`** (`resetPassword`, NET-NEW): on success `200 { message: "Password changed
  successfully." }`. The recovery `access_token` is the Bearer; `authenticateToken` → **401** on an
  expired/invalid/used recovery token, then `resetPassword` → **400** on a password that fails the policy.
  Every session of the member ends, the recovery one included (admin update — D-C14); `503 auth_unavailable` on a
  Supabase outage. Response shape identical to `/change-password`.
```

`/oauth` bullet: replace its tail starting `` `400` (unsupported provider / missing token), `401` (federated sign-in failed), `` through the end of the bullet with:
```
`400` (unsupported provider / missing token), `401` (federated sign-in failed / Google authorization failed), `409`
  ("An account with this email already exists. Sign in with your password." — provider email maps to a different auth
  user), `503 auth_unavailable` (Supabase or Google timeout / 429 / 5xx — replaces `502 "Could not reach Google."`, D-C15).
```

`/oauth/complete` bullet: replace its final `` username/email, or the provider account has no email). `` with `` username/email, or the provider account has no email), `503 auth_unavailable` (JWKS / network / TLS / Supabase outage — D-C15). ``.

**11d. §3 "Error contract".** Replace the paragraph at lines 110-115 with:
```
`AppError(statusCode, message, { code?, retryAfter? })` → `{ error: message }` at that status, plus `code` when set and a
`Retry-After` header when `retryAfter` is set — on **every** `/api/auth` route since 0.13.0 (`sendAuthError`, D-C15;
before: `/refresh` only). Any other throw → `500` with a generic `"Server error during <op>"`, logged via
`utils/logError.js` (name / code / status / message / top frames — never the error object). Status codes: `400`
(missing/invalid input; on authenticated routes also a wrong current password, a refused/unchanged new password or a
refused provider token — D-C15d), `401` (invalid credentials on the public sign-in routes; an invalid/expired token or a
session that no longer exists; `/refresh` adds `code: "session_invalid"`), `403` (global-admin delete block; staging
guard), `404` (credentials/account not found), `409` (`/oauth`, `/link` identity collision), `503` (`code:
"auth_unavailable"` + `Retry-After: 5` — Supabase / Google / JWKS / DB infrastructure failure, D-C11 / D-C15). A body
that is not valid JSON never reaches a route: `400 { error: "Invalid request body.", code: "invalid_body" }`, `413
payload_too_large`, `415 invalid_body` from the global `errorHandler` (observability D-C11).
```

**11e. Insert a new §3.1** after that paragraph and before `## 4.`:

```markdown
### 3.1 Client contract — sessions + errors (0.13.0; the Phase 3 web / iOS / Android release builds against this)

Every error body is `{ "error": "<human text>" }` plus `"code"` when the server has a machine reason. The **status**
decides the frontend-kit kind ([`frontend-kit`](../frontend-kit/SPEC.md) §4); `code` is informational. Every
`503 { error: "Authentication service temporarily unavailable", code: "auth_unavailable" }` carries `Retry-After: 5`
(readable cross-origin — D-C12). Budgets: 5 s per Supabase/Google call, 15 s per admin call — a route that chains
several (e.g. `PUT /email`, `/link`) can outlast a client's own read timeout (Android's default is 10 s); a client-side
timeout is handled exactly like a `503` (rule 3).

| Call | Send | Success | Errors (new / changed in **bold**) |
|---|---|---|---|
| `POST /auth/refresh` | body `{ refresh_token }` | `200 { token, refresh_token, message: "Token refreshed" }` (keys in this order) | `400 { error: "Refresh token required" }` · `401 { error: "Invalid refresh token", code: "session_invalid" }` = the session is over → full sign-out · `503 auth_unavailable` = keep the session, retry after `Retry-After` |
| `POST /auth/logout` | `Authorization: Bearer <access token>` **and** body `{ refresh_token }` (either alone works) | `200 { message: "Logged out" }` — always; **ends this device's session only** | `400 { error: "Refresh token required" }` when neither is sent |
| **`POST /auth/logout-all`** (new) | `Authorization: Bearer <access token>`, no body | `200 { message: "Logged out everywhere" }` — every session ended, this device's included → full sign-out teardown | `401 { error: "Invalid token." }` / `"Access denied. No token provided."` (refresh once, retry; a refresh `401 session_invalid` signs out) · `403` (staging: non-`+stg` account) · `503 auth_unavailable` |
| `PUT /auth/change-password` | Bearer + `{ new_password }` | `200 { message: "Password changed successfully." }` — **this device stays signed in; the user's other sessions end** (at their next refresh). Before 0.13.0 every session ended, this one too | `400` (policy · `"new_password is required."` · **`"New password must be different from your current password."`** · `"Server error during password change."`) · `401` (`"Invalid token."` / **`"Session expired. Sign in again to change your password."`** = the session behind the token is gone) · `403` (staging) · `404 { error: "Credentials not found." }` · **`503`** |
| `POST /auth/set-password` | Bearer + `{ new_password }` | `200 { message: "Password set successfully.", identities, has_password: true }` — **same session effect as change-password** | `400` (policy · same-password text · `"Could not set password."`) · `401` (as above) · `403` · `404` · **`503`** |
| `POST /auth/reset-password` | Bearer = recovery `access_token` + `{ new_password }` | `200 { message: "Password changed successfully." }` — every session of the user ends, the recovery one included (unchanged) | `400` · `401` (expired/used recovery token) · `403` · `404` · **`503`** |
| `POST /auth/login` · `/login/app` · `/login/global` | unchanged | unchanged | `401 { error: "Invalid credentials" }` = wrong identifier/password · **`503 auth_unavailable`** (Supabase timeout / 429 / 5xx) |
| `POST /auth/oauth` | unchanged | unchanged | `400` · `401` (`"Sign-in failed: …"`, `"Federated sign-in failed."`, `"Google authorization failed."`) · `409` · **`503 auth_unavailable`** (Supabase or Google timeout / 429 / 5xx — replaces `502 "Could not reach Google."`) |
| `POST /auth/oauth/complete` | unchanged | unchanged | `401` (`"Missing session token."`, `"Invalid or expired session token."`, `"Invalid session."`) · `400` · **`503 auth_unavailable`** (JWKS / network / TLS / Supabase outage) |
| `PUT /auth/email` | unchanged (Bearer + `{ new_email, password }`) | unchanged | **`400 { error: "Current password is incorrect." }` (was 401)** · other `400` / `404` / `500` unchanged · **`503`** |
| `POST /auth/link` | Bearer + `{ provider, id_token \| code, nonce? }` — **`refresh_token` not needed** (ignored) | unchanged `{ message, identities, has_password }` | `400` (incl. **`"Link failed: …"` and a refused web Google `code` — both were 401**; `"Account linking is not available right now."`) · `401 { error: "Session expired. Sign in again to manage linked accounts." }` (= the session behind the Bearer is gone) · `403` (staging) · `404` · `409` · **`503`** |
| `POST /auth/unlink` | Bearer + `{ provider }` — **`refresh_token` ignored** | unchanged | `400` · `401` (session, as above) · `403` · `404` · **`503`** |
| `GET /auth/identities` · `POST /auth/register` | unchanged | unchanged | **`503`** on a Supabase outage (was 404 / 400) |
| `POST /auth/forgot-password` | unchanged | always the generic `200` | — |
| any `authenticateToken` route | Bearer | — | `401 { error: "Invalid token." }` / `"Access denied. No token provided."` · `503 auth_unavailable` (since 0.10.0) |
| `GET /notifications/stream` | Bearer header or `?token=` | SSE | `401` token fault · **`503 auth_unavailable`** infrastructure (D-C15) |
| any route, body not valid JSON | — | — | **`400 { error: "Invalid request body.", code: "invalid_body" }` · `413 { error: "Payload too large.", code: "payload_too_large" }` · `415 invalid_body`** (was 500 — observability D-C11) |

**Client rules this contract implies (DESIGN_BOARD §2 client 1–6):**
1. Full sign-out teardown (clear tokens + caches, stop the stream, unregister this device's push token per the R3
   contract) on: `/refresh` → `401 session_invalid`; the user's own sign-out (call `/logout`, ignore its outcome);
   `/logout-all` → `200`.
2. On the public sign-in routes (`/login*`, `/oauth`, `/oauth/complete`) a `401` means wrong credentials / an unusable
   provider token. On authenticated routes a `401` only ever means the session behind the token — the credential
   routes (`PUT /email`, `/link`, `/unlink`, `/set-password`, `/change-password`) answer `400` for a wrong password, a
   refused/unchanged new password or a refused provider token.
3. `503 auth_unavailable` (and 429, 5xx, a client-side timeout, offline) never signs anyone out: keep the session, show
   the kit's `unavailable` / offline state, retry after `Retry-After`.
4. After `/change-password` or `/set-password` `200` this device keeps its session; the user's other devices are signed
   out at their next refresh (their access tokens keep working until they expire, ≤ 1 h). After `/reset-password`
   `200` every session is over (the web reset page already sends the user to sign in).
5. Every forced sign-out is reported as `auth.forced_sign_out` through `POST /api/client-events` (observability §8) —
   no auth route is involved.
```

**11f. §4 middleware table.**
- `authenticateStream` row:
  - Lines cell → `97-122`.
  - Rule cell → `SSE variant: token from the header **or** `?token=`; same `resolveReqUser`; token fault → 401; JWKS/network/TLS/DB failure → `503 { error, code: "auth_unavailable" }` + `Retry-After: 5` (D-C15).`
- Lines cells:
  - `optionalAuthenticate` → `232-247`
  - `isAdmin` → `124-136`
  - `requireProgramAdmin` → `168-196`
  - `requireProgramMember` → `198-226`
  - `canModifyLog` → `138-166`
- Line 183: change `middleware/auth.js:171, 201` to `middleware/auth.js:177, 207`.

**11g. §6 env.** In the `— (new) | — | **`SUPABASE_URL`**, …` row, replace `**`SUPABASE_ANON_KEY`** (the proxied public flows — per-request sign-in / id-token / recovery clients + the direct `/token` refresh call, D-C11)` with:
```
**`SUPABASE_ANON_KEY`** (fallback key for every call made on a user's behalf while `SUPABASE_SECRET_KEY` is unset, D-C11 / D-C14)
```

Add two rows after that row:
```
| — (new) | — | **`SUPABASE_SECRET_KEY`** (D-C14) — Supabase secret API key (`sb_secret_…`, board D-4), read per call by `config/supabase.js` `userAuthKey()`: authenticates every Auth call made on a user's behalf (login, `/oauth`, recovery, refresh, logout, own-password change, link, unlink) and enables `Sb-Forwarded-For` (the user's IP, `forwardedForHeaders`). Unset → the anon key and no forwarding (pre-0.13.0 behaviour) — the kill switch. Admin calls keep `SUPABASE_SERVICE_ROLE_KEY`. `render.yaml` `sync: false`. |
| — (new) | — | **Supabase Auth settings** (not env; shared by prod + staging; user-approved admin-token calls — `ENV_RUNBOOK.md` §7c): `security_sb_forwarded_for_enabled` = true (D-C14a), `sessions_inactivity_timeout` = 2160 h / 90 days (D-C14e, board D-5), `rate_limit_token_refresh` = 1500 (Phase 1b H2); `security_update_password_require_reauthentication` + `security_update_password_require_current_password` MUST stay false (D-C14b). |
```

**11h. §7.**
- Line 238-239: replace `**`/logout`** revokes via Supabase.` with `**`/logout`** revokes this device's session via GoTrue `/logout?scope=local` (D-C14; sign out everywhere = `POST /logout-all`, scope global).`
- Replace lines 240-242 with:
```
- **`/register` / `/reset-password` / `/account`** call the Supabase admin API (createUser / updateUserById /
  deleteUser) in addition to / instead of the `member_credentials` writes; since 0.13.0 **`/change-password`** and
  **`/set-password`** call GoTrue `PUT /user` with the member's own Bearer instead (D-C14b). The non-credential parts
  (members/email rows, the delete cascade) stay as-is.
```

**11i. §9.**
- In D-C13 (line 268), replace `(d) `/logout` signs out with `scope:'local'` (prod keeps `global` until Phase 3).` with `(d) `/logout` signs out with `scope:'local'` — on prod too since 0.13.0 (D-C14).`
- Insert these two rows after D-C13:

```
| **D-C14** | **Deliberate change (0.13.0) — per-user Supabase rate limits + device-scoped sessions + SDK-free session-bound calls (reliability-overhaul Phase 3 R1; DESIGN_BOARD §2 backend 3–5, D-4, D-5).** (a) **Per-user rate limits:** every Supabase Auth call made on a user's behalf — the direct `/token` refresh, `/logout`, `PUT /user` (own password), the identity link grant and unlink, and the per-request client's sign-in / id-token sign-in / recovery — authenticates with `userAuthKey()` = `SUPABASE_SECRET_KEY` (`sb_secret_…`) when set, else `SUPABASE_ANON_KEY`, and **with the secret key only** sends the end user's IP (`req.ip` — the address Render's edge saw, `trust proxy` 2, observability D-C7; never a client-supplied value) as `Sb-Forwarded-For` (an IPv4-mapped `::ffff:` address as IPv4; anything not an IP literal omitted). Supabase honours that header only on secret-key requests (enforced at its API gateway) and only once Auth **IP address forwarding** (`security_sb_forwarded_for_enabled`) is on (ENV_RUNBOOK §7c); no client calls Supabase Auth directly. Direct calls send an `sb_…` key on `apikey` only (Supabase: new keys are not JWTs); supabase-js sends `apikey` + the same key as Bearer (Supabase's own IP-forwarding example). Admin calls (`supabaseAdmin`) keep the service-role key (admin endpoints are not IP-limited). (b) **Session scopes:** `POST /logout` → **this device's session only** (GoTrue `/logout?scope=local`; was `global` in prod) — the request Bearer first (Android sends one), else the body `refresh_token` exchanged for an access token first (iOS); always `200`. `PUT /change-password` + `POST /set-password` → GoTrue `PUT /user { password }` with the caller's Bearer (`authSessionService.updateOwnPassword`): GoTrue sets the password and, in the same transaction, ends the user's **other** sessions (`LogoutAllExceptMe`) — **this device stays signed in**. **Correction of the board premise ("today it revokes nothing"):** before 0.13.0 both routes used `admin.updateUserById`, and GoTrue's admin password update ends **every** session of the user (`UpdatePassword(tx, nil)` → `Logout`; supabase/auth `internal/api/admin.go`, `internal/models/user.go`), so the changing device was signed out at its next refresh too. New on these two routes: an unchanged password is refused (`422 same_password` → `400 "New password must be different from your current password."`); `weak_password` → `400` with GoTrue's text; `PUT /user` is limited by `rate_limit_otp` (30 / 5 min per IP — per user once forwarding is on; `429` → `503`); it requires `security_update_password_require_reauthentication` and `security_update_password_require_current_password` to stay `false` (ENV_RUNBOOK §7c — turning either on makes both routes answer `400`); staging checks `+stg` explicitly (`PUT /user` bypasses `guardAdminAuth`). `POST /reset-password` keeps the admin update (`resetPassword`, the pre-0.13.0 `changePassword` body; D-C5's route unchanged) → every session ends, the recovery one included (unchanged; now documented). NET-NEW `POST /logout-all` = "sign out everywhere" (`scope=global` = the board's `others` + this device; staging: `+stg` accounts only). Other devices end at their next refresh (`401 session_invalid`); access JWTs already issued stay valid until they expire (≤ 1 h — stateless verification, D-C2). Push tokens are not touched here (R3 device registry + client teardown). (c) **No SDK session machinery with a user's token (resolves F13):** logout / own-password / link / unlink call GoTrue directly with the caller's verified access token (`services/authSessionService.js` over `gotrueFetch`: 5 s, no retry); `makeEphemeralAuthClient` and its session restore are gone. `/link` + `/unlink` no longer need the body `refresh_token` (ignored). GoTrue's link grant, and the `PUT /email` re-auth, each create a session the server discards — their refresh tokens never leave the server; they end via the inactivity timeout. (d) **Explicit timeouts (resolves F15):** `supabaseAdmin` 15 s (`ADMIN_HTTP_TIMEOUT_MS` — admin writes normally answer in tens of ms but can land after we give up, so the budget is long; F18); every user-on-behalf call 5 s; the JWKS fetch = jose's 5 s default; `/recover` keeps 5 s (measured 324 ms, ENV_RUNBOOK §7b). (e) **Inactivity limit (board D-5):** Supabase `sessions_inactivity_timeout` = 2160 h (90 days; Pro plan): a session not refreshed for 90 days ends at its next refresh (`session_expired` → `401 session_invalid`). Live binaries: `/logout` responses are ignored by every client; the changing device now keeps its session after a password change (it was signed out within ≤ 1 h); other-device sign-outs after a password change / sign-out-everywhere are intended. MINOR. | DESIGN_BOARD §2 backend 3–5 + D-4/D-5; discovery W1 §4 F3/F6/F9, §8; supabase/auth source (`internal/api/admin.go:268`, `internal/api/user.go:207-214`, `internal/models/user.go:458-464`, `internal/api/logout.go`); Supabase docs (auth rate-limits "IP address forwarding", api-keys "Known limitations", sessions); `config/supabase.js`; `services/supabaseTokenRefresh.js`; `services/authSessionService.js`; `services/authService.js`; `routes/auth.js`. |
| **D-C15** | **Deliberate change (0.13.0) — one error path + failure classification on every `/api/auth` route (resolves F12, F14; W7 error vocabulary).** (a) `routes/auth.js` `sendAuthError`: every `AppError` answers `{ error, code? }` + `Retry-After` when set (was `/refresh` only); any other error is logged via `utils/logError.js` (observability D-C11) and answers the route's unchanged 500 text. (b) **`503 auth_unavailable` + `Retry-After: 5`** (instead of 401 / 400 / 404 / 502) when Supabase or Google fails rather than the user: login (all three), `/oauth` (incl. the Google code exchange — timeout, 429, 5xx, or 200 without `id_token`; was `502 "Could not reach Google."`), `/oauth/complete` (pending-Bearer JWKS/network/TLS failure via `isVerifyInfraFailure`; admin `getUserById` outage), `PUT /email` (re-auth or update; a timed-out update is reverted best-effort), `/register`, `/identities`, `/link`, `/unlink`, `/set-password`, `/change-password`, `/reset-password`, `/logout-all`. Transient = auth-js `AuthRetryableFetchError` (timeout / network / 502–504 / 52x) or `AuthUnknownError`, a code-less 401 (the API gateway rejecting our key), `bad_jwt` / `no_authorization` on a key-authenticated call, or any 408 / 429 / 5xx; for a direct call with the user's token (`classifyUserCall`) also an error body without an auth error code. A wrong password (`400 invalid_credentials`) stays a credential error. (c) `authenticateStream` (notifications `GET /stream`) answers 503 on the same infrastructure failures as `authenticateToken`; token faults stay 401. (d) **Authenticated credential routes never answer 401 for a credential / provider rejection:** `PUT /email` "Current password is incorrect." 401 → **400**; `/link` provider-token rejection ("Link failed: …") 401 → **400**; a refused Google auth `code` on `/link` → **400** (`/oauth` keeps 401); `/change-password` + `/set-password` refusals are 400. On those routes a 401 means only "the session behind this token is gone" (`"Session expired. Sign in again to …"`). Reason: live iOS treats a 401 on an authenticated call as an expired session (refresh → retry → second 401 → sign-out, `APIClient.swift:66-80`) and live Android's `AuthAuthenticator` has no prior-response check, so a persistent 401 re-refreshes up to OkHttp's 20 follow-ups (`Network.kt:79-103`). Live binaries: every change is a 503 or a 400 where they got 401/400/404/502 — each surfaces a non-401 error as a message (iOS `APIError`, Android `ApiException`, web `ApiError`); safer for all. MINOR. | DESIGN_BOARD §2 backend 2 + §6.3; frontend-kit §4 scope rule; discovery W1 §8; `routes/auth.js`; `middleware/auth.js`; `services/authService.js`; `services/authSessionService.js`; `services/supabaseTokenRefresh.js`. |
```

**11j. §10.**

F4 (line 278): append to its Characteristic cell: ` Since 0.13.0 Supabase's own per-IP limits apply **per end user** (`Sb-Forwarded-For`, D-C14a); an Express-level limiter is still absent.`

F5 (line 279): set the last cell to `Done — consolidated in `resolveReqUser`; since 0.13.0 `authenticateStream` classifies infrastructure failures like `authenticateToken` (D-C15c); `optionalAuthenticate` never rejects.`

Replace rows F12-F15 (lines 286-289) with:
```
| **F12** | ~~`authenticateStream` and `/oauth/complete` returned 401 for every verification failure.~~ | `middleware/auth.js` `authenticateStream`; `routes/auth.js` `/oauth/complete` | **Resolved 0.13.0 (D-C15b/c)** — 503 `auth_unavailable` on infrastructure failures. |
| **F13** | ~~link/unlink rotated the user's refresh token server-side.~~ Precisely: both went through auth-js `setSession` (refreshes only an already-expired access token, which `authenticateToken` never lets through) **and** `_useSession` inside `linkIdentity` / `unlinkIdentity`, which refreshes the stored session when it is within **90 s** of expiry (`EXPIRY_MARGIN_MS`) — a rotation whose new pair the server discarded, leaving the client one rotation behind. GoTrue accepts a token one rotation old (W1 E6), so the client usually recovered; a second rotation before its next refresh meant a reuse kill. | `authService.linkProvider` / `unlinkProvider` | **Resolved 0.13.0 (D-C14c)** — direct GoTrue calls with the caller's Bearer; no rotation. |
| **F14** | ~~Login / `/oauth` / `PUT /email` re-auth mapped a Supabase timeout, 429 or 5xx to 401.~~ | `supabaseSignIn`, `socialSignIn`, `changeEmail` | **Resolved 0.13.0 (D-C15b).** |
| **F15** | ~~Not every outbound auth call had an explicit timeout (`supabaseAdmin`, the ephemeral client).~~ | `config/supabase.js`, `services/authService.js` | **Resolved 0.13.0 (D-C14d)** — admin 15 s; the ephemeral client is gone; `/recover` keeps 5 s (measured 324 ms). |
```

Append after F16 (line 290):
```
| **F17** | `services/authService.js` is ~800 lines and `routes/auth.js` ~240 — over the ~200-line standard. | `services/authService.js`, `routes/auth.js` | Yes — split (e.g. identity management into its own service) in a refactor-only change; deliberately not mixed into 0.13.0. |
| **F18** | **An admin write that lands after its 15 s timeout** answers 503 although it happened: `register`'s `createUser` leaves an auth user with no member (like F10) — the retry gets `400 "Email already exists"` and that email can't register until the orphan is removed (Dashboard). `members` / `program-memberships` create paths still map ANY `createUser` error, a timeout included, to `400 "A user with this email already exists."` (their files, unchanged — accepted at Phase 3 R1 approval). `PUT /email` reverts best-effort; password writes are idempotent. Rare — admin calls answer in tens of ms. | `authService.register`; `services/memberService.js:70`; `services/membershipService.js:68` | Optional — a timeout-aware lookup before reporting, only if `[register] auth_unavailable` ever shows in the logs. |
```

**11k. §11.** Insert a new first row under the header. The date is the commit day from `date +%F`.

```
| 0.13.0 | <commit day from `date +%F`> | **D-C14 + D-C15 — per-user rate limits, device-scoped sessions, classified auth errors (reliability-overhaul Phase 3 R1; DESIGN_BOARD §2 backend 3–5).** Every call on a user's behalf authenticates with `SUPABASE_SECRET_KEY` (anon fallback) and forwards the user's IP as `Sb-Forwarded-For` (`config/supabase.js` `userAuthKey` / `forwardedForHeaders`); `/logout` → this device only (`scope=local`, Bearer or body refresh token); `/change-password` + `/set-password` → GoTrue `PUT /user` with the caller's Bearer: this device stays signed in, other sessions end (before: the admin update ended every session, this one too — board premise corrected); same password → 400; `/reset-password` → admin update, every session ends (unchanged, documented; `resetPassword`); NET-NEW `POST /logout-all` (scope global); logout / own-password / link / unlink call GoTrue directly (`services/authSessionService.js`; `makeEphemeralAuthClient` removed — F13 resolved; `/link` + `/unlink` no longer need `refresh_token`); `supabaseAdmin` 15 s timeout (F15); `503 auth_unavailable` + `Retry-After` for Supabase / Google / JWKS failures on login, `/oauth` (was 502 for Google), `/oauth/complete`, `PUT /email`, register, identities, link, unlink, set/change/reset-password, logout-all and the SSE stream (F12, F14); `PUT /email` wrong password + `/link` provider rejection 401 → 400 (live iOS signed out on them); one `sendAuthError` path echoing `code` + `Retry-After` on every route; catch blocks log via `utils/logError.js`. §3.1 = the client contract for the Phase 3 release. Config (user-approved admin-token calls, ENV_RUNBOOK §7c): `security_sb_forwarded_for_enabled` true, `sessions_inactivity_timeout` 2160 h (D-5). New flags F17, F18. `/refresh` 200 byte-identical; safe for iOS 1.4.0–1.4.3 and Android 1.0.0 (3)/(4). **MINOR**; zero dependent re-version (notifications: stream 503 — R3 updates its SPEC). |
```

### 12. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md`

**12a. Header and §1.**
- Line 3: change `**Version:** 0.1.1` to `**Version:** 0.2.0`.
- Line 26 (§1 item 5): replace with `5. **SQL query logging off** by default (§6); the global `errorHandler` never prints a request body (D-C10) and answers a malformed / oversized / mis-encoded body with its 4xx in the frontend-kit vocabulary on every route; one log helper for caught errors, `logError` (D-C11).`

**12b. §4.** Replace the last bullet (lines 142-144, "Router-local body-parser error handler …") with:
```
- **Router-local body-parser error handler** keeps the real 413 / 400 / 415 for every parser 4xx of the 64 kb parser,
  including decompression errors that carry no `err.type`. Since 0.2.0 the global `errorHandler` answers every other
  route's body-parser failures the same way (D-C11).
- **Global `errorHandler`** (`middleware/errorHandler.js`, 0.2.0): `AppError` → `{ error, code? }` + `Retry-After` when
  set; body-parser 4xx → `400`/`415 { error: "Invalid request body.", code: "invalid_body" }` or `413 { error: "Payload
  too large.", code: "payload_too_large" }`, logged `Rejected request body: <type or name> <status>`; anything else →
  `500 { error: "Internal server error." }`, logged via `logError("Unhandled error:", err)`.
- **`logError(tag, err)`** (`utils/logError.js`, 0.2.0 — kept beside `utils/response.js` in auth's reference_impl, so
  no feature-graph cycle) — the ONE log line for a caught error: `<tag> <name> code=<code> status=<status> <message ≤
  200 chars> [<first two stack frames>]`; a `Sequelize*` error prints only `<tag> <name> code=<Postgres code>`. Never
  the error object, `err.sql`, `err.parameters` or `err.body`. Every Phase 3 track imports it — never a copy.
```

**12c. §5.** In the `source` row, replace `'server'` (Phase 3 R1 auth events) with `'server'` (reserved — no server-side writer yet, D-C9).

**12d. §7.** In the Downstream bullet, replace `R1 writes `source = 'server'` auth events;` with `server-side auth events are deferred (D-C9);`.

**12e. §8.** Replace the bullet starting `- Event `type`s are registered here when the senders land` (lines 210-211) with:

```markdown
- Web sends `fetch` with `application/json` (a `text/plain` `sendBeacon` body is not parsed).
- **Registered event types** (more families — `sync.*`, `client.error` — are registered by the tracks that add them):

  | `type` | When | `props` (all optional unless marked) |
  |---|---|---|
  | `auth.forced_sign_out` | the client ended the session without the user asking | `reason` (**required**): `refresh_session_invalid` (`/auth/refresh` → `401 session_invalid` — incl. a password change / sign-out-everywhere on another device, or the 90-day inactivity limit) · `token_store_unreadable` (the device's token store is unreadable or corrupt); `status` (int, HTTP status when there was one); `code` (the server `code`, e.g. `session_invalid`) |
  | `auth.sign_in_failed` | a sign-in attempt failed for any reason other than the user cancelling | `method` (**required**): `password` · `google` · `apple`; `kind` (**required**): `wrong_credentials` (401 on a public sign-in route) · `invalid_input` (400/422) · `conflict` (409) · `unavailable` (429/503) · `offline` · `timeout` · `server` (other 5xx) · `provider` (the native provider SDK failed before any API call) · `unknown`; `status` (int); `code` (server `code` or the provider SDK's error code, ≤ 64 chars) |
  | `auth.refresh_failed` | `/auth/refresh` failed and the session was KEPT (503 / 429 / 5xx / timeout / offline) | `kind` (**required**, same values as above); `status` (int); `code` |

  The backend needs no change for these (auth 0.13.0 / Phase 3 R1): `POST /api/client-events` already accepts them signed-out.
```

**12f. §9.**

Replace the D-C9 row's Decision cell with:
```
**Deferred:** an error `code` in the log line (needs every catch on the kit vocabulary); the `tools/` query pack (§7.4); process `unhandledRejection` handlers; client senders (the Phase 3 client release — §8 is their contract); `push_deliveries` (R3). **Server-side auth events (`source = 'server'`): not built** — decided in Phase 3 R1 (auth 0.13.0): forced sign-outs, sign-in failures and kept-session refresh failures are client-reported (§8), and the server's own `[refresh] session_invalid\|auth_unavailable`, `[login] auth_unavailable`, `[logout:*]` and `[password]` log lines cover the server side for 7 days; revisit only if those prove insufficient. Done in 0.2.0: malformed JSON → 4xx on every route (D-C11).
```

Append to the D-C10 Decision cell: ` Since 0.2.0 (D-C11) body-parser errors answer their 4xx and log `Rejected request body: <type or name> <status>`; every other error is logged via `logError` (no longer "in full").`

Insert after D-C10:
```
| **D-C11** | **Deliberate change (0.2.0) — body-parser failures keep their 4xx on every route + one log helper (resolves F2; F8 for the adopting files; reliability-overhaul Phase 3 R1).** (a) The global `errorHandler` answers an `express.json()` failure — a 4xx `status` with a string `type` or http-errors' `expose` (decompression errors carry no `type`) — with `413 { error: "Payload too large.", code: "payload_too_large" }` or `<status> { error: "Invalid request body.", code: "invalid_body" }` (400 malformed / non-object JSON / corrupt gzip-deflate, 415 unsupported charset or encoding) instead of `500`; the mapping `routes/clientEvents.js` has used since 0.1.0. (b) An `AppError` reaching the global handler also echoes its `code` and sets `Retry-After` when `retryAfter` is set (additive). (c) `utils/logError.js` `logError(tag, err)`: `<tag> <name> code=<code> status=<status> <message ≤ 200 chars> [<first two stack frames>]` (frames are code locations; the stack header is skipped whole); `Sequelize*` errors print `<tag> <name> code=<Postgres code>` only; never the error object, `err.sql`, `err.parameters` or `err.body`. Adopted by the global handler's 500 path and every `/api/auth` catch (auth D-C15); other routes adopt it as Phase 3 tracks touch them — the signature is fixed. Lives beside `utils/response.js` under auth's reference_impl (every feature already depends on auth — no graph cycle). Live binaries: no client sends malformed JSON; a > 100 kb body was 500 and is now 413 (none observed — 2 × 500 in 30 days). MINOR (status change on an error path of every route). | Phase 3 R1 brief (F2, F8); frontend-kit §4; `middleware/errorHandler.js`; `utils/logError.js`; `routes/clientEvents.js`. |
```

**12g. §10.**
- F2: wrap its characteristic text in `~~…~~` and set the Follow-up cell to `**Resolved 0.2.0 (D-C11).**`
- F8: set the Follow-up cell to `**Partially resolved 0.2.0 (D-C11):** `logError` adopted by the global handler + every `/api/auth` catch; the remaining routes (e.g. `routes/members.js:51`) adopt it as Phase 3 tracks touch them.`

**12h. §11.** Insert a new first row (date = commit day, `date +%F`):
```
| 0.2.0 | <commit day from `date +%F`> | **D-C11 — body-parser 4xx on every route + `logError` (Phase 3 R1).** The global `errorHandler` answers malformed / oversized / mis-encoded bodies with `400`/`415 invalid_body` / `413 payload_too_large` (was 500 — F2 resolved), echoes an `AppError`'s `code` + `Retry-After`, and logs other errors via the new `utils/logError.js` (name / code / status / message / two stack frames; Sequelize → name + Postgres code; never the object — F8 partially resolved). §8 registers `auth.forced_sign_out`, `auth.sign_in_failed`, `auth.refresh_failed`. D-C9: server-side auth events stay unbuilt (client-reported instead). MINOR; ships with auth 0.13.0. |
```

### 13. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`

- `features.auth`:
  - `"version"` → `"0.13.0"`.
  - `reference_impl.paths` →
    ```
    ["routes/auth.js","services/authService.js","services/authSessionService.js","middleware/auth.js","config/supabase.js","services/supabaseTokenRefresh.js","utils/stagingGuard.js","utils/response.js","utils/logError.js","sql/008_staging_schema.sql","models/Member.js","models/MemberEmail.js","server.js"]
    ```
    Keep the file's existing one-item-per-line formatting.
- `features.observability`: `"version"` → `"0.2.0"`. Paths are unchanged.

### 14. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`

Edit cells only. Status cells are untouched.

- Line 13 (`auth` row):
  - Version cell `0.12.1` → `0.13.0`.
  - Implementation cell → `` `backend` (`routes/auth.js`, `services/authService.js`, `services/authSessionService.js`, `services/supabaseTokenRefresh.js`, `middleware/auth.js`, `config/supabase.js`, `utils/stagingGuard.js`, `utils/{response,logError}.js`, `sql/008_staging_schema.sql`) ``.
- Line 27 (`observability` row):
  - Version cell `0.1.1` → `0.2.0`.
  - In the implementation cell, change `` `middleware/errorHandler.js` [no request bodies in logs] `` to `` `middleware/errorHandler.js` [body-parser 4xx · no request bodies in logs] ``.

### 15. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md`

**15a. §3 rows.**

Replace line 105 (the `SUPABASE_ANON_KEY` row) with:
```
| `SUPABASE_ANON_KEY` | anon key — the fallback key for every Auth call made on a user's behalf (sign-in / refresh / logout / password / link / recovery) while `SUPABASE_SECRET_KEY` is unset | **secret-ish** | **NEW (R1)** — anon (publishable) key; never the service-role for client-acting flows. Set on the platform (live). Since auth 0.13.0 used only when `SUPABASE_SECRET_KEY` is unset (D-C14). |
```

Replace line 107 (the `SUPABASE_SECRET_KEY` row) with:
```
| `SUPABASE_SECRET_KEY` | new-style Supabase secret API key (`sb_secret_…`, name `rasifiters-api`) — authenticates every Auth call made on a user's behalf so Supabase honours `Sb-Forwarded-For` (per-user IP rate limits; the anon / service_role keys can't) | **secret** | Set 2026-10-12 on `rasifiters-api` **and** `rasifiters-api-staging` (board D-4). **Read by `config/supabase.js` `userAuthKey()` since auth 0.13.0 (D-C14)**; forwarding also needs the §7c setting `security_sb_forwarded_for_enabled`. **Kill switch:** delete the var on the service and redeploy → the anon key, no forwarding (pre-0.13.0 behaviour). Rotate = create a new secret key in Supabase → set it here → redeploy → delete the old key. |
```

Line 118 (the `APP_ENV` row): replace `(login-change guard, staging-only reset mail, local-scope logout, boot check:` with `(login-change guard incl. `+stg`-only password change and sign-out-everywhere, staging-only reset mail, boot check:`.

**15b. Insert a new section after §7b** (after line 282, before `## Staging`):

````markdown
## 7c. Supabase Auth settings (shared by prod + staging)

One Supabase project = one Auth config for both APIs (DESIGN_BOARD §8). These are **settings, not env vars**; they change
only by a user-approved admin-token call.

- **Read** (read-only token): `tools/ops-get.sh supabase '/v1/projects/kpadxjekpiwfkqcxtrio/config/auth' | jq '{jwt_exp, refresh_token_rotation_enabled, security_refresh_token_reuse_interval, rate_limit_token_refresh, rate_limit_otp, security_sb_forwarded_for_enabled, sessions_inactivity_timeout, sessions_timebox, sessions_single_per_user, security_manual_linking_enabled, security_update_password_require_reauthentication, security_update_password_require_current_password}'`
- **Change** — one Management API `PATCH` with `SUPABASE_ADMIN_TOKEN` (the `token-guard` hook asks the user every time;
  the token goes in on stdin, never on the command line); then read back. Supabase reloads Auth ~1 min later:
  ```bash
  printf 'Authorization: Bearer %s' "$SUPABASE_ADMIN_TOKEN" | curl -sS -m 60 -X PATCH -H @- \
    -H 'Content-Type: application/json' -A 'rasifiters-ops/1.0' -d '<JSON body from the table>' \
    'https://api.supabase.com/v1/projects/kpadxjekpiwfkqcxtrio/config/auth' | jq '<the keys you changed>'
  ```

| Setting | Value | Status | Why | Revert body |
|---|---|---|---|---|
| `jwt_exp` | `3600` (1 h access tokens) | default | — | — |
| `refresh_token_rotation_enabled` / `security_refresh_token_reuse_interval` | `true` / `10` (s) | default | a refresh token re-sent > 10 s after its rotation revokes the whole session (W1) | — |
| `rate_limit_token_refresh` | `1500` per 5 min per IP (was 150) | applied 2026-10-12T19:08:19Z (Phase 1b H2 / D-2) | one user's refresh storm no longer drains everyone's bucket | `{"rate_limit_token_refresh":150}` |
| `rate_limit_otp` | `30` per 5 min per IP | default | also limits GoTrue `PUT /user` — `/change-password` + `/set-password` since auth 0.13.0 (a 429 answers 503) | — |
| `security_sb_forwarded_for_enabled` | `true` (was `false`) | pending — Phase 3 R1 go-live step G3 | auth D-C14: Auth rate-limits by the `Sb-Forwarded-For` IP the backend sends with `SUPABASE_SECRET_KEY` → one bucket per user instead of one per Render IP | `{"security_sb_forwarded_for_enabled":false}` |
| `sessions_inactivity_timeout` | `2160` **hours** = 90 days (was `0` = never); Pro plan | pending — Phase 3 R1 go-live step G4 | board D-5: a session not refreshed for 90 days ends at its next refresh (`session_expired` → `401 session_invalid`); any app open or background sync counts as use | `{"sessions_inactivity_timeout":0}` |
| `security_update_password_require_reauthentication` / `security_update_password_require_current_password` | `false` / `false` | default — **must stay false** | auth D-C14b: `/change-password` + `/set-password` call `PUT /user` without a nonce or the current password; turning either on makes both answer 400 | — |
| `sessions_timebox` / `sessions_single_per_user` | `0` / `false` | default | no maximum lifetime; several devices per user | — |
| `security_manual_linking_enabled` | `true` | applied (auth D-C10) | `/link` + `/unlink` | — |
| SMTP (`smtp_*`) | Resend | applied 2026-10-12 | password-reset mail (§7b) | — |
````

**15c. §Staging.**
- Last line: change `…and the refresh rate limits are shared with prod.` to `…and the refresh rate limits are shared with prod (§7c).`
- Then append:
```
**Auth / session tests (Phase 3 R1, auth 0.13.0).** Staging and prod share Supabase Auth, so the secret key, IP forwarding
and the inactivity timeout act on staging requests too. The R1 smoke (`specs/initiatives/reliability-overhaul/plans/phase-3-r1-sessions/`)
uses the `+stg` accounts `mason.w` and `zoe.chen`; it changes `zoe.chen`'s staging password and restores it — if the
restore fails, reset it via the staging forgot-password page (the mail reaches the `TESTBED_STAGING_MAILBOX` inbox).
`/link` / `/unlink` on staging need a `+stg` account plus a dedicated test Google account (auth D-C13).
```

## Steps — web
None. The bundled client release is planned separately against auth SPEC §3.1 and observability §8.

## Steps — ios
None, for the same reason.

## Steps — android
None, for the same reason.

## Endgame

### 16. Compile and boot check (the implementer runs it)

**Syntax.** This must print nothing:
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && for f in config/supabase.js services/supabaseTokenRefresh.js services/authSessionService.js services/authService.js routes/auth.js middleware/auth.js middleware/errorHandler.js utils/logError.js; do node --check "$f" || echo "FAIL $f"; done
```

**Greps.** Each of these must print nothing.

Removed symbols (full-line comments are excluded):
```
grep -rn -E "makeEphemeralAuthClient|setSession|_useSession|authService\.logout|revokeAfterPasswordChange" --include='*.js' --exclude-dir=node_modules /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend | grep -v -E '^[^:]+:[0-9]+:[[:space:]]*//'
```

No error objects logged:
```
grep -n -E "console\.(error|warn)\([^)]*, err\)" /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/auth.js /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/errorHandler.js /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authSessionService.js
```

**Boot check:**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node -e 'const r=require("./routes/auth");console.log(r.stack.filter(l=>l.route).map(l=>Object.keys(l.route.methods)[0].toUpperCase()+" "+l.route.path).join(","));console.log(Object.keys(require("./config/supabase")).sort().join(","));console.log(Object.keys(require("./services/authSessionService")).sort().join(","));console.log(Object.keys(require("./middleware/auth")).sort().join(","));const a=require("./services/authService");console.log(["changePassword","resetPassword","setPassword","logout"].map(k=>k+"="+typeof a[k]).join(","));process.exit(0)'
```

Expected output, one line each:
1. `POST /login,POST /login/app,POST /login/global,GET /me,POST /refresh,POST /logout,POST /logout-all,POST /register,POST /oauth,POST /oauth/complete,GET /identities,POST /link,POST /unlink,POST /set-password,POST /forgot-password,POST /reset-password,PUT /change-password,PUT /email,DELETE /account`
2. `ADMIN_HTTP_TIMEOUT_MS,AUTH_HTTP_TIMEOUT_MS,AUTH_RETRY_AFTER_SECONDS,forwardedForHeaders,makeRequestAuthClient,supabaseAdmin,userAuthKey,verifySupabaseJwt`
3. `assertStagingUser,deleteIdentity,linkIdToken,logout,logoutEverywhere,updateOwnPassword`
4. `authenticateStream,authenticateToken,canModifyLog,isAdmin,isVerifyInfraFailure,optionalAuthenticate,requireProgramAdmin,requireProgramMember,sendAuthUnavailable`
5. `changePassword=function,resetPassword=function,setPassword=function,logout=undefined`

**Header helper check:**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_SECRET_KEY=sb_secret_x node -e 'const s=require("./config/supabase");console.log(JSON.stringify(["::ffff:1.2.3.4","2001:db8::1","garbage",undefined].map(s.forwardedForHeaders)),s.userAuthKey())'
```
- Expected: `[{"Sb-Forwarded-For":"1.2.3.4"},{"Sb-Forwarded-For":"2001:db8::1"},{},{}] sb_secret_x`.
- The same command without `SUPABASE_SECRET_KEY` must give `[{},{},{},{}] x`.

**logError check:**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node -e 'const {logError}=require("./utils/logError");logError("[t]",Object.assign(new Error("boom"),{code:"X1",status:503}));const e=new Error("insert a@b.c");e.name="SequelizeDatabaseError";e.parent={code:"23505"};e.sql="INSERT";logError("[t]",e);const m=new Error("line1\nat leak@x.io");logError("[m]",m)' 2>&1
```
- Line 1 starts with `[t] Error code=X1 status=503 boom [at `.
- Line 2 is exactly `[t] SequelizeDatabaseError code=23505`.
- Line 3 starts with `[m] Error code=- status=- line1`.
- The output contains no `a@b.c` and no `INSERT`, and `leak@x.io` appears only once (inside the message, never as a frame).

**Who runs what:** web, android and iOS are not touched, so they have no build (iOS ⌘B is not applicable). All live and visual checks belong to the USER.

### 17. Local forced-failure smoke (Claude runs it before any push)

**Setup:**
- `apps/backend/.env.local` must not exist (it is absent today). `.env` carries only `DATABASE_URL`, which reads the prod DB.
- Start three servers in the background from `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`, with output to scratchpad log files `r1-5056.log`, `r1-5057.log` and `r1-5058.log`:
  - `PORT=5056 SUPABASE_URL=http://127.0.0.1:9 SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_SECRET_KEY=sb_secret_r1smoke_fake node server.js`
  - `PORT=5057 SUPABASE_URL=http://10.255.255.1 SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node server.js`
  - `PORT=5058 SUPABASE_URL=http://127.0.0.1:9 SUPABASE_JWKS_URL=https://kpadxjekpiwfkqcxtrio.supabase.co/auth/v1/.well-known/jwks.json SUPABASE_JWT_ISS=https://kpadxjekpiwfkqcxtrio.supabase.co/auth/v1 SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node server.js`
- Wait with an until-loop until `GET /` answers on all three.

**Run:**
- Write the script below to the scratchpad as `r1-smoke.sh`.
- Run `TESTBED_PASSWORD=<the testbed password, typed by the user> MODE=forced bash r1-smoke.sh`. Never write the password to a file.
- Every line must say PASS.
- `grep -c eyJ` on each of the three log files must give 0.

**Stop the servers:** `kill $(lsof -ti tcp:5056 -ti tcp:5057 -ti tcp:5058 -sTCP:LISTEN)`, then delete the scratchpad logs.

```bash
#!/usr/bin/env bash
# Phase 3 R1 smoke (auth 0.13.0 / observability 0.2.0). Prints PASS/FAIL only — never a token or a password.
#   MODE=forced  local servers :5056 (refused) :5057 (black hole) :5058 (real JWKS, GoTrue refused) — before any push
#   MODE=staging the staging API (woken first) — sessions, password scopes, sign-out-everywhere, link/unlink paths
#   MODE=prod    the prod API — malformed JSON, login errors, logout scope, credential 400s, PUT /user path
# Usage: TESTBED_PASSWORD=… MODE=<mode> bash r1-smoke.sh
set -uo pipefail
: "${TESTBED_PASSWORD:?set TESTBED_PASSWORD}"; : "${MODE:?MODE=forced|staging|prod}"
case "$MODE" in
  staging) A="https://rasifiters-api-staging.onrender.com/api" ;;
  prod|forced) A="https://rasifiters-api.onrender.com/api" ;;
  *) echo "MODE must be forced|staging|prod"; exit 2 ;;
esac
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1 — expected [$3] got [$2]"; FAIL=$((FAIL+1)); fi; }
req() { local u="$1"; shift; curl -s -m 30 -o "$T/body" -D "$T/hdr" -w '%{http_code}' -H 'Content-Type: application/json' "$@" "$u"; }
body() { jq -c . "$T/body" 2>/dev/null || cat "$T/body"; }
hdr() { grep -i "^$1:" "$T/hdr" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
code() { cat "$T/code"; }
login() { req "$1/auth/login/app" -X POST -d "$(jq -nc --arg u "$2" --arg p "$TESTBED_PASSWORD" '{identifier:$u,password:$p}')" >"$T/code"
          AT=$(jq -r '.token // empty' "$T/body"); RT=$(jq -r '.refresh_token // empty' "$T/body"); }
# NEVER pass the same refresh token twice — reuse after 10 s revokes the whole session.
refresh() { req "$1/auth/refresh" -X POST -d "$(jq -nc --arg t "$2" '{refresh_token:$t}')" >"$T/code"
            NAT=$(jq -r '.token // empty' "$T/body"); NRT=$(jq -r '.refresh_token // empty' "$T/body"); }
pw() { jq -nc --arg p "$1" '{new_password:$p}'; }
U='{"error":"Authentication service temporarily unavailable","code":"auth_unavailable"}'
IB='{"error":"Invalid request body.","code":"invalid_body"}'
SI='{"error":"Invalid refresh token","code":"session_invalid"}'
SP='{"error":"New password must be different from your current password."}'

if [ "$MODE" != "forced" ]; then
  [ "$MODE" = "staging" ] && { curl -s -m 120 -o /dev/null "${A%/api}/"; curl -s -m 120 -o /dev/null "${A%/api}/"; }
  echo "== malformed JSON → 400 ($A)"
  s=$(req "$A/auth/login" -X POST --data-binary '{"identifier":'); check "malformed /auth/login → 400" "$s" "400"; check "body" "$(body)" "$IB"
  s=$(req "$A/programs" -X POST --data-binary 'not json'); check "malformed /programs → 400" "$s" "400"; check "body" "$(body)" "$IB"
  echo "== login errors"
  s=$(req "$A/auth/login/app" -X POST -d '{"identifier":"mason.w","password":"Wrong-Passw0rd"}')
  check "wrong password → 401 (not 503)" "$s" "401"; check "body" "$(body)" '{"error":"Invalid credentials"}'
  echo "== logout ends THIS device only"
  login "$A" mason.w; check "login #1 (secret key on the SDK path)" "$(code)" "200"; R1=$RT
  login "$A" mason.w; check "login #2" "$(code)" "200"; A2=$AT; R2=$RT
  s=$(req "$A/auth/logout" -X POST -H "Authorization: Bearer $A2" -d "$(jq -nc --arg t "$R2" '{refresh_token:$t}')")
  check "logout Bearer+body → 200" "$s" "200"; check "body" "$(body)" '{"message":"Logged out"}'
  refresh "$A" "$R2"; check "logged-out session → 401" "$(code)" "401"; check "body" "$(body)" "$SI"
  refresh "$A" "$R1"; check "other session still refreshes → 200" "$(code)" "200"
  check "refresh shape" "$(jq -c keys_unsorted "$T/body")" '["token","refresh_token","message"]'
  s=$(req "$A/auth/logout" -X POST -d "$(jq -nc --arg t "$NRT" '{refresh_token:$t}')"); check "logout body-only (iOS) → 200" "$s" "200"
  s=$(req "$A/auth/logout" -X POST -d '{}'); check "logout nothing → 400" "$s" "400"; check "body" "$(body)" '{"error":"Refresh token required"}'
  echo "== authenticated credential errors are 400 (D-C15d)"
  login "$A" mason.w; A3=$AT; R3=$RT
  s=$(req "$A/auth/email" -X PUT -H "Authorization: Bearer $A3" -d '{"new_email":"r1-smoke+stg@example.com","password":"Wrong-Passw0rd"}')
  check "PUT /email wrong password → 400" "$s" "400"; check "body" "$(body)" '{"error":"Current password is incorrect."}'
  s=$(req "$A/auth/change-password" -X PUT -H "Authorization: Bearer $A3" -d "$(pw "$TESTBED_PASSWORD")")
  check "change-password same password → 400 (GoTrue PUT /user path)" "$s" "400"; check "body" "$(body)" "$SP"
  s=$(req "$A/auth/oauth/complete" -X POST -H "Authorization: Bearer not.a.jwt" -d '{"username":"r1smoke"}'); check "/oauth/complete garbage → 401" "$s" "401"
  s=$(req "$A/notifications/stream?token=not.a.jwt"); check "stream garbage → 401" "$s" "401"
  s=$(req "$A/auth/forgot-password" -X POST -d '{"email":"nobody+stg-r1smoke@example.com"}'); check "forgot-password → 200" "$s" "200"
  s=$(req "$A/auth/logout" -X POST -H "Authorization: Bearer $A3" -d "$(jq -nc --arg t "$R3" '{refresh_token:$t}')"); check "cleanup logout → 200" "$s" "200"
fi

if [ "$MODE" = "staging" ]; then
  echo "== change-password keeps THIS session, ends the OTHERS (zoe.chen)"
  login "$A" zoe.chen; check "login Z1" "$(code)" "200"; Z1=$AT; ZR1=$RT
  login "$A" zoe.chen; check "login Z2" "$(code)" "200"; ZR2=$RT
  TMP="Stg$(date +%s)aZ"
  s=$(req "$A/auth/change-password" -X PUT -H "Authorization: Bearer $Z1" -d "$(pw "$TMP")"); check "change-password → 200" "$s" "200"
  refresh "$A" "$ZR2"; check "other device → 401 session_invalid" "$(code)" "401"
  refresh "$A" "$ZR1"; check "this device kept → 200" "$(code)" "200"; Z1=$NAT; ZR1=$NRT
  s=$(req "$A/auth/change-password" -X PUT -H "Authorization: Bearer $Z1" -d "$(pw "$TESTBED_PASSWORD")"); check "password restored → 200" "$s" "200"
  [ "$s" = "200" ] || echo "!! zoe.chen's STAGING password is still the temporary one — reset it via the staging forgot-password page"
  s=$(req "$A/auth/set-password" -X POST -H "Authorization: Bearer $Z1" -d "$(pw "$TESTBED_PASSWORD")"); check "set-password same password → 400" "$s" "400"; check "body" "$(body)" "$SP"
  echo "== sign out everywhere"
  login "$A" zoe.chen; check "login Z3" "$(code)" "200"; ZR3=$RT
  s=$(req "$A/auth/logout-all" -X POST -H "Authorization: Bearer $Z1"); check "logout-all → 200" "$s" "200"; check "body" "$(body)" '{"message":"Logged out everywhere"}'
  refresh "$A" "$ZR1"; check "this device ended → 401" "$(code)" "401"
  refresh "$A" "$ZR3"; check "other device ended → 401" "$(code)" "401"
  s=$(req "$A/auth/logout-all" -X POST); check "logout-all without token → 401" "$s" "401"
  echo "== link / unlink go straight to GoTrue"
  login "$A" zoe.chen; Z4=$AT; ZR4=$RT
  s=$(req "$A/auth/link" -X POST -H "Authorization: Bearer $Z4" -d '{"provider":"google","id_token":"not-a-real-id-token"}'); check "link garbage id_token → 400 (was 401)" "$s" "400"
  s=$(req "$A/auth/unlink" -X POST -H "Authorization: Bearer $Z4" -d '{"provider":"google"}'); check "unlink (none linked) → 400" "$s" "400"
  refresh "$A" "$ZR4"; check "session intact after link → 200" "$(code)" "200"
  s=$(req "$A/auth/logout" -X POST -H "Authorization: Bearer $NAT" -d "$(jq -nc --arg t "$NRT" '{refresh_token:$t}')"); check "cleanup logout → 200" "$s" "200"
fi

if [ "$MODE" = "forced" ]; then
  B="http://localhost:5056/api"; C="http://localhost:5057/api"; D="http://localhost:5058/api"
  login "$A" mason.w; check "prod login (a real, verifiable JWT)" "$(code)" "200"; PA=$AT   # left idle: pre-deploy prod /logout is still global
  for X in "$B" "$C"; do
    echo "== Supabase unreachable ($X)"
    t0=$(date +%s); s=$(req "$X/auth/login/app" -X POST -d "$(jq -nc --arg p "$TESTBED_PASSWORD" '{identifier:"mason.w",password:$p}')"); dt=$(( $(date +%s) - t0 ))
    check "login → 503" "$s" "503"; check "body" "$(body)" "$U"; check "Retry-After" "$(hdr Retry-After)" "5"
    check "login ≤ 7 s" "$([ "$dt" -le 7 ] && echo yes || echo "no(${dt}s)")" "yes"
    s=$(req "$X/auth/refresh" -X POST -d '{"refresh_token":"r1-smoke-not-a-token"}'); check "refresh → 503" "$s" "503"
    s=$(req "$X/auth/oauth/complete" -X POST -H "Authorization: Bearer $PA" -d '{"username":"r1smoke"}'); check "oauth/complete (JWKS down) → 503" "$s" "503"; check "body" "$(body)" "$U"
    s=$(req "$X/notifications/stream" -H "Authorization: Bearer $PA"); check "stream (JWKS down) → 503" "$s" "503"
    t0=$(date +%s); s=$(req "$X/auth/logout" -X POST -H "Authorization: Bearer $PA" -d '{"refresh_token":"r1-smoke-not-a-token"}'); dt=$(( $(date +%s) - t0 ))
    check "logout → 200 (best-effort)" "$s" "200"; check "logout ≤ 7 s (no second call)" "$([ "$dt" -le 7 ] && echo yes || echo "no(${dt}s)")" "yes"
    s=$(req "$X/auth/forgot-password" -X POST -d '{"email":"nobody+stg-r1smoke@example.com"}'); check "forgot-password → 200" "$s" "200"
  done
  s=$(req "$B/auth/oauth" -X POST -d '{"provider":"google","id_token":"x"}'); check "oauth (Supabase down) → 503" "$s" "503"
  s=$(req "$B/auth/login" -X POST --data-binary '{bad'); check "malformed JSON → 400" "$s" "400"; check "body" "$(body)" "$IB"
  echo "== GoTrue + admin down, JWKS up ($D)"
  H=(-H "Authorization: Bearer $PA")
  s=$(req "$D/auth/me" "${H[@]}"); check "/me → 200 (setup)" "$s" "200"
  s=$(req "$D/auth/identities" "${H[@]}"); check "identities → 503" "$s" "503"; check "body" "$(body)" "$U"
  s=$(req "$D/auth/logout-all" -X POST "${H[@]}"); check "logout-all → 503" "$s" "503"
  s=$(req "$D/auth/email" -X PUT "${H[@]}" -d '{"new_email":"r1-smoke+stg@example.com","password":"Wrong-Passw0rd"}'); check "PUT /email → 503" "$s" "503"
  s=$(req "$D/auth/link" -X POST "${H[@]}" -d '{"provider":"google","id_token":"x"}'); check "link → 503" "$s" "503"
  s=$(req "$D/auth/change-password" -X PUT "${H[@]}" -d '{"new_password":"R1smoke-Unused9"}'); check "change-password (GoTrue down) → 503" "$s" "503"
  s=$(req "$D/auth/set-password" -X POST "${H[@]}" -d '{"new_password":"R1smoke-Unused9"}'); check "set-password (admin down) → 503" "$s" "503"
fi
echo "== $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
```

### 18. Migration
None. R1 changes no schema. The settings changes are config-only (G3, G4).

### 19. git-version
Use one commit covering both features.
- **Bumps:**
  - `auth` 0.12.1 → **0.13.0**
  - `observability` 0.1.1 → **0.2.0**
  - Both are MINOR: a pre-1.0 owned-interface change (a new route plus deliberate status changes, each additive or safer).
- **Blast radius:**
  - auth's 15 dependents: FYI, zero re-version.
  - `notifications`: the stream gains a 503 (R3 updates its SPEC, H1).
  - `members` / `program-memberships`: admin calls now time out at 15 s (F18, A1).
  - Apps touched: backend only.
- **Commit message:** `feat(auth,observability): per-user rate limits, device-scoped sessions, classified auth errors (auth 0.13.0, observability 0.2.0)`.
- **Tags:** `feature/auth@v0.13.0` and `feature/observability@v0.2.0`.
- Do not push yet; G1 comes first.

## Go-live (after the commit; the user approves every push and every setting)

- **G1 — Staging.**
  1. With the user's OK, run `git push origin main:staging`. Use `--force-with-lease` only if the push is rejected, and only with the user's OK.
  2. Verify the staging deploy is `live`, and that its logs show `[staging] APP_ENV=staging — login-change guard active`.
  3. Run `TESTBED_PASSWORD=… MODE=staging bash r1-smoke.sh`. Every check must PASS.
  4. **USER** check on the web staging alias, with a `+stg` account and a dedicated test Google account: link Google, then unlink it. Neither step may sign the user out.
  5. **STOP** if any of these happens while Supabase is healthy:
     - any login, refresh, forgot-password, link or change-password answers **503** (the secret key or header shape is rejected);
     - "this device kept" fails.

     Do not push prod; bring it to the user. Rollback = unset `SUPABASE_SECRET_KEY` on staging (user-approved), then re-plan.
- **G2 — Prod.**
  1. With the user's OK, run `git push origin main && git push origin feature/auth@v0.13.0 feature/observability@v0.2.0`.
  2. Render MCP `list_deploys` (workspaceId `tea-cv3u7a3tq21c73ald2ig`, serviceId `srv-d90tgmv7f7vs73cudptg`) must show `live` on the commit SHA.
  3. **User-run prod smoke** (or Claude runs it with the user's OK): `TESTBED_PASSWORD=… MODE=prod bash r1-smoke.sh`. Every check must PASS.
  4. The user signs in and out once on the iPhone and once on the Pixel, and confirms that signing out on one device does not sign out the other.
- **G3 — IP forwarding** (user-approved admin-token call; `token-guard` asks):
  ```
  printf 'Authorization: Bearer %s' "$SUPABASE_ADMIN_TOKEN" | curl -sS -m 60 -X PATCH -H @- -H 'Content-Type: application/json' -A 'rasifiters-ops/1.0' -d '{"security_sb_forwarded_for_enabled":true}' 'https://api.supabase.com/v1/projects/kpadxjekpiwfkqcxtrio/config/auth' | jq '{security_sb_forwarded_for_enabled}'
  ```
  1. The response must show `true`. Record the UTC time.
  2. After about 1 minute, re-run `MODE=prod`. Every check must PASS.
  3. After 24 h, compare against the baseline of 4 distinct addresses per 24 h (2026-10-12). Use counts only:
     ```
     tools/supabase-logs.sh "select count(distinct log_attributes['remote_addr']) addrs, count(*) n from logs where source='auth_logs' and log_attributes['msg']='request completed' and log_attributes['path']='/token'"
     ```
     - If the count rises, forwarding is observable.
     - If it stays at 4 or below with traffic, record "not observable in auth logs" for HANDOFF and keep the setting.
- **G4 — Inactivity timeout** (user-approved admin-token call):
  ```
  printf 'Authorization: Bearer %s' "$SUPABASE_ADMIN_TOKEN" | curl -sS -m 60 -X PATCH -H @- -H 'Content-Type: application/json' -A 'rasifiters-ops/1.0' -d '{"sessions_inactivity_timeout":2160}' 'https://api.supabase.com/v1/projects/kpadxjekpiwfkqcxtrio/config/auth' | jq '{sessions_inactivity_timeout}'
  ```
  The response must show `2160`. If the API refuses on plan grounds, stop and record "D-5 deferred (plan)".
- **G5 — Docs follow-up** (`chore(docs)`, no bump):
  - Set the ENV_RUNBOOK §7c Status cells for `security_sb_forwarded_for_enabled` and `sessions_inactivity_timeout` to `applied <UTC time recorded in G3/G4>`.
  - If G4 was refused: set that cell to `deferred — not available on the plan` and append `(deferred: plan)` to D-C14(e). That makes auth PATCH 0.13.1.
  - The orchestrator applies H2 and H3.

## Risks the implementer must watch

- **Push order:** never push `main` before G1 passes. Render auto-deploys prod on a `main` push.
- **Password semantics are GoTrue's:**
  - Admin password update = every session ends; `PUT /user` = the others end.
  - Do not route `/change-password` or `/set-password` back through `admin.updateUserById`, and do not move `/reset-password` to `PUT /user` (that would keep the emailed recovery session alive).
  - `PUT /user` needs the two require-reauth/current-password settings to stay false (§7c).
- **Staging guard:** `PUT /user` bypasses `guardAdminAuth`. `changePassword` (`assertStagingUser`) and `setPassword` (`assertStagingAccount`) must keep their explicit `+stg` checks.
- **Refresh tokens:** never re-send a refresh token in any smoke (10 s reuse rule). Never print tokens or passwords.
- **R3's code in `authService.js`:** do not touch `upsertPushToken` / `removePushToken` or the push-upsert blocks. Only line 148 and lines 434-439 change in those functions. Line 148 is 2 unchanged lines away from R3's 151-154, so git merges them cleanly. Apply edits bottom-up.
- **Wrong password must stay 401:** `isTransientAuthError` must never classify a wrong password as transient. Both smokes assert "wrong password → 401".
- **Log tags:** logout's refresh exchange logs `[logout] …`, never `[refresh] …` (Phase 1b watch metrics).
- **Header shape is a deliberate split:**
  - The SDK path sends `apikey` + `Authorization: Bearer sb_secret_…`.
  - Direct calls send the `sb_` key on `apikey` only, with the user JWT in `Authorization`.
  - Do not unify them without re-verifying on staging.
- **`trust proxy` stays 2.** A hop-count change makes buckets per-edge: no worse than today; re-measure per observability D-C7.
- **File size:** `authService.js` ends around 800 lines (F17). Do not refactor it here.

### Cross-track risks (R2 sync, R3 push/devices/SSE)

- **`routes/auth.js`:** R1 rewrites it (an auth-owned file). The `handleAppLogin` and `/oauth` hunks keep their shape and only gain `ip: req.ip`. R3's install-id edits to those exact lines conflict textually and must rebase onto R1. **The orchestrator enforces that R1 lands first.**
- **`middleware/auth.js`:** R1 edits only `authenticateStream` (old 90-116) and appends two names to the exports line (old 243 → 249). R3's SSE work rebases onto that.
- **`middleware/errorHandler.js`:** R1 is the only Phase 3 editor. R2 and R3 import `logError` from `utils/logError.js` (signature `logError(tag, err)` is fixed) and never redefine it.
- **`services/authService.js`:** R3's device registry may change the push-token functions. Those hunks are textually separate from R1's.
- **Shared SPEC versions:**
  - observability: R1 takes 0.2.0; R2 (`sync.*`) and R3 (`push_deliveries`) take the following versions in landing order.
  - auth: R1 takes 0.13.0; any R3 auth-owned change takes the next version.
- **Notifications SPEC lines 95 and 118:** R3 applies H1. The stream 503 is live from the day R1 deploys.
- **Shared doc and config files:** `render.yaml`, `.env.example`, `ENV_RUNBOOK.md`, `registry.json` and `REGISTRY.md` get own rows and sections only. `server.js` and `models/index.js` are untouched by R1.

Relevant files:
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authSessionService.js (new)
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/supabaseTokenRefresh.js
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/auth.js
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/errorHandler.js
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/logError.js (new)
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/render.yaml
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md
