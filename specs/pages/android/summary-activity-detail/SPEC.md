# Screen: `summary-activity-detail` (android) — the Workout Activity Timeline drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.2 · **App:** `android` (Compose)
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
  **daily-average header** ("DAILY AVERAGE" + the range label + the average to one decimal — D-PS1); and the workouts **bars**
  + active-members **line** chart. Read-only analytics → **`admin_only_data_entry` N/A**; every role sees the
  same program-wide timeline. Loading → spinner; empty buckets → "No data for this range yet." ~~(load errors are
  swallowed → empty state, matching iOS F1 / web).~~ *(Superseded at 0.1.1 by D-REL1: a failed load → `ErrorView` +
  Retry.)*
- **Range label = iOS parity:** `week` → **"This Week"** (friendly override); `month`/`year`/`program` use the
  **server's `label`** ("Jul 2026" / "2026" / "Jun 2026 – Sep 2026"). The "DAILY AVERAGE" caption + range sit on
  one **baseline** (`Modifier.alignByBaseline()`); ~~the average is shown as a **whole number** (iOS `HeaderStats`).~~
  *(superseded at 0.1.2 by D-PS1 — one decimal, as iOS `HeaderStats` and web now show.)*
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

Re-runs on every period change (~~`LaunchedEffect(period.key)`~~ `rememberLoad(period.key)` — 0.1.1). Bearer-authed by the OkHttp layer.

## Deferred / not ported

Member-scoped entry (iOS `MemberHistoryCard` → member history) is **N/A here** — this route is always
program-wide from the Summary tab; the Members-tab history entry lands with the Members port (later phase).

## Phase 4 polish (0.1.1)

- **D-REL1 (#26 #29 #34 #36; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23).** **#26 (Android-only):** the screen scrolls
  vertically and the chart scrubs on a horizontal drag only (`detectHorizontalDragGestures` in the shared
  `BarLineChart`) — a vertical drag over the chart scrolls the page; a tap still selects. **#29:** one `rememberLoad`
  per period + `KitLoad` — spinner, the offline `ErrorView` with no data offline, `ErrorView` + Retry on failure,
  reload on reconnect. **#34:** a period switch starts from Loading, so the old period's bars never sit under the new
  label; the daily average reads "—" until loaded. **#36:** the back button is a labelled (`Back`) 48 dp target; the
  W/M/Y/P segments are 48 dp with spoken names (`Week` / `Month` / `Year` / `Program`) and selected state.

## Parity sweep (0.1.2)

- **D-PS1 (2026-10-14 — METHODOLOGY R9; sweep A4):** `formatAverage` shows the server's `daily_average` to one decimal
  (`String.format(Locale.US, "%.1f", v)` — "0.4", "2.0"; was `roundToInt()`, so 0.4 read "0"). iOS `HeaderStats` moved
  to `"%.1f"` in the same sweep and web already showed one decimal. (`ui/summary/ActivityDetailScreen.kt`.)

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.2 | 2026-10-14 | **D-PS1 — parity sweep A4 (Android `8144345`).** DAILY AVERAGE shows one decimal (was a whole number), as iOS + web. |
| 0.1.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #26 page scrolls, chart scrubs horizontally only; #29 `KitLoad` (ErrorView + Retry, offline ErrorView, reconnect reload) instead of the swallowed error; #34 a period switch starts from Loading ("—" average); #36 labelled 48 dp back + period segments. |
