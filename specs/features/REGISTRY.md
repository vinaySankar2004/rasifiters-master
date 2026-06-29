# Feature Registry (L4) — RaSi Fiters

Human index of **shared feature specs** (cross-cutting capabilities). The machine mirror is
`registry.json`. One row per feature; `git-version` keeps both in sync and tags each
`feature/<feature>@v<version>`. Page/screen specs are indexed separately in
[`../pages/REGISTRY.md`](../pages/REGISTRY.md).

Status legend: 📄 documented → 🏗️ built → 🚀 deployed → ⊘ retired.
**Apps** = which clients consume it: `web ios` (shared), `web` (web-only), or `ios` (ios-only).

| Feature | Version | Status | Apps | Reference impl | Spec |
|---------|---------|--------|------|----------------|------|
| `auth` | 0.2.0 | 🚀 | `web` `ios` | `backend` (`routes/auth.js`, `services/authService.js`, `middleware/auth.js`) | [auth/SPEC.md](auth/SPEC.md) |
| `members` | 0.2.0 | 🏗️ | `web` `ios` | `backend` (`routes/members.js`, `services/memberService.js`, `models/{Member,MemberEmail}.js`) | [members/SPEC.md](members/SPEC.md) |
| `programs` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/programs.js`, `services/programService.js`, `models/{Program,ProgramMembership}.js`) | [programs/SPEC.md](programs/SPEC.md) |
| `program-memberships` | 0.2.0 | 🏗️ | `web` `ios` | `backend` (`routes/memberships.js`, `services/membershipService.js`, `utils/programMemberships.js`, `models/ProgramMembership.js`) | [program-memberships/SPEC.md](program-memberships/SPEC.md) |
| `notifications` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/notifications.js`, `utils/{notifications,notificationStreams,pushNotifications}.js`, `models/{Notification,NotificationRecipient,MemberPushToken}.js`) | [notifications/SPEC.md](notifications/SPEC.md) |
| `invites` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/invites.js`, `services/inviteService.js`, `models/{ProgramInvite,ProgramInviteBlock}.js`) | [invites/SPEC.md](invites/SPEC.md) |
| `workouts` | 0.1.0 | 🏗️ | `ios` | `backend` (`routes/workouts.js`, `services/workoutService.js` [library half], `models/Workout.js`) | [workouts/SPEC.md](workouts/SPEC.md) |
| `program-workouts` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/programWorkouts.js`, `services/workoutService.js` [program half], `models/ProgramWorkout.js`) | [program-workouts/SPEC.md](program-workouts/SPEC.md) |
| `workout-logs` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/logs.js` [workout half], `services/logService.js` [workout half + shared helpers], `models/WorkoutLog.js`) | [workout-logs/SPEC.md](workout-logs/SPEC.md) |
| `daily-health-logs` | 0.1.0 | 🏗️ | `web` `ios` | `backend` (`routes/logs.js` [health half], `services/logService.js` [health half + `parseOptionalNumber`], `models/DailyHealthLog.js`) | [daily-health-logs/SPEC.md](daily-health-logs/SPEC.md) |

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
D-C2) and deferred APNs creds (D-C4, push no-ops gracefully). Porting it **replaced** the deferred
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
absent-vs-null / synthetic GET id kept (F1–F6). Next
features are authored as the backend rebuild proceeds — see `PROGRESS.md`._
