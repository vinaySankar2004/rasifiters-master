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
