// /api/client-events — client telemetry ingest. See specs/features/observability/SPEC.md §3.2 (D-C4).
// Works SIGNED-OUT: optionalAuthenticate attaches req.user when a valid bearer is present and never rejects
// (sign-in failures and forced sign-outs are reported exactly when the session is gone). Mounted in server.js
// BEFORE the global express.json(), so this router's own 64 kb parser is the only one that runs.
// Per request: per-client limiter (cheapest, before any parsing) → JSON body ≤ 64 kb → optional auth → insert.
const express = require("express");
const { optionalAuthenticate } = require("../middleware/auth");
const { rateLimit, clientKey } = require("../utils/rateLimit");
const { getClientInfo } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const clientEventService = require("../services/clientEventService");

const router = express.Router();

const limitPerClient = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.post("/", limitPerClient, express.json({ limit: "64kb" }), optionalAuthenticate, async (req, res) => {
    try {
        const result = await clientEventService.recordClientEvents({
            body: req.body,
            memberId: req.user?.id ?? null,
            clientInfo: getClientInfo(req),
            clientKey: clientKey(req.ip)
        });
        res.status(202).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
            return res.status(err.statusCode).json({ error: err.message, code: err.code });
        }
        // Name + Postgres error code only — a Sequelize error message can echo inserted values.
        console.error("[client-events] insert failed: %s %s", err.name, err.parent?.code || "");
        res.status(500).json({ error: "Failed to record events." });
    }
});

// Body-parser failures keep their real 4xx (413 too large · 400 malformed JSON or a bad gzip/deflate body · 415
// unsupported charset/encoding) instead of reaching the global errorHandler, which answers every non-AppError with
// 500. Only the parser can hand a 4xx error to next() in this router (a decompression error carries no err.type).
// Four params = an Express error handler; keep `next`.
router.use((err, req, res, next) => {
    if (!err || !(err.status >= 400 && err.status < 500)) return next(err);
    if (err.status === 413) {
        return res.status(413).json({ error: "Payload too large.", code: "payload_too_large" });
    }
    return res.status(err.status).json({ error: "Invalid request body.", code: "invalid_body" });
});

module.exports = router;
