// Announcement delivery — notifications SPEC §3.8 (the announcement rule). Runs right after a "now" announcement is
// created (startDelivery) and on every scheduler tick (processDueAnnouncements) for each announcement still scheduled /
// sending. A recipient is due when the mode is now, or when their local date + time (their zone, else the
// announcement's fallback = the sender's zone) has reached send_date + send_time. Each due recipient is CLAIMED with the
// never-send-twice key (kind "announcement", period = the announcement id) before the send, so the kick-off, a tick and
// a second instance can overlap safely. Status → "sent" once no active recipient is left unclaimed.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const NotificationAnnouncement = require("../models/NotificationAnnouncement");
const NotificationSendKey = require("../models/NotificationSendKey");
const { getTimeZones } = require("./notificationPreferenceService");
const { getActivitySnapshots } = require("./memberActivityStats");
const { findMergeFields, renderMergeFields } = require("../utils/notificationTemplates");
const { createNotification } = require("../utils/notifications");
const { localParts, toMinutes } = require("../utils/localTime");
const { logError } = require("../utils/logError");

const KIND = "announcement";
// The announcement rule: announcements reuse the legacy type app.broadcast (category announcements), so every live
// binary — no inbox — still shows them (its usual pop-up) instead of only a push banner most members can't receive.
const ANNOUNCEMENT_TYPE = "app.broadcast";

const OPEN_SQL = `
SELECT id, mode, to_char(send_date, 'YYYY-MM-DD') AS send_date, to_char(send_time, 'HH24:MI') AS send_time,
       fallback_time_zone, recipient_ids::text[] AS recipient_ids, title_template, body_template,
       target_program_id, sender_member_id
FROM notification_announcements
WHERE status IN ('scheduled', 'sending') AND (CAST(:id AS uuid) IS NULL OR id = CAST(:id AS uuid))
ORDER BY created_at ASC`;

const select = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const loadOpen = (id = null) => select(OPEN_SQL, { id });
const loadActiveMembers = (memberIds) => (memberIds.length === 0
    ? Promise.resolve([])
    : select("SELECT id, first_name FROM members WHERE id IN (:memberIds) AND status = 'active'", { memberIds }));
const programNameOf = async (programId) =>
    (programId ? (await select("SELECT name FROM programs WHERE id = :programId", { programId }))[0]?.name || null : null);

const isDue = (announcement, timeZone, now) => {
    if (announcement.mode === "now") return true;
    const local = localParts(timeZone, now);
    if (!local) return true; // an unusable zone: deliver rather than never
    if (local.date !== announcement.send_date) return local.date > announcement.send_date;
    return local.minutes >= toMinutes(announcement.send_time);
};

/** [{ memberId, firstName, title, body }] for the ACTIVE members among memberIds — merge fields filled per person. */
async function renderForRecipients(spec, memberIds, now = new Date()) {
    const members = await loadActiveMembers(memberIds);
    let snapshots = new Map();
    if (members.length > 0 && findMergeFields(`${spec.titleTemplate} ${spec.bodyTemplate}`).includes("streak")) {
        const zones = await getTimeZones(members.map((m) => m.id));
        snapshots = await getActivitySnapshots(members.map((m) => ({
            memberId: m.id,
            today: (localParts(zones.get(m.id) || spec.fallbackTimeZone, now) || localParts("UTC", now)).date
        })));
    }
    return members.map((m) => {
        const vars = {
            first_name: m.first_name,
            streak: snapshots.get(m.id)?.streak ?? 0,
            program_name: spec.programName || "your program"
        };
        return {
            memberId: m.id,
            firstName: m.first_name,
            title: renderMergeFields(spec.titleTemplate, vars),
            body: renderMergeFields(spec.bodyTemplate, vars)
        };
    });
}

async function sendTo(announcement, memberIds, now) {
    const spec = {
        titleTemplate: announcement.title_template,
        bodyTemplate: announcement.body_template,
        programName: await programNameOf(announcement.target_program_id),
        fallbackTimeZone: announcement.fallback_time_zone
    };
    const base = {
        type: ANNOUNCEMENT_TYPE,
        programId: announcement.target_program_id,
        actorMemberId: announcement.sender_member_id
    };
    if (findMergeFields(`${spec.titleTemplate} ${spec.bodyTemplate}`).length === 0) {
        // No merge fields: one shared notification for every due recipient.
        const notification = await createNotification({ ...base, title: spec.titleTemplate, body: spec.bodyTemplate, recipientIds: memberIds });
        return notification ? memberIds.length : 0;
    }
    let sent = 0;
    for (const item of await renderForRecipients(spec, memberIds, now)) {
        try {
            const notification = await createNotification({ ...base, title: item.title, body: item.body, recipientIds: [item.memberId] });
            if (notification) sent += 1;
        } catch (err) {
            logError("[announcements] send failed:", err);
        }
    }
    return sent;
}

async function processAnnouncement(announcement, now = new Date()) {
    const activeIds = (await loadActiveMembers(announcement.recipient_ids)).map((m) => m.id);
    const done = await NotificationSendKey.claimedMemberIds(KIND, announcement.id);
    const open = activeIds.filter((id) => !done.has(id));
    const zones = announcement.mode === "local" ? await getTimeZones(open) : new Map();
    const due = open.filter((id) => isDue(announcement, zones.get(id) || announcement.fallback_time_zone, now));
    const won = await NotificationSendKey.claim(KIND, due.map((memberId) => ({ memberId, periodKey: announcement.id })));
    const claimed = due.filter((id) => won.has(`${id}|${announcement.id}`));
    const sent = claimed.length > 0 ? await sendTo(announcement, claimed, now) : 0;
    const finished = claimed.length === open.length;
    if (claimed.length > 0 || finished) {
        await NotificationAnnouncement.update({
            status: finished ? "sent" : "sending",
            sent_count: sequelize.literal(`sent_count + ${Number(sent)}`),
            ...(finished ? { completed_at: new Date() } : {})
        }, { where: { id: announcement.id, status: ["scheduled", "sending"] } });
    }
    return { claimed: claimed.length, sent };
}

/** Scheduler job: every open announcement, oldest first. */
async function processDueAnnouncements(now = new Date()) {
    let claimed = 0;
    let sent = 0;
    for (const announcement of await loadOpen()) {
        try {
            const result = await processAnnouncement(announcement, now);
            claimed += result.claimed;
            sent += result.sent;
        } catch (err) {
            logError("[announcements] delivery failed:", err);
        }
    }
    return { claimed, sent };
}

/** Kick off a "now" announcement right after it is created (the next tick finishes anything this misses). */
function startDelivery(announcementId) {
    setImmediate(async () => {
        try {
            const [announcement] = await loadOpen(announcementId);
            if (announcement) await processAnnouncement(announcement);
        } catch (err) {
            logError("[announcements] delivery failed:", err);
        }
    });
}

module.exports = { processDueAnnouncements, startDelivery, renderForRecipients, ANNOUNCEMENT_TYPE };
