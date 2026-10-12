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
