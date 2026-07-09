// /api/notifications routes — see specs/features/notifications/SPEC.md §3.
// MIGRATION DELTA (D-C2): the SSE GET /stream auth (authenticateStream) now lives in middleware/auth.js and
// verifies a Supabase JWT via JWKS (header OR ?token=), replacing the legacy symmetric jwt.verify(JWT_SECRET).
const express = require("express");
const { Notification, NotificationRecipient } = require("../models");
const { authenticateToken, authenticateStream } = require("../middleware/auth");
const authService = require("../services/authService");
const { registerNotificationStream, removeNotificationStream } = require("../utils/notificationStreams");
const { createNotification, getMemberIdsWithPushTokens } = require("../utils/notifications");

const router = express.Router();

router.get("/unacknowledged", authenticateToken, async (req, res) => {
    try {
        const memberId = req.user.id;
        const recipients = await NotificationRecipient.findAll({
            where: { member_id: memberId, acknowledged_at: null },
            include: [{
                model: Notification,
                attributes: ["id", "type", "program_id", "actor_member_id", "title", "body", "created_at"]
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
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Failed to fetch notifications." });
    }
});

router.put("/device", authenticateToken, async (req, res) => {
    try {
        const { push_token: pushToken } = req.body;
        if (!pushToken || typeof pushToken !== "string" || !pushToken.trim()) {
            return res.status(400).json({ error: "push_token is required." });
        }
        await authService.upsertPushToken(req.user.id, pushToken.trim(), req.body.device_id, req.body.platform);
        res.json({ message: "Device registered for push notifications." });
    } catch (error) {
        console.error("Error registering device:", error);
        res.status(500).json({ error: "Failed to register device." });
    }
});

router.delete("/device", authenticateToken, async (req, res) => {
    try {
        const pushToken = req.body?.push_token != null ? req.body.push_token : null;
        await authService.removePushToken(req.user.id, pushToken);
        res.json({ message: "Device unregistered from push notifications." });
    } catch (error) {
        console.error("Error unregistering device:", error);
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
        console.error("Error sending broadcast:", error);
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
        console.error("Error acknowledging notification:", error);
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
    registerNotificationStream(memberId, res);

    const pingInterval = setInterval(() => {
        res.write(`event: ping\ndata: {}\n\n`);
    }, 25000);

    req.on("close", () => {
        clearInterval(pingInterval);
        removeNotificationStream(memberId, res);
    });
});

module.exports = router;
