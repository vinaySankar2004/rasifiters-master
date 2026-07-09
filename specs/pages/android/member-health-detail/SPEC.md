# Screen: `member-health-detail` (android) — the per-member daily-Health logs (write surface)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios member-health-detail`](../../ios/member-health-detail/SPEC.md)
> + [`web members/health`](../../web/members/health/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_HEALTH` (`MemberHealthDetailScreen`), pushed from
> the Members tab's `MemberHealthCard` (after `focusMember(id, name)`).
> **Consumes:** `ProgramContext.loadMemberHealthLogs` (`GET /daily-health-logs`) · `updateDailyHealthLog`
> (`PUT /daily-health-logs`) · `deleteDailyHealthLog` (`DELETE /daily-health-logs`). Reads `focusedMemberId`/
> `focusedMemberName` + `dataEntryLocked`.
> **Files:** `ui/members/MemberHealthDetailScreen.kt` + `MemberDetailShared.kt` (`DetailTopBarWithExport`, `shareCsv`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1) — the write twin of `member-workouts-detail`; v0.2.0 adds steps:** a **sorted,
  filterable list** of sleep/diet/**steps** rows + **per-row Edit (sleep + diet + steps) / Delete** + **CSV
  export**. Re-fetches on every control change (`reload()`). Sort by `HealthSortField` (**date · sleep_hours ·
  food_quality · steps**) + Descending/Ascending; filter: All/Custom date + Sleep (hrs) min/max + Diet Quality
  (1–5) min/max + **Steps min/max**. Rows use the **DC-10** two-line layout (`Sleep · Diet · Steps`, grouped, `—`
  for missing). Empty → "No daily health logs found."; loading → 5 short skeleton rows.
- **Edit validation (faithful):** the Edit sheet takes Hours + Minutes + a Diet-quality dropdown (1–5, plus a
  "Clear rating" option) + a **Steps** digit field (blank = clear); it requires **at least one metric** present
  (sleep / diet / steps — R-1) and sleep within **0:00–24:00**. Delete confirms via `AlertDialog`.
- **D-C1 — `admin_only_data_entry` LIVE:** Edit/Delete **hidden when `dataEntryLocked`** (non-admins under the lock;
  admins exempt) — same lock as the workouts twin. Client display gate; backend 403 is the boundary.
- **Deviation A-1 (⋮ menu vs iOS swipe):** the shared `LogRow` renders a trailing ⋮ `DropdownMenu` (Edit / Delete)
  per row — the Android list-row idiom.
- **Deviation A-2 (JsonObject update body — LOAD-BEARING, F3):** the app's global `Json { explicitNulls = false }`
  would **omit** null fields, so a serialized-DTO update could never *clear* a metric. To preserve the
  clear-a-metric semantics, `updateDailyHealthLog` builds the PUT body as a **`buildJsonObject { … }`** with
  explicit `sleep_hours` / `food_quality` / **`steps`** keys (each gated on a `*Provided` flag) — an explicit
  `null` is sent and the server clears that metric. `member_id` is **always** sent (not omitted).
- **Deviation A-3 (CSV via FileProvider share):** `shareCsv` writes `HealthLogs_<member>.csv` to `cacheDir/exports`
  and fires an `ACTION_SEND` chooser via `FileProvider`; export disabled when empty; failures swallowed.

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `loadMemberHealthLogs(id, limit=0, …sort/filter/minSteps/maxSteps)` | `GET /daily-health-logs` | `memberHealthLogs` (the list, now steps-aware) |
| `updateDailyHealthLog(id, date, sleep?, diet?, steps?, stepsProvided)` | `PUT /daily-health-logs` (JsonObject body) | edits sleep + diet + steps; explicit null **clears** a metric |
| `deleteDailyHealthLog(id, date)` | `DELETE /daily-health-logs` | removes a log |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the list as CSV |

Edit/Delete re-run `reload()` on success. Bearer-authed by the OkHttp layer.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Steps throughout** (daily-health-logs 0.2.0). `HealthSortField` gains `STEPS`; `HealthFilters` gains `minSteps`/`maxSteps` + a filter-sheet Steps section; `reload()` passes `minSteps`/`maxSteps` to `loadMemberHealthLogs`; list rows adopt the **DC-10** two-line layout (`Sleep · Diet · Steps`, grouped); `HealthEditSheet` gains a Steps digit field (blank = clear, at-least-one-metric includes steps) → `updateDailyHealthLog(…, steps, stepsProvided = true)` (JsonObject body adds explicit `steps`); `healthCsv` gains a Steps column. `MemberHealthItem` gains `steps`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Sorted/filterable sleep/diet list + per-row ⋮ Edit (sleep+diet, at-least-one-metric + 0:00–24:00) / Delete + FileProvider CSV; D-C1 `admin_only_data_entry` lock. Deviation A-2 (F3): the PUT body is a `buildJsonObject` so explicit null CLEARS a metric despite the global `explicitNulls=false`; `member_id` always sent. Reads scoped `focusedMemberId`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
