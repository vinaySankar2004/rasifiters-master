// APNs sender (iOS) — notifications SPEC §3.2 (0.4.0). getProvider() is the faithful lazy apn.Provider from the
// APNS_* env (null when unset ⇒ every iOS token records `not_configured`, the D-C4 pattern). apn 2.2.0 has no
// request timeout, so EACH token's send() is raced separately against APNS_SEND_TIMEOUT_MS (D-C14): apn's own
// send() is a Promise.all over its tokens, so one hung stream would otherwise fail — and mis-record — them all.
// Returns one attempt per token — { token, outcome: "sent" | "failed" | "pruned" | "not_configured", errorCode } —
// and never throws.
const apn = require("apn");
const { logError } = require("../logError");

const APNS_SEND_TIMEOUT_MS = 10000;
// Dead-token answers (D-C14). apn 2.2.0 (node-http2) reports :status as a STRING ("410"), so compare as strings —
// the pre-0.4.0 numeric `status === 410` never matched (Unregistered still caught those).
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

let provider = null;

function getProvider() {
    if (provider) return provider;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const bundleId = process.env.APNS_BUNDLE_ID;
    const keyPath = process.env.APNS_KEY_PATH;
    const keyContent = process.env.APNS_KEY;
    const explicitProduction = process.env.APNS_PRODUCTION;
    const production =
        explicitProduction !== undefined && explicitProduction !== ""
            ? process.env.APNS_PRODUCTION === "true"
            : process.env.NODE_ENV === "production";

    if (!keyId || !teamId || !bundleId) return null;
    const key = keyPath || (keyContent ? Buffer.from(keyContent, "base64") : null);
    if (!key) return null;

    const options = {
        token: {
            key,
            keyId,
            teamId
        },
        production
    };
    provider = new apn.Provider(options);
    return provider;
}

const isDeadToken = (failure) =>
    String(failure.status) === "410" || DEAD_TOKEN_REASONS.has(failure.response?.reason);

// Resolves the send's result, or null when it takes longer than `ms` (a late result is ignored).
const withTimeout = (promise, ms) => {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const buildNote = (message) => {
    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + message.ttlSeconds;
    note.sound = "default";
    note.alert = { title: message.title, body: message.body };
    note.topic = process.env.APNS_BUNDLE_ID;
    note.payload = message.data;
    return note;
};

// One token, one send, one timer. apn reports a single recipient in exactly one of `sent` / `failed`.
async function sendOne(apnProvider, note, token) {
    let result;
    try {
        result = await withTimeout(apnProvider.send(note, token.device_token), APNS_SEND_TIMEOUT_MS);
    } catch (err) {
        logError("[push] APNs send error:", err);
        return { token, outcome: "failed", errorCode: "send_error" };
    }
    if (!result) return { token, outcome: "failed", errorCode: "timeout" };

    const fail = (result.failed || [])[0];
    if (!fail) return { token, outcome: "sent", errorCode: null };
    const reason = fail.response?.reason || null;
    console.warn("[push] APNs delivery failed:", { status: fail.status || null, reason });
    return {
        token,
        outcome: isDeadToken(fail) ? "pruned" : "failed",
        errorCode: reason || (fail.status ? `status_${fail.status}` : "transport_error")
    };
}

async function sendApns(tokens, message) {
    if (tokens.length === 0) return [];
    // A malformed APNS_* value makes `new apn.Provider` throw synchronously; caught here so the facade still records
    // every attempt (Android included) and still prunes.
    let apnProvider;
    try {
        apnProvider = getProvider();
    } catch (err) {
        // Name only, not logError: a malformed-key message can echo key material.
        console.error("[push] APNs provider init failed: %s", err.name);
        return tokens.map((token) => ({ token, outcome: "failed", errorCode: "provider_error" }));
    }
    if (!apnProvider) {
        console.warn("[push] APNs not configured; skipping iOS.");
        return tokens.map((token) => ({ token, outcome: "not_configured", errorCode: null }));
    }

    const note = buildNote(message);
    const attempts = await Promise.all(tokens.map((token) => sendOne(apnProvider, note, token)));

    const timedOut = attempts.filter((a) => a.errorCode === "timeout").length;
    if (timedOut > 0) {
        console.warn("[push] APNs send timed out after %d ms for %d device(s).", APNS_SEND_TIMEOUT_MS, timedOut);
    }
    const sent = attempts.filter((a) => a.outcome === "sent").length;
    if (sent > 0) {
        console.log("[push] APNs sent to", sent, "device(s).");
    }
    return attempts;
}

module.exports = { getProvider, sendApns, isDeadToken };
