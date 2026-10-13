// The member's OWN workout activity for notification content — notifications SPEC §3.6 (the scheduler rule). Workouts
// only, across all programs (workout_logs): auto-synced sleep / steps never count, so a day with only synced steps still
// gets its reminder. Streak = consecutive local days with ≥ 1 workout, ending today if today has one, else yesterday; 0
// otherwise. Deliberately NOT memberAnalyticsService.computeStreaks (per program, never resets after a skipped day) —
// this number can differ from the app's streak cards (a known gap). Each function is ONE query for many members.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const { addDaysToDate } = require("../utils/localTime");

const STREAK_LOOKBACK_DAYS = 366;

const DAYS_SQL = `
SELECT member_id, to_char(log_date, 'YYYY-MM-DD') AS day
FROM workout_logs
WHERE member_id IN (:memberIds) AND log_date BETWEEN :fromDate AND :toDate
GROUP BY member_id, log_date`;

// The same workout logged to several programs on one day (multi-program logging) counts once, at its longest duration.
const WEEK_SQL = `
SELECT d.member_id, count(*)::int AS workouts, count(DISTINCT d.log_date)::int AS active_days,
       COALESCE(sum(d.duration), 0)::int AS minutes
FROM (
    SELECT wl.member_id, wl.log_date, lower(pw.workout_name) AS workout, max(wl.duration) AS duration
    FROM workout_logs wl
    JOIN program_workouts pw ON pw.id = wl.program_workout_id
    WHERE wl.member_id IN (:memberIds) AND wl.log_date BETWEEN :fromDate AND :toDate
    GROUP BY wl.member_id, wl.log_date, lower(pw.workout_name)
) d
GROUP BY d.member_id`;

/** Consecutive workout days ending today (when logged) or yesterday. `days` = Set of "YYYY-MM-DD". */
const currentStreak = (days, today) => {
    let cursor = days.has(today) ? today : addDaysToDate(today, -1);
    let streak = 0;
    while (days.has(cursor)) {
        streak += 1;
        cursor = addDaysToDate(cursor, -1);
    }
    return streak;
};

/** entries [{ memberId, today }] → Map memberId → { loggedToday, streak }. */
async function getActivitySnapshots(entries) {
    const snapshots = new Map();
    if (entries.length === 0) return snapshots;
    const todays = entries.map((entry) => entry.today).sort();
    const rows = await sequelize.query(DAYS_SQL, {
        replacements: {
            memberIds: [...new Set(entries.map((entry) => entry.memberId))],
            fromDate: addDaysToDate(todays[0], -STREAK_LOOKBACK_DAYS),
            toDate: todays[todays.length - 1]
        },
        type: QueryTypes.SELECT
    });
    const daysByMember = new Map();
    for (const row of rows) {
        if (!daysByMember.has(row.member_id)) daysByMember.set(row.member_id, new Set());
        daysByMember.get(row.member_id).add(row.day);
    }
    for (const { memberId, today } of entries) {
        const days = daysByMember.get(memberId) || new Set();
        snapshots.set(memberId, { loggedToday: days.has(today), streak: currentStreak(days, today) });
    }
    return snapshots;
}

/** Map memberId → { workouts, activeDays, minutes } for fromDate..toDate inclusive; members with none → zeros. */
async function getWeekStats(memberIds, fromDate, toDate) {
    const stats = new Map(memberIds.map((id) => [id, { workouts: 0, activeDays: 0, minutes: 0 }]));
    if (memberIds.length === 0) return stats;
    const rows = await sequelize.query(WEEK_SQL, {
        replacements: { memberIds, fromDate, toDate },
        type: QueryTypes.SELECT
    });
    for (const row of rows) {
        stats.set(row.member_id, { workouts: row.workouts, activeDays: row.active_days, minutes: row.minutes });
    }
    return stats;
}

module.exports = { getActivitySnapshots, getWeekStats, currentStreak, STREAK_LOOKBACK_DAYS };
