// Structured request log — observability SPEC §3.1 (D-C1). ONE JSON line per request on stdout; Render's free
// app log is the sink (7-day retention). Mounted FIRST in server.js (before cors) so CORS preflights are logged
// too. Also owns the request id: a well-formed inbound X-Request-Id is kept, otherwise a UUID is generated; it is
// set as req.id and echoed in the X-Request-Id response header before any handler can flush headers (the SSE
// stream included).
// NEVER logged: the URL or query string (the SSE ?token=), header values other than the parsed client fields
// below, bodies, usernames, emails, IP addresses. Render health checks (GET/HEAD /) are skipped entirely.
const crypto = require("crypto");
const { getClientInfo, parseRequestId } = require("../utils/clientInfo");

const COUNTRY_RE = /^[A-Z0-9]{2}$/;

// Route TEMPLATE ("/api/members/:id"), never the concrete URL; a router's "/" collapses to its mount path.
// "unmatched" when no route ran (404, CORS preflight, a body-parse failure in the global parser). Known gap (SPEC
// §10 F1): a route that hands an error to next(err) is logged without its mount prefix — Express resets
// req.baseUrl as the error leaves the router.
const routeTemplate = (req) => {
    if (!req.route) return "unmatched";
    const path = req.route.path === "/" && req.baseUrl ? "" : req.route.path;
    return `${req.baseUrl}${path}`;
};

// The NUMBER of X-Forwarded-For entries (never the addresses) — verifies the trust-proxy hop count (D-C7).
const countForwardedHops = (raw) => (typeof raw === "string" && raw.trim() !== "" ? raw.split(",").length : 0);

const isHealthCheck = (req) => (req.method === "GET" || req.method === "HEAD") && req.path === "/";

const requestLog = (req, res, next) => {
    if (isHealthCheck(req)) return next();

    const startedAt = process.hrtime.bigint();
    const requestId = parseRequestId(req.get("x-request-id")) || crypto.randomUUID();
    req.id = requestId;
    res.setHeader("X-Request-Id", requestId);

    let written = false;
    const writeLine = () => {
        if (written) return;
        written = true;
        const client = getClientInfo(req);
        const country = String(req.get("cf-ipcountry") || "").toUpperCase();
        const aborted = !res.writableFinished;
        console.log(JSON.stringify({
            type: "request",
            request_id: requestId,
            method: req.method,
            route: routeTemplate(req),
            // 499 = the client closed the connection before any response header was sent (nginx/Render convention).
            status: aborted && !res.headersSent ? 499 : res.statusCode,
            duration_ms: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
            member_id: req.user?.id ?? null,
            platform: client.platform,
            version: client.version,
            build: client.build,
            platform_hint: client.platformHint,
            country: COUNTRY_RE.test(country) ? country : null,
            xff_n: countForwardedHops(req.get("x-forwarded-for")),
            aborted
        }));
    };
    res.once("finish", writeLine);
    res.once("close", writeLine);
    next();
};

module.exports = { requestLog };
