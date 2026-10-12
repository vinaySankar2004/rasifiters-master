const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { ProgramMembership } = require("../models");
const analyticsService = require("../services/analyticsService");
const { AppError } = require("../utils/response");

const v1Router = express.Router();
const v2Router = express.Router();

// D-C8 (analytics 0.4.0) + D-C3 (analytics-v2 0.2.0) — program-scoped read authorization (reliability-overhaul
// D-3). Same rule as member-analytics' ensureProgramAccess: a global_admin reads any program; anyone else needs
// an ACTIVE program_memberships row (any role) for ?programId — one indexed lookup per request. Pass-through
// when programId is absent so the service still answers its native 400 "programId is required". A non-string
// programId (?programId=a&programId=b → array) is refused: the services would aggregate every listed program.
// try/catch → next(err): Express 4 doesn't catch a rejected async middleware (a non-UUID programId makes the
// UUID lookup throw) — the shared errorHandler answers 500 and the process stays up.
const requireProgramAccess = async (req, res, next) => {
    try {
        if (req.user.global_role === "global_admin") return next();

        const programId = req.query.programId;
        if (!programId) return next();
        if (typeof programId !== "string") {
            return res.status(403).json({ error: "Access denied. Program membership required." });
        }

        const membership = await ProgramMembership.findOne({
            where: { program_id: programId, member_id: req.user.id, status: "active" }
        });
        if (!membership) return res.status(403).json({ error: "Access denied. Program membership required." });

        next();
    } catch (err) {
        next(err);
    }
};

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

v1Router.get("/health/timeline", authenticateToken, requireProgramAccess, async (req, res) => {
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

v1Router.get("/health/steps", authenticateToken, requireProgramAccess, async (req, res) => {
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

v1Router.get("/workouts/types", authenticateToken, requireProgramAccess, async (req, res) => {
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

v2Router.get("/workouts/types/total", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getWorkoutTypesTotal(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing total workout types:", err);
        res.status(500).json({ error: "Failed to compute total workout types." });
    }
});

v2Router.get("/workouts/types/most-popular", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getMostPopularWorkoutType(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing most popular workout type:", err);
        res.status(500).json({ error: "Failed to compute most popular workout type." });
    }
});

v2Router.get("/workouts/types/longest-duration", authenticateToken, requireProgramAccess, async (req, res) => {
    try {
        const result = await analyticsService.getLongestDurationWorkoutType(req.query.programId, req.query.memberId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error computing longest duration workout type:", err);
        res.status(500).json({ error: "Failed to compute longest duration workout type." });
    }
});

v2Router.get("/workouts/types/highest-participation", authenticateToken, requireProgramAccess, async (req, res) => {
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
