# Screen: `AdminWorkoutTypesTab` / `StandardWorkoutTypesTab` (ios) — the Lifestyle tab (Tab 3)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.3.0 · **App:** `ios` (SwiftUI)
> **Location:** Tab 3 **"Lifestyle"** (`leaf.fill`) of `AdminHomeView`'s bottom `TabView` — the iOS analogue of
> the web `/lifestyle` workspace tab. Role-bifurcated by `programContext.isProgramAdmin`:
> `AdminWorkoutTypesTab` (program/global admin — view-as picker) vs `StandardWorkoutTypesTab` (logger/member —
> own data only).
> **Reference impl (legacy iOS):** `ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/StandardWorkoutTypesTab.swift`
> (both tab structs) + the cards in `.../Features/Home/Helpers/AdminHomeHelpers.swift`.
> **Web sibling (co-equal reference):** [`specs/pages/web/lifestyle/SPEC.md`](../../web/lifestyle/SPEC.md) —
> the built `/lifestyle` read dashboard. Per memory `ios-matches-web-not-just-legacy` this run matches the
> built web app, resolving divergences toward web parity unless there's a platform reason.
> **Consumes:** the already-ported foundation (run 50) — ~~`ProgramContext` workout-type/health-timeline
> analytics loaders~~ `ProgramContext.loadLifestyle` (`ProgramContext+Lifestyle.swift`, 0.3.0 — D-REL1) + DTOs, the
> workout-popularity logic + components
> (`Shared/Components/WorkoutPopularity{Logic,Components}.swift`), `CardShell` + `ScrollableBarChart`
> (ported run 54), `MemberPickerView` + `GlassButton` (ported run 55), the kit `LoadStateContent` /
> `loadStateChrome` (0.3.0), theme, Swift Charts.
> **Stance:** faithful 1:1 port. ~~NO web-parity ADD (both web and legacy iOS swallow load errors — parity).~~
> *(superseded at v0.3.0 by D-REL1 — honest load states, the Summary recipe.)*

---

## 1. What it is + who uses it

The **Lifestyle overview tab** — Tab 3 of the post-pick home shell. Despite the tab name it is a **read-only**
**workout-type-analytics + health-timeline** surface (not a sleep/diet *logging* screen), the iOS twin of web
`/lifestyle`. It shows either the signed-in member's own numbers or — for admins — a **"view as"** picker that
swaps every card to a chosen member's (or program-wide) data. Used by **every enrolled member**; the picker
and the default scope vary by role (§7).

Blocks (both variants): a header ("Lifestyle" + program name + a `GlassButton` "dumbbell" → the workout-type
manager), 4 workout-type **stat cards** (Total types / Most popular / Longest duration / Highest
participation), a **Workout Type Popularity** card (sortable ranked-bar list with a count/minutes/avg metric
toggle + top-6/show-all on compact), and a clickable **Lifestyle Timeline** card (sleep-bars + diet-quality-
line Swift Chart over the last 10 week buckets) → the timeline detail. The Admin variant adds the **view-as**
selector above the cards.

## 2. Why it exists

The workspace's lifestyle lens: a member checks which workout types they do most and how their sleep/diet
trends; an admin inspects any member's (or the whole program's) workout-type mix without leaving the tab. It
is the hub that fans out to the workout-type **management** screen (`ViewWorkoutTypesListView`, the write
path = web `/lifestyle/workouts`) and the full **timeline detail** (`LifestyleTimelineDetailView` = web
`/lifestyle/timeline`).

## 3. Route / location

- **App:** `ios`. **Location:** `AdminHomeView` Tab 3 (`Tab.workoutTypes`, label "Lifestyle"/`leaf.fill`),
  selected via `@ViewBuilder workoutTypesTab` → `programContext.isProgramAdmin ? AdminWorkoutTypesTab() :
  StandardWorkoutTypesTab()` ([AdminHomeView.swift:73-78](../../../../apps/ios/RaSi-Fiters-App/Features/Home/AdminHomeView.swift#L73)).
- **Reached:** after program pick (the shell is pushed by `ProgramPickerView` → `AdminHomeView`); Tab 3 of 4.
- **Leaves to** (both deferred as `ScaffoldPlaceholder` stubs this run — F3):
  - `ViewWorkoutTypesListView()` — the workout-type add/edit/delete/visibility **manager** (web
    `/lifestyle/workouts`, the write path where `admin_only_data_entry` actually bites), reached via the
    header's dumbbell `GlassButton`.
  - `LifestyleTimelineDetailView(initialPeriod: .week, memberId:)` — the full sleep/diet timeline with a
    period selector (web `/lifestyle/timeline`), reached via the timeline card.

## 4. Contents / sections

| Block | What | Reference `file:line` (legacy) |
|---|---|---|
| Header (Standard) | Inline `HStack`: "Lifestyle" + program name + a dumbbell `GlassButton` → `ViewWorkoutTypesListView`. | `StandardWorkoutTypesTab.swift:19-37` |
| Header (Admin) | `WorkoutTypesHeader(title:subtitle:)` — same shape, dumbbell `GlassButton` → `ViewWorkoutTypesListView`. | `AdminHomeHelpers.swift:90-114` |
| View-as selector (Admin only) | Button → `MemberPickerView` sheet (`showNoneOption: true`, `noneLabel` = "None" global / "Admin" program-admin); label = selected member / "Admin" / own name. | `StandardWorkoutTypesTab.swift:251-285` |
| 4 stat cards | `WorkoutTypesTotalCard` · `WorkoutTypeMostPopularCard` · `WorkoutTypeLongestDurationCard` · `WorkoutTypeHighestParticipationCard` — 2×2 grid over `CardShell` + `AccentChip("Program to date")`. | `AdminHomeHelpers.swift:448-591` |
| **Steps analytics card** (0.2.0) | `StepsStatsCard(stats:)` — full-width `CardShell` (teal, `AccentChip("Program to date")`); "Total steps" / "Avg steps/day" from `loadStepsStats` (`GET /analytics/health/steps`); inserted directly after the stat row (DC-9). | `Tabs/WorkoutTypesCards.swift` |
| Workout Type Popularity | `WorkoutTypePopularityCard(types:)` — `SegmentedMetricPicker` (count/minutes/avg) + `RankedBarList` + top-6/show-all on compact. | `AdminHomeHelpers.swift:593-676` |
| Lifestyle Timeline card | `LifestyleTimelineCardSummary(points:)` — `CardShell(height:280)` + `ScrollableBarChart` Swift Chart (sleep `BarMark` + diet `LineMark`/`PointMark`), last 10 buckets → timeline detail. | `AdminHomeHelpers.swift:789-876` |
| **Steps Timeline card** (0.2.0) | `StepsTimelineCardSummary(points:)` — clone of the Lifestyle Timeline card, single teal `steps` `BarMark`; inserted after the Lifestyle Timeline card (DC-9) → `StepsTimelineDetailView`. | `Tabs/WorkoutTypesCards.swift` |
| **Cards section** (0.3.0, D-REL1) | `LifestyleCardsSection(snapshot:)` — the cards above for one loaded `LifestyleSnapshot`, shared by both tabs and wrapped in `LoadStateContent`; a part whose read failed shows `—` (stat cards / Steps card) or `PlaceholderCard` `—` (popularity, both timelines); the timeline drill-downs open for `snapshot.key.memberId`. | `Tabs/StandardWorkoutTypesTab.swift` |

## 5. Components + features consumed

- **Ported THIS run** (from `AdminHomeHelpers.swift` → new `Tabs/WorkoutTypesCards.swift`): `WorkoutTypesHeader`,
  `WorkoutTypesTotalCard`, `WorkoutTypeMostPopularCard`, `WorkoutTypeLongestDurationCard`,
  `WorkoutTypeHighestParticipationCard`, `WorkoutTypePopularityCard`, `LifestyleTimelineCardSummary`; + the
  tiny `AccentChip` → `Shared/Components/AccentChip.swift` (the run-55 `GlassButton` situation — a small shared
  chip co-located in the legacy helper file, never pulled into the foundation).
- **Already ported (reused, no new dep):** `CardShell` + `ScrollableBarChart` (run 54), `WorkoutPopularityMetric`/
  `workoutPopularitySorted`/`workoutTypePaletteColor`/`RankedBarList`/`SegmentedMetricPicker`
  (`Shared/Components/WorkoutPopularity*`, foundation run 50), `MemberPickerView` (run 55), `GlassButton`
  (run 55), theme (`Color.appBackground`/`appBlue`/`appGreen`/`appOrange`, `.adaptiveBackground`), Swift Charts.
- **Context loaders (foundation run 50):** ~~`loadWorkoutTypesTotal`, `loadWorkoutTypeMostPopular`,
  `loadWorkoutTypeLongestDuration`, `loadWorkoutTypeHighestParticipation`, `loadWorkoutTypes`,
  `loadHealthTimeline`~~ *(deleted at v0.3.0 — D-REL1)* `loadLifestyle(memberId:)` (0.3.0), `loadLookupData`;
  `membersProgramId`, `isProgramAdmin`/`isGlobalAdmin`.

## 6. Data / API

Read-only. Zero backend work, NO new api fn — every loader landed in the foundation (run 50).
**0.3.0 (D-REL1):** the seven reads run in parallel inside `ProgramContext.loadLifestyle(memberId:)`
(`Shared/Models/ProgramContext+Lifestyle.swift`), which returns a `LifestyleSnapshot` for a
`LifestyleKey(programId, memberId)` (a nil part = that read failed) + the first failure, returns nil when superseded
(cancelled / the program changed), and writes **no shared field** — so it no longer overwrites Summary's program-wide
`workoutTypes`. The per-part `ProgramContext` loaders were deleted; the table names the `APIClient` read each part uses.

| Read (in `loadLifestyle`) | Endpoint | Notes |
|---|---|---|
| `fetchWorkoutTypesTotal(memberId?)` | `GET /analytics-v2/workouts/types/total` | `{total_types}`. |
| `fetchWorkoutTypeMostPopular(memberId?)` | `…/most-popular` | `{workout_name, sessions}`. |
| `fetchWorkoutTypeLongestDuration(memberId?)` | `…/longest-duration` | `{workout_name, avg_minutes}`. |
| `fetchWorkoutTypeHighestParticipation(memberId: nil)` | `…/highest-participation` | **always program-wide** — `memberId` never sent (F2, mirrors web F4). |
| `fetchWorkoutTypes(memberId?)` | `GET /analytics/workouts/types` | popularity list, sorted/sliced client-side. |
| `fetchHealthTimeline(period: "week", memberId?)` | `GET /analytics/health/timeline` | only last 10 buckets render (Lifestyle + Steps timeline cards; now carries `steps` + `daily_average_steps`). |
| `fetchHealthSteps(memberId?)` (0.2.0) | `GET /analytics/health/steps` | `{total_steps, avg_steps_per_day, days}` → the Steps analytics card (analytics 0.2.0 D-C5). |

## 7. Role-based view rules

Roles derive from `programContext.isGlobalAdmin` + `isProgramAdmin` (= `my_role=="admin" || isGlobalAdmin`).
The tab is selected by `AdminHomeView`: admin → `AdminWorkoutTypesTab`, non-admin → `StandardWorkoutTypesTab`.

| Role | Picker / default scope | Cards |
|---|---|---|
| **global_admin** | `AdminWorkoutTypesTab` — view-as picker with a **"None"** row; default = **program-wide** (`selectedMember == nil` → loaders sent `memberId: nil`). Label "Admin" when none. | Any member's data, or program-wide. Header dumbbell → manage workout types. |
| **program admin** (`my_role=="admin"`) | `AdminWorkoutTypesTab` — picker with the none row labelled **"Admin"**; **auto-selects self** on first load (`applyDefaultSelectionIfNeeded`) until the user picks. 0.3.0: the default scope is the admin's own id from the first load (`scopeMemberId`, no roster needed — D-REL1). | View-as any member; manage workout types. |
| **logger** (`my_role=="logger"`) | `StandardWorkoutTypesTab` — **no picker**, own data only (`memberId = loggedInUserId`). | Own analytics. Header dumbbell → view workout types. |
| **member** (active, non-admin/logger) | `StandardWorkoutTypesTab` — **no picker**, own data only. | Own analytics. |

**`admin_only_data_entry`:** **N/A on this tab** — it performs **no data entry** (read-only analytics; every
card is display + forward-nav). The lock gates the deferred `ViewWorkoutTypesListView` write path (and the log
forms on `/summary`), not this landing — the read-vs-write axis (runs 31/36/54/55).

## 8. States & edge cases

- **Loading:** ~~Standard shows a centered `ProgressView` while loading; Admin loads in-place (cards show their
  own "N/A"/"No data" until data arrives).~~ *(superseded at v0.3.0 by D-REL1)* Both tabs: the kit spinner until the
  first snapshot for the key arrives (offline with nothing → the offline `ErrorStateView`); every visit reloads under the
  kept cards (admin re-entry included); pull-to-refresh reloads. `isLoading` + `reloadQueued` still serialize Admin's
  `load()` (a change during a load is queued; a result lands only if the key is unchanged).
- **Empty:** stat cards → "N/A" / "No data"; popularity → "No workouts logged yet."; timeline → spinner +
  "No data yet". (A part that loaded empty keeps this text; a part that **failed** reads `—` — D-REL1.)
- **Error:** ~~**swallowed** — both tabs assign `errorMessage = programContext.errorMessage` but **render it
  nowhere** (F1). Web `/lifestyle` also surfaces no error banner (per-card empty states only), so
  faithful-swallow IS web parity — NO ADD this run.~~ *(superseded at v0.3.0 by D-REL1)* every read failed →
  `ErrorStateView` + Retry; some parts loaded, or a failed refresh over kept cards → the cards stay (a failed part keeps
  its last good value for the same key, else `—`) with the floating `Couldn't refresh` · Retry banner; reload on
  reconnect.
- **Program switch:** `.onChange(of: programContext.programId)` reloads; ~~non-global-admin resets the view-as
  selection~~ *(0.3.0, D-REL1)* "View as" resets for every role (global admins too), and the cards go to the spinner in
  the same event — never the previous program's numbers.
- **View-as pick (Admin, 0.3.0):** `onChange(of: currentKey)` sets `.loading` when the (program, member) key changes —
  in the same event as the pick — then loads; the previous member's numbers never sit under the new label.

## 9. Decisions made

| ID | Decision | Basis |
|---|---|---|
| **D-REF** | Reference = legacy `Tabs/StandardWorkoutTypesTab.swift` (both structs) + `Helpers/AdminHomeHelpers.swift` (cards), matched against the built web `/lifestyle` ([web SPEC](../../web/lifestyle/SPEC.md)). The web "Manage/View workouts" pill ⇄ iOS dumbbell `GlassButton` is a **cosmetic idiom divergence** (icon-only vs labelled, same destination) → keep iOS-native, flag (F4); the card set + role gating already match web, so not a parity gap. `consumed_by=[ios]`. | user answer; web SPEC §7. |
| **D-SCOPE** | **The scope cut IS the run.** Port the 2 role-bifurcated tab bodies + the 7 cards (`WorkoutTypesHeader` + 4 stat + popularity + timeline-card) + `AccentChip`. **Defer** `ViewWorkoutTypesListView` (workout-type CRUD = web `/lifestyle/workouts`) and `LifestyleTimelineDetailView(initialPeriod:memberId:)` (web `/lifestyle/timeline`) as `ScaffoldPlaceholder` stubs (the run-21/50/52-55 pattern). `ProgramWorkoutTypesSection` not stubbed — only `AdminProgramTab` (itself a stub) references it. | user answer ("2 tabs + cards, defer 2 details"). |
| **D-REF2** | **D-REF (keep iOS-native idiom) at the navigation altitude** — iOS reaches workout-type management via an icon button on the Lifestyle header (Admin via `WorkoutTypesHeader`, Standard inline) AND admins also via the Program tab's `ProgramWorkoutTypesSection`; web puts a labelled pill on the `/lifestyle` header. Both clients reach the same manager → idiom, not a gap (runs 52/53). | `AdminHomeHelpers.swift:107-111`, `StandardWorkoutTypesTab.swift:32-36`; web SPEC §4. |
| **D-S1** | **Stance = faithful 1:1**, NO web-parity ADD. Port both tabs + cards verbatim. ~~The behavior-diff comes back empty: web `/lifestyle` has no error banner (per-card empty states), legacy iOS swallows its `errorMessage` too → both-swallow = parity (the run-53/55 shape — unlike run-52/54 where only web surfaced → an ADD).~~ *(The "faithful swallow" is superseded at v0.3.0 by D-REL1 — honest states on all three surfaces.)* | user answer ("Faithful 1:1, NO error-banner ADD"). |
| **D-DEPS** | **ONE small new shared component** — `AccentChip` (13-line capsule chip), co-located in the legacy `AdminHomeHelpers.swift`, never pulled into the foundation (the run-55 `GlassButton` situation). Everything else already ported (run 50/54/55): `CardShell`, `ScrollableBarChart`, the `WorkoutPopularity*` logic+components, DTOs, `MemberPickerView`, theme. Zero new api fn. | dep-purity grep (foundation). |
| **D-REL1** | **Phase 4 polish (#31, #10, #36, #43).** #31 honest, keyed Lifestyle (analytics **D-C11**, analytics-v2 **D-C6**; frontend-kit **D-KIT-21**): each tab keeps its own `LoadState<LifestyleSnapshot>` keyed by (program, member) and loads it with `ProgramContext.loadLifestyle` (7 parallel reads, no shared writes; the 8 shared analytics loaders deleted — iOS plan P-5); `LoadStateContent` (spinner / offline view / `ErrorStateView` + Retry) + `.loadStateChrome` (stale banner, reconnect reload), `.refreshable`, a reload on every visit; a failed part reads `—` (never a fake 0 / "N/A" / "No data"), a part that failed on refresh keeps its last good value for the same key (A13). #10 keyed View-as (frontend-kit **D-KIT-23**, PA6): Admin `onChange(of: currentKey)` sets `.loading` in the same event as the pick; default scope `selectedMember?.id ?? (!hasUserChosenViewAs && !isGlobalAdmin ? loggedInUserId : nil)`; "View as" resets on a program switch for every role; Standard resets to loading on a program switch. #36 the dumbbell `GlassButton` is spoken `Workout types` (frontend-kit **D-KIT-22**). #43 light-mode value contrast: the Total-types value `#C2410C` and the Highest-participation value `#15803D` (≥ 4.5:1 on white; dark keeps system orange / green), local to the cards (palette tokens untouched — D-KIT-10). | `05e185a`; polish amendments PA6; iOS plan P-5, steps 38–40 |

## 10. Flagged characteristics kept as-is

- ~~**F1 — vestigial `errorMessage`:** both tabs set `errorMessage = programContext.errorMessage` but never
  render it (`StandardWorkoutTypesTab.swift:118`, `AdminWorkoutTypesTab` `:247`). Kept faithful (web swallows
  too — D-S1). Rebuild-cleanup candidate.~~ *(resolved at v0.3.0 by D-REL1 — `errorMessage` removed; failures render.)*
- **F2 — highest-participation always program-wide:** ~~`loadWorkoutTypeHighestParticipation(memberId: nil)`~~
  `fetchWorkoutTypeHighestParticipation(memberId: nil)` in `loadLifestyle` (0.3.0)
  even when a member is selected — mirrors web F4. Faithful.
- **F3 — 2 deferred forward-nav stubs:** `ViewWorkoutTypesListView` (web `/lifestyle/workouts`) +
  `LifestyleTimelineDetailView` (web `/lifestyle/timeline`) — `ScaffoldPlaceholder` until their own runs.
- **F4 — icon-only manage button:** iOS uses a dumbbell `GlassButton` (no label) vs web's labelled
  "Manage workouts"/"View workouts" pill — cosmetic platform idiom, kept native (D-REF/D-REF2).
- **F5 — client role gating only:** the view-as picker + variant selection are client-side
  (`isProgramAdmin`/`isGlobalAdmin`); the backend analytics endpoints are the real authorization boundary
  (mirrors web F1). Faithful.
- **F6 — Admin `hasUserChosenViewAs` / "Admin" label nuance:** the Admin tab tracks whether the user has
  explicitly chosen a view-as target to decide the "Admin" vs own-name default label
  (`AdminWorkoutTypesTab.swift:129,139-142,287-295`) — a small state machine the Standard tab lacks. Faithful.

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.3.0 | 2026-10-13 | **D-REL1 — Phase 4 polish (`05e185a`).** #31 each tab keeps its own keyed `LoadState<LifestyleSnapshot>` (`loadLifestyle`: 7 parallel reads, no shared writes; 8 shared loaders deleted), kit error view + Retry, stale banner, pull-to-refresh, reload every visit, failed parts `—` (D-S1 / F1 swallow superseded); #10 View-as keyed in the same event as the pick, reset on a program switch for every role; #36 `Workout types` label; #43 darker light-mode orange / green values. |
| 0.2.1 | 2026-10-13 | Phase 4 quick wins: the seven reads run in parallel; the standard tab spins only for a program's first load; a View-as change during an admin load is queued, not dropped (#5); load errors use the kit copy (#8). |
| 0.2.0 | 2026-07-09 | **Steps analytics + Steps Timeline cards** (analytics 0.2.0 D-C5). Added `StepsStatsCard` (full-width teal card, Total steps / Avg steps/day) directly after the stat row and `StepsTimelineCardSummary` (single teal `steps` bar) after the Lifestyle Timeline card (DC-9) → `StepsTimelineDetailView` (both tabs). `load()` adds `loadStepsStats(memberId:)` (Admin = selected member, Standard = self); `loadHealthTimeline` also sets `healthTimelineDailyAverageSteps`. New cards in `Tabs/WorkoutTypesCards.swift`; wiring in `AdminWorkoutTypesTab`/`StandardWorkoutTypesTab`. Build green-check owned by the user (Xcode). |
| 0.1.0 | 2026-06-30 | Initial faithful port — `AdminWorkoutTypesTab`/`StandardWorkoutTypesTab` + 7 cards + `AccentChip`; `ViewWorkoutTypesListView` + `LifestyleTimelineDetailView` deferred as stubs (run 56). |
