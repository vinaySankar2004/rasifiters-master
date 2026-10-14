// /api/notifications/inbox — the notification inbox (D-N3 / D-N4 / D-N5) — notifications SPEC §3.5 (the inbox rule).
// Self-only: every route acts on the token's member. Read = the existing acknowledged flag (D-N5): an item read here
// leaves every live binary's /unacknowledged queue, and a live binary's acknowledge marks it read here. Each request also
// captures the caller's X-Time-Zone (the time-zone rule, fire-and-forget). Errors are { error, code } (frontend-kit §4).
// 0.7.0 (D-C32): DELETE /all (Clear all) and DELETE /:id (remove one) hard-delete the member's OWN recipient rows. Clear
// all is the literal /all — never DELETE / — so a remove-one call with an empty id (/inbox/) can never match it.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { rateLimit } = require("../utils/rateLimit");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
const inboxService = require("../services/notificationInboxService");

const router = express.Router();

router.use(authenticateToken, (req, _res, next) => {
    rememberTimeZone(req.user.id, parseTimeZone(req.get("x-time-zone")));
    next();
});

// D-C32: ONE per-member bucket for both deletes — 120 / 10 min (utils/rateLimit: process memory, a deploy resets it).
const limitInboxDeletes = rateLimit({ windowMs: 10 * 60 * 1000, max: 120, keyFn: (req) => req.user.id });

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
// "/all" BEFORE "/:id" (a literal segment; notification ids are uuids, so they never collide).
router.delete("/all", limitInboxDeletes, handle("clear inbox", "Failed to update notifications.",
    (req) => inboxService.clearAll(req.user.id)));
router.delete("/:id", limitInboxDeletes, handle("remove notification", "Failed to update notifications.",
    (req) => inboxService.removeItem(req.user.id, req.params.id)));

module.exports = router;
