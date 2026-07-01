# Screen: `edit-program` (ios) — the swipe-to-edit program editor

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramPickerView`'s swipe-left **Edit** action on a card the viewer
> `canManage` (`ProgramPickerView.swift:168-171`, `navigationDestination(item: $programToEdit)`); the picker
> calls `applyProgram(program)` first to hydrate `ProgramContext`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/EditProgramInfoView.swift`.
> **Web parity reference:** [`web program/edit`](../../web/program/edit/SPEC.md) — same name/status/dates +
> **admin-only-data-entry toggle** + the three deployment cleanups (D-C1 date-range validation, D-C2
> hydrate-from-response, D-C3 skip-no-op).
> **Consumes (features):** [`programs`](../../../features/programs/SPEC.md) — `updateProgram()`
> (`PUT /programs/:id`).
> **Stance:** faithful 1:1 port of the legacy iOS `EditProgramInfoView` (name + status + dates) **+ the
> web-parity admin-only-data-entry toggle (D-C1)** the legacy iOS lacked **+ the three web Edit cleanups
> (D-C2)**. Oddities flagged §10.

---

## 1. What it is + who uses it

The **edit-program screen** — where a program manager updates a program's **name**, **status**, **start/end
dates**, and (web-parity ADD) the **admin-only-data-entry** lock. Reached from the picker's swipe-left Edit
action, available only on cards the viewer can manage. Used by **global_admin** (any program) and a
**program admin** (their own program); loggers/members never reach it (the swipe action is gated `canManage`).

## 2. Why it exists

To give managers native control over program details + the data-entry lock, matching the built web
`/program/edit`. Save goes through `updateProgram` (`PUT /programs/:id`); the **admin-only-data-entry toggle**
sets the per-program flag that downstream log screens read to block non-admins. The legacy iOS edit screen
had **no toggle at all** (iOS could never set the lock natively) — this port closes that web↔iOS gap toward
web parity (memory [[ios-matches-web-not-just-legacy]]), completing the run-54 lock story: the Summary tab
already **displays** the lock; this is where you **set** it.

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramPickerView` swipe-left Edit (`canManage` only) →
  `navigationDestination(item: $programToEdit) { EditProgramInfoView() }`; `applyProgram` hydrates
  `ProgramContext` first, so the form reads from the context (no `program` argument).
- **Leaves to:** back to the picker (nav back, or the success `Alert`'s OK → `dismiss()`). No forward-nav.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "Edit Program" title + "Update program details" subtitle. | legacy `EditProgramInfoView.swift:20-27` |
| Program name | `TextField` (`systemGray6`/`cornerRadius 12`), required. | legacy `:31-39` |
| Status menu | `Menu` of `["active","planned","completed"]`. | legacy `:42-61` |
| Start / End date | Two compact `DatePicker`s. | legacy `:64-87` |
| **Admin-only data entry (web-parity ADD)** | A `Toggle` ("Admin-only data entry", `appOrange` tint) + the web description: "When on, only admins can add, edit, or delete workouts and health logs. Loggers and members are blocked." | new; mirrors web `edit/page.tsx:161-182` |
| Date-range error (conditional) | `appRed` footnote "End date must be after the start date." when `start >= end` (web D-C1). | new; mirrors web `edit/page.tsx:151-155` |
| Error line (conditional) | `appRed` footnote on save failure. | legacy `:90-94` |
| Save button | "Save changes" / `ProgressView`; disabled unless name non-empty **and** date-range valid **and** not saving. | legacy `:96-113` + D-C1 |

**Save flow** (`save()`): **skip a no-op PUT** when nothing changed vs the loaded snapshot (D-C3 → just
`dismiss()`); else `updateProgram(name, status, startDate, endDate, adminOnlyDataEntry)` → `PUT /programs/:id`
→ the context **hydrates local state from the response** (D-C2) → success `Alert` → OK dismisses.

## 5. Components + features consumed

- **Components:** native `TextField`/`Menu`/`DatePicker`/`Toggle`/`Alert`, `adaptiveBackground(topLeading:)`,
  `Color.appOrange`/`appRed`. **No new component** — all foundation chrome (run 50).
- **Features:** [`programs`](../../../features/programs/SPEC.md) — `ProgramContext.updateProgram()` over
  `APIClient.updateProgram()`; reads program fields from `ProgramContext` (`name`/`status`/`startDate`/
  `endDate`/`adminOnlyDataEntry`, hydrated by `applyProgram`).

## 6. Data / API

- **`PUT /programs/:id`** (via `updateProgram`) — body `{ name?, status?, start_date?, end_date?,
  admin_only_data_entry? }` (dates as `yyyy-MM-dd`; the toggle is the **new** field this run added to the
  iOS client). Backend enforces program-admin/global_admin (403). The response (`ProgramUpdateResponse`,
  now carrying `admin_only_data_entry`) **re-hydrates** `ProgramContext.{name,status,startDate,endDate,
  adminOnlyDataEntry}` (D-C2). No read endpoint — the form initializes from the picker-hydrated context.

## 7. Role-based view rules

| Viewer | Reaches the screen? | Can do |
|--------|---------------------|--------|
| global_admin | Yes (any program — `canManage`). | Edit name/status/dates + toggle the lock. |
| program admin | Yes (own program — `canManage`). | Edit name/status/dates + toggle the lock. |
| logger · member | **No** — the picker's swipe-Edit action is hidden (`canManage = isGlobalAdmin \|\| (active && my_role == "admin")`). | — |

The screen itself has **no internal role gate** (faithful legacy) — access is gated upstream at the picker's
swipe action; the backend `PUT /programs/:id` is the real authorization boundary (F1).
**`admin_only_data_entry` = N/A as a GATE** — this screen is where the flag is **edited**, not a lock on the
editor (the run-27 "this IS the write path for the flag" inversion).

## 8. States & edge cases

- **Init:** `onAppear` loads name/status/dates/lock from `ProgramContext` + snapshots them for the no-op check.
- **Date-range invalid:** `start >= end` (day-granularity) → inline `appRed` error + Save disabled (D-C1).
- **No-op save:** form unchanged vs the snapshot → `dismiss()` with no network call (D-C3).
- **Saving:** `isSaving` swaps a `ProgressView` + disables Save.
- **Save error:** caught → `appRed` line (backend message surfaces).
- **Success:** "Saved" `Alert` → OK → `dismiss()` back to the picker; the context already reflects the
  server row (D-C2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Home/EditProgramInfoView.swift`; web parity = [`web program/edit`](../../web/program/edit/SPEC.md). `consumed_by=[ios]`.** | legacy file; web edit SPEC. |
| **D-SCOPE** | **Ported as part of the program create/edit/invites cluster** (run-58 cohesive-cluster precedent) with [`program-actions`](../program-actions/SPEC.md) — the picker's two deferred forward-nav targets. Both stubs removed. | run-58; ProgramPickerView call sites. |
| **D-S1** | **Stance = faithful 1:1 port** of the legacy `EditProgramInfoView` (header, name `TextField`, status `Menu`, start/end `DatePicker`s, Save via `updateProgram`, success `Alert`) **+ the deviations below.** | legacy `EditProgramInfoView.swift`; user answer. |
| **D-C1** | **Web-parity admin-only-data-entry toggle ADD** — a `Toggle` + the web description, absent from legacy iOS entirely. Required new iOS client plumbing: `adminOnlyDataEntry` param on `APIClient.updateProgram` + `ProgramContext.updateProgram` + the field on `ProgramUpdateResponse`. **Zero backend work, no feature bump** — the backend `PUT /programs/:id` already accepts it (web uses it); the run-58 ADD shape (existing endpoint, new 2nd client). Completes the run-54 lock story. | web edit toggle; user answer; [[ios-matches-web-not-just-legacy]]; run-54/58. |
| **D-C2** | **Adopt the 3 web Edit cleanups** — (a) **date-range validation** (`start >= end` → inline error + Save disabled, web D-C1); (b) **hydrate from the server response** (the context sets `name`/`status`/dates/lock from `ProgramUpdateResponse`, not the optimistic form input, web D-C2); (c) **skip a no-op PUT** (unchanged form → dismiss with no call, web D-C3). | web edit D-C1/D-C2/D-C3; user answer. |
| **D-DEPS** | **One new API-layer dependency** — the `adminOnlyDataEntry` ADD across `APIClient.updateProgram` + `ProgramUpdateResponse` + `ProgramContext.updateProgram` (the toggle write path). **No new view component** — all chrome is foundation (run 50). `ProgramDTO.admin_only_data_entry` + `ProgramContext.adminOnlyDataEntry` already existed (run 54). | foundation inventory; run-54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **No internal role gate** — access is gated only upstream at the picker's `canManage` swipe action; the screen renders unconditionally once reached. The backend `PUT /programs/:id` is the real boundary. | `EditProgramInfoView.swift` (no guard) + `ProgramPickerView.swift:80` | Kept (faithful) — mirrors web edit F1 (client gate + backend 403). |
| **F2** | **Form initializes from `ProgramContext`** (picker-hydrated via `applyProgram`), not a dedicated read endpoint. There is no `GET /programs/:id`. | `EditProgramInfoView.swift` `onAppear` | Kept (faithful) — web loads from the active-program cache too. |
| **F3** | **Date-range check is day-granularity** (compares `yyyy-MM-dd` strings); same-day start/end is an error (end must be *after* start). | `EditProgramInfoView.swift` `dateRangeError` | Kept (matches web D-C1 semantics). |
| **F4** | **No-op detection snapshots the loaded values** (name/status/`yyyy-MM-dd` dates/lock) and compares formatted strings — time-of-day differences don't trigger a false PUT. | `EditProgramInfoView.swift` `Snapshot` | Kept (D-C3) — intentional day-granularity comparison. |
| **F5** | **No client rate-limit/debounce** beyond the `isSaving` disable. | `EditProgramInfoView.swift` | Kept (faithful) — mirrors web edit F4. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 59) — the **swipe-to-edit program editor**, ported into `apps/ios/.../Features/Home/ProgramActions/EditProgramInfoView.swift`; the deferred stub removed. **D-REF** (legacy iOS + web `program/edit` parity; `consumed_by=[ios]`) · **D-SCOPE** (cohesive cluster with `program-actions`) · **D-S1** (faithful 1:1 port) · **D-C1** (web-parity admin-only-data-entry toggle ADD — new `adminOnlyDataEntry` on `APIClient.updateProgram` + `ProgramContext.updateProgram` + `ProgramUpdateResponse`; zero backend, no feature bump; completes the run-54 lock story) · **D-C2** (adopt the 3 web Edit cleanups — date-range validation, hydrate-from-response, skip-no-op PUT) · **D-DEPS** (one new API-layer dep, no new view component; `ProgramDTO.admin_only_data_entry` already existed run 54). Flagged F1–F5 (no internal role gate; init from context not a read endpoint; day-granularity date check; snapshot-based no-op; no client rate-limit). Role rules = `canManage` at the picker (global_admin any / program admin own); `admin_only_data_entry` N/A as a gate (this screen edits it). Build green-check owned by the user (Xcode); symbols grep-verified. |
