# Screen: `summary-activity-detail` (android) — the Workout Activity Timeline drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios summary-activity-detail`](../../ios/summary-activity-detail/SPEC.md)
> + [`web summary/activity`](../../web/summary/activity/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY_ACTIVITY` (`ActivityDetailScreen`), pushed from the
> Summary tab's activity-timeline card (`onNavigate(Routes.SUMMARY_ACTIVITY)`).
> **Consumes:** [`analytics`](../../../features/analytics/SPEC.md) `GET /analytics/timeline?period&programId` via
> `ProgramContext.loadActivityTimeline(period)`. Read-only — no write, no lock.
> **Files:** `ui/summary/ActivityDetailScreen.kt` + the shared `ui/summary/ChartPrimitives.kt` (`BarLineChart`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** title **"Workout Activity Timeline" / "Workouts · Active members"**; a **W/M/Y/P
  period selector** that re-fetches the timeline on each change (`week`/`month`/`year`/`program`); a
  **daily-average header** ("DAILY AVERAGE" + the range label + the rounded average); and the workouts **bars**
  + active-members **line** chart. Read-only analytics → **`admin_only_data_entry` N/A**; every role sees the
  same program-wide timeline. Loading → spinner; empty buckets → "No data for this range yet." (load errors are
  swallowed → empty state, matching iOS F1 / web).
- **Range label = iOS parity:** `week` → **"This Week"** (friendly override); `month`/`year`/`program` use the
  **server's `label`** ("Jul 2026" / "2026" / "Jun 2026 – Sep 2026"). The "DAILY AVERAGE" caption + range sit on
  one **baseline** (`Modifier.alignByBaseline()`); the average is shown as a **whole number** (iOS `HeaderStats`).
- **Deviation A-1 (chart on Canvas):** Swift Charts has no Compose analog, so the chart is drawn on a `Canvas`
  (shared `BarLineChart`) — thin rounded orange bars, a left **y-axis** (`niceAxis` ticks + faint gridlines),
  a **Catmull-Rom-smoothed** purple active-members line with white-haloed points.
- **Deviation A-2 (iOS-style x-axis label thinning):** dense windows would overlap, so `axisLabels(period)`
  thins like iOS — **W** all 7 weekdays · **M** only days 1/8/15/22/29 · **Y** single month letters
  `J F M A M J J A S O N D` · **P** the months (strided if it ever overflows).
- **Deviation A-3 (tap/drag tooltip):** the iOS drag-callout is realized as a **tap-or-drag tooltip** — a
  floating card (bold title = the bucket date "MMM d", color-dotted value rows "N workouts" / "M active", a
  caret at the datapoint, a soft drop shadow) drawn by the **shared** `BarLineChart` tooltip renderer (one look
  across every chart); tapping the same bar dismisses it. Selected point gets a highlight ring.

## Data / API

| Call | Endpoint | Sets |
|------|----------|------|
| `ProgramContext.loadActivityTimeline(period)` | `GET /analytics/timeline?period&programId` | `buckets` (bars + line) · `daily_average` (header) · `label` (range) |

Re-runs on every period change (`LaunchedEffect(period.key)`). Bearer-authed by the OkHttp layer.

## Deferred / not ported

Member-scoped entry (iOS `MemberHistoryCard` → member history) is **N/A here** — this route is always
program-wide from the Summary tab; the Members-tab history entry lands with the Members port (later phase).
