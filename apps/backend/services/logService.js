const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { WorkoutLog, Member, ProgramWorkout, ProgramMembership, Workout, Program, DailyHealthLog } = require("../models");
const { AppError } = require("../utils/response");

const MAX_BATCH_SIZE = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True if value is a real YYYY-MM-DD calendar date (rejects rollovers like 2026-02-30). */
function isValidDateString(value) {
    if (typeof value !== "string" || !DATE_RE.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === value;
}

/** Parse an optional numeric field: "" / null / undefined → null; non-numeric → NaN (caller 400s). */
const parseOptionalNumber = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
};

// ── Authorization helpers (shared by the workout-log and daily-health-log halves) ──

/** True if the requester may act on ANY member in the program (program admin/logger, or global admin).
 *  Throws 403 if the requester is not enrolled. The boolean drives per-member branching in the callers,
 *  so it stays inline in the service (not a route gate). */
async function resolveLogPermissions(program_id, requester) {
    if (requester?.global_role === "global_admin") return true;

    const membership = await ProgramMembership.findOne({
        where: { program_id, member_id: requester?.id }
    });
    if (!membership) throw new AppError(403, "You are not enrolled in this program.");

    return ["admin", "logger"].includes(membership.role);
}

/** True if the requester is a program admin (or a global admin). Used by the `requireDataEntryAllowed`
 *  route middleware (the hoisted admin_only_data_entry lock, D-C5). */
async function isProgramAdmin(program_id, requester) {
    if (requester?.global_role === "global_admin") return true;
    const membership = await ProgramMembership.findOne({
        where: { program_id, member_id: requester?.id }
    });
    return membership?.role === "admin";
}

/** Resolve display name "First Last" to a Member. member_name is virtual (first_name + last_name), not a DB column. */
async function findMemberByDisplayName(displayName) {
    const trimmed = (displayName || "").trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);
    const first_name = parts.shift() || "";
    const last_name = parts.join(" ").trim();
    if (!first_name) return null;
    return Member.findOne({ where: { first_name, last_name } });
}

/** Resolve (or create) the ProgramWorkout for a workout name within a program.
 *  Matches a library workout first, then reuses/upgrades an existing custom row, else creates one.
 *  Pass a transaction to participate in an atomic batch. */
async function resolveProgramWorkout(program_id, workout_name, transaction = null) {
    const workoutName = (workout_name || "").trim();
    const opts = transaction ? { transaction } : {};

    const libraryWorkout = await Workout.findOne({ where: { workout_name: workoutName }, ...opts });

    if (libraryWorkout) {
        const programWorkout = await ProgramWorkout.findOne({
            where: { program_id, library_workout_id: libraryWorkout.id },
            ...opts
        });
        if (programWorkout) return programWorkout;

        const existingCustom = await ProgramWorkout.findOne({
            where: { program_id, workout_name: workoutName, library_workout_id: null },
            ...opts
        });
        if (existingCustom) {
            return existingCustom.update({ library_workout_id: libraryWorkout.id }, opts);
        }
        return ProgramWorkout.create({
            program_id,
            workout_name: libraryWorkout.workout_name,
            library_workout_id: libraryWorkout.id
        }, opts);
    }

    const programWorkout = await ProgramWorkout.findOne({
        where: { program_id, workout_name: workoutName },
        ...opts
    });
    if (programWorkout) return programWorkout;
    return ProgramWorkout.create({
        program_id, workout_name: workoutName, library_workout_id: null
    }, opts);
}

// ── Workout Logs ──

async function addWorkoutLog({ member_name, member_id: bodyMemberId, workout_name, date, duration, program_id }, requester) {
    if (!workout_name || !date || !duration) {
        throw new AppError(400, "All fields are required.");
    }
    if (!program_id) throw new AppError(400, "program_id is required.");

    // D-C2: duration must be a positive whole number of minutes (was isNaN-only + parseInt).
    const durationNum = Number(duration);
    if (!Number.isInteger(durationNum) || durationNum <= 0) {
        throw new AppError(400, "Duration must be a positive whole number of minutes.");
    }

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C5).

    // D-C4: load the requester's membership once; derive canLogForAny + reuse it for a self-target check.
    const isGlobalAdmin = requester?.global_role === "global_admin";
    let requesterMembership = null;
    if (!isGlobalAdmin) {
        requesterMembership = await ProgramMembership.findOne({
            where: { program_id, member_id: requester?.id }
        });
        if (!requesterMembership) throw new AppError(403, "You are not enrolled in this program.");
    }
    const canLogForAny = isGlobalAdmin || ["admin", "logger"].includes(requesterMembership.role);

    let member_id = requester.id;
    if (bodyMemberId) {
        if (!canLogForAny && bodyMemberId !== requester?.id) {
            throw new AppError(403, "You can only log your own workouts.");
        }
        if (canLogForAny) member_id = bodyMemberId;
    } else if (member_name) {
        // D-C3: single authoritative post-resolution id check (dropped the redundant name pre-check).
        const member = await findMemberByDisplayName(member_name);
        if (!member) throw new AppError(404, "Member not found.");
        if (!canLogForAny && member.id !== requester?.id) {
            throw new AppError(403, "You can only log your own workouts.");
        }
        member_id = member.id;
    }

    // D-C4: reuse the requester's membership for a self-target; else query the target's active membership.
    let targetMembership;
    if (member_id === requester?.id && requesterMembership) {
        targetMembership = requesterMembership.status === "active" ? requesterMembership : null;
    } else {
        targetMembership = await ProgramMembership.findOne({
            where: { program_id, member_id, status: "active" }
        });
    }
    if (!targetMembership) throw new AppError(404, "Member is not an active participant in this program.");

    const workoutName = workout_name.trim();
    const programWorkout = await resolveProgramWorkout(program_id, workoutName);

    const newLog = await WorkoutLog.create({
        program_id,
        member_id,
        program_workout_id: programWorkout.id,
        log_date: date,
        duration: durationNum
    });

    const member = await Member.findByPk(member_id);

    return {
        ...newLog.toJSON(),
        member_name: member ? member.member_name : null,
        workout_name: workoutName,
        date
    };
}

/** Bulk-insert workout logs for many member/workout/date rows in one atomic transaction.
 *  Duplicate (member, workout, date) rows — within the batch and against existing logs — are
 *  summed. Admin/logger only. Returns per-row errors (mapped by original index) on validation
 *  failure so the client can highlight bad rows. */
async function addWorkoutLogsBatch({ program_id, entries }, requester) {
    if (!program_id) throw new AppError(400, "program_id is required.");
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new AppError(400, "entries must be a non-empty array.");
    }
    if (entries.length > MAX_BATCH_SIZE) {
        throw new AppError(400, `Batch too large (max ${MAX_BATCH_SIZE} rows).`);
    }

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C5).

    const canLogForAny = await resolveLogPermissions(program_id, requester);
    if (!canLogForAny) throw new AppError(403, "You do not have permission to bulk-log workouts.");

    // ── Per-row input validation (no DB work yet) ──
    const rowErrors = [];
    entries.forEach((entry, index) => {
        const memberId = entry?.member_id;
        const workoutName = typeof entry?.workout_name === "string" ? entry.workout_name.trim() : "";
        const durationNum = Number(entry?.duration);

        if (!memberId || typeof memberId !== "string") {
            rowErrors.push({ index, field: "member_id", message: "Member is required." });
        }
        if (!workoutName) {
            rowErrors.push({ index, field: "workout_name", message: "Workout type is required." });
        }
        if (!isValidDateString(entry?.date)) {
            rowErrors.push({ index, field: "date", message: "A valid date (YYYY-MM-DD) is required." });
        }
        if (!Number.isInteger(durationNum) || durationNum <= 0) {
            rowErrors.push({ index, field: "duration", message: "Duration must be a positive whole number of minutes." });
        }
    });
    if (rowErrors.length) {
        const err = new AppError(400, "Some rows are invalid.");
        err.rowErrors = rowErrors;
        throw err;
    }

    // ── Pre-aggregate by (member, lowercased workout, date), summing durations ──
    const groupsMap = new Map();
    entries.forEach((entry, index) => {
        const workoutName = entry.workout_name.trim();
        const key = `${entry.member_id}|${workoutName.toLowerCase()}|${entry.date}`;
        const existing = groupsMap.get(key);
        const duration = Number(entry.duration);
        if (existing) {
            existing.duration += duration;
            existing.rowIndexes.push(index);
        } else {
            groupsMap.set(key, {
                member_id: entry.member_id,
                workout_name: workoutName,
                date: entry.date,
                duration,
                rowIndexes: [index]
            });
        }
    });
    const groups = [...groupsMap.values()];

    // ── Atomic writes ──
    return sequelize.transaction(async (transaction) => {
        // Every distinct member must be an active participant.
        const distinctMemberIds = [...new Set(groups.map((g) => g.member_id))];
        const membershipErrors = [];
        for (const memberId of distinctMemberIds) {
            const membership = await ProgramMembership.findOne({
                where: { program_id, member_id: memberId, status: "active" },
                transaction
            });
            if (!membership) {
                for (const g of groups) {
                    if (g.member_id !== memberId) continue;
                    for (const index of g.rowIndexes) {
                        membershipErrors.push({
                            index,
                            field: "member_id",
                            message: "Member is not an active participant in this program."
                        });
                    }
                }
            }
        }
        if (membershipErrors.length) {
            const err = new AppError(400, "Some rows reference members who are not active in this program.");
            err.rowErrors = membershipErrors;
            throw err;
        }

        // Resolve (or create) a ProgramWorkout per distinct workout name.
        const workoutCache = new Map();
        for (const g of groups) {
            const key = g.workout_name.trim().toLowerCase();
            if (!workoutCache.has(key)) {
                workoutCache.set(key, await resolveProgramWorkout(program_id, g.workout_name, transaction));
            }
        }

        let created = 0;
        let updated = 0;
        let total_minutes = 0;
        for (const g of groups) {
            const pw = workoutCache.get(g.workout_name.trim().toLowerCase());
            const existing = await WorkoutLog.findOne({
                where: { program_id, member_id: g.member_id, program_workout_id: pw.id, log_date: g.date },
                transaction
            });
            if (existing) {
                existing.duration = (existing.duration || 0) + g.duration;
                await existing.save({ transaction });
                updated++;
            } else {
                await WorkoutLog.create({
                    program_id,
                    member_id: g.member_id,
                    program_workout_id: pw.id,
                    log_date: g.date,
                    duration: g.duration
                }, { transaction });
                created++;
            }
            total_minutes += g.duration;
        }

        return {
            created,
            updated,
            total_minutes,
            groups: groups.length,
            total_entries: entries.length
        };
    });
}

async function updateWorkoutLog({ member_name, workout_name, date, duration, program_id }, requester) {
    if (!workout_name || !date || !duration) {
        throw new AppError(400, "Workout name, date, and duration are required.");
    }
    if (!program_id) throw new AppError(400, "program_id is required.");

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C5).

    let member_id = requester.id;

    if (member_name && member_name !== requester.member_name) {
        const canEditOther = await resolveLogPermissions(program_id, requester);
        if (!canEditOther) {
            throw new AppError(403, "You can only update your own logs.");
        }
        const member = await findMemberByDisplayName(member_name);
        if (!member) throw new AppError(404, "Member not found.");
        member_id = member.id;
    }

    const programWorkout = await ProgramWorkout.findOne({
        where: { program_id, workout_name: workout_name.trim() }
    });
    if (!programWorkout) throw new AppError(404, "Workout type not found for program.");

    const log = await WorkoutLog.findOne({
        where: { program_id, member_id, program_workout_id: programWorkout.id, log_date: date }
    });
    if (!log) throw new AppError(404, "Workout log not found.");

    log.duration = parseInt(duration, 10);
    await log.save();

    return { ...log.toJSON(), workout_name: workout_name.trim(), date };
}

async function deleteWorkoutLog({ member_id, member_name, workout_name, date, program_id }, requester) {
    if (!workout_name || !date) throw new AppError(400, "Workout name and date are required.");
    if (!program_id) throw new AppError(400, "program_id is required.");

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C5).

    const programWorkout = await ProgramWorkout.findOne({
        where: { program_id, workout_name: workout_name.trim() }
    });
    if (!programWorkout) throw new AppError(404, "Workout type not found for program.");

    // D-C4: resolve the requester's delete-others permission ONCE (legacy called this twice). It is
    // hoisted above the member_name privacy pre-check (which must run before member resolution), so a
    // not-enrolled requester's 403 may surface a step earlier than legacy's post-lookup call (§10 F9).
    const canDeleteOther = await resolveLogPermissions(program_id, requester);

    const whereCondition = { program_id, program_workout_id: programWorkout.id, log_date: date };

    if (member_id) {
        whereCondition.member_id = member_id;
    } else if (member_name) {
        if (!canDeleteOther && requester.member_name !== member_name) {
            throw new AppError(403, "You can only delete your own logs.");
        }
        const member = await findMemberByDisplayName(member_name);
        if (!member) throw new AppError(404, "Member not found.");
        whereCondition.member_id = member.id;
    } else {
        whereCondition.member_id = requester.id;
    }

    const log = await WorkoutLog.findOne({ where: whereCondition });
    if (!log) throw new AppError(404, "Workout log not found.");

    if (!canDeleteOther && log.member_id !== requester.id) {
        throw new AppError(403, "You can only delete your own logs.");
    }

    await log.destroy();
    return { message: "Workout log deleted successfully." };
}

// ── Daily Health Logs ──

async function addDailyHealthLog({ program_id, log_date, sleep_hours, food_quality, member_id: bodyMemberId }, requester) {
    if (!program_id || !log_date) throw new AppError(400, "program_id and log_date are required.");

    const sleepValue = parseOptionalNumber(sleep_hours);
    const foodValue = parseOptionalNumber(food_quality);

    if (Number.isNaN(sleepValue)) throw new AppError(400, "sleep_hours must be a number.");
    if (Number.isNaN(foodValue)) throw new AppError(400, "food_quality must be a number.");
    if (sleepValue === null && foodValue === null) throw new AppError(400, "At least one of sleep_hours or food_quality is required.");
    if (sleepValue !== null && (sleepValue < 0 || sleepValue > 24)) throw new AppError(400, "sleep_hours must be between 0 and 24.");
    if (foodValue !== null && (!Number.isInteger(foodValue) || foodValue < 1 || foodValue > 5)) {
        throw new AppError(400, "food_quality must be an integer between 1 and 5.");
    }

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C2).

    const canLogForAny = await resolveLogPermissions(program_id, requester);

    let targetMemberId = requester?.id;
    if (bodyMemberId) {
        if (!canLogForAny && bodyMemberId !== requester?.id) throw new AppError(403, "You can only log your own daily health.");
        if (canLogForAny) targetMemberId = bodyMemberId;
    }

    const targetMembership = await ProgramMembership.findOne({
        where: { program_id, member_id: targetMemberId, status: "active" }
    });
    if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");

    const existing = await DailyHealthLog.findOne({
        where: { program_id, member_id: targetMemberId, log_date }
    });
    if (existing) throw new AppError(409, "Daily health log already exists for this date.");

    return DailyHealthLog.create({
        program_id, member_id: targetMemberId, log_date,
        sleep_hours: sleepValue, food_quality: foodValue
    });
}

async function getDailyHealthLogs({
    programId, memberId, limit = 1000,
    startDate, endDate, sortBy = "date", sortDir = "desc",
    minSleepHours, maxSleepHours, minFoodQuality, maxFoodQuality
}, requester) {
    if (!programId || !memberId) throw new AppError(400, "programId and memberId are required.");

    const canLogForAny = await resolveLogPermissions(programId, requester);
    if (!canLogForAny && memberId !== requester?.id) {
        throw new AppError(403, "You can only view your own daily health logs.");
    }

    const targetMembership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: memberId, status: "active" }
    });
    if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");

    const whereClause = { program_id: programId, member_id: memberId };
    if (startDate || endDate) {
        whereClause.log_date = {};
        if (startDate) whereClause.log_date[Op.gte] = startDate;
        if (endDate) whereClause.log_date[Op.lte] = endDate;
    }

    const sleepNum = (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const minS = sleepNum(minSleepHours);
    const maxS = sleepNum(maxSleepHours);
    if (minS !== undefined || maxS !== undefined) {
        const sleepCond = [{ sleep_hours: { [Op.ne]: null } }];
        if (minS !== undefined) sleepCond.push({ sleep_hours: { [Op.gte]: minS } });
        if (maxS !== undefined) sleepCond.push({ sleep_hours: { [Op.lte]: maxS } });
        whereClause[Op.and] = whereClause[Op.and] || [];
        whereClause[Op.and].push({ [Op.and]: sleepCond });
    }

    const dietInt = (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined;
    };
    const minF = dietInt(minFoodQuality);
    const maxF = dietInt(maxFoodQuality);
    if (minF !== undefined || maxF !== undefined) {
        const dietCond = [{ food_quality: { [Op.ne]: null } }];
        if (minF !== undefined) dietCond.push({ food_quality: { [Op.gte]: minF } });
        if (maxF !== undefined) dietCond.push({ food_quality: { [Op.lte]: maxF } });
        whereClause[Op.and] = whereClause[Op.and] || [];
        whereClause[Op.and].push({ [Op.and]: dietCond });
    }

    let orderColumn;
    switch (sortBy) {
        case "sleep_hours": orderColumn = "sleep_hours"; break;
        case "food_quality": orderColumn = "food_quality"; break;
        default: orderColumn = "log_date"; break;
    }
    const orderDirection = sortDir.toLowerCase() === "asc" ? "ASC" : "DESC";

    const queryOptions = {
        where: whereClause,
        order: [[orderColumn, orderDirection]],
        attributes: ["program_id", "member_id", "log_date", "sleep_hours", "food_quality"]
    };
    const limitNum = Number(limit);
    if (limitNum > 0) queryOptions.limit = limitNum;

    const logs = await DailyHealthLog.findAll(queryOptions);

    const items = logs.map((log, idx) => ({
        id: `${log.member_id}-${log.log_date}-${idx}`,
        logDate: log.log_date,
        sleepHours: log.sleep_hours !== null && log.sleep_hours !== undefined ? Number(log.sleep_hours) : null,
        foodQuality: log.food_quality !== null && log.food_quality !== undefined ? Number(log.food_quality) : null
    }));

    return {
        items,
        total: items.length,
        filters: {
            startDate: startDate || null,
            endDate: endDate || null,
            sortBy,
            sortDir: orderDirection.toLowerCase(),
            minSleepHours: minS ?? null,
            maxSleepHours: maxS ?? null,
            minFoodQuality: minF ?? null,
            maxFoodQuality: maxF ?? null
        }
    };
}

async function updateDailyHealthLog(body, requester) {
    // D-C3: single `body` param — derive both the values and the field-presence flags from it
    // (legacy took (parsed, requester, rawBody) and was called with req.body twice). Behavior identical.
    const { program_id, log_date, sleep_hours, food_quality, member_id: bodyMemberId } = body;
    if (!program_id || !log_date) throw new AppError(400, "program_id and log_date are required.");

    const sleepValue = parseOptionalNumber(sleep_hours);
    const foodValue = parseOptionalNumber(food_quality);
    const hasSleepField = Object.prototype.hasOwnProperty.call(body, "sleep_hours");
    const hasFoodField = Object.prototype.hasOwnProperty.call(body, "food_quality");

    if (!hasSleepField && !hasFoodField) throw new AppError(400, "At least one of sleep_hours or food_quality is required.");
    if (hasSleepField && Number.isNaN(sleepValue)) throw new AppError(400, "sleep_hours must be a number.");
    if (hasFoodField && Number.isNaN(foodValue)) throw new AppError(400, "food_quality must be a number.");
    if (sleepValue === null && foodValue === null) throw new AppError(400, "At least one of sleep_hours or food_quality is required.");
    if (sleepValue !== null && (sleepValue < 0 || sleepValue > 24)) throw new AppError(400, "sleep_hours must be between 0 and 24.");
    if (foodValue !== null && (!Number.isInteger(foodValue) || foodValue < 1 || foodValue > 5)) {
        throw new AppError(400, "food_quality must be an integer between 1 and 5.");
    }

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C2).

    const canLogForAny = await resolveLogPermissions(program_id, requester);

    let targetMemberId = requester?.id;
    if (bodyMemberId) {
        if (!canLogForAny && bodyMemberId !== requester?.id) throw new AppError(403, "You can only update your own daily health.");
        if (canLogForAny) targetMemberId = bodyMemberId;
    }

    const targetMembership = await ProgramMembership.findOne({
        where: { program_id, member_id: targetMemberId, status: "active" }
    });
    if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");

    const log = await DailyHealthLog.findOne({
        where: { program_id, member_id: targetMemberId, log_date }
    });
    if (!log) throw new AppError(404, "Daily health log not found.");

    const updateData = {};
    if (hasSleepField) updateData.sleep_hours = sleepValue;
    if (hasFoodField) updateData.food_quality = foodValue;

    await log.update(updateData);
    return log;
}

async function deleteDailyHealthLog({ program_id, log_date, member_id: bodyMemberId }, requester) {
    if (!program_id || !log_date) throw new AppError(400, "program_id and log_date are required.");

    // The admin_only_data_entry lock is enforced upstream by requireDataEntryAllowed (D-C2).

    const canLogForAny = await resolveLogPermissions(program_id, requester);

    let targetMemberId = requester?.id;
    if (bodyMemberId) {
        if (!canLogForAny && bodyMemberId !== requester?.id) throw new AppError(403, "You can only delete your own daily health.");
        if (canLogForAny) targetMemberId = bodyMemberId;
    }

    const targetMembership = await ProgramMembership.findOne({
        where: { program_id, member_id: targetMemberId, status: "active" }
    });
    if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");

    const log = await DailyHealthLog.findOne({
        where: { program_id, member_id: targetMemberId, log_date }
    });
    if (!log) throw new AppError(404, "Daily health log not found.");

    await log.destroy();
    return { message: "Daily health log deleted successfully." };
}

module.exports = {
    isProgramAdmin,
    addWorkoutLog,
    addWorkoutLogsBatch,
    updateWorkoutLog,
    deleteWorkoutLog,
    addDailyHealthLog,
    getDailyHealthLogs,
    updateDailyHealthLog,
    deleteDailyHealthLog
};
