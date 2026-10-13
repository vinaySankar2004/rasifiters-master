# PLAN: Phase 4 Track S0, backend-only privacy fix (People D-P8 a) built on one shared `utils/memberVisibility.js` (revision 2)
**Brief accepted**: yes (18 files: 8 backend code files incl. the new module, `apps/backend/CONTEXT.md`, 6 SPECs, `registry.json`, `REGISTRY.md`. No client files.)
**Feature/version prediction**:
- members v0.3.0 → v0.4.0
- program-memberships v0.2.0 → v0.3.0
- member-analytics v0.4.0 → v0.5.0
- analytics v0.4.0 → v0.5.0
- analytics-v2 v0.2.0 → v0.2.1
- daily-health-logs v0.3.0 → v0.4.0
- workout-logs: no bump, even though it shares `services/logService.js`
- Reasons are in step 21.

**Surfaces in scope**: [backend] plus docs. Web, iOS and Android have no edits; they were audited only as callers. One implementer.

**What changed from revision 1 (adversary items)**:
1. BLOCKING, step 18: the boot command now sets dummy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`. I checked this: all 5 routers load and exit 0 with no DB connection.
2. Step 14: the anchor is now after line 17. Also, the daily-health-logs, members and program-memberships header notes now go inside the existing header sentences instead of as separate lines.
3. Step 21: says outright that workout-logs gets no bump.
4. Stale docs fixed:
   - member-analytics `ensureProgramAccess` mentions at lines 57, 84, 90, 97, 112, 136 and 167.
   - D-S1 updated in all six SPECs.
   - Header counts fixed in members, program-memberships and daily-health-logs.
   - The non-existent status `left` is removed everywhere. Leaving a program sets `status: "removed"` (`membershipService.js:396`).
5. Module header (and program-memberships D-C5) no longer claim S1 touches "this file only". They name the `top_performers`/`at_risk` exception.

**Line numbers are pre-edit.** Match every edit on the quoted text (the Edit tool matches strings). Where a step gives only a line number, edit that file from the bottom up.

## Decisions taken (orchestrator questions Q1–Q5; the user confirms each at plan approval)
- **Q1: `GET /api/members` returns `200 []` to anyone who is not a global admin.**
  - The only caller is iOS `loadLookupData`, which runs with no program open.
  - Nothing renders that list without a program: every tab checks `membersProgramId == programId` first.
- **Q2: `GET /api/members/:id` still returns the object to anyone, but `email` is `null` unless the viewer is that member or a global admin. No 404.**
  - With the directory and rosters closed, the only way to learn another member's id is through a shared program.
  - That program's roster already shows their name, username and gender.
  - A 404 would cost an extra query and hide nothing new.
- **Q3: a plain member asking for another member's `memberId` on `/health/timeline` or `/health/steps` gets `403 { error: "You can only view your own health data." }`.**
  - This mirrors daily-health-logs. No live caller sends that request.
- **Q4: `/analytics/summary` `top_performers` / `at_risk` are out of scope.** People S1 owns that decision; the module header records it.
- **Q5: no staging run; verify on prod (step 20).**
  - Only read gates change and there is no schema change.
  - The one new 403 is never hit by a live caller.
  - Staging has no global admin, so that path can't be tested there anyway.
  - Rollback is reverting one commit.

## Steps — backend

1. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/memberVisibility.js`, with this complete content:
```js
// utils/memberVisibility.js — the ONE rule for who may see which member's data.
// program-memberships D-C5 (0.3.0) · reliability-overhaul Phase 4 S0 (People D-P8 a). Every per-person read asks
// canView(viewer, targetMemberId, kind); the routes keep their own status codes + messages.
//
//   staff        = an ACTIVE program_memberships row with role "admin" or "logger"
//   global admin = members.global_role === "global_admin" — passes every kind
//
//   kind         who may see it (besides a global admin)
//   "email"      the member themselves                       (GET /api/members/:id)
//   "directory"  nobody                                      (GET /api/members)
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
```

2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/members.js`:
   - **Line 2.** Replace `// GET / + GET /:id: any authenticated member. POST / + DELETE /:id: admin only. PUT /:id: the` with these two lines:
     ```js
     // GET / + GET /:id: any authenticated member, but the list is global-admin-only and `email` self-or-global-admin
     // (members D-C3, utils/memberVisibility). POST / + DELETE /:id: admin only. PUT /:id: the
     ```
   - **Line 14** becomes `const members = await memberService.getAllMembers(req.user);`
   - **Line 25** becomes `const member = await memberService.getMemberById(req.params.id, req.user);`

3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberService.js`:
   - After line 8 (`// (invites/notifications/membership-exit) is owned by those features + wired when they are ported.`), insert:
     ```js
     // D-C3 (0.4.0, Phase 4 S0 / People D-P8 a): getAllMembers is global-admin-only ([] otherwise) and getMemberById
     // returns `email` only to the member themselves or a global admin (null otherwise) — rules in utils/memberVisibility.
     ```
   - After line 14 (`const { AppError } = require("../utils/response");`), insert:
     ```js
     const { loadViewer, canView } = require("../utils/memberVisibility");
     ```
   - Replace the `getAllMembers` and `getMemberById` functions (current lines 16–46) with:
```js
// D-C3: the full directory is global-admin-only. Everyone else gets [] — 200 with the same array shape, never a
// 403: live iOS calls this on launch/login before any program is open (ProgramContext+Members.swift loadLookupData),
// and a throw there would skip its workouts/programs refresh.
async function getAllMembers(user) {
    const viewer = await loadViewer(user);
    if (!canView(viewer, null, "directory")) return [];
    return Member.findAll({
        where: { global_role: "standard" },
        order: [["first_name", "ASC"]],
        // exclude the migration-added auth_user_id so the response matches the legacy shape (D-S1).
        attributes: { exclude: ["auth_user_id"] }
    });
}

async function getMemberById(memberId, user) {
    const member = await Member.findByPk(memberId);
    if (!member) throw new AppError(404, "Member not found.");

    // Surface the primary email (read-only here; changing it goes through PUT /auth/email, not the
    // updateMember whitelist — SPEC members F6). Email lives in member_emails, not the members row.
    // D-C3: only to the member themselves or a global admin; everyone else gets email: null (same shape — every
    // client DTO already treats it as optional, and every live caller passes the viewer's own id).
    const showEmail = canView(await loadViewer(user), member.id, "email");
    const primaryEmail = showEmail
        ? await MemberEmail.findOne({ where: { member_id: memberId, is_primary: true } })
        : null;

    return {
        id: member.id,
        member_name: member.member_name,
        username: member.username,
        gender: member.gender,
        email: primaryEmail?.email ?? null,
        date_joined: member.date_joined,
        global_role: member.global_role,
        created_at: member.created_at,
        updated_at: member.updated_at
    };
}
```

4. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/memberships.js`:
   - **Line 26** becomes `const members = await membershipService.getProgramMembers(req.query.programId, req.user);`
   - **Line 37** becomes `const details = await membershipService.getMembershipDetails(req.query.programId, req.user);`

5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/membershipService.js` (keep the edit minimal):
   - After line 18 (`const { createNotification, getActiveProgramMemberIds } = require("../utils/notifications");`), insert:
     ```js
     const { loadViewer, canView } = require("../utils/memberVisibility");
     ```
   - Replace lines 122–123 (`async function getProgramMembers(programId) {` and its `400` line) with:
```js
// D-C5 (0.3.0, Phase 4 S0 / People D-P8 a): a roster only for the program's ACTIVE members + global admins. Anyone
// else gets [] (200, same shape) — a 403 would strand a removed member inside the program on live iOS (loadLookupData
// resets programId only after this call succeeds) and wipe web LogWorkoutsForm's Promise.all.
async function getProgramMembers(programId, user) {
    if (!programId) throw new AppError(400, "programId is required");
    if (!canView(await loadViewer(user, programId), null, "roster")) return [];
```
   - Replace lines 146–147 (`async function getMembershipDetails(programId) {` and its `400` line) with:
```js
// D-C5: same roster rule as getProgramMembers.
async function getMembershipDetails(programId, user) {
    if (!programId) throw new AppError(400, "programId is required");
    if (!canView(await loadViewer(user, programId), null, "roster")) return [];
```
   - Leave the rest of both functions as they are.

6. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberAnalyticsService.js` (keep edits minimal):
   - **a.** Replace lines 1–26 (the imports, `ensureProgramAccess`, the D-C3 comment and `assertMemberAccess`) with:
```js
const { Op } = require("sequelize");
const { WorkoutLog, Member, Program, ProgramMembership, ProgramWorkout, DailyHealthLog } = require("../models");
const { AppError } = require("../utils/response");
const { resolveTimelineWindow, buildBuckets, bucketKey } = require("./analyticsService");
const { loadViewer, hasProgramAccess, canView, redactMetricsRow } = require("../utils/memberVisibility");

// D-C3 — shared requester-access + target-enrolled prelude for the single-member routes
// (history / streaks / recent). Faithful: every 400/403/404 status + message preserved 1:1.
// D-C8 — the access rule comes from utils/memberVisibility (global admin, or an ACTIVE membership — was the local
// ensureProgramAccess), and the target passes canView(…, "workouts"): always true in Phase 4 S0, it is where People
// S1's "Hide my activity" takes effect. getMemberMetrics keeps its own inline checks (different shape + 403 message).
const assertMemberAccess = async (programId, memberId, user) => {
    if (!programId || !memberId) throw new AppError(400, "programId and memberId are required.");
    const viewer = await loadViewer(user, programId);
    if (!hasProgramAccess(viewer)) throw new AppError(403, "Access denied. Active program membership required.");
    const targetMembership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: memberId, status: "active" }
    });
    if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");
    if (!canView(viewer, memberId, "workouts")) {
        throw new AppError(403, "Access denied. Active program membership required.");
    }
};
```
   - **b.** In `getMemberMetrics`, replace these two lines:
     ```js
     const hasAccess = await ensureProgramAccess(user.id, user.global_role, programId);
     if (!hasAccess) throw new AppError(403, "Access denied. Program membership required.");
     ```
     with:
```js
    const viewer = await loadViewer(user, programId);
    if (!hasProgramAccess(viewer)) throw new AppError(403, "Access denied. Program membership required.");
```
   - **c.** Insert this immediately BEFORE `let result = Array.from(metricsMap.values());` (after the averages loop closes):
```js
    // D-C8 (Phase 4 S0 / People D-P8 a): a plain member sees only their OWN sleep / diet / steps averages; staff (an
    // ACTIVE program admin or logger) and global admins see everyone's. Redacted BEFORE search / filter / sort so
    // neither the order nor a range filter can reveal a co-member's value.
    for (const entry of metricsMap.values()) redactMetricsRow(viewer, entry);

```
   - **d.** Make no other edits. History, streaks and recent already call `assertMemberAccess`.

7. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js`:
   - **a.** Replace lines 1–36 (the imports through the end of `requireProgramAccess`) with the block below. The `ProgramMembership` import is dropped because nothing else in the file uses it.
```js
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const analyticsService = require("../services/analyticsService");
const { AppError } = require("../utils/response");
const { loadViewer, hasProgramAccess, requireMemberView } = require("../utils/memberVisibility");

const v1Router = express.Router();
const v2Router = express.Router();

const PROGRAM_ACCESS_DENIED = "Access denied. Program membership required.";

// D-C8 (analytics 0.4.0) + D-C3 (analytics-v2 0.2.0) — program-scoped read authorization (reliability-overhaul
// D-3): a global_admin reads any program; anyone else needs an ACTIVE program_memberships row (any role) for
// ?programId. D-C9 (0.5.0): the rule + the single indexed lookup come from utils/memberVisibility (none for a global
// admin), and the viewer is kept on req.viewer for the per-member guards below. Pass-through when programId is
// absent so the service still answers its native 400 "programId is required". A non-string programId
// (?programId=a&programId=b → array) is refused: the services would aggregate every listed program.
// try/catch → next(err): Express 4 doesn't catch a rejected async middleware (a non-UUID programId makes the
// UUID lookup throw) — the shared errorHandler answers 500 and the process stays up.
const requireProgramAccess = async (req, res, next) => {
    try {
        req.viewer = await loadViewer(req.user, req.query.programId);
        if (!req.query.programId || hasProgramAccess(req.viewer)) return next();
        return res.status(403).json({ error: PROGRAM_ACCESS_DENIED });
    } catch (err) {
        next(err);
    }
};

// D-C9 (0.5.0, Phase 4 S0 / People D-P8 a): another member's health (?memberId ≠ the viewer) only for staff (an
// ACTIVE program admin/logger) or a global admin. The "workouts" guard passes every program member in S0 — it is the
// People S1 "Hide my activity" hook (analytics-v2 D-C4). Both pass through when memberId is absent (program aggregate).
const requireHealthView = requireMemberView("health", "You can only view your own health data.");
const requireWorkoutsView = requireMemberView("workouts", PROGRAM_ACCESS_DENIED);
```
   - **b.** Insert the guard right after `requireProgramAccess` on exactly these 7 route lines:
     - `v1Router.get("/health/timeline", authenticateToken, requireProgramAccess, requireHealthView, async (req, res) => {`
     - `v1Router.get("/health/steps", authenticateToken, requireProgramAccess, requireHealthView, async (req, res) => {`
     - `v1Router.get("/workouts/types", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {`
     - `v2Router.get("/workouts/types/total", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {`
     - `v2Router.get("/workouts/types/most-popular", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {`
     - `v2Router.get("/workouts/types/longest-duration", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {`
     - `v2Router.get("/workouts/types/highest-participation", authenticateToken, requireProgramAccess, requireWorkoutsView, async (req, res) => {`
   - **c.** Every other route is unchanged.

8. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/logService.js` (edit only this check):
   - After line 4 (`const { AppError } = require("../utils/response");`), insert:
     ```js
     const { loadViewer, canView } = require("../utils/memberVisibility");
     ```
   - Inside `getDailyHealthLogs`, replace exactly:
```js
    const canLogForAny = await resolveLogPermissions(programId, requester);
    if (!canLogForAny && memberId !== requester?.id) {
        throw new AppError(403, "You can only view your own daily health logs.");
    }
```
     with:
```js
    // daily-health-logs D-C7 (0.4.0, Phase 4 S0 / People D-P8 a): the read rule is utils/memberVisibility "health" —
    // self, an ACTIVE program admin/logger, or a global admin. Both 403 messages kept 1:1; the write paths keep
    // resolveLogPermissions (which does not check status) unchanged.
    const viewer = await loadViewer(requester, programId);
    if (!viewer.isGlobalAdmin && !viewer.programRole) throw new AppError(403, "You are not enrolled in this program.");
    if (!canView(viewer, memberId, "health")) {
        throw new AppError(403, "You can only view your own daily health logs.");
    }
```
   - Leave `resolveLogPermissions` itself and its other call sites untouched.

9. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md`: after line 33 (`- Authorization (global_role, per-program admin/logger checks) stays in Express, unchanged from legacy.`), insert:
```markdown
- **Who sees whose data** (a member's email, the all-members list, program rosters, sleep / diet / steps, workouts) is
  one shared rule: `utils/memberVisibility.js` (`loadViewer` → `canView(viewer, target, kind)`). Contract + kinds:
  [`program-memberships`](../../specs/features/program-memberships/SPEC.md) D-C5.
```

## Steps — docs (SPEC / registry)

- Every new row is dated `2026-10-13`.
- Each new D-row goes in as a full table row at the stated anchor.
- Each changelog row goes in as the FIRST data row of §11, directly under that file's `|---------|------|--------|` line: members :178, program-memberships :225, member-analytics :245, analytics :249, analytics-v2 :223, daily-health-logs :322.

10. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/members/SPEC.md`:
   - **Line 3.** `**Version:** 0.3.0` becomes `**Version:** 0.4.0`.
   - **Lines 7–8 (header).** Replace them with:
     ```
     > **Two deliberate changes** (the rest is faithful): `createMember` now creates a **loginable** member via
     > Supabase Auth — see **§7** (decision **D-C2**); **D-C3** (0.4.0, Phase 4 S0) the directory is global-admin-only and `email` goes only to self or a global admin (same shapes).
     ```
   - **Line 18.** Replace `1. **Read the directory** — \`GET /api/members\` (list standard members), \`GET /api/members/:id\` (one` with:
     `1. **Read the directory** — \`GET /api/members\` (list standard members; global admins only since 0.4.0, D-C3), \`GET /api/members/:id\` (one`
   - **Line 41 (§3 row 1).** Replace the whole row with:
     ``| 1 | `GET /` | `members.js:8-17` → `getAllMembers` | `authenticateToken`; the list only for a **global admin**, anyone else `200 []` (D-C3) | List members where `global_role = 'standard'`, ordered `first_name ASC`. |``
   - **Line 42 (§3 row 2).** Replace the whole row with:
     ``| 2 | `GET /:id` | `members.js:19-28` → `getMemberById` | `authenticateToken`; `email` only to self or a global admin, anyone else `email: null` (D-C3) | One member's profile (hand-picked fields). 404 if missing. |``
   - **Line 119.** Change `## 7. The migration delta + the one deliberate change — the load-bearing part` to `## 7. The migration delta + the deliberate changes — the load-bearing part`.
   - **§7 "What changes".** Append this bullet after the `DELETE /:id` is WIRED bullet:
     `- **Privacy gate on the reads (D-C3, 0.4.0)** — the directory answers only a global admin (\`200 []\` otherwise); \`email\` only to self / a global admin (\`null\` otherwise).`
   - **Line 161 (D-REF).** Replace `**\`consumed_by = [web, ios]\`**` with:
     `~~\`consumed_by = [web, ios]\`~~ → **\`[web, ios, android]\`** (0.4.0 doc-lag fix: Android reads \`GET /:id\` + writes \`PUT /:id\`; only iOS calls \`GET /\`)`
   - **Line 162 (D-S1).** Replace `**Stance = faithful 1:1 except \`createMember\`.**` with `**Stance = faithful 1:1 except \`createMember\` (D-C2) + the 0.4.0 read gates (D-C3).**`
   - **After line 162,** insert:
     ``| **D-C3** | **Deliberate change (0.4.0) — privacy gate on the two reads (reliability-overhaul Phase 4 S0 / People D-P8 a).** `GET /` (the full directory) answers the list only to a **global admin**; anyone else gets **`200 []`** (same array shape; never 403, because live iOS 1.4.x/1.5.0 `loadLookupData` calls it at launch/login with no program open, and a throw would skip its workouts/programs refresh; nothing renders that list while no program is open). `GET /:id` returns `email` only to **the member themselves or a global admin**; anyone else gets the same object with **`email: null`** (every client DTO already treats `email` as optional; every live caller passes the viewer's own id). Rule kinds `"directory"` / `"email"` in the shared `utils/memberVisibility.js` (program-memberships D-C5). No 404 for a non-co-member: with the directory and rosters closed, another member's id is only learnable inside a shared program, whose roster already shows the same name/username/gender. | Phase 4 DECISIONS D-P8 (a); DISCOVERY §4 S0 + P-4; caller audit: web `program/profile/page.tsx`, iOS `MyProfileView.swift` + `ProgramContext+Members.swift` `loadLookupData` (HEAD and 1.4.2 `6294622`), Android `ProfileScreen.kt` (HEAD and 1.0.0 `cea59a5`). |``
   - **§11 (under line 178),** insert:
     ``| 0.4.0 | 2026-10-13 | **D-C3 — privacy gate on `GET /` + `GET /:id` (reliability-overhaul Phase 4 S0 / People D-P8 a).** `GET /` lists members only for a global admin (others `200 []`); `GET /:id` returns `email` only to self or a global admin (others `email: null`). Same routes + shapes; rule in the new shared `utils/memberVisibility.js` (program-memberships 0.3.0). Live binaries checked (iOS 1.4.2/1.5.0, Android 1.0.0/1.1.0, web): no screen changes. D-REF `consumed_by` lag fixed → `[web, ios, android]`; header count + D-S1 updated. **MINOR**; backend-only. |``

11. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/program-memberships/SPEC.md`:
   - **Line 3.** `**Version:** 0.2.0` becomes `**Version:** 0.3.0`.
   - **Lines 11–12 (header).** Replace them with:
     ```
     > **Three deliberate changes** (the rest is faithful): **D-C2** `createMemberAndEnroll` becomes a **loginable**
     > create (Supabase Auth); **D-C3** the two dead routes (`GET /available`, `POST /enroll`) are **dropped** — §7; **D-C5** (0.3.0, Phase 4 S0) rosters only for the program's ACTIVE members + global admins (others `200 []`), via the new owned `utils/memberVisibility.js` — the one visibility rule the other features import.
     ```
   - **§3 rows `| 2 | \`GET /members\`` and `| 3 | \`GET /details\`.** In each, replace the cell `any authenticated member` with `ACTIVE member of \`programId\` or \`global_admin\`; anyone else \`200 []\` (D-C5)`.
   - **Line 207 (D-REF).** Replace `**Reference impl = legacy \`backend\`. \`consumed_by = [web, ios]\`**` with:
     `**Reference impl = legacy \`backend\`. ~~\`consumed_by = [web, ios]\`~~ → \`[web, ios, android]\`** (0.3.0 doc-lag fix; header + registry already said so)`
   - **Line 208 (D-S1).** Make two edits:
     - Replace `**Stance = faithful except D-C2 (fix) + D-C3 (drop 2).**` with `**Stance = faithful except D-C2 (fix) + D-C3 (drop 2) + D-C5 (0.3.0 roster read gate + the shared visibility module).**`
     - Replace `the authz matrix, last-admin guard` with `the write authz matrix, last-admin guard`.
   - **After line 208,** insert:
     ``| **D-C5** | **Deliberate change (0.3.0) — roster privacy + the shared visibility module (reliability-overhaul Phase 4 S0 / People D-P8 a).** New owned util `utils/memberVisibility.js`: `loadViewer(user, programId)` (one composite-PK `program_memberships` lookup; none for a global admin or without a single string `programId`) → `{ id, isGlobalAdmin, programRole, isActiveMember, isStaff, hiddenMemberIds }`; `hasProgramAccess(viewer)`; `canView(viewer, targetMemberId, kind)` with kinds `email` (self) · `directory` (nobody) · `roster` (ACTIVE member) · `health` (self or staff) · `workouts` (self, staff, or an ACTIVE co-member not in `hiddenMemberIds`); a global admin passes every kind; **staff = an ACTIVE membership with role `admin` or `logger`**. Also `redactHealth` / `redactMetricsRow` (null `avg_sleep_hours`/`avg_food_quality`/`avg_steps`) and `requireMemberView(kind, message)`, an Express guard for `?memberId` routes. Imported by members, member-analytics, analytics, analytics-v2 and daily-health-logs (all already `depends_on` this feature). `GET /members` + `GET /details` answer the roster only to an ACTIVE member of `programId` or a global admin; anyone else gets **`200 []`** (missing `programId` still 400). Not 403, because live iOS `loadLookupData` resets a stale `programId` only after the roster call succeeds, web `LogWorkoutsForm` loads the roster inside a `Promise.all`, and Android's log/widget selector can ask for an invited program's roster (it then locks to self, as today). **People S1 hook:** "Hide my activity" (migration 012) fills `hiddenMemberIds` inside `loadViewer` and adds its workout-field redaction inside `redactMetricsRow`, which covers every read already routed here; `/analytics/summary` `top_performers` / `at_risk` (`analyticsService.js`) are not routed here, so if S1 drops hidden members there (Phase 4 Q4) that service changes too. | Phase 4 DECISIONS D-P7/D-P8; DISCOVERY §4 S0 + P-4/P-5; caller audit: web `members/page.tsx`, `lifestyle/page.tsx`, `LogWorkoutsForm.tsx`, `LogDailyHealthForm.tsx`, `program/page.tsx`, `program/roles/page.tsx`, `members/{detail,list}/page.tsx`; iOS `ProgramContext+Members.swift` + both quick-add widgets; Android `ProgramContext.kt`; same paths in iOS 1.4.2 `6294622` + Android 1.0.0 `cea59a5`. |``
   - **§11 (under line 225),** insert:
     ``| 0.3.0 | 2026-10-13 | **D-C5 — roster privacy + new owned util `utils/memberVisibility.js` (reliability-overhaul Phase 4 S0 / People D-P8 a).** `GET /members` + `GET /details` answer only an ACTIVE member of `programId` or a global admin; others `200 []` (same shape). The module is the single visibility rule for members / member-analytics / analytics / analytics-v2 / daily-health-logs and the People S1 hook. D-REF `consumed_by` lag fixed → `[web, ios, android]`; header count + D-S1 updated. **MINOR** (owned interface + `reference_impl` path added); dependents members 0.4.0, member-analytics 0.5.0, analytics 0.5.0, analytics-v2 0.2.1, daily-health-logs 0.4.0 bumped in the same change; other dependents don't import it. Backend-only. |``

12. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/member-analytics/SPEC.md`:
   - **Line 3.** `**Version:** 0.4.0` becomes `**Version:** 0.5.0`.
   - **Line 11.** Replace `(\`ensureProgramAccess\` + the active-membership roster)` with `(\`utils/memberVisibility.js\` access + visibility rules + the active-membership roster)`.
   - **After line 19** (`> member's steps-bearing days, rounded int — mirrors \`avg_sleep_hours\`).`), add:
     `> **Deliberate change D-C8** (0.5.0, Phase 4 S0): co-members' sleep / diet / steps averages are nulled for plain members; access checks come from the shared \`utils/memberVisibility.js\`.`
   - **Line 57.** Replace `(\`ensureProgramAccess\`: global-admin OR an active` with `(\`utils/memberVisibility.js\` \`hasProgramAccess\` since D-C8: global-admin OR an active`.
   - **Line 79.** Replace `from \`ensureProgramAccess\`` with `from the program-access check (\`utils/memberVisibility.js\` since D-C8)`.
   - **Line 84.** Replace `\`400\` if no \`programId\`; \`ensureProgramAccess\` → \`403\`;` with `\`400\` if no \`programId\`; \`loadViewer\` + \`hasProgramAccess\` → \`403\`;`.
   - **Line 90.** Replace `D-C5, mirrors avg sleep). Then` with `D-C5, mirrors avg sleep). **D-C8:** the three averages are then nulled on every row except the viewer's own unless the viewer is staff or a global admin. Then`.
   - **Line 97.** Replace `(\`ensureProgramAccess\` \`403\` + target-membership \`404 "not enrolled"\`)` with `(\`hasProgramAccess\` \`403\` + target-membership \`404 "not enrolled"\` + \`canView(…, "workouts")\`, D-C8)`.
   - **Lines 112–113.** Replace the whole `ensureProgramAccess` bullet (both lines) with:
     `- **~~\`ensureProgramAccess(userId, globalRole, programId)\`~~** — retired at D-C8 (0.5.0): the same rule (\`global_admin\` OR an active \`ProgramMembership\`) is now \`loadViewer\` + \`hasProgramAccess\` in the shared \`utils/memberVisibility.js\` (program-memberships D-C5). The per-program read gate (§10 F1).`
   - **Line 136.** Replace `active roster (metrics) + \`ensureProgramAccess\` + target-enrolled \`404\` checks.` with `active roster (metrics) + the viewer's membership (\`utils/memberVisibility.js\` \`loadViewer\`, D-C8) + target-enrolled \`404\` checks.`
   - **Line 167.** Replace `\`ensureProgramAccess\` (\`403\`) → target-membership` with `\`ensureProgramAccess\` (\`403\`; \`utils/memberVisibility.js\` since D-C8) → target-membership`.
   - **Line 226 (D-S1).** Replace `except D-C2/D-C3/D-C4 + the additive D-C5.**` with `except D-C2/D-C3/D-C4 + the additive D-C5 + the D-C8 health-average redaction (0.5.0).**`
   - **After line 227 (D-C7),** insert:
     ``| **D-C8** | **Deliberate change (0.5.0) — co-members' health averages hidden (reliability-overhaul Phase 4 S0 / People D-P8 a).** `getMemberMetrics` nulls `avg_sleep_hours` / `avg_food_quality` / `avg_steps` on every row except the viewer's own unless the viewer is staff (an ACTIVE program admin or logger) or a global admin (`redactMetricsRow`, shared `utils/memberVisibility.js`). Redacted right after the averages are computed and **before** search / range filters / sort, so a sort or filter on those fields cannot reveal a co-member's value (F5's `?? 0` then treats them as 0). Workout fields untouched. `ensureProgramAccess` is replaced by the module's `loadViewer` + `hasProgramAccess` (same rule, statuses and messages; a repeated `?programId` from a non-admin is now refused, like analytics D-C8); history / streaks / recent also pass `canView(…, "workouts")`, always true in S0 and the People S1 "Hide my activity" hook. Same response shape; every client DTO already types the three fields nullable; plain-member apps (iOS `StandardMembersTab`, Android `MembersScreen`, web own-id call) read only their own row. | Phase 4 DECISIONS D-P8; DISCOVERY P-5; nullable fields in iOS `APIClient+Members.swift` / Android `Dtos.kt` / web `lib/api/members.ts`; same call paths in iOS 1.4.2 `6294622` + Android 1.0.0 `cea59a5`. |``
   - **Line 233 (F1).** Make two edits:
     - Replace `(\`ensureProgramAccess\`: global-admin OR active membership)` with `(\`utils/memberVisibility.js\` \`hasProgramAccess\`: global-admin OR active membership; was \`ensureProgramAccess\` until D-C8)`.
     - Replace the Where cell `\`memberAnalyticsService.js:6-13\` (called by all 4 fns)` with `\`utils/memberVisibility.js\` (called by all 4 fns)`.
   - **§11 (under line 245),** insert:
     ``| 0.5.0 | 2026-10-13 | **D-C8 — co-members' health averages hidden from plain members (reliability-overhaul Phase 4 S0 / People D-P8 a).** `GET /api/member-metrics` nulls `avg_sleep_hours`/`avg_food_quality`/`avg_steps` on co-members' rows unless the viewer is an ACTIVE program admin/logger or a global admin; applied before search/filter/sort. Access checks now come from the shared `utils/memberVisibility.js` (program-memberships 0.3.0) with every status + message kept; `ensureProgramAccess` retired (§4/§5/§7/F1 refs updated); history/streaks/recent route through `canView("workouts")` (no change in S0; People S1 hook). Same shape; live binaries checked. **MINOR**; backend-only. |``

13. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics/SPEC.md`:
   - **Line 3.** `**Version:** 0.4.0` becomes `**Version:** 0.5.0`.
   - **Header.**
     - Change `**Deliberate changes (7, the rest faithful 1:1):**` to `**Deliberate changes (8, the rest faithful 1:1):**`.
     - Directly after `(reliability-overhaul D-3)` (in front of `. Read-only aggregation`), insert ` · **D-C9** (0.5.0) another member's health timeline / steps only for staff or a global admin (Phase 4 S0)`.
   - **§3 row 6 (`GET /health/timeline`).** Replace `optional \`memberId\`.` with `optional \`memberId\` (another member's id needs staff or a global admin, D-C9).`
   - **§3 row 9 (line 81).** Replace `(same role-scoping idiom as \`/health/timeline\`)` with `(another member's id needs staff or a global admin, D-C9)`.
   - **Error contract.** After `or \`programId\` is not a single string),`, insert:
     ` \`403 { error: "You can only view your own health data." }\` (D-C9: \`/health/timeline\` or \`/health/steps\` with another member's \`memberId\` from a viewer who is not staff or a global admin),`
   - **Line 227 (D-C5).** Replace `role-scoped via the existing optional-\`memberId\` idiom.` with `role-scoped via the existing optional-\`memberId\` idiom (client-side only until **D-C9**, 0.5.0, enforced it on the server).`
   - **After line 230 (D-C8),** insert:
     ``| **D-C9** | **Deliberate change (0.5.0) — per-member health reads are self-or-staff (reliability-overhaul Phase 4 S0 / People D-P8 a).** `/health/timeline` and `/health/steps` with a `memberId` other than the viewer's own answer **`403 { error: "You can only view your own health data." }`** unless the viewer is staff (an ACTIVE program admin or logger) or a global admin. Without `memberId` (the program aggregate) nothing changes. Until now the "role scoping" in row 9 / D-C5 existed only in the clients. `requireProgramAccess` delegates to the shared `utils/memberVisibility.js` (`loadViewer` + `hasProgramAccess`; same 403 / pass-through / `next(err)`, still one lookup, none for a global admin) and keeps `req.viewer`; the guard is the module's `requireMemberView("health", …)`. `/workouts/types` routes `memberId` through `requireMemberView("workouts", …)`, which always passes in S0 (People S1 hook). **Live-binary safe:** plain members and loggers always send their own id or none (web `lifestyle/page.tsx` view-as is program-admin/global-admin only; iOS `StandardWorkoutTypesTab` sends `userId`; Android `LifestyleScreen` sends `loggedInMemberId` unless program admin; same in iOS 1.4.2 and Android 1.0.0). | Phase 4 DECISIONS D-P8; DISCOVERY P-4; `routes/analytics.js`; caller audit. |``
   - **Line 232 (D-S1).** Make two edits:
     - Replace `, and the 0.4.0 program-membership read gate (D-C8).**` with `, the 0.4.0 program-membership read gate (D-C8), and the 0.5.0 per-member health gate (D-C9).**`
     - Replace `ahead of every handler; D-C5 only ADDS` with `ahead of every handler and D-C9 adds \`403 { error: "You can only view your own health data." }\` on \`/health/timeline\` + \`/health/steps\` for another member's \`memberId\`; D-C5 only ADDS`.
   - **§11 (under line 249),** insert:
     ``| 0.5.0 | 2026-10-13 | **D-C9 — another member's health timeline/steps only for staff or a global admin (reliability-overhaul Phase 4 S0 / People D-P8 a).** New `403 { error: "You can only view your own health data." }` on `/health/timeline` + `/health/steps` when `memberId` ≠ the viewer and the viewer is not an ACTIVE program admin/logger or global admin; program aggregates unchanged. `requireProgramAccess` delegates to the shared `utils/memberVisibility.js` (program-memberships 0.3.0), behavior unchanged; `/workouts/types` gains the no-op S0 `"workouts"` guard (People S1 hook). Fixes the row-9 / D-C5 "role-scoped" wording (it was client-side only). No live caller hits the new 403. **MINOR**; backend-only. |``

14. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics-v2/SPEC.md`:
   - **Line 3.** `**Version:** 0.2.0` becomes `**Version:** 0.2.1`.
   - **After line 17** (`> + response shapes are ported verbatim.`, which closes the header sentence), add:
     `> **D-C4** (0.2.1, Phase 4 S0): the \`/workouts/types/*\` \`memberId\` passes the shared \`utils/memberVisibility.js\` \`"workouts"\` check. Behavior-neutral now; it is the People S1 hook.`
   - **After line 205 (D-C3),** insert:
     ``| **D-C4** | **Behavior-neutral hook (0.2.1, reliability-overhaul Phase 4 S0).** The 4 `/workouts/types/*` routes run the shared `requireMemberView("workouts", "Access denied. Program membership required.")` from `utils/memberVisibility.js` after `requireProgramAccess` (which now delegates to the same module, analytics D-C9). In S0 every caller that passed the program gate passes it, so responses are unchanged; it is where People S1's "Hide my activity" takes effect. | Phase 4 DECISIONS D-P7; analytics D-C9; program-memberships D-C5. |``
   - **Line 207 (D-S1).** Replace `except D-C2 and D-C3.` with `except D-C2 and D-C3 (plus the behavior-neutral D-C4 hook).`
   - **§11 (under line 223),** insert:
     ``| 0.2.1 | 2026-10-13 | **D-C4 — `/workouts/types/*` `memberId` routed through the shared `utils/memberVisibility.js` `"workouts"` check (reliability-overhaul Phase 4 S0).** Behavior-neutral in S0 (every program member passes); the People S1 hook. `requireProgramAccess` delegates to the same module (analytics 0.5.0). **PATCH**; backend-only. |``

15. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/daily-health-logs/SPEC.md`:
   - **Line 3.** `**Version:** 0.3.0` becomes `**Version:** 0.4.0`.
   - **Line 14.** Replace `**Deliberate changes (5, the rest faithful):**` with `**Deliberate changes (6, the rest faithful):**`.
   - **Line 20.** Replace `no route here reads or returns them. Everything else is faithful` with `no route here reads or returns them · **D-C7** (0.4.0, Phase 4 S0) reading another member's logs needs an ACTIVE program admin/logger or a global admin. Everything else is faithful`.
   - **§3 row `| 3 | \`GET /\``.** Replace the cell `self; admin/logger for others` with `self; an ACTIVE admin/logger or a global admin for others (D-C7)`.
   - **After line 303 (D-C6),** insert:
     ``| **D-C7** | **Deliberate change (0.4.0) — reading another member's logs needs ACTIVE staff (reliability-overhaul Phase 4 S0 / People D-P8 a).** `GET /` uses the shared `utils/memberVisibility.js` (`loadViewer` + `canView(…, "health")`): self, an ACTIVE program admin/logger, or a global admin. A viewer with no membership row keeps `403 "You are not enrolled in this program."`; a non-staff viewer asking for someone else keeps `403 "You can only view your own daily health logs."`. The one change: an admin or logger whose membership is **`removed`** (incl. one who left — `PUT /leave` sets `removed`), **`invited`** or **`requested`** now gets that second 403 instead of the member's rows (`resolveLogPermissions` never checked status). The write routes keep `resolveLogPermissions` unchanged. Every live caller (web `members/page.tsx`, `members/health/page.tsx`; iOS `ProgramContext+Members.swift`; Android `ProgramContext.kt`; logger view-as) is an active member of the open program. | Phase 4 DECISIONS D-P8; DISCOVERY P-4 (`logService.js` health read); `001_schema.sql:85` status CHECK; program-memberships D-C5. |``
   - **Line 305 (D-S1).** Replace `the deliberate changes D-C4/D-C5/D-C6**` with `the deliberate changes D-C4/D-C5/D-C6/D-C7**`.
   - **§11 (under line 322),** insert:
     ``| 0.4.0 | 2026-10-13 | **D-C7 — `GET /` for another member requires an ACTIVE program admin/logger or a global admin (reliability-overhaul Phase 4 S0 / People D-P8 a).** The read check moves to the shared `utils/memberVisibility.js` (program-memberships 0.3.0); both 403 messages kept; staff whose membership is `removed` (incl. left) / `invited` / `requested` can no longer read co-members' logs. Writes unchanged. Live callers unaffected. **MINOR**; backend-only. |``

16. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`:
   - Set `version`:
     - `members` → `"0.4.0"`
     - `program-memberships` → `"0.3.0"`
     - `member-analytics` → `"0.5.0"`
     - `analytics` → `"0.5.0"`
     - `analytics-v2` → `"0.2.1"`
     - `daily-health-logs` → `"0.4.0"`
   - In `program-memberships.reference_impl.paths`, insert `"utils/memberVisibility.js"` after `"utils/programMemberships.js"`.
   - Leave `workout-logs` at `0.6.0`.
   - No `depends_on` / `consumed_by` edits: every importer already lists `program-memberships` in `depends_on`.

17. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`:
   - Version cells:
     - line 14 members → `0.4.0`
     - line 16 program-memberships → `0.3.0`
     - line 22 daily-health-logs → `0.4.0`
     - line 23 analytics → `0.5.0`
     - line 24 analytics-v2 → `0.2.1`
     - line 25 member-analytics → `0.5.0`
   - Line 16 Reference-impl cell: insert `` `utils/memberVisibility.js`, `` after `` `utils/programMemberships.js`, ``.

## Endgame

18. **Compile / boot check (backend only).** Web, Android and iOS are untouched, so there is no client gate and no Xcode ⌘B needed. Run from `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`.
   - The `node -e` line carries DUMMY, non-secret env values because `config/supabase.js:71` calls `createClient(SUPABASE_URL, …)` when the module loads.
   - The dummy `DATABASE_URL` also keeps the prod URL out of the process. dotenv does not override variables that are already set, and no `.env.local` exists.
   - Sequelize opens no connection when the modules are loaded. I ran exactly this prefix: all 5 routers loaded and the command exited 0.
```zsh
for f in utils/memberVisibility.js routes/members.js services/memberService.js routes/memberships.js services/membershipService.js services/memberAnalyticsService.js routes/analytics.js services/logService.js; do node -c "$f" || echo "SYNTAX FAIL $f"; done
SUPABASE_URL=https://example.invalid SUPABASE_SERVICE_ROLE_KEY=x DATABASE_URL=postgres://u:p@127.0.0.1:1/x node -e '
const assert = require("assert");
require("./routes/members"); require("./routes/memberships"); require("./routes/memberAnalytics"); require("./routes/logs");
const { v1Router, v2Router } = require("./routes/analytics");
const n = (r, p) => r.stack.find((l) => l.route && l.route.path === p).route.stack.length;
assert.strictEqual(n(v1Router, "/health/timeline"), 4); assert.strictEqual(n(v1Router, "/health/steps"), 4);
assert.strictEqual(n(v1Router, "/workouts/types"), 4); assert.strictEqual(n(v1Router, "/summary"), 3);
for (const p of ["/workouts/types/total","/workouts/types/most-popular","/workouts/types/longest-duration","/workouts/types/highest-participation"]) assert.strictEqual(n(v2Router, p), 4, p);
const { canView, redactMetricsRow } = require("./utils/memberVisibility");
const v = (o) => ({ id: "me", isGlobalAdmin: false, programRole: null, isActiveMember: false, isStaff: false, hiddenMemberIds: new Set(), ...o });
const ga = v({ isGlobalAdmin: true }), member = v({ programRole: "member", isActiveMember: true }),
  logger = v({ programRole: "logger", isActiveMember: true, isStaff: true }), exStaff = v({ programRole: "admin" }), outsider = v({});
for (const k of ["email","directory","roster","health","workouts"]) assert.strictEqual(canView(ga, "other", k), true, k);
assert.strictEqual(canView(member, "me", "email"), true); assert.strictEqual(canView(member, "other", "email"), false);
assert.strictEqual(canView(member, null, "directory"), false);
assert.strictEqual(canView(member, null, "roster"), true); assert.strictEqual(canView(outsider, null, "roster"), false); assert.strictEqual(canView(exStaff, null, "roster"), false);
assert.strictEqual(canView(member, "me", "health"), true); assert.strictEqual(canView(member, "other", "health"), false);
assert.strictEqual(canView(logger, "other", "health"), true); assert.strictEqual(canView(exStaff, "other", "health"), false); assert.strictEqual(canView(exStaff, "me", "health"), true);
assert.strictEqual(canView(member, "other", "workouts"), true); assert.throws(() => canView(member, "x", "bogus"));
const row = { member_id: "other", avg_sleep_hours: 7.5, avg_food_quality: 4, avg_steps: 9000, workouts: 3 }; redactMetricsRow(member, row);
assert.deepStrictEqual([row.avg_sleep_hours, row.avg_food_quality, row.avg_steps, row.workouts], [null, null, null, 3]);
const own = { member_id: "me", avg_sleep_hours: 7.5, avg_food_quality: 4, avg_steps: 9000 }; redactMetricsRow(member, own); assert.strictEqual(own.avg_steps, 9000);
console.log("S0 boot + rule matrix OK"); process.exit(0);'
```
   - Pass = no `SYNTAX FAIL` lines and the output `S0 boot + rule matrix OK`.
   - Do NOT run `node server.js` locally: it connects to the prod DB and starts the timers.
   - The route-stack counts assume each guarded route is `authenticateToken` + `requireProgramAccess` + guard + handler (4); `/summary` keeps 3.

19. **Migration: none.** 013 is not used. No DB writes.

20. **Deploy and verify on prod (no staging, Q5).**
   - Push to `main`; Render auto-deploys `apps/backend/**`. Confirm the deploy is live with the render MCP (read only, pass `workspaceId`).
   - The implementer writes the script below to its session scratchpad (NOT the repo) as `verify-s0.mjs`. It only logs in and runs GETs: `POST /auth/login/app` (session only) plus reads.
   - The USER runs it in their zsh terminal:
     `read -rs "TESTBED_PASSWORD?Testbed password: "; echo; export TESTBED_PASSWORD; node <scratchpad>/verify-s0.mjs`
```js
const API = "https://rasifiters-api.onrender.com/api", PW = process.env.TESTBED_PASSWORD;
if (!PW) { console.error("TESTBED_PASSWORD not set"); process.exit(2); }
let fails = 0; const check = (l, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${l} ${x}`); if (!ok) fails++; };
async function call(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {} return { status: r.status, data };
}
async function login(u) { const r = await call("POST", "/auth/login/app", null, { identifier: u, password: PW });
  if (r.status !== 200) throw new Error(`login ${u} → ${r.status}`); return { token: r.data.access_token || r.data.token, id: r.data.member_id || r.data.user?.id }; }
const H = ["avg_sleep_hours", "avg_food_quality", "avg_steps"], hasH = (r) => H.some((f) => r[f] != null);
const ava = await login("ava.rivera"), aria = await login("aria.shah");
const progs = (await call("GET", "/programs", ava.token)).data || []; const P = (n) => progs.find((p) => p.name === n);
const winter = P("RaSi Winter Reset"), spring = P("RaSi Spring Shred"), summer = P("RaSi Summer Strong");
if (!(winter && spring && summer)) throw new Error("testbed programs missing");
const roster = async (pid, t) => (await call("GET", `/program-memberships/members?programId=${pid}`, t));
const otherIn = async (pid) => ((await roster(pid, ava.token)).data || []).find((m) => m.id !== ava.id).id;
const dir = await call("GET", "/members", ava.token); check("GET /members non-GA → 200 []", dir.status === 200 && Array.isArray(dir.data) && dir.data.length === 0);
const me = await call("GET", `/members/${ava.id}`, ava.token); check("GET /members/:self → email", me.status === 200 && typeof me.data?.email === "string");
const sOther = await otherIn(summer.id);
const them = await call("GET", `/members/${sOther}`, ava.token); check("GET /members/:other → email null", them.status === 200 && them.data?.email === null && !!them.data?.username);
check("summer roster (member) full", ((await roster(summer.id, ava.token)).data || []).length >= 2);
const mm = (pid, t) => call("GET", `/member-metrics?programId=${pid}&sort=active_days&direction=desc`, t);
const sm = await mm(summer.id, ava.token); check("summer metrics (member) 200", sm.status === 200);
check("summer metrics: co-members' health null", (sm.data?.members || []).filter((r) => r.member_id !== ava.id).every((r) => !hasH(r)));
const q = (p, pid, mid) => `${p}?programId=${pid}${mid ? `&memberId=${mid}` : ""}`;
check("summer health/timeline other → 403", (await call("GET", q("/analytics/health/timeline", summer.id, sOther) + "&period=week", ava.token)).status === 403);
check("summer health/timeline self → 200", (await call("GET", q("/analytics/health/timeline", summer.id, ava.id) + "&period=week", ava.token)).status === 200);
check("summer health/timeline program → 200", (await call("GET", q("/analytics/health/timeline", summer.id) + "&period=week", ava.token)).status === 200);
check("summer health/steps other → 403", (await call("GET", q("/analytics/health/steps", summer.id, sOther), ava.token)).status === 403);
check("summer daily-health-logs other → 403", (await call("GET", q("/daily-health-logs", summer.id, sOther), ava.token)).status === 403);
check("summer workouts/types other → 200", (await call("GET", q("/analytics/workouts/types", summer.id, sOther), ava.token)).status === 200);
check("summer v2 types/total other → 200", (await call("GET", q("/analytics-v2/workouts/types/total", summer.id, sOther), ava.token)).status === 200);
check("summer member-recent other → 200", (await call("GET", q("/member-recent", summer.id, sOther), ava.token)).status === 200);
for (const [label, prog] of [["spring (logger)", spring], ["winter (admin)", winter]]) {
  const o = await otherIn(prog.id); const m = await mm(prog.id, ava.token);
  const any = (m.data?.members || []).some((r) => r.member_id !== ava.id && hasH(r));
  console.log(`${any ? "PASS" : "WARN (no seeded health?)"}  ${label} metrics: co-members' health visible`);
  check(`${label} health/steps other → 200`, (await call("GET", q("/analytics/health/steps", prog.id, o), ava.token)).status === 200);
  check(`${label} daily-health-logs other → 200`, (await call("GET", q("/daily-health-logs", prog.id, o), ava.token)).status === 200);
}
const ar = await roster(winter.id, aria.token); check("aria winter roster → 200 []", ar.status === 200 && ar.data.length === 0);
const ad = await call("GET", `/program-memberships/details?programId=${winter.id}`, aria.token); check("aria winter details → 200 []", ad.status === 200 && ad.data.length === 0);
check("aria winter metrics → 403 (unchanged)", (await mm(winter.id, aria.token)).status === 403);
check("aria spring roster full", ((await roster(spring.id, aria.token)).data || []).length >= 2);
console.log(fails ? `${fails} FAIL` : "ALL PASS"); process.exit(fails ? 1 : 0);
```
   - **USER checks:**
     - **As a global admin on web at the apex `rasifiters.com`:**
       - Program → Members list shows everyone.
       - My Profile shows your email.
       - Lifestyle "View as" another member shows their sleep and steps.
       - Members metrics shows everyone's averages.
     - **On your phones as a plain member** (iOS 1.5.0 TestFlight / App Store 1.4.2; Android internal 1.1.0 / production 1.0.0): the Members and Lifestyle tabs load with no error banner.
   - **Rollback:** revert the commit and push; Render redeploys. There is no data impact.

21. **git-version.** One commit (code and docs together; this is a single-track backend landing), e.g. `feat(backend): Phase 4 S0 privacy fix — shared utils/memberVisibility.js`.
   - **Tags, created after the commit lands on `main` and pushed by name, never `--tags`:**
     - `feature/members@v0.4.0`
     - `feature/program-memberships@v0.3.0`
     - `feature/member-analytics@v0.5.0`
     - `feature/analytics@v0.5.0`
     - `feature/analytics-v2@v0.2.1`
     - `feature/daily-health-logs@v0.4.0`
   - **MINOR ×5.** members, member-analytics, analytics and daily-health-logs get new authorization behavior. program-memberships is a **contract change** (new owned interface plus a `reference_impl` path), so the blast-radius gate applies: the user acknowledges.
     - Its dependents that don't import the module are unaffected: programs, invites, notifications, workout-logs, health-sync and the others.
   - **PATCH.** analytics-v2 (behavior-neutral hook).
   - **No bump: workout-logs.** git-version's touched-feature detection flags it because `services/logService.js` is also in its `reference_impl.paths`. Only `getDailyHealthLogs` (daily-health-logs) changed; the workout write and read paths and `resolveLogPermissions` are untouched.
     - The commit body says: "no bump for workout-logs (shares services/logService.js; only the daily-health read check moved)".
   - `apps/backend/CONTEXT.md`, `registry.json` and `REGISTRY.md` count as docs, not feature bumps.
   - Client app versions are NOT bumped (no client change; the repo stays pre-bumped at iOS 1.5.1 (59) / Android versionCode 6).

## Risks the implementer must watch
- **No surface needs a parity change.** The redactions themselves are the only per-viewer differences. Do NOT touch any client file.
- **Keep every existing status code and message.**
  - daily-health-logs keeps its 403 order: "not enrolled" first, then "only your own".
  - Analytics `requireProgramAccess` must still pass a missing `programId` through (so the service answers its own 400) and still 403 a non-string one.
- **Two intended tightenings. They hit malformed or stale access only; call them out, don't "fix" them.**
  - A repeated `?programId` from a non-global-admin is now refused on member-metrics, member-history, member-streaks, member-recent and daily-health-logs. Today it IN-matches and can read another program's metrics.
  - An admin or logger whose membership is `removed` (which includes leaving; there is no `left` status), `invited` or `requested` loses read access to co-members' health logs.
- **Redact BEFORE search/filter/sort** in `getMemberMetrics`. Placing it after `result.sort` would leak the order. Mutating the `metricsMap` values in place is intentional: `result` holds the same objects.
- **Stale role on live apps.** A program admin demoted while their app still has "admin" cached will get 403 from Lifestyle "View as" until the program reloads. That 403 is the fix working, and it is acceptable. Web view-as uses fresh `my_role` from `/programs`.
- **`requireMemberView` relies on `req.viewer`.** Never mount it without `requireProgramAccess` in front of it; otherwise everyone, global admins included, gets 403.
- **Left for People S1:**
  - A repeated (array) `?memberId` would skip the `hiddenMemberIds` check. S1 must refuse a non-string `memberId` when it adds hiding.
  - `/analytics/summary` `top_performers` / `at_risk` still name members with their workout counts and are not routed through the module (Q4).
  - Program-wide health averages in very small programs still reveal individuals. This is accepted and out of scope.
- **Residual after S0:** a member who learns another member's UUID (only possible through shared programs, invites or notifications) can still read that member's name, username and gender via `GET /members/:id`, but never their email (Q2).
- **No committed test files.** `package.json` "test" stays a stub. The rule matrix lives in the inline `node -e` in step 18, and the prod check script lives in the scratchpad only.
- **Doc edits:** line numbers are pre-edit, so anchor on the quoted text. Don't renumber or reorder existing D-rows.

## Route-by-route outcome

| Route | Who gets full data after the fix | What everyone else gets | Callers checked (HEAD and live binaries) |
|---|---|---|---|
| `GET /api/members` | Global admin | **200 `[]`** (never 403) | iOS `ProgramContext+Members.swift` `loadLookupData`, no program open (HEAD/1.5.0 on launch and foreground; 1.4.2 on login/refresh at `6294622`). The list isn't rendered without a program. No web or Android caller (HEAD, `cea59a5`) |
| `GET /api/members/:id` | Self or global admin (incl. `email`) | Same object, **`email: null`** | Web `program/profile/page.tsx:75`, iOS `MyProfileView` (`fetchMemberById`), Android `ProfileScreen.kt` (HEAD and 1.0.0). All pass the viewer's own id; `email` is optional in every DTO |
| `GET /api/program-memberships/members` | ACTIVE member of `programId`, or global admin | **200 `[]`** (missing `programId` still 400) | Web `members/page.tsx`, `lifestyle/page.tsx`, `LogWorkoutsForm.tsx`, `LogDailyHealthForm.tsx`; iOS `ProgramContext+Members.swift:21` (same in 1.4.2); Android `ProgramContext.kt` (HEAD and `cea59a5`). When an Android selector asks for an invited program it gets `[]` and stays locked to logging for self, as today |
| `GET /api/program-memberships/details` | Same as above | **200 `[]`** | Web `program/page.tsx`, `program/roles/page.tsx`, `members/detail/page.tsx`, `members/list/page.tsx`; iOS `ProgramContext+Members.swift:262` + both quick-add widgets (`try?`); Android `ProgramContext.kt` (HEAD and 1.0.0) |
| `GET /api/member-metrics` | Global admin, or ACTIVE program admin/logger | Plain active member: all rows, with **`avg_sleep_hours` / `avg_food_quality` / `avg_steps` null except on their own row**. Non-member: 403 (unchanged) | Web `members/page.tsx` (admin list / own id), `members/metrics/page.tsx` (admin-only entry); iOS `StandardMembersTab` (keeps own row), `MemberMetricsDetailView` (admins only); Android `MembersScreen` (same in `cea59a5`). The fields are nullable in every DTO |
| `GET /api/analytics/health/timeline`, `/health/steps` | No `memberId`: any active member. With `memberId`: self, staff or global admin | **403 "You can only view your own health data."** | Web `lifestyle` pages (view-as only for program admins / global admins); iOS `StandardWorkoutTypesTab` (own `userId`, same in 1.4.2), `AdminWorkoutTypesTab` (program admins); Android `LifestyleScreen` (own id unless program admin; same in `cea59a5`). No live caller hits the 403 |
| `GET /api/daily-health-logs` | Self, ACTIVE admin/logger, or global admin | 403 with both messages unchanged; staff whose membership is `removed` / `invited` / `requested` are now refused | Web `members/page.tsx`, `members/health/page.tsx`; iOS `ProgramContext+Members.swift` (incl. logger view-as); Android `ProgramContext.kt`. Every caller is an active member of the open program |
| `member-history` / `member-streaks` / `member-recent`; `analytics/workouts/types?memberId`; `analytics-v2/workouts/types/*?memberId`; workout fields in `member-metrics` | Any active member (unchanged in S0) | Unchanged. They now route through `canView(…, "workouts")` / `requireMemberView("workouts")`, the S1 hook | No behavior change, so no caller can break |
