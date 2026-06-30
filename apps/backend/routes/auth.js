const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const authService = require("../services/authService");
const { AppError } = require("../utils/response");

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
        const { identifier, username, password, push_token, device_id } = req.body;
        const result = await authService.loginGlobal(identifier || username, password, {
            push_token,
            device_id
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
