# COVERAGE.md — Route / module → feature SPEC audit map

The audit record that every route, screen, and backend module of the legacy app maps to a feature SPEC in
`specs/features/`. Built up as the `question-asker` loop documents each surface. The goal: when this is fully
ticked, we know the rebuild covers the legacy app 1:1 with nothing missed.

Legend: `[ ]` not yet documented · `[~]` SPEC in progress · `[x]` covered by a SPEC.

> Fresh scaffold — nothing documented yet. The checklists below are the surface inventory (from the
> research pass) to be filled in feature-by-feature.

## backend (Express API) — `../backend`
- [x] auth (login/app/global, refresh, logout, register, change-password, delete-account) → [auth SPEC](specs/features/auth/SPEC.md) (v0.1.0; incl. `middleware/auth.js` authz gates per D-C1)
- [x] members (CRUD, list) → [members SPEC](specs/features/members/SPEC.md) (v0.1.0; `DELETE /:id` cascade deferred → 501 per D-C1; `createMember` wired to Supabase `createUser` per D-C2)
- [x] programs (CRUD, archive, admin_only_data_entry) → [programs SPEC](specs/features/programs/SPEC.md) (v0.1.0; ported; `description` dropped per D-C2; notification emit deferred → `notifications` per D-C1)
- [x] program-memberships (members, details, role/status, remove, leave + `handleMemberExit`) → [program-memberships SPEC](specs/features/program-memberships/SPEC.md) (v0.1.0; ported; `createMemberAndEnroll` fixed→loginable per D-C2; `available`+`enroll` dropped as dead routes per D-C3; notification emits deferred per D-C4)
- [ ] invites (invite, my-invites, all-invites, response, blocks)
- [ ] workouts library (CRUD, mobile)
- [ ] program-workouts (custom, visibility toggles)
- [ ] workout-logs (single, batch, member)
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
