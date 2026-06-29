# COVERAGE.md — Route / module → feature SPEC audit map

The audit record that every route, screen, and backend module of the legacy app maps to a feature SPEC in
`specs/features/`. Built up as the `question-asker` loop documents each surface. The goal: when this is fully
ticked, we know the rebuild covers the legacy app 1:1 with nothing missed.

Legend: `[ ]` not yet documented · `[~]` SPEC in progress · `[x]` covered by a SPEC.

> Fresh scaffold — nothing documented yet. The checklists below are the surface inventory (from the
> research pass) to be filled in feature-by-feature.

## backend (Express API) — `../backend`
- [x] auth (login/app/global, refresh, logout, register, change-password, delete-account) → [auth SPEC](specs/features/auth/SPEC.md) (v0.1.0; incl. `middleware/auth.js` authz gates per D-C1)
- [x] members (CRUD, list) → [members SPEC](specs/features/members/SPEC.md) (v0.2.0; `DELETE /:id` cascade **wired** via shared `cascadeMemberDeletion` + Supabase auth-user delete per D-C1; `createMember` wired to Supabase `createUser` per D-C2)
- [x] programs (CRUD, archive, admin_only_data_entry) → [programs SPEC](specs/features/programs/SPEC.md) (v0.1.0; ported; `description` dropped per D-C2; notification emit deferred → `notifications` per D-C1)
- [x] program-memberships (members, details, role/status, remove, leave + `handleMemberExit`) → [program-memberships SPEC](specs/features/program-memberships/SPEC.md) (v0.1.0; ported; `createMemberAndEnroll` fixed→loginable per D-C2; `available`+`enroll` dropped as dead routes per D-C3; notification emits deferred per D-C4)
- [x] invites (invite, my-invites, all-invites, response, blocks) → [invites SPEC](specs/features/invites/SPEC.md) (v0.1.0; ported; co-mounted at `/api/program-memberships`; emits wired **live** per D-C2; `target_member_id` dropped per D-C3a; `getAllInvites` N+1 batched per D-C3b; accept-path membership write inline per D-C1)
- [x] workouts library (CRUD) → [workouts SPEC](specs/features/workouts/SPEC.md) (v0.1.0; 🏗️ ported — global library `/api/workouts` mounted; `POST /mobile` dropped as a byte-dup per D-C2; `consumed_by = [ios]`, GET-only live, admin CRUD called by neither client per D-REF; bare delete kept per D-S1/F2; program-scoped half → program-workouts)
- [x] program-workouts (custom CRUD, global+custom visibility toggles, merged list) → [program-workouts SPEC](specs/features/program-workouts/SPEC.md) (v0.1.0; 🏗️ ported — 6 routes at `/api/program-workouts`, the program-scoped half of the shared `workoutService.js`; `consumed_by = [web, ios]` all 6 routes 1:1; per-action admin authz **hoisted** to a `requireProgramAdmin` resolve-or-pass-through middleware per D-C2; faithful otherwise — merge/dual-id/lazy-materialization/dedup/in-use-guard kept per D-S1)
- [x] workout-logs (single, batch, member) → [workout-logs SPEC](specs/features/workout-logs/SPEC.md) (v0.1.0; 🏗️ ported — the `workoutLogRouter` half of the shared `routes/logs.js`/`services/logService.js`; `daily-health-logs` = the other half, appended to the same file pair later per D-C1; **2 dead GET routes dropped** — `GET /` + `GET /member/:memberName` called by neither client; 4 live routes ported. `consumed_by = [web, ios]` — trio 1:1, `POST /batch` web-only. 4 user-chosen cleanups: D-C2 positive-int duration, D-C3 collapse member-auth double-check, D-C4 de-dup membership lookups, D-C5 hoist the `admin_only_data_entry` lock to a `requireDataEntryAllowed` middleware. Faithful otherwise; F1–F9)
- [ ] daily-health-logs (CRUD)
- [x] notifications (unacknowledged, device register/unregister, broadcast, acknowledge, SSE stream) → [notifications SPEC](specs/features/notifications/SPEC.md) (v0.1.0; ported; **replaced the deferred `utils/notifications.js` stub** so programs/memberships emits now fire; SSE stream auth migrated symmetric→Supabase JWKS per D-C2; APNs creds deferred per D-C4; `POST /broadcast` kept vestigial F1)
- [ ] analytics v1 (summary, participation, workouts/duration, timeline, distribution, types)
- [ ] analytics v2 (summary, participation, workout-type aggregates)
- [ ] member-analytics (metrics, history, streaks, recent)
- [ ] app-config (min iOS version) + push (APNs)

## web (Next.js) — `../rasifiters-webapp`
- [ ] public: splash, login, create-account, privacy-policy, support
- [ ] programs hub + program overview + roles/edit
- [ ] program settings: profile, password, appearance, privacy
- [ ] summary dashboard + activity / distribution / workout-types
- [ ] logging: log-workout, log-health, bulk-log-workout
- [ ] members: list, detail, invite, metrics, health, history, workouts, streaks
- [ ] lifestyle: dashboard, timeline, workouts management
- [ ] cross-cutting: auth/session, role-based UI, React Query layer, charts

## ios (SwiftUI) — `../ios-mobile`
- [ ] auth: splash, login, create-account
- [ ] program picker + create/edit/invites
- [ ] admin home tabs: summary, members, lifestyle/workout-types, program (admin + standard variants)
- [ ] member detail: metrics, history, streaks, recent, health
- [ ] settings: profile, password, appearance, notifications
- [ ] widgets: quick-add workout, quick-add health
- [ ] cross-cutting: ProgramContext state, APIClient + Keychain, SSE + push, version check
