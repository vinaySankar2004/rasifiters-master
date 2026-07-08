# Screen: `summary-workout-types-detail` (android) — the Workout Types drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios summary-workout-types-detail`](../../ios/summary-workout-types-detail/SPEC.md)
> + [`web summary/workout-types`](../../web/summary/workout-types/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY_WORKOUT_TYPES` (`WorkoutTypesDetailScreen`), pushed
> from the Summary tab's Top Workout Types card.
> **Consumes:** [`analytics`](../../../features/analytics/SPEC.md) `GET /analytics/workouts/types` — reads the
> types **already loaded** by the Summary tab (`ProgramContext.summary.workoutTypes`); no own fetch. Read-only.
> **Files:** `ui/summary/WorkoutTypesDetailScreen.kt` (reuses `topSixWithOthers` + `workoutTypePaletteColor`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** title **"Workout Types" / "Workouts (Program to date)"**; a horizontal **%-share
  chart** (top 5 + an **"Others"** rollup, palette-colored, %-annotated) over a scrollable **breakdown list** of
  **every** type (color dot · name · sessions · avg-duration · a share progress bar). Program-wide,
  program-to-date; no period, no member scope, no role logic. Read-only → **`admin_only_data_entry` N/A**.
- **Empty state:** `sortedTypes.isEmpty()` → "No workouts logged yet." (a variable-length array — `length===0`
  is the correct predicate, no D-C1 needed, matching iOS).
- **Deviation A-1 (native composition, not Canvas):** the %-share bars + breakdown rows are plain Compose
  (`Box`/`Row` weights + `RoundedCornerShape` fills), not a `Canvas` chart — no axis/interaction needed since
  the values are annotated inline. The chart folds the 6th+ types into "Others" while the breakdown list shows
  **all** types (iOS F2). Dot colors = `workoutTypePaletteColor` (djb2 hash → shared palette, matches web/iOS).
- **No tooltip:** values are already shown as text (sessions + % + avg), so no callout is needed.

## Data / API

Pre-loaded by the Summary tab (`GET /analytics/workouts/types?programId&limit` → `[WorkoutTypeDTO]`, sessions
DESC). This screen only renders them.
