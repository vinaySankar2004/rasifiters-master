# Screen: `widget-quick-add-health` (ios) — the "Quick Add Daily Health" widget deep-link form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** presented by `AppRootView` when a Home-Screen widget deep-links `WidgetRoute.quickAddHealth`
> (`AppRootView.swift:83-105`, `.sheet(item: widgetRoute) { QuickAddHealthWidgetEntryView() }`, gated on
> `authToken != nil`). Exits via `exitToMyPrograms()` (`returnToMyPrograms = true`, `widgetRoute = nil`, `dismiss()`).
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Widgets/QuickAddHealthWidgetEntryView.swift`.
> **Web parity reference:** **NONE — iOS-only** (`consumed_by=[ios]`; widgets have no web analogue).
> Faithful-to-legacy-only (run-58 iOS-only-screen shape).
> **Consumes:** `APIClient.fetchMembershipDetails`, `addDailyHealthLog`, `deleteDailyHealthLog` (directly); reads
> programs/roles/user from `ProgramContext`. (No workout fetch — health has no workout field.)
> **Stance:** faithful 1:1 port of the legacy iOS view **+ the same 3 deviations as its twin** (D-C1 per-program
> lock, D-C2 shared chrome, D-C3 shared scaffold). The **write twin of [`widget-quick-add-workout`](../widget-quick-add-workout/SPEC.md)**. Oddities §10.

---

## 1. What it is + who uses it

The **Quick Add Daily Health** widget screen — a native form reached from a Home-Screen widget that logs the
**same daily-health metrics** (sleep hours:minutes + diet-quality 1–5) across **every selected active program** in
one save. Same audience + role model as its workout twin (global_admin / program admin / logger any shared member;
member self only).

## 2. Why it exists

The daily-health counterpart of the workout quick-add: a Home-Screen shortcut to log sleep + diet across several
programs at once. POSTs to `/daily-health-logs` per program; the backend enforces `admin_only_data_entry` (403);
partial failures **roll back**.

## 3. Route / location

Identical to the twin, but `WidgetRoute.quickAddHealth` → `QuickAddHealthWidgetEntryView()`. Leaves to **My
Programs** via `exitToMyPrograms()`; `interactiveDismissDisabled(true)`.

## 4. Contents / sections

Same scaffold as the twin (`WidgetQuickAddHeader` · `WidgetProgramSelector` · `WidgetMemberField` ·
`WidgetSuccessToast`, all D-C3) with the **health-specific fields** replacing workout/duration:

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | Title "Quick Add Daily Health" + subtitle. | legacy `:78-106` |
| Log to Programs | Multi-select w/ the D-C1 per-program lock. | legacy `:108-166` |
| Member | Picker vs locked self (shared field). | legacy `:168-223` |
| Date | Compact `DatePicker` **bounded `...Date()`** (no future dates — the twin allows any date), bordered chrome. | legacy `:225-237` |
| Sleep time | Two `AppInputField`s (`Hours`/`Minutes`, `.numberPad`) with a 2-digit **`sanitizeDigits`** `onChange`; an inline `appRed` "0:00–24:00" error when invalid (D-C2). | legacy `:239-275` |
| Diet quality | A `Menu` (ratings 1–5 + Clear) presenting a `LogFieldRow` (D-C2). | legacy `:277-302` |
| Error line (conditional) | `appRed` footnote on save failure. | legacy `:37-41` |
| Save | `AppPrimaryButton` "Save daily log" / "Saving…" (D-C2); disabled unless ≥1 program + member + valid sleep + **at least one metric**. | legacy `:304-323` |
| Success toast | `WidgetSuccessToast("Daily health logged")` → auto-exit ~1.4 s. | legacy `:325-338` |

**Save flow** (`save()`): per program → `addDailyHealthLog(programId, memberId, logDate "yyyy-MM-dd", sleepHours:
sleepValue, foodQuality)`; success → toast → auto-exit; partial failure → `deleteDailyHealthLog` rollback (same
pattern as the twin).

## 5. Components + features consumed

Same shared scaffold + chrome as the twin (D-C2/D-C3). API consumed: `fetchMembershipDetails`, `addDailyHealthLog`,
`deleteDailyHealthLog` (no workout fetch). `ProgramContext` for programs/roles/user/`widgetRoute`.

## 6. Data / API

- **`GET /program-memberships/details?programId=`** (`fetchMembershipDetails`) — per program, active members,
  intersected for the picker.
- **`POST /daily-health-logs`** (`addDailyHealthLog`) — one per selected program; body carries `sleepHours?`
  and `foodQuality?` (at least one required client-side). Backend `requireDataEntryAllowed` (403) is the boundary.
- **`DELETE /daily-health-logs`** (`deleteDailyHealthLog`) — rollback on partial failure.

## 7. Role-based view rules

Identical to the twin (see [`widget-quick-add-workout` §7](../widget-quick-add-workout/SPEC.md#7-role-based-view-rules)):
`canSelectAnyMember` picker vs member self-lock; **`admin_only_data_entry` = LIVE, per program (D-C1)** via
`widgetProgramLockedForLogging` (program/global admin exempt; loggers not). Legacy iOS had no lock handling.

## 8. States & edge cases

Same as the twin, plus the health-specific gates: **sleep sanitize** (digits, max 2 chars per field), **sleep
validity** (0:00–24:00, hours 0–24 / minutes 0–59; an out-of-range value shows the inline error and blocks save),
and **at-least-one-metric** (`sleepValue != nil || foodQuality != nil`) required for a valid form. Date is bounded
to today-or-earlier.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `QuickAddHealthWidgetEntryView`; NO web sibling — iOS-only** (`consumed_by=[ios]`). Faithful-to-legacy-only (run-58). | legacy file; run-58. |
| **D-SCOPE** | **Ported with its twin [`widget-quick-add-workout`](../widget-quick-add-workout/SPEC.md) as one run** — the last 2 deferred stubs → **CLOSES the iOS deferred layer**; `_DeferredScreenStubs.swift` deleted. | run-58/60/63; COVERAGE ios. |
| **D-S1** | **Stance = faithful 1:1** — multi-program select + member intersection + sanitized sleep + at-least-one-metric + save loop + rollback + exit-to-My-Programs kept verbatim **+ the deviations below**. | legacy file; user answer. |
| **D-C1** | **Per-program `admin_only_data_entry` write-lock** — same `widgetProgramLockedForLogging` predicate + treatment as the twin (net-new; completes the run-54/60/63 arc). | user answer; run-54/60/63. |
| **D-C2** | **Adopt shared chrome** — `LogFieldLabel`/`LogFieldRow` (labels + diet menu row), `AppInputField` (sleep fields, w/ the sanitize `onChange` applied externally), `AppPrimaryButton` (Save). The bespoke **appBlue** CTA becomes the label-capsule button (accepted). | user answer; run-60. |
| **D-C3** | **Uses the shared scaffold** `WidgetQuickAddComponents.swift` (header · program selector · member field · toast · member option · lock helper) authored with the twin. | user answer; run-60. |
| **D-DEPS** | **No new foundation dependency** — all API/DTO/`ProgramContext`/chrome pre-existed (run 50 + run 60); the one new file is the shared scaffold. **No feature bump** (page SPECs v0.1.0; `daily-health-logs` endpoints pre-exist — the Summary health form consumes them). | foundation inventory; run-50/60. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client role gate is UI-only** — backend `requireDataEntryAllowed` is the real boundary. | `canSelectAnyMember` | Kept (faithful). |
| **F2** | **Sequential per-program POST + best-effort rollback** (not transactional). | `save()` / `rollbackLogs()` | Kept (faithful) — bulk endpoint is a rebuild candidate. |
| **F3** | **At-least-one-metric is a client-only gate** (`hasAtLeastOneMetric`); the backend accepts either/both. | `isFormValid` | Kept (faithful; mirrors the run-37 log-health web gate). |
| **F4** | **Success toast + ~1.4 s auto-exit kept** (widget deep-link identity, not converted to immediate dismiss). | `scheduleSuccessDismiss()` | Kept (deliberate). |
| **F5** | **Save button color unified** — appBlue CTA → shared label-capsule (D-C2). | `saveButton` | Kept (D-C2) — accepted. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 65) — the **Quick Add Daily Health widget** form (write twin of `widget-quick-add-workout`), ported into `apps/ios/.../Features/Widgets/QuickAddHealthWidgetEntryView.swift` (shares `WidgetQuickAddComponents.swift`); the deferred stub removed. **D-REF** (legacy only; iOS-only, no web sibling) · **D-SCOPE** (twin cluster; last 2 stubs → **closes the iOS deferred layer**; `_DeferredScreenStubs.swift` deleted) · **D-S1** (faithful 1:1: multi-program + sanitized sleep + at-least-one-metric + save loop + rollback + exit) · **D-C1** (per-program lock, net-new) · **D-C2** (shared chrome; appBlue CTA → label-capsule) · **D-C3** (shared scaffold) · **D-DEPS** (no new foundation dep; no feature bump). Flagged F1–F5. Role rules per §7 (twin). Native build green via the xcode MCP (0 errors); symbols grep-verified. |
