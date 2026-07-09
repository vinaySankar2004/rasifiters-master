const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const logService = require("../services/logService");
const { Program } = require("../models");
const { AppError } = require("../utils/response");

const workoutLogRouter = express.Router();
const dailyHealthLogRouter = express.Router();

// ── admin_only_data_entry lock (D-C5 — hoisted from the service into a route middleware) ──
//
// Resolve-or-pass-through: read body.program_ids (multi-program batch, capped at 20 → 400) falling back
// to body.program_id; if neither is usable → next() (the service emits its own 400); for EACH id: load
// the Program; if missing or not locked → continue (matches legacy assertDataEntryAllowed's no-throw);
// if locked and the requester is not a program admin → 403 with the legacy message. This preserves the
// 403 code + message. One ordering nuance: the lock now fires before the handler's other validations,
// so a locked-program + non-admin + otherwise-invalid body gets 403 where legacy gave 400.
async function requireDataEntryAllowed(req, res, next) {
    try {
        const program_id = req.body?.program_id;
        let ids;
        if (Array.isArray(req.body?.program_ids) && req.body.program_ids.length) {
            const filtered = [...new Set(req.body.program_ids.filter((v) => typeof v === "string" && v))];
            ids = filtered.length ? filtered : (program_id ? [program_id] : []);
        } else {
            ids = program_id ? [program_id] : [];
        }
        if (!ids.length) return next();
        if (ids.length > 20) {
            return res.status(400).json({ error: "Too many programs (max 20)." });
        }
        for (const pid of ids) {
            const program = await Program.findByPk(pid);
            if (!program || !program.admin_only_data_entry) continue;
            if (await logService.isProgramAdmin(pid, req.user)) continue;
            return res.status(403).json({
                error: "This program is locked: only program admins can add, edit, or delete data."
            });
        }
        return next();
    } catch (err) {
        console.error("Error verifying data-entry permission:", err);
        return res.status(500).json({ error: "Failed to verify data-entry permission." });
    }
}

// ── Workout Logs ──

workoutLogRouter.post("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.addWorkoutLog(req.body, req.user);
        // 201 on create; 200 when `on_duplicate:"sum"` added minutes onto an existing row (D-C9).
        res.status(result.summed ? 200 : 201).json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error adding workout log:", err);
        res.status(500).json({ error: "Failed to add workout log.", details: err.message });
    }
});

workoutLogRouter.post("/batch", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.addWorkoutLogsBatch(req.body, req.user);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            const payload = { error: err.message };
            if (err.rowErrors) payload.rowErrors = err.rowErrors;
            return res.status(err.statusCode).json(payload);
        }
        console.error("Error adding workout logs batch:", err);
        res.status(500).json({ error: "Failed to add workout logs.", details: err.message });
    }
});

workoutLogRouter.put("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.updateWorkoutLog(req.body, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error updating workout log:", err);
        res.status(500).json({ error: "Failed to update workout log." });
    }
});

workoutLogRouter.delete("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.deleteWorkoutLog(req.body, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error deleting workout log:", err);
        res.status(500).json({ error: "Failed to delete workout log." });
    }
});

// ── Daily Health Logs ──
//
// The 3 write routes reuse the same `requireDataEntryAllowed` lock (D-C2 — both halves of this file enforce
// the admin_only_data_entry lock identically); GET is `authenticateToken`-only (a read).

dailyHealthLogRouter.post("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.addDailyHealthLog(req.body, req.user);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error adding daily health log:", err);
        res.status(500).json({ error: "Failed to add daily health log." });
    }
});

dailyHealthLogRouter.post("/batch", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.addDailyHealthLogsBatch(req.body, req.user);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            const payload = { error: err.message };
            if (err.rowErrors) payload.rowErrors = err.rowErrors;
            return res.status(err.statusCode).json(payload);
        }
        console.error("Error adding daily health logs batch:", err);
        res.status(500).json({ error: "Failed to add daily health logs.", details: err.message });
    }
});

dailyHealthLogRouter.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await logService.getDailyHealthLogs(req.query, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching daily health logs:", err);
        res.status(500).json({ error: "Failed to fetch daily health logs." });
    }
});

dailyHealthLogRouter.put("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.updateDailyHealthLog(req.body, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error updating daily health log:", err);
        res.status(500).json({ error: "Failed to update daily health log." });
    }
});

dailyHealthLogRouter.delete("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.deleteDailyHealthLog(req.body, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error deleting daily health log:", err);
        res.status(500).json({ error: "Failed to delete daily health log." });
    }
});

module.exports = { workoutLogRouter, dailyHealthLogRouter };
