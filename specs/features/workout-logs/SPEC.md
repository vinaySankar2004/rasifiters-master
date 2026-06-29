# Feature: `workout-logs` — logging workouts (single, batch, edit, delete)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/logs.js` (the **`workoutLogRouter`** half only — the
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
2. **Bulk-add workout logs** — `POST /api/workout-logs/batch`. Admin/logger only; atomic; duplicate rows
   (within the batch and against existing logs) are **summed**. Returns per-row errors on validation failure.
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
| 2 | `POST /batch` | `logs.js:33-46` → `addWorkoutLogsBatch` (`logService.js:198-332`) | admin/logger only; blocked if locked & non-admin | Atomic bulk insert; sums duplicate (member, workout, date) rows; returns `rowErrors` (mapped by original index) on validation failure. |
| 3 | `PUT /` | `logs.js:48-57` → `updateWorkoutLog` (`logService.js:334-368`) | self; admin/logger for others; blocked if locked & non-admin | Update an existing log's duration. |
| 4 | `DELETE /` | `logs.js:59-68` → `deleteWorkoutLog` (`logService.js:370-407`) | self; admin/logger for others; blocked if locked & non-admin | Delete a log. |

> **Dropped (D-C1):** `GET /` (`logs.js:11-20` → `getWorkoutLogs`) and `GET /member/:memberName`
> (`logs.js:70-79` → `getMemberWorkoutLogs`) — called by **neither** client (§10 F1). Their two
> `requester.role === "admin"` (global-admin-only) branches go with them.

### Response shapes (preserved 1:1 for the kept routes)

- **`POST /`** (201, `logService.js:186-191`): the created row JSON +
  `{ member_name, workout_name, date }`.
- **`POST /batch`** (201, `logService.js:324-330`): `{ created, updated, total_minutes, groups,
  total_entries }`. On validation failure: `AppError` → `{ error, rowErrors: [{ index, field, message }] }`
  (the route re-attaches `rowErrors`, `logs.js:38-42`).
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
  row; `WorkoutLog.create`. **No duplicate handling** — a second log for the same (program, member,
  workout, date) hits the composite PK → 500 (§10 F2; batch sums, this does not).
- **Bulk add** (`logService.js:198-332`) — require `program_id` (400) + non-empty `entries` array (400) +
  `entries.length ≤ 200` (400). Lock via D-C5 middleware. `canLogForAny` required (403 — admin/logger only).
  Per-row input validation collecting `rowErrors` (member_id string, workout_name non-empty, valid
  `YYYY-MM-DD` via `isValidDateString`, positive-integer duration). Pre-aggregate by
  `member|lower(workout)|date` summing durations. In one transaction: every distinct member must be active
  (else `rowErrors`); resolve a `program_workouts` per distinct workout (cached); for each group, sum into
  an existing row or create. Returns the counts.
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
  (member, workout, date) logs are an upsert in batch (summed) and a PK collision in single-add (F2).
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
no rate limiting. `MAX_BATCH_SIZE = 200`. The program-lock gate is the new `requireDataEntryAllowed`
middleware (D-C5), reusing the `admin_only_data_entry` read + the `isProgramAdmin` `ProgramMembership` lookup.

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
pre-aggregation + duration-summing upsert + `rowErrors` contract + the 200-row cap, the name-based
`program_workouts`/member resolution in edit/delete, the response shapes, and the error contract.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken` → `req.user` with `id`/`global_role`/
  `member_name`) · [`program-memberships`](../program-memberships/SPEC.md) (the admin/logger + lock
  membership lookups) · [`programs`](../programs/SPEC.md) (the `admin_only_data_entry` flag) ·
  [`program-workouts`](../program-workouts/SPEC.md) (the `program_workouts` row a log points at;
  `resolveProgramWorkout` reads/creates it) · [`workouts`](../workouts/SPEC.md) (the global library matched
  by name) · [`members`](../members/SPEC.md) (`findMemberByDisplayName`, the `member_name` virtual).
- **Downstream / referenced (not owned here):** the analytics + member-analytics features aggregate
  `workout_logs`; `daily-health-logs` shares the same file pair + the same log helpers (§7 D-C1).
- **Consumers:** **`web` + `ios`** — the core trio (`POST /`, `PUT /`, `DELETE /`) used 1:1 by both;
  **`POST /batch` is web-only** (iOS bulk-logs by looping single `POST /` in its widget — §10 F4).
  - **web:** `POST /` — `lib/api/logs.ts:42` (`addWorkoutLog`), called from `summary/log-workout/page.tsx:37`
    + `summary/page.tsx:113` (the single-log form/modal). `POST /batch` — `lib/api/logs.ts:24`
    (`addWorkoutLogsBatch`), from `summary/bulk-log-workout/page.tsx:36` + `summary/page.tsx:126` (bulk
    form/modal). `PUT /` — `lib/api/logs.ts:109`, from `members/workouts/page.tsx:156` (edit). `DELETE /` —
    `lib/api/logs.ts:98`, from `members/workouts/page.tsx:140` (delete). Web calls neither GET route (reads
    history via `/api/member-recent`).
  - **ios:** `POST /` — `APIClient+Workouts.swift:119-136` (`addWorkoutLog`), from
    `Features/Home/Helpers/AdminHomeHelpers.swift:2092` (`AddWorkoutDetailView`) + the quick-add widget
    `QuickAddWorkoutWidgetEntryView.swift:517` (loops over program ids). `DELETE /` —
    `APIClient+Workouts.swift:138-153`, via `ProgramContext+WorkoutManagement.swift:14`, from
    `WorkoutSortFilterSheets.swift:378` (member history) + the widget rollback
    `QuickAddWorkoutWidgetEntryView.swift:575`. `PUT /` — `APIClient+Workouts.swift:155-181`, from
    `HealthSortFilterSheets.swift:975` (`WorkoutLogEditSheet`). iOS implements **no** batch method and
    neither GET route.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the workout-log half only, and drop the two dead GET routes.** Own `routes/logs.js` `workoutLogRouter` + the workout-log functions of `logService.js` + the shared log helpers; `daily-health-logs` (the `dailyHealthLogRouter` + 4 fns + `parseOptionalNumber`) → its own next feature, appended to the same file pair (helpers shared, one copy). Port the **4 live routes** (`POST /`, `POST /batch`, `PUT /`, `DELETE /`); **drop `GET /` + `GET /member/:memberName`** (called by neither client) and their functions. | `routes/logs.js:9-79` (workout) vs `:81-125` (health); `logService.js` helpers `:17-104`, workout fns `:106-429`, health fns `:431-638`; COVERAGE L20/L21; web+iOS sweeps; user decision. |
| **D-C2** | **Single-log duration must be a positive whole number** (`Number.isInteger(n) && n > 0`, 400), matching the batch validator — was `isNaN`-only + `parseInt` (silently accepted negatives, truncated fractions). | `logService.js:144` vs `:228`; user cleanup choice. |
| **D-C3** | **Collapse `addWorkoutLog`'s member-auth double-check** — keep the authoritative post-resolution id check (`:162`), drop the pre-resolution name-string check (`:157`). | `logService.js:157, 162`; user cleanup choice. |
| **D-C4** | **De-dup the requester-membership lookups** — `deleteWorkoutLog` computes `canDeleteOther` once (legacy called `resolveLogPermissions` at `:386` **and** `:400`), hoisted above the `member_name` privacy pre-check (so a not-enrolled requester's 403 can surface one step before legacy's post-lookup 404 — F9); `addWorkoutLog` inlines a single requester-membership read (`canLogForAny` + reuse for the self-target active check, replacing one `resolveLogPermissions` call); with D-C5 each live fn fetches the requester membership ≤ once. Shared `resolveLogPermissions`/`isProgramAdmin` signatures unchanged (kept for batch/edit + daily-health). | `logService.js:386, 400, 168, 149`; user cleanup choice; CLAUDE.md no-N+1. |
| **D-C5** | **Hoist the `admin_only_data_entry` lock into a `requireDataEntryAllowed` route middleware** (resolve-or-pass-through: `program_id` absent / program missing / not-locked / program-admin → `next()`; resolved + locked + non-admin → 403 with the legacy message). Mounted on all 4 routes after `authenticateToken`. `resolveLogPermissions` stays inline (boolean, drives per-member branching — not hoistable). One residual ordering nuance accepted (F6). | `logService.js:146, 207, 340, 374` (inline `assertDataEntryAllowed`); user cleanup choice (with caveat); CLAUDE.md non-breaking + program-workouts D-C2 precedent. |
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [web, ios]`** — the trio `POST /`, `PUT /`, `DELETE /` used 1:1 by both clients; **`POST /batch` is web-only**; the two GET routes are called by neither (dropped, D-C1). | Web sweep (`lib/api/logs.ts` + summary/members pages) + iOS sweep (`APIClient+Workouts.swift` + widget); Explore agents. |
| **D-S1** | **Stance = faithful 1:1 except the five changes above** (D-C1 scope+drops, D-C2–D-C5 cleanups). Lazy `program_workouts` resolution, the batch summing-upsert + `rowErrors` + 200-cap, name-based resolution, the no-duplicate-handling single add, response shapes, and the error contract are preserved; oddities are flagged (§10), not otherwise touched. | Whole-half review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Two GET routes were dead** — `GET /` (logs by date+programId) and `GET /member/:memberName` are called by neither client (both read history via `/api/member-recent`). Dropped (D-C1), distinct (not byte-dups), recorded for the parity audit. | `logs.js:11-20, 70-79`; `logService.js:108-137, 409-429` | Changed (dropped). |
| **F2** | **Single `addWorkoutLog` has no duplicate handling** — a second log for the same (program, member, program_workout, date) collides on the composite PK → 500, whereas `addWorkoutLogsBatch` **sums** durations on duplicates. Asymmetric by design (the single form expects fresh entries; bulk imports may repeat). | `logService.js:176-182` vs `:301-322` | Kept (faithful) — a real cleanup would upsert-sum single adds too. |
| **F3** | **Logging lazily materializes a `program_workouts` row** for an unseen workout name (`resolveProgramWorkout` matches the library, reuses/upgrades a custom row, else creates) — shared with `program-workouts` (its §10 F4). So logging a brand-new name silently creates the program workout. | `logService.js:66-104` | Kept (faithful) — intended; lets logging accept free-text workout names. |
| **F4** | **`POST /batch` is web-only.** iOS has no batch method — its quick-add widget loops single `POST /` calls across program ids (and rolls back with `DELETE /` on partial failure). The endpoint stays for parity + the web bulk form. | iOS `QuickAddWorkoutWidgetEntryView.swift:517, 575`; web `bulk-log-workout/page.tsx:36` | Kept (faithful) — a real cleanup would have iOS use the batch route. |
| **F5** | **`addWorkoutLog`'s `member_id` path skips the member-exists check** — it trusts `bodyMemberId` and only the active-participant 404 guards it, whereas the `member_name` path does a `findMemberByDisplayName` 404. Minor asymmetry between the two target-resolution paths. | `logService.js:151-166, 168-171` | Kept (faithful) — the membership check covers the practical case. |
| **F6** | **D-C5 ordering nuance** — for a **locked** program + a **non-admin** + an otherwise-invalid body, the hoisted middleware returns `403` where legacy returned the handler's `400` (validation ran before the lock). Accepted with the hoist; `program_id`-absent / program-missing still pass through. | `routes/logs.js` (new middleware) vs `logService.js:140-146` | Changed (D-C5) — the accepted residual. |
| **F7** | **Legacy single-log duration was `isNaN`-only + `parseInt`** — silently accepted negatives and truncated fractions. Fixed by **D-C2** (positive-integer); recorded as the legacy behavior. | `logService.js:144, 181` | Changed (D-C2). |
| **F8** | **Legacy `addWorkoutLog` permission double-check** by name-string then by id. Collapsed by **D-C3** to the single id check; recorded as the legacy shape. | `logService.js:157, 162` | Changed (D-C3). |
| **F9** | **Legacy `deleteWorkoutLog` called `resolveLogPermissions` twice** (`:386` + `:400`). Collapsed by **D-C4** to one call, hoisted above the `member_name` pre-check — so on the `member_id`/self path a not-enrolled requester's 403 now fires before a would-be "log/workout not found" 404 (legacy 404'd first). Recorded as the legacy shape + the accepted micro-ordering. | `logService.js:386, 400` | Changed (D-C4). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the workout-logging write surface (`/api/workout-logs`) — the `workoutLogRouter` half of the shared `routes/logs.js` + the workout-log functions of `logService.js` + the shared log helpers. Decisions: **D-C1** (scope = workout-log half; `daily-health-logs` → next feature, same file pair reunited; **drop the two dead GET routes** called by neither client) · **D-C2** (positive-integer single-log duration) · **D-C3** (collapse the member-auth double-check) · **D-C4** (de-dup the membership lookups, incl. `deleteWorkoutLog`'s double `resolveLogPermissions`) · **D-C5** (hoist the `admin_only_data_entry` lock into a `requireDataEntryAllowed` resolve-or-pass-through middleware, preserving the 403; one ordering nuance accepted) · **D-REF** (`consumed_by = [web, ios]`; trio 1:1, `POST /batch` web-only) · **D-S1** (faithful otherwise). Flagged F1–F9. No auth/stack migration delta (model + schema already ported). |
| 0.1.0 (built) | 2026-06-29 | **Ported to `apps/backend/`** — `services/logService.js` (the workout-log half: the 4 live fns `addWorkoutLog`/`addWorkoutLogsBatch`/`updateWorkoutLog`/`deleteWorkoutLog` + the shared helpers `isValidDateString`/`resolveLogPermissions`/`isProgramAdmin`/`findMemberByDisplayName`/`resolveProgramWorkout`; the 2 dropped GET fns + `parseOptionalNumber`/`assertDataEntryAllowed` omitted — daily-health half added later per D-C1), `routes/logs.js` (the `workoutLogRouter` 4 routes + the co-located **`requireDataEntryAllowed`** resolve-or-pass-through middleware per D-C5; exports `{ workoutLogRouter }` only for now), mounted `/api/workout-logs` in `server.js`. Cleanups applied: D-C2 (positive-int duration in `addWorkoutLog`), D-C3 (single id check), D-C4 (`deleteWorkoutLog` single `canDeleteOther`; `addWorkoutLog` single inline requester-membership read w/ self-target reuse), D-C5 (lock hoisted). `WorkoutLog` model + associations were already ported. Boot check passes: 4-route stack, no GET, every route = `[authenticateToken, requireDataEntryAllowed, handler]`, the 5 service fns export (the 2 dropped GET fns absent), server loads. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
