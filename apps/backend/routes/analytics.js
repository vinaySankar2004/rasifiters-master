const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const analyticsService = require("../services/analyticsService");
const { AppError } = require("../utils/response");
const { loadViewer, hasProgramAccess, requireMemberView } = require("../utils/memberVisibility");

const v1Router = express.Router();
const v2Router = express.Router();

const PROGRAM_ACCESS_DENIED = "Access denied. Program membership required.";

// D-C8 (analytics 0.4.0) + D-C3 (analytics-v2 0.2.0) — program-scoped read authorization (reliability-overhaul
// D-3): a global_admin reads any program; anyone else needs an ACTIVE program_memberships row (any role) for
// ?programId. D-C9 (0.5.0): the rule + the single indexed lookup come from utils/memberVisibility (none for a global
// admin), and the viewer is kept on req.viewer for the per-member guards below. Pass-through when programId is
// absent so the service still answers its native 400 "programId is required". A non-string programId
// (?programId=a&programId=b → array) is refused: the services would aggregate every listed program.
// try/catch → next(err): Express 4 doesn't catch a rejected async middleware (a non-UUID programId makes the
// UUID lookup throw) — the shared errorHandler answers 500 and the process stays up.
const requireProgramAccess = async (req, res, next) => {
    try {
        req.viewer = await loadViewer(req.user, req.query.programId);
        if (!req.query.programId || hasProgramAccess(req.viewer)) return next();
        return res.status(403).json({ error: PROGRAM_ACCESS_DENIED });
    } catch (err) {
        next(err);
    }
};

// D-C9 (0.5.0, Phase 4 S0 / People D-P8 a): another member's health (?memberId ≠ the viewer) only for staff (an
// ACTIVE program admin/logger) or a global admin. The "workouts" guard passes every program member in S0 — it is the
// People S1 "Hide my activity" hook (analytics-v2 D-C4). Both pass through when memberId is absent (program aggregate).
const requireHealthView = requireMemberView("health", "You can only view your own health data.");
const requireWorkoutsView = requireMemberView("workouts", PROGRAM_ACCESS_DENIED);

// ── V1 Analytics (/api/analytics/*) ──
// NOTE: legacy's GET /participation/mtd (v1) is dropped — both clients call the v2 variant
// (/api/analytics-v2/participation/mtd). See analytics SPEC D-C2.

v1Router.get("/summary", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getSummary(
            (req.query.period || "day").toLowerCase(),
            req.query.programId
        );
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error generating analytics summary:", err);
        res.status(500).json({ error: "Failed to generate analytics summary." });
    }
});

v1Router.get("/workouts/total", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getTotalWorkoutsMTD(req.query.programId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing total workouts:", err);
        res.status(500).json({ error: "Failed to compute total workouts." });
    }
});

v1Router.get("/duration/total", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getTotalDurationMTD(req.query.programId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing total duration:", err);
        res.status(500).json({ error: "Failed to compute total duration." });
    }
});

v1Router.get("/duration/average", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getAvgDurationMTD(req.query.programId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing average duration:", err);
        res.status(500).json({ error: "Failed to compute average duration." });
    }
});

v1Router.get("/timeline", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getActivityTimeline(
            (req.query.period || "week").toLowerCase(),
            req.query.programId
        );
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing activity timeline:", err);
        res.status(500).json({ error: "Failed to compute activity timeline." });
    }
});

v1Router.get("/health/timeline", authenticateToken, requireProgramAccess, requireHealthView, async (req, res) => {
    try {
        const result = await analyticsService.getHealthTimeline(
            (req.query.period || "week").toLowerCase(),
            req.query.programId,
            req.query.memberId
        );
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing health timeline:", err);
        res.status(500).json({ error: "Failed to compute health timeline." });
    }
});

v1Router.get("/health/steps", authenticateToken, requireProgramAccess, requireHealthView, async (req, res) => {
    try {
        const result = await analyticsService.getHealthSteps(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing steps analytics:", err);
        res.status(500).json({ error: "Failed to compute steps analytics." });
    }
});

v1Router.get("/distribution/day", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getDistributionByDay(req.query.programId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing distribution by day:", err);
        res.status(500).json({ error: "Failed to compute distribution by day." });
    }
});

v1Router.get("/workouts/types", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {
    try {
        const result = await analyticsService.getWorkoutTypes(
            req.query.programId,
            req.query.memberId,
            req.query.limit
        );
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing top workout types:", err);
        res.status(500).json({ error: "Failed to compute top workout types." });
    }
});

// ── V2 Analytics (/api/analytics-v2/*) ──
// NOTE (D-C2): legacy's GET /summary (v2) is dropped — both clients call the v1 summary
// (/api/analytics/summary). See analytics-v2 SPEC D-C2.

v2Router.get("/participation/mtd", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getParticipationMTDV2(req.query.programId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing MTD participation (v2):", err);
        res.status(500).json({ error: "Failed to compute MTD participation." });
    }
});

v2Router.get("/workouts/types/total", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {
    try {
        const result = await analyticsService.getWorkoutTypesTotal(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing total workout types:", err);
        res.status(500).json({ error: "Failed to compute total workout types." });
    }
});

v2Router.get("/workouts/types/most-popular", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {
    try {
        const result = await analyticsService.getMostPopularWorkoutType(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing most popular workout type:", err);
        res.status(500).json({ error: "Failed to compute most popular workout type." });
    }
});

v2Router.get("/workouts/types/longest-duration", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {
    try {
        const result = await analyticsService.getLongestDurationWorkoutType(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing longest duration workout type:", err);
        res.status(500).json({ error: "Failed to compute longest duration workout type." });
    }
});

v2Router.get("/workouts/types/highest-participation", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {
    try {
        const result = await analyticsService.getHighestParticipationWorkoutType(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing highest participation workout type:", err);
        res.status(500).json({ error: "Failed to compute highest participation workout type." });
    }
});

module.exports = { v1Router, v2Router };
