# Screen: `lifestyle-workout-types` (android) — the program workout-types manager

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.2 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the iOS `ViewWorkoutTypesListView`
> (`Features/Home/ProgramManagement/WorkoutTypesSection.swift`) + [`web lifestyle/workouts`](../../web/lifestyle/workouts/SPEC.md)
> — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.LIFESTYLE_WORKOUT_TYPES` (`WorkoutTypesListScreen`),
> pushed from the Lifestyle-tab glass button. **Shared** with the Program tab (Phase G) — lit up now for the
> Lifestyle entry point (the Phase-E precedent: a nominally-later-phase screen ported when an entry point needs it).
> **Consumes:** [`program-workouts`](../../../features/program-workouts/SPEC.md) via `ProgramContext` — the program workout-types catalog + custom CRUD (`GET /program-workouts` unfiltered, `toggle-visibility`, `POST`/`PUT`/`DELETE /program-workouts/custom`); see the table below. (The global [`workouts`](../../../features/workouts/SPEC.md) library is iOS-only — Android never calls `GET /api/workouts`.)
> **Files:** `ui/lifestyle/WorkoutTypesListScreen.kt`.

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** back + centered title **"Workout Types"**; a **search** field; an
  **Available (N)** section of visible types + (admins only) a **Hidden (N)** section; each row = a
  source-colored circle icon (**custom** = green star / **global** = purple dumbbell) + name +
  "Custom"/"Standard" (+ orange "• Hidden"); hidden rows dimmed. Non-admins get a **read-only** list.
- **Management (gated on `canEditProgramData` = `isProgramAdmin`):** a top-right **+** adds a custom type;
  **global** (library) types can only be **hidden/shown**; **custom** types can be **renamed / deleted /
  hidden**. Delete confirms via an AlertDialog ("Delete Custom Workout?"); a delete that fails server-side
  (type has logs) surfaces its error. ~~Each mutation reloads the full catalog.~~ *(Superseded at 0.1.2 by D-REL1:
  a write is judged by the write; the catalog refreshes afterwards.)*
- **Deviation A-1 (⋮ overflow menu, not swipe):** per-row actions live in a trailing **⋮ `DropdownMenu`**
  (`AppDropdownMenu`) — Edit (custom, non-hidden) · Hide/Show · Delete (custom) — because Compose LazyColumn
  has no built-in swipe action (the established Members-tab manager idiom, Phase E).
- **Deviation A-2 (full catalog fetch):** reads via `ProgramContext.loadAllProgramWorkouts()` →
  `GET /program-workouts` **unfiltered** (keeps hidden rows for the manager), distinct from the log-form
  `loadProgramWorkouts()` which filters `is_hidden`.
- **Deviation A-3 (bottom-sheet add/edit):** the add/rename form is a `ModalBottomSheet` (one text field +
  Cancel / confirm), the Android analog of iOS's `Form` sheet.

## Data / API (via `ProgramContext`, Bearer-authed by the OkHttp layer)

| Action | Endpoint |
|--------|----------|
| Load catalog | `GET /program-workouts?programId` (unfiltered) |
| Hide/show global | `PUT /program-workouts/toggle-visibility` `{program_id, library_workout_id}` |
| Hide/show custom | `PUT /program-workouts/{id}/toggle-visibility` |
| Add custom | `POST /program-workouts/custom` `{program_id, workout_name}` |
| Rename custom | `PUT /program-workouts/{id}` `{workout_name}` |
| Delete custom | `DELETE /program-workouts/{id}` |

## Phase 4 polish (0.1.2)

- **D-REL1 (#9 #12 #33 #36; program-workouts D-C3; frontend-kit D-KIT-21, D-KIT-22).** **#9:** the add / edit sheet
  shows its own saving spinner (Cancel + confirm disabled) and its error inside the open sheet (it used to draw behind
  it; a sheet swiped away meanwhile sends the error to the list line); a failed hide / show / delete stays on the error
  line pinned under the search field, outside the list. **#12:** a write is judged by the write itself — the local
  catalog changes at once (only while the write's program is still active), then refreshes in the background (hide /
  show / delete) or through this screen's load (add / edit → `load.reload()`), so a failed refresh shows "Couldn't
  refresh", never "failed"; `loadAllProgramWorkouts` writes only for the active program + session. **#33:** the catalog
  on `rememberLoad` (keyed by program) + `KitLoad` — spinner, `ErrorView` + Retry (offline copy while offline), the
  "Couldn't refresh" banner, reload on reconnect; empty lines `No workout types yet.` / `No workout types match your
  search.` (by query); the failed and empty states scroll, so pull to refresh works there too. **#36:** the header row
  is 48 dp (the labelled 48 dp back target).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #9 sheet saving state + error inside the sheet, row errors pinned under search; #12 writes judged by the write (local change + background refresh); #33 kit states, query-aware empty lines, pull to refresh on failed / empty; #36 48 dp header / back target. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: workout-type action errors go through `toAppError()` (server text kept for 400/422 and row errors — frontend-kit D-KIT-19, #8). |
