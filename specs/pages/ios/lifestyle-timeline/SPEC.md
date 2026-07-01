# Screen: `lifestyle-timeline` (ios) — the Sleep · Diet-quality timeline drill-down

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Lifestyle tab's timeline card (`LifestyleTimelineCardSummary`) —
> `StandardWorkoutTypesTab.swift` (`memberId: loggedInUserId`) **and** `AdminWorkoutTypesTab.swift`
> (`memberId: selectedMember?.id`), `NavigationLink { LifestyleTimelineDetailView(initialPeriod:.week, memberId:) }`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Helpers/AdminHomeHelpers.swift`
> (`LifestyleTimelineDetailView`, lines 1133-1332); helpers in `Features/Home/Detail/ActivityTimelineViews.swift`
> (`HealthHeaderStats` :4, `HealthCalloutView` :116).
> **Web parity reference:** [`web lifestyle/timeline`](../../web/lifestyle/timeline/SPEC.md) — same sleep-hours bars +
> diet-quality line + daily-average header; iOS is **richer** (native tap-callout, period selector, horizontally
> scrollable chart, member scope). The web run-32 chart cleanups (dual Y-axis, Legend, axis unit labels) are matched
> (D-C1/D-C3/D-C4).
> **Consumes:** `ProgramContext.loadHealthTimeline` (`GET /analytics/health/timeline`); reads already-loaded points.
> No write.
> **Stance:** faithful 1:1 port of the legacy iOS view (kept iOS-native, D-REF) **+ D-C1 (dual Y-axis) + D-C2
> (web-parity error banner) + D-C3 (axis unit labels) + D-C4 (chart Legend)**. Oddities §10.

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
  `selectedMember?.id` (Admin tab).
- **Leaves to:** back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Title + subtitle | "Lifestyle Timeline" / "Sleep · Diet quality". | legacy `:1173-1178` |
| Period selector | Segmented `Picker` over `AdminHomeView.Period.allCases` (W/M/Y/P). | legacy `:1181-1186` |
| Daily-average header | `HealthHeaderStats` (avg sleep hrs + diet /5 + `rangeLabel`); height captured via `HeaderHeightKey`, reserved when a callout shows. | legacy `:1188-1203` |
| Chart | `ScrollableBarChart` → sleep-hours `BarMark` (`appBlue` @0.9) + diet-quality `LineMark`/`PointMark` (`appGreen`); custom X-axis ticks via `axisValues`/`shortLabel`; **dual Y-axis** (D-C1). | legacy `:1213-1268` |
| Tap-callout | Drag gesture → `selectedLabel` → `HealthCalloutView` (sleep + diet) positioned via `clamp` over the tapped point. | legacy `:1269-1305` |
| Empty / loading / error | `ProgressView` while loading; "No data for this range yet." when `points.isEmpty`; **error banner** when a load fails (D-C2). | legacy `:1205-1212` |

## 5. Components + features consumed

- **Components (new this run, added to `Features/Home/Detail/ChartDetailComponents.swift`):** `HealthHeaderStats`,
  `HealthCalloutView` — the health twins of `HeaderStats`/`CalloutView`, co-located in the legacy deferred
  `ActivityTimelineViews.swift` so never pulled into the foundation (run-55/56/61 co-located-helper pattern).
  **Reused (run 61, not redefined):** `HeaderHeightKey`, `clamp`, `axisValues`, `shortLabel`, `programMonthLabels`,
  `calloutTitle`×2, `formatCalloutDate`, `rangeLabel`×2. **Reused (run 54):** `ScrollableBarChart`.
- **Features:** none as a module — reads `ProgramContext` (`healthTimeline` + `healthTimelineDailyAverageSleep`/
  `Food` + start/end dates) and calls its loader directly (faithful).

## 6. Data / API

- **`GET /analytics/health/timeline?period=&programId=&memberId=`** (`ProgramContext.loadHealthTimeline(period:memberId:)`,
  `APIClient+Analytics.swift:194`) — buckets per period; sets `healthTimeline` + `healthTimelineDailyAverageSleep` +
  `healthTimelineDailyAverageFood`. Response `HealthTimelineResponse` / `HealthTimelinePoint`
  (`date`/`label`/`sleep_hours`/`food_quality`), already ported (foundation run 50). Read-only;
  `admin_only_data_entry` N/A.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin | Reached from the Admin Lifestyle tab card with `memberId: selectedMember?.id` (the admin's view-as selection, gated at the tab, run 56). No internal role gate — the `memberId` param sets scope. |
| logger / member | Reached from the Standard Lifestyle tab card with `memberId: loggedInUserId` (own data). No internal role gate. |

**No role-conditional UI** — the chart is identical for every role; only the `memberId` (set by the caller) differs
(matches web F3). **`admin_only_data_entry` = N/A** — read-only analytics, no logging (read-vs-write axis).

## 8. States & edge cases

- **Loading (`task(id: period)`):** `isLoading` → `ProgressView`.
- **Error (D-C2):** `errorMessage` set on a failed load → **visible error banner** (web `/lifestyle/timeline`
  surfaces `<ErrorState>`, `page.tsx:65-66`; legacy iOS captured `errorMessage` but rendered it nowhere → the
  run-52/54 swallow-vs-surface ADD).
- **Empty:** `points.isEmpty` → "No data for this range yet." (matches web `points.length === 0`).
- **Period change:** re-runs `load`.
- **On disappear:** reloads the timeline back to `week` — a legacy lifecycle quirk (F2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Keep iOS-native.** The legacy iOS view is **richer** than web `/lifestyle/timeline` (native tap-callout, period selector, horizontally-scrollable chart, member scope) — kept as a platform idiom (run-52/53/61 exception), NOT simplified toward web's flatter recharts. Web parity holds at the data/destination level. `consumed_by=[ios]`. | legacy file; web SPEC; run-61; [[ios-matches-web-not-just-legacy]]; user answer. |
| **D-SCOPE** | **Single leaf detail view — its own run** (the last non-widget deferred stub). Ports the view + its 2 co-located health helpers; no forward-nav to defer; the deferred stub removed. | `_DeferredScreenStubs.swift`; call sites. |
| **D-S1** | **Stance = faithful 1:1** of the legacy interactive view (keep the native richness — run-61 iOS-richer shape) **+ the 4 web-parity chart deviations** below. Legacy already tokenizes chart colors (`Color.appBlue`/`appGreen`), so **no tokenize cleanup** (unlike run 61). | legacy file; user answer. |
| **D-C1** | **Dual Y-axis (web parity, run-32 web D-C2 analogue).** Legacy plots sleep-hours (0–12) and diet-quality (1–5) on ONE shared axis (`yMax = max(sleep, food)`, `chartYScale(0...yMax*1.1)`) — the diet line sits flattened under the sleep bars. The port scales the diet series onto its own **0–5 axis** (`scaledFood = food/5 * sleepDomainMax`) with sleep on the **leading** axis and a **trailing** 0–5 axis; callout/scroll/period selector kept (native richness preserved). | legacy `:1167-1169,1266`; web SPEC D-C2 (`page.tsx:102-115`); user answer. |
| **D-C2** | **Web-parity error banner.** Legacy set `errorMessage` on a failed load but rendered it nowhere (swallowed); web surfaces `<ErrorState>`. Wire the (previously-dead) `errorMessage` to a visible `errorBanner` (the run-54 `AdminSummaryTab` banner shape). | legacy `:1329`; web `page.tsx:65-66`; run-52/54; user answer. |
| **D-C3** | **Axis unit labels (web parity, run-32 web D-C4).** Label the leading (sleep) axis **"hrs"** and the trailing (diet) axis **"/ 5"** so the two scales are self-explanatory (meaningful now that D-C1 splits them). | web SPEC D-C4 (`page.tsx:106,114`); user answer. |
| **D-C4** | **Chart Legend (web parity, run-32 web D-C3).** Add a Swift Charts legend labeling the **Sleep** bar + **Diet** line (`chartForegroundStyleScale`). User-picked despite the `HealthHeaderStats`/`HealthCalloutView` already color-labeling both series (the run-33 "would-subtract" verdict overridden by the user toward full web parity). | web SPEC D-C3 (`page.tsx:124`); user answer. |
| **D-DEPS** | **Small new dependency (2 co-located health helpers).** `HealthHeaderStats` (~14 LoC) + `HealthCalloutView` (~35 LoC) added to `ChartDetailComponents.swift` (the file's run-61 header already anticipated them). Everything else already ported: the API method/DTO/loader (`fetchHealthTimeline`/`HealthTimelineResponse`/`loadHealthTimeline`, foundation run 50), `ScrollableBarChart` (run 54), and every shared chart helper reused-not-redefined (run 61). | foundation grep; run-50/54/61. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **No per-program read authz** on `GET /analytics/health/timeline` (`authenticateToken`-only, web F1) — any authed user could fetch another program's timeline by crafting `programId`/`memberId`. Cross-feature backend hardening. | backend route | Kept (faithful); backend concern. |
| **F2** | **`onDisappear` reloads to `week`** — a legacy lifecycle quirk (resets the shared context timeline when leaving). | `LifestyleTimelineDetailView.swift` `onDisappear` | Kept (faithful). |
| **F3** | **No view-as picker in-view** — scope comes purely from the `memberId` the card passes; member selection is gated upstream at the Lifestyle tab (run 56, matches web F2). | call sites | Kept (faithful). |
| **F4** | **Diet axis hard-pinned to 0–5** — if the API ever returned `food_quality > 5` the diet line would clip (faithful to the 1–5 daily-health diet scale, web F5). | `LifestyleTimelineDetailView.swift` chart | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 64) — the Lifestyle **sleep/diet timeline drill-down**, ported into `apps/ios/.../Features/Home/Detail/LifestyleTimelineDetailView.swift` (+ `HealthHeaderStats`/`HealthCalloutView` added to `ChartDetailComponents.swift`); deferred stub removed. **D-REF** (keep iOS-native — richer than web; `consumed_by=[ios]`) · **D-SCOPE** (single leaf view) · **D-S1** (faithful 1:1 native + 4 web-parity deviations; no tokenize — legacy already tokenized) · **D-C1** (dual Y-axis, web D-C2 analogue) · **D-C2** (web-parity error banner) · **D-C3** (axis unit labels "hrs"/"/ 5") · **D-C4** (chart Legend) · **D-DEPS** (2 co-located health helpers; everything else pre-ported). Flagged F1–F4. Read-only → `admin_only_data_entry` N/A; always member-scoped (gated upstream at the Lifestyle card). Build green-check owned by the user (Xcode); symbols grep-verified. |
