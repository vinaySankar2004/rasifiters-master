# Screen: `summary-activity-detail` (ios) — the Workout Activity Timeline drill-down

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.3 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `AdminSummaryTab`'s activity-timeline card
> (`AdminSummaryTab.swift:252-259`, `NavigationLink { ActivityTimelineDetailView(initialPeriod:) }`) **and**
> from the Members tab's `MemberHistoryCard` (`MemberCards.swift:28-34`, `memberId` + `showActiveSeries:false`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Helpers/AdminHomeHelpers.swift`
> (`ActivityTimelineDetailView`, lines 878-1131).
> **Web parity reference:** [`web summary/activity`](../../web/summary/activity/SPEC.md) — same daily-average
> header + workouts-over-time bars; iOS is **richer** (native tap-callout, period selector, member scope).
> **Consumes:** ~~`ProgramContext.loadActivityTimeline` / `loadMemberHistory`~~ `APIClient.fetchActivityTimeline` /
> `fetchMemberHistory` into the screen's own `LoadState` (0.1.2, D-REL1) (`GET /analytics/timeline` /
> member history). No write.
> **Stance:** faithful 1:1 port of the legacy iOS view (kept iOS-native, D-REF) **+ D-C2 (trim unused init
> providers) + D-C3 (tokenize chart colors)**. Oddities §10.

---

## 1. What it is + who uses it

The **activity-timeline drill-down** — a full-screen, interactive Swift Charts view of workouts over time
(orange bars) with an optional active-members line (purple), a **period selector** (W/M/Y/P), a daily-average
header, and a **tap-callout**. Program-wide from the Summary tab (every role sees the same); member-scoped
when reached from the Members tab's `MemberHistoryCard` (the iOS analogue of web `/members/history`). Used by
all roles; the member-scoped entry is gated upstream at the card (run 43).

## 2. Why it exists

The Summary activity card is a preview; tapping it opens this richer, period-switchable, scrubbable chart.
It re-fetches the timeline on each period change. It is **read-only** analytics — no logging, no lock.

## 3. Route / location

- **App:** `ios`. **Reached via:** (a) `AdminSummaryTab` activity card → `ActivityTimelineDetailView(initialPeriod:
  timelinePeriod)` (program-wide); (b) Members `MemberHistoryCard` → `ActivityTimelineDetailView(initialPeriod:
  .week, memberId:, showActiveSeries:false)` + `.navigationTitle("Workout History")` (member-scoped).
- **Leaves to:** back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Title + subtitle | "Workout Activity Timeline" / "Workouts · Active members" (or "Workouts" when `showActiveSeries:false`). | legacy `:946-952` |
| Period selector | Segmented `Picker` over `AdminHomeView.Period.allCases` (W/M/Y/P); segments spoken `Week` / `Month` / `Year` / `Program` (D-REL1). | legacy `:954-959` |
| Daily-average header | `HeaderStats` (avg + `rangeLabel`); height captured via `HeaderHeightKey` and reserved when a callout shows. | legacy `:961-972` |
| Chart | `ScrollableBarChart` → workouts `BarMark` (`appOrangeStrong`) + optional active-members `LineMark`/`PointMark` (`appPurple`); custom X-axis ticks via `axisValues`/`shortLabel`; Y auto to `yMax*1.1`. | legacy `:982-1086` |
| Tap-callout | Drag gesture → `selectedLabel` → `CalloutView` positioned via `clamp` over the tapped bar. | legacy `:1047-1084` |
| Empty / loading / error | `LoadStateContent`: spinner while loading (offline with nothing → the offline `ErrorStateView`); a failed load → `ErrorStateView` + Retry; "No data for this range yet." when the loaded `points.isEmpty`; the header stats show once data is there (D-REL1). | legacy `:974-981`; 0.1.2 |

## 5. Components + features consumed

- **Components (new this run, `Features/Home/Detail/ChartDetailComponents.swift`):** `HeaderStats`,
  `HeaderHeightKey`, `CalloutView`, `clamp`, and the axis/callout helpers (`axisValues`, `shortLabel`,
  `programMonthLabels`, `calloutTitle`×2, `formatCalloutDate`, `rangeLabel`×2). **Reused (run 54):**
  `ScrollableBarChart` (`SummaryChartCards.swift`). **Reused (run 55):** `memberTimelinePoints`.
- **Features:** none as a module — ~~reads `ProgramContext` (`activityTimeline`/`memberHistory` + daily-average
  + start/end dates) and calls its loaders directly (faithful).~~ *(0.1.2, D-REL1)* loads its own `LoadState<TimelineData>`
  (points + daily average + the member history's range) through `APIClient`; reads only the program dates from
  `ProgramContext` and writes nothing shared. Kit: `LoadStateContent` + `.loadStateChrome` + `loadOutcome`.

## 6. Data / API

- **`GET /analytics/timeline?period=&programId=`** (~~`ProgramContext.loadActivityTimeline`~~ `APIClient.fetchActivityTimeline`,
  0.1.2) — variable-length buckets per period + the daily average; the axis uses the program's start/end dates.
- **Member history** (~~`loadMemberHistory(memberId:, period:)`~~ `APIClient.fetchMemberHistory`, 0.1.2) when
  `memberId != nil` — buckets + daily average + the history's own start/end; mapped to timeline points via
  `memberTimelinePoints`. Neither read writes `ProgramContext` any more (the Summary / Members cards keep their own
  week — D-REL1). Read-only; `admin_only_data_entry` N/A.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin / logger / member | **Same** program-wide timeline from the Summary tab (no role-conditional UI — matches web F2). |
| (member-scoped entry) | Reached only via `MemberHistoryCard`, which is gated upstream (`canViewAny`, run 43); this screen has **no internal role gate** — the `memberId` param sets scope. |

**`admin_only_data_entry` = N/A** — read-only analytics, no logging (read-vs-write axis).

## 8. States & edge cases

- **Loading (`task(id: period)`):** ~~`isLoading` → `ProgressView`~~ the kit spinner (0.1.2); offline with no data →
  the offline `ErrorStateView`, never a spinner.
- **Empty:** `points.isEmpty` → "No data for this range yet."
- **Period change:** ~~re-runs `load`~~ resets to loading in the same event (`.onChange(of: period)`) and
  `.task(id: period)` loads; a result for a period no longer on screen (e.g. a Retry started before a switch) is
  dropped (D-REL1).
- **Error:** ~~`errorMessage` is set on a failed load but **never rendered** (F1) — both web and legacy iOS
  swallow (web `/summary/activity` shows the empty state, not a banner) → both-swallow = parity, no banner.~~
  *(superseded at v0.1.2 by D-REL1)* failed with no data → `ErrorStateView` + Retry; a failed Retry over shown bars →
  the bars stay with the floating `Couldn't refresh` · Retry banner; reload on reconnect.
- ~~**On disappear:** reloads the timeline (or member history) back to `week` — a legacy lifecycle quirk (F2).~~
  *(removed at v0.1.2 — the screen no longer touches the shared timeline, D-REL1.)*

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Keep iOS-native.** The legacy iOS view is **richer** than web `/summary/activity` (native tap-callout, period selector, horizontally-scrollable chart, member scope) — kept as a platform idiom (run-52/53 exception), NOT simplified toward web's flatter recharts. Web parity holds at the data/destination level. `consumed_by=[ios]`. | legacy file; web SPEC; run-52/53; [[ios-matches-web-not-just-legacy]]; user answer. |
| **D-SCOPE** | **Ported as part of the Summary chart drill-down cluster** (run-58/59/60 cohesive-cluster precedent) with [`summary-distribution-detail`](../summary-distribution-detail/SPEC.md) + [`summary-workout-types-detail`](../summary-workout-types-detail/SPEC.md). Leaf views — no forward-nav to defer; the 3 deferred stubs removed. | run-58/59/60; AdminSummaryTab call sites. |
| **D-S1** | **Stance = faithful 1:1** of the legacy interactive view + D-C2/D-C3. This is the FIRST run where legacy iOS is *richer* than web, so faithful = keep the richness (not the usual toward-web ADD). | legacy file; user answer. |
| **D-C2** | **Trim the 6 unused init providers** — the legacy `init` carried `pointsProvider`/`dailyAverageProvider`/`loadHandler`/`title`/`startDateProvider`/`endDateProvider`, none passed by a rebuilt call site; kept only `initialPeriod`/`memberId`/`showActiveSeries`. The program-wide vs member branch ~~reads `ProgramContext` directly~~ loads into the screen's own `LoadState` (0.1.2, D-REL1). | legacy `:885-914`; both call sites; user answer. |
| **D-C3** | **Tokenize chart colors** — `.orange.opacity(0.9)` → `Color.appOrangeStrong`, `.purple` → `Color.appPurple`, `.orange` dot → `Color.appOrange` (all `light:`-identical → no light-mode change, adaptive in dark; run-26 shape). Also retro-tokenized the run-54 `SummaryChartCards` card literals for card↔detail consistency. `systemGray3` ("Others") kept (semantic). | `AppTheme.swift:55/64/80`; user answer; run-26. |
| **D-DEPS** | **New dependency set** (breaks the no-new-dep streak) — the interactive-callout machinery (`CalloutView`/`HeaderStats`/`HeaderHeightKey`/`clamp` + axis/callout helpers), co-located in legacy deferred Detail files so never in the foundation (run-55/56 pattern) → new `ChartDetailComponents.swift`. `GlassButton` (already ported run 55) + `HealthCalloutView`/`HealthHeaderStats` (future lifestyle-timeline run) intentionally NOT ported. Analytics loaders/DTOs/`ScrollableBarChart`/`memberTimelinePoints` already ported (run 50/54/55). | foundation grep; run-50/54/55. |
| **D-REL1** | **Phase 4 polish (#29, #34, #36).** #29 the kit detail load (frontend-kit **D-KIT-21**): the screen keeps its own `LoadState<TimelineData>` filled by `APIClient.fetchActivityTimeline` / `fetchMemberHistory` (never `ProgramContext.activityTimeline` / `memberHistory`, so the Summary and Members cards behind it keep their own week); `LoadStateContent` (spinner, offline view with no data, `ErrorStateView` + Retry) + `.loadStateChrome` (stale banner, reconnect reload). #34 keyed on the period: a switch resets to loading in the same event, `loadOutcome` + `applying` drop a result for an older period; the `onDisappear` reload-to-week (F2) and the swallowed `errorMessage` (F1) are gone. #36 the W/M/Y/P segments are spoken `Week` / `Month` / `Year` / `Program` (frontend-kit **D-KIT-22**). | `05e185a`; polish amendments PA9; iOS plan P-4, step 41 |
| **D-AXIS** | **Month x-axis labels only days 1 · 8 · 15 · 22 · 29** (`axisValues`), Apple-Fitness style; the other periods keep every tick. `AxisMarks(values:)` alone stopped thinning the categorical axis on the Xcode 27 SDK (1.5.2 (60) drew all 31 days), so the mark content filters too (`showsAxisMark`, `ChartDetailComponents.swift`). Shared by the Lifestyle + Steps timeline drill-downs; Android `axisLabels` thins the same days, web's Recharts auto-skips. | user report 2026-10-14 (1.5.2 in review) |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | ~~**Vestigial `errorMessage`** — set on a failed load but never rendered (both web + legacy iOS swallow → parity → no banner, run-55 verdict).~~ | `ActivityTimelineDetailView.swift` `load()` | *Resolved at v0.1.2 (D-REL1) — removed; a failure shows the kit error view.* |
| **F2** | ~~**`onDisappear` reloads to `week`** — a legacy lifecycle quirk (resets the shared context timeline when leaving).~~ | `ActivityTimelineDetailView.swift` `onDisappear` | *Removed at v0.1.2 (D-REL1) — nothing shared to reset.* |
| **F3** | **Per-program read authz added backend-side** on `GET /analytics/timeline` — was `authenticateToken`-only (web F1); since analytics 0.4.0 (D-C8) it requires an ACTIVE program membership or global admin (403 otherwise). | backend route | Changed backend-side (analytics D-C8); no iOS change. |
| **F4** | **Client role gate is entry-only** — the member-scoped entry is gated at `MemberHistoryCard`; this view has no internal gate (the `memberId` param sets scope). | call sites | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.3 | 2026-10-14 | **D-AXIS** — the Month x-axis labels only 1/8/15/22/29 again (Xcode 27 SDK regression; ships in 1.5.2 (61)). |
| 0.1.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`05e185a`).** #29 own `LoadState` via `APIClient` (no shared writes) + kit error view / Retry / stale banner / offline view / reconnect reload (F1 + F2 retired); #34 a period switch resets to loading and an older period's result is dropped; #36 spoken `Week` / `Month` / `Year` / `Program` segments. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: the tap callout uses the shared `chartCalloutPlacement` (measured, flipped below the point when it would cross the top edge, clamped — never clipped; #46) — member history reuses this view. |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 61) — the Summary **activity-timeline drill-down**, ported into `apps/ios/.../Features/Home/Detail/ActivityTimelineDetailView.swift` (+ shared `ChartDetailComponents.swift`); deferred stub removed. **D-REF** (keep iOS-native — richer than web; `consumed_by=[ios]`) · **D-SCOPE** (chart drill-down cluster) · **D-S1** (faithful 1:1 — first run iOS richer than web) · **D-C2** (trim 6 unused init providers) · **D-C3** (tokenize chart colors + retro-tokenize run-54 cards) · **D-DEPS** (new `ChartDetailComponents.swift`; skip GlassButton/health variants). Flagged F1–F4. Read-only → `admin_only_data_entry` N/A; serves double-duty (Summary program-wide + Members history member-scoped). Build green-check owned by the user (Xcode); symbols grep-verified. |
