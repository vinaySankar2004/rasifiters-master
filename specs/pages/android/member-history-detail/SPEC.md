# Screen: `member-history-detail` (android) — the per-member Workout History drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.2 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in the **member branch** of
> [`ios summary-activity-detail`](../../ios/summary-activity-detail/SPEC.md) (per-member, single-series) —
> this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_HISTORY` (`MemberHistoryDetailScreen`), pushed from
> the Members tab's `MemberHistoryCard` (after `focusMember(id, name)`).
> **Consumes:** `ProgramContext.loadMemberHistory(memberId, period)` (`GET /member-history`); reads the scoped
> `focusedMemberId`. Read-only — no write, no lock.
> **Files:** `ui/members/MemberSimpleDetails.kt` (`MemberHistoryDetailScreen`) + the shared
> `ui/summary/ChartPrimitives.kt` (`BarLineChart`, `axisLabels`) + `DetailChrome.kt` (`DetailTopBar`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** title **"Workout Activity Timeline" / "Workouts"**; a **W/M/Y/P period selector**
  that re-fetches on each change (`loadMemberHistory(memberId, period.key)`, keyed by ~~`LaunchedEffect(period.key,
  memberId)`~~ `rememberLoad(period.key to memberId)`, 0.1.1); a **daily-average header** ("DAILY AVERAGE" + range
  label + the average — ~~rounded whole-number~~ to one decimal since 0.1.2 (D-PS1) — on one baseline); and the workouts **bars** chart. Loading → spinner; empty →
  "No data for this range yet." ~~(load errors swallowed → empty state, iOS F1).~~ *(Superseded at 0.1.1 by D-REL1:
  a failed load → `ErrorView` + Retry.)*
- **Range label = iOS parity:** `week` → **"This Week"** (friendly override); `month`/`year`/`program` use the
  **server's `label`**, falling back to the period's own range string.
- **Deviation A-1 (single series, no line):** unlike the program-wide `summary-activity-detail` — which overlays an
  active-members line — the per-member history is **workouts-only** (`lineValues = null` on `BarLineChart`); there
  is no active-members concept for a single member. Bars + line color both `AppOrange`.
- **Deviation A-2 (scoped via `focusedMemberId`):** the route is static, so the screen reads the member id from
  `ProgramContext.focusedMemberId` (stashed by the tab before push), not from nav args.
- **Deviation A-3 (chart on Canvas):** Swift Charts has no Compose analog, so the chart is the shared `BarLineChart`
  Canvas renderer (thin rounded orange bars, left y-axis with `niceAxis` ticks + faint gridlines, iOS-style
  x-axis label thinning via `axisLabels(labels, period)`).

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `loadMemberHistory(memberId, period)` | `GET /member-history?programId&memberId&period` | `buckets` (bars) · `dailyAverage` (header) · `label` (range) |

Re-runs on every period change and on `focusedMemberId` change. Bearer-authed by the OkHttp layer.

## Phase 4 polish (0.1.1)

- **D-REL1 (#26 #29 #34 #36; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23; member-analytics D-C13).** **#26
  (Android-only):** the screen scrolls vertically and the chart scrubs on a horizontal drag only — a vertical drag over
  the chart scrolls the page; a tap still selects. **#29:** `rememberLoad` + `KitLoad` — spinner, the offline
  `ErrorView` with no data offline, `ErrorView` + Retry on failure, reload on reconnect. **#34:** one load per (period,
  member), kept by this screen (`loadMemberHistory(…, publish = false)`) — it never writes the Members-tab card, so the
  reset-to-week on leave (`resetMemberHistoryToWeek`) is gone; a period switch starts from Loading (never the old
  period's bars under the new label); the daily average reads "—" until loaded. **#36:** the top bar is 48 dp with a
  labelled (`Back`) 48 dp back target; the private `HistoryPeriodSelector` gives way to the shared `PeriodSelector`
  (48 dp segments, spoken `Week` / `Month` / `Year` / `Program`, selected state).

## Parity sweep (0.1.2)

- **D-PS1 (2026-10-14 — METHODOLOGY R9; sweep A4):** the DAILY AVERAGE value is the server's `daily_average` to one
  decimal (`String.format(Locale.US, "%.1f", …)`; was `roundToInt()`), as the iOS member variant (`HeaderStats`) and
  web. (`ui/members/MemberSimpleDetails.kt` `MemberHistoryDetailScreen`.)

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.2 | 2026-10-14 | **D-PS1 — parity sweep A4 (Android `8144345`).** DAILY AVERAGE shows one decimal (was a whole number), as iOS + web. |
| 0.1.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #26 page scrolls, chart scrubs horizontally only; #29 `KitLoad` (ErrorView + Retry) instead of the swallowed error; #34 the detail keeps its own keyed result (`publish = false`, no reset-to-week on leave); #36 48 dp back + shared `PeriodSelector`. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Per-member W/M/Y/P workout timeline — single-series bars (no active-members line), daily-average header, "This Week" friendly override. Reads scoped `focusedMemberId`; Canvas `BarLineChart`. Faithful to the member branch of the activity-timeline detail (iOS F1 swallow). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
