# Feature Registry (L4) — RaSi Fiters

Human index of **shared feature specs** (cross-cutting capabilities). The machine mirror is
`registry.json`. One row per feature; `git-version` keeps both in sync and tags each
`feature/<feature>@v<version>`. Page/screen specs are indexed separately in
[`../pages/REGISTRY.md`](../pages/REGISTRY.md).

Status legend: 📄 documented → 🏗️ built → 🚀 deployed → ⊘ retired.
**Apps** = which clients consume it: `web ios` (shared), `web` (web-only), or `ios` (ios-only).

| Feature | Version | Status | Apps | Reference impl | Spec |
|---------|---------|--------|------|----------------|------|
| `auth` | 0.6.0 | 🚀 | `web` `ios` | `backend` (`routes/auth.js`, `services/authService.js`, `middleware/auth.js`) | [auth/SPEC.md](auth/SPEC.md) |
| `members` | 0.3.0 | 🏗️ | `web` `ios` | `backend` (`routes/members.js`, `services/memberService.js`, `models/{Member,MemberEmail}.js`) | [members/SPEC.md](members/SPEC.md) |
| `programs` | 0.2.0 | 🏗️ | `web` `ios` | `backend` (`routes/programs.js`, `services/programService.js`, `models/{Program,ProgramMembership,MemberProgramOrder}.js`, `sql/005`) | [programs/SPEC.md](programs/SPEC.md) |
| `program-memberships` | 0.2.0 | 🏗️ | `web` `ios` | `backend` (`routes/memberships.js`, `services/membershipService.js`, `utils/programMemberships.js`, `models/ProgramMembership.js`) | [program-memberships/SPEC.md](program-memberships/SPEC.md) |
| `notifications` | 0.3.0 | 🏗️ | `web` `ios` `android` | `backend` (`routes/notifications.js`, `utils/{notifications,notificationStreams,pushNotifications}.js`, `models/{Notification,NotificationRecipient,MemberPushToken}.js`) | [notifications/SPEC.md](notifications/SPEC.md) |
| `invites` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/invites.js`, `services/inviteService.js`, `models/{ProgramInvite,ProgramInviteBlock}.js`) | [invites/SPEC.md](invites/SPEC.md) |
| `workouts` | 0.1.1 | 🏗️ | `ios` | `backend` (`routes/workouts.js`, `services/workoutService.js` [library half], `models/Workout.js`) | [workouts/SPEC.md](workouts/SPEC.md) |
| `program-workouts` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/programWorkouts.js`, `services/workoutService.js` [program half], `models/ProgramWorkout.js`) | [program-workouts/SPEC.md](program-workouts/SPEC.md) |
| `workout-logs` | 0.5.0 | 🏗️ | `web` `ios` `android` | `backend` (`routes/logs.js` [workout half], `services/logService.js` [workout half + shared helpers], `models/WorkoutLog.js`) | [workout-logs/SPEC.md](workout-logs/SPEC.md) |
| `daily-health-logs` | 0.2.0 | 🏗️ | `web` `ios` `android` | `backend` (`routes/logs.js` [health half], `services/logService.js` [health half + `parseOptionalNumber`], `models/DailyHealthLog.js`, `sql/006`) | [daily-health-logs/SPEC.md](daily-health-logs/SPEC.md) |
| `analytics` | 0.2.0 | 🏗️ | `web` `ios` `android` | `backend` (`routes/analytics.js` [v1 half], `services/analyticsService.js` [v1 + shared helpers], `utils/{dateRange,queryHelpers}.js`) | [analytics/SPEC.md](analytics/SPEC.md) |
| `analytics-v2` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/analytics.js` [v2 half], `services/analyticsService.js` [v2 fns]) | [analytics-v2/SPEC.md](analytics-v2/SPEC.md) |
| `member-analytics` | 0.3.1 | 🏗️ | `web` `ios` `android` | `backend` (`routes/memberAnalytics.js`, `services/memberAnalyticsService.js`, `services/analyticsService.js` [3 re-exported helpers]) | [member-analytics/SPEC.md](member-analytics/SPEC.md) |
| `app-config` | 0.1.0 | 🏗️ | `ios` | `backend` (`server.js` [inline `GET /api/app-config` + `MIN_IOS_VERSION`]) | [app-config/SPEC.md](app-config/SPEC.md) |
| `apple-health` | 0.7.0 | 🏗️ | `ios` | `ios` (`HealthKitService(+Sleep/+Steps).swift`, `HealthKitWorkoutTypeMap.swift`, `HealthKitAppliedLedger.swift`, `APIClient+DailyHealth.swift`, `ProgramContext+HealthKit(Sleep/Steps/Windows).swift`, `ProgramContext+HealthSyncGating.swift`, `PendingSyncConfirmation.swift`, `HealthSyncConfirmationView.swift`, `AppleHealthSettingsView.swift`; provenance: PR #4 workouts + net-new sleep + steps) | [apple-health/SPEC.md](apple-health/SPEC.md) |
| `health-connect` | 0.2.0 | 🏗️ | `android` | `android` (`health/{HealthConnectManager,HealthConnectWorkoutTypeMap,HealthStore,HealthModels,HealthDates,HealthSyncNotifier,HealthSyncController}.kt`, `ui/health/{HealthConnectSettingsScreen,HealthSyncConfirmationScreen}.kt`; the Android analog of `apple-health`, on Health Connect — workout + sleep + steps; no backend change) | [health-connect/SPEC.md](health-connect/SPEC.md) |

_First feature documented via `question-asker` (Phase 2 kickoff). `auth` gates everything else: it owns
the `/api/auth/*` routes, the Supabase-JWT verify middleware, and the authorization gates, and carries the
R1 Supabase-Auth migration delta. `members` (the FK-anchor entity) follows: five `/api/members` routes —
faithful except one deliberate change (`createMember` now creates a loginable member via Supabase
`createUser`, D-C2); `DELETE /:id` cascade **wired** (D-C1, v0.2.0 — shared `cascadeMemberDeletion` + Supabase
auth-user delete, same as auth `/account`); `POST`+`DELETE` are called by neither client. `programs` (the organizing container) follows: four `/api/programs` routes —
faithful except one deliberate cleanup (`createProgram` drops the vestigial `description` field, D-C2); the
`program.updated`/`program.deleted` notification emit is deferred to the `notifications` feature (D-C1, CRUD
ports fully functional); `getPrograms` keeps its raw SQL verbatim (D-S2); `admin_only_data_entry` is web-only
(D-REF). `program-memberships` (the join + member-exit cascade) follows: 6 of 8 routes ported
(`createMemberAndEnroll` fixed→loginable D-C2; two dead routes dropped D-C3); notification emits deferred via
a stub D-C4. `notifications` (**the keystone**) follows: 6 `/api/notifications` routes + the emit engine —
faithful except one migration delta (the SSE stream auth swaps symmetric `jwt.verify` → Supabase JWKS,
D-C2) and initially-deferred APNs creds (D-C4 → resolved by D-C8 2026-06-30: key provisioned, iOS push
live). Porting it **replaced** the deferred
`utils/notifications.js` stub, so the programs/memberships emits now fire unchanged; `POST /broadcast` is kept
but vestigial (called by neither client, F1). `invites` (the co-mounted other half of `/api/program-memberships`)
follows: 4 invite routes (`POST /invite`, `GET /my-invites`, `GET /all-invites`, `PUT /invite-response`) +
`inviteService` + the `ProgramInvite`/`ProgramInviteBlock` tables (already ported with program-memberships).
Faithful except two cleanups — `target_member_id` dropped (vestigial, sent by neither client, D-C3a) and
`getAllInvites`' N+1 batched into one query (D-C3b); the accept-path `ProgramMembership` write stays inline
(D-C1). **The keystone realized:** its `program.invite_received`/`program.member_joined` emits are wired
**live** against the ported notifications engine — the first feature with no deferred-emit stub (D-C2).
`workout-logs` (the workout-logging write surface) follows: the `workoutLogRouter` half of the shared
`routes/logs.js`/`services/logService.js` (`daily-health-logs` = the other half, appended to the same file
pair later, D-C1). **2 dead GET routes dropped** (`GET /` + `GET /member/:memberName`, called by neither
client); the 4 live routes (`POST /`, `POST /batch`, `PUT /`, `DELETE /`) ported. `consumed_by = [web, ios]` —
the trio 1:1, `POST /batch` web-only. Four user-chosen cleanups on the faithful base: D-C2 (positive-int
single-log duration), D-C3 (collapse the member-auth double-check), D-C4 (de-dup the membership lookups,
incl. `deleteWorkoutLog`'s double `resolveLogPermissions`), D-C5 (hoist the `admin_only_data_entry` lock into
a `requireDataEntryAllowed` resolve-or-pass-through middleware, 403 preserved). `daily-health-logs` (the
OTHER half of the `logs.js`/`logService.js` file pair) follows: the `dailyHealthLogRouter` 4 routes
(POST/GET/PUT/DELETE) + the 4 daily-health fns + `parseOptionalNumber`, appended to the same files (both
halves reunited). `consumed_by = [web, ios]` — **all 4 routes 1:1, no divergence, no batch route**. Faithful
except two changes: D-C2 (reuse `workout-logs`' `requireDataEntryAllowed` middleware on the 3 write routes —
both halves enforce the lock identically; GET ungated) and D-C3 (tidy `updateDailyHealthLog` to a single
`body` param, behavior identical). One-row-per-day PK / 409-on-dup / sleep+diet validation / partial-update
absent-vs-null / synthetic GET id kept (F1–F6). `analytics` (v1, the program-level read-aggregation API)
follows: the `v1Router` half of the shared `routes/analytics.js`/`analyticsService.js` + the 2 analytics-only
utils (`dateRange.js`/`queryHelpers.js`); `analytics-v2` = the other half (appended later, reuses the
helpers/utils). Read-only date-bucketing + `COUNT`/`SUM`/`GROUP BY` over `workout_logs`/`daily_health_logs`
(active-membership inner join). **`participation/mtd` v1 dropped** (D-C2 — both clients use the v2 variant);
8 live routes; `consumed_by = [web, ios]` all 1:1, no divergence. Faithful verbatim except two UTC cleanups:
D-C3 (distribution weekday bucketing) + D-C4 (timeline labels), both adding `timeZone:"UTC"` (unchanged on
Render-UTC). F1–F7. `analytics-v2` (the v2 half of the same file pair) follows: the `v2Router` routes + the
v2 functions **appended to the shared `routes/analytics.js`/`analyticsService.js`** (reusing the helpers +
utils landed with v1). **`GET /summary` (v2) dropped** (D-C2 — the mirror of v1's D-C2: both clients use the
v1 summary, so `getSummaryV2` is dead); 5 live routes at `/api/analytics-v2` (participation/mtd + the 4
workout-type aggregates), `consumed_by = [web, ios]` all 1:1, no divergence. Read-only verbatim otherwise
(D-S1); `getParticipationMTDV2` is byte-identical to the v1 fn v1 dropped (now live), and
`getHighestParticipationWorkoutType`'s member-scoped branch is dead (both clients call it program-wide). F1–F6.
`member-analytics` (the per-member analytics surface) follows as **its own file pair** —
`routes/memberAnalytics.js` (4 separate routers) + `services/memberAnalyticsService.js` (4 fns + helpers) —
distinct from the analytics/analytics-v2 pair. 4 routes: `/api/member-metrics` (per-program member leaderboard:
in-memory rollup → search/16-filter/sort), `/api/member-history` (single-member timeline), `/api/member-streaks`
(streak + milestones), `/api/member-recent` (the workout-history read both clients use — why `workout-logs`
dropped its 2 dead GETs). `consumed_by = [web, ios]` all 4 routes **1:1, no divergence**. Unlike v1/v2 it
**enforces per-program read authz** (`ensureProgramAccess`, F1). Faithful verbatim except D-C2 (re-export the 3
timeline helpers `resolveTimelineWindow`/`buildBuckets`/`bucketKey` from `analyticsService.js` — restoring the
legacy export surface, a tiny additive change to `analytics`) + two cleanups: D-C3 (extract the shared
requester-access prelude shared by history/streaks/recent, statuses 1:1) and D-C4 (guard null
`program.start_date` in `getMemberStreaks`). No UTC cleanup (dates already UTC-correct). F1–F7.
`app-config` (the iOS version gate) follows as the **last backend feature** — the inline `GET /api/app-config`
returning `{ min_ios_version }` (sourced from the `MIN_IOS_VERSION` env), which iOS polls to drive its
force-update modal. `consumed_by = [ios]` only (web ignores it; it has no version to check). Kept inline in
`server.js` (D-C1, faithful). Two pinned cleanups vs legacy: D-C2 (add `Cache-Control: public, max-age=300` —
iOS polls on every launch/foreground/widget-open) + D-C3 (trim + semver-validate `MIN_IOS_VERSION` so a
malformed env yields `null` rather than a broken client comparison). The **push (APNs)** half of the same
COVERAGE row is owned by `notifications` + `auth` (already ported); this SPEC §6 is its cross-reference index
(no duplication). F1–F5. **Backend feature coverage is now complete (14 features).**
Next features are authored as the backend rebuild proceeds — see `PROGRESS.md`._
