// AppError — an operational error with an HTTP status. `options` is additive (auth SPEC D-C11): `code` is a
// machine-readable reason a route may echo as `{ error, code }`; `retryAfter` (seconds) a route may send as a
// Retry-After header. Read by: every /api/auth route (routes/auth.js sendAuthError — auth D-C15), the health-sync
// route (Phase 3 R2), POST /api/client-events (429 rate_limited) and the global middleware/errorHandler.js for any
// route that passes an AppError on (observability D-C11). Without options nothing changes — every existing
// `{ error: err.message }` catch keeps working.
class AppError extends Error {
    constructor(statusCode, message, options = {}) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        if (options.code) this.code = options.code;
        if (options.retryAfter) this.retryAfter = options.retryAfter;
    }
}

module.exports = { AppError };
