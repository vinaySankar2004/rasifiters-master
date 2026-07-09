# Screen: `notifications` (android) — push-notification status

> **Status:** 🏗️ built · **Version:** 0.1.0 · **App:** `android` (Compose) · **Thin port-note.**
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
