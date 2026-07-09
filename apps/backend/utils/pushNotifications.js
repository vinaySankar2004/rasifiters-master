// Native push — see specs/features/notifications/SPEC.md §3/§6.
// Two senders behind one entry point (sendPushToMembers): APNs for iOS device tokens (platform:'ios') and
// FCM for Android device tokens (platform:'android'). Both degrade to a logged no-op when their credentials
// are unset (getProvider()/getFcmApp() return null) — so SSE + DB delivery + the unacknowledged backfill work
// fully regardless. Invalid/expired tokens are pruned from member_push_tokens on delivery failure.
const apn = require("apn");
const admin = require("firebase-admin");
const { MemberPushToken } = require("../models");

// ---- APNs (iOS) ----

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

async function sendApnsPush(memberIds, payload) {
    const apnProvider = getProvider();
    if (!apnProvider) {
        console.warn("[push] APNs not configured; skipping iOS.");
        return;
    }

    const tokens = await MemberPushToken.findAll({
        where: { member_id: memberIds, platform: "ios" },
        attributes: ["id", "device_token"]
    });
    if (tokens.length === 0) return;

    const bundleId = process.env.APNS_BUNDLE_ID;
    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.sound = "default";
    note.alert = {
        title: payload.title || "Notification",
        body: payload.body || ""
    };
    note.topic = bundleId;
    note.payload = { notification_id: payload.id };

    const deviceTokens = tokens.map((t) => t.device_token);
    const results = await apnProvider.send(note, deviceTokens);

    if (results && results.sent && results.sent.length > 0) {
        console.log("[push] APNs sent to", results.sent.length, "device(s).");
    }
    if (results && results.failed && results.failed.length > 0) {
        const invalidTokens = new Set();
        for (const fail of results.failed) {
            const status = fail.status;
            const reason = fail.response?.reason;
            console.warn("[push] APNs delivery failed:", { status, reason, device: fail.device ? "(present)" : "(none)" });
            if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic") {
                if (fail.device) invalidTokens.add(fail.device);
            }
        }
        if (invalidTokens.size > 0) {
            await MemberPushToken.destroy({
                where: { device_token: Array.from(invalidTokens) }
            }).catch((err) => console.error("[push] Error removing invalid APNs tokens:", err));
        }
    }
}

// ---- FCM (Android) ----

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
        console.warn("[push] FIREBASE_SERVICE_ACCOUNT could not be parsed:", err.message);
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

async function sendFcmPush(memberIds, payload) {
    const app = getFcmApp();
    if (!app) {
        console.warn("[push] FCM not configured; skipping Android.");
        return;
    }

    const tokens = await MemberPushToken.findAll({
        where: { member_id: memberIds, platform: "android" },
        attributes: ["id", "device_token"]
    });
    if (tokens.length === 0) return;

    const deviceTokens = tokens.map((t) => t.device_token);
    const message = {
        notification: {
            title: payload.title || "Notification",
            body: payload.body || ""
        },
        // Data values must be strings. The client reads notification_id to acknowledge on tap.
        data: { notification_id: String(payload.id || "") },
        android: { priority: "high" }
    };

    let response;
    try {
        response = await admin.messaging(app).sendEachForMulticast({ ...message, tokens: deviceTokens });
    } catch (err) {
        console.error("[push] FCM send error:", err.message);
        return;
    }

    if (response.successCount > 0) {
        console.log("[push] FCM sent to", response.successCount, "device(s).");
    }
    if (response.failureCount > 0) {
        const invalidTokens = [];
        response.responses.forEach((r, i) => {
            if (r.success) return;
            const code = r.error?.code;
            console.warn("[push] FCM delivery failed:", { code, message: r.error?.message });
            if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token" ||
                code === "messaging/invalid-argument"
            ) {
                invalidTokens.push(deviceTokens[i]);
            }
        });
        if (invalidTokens.length > 0) {
            await MemberPushToken.destroy({
                where: { device_token: invalidTokens }
            }).catch((err) => console.error("[push] Error removing invalid FCM tokens:", err));
        }
    }
}

/**
 * Send push notifications to every registered device (iOS via APNs + Android via FCM) for the given member
 * IDs. Payload: { title, body, id (notification id) }. Each sender is independent + degrade-safe.
 * @param {string[]} memberIds
 * @param {{ title: string, body: string, id: string }} payload
 */
async function sendPushToMembers(memberIds, payload) {
    if (!memberIds || memberIds.length === 0) return;
    await Promise.all([
        sendApnsPush(memberIds, payload).catch((err) => console.error("[push] APNs error:", err)),
        sendFcmPush(memberIds, payload).catch((err) => console.error("[push] FCM error:", err))
    ]);
}

module.exports = {
    getProvider,
    getFcmApp,
    sendPushToMembers
};
