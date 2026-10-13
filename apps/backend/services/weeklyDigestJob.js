// Weekly digest (N8) — notifications SPEC §3.6 (the scheduler rule). Opt-in. Monday 09:00 local (≤ 120 min late, else
// that week is skipped), claimed per ISO week with the never-send-twice key, built from the member's own previous
// Monday–Sunday: workouts, active days, minutes, current streak (services/memberActivityStats.js), worded by the
// templates.
const NotificationSendKey = require("../models/NotificationSendKey");
const { listOptedIn } = require("./notificationPreferenceService");
const { getActivitySnapshots, getWeekStats } = require("./memberActivityStats");
const { getContentProvider } = require("../utils/notificationTemplates");
const { createNotification } = require("../utils/notifications");
const { localParts, addDaysToDate, isoWeekKey } = require("../utils/localTime");
const { logError } = require("../utils/logError");

const KIND = "digest.weekly";
const DIGEST_WEEKDAY = 1; // Monday
const DIGEST_START_MINUTES = 9 * 60; // 09:00 local
const DIGEST_LATE_WINDOW_MINUTES = 120;

const dueDigestMonday = (timeZone, now) => {
    const local = localParts(timeZone, now);
    if (!local || local.weekday !== DIGEST_WEEKDAY) return null;
    const lateBy = local.minutes - DIGEST_START_MINUTES;
    return lateBy >= 0 && lateBy < DIGEST_LATE_WINDOW_MINUTES ? local.date : null;
};

async function sendGroup(monday, entries, provider) {
    const memberIds = entries.map((entry) => entry.memberId);
    const [stats, snapshots] = await Promise.all([
        getWeekStats(memberIds, addDaysToDate(monday, -7), addDaysToDate(monday, -1)),
        getActivitySnapshots(entries.map((entry) => ({ memberId: entry.memberId, today: monday })))
    ]);
    let sent = 0;
    for (const entry of entries) {
        try {
            const week = stats.get(entry.memberId);
            const content = await provider.render(KIND, {
                first_name: entry.firstName,
                workouts: week.workouts,
                active_days: week.activeDays,
                minutes: week.minutes,
                streak: snapshots.get(entry.memberId)?.streak ?? 0
            }, `${entry.memberId}|${entry.periodKey}`);
            const notification = await createNotification({
                type: KIND,
                title: content.title,
                body: content.body,
                recipientIds: [entry.memberId]
            });
            if (notification) sent += 1;
        } catch (err) {
            logError("[scheduler] weekly digest send failed:", err);
        }
    }
    return sent;
}

async function runWeeklyDigests(now = new Date()) {
    const due = [];
    for (const row of await listOptedIn("digest")) {
        const monday = dueDigestMonday(row.time_zone, now);
        if (monday) due.push({ memberId: row.member_id, periodKey: isoWeekKey(monday), monday, firstName: row.first_name });
    }
    if (due.length === 0) return { claimed: 0, sent: 0 };
    const won = await NotificationSendKey.claim(KIND, due);
    const claimed = due.filter((entry) => won.has(`${entry.memberId}|${entry.periodKey}`));
    // Grouped by Monday: only members on opposite sides of the date line can differ (almost always one group).
    const byMonday = new Map();
    for (const entry of claimed) {
        if (!byMonday.has(entry.monday)) byMonday.set(entry.monday, []);
        byMonday.get(entry.monday).push(entry);
    }
    const provider = getContentProvider();
    let sent = 0;
    for (const [monday, entries] of byMonday) sent += await sendGroup(monday, entries, provider);
    return { claimed: claimed.length, sent };
}

module.exports = { runWeeklyDigests, dueDigestMonday };
