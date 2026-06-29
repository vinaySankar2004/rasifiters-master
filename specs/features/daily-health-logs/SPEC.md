# Feature: `daily-health-logs` — logging daily sleep + diet (CRUD)

> **Status:** 📄 documented (SPEC only — not yet ported) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/logs.js` (the **`dailyHealthLogRouter`** half — the
> file is shared with `workout-logs`, §7/D-C1), `services/logService.js` (the **daily-health** functions +
> the daily-health-only `parseOptionalNumber` helper), `models/DailyHealthLog.js`, `server.js`
> (`/api/daily-health-logs` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken`) ·
> [`program-memberships`](../program-memberships/SPEC.md) (the `ProgramMembership` admin/logger gate +
> active-participant check) · [`programs`](../programs/SPEC.md) (the `admin_only_data_entry` lock) ·
> [`workout-logs`](../workout-logs/SPEC.md) (the sibling half — this feature **reuses** its
> `requireDataEntryAllowed` middleware + the shared log helpers `resolveLogPermissions`/`isProgramAdmin`
> already in `logService.js`).
> **Deliberate changes (2, the rest faithful):** **D-C2** reuse `workout-logs`' `requireDataEntryAllowed`
> route middleware for the `admin_only_data_entry` lock (instead of the inline `assertDataEntryAllowed`) ·
> **D-C3** tidy `updateDailyHealthLog`'s 3-arg signature to a single `body` param. Everything else is
> faithful 1:1; all four routes are used by both clients with no divergence.

---

## 1. What it is

The **daily-health-logging CRUD surface** — how a member's (or, for admins/loggers, anyone's) **sleep hours**
and **diet/food quality** get recorded against a program for a date. This SPEC owns the
**`dailyHealthLogRouter`** routes (mounted at `/api/daily-health-logs`) and the daily-health functions of
`services/logService.js` (`addDailyHealthLog` / `getDailyHealthLogs` / `updateDailyHealthLog` /
`deleteDailyHealthLog`) plus the daily-health-only `parseOptionalNumber` helper, backed by the
`daily_health_logs` table (composite PK `program_id + member_id + log_date` — **one log per member per day**):

1. **Add a daily health log** — `POST /api/daily-health-logs`. Self, or any active member for admins/loggers.
   At least one of `sleep_hours`/`food_quality`. 201. **409** if one already exists for that date.
2. **List a member's logs** — `GET /api/daily-health-logs?programId=&memberId=&…`. Self, or any member for
   admins/loggers. Supports date-range + sleep/diet-range filters, sort, and limit. Returns
   `{ items, total, filters }`.
3. **Edit a daily health log** — `PUT /api/daily-health-logs`. Updates only the fields present in the body
   (absent ≠ null).
4. **Delete a daily health log** — `DELETE /api/daily-health-logs`.

## 2. Why it exists

Alongside workouts, daily sleep + diet are the app's two lifestyle metrics. A `daily_health_logs` row is
"member M slept S hours and ate at quality Q on date Y in program P". The composite PK enforces **one row
per member per day** (the `add` path 409s on a duplicate; edits mutate the existing row). Permission mirrors
`workout-logs`: the **`admin_only_data_entry`** program lock gates writes entirely; otherwise members
read/write **their own** logs while admins/loggers act for **anyone active in the program**. The metrics are
nullable and partial — a row may carry sleep, diet, or both, and an edit can set or clear either
independently. Authorization stays in Express per the auth model — we do not rely on RLS.

## 3. Functionality (the routes)

All mounted at **`/api/daily-health-logs`** (legacy `routes/logs.js` `dailyHealthLogRouter`). Handlers in
`routes/logs.js`; logic in the daily-health half of `services/logService.js`. The three write routes carry
`authenticateToken` + the reused `requireDataEntryAllowed` middleware (D-C2); `GET` is `authenticateToken`
only. The per-member permission (`resolveLogPermissions`) stays **inline** (its boolean drives per-member
branching — not a hoistable gate).

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `POST /` | `logs.js:83-92` → `addDailyHealthLog` (`logService.js:433-471`) | self; admin/logger for any active member; blocked if locked & non-admin | Add a log. 201. **409** if a log for (program, member, date) already exists. |
| 2 | `GET /` | `logs.js:94-103` → `getDailyHealthLogs` (`logService.js:473-566`) | self; admin/logger for others | List `memberId`'s logs with filters/sort/limit. Returns `{ items, total, filters }`. |
| 3 | `PUT /` | `logs.js:105-114` → `updateDailyHealthLog` (`logService.js:568-611`) | self; admin/logger for others; blocked if locked & non-admin | Update only the fields present in the body (absent ≠ null). |
| 4 | `DELETE /` | `logs.js:116-125` → `deleteDailyHealthLog` (`logService.js:613-638`) | self; admin/logger for others; blocked if locked & non-admin | Delete a log. |

### Validation (faithful — sleep + diet)

- `sleep_hours`/`food_quality` are parsed via `parseOptionalNumber` (`""`/`null`/`undefined` → `null`;
  non-numeric → `NaN` → 400).
- `sleep_hours` ∈ [0, 24]; `food_quality` an integer ∈ [1, 5].
- **Add:** at least one of the two is required (both `null` → 400).
- **Edit:** at least one of the two **fields must be present** in the body (`hasOwnProperty`); a present
  field with a `null` value **clears** that metric, an absent field is **left untouched** (the absent-vs-null
  distinction, §10 F2).

### Response shapes (preserved 1:1)

- **`POST /`** (201): the created `DailyHealthLog` row.
- **`GET /`** (`logService.js:552-565`): `{ items: [{ id, logDate, sleepHours, foodQuality }], total, filters }`
  — `id` is a **synthetic** `"<member_id>-<log_date>-<idx>"` (§10 F3); `filters` echoes the resolved
  filter/sort values.
- **`PUT /`**: the updated `DailyHealthLog` row.
- **`DELETE /`** (`logService.js:637`): `{ message: "Daily health log deleted successfully." }`.

### Error contract (faithful — `routes/logs.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific generic
(`"Failed to add daily health log."`, `"Failed to fetch daily health logs."`, `"Failed to update daily
health log."`, `"Failed to delete daily health log."`). Status codes: `400` (missing/invalid fields), `403`
(permission / program-locked / view-others), `404` (member not enrolled / log not found), `409` (add when a
log already exists for the date). The D-C2 middleware preserves the `403` lock code + message (one ordering
nuance, §10 F4).

## 4. Feature list (behaviors to port)

- **Add** (`logService.js:433-471`) — require `program_id`+`log_date` (400); parse + range-validate
  sleep/diet, require at least one (400). The lock is enforced by the **D-C2 middleware** (was
  `assertDataEntryAllowed` here). `canLogForAny` (`resolveLogPermissions`); a non-admin may only target self
  (403 otherwise); the target must be an **active** participant (404). **409** if a row already exists for
  (program, member, date). Create.
- **List** (`logService.js:473-566`) — require `programId`+`memberId` (400). `canLogForAny`; a non-admin may
  only view self (403). Target must be active (404). Build the `where` from optional `startDate`/`endDate`
  (range) + sleep-range (`min/maxSleepHours`, NULL-excluding) + diet-range (`min/maxFoodQuality`,
  NULL-excluding); order by `log_date`|`sleep_hours`|`food_quality` × `asc`|`desc`; apply `limit` when
  `> 0`. Map rows to `{ id, logDate, sleepHours, foodQuality }` and return `{ items, total, filters }`.
  **No lock check** (read).
- **Edit** (`logService.js:568-611`) — require `program_id`+`log_date` (400); presence-check sleep/diet via
  `hasOwnProperty` (D-C3 — derived from the single `body` param), require at least one present (400);
  range-validate present fields. Lock via D-C2 middleware. `canLogForAny`; non-admin self-only target;
  active-participant 404; find the log (404); `update` only the present fields.
- **Delete** (`logService.js:613-638`) — require `program_id`+`log_date` (400). Lock via D-C2 middleware.
  `canLogForAny`; non-admin self-only target; active-participant 404; find the log (404); destroy.

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`. Already migrated; `models/DailyHealthLog.js`
already ported (with associations in `models/index.js`). **No migration delta.**

- **`daily_health_logs`** (owned — read + write) — composite PK `program_id` (FK → `programs(id)`) +
  `member_id` (FK → `members(id)`) + `log_date` (DATEONLY); `sleep_hours` (DECIMAL(4,2), nullable);
  `food_quality` (SMALLINT, nullable, **DB column `diet_quality`** via the model `field` mapping);
  `created_at`/`updated_at`. The composite PK is why `add` 409s on a duplicate (one row per member per day).
- **`program_memberships`** (referenced, owned by [`program-memberships`](../program-memberships/SPEC.md))
  — the admin/logger permission (`resolveLogPermissions`), the program-admin lock check (`isProgramAdmin`,
  via the D-C2 middleware), and the target's active-participant check.
- **`programs`** (referenced, owned by [`programs`](../programs/SPEC.md)) — the `admin_only_data_entry` lock.

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL` (`config/database.js`). No feature flags;
no rate limiting. `getDailyHealthLogs` defaults `limit = 1000` (iOS sends 1000; web sends 10 for the
overview card and 0 = unlimited for the detail page). The program-lock gate is the reused
`requireDataEntryAllowed` middleware (D-C2).

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

**What stays (faithful 1:1):** the four routes + their `authenticateToken` gate, the inline per-member
permission logic and its 403/404 messages, the sleep/diet parsing + range validation + at-least-one rule,
the **409**-on-duplicate add, the one-row-per-day composite PK, the filter/sort/limit query building, the
synthetic `GET` row id + `{ items, total, filters }` shape, the partial-update absent-vs-null semantics, and
the error contract.

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
  `daily_health_logs`.
- **Consumers:** **`web` + `ios`** — all four routes used 1:1 by both clients, **no divergence**.
  - **web:** `POST /` — `lib/api/logs.ts:49` (`addDailyHealthLog`), from `summary/page.tsx:135` +
    `summary/log-health/page.tsx:36` (the `LogDailyHealthForm`). `GET /` — `lib/api/members.ts:168`
    (`fetchMemberHealthLogs`), from `members/page.tsx:192` (overview card, `limit:10`) +
    `members/health/page.tsx:121` (filtered detail, `limit:0`). `PUT /` — `lib/api/logs.ts:66`, from
    `members/health/page.tsx:137` (edit modal). `DELETE /` — `lib/api/logs.ts:83`, from
    `members/health/page.tsx:154`.
  - **ios:** `POST /` — `APIClient+Health.swift` (`addDailyHealthLog`), from `AdminHomeHelpers.swift:2403`
    (`AddDailyHealthDetailView`) + the quick-add health widget `QuickAddHealthWidgetEntryView.swift:510`
    (loops over program ids). `GET /` — `fetchMemberHealthLogs`, via
    `ProgramContext+Members.swift:220` (`limit:1000`), from `HealthSortFilterSheets.swift:356`
    (`MemberHealthDetail`). `PUT /` — `updateDailyHealthLog`, via `ProgramContext+WorkoutManagement.swift:54`,
    from `HealthSortFilterSheets.swift:812` (`DailyHealthEditSheet`). `DELETE /` — `deleteDailyHealthLog`,
    via `ProgramContext+WorkoutManagement.swift:72`, from `HealthSortFilterSheets.swift:374`
    (`MemberHealthDetail` swipe) + the widget rollback `QuickAddHealthWidgetEntryView.swift:565`. No batch
    route exists (both clients loop single `POST /` in their widgets).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the daily-health half only; append to the existing file pair.** Add the four daily-health fns + `parseOptionalNumber` to `services/logService.js`, the `dailyHealthLogRouter` (4 routes) to `routes/logs.js` (export both routers), mount `/api/daily-health-logs`. The `workout-logs` half + the shared helpers + the `requireDataEntryAllowed` middleware are reused, not re-created. | `routes/logs.js:81-125`; `logService.js:433-638` + `:49-53` (`parseOptionalNumber`); COVERAGE L21; workout-logs SPEC D-C1. |
| **D-C2** | **Reuse `workout-logs`' `requireDataEntryAllowed` middleware** for the `admin_only_data_entry` lock on the 3 write routes (`GET` ungated); the write fns drop their inline `assertDataEntryAllowed`. Both halves enforce the lock identically. Resolve-or-pass-through; 403 + message preserved 1:1; one ordering nuance accepted (F4). | `logService.js:447, 585, 616` (inline `assertDataEntryAllowed`); workout-logs D-C5; user decision (consistency). |
| **D-C3** | **Tidy `updateDailyHealthLog` to a single `body` param** — legacy took `(parsed, requester, rawBody)` called with `req.body` twice; the port takes `(body, requester)` and derives the destructure + the `hasOwnProperty` presence flags from one object. Behavior identical (absent-vs-null preserved). | `logService.js:568, 573-574`; `routes/logs.js:107`; user cleanup choice. |
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [web, ios]`** — all four routes used 1:1 by both clients, **no divergence**. `GET`'s `limit` differs per caller (web 10/0, iOS 1000) but the route is identical. | Web sweep (`lib/api/{logs,members}.ts` + summary/members pages) + iOS sweep (`APIClient+Health.swift` + widget); Explore agents. |
| **D-S1** | **Stance = faithful 1:1 except D-C2 + D-C3.** The 409-on-duplicate add, one-row-per-day PK, sleep/diet validation, filter/sort/limit query, synthetic GET id + `{items,total,filters}` shape, and partial-update absent-vs-null semantics are preserved; oddities are flagged (§10), not otherwise touched. | Whole-half review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **One log per member per day** — the composite PK `(program_id, member_id, log_date)` means `add` 409s on a duplicate date (no upsert), and edits mutate the existing row. Intentional (a day has one sleep + one diet value). | `models/DailyHealthLog.js`; `logService.js:462-465` | Kept (faithful). |
| **F2** | **Partial-update absent-vs-null semantics** — `PUT` distinguishes a field **absent** from the body (left untouched) from a field present with value `null` (cleared), via `hasOwnProperty`. D-C3 keeps this exactly (just from one `body` arg instead of two). | `logService.js:573-574, 605-608` | Kept (faithful) — required for independent set/clear of sleep vs diet. |
| **F3** | **`GET` returns a synthetic row id** — `id: "<member_id>-<log_date>-<idx>"`. The real key is the (member, date) pair; the id is a render key, not addressable (edits/deletes key off `program_id`+`member_id`+`log_date`, not this id). | `logService.js:546` | Kept (faithful) — clients use it only as a list key. |
| **F4** | **D-C2 ordering nuance** — for a **locked** program + a **non-admin** + an otherwise-invalid body, the reused middleware returns `403` where legacy returned the handler's `400`. Accepted with the hoist (same as workout-logs F6); `program_id`-absent / program-missing still pass through. | `routes/logs.js` (middleware) vs `logService.js:434-447` | Changed (D-C2) — the accepted residual. |
| **F5** | **`food_quality` ↔ DB `diet_quality`** — the API field is `food_quality` but the column is `diet_quality` (model `field` mapping). Faithful; a rebuild would not rename either side. | `models/DailyHealthLog.js` (`field: "diet_quality"`) | Kept (faithful) — preserves both the API and the migrated column name. |
| **F6** | **Legacy `updateDailyHealthLog` passed the body twice** `(req.body, req.user, req.body)` to get `hasOwnProperty` presence. Tidied by **D-C3** to a single `body` param; recorded as the legacy shape. | `logService.js:568`; `routes/logs.js:107` | Changed (D-C3). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the daily-health-logging CRUD surface (`/api/daily-health-logs`) — the `dailyHealthLogRouter` half of the shared `routes/logs.js` + the daily-health functions of `logService.js` + the daily-health-only `parseOptionalNumber`. Decisions: **D-C1** (scope = daily-health half; append to the file pair `workout-logs` created; reuse the shared helpers + the `requireDataEntryAllowed` middleware) · **D-C2** (reuse `workout-logs`' `requireDataEntryAllowed` middleware for the lock on the 3 write routes — both halves enforce it identically; one ordering nuance accepted) · **D-C3** (tidy `updateDailyHealthLog` to a single `body` param — behavior identical) · **D-REF** (`consumed_by = [web, ios]`, all 4 routes 1:1, no divergence; no batch route) · **D-S1** (faithful otherwise). Flagged F1–F6. No auth/stack migration delta (model + schema already ported). |
