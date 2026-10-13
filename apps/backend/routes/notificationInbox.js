// /api/notifications/inbox — the notification inbox (D-N3 / D-N4 / D-N5) — notifications SPEC §3.5 (the inbox rule).
// Self-only: every route acts on the token's member. Read = the existing acknowledged flag (D-N5): an item read here
// leaves every live binary's /unacknowledged queue, and a live binary's acknowledge marks it read here. Each request also
// captures the caller's X-Time-Zone (the time-zone rule, fire-and-forget). Errors are { error, code } (frontend-kit §4).
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
const inboxService = require("../services/notificationInboxService");

const router = express.Router();

router.use(authenticateToken, (req, _res, next) => {
    rememberTimeZone(req.user.id, parseTimeZone(req.get("x-time-zone")));
    next();
});

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[notifications] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("inbox list", "Failed to load notifications.",
    (req) => inboxService.listInbox(req.user.id, req.query)));
router.get("/unread-count", handle("unread count", "Failed to load notifications.",
    (req) => inboxService.getUnreadCounts(req.user.id)));
router.post("/read", handle("mark read", "Failed to update notifications.",
    (req) => inboxService.markRead(req.user.id, req.body)));

module.exports = router;
