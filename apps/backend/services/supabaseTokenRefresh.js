// Direct GoTrue calls (no SDK) + auth failure classification — auth SPEC D-C11 / D-C14 / D-C15.
// gotrueFetch = ONE request to {SUPABASE_URL}/auth/v1/… : no client object, no stored session, a 5 s timeout and NO
// automatic retry (auth-js re-sends a refresh token for up to 30 s on network/5xx errors; a token re-sent after
// Supabase already rotated it trips reuse detection and revokes the whole session). It authenticates with
// userAuthKey() (the secret key when set) and forwards the caller's IP as Sb-Forwarded-For (D-C14). Used by
// POST /auth/refresh (exchangeRefreshToken, below) and services/authSessionService.js (logout, sign out everywhere,
// own-password change, identity link / unlink).
// Refresh failures are classified so a client that honours the classification signs out only when its token is truly
// dead (live Android 1.0.0 signs out on ANY non-2xx refresh — a rejected API key would sign it out; auth D-C14a):
//   401 session_invalid  — Supabase rejected THIS token with a non-transient 4xx: refresh_token_not_found,
//                          refresh_token_already_used, session_not_found, session_expired, user_not_found,
//                          user_banned, invalid_grant — or any other non-retryable 4xx with an auth error code
//                          (e.g. validation_failed): re-sending the same token can never succeed.
//   503 auth_unavailable — 408 / 409 (concurrent refresh) / 429 / 5xx, a 4xx with no auth error code (gateway)
//                          or an API-key fault (bad_jwt / no_authorization — our config, not the user's token),
//                          an OAuth-style server_error / temporarily_unavailable (sent at 400), a network error,
//                          our 5 s timeout, or a 2xx without tokens. Sent with Retry-After.
// Other paths: isTransientAuthError (an auth-js error from an SDK call), classifyUserCall (a direct call made with the
// user's own access token) and classifyVerifiedCall (the same on an authenticated route, whose token was just
// verified). Logs carry status + Supabase error code only — never a token or a user identifier.
const { AppError } = require("../utils/response");
const {
    AUTH_HTTP_TIMEOUT_MS,
    AUTH_RETRY_AFTER_SECONDS,
    userAuthKey,
    forwardedForHeaders
} = require("../config/supabase");

const TRANSIENT_STATUSES = new Set([408, 409, 429]);
const CONFIG_FAULT_CODES = new Set(["bad_jwt", "no_authorization"]);
// OAuth-style errors ({ error, error_description } at HTTP 400 — GoTrue's OAuth errors, Google's token endpoint) that
// mean the server failed, not the request (RFC 6749 §5.2 / §4.1.2.1).
const OAUTH_UNAVAILABLE_CODES = new Set(["server_error", "temporarily_unavailable"]);
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
// key), an API-key fault code, an OAuth-style server_error / temporarily_unavailable, or any 408 / 429 / 5xx. A wrong
// password (400 invalid_credentials) is NOT transient.
const isTransientAuthError = (error) => {
    if (!error) return false;
    if (error.name === "AuthRetryableFetchError" || error.name === "AuthUnknownError") return true;
    if (!error.code && error.status === 401) return true;
    if (CONFIG_FAULT_CODES.has(error.code)) return true;
    // auth-js keeps no code for an OAuth-style body; without an error_description its message IS the `error` string.
    if (!error.code && OAUTH_UNAVAILABLE_CODES.has(error.message)) return true;
    return isTransientStatus(error.status);
};

// D-C14/D-C15: a direct call made with the USER's access token → "ok" (2xx) · "unavailable" (408/429/5xx, an OAuth-style
// server_error / temporarily_unavailable, or an error body without an auth error code — a gateway / API-key fault) ·
// "session" (401, or the token / its session / its user rejected) · "rejected" (any other 4xx — GoTrue refused the
// request itself).
const classifyUserCall = ({ status, code }) => {
    if (status >= 200 && status < 300) return "ok";
    if (isTransientStatus(status) || !code || OAUTH_UNAVAILABLE_CODES.has(code)) return "unavailable";
    if (status === 401 || SESSION_REJECTION_CODES.has(code)) return "session";
    return "rejected";
};

// D-C15: classifyUserCall on an AUTHENTICATED route, whose access token authenticateToken has just verified. GoTrue
// answering bad_jwt / no_authorization there points at our API key or the gateway (exchangeRefreshToken's config
// faults), not at the session → "unavailable" (503), never a 401 a live client reads as an ended session. logout()
// keeps classifyUserCall: its Bearer is unverified, and a rejected one falls back to the refresh-token exchange.
const classifyVerifiedCall = (res) =>
    (res.status < 200 || res.status >= 300) && CONFIG_FAULT_CODES.has(res.code) ? "unavailable" : classifyUserCall(res);

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

    if (status >= 500 || TRANSIENT_STATUSES.has(status) || !code || CONFIG_FAULT_CODES.has(code) ||
        OAUTH_UNAVAILABLE_CODES.has(code)) {
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
    classifyVerifiedCall,
    readErrorMessage,
    OAUTH_UNAVAILABLE_CODES
};
