# Screen: `summary` (android) — the per-program workspace overview (first bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.2 · **App:** `android` (Compose)
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
- **D-C1 (web-parity) — SUPERSEDED by D-C3 (0.2.0):** the inline error banner is gone; a load failure is the
  frontend kit's `ErrorView` (no data) or its floating stale banner (with data).
- **D-C2 (web-parity, kept):** the **`admin_only_data_entry` data-lock** treatment — a 🔒 banner (verbatim
  web `DATA_LOCK_MESSAGE`) + the two action cards **dimmed + non-navigating** when `dataEntryLocked`
  (`admin_only_data_entry` on AND viewer not global/program admin). Client display gate only; the backend
  `requireDataEntryAllowed` 403 (reached by the deferred log forms) is the real boundary.
- **D-C3 (frontend kit + instant opens, 0.2.0):** on a program change this member's **cached Summary** for that
  program shows first (`core/LaunchCache`; never another program's values); the **7 reads run in parallel**. With no
  data yet the analytics area is a **spinner, never zero cards** (while offline — polish-1's link + proven-offline
  monitor — the kit's **offline** `ErrorView` + Retry instead, never a spinner); a first load that fails entirely →
  `ErrorView` + Retry. A **partial** failure keeps the parts that loaded (the failed parts keep this program's previous values; with no
  previous value a failed card shows its title + **"—"**, never a fake zero or an empty chart) and shows the floating
  **"Couldn't refresh"** banner + Retry (A13); a response that lands after a sign-out / program switch is dropped; a fully failed reload with data → the same stale
  banner. While it shows, the content gains 84 dp of bottom space. Offline is the app-wide banner above the nav bar
  (`AppScaffold`, A6) — the tab content gives up its height while it shows. **Pull to refresh** reloads at once,
  runs a `pull_to_refresh` health sync on the app scope, and reloads again if the sync applied anything (A13). The
  cache is written only after a full success, only while signed in, and cleared by sign-out.
- **D-PC1 (0.2.2, touch-up (c)):** the header initials circle opens [`my-profile`](../my-profile/SPEC.md)
  (`Modifier.tapTarget(label = "My Profile", shape = CircleShape)` first in the chain; 52 dp, so the look is unchanged →
  `Routes.PROGRAM_PROFILE`). System back pops to Summary with its scroll and the active program intact. Parity: web
  `/summary`, iOS `SummaryHeader`.
- **Deviation A-1 (no card drag-reorder):** the dashboard is a **fixed vertical layout** — iOS's per-program
  `UserDefaults` card drag-reorder (iOS F1) is an iOS-only legacy nicety **web lacks**, so it is not ported.
  Layout order = iOS `defaultOrder`: progress → add-workouts → log-health → (MTD | total-workouts) →
  (total-duration | avg-duration) → timeline → distribution → workout-types.
- ~~**Deviation A-2 (header avatar = signed-in user):** the initials avatar shows the **logged-in user's**
  initials (`ProgramContext.memberName`), matching **web** ("the user's initials avatar"), not iOS's program
  admin initials — resolves the cross-app divergence toward web parity (memory `ios-matches-web-not-just-legacy`).~~
  *(No longer a deviation at 0.2.2 — iOS shows the signed-in user's initials too, `loggedInUserInitials`; D-PC1.)*
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

Fires on entry, on active-program change and after a log-form save. Seven reads **in parallel**, each its own
result, merged into `ProgramContext.summaryState` (kit `UiState<SummaryData>`; `summary` mirrors its data for the
detail screens). Program progress needs **no** call (read from the `ProgramDTO`).

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
| 0.2.2 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle opens `MyProfileScreen` (`tapTarget` "My Profile", same look); system back returns to Summary. A-2 is no longer a deviation (iOS matches). |
| 0.2.1 | 2026-10-13 | **Polish 1 (offline detection).** No data while offline (link down OR proven offline by a failed request) → the kit's offline `ErrorView` + Retry, never the spinner (rule 6); back online, a failed / stale Summary reloads itself (D-KIT-13). Compile-checked green (`assembleDebug`). |
| 0.2.0 | 2026-10-13 | **Reliability Phase 3 C3 — D-C3.** Cached Summary first, 7 parallel reads with partial-failure merge, spinner (never zero cards), `ErrorView`, floating stale banner (offline = the app-wide banner), pull to refresh with a `pull_to_refresh` health sync. D-C1 superseded. Compile-checked green (`assembleDebug`). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase D — the Summary **dashboard landing**). `ui/summary/{SummaryScreen,SummaryCards,SummaryCharts}.kt`; `ProgramContext` gains `summary`/`summaryLoading`/`summaryError` + `dataEntryLocked` + `loadSummary()`; `net` gains 7 analytics DTOs + `SummaryData` + 7 GET endpoints; theme gains `AppOrangeGradientEnd`/`AppBlue`/`AppPurple`/`AppRed` + `ChartPalette` + `workoutTypePaletteColor`. Faithful to iOS/web incl. D-C1 error banner + D-C2 data-lock; deviations A-1..A-4 (no card reorder, signed-in-user avatar, ProgramDTO progress source, Canvas charts). The 5 forward targets stubbed per D-SCOPE. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
