# Screen: `summary` (android) — the per-program workspace overview (first bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios admin-summary`](../../ios/admin-summary/SPEC.md)
> + [`web summary`](../../web/summary/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY` (`SummaryScreen`) — Tab 1 of the per-program
> tab shell, the screen you land on after picking a program on the hub.
> **Consumes:** [`analytics`](../../../features/analytics/SPEC.md) + [`analytics-v2`](../../../features/analytics-v2/SPEC.md)
> (7 reads) via `ProgramContext`; program-progress from the already-loaded `ProgramDTO`.
> **Files:** `ui/summary/{SummaryScreen,SummaryCards,SummaryCharts}.kt`.
> **Scope (mirrors iOS run-54 D-SCOPE):** the **dashboard landing ONLY**. The 5 forward targets
> (activity / distribution / workout-types detail + log-workout / log-health forms) are **stubbed**
> (`StubScreen` routes) this phase — they are separate later screens (the iOS runs 60–61 analogue).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** header **"Summary" + active-program name + an initials avatar**; a scrollable
  card dashboard — **Program Progress** (completion ring + %/days + status pill), **MTD Participation**
  (pct · active/total · change badge), **Total Workouts / Total Duration / Avg Duration** (value + change
  badge + "vs prior MTD"), **Workout Activity Timeline** (bars = workouts, line + points = active members),
  **Workout Distribution by Day** (7 Sun–Sat bars), **Top Workout Types** (top 5 + "Others" rollup, dot
  colors by name) — and the two gradient **action cards** (Add workouts / Log daily health). Shown
  identically to every enrolled role (no page-level role gate). Loading → MTD placeholder + "No data yet"
  charts + zeroed metrics; empty types → "No workouts logged yet."
- **D-C1 (web-parity, kept):** a visible **error banner** on a summary-load failure (legacy iOS swallowed it).
- **D-C2 (web-parity, kept):** the **`admin_only_data_entry` data-lock** treatment — a 🔒 banner (verbatim
  web `DATA_LOCK_MESSAGE`) + the two action cards **dimmed + non-navigating** when `dataEntryLocked`
  (`admin_only_data_entry` on AND viewer not global/program admin). Client display gate only; the backend
  `requireDataEntryAllowed` 403 (reached by the deferred log forms) is the real boundary.
- **Deviation A-1 (no card drag-reorder):** the dashboard is a **fixed vertical layout** — iOS's per-program
  `UserDefaults` card drag-reorder (iOS F1) is an iOS-only legacy nicety **web lacks**, so it is not ported.
  Layout order = iOS `defaultOrder`: progress → add-workouts → log-health → (MTD | total-workouts) →
  (total-duration | avg-duration) → timeline → distribution → workout-types.
- **Deviation A-2 (header avatar = signed-in user):** the initials avatar shows the **logged-in user's**
  initials (`ProgramContext.memberName`), matching **web** ("the user's initials avatar"), not iOS's program
  admin initials — resolves the cross-app divergence toward web parity (memory `ios-matches-web-not-just-legacy`).
- **Deviation A-3 (progress source):** the progress ring % comes from the loaded **`ProgramDTO.progress_percent`**
  (server value, same as the picker/web `program_progress`); elapsed/total days are computed client-side from
  `start_date`/`end_date` (the iOS date math). The vestigial `analytics/summary` over-fetch (iOS F2 / web F5 —
  feeds only the deferred detail views) is **skipped** — nothing on the landing reads it.
- **Deviation A-4 (charts on Canvas):** Swift Charts / Recharts have no Compose analog, so the charts are drawn
  on a `Canvas` — thin rounded orange bars, a left **y-axis** (nice ticks via a Swift-Charts-`automatic`-style
  `niceAxis` + faint gridlines), x-axis day labels (drawn with a `TextMeasurer`), and (timeline only) a
  **Catmull-Rom-smoothed** purple active-members line with points — matching the iOS Swift Charts look. The
  distribution chart is **non-interactive** on the landing (matches iOS `interactive: false`); the drag
  tooltip belongs to the deferred detail view. iOS's glassy `CardShell` blur → a flat Material rounded surface.
- **Shell chrome (AppScaffold):** the bottom `NavigationBar` is brand-colored — `containerColor = surface`,
  selected icon/label + a low-alpha orange indicator (kills the M3 baseline lavender/pink `secondaryContainer`
  tint) — and the tab icons are **iOS parity**: bar-chart · people · **leaf** (`Eco`) · **calendar**
  (`CalendarMonth`) for Summary / Members / Lifestyle / Program.

## Data / API (all via `ProgramContext.loadSummary()`, Bearer-authed by the OkHttp layer)

Fires on entry + on active-program change. Seven reads, refreshed together into `ProgramContext.summary`
(`SummaryData`); a failure sets `summaryError` (→ the banner). Program progress needs **no** call (read from
the `ProgramDTO`).

| Call | Endpoint | Card |
|------|----------|------|
| `getMtdParticipation` | `GET /analytics-v2/participation/mtd?programId` | MTD Participation |
| `getTotalWorkoutsMtd` | `GET /analytics/workouts/total?programId` | Total Workouts |
| `getTotalDurationMtd` | `GET /analytics/duration/total?programId` | Total Duration (min→hrs) |
| `getAvgDurationMtd` | `GET /analytics/duration/average?programId` | Avg Duration |
| `getActivityTimeline` | `GET /analytics/timeline?period=week&programId` | Activity Timeline (week-fixed, iOS F2 / web F4) |
| `getDistributionByDay` | `GET /analytics/distribution/day?programId` | Distribution by Day |
| `getWorkoutTypes` | `GET /analytics/workouts/types?programId&limit=100` | Top Workout Types (top 5 + Others) |

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase D — the Summary **dashboard landing**). `ui/summary/{SummaryScreen,SummaryCards,SummaryCharts}.kt`; `ProgramContext` gains `summary`/`summaryLoading`/`summaryError` + `dataEntryLocked` + `loadSummary()`; `net` gains 7 analytics DTOs + `SummaryData` + 7 GET endpoints; theme gains `AppOrangeGradientEnd`/`AppBlue`/`AppPurple`/`AppRed` + `ChartPalette` + `workoutTypePaletteColor`. Faithful to iOS/web incl. D-C1 error banner + D-C2 data-lock; deviations A-1..A-4 (no card reorder, signed-in-user avatar, ProgramDTO progress source, Canvas charts). The 5 forward targets stubbed per D-SCOPE. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
