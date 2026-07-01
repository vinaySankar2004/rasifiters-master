# Screen: `program-workout-types` (ios) — the Program tab's Workout Types section

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** `AdminProgramTab.swift:38` (`ProgramWorkoutTypesSection()`, always shown). The section is a
> card with one nav row (counts) → `ViewWorkoutTypesListView` (the workout-type CRUD manager).
> **File:** `apps/ios/RaSi-Fiters-App/Features/Home/ProgramManagement/WorkoutTypesSection.swift`
> (section + `ViewWorkoutTypesListView` + `EditCustomWorkoutSheet`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/WorkoutTypesSection.swift`.
> **Web parity reference:** [`web lifestyle/workouts`](../../web/lifestyle/workouts/SPEC.md).
> **Consumes (features):** [`program-workouts`](../../../features/program-workouts/SPEC.md) —
> `fetchProgramWorkouts`, `toggle{,Custom}WorkoutVisibility`, `add/edit/deleteCustomProgramWorkout`.
> **Stance:** faithful 1:1 port of legacy iOS **+ 2 cross-platform cleanups** (clear-stale-error-on-modal-open,
> tokenize bare colors). Read-only-degrade (not redirect) for non-admins matches BOTH legacy iOS and web.

---

## 1. What it is + who uses it

The **Workout Types section** of the Program tab — a card that shows the program's workout-type counts and
pushes to `ViewWorkoutTypesListView`, a searchable **Available / Hidden** list where a program/global admin
can add custom types, edit/delete customs, and hide/show any type. Non-admins see a read-only Available list.
The iOS analogue of web `/lifestyle/workouts`. Also the shared nav target of the **Lifestyle tab** (run 56).

## 2. Why it exists

To manage the program's workout-type vocabulary natively, matching web `/lifestyle/workouts`. Global library
types can only be **hidden/shown**; custom types can be **added/edited/deleted/hidden**. All mutations go
through `ProgramContext` → `APIClient` and reload the list.

## 3. Route / location

- **App:** `ios`. **Section mount:** `AdminProgramTab.swift:38`, always visible; `.task loadProgramWorkouts`.
- **Workout Types** row → `NavigationLink { ViewWorkoutTypesListView() }` (everyone; controls gate inside).
- **Shared:** `ViewWorkoutTypesListView` is also the nav target of `WorkoutTypesCards`/`StandardWorkoutTypesTab`
  (run 56) — the same struct, one definition.

## 4. Contents / sections

- **Section card** (`WorkoutTypesSection.swift:11-52`) — `sectionHeader("Workout Types")` + one row (subtitle
  `"\(visible) available, \(custom) custom"` or `"\(visible) types available"`).
- **`ViewWorkoutTypesListView`** (`:54-…`) — `.searchable` `List` with an **Available (n)** section (all
  non-hidden) + a **Hidden (n)** section (admins only, when non-empty). `workoutRow` = avatar (green star =
  custom / purple dumbbell = standard) + name + "Custom"/"Standard" (+ "• Hidden"); dimmed when hidden.
  **Swipe actions (canManage):** trailing — global: Show/Hide; custom: Delete (`.alert` confirm) + Show/Hide;
  leading — Edit (custom & not-hidden). A **"+"** toolbar button (canManage) opens the Add sheet.
- **`addCustomWorkoutSheet`** — a `Form` with a name field + inline error + Cancel/Add.
- **`EditCustomWorkoutSheet`** (`:…` struct) — a `Form` pre-filled with the workout name + Cancel/Save.

## 5. Components + shared features consumed

- Chrome: `sectionHeader`/`settingsRow` (run 57), native `List`/`Form`/`.searchable`/`.swipeActions`/`.alert`/
  `.sheet`. Theme: `appGreen(Light)`/`appPurple(Light)`/`appOrange`/`appRed`/`appBlue`. **No new component** (D-DEPS).
- Features: `program-workouts` (fetch + toggle + add/edit/delete).

## 6. Data / API

- `fetchProgramWorkouts(token, programId)` → `[ProgramWorkoutDTO]` (via `loadProgramWorkouts`, on both the
  section `.task` and the list `.task`/pull-to-refresh).
- `toggleWorkoutVisibility(libraryWorkoutId)` (global) · `toggleCustomWorkoutVisibility(workoutId)` (custom).
- `addCustomProgramWorkout(name)` · `editCustomProgramWorkout(workoutId, name)` · `deleteCustomProgramWorkout(workoutId)`.

## 7. Role-based view rules

| Role | Available list | Hidden section | + Add / Edit / Delete / Hide-Show |
|------|----------------|----------------|-----------------------------------|
| **global_admin** | ✅ | ✅ | ✅ all controls |
| **program admin** | ✅ | ✅ | ✅ all controls |
| **logger** | ✅ (read-only) | ❌ | ❌ |
| **member** | ✅ (read-only) | ❌ | ❌ |

- `canManage = canEditProgramData`. Non-admins **degrade to read-only** — no redirect (they reach the list via
  the Lifestyle header too; web lifestyle/workouts F2).
- Within controls: Edit only for `isCustom && !is_hidden`; Delete only for custom; Hide/Show for both.
- **`admin_only_data_entry` — N/A.** Admin-**role** gated, not data-entry-locked; the lock gates the `/summary`
  log forms, not the workout-type vocabulary (web lifestyle/workouts F1).

## 8. States & edge cases

- **List:** empty until loaded; search filters already-loaded rows client-side; per-section headers with counts.
- **Add/Edit:** the Add/Edit button disables while the name is blank or `isProcessing`; inline error on failure
  (cleared when the modal opens — D-C2).
- **Delete:** `.alert` confirm; a custom type with associated logs fails at the backend → the error surfaces.
- **Errors surfaced** in the sheets/list (unlike the read-only members roster) — faithful to legacy + web.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Workout Types ported **as part of the 3-section cluster in ONE run** (run 62) — section + `ViewWorkoutTypesListView` + `EditCustomWorkoutSheet`; the list can't be split off (shared stub referenced by the Lifestyle tab). | run 58/59/60/61; `WorkoutTypesCards.swift:29`, `StandardWorkoutTypesTab.swift:36` |
| **D-REF** | Keep the **iOS-native swipe-action + sheet** CRUD shape vs web's inline card buttons + modals — same destinations + role gating, so idiom not a parity gap. | run 52/53 D-REF |
| **D-S1** | **Faithful 1:1** — `canManage` read-only degrade, Available/Hidden split, global-vs-custom control matrix, direct `ProgramContext` mutations identical on both clients. | legacy `WorkoutTypesSection.swift`; web lifestyle/workouts SPEC |
| **D-DEPS** | **No new dependency** — API fns / `ProgramWorkoutDTO` / context wrappers / theme / section helpers all pre-ported (foundation run 50 + run 56/57). | grep-verified |
| **D-C1** | **Tokenize bare colors** — `.green`→`appGreen`, `.purple`→`appPurple`, `.orange`→`appOrange` (hidden label + swipe tints), `.red`→`appRed` (add-sheet error), `.blue`→`appBlue` (Edit tint). Light-mode-safe (run-26/61). | `WorkoutTypesSection.swift` |
| **D-C2** | **Clear stale error on modal open** — clear `errorMessage` when the "+" (Add) or Edit swipe opens the sheet. Matches web lifestyle/workouts D-C2 (legacy iOS cleared only on submit). | web lifestyle/workouts SPEC |

## 10. Flagged characteristics (kept as-is)

- **F1 — admin-ROLE gated, not `admin_only_data_entry` gated** (web lifestyle/workouts F1). Non-admins degrade
  to read-only, not redirect (F2 there).
- **F2 — global library types can only be hidden/shown, never edited/deleted** (web lifestyle/workouts F5).
- **F3 — search filters already-loaded rows client-side** (no server query; web F4).
- **F4 — no per-row cross-disable while a mutation is in flight** — only the modal buttons gate on
  `isProcessing` (web lifestyle/workouts F6; unlike role-management which locks per member).
- **F5 — client role gating (JWT-decoded)** drives control visibility only; the backend `requireProgramAdmin`
  403 is the real boundary (web F3).

## 11. Changelog

- **0.1.0** (run 62, 2026-06-30) — initial port. Section + list + edit sheet; stub removed (double-duty with
  the Lifestyle tab). Faithful 1:1 + D-C1 tokenize + D-C2 clear-stale-error.
