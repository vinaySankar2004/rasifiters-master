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
        const result = await authSessionService.resetPassword(req.user.id, req.body.new_password);
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
