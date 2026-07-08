# Screen: `lifestyle-timeline` (android) — the Sleep · Diet-quality drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
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
- **D-C2 note:** the iOS web-parity error banner is folded into the standard empty/loading states here (a
  timeline load failure → "No data for this range yet."), consistent with the Android Activity detail.
