# Screen: `apple-health` (ios) — the account-menu "Apple Health" settings screen

> **Status:** 🏗️ built (`apps/ios/`) · **Version:** 0.3.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramPickerView`'s `AccountMenuSheet` → "Apple Health"
> (`AccountDestination.appleHealth` → `AppleHealthSettingsView()`).
> **Provenance (legacy, archived):** `vinaySankar2004/RaSi-Fiters` PR #4 `AppleHealthSettingsView.swift`.
> **Web parity reference:** **none — iOS-only** (Apple Health is unavailable on web).
> **Consumes:** the [`apple-health`](../../../features/apple-health/SPEC.md) feature (all sync logic on
> `ProgramContext+HealthKit`); [`programs`](../../../features/programs/SPEC.md) (`fetchPrograms` for the
> program picker); HealthKit + `UserNotifications` (OS).
> **Stance:** ported + adapted to our `ProgramDTO`/theme tokens; adds an availability guard.

---

## 1. What it is + who uses it

The **Apple Health settings screen** — **two independent sections on one screen**: a **Workouts** section and
a **Sleep** section, each with its own connect toggle, per-program sync selection, sync status (last synced /
count / Sync Now), and disconnect. Reached from the account menu. **iOS-only.** Available to every
authenticated role (a member syncs their **own** workouts + sleep).

## 2. Why it exists

To let the user opt into Apple Health auto-sync, choose which programs receive synced workouts, see the last
result, force a manual sync, and disconnect. All behavior delegates to the `apple-health` feature; this
screen is the configuration surface.

## 3. Route / location

- **App:** `ios`. **Reached via two entry points, identical behavior:** (1) `ProgramPickerView` account
  menu → "Apple Health"; (2) the in-program **Program** tab → **My Account** section → "Apple Health"
  (`ProgramMyAccountSection`). Both open the same `AppleHealthSettingsView` with no pre-selection — the
  program list reflects the real saved state exactly (D-ENTRY).
- **Leaves to:** back to the program picker / program tab (nav back). Connect triggers the system HealthKit
  permission sheet; disconnect clears settings in place.

## 4. Contents / sections

| Block | What | `file:line` |
|-------|------|-------------|
| Header | "Apple Health" + subheading (now "workouts and sleep"). | `AppleHealthSettingsView.swift` header |
| Unavailable row | Shown when `HealthKitService.shared.isAvailable == false`. | `unavailableRow` |
| **Workouts** — Connect button | When not connected → `programContext.startHealthKitSync()`. | `connectButton` |
| **Workouts** — Connected row | When connected — green "Connected" card. | `connectedRow` |
| **Workouts** — Program selection | Multi-select; toggles `healthKitSyncProgramIds` + persists. | `programSelectionSection` |
| **Workouts** — Sync status | Last Synced (relative), Workouts Synced (count), Sync Now (`performHealthKitSync`). | `syncStatusSection` |
| **Workouts** — Disconnect | `programContext.clearHealthKitSettings()`. | `disconnectSection` |
| **Sleep** — header | "Sleep" + "log your nightly time asleep". | `sleepHeader` |
| **Sleep** — Connect button | When sleep off → `programContext.startSleepSync()` (own permission prompt). | `sleepConnectButton` |
| **Sleep** — Connected row | Green "Connected" card (moon icon). | `sleepConnectedRow` |
| **Sleep** — Program selection | Independent multi-select; toggles `sleepSyncProgramIds` + persists. | `sleepProgramSelectionSection` |
| **Sleep** — Sync status | Last Synced (relative), **Nights** Synced (count), Sync Now (`performSleepSync`). | `sleepSyncStatusSection` |
| **Sleep** — Disconnect | `programContext.clearSleepSyncSettings()`. | `sleepDisconnectSection` |

## 5. Components + features consumed

- **Components:** none custom — bespoke cards; theme tokens `Color.appRed/appGreen/appOrange/appRedLight/appBackground`.
- **Features:** [`apple-health`](../../../features/apple-health/SPEC.md) (connect/sync/disconnect/persist on
  `ProgramContext+HealthKit`); [`programs`](../../../features/programs/SPEC.md) (`APIClient.fetchPrograms`).

## 6. Data / API

- **`GET /api/programs`** on appear (refresh the program list). The sync writes — workouts
  (`POST /api/workout-logs`) and sleep (`POST`/`PUT /api/daily-health-logs`) — are owned by the
  `apple-health` feature, not issued from this view directly.

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
- **Sync Now in flight** → spinner, button disabled (workouts + sleep have independent spinners).
- **First sync of an unconfirmed program** → instead of writing silently, a full-screen **confirmation**
  (`HealthSyncConfirmationView`, presented from `AppRootView`) reviews the rows one program per page with a
  glass tick to confirm + advance; unchecked rows are excluded, dismiss defers (re-offers next trigger).
  Applies to both Connect and later Sync Now while a program is still unconfirmed (feature D-CONF). A 0-row
  first sync confirms silently (no modal).
- **Nothing new** → status date updates, no notification (D7 / D-S4).
- **New workouts / new sleep nights / failure** → local notification + count/date update.
- **Sleep overwrite** → re-syncing an already-logged night updates `sleep_hours` silently (no notification).
- **Out-of-window date** → a workout/night whose date is outside a selected program's `[start_date, end_date]`
  is **not** written to that program (D-S5); it still lands in any other selected program that spans it.
- **Admin-locked program** → a program with `admin_only_data_entry` on (and the viewer not its admin) is shown
  **non-selectable** in both program lists — lock icon + "Admin-only — can't sync", dimmed — and is pre-skipped
  by the sync (feature D-LOCK). Sync Now shows "N program(s) are admin-locked and won't sync" when any selected
  program is locked. A workout logged while a program is locked is held (anchor not advanced) and re-syncs on
  unlock; sleep re-syncs via its 14-day window.
- **Notification permission denied** → in-app status only (no banner), never nags.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Reference = PR #4 `AppleHealthSettingsView.swift`; iOS-only, `consumed_by=[ios]`. | PR #4; web has no Apple Health. |
| **D-ADAPT** | Adapt to our `ProgramDTO` (`status` optional → "Active"), theme tokens, and `fetchPrograms`; add the availability guard. | `APIClient+Programs.swift`; `AppTheme.swift`. |
| **D-ROLE** | The client now **reads** the per-program admin lock (`isDataEntryLocked`) to render locked programs non-selectable and pre-skip them in sync; the server 403 (`requireDataEntryAllowed`) remains the backstop (feature D-LOCK). (Was: "no role read; locked programs skipped at the server" — corrected in 0.5.0.) | `apple-health` feature D-LOCK; `requireDataEntryAllowed`. |
| **D-ENTRY** | Second entry point (in-program **My Account**) opens the **same** screen with **no** auto-scoping — the program list shows the real saved state, identical to the main-level entry. (Auto-selecting the current program was considered and rejected as confusing.) | `ProgramMyAccountSection`; `AppleHealthSettingsView()`. |
| **D-CONF** | First-sync review is a **separate full-screen modal** (`HealthSyncConfirmationView`) presented globally from `AppRootView`, **not** UI inside this settings screen — so it appears no matter which entry (Account menu or in-program) or trigger started the sync. Full gating/exclusion/defer semantics live in the feature SPEC (D-CONF). | feature `apple-health` D-CONF; `AppRootView` `.fullScreenCover`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **F1** | iOS-only screen — no web sibling (Apple Health unavailable on web). | `AppleHealthSettingsView.swift` | Kept (faithful). |
| **F2** | Program selection persists immediately on tap (no explicit save). | `programSelectionSection` / `sleepProgramSelectionSection` | Kept (matches the PR UX). |
| **F3** | Workouts + Sleep are fully independent (separate toggles, permissions, program sets) but share one screen — no combined "connect all". | both sections | Kept (user decision D-S3). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC + build. Ported PR #4's Apple Health settings screen to `apps/ios`, wired into `ProgramPickerView`'s account menu (`AccountDestination.appleHealth`); adapted to `ProgramDTO`/theme tokens, added an availability guard. Consumes the `apple-health` feature. iOS-only; role N/A. Build green-check owned by the user (Xcode). |
| 0.2.0 | 2026-07-01 | Added a second **Sleep** section on the same screen (own connect/programs/status/disconnect, moon iconography, "Nights Synced") wired to the new sleep sync (`startSleepSync`/`performSleepSync`/`clearSleepSyncSettings`), independent of workouts (D-S3, F3). Header subheading now "workouts and sleep". iOS builds clean. |
| 0.3.0 | 2026-07-01 | Added a second entry point — the in-program **My Account** section (`ProgramMyAccountSection`) now shows an "Apple Health" row that opens the **same** screen with identical behavior (no auto-scoping; the program list reflects real saved state, D-ENTRY). iOS builds clean. |
| 0.4.0 | 2026-07-01 | First sync of an unconfirmed program now opens a separate full-screen **confirmation** (`HealthSyncConfirmationView`, presented from `AppRootView`) — one program per page, selectable rows, glass-tick confirm/advance, dismiss = defer — instead of writing silently (new state in §8; D-CONF). Applies to both Connect and Sync Now while a program is unconfirmed, for workouts + sleep. Full semantics in feature `apple-health` D-CONF. iOS builds clean; user live-tested. |
| 0.5.0 | 2026-07-01 | Both program selectors now render an **admin-locked** program (feature D-LOCK) non-selectable — lock icon + "Admin-only — can't sync", dimmed via a shared `programRow` builder — and each Sync Status section shows "N program(s) are admin-locked and won't sync" when a selected program is locked. D-ROLE corrected (the client now reads the lock; server 403 is the backstop). New §8 edge case. iOS builds clean. |
