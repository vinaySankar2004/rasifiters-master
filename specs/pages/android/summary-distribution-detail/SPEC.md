# Screen: `summary-distribution-detail` (android) — the Workout Distribution by Day drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.1 · **App:** `android` (Compose)
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
(matches web/iOS); missing counts read "—" (0.1.1, D-REL1).

## Phase 4 polish (0.1.1)

- **D-REL1 (#26 #29 #36; frontend-kit D-KIT-11, D-KIT-22).** **#26 (Android-only):** the screen now scrolls
  vertically and the chart scrubs on a horizontal drag only (shared `BarLineChart`) — a vertical drag over the chart
  scrolls the page; a tap still selects. **#29 (defensive):** with no distribution data (`summary.distribution ==
  null`) the chart area reads "—", never "No workouts logged yet." (not reachable today: the Summary card isn't
  tappable then). **#36:** the back button is a labelled (`Back`) 48 dp target.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #26 page scrolls, chart scrubs horizontally only; #29 missing data reads "—" (defensive); #36 labelled 48 dp back target. |
