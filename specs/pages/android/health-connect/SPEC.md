# Screen: `health-connect` (android) — Health Connect sync settings + first-sync confirmation

> **Status:** 🏗️ built · **Version:** 0.2.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = the [`health-connect`](../../../features/health-connect/SPEC.md) feature (the Android
> analog of iOS [`apple-health`](../../../features/apple-health/SPEC.md)) + iOS
> `Features/Home/Settings/AppleHealthSettingsView.swift` + `Shared/Views/HealthSyncConfirmationView.swift`.
> **Location:** `ui/health/HealthConnectSettingsScreen.kt` (settings) + `ui/health/HealthSyncConfirmationScreen.kt`
> (the first-sync confirmation, presented as a full-screen overlay from `ui/RootScreen.kt`).
> **Backing logic:** `health/HealthSyncController.kt` (+ `HealthConnectManager`, `HealthStore`,
> `HealthConnectWorkoutTypeMap`, `HealthModels`, `HealthDates`, `HealthSyncNotifier`);
> `core/ProgramContext.kt` (`health` + `isDataEntryLocked(programId)`); `net/ApiService.kt`
> (`postWorkoutLog` / `postDailyHealthLogRaw` / `putDailyHealthLogRaw`).

## Parity (iOS `AppleHealthSettingsView` / `HealthSyncConfirmationView` 1:1)

**Settings screen** — reached from **Account → Health Connect** (the Program-tab account section AND the
picker's account sheet). **Three** independent sections on one screen (0.2.0):

- **Workouts** — a **Connect** card (requests read auth) or, once connected, a **Connected** card + **Sync
  to Programs** selection list + **Sync Status** (Last Synced · Workouts Synced · **Sync Now**) + a
  **Disconnect** card. Locked programs (`admin_only_data_entry`, viewer not admin) render **non-selectable**
  with a lock icon + "Admin-only — can't sync", and a "N program(s) are admin-locked and won't sync" note
  appears under Sync Now. Auto-sync failures surface passively as "Last sync couldn't reach the server —
  will retry automatically." (D-SIL); the manual Sync Now shows an inline "Couldn't reach the server" error.
- **Sleep** — the same structure, independent toggle/permission/selection/status (Nights Synced).
- **Steps** (0.2.0) — the same structure, independent toggle/permission (`READ_STEPS`)/selection/status
  (Days Synced); `DirectionsWalk` icon, teal `#14b8a6`. The Android analog of iOS apple-health's third Steps
  section (health-connect feature 0.2.0, D-STEPS; writes `daily_health_logs.steps`).
- **Unavailable** — if Health Connect isn't installed/updated, an "isn't available" card replaces all three
  sections (`HealthConnectClient.getSdkStatus`).

**First-sync confirmation** — a full-screen overlay (iOS `fullScreenCover` from `AppRootView`): one program
per page, each row a toggleable check (default on), a top-right tick that commits the page's **checked**
rows and advances; the last page finishes. **System back = defer** (nothing written, re-offered next
trigger). Presentation priority is **workouts > sleep > steps** (0.2.0).

## Android realization / deviations

- **Permission via `PermissionController`** (A-1) — Health Connect grants come from
  `createRequestPermissionResultContract()` launched from the settings screen (the connect card), **not** a
  runtime-permission dialog. On grant, `HealthSyncController.enable{Workouts,Sleep}AfterPermission()` sets
  the connect date, re-gates confirmation, and kicks a sync.
- **Changes API = the anchor** (A-2, feature H-CHG) — `HealthConnectManager.fetchNewWorkouts` uses
  `getChangesToken`/`getChanges` (first sync `readRecords` from the connect date); the token is the iOS
  anchor analog, committed only after success.
- **No OS-push background sync** (A-3, feature H-1) — sync runs on app triggers (launch/auth via
  `RootScreen`, foreground via `ON_RESUME`, program entry via `AppScaffold`); Health Connect has no
  immediate background-delivery observer. Guards make every trigger a cheap no-op unless connected.
- **`SharedPreferences` = `UserDefaults`** (A-4) — all sync state (settings, gating, applied-sample ledger)
  lives in a plain `rasi.health` `SharedPreferences` (non-sensitive; tokens stay in the encrypted
  `Session`).
- **Material 3 cards** — the settings rows/cards use the shared `programRowColor()` + `outlineVariant`
  border + `DetailTopBar` chrome (neutral M3 surfaces, memory `android-neutral-m3-surface-roles`), vs the
  iOS grouped-list styling. The confirmation tick is a filled circular button (vs the iOS Liquid-Glass tick).
- **Local notifications** — new-sync banners post into the existing `rasi_default` channel via
  `NotificationManagerCompat` (the same channel FCM push uses), gated on `POST_NOTIFICATIONS`.

## Backend contract (unchanged, already live)

`POST /api/workout-logs` (`on_duplicate:"sum"`, D-C9) · `POST`/`PUT /api/daily-health-logs`
(`sleep_hours` + — 0.2.0 — `steps` upsert) — the exact endpoints iOS Apple Health uses; no backend change.
The 0.2.0 steps sync depends only on daily-health-logs 0.2.0's `steps` column (migration `006`, run there).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Third "Steps" section** on `HealthConnectSettingsScreen` (own `READ_STEPS` permission, program selection, "Days Synced" status, disconnect; `DirectionsWalk`/teal `#14b8a6`) + the steps flow in `HealthSyncConfirmationScreen` — the exact sleep model on `StepsRecord` (health-connect feature 0.2.0, D-STEPS; writes `daily_health_logs.steps` via POST→409→PUT). Confirmation priority workouts > sleep > steps. `AndroidManifest.xml` gains `android.permission.health.READ_STEPS`; `HealthSyncController`/`HealthConnectManager`/`HealthStore`/`HealthModels`/`HealthSyncNotifier` gain the steps flow. Requires daily-health-logs 0.2.0 (migration `006`). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase H) — workouts + sleep sync + first-sync confirmation. |
