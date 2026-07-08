# Screen: `member-metrics-detail` (android) — the Member Performance Metrics table

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios member-metrics-detail`](../../ios/member-metrics-detail/SPEC.md)
> + [`web members/metrics`](../../web/members/metrics/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_METRICS` (`MemberMetricsDetailScreen`), pushed from the
> Members tab's `MemberMetricsPreviewCard` (`onNavigate(Routes.MEMBER_METRICS)`).
> **Consumes:** `ProgramContext.loadMemberMetrics(search, sort, direction, filterParams)` (`GET /member-metrics`);
> reads `memberMetrics` + `memberMetricsRange`. Read-only — no write, no lock.
> **Files:** `ui/members/MemberMetricsDetailScreen.kt` + `MemberCards.kt` (`MemberMetricsCard`, `MetricSortField`/`SortDir`)
> + `MemberDetailShared.kt` (`DetailTopBarWithExport`, `shareCsv`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** a **searchable, server-sorted, server-filtered** scroll of `MemberMetricsCard`s +
  a **CSV export** button. Every control change re-fetches (server-driven, iOS F1) — the single
  `LaunchedEffect(committedSearch, sortField, sortDir, filters, program?.id)` re-runs `loadMemberMetrics`.
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
  (`heroValue`) — the metric you sorted by is the one shown large.
- **Deviation A-1 (CSV via FileProvider share):** the iOS ShareSheet CSV export is realized as `shareCsv` — write
  to `cacheDir/exports/<name>.csv`, then an `ACTION_SEND` chooser via a `FileProvider` content URI. Filename
  `MemberPerformanceMetrics_<program>_<start>_to_<end>.csv` from `memberMetricsRange`; export disabled when empty;
  failures swallowed (a convenience, not a data path).
- **Deviation A-2 (flat Material chrome):** iOS's glass cards/segments → flat `SummaryCard` + rounded Material
  surfaces; the top bar is `DetailTopBarWithExport` (circle back + centered title + trailing share circle).

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| `loadMemberMetrics(search, sort, direction, filterParams)` | `GET /member-metrics?programId&search&sort&direction&…ranges` | `memberMetrics` (table) · `memberMetricsTotal` · `memberMetricsRange` (CSV filename) |
| `shareCsv(...)` | (local) `ACTION_SEND` FileProvider share | exports the current rows as CSV |

Re-runs on every committed search / sort field / direction / filter / program change. Bearer-authed by the OkHttp layer.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Search (IME-commit) + Sort sheet (9 fields + asc/desc) + Filter sheet (All/Custom date + per-metric min/max) → server-driven re-fetch; sort-coupled hero; CSV via FileProvider share. No on-screen role gate (F2). Faithful to iOS/web; deviations A-1 (FileProvider CSV) + A-2 (flat chrome). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
