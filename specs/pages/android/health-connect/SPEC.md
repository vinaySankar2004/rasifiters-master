# Screen: `health-connect` (android) — Health Connect sync settings + first-sync confirmation

> **Status:** 🏗️ built · **Version:** 0.3.2 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = the [`health-connect`](../../../features/health-connect/SPEC.md) feature (the Android
> analog of iOS [`apple-health`](../../../features/apple-health/SPEC.md)) + iOS
> `Features/Home/Settings/AppleHealthSettingsView.swift` + `Shared/Views/HealthSyncConfirmationView.swift`.
> **Location:** `ui/health/HealthConnectSettingsScreen.kt` (settings) + `ui/health/HealthSyncConfirmationScreen.kt`
> (the first-sync confirmation, presented as a full-screen overlay from `ui/RootScreen.kt`).
> **Backing logic:** `health/HealthSyncController.kt` (triggers, settings state, review queue) +
> `health/HealthSyncRunner.kt` (one v2 run) + `HealthSyncItems.kt` (planning, windows, server state) +
> `HealthSyncUpgrade.kt` (rule 9) + `HealthConnectManager`, `HealthStore` (per member), `HealthConnectWorkoutTypeMap`,
> `HealthModels`, `HealthDates`, `HealthSyncNotifier`; `core/ProgramContext.kt` (`health` + `isDataEntryLocked`);
> `net/ApiService.kt` (`healthSyncBatch` / `getHealthSyncState` / `putHealthSyncState`, health-sync 0.2.0).

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

## Reliability Phase 3 decisions (C3, 0.3.0 — health-sync §8)

- **D-REL3-1 (the v2 contract):** a run = read Health Connect → one item per workout **sample** / sleep night / steps
  day × each selected, in-window (D-S5), not-excluded (D-CONF), not admin-locked (D-LOCK) program → `POST
  /health-sync/batch` (≤ 300 items per request, halved on 413; old-ledger `legacy` items first; one 429/503 with
  Retry-After ≤ 5 s waited out) → `PUT /health-sync/state` → one `sync.run` event. Workouts: Changes API incl.
  **deletions** (`DeletionChange.recordId` → `deleted` items); a missing / expired token mints a fresh token first,
  then reads the **catch-up window** `max(last_success − 1 d, today − 30 d)`; first sync = the connect date (workouts)
  or 14 days (sleep / steps); every read pages (`pageToken`). The token advances only when every item came back final
  and nothing was held (`skipped_locked` or a locked selected program — rule 5). `sync_success` is sent per (program,
  kind) whose items all came back final, minus held keys (H4). Selected programs with data but no resolvable window →
  the flow holds and reports failed (faithful 1.4). A run with nothing to send reports `skipped`. Never signs out. A run is **tied to the member it started for**: it
  works on a store view pinned to that member, aborts (nothing applied, no event) before any API call or store write
  once that member is no longer signed in, and the sign-out teardown cancels it.
- **D-REL3-2 (Reconnect):** the settings re-read the granted permissions on open and after a grant; a connected flow
  whose permission was revoked shows **"Reconnect Health Connect" / "Access was turned off. Tap to allow it again."**
  (relaunches the permission contract) instead of "will sync automatically".
- **D-REL3-3 (triggers):** `launch` / `foreground` / `program_entry` run at most once a minute and skip while a run is
  in flight; `connect` (after a grant), `manual` (**Sync Now** — one run of all flows, judged by that flow's own
  outcome) and `pull_to_refresh` (Summary) wait for an in-flight run, then run (H4).
- **D-REL3-4 (review once — rule 6, H1):** the first-sync review shows only when no integration's row has
  `review_done_at`; `PUT review_done` is sent only after the user confirms a page (queued until accepted) and for the
  rule-9 carry-over. A 0-row first sync and a same-integration `last_success_at` confirm **locally only** (so a
  reinstall doesn't re-ask). A page's unchecked rows become exclusions only after its upload succeeds (C2#10).
- **D-REL3-5 (disconnect / reconnect — H2):** Disconnect clears the toggle, programs, status, connect date and changes
  token, **keeps exclusions and confirmed reviews**, sends nothing; a reconnect no longer re-gates (the server's
  `review_done_at` is the record) and the workout read never starts before the reconnect date.
- **D-REL3-6 (per member + upgrade — rules 7, 9, H3):** `rasi.health` keys are per member (`m.<memberId>.*`); the
  1.0.0 un-namespaced keys are adopted once by the member signed in at upgrade (else the first to sign in). The
  upgrade marker is set only when a 1.0.0 ledger exists; then the changes token is discarded once, ledger entries are
  re-read in ONE paged window read and sent as `legacy` items (entries Health no longer has are retired; a failed read
  sends no workout adds that run), retired as they come back final. **Deviation (recorded):** the upgrade run reads
  workouts from `max(last_success − 1 d, today − 30 d)` — a `health_connect` `last_success_at` from another Android
  device of the same member shortens the "always today − 30 d" window of rule 9 (the ledger's legacy items still cover
  what the old build summed).

## Phase 4 (0.3.2)

- **D-NP1 (People disclosure — people D-C12, U-1 (b); health-connect 0.3.1):** `HealthConnectSettingsScreen` shows the
  footnote `Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile.`
  The sync-status notification (`HealthSyncNotifier`) uses the monochrome `ic_stat_notification` and survives the
  Inbox's tray clear. The first-sync review counts as a toast cover (no notification toast over it).

## Backend contract

health-sync 0.2.0 (`/api/health-sync/batch`, `/api/health-sync/state`, `integration: "health_connect"`) — live since
2026-10-13. New builds never call `POST /workout-logs` (`on_duplicate:"sum"`) or POST/PUT `/daily-health-logs` for
sync (rule 11); live 1.0.0 keeps them.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.2 | 2026-10-13 | **D-NP1** (Phase 4, `d528f75`): the People disclosure footnote; the monochrome notifier icon. PATCH. |
| 0.3.1 | 2026-10-13 | Phase 4 quick wins: the first-sync review overlay carries the offline banner with a 76dp reserve and swallows taps under it (frontend-kit D-KIT-17, #2). |
| 0.3.0 | 2026-10-13 | **Reliability Phase 3 C3 — health-sync v2.** D-REL3-1 batch/state contract (per-sample items, deletions, catch-up window, paging, rule-5 hold, per-program `sync_success`); D-REL3-2 Reconnect row; D-REL3-3 triggers; D-REL3-4 review once; D-REL3-5 disconnect keeps exclusions + reviews; D-REL3-6 per-member store + 1.0.0 upgrade (with the recorded upgrade-window deviation). Compile-checked green (`assembleDebug`). |
| 0.2.0 | 2026-07-09 | **Third "Steps" section** on `HealthConnectSettingsScreen` (own `READ_STEPS` permission, program selection, "Days Synced" status, disconnect; `DirectionsWalk`/teal `#14b8a6`) + the steps flow in `HealthSyncConfirmationScreen` — the exact sleep model on `StepsRecord` (health-connect feature 0.2.0, D-STEPS; writes `daily_health_logs.steps` via POST→409→PUT). Confirmation priority workouts > sleep > steps. `AndroidManifest.xml` gains `android.permission.health.READ_STEPS`; `HealthSyncController`/`HealthConnectManager`/`HealthStore`/`HealthModels`/`HealthSyncNotifier` gain the steps flow. Requires daily-health-logs 0.2.0 (migration `006`). `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase H) — workouts + sleep sync + first-sync confirmation. |
