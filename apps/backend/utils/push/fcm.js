// FCM sender (Android) — notifications SPEC §3.2. getFcmApp() is the faithful lazy, named firebase-admin app from
// FIREBASE_SERVICE_ACCOUNT (null when unset/unparsable ⇒ every Android token records `not_configured`). Every message
// carries an explicit channel id + TTL (D-C13). Phase 4 (the per-device push rule): ONE message per token (sendEach) so
// each device gets its own channel — a category channel only when the installation registered as inbox-capable
// (Android 1.1.0 posts a foreground push on the message's channel id and a missing channel drops it) — and `tag`
// (replace, not stack) for reminders + digest. No notification_count: Android shows launcher dots itself (platform
// idiom). firebase-admin 12.x times each send out after 15 s. Prunes only on dead-token codes; `invalid-argument` is a
// payload bug — logged at error level, token kept (D-C14). Returns one attempt per token — { token, outcome, errorCode }
// — and never throws.
const admin = require("firebase-admin");
const { logError } = require("../logError");
const { androidChannelFor } = require("../notificationCategories");

// FCM v1 UNREGISTERED / NOT_FOUND map to registration-token-not-registered (firebase-admin lib/utils/error.js).
const DEAD_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token"
]);

let fcmApp = null;

// The service-account credential (Firebase console → Project settings → Service accounts → Generate new
// private key). Provided via FIREBASE_SERVICE_ACCOUNT (base64-encoded JSON preferred; raw JSON also
// accepted) — the secret stays out of git (render.yaml declares it sync:false). Returns null (⇒ FCM
// no-ops) when unset or unparsable — the APNs-deferral pattern, mirrored for Android.
function getFcmApp() {
    if (fcmApp) return fcmApp;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw || !raw.trim()) return null;

    let serviceAccount;
    try {
        const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
        serviceAccount = JSON.parse(text);
    } catch (err) {
        console.warn("[push] FIREBASE_SERVICE_ACCOUNT could not be parsed: %s", err.name); // never the message — JSON.parse quotes the input
        return null;
    }

    try {
        // A named app ("fcm") so this never collides with any other admin.initializeApp() call.
        fcmApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "fcm");
    } catch (err) {
        console.warn("[push] Firebase admin init failed:", err.message);
        return null;
    }
    return fcmApp;
}

const isDeadTokenCode = (code) => DEAD_TOKEN_CODES.has(code);

const buildMessage = (token, message) => {
    const notification = { channelId: androidChannelFor(message.type, token.supports_inbox === true) };
    if (message.replaceKey) notification.tag = message.replaceKey;
    return {
        token: token.device_token,
        // The notification block stays: Android 1.0.0 ignores data-only messages.
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
            priority: "high",
            ttl: message.ttlSeconds * 1000, // firebase-admin takes milliseconds
            notification
        }
    };
};

async function sendFcm(tokens, message) {
    if (tokens.length === 0) return [];
    const app = getFcmApp();
    if (!app) {
        console.warn("[push] FCM not configured; skipping Android.");
        return tokens.map((token) => ({ token, outcome: "not_configured", errorCode: null }));
    }

    let response;
    try {
        // sendEach takes ≤ 500 messages per call — the whole member base is far below it (same cap as the old multicast).
        response = await admin.messaging(app).sendEach(tokens.map((token) => buildMessage(token, message)));
    } catch (err) {
        logError("[push] FCM send error:", err);
        return tokens.map((token) => ({ token, outcome: "failed", errorCode: err.code || "send_error" }));
    }

    const attempts = response.responses.map((r, i) => {
        const token = tokens[i];
        if (r.success) return { token, outcome: "sent", errorCode: null };
        const code = r.error?.code || "unknown";
        if (code === "messaging/invalid-argument") {
            logError("[push] FCM invalid-argument — payload bug, token kept:", r.error);
        } else {
            console.warn("[push] FCM delivery failed: %s", code);
        }
        return { token, outcome: isDeadTokenCode(code) ? "pruned" : "failed", errorCode: code };
    });
    if (response.successCount > 0) {
        console.log("[push] FCM sent to", response.successCount, "device(s).");
    }
    return attempts;
}

module.exports = { getFcmApp, sendFcm, isDeadTokenCode };
