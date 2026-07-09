# Screen: `log-health` (android) — the Summary "Log daily health" multi-row form

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.2.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios log-health`](../../ios/log-health/SPEC.md)
> + [`web summary/log-health`](../../web/summary/log-health/SPEC.md) (`LogDailyHealthForm`) — this file records only the Android realization + idiom deviations.
> **Twin of** [`log-workout`](../log-workout/SPEC.md).
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY_LOG_HEALTH` (`LogHealthScreen`), pushed from the
> Summary "Log daily health" action card (dimmed + non-navigating when `dataEntryLocked`).
> **Consumes:** [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md) `POST /daily-health-logs` +
> [`program-memberships`](../../../features/program-memberships/SPEC.md) member lookup, via `ProgramContext`.
> **Files:** `ui/summary/LogHealthScreen.kt` + shared `ui/summary/DetailChrome.kt`.

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1) — v0.2.0 batched multi-row rebuild:** a **multi-row** form (up to 200 rows, clone of
  `LogWorkoutScreen`) — each row = **member · date · sleep (hr/min) · diet (1–5 dropdown) · steps** — for a
  **member** (admin/logger pick anyone via `canLogForAnyMember`; a plain member is **locked to self**) on any
  date. **At-least-one-metric** per row required (sleep **or** diet **or** steps — R-1); sleep validated
  **0:00–24:00** with an inline "Sleep time must be between 0:00 and 24:00." Digit-sanitized hours/minutes/steps.
  Client in-batch (member, date) dup check. Summary footer "N rows • [M members •] {H}h {M}m sleep • {S} steps"
  (DC-11). "Save all" button.
- **Program multi-select (workout-logs 0.5.0 D-C10 / daily-health-logs D-C5):** the shared `ProgramMultiSelect`
  (current program checked+disabled "Current program"; `admin_only_data_entry`-locked programs disabled
  "Admin-only — can't log"; hidden when in one program) sends `program_ids[]` = the full selection; the member
  field locks to self when any selected program is non-privileged.
- **Save flow:** builds `[BulkHealthEntry]` (empty fields omitted; explicit `JsonNull` only on the edit path) →
  `ProgramContext.addDailyHealthLogsBatch(entries, programIds)` (`POST /daily-health-logs/batch`, body
  `{ program_id, program_ids?, entries:[{ member_id, log_date, sleep_hours?, food_quality?, steps? }] }`,
  daily-health-logs 0.2.0 D-C5) → on success **bumps `summaryRefreshToken`** + **pops back**. In-batch dup 409,
  existing rows upsert.
- **D-C1 / D-C4:** lock mount-guard pops when `dataEntryLocked`; per-row backend `rowErrors` (member_id/log_date/
  sleep_hours/food_quality/steps/metrics/duplicate) map back onto rows by submit order (red card); other failures
  → an inline red line. `identityMissing` guard blocks a blank self-id.
- **Deviation A-2 (success Snackbar):** on a successful save the shell shows a Material **Snackbar** ("Daily log
  saved") via `ProgramContext.messages` — the Android-idiom write acknowledgement (iOS dismisses to the refreshed
  screen, D-C3; a Snackbar is the platform equivalent). Same channel + rationale as [`log-workout`](../log-workout/SPEC.md) A-2.
- **Deviation A-1 (Material chrome):** shared `DetailChrome` — circular back button + centered "Log daily
  health", `SearchablePickerField` (member) or `LockedMemberField` (self, lock glyph), a **`DatePillField`**
  (Material `DatePicker`, **past/today only** via `SelectableDates`, UTC-safe), numeric Sleep Hours/Minutes, and
  a **diet-quality dropdown** (`AppDropdownField`, options 1–5 + a "Clear rating" entry). iOS's
  `AppInputField`/`AppPrimaryButton` → the reused auth `AppTextField`/`AppDropdownField` + `PillButton`.

## Role-based view rules

Identical to [`log-workout`](../log-workout/SPEC.md#role-based-view-rules): member field is a picker for
global_admin/program admin/logger, locked-to-self for a member. `admin_only_data_entry` = **LIVE** (write path).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Steps + batched multi-program rebuild.** `LogHealthScreen` rebuilt as a batched multi-row clone of `LogWorkoutScreen` — per-row member · date · sleep hr/min · diet dropdown · **steps** `NumberField`; ≤200 rows; client (member, date) dup check; footer per DC-11 (adds "• {S} steps"); the shared `ProgramMultiSelect` sends `program_ids[]`. Posts to the net-new `ProgramContext.addDailyHealthLogsBatch` (`POST /daily-health-logs/batch`, daily-health-logs 0.2.0 D-C5) instead of the single `addDailyHealthLog`; at-least-one-metric spans sleep/diet/steps (R-1); rowErrors mapped by submit order. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). |
