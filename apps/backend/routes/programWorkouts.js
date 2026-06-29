// Routes for /api/program-workouts — a program's workout list (global+custom visibility toggles + custom
// CRUD). See specs/features/program-workouts/SPEC.md. FAITHFUL 1:1 to legacy routes/programWorkouts.js
// EXCEPT the one deliberate change (SPEC §7 / D-C2): the per-action program-admin authorization that
// legacy did INLINE in each service function is HOISTED here into a route guard. GET stays ungated
// (any authenticated member — log forms, the program dashboard, member filters, and the iOS quick-add
// widget read it). The five curation routes add the program-admin guard.
//
// The guard is RESOLVE-OR-PASS-THROUGH so observable status codes stay 1:1 with legacy (CLAUDE.md
// non-breaking): global_admin always passes; otherwise it resolves the target program_id and requires an
// active admin ProgramMembership. Crucially, it only fires the 403 exactly where legacy reached its inline
// admin check — for any request the legacy service would have rejected FIRST (missing required fields,
// workout not found, or wrong-type custom/global mismatch), the resolver returns null and the guard passes
// through so the service emits its native 400/404 before mutating.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { ProgramMembership, ProgramWorkout } = require("../models");
const workoutService = require("../services/workoutService");
const { AppError } = require("../utils/response");

const router = express.Router();

// Build a program-admin guard from a per-route resolver that returns the target program_id (gate the
// admin check) or null (pass through to let the service emit its native 400/404). See D-C2.
const requireProgramAdmin = (resolveProgramId) => async (req, res, next) => {
    try {
        if (req.user?.global_role === "global_admin") return next();

        const programId = await resolveProgramId(req);
        if (!programId) return next(); // legacy would reject before its admin check — let the service do it

        const pm = await ProgramMembership.findOne({
            where: { program_id: programId, member_id: req.user?.id, role: "admin", status: "active" }
        });
        if (!pm) return res.status(403).json({ error: "Admin privileges required." });

        next();
    } catch (err) {
        next(err);
    }
};

// Resolvers mirror each legacy function's pre-admin-check guards (so the guard passes through wherever the
// service would 400/404 first). For the /:id routes the program_id lives on the ProgramWorkout row, so we
// load it (a by-PK read; the service loads it again — decoupled per SPEC §7).
const fromBodyGlobalToggle = (req) =>
    (!req.body?.program_id || !req.body?.library_workout_id) ? null : req.body.program_id;

const fromBodyAddCustom = (req) =>
    (!req.body?.program_id || !req.body?.workout_name) ? null : req.body.program_id;

const fromCustomWorkout = async (req) => {
    const pw = await ProgramWorkout.findByPk(req.params.id);
    // null when missing (service 404s) or a global row (service 400s) — both before the legacy admin check.
    if (!pw || pw.library_workout_id) return null;
    return pw.program_id;
};

const fromEditCustomWorkout = async (req) => {
    if (!req.body?.workout_name) return null; // legacy edit 400s on missing name before the admin check
    return fromCustomWorkout(req);
};

router.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await workoutService.getProgramWorkouts(req.query.programId);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching program workouts:", err);
        res.status(500).json({ error: "Failed to fetch program workouts." });
    }
});

router.put("/toggle-visibility", authenticateToken, requireProgramAdmin(fromBodyGlobalToggle), async (req, res) => {
    try {
        const result = await workoutService.toggleGlobalWorkoutVisibility(req.body);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error toggling workout visibility:", err);
        res.status(500).json({ error: "Failed to toggle workout visibility." });
    }
});

router.put("/:id/toggle-visibility", authenticateToken, requireProgramAdmin(fromCustomWorkout), async (req, res) => {
    try {
        const result = await workoutService.toggleCustomWorkoutVisibility(req.params.id);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error toggling custom workout visibility:", err);
        res.status(500).json({ error: "Failed to toggle custom workout visibility." });
    }
});

router.post("/custom", authenticateToken, requireProgramAdmin(fromBodyAddCustom), async (req, res) => {
    try {
        const result = await workoutService.addCustomWorkout(req.body);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error creating custom workout:", err);
        res.status(500).json({ error: "Failed to create custom workout." });
    }
});

router.put("/:id", authenticateToken, requireProgramAdmin(fromEditCustomWorkout), async (req, res) => {
    try {
        const result = await workoutService.editCustomWorkout(req.params.id, req.body.workout_name);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error updating custom workout:", err);
        res.status(500).json({ error: "Failed to update custom workout." });
    }
});

router.delete("/:id", authenticateToken, requireProgramAdmin(fromCustomWorkout), async (req, res) => {
    try {
        const result = await workoutService.deleteCustomWorkout(req.params.id);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error deleting custom workout:", err);
        res.status(500).json({ error: "Failed to delete custom workout." });
    }
});

module.exports = router;
