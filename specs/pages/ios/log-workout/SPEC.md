# Screen: `log-workout` (ios) — the Summary "Add workout" log form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `AdminSummaryTab`'s "Add workout" log-action card
> (`AdminSummaryTab.swift:192-199`, `NavigationLink { AddWorkoutDetailView() }`). When the program is
> `dataEntryLocked` the card is dimmed + the `NavigationLink` removed (run 54), so a locked non-admin
> cannot reach this screen.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Helpers/AdminHomeHelpers.swift`
> (`AddWorkoutDetailView`, lines 1838-2127).
> **Web parity reference:** [`web summary/log-workout`](../../web/summary/log-workout/SPEC.md) — same
> member/self-lock + workout + date + duration form, same `canLogForAny` + `admin_only_data_entry` lock.
> **Consumes:** `APIClient.addWorkoutLog` (`POST /workout-logs`) directly (as legacy does); reads lookups
> from `ProgramContext`.
> **Stance:** faithful 1:1 port of the legacy iOS `AddWorkoutDetailView` **+ 4 web-parity/consistency
> deviations** (D-C1 lock guard, D-C2 shared chrome, D-C3 success refresh, D-C4 inline errors). Oddities §10.

---

## 1. What it is + who uses it

The **log-workout screen** — a native form to log one completed workout: pick the **member** (admins/loggers
only; a plain member is locked to themselves), the **workout type**, a **date**, and a **duration**
(hours + minutes). Used by **global_admin**, **program admin**, **logger** (any member), and a **member**
(self only). The iOS analogue of web `/summary/log-workout`.

## 2. Why it exists

Logging workouts is the app's core write action. This is the mobile form the Summary "Add workout" card
opens. It POSTs to `/workout-logs`; the backend re-authorizes (`canLogForAny`) and enforces the
`admin_only_data_entry` lock (403). On success it refreshes the Summary analytics.

## 3. Route / location

- **App:** `ios`. **Reached via:** `AdminSummaryTab` "Add workout" card →
  `NavigationLink { AddWorkoutDetailView() }` (zero-arg init; reads everything from `ProgramContext`).
- **Leaves to:** back to Summary — on successful save (D-C3) or a `dataEntryLocked` mount guard (D-C1),
  both via `dismiss()`. No forward-nav.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Subtitle | "Log a completed workout." | new (chrome) |
| Member | If `canSelectAnyMember` → tappable `LogFieldRow` → `SearchablePickerSheet` of `members`; else a **locked** row (lock icon) showing the logged-in user's name. | legacy `:2037-2073` |
| Workout | Tappable `LogFieldRow` → `SearchablePickerSheet` over non-hidden `programWorkouts` (or global `workouts` if no program). | legacy `:1948-1967`, `:2005-2012` |
| Date | Compact `DatePicker` (any date). | legacy `:2022-2034` |
| Duration | Two `AppInputField`s (`Hours`/`Minutes`, `.numberPad`), combined to total minutes. | legacy `:1971-2001` |
| Error line (conditional) | `appRed` footnote on save failure (D-C4). | legacy `:1857-1861` |
| Save | `AppPrimaryButton` "Save workout" / "Saving…"; disabled unless member + workout + duration > 0 and not saving. | legacy `:2075-2100` |

**Save flow** (`save()`): `APIClient.addWorkoutLog(memberName, workoutName, date "yyyy-MM-dd",
durationMinutes, programId, memberId)` → on success bump `ProgramContext.summaryRefreshToken` (D-C3) →
`dismiss()`. On error → inline `appRed` line (D-C4).

## 5. Components + features consumed

- **Components:** `AppInputField` (D-C2; extended this run with a `keyboardType` param), `AppPrimaryButton`
  (D-C2), `SearchablePickerSheet` (member + workout — as legacy), native `DatePicker`, and the new shared
  `LogFieldLabel`/`LogFieldRow`/`LogDateFormatter` (`Features/Home/Detail/LogFormComponents.swift`).
- **Features:** none as a module — the form calls `APIClient.shared.addWorkoutLog` directly (faithful);
  lookups come from `ProgramContext` (`members`/`workouts`/`programWorkouts` via
  `loadLookupData`/`loadProgramWorkouts`; `programId`/`authToken`/roles).

## 6. Data / API

- **`POST /workout-logs`** (`APIClient.addWorkoutLog`) — body `{ member_name, workout_name, date, duration,
  program_id?, member_id? }`. Backend `requireDataEntryAllowed` (403 when locked + non-admin) +
  `resolveLogPermissions` (403 "You can only log your own workouts." when a non-`canLogForAny` requester
  targets another member). Fire-and-forget (no response DTO). On success the client bumps
  `summaryRefreshToken`; `AdminSummaryTab.onChange` reloads the analytics — the iOS analogue of web's
  `invalidateQueries(["summary"])`.

## 7. Role-based view rules

| Viewer | Member field | Can log for |
|--------|--------------|-------------|
| global_admin | Picker (`canSelectAnyMember`). | Any member. |
| program admin | Picker. | Any member. |
| logger | Picker. | Any member. |
| member | **Locked** to self (auto-selected via `loggedInUserId`). | Self only (backend 403 otherwise). |

**`admin_only_data_entry` = LIVE (this is a WRITE path).** When `dataEntryLocked`
(`adminOnlyDataEntry && !isProgramAdmin`, so loggers/members are blocked when the flag is on): the Summary
card is already disabled (run 54) **and** this screen's mount guard `dismiss()`es back to Summary (D-C1,
web parity to `router.replace("/summary")`); the backend `requireDataEntryAllowed` is the real boundary.
Note `canSelectAnyMember` (member field) includes **logger**, but `isProgramAdmin` (the lock exemption)
does **not** — a logger can normally log for any member yet is locked out when the flag is on (matches web
+ backend).

## 8. States & edge cases

- **Init (`task`):** if `dataEntryLocked` → `dismiss()` (D-C1); else `ensureLookups()` (load
  members/workouts + program workouts; auto-select self when locked to self).
- **Invalid form:** Save disabled + dimmed until member + workout + duration > 0.
- **Saving:** `isSaving` swaps the button spinner + disables Save.
- **Error:** caught → inline `appRed` line (backend message surfaces) (D-C4).
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
| **D-DEPS** | **No new view component; two tiny foundation touches** — (a) `AppInputField.keyboardType` param (non-breaking); (b) `ProgramContext.summaryRefreshToken` published Int + the `AdminSummaryTab.onChange` observer (D-C3). Plus the shared `LogFormComponents.swift` (label/row/formatter) used by both forms. Every API method (`addWorkoutLog`), DTO, and `dataEntryLocked` already existed (foundation run 50 + run 54). | foundation inventory; run-50/54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client role gate is UI-only** — `canSelectAnyMember` (global_admin/admin/logger) drives the picker vs self-lock; the backend `resolveLogPermissions` is the real boundary. | `AddWorkoutDetailView.swift` `canSelectAnyMember` | Kept (faithful) — mirrors web F. |
| **F2** | **`program_id` is passed whenever set** (always set in the Summary context); the legacy UUID pre-validation is elided since the picker only reaches here inside a program. | `AddWorkoutDetailView.swift` `save()` | Kept (faithful-equivalent). |
| **F3** | **Workout picker source bifurcates** — non-hidden `programWorkouts` when in a program, else global `workouts`. | `AddWorkoutDetailView.swift` `workoutOptions` | Kept (faithful). |
| **F4** | **No client rate-limit/debounce** beyond the `isSaving` disable. | `AddWorkoutDetailView.swift` | Kept (faithful). |
| **F5** | **Summary refresh is a coarse full reload** (bumps a token → `AdminSummaryTab.load()` re-runs every loader), not a targeted invalidation like web's keyed query. | `ProgramContext.summaryRefreshToken` + `AdminSummaryTab.onChange` | Kept (D-C3) — simplest faithful analogue; a scoped refresh is a rebuild candidate. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 60) — the Summary **log-workout form**, ported into `apps/ios/.../Features/Home/Detail/AddWorkoutDetailView.swift` (+ shared `LogFormComponents.swift`); the deferred stub removed. **D-REF** (legacy iOS + web `summary/log-workout` parity; `consumed_by=[ios]`) · **D-SCOPE** (cohesive log-forms cluster with `log-health`) · **D-S1** (faithful 1:1; both agree → faithful IS web parity) · **D-C1** (web-parity `admin_only_data_entry` mount guard — legacy had none; completes run-54) · **D-C2** (adopt shared `AppInputField`/`AppPrimaryButton`; +`keyboardType` param) · **D-C3** (success → `summaryRefreshToken` refresh + `dismiss`, drop the success Alert) · **D-C4** (inline errors) · **D-DEPS** (no new view component; `keyboardType` + `summaryRefreshToken` + `onChange` + `LogFormComponents`; all API/DTO/`dataEntryLocked` already ported). Flagged F1–F5. Role rules: `canSelectAnyMember` (admin/logger/global_admin) picker vs member self-lock; `admin_only_data_entry` LIVE (write path). Build green-check owned by the user (Xcode); symbols grep-verified. |
