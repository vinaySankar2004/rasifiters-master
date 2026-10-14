// The notification scheduler — notifications SPEC §3.6 (D-N9, the scheduler rule). ONE in-process timer: every minute
// (the first tick 60 s after start) it runs the daily reminders, the weekly digests and the due announcements, in that
// order — every minute so a reminder lands within ~1 min of the member's chosen time. Each job's due window still
// reaches back (reminder / digest ≤ 120 min late, announcements any time after), so a restart or deploy catches up.
// Never-send-twice comes from the send key (models/NotificationSendKey.js), not from the timer — so a restart, a missed
// tick or the two instances of a Render deploy can never double-send. Per tick: one small query per job (+ one claim
// while a window is open); nothing heavy — retention is pg_cron (sql/011), not here. The timer is unref'd and stopped by
// server.js's shutdown(); a tick still running when the next fires is skipped (no overlap). One JSON log line per job
// that claimed or sent something.
const { runDailyReminders } = require("./dailyReminderJob");
const { runWeeklyDigests } = require("./weeklyDigestJob");
const { processDueAnnouncements } = require("./announcementDelivery");
const { logError } = require("../utils/logError");

const TICK_MS = 60 * 1000;
const JOB_TIMEOUT_MS = 5 * 60 * 1000;
const JOBS = [
    ["daily_reminder", runDailyReminders],
    ["weekly_digest", runWeeklyDigests],
    ["announcements", processDueAnnouncements]
];

let interval = null;
let running = false;

// A job that hangs (e.g. a query on a half-open connection) is given up on after JOB_TIMEOUT_MS so the next jobs and
// ticks still run. It can't be cancelled: if it finishes later, the send key still keeps every send at most once.
const withTimeout = (promise, ms) => {
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
        timer.unref();
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
        for (const [job, run] of JOBS) {
            const startedAt = Date.now();
            try {
                const result = await withTimeout(run(now), JOB_TIMEOUT_MS);
                if (result && (result.claimed > 0 || result.sent > 0)) {
                    console.log(JSON.stringify({ type: "scheduler", job, ...result, duration_ms: Date.now() - startedAt }));
                }
            } catch (err) {
                logError(`[scheduler] ${job} failed:`, err);
            }
        }
    } finally {
        running = false;
    }
}

function startNotificationScheduler() {
    if (interval) return;
    interval = setInterval(() => tick(), TICK_MS);
    interval.unref();
}

function stopNotificationScheduler() {
    clearInterval(interval);
    interval = null;
}

module.exports = { startNotificationScheduler, stopNotificationScheduler, tick, TICK_MS };
