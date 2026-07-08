# Screen: `member-health-detail` (android) — the per-member daily-Health logs (write surface)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios member-health-detail`](../../ios/member-health-detail/SPEC.md)
> + [`web members/health`](../../web/members/health/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_HEALTH` (`MemberHealthDetailScreen`), pushed from
> the Members tab's `MemberHealthCard` (after `focusMember(id, name)`).
> **Consumes:** `ProgramContext.loadMemberHealthLogs` (`GET /daily-health-logs`) · `updateDailyHealthLog`
> (`PUT /daily-health-logs`) · `deleteDailyHealthLog` (`DELETE /daily-health-logs`). Reads `focusedMemberId`/
> `focusedMemberName` + `dataEntryLocked`.
> **Files:** `ui/members/MemberHealthDetailScreen.kt` + `MemberDetailShared.kt` (`DetailTopBarWithExport`, `shareCsv`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1) — the write twin of `member-workouts-detail`:** a **sorted, filterable list** of
  sleep/diet rows + **per-row Edit (sleep + diet) / Delete** + **CSV export**. Re-fetches on every control change
  (`reload()`). Sort by `HealthSortField` (**date · sleep_hours · food_quality**) + Descending/Ascending; filter:
  All/Custom date + Sleep (hrs) min/max + Diet Quality (1–5) min/max. Empty → "No daily health logs found." +
  "Adjust filters or log daily health to get started."; loading → 5 short skeleton rows.
- **Edit validation (faithful):** the Edit sheet takes Hours + Minutes + a Diet-quality dropdown (1–5, plus a
  "Clear rating" option); it requires **at least one metric** present and sleep within **0:00–24:00** — otherwise
  "Enter sleep or diet quality." / "Sleep time must be between 0:00 and 24:00." Delete confirms via `AlertDialog`.
- **D-C1 — `admin_only_data_entry` LIVE:** Edit/Delete **hidden when `dataEntryLocked`** (non-admins under the lock;
  admins exempt) — same lock as the workouts twin. Client display gate; backend 403 is the boundary.
- **Deviation A-1 (⋮ menu vs iOS swipe):** the shared `LogRow` renders a trailing ⋮ `DropdownMenu` (Edit / Delete)
  per row — the Android list-row idiom.
- **Deviation A-2 (JsonObject update body — LOAD-BEARING, F3):** the app's global `Json { explicitNulls = false }`
  would **omit** null fields, so a serialized-DTO update could never *clear* a metric. To preserve the
  clear-a-metric semantics, `updateDailyHealthLog` builds the PUT body as a **`buildJsonObject { … }`** with
  explicit `sleep_hours` / `food_quality` keys — an explicit `null` is sent and the server clears that metric.
  `member_id` is **always** sent (not omitted).
- **Deviation A-3 (CSV via FileProvider share):** `shareCsv` writes `HealthLogs_<member>.csv` to `cacheDir/exports`
  and fires an `ACTION_SEND` chooser via `FileProvider`; export disabled when empty; failures swallowed.

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `loadMemberHealthLogs(id, limit=0, …sort/filter)` | `GET /daily-health-logs` | `memberHealthLogs` (the list) |
| `updateDailyHealthLog(id, date, sleep?, diet?)` | `PUT /daily-health-logs` (JsonObject body) | edits sleep + diet; explicit null **clears** a metric |
| `deleteDailyHealthLog(id, date)` | `DELETE /daily-health-logs` | removes a log |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the list as CSV |

Edit/Delete re-run `reload()` on success. Bearer-authed by the OkHttp layer.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Sorted/filterable sleep/diet list + per-row ⋮ Edit (sleep+diet, at-least-one-metric + 0:00–24:00) / Delete + FileProvider CSV; D-C1 `admin_only_data_entry` lock. Deviation A-2 (F3): the PUT body is a `buildJsonObject` so explicit null CLEARS a metric despite the global `explicitNulls=false`; `member_id` always sent. Reads scoped `focusedMemberId`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
