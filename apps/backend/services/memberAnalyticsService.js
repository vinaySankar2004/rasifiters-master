const { Op } = require("sequelize");
const { WorkoutLog, Member, Program, ProgramMembership, ProgramWorkout, DailyHealthLog } = require("../models");
const { AppError } = require("../utils/response");
const { resolveTimelineWindow, buildBuckets, bucketKey } = require("./analyticsService");

const ensureProgramAccess = async (userId, globalRole, programId) => {
    if (globalRole === "global_admin") return true;
    if (!userId) return false;
    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: userId, status: "active" }
    });
    return Boolean(membership);
};

// D-C3 — shared requester-access + target-enrolled prelude for the single-member routes
// (history / streaks / recent). Faithful: every 400/403/404 status + message preserved 1:1.
// getMemberMetrics keeps its own inline checks (different shape + 403 message).
const assertMemberAccess = async (programId, memberId, user) => {
    if (!programId || !memberId) throw new AppError(400, "programId and memberId are required.");
    const hasAccess = await ensureProgramAccess(user.id, user.global_role, programId);
    if (!hasAccess) throw new AppError(403, "Access denied. Active program membership required.");
    const targetMembership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: memberId, status: "active" }
    });
    if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");
};

const computeStreaks = (dateStrings) => {
    if (!dateStrings.length) return { current: 0, longest: 0 };
    const dates = dateStrings.map(d => new Date(`${d}T00:00:00Z`)).sort((a, b) => a - b);

    let longest = 1;
    let currentRun = 1;
    for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        if (diff === 1) { currentRun += 1; }
        else if (diff === 0) { /* same day */ }
        else { longest = Math.max(longest, currentRun); currentRun = 1; }
    }
    longest = Math.max(longest, currentRun);

    let current = 1;
    for (let i = dates.length - 1; i > 0; i--) {
        const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        if (diff === 1 || diff === 0) { current += 1; } else { break; }
    }
    return { current, longest };
};

const isInCurrentMonth = (dateString) => {
    const today = new Date();
    const d = new Date(`${dateString}T00:00:00Z`);
    return d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth();
};

const SORTABLE_FIELDS = new Set([
    "workouts", "total_duration", "avg_duration", "active_days",
    "workout_types", "current_streak", "longest_streak",
    "avg_sleep_hours", "avg_food_quality"
]);

const milestonesList = [3, 7, 14, 30, 60, 90];

async function getMemberMetrics({
    programId, search = "", sort = "workouts", direction = "desc",
    startDate, endDate, memberId,
    workoutsMin, workoutsMax, totalDurationMin, totalDurationMax,
    avgDurationMin, avgDurationMax, avgSleepHoursMin, avgSleepHoursMax,
    activeDaysMin, activeDaysMax, workoutTypesMin, workoutTypesMax,
    currentStreakMin, longestStreakMin, avgFoodQualityMin, avgFoodQualityMax
}, user) {
    if (!programId) throw new AppError(400, "programId is required");

    const hasAccess = await ensureProgramAccess(user.id, user.global_role, programId);
    if (!hasAccess) throw new AppError(403, "Access denied. Program membership required.");

    const sortField = SORTABLE_FIELDS.has(sort) ? sort : "workouts";
    const dir = direction === "asc" ? "asc" : "desc";

    const program = await Program.findOne({ where: { id: programId, is_deleted: false } });
    if (!program) throw new AppError(404, "Program not found.");

    const programStart = program.start_date ? new Date(`${program.start_date}T00:00:00Z`) : null;
    const today = new Date();

    let rangeStart = startDate ? new Date(`${startDate}T00:00:00Z`) : programStart || null;
    let rangeEnd = endDate ? new Date(`${endDate}T23:59:59Z`) : today;
    if (rangeStart && programStart && rangeStart < programStart) rangeStart = programStart;
    if (rangeEnd > today) rangeEnd = today;
    if (rangeStart && rangeEnd && rangeEnd < rangeStart) throw new AppError(400, "Invalid date range.");

    const memberWhere = memberId
        ? { program_id: programId, member_id: memberId, status: "active" }
        : { program_id: programId, status: "active" };
    const memberships = await ProgramMembership.findAll({
        where: memberWhere,
        include: [{ model: Member, attributes: ["id", "first_name", "last_name", "username"] }]
    });

    const memberIds = memberships.map(m => m.member_id);

    const logs = await WorkoutLog.findAll({
        where: {
            program_id: programId,
            member_id: { [Op.in]: memberIds },
            ...(rangeStart && rangeEnd ? {
                log_date: { [Op.between]: [rangeStart.toISOString().slice(0, 10), rangeEnd.toISOString().slice(0, 10)] }
            } : {})
        },
        attributes: ["member_id", "log_date", "duration", "program_workout_id"],
        include: [{ model: ProgramWorkout, attributes: ["workout_name"] }]
    });

    const healthLogs = memberIds.length ? await DailyHealthLog.findAll({
        where: {
            program_id: programId,
            member_id: { [Op.in]: memberIds },
            ...(rangeStart && rangeEnd ? {
                log_date: { [Op.between]: [rangeStart.toISOString().slice(0, 10), rangeEnd.toISOString().slice(0, 10)] }
            } : {})
        },
        attributes: ["member_id", "log_date", "sleep_hours", "food_quality"]
    }) : [];

    const metricsMap = new Map();
    for (const m of memberships) {
        const firstName = m.Member?.first_name || "";
        const lastName = m.Member?.last_name || "";
        metricsMap.set(m.member_id, {
            member_id: m.member_id,
            member_name: `${firstName} ${lastName}`.trim() || "Unknown",
            username: m.Member?.username || "",
            workouts: 0, total_duration: 0, avg_duration: 0,
            active_days: 0, workout_types: 0,
            current_streak: 0, longest_streak: 0,
            mtd_workouts: 0, total_hours: 0,
            favorite_workout: null,
            avg_sleep_hours: null, avg_food_quality: null
        });
    }

    const perMemberDates = new Map();
    const perMemberTypes = new Map();
    const perMemberTypeCounts = new Map();
    const perMemberSleepSum = new Map();
    const perMemberSleepCount = new Map();
    const perMemberFoodSum = new Map();
    const perMemberFoodCount = new Map();

    for (const log of logs) {
        const entry = metricsMap.get(log.member_id);
        if (!entry) continue;
        entry.workouts += 1;
        entry.total_duration += Number(log.duration || 0);
        if (isInCurrentMonth(log.log_date)) entry.mtd_workouts += 1;

        if (!perMemberDates.has(log.member_id)) perMemberDates.set(log.member_id, new Set());
        perMemberDates.get(log.member_id).add(log.log_date);

        const wName = log.ProgramWorkout?.workout_name || "";
        if (!perMemberTypes.has(log.member_id)) perMemberTypes.set(log.member_id, new Set());
        perMemberTypes.get(log.member_id).add(wName);

        if (!perMemberTypeCounts.has(log.member_id)) perMemberTypeCounts.set(log.member_id, new Map());
        const tmap = perMemberTypeCounts.get(log.member_id);
        tmap.set(wName, (tmap.get(wName) || 0) + 1);
    }

    for (const log of healthLogs) {
        if (log.sleep_hours !== null && log.sleep_hours !== undefined) {
            const v = Number(log.sleep_hours);
            if (Number.isFinite(v)) {
                perMemberSleepSum.set(log.member_id, (perMemberSleepSum.get(log.member_id) || 0) + v);
                perMemberSleepCount.set(log.member_id, (perMemberSleepCount.get(log.member_id) || 0) + 1);
            }
        }
        if (log.food_quality !== null && log.food_quality !== undefined) {
            const v = Number(log.food_quality);
            if (Number.isFinite(v)) {
                perMemberFoodSum.set(log.member_id, (perMemberFoodSum.get(log.member_id) || 0) + v);
                perMemberFoodCount.set(log.member_id, (perMemberFoodCount.get(log.member_id) || 0) + 1);
            }
        }
    }

    for (const [mid, entry] of metricsMap.entries()) {
        if (entry.workouts > 0) {
            entry.avg_duration = Math.round(entry.total_duration / entry.workouts);
            entry.total_hours = Math.round(entry.total_duration / 60);
        }
        const dateSet = perMemberDates.get(mid);
        entry.active_days = dateSet ? dateSet.size : 0;
        entry.workout_types = perMemberTypes.get(mid)?.size || 0;
        if (dateSet) {
            const { current, longest } = computeStreaks(Array.from(dateSet));
            entry.current_streak = current;
            entry.longest_streak = longest;
        }
        const tmap = perMemberTypeCounts.get(mid);
        if (tmap && tmap.size > 0) {
            let fav = "", max = -1;
            for (const [k, v] of tmap.entries()) { if (v > max) { max = v; fav = k; } }
            entry.favorite_workout = fav || null;
        }
        const sc = perMemberSleepCount.get(mid) || 0;
        if (sc > 0) entry.avg_sleep_hours = Math.round(((perMemberSleepSum.get(mid) || 0) / sc) * 10) / 10;
        const fc = perMemberFoodCount.get(mid) || 0;
        if (fc > 0) entry.avg_food_quality = Math.round((perMemberFoodSum.get(mid) || 0) / fc);
    }

    let result = Array.from(metricsMap.values());

    const searchTrim = search.trim().toLowerCase();
    if (searchTrim) {
        result = result.filter(r =>
            r.member_name.toLowerCase().includes(searchTrim) ||
            r.username.toLowerCase().includes(searchTrim)
        );
    }

    const num = (v) => (v !== undefined ? Number(v) : undefined);
    const filters = {
        workouts: [num(workoutsMin), num(workoutsMax)],
        total_duration: [num(totalDurationMin), num(totalDurationMax)],
        avg_duration: [num(avgDurationMin), num(avgDurationMax)],
        avg_sleep_hours: [num(avgSleepHoursMin), num(avgSleepHoursMax)],
        active_days: [num(activeDaysMin), num(activeDaysMax)],
        workout_types: [num(workoutTypesMin), num(workoutTypesMax)],
        current_streak: [num(currentStreakMin), undefined],
        longest_streak: [num(longestStreakMin), undefined],
        avg_food_quality: [num(avgFoodQualityMin), num(avgFoodQualityMax)]
    };

    result = result.filter(r => {
        const within = (value, min, max) => {
            if (min !== undefined && !Number.isNaN(min) && value < min) return false;
            if (max !== undefined && !Number.isNaN(max) && value > max) return false;
            return true;
        };
        return (
            within(r.workouts, filters.workouts[0], filters.workouts[1]) &&
            within(r.total_duration, filters.total_duration[0], filters.total_duration[1]) &&
            within(r.avg_duration, filters.avg_duration[0], filters.avg_duration[1]) &&
            within(r.avg_sleep_hours ?? 0, filters.avg_sleep_hours[0], filters.avg_sleep_hours[1]) &&
            within(r.active_days, filters.active_days[0], filters.active_days[1]) &&
            within(r.workout_types, filters.workout_types[0], filters.workout_types[1]) &&
            within(r.current_streak, filters.current_streak[0], filters.current_streak[1]) &&
            within(r.longest_streak, filters.longest_streak[0], filters.longest_streak[1]) &&
            within(r.avg_food_quality ?? 0, filters.avg_food_quality[0], filters.avg_food_quality[1])
        );
    });

    result.sort((a, b) => {
        const av = a[sortField] ?? 0;
        const bv = b[sortField] ?? 0;
        if (av === bv) return 0;
        return dir === "asc" ? av - bv : bv - av;
    });

    return {
        program_id: programId,
        total: metricsMap.size,
        filtered: result.length,
        sort: sortField,
        direction: dir,
        date_range: {
            start: rangeStart ? rangeStart.toISOString().slice(0, 10) : null,
            end: rangeEnd ? rangeEnd.toISOString().slice(0, 10) : null
        },
        members: result
    };
}

async function getMemberHistory({ programId, memberId, period = "week" }, user) {
    await assertMemberAccess(programId, memberId, user);

    const { windowStart, windowEnd, bucketGranularity, label, labelMode } = await resolveTimelineWindow(period.toLowerCase(), programId);

    const logs = await WorkoutLog.findAll({
        where: { program_id: programId, member_id: memberId, log_date: { [Op.between]: [windowStart, windowEnd] } },
        attributes: ["log_date"]
    });

    const buckets = buildBuckets(windowStart, windowEnd, bucketGranularity, labelMode);
    for (const log of logs) {
        const key = bucketKey(new Date(log.log_date + "T00:00:00Z"), bucketGranularity);
        if (!buckets.has(key)) continue;
        buckets.get(key).workouts += 1;
    }

    const points = Array.from(buckets.values()).map((b) => ({
        date: b.date, label: b.label, workouts: b.workouts
    }));

    const totalWorkouts = points.reduce((sum, p) => sum + p.workouts, 0);
    const totalDays = Math.max(1, Math.floor((new Date(windowEnd + "T00:00:00Z") - new Date(windowStart + "T00:00:00Z")) / 86400000) + 1);

    return {
        period: period.toLowerCase(),
        label,
        daily_average: Number((totalWorkouts / totalDays).toFixed(1)),
        buckets: points,
        start: windowStart,
        end: windowEnd
    };
}

async function getMemberStreaks({ programId, memberId }, user) {
    await assertMemberAccess(programId, memberId, user);

    const program = await Program.findOne({ where: { id: programId, is_deleted: false } });
    if (!program) throw new AppError(404, "Program not found.");

    // D-C4 — guard a null start_date (mirrors getMemberMetrics' guard); fall back to the epoch lower
    // bound so the [Op.between] stays valid and the streak window spans all of the member's logs.
    const start = program.start_date ? new Date(`${program.start_date}T00:00:00Z`) : new Date("1970-01-01T00:00:00Z");
    const today = new Date();

    const logs = await WorkoutLog.findAll({
        where: {
            program_id: programId,
            member_id: memberId,
            log_date: { [Op.between]: [start.toISOString().slice(0, 10), today.toISOString().slice(0, 10)] }
        },
        attributes: ["log_date"]
    });

    const dates = Array.from(new Set(logs.map(l => l.log_date)));
    const { current, longest } = computeStreaks(dates);

    return {
        currentStreakDays: current,
        longestStreakDays: longest,
        milestones: milestonesList.map(m => ({ dayValue: m, achieved: longest >= m || current >= m }))
    };
}

async function getMemberRecentWorkouts({
    programId, memberId, limit = 1000,
    startDate, endDate, sortBy = "date", sortDir = "desc",
    workoutType, minDuration, maxDuration
}, user) {
    await assertMemberAccess(programId, memberId, user);

    const whereClause = { program_id: programId, member_id: memberId };
    if (startDate || endDate) {
        whereClause.log_date = {};
        if (startDate) whereClause.log_date[Op.gte] = startDate;
        if (endDate) whereClause.log_date[Op.lte] = endDate;
    }

    const durationNum = (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
    };
    const minD = durationNum(minDuration);
    const maxD = durationNum(maxDuration);
    if (minD !== undefined || maxD !== undefined) {
        whereClause.duration = {};
        if (minD !== undefined) whereClause.duration[Op.gte] = minD;
        if (maxD !== undefined) whereClause.duration[Op.lte] = maxD;
    }

    const orderDirection = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";
    let orderSpec;
    switch (sortBy) {
        case "duration": orderSpec = [["duration", orderDirection]]; break;
        case "workoutType": orderSpec = [[ProgramWorkout, "workout_name", orderDirection]]; break;
        default: orderSpec = [["log_date", orderDirection]]; break;
    }

    const programWorkoutInclude = {
        model: ProgramWorkout,
        attributes: ["workout_name"],
        ...(workoutType && workoutType.trim() ? { where: { workout_name: workoutType.trim() } } : {})
    };

    const queryOptions = {
        where: whereClause,
        order: orderSpec,
        attributes: ["log_date", "duration", "member_id", "program_workout_id"],
        include: [programWorkoutInclude]
    };

    const limitNum = Number(limit);
    if (limitNum > 0) queryOptions.limit = limitNum;

    const workouts = await WorkoutLog.findAll(queryOptions);

    const items = workouts.map((w, idx) => ({
        id: `${w.member_id}-${w.program_workout_id}-${w.log_date}-${idx}`,
        workoutType: w.ProgramWorkout?.workout_name || "",
        workoutDate: w.log_date,
        durationMinutes: Number(w.duration || 0)
    }));

    return {
        items,
        total: items.length,
        filters: {
            startDate: startDate || null,
            endDate: endDate || null,
            sortBy,
            sortDir: orderDirection.toLowerCase(),
            workoutType: workoutType && workoutType.trim() ? workoutType.trim() : null,
            minDuration: minD ?? null,
            maxDuration: maxD ?? null
        }
    };
}

module.exports = {
    getMemberMetrics,
    getMemberHistory,
    getMemberStreaks,
    getMemberRecentWorkouts
};
