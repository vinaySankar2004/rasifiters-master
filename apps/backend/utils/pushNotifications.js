// APNs push — see specs/features/notifications/SPEC.md §3/§6 (D-C4: creds deferred).
// getProvider() returns null when APNS_* env is unset → sendPushToMembers warns + skips, so SSE + DB
// delivery work fully without APNs configured. When configured, sends the alert and prunes dead tokens.
const apn = require("apn");
const { MemberPushToken } = require("../models");

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

/**
 * Send push notifications to all iOS devices registered for the given member IDs.
 * Payload: { title, body, id (notification id) }.
 * Invalid/expired device tokens are removed from the DB.
 * @param {string[]} memberIds
 * @param {{ title: string, body: string, id: string }} payload
 */
async function sendPushToMembers(memberIds, payload) {
    if (!memberIds || memberIds.length === 0) return;
    const apnProvider = getProvider();
    if (!apnProvider) {
        console.warn("[push] APNs not configured; skipping.");
        return;
    }

    const tokens = await MemberPushToken.findAll({
        where: { member_id: memberIds, platform: "ios" },
        attributes: ["id", "device_token"]
    });
    if (tokens.length === 0) {
        console.warn("[push] No device tokens for", memberIds.length, "recipients.");
        return;
    }

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
        console.log("[push] Sent to", results.sent.length, "device(s).");
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
            }).catch((err) => console.error("[push] Error removing invalid tokens:", err));
        }
    }
}

module.exports = {
    getProvider,
    sendPushToMembers
};
