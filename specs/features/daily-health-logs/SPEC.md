# Feature: `daily-health-logs` — logging daily sleep + diet + steps (CRUD + batch)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.2.0 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/logs.js` (the **`dailyHealthLogRouter`** half — the
> file is shared with `workout-logs`, §7/D-C1), `services/logService.js` (the **daily-health** functions +
> the daily-health-only `parseOptionalNumber` helper), `models/DailyHealthLog.js`, `server.js`
> (`/api/daily-health-logs` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken`) ·
> [`program-memberships`](../program-memberships/SPEC.md) (the `ProgramMembership` admin/logger gate +
> active-participant check) · [`programs`](../programs/SPEC.md) (the `admin_only_data_entry` lock) ·
> [`workout-logs`](../workout-logs/SPEC.md) (the sibling half — this feature **reuses** its
> `requireDataEntryAllowed` middleware + the shared log helpers `resolveLogPermissions`/`isProgramAdmin`
> already in `logService.js`).
> **Deliberate changes (4, the rest faithful):** **D-C2** reuse `workout-logs`' `requireDataEntryAllowed`
> route middleware for the `admin_only_data_entry` lock (instead of the inline `assertDataEntryAllowed`) ·
> **D-C3** tidy `updateDailyHealthLog`'s 3-arg signature to a single `body` param · **D-C4** a third metric —
> `daily_health_logs.steps` (migration `006`; a row is valid with **any one** of sleep/diet/steps, ratified
> **R-1**) · **D-C5** a batched, multi-program `POST /batch` write (upsert against existing rows). Everything
> else is faithful 1:1; the CRUD quartet is used 1:1 by all three clients with no divergence.

---

## 1. What it is

The **daily-health-logging CRUD + batch surface** — how a member's (or, for admins/loggers, anyone's)
**sleep hours**, **diet/food quality**, and (0.2.0, D-C4) **step count** get recorded against a program for a
date. This SPEC owns the **`dailyHealthLogRouter`** routes (mounted at `/api/daily-health-logs`) and the
daily-health functions of `services/logService.js` (`addDailyHealthLog` / `addDailyHealthLogsBatch` /
`getDailyHealthLogs` / `updateDailyHealthLog` / `deleteDailyHealthLog`) plus the daily-health-only
`parseOptionalNumber` helper, backed by the `daily_health_logs` table (composite PK
`program_id + member_id + log_date` — **one log per member per day**):

1. **Add a daily health log** — `POST /api/daily-health-logs`. Self, or any active member for admins/loggers.
   At least one of `sleep_hours`/`food_quality`/`steps` (D-C4/R-1). 201. **409** if one already exists for
   that date.
2. **Batch-add daily health logs** — `POST /api/daily-health-logs/batch` (D-C5). One transaction, ≤200
   entries, optionally fanned out to ≤20 programs via `program_ids[]`; **upserts** against existing rows
   (updates only the fields present per entry). The write path behind the batched "Log daily health" form
   on all three clients.
3. **List a member's logs** — `GET /api/daily-health-logs?programId=&memberId=&…`. Self, or any member for
   admins/loggers. Supports date-range + sleep/diet/steps-range filters, sort, and limit. Returns
   `{ items, total, filters }`.
4. **Edit a daily health log** — `PUT /api/daily-health-logs`. Updates only the fields present in the body
   (absent ≠ null).
5. **Delete a daily health log** — `DELETE /api/daily-health-logs`.

## 2. Why it exists

Alongside workouts, daily sleep + diet + steps are the app's three lifestyle metrics. A `daily_health_logs`
row is "member M slept S hours, ate at quality Q, and walked N steps on date Y in program P". The composite
PK enforces **one row per member per day** (the single-`add` path 409s on a duplicate; the batch **upserts**
per D-C5; edits mutate the existing row). Permission mirrors `workout-logs`: the **`admin_only_data_entry`**
program lock gates writes entirely; otherwise members read/write **their own** logs while admins/loggers act
for **anyone active in the program**. The metrics are nullable and partial — a row may carry any non-empty
subset of the three (R-1), and an edit can set or clear each independently. Authorization stays in Express
per the auth model — we do not rely on RLS.

## 3. Functionality (the routes)

All mounted at **`/api/daily-health-logs`** (legacy `routes/logs.js` `dailyHealthLogRouter`). Handlers in
`routes/logs.js`; logic in the daily-health half of `services/logService.js`. The three write routes carry
`authenticateToken` + the reused `requireDataEntryAllowed` middleware (D-C2); `GET` is `authenticateToken`
only. The per-member permission (`resolveLogPermissions`) stays **inline** (its boolean drives per-member
branching — not a hoistable gate).

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `POST /` | `logs.js:83-92` → `addDailyHealthLog` (`logService.js:433-471`) | self; admin/logger for any active member; blocked if locked & non-admin | Add a log. 201. **409** if a log for (program, member, date) already exists. |
| 2 | `POST /batch` | net-new (D-C5) → `addDailyHealthLogsBatch` (`logService.js`) | admin/logger for any active member; **member for own rows only** (every `entry.member_id` == requester, else 403 `"You can only log your own daily health."`); per-program lock check across `program_ids` | Atomic batched write, ≤200 entries, ≤20 programs (`program_ids[]`, fallback `[program_id]`). In-batch (member, date) duplicates → **409** + `rowErrors` (`field:"duplicate"`); **against existing rows → UPSERT** (update only the fields present per entry). Returns `{ created, updated, programs, total_entries }`. |
| 3 | `GET /` | `logs.js:94-103` → `getDailyHealthLogs` (`logService.js:473-566`) | self; admin/logger for others | List `memberId`'s logs with filters/sort/limit (incl. `minSteps`/`maxSteps`, sort `steps` — D-C4). Returns `{ items, total, filters }`. |
| 4 | `PUT /` | `logs.js:105-114` → `updateDailyHealthLog` (`logService.js:568-611`) | self; admin/logger for others; blocked if locked & non-admin | Update only the fields present in the body (absent ≠ null); `steps` included (D-C4). |
| 5 | `DELETE /` | `logs.js:116-125` → `deleteDailyHealthLog` (`logService.js:613-638`) | self; admin/logger for others; blocked if locked & non-admin | Delete a log. |

### Validation (sleep + diet faithful; steps added by D-C4)

- `sleep_hours`/`food_quality`/`steps` are parsed via `parseOptionalNumber` (`""`/`null`/`undefined` → `null`;
  non-numeric → `NaN` → 400).
- `sleep_hours` ∈ [0, 24]; `food_quality` an integer ∈ [1, 5]; `steps` an **integer ≥ 0** (400
  `"steps must be a non-negative whole number."`).
- **Add (single + batch rows):** at least one of the **three** is required (all `null` → 400
  `"At least one of sleep_hours, food_quality, or steps is required."`) — the **R-1 ratification**: task
  wording read as sleep-required-per-row, but each row is deliberately valid with **any one** metric
  (matches the pre-existing single-POST at-least-one semantics and admits manual/synced steps-only days).
- **Edit:** at least one of the three **fields must be present** in the body (`hasOwnProperty`); a present
  field with a `null` value **clears** that metric, an absent field is **left untouched** (the absent-vs-null
  distinction, §10 F2).
- **Batch shape:** non-empty `entries` array ≤ `MAX_BATCH_SIZE` (200); `program_ids` deduped, strings only,
  ≤ `MAX_BATCH_PROGRAMS` (20) → 400 `"Too many programs (max 20)."`; a present-but-empty `program_ids` falls
  back to `[program_id]`. Per-row rowError fields: `member_id` / `log_date` / `sleep_hours` / `food_quality` /
  `steps` / `metrics` (all-three-null) / `duplicate`.

### Response shapes (CRUD preserved 1:1; batch net-new)

- **`POST /`** (201): the created `DailyHealthLog` row.
- **`POST /batch`** (201): `{ created, updated, programs, total_entries }` (`updated` counts upserts onto
  existing rows; `programs` = the fan-out count). On validation failure: `AppError` → `{ error, rowErrors:
  [{ index, field, message }] }` (the route re-attaches `rowErrors`, cloning the workout batch's shape).
- **`GET /`** (`logService.js:552-565`): `{ items: [{ id, logDate, sleepHours, foodQuality, steps }], total,
  filters }` — `id` is a **synthetic** `"<member_id>-<log_date>-<idx>"` (§10 F3); `filters` echoes the
  resolved filter/sort values (now incl. `minSteps`/`maxSteps`).
- **`PUT /`**: the updated `DailyHealthLog` row.
- **`DELETE /`** (`logService.js:637`): `{ message: "Daily health log deleted successfully." }`.

### Error contract (faithful — `routes/logs.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }` (batch also attaches `rowErrors`); any other throw →
`500` with a route-specific generic (`"Failed to add daily health log."`, `"Failed to add daily health
logs."` (batch), `"Failed to fetch daily health logs."`, `"Failed to update daily health log."`, `"Failed to
delete daily health log."`). Status codes: `400` (missing/invalid fields, batch row errors, batch/program
caps), `403` (permission / program-locked / view-others), `404` (member not enrolled / log not found), `409`
(single-add when a log already exists for the date; batch **in-batch** duplicates only — existing rows
upsert, D-C5). **Batch error precedence (shared with the workout batch):** 403 permission → 400 per-row
field validation → 409 in-batch duplicates → 400 membership (collected across ALL programs) — each phase
throws before the next, so a response's `rowErrors` never mix status classes; a row failing in several
programs carries one rowError per program (program-name-suffixed messages when `program_ids.length > 1`).
The D-C2 middleware preserves the `403` lock code + message (one ordering nuance, §10 F4) and checks
**every** id in `program_ids` (fallback `[program_id]`) on the batch route.

## 4. Feature list (behaviors to port)

- **Add** (`logService.js:433-471`) — require `program_id`+`log_date` (400); parse + range-validate
  sleep/diet/steps, require at least one of the three (400, D-C4/R-1). The lock is enforced by the **D-C2
  middleware** (was `assertDataEntryAllowed` here). `canLogForAny` (`resolveLogPermissions`); a non-admin may
  only target self (403 otherwise); the target must be an **active** participant (404). **409** if a row
  already exists for (program, member, date). Create (incl. `steps`).
- **Batch add** (D-C5, `addDailyHealthLogsBatch`) — normalize `program_ids` (dedupe, fallback
  `[program_id]`, 400 when empty, 400 over the 20-program cap); non-empty `entries` ≤ 200 (400). Lock via
  the D-C2 middleware **per program**. **Authorization per program:** for each program id, if the requester
  is not `canLogForAny` there and any row targets another member → 403 `"You can only log your own daily
  health."`. Per-row validation collecting `rowErrors` (member_id string; valid `YYYY-MM-DD` `log_date`;
  sleep/diet/steps ranges as the single add; at-least-one-of-three → field `metrics`). In-batch duplicate
  (member, date) keys → 409 + `rowErrors` (`field:"duplicate"`) for every offender. In one transaction, per
  program: every distinct member must be **enrolled** (else collected `rowErrors`, single 400 after all
  programs); then per (program × entry) **upsert** — an existing (program, member, date) row is `update`d
  with only the fields **present** on the entry (`hasOwnProperty`; null clears — the PUT semantics; counts
  as `updated`), a missing row is `create`d (counts as `created`). No collision phase — health is a state
  row, not additive (D-C5 rationale).
- **List** (`logService.js:473-566`) — require `programId`+`memberId` (400). `canLogForAny`; a non-admin may
  only view self (403). Target must be active (404). Build the `where` from optional `startDate`/`endDate`
  (range) + sleep-range (`min/maxSleepHours`, NULL-excluding) + diet-range (`min/maxFoodQuality`,
  NULL-excluding) + steps-range (`min/maxSteps`, integer ≥ 0, NULL-excluding — D-C4); order by
  `log_date`|`sleep_hours`|`food_quality`|`steps` × `asc`|`desc`; apply `limit` when `> 0`. Map rows to
  `{ id, logDate, sleepHours, foodQuality, steps }` and return `{ items, total, filters }`.
  **No lock check** (read).
- **Edit** (`logService.js:568-611`) — require `program_id`+`log_date` (400); presence-check
  sleep/diet/steps via `hasOwnProperty` (D-C3 — derived from the single `body` param), require at least one
  present (400); range-validate present fields. Lock via D-C2 middleware. `canLogForAny`; non-admin
  self-only target; active-participant 404; find the log (404); `update` only the present fields.
- **Delete** (`logService.js:613-638`) — require `program_id`+`log_date` (400). Lock via D-C2 middleware.
  `canLogForAny`; non-admin self-only target; active-participant 404; find the log (404); destroy.

## 5. Data / schema touchpoints

Faithful names (R5); base schema in `apps/backend/sql/001_schema.sql`; the steps delta in
`apps/backend/sql/006_add_steps_to_daily_health_logs.sql` (D-C4 — **USER-run, idempotent**; must run BEFORE
the backend deploy since the model now references the column). `models/DailyHealthLog.js` ported (with
associations in `models/index.js`).

- **`daily_health_logs`** (owned — read + write) — composite PK `program_id` (FK → `programs(id)`) +
  `member_id` (FK → `members(id)`) + `log_date` (DATEONLY); `sleep_hours` (DECIMAL(4,2), nullable);
  `food_quality` (SMALLINT, nullable, **DB column `diet_quality`** via the model `field` mapping);
  **`steps` (INTEGER, nullable, `CHECK (steps >= 0)` — migration `006`)**; `created_at`/`updated_at`. The
  composite PK is why the single `add` 409s on a duplicate (one row per member per day; the batch upserts
  instead, D-C5). Migration `006` also **recreates the at-least-one CHECK** as
  `sleep_hours IS NOT NULL OR diet_quality IS NOT NULL OR steps IS NOT NULL` so steps-only rows are valid
  (R-1 — sync days may carry steps only).
- **`program_memberships`** (referenced, owned by [`program-memberships`](../program-memberships/SPEC.md))
  — the admin/logger permission (`resolveLogPermissions`), the program-admin lock check (`isProgramAdmin`,
  via the D-C2 middleware), and the target's active-participant check.
- **`programs`** (referenced, owned by [`programs`](../programs/SPEC.md)) — the `admin_only_data_entry` lock.

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL` (`config/database.js`). No feature flags;
no rate limiting. `getDailyHealthLogs` defaults `limit = 1000` (iOS sends 1000; web sends 10 for the
overview card and 0 = unlimited for the detail page). Batch caps: `MAX_BATCH_SIZE = 200` entries (shared
with the workout batch) + `MAX_BATCH_PROGRAMS = 20` (D-C5 — bounds transaction fan-out; clients never hit
it in practice). The program-lock gate is the reused `requireDataEntryAllowed` middleware (D-C2), which now
reads the whole `program_ids` array when present.

## 7. The migration delta + the deliberate changes

**No auth-table / stack migration delta.** `daily-health-logs` touches none of the retired credential
tables and has no SSE/push coupling; the only stack change is the shared `DATABASE_URL`. The
`DailyHealthLog` model + associations are already ported. So this is a **faithful 1:1 port with two
deliberate changes**; everything else is preserved verbatim.

- **D-C1 — scope cut (append the other half).** `routes/logs.js` and `services/logService.js` are the
  **one file pair** whose `workout-logs` half is already ported (the shared log helpers
  `resolveLogPermissions`/`isProgramAdmin` + the `requireDataEntryAllowed` middleware landed with it). This
  port **appends** the four daily-health functions + the daily-health-only `parseOptionalNumber` helper to
  `logService.js`, and the `dailyHealthLogRouter` (4 routes) to `routes/logs.js` (now exporting both
  routers), and mounts `/api/daily-health-logs` in `server.js`. The two halves are reunited (one file pair,
  exactly the workouts ↔ program-workouts pattern).
- **D-C2 — reuse `workout-logs`' `requireDataEntryAllowed` middleware** for the `admin_only_data_entry`
  lock, mounted on the three daily-health write routes (`POST`/`PUT`/`DELETE`) after `authenticateToken`;
  `GET` stays ungated. The three write functions drop their inline `assertDataEntryAllowed` call. This keeps
  both halves of the file enforcing the lock **identically** (rather than re-introducing an inline helper
  for one half only). The middleware is resolve-or-pass-through (read `body.program_id`; absent / program
  missing / not-locked / program-admin → `next()`; resolved + locked + non-admin → `403` with the legacy
  message), so the `403` code + message are preserved 1:1.
  - **One residual ordering nuance (accepted, §10 F4).** Legacy ran `assertDataEntryAllowed` **after** the
    handler's field-validation 400s; the middleware runs **before** them. So for a **locked** program + a
    **non-admin** + an otherwise-invalid body, the port returns `403` where legacy returned `400`. Same
    accepted tradeoff as `workout-logs` D-C5/F6. The `program_id`-absent / program-missing cases still pass
    through unchanged.
- **D-C3 — tidy `updateDailyHealthLog`'s signature.** Legacy took `(parsedBody, requester, rawBody)` and was
  called `updateDailyHealthLog(req.body, req.user, req.body)` — passing the body **twice** (the 3rd arg only
  to `hasOwnProperty`-check field presence). The port takes a single `(body, requester)` and derives both
  the destructured values and the presence flags from the one `body` object. **Behavior is identical** —
  the absent-vs-null semantics (present field with `null` clears; absent field untouched) are unchanged.
- **D-C4 — a third metric: `steps` (0.2.0, deliberate, no legacy provenance).** Migration `006` adds
  `daily_health_logs.steps` (INTEGER, nullable, ≥ 0) and recreates the at-least-one CHECK to include it.
  `steps` flows through all four CRUD functions symmetrically with diet (parse via `parseOptionalNumber`,
  integer-≥-0 validation, `hasOwnProperty` presence on PUT, `minSteps`/`maxSteps` filters + `steps` sort +
  the `steps` list-item field on GET). **R-1 ratification recorded here:** the batched form's rows are valid
  with **any one** of sleep/diet/steps — a deliberate divergence from the task's plain reading (which made
  sleep required per row), keeping the existing at-least-one semantics and admitting steps-only days (the
  steps sync writes them). Nullable + additive → the LIVE iOS/Android binaries keep working (their PUTs
  can't clobber `steps` thanks to the `hasOwnProperty` semantics).
- **D-C5 — batched multi-program `POST /batch` (0.2.0, deliberate).** A net-new route modeled on the workout
  batch (same phase structure + error precedence), powering the rebuilt multi-row "Log daily health" form on
  all three clients. Transport = server-side **`program_ids[]`** (one request, one transaction,
  all-or-nothing across ≤20 programs; `program_id` always still sent and remains the fallback — live
  binaries unaffected). **Duplicate policy differs from workouts deliberately:** in-batch (member, date)
  duplicates → hard 409 + `rowErrors`; collisions **against existing rows → UPSERT** (update only the
  fields present per entry, preserving unsent ones — the PUT semantics; counted as `updated`). Rationale: a
  health row is state, not additive; it matches the sleep-sync POST→409→PUT idiom, and a hard 409 would fail
  multi-program saves whenever only one program already has the date. Per-program authorization
  (`resolveLogPermissions` per id) + per-program membership checks with program-name-suffixed rowError
  messages. **Supersedes D-REF's "no batch route" note.**

**What stays (faithful 1:1):** the CRUD routes + their `authenticateToken` gate, the inline per-member
permission logic and its 403/404 messages, the sleep/diet parsing + range validation + at-least-one rule
(now spanning three metrics), the **409**-on-duplicate single add, the one-row-per-day composite PK, the
filter/sort/limit query building, the synthetic `GET` row id + `{ items, total, filters }` shape, the
partial-update absent-vs-null semantics, and the error contract.

> **Scope note (D-C1).** This SPEC owns only the daily-health half. The `workout-logs` half (already ported)
> owns the `workoutLogRouter` + the workout-log functions; the shared helpers + the `requireDataEntryAllowed`
> middleware are reused, not re-created. State "no migration delta" explicitly — the model + schema landed
> earlier.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken` → `req.user` with `id`/`global_role`/
  `member_name`) · [`program-memberships`](../program-memberships/SPEC.md) (the admin/logger + active-member
  lookups) · [`programs`](../programs/SPEC.md) (the `admin_only_data_entry` flag) ·
  [`workout-logs`](../workout-logs/SPEC.md) (the sibling half — reuses its `requireDataEntryAllowed`
  middleware + the shared `resolveLogPermissions`/`isProgramAdmin` helpers).
- **Downstream / referenced (not owned here):** the analytics + member-analytics features aggregate
  `daily_health_logs` (incl. `steps` as of 0.2.0); the apple-health (iOS) + health-connect (Android) sync
  features write `sleep_hours` and (0.2.0) `steps` via the single POST→409→PUT upsert idiom.
- **Consumers:** **`web` + `ios` + `android`** — the CRUD quartet used 1:1 by all three clients;
  **`POST /batch` is the unified daily-health write path** for the batched multi-row "Log daily health"
  form on all three (0.2.0, D-C5). The single `POST /` remains for the iOS quick-add widget and the
  steps/sleep sync writers.
  - **web:** `POST /batch` — `lib/api/logs.ts` (`addDailyHealthLogsBatch`), from the batched
    `components/forms/LogDailyHealthForm.tsx` (opened by `summary/page.tsx` desktop modal +
    `summary/log-health/page.tsx` mobile route). `GET /` — `lib/api/members.ts`
    (`fetchMemberHealthLogs`, now with `minSteps`/`maxSteps`), from `members/page.tsx` (overview card,
    `limit:10`) + `members/health/page.tsx` (filtered detail, `limit:0`). `PUT /` — `lib/api/logs.ts`
    (`steps` nullable), from `members/health/page.tsx` (edit modal). `DELETE /` — `lib/api/logs.ts`, from
    `members/health/page.tsx`. `addDailyHealthLog` (single POST) is no longer wired into the web UI.
  - **ios:** `POST /batch` — `APIClient+DailyHealth.swift` (`addDailyHealthLogsBatch`), from the rebuilt
    `AddDailyHealthDetailView`. `POST /` — `APIClient+Health.swift` (`addDailyHealthLog`), now only the
    quick-add health widget `QuickAddHealthWidgetEntryView.swift` (loops over program ids) + the
    sleep/steps sync writers (`writeHealthKitSleepLog`/`writeHealthKitStepsLog`, POST→409→PUT). `GET /` —
    the new `fetchDailyHealthLogs` (steps-aware) via `ProgramContext+Members.swift`
    (`loadMemberHealthLogs`), from `MemberHealthDetail` + the Members-tab health-card preview. `PUT /` —
    `updateDailyHealthLog` (steps overload), via `ProgramContext+WorkoutManagement.swift`, from
    `DailyHealthEditSheet`. `DELETE /` — `deleteDailyHealthLog`, via
    `ProgramContext+WorkoutManagement.swift`, from `MemberHealthDetail` swipe + the widget rollback.
  - **android:** `POST /batch` — `net/ApiService.kt` (`addDailyHealthLogsBatch`) via
    `ProgramContext.addDailyHealthLogsBatch`, from the rebuilt `ui/summary/LogHealthScreen.kt`. `GET /` —
    `getMemberHealthLogs` (now with `minSteps`/`maxSteps`), from `MemberHealthDetailScreen` + the Members
    tab health card. `PUT /` — `updateDailyHealthLog` (JsonObject body; explicit null clears steps/diet),
    from the health edit sheet + the sleep/steps sync writers. `DELETE /` — from
    `MemberHealthDetailScreen`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the daily-health half only; append to the existing file pair.** Add the four daily-health fns + `parseOptionalNumber` to `services/logService.js`, the `dailyHealthLogRouter` (4 routes) to `routes/logs.js` (export both routers), mount `/api/daily-health-logs`. The `workout-logs` half + the shared helpers + the `requireDataEntryAllowed` middleware are reused, not re-created. | `routes/logs.js:81-125`; `logService.js:433-638` + `:49-53` (`parseOptionalNumber`); COVERAGE L21; workout-logs SPEC D-C1. |
| **D-C2** | **Reuse `workout-logs`' `requireDataEntryAllowed` middleware** for the `admin_only_data_entry` lock on the 3 write routes (`GET` ungated); the write fns drop their inline `assertDataEntryAllowed`. Both halves enforce the lock identically. Resolve-or-pass-through; 403 + message preserved 1:1; one ordering nuance accepted (F4). | `logService.js:447, 585, 616` (inline `assertDataEntryAllowed`); workout-logs D-C5; user decision (consistency). |
| **D-C3** | **Tidy `updateDailyHealthLog` to a single `body` param** — legacy took `(parsed, requester, rawBody)` called with `req.body` twice; the port takes `(body, requester)` and derives the destructure + the `hasOwnProperty` presence flags from one object. Behavior identical (absent-vs-null preserved). | `logService.js:568, 573-574`; `routes/logs.js:107`; user cleanup choice. |
| **D-C4** | **Deliberate change — a third metric, `steps`** (migration `006`: INTEGER NULL, `CHECK (steps >= 0)`, at-least-one CHECK recreated to include it). Symmetric with diet through add/list/edit (parse, integer-≥-0 validation, `hasOwnProperty` presence on PUT, `minSteps`/`maxSteps` filters + `steps` sort + list-item field). **R-1 ratified:** a row is valid with ANY ONE of sleep/diet/steps — deliberate divergence from the task's sleep-required plain reading (steps-only sync days must be valid; matches the pre-existing at-least-one semantics). Additive/nullable → live binaries unaffected. | User approval 2026-07-09 (steps-tracking plan, R-1); `sql/006`; `logService.js` daily-health half; DC-1/DC-6. |
| **D-C5** | **Deliberate change — batched multi-program `POST /batch`.** Modeled on the workout batch (same phase structure; error precedence 403 → 400 row validation → 409 in-batch dups → 400 membership). Transport = `program_ids[]` (deduped, ≤20, fallback `[program_id]` — live single-program clients keep working); per-program `resolveLogPermissions` (any non-privileged selected program → member rows locked to self, 403 `"You can only log your own daily health."` on foreign rows) + per-program `requireDataEntryAllowed`. **Duplicate policy: in-batch → 409 + `rowErrors`; against existing rows → UPSERT of the present fields** (health is state, not additive — mirrors the sleep-sync POST→409→PUT idiom; a hard 409 would fail multi-program saves when one program already has the date). Returns `{ created, updated, programs, total_entries }`. Supersedes D-REF's "no batch route". | User approval 2026-07-09 (steps-tracking plan, DC-2/DC-3/DC-5/DC-13); workout-logs batch precedent; `logService.js addDailyHealthLogsBatch` + `routes/logs.js`. |
| **D-REF** | **Reference impl = legacy `backend`.** ~~`consumed_by = [web, ios]` … no batch route~~ → **superseded (0.2.0): `consumed_by = [web, ios, android]`**, and `POST /batch` (D-C5) is now the unified daily-health write path for the batched form on all three clients (the single `POST /` remains for the iOS widget + the sync writers). `GET`'s `limit` still differs per caller (web 10/0, iOS 1000) but the route is identical. | Web sweep (`lib/api/{logs,members}.ts` + summary/members pages) + iOS sweep + Android port (Phases A–J); steps-tracking run 2026-07-09. |
| **D-S1** | **Stance = faithful 1:1 except D-C2/D-C3 + the deliberate changes D-C4/D-C5.** The 409-on-duplicate single add, one-row-per-day PK, metric validation, filter/sort/limit query, synthetic GET id + `{items,total,filters}` shape, and partial-update absent-vs-null semantics are preserved; oddities are flagged (§10), not otherwise touched. | Whole-half review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **One log per member per day** — the composite PK `(program_id, member_id, log_date)` means the single `add` 409s on a duplicate date, and edits mutate the existing row. Intentional (a day has one sleep + one diet + one steps value). The batch route (D-C5) **upserts** onto an existing row instead of 409-ing — a deliberate per-route difference, not drift. | `models/DailyHealthLog.js`; `logService.js:462-465` | Kept (faithful); batch exception = D-C5. |
| **F2** | **Partial-update absent-vs-null semantics** — `PUT` distinguishes a field **absent** from the body (left untouched) from a field present with value `null` (cleared), via `hasOwnProperty`. D-C3 keeps this exactly (just from one `body` arg instead of two). | `logService.js:573-574, 605-608` | Kept (faithful) — required for independent set/clear of sleep vs diet. |
| **F3** | **`GET` returns a synthetic row id** — `id: "<member_id>-<log_date>-<idx>"`. The real key is the (member, date) pair; the id is a render key, not addressable (edits/deletes key off `program_id`+`member_id`+`log_date`, not this id). | `logService.js:546` | Kept (faithful) — clients use it only as a list key. |
| **F4** | **D-C2 ordering nuance** — for a **locked** program + a **non-admin** + an otherwise-invalid body, the reused middleware returns `403` where legacy returned the handler's `400`. Accepted with the hoist (same as workout-logs F6); `program_id`-absent / program-missing still pass through. | `routes/logs.js` (middleware) vs `logService.js:434-447` | Changed (D-C2) — the accepted residual. |
| **F5** | **`food_quality` ↔ DB `diet_quality`** — the API field is `food_quality` but the column is `diet_quality` (model `field` mapping). Faithful; a rebuild would not rename either side. | `models/DailyHealthLog.js` (`field: "diet_quality"`) | Kept (faithful) — preserves both the API and the migrated column name. |
| **F6** | **Legacy `updateDailyHealthLog` passed the body twice** `(req.body, req.user, req.body)` to get `hasOwnProperty` presence. Tidied by **D-C3** to a single `body` param; recorded as the legacy shape. | `logService.js:568`; `routes/logs.js:107` | Changed (D-C3). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Steps tracking + batched multi-program health writes (D-C4 + D-C5, user-approved plan).** (1) **D-C4** — `daily_health_logs` gains `steps` (migration `006`: INTEGER NULL, `steps >= 0`, at-least-one CHECK recreated as sleep-OR-diet-OR-steps). `steps` flows through add/list/edit symmetrically with diet: integer-≥-0 validation (`"steps must be a non-negative whole number."`), the at-least-one message now `"At least one of sleep_hours, food_quality, or steps is required."`, GET gains sort `steps` + `minSteps`/`maxSteps` filters + the `steps` item field, PUT clears via explicit null. **R-1 ratified and recorded:** a form row is valid with ANY ONE of sleep/diet/steps (deliberate divergence from the task's sleep-required reading). (2) **D-C5** — net-new `POST /batch` (`addDailyHealthLogsBatch` + route with `authenticateToken` + `requireDataEntryAllowed`): ≤200 entries, optional `program_ids[]` (deduped, ≤20 → 400 `"Too many programs (max 20)."`, empty-after-filter falls back to `[program_id]`), per-program permission (403 `"You can only log your own daily health."`) + membership checks (program-suffixed rowError messages), workout-batch error precedence (403 → 400 rows → 409 in-batch dups → 400 membership), **in-batch dups 409 / existing rows UPSERT** (present-fields-only, PUT semantics), returns `{ created, updated, programs, total_entries }`. `requireDataEntryAllowed` now checks every id in `program_ids`. **Supersedes D-REF** ("no batch route"; `consumed_by` now `[web, ios, android]` — header + stale status line fixed to match registry.json). Backend: `sql/006`, `models/DailyHealthLog.js`, `services/logService.js`, `routes/logs.js`. Clients: batched multi-row Log-daily-health forms + steps sort/filter/edit/CSV on all three (see the summary/log-health, members/health + member-health-detail page SPECs). Blast-radius: analytics 0.2.0 (timeline steps + `/health/steps`), member-analytics 0.2.0 (`avg_steps`), apple-health 0.7.0 + health-connect 0.2.0 (steps sync) — all updated in-change. Deploy order: migration `006` → backend → clients. Updated §1–§9, F1. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the daily-health-logging CRUD surface (`/api/daily-health-logs`) — the `dailyHealthLogRouter` half of the shared `routes/logs.js` + the daily-health functions of `logService.js` + the daily-health-only `parseOptionalNumber`. Decisions: **D-C1** (scope = daily-health half; append to the file pair `workout-logs` created; reuse the shared helpers + the `requireDataEntryAllowed` middleware) · **D-C2** (reuse `workout-logs`' `requireDataEntryAllowed` middleware for the lock on the 3 write routes — both halves enforce it identically; one ordering nuance accepted) · **D-C3** (tidy `updateDailyHealthLog` to a single `body` param — behavior identical) · **D-REF** (`consumed_by = [web, ios]`, all 4 routes 1:1, no divergence; no batch route) · **D-S1** (faithful otherwise). Flagged F1–F6. No auth/stack migration delta (model + schema already ported). |
