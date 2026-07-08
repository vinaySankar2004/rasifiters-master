# Screen: `lifestyle-workout-types` (android) — the program workout-types manager

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the iOS `ViewWorkoutTypesListView`
> (`Features/Home/ProgramManagement/WorkoutTypesSection.swift`) + [`web lifestyle/workouts`](../../web/lifestyle/workouts/SPEC.md)
> — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.LIFESTYLE_WORKOUT_TYPES` (`WorkoutTypesListScreen`),
> pushed from the Lifestyle-tab glass button. **Shared** with the Program tab (Phase G) — lit up now for the
> Lifestyle entry point (the Phase-E precedent: a nominally-later-phase screen ported when an entry point needs it).
> **Consumes:** [`workouts`](../../../features/workouts/SPEC.md) via `ProgramContext` (full catalog + management).
> **Files:** `ui/lifestyle/WorkoutTypesListScreen.kt`.

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** back + centered title **"Workout Types"**; a **search** field; an
  **Available (N)** section of visible types + (admins only) a **Hidden (N)** section; each row = a
  source-colored circle icon (**custom** = green star / **global** = purple dumbbell) + name +
  "Custom"/"Standard" (+ orange "• Hidden"); hidden rows dimmed. Non-admins get a **read-only** list.
- **Management (gated on `canEditProgramData` = `isProgramAdmin`):** a top-right **+** adds a custom type;
  **global** (library) types can only be **hidden/shown**; **custom** types can be **renamed / deleted /
  hidden**. Delete confirms via an AlertDialog ("Delete Custom Workout?"); a delete that fails server-side
  (type has logs) surfaces its error. Each mutation reloads the full catalog.
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
