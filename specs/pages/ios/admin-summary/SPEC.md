# iOS Screen SPEC — `AdminSummaryTab` (the Summary dashboard tab body)

> **Surface:** `ios` · **Reference impl (legacy):** `../ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/AdminSummaryTab.swift`
> (+ card structs from `Features/Home/Helpers/AdminHomeHelpers.swift`, `Detail/WorkoutDistributionViews.swift`,
> `Detail/WorkoutTypesDetailViews.swift`)
> **Web sibling (co-equal reference):** `/summary` landing — `specs/pages/web/summary/SPEC.md`
> **Ported to:** `apps/ios/RaSi-Fiters-App/Features/Home/Tabs/{AdminSummaryTab,SummaryCards,SummaryChartCards}.swift`
> · **Run:** 54 (2026-06-30)

## 1. What it is + who uses it
The **Summary dashboard** — Tab 1 of `AdminHomeView`, the iOS analogue of the web `/summary` landing. A
scrollable, **drag-reorderable** grid of 10 cards (program progress · MTD participation/workouts/duration/avg ·
activity-timeline & distribution charts · top workout types · two log action cards). Shown to **every** authed
role (the tab is not role-bifurcated — `AdminHomeView.swift:35`). The cards present the active program's
analytics at a glance and are the entry to logging + the chart drill-downs.

## 2. Why it exists
It is the program's at-a-glance overview — the first tab a member sees after picking a program. It mirrors the
built web `/summary` landing (same cards, same MTD stats, same chart previews), adapted to native idioms (a
reorderable card grid + `NavigationLink` drill-downs instead of web routes/modals).

## 3. Route / location
- **App:** ios · **Files:** `Features/Home/Tabs/AdminSummaryTab.swift` (the tab), `SummaryCards.swift`
  (shells + metric/action cards), `SummaryChartCards.swift` (the chart cards + helpers).
- **Entry:** Tab 1 of `AdminHomeView`'s `TabView` (`AdminHomeView.swift:35`, `AdminSummaryTab(period: $summaryPeriod)`).

## 4. Contents / sections
Cards render via `cardView(for:)` in legacy default order; layout packs full-width cards alone and half-width
cards two-per-row (`laidOutRows()`). Each card is drag-reorderable (persisted per program in `UserDefaults`).

| Block | Reference `file:line` | Ported to |
|---|---|---|
| `SummaryHeader` (title · program name · admin-initials avatar) | legacy `AdminHomeHelpers.swift:53` | `SummaryCards.swift` |
| **Program Progress** (`CompletionRing` + %/days + status pill) | `AdminHomeHelpers.swift:145, 197` | `SummaryCards.swift` |
| **MTD Participation** (pct · active/total · change badge) | `AdminHomeHelpers.swift:219` | `SummaryCards.swift` |
| **Total Workouts / Total Duration / Avg Duration** (value + change badge) | `AdminHomeHelpers.swift:284, 337, 398` | `SummaryCards.swift` |
| **Add workout / Log daily health** action cards | `AdminHomeHelpers.swift:1503, 1562` | `SummaryCards.swift` |
| **Activity Timeline** card (bar + line Swift Chart) | `AdminHomeHelpers.swift:693` | `SummaryChartCards.swift` |
| **Distribution by Day** card (7-day bar chart) | `WorkoutDistributionViews.swift:136` | `SummaryChartCards.swift` |
| **Top Workout Types** card (top-5 + "Others" dot list) | `WorkoutTypesDetailViews.swift:5` | `SummaryChartCards.swift` |
| `CardShell` / `PlaceholderCard` / `SummaryCardType` / `CardDropDelegate` / `ScrollableBarChart` | `AdminHomeHelpers.swift:1335, 2517, 2446, 2490` · `WorkoutTypesDetailViews.swift:200` | `SummaryCards.swift` / `SummaryChartCards.swift` |
| **Error banner** (web-parity ADD, D-C1) | — (legacy swallows) | `AdminSummaryTab.swift` |
| **Data-lock banner** + dimmed/disabled add cards (web-parity ADD, D-C2) | — (absent in legacy iOS) | `AdminSummaryTab.swift` |

## 5. Components + features consumed
- **`ProgramContext`** (`@EnvironmentObject`) — all analytics data + the `load*` methods + the program-progress
  computeds (`completionPercent`/`elapsedDays`/`totalDays`/`remainingDays`/`adminInitials`/`name`/`status`),
  all ported in the foundation (run 50). NEW this run: `adminOnlyDataEntry` + `dataEntryLocked` (D-C2).
- **`APIClient+Analytics`** DTOs (`MTDParticipationDTO`, `ActivityTimelinePoint`, `WorkoutTypeDTO`, …) — foundation.
- **`workoutTypePaletteColor`** (`Shared/Components/WorkoutPopularityLogic.swift:56`) — foundation.
- **Theme** (`appOrange`/`appBlue`/`appRed`/`appBackgroundSecondary`/`appOrangeGradientEnd`, …) — foundation.
- **Deferred (stubbed) NavigationLink targets:** `AddWorkoutDetailView`, `AddDailyHealthDetailView`,
  `ActivityTimelineDetailView(initialPeriod:)`, `DistributionByDayDetailView(points:)`,
  `WorkoutTypesDetailView(types:)` — each a later screen (the iOS analogues of the web `/summary` sub-routes).

## 6. Data / API
All endpoints already mounted + their loaders ported in the foundation (run 50) — **zero backend work, no new
api function**. On mount + on `period` change, `load()` calls (all on `ProgramContext`): `loadAnalytics(period:)`,
`loadMTDParticipation()`, `loadTotalWorkoutsMTD()`, `loadTotalDurationMTD()`, `loadAvgDurationMTD()`,
`loadActivityTimeline(period: timelinePeriod.apiValue)`, `loadDistributionByDay()`, `loadWorkoutTypes()`.
NEW decode: `ProgramDTO.admin_only_data_entry` (already returned by the backend program payload; web sources it
identically) → hydrated into `ProgramContext.adminOnlyDataEntry` in `apply(program:)`.

## 7. Role-based view rules
| Role | Dashboard cards | Add-workout / Log-health cards |
|---|---|---|
| global_admin | all 10, identical | enabled (navigate to log forms) |
| program admin | all 10, identical | enabled |
| logger | all 10, identical | enabled |
| member | all 10, identical | enabled |

- **No page-level role gate** — the Summary tab is identical for every role (faithful to legacy; matches web,
  which has no role-conditional cards on the landing beyond the bulk-add card iOS doesn't have).
- **`admin_only_data_entry` — LIVE on the landing (D-C2, web parity).** When the program flag is on AND the
  user is not a program/global admin (`dataEntryLocked`), a 🔒 banner shows and the two log action cards are
  dimmed + non-navigating. Legacy iOS had no client lock at all (relied on the backend 403); web shows the
  banner + disables the cards. The lock's real teeth (the log forms' mount guards) live in the deferred detail
  views. Admins always see the cards enabled.

## 8. States & edge cases
- **Loading:** `isLoading` guards re-entrancy; cards with nil data fall back to `PlaceholderCard` (MTD) or an
  in-card "No data yet" (`ActivityTimelineCardSummary`/`DistributionByDayCard`) / "No workouts logged yet."
  (`WorkoutTypesSummaryCard`).
- **Error:** `errorMessage` (captured from `programContext.errorMessage` after `load()`) now renders a visible
  red banner (D-C1) — legacy captured it but rendered nowhere.
- **Reorder:** drag a card → `CardDropDelegate` moves it + `persistOrder()` writes
  `summary.card.order.<programId>`; `restoreOrder()` merges saved + any new cards, enforcing add-workout/
  add-health adjacency.

## 9. Decisions made
| ID | Decision | Rests on |
|---|---|---|
| **D-SCOPE** | **The scope cut IS the run** — port the dashboard grid + all 10 cards (charts render live) into 3 files; **defer the 5 `NavigationLink` detail targets as `ScaffoldPlaceholder` stubs**. Mirrors web's landing-vs-sub-routes split (web landing run 21 vs sub-routes runs 33–38) + the run-50/52/53 stub-the-forward-nav pattern. | legacy `AdminSummaryTab.swift` (228 LoC) + ~2,600 LoC of helper/detail files; the 5 detail views map 1:1 to deferred web `/summary` sub-routes |
| **D-REF** | **Keep iOS-native** — a reorderable card grid + native `NavigationLink` drill-downs, NOT web's fixed-grid + routes/modals. Platform-idiom (memory `ios-matches-web-not-just-legacy`; the run-52/53 D-REF shape). The card SET + the MTD stats match web, so the grid/nav shape is a structural idiom divergence, not a parity gap. | `AdminSummaryTab.swift:31-61`; web `summary/page.tsx` |
| **D-S1** | **Faithful 1:1 to the legacy iOS dashboard otherwise** — same cards byte-for-byte (incl. the 4×-duplicated inline `changeBadge`, the Swift Charts, the drag-reorder + `UserDefaults` persistence, the vestigial `period`/`timelinePeriod` bindings). | legacy card structs, verified file:line |
| **D-C1** | **Web-parity ADD — a visible error banner.** Legacy set `errorMessage` (`AdminSummaryTab.swift:88`) but rendered it nowhere; web shows an `ErrorState`. Additive red banner, no new dep. The run-52 swallow-vs-surface mirror. | web `summary/page.tsx:181-183` |
| **D-C2** | **Web-parity ADD — the `admin_only_data_entry` landing treatment.** A 🔒 banner (verbatim `DATA_LOCK_MESSAGE`) + dimmed/non-navigating add cards when `dataEntryLocked`. Required adding `ProgramDTO.admin_only_data_entry` decode + `ProgramContext.adminOnlyDataEntry`/`dataEntryLocked` (web `isDataEntryLocked` = flag on && not admin). Absent from legacy iOS entirely. | web `lib/permissions.ts:5,21-25`, `summary/page.tsx:196-200`; backend `Program` model |
| **D-DEPS** | **No new dependency for the dashboard** — every analytics loader/DTO/theme symbol + the progress computeds ported in the foundation (run 50). Newly ported WITH the cards (lived only in deferred Detail files): `ScrollableBarChart`, `DistributionPoint`/`distributionPoints`, `DistributionChartOverlay`, `typeColor`/`barColor`. | dep-purity grep; foundation `WorkoutPopularityLogic.swift` |

## 10. Flagged characteristics (kept as-is)
- **F1 — iOS-only drag-to-reorder + per-program `UserDefaults` persistence.** Web has no card reordering; this
  is a legacy iOS feature, kept faithful (not a parity gap — web simply lacks the feature).
  (`AdminSummaryTab.swift:37-49, 204-227`)
- **F2 — Vestigial period bindings.** `period` (from the shell) and `timelinePeriod` (`.week`) drive `load()`
  but **no period-selector UI renders** on the landing → effectively week-fixed. Matches web F4 (no landing
  selector) + F5 (over-fetch — `loadAnalytics` results aren't all shown). The period selector is a deferred
  detail-view concern. (`AdminSummaryTab.swift:9, 14, 80, 85`)
- **F3 — 5 deferred detail-view stubs.** `AddWorkoutDetailView`, `AddDailyHealthDetailView`,
  `ActivityTimelineDetailView`, `DistributionByDayDetailView`, `WorkoutTypesDetailView` — the iOS analogues of
  the web `/summary` sub-routes; each its own later run.
- **F4 — 4×-duplicated inline `changeBadge`.** MTD/Total-Workouts/Total-Duration/Avg-Duration each carry a
  byte-identical `private var changeBadge`; kept faithful (rebuild-cleanup candidate — a shared component).
- **F5 — `DistributionChartOverlay` rename.** Legacy `ChartOverlay` (generic, collision-risky for future
  detail-view ports) renamed; non-behavioral disambiguation.
- **F6 — `SummaryCardType.span` is vestigial.** The layout uses `requiresFullWidth`, never `span`. Faithful
  legacy dead property. (`SummaryCards.swift`)
- **F7 — Lock UI is client-only on the landing.** The dimmed add cards + banner are a display gate; the real
  boundary is the backend 403 (`requireDataEntryAllowed`) reached by the deferred log forms. (web F2 mirror)

## 11. Changelog
- **v0.1.0** (run 54, 2026-06-30) — initial SPEC; Summary dashboard grid + 10 cards ported (3 files), 5 detail
  views stubbed; web-parity error banner (D-C1) + data-lock treatment (D-C2) added; `admin_only_data_entry`
  wired into `ProgramDTO`/`ProgramContext`.
