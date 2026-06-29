# Feature: `workouts` — the global workout library (admin CRUD + read)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/workouts.js`, `services/workoutService.js`
> (the **global-library** functions only — the file is shared with `program-workouts`, §7/D-C1),
> `models/Workout.js`, `server.js` (`/api/workouts` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken`; the write routes add
> `isAdmin`).
> **One deliberate change** (the rest is faithful): **drop the vestigial `POST /mobile` route** — a
> byte-identical duplicate of `POST /` called by no client — see **§7** (decision **D-C2**).

---

## 1. What it is

The **global workout library** of RaSi Fiters — a flat, app-wide list of named workouts (the
`workouts_library` table) that every program draws from. This SPEC owns the four `/api/workouts` routes and
the four library functions (`getAllWorkouts` / `createWorkout` / `updateWorkout` / `deleteWorkout`) split
out of the shared `services/workoutService.js` (D-C1). After dropping the dead `/mobile` duplicate (D-C2):

1. **List the library** — `GET /api/workouts`. Returns every library workout, ordered by name. Any
   authenticated member. **The only live route** — iOS reads it to populate the "Add Workout" picker when
   no program is selected (`ios-mobile/.../APIClient+Workouts.swift:33-40`).
2. **Create a library workout** — `POST /api/workouts`. `global_admin` only. **Called by no client** (§10 F1).
3. **Rename a library workout** — `PUT /api/workouts/:workout_name`. `global_admin` only. **Called by no
   client** (§10 F1).
4. **Delete a library workout** — `DELETE /api/workouts/:workout_name`. `global_admin` only. **Called by no
   client** (§10 F1).

## 2. Why it exists

The library is the **shared source of workout names** the whole app references. A program's workout list
(`program-workouts`) is computed as *the global library + the program's custom additions, minus the ones
the program has hidden* — so every program starts from this same global set. Workout logs ultimately point
at a `program_workouts` row, which may be backed by a `library_workout_id` into this table. Clients need to
(a) read the library to offer workout choices (iOS picker), and (b) — in principle — administer it
(create/rename/delete), though no current client ships that admin UI. Authorization (the `isAdmin` global
gate) stays in Express per the auth model — we do not rely on RLS.

## 3. Functionality (the routes)

All mounted at **`/api/workouts`** (legacy `routes/workouts.js`). Handlers in `routes/workouts.js`; logic in
the library half of `services/workoutService.js`. `GET` is `authenticateToken`-only; the three write routes
add the `isAdmin` global-admin gate at the router.

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `GET /` | `workouts.js:8-17` → `getAllWorkouts` (`workoutService.js:7-9`) | any authenticated member | List all library workouts, `ORDER BY name ASC`. |
| 2 | `POST /` | `workouts.js:19-28` → `createWorkout` (`workoutService.js:11-14`) | `global_admin` (`isAdmin`) | Create a workout from `body.workout_name`. 201. |
| 3 | `PUT /:workout_name` | `workouts.js:41-50` → `updateWorkout` (`workoutService.js:16-21`) | `global_admin` (`isAdmin`) | Rename: URL = current name, `body.workout_name` = new name. |
| 4 | `DELETE /:workout_name` | `workouts.js:52-61` → `deleteWorkout` (`workoutService.js:23-28`) | `global_admin` (`isAdmin`) | Delete by name (bare destroy — §7/F2). |

> **Dropped:** `POST /api/workouts/mobile` (`workouts.js:30-39`) — a byte-identical duplicate of route 2
> (both call `createWorkout(req.body.workout_name)`), called by neither client. Removed (D-C2 / §10 F3).

### Response shapes (preserved 1:1)

- **`GET /`** (`workoutService.js:7-9`): a JSON array of full `Workout` rows, each
  `{ id, workout_name, created_at, updated_at }` (the model maps DB `name` → `workout_name`; `timestamps:true`,
  `underscored:true`). iOS decodes only `workout_name` (`WorkoutDTO`).
- **`POST /`** (`workoutService.js:13`, HTTP 201): the created `Workout` row (same `{ id, workout_name,
  created_at, updated_at }` shape).
- **`PUT /:workout_name`** (`workoutService.js:20`): `{ message: "Workout updated successfully." }` — **no
  workout object returned** (§10 F4).
- **`DELETE /:workout_name`** (`workoutService.js:27`): `{ message: "Workout deleted successfully." }`.

### Error contract (faithful — `routes/workouts.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific
generic (`"Failed to fetch workouts."`, `"Failed to add workout."`, `"Failed to update workout."`,
`"Failed to delete workout."`). Status codes seen: `400` (missing `workout_name` on create), `404`
(workout not found on update/delete), `403` (non-admin hitting a write route — from `isAdmin`). Note two
faithful gaps: a **duplicate name** on create/rename hits the `workouts_library_name_key` unique constraint
and surfaces as a generic **500** (no friendly pre-check — §10 F5); a **delete of an in-use workout** hits
the un-cascaded `program_workouts.library_workout_id` FK and also surfaces as **500** (§10 F2).

## 4. Feature list (behaviors to port)

- **List** (`workoutService.js:7-9`) — `Workout.findAll({ order: [["workout_name","ASC"]] })`; returns full
  rows. No filtering, no auth beyond `authenticateToken`.
- **Create** (`workoutService.js:11-14`) — require non-empty `workout_name` (`400` else); `Workout.create({
  workout_name })`. Relies on the unique constraint for dedup (no pre-check → 500 on collision, F5).
- **Rename** (`workoutService.js:16-21`) — `findOne({ where: { workout_name: currentName } })`; `404` if
  none; `update({ workout_name: newName })`; return `{ message }`. A missing `newName` is a Sequelize no-op
  (undefined field skipped); a colliding `newName` → unique-violation 500 (F5).
- **Delete** (`workoutService.js:23-28`) — `findOne` by name; `404` if none; **bare `workout.destroy()`** —
  no in-use guard. If any `program_workouts` row references it via `library_workout_id` (FK has **no**
  `ON DELETE CASCADE`), the destroy throws → generic 500 (F2). Kept faithful (D-S1).

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`. Already migrated; `models/Workout.js`
already ported (byte-identical to legacy) with associations in `models/index.js`.

- **`workouts_library`** (owned — read + write) — `id` (UUID, `gen_random_uuid()`), `name` (TEXT, NOT NULL,
  **UNIQUE** — `workouts_library_name_key`), `created_at`/`updated_at`. The Sequelize model `Workout` maps
  `name` → the `workout_name` attribute (`field: "name"`), `tableName: "workouts_library"`, `timestamps:true`,
  `underscored:true`.
- **`program_workouts`** (referenced, **not owned**) — its `library_workout_id` FK points at
  `workouts_library(id)` **without `ON DELETE CASCADE`** (only `program_id` cascades). This is why an in-use
  library delete throws (F2). Owned by the `program-workouts` feature.
- **`workout_logs`** (referenced, **not owned**) — points at `program_workouts`, not directly at the
  library. Owned by the `workout-logs` feature.

## 6. Flags / env

No workouts-specific env. DB access via the shared `DATABASE_URL` (`config/database.js`). No feature flags;
no rate limiting. The `isAdmin` gate is the global-admin check from `middleware/auth.js` (auth feature).

## 7. The migration delta + the one deliberate change

**No auth-table / stack migration delta.** Unlike `auth`/`members`, `workouts` touches none of the retired
credential tables and has no SSE/push coupling; the only stack change is the shared `DATABASE_URL`. The
`Workout` model + schema are already ported faithfully. So the entire feature is a **faithful 1:1 port**
with exactly one deliberate cleanup:

- **Drop the vestigial `POST /api/workouts/mobile` route (D-C2 — the single deliberate change).** It is a
  **byte-identical duplicate** of `POST /api/workouts` — both handlers call
  `workoutService.createWorkout(req.body.workout_name)` and `201` the result (`workouts.js:19-28` vs
  `:30-39`). The cross-app sweep confirms **neither client calls it** (the "mobile" name is misleading —
  iOS calls only `GET`). Porting both would duplicate a dead path. The rebuild ships the four real routes
  and omits `/mobile`. (Faithful analog of members' dead-route handling — but here we remove rather than
  keep, since it is a pure duplicate with zero behavioral difference.)

**What stays (faithful 1:1):** the `GET`/`POST`/`PUT`/`DELETE` paths + their `authenticateToken`(+`isAdmin`)
gates, the `ORDER BY name ASC` list, the create `400`-on-blank + reliance on the unique constraint, the
rename-by-name semantics, the **bare unguarded delete** (D-S1 — the FK protects integrity, the 500 is
accepted), the response shapes, and the error contract.

> **Scope note (D-C1).** The legacy `services/workoutService.js` is **one file holding two features**: the
> global-library functions (this SPEC) and the program-scoped functions (`getProgramWorkouts`,
> `toggleGlobalWorkoutVisibility`, `toggleCustomWorkoutVisibility`, `addCustomWorkout`, `editCustomWorkout`,
> `deleteCustomWorkout` — the `program-workouts` feature, COVERAGE line 19). On port, **split the file along
> this boundary**: `apps/backend/services/workoutService.js` holds only the four library functions; the
> program-scoped half ports with `program-workouts`.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) — `authenticateToken` establishes `req.user`; `isAdmin` enforces
  the `global_admin` gate on the three write routes.
- **Downstream / referenced (not owned here):** `program-workouts` (its `program_workouts.library_workout_id`
  FK references this library; it computes a program's list as library + custom − hidden) · `workout-logs`
  (logs point at `program_workouts`, transitively at the library).
- **Consumers:** **`ios` only** — `APIClient+Workouts.swift:33-40` (`GET`), feeding `AddWorkoutDetailView`'s
  workout picker via `ProgramContext` when no program is selected. **Web does not consume it** (its
  `fetchWorkouts()` wrapper at `rasifiters-webapp/src/lib/api/programs.ts:50-52` is defined but never
  imported/called — dead scaffolding, §10 F1).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the global library only** — `routes/workouts.js` (the `/api/workouts` routes) + the four library functions (`getAllWorkouts`/`createWorkout`/`updateWorkout`/`deleteWorkout`) split out of the shared `workoutService.js`. The program-scoped functions in the same file → the separate `program-workouts` feature (COVERAGE line 19). | `workoutService.js:5-28` (library) vs `:30-229` (program); COVERAGE lines 18 vs 19; user decision. |
| **D-C2** | **Drop the vestigial `POST /api/workouts/mobile` route** — a byte-identical duplicate of `POST /` called by neither client. The single deliberate change; the four real routes port faithfully. | `workouts.js:19-28` vs `:30-39`; web + iOS consumption sweep; user decision. |
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [ios]`** — the only live consumer is iOS's `GET` (picker reference data). Web's `fetchWorkouts()` is defined-but-dead, and the three write routes are called by neither client → all flagged vestigial (§10 F1), kept for API parity (faithful). | Web sweep (`programs.ts:50-52` dead) + iOS sweep (`APIClient+Workouts.swift:33-40` GET only); Explore agents. |
| **D-S1** | **Stance = faithful 1:1 except dropping `/mobile` (D-C2).** Routes, gates, the bare unguarded delete (FK-500 when in use, F2), the no-dedup-pre-check create (unique-500 on collision, F5), response shapes, and the error contract are preserved; oddities are flagged (§10), not fixed. | Whole-module review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **The admin CRUD is consumed by no client; only `GET` is live (iOS).** Web's `fetchWorkouts()` wrapper exists but is never imported/called; `POST`/`PUT`/`DELETE` have no UI on either client. Kept for API parity, `consumed_by = [ios]`. | web `programs.ts:50-52` (dead); iOS `APIClient+Workouts.swift:33-40` (GET only) | Kept (D-REF) — vestigial admin surface; a real cleanup would prune routes 2–4, but faithful keeps them. |
| **F2** | **`deleteWorkout` is a bare `destroy()` with no in-use guard.** The `program_workouts.library_workout_id` FK has no `ON DELETE CASCADE`, so deleting an in-use library workout throws an FK violation → generic 500 (vs `deleteCustomWorkout`'s friendly 400 guard). | `workoutService.js:23-28`; schema `program_workouts_library_workout_id_fkey` | **Yes** — add an in-use count → 400 guard (user chose faithful-keep for now). |
| **F3** | **`POST /mobile` was a byte-identical duplicate of `POST /`** — dropped (D-C2). Recorded so a future audit knows the legacy had two create routes. | `workouts.js:30-39` (legacy) | Removed (the cleanup itself). |
| **F4** | **`updateWorkout`/`deleteWorkout` return only `{ message }`**, not the affected workout object — asymmetric with `GET`/`POST` which return full rows. | `workoutService.js:20, 27` | Kept (faithful) — no client reads a return from these (neither calls them). |
| **F5** | **No duplicate-name pre-check on create/rename** — relies on the `workouts_library_name_key` unique constraint, so a collision surfaces as a generic 500 rather than a friendly 400. | `workoutService.js:11-21`; schema unique constraint | Kept (faithful) — cleanup candidate alongside F2. |
| **F6** | **`GET /` has no role gate beyond `authenticateToken`** — any authenticated member reads the whole library (correct: iOS needs it for the picker). Only writes are `isAdmin`-gated. | `workouts.js:8`; iOS picker use | Kept (faithful) — intended read-for-all. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the global workout library (`/api/workouts`) — the four real routes + the four library functions split from the shared `workoutService.js`. Decisions D-C1 (scope = library only; program-scoped half → `program-workouts`) / D-C2 (the one deliberate change — drop the byte-duplicate `POST /mobile`) / D-REF (`consumed_by = [ios]`; web's `fetchWorkouts` dead, admin CRUD called by neither client) / D-S1 (faithful except the `/mobile` drop; bare delete + no-dedup-precheck kept + flagged). Flagged F1–F6. No auth/stack migration delta (model + schema already ported). |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — `services/workoutService.js` (the **library half only** per D-C1: faithful `getAllWorkouts`/`createWorkout`/`updateWorkout`/`deleteWorkout`, bare unguarded delete kept per D-S1/F2), `routes/workouts.js` (4 routes — **`POST /mobile` dropped** per D-C2), mounted `/api/workouts` in `server.js`. The `Workout` model + `workouts_library` schema were already ported (with earlier features). Module-load + 4-route-stack boot check pass (no `/mobile`). Status 📄→🏗️ (no semver bump — the port matches the SPEC). |
