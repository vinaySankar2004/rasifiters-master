# Screen: `summary-workout-types-detail` (ios) — the Workout Types drill-down

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `AdminSummaryTab`'s workout-types card
> (`AdminSummaryTab.swift:271-280`, `NavigationLink { WorkoutTypesDetailView(types:) }`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Detail/WorkoutTypesDetailViews.swift`
> (`WorkoutTypesDetailView` + `WorkoutTypeRow`, lines 72-198).
> **Web parity reference:** [`web summary/workout-types`](../../web/summary/workout-types/SPEC.md) — same ranked
> workout-type breakdown; iOS is **richer** (horizontal %-share chart + per-type progress-bar rows).
> **Consumes:** `ProgramContext.workoutTypes` (already loaded by `AdminSummaryTab`;
> `GET /analytics/workouts/types`). No write.
> **Stance:** faithful 1:1 port (kept iOS-native, D-REF). No D-C1/D-C3 apply (already has an empty state;
> palette-based colors, no orange/purple literals). Oddities §10.

---

## 1. What it is + who uses it

The **workout-types drill-down** — a full-screen view with a horizontal **%-share bar chart** (top 5 +
"Others" aggregate, palette-colored, %-annotated) over a scrollable **breakdown list** of every type (color
dot + name + sessions + avg-duration + a share progress bar). Program-wide, program-to-date; no period, no
member scope, no role logic (matches web `/summary/workout-types`). Used by all roles.

## 2. Why it exists

The Summary top-workout-types card is a top-6 preview; tapping it opens the full ranked breakdown + chart.
Read-only analytics — no logging, no lock.

## 3. Route / location

- **App:** `ios`. **Reached via:** `AdminSummaryTab` workout-types card →
  `WorkoutTypesDetailView(types: programContext.workoutTypes)`.
- **Leaves to:** back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Title | "Workout Types". | legacy `:100` |
| Empty state | "No workouts logged yet." when `sortedTypes.isEmpty` (a variable-length array, so length IS the empty case — already faithful, no D-C1). | legacy `:102-108` |
| %-share chart | Horizontal `BarMark`s over top-5 + "Others"; `barColor(for:)` palette; trailing %-annotations; X hidden, X-scale 0…1. | legacy `:114-137` |
| Breakdown list | `ScrollView` of `WorkoutTypeRow` per type (dot + name + sessions + avg + `ProgressView` share bar). | legacy `:142-155`, `:165-198` |

## 5. Components + features consumed

- **Components:** `WorkoutTypeRow` (new this run, co-located in `WorkoutTypesDetailView.swift`).
  `typeColor` / `barColor` / `ScrollableBarChart` / `WorkoutTypesSummaryCard` reused from
  `SummaryChartCards.swift` (run 54); `workoutTypePaletteColor` from `WorkoutPopularityLogic.swift` (run 50).
- **Features:** none as a module — reads `ProgramContext.workoutTypes` (loaded by the Summary tab).

## 6. Data / API

- **`GET /analytics/workouts/types?programId=&limit=`** (`ProgramContext.loadWorkoutTypes`, called by
  `AdminSummaryTab`) — a **variable-length** `[WorkoutTypeDTO]` (`[]` when none), ordered by sessions DESC.
  Program-to-date. Read-only; `admin_only_data_entry` N/A.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin / logger / member | **Same** program-wide breakdown (no role-conditional UI, no member scope — matches web F2). |

**`admin_only_data_entry` = N/A** — read-only analytics (read-vs-write axis).

## 8. States & edge cases

- **Empty:** `sortedTypes.isEmpty` → "No workouts logged yet." (variable-length array — `length===0` is the
  correct predicate; the run-35 "re-derive comes back clean" case, no D-C1 needed unlike distribution).
- **Populated:** chart + breakdown; the 6th+ types fold into "Others" in the chart, but every type shows in
  the breakdown list.
- **No loading/error state in-view** — data pre-loaded by the Summary tab (matches web, no error banner).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Keep iOS-native.** Richer than web (horizontal %-share chart + progress-bar breakdown rows) — kept as a platform idiom (run-52/53), not simplified toward web's flat recharts + `<ul>`. `consumed_by=[ios]`. | legacy file; web SPEC; run-52/53; user answer. |
| **D-SCOPE** | **Chart drill-down cluster** (LAST of 3) with [`summary-activity-detail`](../summary-activity-detail/SPEC.md) + [`summary-distribution-detail`](../summary-distribution-detail/SPEC.md). Leaf view; stub removed. | run-58/59/60. |
| **D-S1** | **Faithful 1:1.** No cleanups apply: the empty state is already correct (`length===0` on a variable-length array — run-35), and the chart uses palette-based `barColor` (no `.orange`/`.purple` literals) so D-C3 tokenize is N/A here. | legacy file; user answer. |
| **D-DEPS** | **One new component** (`WorkoutTypeRow`, co-located in legacy's deferred detail file, not in the foundation — run-55/56 pattern); everything else (`typeColor`/`barColor`/`ScrollableBarChart`/`WorkoutTypesSummaryCard`/`workoutTypePaletteColor`/`WorkoutTypeDTO`) already ported (run 50/54). | foundation grep; run-50/54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **No per-program read authz** on `GET /analytics/workouts/types` (`authenticateToken`-only, web F1). | backend route | Kept (faithful); backend concern. |
| **F2** | **Chart folds 6th+ into "Others"** while the breakdown list shows all types — an intentional summarization (matches the card + web's ranked list). | `WorkoutTypesDetailView.swift` `chartTypes` | Kept (faithful). |
| **F3** | **Program-to-date window** (no date filter) — accumulates since program start (web F7). | backend service | Kept (faithful). |
| **F4** | **`memberId` member-scoped route branch is dead from this client** — always program-wide (web F4). | backend route | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 61) — the Summary **workout-types drill-down** (LAST chart drill-down), ported into `apps/ios/.../Features/Home/Detail/WorkoutTypesDetailView.swift` (+ `WorkoutTypeRow`); deferred stub removed. **D-REF** (keep iOS-native — richer than web; `consumed_by=[ios]`) · **D-SCOPE** (chart drill-down cluster, 3rd of 3) · **D-S1** (faithful 1:1 — empty state already correct, palette colors so no tokenize) · **D-DEPS** (one new component `WorkoutTypeRow`; rest already ported). Flagged F1–F4. Read-only → `admin_only_data_entry` N/A. Build green-check owned by the user (Xcode); symbols grep-verified. |
