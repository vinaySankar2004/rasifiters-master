// Supabase clients + JWT verification — the R1 auth migration plumbing.
// See specs/features/auth/SPEC.md §6/§7 + METHODOLOGY R1.
//
// Two clients:
//   • supabaseAuth  — anon key; the public auth flows the backend PROXIES (signInWithPassword, refresh).
//   • supabaseAdmin — service-role key; admin ops (createUser / updateUserById / deleteUser).
// Plus verifySupabaseJwt(): verify a Supabase-issued access token via the project's JWKS (D-C2 —
// asymmetric ES256 keys), returning the decoded payload (its `sub` = auth.users.id).
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const serverClientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, serverClientOptions);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serverClientOptions);

// A throwaway anon client bound to a single user session — used by logout to revoke one session
// (set the session from the supplied refresh token, then sign out).
const makeEphemeralAuthClient = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, serverClientOptions);

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
    supabaseAuth,
    supabaseAdmin,
    makeEphemeralAuthClient,
    verifySupabaseJwt
};
