# PLAN VERDICT — OBJECTIONS (6)

None of the six objections is blocking. I found no live-binary break, no D-rule violation, no missing consumer and no compile or boot problem. All six are advisory.

1. **[ADVISORY] With Q1 (`200 []` for `GET /members`), an existing iOS race now ends with an empty member list instead of too many members.**
   - Evidence:
     - `reloadSessionData` (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Session.swift:159-162`) runs `loadLookupData` while no program is open. That calls `/members`, then `/workouts`, then `/programs`, and only afterwards runs `members = membersData; membersProgramId = programId` (`ProgramContext+Members.swift:27-28`). It reads `programId` after the awaits.
     - Picking a program starts a second `loadLookupData` (`ProgramPickerView.swift:481-484`).
     - The same applies to 1.4.2 at login, via `applyAuthResponse`.
   - Failure scenario:
     - A plain member taps a program while the launch fetch is still in flight, and the launch fetch finishes last.
     - `members = []` is then labelled as program X's roster. Before the fix it was the full directory, which included the member themselves.
     - `StandardMembersTab.loggedInMember` (`:18-21`) becomes nil, so `MemberOverviewCard(member: nil)` renders without a member, and the roster-based pickers are empty. Plain members never reload, because the reload gate at `StandardMembersTab.swift:170` is `isLogger`-only. This lasts until the next foreground.
   - The window is narrow and nothing crashes. A cheap fix: answer Q1 with "the viewer's own row" (`Member.findAll({ where: { id: user.id, global_role: "standard" }, attributes: { exclude: ["auth_user_id"] } })`). That keeps `loggedInMember` resolvable. Otherwise, name the race in members D-C3.

2. **[ADVISORY] The claim that Android's selector "locks to self, as today" only holds for invited/requested rows with role `member`.**
   - Evidence:
     - `ProgramMultiSelect` filters on `program.status` (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/summary/LogWorkoutScreen.kt:424-426`).
     - `isPrivilegedIn` ignores `myStatus` (`core/ProgramContext.kt:192-193`).
     - `GET /programs` returns invited and requested rows (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/programService.js:79`).
   - Failure scenario: a viewer whose row is `invited` or `requested` with role `admin` or `logger` used to get an unlocked member picker filled from the full roster. Now the roster is `[]`, so the picker is empty.
   - No current code creates invited or requested rows (they appear only in the CHECK constraint), so these are probably legacy-only. Before deploy, run one read-only `SELECT role, status, count(*) FROM program_memberships WHERE status IN ('invited','requested') GROUP BY 1,2` and record the result in program-memberships D-C5.

3. **[ADVISORY] Some SPEC text becomes wrong and the doc steps don't fix it.**
   - `specs/features/daily-health-logs/SPEC.md:140-141` (§4 "List") still says "`canLogForAny`; a non-admin may only view self (403)", which is exactly the rule being replaced.
   - `analytics/SPEC.md:69` and `analytics-v2/SPEC.md:66` say "Every route is `authenticateToken` → `requireProgramAccess`". That is false for the 7 guarded routes.
   - `program-memberships/SPEC.md:101-104` (§4 descriptions of the two roster functions) and `members/SPEC.md:123` (§7 "what stays") don't mention the new gate.
   - Add a one-line edit for each.

4. **[ADVISORY] Some quoted anchors are ambiguous or off by a line.**
   - In the analytics SPEC, "optional `memberId`." matches both `:78` (§3 row 6) and `:127` (§4 workouts/types).
   - In the daily-health-logs SPEC, "self; admin/logger for others" matches `:72`, `:73` and `:74`. Only `:72` is row 3; `:73` and `:74` are the PUT and DELETE write rows, which must stay as they are.
   - In the member-analytics SPEC, "D-C5, mirrors avg sleep). Then" is on line 91, not 90.
   - The implementer must include the row context in each match.

5. **[ADVISORY] A write-side gap stays open and the plan doesn't say so.**
   - `resolveLogPermissions` (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/logService.js:46-55`, 9 callers) still ignores `status`.
   - So a `removed` (including left), `invited` or `requested` admin or logger can still POST, PUT or DELETE co-members' health and workout rows. PUT returns the updated row, and POST's 409 shows whether a row exists.
   - As written, D-C7 sounds like former staff are fully locked out. Writes are out of scope per the brief, so just add this to the residuals list and to D-C7 as a known follow-up.

6. **[ADVISORY] `memberService.js` will go a little over the ~200-line guideline.**
   - It is 192 lines today. The plan adds 2 header lines, 1 import and about 8 lines in the functions, ending around 203.
   - The new header comment repeats the D-C3 comment inside `getAllMembers`; drop it to stay at or under 200.

**What I checked:**
- **Backend code:** read every touched backend file at its cited lines, and every caller of the changed functions. There are no other backend or `tools/` callers apart from `seed.mjs` `/details` with an active admin, which is unaffected.
- **Rule module:** ran the proposed `memberVisibility.js` against stub models. Repeated `programId` is refused. A removed admin is not staff. Array `memberId` gets 403 on health. Object `memberId` passes the workouts kind, as the plan already notes for S1.
- **Database:** confirmed `program_memberships` has a composite primary key, so `findOne` without a status filter is unique.
- **Boot check:** confirmed `config/database.js` connects only inside `connectDB`. No `.env.local` exists, and `.env` does not override the dummy variables.
- **Web callers (HEAD):** `/members/:id`, both roster routes, `member-metrics`, health timeline and steps (including `lifestyle/{timeline,steps-timeline}` with `memberIdParam`), and `daily-health-logs`.
- **iOS callers (HEAD and 1.4.2 `6294622`):** all `loadLookupData` sites, widgets (`my_status`-filtered), `StandardMembersTab` (own row, logger view-as), `memberMetrics` consumers (admin-only previews), `APIClient` health calls, and nullable DTOs. The widget extension makes no network calls.
- **Android callers (HEAD and 1.0.0 `cea59a5`):** `MembersScreen`, `LifestyleScreen` memberId logic, the widget and `ProgramMultiSelect`, `memberMetrics` consumers, and nullable `Dtos.kt`.
- **Other privacy gaps:** no other route returns emails, and `all-invites` is global-admin-only.
- **SPECs:** the new D-rule ids are unused in all 6 SPECs.
- **Versioning:** `registry.json` `reference_impl` and `depends_on` agree with the plan's bump and no-bump decisions under the git-version rules, including the multi-track "no bump for co-listed file" pattern.
- **Verify script:** the testbed role matrix in `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/testbed/seed.mjs` matches the script's expectations.
