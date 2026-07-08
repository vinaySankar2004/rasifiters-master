# Screen: `log-health` (android) — the Summary "Log daily health" form

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios log-health`](../../ios/log-health/SPEC.md)
> + [`web summary/log-health`](../../web/summary/log-health/SPEC.md) (`LogDailyHealthForm`) — this file records only the Android realization + idiom deviations.
> **Twin of** [`log-workout`](../log-workout/SPEC.md).
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.SUMMARY_LOG_HEALTH` (`LogHealthScreen`), pushed from the
> Summary "Log daily health" action card (dimmed + non-navigating when `dataEntryLocked`).
> **Consumes:** [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md) `POST /daily-health-logs` +
> [`program-memberships`](../../../features/program-memberships/SPEC.md) member lookup, via `ProgramContext`.
> **Files:** `ui/summary/LogHealthScreen.kt` + shared `ui/summary/DetailChrome.kt`.

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** a single form logging a day's **sleep time** (hours + minutes) and/or **diet
  quality** (1–5) for a **member** (admin/logger pick anyone via `canLogForAnyMember`; a plain member is
  **locked to self**) on a **past/today** date. **At-least-one-metric** required (Save disabled otherwise);
  sleep validated **0:00–24:00** with an inline "Sleep time must be between 0:00 and 24:00." Digit-sanitized
  hours/minutes (≤2 chars). "Save daily log" button.
- **Save flow:** `ProgramContext.addDailyHealthLog(memberId, log_date "yyyy-MM-dd", sleepHours?, foodQuality?)`
  (`POST /daily-health-logs`, body `{ program_id, log_date, member_id?, sleep_hours?, food_quality? }`) → on
  success **bumps `summaryRefreshToken`** + **pops back**. Sleep is combined to fractional hours; **diet cleared
  → field omitted** (backend `parseOptionalNumber` treats undefined ≡ null, so omitting is behaviourally
  identical to explicit null — no `@EncodeDefault` needed under `Json { explicitNulls = false }`).
- **D-C1 / D-C4:** lock mount-guard pops when `dataEntryLocked`; failures → an inline red line (no Alert). Member
  self-lock falls back to the first member if the signed-in user isn't in the roster (iOS F3); `identityMissing`
  guard blocks a blank self-id.
- **Deviation A-1 (Material chrome):** shared `DetailChrome` — circular back button + centered "Log daily
  health", `SearchablePickerField` (member) or `LockedMemberField` (self, lock glyph), a **`DatePillField`**
  (Material `DatePicker`, **past/today only** via `SelectableDates`, UTC-safe), numeric Sleep Hours/Minutes, and
  a **diet-quality dropdown** (`AppDropdownField`, options 1–5 + a "Clear rating" entry). iOS's
  `AppInputField`/`AppPrimaryButton` → the reused auth `AppTextField`/`AppDropdownField` + `PillButton`.

## Role-based view rules

Identical to [`log-workout`](../log-workout/SPEC.md#role-based-view-rules): member field is a picker for
global_admin/program admin/logger, locked-to-self for a member. `admin_only_data_entry` = **LIVE** (write path).
