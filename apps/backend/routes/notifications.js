// /api/notifications routes — see specs/features/notifications/SPEC.md §3.
// MIGRATION DELTA (D-C2): the SSE GET /stream auth (authenticateStream) now lives in middleware/auth.js and
// verifies a Supabase JWT via JWKS (header OR ?token=), replacing the legacy symmetric jwt.verify(JWT_SECRET).
// 0.4.0 (reliability-overhaul R3): PUT /device → services/deviceService (one row per installation, D-C11); net-new
// POST /device/unregister works WITHOUT a login, rate-limited (D-C12); /stream cleans up on either side's close and is
// ended with a plain close on shutdown (D-C16).
// Phase 4 (the legacy-feed rule, the time-zone rule, the per-device push rule): GET /unacknowledged + plain streams
// carry LEGACY_TYPES only (every live binary turns each item into a blocking pop-up); ?inbox=1 opts a stream into every
// type; PUT /device records the `inbox` capability and the caller's X-Time-Zone. Response shapes unchanged.
const express = require("express");
const { Notification, NotificationRecipient } = require("../models");
const { authenticateToken, authenticateStream } = require("../middleware/auth");
const authService = require("../services/authService");
const deviceService = require("../services/deviceService");
const { rateLimit } = require("../utils/rateLimit");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { registerNotificationStream, removeNotificationStream } = require("../utils/notificationStreams");
const { createNotification, getMemberIdsWithPushTokens } = require("../utils/notifications");
const { LEGACY_TYPES } = require("../utils/notificationCategories");
const { parseTimeZone } = require("../utils/clientInfo");
const { rememberTimeZone } = require("../services/notificationPreferenceService");

const router = express.Router();

// D-C12: the same per-client window as POST /api/client-events (observability D-C4). One call per sign-out is the
// expected rate; a shared NAT still has headroom.
const limitUnregister = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.get("/unacknowledged", authenticateToken, async (req, res) => {
    try {
        const memberId = req.user.id;
        const recipients = await NotificationRecipient.findAll({
            where: { member_id: memberId, acknowledged_at: null },
            include: [{
                model: Notification,
                attributes: ["id", "type", "program_id", "actor_member_id", "title", "body", "created_at"],
                where: { type: Array.from(LEGACY_TYPES) } // the legacy-feed rule — new types reach Phase 4 clients via /inbox only
            }],
            order: [[Notification, "created_at", "ASC"]]
        });

        const result = recipients
            .filter((r) => r.Notification)
            .map((r) => ({
                id: r.Notification.id,
                type: r.Notification.type,
                program_id: r.Notification.program_id,
                actor_member_id: r.Notification.actor_member_id,
                title: r.Notification.title,
                body: r.Notification.body,
                created_at: r.Notification.created_at
            }));

        res.json(result);
    } catch (error) {
        logError("Error fetching notifications:", error);
        res.status(500).json({ error: "Failed to fetch notifications." });
    }
});

router.put("/device", authenticateToken, async (req, res) => {
    try {
        const { push_token: pushToken } = req.body;
        // 0.4.0: > 512 chars (device_token is varchar(512)) is the same 400 — it was a 500 from Postgres 22001.
        if (!pushToken || typeof pushToken !== "string" || !pushToken.trim() || pushToken.trim().length > 512) {
            return res.status(400).json({ error: "push_token is required." });
        }
        // Phase 4: a Phase 4 client sends its zone (the time-zone rule) and `inbox: true` (the per-device push rule);
        // live binaries send neither.
        rememberTimeZone(req.user.id, parseTimeZone(req.get("x-time-zone")));
        await deviceService.registerDevice({
            memberId: req.user.id,
            pushToken: pushToken.trim(),
            deviceId: req.body.device_id,
            platform: req.body.platform,
            supportsInbox: req.body.inbox === true
        });
        res.json({ message: "Device registered for push notifications." });
    } catch (error) {
        logError("[push] device register failed:", error); // never the push token (observability F8)
        res.status(500).json({ error: "Failed to register device." });
    }
});

router.delete("/device", authenticateToken, async (req, res) => {
    try {
        const pushToken = req.body?.push_token != null ? req.body.push_token : null;
        await authService.removePushToken(req.user.id, pushToken);
        res.json({ message: "Device unregistered from push notifications." });
    } catch (error) {
        logError("Error unregistering device:", error);
        res.status(500).json({ error: "Failed to unregister device." });
    }
});

// D-C12: unregister WITHOUT a login — the push token and/or the install id prove the device (sign-out paths run
// exactly when the session is gone). 200 for every valid body, matched or not (no existence oracle).
router.post("/device/unregister", limitUnregister, async (req, res) => {
    try {
        await deviceService.unregisterDevice({
            pushToken: req.body?.push_token,
            deviceId: req.body?.device_id
        });
        res.json({ message: "Device unregistered from push notifications." });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        logError("[push] device unregister failed:", error);
        res.status(500).json({ error: "Failed to unregister device." });
    }
});

router.post("/broadcast", authenticateToken, async (req, res) => {
    try {
        if (req.user.global_role !== "global_admin") {
            return res.status(403).json({ error: "Access denied. Global admin only." });
        }
        const { title, body, recipient_ids: recipientIds } = req.body;
        if (!title || typeof title !== "string" || !title.trim()) {
            return res.status(400).json({ error: "title is required." });
        }
        if (!body || typeof body !== "string" || !body.trim()) {
            return res.status(400).json({ error: "body is required." });
        }
        let memberIds = Array.isArray(recipientIds) ? recipientIds.filter(Boolean) : null;
        if (!memberIds || memberIds.length === 0) {
            memberIds = await getMemberIdsWithPushTokens();
        }
        if (memberIds.length === 0) {
            return res.status(200).json({ message: "No recipients with push tokens; nothing sent." });
        }
        const notification = await createNotification({
            type: "app.broadcast",
            title: title.trim(),
            body: body.trim(),
            recipientIds: memberIds
        });
        res.status(201).json({
            message: "Broadcast sent.",
            notification_id: notification?.id,
            recipient_count: memberIds.length
        });
    } catch (error) {
        logError("Error sending broadcast:", error);
        res.status(500).json({ error: "Failed to send broadcast." });
    }
});

router.post("/:id/acknowledge", authenticateToken, async (req, res) => {
    try {
        const recipient = await NotificationRecipient.findOne({
            where: {
                notification_id: req.params.id,
                member_id: req.user.id,
                acknowledged_at: null
            }
        });

        if (!recipient) {
            return res.status(404).json({ error: "Notification not found." });
        }

        await recipient.update({ acknowledged_at: new Date() });
        res.json({ message: "Notification acknowledged." });
    } catch (error) {
        logError("Error acknowledging notification:", error);
        res.status(500).json({ error: "Failed to acknowledge notification." });
    }
});

router.get("/stream", authenticateStream, (req, res) => {
    const memberId = req.user.id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`event: ready\ndata: {}\n\n`);
    // The legacy-feed rule: ?inbox=1 (a Phase 4 client) gets every type as an inbox item; every other stream only the
    // legacy types.
    registerNotificationStream(memberId, res, { inbox: req.query.inbox === "1" });

    // Keepalive every 25 s; skipped once the response has ended (the shutdown close, D-C16).
    const pingInterval = setInterval(() => {
        if (!res.writableEnded) res.write(`event: ping\ndata: {}\n\n`);
    }, 25000);

    // Cleanup runs once, on whichever closes first: the client (req) or the server's shutdown close (res).
    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(pingInterval);
        removeNotificationStream(memberId, res);
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
});

module.exports = router;
