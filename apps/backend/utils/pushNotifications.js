// Native push facade — specs/features/notifications/SPEC.md §3 + §3.2. sendPushToMembers is the ONE entry point (called
// by the push channel, utils/notificationChannels.js, after the notification commits):
//   1. one member_push_tokens query for every recipient, both platforms;
//   2. APNs (utils/push/apns.js) and FCM (utils/push/fcm.js) in parallel — 7-day lifetime, per-category thread/channel;
//   3. prune the tokens a provider declared dead (D-C14) — the 60-day unseen prune is pg_cron's (sql/010);
//   4. one push_deliveries row per attempt + one `no_device` row per recipient with no registered device (D-C15).
// Phase 4 (the per-device push rule): custom keys gain `category` + `target`; the replace key rides reminders + digest;
// an inbox-capable iPhone (supports_inbox) also gets aps.badge = its member's badge count — older apps never do (they
// never clear it). Fire-and-forget: never throws. getProvider / getFcmApp stay exported here (unchanged facade surface).
const { MemberPushToken } = require("../models");
const { getProvider, sendApns } = require("./push/apns");
const { getFcmApp, sendFcm } = require("./push/fcm");
const { recordDeliveries } = require("../services/pushDeliveryService");
const { getBadgeCounts } = require("../services/notificationInboxService");
const { categoryFor, targetFor, replaceKeyFor } = require("./notificationCategories");
const { logError } = require("./logError");

// APNs apns-expiration and FCM android.ttl (D-C13): 7 days (APNs was 1 h; FCM had none = its 4-week default).
const PUSH_TTL_SECONDS = 7 * 24 * 60 * 60;

// Custom keys on both platforms, all strings (FCM data values must be). Live binaries read only notification_id (+ type);
// category + target are additive (Phase 4) for the Phase 4 clients' routing. program_id is omitted when null.
const buildPushData = ({ id, type, programId }) => {
    const data = {
        notification_id: String(id || ""),
        type: String(type || ""),
        category: categoryFor(type),
        target: targetFor(type)
    };
    if (programId) data.program_id = String(programId);
    return data;
};

const pruneTokens = async (ids) => {
    if (ids.length === 0) return;
    try {
        await MemberPushToken.destroy({ where: { id: ids } });
    } catch (err) {
        logError("[push] token prune failed:", err);
    }
};

const attemptRow = (notificationId, { token, outcome, errorCode }) => ({
    notification_id: notificationId,
    member_id: token.member_id,
    push_token_id: token.id,
    platform: token.platform,
    outcome,
    error_code: errorCode ? String(errorCode).slice(0, 64) : null
});

const noDeviceRow = (notificationId, memberId) => ({
    notification_id: notificationId,
    member_id: memberId,
    push_token_id: null,
    platform: null,
    outcome: "no_device",
    error_code: null
});

// The per-device push rule: the badge rides only on inbox-capable iPhones; a failed count just omits it (the push
// still goes).
const withBadges = async (iosTokens) => {
    const memberIds = [...new Set(iosTokens.filter((t) => t.supports_inbox).map((t) => t.member_id))];
    if (memberIds.length === 0) return iosTokens;
    let counts;
    try {
        counts = await getBadgeCounts(memberIds);
    } catch (err) {
        logError("[push] badge count failed:", err);
        return iosTokens;
    }
    return iosTokens.map((t) =>
        (t.supports_inbox && counts.has(t.member_id) ? { ...t, badge: counts.get(t.member_id).badge } : t));
};

/**
 * Push one notification to every registered device of the given members (iOS via APNs + Android via FCM) and record
 * every attempt. Payload: { id (notification id), title, body, type, programId }.
 * @param {string[]} memberIds
 * @param {{ id: string, title: string, body: string, type?: string, programId?: string|null }} payload
 */
async function sendPushToMembers(memberIds, payload) {
    const recipients = Array.from(new Set((memberIds || []).filter(Boolean)));
    if (recipients.length === 0 || !payload?.id) return;
    try {
        const tokens = await MemberPushToken.findAll({
            where: { member_id: recipients },
            attributes: ["id", "member_id", "device_token", "platform", "supports_inbox"],
            raw: true
        });
        const message = {
            title: payload.title || "Notification",
            body: payload.body || "",
            type: payload.type || "",
            category: categoryFor(payload.type),
            replaceKey: replaceKeyFor(payload.type),
            data: buildPushData(payload),
            ttlSeconds: PUSH_TTL_SECONDS
        };
        const iosTokens = await withBadges(tokens.filter((t) => t.platform === "ios"));
        const [apnsAttempts, fcmAttempts] = await Promise.all([
            sendApns(iosTokens, message),
            sendFcm(tokens.filter((t) => t.platform === "android"), message)
        ]);
        const attempts = [...apnsAttempts, ...fcmAttempts];
        await pruneTokens(attempts.filter((a) => a.outcome === "pruned").map((a) => a.token.id));

        const rows = attempts.map((attempt) => attemptRow(payload.id, attempt));
        const withDevice = new Set(tokens.map((t) => t.member_id));
        for (const memberId of recipients) {
            if (!withDevice.has(memberId)) rows.push(noDeviceRow(payload.id, memberId));
        }
        await recordDeliveries(rows);
    } catch (err) {
        logError("[push] sendPushToMembers failed:", err);
    }
}

module.exports = { getProvider, getFcmApp, sendPushToMembers, buildPushData, PUSH_TTL_SECONDS };
