# Screen: `summary-distribution-detail` (android) — the Workout Distribution by Day drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios summary-distribution-detail`](../../ios/summary-distribution-detail/SPEC.md)
> + [`web summary/distribution`](../../web/summary/distribution/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY_DISTRIBUTION` (`DistributionDetailScreen`), pushed from
> the Summary tab's distribution card.
> **Consumes:** [`analytics`](../../../features/analytics/SPEC.md) `GET /analytics/distribution/day` — reads the
> counts **already loaded** by the Summary tab (`ProgramContext.summary.distribution`); no own fetch. Read-only.
> **Files:** `ui/summary/DistributionDetailScreen.kt` + the shared `ui/summary/ChartPrimitives.kt` (`BarLineChart`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** title **"Workout Distribution by Day" / "Workouts"**; **7 weekday bars**
  (Sun→Sat), all-time, program-wide; no period, no member scope, no role logic (every role sees the same).
  Read-only → **`admin_only_data_entry` N/A**.
- **D-C1 (all-zero empty-state guard):** keyed off the **SUM** of the 7 counts (the endpoint always returns 7
  keys, so `points.isEmpty()` is wrong) → "No workouts logged yet." Matches iOS D-C1 + the landing card.
- **Deviation A-1 (chart on Canvas):** the shared `BarLineChart` — thin rounded orange bars, left y-axis
  (`niceAxis` ticks + gridlines), weekday labels; no line series (bars only).
- **Deviation A-2 (tap/drag tooltip):** the iOS drag-callout → the **shared** tap/drag tooltip (bold weekday
  title + a color-dotted "N workouts" row, caret + shadow) — the same tooltip look as the activity chart.

## Data / API

The counts are pre-loaded by the Summary tab (`GET /analytics/distribution/day?programId` →
`DistributionByDayDTO.ordered()` = Sun→Sat). This screen only renders them — no loading/error state in-view
(matches web/iOS).
