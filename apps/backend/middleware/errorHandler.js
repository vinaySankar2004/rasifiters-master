const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");

// An express.json() failure: a 4xx `status` with a string `type` ("entity.parse.failed", "entity.too.large",
// "charset.unsupported", "encoding.unsupported", …) or http-errors' `expose` flag (a corrupt gzip/deflate body carries
// no `type`). Its `err.body` holds the raw request body — never logged (observability D-C10: a malformed-JSON login
// carried its password).
const isBodyParserError = (err) =>
    Boolean(err) &&
    typeof err === "object" &&
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 500 &&
    (typeof err.type === "string" || err.expose === true);

const errorHandler = (err, req, res, _next) => {
    if (err instanceof AppError) {
        // observability D-C11 (b): echo the machine code + Retry-After, like routes/auth.js (additive).
        if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        return res.status(err.statusCode).json(body);
    }

    // observability D-C11 (a) — resolves F2: a body-parser failure keeps its real 4xx in the frontend-kit vocabulary on
    // EVERY route (was 500) — the mapping routes/clientEvents.js has used since 0.1.0.
    if (isBodyParserError(err)) {
        console.warn("Rejected request body: %s %s", err.type || err.name, err.status);
        if (err.status === 413) {
            return res.status(413).json({ error: "Payload too large.", code: "payload_too_large" });
        }
        return res.status(err.status).json({ error: "Invalid request body.", code: "invalid_body" });
    }

    // observability D-C11 (c): name / code / status / message / top frames only — never the error object (a Sequelize
    // error carries its SQL + bound values; any error may carry a request `body`).
    logError("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error." });
};

module.exports = { errorHandler };
