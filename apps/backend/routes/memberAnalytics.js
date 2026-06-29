const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const memberAnalyticsService = require("../services/memberAnalyticsService");
const { AppError } = require("../utils/response");

const metricsRouter = express.Router();
const historyRouter = express.Router();
const streaksRouter = express.Router();
const recentRouter = express.Router();

// ── Member Metrics (/api/member-metrics) ──

metricsRouter.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await memberAnalyticsService.getMemberMetrics(req.query, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching member metrics:", err);
        res.status(500).json({ error: "Failed to fetch member metrics." });
    }
});

// ── Member History (/api/member-history) ──

historyRouter.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await memberAnalyticsService.getMemberHistory(req.query, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching member history:", err);
        res.status(500).json({ error: "Failed to fetch member workout history." });
    }
});

// ── Member Streaks (/api/member-streaks) ──

streaksRouter.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await memberAnalyticsService.getMemberStreaks(req.query, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching member streaks:", err);
        res.status(500).json({ error: "Failed to fetch member streaks." });
    }
});

// ── Member Recent (/api/member-recent) ──

recentRouter.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await memberAnalyticsService.getMemberRecentWorkouts(req.query, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching recent workouts:", err);
        res.status(500).json({ error: "Failed to fetch recent workouts." });
    }
});

module.exports = { metricsRouter, historyRouter, streaksRouter, recentRouter };
