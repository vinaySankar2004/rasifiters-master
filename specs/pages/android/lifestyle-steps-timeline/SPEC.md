# Screen: `lifestyle-steps-timeline` (android) — the daily-steps drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = [`ios lifestyle-steps-timeline`](../../ios/lifestyle-steps-timeline/SPEC.md) +
> [`web lifestyle/steps-timeline`](../../web/lifestyle/steps-timeline/SPEC.md) — this file records only the
> Android realization + idiom deviations. The steps twin of
> [`lifestyle-timeline`](../lifestyle-timeline/SPEC.md).
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.LIFESTYLE_STEPS_TIMELINE`
> (`StepsTimelineDetailScreen`), pushed from the Lifestyle-tab Steps Timeline preview card.
> **Consumes:** `ProgramContext.loadHealthTimeline(period, memberId)` → `GET /analytics/health/timeline` (the
> additive `steps` per bucket, analytics 0.2.0 D-C5). Read-only.
> **Files:** `ui/lifestyle/StepsTimelineDetailScreen.kt`; chart = the shared `ui/summary/ChartPrimitives.kt`
> `BarLineChart` (`tooltip:` TooltipData renderer — read-only, not modified).

## Parity + Android-idiom deviations

- **Faithful (iOS 1:1):** back button + title **"Steps Timeline" / "Daily steps"**; a **W/M/Y/P** segmented
  period selector (re-fetches per change); a **daily-average header** — "DAILY AVERAGE" + the range label,
  then a single **Steps `%,d`** (teal `#14b8a6`) stat; the chart — teal **daily-steps bars**; a bottom
  **legend** (Steps). Range label = "This Week" (week) else the server `label`.
- **Member scope:** admins → the Lifestyle "View as" pick (`ProgramContext.lifestyleViewAsId`, `null` =
  program-wide); everyone else → self (`loggedInMemberId`). Read once at composition (the pick is already set
  by the tab), the iOS `memberId:` init-param analog. **Group scope = per-member-day average** (analytics
  D-C5 / amendment A-4), mirroring the sleep timeline.
- **D-C1 (single teal series):** one nice-tick left axis labelled "steps" (drops the sleep-bars + diet-line
  dual-axis of the twin); `BarLineChart(values = points.map { it.steps }, lineValues = null, barColor =
  StepsTeal, …)`.
- **Tooltip (mandatory — memory `chart-tooltips-mandatory` / `android-shared-chart-tooltip`):** tap/drag →
  the **one shared** `TooltipData` look (bold "MMM d" title + color-dotted **"Steps: %,d"** row + caret +
  shadow), reused from `ChartPrimitives` — the iOS steps callout analog.
- **Deviation A-1 (Canvas chart):** Compose has no Swift Charts analog — bars/axes/tooltip are drawn on the
  shared `BarLineChart` Canvas, matching the Activity/Lifestyle detail chart look. x-axis labels thinned via
  the shared `axisLabels`.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-09 | Initial Android port (steps-tracking) — the **daily-steps** drill-down, cloned from `LifestyleTimelineDetailScreen`: single teal (`#14b8a6`) `steps` bar series on one "steps" axis, daily-average-steps header, the shared `BarLineChart` `tooltip:` TooltipData renderer ("Steps: %,d" — mandatory), W/M/Y/P period selector + `loadHealthTimeline(period, memberId)` reload. New `Routes.LIFESTYLE_STEPS_TIMELINE` + `AppScaffold.kt` composable (amendment A-2 — `RootScreen.kt` untouched). Reuses `loadHealthTimeline` (the `steps` field is additive, analytics 0.2.0 D-C5, per-member-day group semantics per amendment A-4). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
