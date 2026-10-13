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
// (::ffff:a.b.c.d) is sent as plain IPv4; any other address is sent whole (not utils/rateLimit.js's IPv6 /64 — the
// header is defined as the client IP). Anything else → {} (header omitted).
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
