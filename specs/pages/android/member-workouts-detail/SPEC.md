# Screen: `member-workouts-detail` (android) — the per-member Workout history (write surface)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios member-recent-detail`](../../ios/member-recent-detail/SPEC.md)
> + [`web members/workouts`](../../web/members/workouts/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_WORKOUTS` (`MemberRecentDetailScreen`), pushed from
> the Members tab's `MemberRecentCard` (after `focusMember(id, name)`).
> **Consumes:** `ProgramContext.loadMemberRecent` (`GET /member-recent`) · `updateWorkoutLog` (`PUT /workout-logs`) ·
> `deleteWorkoutLog` (`DELETE /workout-logs`) · `loadProgramWorkouts` (filter type options). Reads `focusedMemberId`/
> `focusedMemberName` + `dataEntryLocked`.
> **Files:** `ui/members/MemberRecentDetailScreen.kt` + `MemberDetailShared.kt` (`DetailTopBarWithExport`, `shareCsv`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** a **sorted, filterable list** of workout rows + **per-row Edit (duration only) /
  Delete** + **CSV export**. Every control change re-fetches (`reload()` on `LaunchedEffect(sortField, sortDir,
  filters, memberId)`). Sort by `WorkoutSortField` (**date · duration · workoutType**) + Descending/Ascending.
  Filter: All/Custom date + Workout Type picker + duration min/max. Empty → "No workouts found." +
  "Adjust filters or log a workout to get started."; loading → 5 short skeleton rows. Edit is **duration-only**
  (iOS F6); Delete confirms via an `AlertDialog`.
- **D-C1 — `admin_only_data_entry` LIVE:** Edit/Delete are **hidden when `dataEntryLocked`** (non-admins under the
  lock; global/program admins are exempt) — the `LogRow`'s ⋮ menu simply isn't rendered. Client display gate; the
  backend `requireDataEntryAllowed` 403 is the real boundary.
- **Deviation A-1 (⋮ menu vs iOS swipe):** iOS swipe actions → a trailing **⋮ (`MoreVert`) `DropdownMenu`** per row
  with **Edit** + **Delete** (Delete tinted `AppRed`) — the Android list-row idiom.
- **Deviation A-2 (minutes duration filter):** the duration filter fields are plain **minutes** (digit-only min/max),
  and the Edit sheet takes **Hours + Minutes** (validated total > 0) → `durationMinutes`. When editing **another**
  member's log, `memberName` is sent (self → null); Delete sends `memberId`.
- **Deviation A-3 (`limit=0` full history):** the detail calls `loadMemberRecent(..., limit = 0)` — the backend
  reads `0` as "no cap" and returns the full filtered history (the tab card used `limit = 10` for its top-3 peek).
- **Deviation A-4 (CSV via FileProvider share):** `shareCsv` writes `Workouts_<member>.csv` to `cacheDir/exports`
  and fires an `ACTION_SEND` chooser via `FileProvider`; export disabled when empty; failures swallowed.

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `loadMemberRecent(id, limit=0, …sort/filter)` | `GET /member-recent` | `memberRecent` (the list) |
| `updateWorkoutLog(memberName?, name, date, minutes)` | `PUT /workout-logs` | edits a log's duration (memberName only for others) |
| `deleteWorkoutLog(memberId, null, name, date)` | `DELETE /workout-logs` | removes a log |
| `loadProgramWorkouts()` | `GET /program-workouts` | Workout Type filter options |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the list as CSV |

Edit/Delete re-run `reload()` on success. Bearer-authed by the OkHttp layer.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Sorted/filterable workout list (date/duration/type) + per-row ⋮ Edit (duration-only) / Delete + FileProvider CSV; D-C1 `admin_only_data_entry` lock (hide Edit/Delete). Deviations A-1 (⋮ menu vs swipe) + A-2 (minutes filter, H:M edit) + A-3 (`limit=0` cap) + A-4 (FileProvider CSV). Reads scoped `focusedMemberId`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
