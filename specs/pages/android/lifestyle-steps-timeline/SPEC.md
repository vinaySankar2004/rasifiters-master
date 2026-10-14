# Screen: `lifestyle-steps-timeline` (android) — the daily-steps drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.1 · **App:** `android` (Compose)
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

## Phase 4 polish (0.1.1)

- **D-REL1 (#26 #29 #34 #36; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23).** **#26 (Android-only):** the screen scrolls
  vertically and the chart scrubs on a horizontal drag only (shared `BarLineChart`) — a vertical drag over the chart
  scrolls the page; a tap still selects. **#29:** `rememberLoad` + `KitLoad` — spinner, the offline `ErrorView` with no
  data offline, `ErrorView` + Retry on failure (it used to fall to the empty state), reload on reconnect. **#34:** one
  load per (period, member); a period switch starts from Loading, so the old period never sits under the new label; the
  Steps average reads "—" until loaded. **#36:** the back button is a labelled (`Back`) 48 dp target; the W/M/Y/P
  segments are 48 dp with spoken names (`Week` / `Month` / `Year` / `Program`) and selected state.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #26 page scrolls, chart scrubs horizontally only; #29 `KitLoad` (ErrorView + Retry, offline ErrorView, reconnect reload); #34 keyed per (period, member), "—" average until loaded; #36 labelled 48 dp back + period segments. |
| 0.1.0 | 2026-07-09 | Initial Android port (steps-tracking) — the **daily-steps** drill-down, cloned from `LifestyleTimelineDetailScreen`: single teal (`#14b8a6`) `steps` bar series on one "steps" axis, daily-average-steps header, the shared `BarLineChart` `tooltip:` TooltipData renderer ("Steps: %,d" — mandatory), W/M/Y/P period selector + `loadHealthTimeline(period, memberId)` reload. New `Routes.LIFESTYLE_STEPS_TIMELINE` + `AppScaffold.kt` composable (amendment A-2 — `RootScreen.kt` untouched). Reuses `loadHealthTimeline` (the `steps` field is additive, analytics 0.2.0 D-C5, per-member-day group semantics per amendment A-4). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
