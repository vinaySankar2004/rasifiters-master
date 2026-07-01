# Screen: `apple-health` (ios) — the account-menu "Apple Health" settings screen

> **Status:** 🏗️ built (`apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramPickerView`'s `AccountMenuSheet` → "Apple Health"
> (`AccountDestination.appleHealth` → `AppleHealthSettingsView()`).
> **Reference impl:** `vinaySankar2004/RaSi-Fiters` PR #4 `AppleHealthSettingsView.swift` (legacy `ios-mobile/`).
> **Web parity reference:** **none — iOS-only** (Apple Health is unavailable on web).
> **Consumes:** the [`apple-health`](../../../features/apple-health/SPEC.md) feature (all sync logic on
> `ProgramContext+HealthKit`); [`programs`](../../../features/programs/SPEC.md) (`fetchPrograms` for the
> program picker); HealthKit + `UserNotifications` (OS).
> **Stance:** ported + adapted to our `ProgramDTO`/theme tokens; adds an availability guard.

---

## 1. What it is + who uses it

The **Apple Health settings screen** — connect toggle, per-program sync selection, sync status (last synced /
count / Sync Now), and disconnect. Reached from the account menu. **iOS-only.** Available to every
authenticated role (a member syncs their **own** workouts).

## 2. Why it exists

To let the user opt into Apple Health auto-sync, choose which programs receive synced workouts, see the last
result, force a manual sync, and disconnect. All behavior delegates to the `apple-health` feature; this
screen is the configuration surface.

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramPickerView` account menu → "Apple Health".
- **Leaves to:** back to the program picker (nav back). Connect triggers the system HealthKit permission
  sheet; disconnect clears settings in place.

## 4. Contents / sections

| Block | What | `file:line` |
|-------|------|-------------|
| Header | "Apple Health" + subheading. | `AppleHealthSettingsView.swift` header |
| Unavailable row | Shown when `HealthKitService.shared.isAvailable == false`. | `unavailableRow` |
| Connect button | When not connected → `programContext.startHealthKitSync()`. | `connectButton` |
| Connected row | When connected — green "Connected" card. | `connectedRow` |
| Program selection | Multi-select over `programContext.programs`; toggles `healthKitSyncProgramIds` + persists. | `programSelectionSection` |
| Sync status | Last Synced (relative), Workouts Synced (count), Sync Now (`performHealthKitSync`). | `syncStatusSection` |
| Disconnect | `programContext.clearHealthKitSettings()`. | `disconnectSection` |

## 5. Components + features consumed

- **Components:** none custom — bespoke cards; theme tokens `Color.appRed/appGreen/appOrange/appRedLight/appBackground`.
- **Features:** [`apple-health`](../../../features/apple-health/SPEC.md) (connect/sync/disconnect/persist on
  `ProgramContext+HealthKit`); [`programs`](../../../features/programs/SPEC.md) (`APIClient.fetchPrograms`).

## 6. Data / API

- **`GET /api/programs`** on appear (refresh the program list). The sync writes (`POST /api/workout-logs`) are
  owned by the `apple-health` feature, not issued from this view directly.

## 7. Role-based view rules

**No role gate** — identical for every authenticated role; sync targets the signed-in user's own logs.
`admin_only_data_entry`: a locked program the member doesn't admin is **skipped** server-side (403) during
sync, not blocked in this UI.

| Viewer | Sees | Can do |
|--------|------|--------|
| Every authenticated role | Connect/connected + program picker + status + disconnect. | Connect, choose programs, sync, disconnect. |

## 8. States & edge cases

- **Unavailable device** (iPad/Simulator) → unavailable row, no connect.
- **Not connected** → connect button only.
- **Connected, no programs** → "No programs available" empty state.
- **Sync Now in flight** → spinner, button disabled.
- **Nothing new** → status date updates, no notification (D7).
- **New workouts / failure** → local notification (D7) + count/date update.
- **Notification permission denied** → in-app status only (no banner), never nags.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Reference = PR #4 `AppleHealthSettingsView.swift`; iOS-only, `consumed_by=[ios]`. | PR #4; web has no Apple Health. |
| **D-ADAPT** | Adapt to our `ProgramDTO` (`status` optional → "Active"), theme tokens, and `fetchPrograms`; add the availability guard. | `APIClient+Programs.swift`; `AppTheme.swift`. |
| **D-ROLE** | No role read — same for all; self-only sync; locked programs skipped at the server. | `apple-health` feature; `requireDataEntryAllowed`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **F1** | iOS-only screen — no web sibling (Apple Health unavailable on web). | `AppleHealthSettingsView.swift` | Kept (faithful). |
| **F2** | Program selection persists immediately on tap (no explicit save). | `programSelectionSection` | Kept (matches the PR UX). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC + build. Ported PR #4's Apple Health settings screen to `apps/ios`, wired into `ProgramPickerView`'s account menu (`AccountDestination.appleHealth`); adapted to `ProgramDTO`/theme tokens, added an availability guard. Consumes the `apple-health` feature. iOS-only; role N/A. Build green-check owned by the user (Xcode). |
