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
//   • On staging (APP_ENV=staging) supabaseAdmin's createUser / updateUserById / deleteUser are wrapped once by
//     utils/stagingGuard.guardAdminAuth (SPEC D-C13) — only +stg accounts may be touched. A no-op in prod.
// Plus verifySupabaseJwt(): verify a Supabase-issued access token via the project's JWKS (D-C2 —
// asymmetric ES256 keys), returning the decoded payload (its `sub` = auth.users.id).
const { createClient } = require("@supabase/supabase-js");
const { guardAdminAuth } = require("../utils/stagingGuard");

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
guardAdminAuth(supabaseAdmin.auth.admin); // staging only (D-C13); returns immediately in prod

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
