# Screen: `lifestyle-timeline` (android) — the Sleep · Diet-quality drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.1 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = [`ios lifestyle-timeline`](../../ios/lifestyle-timeline/SPEC.md) +
> [`web lifestyle/timeline`](../../web/lifestyle/timeline/SPEC.md) — this file records only the Android
> realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.LIFESTYLE_TIMELINE` (`LifestyleTimelineDetailScreen`),
> pushed from the Lifestyle-tab timeline preview card.
> **Consumes:** `ProgramContext.loadHealthTimeline(period, memberId)` → `GET /analytics/health/timeline`. Read-only.
> **Files:** `ui/lifestyle/LifestyleTimelineDetailScreen.kt`; chart = `ui/summary/ChartPrimitives.kt` `SleepDietChart`.

## Parity + Android-idiom deviations

- **Faithful (iOS 1:1):** back button + title **"Lifestyle Timeline" / "Sleep · Diet quality"**; a **W/M/Y/P**
  segmented period selector (re-fetches per change); a **daily-average header** — "DAILY AVERAGE" + the range
  label (right), then **Sleep `%.1f hrs`** (blue) and **Diet `%.1f / 5`** (green) stat columns; the chart —
  blue **sleep-hours bars** + a green **diet-quality line + points**; a bottom **legend** (Sleep / Diet). Range
  label = "This Week" (week) else the server `label` ("Jul 2026" / "2026" / "Jul 2026 – Nov 2026").
- **Member scope:** admins → the Lifestyle "View as" pick (`ProgramContext.lifestyleViewAsId`, `null` =
  program-wide); everyone else → self (`loggedInMemberId`). Read once at composition (the pick is already set
  by the tab), the iOS `memberId:` init-param analog.
- **D-C1 (dual Y-axis, iOS-matched):** the diet 0–5 series is scaled onto the sleep-hours domain so it isn't
  flattened under the bars — sleep on the **leading "hrs"** axis, diet on a **trailing "/5"** axis
  (`SleepDietChart(dualAxis=true)`). The preview card uses `dualAxis=false` (shared axis, no trailing labels).
- **Tooltip (mandatory — memory `chart-tooltips-mandatory` / `android-shared-chart-tooltip`):** tap/drag →
  the **one shared** `drawTooltip` look (bold "MMM d" title + color-dotted **"Sleep: X.X hrs"** / **"Diet:
  Y.Y / 5"** rows + caret + shadow), reused from `ChartPrimitives`. The iOS `HealthCalloutView` analog.
- **Deviation A-1 (Canvas chart):** Swift Charts has no Compose analog — bars/line/axes/tooltip are drawn on
  the shared `SleepDietChart` Canvas (nice-tick left axis + faint horizontal gridlines + `TextMeasurer`
  labels + Catmull-Rom-smoothed line), matching the Activity-detail chart look. x-axis labels thinned via the
  shared `axisLabels` (week = all; month = 1/8/15/22/29; year = J F M…; program = strided).
- **D-C2 note:** the iOS web-parity error banner is folded into the standard empty/loading states here ~~(a
  timeline load failure → "No data for this range yet.")~~, consistent with the Android Activity detail. *(0.1.1,
  D-REL1: a timeline load failure → `ErrorView` + Retry.)*

## Phase 4 polish (0.1.1)

- **D-REL1 (#26 #29 #34 #36; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23).** **#26 (Android-only):** the screen scrolls
  vertically and the chart scrubs on a horizontal drag only (shared `SleepDietChart`) — a vertical drag over the chart
  scrolls the page; a tap still selects. **#29:** `rememberLoad` + `KitLoad` — spinner, the offline `ErrorView` with no
  data offline, `ErrorView` + Retry on failure, reload on reconnect. **#34:** one load per (period, member); a period
  switch starts from Loading, so the old period never sits under the new label; the Sleep / Diet averages read "—"
  until loaded. **#36:** the back button is a labelled (`Back`) 48 dp target; the W/M/Y/P segments are 48 dp with
  spoken names (`Week` / `Month` / `Year` / `Program`) and selected state.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #26 page scrolls, chart scrubs horizontally only; #29 `KitLoad` (ErrorView + Retry, offline ErrorView, reconnect reload) instead of the empty state on failure; #34 keyed per (period, member), "—" averages until loaded; #36 labelled 48 dp back + period segments. |
