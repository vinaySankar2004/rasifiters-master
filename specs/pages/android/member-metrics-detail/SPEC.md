# Screen: `member-metrics-detail` (android) — the Member Performance Metrics table

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.2 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios member-metrics-detail`](../../ios/member-metrics-detail/SPEC.md)
> + [`web members/metrics`](../../web/members/metrics/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_METRICS` (`MemberMetricsDetailScreen`), pushed from the
> Members tab's `MemberMetricsPreviewCard` (`onNavigate(Routes.MEMBER_METRICS)`).
> **Consumes:** `ProgramContext.loadMemberMetrics(search, sort, direction, filterParams)` (`GET /member-metrics`);
> ~~reads `memberMetrics` + `memberMetricsRange`~~ keeps the returned page itself (`publish = false`, 0.2.2). Read-only — no write, no lock.
> **Files:** `ui/members/MemberMetricsDetailScreen.kt` + `MemberCards.kt` (`MemberMetricsCard`, `MetricSortField`/`SortDir`)
> + `MemberDetailShared.kt` (`DetailTopBarWithExport`, `shareCsv`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** a **searchable, server-sorted, server-filtered** scroll of `MemberMetricsCard`s +
  a **CSV export** button. Every control change re-fetches (server-driven, iOS F1) — the single
  ~~`LaunchedEffect(committedSearch, sortField, sortDir, filters, program?.id)`~~ `rememberLoad` keyed by the same
  five inputs (0.2.2, D-REL1) re-runs `loadMemberMetrics`.
  Empty → "No members to display." + "Adjust filters or try a different search."; loading (first fetch) → 3
  skeleton cards.
- **No on-screen role gate (F2):** the screen shows the same to every enrolled role — the backend
  `ensureProgramAccess` is the real boundary. No client gate.
- **Search = IME-commit re-fetch:** typing updates `search`, but the fetch keys on `committedSearch`, set on the
  keyboard **Search** action (`ImeAction.Search`); clearing the field (empty or the ✕) resets `committedSearch`
  immediately. Matches the iOS submit-to-search behavior (not keystroke-per-fetch).
- **Sort sheet:** a `ModalBottomSheet` — the **9 `MetricSortField`** (Workouts · Total/Avg Duration · Avg Sleep ·
  Active Days · Workout Types · Current/Longest Streak · Avg Diet Quality) with a ✓ on the current field, and a
  **Descending/Ascending `Segmented`** for direction.
- **Filter sheet:** All/Custom date `Segmented` (Custom reveals Start/End `DatePillField`s, no future) + **min/max
  range rows per metric** (Current/Longest Streak are min-only, matching the DTO); **"Clear all"** resets to
  `MetricsFilters()`, **"Done"** applies. `toParams()` emits only non-blank fields as query params.
- **Hero value is sort-coupled:** each `MemberMetricsCard`'s hero number + label reflects the active `sortField`
  (`heroValue`) — the metric you sorted by is the one shown large. Default sortField = ACTIVE_DAYS (D-C7 0.4.0;
  was WORKOUTS; MetricSortField entry order unchanged).
- **Deviation A-1 (CSV via FileProvider share):** the iOS ShareSheet CSV export is realized as `shareCsv` — write
  to `cacheDir/exports/<name>.csv`, then an `ACTION_SEND` chooser via a `FileProvider` content URI. Filename
  `MemberPerformanceMetrics_<program>_<start>_to_<end>.csv` from ~~`memberMetricsRange`~~ the page's own `dateRange`
  (0.2.2); export disabled when empty;
  failures swallowed (a convenience, not a data path).
- **Deviation A-2 (flat Material chrome):** iOS's glass cards/segments → flat `SummaryCard` + rounded Material
  surfaces; the top bar is `DetailTopBarWithExport` (circle back + centered title + trailing share circle).

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `loadMemberMetrics(search, sort, direction, filterParams, publish = false)` | `GET /member-metrics?programId&search&sort&direction&…ranges` | ~~`memberMetrics` (table) · `memberMetricsTotal` · `memberMetricsRange` (CSV filename)~~ returns this screen's page — `members` (table) · `dateRange` (CSV filename); the tab's flows are untouched (0.2.2) |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the current rows as CSV |

Re-runs on every committed search / sort field / direction / filter / program change. Bearer-authed by the OkHttp layer.

## Phase 4 polish (0.2.2)

- **D-REL1 (#29 #34 #36; frontend-kit D-KIT-21, D-KIT-22, D-KIT-23; member-analytics D-C13).** **#29:** `KitLoad` —
  3 skeleton cards while loading, the offline `ErrorView` with no data offline, `ErrorView` + Retry on failure (never
  "No members to display."), the "Couldn't refresh · Retry" banner with 84 dp list clearance on a failed refresh,
  reload on reconnect. **#34:** one load per (committed search, sort, direction, filters, program), kept by this screen
  (`publish = false`; a result for an older key is dropped) — the Members-tab preview never re-sorts under it, and the
  CSV (rows + filename range) is exactly the page on screen. **#36:** the search ✕ is a labelled (`Clear search`) 48 dp
  target; the sort / filter sheets' `Segmented` choices announce selected state at 48 dp; the back button is labelled
  `Back` (its `DetailTopBarWithExport` row is unchanged at 44 dp).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #29 `KitLoad` (skeletons, ErrorView + Retry, stale banner with list clearance, reconnect reload); #34 the screen keeps its own keyed page (`publish = false`; tab preview untouched; CSV = the page on screen); #36 48 dp "Clear search" + segmented choices with selected state. |
| 0.2.1 | 2026-10-13 | Phase 4 quick wins: the CSV export follows the shared column contract (units in the headers, unified filename — member-analytics D-C9, #47). |
| 0.2.0 | 2026-07-15 | member-analytics 0.4.0 D-C7 — default sort = Active Days (initial state ACTIVE_DAYS; sort-sheet order + CSV unchanged). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Search (IME-commit) + Sort sheet (9 fields + asc/desc) + Filter sheet (All/Custom date + per-metric min/max) → server-driven re-fetch; sort-coupled hero; CSV via FileProvider share. No on-screen role gate (F2). Faithful to iOS/web; deviations A-1 (FileProvider CSV) + A-2 (flat chrome). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
