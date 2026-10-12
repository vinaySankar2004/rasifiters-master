// Client event ingest — validation + normalization for POST /api/client-events (observability SPEC §4, D-C4).
// The body is untrusted and may be signed-out. member_id comes ONLY from the verified token (never the body);
// platform/version/build only from headers; created_at is the server clock. One bad event never fails the batch —
// it is dropped and counted (or its props replaced). Only a malformed batch is a 400.
const AppEvent = require("../models/AppEvent");
const { AppError } = require("../utils/response");
const { parseRequestId } = require("../utils/clientInfo");
const { createFixedWindowLimiter } = require("../utils/rateLimit");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 25;
const MAX_PROPS_BYTES = 2048;
const MAX_TYPE_CHARS = 64;
const DAILY_EVENTS_PER_CLIENT = 1000;
const DAILY_EVENT_BUDGET = 10000;
const TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$/; // e.g. "auth.forced_sign_out"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY_RE = /token|password|secret|authorization|cookie|email/i;
// Postgres jsonb rejects \u0000 and lone UTF-16 surrogates (22P05); JSON.stringify writes both as \u escapes.
const JSONB_UNSAFE_RE = /\\u0000|\\ud[89a-f][0-9a-f]{2}/i;
const OCCURRED_MAX_PAST_MS = 7 * DAY_MS;
const OCCURRED_MAX_FUTURE_MS = 5 * 60 * 1000;

// Storage bounds (D-C4), cost = stored events, process memory (one instance):
//  - per client (IPv4 address / IPv6 /64): ≤ DAILY_EVENTS_PER_CLIENT per 24 h — one client (e.g. a buggy sender
//    loop) can't spend the global budget for everyone;
//  - all clients: ≤ DAILY_EVENT_BUDGET per 24 h — caps what a distributed flood can write (~10k rows/day).
const dailyPerClient = createFixedWindowLimiter({ windowMs: DAY_MS, max: DAILY_EVENTS_PER_CLIENT, maxKeys: 10000 });
const dailyBudget = createFixedWindowLimiter({ windowMs: DAY_MS, max: DAILY_EVENT_BUDGET, maxKeys: 1 });

const rateLimited = (retryAfter) =>
    new AppError(429, "Too many requests. Try again later.", { code: "rate_limited", retryAfter });

// Per-client cap first: a client over its own cap never spends the shared budget. A global rejection hands the
// client its charge back — one client never pays for everyone else's traffic.
const spendDailyBudgets = (clientKey, cost) => {
    const perClient = dailyPerClient.hit(clientKey, cost);
    if (!perClient.allowed) throw rateLimited(perClient.retryAfterSeconds);
    const global = dailyBudget.hit("all", cost);
    if (!global.allowed) {
        dailyPerClient.refund(clientKey, cost);
        throw rateLimited(global.retryAfterSeconds);
    }
};

// A failed insert stored nothing: both daily budgets get the charge back, so the client's retry isn't charged twice.
const refundDailyBudgets = (clientKey, cost) => {
    dailyPerClient.refund(clientKey, cost);
    dailyBudget.refund("all", cost);
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeType = (raw) =>
    (typeof raw === "string" && raw.length <= MAX_TYPE_CHARS && TYPE_RE.test(raw) ? raw : null);

// Client clocks drift and queues replay: keep a client timestamp only inside [now − 7 d, now + 5 min].
const normalizeOccurredAt = (raw, now) => {
    if (typeof raw !== "string") return null;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms) || ms < now - OCCURRED_MAX_PAST_MS || ms > now + OCCURRED_MAX_FUTURE_MS) return null;
    return new Date(ms);
};

// Top-level keys that look like credentials or contact data are removed. Props jsonb can't store, or that
// serialize to > 2,048 UTF-8 bytes, are replaced by a marker — the event itself is still stored.
const normalizeProps = (raw) => {
    if (!isPlainObject(raw)) return {};
    const props = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key === "__proto__" || SENSITIVE_KEY_RE.test(key)) continue;
        props[key] = value;
    }
    let json;
    try {
        json = JSON.stringify(props);
    } catch (_error) {
        return { props_invalid: true }; // e.g. nested too deep to serialize
    }
    if (JSONB_UNSAFE_RE.test(json)) return { props_invalid: true };
    return Buffer.byteLength(json, "utf8") <= MAX_PROPS_BYTES ? props : { props_too_large: true };
};

const toRow = (event, context) => {
    if (!isPlainObject(event)) return null;
    const type = normalizeType(event.type);
    if (!type) return null;
    const row = {
        source: "client",
        type,
        member_id: context.memberId,
        platform: context.platform,
        app_version: context.appVersion,
        app_build: context.appBuild,
        occurred_at: normalizeOccurredAt(event.occurred_at, context.now),
        request_id: parseRequestId(event.request_id),
        props: normalizeProps(event.props)
    };
    // Idempotency: a client-generated UUID makes a retried batch store each event once (ON CONFLICT DO NOTHING).
    if (typeof event.id === "string" && UUID_RE.test(event.id)) row.id = event.id.toLowerCase();
    return row;
};

// clientKey = utils/rateLimit clientKey(req.ip) — the per-client daily cap's key.
const recordClientEvents = async ({ body, memberId, clientInfo, clientKey = "unknown" }) => {
    const events = isPlainObject(body) ? body.events : undefined;
    if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS) {
        throw new AppError(400, `events must be an array of 1-${MAX_EVENTS} items.`, { code: "invalid_batch" });
    }
    const context = {
        memberId,
        platform: clientInfo.platform || clientInfo.platformHint,
        appVersion: clientInfo.version,
        appBuild: clientInfo.build,
        now: Date.now()
    };
    const rows = events.map((event) => toRow(event, context)).filter(Boolean);
    if (rows.length > 0) {
        spendDailyBudgets(clientKey, rows.length);
        try {
            await AppEvent.bulkCreate(rows, { ignoreDuplicates: true });
        } catch (error) {
            refundDailyBudgets(clientKey, rows.length);
            throw error;
        }
    }
    return { accepted: rows.length, dropped: events.length - rows.length };
};

module.exports = { recordClientEvents, normalizeProps };
