// /api/program-memberships invite routes — faithful to legacy routes/invites.js
// (specs/features/invites/SPEC.md §3). Co-mounted with memberships under /api/program-memberships
// (server.js — inviteRoutes alongside membershipRoutes, mirroring legacy server.js:50). All routes are
// authenticateToken-only at the router; the program-admin / global-admin / self authz lives in the services.
// POST /invite (0.2.0): privacy-safe for every no-op — the client always gets 200 { message: "Invitation sent" }, sent
// or not (F1); the no-op reason is logged server-side, never the username (D-C5). An unexpected failure is a real
// 500 { error } (D-C6 — it used to be a false 200).
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const inviteService = require("../services/inviteService");
const { sendInvite } = require("../services/inviteSendService");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");

const router = express.Router();

router.post("/invite", authenticateToken, async (req, res) => {
    try {
        const { reason } = await sendInvite(req.body, req.user);
        if (reason) {
            console.log(JSON.stringify({
                type: "invite_noop",
                request_id: req.id,
                program_id: req.body.program_id,
                reason
            }));
        }
        res.json({ message: "Invitation sent" });
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        logError("[invites] send failed:", err); // never the username (observability F8)
        res.status(500).json({ error: "Failed to send invitation." });
    }
});

router.get("/my-invites", authenticateToken, async (req, res) => {
    try {
        const result = await inviteService.getMyInvites(req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        logError("Error fetching user invites:", err);
        res.status(500).json({ error: "Failed to fetch invites." });
    }
});

router.get("/all-invites", authenticateToken, async (req, res) => {
    try {
        const result = await inviteService.getAllInvites(req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        logError("Error fetching all invites:", err);
        res.status(500).json({ error: "Failed to fetch invites." });
    }
});

router.put("/invite-response", authenticateToken, async (req, res) => {
    try {
        const result = await inviteService.respondToInvite(req.body, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        logError("Error responding to invite:", err);
        res.status(500).json({ error: "Failed to process invite response." });
    }
});

module.exports = router;
