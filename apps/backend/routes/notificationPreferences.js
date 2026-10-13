// /api/notifications/preferences — per-member notification switches + reminder time (D-N10) — notifications SPEC §3.5
// (the preference rule). Self-only. GET and PUT both store the caller's X-Time-Zone first (the time-zone rule), so the
// response's time_zone is current. PUT is partial: only the fields sent change. Errors are { error, code }
// (frontend-kit §4).
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const preferenceService = require("../services/notificationPreferenceService");

const router = express.Router();

router.use(authenticateToken);

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[notifications] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("preferences read", "Failed to load notification settings.",
    (req) => preferenceService.getPreferences(req.user.id, parseTimeZone(req.get("x-time-zone")))));
router.put("/", handle("preferences save", "Failed to save notification settings.",
    (req) => preferenceService.updatePreferences(req.user.id, req.body, parseTimeZone(req.get("x-time-zone")))));

module.exports = router;
