# Screen: `log-health` (ios) — the Summary "Log daily health" multi-row form

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.1 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `AdminSummaryTab`'s "Log daily health" log-action card
> (`AdminSummaryTab.swift:205-212`, `NavigationLink { AddDailyHealthDetailView() }`). When the program is
> `dataEntryLocked` the card is dimmed + the `NavigationLink` removed (run 54), so a locked non-admin
> cannot reach this screen.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Helpers/AdminHomeHelpers.swift`
> (`AddDailyHealthDetailView`, lines 2129-2442).
> **Web parity reference:** [`web summary/log-health`](../../web/summary/log-health/SPEC.md) — same
> member/self-lock + date + sleep + diet form, at-least-one-metric gate, `canLogForAny` +
> `admin_only_data_entry` lock. **Twin of** [`log-workout`](../log-workout/SPEC.md).
> **Consumes:** `APIClient.addDailyHealthLogsBatch` (`POST /daily-health-logs/batch`) directly (0.2.0; was
> the single `addDailyHealthLog`).
> **Stance:** faithful 1:1 port of the legacy iOS `AddDailyHealthDetailView` **+ 4 web-parity/consistency
> deviations** (D-C1 lock guard, D-C2 shared chrome, D-C3 success refresh, D-C4 inline errors) **+ D-C5
> (0.2.0) batched multi-row rebuild with steps + program multi-select** (matching the workout form). Oddities §10.

---

## 1. What it is + who uses it

The **log-health screen** — a native **multi-row** form (0.2.0) to log one or many days' **sleep time**
(hours + minutes), **diet quality** (1–5), and/or **step count**, for a **member** (admins/loggers only; a
plain member is locked to themselves) on a **date** (any date per row). At least one metric (sleep **or**
diet **or** steps, R-1) is required per row. A **program multi-select** fans the save out to ≤20 programs
(`program_ids[]`). The iOS analogue of web `/summary/log-health`; the near-twin of
[`log-workout`](../log-workout/SPEC.md).

## 2. Why it exists

Daily-health logging is a core write action alongside workouts. This is the mobile form the Summary "Log
daily health" card opens. It POSTs to `/daily-health-logs`; the backend re-authorizes + enforces the
`admin_only_data_entry` lock. On success it refreshes the Summary analytics.

## 3. Route / location

- **App:** `ios`. **Reached via:** `AdminSummaryTab` "Log daily health" card →
  `NavigationLink { AddDailyHealthDetailView() }` (zero-arg init; reads from `ProgramContext`).
- **Leaves to:** back to Summary — on successful save (D-C3) or a `dataEntryLocked` mount guard (D-C1),
  both via `dismiss()`. No forward-nav.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Subtitle | "Log today's sleep and diet quality." | new (chrome) |
| Member | Same as log-workout — picker (`canSelectAnyMember`) or locked-to-self row. | legacy `:2352-2388` |
| Date | Compact `DatePicker` **restricted to past/today** (`in: ...Date()`). | legacy `:2276-2286` |
| Sleep time | Two `AppInputField`s (`Hours`/`Minutes`, `.numberPad`), **digit-sanitized ≤2 chars each**; combined to fractional hours; validation 0:00–24:00 with an inline error. | legacy `:2288-2322`, `:2438-2441` |
| Diet quality | `Menu` of 1–5 + a Clear option; optional. | legacy `:2324-2347` |
| Error line (conditional) | `appRed` footnote on save failure (D-C4 — replaces the legacy error **Alert**). | legacy `:2241-2244` |
| Save | `AppPrimaryButton` "Save daily log" / "Saving…"; disabled unless member + programId + valid sleep + at-least-one-metric and not saving. | legacy `:2390-2410` |

**Save flow** (`save()`): `APIClient.addDailyHealthLog(programId, memberId, logDate "yyyy-MM-dd",
sleepHours?, foodQuality?)` → on success bump `ProgramContext.summaryRefreshToken` (D-C3) → `dismiss()`.
On error → inline `appRed` line (D-C4).

## 5. Components + features consumed

- **Components:** `AppInputField` (D-C2, `keyboardType`), `AppPrimaryButton` (D-C2), `SearchablePickerSheet`
  (member), native `DatePicker`/`Menu`, and the shared `LogFieldLabel`/`LogFieldRow`/`LogDateFormatter`
  (`Features/Home/Detail/LogFormComponents.swift`, shared with log-workout).
- **Features:** none as a module — calls `APIClient.shared.addDailyHealthLog` directly; lookups from
  `ProgramContext` (`members` via `loadLookupData`; `programId`/`authToken`/roles).

## 6. Data / API

- **`POST /daily-health-logs/batch`** (`APIClient.addDailyHealthLogsBatch`, 0.2.0) — body `{ program_id,
  program_ids?, entries: [{ member_id, log_date, sleep_hours?, food_quality?, steps? }] }` (empty fields
  omitted). Backend `requireDataEntryAllowed` per program (403 when locked + non-admin) + per-program
  `canLogForAny` (403 "You can only log your own daily health."); per-row validates at-least-one-of-three
  (400), sleep 0–24, diet 1–5, steps ≥ 0; in-batch (member, date) dup 409 + `rowErrors`; existing rows
  UPSERT (daily-health-logs 0.2.0 D-C5). Success bumps `summaryRefreshToken` → `AdminSummaryTab` reloads.
  The single `POST /daily-health-logs` (`addDailyHealthLog` in `APIClient+Health.swift`) is untouched and
  now serves only the quick-add health widget + the sleep/steps sync writers.

## 7. Role-based view rules

Identical to [`log-workout` §7](../log-workout/SPEC.md#7-role-based-view-rules): member field is a picker
for global_admin/program admin/logger, locked-to-self for a member. **`admin_only_data_entry` = LIVE (WRITE
path)** — mount guard `dismiss()`es a `dataEntryLocked` viewer (D-C1); the Summary card is already disabled
(run 54); backend `requireDataEntryAllowed` is the real boundary. A logger can log for any member but is
locked out when the flag is on (`canSelectAnyMember` includes logger, `isProgramAdmin` doesn't).

## 8. States & edge cases

- **Init (`task`):** if `dataEntryLocked` → `dismiss()` (D-C1); else `ensureLookups()` (load members;
  auto-select self, falling back to the first member, when locked to self).
- **Sleep invalid:** hours 0–24 / minutes 0–59 / combined 0–24; an inline `appRed` "Sleep time must be
  between 0:00 and 24:00." shows and Save is blocked.
- **At-least-one-metric:** Save disabled until sleep **or** diet is provided (client gate; backend also 400s).
- **Saving / Error / Success:** as log-workout — spinner; inline error (D-C4, replacing the legacy Alert);
  success bumps `summaryRefreshToken` + `dismiss()` (no success Alert) (D-C3).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `AdminHomeHelpers.swift` `AddDailyHealthDetailView`; web parity = [`web summary/log-health`](../../web/summary/log-health/SPEC.md); twin of [`log-workout`](../log-workout/SPEC.md). `consumed_by=[ios]`.** | legacy file; web SPEC. |
| **D-SCOPE** | **Ported in the Summary log-forms cluster** with [`log-workout`](../log-workout/SPEC.md); both stubs removed. | run-58/59; AdminSummaryTab call sites. |
| **D-S1** | **Stance = faithful 1:1 port** (member self-lock, past/today date, sanitized sleep + 0–24 validation, diet 1–5 Menu, at-least-one-metric gate, `addDailyHealthLog` direct) **+ the deviations below**; legacy iOS and web agree on the form → faithful IS web parity. | legacy file; web SPEC; user answer. |
| **D-C1** | **Web-parity `admin_only_data_entry` mount guard** — `task` `dismiss()`es when `dataEntryLocked` (iOS analogue of `router.replace("/summary")`); legacy had none. Same as log-workout D-C1. | web log-health §7; legacy; [[ios-matches-web-not-just-legacy]]; run-54. |
| **D-C2** | **Adopt shared chrome** — `AppInputField` (sleep fields, `keyboardType`) + `AppPrimaryButton`; pickers stay `SearchablePickerSheet`. Same as log-workout D-C2. | run-31/51/58; user answer. |
| **D-C3** | **Success UX → web parity** — bump `summaryRefreshToken` + `dismiss()`, **dropping the legacy success Alert** ("Daily health logged"). | web log-health D-C1; user answer. |
| **D-C4** | **Error UX → inline** — an `appRed` line **replacing the legacy error `Alert`** ("Unable to log"), matching web + the workout form (legacy was internally inconsistent — workout inline, health Alert). | legacy `:2241-2244`; web; user answer. |
| **D-DEPS** | **No new view component**; shares the same two foundation touches (`AppInputField.keyboardType`, `ProgramContext.summaryRefreshToken` + `AdminSummaryTab.onChange`) and `LogFormComponents.swift` with log-workout. `addDailyHealthLog`/`MemberDTO`/`dataEntryLocked` already existed (run 50/54). | foundation inventory; run-50/54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client role gate is UI-only** (`canSelectAnyMember`); backend is the boundary. | `AddDailyHealthDetailView.swift` | Kept (faithful). |
| **F2** | **At-least-one-metric is a client gate** (backend also 400s); duplicate-per-date is backend-only (409, surfaced inline). | `AddDailyHealthDetailView.swift` `hasAtLeastOneMetric` | Kept (faithful) — mirrors web F. |
| **F3** | **Member auto-select falls back to the first member** when the logged-in user isn't found in the roster (self-lock case). | `AddDailyHealthDetailView.swift` `ensureLookups` | Kept (faithful legacy behavior). |
| **F4** | **`food_quality` is sent as explicit `null`** when cleared (matches the API contract); sleep omitted when blank. | `APIClient+Health.swift` `addDailyHealthLog` | Kept (faithful). |
| **F5** | **Summary refresh is a coarse full reload** (shared with log-workout F5). | `ProgramContext.summaryRefreshToken` | Kept (D-C3) — scoped refresh is a rebuild candidate. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-07-09 | **Loggable-only program list (D-LOGGABLE).** The shared `ProgramMultiSelectSection` now lists only loggable programs — active AND not `admin_only_data_entry`-locked (current always kept) — dropping completed/locked rows (0.2.0 showed locked rows disabled). Shared with `log-workout` + both widgets; mirrored on web + android. See [`log-workout` 0.3.1](../log-workout/SPEC.md#11-changelog). User request 2026-07-09 (parity + cleaner UI). `BuildProject` ✓ 0 errors. |
| 0.2.0 | 2026-07-09 | **Batched multi-row rebuild + steps + program multi-select (D-C5).** `AddDailyHealthDetailView` is rebuilt as a batched clone of `AddWorkoutsDetailView` — per-row Member · Date · Sleep hr/min · Diet menu · **Steps** digit field; up to 200 rows; client in-batch (member, date) dup check; footer per DC-11 ("{N} rows • {M} members • {H}h {M}m sleep • {S} steps"). A **`ProgramMultiSelectSection`** (current program checked+disabled, `admin_only_data_entry`-locked programs disabled "Admin-only — can't log", hidden when in one program) sends `program_ids[]` to the net-new `APIClient.addDailyHealthLogsBatch` (`POST /daily-health-logs/batch`, daily-health-logs 0.2.0 D-C5); member column locks to self when any selected program is non-privileged. At-least-one-metric now spans sleep/diet/steps (R-1). `BulkRowError`-mapped red rows on failure. Subtitle → "Add a row per day — sleep, diet quality, and steps — then save them all at once." Build green-check owned by the user (Xcode). |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 60) — the Summary **log-health form**, ported into `apps/ios/.../Features/Home/Detail/AddDailyHealthDetailView.swift` (+ shared `LogFormComponents.swift`); the deferred stub removed. Twin of [`log-workout`](../log-workout/SPEC.md). **D-REF** (legacy iOS + web `summary/log-health` parity; `consumed_by=[ios]`) · **D-SCOPE** (log-forms cluster) · **D-S1** (faithful 1:1; both agree → faithful IS web parity) · **D-C1** (web-parity lock mount guard) · **D-C2** (shared chrome) · **D-C3** (success → refresh + dismiss, drop success Alert) · **D-C4** (inline errors — replaces the legacy error Alert; workout form was already inline) · **D-DEPS** (no new view component; shares `keyboardType`/`summaryRefreshToken`/`onChange`/`LogFormComponents` with log-workout; API/DTO/`dataEntryLocked` already ported). Flagged F1–F5. Role rules: `canSelectAnyMember` picker vs member self-lock; `admin_only_data_entry` LIVE (write path). Build green-check owned by the user (Xcode); symbols grep-verified. |
