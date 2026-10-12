const { AppError } = require("../utils/response");

// Never print a request body (observability D-C10): body-parser errors (string `type` + numeric `status`, e.g.
// "entity.parse.failed" 400) carry the raw body in err.body — a malformed-JSON login would put its password in the
// Render log. Those, and any other error carrying a `body`, are logged as type/name + status only. Log-only: every
// response is unchanged.
const carriesRequestBody = (err) =>
    Boolean(err) &&
    typeof err === "object" &&
    ((typeof err.type === "string" && typeof err.status === "number") || err.body !== undefined);

const errorHandler = (err, req, res, _next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    if (carriesRequestBody(err)) console.error("Unhandled error: %s %s", err.type || err.name, err.status);
    else console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error." });
};

module.exports = { errorHandler };
