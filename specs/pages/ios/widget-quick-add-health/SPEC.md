# Screen: `widget-quick-add-health` (ios) — the "Log daily health" widget deep-link form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.0 · **App:** `ios` (SwiftUI)
> **Location:** presented by `AppRootView` when a Home-Screen widget deep-links `WidgetRoute.quickAddHealth`
> (`.fullScreenCover(item: widgetRoute) { QuickAddHealthWidgetEntryView() }`, gated on `authToken != nil`).
> Exits via `exitToMyPrograms()` (`returnToMyPrograms = true`, `widgetRoute = nil`, `dismiss()`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Widgets/QuickAddHealthWidgetEntryView.swift`
> (the legacy *single-entry* sleep+diet quick-add — superseded, see §9 D-BATCH).
> **Web parity reference:** **NONE — iOS-only** (`consumed_by=[ios]`; widgets have no web analogue).
> **In-app twin (the reference this now mirrors):** [`log-health`](../log-health/SPEC.md) — `AddDailyHealthDetailView`.
> The widget IS that batch form + two deltas (D-BATCH).
> **Consumes:** `APIClient.fetchMembershipDetails`, `addDailyHealthLogsBatch`; reads programs/roles/user from
> `ProgramContext`. (No workout fetch — health has no workout field.)
> **Stance:** the widget is now the **in-app multi-row batch "Log daily health" form** (`AddDailyHealthDetailView`),
> **+ 2 deltas** (D-BATCH): (1) **no auto-selected program**; (2) the **custom back button** exits to My Programs.
> The **write twin of [`widget-quick-add-workout`](../widget-quick-add-workout/SPEC.md)**. Oddities §10.

---

## 1. What it is + who uses it

The **Log daily health** widget screen — a native form reached from a Home-Screen widget that logs **one-or-more
days of health metrics in a single batch** across the selected program(s). It is the **same multi-row form as the
in-app Summary "Log daily health"** screen: a **Programs** multi-select, then a table of **Entry N** rows (each:
**member** [admins/loggers only; a plain member is locked to self], **date**, **sleep** hours+minutes, **diet
quality** 1–5, **steps**), `+ Add row` / `+ Add 5 rows`, a footer summary, one **Save all**. Same audience + role
model as its workout twin. **New in 0.2.0:** the widget now includes the **steps** field (the legacy widget had
only sleep + diet) — matching the in-app form.

## 2. Why it exists

The daily-health counterpart of the workout quick-add: a Home-Screen shortcut to batch-log sleep + diet + steps
across several programs at once. It POSTs once to **`/daily-health-logs/batch`** with `program_ids` = the full
selection; the backend enforces `admin_only_data_entry` (403) and **upserts** against existing (member, date)
rows (health is state, not additive). A row is valid with **any one** of sleep / diet / steps (R-1). All-or-nothing
— no partial writes, so **no rollback**.

## 3. Route / location

- **App:** `ios`. **Reached via:** `WidgetRoute.quickAddHealth` → `QuickAddHealthWidgetEntryView()` (zero-arg init).
  Requires `authToken != nil`.
- **Leaves to:** **My Programs** — on success (after a ~1.4 s toast) or the back button, via `exitToMyPrograms()`.
  `navigationBarBackButtonHidden(true)` + `interactiveDismissDisabled(true)`.

## 4. Contents / sections

| Block | What | Shared component |
|-------|------|------------------|
| Header | Back button (→ `exitToMyPrograms`) + title **"Log daily health"** + the in-app subtitle. | `WidgetQuickAddHeader` |
| Programs | Multi-select list of **loggable** programs (active + not locked); **nothing pre-checked**, always shown. | `ProgramMultiSelectSection` |
| Entry N rows | Per row: **Member** (only when the viewer may pick — else hidden/self), **Date** (`DatePicker` bounded `...Date()` — no future), **Sleep** (`Hours`/`Minutes`, 2-digit `sanitizeDigits`), **Diet quality** (`Menu` 1–5 + Clear), **Steps** (`.numberPad`). Removable; red border + message on a client/back-end row error. | in-app `rowCard` (ported) |
| Add-row controls | `+ Add row` / `+ Add 5 rows` (max 200). | in-app `addRowControls` (ported) |
| Footer summary | "N rows • [M members •] Hh Mm sleep • S steps". | in-app `summaryLine` (ported) |
| Save all | `AppPrimaryButton` "Save all" / "Saving…"; disabled unless ≥1 program AND ≥1 valid row, 0 invalid, no in-batch duplicate. | — |
| Success toast | `WidgetSuccessToast("Daily health logged")` → auto-exit ~1.4 s. | `WidgetSuccessToast` |

**Save flow** (`save()`): `ids = selectedProgramIds.sorted()`, `primary = ids.first` → one
`APIClient.addDailyHealthLogsBatch(programId: primary, programIds: ids, entries:)` (empty fields omitted per entry
→ drives the server upsert). On success → `summaryRefreshToken += 1`, toast, `exitToMyPrograms()` (~1.4 s). On a
`BulkWorkoutError` (shared row-error carrier) → `applyRowErrors` red-highlights the offending rows.

## 5. Components + features consumed

Same in-app shared pieces + widget chrome as the twin (see [`widget-quick-add-workout` §5](../widget-quick-add-workout/SPEC.md#5-components--features-consumed)),
with the health `BulkRow` (sleep/diet/steps) and **no workout lookup**. API consumed: `fetchMembershipDetails`,
`addDailyHealthLogsBatch`. `ProgramContext` for programs/roles/user/`widgetRoute`.

## 6. Data / API

- **`GET /program-memberships/details?programId=`** (`fetchMembershipDetails`) — per selected program, active
  members, **intersected** for the member picker (cached per id in `programMembers`).
- **`POST /daily-health-logs/batch`** (`addDailyHealthLogsBatch`) — ONE call, `program_id` = first selected +
  `program_ids` = the full selection; per-entry empty fields omitted (upsert). Backend `requireDataEntryAllowed`
  (403 per program) + upsert semantics — the real boundary. (See [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md) D-C5.)

## 7. Role-based view rules

Identical to the twin (see [`widget-quick-add-workout` §7](../widget-quick-add-workout/SPEC.md#7-role-based-view-rules)):
**loggable-only program list** (active + not `isDataEntryLocked`; `currentProgramId` is "" so nothing pre-checked);
**member self-lock (`ignoreMember`)** when the viewer isn't admin/logger/global-admin in every selected program —
the member column hides and all rows seed to self. A program with `admin_only_data_entry` on is **dropped** from
the list (loggers not exempt).

## 8. States & edge cases

Same as the twin, plus the health-specific gates: **sleep sanitize** (2 digits/field), **sleep validity** (0:00–
24:00), **steps** whole-number ≥ 0, **at-least-one-metric** (`sleepValue != nil || foodQuality != nil || steps !=
nil`), and **in-batch (member, date) duplicate** detection (client-side red highlight; the backend upserts). Date
bounded to today-or-earlier. Transient per-program fetch failure does **not** wipe entered rows (§10 F3).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-BATCH** | **The widget IS the in-app multi-row batch form** (`AddDailyHealthDetailView`), + 2 deltas: **(1) no auto-selected program** (`currentProgramId: ""`, no seeding, `alwaysShow: true`); **(2) custom back button** → `exitToMyPrograms()`. Replaces the legacy single-entry per-program-loop + rollback form. **Gains the steps field** (in-app parity). Batch save = one `POST /daily-health-logs/batch` (`program_ids` = selection, upsert). Member options are the **intersection** across selected programs. | User request 2026-07-09 ("use the in-app form, not auto-selected"); in-app `AddDailyHealthDetailView`; `daily-health-logs` D-C5. |
| **D-LOGGABLE** | **Program list shows only loggable programs** — same shared-`ProgramMultiSelectSection` change as the twin (active + not-locked; current kept; drops completed/locked). | User request 2026-07-09. |
| **D-REUSE** | **No new component / no new API** — reuses `ProgramMultiSelectSection`, the in-app row card/validation/save (ported into the widget's own `@State`), and `addDailyHealthLogsBatch`. Retired scaffold deleted. | in-app steps-feature; widget pattern. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Note |
|----|----------------|-------|------|
| **F1** | **Client role/metric gates are UI-only** — backend `requireDataEntryAllowed` + upsert are the real boundary. | `QuickAddHealthWidgetEntryView.swift` | Kept (faithful to the in-app twin). |
| **F2** | **Success toast + ~1.4 s auto-exit kept** (widget deep-link identity, not the in-app immediate dismiss). | `scheduleSuccessDismiss()` | Kept (deliberate, D-BATCH delta 2). |
| **F3** | **Member intersection preserved on transient fetch failure** — reconciliation skipped while any selected program's lookup is nil. | `syncRowsAfterSelectionChange()` | Deliberate (adversary finding). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **D-BATCH — the widget is now the in-app multi-row batch "Log daily health" form** (`AddDailyHealthDetailView`), replacing the legacy single-entry sleep+diet quick-add (per-program `addDailyHealthLog` loop + rollback). Two deltas: **no auto-selected program** + the **custom back button** exits to My Programs. **Gains the steps field** (in-app parity; the legacy widget had only sleep + diet). Save = one `POST /daily-health-logs/batch` (`program_ids` = selection, upsert; `applyRowErrors` on error). Member options stay the **intersection** across selected programs; in-batch (member, date) duplicates flagged client-side. **D-LOGGABLE** — the shared `ProgramMultiSelectSection` now lists only loggable programs (mirrored on web/android + the in-app forms). **D-REUSE** — no new component/API; retired scaffold deleted. Adversary-hardened (F3; admin rows start empty). Native build green via the xcode MCP (0 errors). |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 65) — the legacy single-entry Quick Add Daily Health widget (multi-program select + member intersection + sanitized sleep + at-least-one-metric [sleep/diet] + per-program save loop + rollback + exit-to-My-Programs) + D-C1 per-program lock, D-C2 shared chrome, D-C3 shared scaffold. Superseded by 0.2.0 (D-BATCH). |
