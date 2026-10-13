// /api/notifications/announcements — the send-anytime composer API (D-N16), GLOBAL ADMINS ONLY — notifications SPEC
// §3.8 (the announcement rule). Preview renders for one sample recipient; send = now or at each recipient's local time;
// every send is an audit row. Rate limits per admin (process memory — observability F3): preview 30 / min, send 10 /
// hour. The sender's X-Time-Zone is captured (the time-zone rule) and is the fallback zone of a local-time send.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { rateLimit } = require("../utils/rateLimit");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
const announcementService = require("../services/announcementService");

const router = express.Router();

const limitPreview = rateLimit({ windowMs: 60 * 1000, max: 30, keyFn: (req) => req.user.id });
const limitSend = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyFn: (req) => req.user.id });

const requireGlobalAdmin = (req, res, next) => {
    if (req.user?.global_role === "global_admin") return next();
    return res.status(403).json({ error: "Only global admins can send announcements.", code: "forbidden" });
};

const senderZone = (req) => parseTimeZone(req.get("x-time-zone"));

router.use(authenticateToken, requireGlobalAdmin, (req, _res, next) => {
    rememberTimeZone(req.user.id, senderZone(req));
    next();
});

const handle = (tag, fallback, status, run) => async (req, res) => {
    try {
        res.status(status).json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[announcements] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("list", "Failed to load announcements.", 200,
    () => announcementService.listAnnouncements()));
router.post("/preview", limitPreview, handle("preview", "Failed to preview the announcement.", 200,
    (req) => announcementService.previewAnnouncement(req.body, req.user, senderZone(req))));
router.post("/", limitSend, handle("send", "Failed to send the announcement.", 201,
    (req) => announcementService.createAnnouncement(req.body, req.user, senderZone(req))));
router.post("/:id/cancel", handle("cancel", "Failed to cancel the announcement.", 200,
    (req) => announcementService.cancelAnnouncement(req.params.id)));

module.exports = router;
