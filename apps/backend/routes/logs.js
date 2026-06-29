const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const logService = require("../services/logService");
const { Program } = require("../models");
const { AppError } = require("../utils/response");

const workoutLogRouter = express.Router();
const dailyHealthLogRouter = express.Router();

// ── admin_only_data_entry lock (D-C5 — hoisted from the service into a route middleware) ──
//
// Resolve-or-pass-through: read body.program_id; if absent → next() (the service emits its own 400);
// load the Program; if missing or not locked → next() (matches legacy assertDataEntryAllowed's no-throw);
// if locked and the requester is a program admin → next(); otherwise 403 with the legacy message. This
// preserves the 403 code + message. One ordering nuance: the lock now fires before the handler's other
// validations, so a locked-program + non-admin + otherwise-invalid body gets 403 where legacy gave 400.
async function requireDataEntryAllowed(req, res, next) {
    try {
        const program_id = req.body?.program_id;
        if (!program_id) return next();

        const program = await Program.findByPk(program_id);
        if (!program || !program.admin_only_data_entry) return next();

        if (await logService.isProgramAdmin(program_id, req.user)) return next();

        return res.status(403).json({
            error: "This program is locked: only program admins can add, edit, or delete data."
        });
    } catch (err) {
        console.error("Error verifying data-entry permission:", err);
        return res.status(500).json({ error: "Failed to verify data-entry permission." });
    }
}

// ── Workout Logs ──

workoutLogRouter.post("/", authenticateToken, requireDataEntryAllowed, async (req, res) => {
    try {
        const result = await logService.addWorkoutLog(req.body, req.user);
        res.status(201).json(result);
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
