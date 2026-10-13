// utils/memberVisibility.js — the ONE rule for who may see which member's data.
// program-memberships D-C5 (0.3.0) · reliability-overhaul Phase 4 S0 (People D-P8 a). Every per-person read asks
// canView(viewer, targetMemberId, kind); the routes keep their own status codes + messages.
//
//   staff        = an ACTIVE program_memberships row with role "admin" or "logger"
//   global admin = members.global_role === "global_admin" — passes every kind
//
//   kind         who may see it (besides a global admin)
//   "email"      the member themselves                       (GET /api/members/:id)
//   "directory"  nobody (the rest get only their own row)    (GET /api/members)
//   "roster"     an ACTIVE member of the program             (GET /api/program-memberships/{members,details})
//   "health"     the member themselves, or program staff     (sleep / diet / steps — averages + daily rows)
//   "workouts"   the member themselves, staff, or an ACTIVE  (workouts / streaks / history / recent / types)
//                co-member the target hasn't hidden from
//
// People S1 ("Hide my activity", migration 012) plugs in HERE for every read that already routes through this module:
// loadViewer fills hiddenMemberIds with the program's hidden members (one query, skipped for staff + global admins)
// and redactMetricsRow adds the workout-field redaction. NOT routed through here: /analytics/summary top_performers /
// at_risk (analyticsService.js) — if S1 decides (Phase 4 Q4) to drop hidden members there, that service changes too.
// In S0 nobody can hide, so "workouts" = any active member (every caller already passed that gate).
const { ProgramMembership } = require("../models");

const STAFF_ROLES = new Set(["admin", "logger"]);
const HEALTH_FIELDS = ["avg_sleep_hours", "avg_food_quality", "avg_steps"];

/** The viewer's context for one program. One composite-PK lookup — none for a global admin, or when programId is
 *  missing / not a single string (a repeated ?programId is never a membership). programRole is the role on a row
 *  of ANY status (null = no row); isActiveMember / isStaff require status "active". */
async function loadViewer(user, programId) {
    const viewer = {
        id: user?.id || null,
        isGlobalAdmin: user?.global_role === "global_admin",
        programRole: null,
        isActiveMember: false,
        isStaff: false,
        hiddenMemberIds: new Set() // People S1 fills this; always empty in S0
    };
    if (viewer.isGlobalAdmin || !viewer.id || typeof programId !== "string" || !programId) return viewer;

    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: viewer.id },
        attributes: ["role", "status"]
    });
    if (!membership) return viewer;

    viewer.programRole = membership.role;
    viewer.isActiveMember = membership.status === "active";
    viewer.isStaff = viewer.isActiveMember && STAFF_ROLES.has(membership.role);
    return viewer;
}

/** May the viewer read this program at all? A global admin, or an ACTIVE member (any role). */
const hasProgramAccess = (viewer) => Boolean(viewer && (viewer.isGlobalAdmin || viewer.isActiveMember));

/** The single predicate. targetMemberId = whose data (null for the list kinds "directory" / "roster"). */
function canView(viewer, targetMemberId, kind) {
    if (!viewer) return false;
    if (viewer.isGlobalAdmin) return true;
    const isSelf = typeof targetMemberId === "string" && targetMemberId === viewer.id;
    switch (kind) {
        case "email": return isSelf;
        case "directory": return false;
        case "roster": return viewer.isActiveMember;
        case "health": return isSelf || viewer.isStaff;
        case "workouts":
            return isSelf || viewer.isStaff || (viewer.isActiveMember && !viewer.hiddenMemberIds.has(targetMemberId));
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

/** Every per-kind redaction for one member-metrics row (row.member_id = the target), in place. */
function redactMetricsRow(viewer, row) {
    if (!canView(viewer, row.member_id, "health")) redactHealth(row);
    return row;
}

/** Express guard for a ?memberId read. Must run after a middleware that sets req.viewer (analytics'
 *  requireProgramAccess). No programId or no memberId → pass (the service's native 400 / the program aggregate). */
const requireMemberView = (kind, message) => (req, res, next) => {
    const { programId, memberId } = req.query;
    if (!programId || !memberId) return next();
    if (canView(req.viewer, memberId, kind)) return next();
    return res.status(403).json({ error: message });
};

module.exports = { loadViewer, hasProgramAccess, canView, redactHealth, redactMetricsRow, requireMemberView };
