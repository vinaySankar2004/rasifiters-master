# Screen: `widget-quick-add-workout` (ios) — the "Quick Add Workout" widget deep-link form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** presented by `AppRootView` when a Home-Screen widget deep-links `WidgetRoute.quickAddWorkout`
> (`AppRootView.swift:83-105`, `.sheet(item: widgetRoute) { QuickAddWorkoutWidgetEntryView() }`, gated on
> `authToken != nil`). Exits via `exitToMyPrograms()` (`returnToMyPrograms = true`, `widgetRoute = nil`, `dismiss()`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Widgets/QuickAddWorkoutWidgetEntryView.swift`.
> **Web parity reference:** **NONE — iOS-only** (`consumed_by=[ios]`). Web has no "log the same workout across
> multiple programs" surface (web's `bulk-log-workout` is multi-*row* / single-*program*). Faithful-to-legacy-only,
> like the iOS `notifications` settings screen (run 58).
> **Consumes:** `APIClient.fetchMembershipDetails`, `fetchProgramWorkouts`, `addWorkoutLog`, `deleteWorkoutLog`
> (all directly, as legacy does); reads programs/roles/user from `ProgramContext`.
> **Stance:** faithful 1:1 port of the legacy iOS view (multi-program select + shared-member/-workout intersection
> + per-program save loop + partial-failure rollback + exit-to-My-Programs) **+ 3 deviations** (D-C1 per-program
> lock, D-C2 shared chrome, D-C3 shared scaffold). Oddities §10.

---

## 1. What it is + who uses it

The **Quick Add Workout** widget screen — a native form reached from a Home-Screen widget that logs the **same
completed workout** across **every selected active program** in one save. Pick one-or-more **programs** (a
multi-select checkbox list), the **member** (admins/loggers only; a plain member is locked to self), the
**workout type** (only workouts *shared* across the selected programs), a **date**, and a **duration** (hours +
minutes). Used by **global_admin**, **program admin**, **logger** (any shared member), and a **member** (self only).

## 2. Why it exists

A shortcut for the app's core write action (logging a workout) from the Home Screen, with the multi-program
convenience the in-app Summary form doesn't offer: a user in several programs logs one workout to all of them at
once. It POSTs to `/workout-logs` per program; the backend re-authorizes (`resolveLogPermissions`) and enforces
the `admin_only_data_entry` lock (403). On a partial failure it **rolls back** the logs already written.

## 3. Route / location

- **App:** `ios`. **Reached via:** a Home-Screen widget deep-link URL → `WidgetRoute.quickAddWorkout` →
  `AppRootView` presents `QuickAddWorkoutWidgetEntryView()` in a sheet (zero-arg init; reads everything from
  `ProgramContext`). Requires `authToken != nil` (signed-in).
- **Leaves to:** **My Programs** — on success (after a ~1.4 s toast) or the back button, both via
  `exitToMyPrograms()` (sets `returnToMyPrograms`, clears `widgetRoute`, `dismiss()`). No forward-nav.
  `interactiveDismissDisabled(true)` (must exit through the back button).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | Back button (→ `exitToMyPrograms`) + title "Quick Add Workout" + subtitle. Shared `WidgetQuickAddHeader` (D-C3). | legacy `:93-121` |
| Log to Programs | Multi-select checkbox list of `activePrograms`; **locked** programs (D-C1) render disabled w/ a lock icon + "Admin-only logging". Shared `WidgetProgramSelector` (D-C3). | legacy `:123-181` |
| Member | If `canSelectAnyMember` → tappable `LogFieldRow` → `SearchablePickerSheet` over the member intersection; else a **locked** self row. Shared `WidgetMemberField` (D-C3). | legacy `:183-238` |
| Workout type | Tappable `LogFieldRow` → `SearchablePickerSheet` over the workout-name intersection (or a locked helper row when none). | legacy `:240-279` |
| Date | Compact `DatePicker` (any date), bordered chrome (D-C2). | legacy `:281-293` |
| Duration | Two `AppInputField`s (`Hours`/`Minutes`, `.numberPad`) → total minutes (D-C2). | legacy `:299-330` |
| Error line (conditional) | `appRed` footnote on save failure. | legacy `:39-43` |
| Save | `AppPrimaryButton` "Save workout" / "Saving…" (D-C2); disabled + dimmed unless ≥1 program + member + workout + duration > 0 and not saving. | legacy `:332-351` |
| Success toast | `WidgetSuccessToast("Workout logged")` then auto-exit after ~1.4 s (D-C3; faithful widget flow, kept). | legacy `:353-366` |

**Save flow** (`save()`): for each `selectedProgramIds.sorted()` → `APIClient.addWorkoutLog(memberName,
workoutName, date "yyyy-MM-dd", durationMinutes, programId, memberId)`, accumulating `completedPrograms`. On
success → toast → `scheduleSuccessDismiss()` (~1.4 s) → `exitToMyPrograms()`. On error mid-loop → **rollback**
the `completedPrograms` (`deleteWorkoutLog`); if rollback also fails → the "some programs may have been updated"
warning, else `friendlyError(for:)`.

## 5. Components + features consumed

- **Components:** the new shared **`WidgetQuickAddComponents.swift`** (D-C3: `WidgetQuickAddHeader` ·
  `WidgetProgramSelector` w/ the per-program lock · `WidgetMemberField` · `WidgetSuccessToast` ·
  `WidgetMemberOption` · `widgetProgramLockedForLogging`); the run-60 shared chrome `LogFieldLabel`/`LogFieldRow`/
  `LogDateFormatter`; the foundation `AppInputField`/`AppPrimaryButton`/`SearchablePickerSheet`/`adaptiveBackground`
  (D-C2); native `DatePicker`.
- **Features:** none as a module — calls `APIClient.shared.*` directly (faithful); programs/roles/user come from
  `ProgramContext` (`programs` via `loadLookupData`; `authToken`/`loggedInUserId`/`loggedInUserName`/`isGlobalAdmin`;
  `widgetRoute`/`returnToMyPrograms`).

## 6. Data / API

- **`GET /program-memberships/details?programId=`** (`fetchMembershipDetails`) — per selected program, active
  members only; intersected across selections for the member picker.
- **`GET /program-workouts?programId=`** (`fetchProgramWorkouts`) — per selected program, non-hidden; intersected
  for the workout picker.
- **`POST /workout-logs`** (`addWorkoutLog`) — one call per selected program. Backend `requireDataEntryAllowed`
  (403 when locked + non-admin) + `resolveLogPermissions` (403 when a non-`canLogForAny` requester targets another
  member) — the real boundary. Fire-and-forget (no DTO).
- **`DELETE /workout-logs`** (`deleteWorkoutLog`) — rollback of already-written logs on a partial failure.

## 7. Role-based view rules

| Viewer | Member field | Can log for | Program list |
|--------|--------------|-------------|--------------|
| global_admin | Picker (`canSelectAnyMember`). | Any shared member. | All active; never locked. |
| program admin | Picker (if all selected programs are admin-of; see `canSelectAnyMember`). | Any shared member. | Programs they admin never locked. |
| logger | Picker (single-program selection). | Any shared member. | **Locked** where a program has the flag on (loggers are NOT exempt). |
| member | **Locked** to self (`loggedInUserId`). | Self only (backend 403 otherwise). | **Locked** where a program has the flag on. |

**`admin_only_data_entry` = LIVE, evaluated PER PROGRAM (D-C1).** The widget is multi-program and runs *before* an
active program is picked, so `ProgramContext.dataEntryLocked` (scoped to the single active program) can't be used —
each `ProgramDTO` is evaluated with `widgetProgramLockedForLogging` = `admin_only_data_entry && !isProgramAdmin`
(program admin OR global admin exempt; loggers/members not), the per-program mirror of web's `isDataEntryLocked`.
A locked program is disabled in the list (can't be selected) and defensively dropped from the selection on sync.
Legacy iOS had **no** lock handling here (relied on the backend 403 + rollback). Note `canSelectAnyMember` includes
logger, but the lock exemption does not — a logger can log for any member yet is locked out of a flagged program.

## 8. States & edge cases

- **Init (`task`):** if `programs` empty → `loadLookupData()`; then `syncSelectionsAfterDataLoad()`.
- **On program-selection change:** `loadSelectedProgramData()` fetches members + workouts for newly-selected
  programs (cached per id), then re-syncs (drops non-active/locked from selection, re-resolves member/workout).
- **No shared members / workouts:** the member/workout fields show a locked helper row ("Select programs first" /
  "No shared members/workouts across selected programs").
- **Invalid form:** Save disabled + dimmed.
- **Saving:** `isSaving` → button spinner + disabled.
- **Partial failure:** rollback; if rollback fails → the "review My Programs" warning.
- **Success:** toast → auto-exit to My Programs (~1.4 s).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `QuickAddWorkoutWidgetEntryView`; NO web sibling — iOS-only** (`consumed_by=[ios]`; widgets have no web analogue). Faithful-to-legacy-only, no parity reconcile / behavior-diff (the run-58 iOS-only-screen shape). | legacy file; run-58; user answer. |
| **D-SCOPE** | **Ported with its twin [`widget-quick-add-health`](../widget-quick-add-health/SPEC.md) as one run** (the 2 widget deep-link targets, cluster-IS-the-run — run 58/60/63). They are the **last 2 deferred stubs** → this run **CLOSES the entire iOS deferred layer**; `App/_DeferredScreenStubs.swift` deleted. | run-58/60/63; COVERAGE ios. |
| **D-S1** | **Stance = faithful 1:1** of the legacy view — the multi-program select, the shared-member/-workout *intersection* logic, `canSelectAnyMember`, the per-program save loop, the partial-failure **rollback**, and the exit-to-My-Programs flow are all kept verbatim **+ the deviations below**. | legacy file; user answer. |
| **D-C1** | **Per-program `admin_only_data_entry` write-lock** (net-new; no legacy or web reference) — `widgetProgramLockedForLogging(program, isGlobalAdmin)` disables + lock-badges any program where the flag is on and the viewer isn't its admin; locked programs can't be selected and are dropped from the selection on sync. Completes the run-54/60/63 lock arc onto the widget path; mirrors web's per-program `isDataEntryLocked` predicate. | user answer (chose "add lock"); web permission logic; run-54/60/63. |
| **D-C2** | **Adopt the foundation's shared chrome** — `LogFieldLabel`/`LogFieldRow` (labels + member/workout/diet rows), `AppInputField` (duration), `AppPrimaryButton` (Save, w/ `.opacity(valid ? 1 : 0.5)` for the disabled state) — matching the run-60 Summary log forms. Trade-off (accepted): the bespoke **appOrange** CTA becomes the unified label-capsule button. | user answer; run-60 D-C2. |
| **D-C3** | **Extract a shared scaffold** `WidgetQuickAddComponents.swift` (header · program selector · member field · success toast · member option · lock helper) — the ~80% twin structure the two widgets share, the widget analogue of run-60's `LogFormComponents.swift`. VIEW chrome only; each form keeps its own `@State` + save/rollback logic. | user answer; run-60 (`LogFormComponents`). |
| **D-DEPS** | **No new *foundation* dependency** — every API method (`fetchMembershipDetails`/`fetchProgramWorkouts`/`addWorkoutLog`/`deleteWorkoutLog`), DTO, `ProgramContext` field (`widgetRoute`/`returnToMyPrograms`/`loggedInUser*`/`isGlobalAdmin`), and shared component already existed (foundation run 50 + run 60 chrome). The one new file is the run's own shared scaffold (D-C3). **No feature bump** (page SPECs v0.1.0; endpoints pre-exist — the Summary forms consume them). | foundation inventory; run-50/60. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client role gate is UI-only** — `canSelectAnyMember` drives the picker vs self-lock; the backend `resolveLogPermissions` is the real boundary. | `QuickAddWorkoutWidgetEntryView.swift` `canSelectAnyMember` | Kept (faithful). |
| **F2** | **Sequential per-program POST + best-effort rollback**, not a transaction — a rollback that itself fails leaves partial state (surfaced as the "review My Programs" warning). | `save()` / `rollbackLogs()` | Kept (faithful) — a server-side bulk endpoint is a rebuild candidate. |
| **F3** | **Non-network errors surface the raw backend message** (`friendlyError` only softens network/duplicate strings). | `friendlyError(for:)` | Kept (faithful). |
| **F4** | **The success toast + ~1.4 s auto-exit is kept** (not converted to run-60's immediate `dismiss` D-C3) — the exit-to-My-Programs deep-link return is the widget's identity, distinct from the Summary form's return-to-Summary. | `scheduleSuccessDismiss()` / `exitToMyPrograms()` | Kept (faithful, deliberate). |
| **F5** | **Save button color unified** — the bespoke appOrange CTA is now the shared label-capsule `AppPrimaryButton` (D-C2), a deliberate visual divergence from legacy. | `saveButton` | Kept (D-C2) — accepted. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 65) — the **Quick Add Workout widget** form, ported into `apps/ios/.../Features/Widgets/QuickAddWorkoutWidgetEntryView.swift` (+ shared `WidgetQuickAddComponents.swift`); the deferred stub removed. **D-REF** (legacy only; iOS-only, no web sibling; `consumed_by=[ios]`) · **D-SCOPE** (twin cluster w/ `widget-quick-add-health`; the last 2 stubs → **closes the iOS deferred layer**; `_DeferredScreenStubs.swift` deleted) · **D-S1** (faithful 1:1: multi-program select + intersection + save loop + rollback + exit-to-My-Programs) · **D-C1** (per-program `admin_only_data_entry` lock — net-new, completes the run-54/60/63 arc) · **D-C2** (shared chrome — `LogFieldLabel`/`LogFieldRow`/`AppInputField`/`AppPrimaryButton`; appOrange CTA → label-capsule) · **D-C3** (shared scaffold `WidgetQuickAddComponents.swift`) · **D-DEPS** (no new foundation dep; no feature bump). Flagged F1–F5. Role rules: `canSelectAnyMember` picker vs member self-lock; `admin_only_data_entry` LIVE **per program**. Native build green via the xcode MCP (0 errors); symbols grep-verified. |
