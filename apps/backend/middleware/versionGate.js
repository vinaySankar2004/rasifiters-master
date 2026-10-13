// Version gate — owned by the app-config feature (specs/features/app-config/SPEC.md v0.2.0). No DB.
//   getAppConfig()          → the public GET /api/app-config body: a hard minimum + a soft-nudge version
//                             per platform, from env. Unset/malformed → null = nobody blocked or nudged
//                             (D-C3, D-C4). Clients compare + act; the server never 426s a versioned client.
//   blockUnversionedAndroid → the ONE server-side 426: header-less Android (1.0.0 builds send only
//                             `User-Agent: okhttp/x`, never X-App-Version), and only while
//                             BLOCK_UNVERSIONED_ANDROID=true (default off) (D-C5). Replies directly
//                             with `{ error, code: "update_required" }` — it never throws to errorHandler.js.
// process.env is read on every request (no module-level copy), but on Render it is fixed when the process
// starts — an env change takes effect only after a redeploy.

const UPDATE_REQUIRED_MESSAGE = "Please update RaSi Fiters from the Play Store";

// Never gated, even with the switch on: client telemetry ingest (observability, Phase 2 track A) must
// always land. Matched on method + full path, trailing slashes stripped + lower-cased (Express routing is
// non-strict + case-insensitive); entries stay lower-case.
const UNGATED_ROUTES = new Set(["POST /api/client-events"]);

// iOS marketing version ("1.4.2"): trimmed, dot-separated integers only — the format the iOS
// comparator parses — else null (D-C3).
function normalizeVersion(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return /^\d+(\.\d+)*$/.test(trimmed) ? trimmed : null;
}

// Android versionCode ("4"): trimmed, positive integer ≤ 2100000000 (Play's max versionCode), else null (D-C4).
function normalizeVersionCode(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const code = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(code) && code > 0 && code <= 2100000000 ? code : null;
}

function getAppConfig(env = process.env) {
    return {
        min_ios_version: normalizeVersion(env.MIN_IOS_VERSION),
        latest_ios_version: normalizeVersion(env.LATEST_IOS_VERSION),
        min_android_version_code: normalizeVersionCode(env.MIN_ANDROID_VERSION_CODE),
        latest_android_version_code: normalizeVersionCode(env.LATEST_ANDROID_VERSION_CODE)
    };
}

function isBlockingUnversionedAndroid(env = process.env) {
    const raw = env.BLOCK_UNVERSIONED_ANDROID;
    return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

function blockUnversionedAndroid(req, res, next) {
    if (!isBlockingUnversionedAndroid()) return next();
    const routeKey = `${req.method} ${(req.baseUrl + req.path).replace(/\/+$/, "").toLowerCase()}`;
    if (UNGATED_ROUTES.has(routeKey)) return next();
    const unversioned = !req.get("X-App-Version");
    const okhttp = /^okhttp\//i.test(req.get("User-Agent") || "");
    if (unversioned && okhttp) {
        return res.status(426).json({ error: UPDATE_REQUIRED_MESSAGE, code: "update_required" });
    }
    return next();
}

module.exports = { normalizeVersion, normalizeVersionCode, getAppConfig, blockUnversionedAndroid };
