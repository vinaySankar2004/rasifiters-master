// People service — the People list + a person's profile (specs/features/people/SPEC.md §3–§4; phase-4 D-P1–D-P3,
// D-P7, D-P10, D-P11). Every rule comes from utils/memberVisibility (program-memberships D-C5 + the "Hide my activity"
// rule): loadViewer + hasProgramAccess open the program; canView(…, "workouts") decides whose activity shows. This file
// never re-states a rule. Grouped queries, no N+1.
const { Op, fn, col } = require("sequelize");
const { Member, Program, ProgramMembership, ProgramWorkout, WorkoutLog } = require("../models");
const { AppError } = require("../utils/response");
const { loadViewer, hasProgramAccess, canView } = require("../utils/memberVisibility");
const { computeStreaks } = require("./memberAnalyticsService");
const { getKudosSummary, isActiveGiver } = require("./kudosService");

const RECENT_WORKOUTS_LIMIT = 10;
const MEMBER_ATTRS = ["id", "first_name", "last_name", "username"];

const todayUtc = () => new Date().toISOString().slice(0, 10);

// raw MAX(log_date) / grouped log_date may come back as 'YYYY-MM-DD' or a Date depending on the type parser.
const toDateString = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

// D-P10: initials only (no photos) — computed here once so web / iOS / Android show the same letters.
const initialsOf = (first, last) =>
    `${[...(first || "").trim()][0] || ""}${[...(last || "").trim()][0] || ""}`.toUpperCase() || "?";

// D-P11: staff = a global admin, or an ACTIVE program admin / logger.
const isStaffViewer = (viewer) => viewer.isGlobalAdmin || viewer.isStaff;

const personBase = (membership, viewer) => {
    const member = membership.Member;
    return {
        member_id: member.id,
        member_name: `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Unknown",
        initials: initialsOf(member.first_name, member.last_name),
        username: member.username || "",
        program_role: membership.role,
        is_you: member.id === viewer.id
    };
};

// Shared prelude: the viewer may open this program (S0's hasProgramAccess — a global admin or an ACTIVE member),
// then the program exists.
async function openProgram(user, programId) {
    const viewer = await loadViewer(user, programId);
    if (!hasProgramAccess(viewer)) {
        throw new AppError(403, "You're not a member of this program.", { code: "not_program_member" });
    }
    const program = await Program.findOne({
        where: { id: programId, is_deleted: false },
        attributes: ["id", "start_date"]
    });
    if (!program) throw new AppError(404, "This program no longer exists.", { code: "program_not_found" });
    return { viewer, program };
}

// GET /api/people?programId — every ACTIVE member; the caller first, then first + last name A→Z.
async function listPeople({ user, programId }) {
    const { viewer } = await openProgram(user, programId);
    const memberships = await ProgramMembership.findAll({
        where: { program_id: programId, status: "active" },
        attributes: ["program_id", "member_id", "role"],
        include: [{ model: Member, attributes: MEMBER_ATTRS }],
        order: [[Member, "first_name", "ASC"], [Member, "last_name", "ASC"]]
    });
    const rows = memberships.filter((membership) => membership.Member);
    const visibleIds = rows.map((membership) => membership.member_id).filter((id) => canView(viewer, id, "workouts"));
    const lastRows = visibleIds.length ? await WorkoutLog.findAll({
        where: { program_id: programId, member_id: { [Op.in]: visibleIds } },
        attributes: ["member_id", [fn("MAX", col("log_date")), "last_active"]],
        group: ["member_id"],
        raw: true
    }) : [];
    const lastActive = new Map(lastRows.map((row) => [row.member_id, toDateString(row.last_active)]));
    const visible = new Set(visibleIds);
    const people = rows.map((membership) => ({
        ...personBase(membership, viewer),
        activity_visible: visible.has(membership.member_id),
        last_active: lastActive.get(membership.member_id) || null // hidden members are never queried
    }));
    people.sort((a, b) => Number(b.is_you) - Number(a.is_you)); // stable: "You" first, A→Z kept
    return {
        program_id: programId,
        viewer: { member_id: viewer.id, is_staff: isStaffViewer(viewer) },
        people
    };
}

// Same streak window + semantics as GET /api/member-streaks (program start → today UTC; the stale-streak caveat) so
// the profile and "Open full stats" agree. Active days this month = distinct log dates in the current UTC month.
const buildStats = (dates, programStart) => {
    const today = todayUtc();
    const start = programStart || "1970-01-01";
    const { current, longest } = computeStreaks(dates.filter((d) => d >= start && d <= today));
    const month = today.slice(0, 7);
    return {
        current_streak: current,
        longest_streak: longest,
        active_days_this_month: dates.filter((d) => d.startsWith(month)).length,
        last_active: dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null
    };
};

// GET /api/people/:memberId?programId — D-P3 workouts only. Hidden from this viewer → stats / recent / kudos null.
async function getPersonProfile({ user, programId, memberId }) {
    const { viewer, program } = await openProgram(user, programId);
    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: memberId, status: "active" },
        attributes: ["program_id", "member_id", "role", "joined_at"],
        include: [{ model: Member, attributes: MEMBER_ATTRS }]
    });
    if (!membership?.Member) {
        throw new AppError(404, "This person isn't in this program.", { code: "member_not_in_program" });
    }
    const base = personBase(membership, viewer);
    const visible = canView(viewer, base.member_id, "workouts");
    const profile = {
        program_id: programId,
        ...base,
        joined_at: membership.joined_at,
        activity_visible: visible,
        can_open_full_stats: isStaffViewer(viewer), // D-P11
        stats: null,
        recent_workouts: null,
        kudos: null
    };
    if (!visible) return profile;

    const [dateRows, recentRows, kudos, canGive] = await Promise.all([
        WorkoutLog.findAll({
            where: { program_id: programId, member_id: base.member_id },
            attributes: ["log_date"],
            group: ["log_date"],
            raw: true
        }),
        WorkoutLog.findAll({
            where: { program_id: programId, member_id: base.member_id },
            attributes: ["log_date", "duration"],
            include: [{ model: ProgramWorkout, attributes: ["workout_name"] }],
            order: [["log_date", "DESC"], [ProgramWorkout, "workout_name", "ASC"]],
            limit: RECENT_WORKOUTS_LIMIT
        }),
        getKudosSummary({ viewerId: viewer.id, recipientId: base.member_id }),
        base.is_you ? false : isActiveGiver(viewer, programId)
    ]);
    profile.stats = buildStats(dateRows.map((row) => toDateString(row.log_date)).filter(Boolean), program.start_date);
    profile.recent_workouts = recentRows.map((w) => ({
        workout_type: w.ProgramWorkout?.workout_name || "",
        date: toDateString(w.log_date),
        duration_minutes: Number(w.duration || 0)
    }));
    profile.kudos = { ...kudos, can_give: canGive };
    return profile;
}

module.exports = { listPeople, getPersonProfile };
