# Phase 2 track A — plan

# PLAN: Reliability overhaul Phase 2 track A, observability (backend only), revision 2

**Brief accepted**: yes. The fence has 18 files, listed exactly in E4. This revision fixes both BLOCKING objections and all six ADVISORY ones (mapping below).

**Feature/version prediction**:
- `observability` is a new feature at **v0.1.0**. It is `built` at commit and flips to `deployed` after E6, with no bump.
- `auth` goes **v0.10.0 → v0.11.0** (MINOR). Reasons: a new owned export, `optionalAuthenticate`, and F16 is resolved by CORS `exposedHeaders`. Both are additive, so no dependent needs a new version.

**Surfaces in scope**: [backend] only.
- No web, iOS or Android client sends `X-App-*`, `X-Request-Id` or events until Phase 3.
- The docs (D1–D7) are written by the orchestrator inside git-version.
- One implementer.

## How the verdict was resolved

| # | Resolution |
|---|---|
| 1 BLOCKING | E1 and E3 now set `SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder`, the same as track C. The access token always comes from the **prod** login (`LOGIN_BASE=https://rasifiters-api.onrender.com/api`). The local server checks that token through the public JWKS and `DATABASE_URL`. The local port is **5061**, because C's smoke uses 5057/5058. |
| 2 BLOCKING | See "Header contract and sequencing" below. In short: A adopts C's D-C6 header names exactly, including `X-App-Build`. It parses `X-App-Build`, logs `build`, and adds the `app_build integer` column. A drops its "header-less Android" definition. C keeps its own presence-based gate rule and does not import `clientInfo`; there is no `depends_on` edge and no "Imported by" claim. Landing order is **C → A → B** on shared files. Every A edit to a shared file is anchored by text, not line number. A's `requestLog` sits above app-config, so C's 426s get logged. |
| 3 | Idempotency: each event may carry an optional client UUID `id`, and the insert uses `bulkCreate(rows, { ignoreDuplicates: true })`, which generates `INSERT … ON CONFLICT DO NOTHING` (verified against the generated SQL). §8 tells the senders to use it. |
| 4 | Props that jsonb can't store are replaced, so the whole batch never fails on them. This covers `\u0000`, lone surrogates and anything `JSON.stringify` can't serialize; they become `{props_invalid:true}`. Verified. |
| 5 | Limits now fit inside 64 kb: **≤ 25 events per batch** and **props ≤ 2,048 UTF-8 bytes**. 25 × ~2.4 KB is about 60 KB. §8 also says: on 413, split the batch in half and retry. |
| 6 | IPv6 clients are keyed by their **/64**. A **global daily event budget** (10,000 stored events per 24 h) bounds storage; a per-minute global request cap would not (600/min × 64 kb ≈ 55 GB/day). Under a flood, the endpoint fails closed with 429 and the rest of the API is unaffected. |
| 7 | `ENV_RUNBOOK.md` L141-142 and L168 are fixed as well as the L110 row. `.claude/skills/deploy/SKILL.md:80` is outside the fence and is flagged to the orchestrator. |
| 8 | E4 lists the exact 18 paths for `git add`. |

New finding, verified in a scratch copy: the global `errorHandler` prints body-parser errors including `err.body`. A malformed-JSON login body, with its password, reaches the Render log. That file is outside the fence, so it is flagged as F7 and orchestrator item O1, with exact code.

## Header contract and sequencing (orchestrator)

**Header contract**
- The header names and meanings are owned by **app-config D-C6** (C's plan): `X-App-Platform`, `X-App-Version`, `X-App-Build`.
- Observability owns `X-Request-Id`, plus how all four headers are parsed, logged and stored (`utils/clientInfo.js`).
- C's gate checks whether `X-App-Version` is **present**, plus the UA `^okhttp\/`. That is a different question from parsing for logs, so no parser is duplicated. The brief's line "C must import clientInfo" is superseded.
- **`X-App-Build` goes beyond the board's two approved headers, so the USER approves it at the gate (shared with C).** If it is rejected, the orchestrator strips:
  - `parseBuild`, the `build` key and its call from `clientInfo.js`;
  - `build` from `requestLog.js`;
  - `appBuild`/`app_build` from the service, the model and 007;
  - the E1 expected `build` keys and E3's "log build" check;
  - the SPEC mentions.

**Order on shared files: C → A → B**
- A's 7 new files plus `config/database.js`, `middleware/auth.js`, `sql/README.md` and `CONTEXT.md` can be written at any time.
- Steps 9 (`server.js`) and 10 (`.env.example`), and docs D3–D5 (`registry.json`, `REGISTRY.md`, `ENV_RUNBOOK.md`), start only when `git -C /Users/vinayaksankaranarayanan/Developer/rasifiters-master status --short -- apps/backend/server.js apps/backend/.env.example ENV_RUNBOOK.md specs/features/registry.json specs/features/REGISTRY.md` prints nothing. If it prints anything, STOP and report it. File-level staging can't split hunks.
- Every A anchor below is text that neither C nor B rewrites, so A applies cleanly before or after C.
- **B after A:**
  - B adds its staging origin inside A's `cors({ origin: [...] })`, keeping `credentials`, `maxAge` and `exposedHeaders`.
  - Migrations: A = 007, B = 008+.
  - auth versions: A → 0.11.0, B's login-change guard → 0.12.0.
  - B's staging run of 007 goes as the owner role, after the staging base schema exists. That run gives `staging.app_events` with no RLS and a cron job `app_events_retention_staging`.
  - B's grant migration gives `rasifiters_staging` SELECT/INSERT/DELETE on `staging.app_events`.

**Amend C's plan before C implements** (wording only): wherever C's D-C5 text or the ENV_RUNBOOK `BLOCK_UNVERSIONED_ANDROID` row says "every `/api/*` route except `/api/app-config`", it should say "except `/api/app-config` and `/api/client-events` (mounted before the gate; observability D-C4)".

## Steps — backend (implementer; touch ONLY the 13 backend paths in E4)

1. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/clientInfo.js`**:
```js
// Client identity from request headers — observability SPEC §4 (D-C3). Parsed ONCE here for LOGGING and STORAGE:
// the request log and the client-events ingest import these functions — never copy the parsing. Every value is
// allow-listed or charset-limited, so it is safe to log and to store. Nothing here gates a request: app-config's
// version gate (its D-C5) checks header PRESENCE with its own rule. Header names + meaning: app-config D-C6.
//   X-App-Platform  "ios" | "android" | "web" (trimmed, case-insensitive)          → platform, else null
//   X-App-Version   marketing version, ≤ 32 chars of [0-9A-Za-z .+_()-]            → version, else null
//   X-App-Build     build number (iOS CFBundleVersion / Android versionCode), 1–9 digits → build (integer), else null
//   User-Agent      okhttp → android · CFNetwork/Darwin → ios · Mozilla/ → web      → platformHint (live binaries
//                   send no X-App-* headers; coarse, never authoritative)
//   X-Request-Id    8–64 chars of [A-Za-z0-9._:-]                                   → parseRequestId, else null
const PLATFORMS = new Set(["ios", "android", "web"]);
const VERSION_RE = /^[0-9A-Za-z .+_()-]{1,32}$/;
const BUILD_RE = /^\d{1,9}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;

const parsePlatform = (raw) => {
    if (typeof raw !== "string") return null;
    const value = raw.trim().toLowerCase();
    return PLATFORMS.has(value) ? value : null;
};

const parseVersion = (raw) => {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    return VERSION_RE.test(value) ? value : null;
};

const parseBuild = (raw) => {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    return BUILD_RE.test(value) ? Number(value) : null;
};

const parseRequestId = (raw) => (typeof raw === "string" && REQUEST_ID_RE.test(raw) ? raw : null);

const platformFromUserAgent = (userAgent) => {
    if (typeof userAgent !== "string" || userAgent === "") return null;
    if (/okhttp/i.test(userAgent)) return "android";
    if (/CFNetwork|Darwin/.test(userAgent)) return "ios";
    if (userAgent.startsWith("Mozilla/")) return "web";
    return null;
};

const getClientInfo = (req) => ({
    platform: parsePlatform(req.get("x-app-platform")),
    version: parseVersion(req.get("x-app-version")),
    build: parseBuild(req.get("x-app-build")),
    platformHint: platformFromUserAgent(req.get("user-agent"))
});

module.exports = { getClientInfo, parsePlatform, parseVersion, parseBuild, parseRequestId, platformFromUserAgent };
```

2. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/requestLog.js`**:
```js
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
```

3. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/rateLimit.js`**:
```js
// In-memory fixed-window rate limiting — observability SPEC §4 (D-C4). The API runs as ONE Render instance, so
// process memory is the whole truth; a deploy/restart resets every window (fine for abuse protection). No
// dependency, no shared store.
const net = require("net");

// The primitive: hit(key, cost = 1, now) adds `cost` to the key's current window → { allowed, retryAfterSeconds }.
// The key map is bounded (maxKeys): when full, expired windows are swept; if it is still full the NEW key is
// refused (fail closed against a key flood). Used per client (rateLimit below) and, with cost = events, for the
// global daily event budget (services/clientEventService.js).
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

    return { hit };
};

// The limiter key for a client address: IPv4 (and IPv4-mapped IPv6) as-is; IPv6 by its /64 — one subscriber
// usually holds a whole /64, so per-address keys would let a single client rotate past the limit.
const clientKey = (ip) => {
    if (typeof ip !== "string" || ip === "") return "unknown";
    if (!net.isIPv6(ip) || /^::ffff:/i.test(ip)) return ip;
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
```

4. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/AppEvent.js`**. Do NOT edit `models/index.js`.
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// app_events — the observability event trail (observability SPEC §5; migration sql/007_app_events.sql).
// Append-only, no associations — so it is NOT registered in models/index.js; clientEventService requires it directly.
const AppEvent = sequelize.define("AppEvent", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    occurred_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    source: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "client"
    },
    type: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    member_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    platform: {
        type: DataTypes.STRING(16),
        allowNull: true
    },
    app_version: {
        type: DataTypes.STRING(32),
        allowNull: true
    },
    app_build: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    request_id: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    props: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
    }
}, {
    tableName: "app_events",
    timestamps: false,
    underscored: true
});

module.exports = AppEvent;
```

5. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/clientEventService.js`**:
```js
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
const DAILY_EVENT_BUDGET = 10000;
const TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$/; // e.g. "auth.forced_sign_out"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY_RE = /token|password|secret|authorization|cookie|email/i;
// Postgres jsonb rejects \u0000 and lone UTF-16 surrogates (22P05); JSON.stringify writes both as \u escapes.
const JSONB_UNSAFE_RE = /\\u0000|\\ud[89a-f][0-9a-f]{2}/i;
const OCCURRED_MAX_PAST_MS = 7 * DAY_MS;
const OCCURRED_MAX_FUTURE_MS = 5 * 60 * 1000;

// Storage bound (D-C4): at most DAILY_EVENT_BUDGET stored events per 24 h window across ALL clients — caps what a
// distributed flood can write (~10k rows/day) while per-client limits stay generous. Process memory (one instance).
const dailyBudget = createFixedWindowLimiter({ windowMs: DAY_MS, max: DAILY_EVENT_BUDGET, maxKeys: 1 });

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

const recordClientEvents = async ({ body, memberId, clientInfo }) => {
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
        const budget = dailyBudget.hit("all", rows.length);
        if (!budget.allowed) {
            throw new AppError(429, "Too many requests. Try again later.", {
                code: "rate_limited",
                retryAfter: budget.retryAfterSeconds
            });
        }
        await AppEvent.bulkCreate(rows, { ignoreDuplicates: true });
    }
    return { accepted: rows.length, dropped: events.length - rows.length };
};

module.exports = { recordClientEvents, normalizeProps };
```

6. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/clientEvents.js`**:
```js
// /api/client-events — client telemetry ingest. See specs/features/observability/SPEC.md §3.2 (D-C4).
// Works SIGNED-OUT: optionalAuthenticate attaches req.user when a valid bearer is present and never rejects
// (sign-in failures and forced sign-outs are reported exactly when the session is gone). Mounted in server.js
// BEFORE the global express.json(), so this router's own 64 kb parser is the only one that runs.
// Per request: per-client limiter (cheapest, before any parsing) → JSON body ≤ 64 kb → optional auth → insert.
const express = require("express");
const { optionalAuthenticate } = require("../middleware/auth");
const { rateLimit } = require("../utils/rateLimit");
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
            clientInfo: getClientInfo(req)
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

// Body-parser failures keep their real 4xx (413 too large · 400 malformed JSON · 415 unsupported charset/encoding)
// instead of reaching the global errorHandler, which answers every non-AppError with 500 (and prints the error).
// Four params = an Express error handler; keep `next`.
router.use((err, req, res, next) => {
    if (!err || typeof err.type !== "string" || !(err.status >= 400 && err.status < 500)) return next(err);
    if (err.status === 413) {
        return res.status(413).json({ error: "Payload too large.", code: "payload_too_large" });
    }
    return res.status(err.status).json({ error: "Invalid request body.", code: "invalid_body" });
});

module.exports = router;
```

7. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js`**:
   - Replace the line `module.exports = { authenticateToken, authenticateStream, isAdmin, canModifyLog, requireProgramAdmin, requireProgramMember };` (it occurs exactly once) with the block below.
   - On the HEAD file this lands at L222-241, followed by a blank L242 and `module.exports` at L243. The file becomes 243 lines.
   - If the file changed before this step, run `grep -n "observability D-C4 / auth D-C12" middleware/auth.js` for the start line and use the line of the closing `};` as the end. Use that range in D2.
```js
// observability D-C4 / auth D-C12 (0.11.0): authenticate IF a bearer token is present; NEVER reject. No token, a
// bad/expired token, an unknown member or a JWKS/DB outage all continue signed-out (req.user stays unset). For
// routes that must work without a login — POST /api/client-events, whose sign-in-failure and forced-sign-out
// reports arrive precisely when the session is gone. Header only (never ?token=).
const optionalAuthenticate = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
        try {
            const resolved = await resolveReqUser(token);
            if (resolved) {
                req.user = resolved.user;
                req.authUserId = resolved.authUserId;
            }
        } catch (_error) {
            // Signed-out by design: neither a token fault nor an infrastructure failure rejects here.
        }
    }
    next();
};

module.exports = { authenticateToken, authenticateStream, optionalAuthenticate, isAdmin, canModifyLog, requireProgramAdmin, requireProgramMember };
```

8. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/database.js`**: replace the line `    logging: true,` (L13) with:
```js
    // observability D-C2: SQL logging OFF unless DB_LOG_SQL=true (local debugging only — queries carry usernames,
    // emails and push tokens as literals). Deliberately not keyed on NODE_ENV (unset on Render).
    logging: process.env.DB_LOG_SQL === "true" ? console.log : false,
```

9. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js`**. Run the sequencing pre-check first. All five edits are text-anchored, and each anchor occurs exactly once.
   - (a) Insert immediately **before** `const { errorHandler } = require("./middleware/errorHandler");`:
```js
const { requestLog } = require("./middleware/requestLog");
```
   - (b) Insert immediately after `} = require("./routes/memberAnalytics");`:
```js
const clientEventRoutes = require("./routes/clientEvents");
```
   - (c) Replace the line `const app = express();` with:
```js
const app = express();

// observability D-C7: trust exactly ONE proxy hop (Render's edge), so req.ip is the client address from
// X-Forwarded-For. Only the client-events per-client limiter reads it today. Re-verify the hop count after any
// infra change with the request log's `xff_n` (observability SPEC §6).
app.set("trust proxy", 1);

// observability D-C1: structured request log + X-Request-Id. FIRST, so CORS preflights (and every later
// middleware's responses, incl. app-config's version-gate 426s) are logged too.
app.use(requestLog);
```
   - (d) Replace the line `    credentials: true` (the last property of the `cors({…})` options) with:
```js
    credentials: true,
    // observability D-C8: browsers cache the preflight for 2 h (Chrome's cap) — repeat web opens skip it.
    maxAge: 7200,
    // observability D-C8 (resolves auth F16): the web app may read Retry-After (auth D-C11 503s, client-events
    // 429s) and the X-Request-Id it should quote in error reports.
    exposedHeaders: ["Retry-After", "X-Request-Id"]
```
   - (e) Replace the line `app.use(express.json());` with:
```js
// observability D-C4: BEFORE the global express.json() — this router carries its own 64 kb parser (a body the
// global 100 kb parser read first would skip it). Also ahead of app-config's version gate on purpose: telemetry
// must arrive even from a build the gate blocks.
app.use("/api/client-events", clientEventRoutes);

app.use(express.json());
```
   - Nothing else changes. Leave the origin list, the app-config block or C's replacement of it, C's gate, the routers, `/api/test` and `errorHandler` alone.

10. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example`**: append at end of file, leaving one blank line before the block. This goes after C's block if C has landed.
```
# --- Observability (specs/features/observability, D-C2) ------------------------------------------
# Sequelize SQL query logging. Unset / anything but "true" = OFF (prod: leave unset). "true" prints every
# query to stdout — local debugging only (queries carry usernames, emails and push tokens as literals).
DB_LOG_SQL=
```

11. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/007_app_events.sql`**:
```sql
-- 007_app_events.sql — the observability event trail (reliability-overhaul Phase 2 track A;
-- specs/features/observability/SPEC.md §5, D-C5/D-C6).
--
-- Creates `app_events`: one row per client- or server-reported event (forced sign-outs, sync runs, client
-- errors). Written ONLY by the backend (POST /api/client-events now; server-side auth events in Phase 3).
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema().
--   Prod:    run as-is (current_schema() = public).
--   Staging: psql "$DSN" -c "SET search_path TO staging" -f apps/backend/sql/007_app_events.sql   (owner role)
-- Idempotent: IF NOT EXISTS everywhere; the RLS step and cron.schedule (same job name → updated) re-run safely.
--
-- HOW TO RUN: the USER applies this (Supabase SQL editor → paste → Run, or psql) BEFORE the backend deploy
-- that adds POST /api/client-events. Claude never executes schema SQL against the live DB (CLAUDE.md).

CREATE TABLE IF NOT EXISTS app_events (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    occurred_at  timestamp with time zone,
    source       character varying(16) DEFAULT 'client'::character varying NOT NULL,
    type         character varying(64) NOT NULL,
    member_id    uuid,
    platform     character varying(16),
    app_version  character varying(32),
    app_build    integer,
    request_id   character varying(64),
    props        jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT app_events_pkey PRIMARY KEY (id),
    CONSTRAINT app_events_source_check CHECK (source IN ('client', 'server')),
    -- CASCADE: account deletion (cascadeMemberDeletion → members row delete) removes the member's events.
    CONSTRAINT app_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON app_events USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_app_events_member_id_created_at ON app_events USING btree (member_id, created_at);

-- RLS: every public table in this project has RLS enabled with NO policies, so PostgREST (anon / authenticated)
-- reads nothing; the backend connects as the table owner and is unaffected. Only the PostgREST-exposed `public`
-- schema gets it — a staging copy must stay writable by the non-owner staging role.
DO $$
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 90-day retention (DESIGN_BOARD §7.2): one nightly pg_cron job per schema, 04:17 UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'app_events_retention_' || current_schema(),
    '17 4 * * *',
    format('DELETE FROM %I.app_events WHERE created_at < now() - interval %L', current_schema(), '90 days')
);
```

12. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md`**: insert directly after the row beginning ``| `004_seed_healthkit_workout_types.sql` |``:
```
| `005_member_program_order.sql` | Creates `member_program_order` (per-member program-card order for the picker surfaces; `programs` 0.2.0). |
| `006_add_steps_to_daily_health_logs.sql` | Adds the optional `daily_health_logs.steps` column + its checks (steps tracking). |
| `007_app_events.sql` | Creates `app_events` (the observability event trail) + 2 indexes, enables RLS on the `public` copy, enables `pg_cron` and schedules the nightly 90-day retention job. **First schema-neutral migration** (no `public.` — DESIGN_BOARD §8): run as-is for prod; for a `staging` schema run `psql "$DSN" -c "SET search_path TO staging" -f apps/backend/sql/007_app_events.sql`. See `specs/features/observability`. |
```

13. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md`**:
   - Insert directly after the line `  migration \`sql/005\`, \`programs\` feature 0.2.0 D-N1).`:
```
- **Added (reliability overhaul Phase 2):** `app_events` (observability event trail — `POST /api/client-events`, 90-day `pg_cron` retention; migration `sql/007`, [`observability`](../../specs/features/observability/SPEC.md)).
```
   - Replace everything from the line `## Runtime + observability (as of 2026-10-10)` through the line ending `(../../specs/initiatives/reliability-overhaul/BRIEF.md).` (L45-52) with the block below. Keep the following `- Live binaries hard-code …` bullet unchanged.
```
## Runtime + observability (as of 2026-10-12)
- Render plan **Starter**: 1 instance, 0.5 vCPU / 512 MB, region `virginia` (next to Supabase `us-east-1`
  on purpose — one screen issues many queries). Fronted by Cloudflare (TLS terminates at the nearest edge).
  Typical load: ~0.1% CPU, ~120 MB RAM, ~4.5–6k requests/day.
- **Logs:** Render keeps **app logs only** (7 days; no `http_latency` metric — `http_request_count` by status
  works). The app writes **one JSON line per request** (`"type":"request"`) and **SQL logging is off**
  (`DB_LOG_SQL=true` re-enables it locally); every response carries `X-Request-Id`. `trust proxy` = 1 hop.
  Event trail: `app_events` via `POST /api/client-events`. Contract + fields:
  [`observability`](../../specs/features/observability/SPEC.md).
```

14. Do **not** touch:
   - `models/index.js`, `middleware/errorHandler.js` (see O1), `render.yaml`, `package.json`, `package-lock.json`;
   - any other `routes/*.js`;
   - `authenticateToken` or `authenticateStream`;
   - `middleware/versionGate.js` (C's).

## Steps — web / ios / android
None.
- Web gets only additive response headers: `Access-Control-Max-Age`, `Access-Control-Expose-Headers` and `X-Request-Id`.
- Native clients ignore CORS. Extra headers leave `ETag` unchanged, so iOS URLCache 304s are unaffected (E3 checks this).

## Steps — docs (orchestrator, inside git-version, after E3 passes; D3–D5 follow the sequencing pre-check)

D1. **New `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md`**, full content:
````markdown
# Feature: `observability` — request log, client identity headers, event trail

> **Status:** 🏗️ built (backend; reliability-overhaul Phase 2 track A) · **Version:** 0.1.0 · **Apps (`consumed_by`):** none yet — `[]` until Phase 3 adds the web / iOS / Android senders
> **Provenance:** **NET-NEW** — no legacy equivalent (the legacy backend logged SQL only). Contract:
> [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §7 (W6, "observability is free" ✅);
> evidence: [`discovery/W6`](../../initiatives/reliability-overhaul/discovery/W6-observability-perf.md).
> **Depends on:** [`auth`](../auth/SPEC.md) (`optionalAuthenticate`, auth D-C12).
> **Header contract:** the `X-App-Platform` / `X-App-Version` / `X-App-Build` names + meanings are owned by
> [`app-config`](../app-config/SPEC.md) D-C6. This feature owns `X-Request-Id` and how all four are parsed,
> logged and stored (§4).

---

## 1. What it is

Free, in-house observability for the API (board principle 5 — no paid vendor; Render's app log + our own
Postgres are the sinks):

1. **Structured request log** — one JSON line per request on stdout (§3.1).
2. **Request ids** — a well-formed inbound `X-Request-Id` is kept, otherwise generated; echoed on every response.
3. **Client identity** — `X-App-Platform` / `X-App-Version` / `X-App-Build` parsed once (`utils/clientInfo.js`)
   and logged, plus a coarse User-Agent `platform_hint` for live binaries that send no headers. Read + log only.
4. **Event trail** — the `app_events` table + `POST /api/client-events` (works signed-out, size-capped,
   rate-limited per client, global daily budget, idempotent retries), 90-day retention (§3.2, §5).
5. **SQL query logging off** by default (§6).
6. **CORS preflight cache** (2 h) + `Retry-After` / `X-Request-Id` exposed to the web app.

## 2. Why it exists

Phase 0 (W6) found we could not see requests, refresh-failure reasons, client errors, sync runs or push
outcomes: the only app log was Sequelize SQL (~16k lines/day carrying usernames, emails and push tokens as
literals), Render's plan keeps no request log or latency metric, and every client swallows its errors. The user
chose free observability (W6-D1; board §7) over Render Pro, Sentry and Supabase log drains.

## 3. Functionality

### 3.1 The request log (`middleware/requestLog.js`)

Mounted **first** in `server.js` (before `cors`, so preflights — and app-config's version-gate 426s — are
logged). Writes ONE line per request when the response finishes, or when the connection closes first:

```json
{"type":"request","request_id":"3f0c…","method":"GET","route":"/api/members/:id","status":200,"duration_ms":41,"member_id":"8c1e…","platform":"android","version":"1.1.0","build":6,"platform_hint":"android","country":"KE","xff_n":1,"aborted":false}
```

| Field | Source |
|---|---|
| `type` | always `"request"` — the search key in Render's log explorer |
| `request_id` | inbound `X-Request-Id` when it matches `^[A-Za-z0-9._:-]{8,64}$`, else `crypto.randomUUID()`; also `req.id` and the `X-Request-Id` response header (set before any handler, so the SSE stream carries it) |
| `method` | HTTP method |
| `route` | route **template** `req.baseUrl + req.route.path` (`/api/members/:id`; a router's `/` collapses to its mount path); `"unmatched"` when no route ran (404, CORS preflight, a body-parse failure in the global parser) |
| `status` | `res.statusCode`; **499** when the client closed the connection before any response header was sent |
| `duration_ms` | integer ms, first middleware → finish/close (SSE stream: the stream's lifetime) |
| `member_id` | `req.user.id` when a verifier succeeded, else `null` |
| `platform` / `version` / `build` | `X-App-Platform` / `X-App-Version` / `X-App-Build` via `getClientInfo` (§4), else `null` |
| `platform_hint` | User-Agent: `okhttp` → `android`, `CFNetwork`/`Darwin` → `ios`, `Mozilla/…` → `web`, else `null` |
| `country` | `CF-IPCountry` when 2 chars `[A-Z0-9]`, else `null` |
| `xff_n` | the NUMBER of `X-Forwarded-For` entries (never the addresses) — verifies the proxy hop count (D-C7) |
| `aborted` | `true` when the connection closed before the response finished (normal for `/api/notifications/stream`) |

**Never logged:** the URL or query string (the SSE `?token=`), any other header, request/response bodies,
usernames, emails, IP addresses, tokens. **Skipped:** `GET /` and `HEAD /` (Render health checks).

### 3.2 `POST /api/client-events`

| # | Route | Handler | Auth | Purpose |
|---|-------|---------|------|---------|
| 1 | `POST /api/client-events` | `routes/clientEvents.js` → `services/clientEventService.recordClientEvents` | **optional** (`optionalAuthenticate`) | Store a batch of client events in `app_events`. |

Middleware order: per-client limiter → router-local `express.json({ limit: "64kb" })` (mounted before the
global parser) → `optionalAuthenticate` → handler. Mounted ahead of app-config's version gate on purpose
(telemetry must arrive even from a build the gate blocks).

**Request** — `Content-Type: application/json`; optional `Authorization: Bearer <access token>`,
`X-App-Platform`, `X-App-Version`, `X-App-Build`, `X-Request-Id`. Body:

```json
{ "events": [ { "id": "0b6f2c1e-6a51-4c39-9d8e-3f1a2b4c5d6e", "type": "auth.forced_sign_out",
                "occurred_at": "2026-10-12T18:04:05.000Z", "request_id": "6b0d…",
                "props": { "reason": "refresh_session_invalid" } } ] }
```

| Status | Body | When |
|---|---|---|
| `202` | `{ "accepted": N, "dropped": M }` | well-formed batch; invalid events dropped + counted; a replayed event `id` is acknowledged, not stored twice |
| `400` | `{ "error": "events must be an array of 1-25 items.", "code": "invalid_batch" }` | `events` missing / not an array / empty / > 25 |
| `400` · `415` | `{ "error": "Invalid request body.", "code": "invalid_body" }` | malformed JSON (400); unsupported charset/encoding (415) |
| `413` | `{ "error": "Payload too large.", "code": "payload_too_large" }` | body > 64 kb |
| `429` | `{ "error": "Too many requests. Try again later.", "code": "rate_limited" }` + `Retry-After` | > 30 requests / 60 s from one client (IPv4 address / IPv6 /64), or the global daily event budget is spent (`Retry-After` up to 86,400 s) |
| `500` | `{ "error": "Failed to record events." }` | insert failed (logged `[client-events] insert failed: <name> <pg code>`) |

**Never 401 / 503:** a missing, bad or expired token, or an auth outage, stores the events with `member_id = null`.

## 4. Feature list (behaviors)

- **`getClientInfo(req)`** (`utils/clientInfo.js`) → `{ platform, version, build, platformHint }`. `platform` =
  `X-App-Platform` trimmed + lower-cased ∈ {`ios`, `android`, `web`}, else `null`; `version` = `X-App-Version`
  trimmed, `^[0-9A-Za-z .+_()-]{1,32}$`, else `null`; `build` = `X-App-Build` trimmed, `^\d{1,9}$` → integer, else
  `null`; `platformHint` per §3.1. Also exports `parsePlatform`, `parseVersion`, `parseBuild`, `parseRequestId`,
  `platformFromUserAgent`. **The single parser for logs + storage** — never copy it. app-config's gate (its D-C5)
  checks header **presence** with its own rule; it does not parse values.
- **Event normalization** (`clientEventService`), per event:
  - not a plain object, or `type` not matching `^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$` (≤ 64 chars) → **dropped**;
  - `id`: a UUID → used as the row id (lower-cased) so a retried batch stores each event once (`INSERT … ON
    CONFLICT DO NOTHING`); otherwise the server generates one;
  - `occurred_at`: ISO string within [now − 7 days, now + 5 min] → kept, else `null`;
  - `request_id`: `parseRequestId` (the client's id of the request the event is about), else `null`;
  - `props`: a plain object (else `{}`); top-level keys matching `/token|password|secret|authorization|cookie|email/i`
    and `__proto__` are removed; props that can't be serialized or that jsonb can't store (`\u0000`, a lone
    surrogate) become `{ "props_invalid": true }`; props over 2,048 UTF-8 bytes become `{ "props_too_large": true }`;
  - unknown event fields are ignored.
  Server-set on every row: `created_at` (server clock), `source = "client"`, `member_id` (**only** the verified
  token's member — never the body), `platform` (`X-App-Platform`, else the UA hint), `app_version`, `app_build`.
  One `bulkCreate` per batch.
- **Per-client limiter** (`utils/rateLimit.js`): fixed 60 s window, 30 requests per `clientKey(req.ip)` (IPv4 as-is;
  IPv6 by /64), process memory (one Render instance; a deploy resets it), key map bounded at 10,000 — when full and
  nothing has expired, new keys get 429 (fail closed).
- **Global daily event budget** (`clientEventService`): ≤ 10,000 stored events per 24 h window across all clients
  (bounds storage at ~10k rows/day even under a distributed flood); over it → 429 + `Retry-After` until the
  window resets. Raising it is a one-constant PATCH.
- **Router-local body-parser error handler** keeps the real 413 / 400 / 415 (the global `errorHandler` turns every
  non-`AppError` into 500 — unchanged for every other route, §10 F2).

## 5. Data / schema

**`app_events`** — `apps/backend/sql/007_app_events.sql` (user-run; the first **schema-neutral** migration,
DESIGN_BOARD §8). Model `models/AppEvent.js` (no associations → not registered in `models/index.js`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | client-supplied event UUID (idempotency) or `gen_random_uuid()` / Sequelize UUIDV4 |
| `created_at` | `timestamptz NOT NULL` | server receive time — the retention + query axis |
| `occurred_at` | `timestamptz` | client-reported time, clamped (§4) |
| `source` | `varchar(16) NOT NULL` | `'client'` (this endpoint) · `'server'` (Phase 3 R1 auth events); CHECK |
| `type` | `varchar(64) NOT NULL` | dotted event name, e.g. `auth.forced_sign_out` |
| `member_id` | `uuid` | FK → `members(id)` **ON DELETE CASCADE** |
| `platform` | `varchar(16)` | `ios` / `android` / `web` / `null` |
| `app_version` | `varchar(32)` | `X-App-Version` |
| `app_build` | `integer` | `X-App-Build` (Android `versionCode` / iOS `CFBundleVersion`) |
| `request_id` | `varchar(64)` | the request the event is about |
| `props` | `jsonb NOT NULL DEFAULT '{}'` | event details (≤ 2 KB) |

Indexes: `idx_app_events_created_at (created_at)`, `idx_app_events_member_id_created_at (member_id, created_at)`.
**RLS** enabled on the `public` copy only, no policies — the posture of the project's other 14 tables. A
`staging` copy stays RLS-free so the staging role can write it. **Retention:** `pg_cron` job
`app_events_retention_<schema>`, daily 04:17 UTC, `DELETE … WHERE created_at < now() - interval '90 days'`.

## 6. Flags / env / ops

- **`DB_LOG_SQL`** — `"true"` re-enables Sequelize SQL logging (`console.log`); unset / anything else = off (prod).
  Local debugging only. Not keyed on `NODE_ENV` (unset on Render); not in `render.yaml`.
- **`trust proxy` = 1** (`server.js`) — one proxy hop (Render's edge), so `req.ip` (the limiter key) is the client.
  Verified after deploy from `xff_n` (D-C7).
- **CORS** (`server.js`): `maxAge: 7200`, `exposedHeaders: ["Retry-After", "X-Request-Id"]`.
- **Finding a request:** Render log explorer, text `"request_id":"<id>"` (or `"route":"/api/…"`). Request lines
  live 7 days (Render plan); `app_events` rows live 90 days.
- No new npm dependency (`crypto.randomUUID` and `net` are built in).

## 7. Dependencies + rollout

- **Upstream:** `auth` (`optionalAuthenticate` → `resolveReqUser`); `members` (FK target); the header names from
  `app-config` D-C6 (documentation only — no code import either way).
- **Downstream:** Phase 3 web / iOS / Android senders (`consumed_by` grows then); R1 writes `source = 'server'`
  auth events; R3 adds `push_deliveries` (own table).
- **Order:** the user runs `sql/007` **before** the backend deploy (otherwise `POST /api/client-events` → 500).
- **Live binaries** (iOS 1.4.0–1.4.2, Android 1.0.0 (3)/(4)): additive only — new response headers, a new route no
  binary calls, SQL logging invisible; every existing status and body is unchanged.

## 8. Contract for the Phase 3 senders (web / iOS / Android — not built yet)

- Send the app-config D-C6 headers (`X-App-Platform`, `X-App-Version`, `X-App-Build`) on every API call and a fresh
  UUID `X-Request-Id` per request (quote it as an event's `request_id` in a `client.error` event).
- Give every event a client-generated UUID `id` when it is queued, and keep it across retries (duplicates are
  stored once).
- Queue events locally; the queue **survives sign-out**; POST batches of **≤ 25** events with the current Bearer
  when one exists (none is fine). Keep each event's `props` ≤ 2 KB of UTF-8 JSON.
- On 429 wait `Retry-After`. On 413 split the batch in half and retry (drop a single event that still 413s).
  On 400 drop the batch (it will never succeed). On 5xx / network error retry with backoff.
- `props` never carries tokens, emails, usernames or free text the user typed.
- Event `type`s are registered here when the senders land (board §7.2 families: `auth.*`, `sync.*`, `client.error`).
  Web sends `fetch` with `application/json` (a `text/plain` `sendBeacon` body is not parsed).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Structured request log** — one JSON line per request (fields §3.1), written once on `finish` or `close`; route template, never the URL/query (the SSE `?token=`); 499 for pre-header client aborts; health checks skipped, preflights logged (mounted before `cors`, above app-config). Request id: inbound `X-Request-Id` kept when well-formed, else a UUID; `req.id`; echoed. `country` included (`null` if Render's edge doesn't forward `CF-IPCountry`). Sink: stdout → Render app log. | DESIGN_BOARD §7.1; W6 §7.1; `middleware/requestLog.js`. |
| **D-C2** | **SQL logging off ✅** — `logging: process.env.DB_LOG_SQL === "true" ? console.log : false`. Opt-in env, not `NODE_ENV` (unset on Render). | DESIGN_BOARD §7.1; W6 §1 (PII in SQL logs); `config/database.js`. |
| **D-C3** | **One parser for logs + storage** — `utils/clientInfo.js` parses the app-config D-C6 headers (allow-listed platform, charset-limited version, integer build), the request id, and a UA `platformHint` (live binaries send no headers). Read + log only. The header names are app-config's (single owner); app-config's gate checks presence itself and imports nothing from here. | DESIGN_BOARD §1 + §7.1; app-config D-C5/D-C6; W6 §8. |
| **D-C4** | **`POST /api/client-events`** — optional auth (`optionalAuthenticate`, auth D-C12; never 401/503); per-client limiter 30/60 s keyed by IPv4 address or IPv6 /64; global daily event budget 10,000 (storage bound — a per-minute global request cap would not bound storage); router-local 64 kb parser mounted before the global one and ahead of the version gate; ≤ 25 events, props ≤ 2 KB so a full batch fits the 64 kb cap; client event `id` → `ON CONFLICT DO NOTHING` (idempotent retries); jsonb-unsafe props replaced, never failing the batch; `member_id` only from the token; `202 {accepted, dropped}`; body-parser 4xx kept by a router-local handler. | DESIGN_BOARD §7.2 ("with or without a login, size-capped, rate-limited per IP"); CLAUDE.md (idempotent writes where retries exist); `routes/clientEvents.js`; `services/clientEventService.js`; `utils/rateLimit.js`. |
| **D-C5** | **`app_events` table** (§5) — uuid PK; `source` column now so Phase 3 R1 needs no migration; `app_build` so Android builds are distinguishable (`versionName` stayed `1.0.0` across codes 3/4/5); FK `ON DELETE CASCADE` (account deletion must not fail, and removes the member's trail — same as `member_push_tokens`); RLS on `public` only (matches every other public table; keeps the staging copy writable); schema-neutral migration `007`. | DESIGN_BOARD §7.2 + §8; Supabase security advisor (2026-10-12: 14/14 public tables RLS-on, no policies); `utils/programMemberships.js` `cascadeMemberDeletion`; RELEASES.md. |
| **D-C6** | **90-day retention via `pg_cron`** — `007` enables `pg_cron` (not enabled on the project as of 2026-10-12) and schedules `app_events_retention_<schema>` daily 04:17 UTC; re-running updates the job by name. | DESIGN_BOARD §7.2. |
| **D-C7** | **`trust proxy` = 1 hop** — needed for the per-client limiter (and Phase 3 R1's forwarded user IP); nothing else reads `req.ip` / `protocol` / `hostname` / `secure`. Too low → all clients share one bucket; too high → spoofable. Verified after deploy: a curl with no `X-Forwarded-For` must log `xff_n: 1`; if it logs k ≥ 2, the hop count becomes k. | DESIGN_BOARD §2 backend contract 3; `server.js`. |
| **D-C8** | **CORS preflight cache + exposed headers** — `maxAge: 7200` (Chrome caps at 2 h; repeat web opens skip the preflight); `exposedHeaders: ["Retry-After", "X-Request-Id"]` (**resolves auth F16**). Request headers stay reflected by `cors` (no `allowedHeaders` list, so the D-C6 headers need no change). | DESIGN_BOARD §7.5; auth SPEC §10 F16; `server.js`. |
| **D-C9** | **Deferred (not in 0.1.0):** an error `code` in the log line (needs every catch → W7 error vocabulary, Phase 3); client senders (Phase 3); server-side auth events (Phase 3 R1); `push_deliveries` (R3); the `tools/` query pack (§7.4); process `unhandledRejection` handlers; changing the global `errorHandler`'s 500 for malformed JSON on other routes. | Phase 2 track A scope (BRIEF §7). |
| **D-REF** | **NET-NEW**, no legacy reference. `consumed_by = []` until the Phase 3 senders; `depends_on = [auth]` (imports `optionalAuthenticate`). | — |

## 10. Flagged characteristics

| ID | Characteristic | Where | Follow-up? |
|----|----------------|-------|-----------|
| **F1** | A route that hands an error to `next(err)` (e.g. analytics `requireProgramAccess` on a non-UUID id) is logged without its mount prefix — Express resets `req.baseUrl` as the error leaves the router. | `middleware/requestLog.js` `routeTemplate` | Accepted (rare 500 path). |
| **F2** | Malformed JSON on every OTHER route still answers 500 via the global `errorHandler` (pre-existing). | `middleware/errorHandler.js` | Phase 3 W7 (error vocabulary). |
| **F3** | Limits are per-process memory; a deploy resets them. Under a distributed flood the endpoint fails closed (429) until windows expire / the daily budget resets — telemetry goes dark, the rest of the API is unaffected. | `utils/rateLimit.js`, `clientEventService` | Revisit only if 429s on `/api/client-events` show up in the request log. |
| **F4** | `platform_hint` is coarse UA sniffing (iOS widget/extension share the app's CFNetwork UA). | `utils/clientInfo.js` | None — `platform` (header) is authoritative. |
| **F5** | `country` depends on Render's edge forwarding `CF-IPCountry`. | `middleware/requestLog.js` | Checked after deploy (changelog). |
| **F6** | Sensitive-key stripping in `props` is top-level only; a literal backslash-`u0000` text in props is a false positive for `props_invalid`. | `services/clientEventService.js` | Clients own §8's "no PII in props". |
| **F7** | **Pre-existing:** the global `errorHandler` prints body-parser errors with their raw `err.body`, so a malformed-JSON request body (e.g. a login with a password) reaches the Render log. | `middleware/errorHandler.js` | Yes — log `err.type`/`err.status` only for body-parser errors (status unchanged). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-12 | **NET-NEW feature (reliability-overhaul Phase 2 track A, board §7 W6).** Structured request log + `X-Request-Id` (`middleware/requestLog.js`, D-C1); SQL logging off unless `DB_LOG_SQL=true` (D-C2); one client-identity parser for the app-config D-C6 headers `utils/clientInfo.js` (D-C3); `POST /api/client-events` — optional auth, 30 req/min per client (IPv6 /64), 10k events/day global budget, 64 kb, ≤ 25 events, idempotent event ids (`routes/clientEvents.js`, `services/clientEventService.js`, `utils/rateLimit.js`, D-C4); `app_events` table (+ `app_build`) + RLS (public) + nightly 90-day `pg_cron` retention via schema-neutral `sql/007_app_events.sql` (D-C5/D-C6); `trust proxy` 1 (D-C7); CORS `maxAge` 7200 + `exposedHeaders` Retry-After / X-Request-Id (D-C8, resolves auth F16). Uses auth 0.11.0 `optionalAuthenticate`. Backend-only, additive for every live binary; `consumed_by = []` until Phase 3. |
````

D2. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md`**. Every edit is anchored by text.
- In L3, change `**Version:** 0.10.0` to `**Version:** 0.11.0`.
- Directly after the row beginning ``| `authenticateStream` | `95-116` |``, insert this row (use E-step-7's actual range if it differs):
  `| `optionalAuthenticate` | `222-241` | **NET-NEW (0.11.0, D-C12).** Header bearer only; on success sets `req.user` / `req.authUserId` exactly like `authenticateToken`; **never rejects** — no token, a bad token, an unknown member or an infrastructure failure all continue signed-out. Mounted only on `POST /api/client-events` ([`observability`](../observability/SPEC.md) D-C4). |`
- In the §8 bullet that ends `` `program-memberships`, `invites`, and `notifications` features' tables.``, append: `` `observability` imports `optionalAuthenticate` (D-C12).``
- Directly after the row beginning `| **D-C11** |`, insert:
  `| **D-C12** | **Additive (0.11.0) — `optionalAuthenticate` + CORS exposes `Retry-After` (reliability-overhaul Phase 2 track A).** (a) New export `optionalAuthenticate` (`middleware/auth.js:222-241`): reads ONLY the `Authorization: Bearer` header (never `?token=`), runs the shared `resolveReqUser`, and on success sets `req.user` / `req.authUserId` exactly like `authenticateToken`; it **never rejects** — no token, a token fault, an unknown member, or an infrastructure failure (JWKS/network/TLS/DB) all continue signed-out with `req.user` unset (no 401, no 503, nothing logged). Mounted only on `POST /api/client-events` ([`observability`](../observability/SPEC.md) D-C4), whose sign-in-failure and forced-sign-out reports arrive precisely when the session is gone. (b) **Resolves F16:** `server.js`'s `cors()` gains `exposedHeaders: ["Retry-After", "X-Request-Id"]` (+ `maxAge: 7200`), so the cross-origin web app can read D-C11's `Retry-After` (observability D-C8). No existing middleware, route, status or body changes → **MINOR**, zero dependent re-version; live binaries unaffected (native clients ignore CORS). | DESIGN_BOARD §2 client contract 5 + §7.2; `middleware/auth.js`; `server.js`; observability SPEC D-C4/D-C8. |`
- In the F16 row, replace the last cell `Yes — Phase 3 prerequisite.` with:
  `**Resolved 0.11.0 (D-C12)** — `exposedHeaders: ["Retry-After", "X-Request-Id"]` in `server.js`'s CORS block ([`observability`](../observability/SPEC.md) D-C8).`
- Directly above the row beginning `| 0.10.0 | 2026-10-11 |`, insert:
  `| 0.11.0 | 2026-10-12 | **D-C12 — `optionalAuthenticate` + CORS `exposedHeaders` (reliability-overhaul Phase 2 track A).** New `optionalAuthenticate` export (`middleware/auth.js:222-241`): header bearer → `req.user` when valid; never rejects (any failure continues signed-out). Used only by `POST /api/client-events` ([`observability`](../observability/SPEC.md) 0.1.0). **F16 resolved:** `server.js` CORS now exposes `Retry-After` + `X-Request-Id` (and caches preflights 2 h). Additive → **MINOR**, zero dependent re-version; backend-only. |`

D3. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`**:
- Under `"auth"`, set `"version": "0.10.0"` → `"version": "0.11.0"`.
- Insert immediately before the line `    "apple-health": {`:
```json
    "observability": {
      "version": "0.1.0",
      "spec": "specs/features/observability/SPEC.md",
      "status": "built",
      "consumed_by": [],
      "depends_on": [
        "auth"
      ],
      "reference_impl": {
        "app": "backend",
        "paths": [
          "middleware/requestLog.js",
          "utils/clientInfo.js",
          "utils/rateLimit.js",
          "routes/clientEvents.js",
          "services/clientEventService.js",
          "models/AppEvent.js",
          "sql/007_app_events.sql",
          "config/database.js",
          "server.js"
        ]
      }
    },
```
- Validate with `python3 -I -c "import json;json.load(open('/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json'))"`.

D4. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`**:
- In the row beginning ``| `auth` |``, change `| 0.10.0 |` to `| 0.11.0 |`.
- Directly after the row beginning ``| `app-config` |`` (C's or the original), insert:
  `| `observability` | 0.1.0 | 🏗️ | — (none yet; `web` `ios` `android` senders in Phase 3) | `backend` (`middleware/requestLog.js`, `utils/{clientInfo,rateLimit}.js`, `routes/clientEvents.js`, `services/clientEventService.js`, `models/AppEvent.js`, `sql/007`, `config/database.js`, `server.js` [trust proxy · mount order · CORS]) | [observability/SPEC.md](observability/SPEC.md) |`
- On the line `Next features are authored as the backend rebuild proceeds — see `PROGRESS.md`._`, prefix the text with:
  `` `observability` (reliability-overhaul Phase 2 track A) is the first **net-new** infrastructure feature — the structured request log, client identity parsing and the `app_events` trail behind `POST /api/client-events`; backend-only (`consumed_by = []`) until Phase 3's client senders. ``
  Keep the rest of the line.

D5. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md`**:
- Insert immediately above the row beginning ``| `CORS_ALLOWED_ORIGINS` |``:
  `| `DB_LOG_SQL` | Sequelize SQL query logging | no | **NEW (observability D-C2, 2026-10-12)** — unset / anything but `"true"` = **off** (prod: leave unset). `"true"` prints every query to stdout — local debugging only (queries carry usernames, emails and push tokens as literals). Not keyed on `NODE_ENV` (unset on Render); not in `render.yaml`. |`
- Replace the row beginning ``| `CORS_ALLOWED_ORIGINS` |`` with:
  `| `CORS_ALLOWED_ORIGINS` | allowed browser origins for the web client | no | **Not read by the code** (doc fix 2026-10-12): the origins are hard-coded in `apps/backend/server.js`'s `cors()` block (`http://localhost:3000`, `https://rasi-fiters.vercel.app`, `https://rasifiters.com`, `https://www.rasifiters.com`); a new web origin is a backend code change + deploy. The same block sets `maxAge: 7200` + `exposedHeaders: ["Retry-After","X-Request-Id"]` (observability D-C8). iOS/Android are native (no CORS). |`
- Replace the two lines
  `> \`package.json\`. CORS for the web origin is enforced **server-side by the backend**` and
  `> (\`CORS_ALLOWED_ORIGINS\`), so add the new Vercel domain(s) there.`
  with:
```
> `package.json`. CORS for the web origin is enforced **server-side by the backend** — the origin list
> is hard-coded in `apps/backend/server.js`'s `cors()` block, so a new web domain is a backend code change + deploy.
```
- In the `**STAYS:**` paragraph, replace `` `CORS_ALLOWED_ORIGINS` (externalized but`` + newline + `same domains),` with `the CORS origin list (hard-coded in `server.js`,` + newline + `same domains),`.

D6 and D7 are steps 13 and 12 above, done by the implementer.

## Endgame

**E1. Compile and boot check (backend; the implementer runs it). Verified on a scratch copy; output matched.**
- Syntax:
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && for f in server.js config/database.js middleware/auth.js middleware/requestLog.js utils/clientInfo.js utils/rateLimit.js routes/clientEvents.js services/clientEventService.js models/AppEvent.js; do node --check "$f" || echo "FAIL $f"; done
```
- Boot (loads modules only; no server, no DB connection):
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder node -r dotenv/config -e '
const r=require("./routes/clientEvents");
for(const l of r.stack)console.log(l.route?`${Object.keys(l.route.methods)} ${l.route.path} ${l.route.stack.map(s=>s.name).join(",")}`:`use arity=${l.handle.length}`);
console.log(Object.keys(require("./middleware/auth")).sort().join(","));
const c=require("./utils/clientInfo");const f=(h)=>({get:(k)=>h[k.toLowerCase()]});
console.log(JSON.stringify(c.getClientInfo(f({"x-app-platform":" Android ","x-app-version":"1.5.0+60","x-app-build":" 60 ","user-agent":"okhttp/4.12.0"}))));
console.log(JSON.stringify(c.getClientInfo(f({"x-app-platform":"windows","x-app-build":"1.4","user-agent":"RaSi%20Fiters/56 CFNetwork/1568.100.1 Darwin/24.0.0"}))));
const R=require("./utils/rateLimit");const L=R.createFixedWindowLimiter({windowMs:1000,max:2,maxKeys:2});
console.log([L.hit("a",1,0).allowed,L.hit("a",1,0).allowed,L.hit("a",1,0).allowed,L.hit("b",1,0).allowed,L.hit("c",1,0).allowed,L.hit("c",1,2000).allowed].join(","));
const G=R.createFixedWindowLimiter({windowMs:1000,max:10,maxKeys:1});
console.log([G.hit("all",8,0).allowed,G.hit("all",3,0).allowed,G.hit("all",3,1500).allowed].join(","));
console.log(JSON.stringify(["2001:db8:a:b:1:2:3:4","2001:0db8:000a:b::9","2001:db8::1","::ffff:127.0.0.1","203.0.113.9",undefined].map(R.clientKey)));
const {normalizeProps:p}=require("./services/clientEventService");
console.log(JSON.stringify([p({a:1,access_token:"x",Email:"y"}),p({v:"a\u0000b"}),p({v:"\ud800"}),p({v:"ok \ud83d\ude00"}),p({pad:"é".repeat(1100)}),p([1]),p(JSON.parse("{\"__proto__\":{\"x\":1},\"k\":2}"))]));
console.log(require("./config/database").sequelize.options.logging);process.exit(0)'
```
- The output must be exactly these 10 lines:
```
post / <anonymous>,jsonParser,optionalAuthenticate,<anonymous>
use arity=4
authenticateStream,authenticateToken,canModifyLog,isAdmin,optionalAuthenticate,requireProgramAdmin,requireProgramMember
{"platform":"android","version":"1.5.0+60","build":60,"platformHint":"android"}
{"platform":null,"version":null,"build":null,"platformHint":"ios"}
true,true,false,true,false,true
true,false,true
["2001:db8:a:b::/64","2001:db8:a:b::/64","2001:db8:0:0::/64","::ffff:127.0.0.1","203.0.113.9","unknown"]
[{"a":1},{"props_invalid":true},{"props_invalid":true},{"v":"ok 😀"},{"props_too_large":true},{},{"k":2}]
false
```
- Web, Android and iOS are untouched: no `npm run build`, no `./gradlew :app:assembleDebug`, no xcode MCP build. **iOS compile and all live or visual checks are the USER's. This repo has no staging and no test suites; the user verifies on prod.**

**E2. Migration: the USER runs `apps/backend/sql/007_app_events.sql` BEFORE E3 and before the deploy.**
- How: Supabase SQL editor → paste the whole file → Run. The final `SELECT` returns one row (the cron job id).
- If any cron-section statement fails on permissions: enable it at Dashboard → Integrations → Cron (or Database → Extensions → `pg_cron`), then re-run the whole file. It is idempotent.
- The orchestrator then checks read-only (supabase-rasifiters MCP `execute_sql`):
```sql
select count(*) as cols from information_schema.columns where table_schema='public' and table_name='app_events';
select relrowsecurity from pg_class where oid='public.app_events'::regclass;
select confdeltype from pg_constraint where conname='app_events_member_id_fkey';
select jobname, schedule, command, active from cron.job where jobname='app_events_retention_public';
```
- Expected:
  - `11`
  - `true`
  - `c`
  - one row: `17 4 * * *` · `DELETE FROM public.app_events WHERE created_at < now() - interval '90 days'` · `true`.

**E3. Local smoke (Claude runs it). The local backend talks to the live DB; tokens come from the prod login.**
1. Preconditions: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.local` must not exist, and `DB_LOG_SQL` must be unset.
2. Start the server with `run_in_background`:
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder PORT=5061 node server.js > <scratchpad>/phase2a-server.log 2>&1
```
3. Wait in an until-loop for `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5061/` to return `200`.
4. Write the script below to `<scratchpad>/phase2a-smoke.sh`.
5. Run `LOG=<scratchpad>/phase2a-server.log TESTBED_PASSWORD=… bash <scratchpad>/phase2a-smoke.sh`. Never write the password to a file. It must end with `== 48 passed, 0 failed`.
6. Stop the server: `kill $(lsof -ti tcp:5061 -sTCP:LISTEN)`.

This script was dry-run against a stubbed scratch server. Every check passed except the 4 that need the real prod login.
```bash
#!/usr/bin/env bash
# Phase 2 track A smoke (observability). Prints PASS/FAIL only — never a token.
#   Local: LOG=<server log> TESTBED_PASSWORD=… bash phase2a-smoke.sh        (server on 127.0.0.1:5061)
#   Prod:  SMOKE_BASE=https://rasifiters-api.onrender.com/api TESTBED_PASSWORD=… bash phase2a-smoke.sh   (no LOG → log checks skipped)
# The access token ALWAYS comes from the PROD login: a local server runs with placeholder Supabase keys (it cannot
# proxy a sign-in) but verifies a prod-issued token through the public JWKS + the live DB.
set -uo pipefail
: "${TESTBED_PASSWORD:?set TESTBED_PASSWORD}"
A="${SMOKE_BASE:-http://127.0.0.1:5061/api}"; ROOT="${A%/api}"; LOGIN_BASE="${LOGIN_BASE:-https://rasifiters-api.onrender.com/api}"
LOG="${LOG:-}"; RUN=$(date +%s); echo "RUN=$RUN  (DB check: request_id LIKE 'phase2a-%-$RUN')"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1 — expected [$3] got [$2]"; FAIL=$((FAIL+1)); fi; }
req() { local u="$1"; shift; curl -s -m 20 -o "$T/body" -D "$T/hdr" -w '%{http_code}' "$@" "$u"; }
body() { jq -c . "$T/body" 2>/dev/null || cat "$T/body"; }
hdr() { grep -i "^$1:" "$T/hdr" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
logline() { sleep 0.3; grep -F "\"request_id\":\"$1\"" "$LOG" | tail -1; }
CE="$A/client-events"; J=(-H 'Content-Type: application/json')
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); EID=$(uuidgen | tr 'A-Z' 'a-z')
EV1=$(jq -nc --arg r "$RUN" --arg t "$NOW" '{events:[{type:"smoke.phase2a",occurred_at:$t,request_id:("phase2a-ev1-"+$r),props:{run:$r,case:"signed_out"}}]}')
EVB=$(jq -nc --arg r "$RUN" '{events:[{type:"smoke.phase2a",request_id:("phase2a-bearer-"+$r),props:{run:$r,case:"garbage_bearer"}}]}')
EV2=$(jq -nc --arg r "$RUN" '{events:[{type:"smoke.phase2a",request_id:("phase2a-ev2-"+$r),props:{run:$r,case:"signed_in",access_token:"x",email:"y@example.com"}}]}')
EVM=$(jq -nc --arg r "$RUN" '{events:[{type:"smoke.phase2a",request_id:("phase2a-mixed-"+$r)},{type:"Bad Type!"},"x"]}')
EVI=$(jq -nc --arg r "$RUN" --arg id "$EID" '{events:[{id:$id,type:"smoke.phase2a",request_id:("phase2a-idem-"+$r),props:{run:$r,case:"idempotent"}}]}')
EVN=$(jq -nc --arg r "$RUN" '{events:[{type:"smoke.phase2a",request_id:("phase2a-nul-"+$r),props:{run:$r,v:"a\u0000b"}}]}')

echo "== request id + CORS (base $A)"
s=$(req "$A/app-config" -H "X-Request-Id: phase2a-rid-$RUN" -H "Origin: https://rasifiters.com"); check "app-config → 200" "$s" "200"
check "X-Request-Id echoed" "$(hdr X-Request-Id)" "phase2a-rid-$RUN"
check "Expose-Headers" "$(hdr Access-Control-Expose-Headers)" "Retry-After,X-Request-Id"
ET=$(hdr ETag); s=$(req "$A/app-config" -H "If-None-Match: $ET"); check "ETag → 304 unchanged" "$s" "304"
req "$A/app-config" -H "X-Request-Id: bad id!" >/dev/null; check "bad inbound id → UUID" "$(hdr X-Request-Id | grep -Ec '^[0-9a-f-]{36}$')" "1"
s=$(req "$CE" -X OPTIONS -H "Origin: https://rasifiters.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type,x-app-platform,x-app-version,x-app-build,x-request-id")
check "preflight → 204" "$s" "204"; check "preflight Max-Age" "$(hdr Access-Control-Max-Age)" "7200"
s=$(req "$ROOT/" -H "X-Request-Id: phase2a-health-$RUN"); check "health → 200" "$s" "200"; check "health not instrumented" "$(hdr X-Request-Id)" ""
req "$A/app-config" -H "X-Request-Id: phase2a-xff0-$RUN" >/dev/null
req "$A/app-config" -H "X-Request-Id: phase2a-xff1-$RUN" -H "X-Forwarded-For: 203.0.113.9" >/dev/null

echo "== client-events"
s=$(req "$CE" -X POST "${J[@]}" -H "X-Request-Id: phase2a-ev1-$RUN" -H "X-App-Platform: Android" -H "X-App-Version: 1.5.0+60" -H "X-App-Build: 60" -d "$EV1")
check "signed-out event → 202" "$s" "202"; check "202 body" "$(body)" '{"accepted":1,"dropped":0}'
s=$(req "$CE" -X POST "${J[@]}" -H "Authorization: Bearer not.a.jwt" -d "$EVB"); check "garbage bearer → 202 (never 401)" "$s" "202"
L=$(curl -s -m 20 "${J[@]}" -X POST "$LOGIN_BASE/auth/login/app" -d "$(jq -nc --arg p "$TESTBED_PASSWORD" '{identifier:"mason.w",password:$p}')"); AT=$(jq -r '.token // empty' <<<"$L" 2>/dev/null)
check "login mason.w (prod)" "$([ -n "$AT" ] && echo yes || echo no)" "yes"
s=$(req "$CE" -X POST "${J[@]}" -H "Authorization: Bearer $AT" -H "X-Request-Id: phase2a-ev2-$RUN" -d "$EV2"); check "signed-in event → 202" "$s" "202"
s=$(req "$CE" -X POST "${J[@]}" -d "$EVM"); check "mixed batch" "$(body)" '{"accepted":1,"dropped":2}'
s=$(req "$CE" -X POST "${J[@]}" -d '{"events":[]}'); check "empty batch → 400" "$s" "400"; check "invalid_batch" "$(jq -r .code "$T/body")" "invalid_batch"
s=$(req "$CE" -X POST "${J[@]}" -d "$(jq -nc '{events:[range(26)|{type:"smoke.phase2a"}]}')"); check "26 events → 400" "$s" "400"
s=$(req "$CE" -X POST "${J[@]}" -d '{"events":'); check "malformed JSON → 400" "$s" "400"; check "invalid_body" "$(body)" '{"error":"Invalid request body.","code":"invalid_body"}'
head -c 70000 /dev/zero | tr '\0' 'a' | jq -Rc '{events:[{type:"smoke.phase2a",props:{pad:.}}]}' > "$T/big.json"
s=$(req "$CE" -X POST "${J[@]}" --data-binary @"$T/big.json"); check "> 64 kb → 413" "$s" "413"; check "payload_too_large" "$(jq -r .code "$T/body")" "payload_too_large"
s=$(req "$CE" -X POST "${J[@]}" -d "$EVI"); check "id'd event → 202" "$s" "202"
s=$(req "$CE" -X POST "${J[@]}" -d "$EVI"); check "replayed id → same 202 body" "$s $(body)" '202 {"accepted":1,"dropped":0}'
s=$(req "$CE" -X POST "${J[@]}" -d "$EVN"); check "NUL in props → 202 (props replaced)" "$s $(body)" '202 {"accepted":1,"dropped":0}'

if [ -n "$LOG" ]; then
  echo "== request log ($LOG)"
  l=$(logline "phase2a-ev1-$RUN")
  check "log route" "$(jq -r .route <<<"$l")" "/api/client-events"; check "log status" "$(jq -r .status <<<"$l")" "202"
  check "log platform" "$(jq -r .platform <<<"$l")" "android"; check "log version" "$(jq -r .version <<<"$l")" "1.5.0+60"
  check "log build" "$(jq -r .build <<<"$l")" "60"
  check "log member null (signed-out)" "$(jq -r .member_id <<<"$l")" "null"; check "log duration numeric" "$(jq -r '.duration_ms|type' <<<"$l")" "number"
  l=$(logline "phase2a-ev2-$RUN"); check "log member set (signed-in)" "$(jq -r '.member_id|test("^[0-9a-f-]{36}$")' <<<"$l")" "true"
  l=$(logline "phase2a-rid-$RUN"); check "log app-config route" "$(jq -r .route <<<"$l")" "/api/app-config"
  check "log xff_n 0 (no proxy)" "$(jq -r .xff_n <<<"$(logline "phase2a-xff0-$RUN")")" "0"
  check "log xff_n 1 (one spoofed entry)" "$(jq -r .xff_n <<<"$(logline "phase2a-xff1-$RUN")")" "1"
  check "log no health line" "$(grep -c "phase2a-health-$RUN" "$LOG")" "0"
  check "log preflight logged" "$(grep -c '"method":"OPTIONS"' "$LOG" | awk '{print ($1>0)?"yes":"no"}')" "yes"
  req "$A/notifications/stream?token=phase2a-secret-marker-$RUN" >/dev/null
  curl -s -m 2 -N -o /dev/null -D "$T/sse" -H "Authorization: Bearer $AT" -H "X-Request-Id: phase2a-sse-$RUN" "$A/notifications/stream"
  check "SSE carries X-Request-Id" "$(grep -i '^x-request-id:' "$T/sse" | cut -d' ' -f2 | tr -d '\r')" "phase2a-sse-$RUN"
  l=$(logline "phase2a-sse-$RUN"); check "log SSE route" "$(jq -r .route <<<"$l")" "/api/notifications/stream"
  check "log SSE status" "$(jq -r .status <<<"$l")" "200"; check "log SSE aborted on close" "$(jq -r .aborted <<<"$l")" "true"
  check "log ?token= never logged" "$(grep -c "phase2a-secret-marker" "$LOG")" "0"
  check "log no SQL lines" "$(grep -c 'Executing (default)' "$LOG")" "0"
  check "log request lines are JSON" "$(grep '"type":"request"' "$LOG" | jq -e . >/dev/null 2>&1 && echo yes || echo no)" "yes"
fi

echo "== rate limit (LAST — burns this client's window for 60 s)"
for i in $(seq 1 40); do s=$(req "$CE" -X POST "${J[@]}" -d '{}'); [ "$s" = "429" ] && break; done
check "per-client limit → 429" "$s" "429"; check "rate_limited" "$(jq -r .code "$T/body")" "rate_limited"
check "429 Retry-After present" "$([ -n "$(hdr Retry-After)" ] && echo yes || echo no)" "yes"
echo "== $PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
```
- Then the orchestrator runs a read-only DB check (MCP `execute_sql`), with `<RUN>` taken from the script's first line:
```sql
select request_id, source, member_id is not null as signed_in, platform, app_version, app_build, props, occurred_at is not null as has_occurred_at
from app_events where type='smoke.phase2a' and request_id like 'phase2a-%-<RUN>' order by created_at;
```
- Expect exactly **6 rows**, all with `source` = `client`:

| request_id | signed_in | platform | app_version | app_build | props | has_occurred_at |
|---|---|---|---|---|---|---|
| `phase2a-ev1-…` | false | `android` | `1.5.0+60` | `60` | `{run, case:"signed_out"}` | true |
| `phase2a-bearer-…` | false | null | null | null | as sent | false |
| `phase2a-ev2-…` | **true** | null | null | null | `{run, case:"signed_in"}`, with **no** `access_token`/`email` | false |
| `phase2a-mixed-…` | false | null | null | null | `{}` | false |
| `phase2a-idem-…` | false | null | null | null | `{run, case:"idempotent"}` — **one** row despite two POSTs | false |
| `phase2a-nul-…` | false | null | null | null | `{"props_invalid": true}` | false |

The rows age out after 90 days.

**E4. git-version (commit 1, after E1–E3 pass; the user confirms the bumps).**
- Stage exactly these 18 paths, never `git add -A`:
```
apps/backend/utils/clientInfo.js
apps/backend/middleware/requestLog.js
apps/backend/utils/rateLimit.js
apps/backend/models/AppEvent.js
apps/backend/services/clientEventService.js
apps/backend/routes/clientEvents.js
apps/backend/middleware/auth.js
apps/backend/config/database.js
apps/backend/server.js
apps/backend/.env.example
apps/backend/sql/007_app_events.sql
apps/backend/sql/README.md
apps/backend/CONTEXT.md
specs/features/observability/SPEC.md
specs/features/auth/SPEC.md
specs/features/registry.json
specs/features/REGISTRY.md
ENV_RUNBOOK.md
```
- Commit message: `feat(observability): request log, client-events + app_events, SQL logging off (Phase 2A)`.
- Tags: `feature/observability@v0.1.0` (new feature) and `feature/auth@v0.11.0` (MINOR: owned-interface addition plus F16).
- **Detection note:** `server.js` is in `reference_impl.paths` for 14 features plus observability. Only observability and auth bump.
  - The `server.js` hunks are observability-owned: trust proxy, the `requestLog` mount, the CORS options and the client-events mount.
  - They change no route, status or body of members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics or app-config. Those 13 get no bump.
- Blast radius:
  - **auth:** dependents are every feature that `depends_on` auth; apps are [web, ios, android]. This is an owned-interface addition, so the gate asks the user to acknowledge it. It is additive, with zero dependent re-version.
  - **observability:** a new node with `consumed_by: []`. FYI only.

**E5. Deploy (the USER confirms the push).**
- `git push origin main && git push origin feature/observability@v0.1.0 feature/auth@v0.11.0`.
- Render auto-deploys `rasifiters-api` (buildFilter `apps/backend/**`).
- Check with render MCP `list_deploys` (`workspaceId: tea-cv3u7a3tq21c73ald2ig`): the deploy must be `live` on the commit SHA, and `curl -s -o /dev/null -w '%{http_code}' https://rasifiters-api.onrender.com/` must return `200`.
- Rollback: `git revert --no-edit <sha> && git push origin main`. The `app_events` table can stay; it is additive and unused.

**E6. Prod smoke, proxy probe and user check.**
- Run `SMOKE_BASE=https://rasifiters-api.onrender.com/api TESTBED_PASSWORD=… bash <scratchpad>/phase2a-smoke.sh` (no `LOG`). It must end with `== 28 passed, 0 failed`.
- Single tolerated failure: if only `X-Request-Id echoed` fails, Render's edge rewrote the inbound id. Record it as F8 in E7; it is not a rollback trigger.
- Run the E3 DB query with the prod `RUN`: 6 rows, same shape.
- Use render MCP `list_logs` (same `workspaceId`, the `rasifiters-api` service, text filter `phase2a-`):
  - `phase2a-ev1-<RUN>` must show route `/api/client-events`, status 202, platform `android`, build 60.
  - Read `xff_n` on `phase2a-xff0-<RUN>`; call it k.
    - **k = 1:** correct; nothing to do.
    - **k ≥ 2:** follow-up commit changing `app.set("trust proxy", 1)` to `app.set("trust proxy", k)` in `server.js`, and update SPEC D-C7 and §6. This is observability **0.1.1 PATCH**.
    - **k = 0:** STOP and bring it to the user (the edge sends no XFF; the option is to key on `CF-Connecting-IP`).
  - `xff1` should be k+1 (the edge passes client XFF through) or k (it overwrites it). Both are safe; record which.
  - Note `country` on the `xff0` line. `null` means Render doesn't forward it; record as F5 status.
- Confirm there are no `Executing (default)` lines after the deploy time.
- Then the USER checks rasifiters.com, the live iOS app and the live Android app: Summary and Lifestyle load, and nobody is signed out.

**E7. Docs commit 2 (no bump, no tag).**
- Flip observability to deployed: `registry.json` `"status": "deployed"`; `REGISTRY.md` 🏗️ → 🚀; SPEC header `🚀 deployed`.
- Append a SPEC §11 row: `0.1.0 (deployed 🚀) | <date> | live; xff_n=<k>, client XFF <passed/overwritten>, country <seen/null>, X-Request-Id <echoed/rewritten>`.
- The orchestrator updates `HANDOFF.md`.
- The changed files are `.md`/`.json` outside the Render buildFilter, so this does not redeploy.

**git-version outcome**:
- `observability` **v0.1.0**: a new feature (owned routes, middleware, table).
- `auth` **v0.10.0 → v0.11.0**: MINOR; a pre-1.0 owned-interface addition plus F16. No dependent re-version.
- A conditional observability **v0.1.1** PATCH, only if E6 finds k ≠ 1.
- Expected tag order on `main`: C's `feature/app-config@v0.2.0`, then A's two tags, then B's (auth `0.12.0`, migrations 008+).

## Orchestrator items outside this fence (not for the implementer)

- **O1 (recommended follow-up, privacy):** F7.
  - The fix is a log-only change in `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/errorHandler.js`. Status stays 500, so this is PATCH-level once the fence is extended (owner: auth or a chore).
  - Replace `    console.error("Unhandled error:", err);` with:
```js
    // body-parser errors carry the raw request body (err.body) — may hold a password; log type + status only.
    if (err && typeof err.type === "string") console.error("Unhandled error: %s %s", err.type, err.status);
    else console.error("Unhandled error:", err);
```
- **O2:** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/skills/deploy/SKILL.md:80` still lists `CORS_ALLOWED_ORIGINS` as a settable env var. Change it to "the CORS origin list is hard-coded in `apps/backend/server.js`". Any `CORS_ALLOWED_ORIGINS` value on Render is inert; leave it.
- **O3:** amend C's D-C5 wording to cover the client-events exemption (see "Header contract and sequencing").
- **O4:** get the user's approval of `X-App-Build` at the plan gate (shared with C).

## Risks the implementer must watch

- **Shared files:** run the sequencing pre-check before steps 9-10. Apply every edit by its text anchor. Each anchor must match exactly once; if not, STOP.
- **Mount order is load-bearing:**
  - `requestLog` must come right after `const app = express();`, before `cors` and above app-config and C's gate, or preflights and 426s go unlogged.
  - `/api/client-events` must come before the global `express.json()`, or the 100 kb global parser runs first and the 64 kb cap and 413 mapping never apply.
  - The limiter must come before `express.json` inside the route, so floods are refused unparsed.
- **Never log** `req.originalUrl`, `req.url`, `req.query`, `req.ip`, `req.headers`, bodies or `err.body`. E3 checks that the SSE `?token=` never reaches stdout.
- **SSE:** `X-Request-Id` is set in `requestLog`, before `/stream`'s `flushHeaders()`. The SSE log line appears only when the client closes, with `aborted: true`; that is expected.
- **`optionalAuthenticate`:** `next()` stays outside the try/catch. It never sends a response. Header only.
- **Router-local error handler:** it must have exactly four parameters. Do not touch the global `errorHandler` (O1 is the orchestrator's).
- **Idempotency:** set `row.id` only for a valid UUID. Never set `id: null`, which would bypass the UUIDV4 default.
- **Daily budget:** it lives in process memory (one instance) and resets on deploy. Under a flood it fails closed (F3).
- **Model:** `AppEvent` is not registered in `models/index.js`, and nothing calls `sync()`. The table exists only through 007, which the user runs before E3 and the deploy.
- **Insert-failure logging:** log only `err.name` and `err.parent?.code`.
- **`trust proxy`:** nothing else reads `req.ip`, `protocol`, `hostname` or `secure` (grep-verified); add no reader in this track. Follow the E6 rule if k ≠ 1.
- **Size:** `middleware/auth.js` grows to 243 lines. That is accepted because the brief places `optionalAuthenticate` there, and the insertion at the end keeps the existing auth SPEC §4 anchors valid. `server.js` is about 127 lines before C's change.
- **Live binaries** (iOS 1.4.0–1.4.2, Android 1.0.0 (3)/(4)) see only extra response headers. Don't change any `res.status` or `json` outside the new route.
- **Migration 007 stays schema-neutral:** `public` appears only in the `current_schema()` check, and the cron command uses `format(%I)`. `cron.` is the extension's own schema.
- **Ports:** E3 uses 5061. C's smoke uses 5057/5058; never reuse those while C's smoke may be running.
