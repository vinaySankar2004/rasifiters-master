const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const authService = require("../services/authService");
const { AppError } = require("../utils/response");
const { verifySupabaseJwt } = require("../config/supabase");

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const { identifier, username, password } = req.body;
        const result = await authService.loginLegacy(identifier || username, password);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Login error:", err);
        res.status(500).json({ error: "Server error during login" });
    }
});

const handleAppLogin = async (req, res) => {
    try {
        const { identifier, username, password, push_token, device_id, platform } = req.body;
        const result = await authService.loginGlobal(identifier || username, password, {
            push_token,
            device_id,
            platform
        });
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[global login] error:", err);
        res.status(500).json({ error: "Server error during login" });
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

router.post("/refresh", async (req, res) => {
    try {
        const result = await authService.refreshAccessToken(req.body.refresh_token);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[refresh] error:", err);
        res.status(500).json({ error: "Server error during refresh" });
    }
});

router.post("/logout", async (req, res) => {
    try {
        const result = await authService.logout(req.body.refresh_token);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[logout] error:", err);
        res.status(500).json({ error: "Server error during logout" });
    }
});

router.post("/register", async (req, res) => {
    try {
        const result = await authService.register(req.body);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Registration error:", err);
        res.status(500).json({ error: "Server error during registration" });
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
            { push_token, device_id, platform }
        );
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[oauth] error:", err);
        res.status(500).json({ error: "Server error during federated sign-in" });
    }
});

// NET-NEW (SPEC v0.7.0 / D-C9) — finish a brand-new federated sign-up. The pending Supabase access_token
// from POST /oauth is the Bearer (verified directly via JWKS — no member row exists yet to map through
// authenticateToken). Creates members + member_emails linked to the already-created auth user, then
// returns the login AuthResponse (echoing the same session the client already holds).
router.post("/oauth/complete", async (req, res) => {
    try {
        const authz = req.headers.authorization || "";
        const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
        if (!bearer) return res.status(401).json({ error: "Missing session token." });
        let payload;
        try {
            payload = await verifySupabaseJwt(bearer);
        } catch (_) {
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
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[oauth/complete] error:", err);
        res.status(500).json({ error: "Server error during federated sign-up" });
    }
});

// NET-NEW (SPEC v0.9.0 / D-C10) — auth phase-2: manage the signed-in member's linked sign-in identities.
// All authenticated + additive: the LIVE iOS 1.3.1/46 + live Android never call these → degrade gracefully.
// link/unlink bind the caller's own Supabase session server-side, so the client sends its refresh_token.
router.get("/identities", authenticateToken, async (req, res) => {
    try {
        res.json(await authService.listIdentities(req.user.id));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[identities] error:", err);
        res.status(500).json({ error: "Server error while reading sign-in methods." });
    }
});

router.post("/link", authenticateToken, async (req, res) => {
    try {
        const authz = req.headers.authorization || "";
        const accessToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
        const { provider, id_token, code, nonce, refresh_token } = req.body;
        res.json(await authService.linkProvider(req.user.id, {
            provider, id_token, code, nonce, accessToken, refreshToken: refresh_token
        }));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[link] error:", err);
        res.status(500).json({ error: "Server error while linking account." });
    }
});

router.post("/unlink", authenticateToken, async (req, res) => {
    try {
        const authz = req.headers.authorization || "";
        const accessToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
        const { provider, refresh_token } = req.body;
        res.json(await authService.unlinkProvider(req.user.id, {
            provider, accessToken, refreshToken: refresh_token
        }));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[unlink] error:", err);
        res.status(500).json({ error: "Server error while unlinking account." });
    }
});

router.post("/set-password", authenticateToken, async (req, res) => {
    try {
        res.json(await authService.setPassword(req.user.id, req.body.new_password));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[set-password] error:", err);
        res.status(500).json({ error: "Server error while setting password." });
    }
});

// NET-NEW (SPEC v0.3.0 / D-C4) — self-service password recovery, request step. Public, privacy-safe:
// always 200 with a generic message (no account-enumeration). Pairs with POST /reset-password (next run).
router.post("/forgot-password", async (req, res) => {
    try {
        const result = await authService.requestPasswordReset(req.body.email);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[forgot-password] error:", err);
        res.status(500).json({ error: "Server error during password reset request." });
    }
});

// NET-NEW (SPEC v0.4.0 / D-C5) — self-service password recovery, RESET (consume) step. The web
// /reset-password page extracts the Supabase recovery access_token from the email-link fragment
// (implicit flow) and sends it as the Bearer token here. authenticateToken JWKS-verifies it + maps
// sub -> member, so this reuses the existing changePassword (single-sourced password update + policy).
// An expired/invalid recovery token -> 401 (the page tells the user to request a new link). R1: the
// client never embeds Supabase — the token round-trips through Express.
router.post("/reset-password", authenticateToken, async (req, res) => {
    try {
        const result = await authService.changePassword(req.user.id, req.body.new_password);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[reset-password] error:", err);
        res.status(500).json({ error: "Server error during password reset." });
    }
});

router.put("/change-password", authenticateToken, async (req, res) => {
    try {
        const result = await authService.changePassword(req.user.id, req.body.new_password);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[change-password] error:", err);
        res.status(500).json({ error: "Server error during password change." });
    }
});

// NET-NEW (profile page): self-service email change. Authenticated; password-confirmed direct change
// (no legacy equivalent). authService.changeEmail keeps Supabase auth.users + member_emails in sync.
router.put("/email", authenticateToken, async (req, res) => {
    try {
        const result = await authService.changeEmail(req.user.id, req.body.new_email, req.body.password);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[change-email] error:", err);
        res.status(500).json({ error: "Server error during email change." });
    }
});

router.delete("/account", authenticateToken, async (req, res) => {
    try {
        const result = await authService.deleteAccount(req.user.id);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("[delete-account] error:", err);
        res.status(500).json({ error: "Server error during account deletion." });
    }
});

module.exports = router;
