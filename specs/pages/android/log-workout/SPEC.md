# Screen: `log-workout` (android) — the Summary "Add workouts" multi-row log form

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios log-workout`](../../ios/log-workout/SPEC.md)
> + [`web summary/log-workout`](../../web/summary/log-workout/SPEC.md) (`LogWorkoutsForm`) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY_LOG_WORKOUT` (`LogWorkoutScreen`), pushed from the
> Summary "Add workouts" action card (dimmed + non-navigating when `dataEntryLocked`).
> **Consumes:** [`workout-logs`](../../../features/workout-logs/SPEC.md) `POST /workout-logs/batch` +
> [`program-memberships`](../../../features/program-memberships/SPEC.md)/[`program-workouts`](../../../features/program-workouts/SPEC.md)
> lookups, via `ProgramContext`.
> **Files:** `ui/summary/LogWorkoutScreen.kt` + shared `ui/summary/DetailChrome.kt`.

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** a **multi-row** form (up to **200** rows) — each row = **workout · date ·
  duration** (hours + minutes); **admin/logger/global-admin** additionally get a per-row **member** picker while
  a plain **member** has the member field **hidden** and every row seeded to self (`canSelectAnyMember`).
  Per-row **✕ remove**, **"+ Add row" / "+ Add 5 rows"**, a summary line **"N rows • [M members •] T min
  total"**, and a **"Save all"** button disabled unless ≥1 valid row and 0 invalid rows. Empty rows are skipped;
  a non-empty row missing workout/duration blocks the whole submit (all-or-nothing). New rows default to the
  last row's date.
- **Save flow:** builds `[BulkWorkoutEntry]` → `ProgramContext.addWorkoutLogsBatch(entries, programIds)`
  (`POST /workout-logs/batch`, body `{ program_id, program_ids?, entries:[{ member_id, workout_name, date,
  duration }] }`) → on success **bumps `summaryRefreshToken`** (Summary reloads — the iOS `summaryRefreshToken`
  / web `invalidateQueries(["summary"])` analogue) and **pops back**.
- **Program multi-select (0.2.0, workout-logs 0.5.0 D-C10):** an internal `ProgramMultiSelect` composable
  (current program checked+disabled "Current program"; `admin_only_data_entry`-locked programs disabled
  "Admin-only — can't log"; hidden when in one program) sends `program_ids[]` = the full selection. `privileged(p)
  = isGlobalAdmin || p.myRole in {admin, logger}`; when any selected program is non-privileged the per-row member
  field locks to self and rows reset to self on the lock transition. `loadPrograms()` is called when
  `programContext.programs` is empty on mount.
- **Deviation A-2 (success Snackbar):** on a successful save the shell shows a Material **Snackbar** ("N
  workouts saved") via the app-wide `ProgramContext.messages` channel — the Android-idiom acknowledgement of the
  write. iOS confirms by dismissing to the refreshed screen (it dropped the legacy success Alert, D-C3); a
  Snackbar is the platform equivalent (lighter than the Alert iOS removed). Errors stay **inline** (D-C4).
- **D-C1 (lock mount-guard):** `LaunchedEffect` pops immediately when `dataEntryLocked`; the Summary card is
  already disabled; the backend `requireDataEntryAllowed` 403 is the real boundary.
- **D-C4 (inline errors):** per-row **backend `rowErrors`** (400/409, carried on `ApiException.rowErrors`, parsed
  from the `ErrorBody.rowErrors` envelope) map back onto rows by **submit order** → the offending card gets a red
  border + a field/row-level message; other failures → a top inline error line. Plus an `identityMissing` guard
  (member with a blank self-id → block + "sign out and back in").
- **Deviation A-1 (Material chrome):** the shared `DetailChrome` — a circular back button + centered "Add
  workouts" title, `FormFieldLabel`s, a **searchable bottom-sheet picker** (`SearchablePickerField`, the iOS
  `SearchablePickerSheet` / web searchable `Select` analogue) for member + workout, a `LockedMemberField` (lock
  glyph) for the member variant, a **`DatePillField`** opening a Material `DatePicker` (any date; UTC-safe), and
  numeric Hours/Minutes fields. iOS's `AppInputField`/`AppPrimaryButton` → the reused auth `AppTextField` +
  `PillButton`.

## Role-based view rules

| Viewer | Member field | Can log for |
|--------|--------------|-------------|
| global_admin / program admin / logger | per-row **picker** (`canLogForAnyMember`) | any member, per row |
| member | **hidden** — each row seeded to self | self only (backend 403 on any foreign row) |

`admin_only_data_entry` = **LIVE** (write path): a logger can normally log for anyone yet is locked out when the
flag is on (`canLogForAnyMember` includes logger, the lock exemption does not).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Multi-program logging (workout-logs 0.5.0 D-C10).** `LogWorkoutScreen` gains an internal `ProgramMultiSelect` composable above the rows and passes `programIds = selectedProgramIds.toList()` to `ProgramContext.addWorkoutLogsBatch` (`program_ids[]` body); the per-row member field locks to self when any selected program is non-privileged (`privileged` = global_admin OR per-program admin/logger), rows resetting to self on the lock transition. `loadPrograms()` on mount when the roster is empty. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.0 | 2026-07-08 | Initial Android port. |
