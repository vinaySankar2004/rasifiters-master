# Screen: `widget-quick-add-workout` (ios) — the "Add workouts" widget deep-link form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.0 · **App:** `ios` (SwiftUI)
> **Location:** presented by `AppRootView` when a Home-Screen widget deep-links `WidgetRoute.quickAddWorkout`
> (`.fullScreenCover(item: widgetRoute) { QuickAddWorkoutWidgetEntryView() }`, gated on `authToken != nil`).
> Exits via `exitToMyPrograms()` (`returnToMyPrograms = true`, `widgetRoute = nil`, `dismiss()`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Widgets/QuickAddWorkoutWidgetEntryView.swift`
> (the legacy *single-entry* multi-program quick-add — superseded, see §9 D-BATCH).
> **Web parity reference:** **NONE — iOS-only** (`consumed_by=[ios]`; widgets have no web analogue).
> **In-app twin (the reference this now mirrors):** [`log-workout`](../log-workout/SPEC.md) —
> `AddWorkoutsDetailView`. The widget IS that batch form + two deltas (D-BATCH).
> **Consumes:** `APIClient.fetchMembershipDetails`, `fetchProgramWorkouts`, `addWorkoutLogsBatch`; reads
> programs/roles/user from `ProgramContext`.
> **Stance:** the widget is now the **in-app multi-row batch "Add workouts" form** (`AddWorkoutsDetailView`),
> **+ 2 deltas** (D-BATCH): (1) **no auto-selected program** — starts empty, user picks any loggable program(s);
> (2) the **custom back button** exits to My Programs (today's widget flow) instead of a plain dismiss. Oddities §10.

---

## 1. What it is + who uses it

The **Add workouts** widget screen — a native form reached from a Home-Screen widget that logs **one-or-more
workout sessions in a single batch** across the selected program(s). It is the **same multi-row form as the in-app
Summary "Add workouts"** screen: a **Programs** multi-select, then a table of **Entry N** rows (each: **member**
[admins/loggers only; a plain member is locked to self], **workout type**, **date**, **duration** hours+minutes),
`+ Add row` / `+ Add 5 rows`, a footer summary, and one **Save all**. The only differences from in-app: **no
program is pre-selected**, and the back button returns to My Programs. Used by **global_admin**, **program admin**,
**logger** (any shared member), and a **member** (self only).

## 2. Why it exists

A Home-Screen shortcut to the app's core write action, offering the same batch convenience as the in-app form
(log several sessions at once) plus the widget's multi-program reach (one save fans out to every selected
program). It POSTs once to **`/workout-logs/batch`** with `program_ids` = the full selection; the backend
re-authorizes per program (`resolveLogPermissions`), enforces the `admin_only_data_entry` lock (403), and rejects
duplicate (member, workout, date) rows (409 + `rowErrors`). All-or-nothing — no partial writes, so **no rollback**.

## 3. Route / location

- **App:** `ios`. **Reached via:** a Home-Screen widget deep-link URL → `WidgetRoute.quickAddWorkout` →
  `AppRootView` presents `QuickAddWorkoutWidgetEntryView()` (zero-arg init; reads everything from
  `ProgramContext`). Requires `authToken != nil` (signed-in).
- **Leaves to:** **My Programs** — on success (after a ~1.4 s toast) or the back button, both via
  `exitToMyPrograms()`. `navigationBarBackButtonHidden(true)` + `interactiveDismissDisabled(true)` — the only exit
  is the custom back button or a successful save.

## 4. Contents / sections

| Block | What | Shared component |
|-------|------|------------------|
| Header | Back button (→ `exitToMyPrograms`) + title **"Add workouts"** + the in-app subtitle. | `WidgetQuickAddHeader` |
| Programs | Multi-select list of **loggable** programs (active + not data-entry-locked); **nothing pre-checked** (`currentProgramId: ""`), always shown (`alwaysShow: true`). | `ProgramMultiSelectSection` (the in-app selector) |
| Entry N rows | Per row: **Member** (only when the viewer may pick — else hidden/self), **Workout** (`SearchablePickerSheet` over the workout-name **intersection** across selected programs), **Date** (compact `DatePicker`), **Duration** (`Hours`/`Minutes`). Removable; red border + message on a client/back-end row error. | in-app `rowCard` (ported) |
| Add-row controls | `+ Add row` / `+ Add 5 rows` (max 200). | in-app `addRowControls` (ported) |
| Footer summary | "N rows • [M members •] T min total". | in-app `summaryLine` (ported) |
| Save all | `AppPrimaryButton` "Save all" / "Saving…"; disabled unless ≥1 program selected AND ≥1 valid row with 0 invalid. | — |
| Success toast | `WidgetSuccessToast("Workout logged")` then auto-exit after ~1.4 s (the widget's deep-link return, kept). | `WidgetSuccessToast` |

**Save flow** (`save()`): `ids = selectedProgramIds.sorted()`, `primary = ids.first` → one
`APIClient.addWorkoutLogsBatch(programId: primary, programIds: ids, entries:)` call. On success →
`summaryRefreshToken += 1`, toast, `exitToMyPrograms()` after ~1.4 s. On a `BulkWorkoutError` → `applyRowErrors`
maps per-row `rowErrors` (by submit index) back onto rows (red highlight) + a top error message.

## 5. Components + features consumed

- **In-app shared pieces (the twin):** `ProgramMultiSelectSection` (+ the new `alwaysShow` param), `LogFieldLabel`,
  `LogFieldRow`, `LogDateFormatter` (`Detail/LogFormComponents.swift`); the ported `BulkRow` model, `rowCard`,
  `addRowControls`, `summaryLine`, validation, and batch `save`/`applyRowErrors` (each widget keeps its own `@State`
  + save, per the widget pattern — chrome shared, view-model not).
- **Widget chrome:** `WidgetQuickAddHeader`, `WidgetSuccessToast`, `WidgetMemberOption` (`WidgetQuickAddComponents.swift`).
- **Foundation:** `AppInputField`/`AppPrimaryButton`/`SearchablePickerSheet`/`adaptiveBackground`; native `DatePicker`.
- **Features:** none as a module — calls `APIClient.shared.*` directly; programs/roles/user from `ProgramContext`.

## 6. Data / API

- **`GET /program-memberships/details?programId=`** (`fetchMembershipDetails`) — per selected program, active
  members only; **intersected** across the selection for the member picker (cached per id in `programMembers`).
- **`GET /program-workouts?programId=`** (`fetchProgramWorkouts`) — per selected program, non-hidden; **intersected**
  for the workout picker (cached in `programWorkouts`).
- **`POST /workout-logs/batch`** (`addWorkoutLogsBatch`) — ONE call, `program_id` = the first selected +
  `program_ids` = the full selection (the D-C10 multi-program batch, see [`workout-logs`](../../../features/workout-logs/SPEC.md)).
  Backend `requireDataEntryAllowed` (403 when locked + non-admin, per program) + `resolveLogPermissions` (403 when
  a non-privileged requester targets another member) + duplicate 409 (`rowErrors`) — the real boundary.

## 7. Role-based view rules

| Viewer | Member field | Can log for | Program list |
|--------|--------------|-------------|--------------|
| global_admin | Picker (member intersection). | Any shared member. | All **loggable** (active, unlocked). |
| program admin | Picker when privileged in **every** selected program. | Any shared member. | Loggable; programs they don't admin but that aren't locked still appear (selecting one locks to self). |
| logger | Picker when privileged in every selected program. | Any shared member. | Loggable (a program with the flag on is **dropped**, not shown — loggers aren't exempt). |
| member | **Hidden** — every row is self (`loggedInUserId`). | Self only (backend 403 otherwise). | Loggable (flagged programs dropped). |

**Loggable-only program list (0.2.0):** the selector shows a program iff it is the current program (N/A here —
`currentProgramId` is "") OR (`status == "active"` AND not `isDataEntryLocked`). Completed/planned and admin-only
-locked programs are **dropped from the list entirely** (not shown disabled). Parity with web + android + the in-app
forms (same shared-selector change). **Member self-lock (`ignoreMember`)** bites when the viewer isn't
admin/logger/global-admin in **every** selected program — the member column hides and all rows seed to self.

## 8. States & edge cases

- **Init (`task`):** load `ProgramContext.programs` if empty (`loadLookupData` + a `fetchPrograms` fallback); add
  one empty row. Nothing pre-selected.
- **On program-selection change:** `loadSelectedProgramData()` fetches members + workouts for newly-selected
  programs (cached), then `syncRowsAfterSelectionChange()` reconciles rows — **skipped while any selected program's
  lookup is still missing** so a transient fetch failure can't wipe entered rows (§10 F3).
- **Member column appears/disappears** (`onChange(of: ignoreMember)`): disappearing → all rows forced to self;
  appearing → the auto-seeded self is cleared so the field reads "Select member" (in-app parity).
- **No shared workouts across the selection:** the workout picker is empty until the selection narrows.
- **Invalid / duplicate rows:** Save disabled; per-row red highlight + message (client) or `rowErrors` (server 409).
- **Saving:** `isSaving` → button spinner + disabled. **Success:** toast → auto-exit to My Programs (~1.4 s).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-BATCH** | **The widget IS the in-app multi-row batch form** (`AddWorkoutsDetailView`), + 2 deltas: **(1) no auto-selected program** (`currentProgramId: ""`, no `.task` seeding, `alwaysShow: true` so a single loggable program is still pickable); **(2) custom back button** → `exitToMyPrograms()` (today's widget flow) with `navigationBarBackButtonHidden`/`interactiveDismissDisabled`. Replaces the legacy single-entry per-program-loop + rollback form. Batch save = one `POST /workout-logs/batch` (`program_ids` = selection). Member/workout options are the **intersection** across selected programs (no single active program). | User request 2026-07-09 ("use the in-app form, not auto-selected"); in-app `AddWorkoutsDetailView`; `workout-logs` D-C10. |
| **D-LOGGABLE** | **Program list shows only loggable programs** (active + not data-entry-locked; current always kept). Applied in the shared `ProgramMultiSelectSection`, so it lands on the widget AND the in-app forms (and mirrored on web/android). Drops completed/locked rows entirely (were shown disabled). | User request 2026-07-09 (consistency + cleaner UI on all clients). |
| **D-REUSE** | **No new component / no new API** — reuses `ProgramMultiSelectSection` (+ `alwaysShow`), the in-app row card/validation/save logic (ported into the widget's own `@State`, per the widget pattern), and the existing `addWorkoutLogsBatch`. The retired `WidgetProgramSelector`/`WidgetMemberField`/`widgetProgramLockedForLogging` were deleted. | in-app run-60/steps-feature; widget pattern (`WidgetQuickAddComponents.swift`). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Note |
|----|----------------|-------|------|
| **F1** | **Client role gate is UI-only** — `effectiveCanSelectAnyMember` drives the member column; the backend `resolveLogPermissions` is the real boundary. | `QuickAddWorkoutWidgetEntryView.swift` | Kept (faithful to the in-app twin). |
| **F2** | **Success toast + ~1.4 s auto-exit kept** (not the in-app immediate `dismiss`) — the exit-to-My-Programs deep-link return is the widget's identity. | `scheduleSuccessDismiss()` / `exitToMyPrograms()` | Kept (deliberate, D-BATCH delta 2). |
| **F3** | **Member/workout intersection preserved on transient fetch failure** — reconciliation is skipped while any selected program's lookup is nil, so a network blip doesn't wipe entered rows. | `syncRowsAfterSelectionChange()` | Deliberate (adversary finding). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **D-BATCH — the widget is now the in-app multi-row batch "Add workouts" form** (`AddWorkoutsDetailView`), replacing the legacy single-entry multi-program quick-add (per-program `addWorkoutLog` loop + rollback). Two deltas: **no auto-selected program** (`currentProgramId: ""`, no seeding, `alwaysShow: true`) + the **custom back button** exits to My Programs. Save = one `POST /workout-logs/batch` (`program_ids` = selection; `applyRowErrors` on 409). Member/workout options stay the **intersection** across selected programs. **D-LOGGABLE** — the shared `ProgramMultiSelectSection` now lists only loggable programs (active + not-locked; current kept), dropping completed/locked rows (was shown-disabled); lands here + the in-app forms, mirrored on web/android. **D-REUSE** — no new component/API; retired `WidgetProgramSelector`/`WidgetMemberField`/`widgetProgramLockedForLogging` deleted. Adversary-hardened: transient-fetch-failure no longer wipes rows (F3); admin rows start empty (in-app parity). Native build green via the xcode MCP (0 errors). |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 65) — the legacy single-entry Quick Add Workout widget (multi-program select + shared-member/-workout intersection + per-program save loop + partial-failure rollback + exit-to-My-Programs) + D-C1 per-program lock, D-C2 shared chrome, D-C3 shared scaffold. Superseded by 0.2.0 (D-BATCH). |
