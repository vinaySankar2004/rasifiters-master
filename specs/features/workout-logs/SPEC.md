# Feature: `workout-logs` — logging workouts (single, batch, edit, delete)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.5.0 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/logs.js` (the **`workoutLogRouter`** half only — the
> file is shared with `daily-health-logs`, §7/D-C1), `services/logService.js` (the **workout-log** functions
> + the shared log helpers), `models/WorkoutLog.js`, `server.js` (`/api/workout-logs` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken`) ·
> [`program-memberships`](../program-memberships/SPEC.md) (the `ProgramMembership` admin/logger gate the
> log permissions read) · [`programs`](../programs/SPEC.md) (the `admin_only_data_entry` lock) ·
> [`program-workouts`](../program-workouts/SPEC.md) (a log points at a `program_workouts` row;
> `resolveProgramWorkout` lazily creates/reads them) · [`workouts`](../workouts/SPEC.md) (the global library
> `resolveProgramWorkout` matches a name against) · [`members`](../members/SPEC.md) (`findMemberByDisplayName`,
> the `member_name` virtual).
> **Deliberate changes (4, the rest faithful):** **drop the two dead GET routes** (called by neither client),
> + the four user-chosen cleanups in §7 (**D-C2** positive-integer single-log duration · **D-C3** collapse the
> redundant member-auth double-check · **D-C4** de-dup the membership queries · **D-C5** hoist the
> `admin_only_data_entry` lock into a `requireDataEntryAllowed` route middleware).

---

## 1. What it is

The **workout-logging write surface** — how a member's (or, for admins/loggers, anyone's) workout minutes
get recorded against a program for a date. This SPEC owns the **`workoutLogRouter`** routes (mounted at
`/api/workout-logs`) and the workout-log functions of `services/logService.js` (`addWorkoutLog` /
`addWorkoutLogsBatch` / `updateWorkoutLog` / `deleteWorkoutLog`) plus the shared log helpers they rely on
(`resolveLogPermissions`, `isProgramAdmin`, `findMemberByDisplayName`, `resolveProgramWorkout`,
`isValidDateString`), backed by the `workout_logs` table (composite PK
`program_id + member_id + program_workout_id + log_date`):

1. **Add one workout log** — `POST /api/workout-logs`. Self, or any active member for admins/loggers. 201.
2. **Bulk-add workout logs** — `POST /api/workout-logs/batch`. Admin/logger for **any** active member; a
   plain **member may batch-log their own rows** (every `entry.member_id` must equal the requester, else
   403 — **D-C8**). Atomic; duplicate rows (within the batch OR against an existing log) are **rejected** —
   409 with per-row `rowErrors` (`field: "duplicate"`), no writes (D-C6). Also returns per-row errors on
   validation failure. This is now the **single write path** for the unified "Add workouts" form on both
   clients (the single `POST /` stays for the quick-add widget only).
3. **Edit a workout log** — `PUT /api/workout-logs`. Updates the duration of an existing (member, workout,
   date) row.
4. **Delete a workout log** — `DELETE /api/workout-logs`. Removes a (member, workout, date) row.

The two legacy GET routes (`GET /` by date+programId; `GET /member/:memberName`) are **dropped** — neither
the web nor the iOS client calls them (both read workout history via `/api/member-recent`, the
`member-analytics` feature). See §7/D-C1 and §10 F1.

## 2. Why it exists

Workout logging is the core data-entry act of the app: a `workout_logs` row is "member M did workout W for
D minutes on date Y in program P". It is the fact table every analytics surface aggregates. A log points at
a **`program_workouts`** row (not the global library directly), so writing a log lazily resolves — and, for
a never-seen name, creates — the program-scoped workout (`resolveProgramWorkout`), tying logging to the
`program-workouts` curation layer. Permission is layered: the **`admin_only_data_entry`** program lock
(admins-only when set) gates entry entirely; otherwise members log **their own** workouts while
admins/loggers log for **anyone active in the program**. Authorization stays in Express per the auth model —
we do not rely on RLS.

## 3. Functionality (the routes)

All mounted at **`/api/workout-logs`** (legacy `routes/logs.js` `workoutLogRouter`). Handlers in
`routes/logs.js`; logic in the workout-log half of `services/logService.js`. Every route is
`authenticateToken` + the new `requireDataEntryAllowed` middleware (D-C5); the per-member permission
(`resolveLogPermissions`) stays **inline in the service** (it returns a boolean that drives per-member
branching — it is not a pass/fail gate, so it is not hoistable — see §7).

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `POST /` | `logs.js:22-31` → `addWorkoutLog` (`logService.js:139-192`) | self; admin/logger for any active member; blocked if program locked & non-admin | Add one log. 201. Resolves the `program_workouts` row (lazy-create). |
| 2 | `POST /batch` | `logs.js:49-62` → `addWorkoutLogsBatch` (`logService.js`) | admin/logger for any active member; **member for own rows only** (every `entry.member_id` == requester, else 403 — D-C8, enforced **per program** across `program_ids` — D-C10); blocked if locked & non-admin (checked per program) | Atomic bulk insert, optionally fanned out to ≤20 programs via **`program_ids[]`** (D-C10; `program_id` remains the fallback); **rejects** duplicate (member, workout, date) rows — in-batch or against an existing log in ANY target program — with 409 + `rowErrors` (`field: "duplicate"`, program-suffixed messages), writing nothing (D-C6); also returns `rowErrors` (mapped by original index) on field validation failure. Response gains `programs` (fan-out count). |
| 3 | `PUT /` | `logs.js:48-57` → `updateWorkoutLog` (`logService.js:334-368`) | self; admin/logger for others; blocked if locked & non-admin | Update an existing log's duration. |
| 4 | `DELETE /` | `logs.js:59-68` → `deleteWorkoutLog` (`logService.js:370-407`) | self; admin/logger for others; blocked if locked & non-admin | Delete a log. |

> **Dropped (D-C1):** `GET /` (`logs.js:11-20` → `getWorkoutLogs`) and `GET /member/:memberName`
> (`logs.js:70-79` → `getMemberWorkoutLogs`) — called by **neither** client (§10 F1). Their two
> `requester.role === "admin"` (global-admin-only) branches go with them.

### Response shapes (preserved 1:1 for the kept routes)

- **`POST /`** (201, `logService.js:186-191`): the created row JSON +
  `{ member_name, workout_name, date }`. With the opt-in `on_duplicate:"sum"` body flag (D-C9, sent only
  by the iOS Apple Health sync), a composite-PK collision returns **200** + the updated row JSON +
  `{ member_name, workout_name, date, summed: true }` (duration = the new summed total) instead of 409.
- **`POST /batch`** (201, `logService.js:324-330`): `{ created, updated, total_minutes, groups,
  total_entries, programs }` (`programs` = the D-C10 fan-out count; counts accumulate across programs). On
  validation failure: `AppError` → `{ error, rowErrors: [{ index, field, message }] }` (the route
  re-attaches `rowErrors`, `logs.js:38-42`).
- **`PUT /`** (`logService.js:367`): the updated row JSON + `{ workout_name, date }`.
- **`DELETE /`** (`logService.js:406`): `{ message: "Workout log deleted successfully." }`.

### Error contract (faithful — `routes/logs.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }` (batch also attaches `rowErrors`); any other throw →
`500` with a route-specific generic (`"Failed to add workout log."` + `details`, `"Failed to add workout
logs."` + `details`, `"Failed to update workout log."`, `"Failed to delete workout log."`). Status codes:
`400` (missing/invalid fields, batch row errors, batch too large), `403` (permission / program-locked),
`404` (member / workout-type / active-membership / log not found). The D-C5 hoist preserves the `403`
lock code + message (one ordering nuance flagged, §10 F6).

## 4. Feature list (behaviors to port)

- **Add one** (`logService.js:139-192`) — require `workout_name`+`date`+`duration` (400) and `program_id`
  (400); **D-C2** validate duration as a positive whole number (was `isNaN`-only). The `admin_only_data_entry`
  lock is enforced by the **D-C5 middleware** (was `assertDataEntryAllowed` here). Compute `canLogForAny`
  (`resolveLogPermissions`); resolve the target member from `member_id` or `member_name` (**D-C3** one
  post-resolution id check; non-self requires `canLogForAny`, else 403); 404 if the member-by-name is
  missing; require the target to be an **active** participant (404); resolve/create the `program_workouts`
  row; `WorkoutLog.create`. **Duplicate handling:** a second log for the same (program, member, workout,
  date) hits the composite PK → friendly **409** (D-C7); with `on_duplicate:"sum"` (D-C9, Apple Health
  sync only) the collision instead atomically increments the row's duration and returns 200
  `{summed:true}` (§10 F2; batch rejects with 409 + `rowErrors` and has no sum mode).
- **Bulk add** (`logService.js:198-332`) — normalize the target programs (D-C10): `program_ids[]` when
  present (deduped, strings only, ≤ `MAX_BATCH_PROGRAMS` = 20 → 400 `"Too many programs (max 20)."`;
  present-but-empty falls back to `[program_id]`), else `[program_id]` (400 when neither). Non-empty
  `entries` array (400) + `entries.length ≤ 200` (400). Lock via D-C5 middleware — which now checks **every**
  id in `program_ids`. **Authorization (D-C8, per program — D-C10):** for each target program,
  admin/logger/global-admin (`resolveLogPermissions(pid)`) may log for anyone; otherwise a plain member is
  allowed **iff every `entry.member_id` equals the requester's id** (403 "You can only log workouts for
  yourself." if any row targets another member and ANY selected program is non-privileged). Per-row input
  validation collecting `rowErrors` (member_id string, workout_name non-empty, valid `YYYY-MM-DD` via
  `isValidDateString`, positive-integer duration) — program-independent, unchanged. Group by
  `member|lower(workout)|date`; any key appearing in **>1 row is an in-batch duplicate** → 409 + `rowErrors`
  (`field: "duplicate"`) for every offending index (D-C6). In one transaction, the four phase blocks each
  loop over the target programs (per-phase outer loops, collect-all-then-throw preserved per phase):
  (1) every distinct member must be active **in every program** (else `rowErrors`, message suffixed with the
  program name when fanning out); (2) resolve a `program_workouts` per **(program, workout name)** — the
  cache key is **program-qualified** (`pid|lower(name)`; a name-only cache would silently insert program A's
  `program_workout_id` into program B's rows, since the FK doesn't guard cross-program ids); (3) if a
  `WorkoutLog` **already exists** for a group in ANY program → 409 + `rowErrors` (`field: "duplicate"`,
  program-suffixed) for its rows (collect all across all programs, then throw — no writes); (4) only when
  there are zero collisions is every (program × group) `create`d, `created`/`total_minutes` accumulating
  across programs. Returns the counts + `programs` (`updated` is always 0 now).
- **Edit** (`logService.js:334-368`) — require `workout_name`+`date`+`duration` (400) + `program_id` (400).
  Lock via D-C5 middleware. If `member_name` differs from the requester, require `canLogForAny` (403) and
  resolve the member (404). Find the `program_workouts` by name (404), then the log by
  (program, member, program_workout, date) (404); set duration; save.
- **Delete** (`logService.js:370-407`) — require `workout_name`+`date` (400) + `program_id` (400). Lock via
  D-C5 middleware. Find the `program_workouts` by name (404). Resolve the target member (`member_id`, else
  `member_name` with a permission/ownership 403, else self). Find the log (404). Final ownership check
  (non-`canDeleteOther` may only delete own — 403). Destroy. **D-C4** computes `canDeleteOther` once (legacy
  called `resolveLogPermissions` twice, `:386` + `:400`).

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`. Already migrated; `models/WorkoutLog.js`
already ported (with associations in `models/index.js`). **No migration delta.**

- **`workout_logs`** (owned — read + write) — composite PK `program_id` (FK → `programs(id)`) + `member_id`
  (FK → `members(id)`) + `program_workout_id` (FK → `program_workouts(id)`) + `log_date` (DATEONLY);
  `duration` (INTEGER, nullable); `created_at`/`updated_at`. The composite PK is why duplicate
  (member, workout, date) logs are **rejected** in batch (409 + `rowErrors`, D-C6) and a PK collision in
  single-add (F2).
- **`program_workouts`** (referenced, owned by [`program-workouts`](../program-workouts/SPEC.md)) — a log
  points here; `resolveProgramWorkout` matches/creates the program-scoped row (lazy materialization, §10 F3).
- **`workouts_library`** (referenced, owned by [`workouts`](../workouts/SPEC.md)) —
  `resolveProgramWorkout` matches a name against the global library first.
- **`program_memberships`** (referenced, owned by [`program-memberships`](../program-memberships/SPEC.md))
  — the admin/logger permission (`resolveLogPermissions`) + the program-admin lock check (`isProgramAdmin`)
  + the target's active-participant check.
- **`programs`** (referenced, owned by [`programs`](../programs/SPEC.md)) — the `admin_only_data_entry` lock.
- **`members`** (referenced, owned by [`members`](../members/SPEC.md)) — `findMemberByDisplayName` resolves
  "First Last" to a member; the `member_name` virtual is read back into responses.

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL` (`config/database.js`). No feature flags;
no rate limiting. `MAX_BATCH_SIZE = 200` + `MAX_BATCH_PROGRAMS = 20` (D-C10 — bounds transaction fan-out).
The program-lock gate is the `requireDataEntryAllowed` middleware (D-C5), reusing the
`admin_only_data_entry` read + the `isProgramAdmin` `ProgramMembership` lookup — now iterating every id in
`program_ids` when the array is present (D-C10).

## 7. The migration delta + the deliberate changes

**No auth-table / stack migration delta.** `workout-logs` touches none of the retired credential tables and
has no SSE/push coupling; the only stack change is the shared `DATABASE_URL`. The `WorkoutLog` model +
associations are already ported. So this is a **faithful 1:1 port with five deliberate changes** (one scope
drop + four user-chosen cleanups); everything else is preserved verbatim.

- **D-C1 — scope cut + drop the two dead GET routes.** `routes/logs.js` and `services/logService.js` are
  **one file pair holding two features**: the workout-log surface (this SPEC) and `daily-health-logs` (the
  next feature). This port owns the `workoutLogRouter` routes + the workout-log service functions + the
  shared helpers; `daily-health-logs` (the `dailyHealthLogRouter` + the four daily-health functions +
  `parseOptionalNumber`) is **appended to the same `routes/logs.js` / `services/logService.js` later** (both
  halves reunited — exactly the workouts ↔ program-workouts split). The shared helpers
  (`resolveLogPermissions`, `isProgramAdmin`, `assertDataEntryAllowed`/its hoisted form,
  `findMemberByDisplayName`, `resolveProgramWorkout`, `isValidDateString`) live **once** in `logService.js`.
  Additionally, **`GET /` and `GET /member/:memberName` are dropped** — called by neither client (§10 F1);
  their functions (`getWorkoutLogs`, `getMemberWorkoutLogs`) are not ported, and with them go the two
  `requester.role === "admin"` global-admin-only read branches.
- **D-C2 — positive-integer single-log duration.** `addWorkoutLog` legacy validated only `isNaN(duration)`
  then `parseInt`, silently accepting negatives and truncating fractions (`2.7 → 2`); `0`/`""` were already
  rejected by the `!duration` required-field check. The port validates duration as a **positive whole
  number of minutes** (`Number.isInteger(n) && n > 0`, 400 otherwise) — matching `addWorkoutLogsBatch`
  (`logService.js:228`). Status code stays 400. (Legacy behavior recorded as §10 F7.)
- **D-C3 — collapse the redundant member-auth double-check in `addWorkoutLog`.** Legacy checked permission
  by name-string (`:157`) **and** again by resolved id (`:162`). The post-resolution id check (`:162`) is
  authoritative; the port keeps it and drops the pre-resolution string check. Edge: a non-permitted user
  targeting a **same-named different** member now falls through to the unified id-based 403 (and a
  non-existent name yields 404 "Member not found" instead of an early 403). (Legacy double-check recorded as
  §10 F8.)
- **D-C4 — de-dup the requester-membership lookups.** `deleteWorkoutLog` called `resolveLogPermissions`
  **twice** in the `member_name` path (`:386` + `:400`) — the port computes `canDeleteOther` **once** and
  reuses it. `addWorkoutLog` reuses its single `canLogForAny` membership read for the self-target
  active-participant check. Combined with D-C5 (which removes the locked-program `isProgramAdmin` /
  `resolveLogPermissions` duplicate from the service path), each live function fetches the requester's
  membership **at most once**. `resolveLogPermissions` / `isProgramAdmin` keep their signatures (shared with
  `daily-health-logs`). (Legacy double-call recorded as §10 F9.)
- **D-C5 — hoist the `admin_only_data_entry` lock into a `requireDataEntryAllowed` route middleware.**
  Legacy called `assertDataEntryAllowed(program_id, requester)` inline in all four functions
  (`logService.js:146, 207, 340, 374`). The port mounts a **`requireDataEntryAllowed`** middleware (in
  `routes/logs.js`, co-located like `program-workouts`' `requireProgramAdmin`) on all four routes, after
  `authenticateToken`. It is **resolve-or-pass-through**: read `body.program_id`; if absent → `next()` (the
  service emits its native `program_id` 400); load the `Program`; if missing or **not** `admin_only_data_entry`
  → `next()` (matching legacy's no-throw); if locked and `isProgramAdmin` → `next()`; otherwise **403** with
  the exact legacy message. The 403 code + message are preserved 1:1.
  - **Why only this gate is hoisted.** `resolveLogPermissions` returns a **boolean** (`canLogForAny`) that
    drives *which member* you may act on — it is business logic, not a pass/fail gate, so it stays inline.
    Only `assertDataEntryAllowed` (a pure throw-or-pass lock) is hoistable.
  - **One residual ordering nuance (accepted, §10 F6).** Legacy ran `assertDataEntryAllowed` **after** the
    handler's required-field 400s; the middleware runs **before** them. So for a **locked** program + a
    **non-admin** sending an otherwise-invalid body, the port returns `403` where legacy returned `400`. The
    user opted into the hoist with this caveat; it is arguably more correct (a barred user need not have
    their input validated). The `program_id`-absent and program-missing cases still pass through, so those
    400/no-op paths are unchanged.
  - **Double-load tradeoff.** On a locked program the middleware loads `Program` + the requester membership,
    and the service may load the requester membership again (`resolveLogPermissions`). We keep middleware and
    service **decoupled** (no `req`-attached state); these are indexed lookups, not an N+1 — same tradeoff as
    `program-workouts` D-C2.

**What stays (faithful 1:1):** the four routes + their `authenticateToken` gate, the inline per-member
permission logic and its 403/404 messages, the lazy `program_workouts` resolution/creation, the batch
pre-aggregation + `rowErrors` contract + the 200-row cap, the name-based
`program_workouts`/member resolution in edit/delete, the response shapes, and the error contract. **The
deliberate behavior changes are D-C6** — batch duplicates are rejected (409 + `rowErrors`), no longer
summed — **D-C8** — `POST /batch` now also serves plain members logging their own rows (was
admin/logger-only), powering the merged "Add workouts" form — **and D-C10 (0.5.0)** — `POST /batch`
optionally fans one atomic transaction out to ≤20 programs via `program_ids[]`, with per-program
authorization/lock/membership/collision checks, a program-qualified workout cache, and program-suffixed
rowError messages (single-`program_id` payloads keep working verbatim — live-binary safe).

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken` → `req.user` with `id`/`global_role`/
  `member_name`) · [`program-memberships`](../program-memberships/SPEC.md) (the admin/logger + lock
  membership lookups) · [`programs`](../programs/SPEC.md) (the `admin_only_data_entry` flag) ·
  [`program-workouts`](../program-workouts/SPEC.md) (the `program_workouts` row a log points at;
  `resolveProgramWorkout` reads/creates it) · [`workouts`](../workouts/SPEC.md) (the global library matched
  by name) · [`members`](../members/SPEC.md) (`findMemberByDisplayName`, the `member_name` virtual).
- **Downstream / referenced (not owned here):** the analytics + member-analytics features aggregate
  `workout_logs`; `daily-health-logs` shares the same file pair + the same log helpers (§7 D-C1).
- **Consumers:** **`web` + `ios` + `android`** — the core trio (`POST /`, `PUT /`, `DELETE /`) +
  **`POST /batch` as the unified workout-add write path** on all three. As of 2026-07-01 the two Summary
  workout cards (single "Add workout" + admin-only "Bulk add") are **merged into one multi-row "Add
  workouts" form** that always posts to `/batch` (members log their own rows, D-C8); as of 2026-07-09 the
  form on all three clients carries a **program multi-select** and sends `program_ids[]` = the full
  selection (D-C10). The single `POST /` is retained for the iOS quick-add widget + the Apple
  Health/Health Connect sync writers (`on_duplicate:"sum"`, D-C9). Android mirrors the iOS call sites
  (`net/ApiService.kt` + `ui/summary/LogWorkoutScreen.kt` + `MemberWorkoutsDetailScreen`).
  - **web:** `POST /batch` — `lib/api/logs.ts:24` (`addWorkoutLogsBatch`), from the unified
    `components/forms/LogWorkoutsForm.tsx` (opened by `summary/page.tsx` desktop modal + `summary/log-workout/page.tsx`
    mobile route). `PUT /` — `lib/api/logs.ts:109`, from `members/workouts/page.tsx:156` (edit). `DELETE /` —
    `lib/api/logs.ts:98`, from `members/workouts/page.tsx:140` (delete). `POST /` (`addWorkoutLog`) is still
    exported in `lib/api/logs.ts` but no longer wired into the UI. Web calls neither GET route (reads history
    via `/api/member-recent`).
  - **ios:** `POST /batch` — `APIClient+Workouts.swift` (`addWorkoutLogsBatch`), from the unified
    `Features/Home/Detail/AddWorkoutsDetailView.swift` (Summary "Add workouts" card). `POST /` —
    `APIClient+Workouts.swift:119-136` (`addWorkoutLog`), now only the quick-add widget
    `QuickAddWorkoutWidgetEntryView.swift:517` (loops over program ids). `DELETE /` —
    `APIClient+Workouts.swift:138-153`, via `ProgramContext+WorkoutManagement.swift:14`, from
    `WorkoutSortFilterSheets.swift:378` (member history) + the widget rollback
    `QuickAddWorkoutWidgetEntryView.swift:575`. `PUT /` — `APIClient+Workouts.swift:155-181`, from
    `HealthSortFilterSheets.swift:975` (`WorkoutLogEditSheet`). iOS calls neither GET route.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the workout-log half only, and drop the two dead GET routes.** Own `routes/logs.js` `workoutLogRouter` + the workout-log functions of `logService.js` + the shared log helpers; `daily-health-logs` (the `dailyHealthLogRouter` + 4 fns + `parseOptionalNumber`) → its own next feature, appended to the same file pair (helpers shared, one copy). Port the **4 live routes** (`POST /`, `POST /batch`, `PUT /`, `DELETE /`); **drop `GET /` + `GET /member/:memberName`** (called by neither client) and their functions. | `routes/logs.js:9-79` (workout) vs `:81-125` (health); `logService.js` helpers `:17-104`, workout fns `:106-429`, health fns `:431-638`; COVERAGE L20/L21; web+iOS sweeps; user decision. |
| **D-C2** | **Single-log duration must be a positive whole number** (`Number.isInteger(n) && n > 0`, 400), matching the batch validator — was `isNaN`-only + `parseInt` (silently accepted negatives, truncated fractions). | `logService.js:144` vs `:228`; user cleanup choice. |
| **D-C3** | **Collapse `addWorkoutLog`'s member-auth double-check** — keep the authoritative post-resolution id check (`:162`), drop the pre-resolution name-string check (`:157`). | `logService.js:157, 162`; user cleanup choice. |
| **D-C4** | **De-dup the requester-membership lookups** — `deleteWorkoutLog` computes `canDeleteOther` once (legacy called `resolveLogPermissions` at `:386` **and** `:400`), hoisted above the `member_name` privacy pre-check (so a not-enrolled requester's 403 can surface one step before legacy's post-lookup 404 — F9); `addWorkoutLog` inlines a single requester-membership read (`canLogForAny` + reuse for the self-target active check, replacing one `resolveLogPermissions` call); with D-C5 each live fn fetches the requester membership ≤ once. Shared `resolveLogPermissions`/`isProgramAdmin` signatures unchanged (kept for batch/edit + daily-health). | `logService.js:386, 400, 168, 149`; user cleanup choice; CLAUDE.md no-N+1. |
| **D-C5** | **Hoist the `admin_only_data_entry` lock into a `requireDataEntryAllowed` route middleware** (resolve-or-pass-through: `program_id` absent / program missing / not-locked / program-admin → `next()`; resolved + locked + non-admin → 403 with the legacy message). Mounted on all 4 routes after `authenticateToken`. `resolveLogPermissions` stays inline (boolean, drives per-member branching — not hoistable). One residual ordering nuance accepted (F6). | `logService.js:146, 207, 340, 374` (inline `assertDataEntryAllowed`); user cleanup choice (with caveat); CLAUDE.md non-breaking + program-workouts D-C2 precedent. |
| **D-C6** | **Deliberate behavior change — batch REJECTS duplicates instead of summing them.** `addWorkoutLogsBatch` no longer merges a duplicate (member, workout, date) into an existing/earlier row's duration. Any collision — a key repeated **within the batch** OR one that **already exists** in `workout_logs` — is a hard **409** with per-row `rowErrors` (`field: "duplicate"`), collected across all offenders and thrown before any write (transaction commits nothing). `updated` in the response is therefore always 0. Both clients highlight the offending rows red (web `BulkLogWorkoutForm` row-level error; iOS `BulkAddWorkoutDetailView` red row border + message). Shared across web + iOS by fixing the one backend service (keeps the two clients 1:1). | User request 2026-06-30 (the silent duration-merge was surprising/unwanted); composite PK `workout_logs_pkey`; `logService.js addWorkoutLogsBatch`; web `client.ts:92` (`rowErrors`→`details`); iOS `APIClient.BulkWorkoutError`. |
| **D-C8** | **Deliberate change — `POST /batch` accepts plain members logging their OWN rows.** Was admin/logger-only (`canLogForAny` required → 403). Now: if the requester is not `canLogForAny`, the batch is allowed **iff every `entry.member_id` equals the requester's id**; any foreign row → `403 "You can only log workouts for yourself."`. Admin/logger/global-admin path unchanged. Enables the **merged multi-row "Add workouts" form** (this replaces the separate single "Add workout" + admin-only "Bulk add" on both clients — members get a multi-row form with the member column hidden and each row seeded to self). Enforced in Express (auth model, no RLS); the `admin_only_data_entry` lock (D-C5 middleware) still applies first. | User request 2026-07-01 (people do multiple workout types per day, want one entry point); `logService.js addWorkoutLogsBatch` auth block; web `LogWorkoutsForm` + iOS `AddWorkoutsDetailView`. |
| **D-C9** | **Deliberate change — `POST /` accepts an opt-in `on_duplicate:"sum"` body flag** (only the iOS Apple Health sync sends it). On a composite-PK collision with the flag, instead of the D-C7 409 the service atomically increments the existing row (`WorkoutLog.update` with `sequelize.literal("COALESCE(duration, 0) + N")`, N = the validated positive-int duration) and returns **200** + the updated row + `{summed:true}` (route maps `result.summed` → 200 vs 201). If the row vanished between collision and increment (delete race), it falls through to the 409. Manual form, iOS quick-add widget, and `POST /batch` never send the flag — their duplicate rejection is unchanged. Client-side idempotency (replayed sync batches must not double-add) is the iOS `HealthKitAppliedLedger`'s job, see [`apple-health`](../apple-health/SPEC.md) D-SUM. | User request 2026-07-05 (same-type workouts later in the day must add to the tally); `logService.js addWorkoutLog` catch block; `routes/logs.js` POST /. |
| **D-C10** | **Deliberate change — multi-program batch writes.** `POST /batch` accepts an optional `program_ids: string[]` (deduped, ≤ `MAX_BATCH_PROGRAMS` = 20 → 400 `"Too many programs (max 20)."`; present-but-empty falls back to `[program_id]`; `program_id` always still sent by clients and remains the fallback — live iOS/Android binaries unaffected). Enforcement is **per program**: `requireDataEntryAllowed` iterates every id; `resolveLogPermissions(pid)` runs per program and ANY non-privileged program + a foreign row → the D-C8 403 (clients mirror this by locking member selection to self, with privileged = global_admin OR per-program admin/logger — orchestrator ruling). Inside the one transaction each existing phase gains an outer per-program loop (collect-all-then-throw preserved per phase; precedence 403 → 400 rows → 409 in-batch dups → 400 membership → 409 collisions); the `program_workouts` resolution cache is keyed **`pid\|lower(name)`** (a name-only key would silently write program A's `program_workout_id` into program B's rows — the FK doesn't guard it); membership/collision rowError messages gain a ` (Program Name)` suffix when fanning out; a row failing in several programs carries one rowError per program. Response gains `programs`. | User approval 2026-07-09 (steps-tracking plan, DC-2/DC-3/DC-4/DC-13 + workoutCache risk note); `logService.js addWorkoutLogsBatch` + `normalizeProgramIds`; `routes/logs.js requireDataEntryAllowed`. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios, android]`** — the trio `POST /`, `PUT /`, `DELETE /` used 1:1 by all clients; **`POST /batch` is the unified workout-add write path for all three** (the merged "Add workouts" form; members log their own rows per D-C8, 2026-07-01; multi-program `program_ids[]` per D-C10, 2026-07-09; superseding the 2026-06-30 admin-only bulk card, F4). The single `POST /` remains for the health-sync writers (the iOS quick-add **widget** now posts to `/batch` too — 2026-07-09 D-BATCH, it became the in-app multi-row form; see [`widget-quick-add-workout`](../../pages/ios/widget-quick-add-workout/SPEC.md) 0.2.0). The two GET routes are called by no client (dropped, D-C1). | Web sweep (`lib/api/logs.ts` + summary pages) + iOS sweep (`APIClient+Workouts.swift` + `AddWorkoutsDetailView`) + Android port; Explore agents. |
| **D-S1** | **Stance = faithful 1:1 except the cleanups above + the deliberate behavior changes D-C6/D-C8** (D-C1 scope+drops, D-C2–D-C5 cleanups, **D-C6 batch rejects duplicates**, **D-C8 batch serves members' own rows**). Lazy `program_workouts` resolution, the batch pre-aggregation + `rowErrors` + 200-cap, name-based resolution, the no-duplicate-handling single add, response shapes, and the error contract are otherwise preserved; oddities are flagged (§10). | Whole-half review; §7; D-C6/D-C8 user requests. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Two GET routes were dead** — `GET /` (logs by date+programId) and `GET /member/:memberName` are called by neither client (both read history via `/api/member-recent`). Dropped (D-C1), distinct (not byte-dups), recorded for the parity audit. | `logs.js:11-20, 70-79`; `logService.js:108-137, 409-429` | Changed (dropped). |
| **F2** | **Single `addWorkoutLog` duplicate handling evolved** — legacy had none (PK collision → 500). D-C7 (0.2.1) made it a friendly 409; D-C9 (0.4.0) added the opt-in `on_duplicate:"sum"` atomic increment (Apple Health sync only). `addWorkoutLogsBatch` rejects duplicates (409 + `rowErrors`, D-C6) and has no sum mode. | `logService.js` (single add) vs batch | Changed (D-C7 + D-C9) — recorded as the legacy 500 shape. |
| **F3** | **Logging lazily materializes a `program_workouts` row** for an unseen workout name (`resolveProgramWorkout` matches the library, reuses/upgrades a custom row, else creates) — shared with `program-workouts` (its §10 F4). So logging a brand-new name silently creates the program workout. | `logService.js:66-104` | Kept (faithful) — intended; lets logging accept free-text workout names. |
| **F4** | ~~**`POST /batch` is web-only.**~~ → iOS adopted it 2026-06-30 (bulk card) → **2026-07-01 (D-C8): `POST /batch` is the unified workout-add path on both clients.** The single "Add workout" + admin-only "Bulk add" cards are merged into one multi-row "Add workouts" form (`LogWorkoutsForm` / `AddWorkoutsDetailView`) that always posts to `/batch`; members log their own rows. The quick-add **widget** now ALSO posts to `/batch` (2026-07-09, D-BATCH — the widget became the in-app multi-row "Add workouts" form with a no-auto-select program list; the legacy single-`POST /` per-program fan-out is retired). | iOS `AddWorkoutsDetailView.swift`, `APIClient+Workouts.swift` (`addWorkoutLogsBatch`); web `LogWorkoutsForm.tsx`; widget `QuickAddWorkoutWidgetEntryView.swift` | Reconciled — the in-app form AND the widget both post to `/batch`; only the health-sync writers use single `POST /`. |
| **F5** | **`addWorkoutLog`'s `member_id` path skips the member-exists check** — it trusts `bodyMemberId` and only the active-participant 404 guards it, whereas the `member_name` path does a `findMemberByDisplayName` 404. Minor asymmetry between the two target-resolution paths. | `logService.js:151-166, 168-171` | Kept (faithful) — the membership check covers the practical case. |
| **F6** | **D-C5 ordering nuance** — for a **locked** program + a **non-admin** + an otherwise-invalid body, the hoisted middleware returns `403` where legacy returned the handler's `400` (validation ran before the lock). Accepted with the hoist; `program_id`-absent / program-missing still pass through. | `routes/logs.js` (new middleware) vs `logService.js:140-146` | Changed (D-C5) — the accepted residual. |
| **F7** | **Legacy single-log duration was `isNaN`-only + `parseInt`** — silently accepted negatives and truncated fractions. Fixed by **D-C2** (positive-integer); recorded as the legacy behavior. | `logService.js:144, 181` | Changed (D-C2). |
| **F8** | **Legacy `addWorkoutLog` permission double-check** by name-string then by id. Collapsed by **D-C3** to the single id check; recorded as the legacy shape. | `logService.js:157, 162` | Changed (D-C3). |
| **F9** | **Legacy `deleteWorkoutLog` called `resolveLogPermissions` twice** (`:386` + `:400`). Collapsed by **D-C4** to one call, hoisted above the `member_name` pre-check — so on the `member_id`/self path a not-enrolled requester's 403 now fires before a would-be "log/workout not found" 404 (legacy 404'd first). Recorded as the legacy shape + the accepted micro-ordering. | `logService.js:386, 400` | Changed (D-C4). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.5.1 | 2026-07-09 | **Client-side: loggable-only program selector + iOS quick-add widget → batch form** (no backend/contract change; route/response/permission all unchanged). (1) **D-LOGGABLE** — the shared program multi-select on all three "Add workouts" clients (web `ProgramMultiSelect`, iOS `ProgramMultiSelectSection`, android `ProgramMultiSelect`) now lists only programs the user can log to — `status == "active"` AND not `admin_only_data_entry`-locked, the current program always kept — dropping completed/planned + locked rows entirely (were shown disabled "Admin-only — can't log"). iOS gains an `alwaysShow` param for the widget. (2) **D-BATCH** — the iOS quick-add **widget** (`QuickAddWorkoutWidgetEntryView`) is now the in-app multi-row batch "Add workouts" form (no auto-selected program; custom back → My Programs), so it posts to `POST /workout-logs/batch` instead of looping single `POST /` per program (D-REF + F4 corrected). User request 2026-07-09. Consumers `[web, ios, android]`; dependents read `workout_logs` data only (unaffected). Page SPECs: `log-workout` (ios 0.3.1, android 0.2.1) + `widget-quick-add-workout` (ios 0.2.0). Compiles green: iOS `BuildProject` ✓, android `assembleDebug` ✓, web `tsc` ✓. |
| 0.5.0 | 2026-07-09 | **D-C10 — `POST /batch` gains multi-program fan-out via optional `program_ids[]`** (deliberate change, user-approved steps-tracking + multi-program plan). One request = one transaction, all-or-nothing across ≤20 deduped programs (`"Too many programs (max 20)."`; present-but-empty falls back to `[program_id]`; plain single-`program_id` payloads unchanged — live binaries safe). Per-program enforcement: `requireDataEntryAllowed` iterates the array; `resolveLogPermissions` per program (any non-privileged selected program + a foreign row → the D-C8 403; privileged = global_admin OR per-program admin/logger); membership + collision phases loop per program with collect-all-then-throw preserved (DC-13 precedence) and program-suffixed rowError messages; the workout-resolution cache is **program-qualified** (`pid\|lower(name)` — prevents cross-program `program_workout_id` bleed); response gains `programs`. Clients: all three "Add workouts" forms gain a program multi-select (current program pre-checked + locked; `admin_only_data_entry`-locked programs disabled "Admin-only — can't log"; member column locks to self when any selected program is non-privileged, rows reset to self) and always send `program_ids` = the full selection. `consumed_by` → `[web, ios, android]` (header reconciled with registry.json). Updated §3/§4/§6/§7/§8, D-REF. Blast-radius: dependents read `workout_logs` data only (unaffected); daily-health-logs 0.2.0 clones this batch idiom. |
| 0.4.0 | 2026-07-05 | **D-C9 — `POST /` gains an opt-in `on_duplicate:"sum"` flag** (deliberate change, user request: Apple Health same-day repeat workouts must add to the tally). With the flag, a composite-PK collision atomically increments the existing row's duration (`COALESCE(duration,0) + N`) and returns **200 `{…, summed:true}`** instead of the D-C7 409; a delete race falls back to the 409. Only the iOS Apple Health sync sends it — manual form / iOS quick-add widget / `POST /batch` duplicate rejection (D-C6/D-C7) unchanged. Backend: `services/logService.js addWorkoutLog` catch block + `routes/logs.js` status mapping. Blast-radius: consumer `ios` (apple-health 0.6.0 sends the flag + owns replay idempotency via its applied-sample ledger); `web` unaffected (never sends the flag); dependents read `workout_logs` data only. Updated §3 response shapes, §4, F2. |
| 0.3.0 | 2026-07-01 | **D-C8 — `POST /batch` now accepts plain members logging their OWN rows** (deliberate change, user request). Was admin/logger-only (`canLogForAny` → 403). Now if the requester is not `canLogForAny`, the batch is allowed **iff every `entry.member_id` equals the requester's id**; any foreign row → `403 "You can only log workouts for yourself."`. Admin/logger/global-admin path unchanged; the `admin_only_data_entry` lock (D-C5) still applies first; the atomic 409-on-duplicate contract (D-C6) is unchanged. This makes `POST /batch` the **single workout-add write path** for the merged multi-row "Add workouts" form on both clients (single "Add workout" + admin-only "Bulk add" cards retired; the single `POST /` remains only for the iOS quick-add widget). Backend: one auth-block change in `services/logService.js addWorkoutLogsBatch`. Clients: web `LogWorkoutsForm` (replaces `LogWorkoutForm`+`BulkLogWorkoutForm`) + iOS `AddWorkoutsDetailView` (replaces `AddWorkoutDetailView`+`BulkAddWorkoutDetailView`), member column hidden + rows seeded to self. Updated §1/§3/§4/§7/§8, F4, D-REF, D-S1; added D-C8. Blast-radius: dependents `[daily-health-logs, analytics, analytics-v2, member-analytics]` read `workout_logs` data only (unaffected); consumers `[web, ios]` both updated in-change. |
| 0.2.1 | 2026-06-30 | **D-C7 — `addWorkoutLog` returns a friendly `409` on a composite-PK collision** instead of a generic 500 (deliberate change; enables the [`apple-health`](../apple-health/SPEC.md) skip-on-conflict sync). `services/logService.js` wraps `WorkoutLog.create` in `try/catch` for Sequelize's `UniqueConstraintError` → `AppError(409, "A log for this workout already exists on this date.")` (the route already maps `AppError.statusCode`). The single-POST duplicate path now matches the batch endpoint's 409 semantics; the manual single-log form shows the friendlier message and Apple Health sync treats 409 as an expected skip. No schema/route-shape change. Blast-radius: consumers `[web, ios]` (both benefit); dependents read `workout_logs` data only (unaffected). |
| 0.2.0 | 2026-06-30 | **D-C6 — batch now REJECTS duplicates instead of summing them** (deliberate behavior change, user request). `addWorkoutLogsBatch` (`services/logService.js`) no longer merges a duplicate (member, workout, date) into an existing/earlier row: any collision — repeated **within the batch** or **already present** in `workout_logs` — is a **409** with per-row `rowErrors` (`field: "duplicate"`), collected across all offenders and thrown before any write; `updated` is now always 0. **iOS now consumes `POST /batch`** — new Summary "Bulk add" card → `BulkAddWorkoutDetailView` (multi-row form, red row highlight on collision) + `APIClient.addWorkoutLogsBatch` (F4 superseded; batch was web-only). **Web** `BulkLogWorkoutForm` gains a row-level red highlight for `field:"duplicate"`. Updated §1/§3/§4/§5/§7/§8, F2, F4, D-REF, D-S1. Blast-radius: dependents `[daily-health-logs, analytics, analytics-v2, member-analytics]` read `workout_logs` data only (unaffected); consumers `[web, ios]` both updated in-change. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the workout-logging write surface (`/api/workout-logs`) — the `workoutLogRouter` half of the shared `routes/logs.js` + the workout-log functions of `logService.js` + the shared log helpers. Decisions: **D-C1** (scope = workout-log half; `daily-health-logs` → next feature, same file pair reunited; **drop the two dead GET routes** called by neither client) · **D-C2** (positive-integer single-log duration) · **D-C3** (collapse the member-auth double-check) · **D-C4** (de-dup the membership lookups, incl. `deleteWorkoutLog`'s double `resolveLogPermissions`) · **D-C5** (hoist the `admin_only_data_entry` lock into a `requireDataEntryAllowed` resolve-or-pass-through middleware, preserving the 403; one ordering nuance accepted) · **D-REF** (`consumed_by = [web, ios]`; trio 1:1, `POST /batch` web-only) · **D-S1** (faithful otherwise). Flagged F1–F9. No auth/stack migration delta (model + schema already ported). |
| 0.1.0 (built) | 2026-06-29 | **Ported to `apps/backend/`** — `services/logService.js` (the workout-log half: the 4 live fns `addWorkoutLog`/`addWorkoutLogsBatch`/`updateWorkoutLog`/`deleteWorkoutLog` + the shared helpers `isValidDateString`/`resolveLogPermissions`/`isProgramAdmin`/`findMemberByDisplayName`/`resolveProgramWorkout`; the 2 dropped GET fns + `parseOptionalNumber`/`assertDataEntryAllowed` omitted — daily-health half added later per D-C1), `routes/logs.js` (the `workoutLogRouter` 4 routes + the co-located **`requireDataEntryAllowed`** resolve-or-pass-through middleware per D-C5; exports `{ workoutLogRouter }` only for now), mounted `/api/workout-logs` in `server.js`. Cleanups applied: D-C2 (positive-int duration in `addWorkoutLog`), D-C3 (single id check), D-C4 (`deleteWorkoutLog` single `canDeleteOther`; `addWorkoutLog` single inline requester-membership read w/ self-target reuse), D-C5 (lock hoisted). `WorkoutLog` model + associations were already ported. Boot check passes: 4-route stack, no GET, every route = `[authenticateToken, requireDataEntryAllowed, handler]`, the 5 service fns export (the 2 dropped GET fns absent), server loads. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
