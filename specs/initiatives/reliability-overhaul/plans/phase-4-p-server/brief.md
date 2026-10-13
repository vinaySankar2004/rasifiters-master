# SCOPE BRIEF: Phase 4 Track P-SRV, People server slice S1 (hide my activity, People list and profile, kudos, migration 012, API contract)

- **Features**:
  - members@0.3.0 (SPEC: specs/features/members/SPEC.md) · consumed_by [web, ios, android]
  - member-analytics@0.4.0 (SPEC: specs/features/member-analytics/SPEC.md) · consumed_by [web, ios, android]
  - analytics@0.4.0 (specs/features/analytics/SPEC.md) and analytics-v2@0.2.0 (specs/features/analytics-v2/SPEC.md) · consumed_by [web, ios, android]
  - notifications@0.5.0 (specs/features/notifications/SPEC.md). Caller only: S1 calls `createNotification` and does not modify it. · consumed_by [web, ios, android]
  - program-memberships@0.2.0 (specs/features/program-memberships/SPEC.md). Read-only (roles, active status). · consumed_by [web, ios, android]
  - **NEW `people` feature**. No registry entry or SPEC exists yet. It will be consumed_by [web, ios, android] through S2–S4.
  - All of the above have reference_impl app = backend.
- **Pages/screens**: S1 changes no page directly. Context for the client plans written against this contract:
  - web/members/list (specs/pages/web/members/list/SPEC.md), which becomes People
  - web/program/profile (specs/pages/web/program/profile/SPEC.md), which gets the switch
  - web/privacy-policy (specs/pages/web/privacy-policy/SPEC.md) and web/program/privacy (specs/pages/web/program/privacy/SPEC.md)
  - ios/program-member-management, ios/my-profile, ios/apple-health
  - android/member-management, android/my-profile, android/health-connect
- **Files (exhaustive; the implementer may touch ONLY these), grouped by surface**:
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/012_people_hide_activity_kudos.sql — NEW. Follow the 009/010 pattern: schema-neutral, `SET lock_timeout`, staging first then public, RLS on the public copy only, staging grants, and a VERIFY row at the end. Contents:
    - `ALTER TABLE members ADD COLUMN IF NOT EXISTS hide_activity boolean NOT NULL DEFAULT false`
    - `CREATE TABLE IF NOT EXISTS kudos` with columns: id uuid PK default gen_random_uuid(); giver_id → members ON DELETE CASCADE; recipient_id → members ON DELETE CASCADE; program_id → programs ON DELETE CASCADE (context and deep link only); kudos_date date; notification_id → notifications ON DELETE SET NULL; created_at
    - `CHECK (giver_id <> recipient_id)` and `UNIQUE (giver_id, recipient_id, kudos_date)`
    - index on (recipient_id, kudos_date)
  - backend/ — apps/backend/sql/README.md — add the 012 row, including the run order (staging → public, BEFORE the deploy).
  - backend/ — apps/backend/models/Kudos.js — NEW model, `tableName: "kudos"`, timestamps off.
  - backend/ — apps/backend/models/Member.js — add the `hide_activity` attribute. **Outage risk:** every Member SELECT, including the auth middleware's member resolve, fails if 012 has not run on public first.
  - backend/ — apps/backend/models/index.js — register Kudos and its associations. **SHARED with the Notifications server track** (it adds its prefs model here).
  - backend/ — apps/backend/utils/memberVisibility.js — EXTEND the module S0 creates. Add:
    - an `activity` data kind. Rule: self always; global admin always; program admin/logger in that program always; otherwise visible only when `!target.hide_activity`.
    - a row-filter helper for list outputs
    - an Express middleware for routes that take `?memberId`
    - one cached-per-request staff lookup
    - Do NOT re-implement S0's email/roster/health rules.
  - backend/ — apps/backend/services/peopleService.js — NEW. The list and the profile. Grouped queries, no N+1. Reuses `computeStreaks`.
  - backend/ — apps/backend/services/kudosService.js — NEW. Covers:
    - the recipient-local-day computation (Intl `timeZone`; invalid or absent → UTC)
    - give: idempotent
    - undo: delete the kudos row, then the notification only if the recipient's row is still `acknowledged_at IS NULL`
    - the `createNotification` call: `type: "activity.kudos_received"`, `actorMemberId` = giver, `programId`, inside the transaction; store the returned id, or null when preferences suppress it
  - backend/ — apps/backend/routes/people.js — NEW thin router. Per-member write limiter copied from `routes/healthSync.js:19` (`keyFn: req.user.id`). UUID validation → 400, never a Sequelize 500.
  - backend/ — apps/backend/server.js — mount `/api/people` after `express.json()` and `blockUnversionedAndroid`. **SHARED with the Notifications track** (scheduler and route mounts).
  - backend/ — apps/backend/services/memberAnalyticsService.js — apply the activity check in two places:
    - `getMemberMetrics` (:64-286): OMIT hidden rows for plain viewers. Keep `total` and recompute `filtered`. Do not null the ints: iOS `MemberMetricsDTO` has non-optional `Int` fields (APIClient+Members.swift:45-52).
    - `assertMemberAccess` (:18-26), which covers history, streaks and recent.
    - Also export `computeStreaks` (:28-48). **Also touched by S0.**
  - backend/ — apps/backend/routes/analytics.js — add the activity middleware when `memberId` is present on `/workouts/types` (:140) and on the 4 v2 routes `types/total|most-popular|longest-duration|highest-participation` (:170-212). Pass `req.user` into the summary handler (:42-54). **Also touched by S0** (health/timeline, steps).
  - backend/ — apps/backend/services/analyticsService.js — `getSummary` (:118-256) drops hidden members from `top_performers` (:198-205, 253) for plain viewers. The totals stay as they are. Decoded by iOS and web but rendered by no client.
  - backend/ — apps/backend/services/memberService.js — two changes:
    - `getMemberById` (:25-46) adds `hide_activity` for self or a global admin only.
    - `updateMember` (:112-147) whitelists `hide_activity` (strict boolean, own profile only → 403 otherwise) and adds `hide_activity` to the response.
    - **Also touched by S0** (email gating).
  - backend/ — apps/backend/routes/members.js — pass `req.user` to `getMemberById` (:23-32), only if S0 hasn't already.
  - backend/ — apps/backend/CONTEXT.md — document 012 and `/api/people`.
  - docs/ (S6; see open questions) — files to update:
    - NEW: specs/features/people/SPEC.md, holding the route checklist and the API contract
    - specs/features/registry.json and REGISTRY.md
    - members, member-analytics, analytics, analytics-v2 SPECs (D-rules)
    - notifications SPEC (new caller and type)
  - web/ — none in S1. The privacy text is listed under Out of scope and goes to the web client plan.
  - ios/ — none in S1.
  - android/ — none in S1.
- **DB surface**:
  - Migration needed: `apps/backend/sql/012_people_*.sql`. The user runs it.
  - Reads: workout_logs, program_memberships, members, programs, plus the tz source from 011.
  - The undo path is an app-level delete of notifications and notification_recipients rows through the API, not raw SQL.
- **Flags/env/config involved**:
  - No new env vars.
  - The kudos rate-limit constant lives in code (suggest 60 writes per 10 min per member, the same shape as healthSync).
  - The member time zone comes from the Notifications track (011/N2). Its storage location and getter name are not defined yet.
- **Blast radius**:
  - Dependents of the touched features:
    - members ← program-memberships, invites, workout-logs, analytics, member-analytics, notifications
    - analytics ← analytics-v2, member-analytics
    - notifications ← programs, program-memberships, invites
  - Surfaces to keep in parity: [web, ios, android] for S2–S4.
  - **Per-person route checklist (13 outputs, not ~8):**
    1. GET /member-metrics (rows omitted)
    2. GET /member-history (403 `activity_hidden`)
    3. GET /member-streaks (same)
    4. GET /member-recent (same)
    5. GET /analytics/workouts/types?memberId (same)
    6–9. GET /analytics-v2/workouts/types/{total, most-popular, longest-duration, highest-participation}?memberId (same)
    10. GET /analytics/summary `top_performers` (filtered)
    11. GET /analytics/health/timeline?memberId and /health/steps?memberId (S0 health kind, staff/self, strictly stronger)
    12. GET /daily-health-logs (already staff/self, logService.js:735-738)
    13. NEW /api/people list, profile and kudos
  - Name-only outputs, unchanged by design: /program-memberships/members and /details, /members, /members/:id (S0).
  - Program aggregates count hidden members on purpose: timeline, distribution/day, participation/mtd, totals, and workouts/types without memberId.
  - Self-only: health-sync.
- **Live-binary compat**:
  - Backend contract change, additive. The backend must degrade gracefully for the LIVE iOS 1.4.2/1.5.0 and Android 1.0.0/1.1.0 binaries.
  - Deploy order: **migration 012 (staging → public) → backend → clients**.
  - Old plain-member apps fetch the full metrics list and keep only their own row (StandardMembersTab.swift:175-184, MembersScreen.kt:164-165). They request only their own memberId on the history, streaks and recent routes, so omitted rows and 403s never reach them. Staff are unaffected.
  - Old apps show any new notification `type` as a blocking pop-up or a default-channel push (NotificationsGate, ProgramContext.kt:656, fcm.js:54). Web People (S2) ships before the store release, so kudos from web users would pop up on old phones. The Notifications track should gate this, or we accept it.
- **Doc↔code mismatches found**:
  - DISCOVERY raw S1 says People is "migration 011" and keys kudos on (program, giver, receiver, date). The task reserves 012 and keys on (giver, recipient, recipient-local day).
  - DISCOVERY says "about 8 routes"; there are 13 per-person outputs (checklist above).
  - The routes/members.js:2 header still says "GET / + GET /:id: any authenticated member". S0 changes that.
  - Backend `package.json` has no test runner, so "a test that lists every route" has to be a script.
  - The web privacy text is DUPLICATED in apps/web/src/app/privacy-policy/page.tsx and apps/web/src/app/program/privacy/page.tsx. Neither page says co-members can see your workouts or stats, which is already true today.
  - The iOS `NSHealthShareUsageDescription` (project.pbxproj:381, 420) says "workout and sleep" but the app also reads steps, and it carries the "RaSi Fit'ers" typo (#45).
  - The current streak doesn't reset on a missed today (memberAnalyticsService.js:42-46). This is unchanged and undecided, so co-members see stale streaks.
- **Out of scope (explicitly)**:
  - Client work S2–S4: People screens, profile, kudos UI, the switch UI.
  - S5 (#32) and the privacy text edits. The web client plan applies the policy change to BOTH web privacy pages; those files are shared with quick-win #48 (BrandMark).
  - The iOS pbxproj consent string and the Android HC settings copy (client plans).
  - The App Store Connect / Play Console answers. The user makes these changes; the plan lists them:
    - ASC App Privacy: Fitness data linked to the user, visible to members of the user's programs
    - Play Data safety
    - the Health Connect permissions declaration in the Play Console (state "shown to members of your programs; hideable")
  - Category, template and preference logic inside `utils/notifications.js` (Notifications track).
  - Streak semantics, person-to-person blocking (D-P9), membership editing (D-P11 stays global-admin only), S0's rules, app version bumps, and an activity feed.
- **Open questions for the orchestrator**:
  1. What is the exact S0 export API of `memberVisibility.js` (function names, data-kind enum)? S1 must land after it.
  2. Where does 011 store the member time zone, and what is the getter name?
  3. Is the Activity category on by default? If it's opt-in, kudos notifications never get created for most members.
  4. Do the Notifications templates render kudos title/body, or does S1 pass the title/body text itself?
  5. Is the profile "kudos count" all-time received across programs (recommended: the only key-consistent single number) or today's count?
  6. Should `hide_activity` be self-only (recommended), or may a global admin also set it for someone else?
  7. Re-giving after an undo on the same day sends another push. Rate limit only (recommended), or suppress the repeat push?
  8. Do the S6 docs ship in the S1 commit (git-version needs a registry entry for `people`) or separately?
  9. What form should the route-coverage check take? Recommendation: `tools/testbed/visibility-smoke.mjs` against staging, run as the testbed plain member vs a hidden target.
  10. Should web kudos wait for the store release because of the old-binary pop-ups?
  - Proposed contract skeleton for the planner. All routes use `authenticateToken`.
    - `GET /api/people?programId` → `{program_id, viewer:{member_id,is_staff}, people:[{member_id,member_name,username,program_role,is_you,activity_visible,last_active|null}]}`
      - caller first, then first_name ASC
      - `last_active` = MAX workout `log_date` in this program
    - `GET /api/people/:memberId?programId` → profile with:
      - role and joined_at
      - `stats{current_streak,longest_streak,active_days_this_month (UTC month),last_active}|null`
      - `recent_workouts[≤10]{workout_type,date,duration_minutes}|null`
      - `kudos{count,given_today,can_give}|null`
      - `can_open_full_stats`
    - `POST /api/people/:memberId/kudos {program_id}` → 201 for a new kudos, 200 when already given today
    - `DELETE /api/people/:memberId/kudos` → undoes today's kudos
    - Errors: 400 `invalid_request` / `kudos_self` · 403 `not_program_member` / `activity_hidden` · 404 `member_not_in_program` · 429 `rate_limited`, with Retry-After
