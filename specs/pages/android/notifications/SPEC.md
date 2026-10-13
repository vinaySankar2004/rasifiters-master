# Screen: `notifications` (android) — push-notification status

> **Status:** 🏗️ built · **Version:** 0.2.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/Settings/NotificationsSettingsView.swift`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_NOTIFICATIONS` (`NotificationsScreen`).
> **Files:** `ui/program/NotificationsScreen.kt`, `ui/program/NotificationPreferencesSection.kt` (0.2.0).

## Parity + Android-idiom deviations

- **Faithful:** title + subtitle + a status card — **Enabled** (bell, orange) or **Disabled** (bell-off,
  grey), read from `NotificationManagerCompat.areNotificationsEnabled()` and re-checked on `ON_RESUME`.
- **Deviation A-1:** when disabled, an **Open Settings** row deep-links to the app's system notification
  settings (`Settings.ACTION_APP_NOTIFICATION_SETTINGS`) — the Android analog of iOS's
  `openSettingsURLString`. iOS's `.notDetermined` "Enable Notifications" prompt is N/A (the FCM
  registration + POST_NOTIFICATIONS request land in **Phase I**); this screen only reflects OS state.
- **D-REL3-1 (0.1.1 — board §3.5):** the app asks POST_NOTIFICATIONS **once**, right after the first sign-in
  ([`notifications-alerts`](../notifications-alerts/SPEC.md) D-REL3-5); this screen's **Open Settings** row is the
  settings fallback after a denial. Turning notifications off unregisters the device on the next foreground.

## Phase 4 (0.2.0 — notifications §3.5 / §3.9, D-C31)

- **D-NP1 (copy + permission rows):** subtitle `Choose what RaSi Fiters notifies you about.`; status card `Enabled` /
  `You'll get alerts for the categories switched on below.` or `Disabled` / `Notifications are off for RaSi Fiters on
  this phone.`; when disabled, a pill `Enable Notifications` while an in-app ask is still possible (Android 13+, not yet
  granted, not yet asked or a rationale is available), else `Open Settings`; re-checked on resume.
- **D-NP2 (per-category preferences):** `NotificationPreferencesSection` — `Notify me about` + the five R7 switches
  (`Program & invites`, `Activity`, `Reminders`, `Weekly digest`, `Announcements`); while Reminders is on, `Reminder
  time` · `Uses your phone's time zone.` opening an M3 `TimePicker` in a **full-width** `AlertDialog`
  (`usePlatformDefaultWidth = false`, 16 dp side padding; `OK` / `Cancel`); the opt-in note. Saves are optimistic and roll
  back on failure (`GET` / `PUT /api/notifications/preferences`); the stale banner + reload on reconnect.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-10-13 | **Phase 4 (`d528f75`).** D-NP1 permission rows (`Enable Notifications` / `Open Settings`) + new copy; D-NP2 the five category switches + full-width reminder TimePicker dialog + opt-in note; stale banner + reconnect reload. |
| 0.1.1 | 2026-10-13 | **Reliability Phase 3 C3 — D-REL3-1:** the settings fallback for the one-time permission ask. No code change. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase G). |
