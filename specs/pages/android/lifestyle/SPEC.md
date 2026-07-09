# Screen: `lifestyle` (android) — the workout-types dashboard (3rd bottom tab)

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.1 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in the iOS Lifestyle tab
> (`Features/Home/Tabs/{Admin,Standard}WorkoutTypesTab.swift`) + [`web lifestyle/workouts`](../../web/lifestyle/workouts/SPEC.md)
> — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.LIFESTYLE` (`LifestyleScreen`) — Tab 3 of the
> per-program shell.
> **Consumes:** [`analytics`](../../../features/analytics/SPEC.md) (workout-types + health timeline) +
> [`analytics-v2`](../../../features/analytics-v2/SPEC.md) (the 3 workout-type stat cards) via `ProgramContext.loadLifestyle`.
> **Files:** `ui/lifestyle/{LifestyleScreen,LifestyleCards}.kt`.

## Parity + Android-idiom deviations

- **Faithful (iOS 1:1):** header **"Lifestyle" + active-program name** + a glass gradient button
  (→ the workout-types manager); the **4 stat cards** (2×2) — **Total workout types** (orange),
  **Most popular** (purple), **Longest duration** (red), **Highest participation** (green), each with a
  "Program to date" accent chip, an accent value, and a footnote; the **Workout Type Popularity** card
  (segmented **Count / Total Minutes / Avg Minutes** + a ranked-bar list, top-6 + "Show all" toggle,
  per-name palette colors); the tappable **Lifestyle Timeline** preview card (sleep bars + diet line →
  the drill-down). `null` names → "N/A" + "No data".
- **Role bifurcation (`isProgramAdmin`):** admins/global-admins get a **"View as"** selector above the
  cards; loggers/members see their **own** data with no selector. Scoping mirrors iOS: admins load for the
  picked member (`null` = program-wide "Admin" view); everyone else loads for self. **Highest participation
  is ALWAYS program-wide** (memberId=null), matching iOS.
- **"View as" default + label (iOS `hasUserChosenViewAs` parity):** global-admin defaults to `null`
  ("Admin", program-wide), picker none-row = **"None"**; program-admin defaults to **self**, picker
  none-row = **"Admin"** (→ program-wide). Label = picked member name, else "Admin" (global-admin or an
  explicit Admin pick), else self name.
- **Persist-across-nav (memory `persist-tab-selections-across-nav`):** the "View as" pick lives in
  `ProgramContext` (`lifestyleViewAsId` + `lifestyleViewAsChosen`, seeded once per program by
  `ensureLifestyleViewAsDefault`), **separate** from the Members-tab selection, so it survives a push into
  the timeline detail / manager and back. The timeline detail reads the same slot for its member scope.
- **Load sequencing (iOS `AdminWorkoutTypesTab.task` parity):** the admin default is applied **before** the
  first load, in one coroutine — `ensureLifestyleViewAsDefault()` then `loadLifestyle(resolvedMemberId)` —
  so a program-admin's first fetch is already self-scoped (no brief program-wide flash). A second effect
  reloads only on a later, user-initiated "View as" change, gated on a `loadedOnce` flag so the initial
  default-set (which also moves `viewAsId`) doesn't double-fetch.
- **Deviation A-1 (charts on Canvas):** the popularity chart is a Compose ranked-bar list (track + colored
  fill, iOS `RankedBarList`); the timeline preview is drawn on the shared `SleepDietChart` Canvas
  (single-axis, no tooltip — tapping the card navigates). iOS's glassy `CardShell` → a flat Material
  `SummaryCard` surface.
- **Deviation A-2 (shared "View as" sheet):** reuses the Members-tab `MemberPickerSheet` (now with a
  `noneLabel` param) rather than a second picker — one searchable bottom-sheet idiom for both tabs.
- **Deviation A-3 (glass button icon):** the header button uses `Icons.Filled.FitnessCenter` (the iOS
  "dumbbell" SF Symbol analog) on the orange gradient circle (`GlassIconButton`).

## Data / API (via `ProgramContext.loadLifestyle(memberId)`, Bearer-authed by the OkHttp layer)

Fires on entry, on active-program change, and on every "View as" change. Six reads, refreshed together into
`ProgramContext.lifestyle` (`LifestyleData`).

| Call | Endpoint | Card |
|------|----------|------|
| `getWorkoutTypesTotal` | `GET /analytics-v2/workouts/types/total?programId[&memberId]` | Total workout types |
| `getWorkoutTypeMostPopular` | `GET /analytics-v2/workouts/types/most-popular` | Most popular |
| `getWorkoutTypeLongestDuration` | `GET /analytics-v2/workouts/types/longest-duration` | Longest duration |
| `getWorkoutTypeHighestParticipation` | `GET /analytics-v2/workouts/types/highest-participation` (program-wide) | Highest participation |
| `getWorkoutTypes` | `GET /analytics/workouts/types?programId&limit[&memberId]` | Workout Type Popularity |
| `getHealthTimeline` | `GET /analytics/health/timeline?period=week&programId[&memberId]` | Lifestyle Timeline preview |

## Forward targets

- **Workout types manager** → `Routes.LIFESTYLE_WORKOUT_TYPES` ([`lifestyle-workout-types`](../lifestyle-workout-types/SPEC.md)).
- **Lifestyle Timeline drill-down** → `Routes.LIFESTYLE_TIMELINE` ([`lifestyle-timeline`](../lifestyle-timeline/SPEC.md)).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-07-08 | Load sequencing fixed to iOS parity: apply the admin "View as" default **before** the first `loadLifestyle`, in one coroutine, so a program-admin's first fetch is self-scoped (no brief program-wide flash); a `loadedOnce`-gated effect reloads on later user-initiated picks without double-fetching the initial default-set. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase F — Lifestyle tab + 4 stat cards + popularity chart + timeline preview; "View as" selector; workout-types manager + timeline drill-down forward targets). |
