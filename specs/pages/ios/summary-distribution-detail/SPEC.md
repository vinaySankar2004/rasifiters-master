# Screen: `summary-distribution-detail` (ios) — the Workout Distribution by Day drill-down

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `AdminSummaryTab`'s distribution card
> (`AdminSummaryTab.swift:260-270`, `NavigationLink { DistributionByDayDetailView(points:) }`).
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Home/Detail/WorkoutDistributionViews.swift`
> (`DistributionByDayDetailView`, lines 271-372).
> **Web parity reference:** [`web summary/distribution`](../../web/summary/distribution/SPEC.md) — same 7-weekday
> bars, all-time, program-wide; iOS is **richer** (native tap-callout).
> **Consumes:** `ProgramContext.distributionByDayCounts` (already loaded by `AdminSummaryTab`;
> `GET /analytics/distribution/day`). No write.
> **Stance:** faithful 1:1 port (kept iOS-native, D-REF) **+ D-C1 (all-zero empty-state guard) + D-C3
> (tokenize chart color)**. Oddities §10.

---

## 1. What it is + who uses it

The **distribution-by-day drill-down** — a full-screen interactive Swift Charts view of workouts bucketed by
day of week (Sun→Sat, 7 orange bars) with a **tap-callout**. Program-wide, all-time; no period, no member
scope, no role logic (every role sees the same — matches web `/summary/distribution`). Used by all roles.

## 2. Why it exists

The Summary distribution card is a non-interactive preview; tapping it opens this scrubbable full-size chart.
Read-only analytics — no logging, no lock.

## 3. Route / location

- **App:** `ios`. **Reached via:** `AdminSummaryTab` distribution card →
  `DistributionByDayDetailView(points: distributionPoints(fromCounts: programContext.distributionByDayCounts))`.
- **Leaves to:** back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Title + subtitle | "Workout Distribution by Day" / "Workouts". | legacy `:281-285` |
| Empty state (NEW, D-C1) | "No workouts logged yet." when all 7 counts are 0. | new (run 61) |
| Chart | `ScrollableBarChart` → 7 weekday `BarMark`s (`appOrangeStrong`); X-axis = short day labels; Y auto to `yMax*1.1`. | legacy `:287-338` |
| Tap-callout | `DistributionChartOverlay` drag → `selected` → `CalloutView` positioned via `clamp` over the tapped bar. | legacy `:339-363` |

## 5. Components + features consumed

- **Components:** `DistributionPoint` / `distributionPoints` / `DistributionChartOverlay` / `ScrollableBarChart`
  (all `SummaryChartCards.swift`, run 54 — reused, NOT redefined; legacy's `ChartOverlay` is
  `DistributionChartOverlay` in the rebuild). `CalloutView` + `clamp` from the new `ChartDetailComponents.swift`.
- **Features:** none as a module — reads `ProgramContext.distributionByDayCounts` (loaded by the Summary tab).

## 6. Data / API

- **`GET /analytics/distribution/day?programId=`** (`ProgramContext.loadDistributionByDay`, called by
  `AdminSummaryTab`) — **always returns all 7 weekday keys** (0 when none); `distributionPoints` maps to the
  canonical Sun→Sat `[DistributionPoint]`. All-time (no date filter). Read-only; `admin_only_data_entry` N/A.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin / logger / member | **Same** program-wide, all-time distribution (no role-conditional UI, no member scope — matches web F2). |

**`admin_only_data_entry` = N/A** — read-only analytics (read-vs-write axis).

## 8. States & edge cases

- **Empty (D-C1):** all 7 counts 0 → "No workouts logged yet." (keyed off the **sum**, not `points.isEmpty`,
  since the endpoint always returns 7 keys — the run-34 predicate re-derive against the response shape).
- **Populated:** interactive bars + drag callout.
- **No loading/error state in-view** — the data is pre-loaded by the Summary tab; this view only renders the
  passed `points` (matches web, which shows no error banner — web F).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Keep iOS-native.** Richer than web (native tap-callout + scrollable chart) — kept as a platform idiom (run-52/53), not simplified toward web's flat recharts. `consumed_by=[ios]`. | legacy file; web SPEC; run-52/53; user answer. |
| **D-SCOPE** | **Chart drill-down cluster** with [`summary-activity-detail`](../summary-activity-detail/SPEC.md) + [`summary-workout-types-detail`](../summary-workout-types-detail/SPEC.md). Leaf view; stub removed. | run-58/59/60. |
| **D-S1** | **Faithful 1:1** + D-C1/D-C3. | legacy file; user answer. |
| **D-C1** | **All-zero empty-state guard** the legacy detail view LACKED — keyed off the **sum** of the 7 counts (not `points.isEmpty`; the endpoint always returns 7 keys). Matches web's D-C1 + the rebuilt `DistributionByDayCard` + `WorkoutTypesDetailView`. | web distribution D-C1; legacy (no guard); run-34; user answer. |
| **D-C3** | **Tokenize chart color** — `.orange.opacity(0.9)` → `Color.appOrangeStrong`, callout dot `.orange` → `Color.appOrange` (`light:`-identical; run-26 shape). | `AppTheme.swift:55/64`; user answer. |
| **D-DEPS** | **Reuses run-54 chart helpers** (`DistributionPoint`/`distributionPoints`/`DistributionChartOverlay`/`ScrollableBarChart`); the only new deps (`CalloutView`/`clamp`) land in the shared `ChartDetailComponents.swift` (see [`summary-activity-detail`](../summary-activity-detail/SPEC.md) D-DEPS). | foundation grep; run-54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **No per-program read authz** on `GET /analytics/distribution/day` (`authenticateToken`-only, web F1). | backend route | Kept (faithful); backend concern. |
| **F2** | **Hardcoded weekday labels** (Sun…Sat) mapping the server's full-name keys; server already buckets in UTC (web F5). | `SummaryChartCards.swift` `distributionPoints` | Kept (faithful). |
| **F3** | **All-time window** (no date filter) — accumulates since program start (web F4). | backend service | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 61) — the Summary **distribution-by-day drill-down**, ported into `apps/ios/.../Features/Home/Detail/DistributionByDayDetailView.swift`; deferred stub removed. **D-REF** (keep iOS-native — richer than web; `consumed_by=[ios]`) · **D-SCOPE** (chart drill-down cluster) · **D-S1** (faithful 1:1) · **D-C1** (all-zero empty-state guard keyed off the sum — legacy lacked it; matches web + siblings) · **D-C3** (tokenize chart color) · **D-DEPS** (reuses run-54 helpers; `CalloutView`/`clamp` in shared `ChartDetailComponents.swift`). Flagged F1–F3. Read-only → `admin_only_data_entry` N/A. Build green-check owned by the user (Xcode); symbols grep-verified. |
