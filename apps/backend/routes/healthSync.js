// /api/health-sync — health sync v2 (specs/features/health-sync/SPEC.md §3). Self-only (D-C11): every route is
// authenticateToken and acts on the token's member. Mounted in server.js BEFORE the global express.json() (like
// /api/client-events, D-C10): the batch carries its own 256 kb parser — a 30-day catch-up can exceed the global 100 kb
// default, whose 413 the global errorHandler answers as a 500 (observability F2) that clients would retry forever.
// Because that mount sits above server.js's `app.use("/api", blockUnversionedAndroid)`, this router applies app-config's
// version gate itself. Errors are `{ error, code }` (frontend-kit §4: the status decides the kind). Never 403/404/409.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { blockUnversionedAndroid } = require("../middleware/versionGate");
const { rateLimit } = require("../utils/rateLimit");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const healthSyncService = require("../services/healthSyncService");

const router = express.Router();

// D-C12: per member (after auth), 60 requests / 10 min across the three routes — abuse protection only (a sync run is
// 1-3 calls). Process memory; a deploy resets it (observability F3).
const limitPerMember = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyFn: (req) => req.user.id });

router.use(blockUnversionedAndroid);

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) {
            if (err.retryAfter) res.set("Retry-After", String(err.retryAfter)); // 503 "busy" (lock wait > 2 s)
            return res.status(err.statusCode).json({ error: err.message, code: err.code });
        }
        logError(`[health-sync] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.post("/batch", authenticateToken, limitPerMember, express.json({ limit: "256kb" }),
    handle("batch", "Failed to sync health data.",
        (req) => healthSyncService.syncBatch({ body: req.body, requester: req.user })));

router.get("/state", authenticateToken, limitPerMember,
    handle("state read", "Failed to load sync state.", (req) => healthSyncService.getState(req.user.id)));

router.put("/state", authenticateToken, limitPerMember, express.json({ limit: "16kb" }),
    handle("state write", "Failed to save sync state.",
        (req) => healthSyncService.putState({ body: req.body, requester: req.user })));

// Body-parser 4xx keep their real status (same as routes/clientEvents.js) — the global errorHandler would answer 500.
// Four params = an Express error handler; keep `next`.
router.use((err, req, res, next) => {
    if (!err || !(err.status >= 400 && err.status < 500)) return next(err);
    if (err.status === 413) return res.status(413).json({ error: "Payload too large.", code: "payload_too_large" });
    return res.status(err.status).json({ error: "Invalid request body.", code: "invalid_body" });
});

module.exports = router;
