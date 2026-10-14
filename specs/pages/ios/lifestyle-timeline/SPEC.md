# Screen: `lifestyle-timeline` (ios) — the Sleep · Diet-quality timeline drill-down

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.3 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Lifestyle tab's timeline card (`LifestyleTimelineCardSummary`) —
> ~~`StandardWorkoutTypesTab.swift` (`memberId: loggedInUserId`) **and** `AdminWorkoutTypesTab.swift`
> (`memberId: selectedMember?.id`)~~ *(0.1.2)* the shared `LifestyleCardsSection` (`StandardWorkoutTypesTab.swift`, both
> tabs) with `memberId: snapshot.key.memberId` (the member the cards show),
> `NavigationLink { LifestyleTimelineDetailView(initialPeriod:.week, memberId:) }`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Helpers/AdminHomeHelpers.swift`
> (`LifestyleTimelineDetailView`, lines 1133-1332); helpers in `Features/Home/Detail/ActivityTimelineViews.swift`
> (`HealthHeaderStats` :4, `HealthCalloutView` :116).
> **Web parity reference:** [`web lifestyle/timeline`](../../web/lifestyle/timeline/SPEC.md) — same sleep-hours bars +
> diet-quality line + daily-average header; iOS is **richer** (native tap-callout, period selector, horizontally
> scrollable chart, member scope). The web run-32 chart cleanups (dual Y-axis, Legend, axis unit labels) are matched
> (D-C1/D-C3/D-C4).
> **Consumes:** ~~`ProgramContext.loadHealthTimeline`~~ `APIClient.fetchHealthTimeline` into the screen's own
> `LoadState` (0.1.2, D-REL1) (`GET /analytics/health/timeline`). No write.
> **Stance:** faithful 1:1 port of the legacy iOS view (kept iOS-native, D-REF) **+ D-C1 (dual Y-axis) + ~~D-C2
> (web-parity error banner)~~ (superseded by the kit error view, D-REL1) + D-C3 (axis unit labels) + D-C4 (chart Legend)**. Oddities §10.

---

## 1. What it is + who uses it

The **lifestyle-timeline drill-down** — a full-screen, interactive Swift Charts view of sleep + diet quality over
time (blue sleep-hours bars + green diet-quality line/points), a **period selector** (W/M/Y/P), a daily-average
header (`HealthHeaderStats`), and a **tap-callout** (`HealthCalloutView`). Always member-scoped: the Lifestyle
timeline card passes the viewer's own id (standard) or the admin-selected member's id (admin). Used by all roles;
member selection is gated upstream at the Lifestyle tab card (run 56).

## 2. Why it exists

The Lifestyle-tab timeline card is a preview; tapping it opens this richer, period-switchable, scrubbable chart of
sleep hours and diet quality. It re-fetches the timeline on each period change. It is **read-only** analytics — no
logging, no lock.

## 3. Route / location

- **App:** `ios`. **Reached via:** the Lifestyle tab's `LifestyleTimelineCardSummary` →
  `LifestyleTimelineDetailView(initialPeriod: .week, memberId:)` — `memberId = loggedInUserId` (Standard tab) or
  ~~`selectedMember?.id`~~ the Admin tab's View-as scope (`snapshot.key.memberId`, 0.1.2: the picked member, a program
  admin's own id by default, nil = program-wide for "Admin" / "None").
- **Leaves to:** back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Title + subtitle | "Lifestyle Timeline" / "Sleep · Diet quality". | legacy `:1173-1178` |
| Period selector | Segmented `Picker` over `AdminHomeView.Period.allCases` (W/M/Y/P); segments spoken `Week` / `Month` / `Year` / `Program` (D-REL1). | legacy `:1181-1186` |
| Daily-average header | `HealthHeaderStats` (avg sleep hrs + diet /5 + `rangeLabel`); height captured via `HeaderHeightKey`, reserved when a callout shows. | legacy `:1188-1203` |
| Chart | `ScrollableBarChart` → sleep-hours `BarMark` (`appBlue` @0.9) + diet-quality `LineMark`/`PointMark` (`appGreen`); custom X-axis ticks via `axisValues`/`shortLabel`; **dual Y-axis** (D-C1). | legacy `:1213-1268` |
| Tap-callout | Drag gesture → `selectedLabel` → `HealthCalloutView` (sleep + diet) positioned via `clamp` over the tapped point. | legacy `:1269-1305` |
| Empty / loading / error | `LoadStateContent`: spinner while loading (offline with nothing → the offline `ErrorStateView`); "No data for this range yet." when the loaded `points.isEmpty`; ~~**error banner** when a load fails (D-C2)~~ a failed load → `ErrorStateView` + Retry (0.1.2, D-REL1); the header stats show once data is there. | legacy `:1205-1212`; 0.1.2 |

## 5. Components + features consumed

- **Components (new this run, added to `Features/Home/Detail/ChartDetailComponents.swift`):** `HealthHeaderStats`,
  `HealthCalloutView` — the health twins of `HeaderStats`/`CalloutView`, co-located in the legacy deferred
  `ActivityTimelineViews.swift` so never pulled into the foundation (run-55/56/61 co-located-helper pattern).
  **Reused (run 61, not redefined):** `HeaderHeightKey`, `clamp`, `axisValues`, `shortLabel`, `programMonthLabels`,
  `calloutTitle`×2, `formatCalloutDate`, `rangeLabel`×2. **Reused (run 54):** `ScrollableBarChart`.
- **Features:** none as a module — ~~reads `ProgramContext` (`healthTimeline` + `healthTimelineDailyAverageSleep`/
  `Food` + start/end dates) and calls its loader directly (faithful).~~ *(0.1.2, D-REL1)* loads its own
  `LoadState<HealthTimelineResponse>` through `APIClient`; reads only the program dates from `ProgramContext` and
  writes nothing shared. Kit: `LoadStateContent` + `.loadStateChrome` + `loadOutcome`.

## 6. Data / API

- **`GET /analytics/health/timeline?period=&programId=&memberId=`** (~~`ProgramContext.loadHealthTimeline(period:memberId:)`~~
  `APIClient.fetchHealthTimeline` directly, 0.1.2 — `APIClient+Analytics.swift`) — buckets per period + the daily
  sleep / diet averages, kept in the screen's own state (no shared `healthTimeline` write — D-REL1). Response `HealthTimelineResponse` / `HealthTimelinePoint`
  (`date`/`label`/`sleep_hours`/`food_quality`), already ported (foundation run 50). Read-only;
  `admin_only_data_entry` N/A.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin | Reached from the Admin Lifestyle tab card with ~~`memberId: selectedMember?.id`~~ `memberId: snapshot.key.memberId` (0.1.2 — the admin's view-as scope, gated at the tab, run 56). No internal role gate — the `memberId` param sets scope. |
| logger / member | Reached from the Standard Lifestyle tab card with `memberId: loggedInUserId` (own data). No internal role gate. |

**No role-conditional UI** — the chart is identical for every role; only the `memberId` (set by the caller) differs
(matches web F3). **`admin_only_data_entry` = N/A** — read-only analytics, no logging (read-vs-write axis).

## 8. States & edge cases

- **Loading (`task(id: period)`):** ~~`isLoading` → `ProgressView`~~ the kit spinner (0.1.2); offline with no data →
  the offline `ErrorStateView`, never a spinner.
- **Error:** ~~(D-C2) `errorMessage` set on a failed load → **visible error banner** (web `/lifestyle/timeline`
  surfaces `<ErrorState>`, `page.tsx:65-66`; legacy iOS captured `errorMessage` but rendered it nowhere → the
  run-52/54 swallow-vs-surface ADD).~~ *(superseded at v0.1.2 by D-REL1)* failed with no data → `ErrorStateView` +
  Retry (still web parity — web shows its ErrorView); a failed Retry over shown bars → the bars stay with the floating
  `Couldn't refresh` · Retry banner; reload on reconnect.
- **Empty:** `points.isEmpty` → "No data for this range yet." (matches web `points.length === 0`).
- **Period change:** ~~re-runs `load`~~ resets to loading in the same event and `.task(id: period)` loads; a result for
  a period no longer on screen is dropped (D-REL1).
- ~~**On disappear:** reloads the timeline back to `week` — a legacy lifecycle quirk (F2).~~ *(removed at v0.1.2 —
  nothing shared to reset, D-REL1.)*

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Keep iOS-native.** The legacy iOS view is **richer** than web `/lifestyle/timeline` (native tap-callout, period selector, horizontally-scrollable chart, member scope) — kept as a platform idiom (run-52/53/61 exception), NOT simplified toward web's flatter recharts. Web parity holds at the data/destination level. `consumed_by=[ios]`. | legacy file; web SPEC; run-61; [[ios-matches-web-not-just-legacy]]; user answer. |
| **D-SCOPE** | **Single leaf detail view — its own run** (the last non-widget deferred stub). Ports the view + its 2 co-located health helpers; no forward-nav to defer; the deferred stub removed. | `_DeferredScreenStubs.swift`; call sites. |
| **D-S1** | **Stance = faithful 1:1** of the legacy interactive view (keep the native richness — run-61 iOS-richer shape) **+ the 4 web-parity chart deviations** below. Legacy already tokenizes chart colors (`Color.appBlue`/`appGreen`), so **no tokenize cleanup** (unlike run 61). | legacy file; user answer. |
| **D-C1** | **Dual Y-axis (web parity, run-32 web D-C2 analogue).** Legacy plots sleep-hours (0–12) and diet-quality (1–5) on ONE shared axis (`yMax = max(sleep, food)`, `chartYScale(0...yMax*1.1)`) — the diet line sits flattened under the sleep bars. The port scales the diet series onto its own **0–5 axis** (`scaledFood = food/5 * sleepDomainMax`) with sleep on the **leading** axis and a **trailing** 0–5 axis; callout/scroll/period selector kept (native richness preserved). | legacy `:1167-1169,1266`; web SPEC D-C2 (`page.tsx:102-115`); user answer. |
| **D-C2** | *(Superseded at v0.1.2 by D-REL1 — the kit error view + Retry.)* ~~**Web-parity error banner.** Legacy set `errorMessage` on a failed load but rendered it nowhere (swallowed); web surfaces `<ErrorState>`. Wire the (previously-dead) `errorMessage` to a visible `errorBanner` (the run-54 `AdminSummaryTab` banner shape).~~ | legacy `:1329`; web `page.tsx:65-66`; run-52/54; user answer. |
| **D-C3** | **Axis unit labels (web parity, run-32 web D-C4).** Label the leading (sleep) axis **"hrs"** and the trailing (diet) axis **"/ 5"** so the two scales are self-explanatory (meaningful now that D-C1 splits them). | web SPEC D-C4 (`page.tsx:106,114`); user answer. |
| **D-C4** | **Chart Legend (web parity, run-32 web D-C3).** Add a Swift Charts legend labeling the **Sleep** bar + **Diet** line (`chartForegroundStyleScale`). User-picked despite the `HealthHeaderStats`/`HealthCalloutView` already color-labeling both series (the run-33 "would-subtract" verdict overridden by the user toward full web parity). | web SPEC D-C3 (`page.tsx:124`); user answer. |
| **D-DEPS** | **Small new dependency (2 co-located health helpers).** `HealthHeaderStats` (~14 LoC) + `HealthCalloutView` (~35 LoC) added to `ChartDetailComponents.swift` (the file's run-61 header already anticipated them). Everything else already ported: the API method/DTO/loader (`fetchHealthTimeline`/`HealthTimelineResponse`/`loadHealthTimeline`, foundation run 50), `ScrollableBarChart` (run 54), and every shared chart helper reused-not-redefined (run 61). | foundation grep; run-50/54/61. |
| **D-REL1** | **Phase 4 polish (#29, #34, #36).** #29 the kit detail load (frontend-kit **D-KIT-21**): the screen keeps its own `LoadState<HealthTimelineResponse>` filled by `APIClient.fetchHealthTimeline` (never `ProgramContext.healthTimeline`); `LoadStateContent` (spinner, offline view with no data, `ErrorStateView` + Retry — replaces the D-C2 banner) + `.loadStateChrome` (stale banner, reconnect reload). #34 keyed on the period: a switch resets to loading in the same event and a result for an older period is dropped; the `onDisappear` reload-to-week (F2) is gone. #36 the W/M/Y/P segments are spoken `Week` / `Month` / `Year` / `Program` (frontend-kit **D-KIT-22**). | `05e185a`; polish amendments PA9; iOS plan P-4, step 42 |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Per-program read authz added backend-side** on `GET /analytics/health/timeline` — was `authenticateToken`-only (web F1), so any authed user could fetch another program's timeline by crafting `programId`/`memberId`; since analytics 0.4.0 (D-C8) it requires an ACTIVE program membership or global admin (403 otherwise). `memberId` within the caller's own program is still not restricted server-side. | backend route | Changed backend-side (analytics D-C8); no iOS change. |
| **F2** | ~~**`onDisappear` reloads to `week`** — a legacy lifecycle quirk (resets the shared context timeline when leaving).~~ | `LifestyleTimelineDetailView.swift` `onDisappear` | *Removed at v0.1.2 (D-REL1) — nothing shared to reset.* |
| **F3** | **No view-as picker in-view** — scope comes purely from the `memberId` the card passes; member selection is gated upstream at the Lifestyle tab (run 56, matches web F2). | call sites | Kept (faithful). |
| **F4** | **Diet axis hard-pinned to 0–5** — if the API ever returned `food_quality > 5` the diet line would clip (faithful to the 1–5 daily-health diet scale, web F5). | `LifestyleTimelineDetailView.swift` chart | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.3 | 2026-10-14 | Month x-axis labels only 1/8/15/22/29 again — shared fix, [summary-activity-detail](../summary-activity-detail/SPEC.md) D-AXIS (ships in 1.5.2 (61)). |
| 0.1.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`05e185a`).** #29 own `LoadState` via `APIClient` (no shared writes) + kit error view / Retry (D-C2 banner superseded) / stale banner / offline view / reconnect reload (F2 retired); #34 a period switch resets to loading and an older period's result is dropped; #36 spoken `Week` / `Month` / `Year` / `Program` segments. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: the tap callout uses the shared `chartCalloutPlacement` (measured, flipped below the point when it would cross the top edge, clamped — never clipped; #46). |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 64) — the Lifestyle **sleep/diet timeline drill-down**, ported into `apps/ios/.../Features/Home/Detail/LifestyleTimelineDetailView.swift` (+ `HealthHeaderStats`/`HealthCalloutView` added to `ChartDetailComponents.swift`); deferred stub removed. **D-REF** (keep iOS-native — richer than web; `consumed_by=[ios]`) · **D-SCOPE** (single leaf view) · **D-S1** (faithful 1:1 native + 4 web-parity deviations; no tokenize — legacy already tokenized) · **D-C1** (dual Y-axis, web D-C2 analogue) · **D-C2** (web-parity error banner) · **D-C3** (axis unit labels "hrs"/"/ 5") · **D-C4** (chart Legend) · **D-DEPS** (2 co-located health helpers; everything else pre-ported). Flagged F1–F4. Read-only → `admin_only_data_entry` N/A; always member-scoped (gated upstream at the Lifestyle card). Build green-check owned by the user (Xcode); symbols grep-verified. |
