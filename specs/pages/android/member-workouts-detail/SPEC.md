# Screen: `member-workouts-detail` (android) — the per-member Workout history (write surface)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.2 · **App:** `android` (Compose)
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
  Delete** + **CSV export**. Every control change re-fetches (~~`reload()` on `LaunchedEffect(sortField, sortDir,
  filters, memberId)`~~ one `rememberLoad` keyed by (member, sort, direction, filters) — 0.1.2, D-REL1). Sort by `WorkoutSortField` (**date · duration · workoutType**) + Descending/Ascending.
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
| `loadMemberRecent(id, limit=0, …sort/filter, publish = false)` | `GET /member-recent` | ~~`memberRecent` (the list)~~ this screen's own list (0.1.2 — the tab's `memberRecent` is untouched) |
| `updateWorkoutLog(memberName?, name, date, minutes)` | `PUT /workout-logs` | edits a log's duration (memberName only for others) |
| `deleteWorkoutLog(memberId, null, name, date)` | `DELETE /workout-logs` | removes a log |
| `loadProgramWorkouts()` | `GET /program-workouts` | Workout Type filter options |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the list as CSV |

Edit/Delete re-run ~~`reload()`~~ `load.reload()` on success. Bearer-authed by the OkHttp layer.

## Phase 4 polish (0.1.2)

- **D-REL1 (#24 #29 #34 #36; workout-logs D-C12; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23; member-analytics
  D-C13).** **#24:** while a delete runs, Delete (now a spinner) and Cancel are disabled and the dialog can't be
  dismissed, so a double tap can't send a second `DELETE`; it closes when the write settles (success → the list
  reloads, failure → the error). The edit sheet's **Save changes** spins and ignores a second tap. **#29:** the list on
  `rememberLoad` + `KitLoad` — 5 skeleton rows while loading, the offline `ErrorView` with no data offline, `ErrorView`
  + Retry on failure (no longer "No workouts found."), the "Couldn't refresh · Retry" banner (+ 84 dp clearance) on a
  failed refresh, reload on reconnect. **#34:** one load per (member, sort, direction, filters), kept by this screen
  (`publish = false`) — never the Members-tab preview's rows, and it never overwrites the tab's card; the CSV is
  exactly the list on screen. **#36:** the row ⋮ is a labelled (`Actions`) 48 dp target; the sort / filter sheets'
  `Segmented` choices announce selected state at 48 dp; the back button is labelled `Back` (its `DetailTopBarWithExport`
  row in `MemberDetailShared.kt` is unchanged at 44 dp).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #24 delete / save disabled + spinner while running (no double delete); #29 `KitLoad` (skeleton, ErrorView + Retry, stale banner, reconnect reload); #34 the screen keeps its own keyed list (`publish = false`; CSV = the list on screen); #36 48 dp ⋮ "Actions" + segmented choices with selected state. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: edit / delete errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Sorted/filterable workout list (date/duration/type) + per-row ⋮ Edit (duration-only) / Delete + FileProvider CSV; D-C1 `admin_only_data_entry` lock (hide Edit/Delete). Deviations A-1 (⋮ menu vs swipe) + A-2 (minutes filter, H:M edit) + A-3 (`limit=0` cap) + A-4 (FileProvider CSV). Reads scoped `focusedMemberId`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
