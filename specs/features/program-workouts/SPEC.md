# Feature: `program-workouts` — a program's workout list (visibility toggles + custom CRUD)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/programWorkouts.js`, `services/workoutService.js`
> (the **program-scoped** functions only — the file is shared with `workouts`, §7/D-C1),
> `models/ProgramWorkout.js`, `server.js` (`/api/program-workouts` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken`) · the
> [`workouts`](../workouts/SPEC.md) global library (the source set a program draws from) ·
> [`program-memberships`](../program-memberships/SPEC.md) (the `ProgramMembership` admin-role check the
> visibility/CRUD authorization reads).
> **One deliberate change** (the rest is faithful): **hoist the per-action admin authorization out of the
> service into shared route middleware** (`requireProgramAdmin`) — see **§7** (decision **D-C2**).

---

## 1. What it is

A **program's workout list** — the set of workout choices a single program offers, computed as
*the global library + the program's custom additions, minus the ones the program has hidden*. This SPEC
owns the six `/api/program-workouts` routes and the six program-scoped functions
(`getProgramWorkouts` / `toggleGlobalWorkoutVisibility` / `toggleCustomWorkoutVisibility` /
`addCustomWorkout` / `editCustomWorkout` / `deleteCustomWorkout`) split out of the shared
`services/workoutService.js` (D-C1), backed by the `program_workouts` table:

1. **List a program's workouts** — `GET /api/program-workouts?programId=…`. Any authenticated member.
   Returns the merged global+custom list with per-program `is_hidden`. The only ungated route — log forms,
   the program dashboard, member-workout filters, and the iOS quick-add widget all read it.
2. **Hide/show a global workout for a program** — `PUT /api/program-workouts/toggle-visibility`. Program
   admin. Lazily materializes a `program_workouts` row over the library workout.
3. **Hide/show a custom workout** — `PUT /api/program-workouts/:id/toggle-visibility`. Program admin.
4. **Add a custom workout** — `POST /api/program-workouts/custom`. Program admin.
5. **Rename a custom workout** — `PUT /api/program-workouts/:id`. Program admin.
6. **Delete a custom workout** — `DELETE /api/program-workouts/:id`. Program admin. Guarded against
   deleting a workout that has logs (friendly 400).

## 2. Why it exists

The global `workouts` library is shared app-wide, but each program curates its own list: hide library
entries that don't apply, and add program-specific custom workouts. `program-workouts` is that
per-program curation layer. The merged list it returns (`getProgramWorkouts`) is the canonical source the
**logging** surfaces draw from — every "pick a workout" dropdown (single-log, bulk-log, member filters,
the iOS lock-screen widget) is populated from it, and clients hide the `is_hidden` rows client-side. A
`workout_logs` row points at a `program_workouts` row, so this table is also the join target for all
workout logging. Authorization (the program-admin gate on the curation routes) stays in Express per the
auth model — we do not rely on RLS.

## 3. Functionality (the routes)

All mounted at **`/api/program-workouts`** (legacy `routes/programWorkouts.js`). Handlers in
`routes/programWorkouts.js`; logic in the program-scoped half of `services/workoutService.js`. Every route
is `authenticateToken`-only in legacy, with the admin check **inline in the service**; the port hoists
that check to a `requireProgramAdmin` route middleware on the five curation routes (D-C2) — `GET` stays
ungated.

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `GET /` | `programWorkouts.js:8-17` → `getProgramWorkouts` (`workoutService.js:32-72`) | any authenticated member | Merged global+custom list for `query.programId`, sorted by name. |
| 2 | `PUT /toggle-visibility` | `programWorkouts.js:19-28` → `toggleGlobalWorkoutVisibility` (`workoutService.js:74-109`) | program admin | Toggle a **global** workout's visibility for a program (`body.program_id`, `body.library_workout_id`); creates the `program_workouts` row on first hide. |
| 3 | `PUT /:id/toggle-visibility` | `programWorkouts.js:30-39` → `toggleCustomWorkoutVisibility` (`workoutService.js:111-135`) | program admin | Toggle a **custom** workout's visibility (`params.id`). 400 if the row is a global (has `library_workout_id`). |
| 4 | `POST /custom` | `programWorkouts.js:41-50` → `addCustomWorkout` (`workoutService.js:137-170`) | program admin | Create a custom workout (`body.program_id`, `body.workout_name`). 201. Dedup vs program + global. |
| 5 | `PUT /:id` | `programWorkouts.js:52-61` → `editCustomWorkout` (`workoutService.js:172-206`) | program admin | Rename a custom workout (`params.id`, `body.workout_name`). 400 if the row is a global. Dedup vs program + global. |
| 6 | `DELETE /:id` | `programWorkouts.js:63-72` → `deleteCustomWorkout` (`workoutService.js:208-229`) | program admin | Delete a custom workout (`params.id`). 400 if global; **400 if it has any workout logs** (in-use guard). |

> **Route ordering (preserved):** the static `PUT /toggle-visibility` (route 2) is declared before the
> dynamic `PUT /:id/toggle-visibility` (route 3) and `PUT /:id` (route 5), and `:id/toggle-visibility`
> before `:id`, so Express matches them correctly. Keep this order on port.

### The merged-list shape — `getProgramWorkouts` (`workoutService.js:32-72`)

1. 400 if no `programId`; 404 if the program is missing or `is_deleted`.
2. Load all library workouts (`Workout.findAll`, name ASC) + all `program_workouts` for the program.
3. Index program rows that have a `library_workout_id` into a map.
4. For each library workout, emit `{ id: pw?.id || gw.id, workout_name: gw.workout_name, source: "global",
   is_hidden: pw?.is_hidden || false, library_workout_id: gw.id }` — the **`id` is the `program_workouts`
   row id when one exists, else the library id** (§10 F2).
5. For each custom row (no `library_workout_id`), emit `{ id, workout_name, source: "custom", is_hidden,
   library_workout_id: null }`.
6. Sort the merged result by `workout_name` (`localeCompare`). **Hidden rows are included** — clients
   filter `is_hidden` themselves (§10 F3).

### Response shapes (preserved 1:1)

- **`GET /`**: a JSON array of `{ id, workout_name, source: "global"|"custom", is_hidden, library_workout_id }`.
- **Routes 2/3/5** (`workoutService.js:101-108, 127-134, 198-205`): the affected row as
  `{ id, workout_name, source, is_hidden, library_workout_id, message }`.
- **Route 4** (`workoutService.js:162-169`, HTTP 201): same shape, `is_hidden:false`, `source:"custom"`,
  `library_workout_id:null`, `message:"Custom workout created successfully."`.
- **Route 6** (`workoutService.js:228`): `{ message: "Custom workout deleted successfully." }`.

### Error contract (faithful — `routes/programWorkouts.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific
generic (`"Failed to fetch program workouts."`, `"Failed to toggle workout visibility."`,
`"Failed to toggle custom workout visibility."`, `"Failed to create custom workout."`,
`"Failed to update custom workout."`, `"Failed to delete custom workout."`). Status codes: `400` (missing
required fields; wrong-type toggle/edit/delete on a global; duplicate name on add/edit; in-use delete),
`403` (non-admin on a curation route), `404` (program/workout not found). **The hoist (D-C2) preserves
these codes** — see §7.

## 4. Feature list (behaviors to port)

- **List** (`workoutService.js:32-72`) — the merge above. Ungated beyond `authenticateToken`.
- **Toggle global** (`workoutService.js:74-109`) — admin check (hoisted, D-C2); 404 if the library
  workout is missing; **lazy create** a `program_workouts` row (`is_hidden:true`) if none exists, else
  flip `is_hidden`. Returns the row + a message (§10 F4 lazy materialization).
- **Toggle custom** (`workoutService.js:111-135`) — `findByPk`; 404 if missing; **400 if it has a
  `library_workout_id`** (use the global toggle instead); admin check (hoisted); flip `is_hidden`.
- **Add custom** (`workoutService.js:137-170`) — require `program_id` + `workout_name` (400); admin check
  (hoisted); **dedup pre-check** vs `program_workouts` (same program+name) AND vs the global library
  (both 400); create `{ library_workout_id:null, is_hidden:false }`. 201.
- **Edit custom** (`workoutService.js:172-206`) — require `workout_name` (400); `findByPk` (404); **400 if
  global**; admin check (hoisted); **dedup pre-check** vs program (excluding self) AND global; rename.
- **Delete custom** (`workoutService.js:208-229`) — `findByPk` (404); **400 if global**; admin check
  (hoisted); **in-use guard**: `WorkoutLog.count({ where: { program_workout_id } })` > 0 → 400 with the
  count (§10 F5 — friendlier than the library's bare delete); else `destroy`.

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`. Already migrated; `models/ProgramWorkout.js`
already ported (with associations in `models/index.js`).

- **`program_workouts`** (owned — read + write) — `id` (UUID), `program_id` (FK → `programs(id)`,
  **`ON DELETE CASCADE`**), `library_workout_id` (FK → `workouts_library(id)`, nullable, **no cascade**),
  `workout_name` (NOT NULL), `is_hidden` (BOOL, default false), `created_at`/`updated_at`. Model
  `ProgramWorkout`, `tableName:"program_workouts"`, `timestamps:true`, `underscored:true`.
- **`workouts_library`** (referenced, owned by [`workouts`](../workouts/SPEC.md)) — read for the merge +
  the add/edit global-name-conflict checks. A global workout becomes program-scoped only when toggled
  (lazy row creation).
- **`programs`** (referenced, owned by [`programs`](../programs/SPEC.md)) — the `getProgramWorkouts`
  program-exists/`is_deleted` check.
- **`program_memberships`** (referenced, owned by [`program-memberships`](../program-memberships/SPEC.md))
  — the program-admin authorization lookup (`role:"admin", status:"active"`).
- **`workout_logs`** (referenced, owned by `workout-logs`, not yet specced) — the delete in-use guard
  counts rows by `program_workout_id`.

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL` (`config/database.js`). No feature flags;
no rate limiting. The program-admin gate is the new `requireProgramAdmin` middleware (D-C2), which reuses
the `global_admin` short-circuit + the `ProgramMembership` lookup the service used inline.

## 7. The migration delta + the one deliberate change

**No auth-table / stack migration delta.** `program-workouts` touches none of the retired credential
tables and has no SSE/push coupling; the only stack change is the shared `DATABASE_URL`. The
`ProgramWorkout`/`Workout`/`WorkoutLog` models + their associations are already ported (with earlier
features). So the entire feature is a **faithful 1:1 port** with exactly one deliberate change:

- **Hoist the per-action admin authorization out of the service into shared route middleware (D-C2 — the
  single deliberate change).** Legacy repeats the same block inline in all five curation functions
  (`workoutService.js:79-84, 118-123, 142-147, 181-186, 215-220`):
  `requester.global_role === "global_admin"` OR an active admin `ProgramMembership` for the program, else
  `403`. The port extracts this into a **`requireProgramAdmin` middleware** mounted on routes 2–6;
  `getProgramWorkouts` (route 1) stays ungated. The service functions drop their inline admin checks
  (their validation, 404, type, dedup, and mutation logic are otherwise unchanged).
  - **Status-code fidelity (resolve-or-pass-through).** To keep observable behavior 1:1 (CLAUDE.md
    non-breaking), the middleware does **not** blindly 403 first. `global_admin` always passes. Otherwise
    it resolves the target `program_id` — from `body.program_id` (routes 2 & 4) or by loading the
    `ProgramWorkout` by `params.id` (routes 3, 5, 6). **If it cannot resolve** (missing body field, or the
    row isn't found), it **passes through** so the service emits its native `400`/`404` before any
    mutation; it returns `403` **only** when a `program_id` resolves and the requester is not an active
    program admin. This preserves the legacy ordering (validation/404 before authz) for non-admins.
  - **Double-load tradeoff.** On the three `/:id` routes the middleware loads the `ProgramWorkout` to find
    its `program_id`, and the service loads it again — one extra indexed PK read on those routes. We keep
    the middleware and service **decoupled** (no `req`-attached state) so each stays independently
    testable; the extra read is a by-PK lookup, not an N+1.

**What stays (faithful 1:1):** the six routes + their `authenticateToken` gate and ordering, the merge
algorithm and its dual-meaning `id`, the lazy `program_workouts` row creation on first global hide, the
wrong-type 400s, the add/edit dedup pre-checks against both program and library, the delete in-use 400
guard, the unfiltered (`is_hidden`-inclusive) list, the response shapes, and the error contract.

> **Scope note (D-C1).** The legacy `services/workoutService.js` is **one file holding two features**: the
> global-library functions ([`workouts`](../workouts/SPEC.md), already ported) and the program-scoped
> functions (this SPEC). The `workouts` port already split the file along this boundary, taking only the
> four library functions. This port adds `apps/backend/services/workoutService.js`'s program-scoped half —
> i.e. **append the six program-scoped functions** to the already-ported file (one file, both halves
> reunited), or keep them co-located; either way this SPEC owns only the program-scoped six.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) — `authenticateToken` establishes `req.user`; the
  `global_admin` short-circuit reads `req.user.global_role`. [`program-memberships`](../program-memberships/SPEC.md)
  — the `ProgramMembership` admin-role lookup the authorization depends on. [`workouts`](../workouts/SPEC.md)
  — the global library the merge draws from + the add/edit name-conflict checks. [`programs`](../programs/SPEC.md)
  — the program-exists check.
- **Downstream / referenced (not owned here):** `workout-logs` (logs point at `program_workouts`; the
  delete in-use guard counts them) · the logging/summary surfaces that read the merged list.
- **Consumers:** **`web` + `ios`** — all six routes 1:1, no divergence.
  - **web:** the **Workout Types** management page (`rasifiters-webapp/src/app/lifestyle/workouts/page.tsx`)
    drives all six (`GET` :44, toggle-global :54-57/158/176, toggle-custom :65/159/177, add :73/213, edit
    :85/247, delete :97/164/182), gated by `canManage = isGlobalAdmin || program.my_role === "admin"`
    (:25-27). `GET` is also read by `program/page.tsx:53`, `members/workouts/page.tsx:85`,
    `LogWorkoutForm.tsx:48` (filters `is_hidden` :50), `BulkLogWorkoutForm.tsx:121` (filters :125).
  - **ios:** the **`ViewWorkoutTypesListView`** screen (`Features/Home/Tabs/WorkoutTypesSection.swift`)
    drives all six via `ProgramContext+WorkoutManagement.swift` (`GET` :88, toggle-global :103,
    toggle-custom :117, add :133, edit :147, delete :161), gated by `canManage = canEditProgramData`
    (`isProgramAdmin`, WorkoutTypesSection :65-67). `GET` is also read by the quick-add widget
    (`QuickAddWorkoutWidgetEntryView.swift:479`).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the program-scoped half only** — `routes/programWorkouts.js` (the six `/api/program-workouts` routes) + the six program-scoped functions (`getProgramWorkouts`/`toggleGlobalWorkoutVisibility`/`toggleCustomWorkoutVisibility`/`addCustomWorkout`/`editCustomWorkout`/`deleteCustomWorkout`) split from the shared `workoutService.js`. The library functions belong to [`workouts`](../workouts/SPEC.md) (already ported). | `workoutService.js:5-28` (library) vs `:30-229` (program); COVERAGE line 19; workouts SPEC D-C1; user decision. |
| **D-C2** | **Hoist the per-action admin authorization into a shared `requireProgramAdmin` route middleware** (the single deliberate change), mounted on routes 2–6; `GET` stays ungated. Middleware is **resolve-or-pass-through**: `global_admin` passes; resolve `program_id` from body or by loading the `ProgramWorkout`; pass through when unresolvable so the service emits its native 400/404; 403 only on a resolved non-admin. Service functions drop their inline admin blocks. Status codes preserved 1:1. | Inline checks `workoutService.js:79-84, 118-123, 142-147, 181-186, 215-220`; user decision (hoist + resolve-or-pass-through); CLAUDE.md non-breaking. |
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [web, ios]`** — all six routes used 1:1 by both clients, no divergence. `GET` additionally feeds log forms, the program dashboard, member-workout filters, and the iOS quick-add widget. | Web sweep (`lifestyle/workouts/page.tsx` + 4 GET readers) + iOS sweep (`WorkoutTypesSection.swift` + widget); Explore agents. |
| **D-S1** | **Stance = faithful 1:1 except the authz hoist (D-C2).** Routes, ordering, the merge + dual-meaning id, lazy materialization, wrong-type 400s, dedup pre-checks, the delete in-use guard, the unfiltered list, response shapes, and the error contract are preserved; oddities are flagged (§10), not fixed. | Whole-module review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Authorization was inline per-function, not middleware** (legacy). This port hoists it (D-C2) — the one deliberate change. Recorded so an audit knows the legacy shape and that `workouts` (library) hoisted a *different* (global-only `isAdmin`) gate. | `workoutService.js:79-84, 118-123, 142-147, 181-186, 215-220` | Changed (the hoist itself). |
| **F2** | **`GET`'s `id` is dual-meaning** — for a global workout it's the `program_workouts` row id when one exists (i.e. it's been toggled), else the library workout id (`pw?.id || gw.id`). Clients must not assume `id` is stable for a global until it's been hidden/shown once. | `workoutService.js:51` | Kept (faithful) — both clients handle it; a real cleanup would always surface the library id separately. |
| **F3** | **`GET` returns hidden rows** — the merged list includes `is_hidden:true` entries; every consumer filters them client-side (web `LogWorkoutForm.tsx:50`, `BulkLogWorkoutForm.tsx:125`; iOS widget; the admin page shows them in a "hidden" section). | `workoutService.js:46-71`; client filters | Kept (faithful) — the admin management screen needs the hidden rows, so the server returns all. |
| **F4** | **Toggling a global workout lazily materializes a `program_workouts` row** (`is_hidden:true`) on first hide; there's no row until then. So a never-touched global has no program-scoped record. | `workoutService.js:91-98` | Kept (faithful) — intended (avoids pre-seeding a row per program × library workout). |
| **F5** | **`deleteCustomWorkout` has a friendly in-use 400 guard** (counts `workout_logs` by `program_workout_id`) — unlike the `workouts` library's bare `destroy` (which 500s on an FK violation, workouts §10 F2). The asymmetry is faithful: customs are deletable-with-a-check, library entries are hide-only for programs. | `workoutService.js:222-225` | Kept (faithful) — this is the *better* behavior; noted for contrast with workouts F2. |
| **F6** | **Add/edit dedup checks both `program_workouts` AND `workouts_library` by name** — a custom workout can't collide with a program name or a global name. Pre-check 400 (no reliance on a unique constraint here, unlike the library). | `workoutService.js:149-153, 188-194` | Kept (faithful). |
| **F7** | **No `program_id`/membership validation on `getProgramWorkouts` beyond program-exists** — any authenticated member can read any program's list by id (no membership check on `GET`). Correct for the cross-program log/widget reads, but it is an unscoped read. | `workoutService.js:32-72`; `programWorkouts.js:8` | Kept (faithful) — intended read-for-any-member; a stricter rebuild could scope it to members of the program. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents a program's workout list (`/api/program-workouts`) — the six program-scoped routes + functions split from the shared `workoutService.js`. Decisions D-C1 (scope = program-scoped half; library half → `workouts`, already ported) / D-C2 (the one deliberate change — hoist the per-action admin authz into a `requireProgramAdmin` resolve-or-pass-through middleware, preserving status codes; service drops inline checks) / D-REF (`consumed_by = [web, ios]`, all six routes 1:1, no divergence; `GET` also feeds log forms + the iOS widget) / D-S1 (faithful except the hoist; merge/dual-id/lazy-materialization/dedup/in-use-guard kept + flagged). Flagged F1–F7. No auth/stack migration delta (models + schema already ported). |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — appended the six program-scoped functions to `services/workoutService.js` (reuniting both halves of the shared legacy file per D-C1; inline admin checks removed per D-C2, `requester` param dropped from the curation fns), added `routes/programWorkouts.js` (6 routes; `GET` ungated, the five curation routes guarded by a local **resolve-or-pass-through `requireProgramAdmin(resolveProgramId)`** factory whose per-route resolvers mirror each legacy fn's pre-admin-check guards so status codes stay 1:1 per D-C2), mounted `/api/program-workouts` in `server.js`. The `ProgramWorkout`/`Workout`/`WorkoutLog` models + associations were already ported. Boot check passes: 6-route stack with correct ordering (`/toggle-visibility` before `/:id/toggle-visibility` before `/:id`), `GET` = `[authenticateToken, handler]`, curation routes = `[authenticateToken, guard, handler]`, all 10 service fns export, server loads. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
