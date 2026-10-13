# PLAN VERDICT — OBJECTIONS (8)

1. **[BLOCKING] Seams S-1 and S-2 don't match the S0 module that already exists, and the plan builds a second hide rule next to S0's.**
   - Evidence:
     - S0 is being built in the working tree right now. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/memberVisibility.js:94` exports `loadViewer, hasProgramAccess, canView, redactHealth, redactMetricsRow, requireMemberView`. There is no `canViewRoster`.
     - `canView(viewer, targetMemberId, kind)` (:56) is **synchronous** and takes **3 params, with no programId**. Its `viewer` is the object `loadViewer` returns (`isGlobalAdmin`, `isStaff`, `isActiveMember`, `hiddenMemberIds`), not `req.user`.
     - S0 already has the hide rule: kind `"workouts"` = self, staff, or an active co-member not in `hiddenMemberIds` (:65-66). The S1 hook is documented as "loadViewer fills hiddenMemberIds" (:16-20, :36).
     - S0 already guards this:
       - `requireWorkoutsView` is on all 5 `/workouts/types` routes (`routes/analytics.js:138,168,179,190,201`).
       - `canView(viewer, memberId, "workouts")` is already in `assertMemberAccess` (`services/memberAnalyticsService.js:19-21`).
     - The plan's anchors (:25, :28-48, :223, :427-432) are pre-S0. Today they are :19, :25, :225 and the export block.
   - Failure scenarios:
     - **G0 stops the build.** It prints `undefined function none false`, so the plan halts at step 4.
     - **Every `/api/people` call would fail.** Implemented as written, `peopleService` calls the missing `canViewRoster`, so every call is a TypeError and a 500.
     - **Step 8(d) can't be done correctly.** It puts an async `canSeeActivity` inside the sync 3-param `canView`. That returns a Promise, which is always truthy. There is also no programId to pass, and the viewer shape is wrong (`global_role` vs `isGlobalAdmin`).
     - **The boot check fails.** The `/workouts/types` lines come out `...requireProgramAccess,requireActivityVisible,<anonymous>,<anonymous>`, not the "exactly these 18 lines". The `canViewRoster` check prints `undefined`.
     - **The switch can lie.** `hiddenMemberIds` stays empty forever, so S0's documented `"workouts"` rule keeps answering true for hidden members. Any later caller that follows S0's documented rule (as the program-memberships SPEC tells it to) leaks hidden activity. There would be two rules for one concept, plus a second membership lookup per request.
   - Fix (simpler, and follows don't-over-engineer):
     - In `loadViewer`, fill `hiddenMemberIds` with one query: active members of `programId` with `hide_activity`, skipped for staff and global admins.
     - Give `requireMemberView` an optional `code` and use it for `requireWorkoutsView` (`activity_hidden`).
     - Filter metrics rows with `canView(viewer, row.member_id, "workouts")`.
     - Pass `req.viewer` into `getSummary`.
     - People uses `loadViewer` + `canView("roster" / "workouts")`.
     - Drop `viewerActiveRole`, `isActivityStaff`, the WeakMap cache, `requireActivityVisible` and `assertActivityVisible`.

2. **[BLOCKING] The plan contradicts the S0 decision rule on how S1 plugs in, and misses the program-memberships version bump.**
   - Evidence:
     - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/program-memberships/SPEC.md:209` (D-C5, already written) fixes the method: "People S1 hook: 'Hide my activity' (migration 012) fills `hiddenMemberIds` inside `loadViewer` and adds its workout-field redaction inside `redactMetricsRow`".
     - S0's member-analytics D-C8, analytics D-C9 and analytics-v2 D-C4 (S0 `plan.md:425,443,455`) say the S0 `"workouts"` guard "is where People S1's Hide my activity takes effect".
     - S0 lists `utils/memberVisibility.js` under `program-memberships.reference_impl` (S0 `plan.md:479`).
   - Failure scenario:
     - S1 adds exports to a file program-memberships owns, but doesn't bump program-memberships or amend D-C5. Steps 20–25 never touch that SPEC, and the brief's docs list leaves it out.
     - Instead the plan lists the file under `people.reference_impl` and adds `depends_on: "people"` to member-analytics, analytics and analytics-v2. Those features import program-memberships' module, which they already depend on.
     - The result is a people ↔ member-analytics two-way edge, and five SPEC rules that are now false.
     - This breaks the git-version rule for owned-interface changes (MINOR on the owning feature).
   - Fix:
     - Bump program-memberships 0.3.0→0.4.0 and amend D-C5. The amendment should say metrics rows are *omitted, not redacted*, because iOS `MemberMetricsDTO` has non-optional Ints.
     - Remove the people `reference_impl` entry and the new `depends_on: people` edges.
     - Add the program-memberships SPEC to the brief.

3. **[ADVISORY] `memberService.js` will go over ~200 lines.** It is exactly 200 lines now (`wc -l`); S0's amendment SA6 trimmed it to fit. Step 12 adds about 22 lines (to roughly 222). Move the `hide_activity` validation into a small helper, or accept the size explicitly.

4. **[ADVISORY] Coverage guard 2's expected file set is already wrong.** `grep -rlE "WorkoutLog|…|top_performers…"` matches `utils/memberVisibility.js` today (its S0 header :18 mentions `top_performers`), and S1's own pasted comment adds another match. Every run will report a spurious "other file". Add it to the expected set.

5. **[ADVISORY] U-3's recommended option quietly reverses a recorded user decision.** `phase-4/DECISIONS.md` says "web ships as each part is reviewed". The plan states that approving without comment applies the recommendation (hold web People until the store release). The plan must say outright that U-3 (recommended) overrides that DECISIONS line.

6. **[ADVISORY] The privacy text (§A item 4) leaves out data co-members can already see.** It says co-members see "your name, username and program role". But `getProgramMembers` / `getMembershipDetails` (`services/membershipService.js`) also return `gender`, `date_joined` and `global_role` to every active co-member, and S0 notes the roster "already shows their name, username and gender". Add gender (and join date) to the disclosure.

7. **[ADVISORY] Matrix row #10 can pass without testing anything.** `/analytics/summary` defaults to `period=day`, so H is in `top_performers` only if H logged today. Use `period=month` and assert that H is **present** for S before asserting H is absent for P.

8. **[ADVISORY] Seam S-3 rests on an unplanned track.** No Notifications plan exists yet in `plans/`. If 011/N2 stores the time zone on `members`, the N-track also edits `models/Member.js`, and the plan's shared-files list (only `models/index.js`, `server.js`) misses that. Keep the G0 STOP and add `Member.js` to the shared-file list.

**What I checked**
- **Backend at HEAD and in the S0 working tree:** `memberVisibility.js`, `memberAnalyticsService.js`, `routes/analytics.js`, `memberService.js`, `routes/members.js`, `analyticsService.js`, `utils/notifications.js`, `rateLimit.js`, `response.js`, `middleware/auth.js` (`req.user.member_name` is present), the models and `server.js` mounts.
- **Route inventory:** the GET inventory command prints 33 lines (confirmed).
- **Database:** FK cascades for `notification_recipients` and `push_deliveries`. The 012 verify values (5 indexes, 6 constraints) match the 009/010 pattern.
- **Boot env:** loads with the local `.env`. `localDateIn` gives the expected values.
- **Live binaries:** Android `ignoreUnknownKeys` (HEAD and 1.0.0 `cea59a5`); the overview uses `firstOrNull`. Acknowledging an undone notification returns 404, and iOS 1.4.2 / Android 1.0.0 handle that safely (optimistic removal, then re-fetch). `top_performers` is rendered by no client. All three clients send `memberId` only when it's set.
- **Web:** members list/detail show names and roles only; the metrics preview is admin-only; the privacy-page anchors exist in both files.
- **Tooling:** testbed roles on staging, login response fields, git-version rules for shared and owned files.
