const { Op, fn, col, literal } = require("sequelize");
const { DailyHealthLog, WorkoutLog, Member, Program, ProgramMembership, ProgramWorkout } = require("../models");
const { AppError } = require("../utils/response");
const { getPeriodRange } = require("../utils/dateRange");
const { activeMembershipInclude, percentChange, buildMTDDateRanges } = require("../utils/queryHelpers");

const toUTCDate = (isoDate) => {
    if (!isoDate) return null;
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};

const diffDays = (start, end) => Math.floor((end - start) / 86400000);

const toISODate = (d) => d.toISOString().slice(0, 10);

const bucketKey = (date, granularity) => {
    if (granularity === "day") return toISODate(date);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const bucketLabel = (key, granularity, labelMode = "weekday") => {
    // D-C4: format date labels in explicit UTC (legacy omitted timeZone → server-local TZ).
    if (granularity === "day") {
        const d = new Date(key + "T00:00:00Z");
        if (labelMode === "monthday") return String(d.getUTCDate());
        return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
    }
    const [year, month] = key.split("-");
    return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
};

const buildBuckets = (startISO, endISO, granularity, labelMode = "weekday") => {
    const buckets = new Map();
    const start = new Date(startISO + "T00:00:00Z");
    const end = new Date(endISO + "T00:00:00Z");
    const cursor = new Date(start);

    while (cursor <= end) {
        const key = bucketKey(cursor, granularity);
        if (!buckets.has(key)) {
            buckets.set(key, {
                date: key,
                label: bucketLabel(key, granularity, labelMode),
                workouts: 0,
                members: new Set()
            });
        }
        if (granularity === "day") {
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        } else {
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
    }
    return buckets;
};

const resolveTimelineWindow = async (period, programId) => {
    const today = new Date();
    let start = new Date(today);
    let end = new Date(today);
    let granularity = "day";
    let label = "";
    let labelMode = "weekday";

    if (period === "week") {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setUTCDate(today.getUTCDate() - 6);
        start = sevenDaysAgo;
        end = today;
        granularity = "day";
        labelMode = "weekday";
        label = "Last 7 Days";
    } else if (period === "month") {
        start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
        granularity = "day";
        labelMode = "monthday";
        label = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(start);
    } else if (period === "year") {
        start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
        end = new Date(Date.UTC(today.getUTCFullYear(), 11, 31));
        granularity = "month";
        labelMode = "month";
        label = String(today.getUTCFullYear());
    } else if (period === "program") {
        const program = await Program.findOne({ where: { id: programId, is_deleted: false } });
        if (!program || !program.start_date || !program.end_date) {
            throw new Error("Program has no start/end date");
        }
        start = new Date(program.start_date + "T00:00:00Z");
        end = new Date(program.end_date + "T00:00:00Z");
        granularity = "month";
        labelMode = "month";
        label = `${new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(start)} – ${new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(end)}`;
    } else {
        throw new Error("Invalid period. Use week|month|year|program.");
    }

    return {
        windowStart: toISODate(start),
        windowEnd: toISODate(end),
        bucketGranularity: granularity,
        label,
        labelMode
    };
};

const dayDiff = (startISO, endISO) => {
    const s = new Date(startISO + "T00:00:00Z");
    const e = new Date(endISO + "T00:00:00Z");
    return Math.floor((e - s) / 86400000);
};

// ── V1 Analytics ──

async function getSummary(period, programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const { current, previous, label } = getPeriodRange(period);
    const currentWhere = { program_id: programId, log_date: { [Op.between]: [current.start, current.end] } };
    const previousWhere = { program_id: programId, log_date: { [Op.between]: [previous.start, previous.end] } };

    const program = await Program.findOne({
        where: { id: programId, is_deleted: false },
        attributes: ["id", "status", "start_date", "end_date"]
    });
    if (!program) throw new AppError(404, "Program not found.");

    const incl = activeMembershipInclude(programId);

    const [
        totalMembers, currentLogs, previousLogs,
        currentDuration, previousDuration,
        activeMembers, topPerformers, topWorkoutTypes, timeline
    ] = await Promise.all([
        ProgramMembership.count({ where: { program_id: programId, status: "active" } }),
        WorkoutLog.count({ where: currentWhere, include: [incl] }),
        WorkoutLog.count({ where: previousWhere, include: [incl] }),
        WorkoutLog.sum("duration", { where: currentWhere, include: [incl] }),
        WorkoutLog.sum("duration", { where: previousWhere, include: [incl] }),
        WorkoutLog.count({ where: currentWhere, distinct: true, col: "member_id", include: [incl] }),
        WorkoutLog.findAll({
            where: currentWhere,
            attributes: [
                [col("WorkoutLog.member_id"), "member_id"],
                [fn("COUNT", "*"), "workouts"],
                [fn("SUM", col("duration")), "totalDuration"]
            ],
            include: [incl, { model: Member, attributes: ["first_name", "last_name"] }],
            group: [col("WorkoutLog.member_id"), "Member.id", "Member.first_name", "Member.last_name"],
            order: [[literal("workouts"), "DESC"]],
            limit: 5
        }),
        WorkoutLog.findAll({
            where: currentWhere,
            attributes: [
                [col("ProgramWorkout.workout_name"), "workout_name"],
                [fn("COUNT", "*"), "sessions"],
                [fn("SUM", col("duration")), "duration"]
            ],
            include: [incl, { model: ProgramWorkout, attributes: [] }],
            group: ["ProgramWorkout.workout_name"],
            order: [[literal("sessions"), "DESC"]],
            limit: 8
        }),
        WorkoutLog.findAll({
            where: currentWhere,
            attributes: ["log_date", [fn("COUNT", "*"), "workouts"], [fn("SUM", col("duration")), "duration"]],
            include: [incl],
            group: ["log_date"],
            order: [["log_date", "ASC"]]
        })
    ]);

    const totalDurationCurrent = currentDuration || 0;
    const totalDurationPrevious = previousDuration || 0;
    const avgDuration = currentLogs > 0 ? Math.round(totalDurationCurrent / currentLogs) : 0;
    const avgDurationPrev = previousLogs > 0 ? Math.round(totalDurationPrevious / previousLogs) : 0;
    const atRiskMembers = Math.max(totalMembers - activeMembers, 0);

    const timelineSeries = timeline.map((row) => ({
        date: row.log_date,
        workouts: Number(row.get("workouts")),
        duration: Number(row.get("duration"))
    }));

    const distributionByDay = timelineSeries.reduce((acc, item) => {
        // D-C3: bucket the weekday in explicit UTC (legacy omitted timeZone → server-local TZ).
        const day = new Date(item.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
        if (!acc[day]) acc[day] = { workouts: 0, duration: 0 };
        acc[day].workouts += item.workouts;
        acc[day].duration += item.duration;
        return acc;
    }, {});

    const topPerformersFormatted = topPerformers.map((row) => ({
        member_id: row.get("member_id"),
        member_name: row.Member
            ? `${row.Member.first_name || ""} ${row.Member.last_name || ""}`.trim() || "Unknown"
            : "Unknown",
        workouts: Number(row.get("workouts")),
        total_duration: Number(row.get("totalDuration"))
    }));

    const topWorkoutTypesFormatted = topWorkoutTypes.map((row) => ({
        workout_name: row.get("workout_name"),
        sessions: Number(row.get("sessions")),
        duration: Number(row.get("duration"))
    }));

    const startDate = program.start_date ? toUTCDate(program.start_date) : null;
    const endDate = program.end_date ? toUTCDate(program.end_date) : null;
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    let totalDays = 0;
    let elapsedDays = 0;
    if (startDate && endDate && endDate > startDate) {
        totalDays = Math.max(diffDays(startDate, endDate), 0);
        if (todayUtc > startDate) {
            elapsedDays = Math.min(diffDays(startDate, todayUtc), totalDays);
        }
    }
    const remainingDays = Math.max(totalDays - elapsedDays, 0);
    const progressPercent = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;

    return {
        period: label,
        range: { current, previous },
        totals: {
            logs: currentLogs,
            logs_change_pct: percentChange(currentLogs, previousLogs),
            duration_minutes: totalDurationCurrent,
            duration_change_pct: percentChange(totalDurationCurrent, totalDurationPrevious),
            avg_duration_minutes: avgDuration,
            avg_duration_change_pct: percentChange(avgDuration, avgDurationPrev)
        },
        program_progress: {
            program_id: program.id,
            status: program.status,
            start_date: program.start_date,
            end_date: program.end_date,
            total_days: totalDays,
            elapsed_days: elapsedDays,
            remaining_days: remainingDays,
            progress_percent: progressPercent
        },
        members: { total: totalMembers, active: activeMembers, at_risk: atRiskMembers },
        timeline: timelineSeries,
        distribution_by_day: distributionByDay,
        top_performers: topPerformersFormatted,
        top_workout_types: topWorkoutTypesFormatted
    };
}

async function getTotalWorkoutsMTD(programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const mtd = buildMTDDateRanges();
    const incl = activeMembershipInclude(programId);

    const [currentCount, previousCount] = await Promise.all([
        WorkoutLog.count({ where: { program_id: programId, log_date: { [Op.between]: [mtd.current.start, mtd.current.end] } }, include: [incl] }),
        WorkoutLog.count({ where: { program_id: programId, log_date: { [Op.between]: [mtd.previous.start, mtd.previous.end] } }, include: [incl] })
    ]);

    return { total_workouts: currentCount, change_pct: percentChange(currentCount, previousCount) };
}

async function getTotalDurationMTD(programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const mtd = buildMTDDateRanges();
    const incl = activeMembershipInclude(programId);

    const [currentMinutes, prevMinutes] = await Promise.all([
        WorkoutLog.sum("duration", { where: { program_id: programId, log_date: { [Op.between]: [mtd.current.start, mtd.current.end] } }, include: [incl] }),
        WorkoutLog.sum("duration", { where: { program_id: programId, log_date: { [Op.between]: [mtd.previous.start, mtd.previous.end] } }, include: [incl] })
    ]);

    return { total_minutes: Number(currentMinutes || 0), change_pct: percentChange(Number(currentMinutes || 0), Number(prevMinutes || 0)) };
}

async function getAvgDurationMTD(programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const mtd = buildMTDDateRanges();
    const incl = activeMembershipInclude(programId);

    const [currentMinutes, currentSessions, prevMinutes, prevSessions] = await Promise.all([
        WorkoutLog.sum("duration", { where: { program_id: programId, log_date: { [Op.between]: [mtd.current.start, mtd.current.end] } }, include: [incl] }),
        WorkoutLog.count({ where: { program_id: programId, log_date: { [Op.between]: [mtd.current.start, mtd.current.end] } }, include: [incl] }),
        WorkoutLog.sum("duration", { where: { program_id: programId, log_date: { [Op.between]: [mtd.previous.start, mtd.previous.end] } }, include: [incl] }),
        WorkoutLog.count({ where: { program_id: programId, log_date: { [Op.between]: [mtd.previous.start, mtd.previous.end] } }, include: [incl] })
    ]);

    const currentAvg = currentSessions > 0 ? Math.round(Number(currentMinutes || 0) / currentSessions) : 0;
    const prevAvg = prevSessions > 0 ? Math.round(Number(prevMinutes || 0) / prevSessions) : 0;

    return { avg_minutes: currentAvg, change_pct: percentChange(currentAvg, prevAvg) };
}

async function getActivityTimeline(period, programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const { windowStart, windowEnd, bucketGranularity, label, labelMode } = await resolveTimelineWindow(period, programId);
    const incl = activeMembershipInclude(programId);

    const logs = await WorkoutLog.findAll({
        where: { program_id: programId, log_date: { [Op.between]: [windowStart, windowEnd] } },
        include: [incl],
        attributes: ["log_date", "member_id"]
    });

    const buckets = buildBuckets(windowStart, windowEnd, bucketGranularity, labelMode);
    for (const log of logs) {
        const key = bucketKey(new Date(log.log_date + "T00:00:00Z"), bucketGranularity);
        if (!buckets.has(key)) continue;
        const bucket = buckets.get(key);
        bucket.workouts += 1;
        bucket.members.add(String(log.member_id));
    }

    const points = Array.from(buckets.values()).map((b) => ({
        date: b.date, label: b.label, workouts: b.workouts, active_members: b.members.size
    }));

    const totalWorkouts = points.reduce((sum, p) => sum + p.workouts, 0);
    const totalDays = Math.max(1, dayDiff(windowStart, windowEnd) + 1);
    const dailyAverage = Number((totalWorkouts / totalDays).toFixed(1));

    return { mode: period, label, daily_average: dailyAverage, buckets: points };
}

async function getHealthTimeline(period, programId, memberId) {
    if (!programId) throw new AppError(400, "programId is required");

    const { windowStart, windowEnd, bucketGranularity, label, labelMode } = await resolveTimelineWindow(period, programId);
    const incl = activeMembershipInclude(programId);

    const whereClause = { program_id: programId, log_date: { [Op.between]: [windowStart, windowEnd] } };
    if (memberId) whereClause.member_id = memberId;

    const logs = await DailyHealthLog.findAll({
        where: whereClause,
        include: [incl],
        attributes: ["log_date", "sleep_hours", "food_quality"]
    });

    const buckets = buildBuckets(windowStart, windowEnd, bucketGranularity, labelMode);
    for (const bucket of buckets.values()) {
        bucket.sleep_sum = 0; bucket.sleep_count = 0;
        bucket.food_sum = 0; bucket.food_count = 0;
    }

    for (const log of logs) {
        const key = bucketKey(new Date(log.log_date + "T00:00:00Z"), bucketGranularity);
        if (!buckets.has(key)) continue;
        const bucket = buckets.get(key);
        if (log.sleep_hours !== null && log.sleep_hours !== undefined) {
            const v = Number(log.sleep_hours);
            if (Number.isFinite(v)) { bucket.sleep_sum += v; bucket.sleep_count += 1; }
        }
        if (log.food_quality !== null && log.food_quality !== undefined) {
            const v = Number(log.food_quality);
            if (Number.isFinite(v)) { bucket.food_sum += v; bucket.food_count += 1; }
        }
    }

    const round1 = (v) => Number(v.toFixed(1));
    let sleepAvgSum = 0, sleepAvgDays = 0, foodAvgSum = 0, foodAvgDays = 0;

    const points = Array.from(buckets.values()).map((b) => {
        const sleepAvg = b.sleep_count > 0 ? round1(b.sleep_sum / b.sleep_count) : 0;
        const foodAvg = b.food_count > 0 ? round1(b.food_sum / b.food_count) : 0;
        if (b.sleep_count > 0) { sleepAvgSum += sleepAvg; sleepAvgDays += 1; }
        if (b.food_count > 0) { foodAvgSum += foodAvg; foodAvgDays += 1; }
        return { date: b.date, label: b.label, sleep_hours: sleepAvg, food_quality: foodAvg };
    });

    return {
        mode: period, label,
        daily_average_sleep: sleepAvgDays > 0 ? round1(sleepAvgSum / sleepAvgDays) : 0,
        daily_average_food: foodAvgDays > 0 ? round1(foodAvgSum / foodAvgDays) : 0,
        buckets: points,
        start: windowStart,
        end: windowEnd
    };
}

async function getDistributionByDay(programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const incl = activeMembershipInclude(programId);
    const rows = await WorkoutLog.findAll({
        where: { program_id: programId },
        include: [incl],
        attributes: ["log_date", [fn("COUNT", "*"), "workouts"]],
        group: ["log_date"],
        order: [["log_date", "ASC"]]
    });

    const byDay = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
    for (const row of rows) {
        const count = Number(row.get("workouts")) || 0;
        // D-C3: bucket the weekday in explicit UTC (legacy omitted timeZone → server-local TZ).
        const day = new Date(row.log_date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
        if (byDay[day] !== undefined) byDay[day] += count;
    }
    return byDay;
}

async function getWorkoutTypes(programId, memberId, limit = 50) {
    if (!programId) throw new AppError(400, "programId is required");

    const incl = activeMembershipInclude(programId);
    const where = memberId ? { program_id: programId, member_id: memberId } : { program_id: programId };

    const rows = await WorkoutLog.findAll({
        where,
        attributes: [
            [col("ProgramWorkout.workout_name"), "workout_name"],
            [fn("COUNT", "*"), "sessions"],
            [fn("SUM", col("duration")), "duration"]
        ],
        include: [incl, { model: ProgramWorkout, attributes: [] }],
        group: ["ProgramWorkout.workout_name"],
        order: [[literal("sessions"), "DESC"]],
        limit: Number(limit)
    });

    return rows.map((row) => {
        const sessions = Number(row.get("sessions")) || 0;
        const totalDuration = Number(row.get("duration")) || 0;
        return {
            workout_name: row.get("workout_name"),
            sessions,
            total_duration: totalDuration,
            avg_duration_minutes: sessions > 0 ? Math.round(totalDuration / sessions) : 0
        };
    });
}

// ── V2 Analytics ──
// The v2 half of this service (analytics-v2 SPEC). Reuses the shared imports + queryHelpers above.
// NOTE (D-C2): legacy's getSummaryV2 / GET /api/analytics-v2/summary is dropped — both clients use the
// v1 summary (GET /api/analytics/summary). See analytics-v2 SPEC §7 D-C2. It was also the only v2 fn with
// date formatting, so the v2 half needs no UTC cleanup.

async function getParticipationMTDV2(programId) {
    if (!programId) throw new AppError(400, "programId is required");

    const mtd = buildMTDDateRanges();
    const incl = activeMembershipInclude(programId);

    const [totalMembers, activeCurrent, activePrev] = await Promise.all([
        ProgramMembership.count({ where: { program_id: programId, status: "active" } }),
        WorkoutLog.count({
            where: { program_id: programId, log_date: { [Op.between]: [mtd.current.start, mtd.current.end] } },
            distinct: true, col: "member_id", include: [incl]
        }),
        WorkoutLog.count({
            where: { program_id: programId, log_date: { [Op.between]: [mtd.previous.start, mtd.previous.end] } },
            distinct: true, col: "member_id", include: [incl]
        })
    ]);

    const currentPct = totalMembers > 0 ? Number(((activeCurrent / totalMembers) * 100).toFixed(1)) : 0;
    const prevPct = totalMembers > 0 ? Number(((activePrev / totalMembers) * 100).toFixed(1)) : 0;

    return {
        total_members: totalMembers,
        active_members: activeCurrent,
        participation_pct: currentPct,
        change_pct: percentChange(currentPct, prevPct)
    };
}

async function getWorkoutTypesTotal(programId, memberId) {
    if (!programId) throw new AppError(400, "programId is required");

    const where = memberId ? { program_id: programId, member_id: memberId } : { program_id: programId };
    const rows = await WorkoutLog.findAll({
        where,
        attributes: [[col("ProgramWorkout.workout_name"), "workout_name"]],
        include: [activeMembershipInclude(programId), { model: ProgramWorkout, attributes: [] }],
        group: ["ProgramWorkout.workout_name"]
    });

    return { total_types: rows.length };
}

async function getMostPopularWorkoutType(programId, memberId) {
    if (!programId) throw new AppError(400, "programId is required");

    const where = memberId ? { program_id: programId, member_id: memberId } : { program_id: programId };
    const rows = await WorkoutLog.findAll({
        where,
        attributes: [[col("ProgramWorkout.workout_name"), "workout_name"], [fn("COUNT", "*"), "sessions"]],
        include: [activeMembershipInclude(programId), { model: ProgramWorkout, attributes: [] }],
        group: ["ProgramWorkout.workout_name"],
        order: [[literal("sessions"), "DESC"]],
        limit: 1
    });

    const top = rows[0];
    return { workout_name: top?.get("workout_name") ?? null, sessions: Number(top?.get("sessions")) || 0 };
}

async function getLongestDurationWorkoutType(programId, memberId) {
    if (!programId) throw new AppError(400, "programId is required");

    const where = memberId ? { program_id: programId, member_id: memberId } : { program_id: programId };
    const rows = await WorkoutLog.findAll({
        where,
        attributes: [[col("ProgramWorkout.workout_name"), "workout_name"], [fn("AVG", col("duration")), "avg_duration"]],
        include: [activeMembershipInclude(programId), { model: ProgramWorkout, attributes: [] }],
        group: ["ProgramWorkout.workout_name"],
        order: [[literal("avg_duration"), "DESC"]],
        limit: 1
    });

    const longest = rows[0];
    return { workout_name: longest?.get("workout_name") ?? null, avg_minutes: Math.round(Number(longest?.get("avg_duration")) || 0) };
}

async function getHighestParticipationWorkoutType(programId, memberId) {
    if (!programId) throw new AppError(400, "programId is required");
    const incl = activeMembershipInclude(programId);

    if (memberId) {
        const rows = await WorkoutLog.findAll({
            where: { program_id: programId, member_id: memberId },
            attributes: [[col("ProgramWorkout.workout_name"), "workout_name"], [fn("COUNT", "*"), "sessions"]],
            include: [incl, { model: ProgramWorkout, attributes: [] }],
            group: ["ProgramWorkout.workout_name"],
            order: [[literal("sessions"), "DESC"]],
            limit: 1
        });

        const totalWorkouts = await WorkoutLog.count({
            where: { program_id: programId, member_id: memberId },
            include: [incl]
        });

        const top = rows[0];
        const sessions = Number(top?.get("sessions")) || 0;
        return {
            workout_name: top?.get("workout_name") ?? null,
            participants: sessions > 0 ? 1 : 0,
            participation_pct: totalWorkouts > 0 ? Number(((sessions / totalWorkouts) * 100).toFixed(1)) : 0,
            total_members: 1
        };
    }

    const [totalMembers, rows] = await Promise.all([
        ProgramMembership.count({ where: { program_id: programId, status: "active" } }),
        WorkoutLog.findAll({
            where: { program_id: programId },
            attributes: [
                [col("ProgramWorkout.workout_name"), "workout_name"],
                [fn("COUNT", literal('DISTINCT "WorkoutLog"."member_id"')), "participants"]
            ],
            include: [incl, { model: ProgramWorkout, attributes: [] }],
            group: ["ProgramWorkout.workout_name"],
            order: [[literal("participants"), "DESC"]],
            limit: 1
        })
    ]);

    const top = rows[0];
    const participants = Number(top?.get("participants")) || 0;
    return {
        workout_name: top?.get("workout_name") ?? null,
        participants,
        participation_pct: totalMembers > 0 ? Number(((participants / totalMembers) * 100).toFixed(1)) : 0,
        total_members: totalMembers
    };
}

module.exports = {
    getSummary,
    getTotalWorkoutsMTD,
    getTotalDurationMTD,
    getAvgDurationMTD,
    getActivityTimeline,
    getHealthTimeline,
    getDistributionByDay,
    getWorkoutTypes,
    getParticipationMTDV2,
    getWorkoutTypesTotal,
    getMostPopularWorkoutType,
    getLongestDurationWorkoutType,
    getHighestParticipationWorkoutType
};
