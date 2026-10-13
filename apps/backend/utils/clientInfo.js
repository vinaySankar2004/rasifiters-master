// Client identity from request headers — observability SPEC §4 (D-C3), which OWNS the header contract (names +
// meanings). Parsed ONCE here for LOGGING and STORAGE: the request log and the client-events ingest import these
// functions — never copy the parsing. Every value is allow-listed or charset-limited, so it is safe to log and to
// store. Nothing here gates a request: app-config's version gate (its D-C5/D-C6) checks header PRESENCE itself.
//   X-App-Platform  "ios" | "android" | "web" (trimmed, case-insensitive)          → platform, else null
//   X-App-Version   marketing version, ≤ 32 chars of [0-9A-Za-z .+_()-]            → version, else null
//   X-App-Build     build number (iOS CFBundleVersion / Android versionCode), 1–9 digits → build (integer), else null
//   User-Agent      okhttp → android · CFNetwork/Darwin → ios · Mozilla/ → web      → platformHint (live binaries
//                   send no X-App-* headers; coarse, never authoritative)
//   X-Request-Id    8–64 chars of [A-Za-z0-9._:-]                                   → parseRequestId, else null
//   X-Time-Zone     IANA zone (e.g. America/Vancouver), ≤ 64 chars of [A-Za-z0-9_+-/:] that Intl accepts → its canonical
//                   name (Intl's casing), else null. Read ONLY by the notifications routes (notifications' time-zone
//                   rule) — never logged, never part of getClientInfo.
const PLATFORMS = new Set(["ios", "android", "web"]);
const VERSION_RE = /^[0-9A-Za-z .+_()-]{1,32}$/;
const BUILD_RE = /^\d{1,9}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;
const TIME_ZONE_RE = /^[A-Za-z0-9_+\-/:]{1,64}$/;

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

const parseTimeZone = (raw) => {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (!TIME_ZONE_RE.test(value)) return null;
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    } catch (_err) {
        return null; // RangeError: not a zone this runtime knows
    }
};

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

module.exports = { getClientInfo, parsePlatform, parseVersion, parseBuild, parseRequestId, parseTimeZone, platformFromUserAgent };
