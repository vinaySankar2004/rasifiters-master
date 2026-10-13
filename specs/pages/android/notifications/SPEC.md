# Screen: `notifications` (android) — push-notification status

> **Status:** 🏗️ built · **Version:** 0.1.1 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/Settings/NotificationsSettingsView.swift`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_NOTIFICATIONS` (`NotificationsScreen`).
> **Files:** `ui/program/NotificationsScreen.kt`.

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

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | **Reliability Phase 3 C3 — D-REL3-1:** the settings fallback for the one-time permission ask. No code change. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase G). |
