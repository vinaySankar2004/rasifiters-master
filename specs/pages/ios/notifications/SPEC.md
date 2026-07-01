# Screen: `notifications` (ios) — the account-menu "Notifications" settings screen

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramMyAccountSection` (run 57) → "Notifications"
> `NavigationLink → NotificationsSettingsView()`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Settings/NotificationsSettingsView.swift`.
> **Web parity reference:** **none — this screen is iOS-only** (web has no push/notification-settings page;
> push is `[ios]`-only, see [`web privacy-policy`](../../web/privacy-policy/SPEC.md) text + the notifications feature).
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
system Settings. There is no per-type preference API — the control is the OS authorization itself.

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "Notifications".
- **Leaves to:** back to the Program tab (nav back) · the system **Settings** app (`openSettingsURLString`,
  when denied). Re-reads status on `willEnterForeground` (so returning from Settings refreshes the card).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Heading + subheading | "Notifications" / "Get notified when your program is updated, roles change, or members join or leave." | legacy `NotificationsSettingsView.swift:11-19` |
| Status card | Icon circle + dynamic title/subtitle driven by `authorizationStatus` (Enabled / Disabled / Not set). | legacy `:21-49` |
| Enable button (conditional) | When `.notDetermined`: "Enable Notifications" → `requestPermission()` (then `registerForRemoteNotifications`). | legacy `:51-63` |
| Open-Settings button (conditional) | When `.denied`: "Open Settings" → system Settings + an explanatory caption. | legacy `:66-84` |

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

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **iOS-only screen** — web has no push/notification-settings page (push is `[ios]`-only); the web My Account menu lists no Notifications row. | legacy `NotificationsSettingsView.swift`; web `program/page.tsx` My Account | Kept (faithful) — a deliberate cross-client asymmetry (web uses SSE, not APNs). |
| **F2** | **No per-type preferences** — the control is the OS authorization, not a backend preference matrix; there is no `GET/PUT /notifications/preferences`. | `NotificationsSettingsView.swift` | Kept (faithful) — a granular-preference UI is a rebuild feature. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **Notifications settings screen** (one of the 4-screen account/settings cluster, run 58; **iOS-only**, no web sibling). Documents the OS-authorization status card + conditional Enable (`requestPermission` → `registerForRemoteNotifications`) / Open-Settings actions, re-read on `willEnterForeground`. Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS only — no web parity) · **D-S1** (faithful 1:1 verbatim port; D-C3 component-adoption N/A) · **D-DEPS** (no new dependency; the `notifications`-feature registration path owns the APNs `PUT /notifications/device`). Flagged F1 (iOS-only) / F2 (no per-type preferences). Role rules: same for every role (no role read); `admin_only_data_entry` N/A. No direct API. Ported `apps/ios/.../Features/Home/Settings/NotificationsSettingsView.swift`. Build green-check owned by the user (Xcode). |
