# Screen: `notifications` (ios) — the account-menu "Notifications" settings screen

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.3.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramMyAccountSection` (run 57) → "Notifications"
> `NavigationLink → NotificationsSettingsView()`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Settings/NotificationsSettingsView.swift`.
> **Web parity reference:** ~~**none — this screen is iOS-only**~~ — since 0.3.0 the category switches mirror web
> [`program/notifications`](../../web/program/notifications/SPEC.md) and Android [`notifications`](../../android/notifications/SPEC.md)
> (same copy, notifications §3.9 R7); the OS permission card stays native.
> **Consumes (features):** the OS push subsystem (`UserNotifications`); the [`notifications`](../../../features/notifications/SPEC.md)
> feature's device-registration path (`APIClient.registerDevice` `PUT /notifications/device`) fires from the
> APNs token callback, **not** this view directly.
> **Stance:** **faithful 1:1 verbatim port** (D-S1). No web sibling to reconcile; no new dependency.

---

## 1. What it is + who uses it

The **push-notification settings screen** — a status card reflecting the system push-authorization state
plus a context-appropriate action (Enable / Open Settings). Reached from the Program tab's My Account
section. **iOS-only** (the web app has no analogue). Available to every authenticated role.

## 2. Why it exists

To let a user grant or re-reach push permission natively. It reads `UNUserNotificationCenter`'s authorization
status and, when **not determined**, requests permission (then registers for remote notifications, which
yields the APNs token the app forwards via the `notifications` feature); when **denied**, deep-links to the
system Settings. ~~There is no per-type preference API — the control is the OS authorization itself.~~ Since 0.3.0
(D-NP1) the per-category preferences (`GET` / `PUT /notifications/preferences`) live here too.

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "Notifications".
- **Leaves to:** back to the Program tab (nav back) · the system **Settings** app (`openSettingsURLString`,
  when denied). Re-reads status on `willEnterForeground` (so returning from Settings refreshes the card).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Heading + subheading | "Notifications" / ~~"Get notified when your program is updated, roles change, or members join or leave."~~ `Choose what RaSi Fiters notifies you about.` (0.3.0) | legacy `NotificationsSettingsView.swift:11-19` |
| Status card | Icon circle + dynamic title/subtitle driven by `authorizationStatus` (Enabled / Disabled / Not set). | legacy `:21-49` |
| Enable button (conditional) | When `.notDetermined`: "Enable Notifications" → `requestPermission()` (then `registerForRemoteNotifications`). | legacy `:51-63` |
| Open-Settings button (conditional) | When `.denied`: "Open Settings" → system Settings + an explanatory caption. | legacy `:66-84` |
| **Preferences (0.3.0, D-NP1)** | `NotificationPreferencesSection`, after the status card: `Notify me about` + five switches (`Program & invites`, `Activity`, `Reminders`, `Weekly digest`, `Announcements` with the R7 explanations); while Reminders is on, `Reminder time` · `Uses your phone's time zone.` (an hour / minute wheel, saved as `HH:mm` 0.6 s after it rests); the footnote `Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, you get no alert, but they still appear in your Inbox.` | `Settings/NotificationPreferencesSection.swift` |

**Status flow:** `.task` + `willEnterForeground` → `updateAuthorizationStatus()`; `requestPermission()`
requests `[.alert,.sound,.badge]`, registers for remote notifications on grant, then re-reads status.

## 5. Components + features consumed

- **Components:** none custom — bespoke status card + conditional buttons; `Color.appOrange`/`appBackground`,
  `Image(systemName:)`. **No new component.**
- **Features:** `UserNotifications` (OS); the [`notifications`](../../../features/notifications/SPEC.md)
  feature's `APIClient.registerDevice` (`PUT /notifications/device`) — invoked from the APNs token callback
  (`ProgramContext.registerPushTokenIfNeeded`), not this view.

## 6. Data / API

- **No direct backend call from this view.** It reads/requests OS push authorization. The APNs device token
  (delivered to the app delegate after `registerForRemoteNotifications`) is forwarded by the `notifications`
  feature via `PUT /notifications/device` — out of this screen's scope.

## 7. Role-based view rules

**No role read** — identical for every authenticated role (push authorization is per-device, not per-role).
**`admin_only_data_entry` = N/A.**

| Viewer | Sees | Can do |
|--------|------|--------|
| Every authenticated role | Status card + the state-appropriate Enable / Open-Settings button. | Grant / re-reach push permission. |

## 8. States & edge cases

- **`.notDetermined`:** "Not set" card + "Enable Notifications" button.
- **`.authorized`/`.provisional`/`.ephemeral`:** "Enabled" card (orange bell), no button.
- **`.denied`:** "Disabled" card (muted) + "Open Settings" button + caption.
- **Foreground return:** status re-read on `willEnterForeground` so toggling in Settings reflects immediately.
- **No network error surface** — the view does no backend call; registration failures are swallowed by the
  `notifications` feature.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Home/Settings/NotificationsSettingsView.swift`. iOS-only — no web parity reference** (web has no push-settings page; push is `[ios]`-only). `consumed_by = [ios]`. | legacy `NotificationsSettingsView.swift:1-169`; web has no analogue. |
| **D-S1** | **Stance = faithful 1:1 verbatim port.** OS-authorization-driven status card + conditional Enable/Open-Settings; no web sibling to reconcile, so no parity deviation. The component-adoption cleanup (D-C3 elsewhere) **does not apply** — bespoke status/action controls, no inputs/generic CTA. | legacy `NotificationsSettingsView.swift`; user answer (cluster stance). |
| **D-DEPS** | **No new dependency** — `UserNotifications` is a system framework; the registration path (`registerDevice`/`registerPushTokenIfNeeded`) was ported in the foundation (run 50). | foundation inventory (run 50). |
| **D-C1** | **Device registry (notifications §3.1, reliability Phase 3 C2).** Permission denied (seen on a foreground) → `POST /api/notifications/device/unregister` with the push token + install id, **no login**, once per denial (amendment A12), replacing the Bearer `DELETE /device`. Granted → the foreground re-registration re-arms that memo; `PUT /device` runs through `DeviceRegistry`'s serial queue, at most once per 12 h for the same token. While the denial memo is set, the sign-in ride-along omits `push_token` (a sign-in never re-registers a device the user turned off). No change on this screen's UI. | notifications §3.1; Phase 3 client amendments (`specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`) A12. |
| **D-IOS-PUSH-1** | **iOS reading of notifications §3.1 "afterwards forget the cached push token and any already-registered memo": forget the memo, keep the token.** Every sign-out path clears the registration memo (`push.registeredToken` / `push.registeredAt`), so the next sign-in registers again; the APNs token value itself (`rf_push_device_token`) is kept — it is stable per install, and the next sign-in's ride-along re-sends it (APNs only re-issues it on the next `registerForRemoteNotifications`). The install id stays. | notifications §3.1; `DeviceRegistry.swift`. |
| **D-NP1** | **Per-category preferences + permission once (0.3.0; notifications D-C21/D-C31, NP-U3; iOS plan TC4).** The preferences section (`GET` / `PUT /api/notifications/preferences`, partial, optimistic — a failed save reverts and shows `Couldn't save. <kit message>` in red); a stale load shows an inline `Couldn't refresh` · `Retry` row over kept values; it reloads on reconnect after an error. **Permission:** besides this screen's Enable button, the app asks **once per install at the first signed-in start** (sign-in or restored session) while `.notDetermined` (`UserDefaults` `push.permissionAsked`); `PUT /device` now sends `inbox: true` and re-registers once per new build (`push.registeredBuild`). The toast reads the cached categories (missing → show). | NP amendments NP-U3, R7; notifications §3.9. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **iOS-only screen** — web has no push/notification-settings page (push is `[ios]`-only); the web My Account menu lists no Notifications row. | legacy `NotificationsSettingsView.swift`; web `program/page.tsx` My Account | Kept (faithful) — a deliberate cross-client asymmetry (web uses SSE, not APNs). |
| ~~**F2**~~ **Superseded 0.3.0 (D-NP1)** | ~~**No per-type preferences**~~ — the control is the OS authorization, not a backend preference matrix; there is no `GET/PUT /notifications/preferences`. | `NotificationsSettingsView.swift` | Kept (faithful) — a granular-preference UI is a rebuild feature. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-10-13 | **D-NP1 — Phase 4 Notifications (`198407c`).** New `NotificationPreferencesSection` (five category switches, reminder time, footnote; inline stale row; reconnect reload; revert-on-failure); subtitle `Choose what RaSi Fiters notifies you about.`; permission asked once at the first signed-in start; F2 superseded. |
| 0.2.0 | 2026-10-13 | **reliability Phase 3 C2 (iOS 1.5.0) — D-C1, D-IOS-PUSH-1.** Permission denied → `POST /device/unregister` (no login, once per denial; the sign-in ride-along then omits `push_token`); registrations through `DeviceRegistry` (≤ once per 12 h per token); sign-out forgets the memo, keeps the token. No UI change. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **Notifications settings screen** (one of the 4-screen account/settings cluster, run 58; **iOS-only**, no web sibling). Documents the OS-authorization status card + conditional Enable (`requestPermission` → `registerForRemoteNotifications`) / Open-Settings actions, re-read on `willEnterForeground`. Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS only — no web parity) · **D-S1** (faithful 1:1 verbatim port; D-C3 component-adoption N/A) · **D-DEPS** (no new dependency; the `notifications`-feature registration path owns the APNs `PUT /notifications/device`). Flagged F1 (iOS-only) / F2 (no per-type preferences). Role rules: same for every role (no role read); `admin_only_data_entry` N/A. No direct API. Ported `apps/ios/.../Features/Home/Settings/NotificationsSettingsView.swift`. Build green-check owned by the user (Xcode). |
