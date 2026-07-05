// /api/programs routes — faithful 1:1 to legacy routes/programs.js (specs/features/programs/SPEC.md §3),
// plus the net-new post-parity PUT /order (per-member card ordering, 2026-07-05).
// All routes are authenticateToken-only at the router; the program-admin gate lives in
// programService.updateProgram / deleteProgram (SPEC §10 F6). The createProgram `description` drop (D-C2)
// and the deferred notification emit (D-C1) are both inside the service.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const programService = require("../services/programService");
const { AppError } = require("../utils/response");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
    try {
        const programs = await programService.getPrograms(req.user);
        res.json(programs);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error fetching programs:", err);
        res.status(500).json({ error: "Failed to fetch programs" });
    }
});

router.post("/", authenticateToken, async (req, res) => {
    try {
        const result = await programService.createProgram(req.body, req.user);
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error creating program:", err);
        res.status(500).json({ error: "Failed to create program." });
    }
});

// MUST stay above /:id — otherwise "order" is captured as a program id.
// Net-new post-parity (2026-07-05): persist the caller's program-card order (SPEC §3/§9).
router.put("/order", authenticateToken, async (req, res) => {
    try {
        const result = await programService.setProgramOrder(req.body?.program_ids, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error saving program order:", err);
        res.status(500).json({ error: "Failed to save program order." });
    }
});

router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const result = await programService.updateProgram(req.params.id, req.body, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error updating program:", err);
        res.status(500).json({ error: "Failed to update program." });
    }
});

router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const result = await programService.deleteProgram(req.params.id, req.user);
        res.json(result);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        console.error("Error deleting program:", err);
        res.status(500).json({ error: "Failed to delete program." });
    }
});

module.exports = router;
