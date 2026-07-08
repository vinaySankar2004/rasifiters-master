# Screen: `member-history-detail` (android) — the per-member Workout History drill-down

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
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
  that re-fetches on each change (`loadMemberHistory(memberId, period.key)`, keyed by `LaunchedEffect(period.key,
  memberId)`); a **daily-average header** ("DAILY AVERAGE" + range label + rounded whole-number average, on one
  baseline); and the workouts **bars** chart. Loading → spinner; empty → "No data for this range yet." (load
  errors swallowed → empty state, iOS F1).
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

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Per-member W/M/Y/P workout timeline — single-series bars (no active-members line), daily-average header, "This Week" friendly override. Reads scoped `focusedMemberId`; Canvas `BarLineChart`. Faithful to the member branch of the activity-timeline detail (iOS F1 swallow). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
