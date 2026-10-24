// utils/memberVisibility.js — the ONE rule for who may see which member's data.
// program-memberships D-C5 (0.3.0, Phase 4 S0 / People D-P8 a) + People S1's "Hide my activity" rule.
// Every per-person read asks canView(viewer, targetMemberId, kind); the routes keep their own status codes + messages.
//
//   staff        = an ACTIVE program_memberships row with role "admin" or "logger"
//   global admin = members.global_role === "global_admin" — passes every kind
//
//   kind         who may see it (besides a global admin)
//   "email"      the member themselves                       (GET /api/members/:id — email and hide_activity)
//   "directory"  nobody (the rest get only their own row)    (GET /api/members)
//   "roster"     an ACTIVE member of the program             (GET /api/program-memberships/{members,details})
//   "health"     the member themselves, or program staff     (sleep / diet / steps — averages + daily rows)
//   "workouts"   the member themselves, staff, or an ACTIVE  (workouts, workout stats, kudos — every output in
//                co-member — while neither the target nor     specs/features/people/SPEC.md §5)
//                the viewer has turned on Hide my activity
//
// People S1 (migration 012): loadViewer fills hiddenMemberIds with the program's ACTIVE members who turned on
// "Hide my activity" — one query, only for a plain ACTIVE member who shares their own activity. The switch is
// reciprocal (people D-C16): a plain member who hides sees no co-member's activity either (staff keep seeing everyone).
// Callers OMIT what "workouts" refuses, never redact or zero it: member-metrics rows and /analytics/summary
// top_performers entries are dropped, history / streaks / recent and the ?memberId analytics routes answer 403, People
// hides stats / recent workouts / kudos.
// Ids compare in canonical form (canonicalId): PostgreSQL reads upper case, braces or missing hyphens as the same
// uuid, so any non-canonical spelling is never "self" and never a visible co-member (fails closed).
const { Member, ProgramMembership } = require("../models");

const STAFF_ROLES = new Set(["admin", "logger"]);
const HEALTH_FIELDS = ["avg_sleep_hours", "avg_food_quality", "avg_steps"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTIVITY_HIDDEN_MESSAGE = "This member keeps their activity private.";

/** The canonical (lowercase 8-4-4-4-12) form of an id, or null for anything else — an array included. */
const canonicalId = (id) => {
    if (typeof id !== "string") return null;
    const lower = id.toLowerCase();
    return UUID_RE.test(lower) ? lower : null;
};

/** The viewer's context for one program. One composite-PK lookup — none for a global admin, or when programId is
 *  missing / not a single string (a repeated ?programId is never a membership). programRole is the role on a row
 *  of ANY status (null = no row); isActiveMember / isStaff require status "active". hidesActivity = the viewer's own
 *  members.hide_activity (joined on the same lookup). hiddenMemberIds (People S1): the program's ACTIVE members whose
 *  members.hide_activity is true (every "workouts" output is active-only already); one more query, only for a plain
 *  active member who shares (staff and global admins see everyone; a hiding member or a non-member sees no co-member
 *  anyway). */
async function loadViewer(user, programId) {
    const viewer = {
        id: user?.id || null,
        isGlobalAdmin: user?.global_role === "global_admin",
        programRole: null,
        isActiveMember: false,
        isStaff: false,
        hidesActivity: false,
        hiddenMemberIds: new Set()
    };
    if (viewer.isGlobalAdmin || !viewer.id || typeof programId !== "string" || !programId) return viewer;

    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: viewer.id },
        attributes: ["role", "status"],
        include: [{ model: Member, attributes: ["hide_activity"] }]
    });
    if (!membership) return viewer;

    viewer.programRole = membership.role;
    viewer.isActiveMember = membership.status === "active";
    viewer.isStaff = viewer.isActiveMember && STAFF_ROLES.has(membership.role);
    viewer.hidesActivity = membership.Member?.hide_activity === true;
    if (viewer.isActiveMember && !viewer.isStaff && !viewer.hidesActivity) {
        const hidden = await ProgramMembership.findAll({
            where: { program_id: programId, status: "active" },
            attributes: ["member_id"],
            include: [{ model: Member, attributes: [], where: { hide_activity: true } }]
        });
        viewer.hiddenMemberIds = new Set(hidden.map((row) => String(row.member_id).toLowerCase()));
    }
    return viewer;
}

/** May the viewer read this program at all? A global admin, or an ACTIVE member (any role). */
const hasProgramAccess = (viewer) => Boolean(viewer && (viewer.isGlobalAdmin || viewer.isActiveMember));

/** The single predicate. targetMemberId = whose data (null for the list kinds "directory" / "roster"). */
function canView(viewer, targetMemberId, kind) {
    if (!viewer) return false;
    if (viewer.isGlobalAdmin) return true;
    const target = canonicalId(targetMemberId);
    const isSelf = target !== null && target === canonicalId(viewer.id);
    switch (kind) {
        case "email": return isSelf;
        case "directory": return false;
        case "roster": return viewer.isActiveMember;
        case "health": return isSelf || viewer.isStaff;
        case "workouts":
            return isSelf || viewer.isStaff ||
                (viewer.isActiveMember && !viewer.hidesActivity && target !== null &&
                    !viewer.hiddenMemberIds.has(target));
        default:
            throw new Error(`memberVisibility: unknown kind "${kind}"`);
    }
}

/** Null a member-metrics row's sleep / diet / steps averages — same keys, same shape (every client types them
 *  nullable). */
function redactHealth(row) {
    for (const field of HEALTH_FIELDS) row[field] = null;
    return row;
}

/** Every per-kind redaction for one member-metrics row (row.member_id = the target), in place. Health only — rows
 *  "workouts" refuses are omitted by getMemberMetrics, never redacted (the "Hide my activity" rule). */
function redactMetricsRow(viewer, row) {
    if (!canView(viewer, row.member_id, "health")) redactHealth(row);
    return row;
}

/** Express guard for a ?memberId read. Must run after a middleware that sets req.viewer (analytics'
 *  requireProgramAccess). No programId or no memberId → pass (the service's native 400 / the program aggregate).
 *  A memberId that isn't one well-formed id → 400 invalid_request. `code` (optional) rides on the 403. */
const requireMemberView = (kind, message, code) => (req, res, next) => {
    const { programId, memberId } = req.query;
    if (!programId || !memberId) return next();
    if (canonicalId(memberId) === null) {
        return res.status(400).json({ error: "memberId must be a valid id.", code: "invalid_request" });
    }
    if (canView(req.viewer, memberId, kind)) return next();
    return res.status(403).json(code ? { error: message, code } : { error: message });
};

module.exports = {
    loadViewer,
    hasProgramAccess,
    canView,
    canonicalId,
    redactHealth,
    redactMetricsRow,
    requireMemberView,
    ACTIVITY_HIDDEN_MESSAGE
};
