# Screen: `log-workout` (ios) — the Summary "Add workouts" multi-row log form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `AdminSummaryTab`'s "Add workouts" log-action card
> (`NavigationLink { AddWorkoutsDetailView() }`). When the program is `dataEntryLocked` the card is dimmed +
> the `NavigationLink` removed (run 54), so a locked non-admin cannot reach this screen.
> **Provenance:** merged from the former `AddWorkoutDetailView` (single-add) + `BulkAddWorkoutDetailView`
> (admin-only multi-row) into one `AddWorkoutsDetailView` (2026-07-01); both predecessors deleted.
> **Web parity reference:** [`web summary`](../../web/summary/SPEC.md) `LogWorkoutsForm` — same unified
> multi-row form, same per-row member picker (admin/logger) vs member-column-hidden (plain member).
> **Consumes:** `APIClient.addWorkoutLogsBatch` (`POST /workout-logs/batch`) directly; reads lookups from
> `ProgramContext`.
> **Stance:** the multi-row form (formerly bulk) is now the sole workout-add entry point on both surfaces
> (`workout-logs` D-C8 — members batch-log their own rows). Deviations: D-C1 lock guard, D-C2 shared chrome,
> D-C3 success refresh, D-C4 inline errors, **D-C5 merge single+bulk → member column hidden for members**.
> Oddities §10.

---

## 1. What it is + who uses it

The **Add-workouts screen** — a native **multi-row** form to log one **or many** completed workouts at once:
each row has a **workout type**, a **date**, and a **duration** (hours + minutes); admins/loggers also get a
per-row **member** picker while a plain member has the member column **hidden** (every row is implicitly
themselves). Add up to 200 rows; save them all in one atomic batch. Used by **global_admin**, **program
admin**, **logger** (any member, per row) and a **member** (self only). The iOS analogue of web's
`LogWorkoutsForm`.

## 2. Why it exists

Logging workouts is the app's core write action, and people often do several different workout types in a
day. This is the mobile form the Summary "Add workouts" card opens. It POSTs to `/workout-logs/batch`; the
backend re-authorizes (admin/logger for anyone; a member only for their own rows — `workout-logs` D-C8) and
enforces the `admin_only_data_entry` lock (403). Duplicate (member, workout, date) rows are rejected 409
(all-or-nothing). On success it refreshes the Summary analytics.

## 3. Route / location

- **App:** `ios`. **Reached via:** `AdminSummaryTab` "Add workouts" card →
  `NavigationLink { AddWorkoutsDetailView() }` (zero-arg init; reads everything from `ProgramContext`).
- **Leaves to:** back to Summary — on successful save (D-C3) or a `dataEntryLocked` mount guard (D-C1),
  both via `dismiss()`. No forward-nav.

## 4. Contents / sections

| Block | What | Reference |
|-------|------|-----------|
| Subtitle | "Add a row per session … then save them all at once." (member variant omits "member"). | `AddWorkoutsDetailView.swift` |
| Rows (repeating) | A `ForEach` of row cards; per-row **✕ remove**, red highlight + message on a backend/client error. Up to 200 rows. | `rowCard` |
| Member (per row) | Only when `canSelectAnyMember` → tappable `LogFieldRow` → `SearchablePickerSheet` of `members`. **Plain member: the member field is hidden entirely** and each row is seeded to the logged-in member. | `rowCard` / `memberField` (removed for members) |
| Workout (per row) | Tappable `LogFieldRow` → `SearchablePickerSheet` over non-hidden `programWorkouts` (or global `workouts` if no program). | `rowCard` |
| Date (per row) | Compact `DatePicker` (any date; new rows default to the last row's date). | `rowCard` |
| Duration (per row) | Two `AppInputField`s (`Hours`/`Minutes`, `.numberPad`), combined to total minutes. | `rowCard` |
| Add-row controls | "+ Add row" / "+ Add 5 rows" (disabled at 200). | `addRowControls` |
| Summary line | "N rows • [M members •] T min total" (member count shown only for admin/logger). | `summaryLine` |
| Save | `AppPrimaryButton` "Save all" / "Saving…"; disabled unless ≥1 valid row and 0 invalid rows. | `save()` |

**Save flow** (`save()`): build `[APIClient.BulkWorkoutEntry]` from the valid rows →
`APIClient.addWorkoutLogsBatch(token, programId, entries)` → on success bump
`ProgramContext.summaryRefreshToken` (D-C3) → `dismiss()`. On `BulkWorkoutError` → map per-row `rowErrors`
onto rows (red highlight) + top error line; other errors → inline `appRed` line (D-C4).

## 5. Components + features consumed

- **Components:** `AppInputField` (D-C2; `keyboardType` param), `AppPrimaryButton` (D-C2),
  `SearchablePickerSheet` (member + workout), native `DatePicker`, and the shared
  `LogFieldLabel`/`LogFieldRow`/`LogDateFormatter` (`Features/Home/Detail/LogFormComponents.swift`).
- **Features:** none as a module — the form calls `APIClient.shared.addWorkoutLogsBatch` directly; lookups
  come from `ProgramContext` (`members`/`workouts`/`programWorkouts` via
  `loadLookupData`/`loadProgramWorkouts`; `programId`/`authToken`/roles/`loggedInUserId`/`loggedInUserName`).

## 6. Data / API

- **`POST /workout-logs/batch`** (`APIClient.addWorkoutLogsBatch`) — body `{ program_id, entries: [{
  member_id, workout_name, date, duration }] }`. Backend `requireDataEntryAllowed` (403 when locked +
  non-admin) + batch authorization (`workout-logs` D-C8): admin/logger/global-admin log for anyone; a plain
  member is allowed only if every `entry.member_id` equals the requester (403 "You can only log workouts for
  yourself." otherwise). Duplicate (member, workout, date) rows — in-batch or vs an existing log — → 409 with
  per-row `rowErrors` (`field:"duplicate"`), atomic (no writes). Returns `{ created, updated, total_minutes,
  groups, total_entries }`. On success the client bumps `summaryRefreshToken`; `AdminSummaryTab.onChange`
  reloads the analytics — the iOS analogue of web's `invalidateQueries(["summary"])`.

## 7. Role-based view rules

| Viewer | Member field (per row) | Can log for |
|--------|------------------------|-------------|
| global_admin | Picker (`canSelectAnyMember`). | Any member, per row. |
| program admin | Picker. | Any member, per row. |
| logger | Picker. | Any member, per row. |
| member | **Hidden** — each row seeded to self (`loggedInUserId`/`loggedInUserName`). | Self only (backend 403 on any foreign row). |

**`admin_only_data_entry` = LIVE (this is a WRITE path).** When `dataEntryLocked`
(`adminOnlyDataEntry && !isProgramAdmin`, so loggers/members are blocked when the flag is on): the Summary
"Add workouts" card is already disabled (run 54) **and** this screen's mount guard `dismiss()`es back to
Summary (D-C1); the backend `requireDataEntryAllowed` is the real boundary. Note `canSelectAnyMember`
(per-row member picker) includes **logger**, but `isProgramAdmin` (the lock exemption) does **not** — a
logger can normally log for any member yet is locked out when the flag is on (matches web + backend).

## 8. States & edge cases

- **Init (`task`):** if `dataEntryLocked` → `dismiss()` (D-C1); else `ensureLookups()` + seed one starter
  row (member rows are pre-seeded to self so a fresh row still reads as "empty" until a workout/duration is
  entered — `ignoreMember` gate).
- **Empty vs invalid rows:** empty rows are skipped; a non-empty row missing workout/duration shows an
  inline error and blocks the whole submit (all-or-nothing).
- **Saving:** `isSaving` swaps the button spinner + disables Save.
- **Error:** `BulkWorkoutError` → per-row red highlight (mapped by submit index) + top error line; other
  errors → inline `appRed` line (D-C4).
- **Success:** bump `summaryRefreshToken` → `dismiss()` to Summary (no success Alert) (D-C3).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `AdminHomeHelpers.swift` `AddWorkoutDetailView`; web parity = [`web summary/log-workout`](../../web/summary/log-workout/SPEC.md). `consumed_by=[ios]`.** | legacy file; web SPEC. |
| **D-SCOPE** | **Ported as part of the Summary log-forms cluster** (run-58/59 cohesive-cluster precedent) with [`log-health`](../log-health/SPEC.md) — the two Summary log-action-card targets (deferred stubs since run 54). Both stubs removed. | run-58/59; AdminSummaryTab call sites. |
| **D-S1** | **Stance = faithful 1:1 port** of the legacy form (member self-lock, workout/date/duration fields, `canSelectAnyMember`, `addWorkoutLog` via `APIClient.shared` directly) **+ the deviations below**; both legacy iOS and web agree on the form shape (the run-55/56 both-agree verdict) so faithful IS web parity for the fields. | legacy file; web SPEC; user answer. |
| **D-C1** | **Web-parity `admin_only_data_entry` mount guard** — `task` `dismiss()`es when `dataEntryLocked`, the iOS analogue of web's `router.replace("/summary")`. Legacy iOS had **no** lock handling (relied on the backend 403). Defensive parity (the Summary card is already disabled, run 54); completes the run-54 lock story on the actual write path. | web log-workout §7; legacy (no guard); [[ios-matches-web-not-just-legacy]]; run-54. |
| **D-C2** | **Adopt the foundation's shared chrome** — `AppInputField` (duration fields; extended with a non-breaking `keyboardType` param) + `AppPrimaryButton` (Save), matching the run-51 auth + run-58 settings screens (run-31 "match the rebuild's established pattern"). Pickers stay `SearchablePickerSheet` (what legacy uses). | run-31/51/58; user answer. |
| **D-C3** | **Success UX → web parity** — on save, bump `ProgramContext.summaryRefreshToken` (Summary reloads via `onChange`) + `dismiss()`, **dropping the legacy success Alert** ("Workout logged"). The iOS analogue of web's `invalidateQueries(["summary"]) → router.push`. | web log-workout D-C1; user answer. |
| **D-C4** | **Error UX → inline** — an `appRed` error line (already legacy behavior for the workout form; matches web). | legacy `:1857-1861`; web; user answer. |
| **D-C5** | **Merge single "Add workout" + admin-only "Bulk add" → one multi-row "Add workouts"** (`AddWorkoutsDetailView`, repurposed from `BulkAddWorkoutDetailView`; `AddWorkoutDetailView` + `BulkAddWorkoutDetailView` deleted; the `.bulkAdd` `SummaryCardType` + `BulkAddWorkoutCard` removed). Opened to **plain members** (the card was admin/logger-only): the per-row member field is **hidden** and each row is seeded to self; `ignoreMember = !canSelectAnyMember` gates the empty/valid/error-row checks so a pre-seeded member row still behaves as empty. Always posts to `/workout-logs/batch` (backed by `workout-logs` D-C8). Web parity = `LogWorkoutsForm`. | user request 2026-07-01; [[ios-matches-web-not-just-legacy]]; `workout-logs` D-C8; web summary v0.2.0. |
| **D-DEPS** | **No new view component; two tiny foundation touches** — (a) `AppInputField.keyboardType` param (non-breaking); (b) `ProgramContext.summaryRefreshToken` published Int + the `AdminSummaryTab.onChange` observer (D-C3). Plus the shared `LogFormComponents.swift` (label/row/formatter) used by both forms. Every API method (`addWorkoutLog`), DTO, and `dataEntryLocked` already existed (foundation run 50 + run 54). | foundation inventory; run-50/54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client role gate is UI-only** — `canSelectAnyMember` (global_admin/admin/logger) drives the per-row picker vs the hidden-member self-seed; the backend batch authorization (D-C8) is the real boundary. | `AddWorkoutsDetailView.swift` `canSelectAnyMember` | Kept (faithful) — mirrors web F. |
| **F2** | **`program_id` is passed whenever set** (always set in the Summary context); the legacy UUID pre-validation is elided since the picker only reaches here inside a program. | `AddWorkoutsDetailView.swift` `save()` | Kept (faithful-equivalent). |
| **F3** | **Workout picker source bifurcates** — non-hidden `programWorkouts` when in a program, else global `workouts`. | `AddWorkoutsDetailView.swift` `workoutOptions` | Kept (faithful). |
| **F4** | **No client rate-limit/debounce** beyond the `isSaving` disable. | `AddWorkoutsDetailView.swift` | Kept (faithful). |
| **F5** | **Summary refresh is a coarse full reload** (bumps a token → `AdminSummaryTab.load()` re-runs every loader), not a targeted invalidation like web's keyed query. | `ProgramContext.summaryRefreshToken` + `AdminSummaryTab.onChange` | Kept (D-C3) — simplest faithful analogue; a scoped refresh is a rebuild candidate. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-01 | **Merged the single `AddWorkoutDetailView` + admin-only `BulkAddWorkoutDetailView` into one multi-row `AddWorkoutsDetailView`** (both predecessors deleted; `.bulkAdd` `SummaryCardType` + `BulkAddWorkoutCard` removed; the orange "Add workout" card retitled "Add workouts" and pointed at the new view). **D-C5** — opened to plain members with the per-row member field **hidden** (each row seeded to self via `loggedInUserId`; `ignoreMember` gates the empty/valid/error checks); always posts `POST /workout-logs/batch` (backed by `workout-logs` D-C8 — members batch-log their own rows). All-or-nothing duplicate rejection + per-row red highlight retained from the bulk form. Web parity = web `summary` `LogWorkoutsForm` (v0.2.0). Updated §1–§10. `BuildProject` ✓ 0 errors (ios-build run 69). Simulator/visual check owned by the user. |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 60) — the Summary **log-workout form**, ported into `apps/ios/.../Features/Home/Detail/AddWorkoutDetailView.swift` (+ shared `LogFormComponents.swift`); the deferred stub removed. **D-REF** (legacy iOS + web `summary/log-workout` parity; `consumed_by=[ios]`) · **D-SCOPE** (cohesive log-forms cluster with `log-health`) · **D-S1** (faithful 1:1; both agree → faithful IS web parity) · **D-C1** (web-parity `admin_only_data_entry` mount guard — legacy had none; completes run-54) · **D-C2** (adopt shared `AppInputField`/`AppPrimaryButton`; +`keyboardType` param) · **D-C3** (success → `summaryRefreshToken` refresh + `dismiss`, drop the success Alert) · **D-C4** (inline errors) · **D-DEPS** (no new view component; `keyboardType` + `summaryRefreshToken` + `onChange` + `LogFormComponents`; all API/DTO/`dataEntryLocked` already ported). Flagged F1–F5. Role rules: `canSelectAnyMember` (admin/logger/global_admin) picker vs member self-lock; `admin_only_data_entry` LIVE (write path). Build green-check owned by the user (Xcode); symbols grep-verified. |
