# iOS Screen SPEC — `AdminSummaryTab` (the Summary dashboard tab body)

> **Surface:** `ios` · **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/AdminSummaryTab.swift`
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
| `SummaryHeader` (title · program name · signed-in user's initials circle → `MyProfileView`, D-PC1) | legacy `AdminHomeHelpers.swift:53` | `SummaryCards.swift` (`SummaryHeader`) |
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
  computeds (`completionPercent`/`elapsedDays`/`totalDays`/`remainingDays`/`loggedInUserInitials`/`name`/`status`),
  all ported in the foundation (run 50). NEW this run: `adminOnlyDataEntry` + `dataEntryLocked` (D-C2).
- **`APIClient+Analytics`** DTOs (`MTDParticipationDTO`, `ActivityTimelinePoint`, `WorkoutTypeDTO`, …) — foundation.
- **`workoutTypePaletteColor`** (`Shared/Components/WorkoutPopularityLogic.swift:56`) — foundation.
- **Theme** (`appOrange`/`appBlue`/`appRed`/`appBackgroundSecondary`/`appOrangeGradientEnd`, …) — foundation.
- **Deferred (stubbed) NavigationLink targets:** `AddWorkoutDetailView`, `AddDailyHealthDetailView`,
  `ActivityTimelineDetailView(initialPeriod:)`, `DistributionByDayDetailView(points:)`,
  `WorkoutTypesDetailView(types:)` — each a later screen (the iOS analogues of the web `/summary` sub-routes).

## 6. Data / API
All endpoints already mounted + their loaders ported in the foundation (run 50) — **zero backend work, no new
api function**. ~~On mount + on `period` change, `load()` calls (all on `ProgramContext`): `loadAnalytics(period:)`,
`loadMTDParticipation()`, `loadTotalWorkoutsMTD()`, `loadTotalDurationMTD()`, `loadAvgDurationMTD()`,
`loadActivityTimeline(period: timelinePeriod.apiValue)`, `loadDistributionByDay()`, `loadWorkoutTypes()`.~~
*(superseded by D-C3 at v0.2.0; the leftover `loadActivityTimeline` / `loadWorkoutTypes` were deleted at v0.2.3)* —
`load()` calls `ProgramContext.loadSummary(period:timelinePeriod:read:)`: the 8 reads in parallel, returning which parts
applied (`Set<SummaryPart>`, D-REL1) + the first failure.
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
- **Loading (D-C3, 1.5.0):** `LoadState` keyed by program; `.task(id:)` on (program, period, timeline period,
  `summaryRefreshToken`) — a newer key cancels the running load. Cached Summary first (`LaunchCache`), then the 8
  loads in parallel; parts that loaded are kept. ~~Cards with nil data fall back to `PlaceholderCard` (MTD) or an
  in-card "No data yet" (the timeline card's never-ending spinner is gone — W7 F3).~~ *(superseded at v0.2.3 by
  D-REL1)* Each analytics card renders only once its part loaded for the program on screen (`loadedParts`); otherwise
  `PlaceholderCard` — a spinner while a load is in flight, `—` (spoken `Unavailable`) once it settled without that part.
  A loaded-but-empty timeline keeps its in-card "No data yet".
- **Program switch (D-REL1):** the tab resets to loading and clears `loadedParts` in the same event, and the picker's
  `resetProgramScopedData()` clears every Summary field — the previous program's totals never show.
- **Error (D-C3, supersedes the D-C1 banner):** nothing loaded for this program → `ErrorStateView` (Retry) and the
  analytics cards hide (the add / progress cards stay) — never another program's or zero values; some parts loaded, or
  data + a failed refresh → those values stay with the kit stale banner. Back online → refetch. A load that fails
  while offline (link down or proven offline — polish-1) shows the offline error view, a client timeout included. Pull-to-refresh reloads now and starts a background
  `pull_to_refresh` sync; a sync that lands workouts bumps `summaryRefreshToken` → reload again.
- **Reorder:** drag a card → `CardDropDelegate` moves it + `persistOrder()` writes
  `summary.card.order.<programId>`; `restoreOrder()` merges saved + any new cards, enforcing add-workout/
  add-health adjacency.

## 9. Decisions made
| ID | Decision | Rests on |
|---|---|---|
| **D-SCOPE** | **The scope cut IS the run** — port the dashboard grid + all 10 cards (charts render live) into 3 files; **defer the 5 `NavigationLink` detail targets as `ScaffoldPlaceholder` stubs**. Mirrors web's landing-vs-sub-routes split (web landing run 21 vs sub-routes runs 33–38) + the run-50/52/53 stub-the-forward-nav pattern. | legacy `AdminSummaryTab.swift` (228 LoC) + ~2,600 LoC of helper/detail files; the 5 detail views map 1:1 to deferred web `/summary` sub-routes |
| **D-REF** | **Keep iOS-native** — a reorderable card grid + native `NavigationLink` drill-downs, NOT web's fixed-grid + routes/modals. Platform-idiom (memory `ios-matches-web-not-just-legacy`; the run-52/53 D-REF shape). The card SET + the MTD stats match web, so the grid/nav shape is a structural idiom divergence, not a parity gap. | `AdminSummaryTab.swift:31-61`; web `summary/page.tsx` |
| **D-S1** | **Faithful 1:1 to the legacy iOS dashboard otherwise** — same cards byte-for-byte (incl. the 4×-duplicated inline `changeBadge`, the Swift Charts, the drag-reorder + `UserDefaults` persistence, the vestigial `period`/`timelinePeriod` bindings). | legacy card structs, verified file:line |
| **D-C1** | *(Superseded by D-C3 — iOS 1.5.0: the kit error view / stale banner.)* **Web-parity ADD — a visible error banner.** Legacy set `errorMessage` (`AdminSummaryTab.swift:88`) but rendered it nowhere; web shows an `ErrorState`. Additive red banner, no new dep. The run-52 swallow-vs-surface mirror. | web `summary/page.tsx:181-183` |
| **D-C2** | **Web-parity ADD — the `admin_only_data_entry` landing treatment.** A 🔒 banner (verbatim `DATA_LOCK_MESSAGE`) + dimmed/non-navigating add cards when `dataEntryLocked`. Required adding `ProgramDTO.admin_only_data_entry` decode + `ProgramContext.adminOnlyDataEntry`/`dataEntryLocked` (web `isDataEntryLocked` = flag on && not admin). Absent from legacy iOS entirely. | web `lib/permissions.ts:5,21-25`, `summary/page.tsx:196-200`; backend `Program` model |
| **D-DEPS** | **No new dependency for the dashboard** — every analytics loader/DTO/theme symbol + the progress computeds ported in the foundation (run 50). Newly ported WITH the cards (lived only in deferred Detail files): `ScrollableBarChart`, `DistributionPoint`/`distributionPoints`, `DistributionChartOverlay`, `typeColor`/`barColor`. | dep-purity grep; foundation `WorkoutPopularityLogic.swift` |
| **D-C3** | **Kit adoption + instant open (reliability Phase 3 C2; board §6.5, D-9; frontend-kit §5–§6).** `ProgramContext.loadSummary` runs the 8 loads in parallel (was serial) and applies every part that loaded; `LoadState<String>` (the program id on screen) + `.task(id: SummaryLoadKey)` replaces `guard !isLoading` (W7 F5); cache-first via `LaunchCache`; `ErrorStateView` only when nothing loaded (analytics cards hidden — amendment A13), any part that loaded → stale (kept values + banner) via `ScreenBanner`; the scroll content gets bottom padding while that banner shows, and the offline band is the stack's bottom safe-area inset (A6); refetch on reconnect; `.refreshable` = reload now + a background `pull_to_refresh` sync, and a run that applies workouts reloads again (A13, H5); the timeline card's empty spinner removed (W7 F3). | frontend-kit §5–§6; health-sync §8 rule 1; Phase 3 client amendments (`specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`) A6 / A13 / H5. |
| **D-REL1** | **Phase 4 polish (#30, with #10).** #30 honest Summary cards (analytics **D-C11**, analytics-v2 **D-C6**; the frontend-kit D-KIT-11 in-flight idiom): `loadSummary` returns WHICH parts applied (`Set<SummaryPart>`) and the tab keeps `loadedParts`; each of the 7 analytics cards (MTD Participation, Total workouts, Total duration, Avg duration, timeline, distribution, top types) renders only when its part loaded — else `PlaceholderCard(isUnavailable:)`: the spinner while a load is in flight (first load, Retry, refresh), `—` (spoken `Unavailable`) after a settled failure; never a fake 0. The three chart drill-downs open only from a loaded card. #10 keyed state (frontend-kit **D-KIT-23**): a program change sets `.loading` + clears `loadedParts` in the same event; `resetProgramScopedData()` clears the Summary fields. | `05e185a`; polish amendments U3; iOS plan P-6, steps 33–34 |
| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** `SummaryHeader` (shared by Summary and the admin Program tab) wraps its circle in `NavigationLink { MyProfileView() }` + `.buttonStyle(.plain)` + `.contentShape(Circle())` + `.accessibilityLabel("My Profile")` — same look. It pushes on the picker's outer stack, so nav back / the edge swipe pops to this tab with the selected tab and program intact. Initials now read `loggedInUserInitials` (was `adminInitials`: the same name at sign-in, never refreshed after a rename in My Profile) — web/Android parity; closes android/summary A-2. `ProgramContext.adminInitials`/`adminName` are now unused (left in place); a missing user name shows `?` (was "A" from the `"Admin"` default). The picker's account button is unchanged. | user, touch-up (c) (reliability HANDOFF) |

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
- **v0.2.4** (2026-10-13, **D-PC1 — touch-up (c)**) — the `SummaryHeader` circle is a plain-style `NavigationLink` → `MyProfileView` (label "My Profile", same look) and shows `loggedInUserInitials` (was `adminInitials`, now unused).
- **v0.2.3** (2026-10-13, **D-REL1 — Phase 4 polish (`05e185a`)**) — #30 a card without its loaded part shows a spinner
  while in flight and `—` (`Unavailable`) after a settled failure, never a fake 0 (`loadSummary` returns the applied
  parts); #10 a program switch resets the tab and clears the Summary fields in the same event.
- **v0.2.2** (2026-10-13, Phase 4 quick wins) — the distribution card's callout gets `overflowResolution`
  fit-to-chart, so it is never clipped (#46).
- **v0.2.1** (2026-10-13, polish 1 — offline detection) — offline = link down OR proven offline by a failed request
  (`NetworkMonitor`); nothing loaded + a load that fails while offline → the kit's offline `ErrorStateView` + Retry, a
  client timeout included (`AppError.labeled(online:)`, rule 6); stale-banner suppression and refetch-on-reconnect
  follow the combined value.
- **v0.2.0** (2026-10-13, reliability Phase 3 C2) — D-C3: 8 parallel loads, `LoadState` + `.task(id:)`, cache-first,
  kit error view (analytics cards hidden) + stale banner (D-C1 superseded), pull-to-refresh with a background sync,
  reload when a sync lands workouts, refetch on reconnect, the timeline spinner fix.
- **v0.1.0** (run 54, 2026-06-30) — initial SPEC; Summary dashboard grid + 10 cards ported (3 files), 5 detail
  views stubbed; web-parity error banner (D-C1) + data-lock treatment (D-C2) added; `admin_only_data_entry`
  wired into `ProgramDTO`/`ProgramContext`.
