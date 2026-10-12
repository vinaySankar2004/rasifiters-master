// In-memory fixed-window rate limiting — observability SPEC §4 (D-C4). The API runs as ONE Render instance, so
// process memory is the whole truth; a deploy/restart resets every window (fine for abuse protection). No
// dependency, no shared store.
const net = require("net");

// The primitive: hit(key, cost = 1, now) adds `cost` to the key's current window → { allowed, retryAfterSeconds };
// refund(key, cost) takes it back.
// The key map is bounded (maxKeys): when full, expired windows are swept; if it is still full the NEW key is
// refused (fail closed against a key flood). Used per client (rateLimit below) and, with cost = events, for the
// per-client daily event cap + the global daily event budget (services/clientEventService.js).
const createFixedWindowLimiter = ({ windowMs, max, maxKeys }) => {
    const windows = new Map(); // key → { count, resetAt }

    const sweepExpired = (now) => {
        for (const [key, entry] of windows) {
            if (entry.resetAt <= now) windows.delete(key);
        }
    };

    const hit = (key, cost = 1, now = Date.now()) => {
        let entry = windows.get(key);
        if (!entry || entry.resetAt <= now) {
            if (!entry && windows.size >= maxKeys) sweepExpired(now);
            if (!entry && windows.size >= maxKeys) {
                return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
            }
            entry = { count: 0, resetAt: now + windowMs };
            windows.set(key, entry);
        }
        entry.count += cost;
        if (entry.count <= max) return { allowed: true, retryAfterSeconds: 0 };
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    };

    // Gives back `cost` charged by an earlier hit whose work then failed or was refused downstream; never below 0.
    // An expired window is replaced on its next hit anyway, so refunding it is harmless.
    const refund = (key, cost = 1) => {
        const entry = windows.get(key);
        if (entry) entry.count = Math.max(0, entry.count - cost);
    };

    return { hit, refund };
};

// The limiter key for a client address: IPv4 (and IPv4-mapped IPv6) as-is; IPv6 by its /64 — one subscriber
// usually holds a whole /64, so per-address keys would let a single client rotate past the limit. Anything that
// is not an IP literal shares "unknown", so a malformed address can never mint keys of its own.
const clientKey = (ip) => {
    if (typeof ip !== "string" || ip === "") return "unknown";
    if (net.isIPv4(ip)) return ip;
    if (!net.isIPv6(ip)) return "unknown";
    if (/^::ffff:/i.test(ip)) return ip;
    const [head, tail] = ip.toLowerCase().split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];
    const zeros = tail === undefined ? [] : new Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0");
    const prefix = [...headGroups, ...zeros, ...tailGroups].slice(0, 4).map((g) => g.replace(/^0+(?=[0-9a-f])/, ""));
    return `${prefix.join(":")}::/64`;
};

// Express middleware: 429 + Retry-After once a client exceeds `max` requests in `windowMs`. Keyed by
// clientKey(req.ip), which relies on server.js's `trust proxy` hop count being right (SPEC D-C7).
const rateLimit = ({ windowMs, max, maxKeys = 10000, keyFn = (req) => clientKey(req.ip) }) => {
    const limiter = createFixedWindowLimiter({ windowMs, max, maxKeys });
    return (req, res, next) => {
        const { allowed, retryAfterSeconds } = limiter.hit(keyFn(req));
        if (allowed) return next();
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({ error: "Too many requests. Try again later.", code: "rate_limited" });
    };
};

module.exports = { createFixedWindowLimiter, clientKey, rateLimit };
