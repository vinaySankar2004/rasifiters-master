// Routes for /api/workouts — the global workout library. See specs/features/workouts/SPEC.md.
// FAITHFUL 1:1 to legacy routes/workouts.js EXCEPT the dropped POST /mobile route (SPEC §7 / D-C2): it was
// a byte-identical duplicate of POST / (both call createWorkout(req.body.workout_name)), called by neither
// client. GET is authenticateToken-only (iOS reads it for the workout picker); the three write routes add
// the isAdmin global gate. The admin CRUD is called by no client today (D-REF / F1) but kept for parity.
const express = require("express");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const workoutService = require("../services/workoutService");
const { AppError } = require("../utils/response");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
    try {
        const workouts = await workoutService.getAllWorkouts();
        res.json(workouts);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching workouts:", err);
        res.status(500).json({ error: "Failed to fetch workouts." });
    }
});

router.post("/", authenticateToken, isAdmin, async (req, res) => {
    try {
        const workout = await workoutService.createWorkout(req.body.workout_name);
        res.status(201).json(workout);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error adding workout:", err);
        res.status(500).json({ error: "Failed to add workout." });
    }
});

router.put("/:workout_name", authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await workoutService.updateWorkout(req.params.workout_name, req.body.workout_name);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error updating workout:", err);
        res.status(500).json({ error: "Failed to update workout." });
    }
});

router.delete("/:workout_name", authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await workoutService.deleteWorkout(req.params.workout_name);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error deleting workout:", err);
        res.status(500).json({ error: "Failed to delete workout." });
    }
});

module.exports = router;
