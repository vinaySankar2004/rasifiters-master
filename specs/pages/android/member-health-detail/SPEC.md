# Screen: `member-health-detail` (android) — the per-member daily-Health logs (write surface)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.3 · **App:** `android` (Compose)
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
  export**. Re-fetches on every control change (~~`reload()`~~ one `rememberLoad` keyed by (member, sort, direction,
  filters) — 0.2.3, D-REL1). Sort by `HealthSortField` (**date · sleep_hours ·
  food_quality · steps**) + Descending/Ascending; filter: All/Custom date + Sleep (hrs) min/max + Diet Quality
  (1–5) min/max + **Steps min/max**. List rows (`HealthLogRow`) use a **stacked metric-cell layout**: a header row
  (`AppBlueLight` dot + `logDate` semibold + trailing ⋮ menu) over three equal labeled cells (`HealthMetricCell`:
  uppercase `SLEEP`/`DIET`/`STEPS` label over the semibold value, neutral `onSurface @6%` fill), grouped, `—` for
  missing. (The compact `MemberHealthCard` preview keeps the DC-10 two-line form.) Empty → "No daily health logs
  found."; loading → 5 short skeleton rows.
- **Edit validation (faithful):** the Edit sheet takes Hours + Minutes + a Diet-quality dropdown (1–5, plus a
  "Clear rating" option) + a **Steps** digit field (blank = clear); it requires **at least one metric** present
  (sleep / diet / steps — R-1) and sleep within **0:00–24:00**. Delete confirms via `AlertDialog`.
- **D-C1 — `admin_only_data_entry` LIVE:** Edit/Delete **hidden when `dataEntryLocked`** (non-admins under the lock;
  admins exempt) — same lock as the workouts twin. Client display gate; backend 403 is the boundary.
- **Deviation A-1 (⋮ menu vs iOS swipe):** `HealthLogRow` renders a trailing ⋮ `AppDropdownMenu` (Edit / Delete) in
  its header — the Android list-row idiom (iOS uses swipe actions).
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
| `loadMemberHealthLogs(id, limit=0, …sort/filter/minSteps/maxSteps, publish = false)` | `GET /daily-health-logs` | ~~`memberHealthLogs` (the list, now steps-aware)~~ this screen's own list, steps-aware (0.2.3 — the tab's `memberHealthLogs` is untouched) |
| `updateDailyHealthLog(id, date, sleep?, diet?, steps?, stepsProvided)` | `PUT /daily-health-logs` (JsonObject body) | edits sleep + diet + steps; explicit null **clears** a metric |
| `deleteDailyHealthLog(id, date)` | `DELETE /daily-health-logs` | removes a log |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the list as CSV |

Edit/Delete re-run ~~`reload()`~~ `load.reload()` on success. Bearer-authed by the OkHttp layer.

## Phase 4 polish (0.2.3)

- **D-REL1 (#24 #29 #34 #36; daily-health-logs D-C8; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23; member-analytics
  D-C13).** **#24:** while a delete runs, Delete (now a spinner) and Cancel are disabled and the dialog can't be
  dismissed, so a double tap can't send a second `DELETE`; it closes when the write settles (success → the list
  reloads, failure → the error). The edit sheet's **Save changes** spins and ignores a second tap. **#29:** the list on
  `rememberLoad` + `KitLoad` — 5 skeleton rows while loading, the offline `ErrorView` with no data offline, `ErrorView`
  + Retry on failure (no longer "No daily health logs found."), the "Couldn't refresh · Retry" banner (+ 84 dp
  clearance) on a failed refresh, reload on reconnect. **#34:** one load per (member, sort, direction, filters), kept by
  this screen (`publish = false`) — never the Members-tab preview's rows, and it never overwrites the tab's card; the
  CSV is exactly the list on screen. **#36:** the `HealthLogRow` ⋮ is a labelled (`Actions`) 48 dp target; the sort /
  filter sheets' `Segmented` choices announce selected state at 48 dp; the back button is labelled `Back` (its
  `DetailTopBarWithExport` row in `MemberDetailShared.kt` is unchanged at 44 dp).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.3 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #24 delete / save disabled + spinner while running (no double delete); #29 `KitLoad` (skeleton, ErrorView + Retry, stale banner, reconnect reload); #34 the screen keeps its own keyed list (`publish = false`; CSV = the list on screen); #36 48 dp ⋮ "Actions" + segmented choices with selected state. |
| 0.2.2 | 2026-10-13 | Phase 4 quick wins: edit / delete errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
| 0.2.1 | 2026-07-09 | **View Health row clarity refactor (cosmetic, cross-surface parity).** The health list moves off the shared `LogRow`/DC-10 two-line format to a dedicated **`HealthLogRow`** with a **stacked metric-cell layout**: a header row (`AppBlueLight` dot + `logDate` semibold + trailing ⋮ `AppDropdownMenu` Edit/Delete) over three equal labeled cells (new `HealthMetricCell`: uppercase `SLEEP`/`DIET`/`STEPS` label over the semibold value, neutral `onSurface @6%` fill). Values/formatting unchanged (`—` for missing, steps grouped); the compact `MemberHealthCard` preview still uses the shared two-line row. Matches the web + iOS View Health rows. No contract/behavior change. `assembleDebug` BUILD SUCCESSFUL; user live-tested. |
| 0.2.0 | 2026-07-09 | **Steps throughout** (daily-health-logs 0.2.0). `HealthSortField` gains `STEPS`; `HealthFilters` gains `minSteps`/`maxSteps` + a filter-sheet Steps section; `reload()` passes `minSteps`/`maxSteps` to `loadMemberHealthLogs`; list rows adopt the **DC-10** two-line layout (`Sleep · Diet · Steps`, grouped); `HealthEditSheet` gains a Steps digit field (blank = clear, at-least-one-metric includes steps) → `updateDailyHealthLog(…, steps, stepsProvided = true)` (JsonObject body adds explicit `steps`); `healthCsv` gains a Steps column. `MemberHealthItem` gains `steps`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Sorted/filterable sleep/diet list + per-row ⋮ Edit (sleep+diet, at-least-one-metric + 0:00–24:00) / Delete + FileProvider CSV; D-C1 `admin_only_data_entry` lock. Deviation A-2 (F3): the PUT body is a `buildJsonObject` so explicit null CLEARS a metric despite the global `explicitNulls=false`; `member_id` always sent. Reads scoped `focusedMemberId`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
