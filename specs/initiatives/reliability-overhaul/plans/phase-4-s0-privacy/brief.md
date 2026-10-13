# SCOPE BRIEF — Phase 4 Track S0: backend-only privacy fix (D-P8 a), with a new shared `utils/memberVisibility.js`

- **Features**:
  - members@0.3.0 (SPEC: specs/features/members/SPEC.md) · consumed_by [web, ios, android]
  - program-memberships@0.2.0 (SPEC: specs/features/program-memberships/SPEC.md) · consumed_by [web, ios, android]
  - member-analytics@0.4.0 (SPEC: specs/features/member-analytics/SPEC.md) · consumed_by [web, ios, android]
  - analytics@0.4.0 (SPEC: specs/features/analytics/SPEC.md) · consumed_by [web, ios, android]
  - analytics-v2@0.2.0 (SPEC: specs/features/analytics-v2/SPEC.md) · consumed_by [web, ios, android]. Its routes only get behavior-neutral "workouts" routing.
  - daily-health-logs@0.3.0 (SPEC: specs/features/daily-health-logs/SPEC.md) · consumed_by [web, ios, android]
  - All are `deployed`. reference_impl = apps/backend. A new `people` SPEC is S6, not S0.

- **Pages/screens**: none change. These were audited as callers only:
  - web/members, web/lifestyle, web/program, web/programs
  - ios/admin-members, ios/admin-workout-types, ios/my-profile, ios/widget-quick-add-workout, ios/widget-quick-add-health, ios/program-member-management
  - android/members, android/lifestyle, android/my-profile, android/member-management, android/widgets

- **Role names (confirmed)**: `program_memberships.role` is one of `admin` | `logger` | `member`.
  - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/logService.js:46-55` already treats admin and logger as "can act on any member". Prod has 47 admin, 7 logger and 112 member rows.
  - Global admin = `members.global_role === "global_admin"`. `req.user.role === "admin"` only means global admin (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js:29`).
  - **Staff** = an ACTIVE membership with role `admin` or `logger`.
  - Status gate: only `active` members may read a roster or data. Every client opens only programs where my_status is `active` (or the viewer is a global admin): web `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/programs/page.tsx:352-354`, iOS `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/ProgramPickerView.swift:366-367`, Android `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/programs/ProgramPickerScreen.kt:379`.
  - Invite flows never fetch a roster. Invite cards and the inbox use `total_members` from `GET /programs`.

- **Live binaries audited** (verified via git):
  - iOS 1.4.2 (56) = commit `6294622`. pbxproj shows 56. No app-code changes up to the `e9e663d` submission. Lingering 1.4.0 and 1.4.1 installs use the same call paths.
  - iOS 1.5.0 (58) and Android 1.1.0 (5) = `3d15bee` (the parent of release commit `66c1d29`). The only client code since then is `cf52772` (offline detection), which touches none of these call paths. So HEAD is a valid stand-in.
  - Android 1.0.0 (4) = `cea59a5` (versionCode 4). No app/src changes through 2026-08-07.

- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/memberVisibility.js` — **NEW**, the single rule module. Suggested API, which avoids N+1:
    - `loadViewer(user, programId)` makes one indexed `program_memberships` lookup and returns `{ id, isGlobalAdmin, programRole, isActiveMember, isStaff }`.
    - `canView(viewerCtx, targetMemberId, kind)` is a sync predicate. Kinds: `"email"`, `"directory"`, `"roster"`, `"health"`, `"workouts"`.
    - `redactHealth(row)` nulls `avg_sleep_hours`, `avg_food_quality` and `avg_steps`.
    - Optionally a small Express middleware for routes that only carry `?memberId`.
    - S1 extension point: `loadViewer` also batch-loads the targets' "hide my activity" flags. The `"workouts"` branch then becomes `self || staff || globalAdmin || !hidden(target)`. That is one place to change.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/members.js` — pass `req.user` into `getAllMembers` and `getMemberById` (lines 12-32).
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberService.js` — `getAllMembers(viewer)` (lines 16-23): directory for global admins only. `getMemberById(id, viewer)` (lines 25-46): email only to self or a global admin.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/memberships.js` — pass `req.user` to `/members` and `/details` (lines 24-44).
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/membershipService.js` — gate `getProgramMembers` and `getMembershipDetails` (lines 122-172) with `canView(..., "roster")`. The file is 457 lines, so keep the edit minimal.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberAnalyticsService.js` — three changes (file is 432 lines, keep edits minimal):
    - Replace `ensureProgramAccess` and `assertMemberAccess` (lines 6-26) with module calls, keeping every status code and message.
    - In `getMemberMetrics`, apply `redactHealth` to non-self rows for plain viewers right after the averages are computed (around line 221) and BEFORE search, filter and sort (lines 225-272), so sorting or filtering cannot leak order.
    - Route history, streaks and recent through `"workouts"`. This changes nothing in S0 and is the hook for S1.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js` — two changes:
    - `/health/timeline` and `/health/steps` (lines 103-127): when `memberId` is not the viewer and the viewer is not staff or a global admin, refuse.
    - `/workouts/types` (line 140) and the v2 `/workouts/types/*` routes (lines 170-212): route `memberId` through `"workouts"`. This changes nothing in S0.
    - `requireProgramAccess` (lines 17-36) can delegate to the module so there is still only one membership query.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/logService.js` — `getDailyHealthLogs` (lines 733-743): route through `canView(..., "health")`. This also closes a gap: `resolveLogPermissions` (lines 46-55) does not require `status: "active"`, so a removed or left logger or admin can still read everyone's health rows. The file is 938 lines; edit only this check.
  - backend/ — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md` — document the module.
  - docs — `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/members/SPEC.md`, `.../program-memberships/SPEC.md`, `.../member-analytics/SPEC.md`, `.../analytics/SPEC.md`, `.../analytics-v2/SPEC.md`, `.../daily-health-logs/SPEC.md`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md` — new D-C entries plus version bumps (git-version skill decides minor or patch).
  - web/ — none
  - ios/ — none
  - android/ — none

- **DB surface**: read-only (`program_memberships`, `members`, `member_emails`, `daily_health_logs`, `workout_logs`). No migration; 013 is not needed.

- **Flags/env/config involved**: none.
  - Verify with read-only GETs per role against prod using testbed accounts (ava.rivera rotates admin/logger/member across 3 test programs, per `tools/testbed/seed.mjs`). Do not run `--refresh`.
  - Boot check required. There is no test harness (`package.json` "test" is a stub).

- **Blast radius**:
  - Dependents on the touched features: programs, notifications, invites, workout-logs, analytics-v2, member-analytics, apple-health, health-connect, health-sync, frontend-kit.
  - Only read gates change, so no dependent needs code changes.
  - Surfaces to keep in parity: none need client changes. All of web, ios and android consume the changed responses and were audited (table below).

- **Live-binary compat**:
  - Backend-only, same routes, same response shapes. Deploy the backend alone; no client release.
  - Only one new error path is introduced: a plain member asking health timeline or steps for ANOTHER `memberId` gets 403. No live caller does this.
  - Every other restriction answers 200 with filtered or nulled data. Each choice is called out in the table.

  | Route | Full data after the fix | What others get | Callers checked |
  |---|---|---|---|
  | `GET /api/members` | Global admin | **200 `[]`** (or only their own row, see Q1). Never 403 | **iOS only.** `ProgramContext+Members.swift:20-24` runs `loadLookupData` when `programId` is nil. Current/1.5.0 call it from `ProgramContext+Session.swift:160-161` (launch/foreground); 1.4.2 from `ProgramContext+Auth.swift:130,240` (login/refresh). A 403 would throw before `fetchWorkouts`/`fetchPrograms` and set `errorMessage`. Web: no caller. Android: no `@GET("members")` in HEAD or `cea59a5` |
  | `GET /api/members/:id` | Self or global admin (incl. `email`) | Same object, **`email: null`** | All callers pass the viewer's own id: web `program/profile/page.tsx:75`; iOS `MyProfileView.swift:415` (1.4.2 `:384`); Android `ProfileScreen.kt:116-117` (1.0.0 `:104-105`). `email` is optional/nullable in every DTO |
  | `GET /api/program-memberships/members` | Active member of `programId`, or global admin | **200 `[]`** (missing `programId` still 400) | Web `members/page.tsx:70`, `lifestyle/page.tsx:77`, `LogWorkoutsForm.tsx:149`, `LogDailyHealthForm.tsx:168`; iOS `ProgramContext+Members.swift:21` (same in 1.4.2); Android `ProgramContext.kt:827,842,992` (1.0.0 `:613,:628,:778`). See "Why `[]` and not 403" below |
  | `GET /api/program-memberships/details` | Same as above | **200 `[]`** | Web `program/page.tsx:48`, `program/roles/page.tsx:36`, `members/detail/page.tsx:40`, `members/list/page.tsx:24`; iOS `ProgramContext+Members.swift:262`, widgets `QuickAddWorkoutWidgetEntryView.swift:490` / `QuickAddHealthWidgetEntryView.swift:538` (`try?`, active programs only); Android `ProgramContext.kt:1112` (1.0.0 `:898`) |
  | `GET /api/member-metrics` | Global admin, or ACTIVE program admin/logger | Plain active member: every row, but **`avg_sleep_hours`, `avg_food_quality`, `avg_steps` are null except on their own row**. Non-member: 403 (unchanged) | Web `members/page.tsx:150` (admins only, `:154`), `:160` (own id for plain members and loggers), `members/metrics/page.tsx:124` (admin-only entry `:281`); iOS `StandardMembersTab.swift:175-187` (full list, keeps own row; same in 1.4.2), `ProgramContext+Members.swift:62,99`; Android `MembersScreen.kt:164-167` (same in `cea59a5`). Fields are already nullable: iOS `APIClient+Members.swift:48-54`, Android `Dtos.kt:502-508` (`cea59a5` `:498-504`), web `members.ts:17-19` |
  | `GET /api/analytics/health/timeline`, `/health/steps` | No `memberId`: any active member (program aggregate, unchanged). `memberId` = self, or viewer is staff/global admin: unchanged | **403** for a plain member asking another `memberId` (Q3) | Plain members always send their own id or none: web `lifestyle/page.tsx:121,156,162`, `lifestyle/timeline/page.tsx:39-46`, `steps-timeline/page.tsx:47`; iOS `StandardWorkoutTypesTab.swift:132-133` (same in 1.4.2), admin `AdminWorkoutTypesTab.swift:145-146`; Android `LifestyleScreen.kt:69` (same in `cea59a5`), `ProgramContext.kt:1278-1288` (1.0.0 `:1067-1077`) |
  | `GET /api/daily-health-logs` | Self, ACTIVE admin/logger, or global admin | 403 (unchanged messages). Only change: staff must now be active | Web `members/page.tsx:192`, `members/health/page.tsx:137`; iOS `ProgramContext+Members.swift:226`; Android `ProgramContext.kt:1098`. The logger view-as path still works |
  | `member-history`, `member-streaks`, `member-recent`; `analytics/workouts/types?memberId`; `analytics-v2/workouts/types/*?memberId`; workout fields in `member-metrics` | Any active member (unchanged in S0) | Unchanged; these become the S1 "Hide my activity" hook | No behavior change, so nothing for callers to break |

  **Why `[]` and not 403 for the two roster routes:**
  - iOS `loadLookupData` (`ProgramContext+Members.swift:31-41`, same in 1.4.2) resets `programId` when a program has left the user's list, but that only runs if the roster call succeeds first. A 403 would leave a member who was removed from a program stuck inside it.
  - Web `LogWorkoutsForm` loads its lists with `Promise.all`, so a 403 would also wipe the workouts and programs lists.
  - Android's log/widget program selector filters on `program.status`, not `my_status`, so it can request an invited program's roster. With `[]` it behaves as today: the member is locked to logging for themselves (`QuickAddWorkoutWidgetScreen.kt:133-137`).

- **Doc↔code mismatches found**:
  - The analytics SPEC (row 9 at `:81`, D-C5 at `:227`, 0.2.0 log at `:254`) says the `memberId` on `/health/steps` and `/health/timeline` is "role-scoped". The code has no role check (`routes/analytics.js:103-127`, `analyticsService.js:337-345,401-405`). Scoping exists only in the clients.
  - members SPEC §3 line references are stale (`memberService.js:15-20` and `:22-36`; actual `:16-23` and `:25-46`).
  - program-memberships SPEC D-REF (`:207`) still says `consumed_by = [web, ios]`. The header and registry say `[web, ios, android]`.
  - The daily-health-logs SPEC says "admin/logger for others", but `resolveLogPermissions` does not require active status.

- **Out of scope (explicitly)**:
  - All client code (no web, iOS or Android edits; no version bumps).
  - Polish #1-#48.
  - Notifications N1-N8 (migration 011).
  - People S1-S7 (migration 012, the hide flag, kudos).
  - `analyticsService.js` internals.
  - Showing co-members' `gender`/`global_role` in rosters.
  - Program-wide health aggregates in very small programs (a 2-person average reveals the other person's numbers).
  - `/api/analytics/summary` `top_performers` (named per-person workout counts), which is an S1 decision.
  - Write routes, invites, auth.

- **Open questions for the orchestrator**:
  1. `GET /api/members` for non-global-admins: `[]` or only the viewer's own row? Both are safe for every caller; `[]` is simpler.
  2. `GET /api/members/:id` for a target who shares no active program with the viewer: also return 404, or only null the email (the task's literal scope)? 404 is safe because every caller passes the viewer's own id, and it closes the gender/username leak.
  3. A plain member asking health timeline/steps for another `memberId`: 403, mirroring daily-health-logs' "You can only view your own daily health logs."? No live caller does this. Alternative: silently fall back to the program aggregate.
  4. Should S1 drop "hidden" members from `analytics/summary` `top_performers`? D-P7 says "program totals still count you", which covers totals but not named rows. It needs a decision so the module covers it.
  5. Staging: skip it and verify on prod with testbed tokens (my recommendation), or run an opt-in staging smoke because this is an authorization change?
