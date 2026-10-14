# Screen: `lifestyle-steps-timeline` (ios) — the daily-steps timeline drill-down

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.2 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Lifestyle tab's Steps Timeline card (`StepsTimelineCardSummary`) —
> ~~`StandardWorkoutTypesTab.swift` (`memberId: loggedInUserId`) **and** `AdminWorkoutTypesTab.swift`
> (`memberId: selectedMember?.id`)~~ *(0.1.2)* the shared `LifestyleCardsSection` (`StandardWorkoutTypesTab.swift`, both
> tabs) with `memberId: snapshot.key.memberId` (the member the cards show),
> `NavigationLink { StepsTimelineDetailView(initialPeriod:.week, memberId:) }`.
> **Provenance:** cloned from `Features/Home/Detail/LifestyleTimelineDetailView.swift` (the sleep/diet twin,
> [`lifestyle-timeline`](../lifestyle-timeline/SPEC.md)) — the steps-tracking run, 2026-07-09.
> **Web parity reference:** [`web lifestyle/steps-timeline`](../../web/lifestyle/steps-timeline/SPEC.md) — same
> daily-steps bar chart + daily-average-steps header; iOS is **richer** (native tap-callout, period selector,
> horizontally scrollable chart, member scope).
> **Consumes:** ~~`ProgramContext.loadHealthTimeline`~~ `APIClient.fetchHealthTimeline` into the screen's own
> `LoadState` (0.1.2, D-REL1) (`GET /analytics/health/timeline` — the additive `steps` per bucket +
> `daily_average_steps`; analytics 0.2.0). No write.
> **Stance:** faithful clone of the sleep/diet twin, reduced to a **single teal steps series** (drops the diet
> line / second axis / dual-axis). Oddities §10.

---

## 1. What it is + who uses it

The **daily-steps drill-down** — a full-screen, interactive Swift Charts view of daily step count (teal
`BarMark`s), a **period selector** (W/M/Y/P), a daily-average-steps header, and a **tap-callout**
("{n} steps"). Always member-scoped: the Steps Timeline card passes the viewer's own id (standard) or the
admin-selected member's id (admin). Used by all roles; member selection is gated upstream at the Lifestyle tab
card.

## 2. Why it exists

The Lifestyle-tab Steps Timeline card is a preview; tapping it opens this richer, period-switchable, scrubbable
chart of daily steps. It re-fetches the timeline on each period change. **Read-only** analytics — no logging,
no lock. The steps twin of [`lifestyle-timeline`](../lifestyle-timeline/SPEC.md).

## 3. Route / location

- **App:** `ios`. **Reached via:** the Lifestyle tab's `StepsTimelineCardSummary` →
  `StepsTimelineDetailView(initialPeriod: .week, memberId:)` — `memberId = loggedInUserId` (Standard tab) or
  ~~`selectedMember?.id`~~ the Admin tab's View-as scope (`snapshot.key.memberId`, 0.1.2).
- **Leaves to:** back only. No forward-nav (leaf detail). File added under the
  `FileSystemSynchronizedRootGroup` — no `pbxproj` edit.

## 4. Contents / sections

| Block | What |
|-------|------|
| Title + subtitle | "Steps Timeline" / "Daily steps". |
| Period selector | Segmented `Picker` over `AdminHomeView.Period.allCases` (W/M/Y/P); segments spoken `Week` / `Month` / `Year` / `Program` (D-REL1). |
| Daily-average header | Daily avg steps (~~`healthTimelineDailyAverageSteps`~~ the response's `daily_average_steps`, 0.1.2; grouped) + `rangeLabel`; shows once data is there. |
| Chart | `ScrollableBarChart` → a single teal `BarMark` on `point.steps ?? 0`; custom X-axis ticks; **single leading axis** labelled "steps" (no trailing axis — single-series). |
| Tap-callout | Drag gesture → `selectedLabel` → a native callout showing "{n} steps" (grouped) — **tooltip mandatory**. |
| Empty / loading / error | `LoadStateContent`: spinner while loading (offline with nothing → the offline `ErrorStateView`); "No data for this range yet." when the loaded `points.isEmpty`; ~~error banner on a failed load~~ a failed load → `ErrorStateView` + Retry (0.1.2, D-REL1). |

## 5. Components + features consumed

- **New this run:** `StepsTimelineDetailView` (`Features/Home/Detail/StepsTimelineDetailView.swift`) +
  `StepsTimelineCardSummary` (`Tabs/WorkoutTypesCards.swift`, the preview card).
- **Reused:** `ScrollableBarChart`, the shared chart helpers (`HeaderHeightKey`/`clamp`/`axisValues`/
  `shortLabel`/`calloutTitle`/`rangeLabel`), theme (`Color.teal`).
- **Features:** none as a module — ~~reads `ProgramContext` (`healthTimeline` + `healthTimelineDailyAverageSteps`
  + start/end dates) and calls `loadHealthTimeline` directly (faithful).~~ *(0.1.2, D-REL1)* loads its own
  `LoadState<HealthTimelineResponse>` through `APIClient`; reads only the program dates from `ProgramContext` and
  writes nothing shared. Kit: `LoadStateContent` + `.loadStateChrome` + `loadOutcome`.

## 6. Data / API

- **`GET /analytics/health/timeline?period=&programId=&memberId=`** (~~`ProgramContext.loadHealthTimeline`~~
  `APIClient.fetchHealthTimeline`, 0.1.2 — kept in the screen's own state, no shared write) —
  buckets per period; `HealthTimelinePoint` now carries `steps`, `HealthTimelineResponse` carries
  `daily_average_steps` (analytics 0.2.0 D-C5, additive). Read-only; `admin_only_data_entry` N/A.
- **Group-view semantics (analytics D-C5 / amendment A-4):** the program-wide (no `memberId`) buckets average
  over steps-bearing **member-day rows** (per-member-day average, mirroring Avg Sleep) — NOT a per-calendar-day
  group total.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin | Reached from the Admin Lifestyle tab card with `memberId: selectedMember?.id` (the admin's view-as selection, gated at the tab). No internal role gate. |
| logger / member | Reached from the Standard Lifestyle tab card with `memberId: loggedInUserId` (own data). No internal role gate. |

**No role-conditional UI** — the chart is identical for every role; only the `memberId` (set by the caller)
differs. **`admin_only_data_entry` = N/A** — read-only analytics, no logging.

## 8. States & edge cases

- **Loading (`task(id: period)`):** ~~`isLoading` → `ProgressView`~~ the kit spinner (0.1.2); offline with no data →
  the offline `ErrorStateView`, never a spinner.
- **Error:** ~~`errorMessage` set on a failed load → visible error banner.~~ *(superseded at v0.1.2 by D-REL1)* failed
  with no data → `ErrorStateView` + Retry; a failed Retry over shown bars → the bars stay with the floating
  `Couldn't refresh` · Retry banner; reload on reconnect.
- **Empty:** `points.isEmpty` → "No data for this range yet."
- **Period change:** ~~re-runs `load`~~ resets to loading in the same event and `.task(id: period)` loads; a result for
  a period no longer on screen is dropped (D-REL1). The old `onDisappear` reload-to-week (an undocumented twin of
  lifestyle-timeline F2) is gone.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Keep iOS-native** — cloned from the richer `LifestyleTimelineDetailView` (native tap-callout, period selector, scrollable chart, member scope), NOT flattened toward web. `consumed_by=[ios]`. | sibling `lifestyle-timeline` SPEC; [[ios-matches-web-not-just-legacy]]. |
| **D-SCOPE** | Single leaf detail view added by the steps-tracking run; ports the view + the `StepsTimelineCardSummary` preview; no forward-nav. | steps-tracking plan steps 45-47. |
| **D-C1** | **Single teal steps series** — one leading axis labelled "steps" on `point.steps ?? 0`; drops the sleep-bars/diet-line dual-axis of the twin. Teal `Color.teal` (`#14b8a6`, DC-8). Native tap-callout kept ("{n} steps", tooltip mandatory). | steps-tracking plan step 47/DC-8. |
| **D-DEPS** | **No new shared dependency** — `loadHealthTimeline`/`ScrollableBarChart`/the chart helpers all pre-ported; the `steps` field is additive (analytics 0.2.0). | foundation; `lifestyle-timeline` run. |
| **D-REL1** | **Phase 4 polish (#29, #34, #36).** #29 the kit detail load (frontend-kit **D-KIT-21**): the screen keeps its own `LoadState<HealthTimelineResponse>` filled by `APIClient.fetchHealthTimeline` (never `ProgramContext.healthTimeline`); `LoadStateContent` (spinner, offline view with no data, `ErrorStateView` + Retry — replaces the error banner) + `.loadStateChrome` (stale banner, reconnect reload). #34 keyed on the period: a switch resets to loading in the same event and a result for an older period is dropped; the `onDisappear` reload-to-week is gone. #36 the W/M/Y/P segments are spoken `Week` / `Month` / `Year` / `Program` (frontend-kit **D-KIT-22**). | `05e185a`; polish amendments PA9; iOS plan P-4, step 43 |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Per-program read authz added backend-side** on `GET /analytics/health/timeline` — was `authenticateToken`-only, so any authed user could fetch another program's timeline by crafting `programId`/`memberId`; since analytics 0.4.0 (D-C8) it requires an ACTIVE program membership or global admin (403 otherwise). `memberId` within the caller's own program is still not restricted server-side. | backend route | Changed backend-side (analytics D-C8); no iOS change. |
| **F2** | **No view-as picker in-view** — scope comes purely from the `memberId` the card passes; member selection is gated upstream at the Lifestyle tab. | call sites | Kept (faithful; same as the twin F3). |
| **F3** | **Group buckets are a per-member-day average**, not a per-calendar-day total (analytics D-C5 / amendment A-4) — deliberate, mirroring Avg Sleep. | backend `GET /analytics/health/timeline` | Kept (deliberate). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.2 | 2026-10-13 | **D-REL1 — Phase 4 polish (`05e185a`).** #29 own `LoadState` via `APIClient` (no shared writes) + kit error view / Retry (replaces the error banner) / stale banner / offline view / reconnect reload; #34 a period switch resets to loading and an older period's result is dropped; #36 spoken `Week` / `Month` / `Year` / `Program` segments. |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: the tap callout uses the shared `chartCalloutPlacement` (measured, flipped below the point when it would cross the top edge, clamped — never clipped; #46). |
| 0.1.0 | 2026-07-09 | Initial SPEC + build (steps-tracking run) — the **daily-steps** timeline drill-down, cloned from `LifestyleTimelineDetailView` into `Features/Home/Detail/StepsTimelineDetailView.swift`: title "Steps Timeline"/"Daily steps", single teal `steps` `BarMark` on one leading "steps" axis (drops the diet line/second axis), daily-average-steps header (`healthTimelineDailyAverageSteps`, grouped), native "{n} steps" tap-callout (tooltip mandatory), period picker + `loadHealthTimeline` reload. Reached from the new `StepsTimelineCardSummary` on both Lifestyle tabs. Reuses `loadHealthTimeline` (the `steps`/`daily_average_steps` fields are additive — analytics 0.2.0 D-C5, per-member-day group semantics per amendment A-4). `consumed_by=[ios]`; read-only → `admin_only_data_entry` N/A. Build green-check owned by the user (Xcode). |
