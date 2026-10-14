// Daily reminder (D-N7 / D-N8) — notifications SPEC §3.6 (the scheduler rule). Each scheduler tick: members who opted
// in (reminders on, zone known, active, in an active program) whose local reminder time passed less than
// REMINDER_LATE_WINDOW_MINUTES ago are CLAIMED (never-send-twice key, before anything else) for that local day AND that
// reminder time — period "2026-10-13T19:00" — so one time never fires twice a day, while a member who moves their time
// gets one reminder at the new time even after one went out today. A claimed member who logged no workout that local
// day gets ONE reminder — streak wording when the streak is ≥ 2. A member who already logged keeps the claim and gets
// nothing. Missing the whole window (deploy, sleeping staging) skips that reminder. Older date-only keys
// ("2026-10-13") are left to the 90-day retention. Never Time Sensitive (no interruption-level — utils/push/apns.js).
const NotificationSendKey = require("../models/NotificationSendKey");
const { listOptedIn } = require("./notificationPreferenceService");
const { getActivitySnapshots } = require("./memberActivityStats");
const { getContentProvider } = require("../utils/notificationTemplates");
const { createNotification } = require("../utils/notifications");
const { localParts, toMinutes, addDaysToDate } = require("../utils/localTime");
const { logError } = require("../utils/logError");

const KIND = "reminder.daily";
const REMINDER_LATE_WINDOW_MINUTES = 15; // catch-up after a restart; a time set further in the past waits until tomorrow

// The local day a reminder belongs to, or null outside the window (a window crossing midnight belongs to its first day).
const dueReminderDate = (timeZone, reminderTime, now) => {
    const local = localParts(timeZone, now);
    if (!local) return null;
    const start = toMinutes(reminderTime);
    const lateBy = (local.minutes - start + 1440) % 1440;
    if (lateBy >= REMINDER_LATE_WINDOW_MINUTES) return null;
    return local.minutes >= start ? local.date : addDaysToDate(local.date, -1);
};

// The never-send-twice period: the reminder's local day + the "HH:MM" it fired for (listOptedIn's to_char format).
const reminderPeriodKey = (day, reminderTime) => `${day}T${reminderTime}`;

async function runDailyReminders(now = new Date()) {
    const due = [];
    for (const row of await listOptedIn("reminders")) {
        const day = dueReminderDate(row.time_zone, row.reminder_time, now);
        if (!day) continue;
        const periodKey = reminderPeriodKey(day, row.reminder_time);
        due.push({ memberId: row.member_id, day, periodKey, firstName: row.first_name });
    }
    if (due.length === 0) return { claimed: 0, sent: 0 };
    const won = await NotificationSendKey.claim(KIND, due);
    const claimed = due.filter((entry) => won.has(`${entry.memberId}|${entry.periodKey}`));
    if (claimed.length === 0) return { claimed: 0, sent: 0 };

    const snapshots = await getActivitySnapshots(claimed.map((entry) => ({ memberId: entry.memberId, today: entry.day })));
    const provider = getContentProvider();
    let sent = 0;
    for (const entry of claimed) {
        const snapshot = snapshots.get(entry.memberId);
        if (!snapshot || snapshot.loggedToday) continue;
        try {
            const content = await provider.render(
                KIND,
                { first_name: entry.firstName, streak: snapshot.streak },
                `${entry.memberId}|${entry.periodKey}`
            );
            const notification = await createNotification({
                type: KIND,
                title: content.title,
                body: content.body,
                recipientIds: [entry.memberId]
            });
            if (notification) sent += 1;
        } catch (err) {
            logError("[scheduler] daily reminder send failed:", err);
        }
    }
    return { claimed: claimed.length, sent };
}

module.exports = { runDailyReminders, dueReminderDate, reminderPeriodKey, REMINDER_LATE_WINDOW_MINUTES };
