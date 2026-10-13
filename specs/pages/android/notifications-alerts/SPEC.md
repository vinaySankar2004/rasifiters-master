# Screen: `notifications-alerts` (android) — real-time alerts (in-app SSE + modal queue) + FCM push

> **Status:** 🏗️ built (in-app SSE + FCM push) · **Version:** 0.3.0 · **App:** `android`
> (Compose) · **Thin port-note.**
> Full behavior = the [`notifications`](../../../features/notifications/SPEC.md) feature (backend contract)
> + iOS `Shared/Services/NotificationStreamClient.swift`, `Shared/Models/ProgramContext+Notifications.swift`,
> `Shared/Views/NotificationModalView.swift`, mounted in `App/AppRootView.swift`.
> **Location:** `ui/RootScreen.kt` (the app-root overlay + stream lifecycle).
> **Files:** `net/NotificationStreamClient.kt`, `ui/components/NotificationModal.kt`;
> `core/ProgramContext.kt` (notification state + `start/stopNotificationStream`,
> `loadUnacknowledgedNotifications`, `acknowledgeNotification`); `net/{ApiService,Dtos}.kt`
> (`NotificationDTO` + `GET /notifications/unacknowledged` + `POST /notifications/{id}/acknowledge`).
> **Distinct from** the [`notifications`](../notifications/SPEC.md) settings **screen** (OS-permission
> status card) — this is the cross-cutting alerts layer.

## Parity (web + iOS 1:1)

- **Real-time stream** — an SSE connection to `GET /notifications/stream` (D-C2 auth accepts the
  `Authorization: Bearer` header; we send it, like iOS `NotificationStreamClient`). Each `event: notification`
  frame decodes to a `NotificationDTO`; the `event: ready` handshake + keep-alive pings are ignored.
- **Unacknowledged backfill** — `GET /notifications/unacknowledged` runs on every stream (re)start so an
  offline member sees pending alerts on next launch.
- **Single-notification modal QUEUE** (web F7) — alerts render oldest-first (`created_at` ASC), **one at a
  time**, in a non-dismissable modal; **OK** acknowledges the shown alert and pops it.
- **Optimistic acknowledge** (web/iOS F8) — the alert is removed from the queue immediately, then
  `POST /:id/acknowledge`; on failure the queue is rebuilt from a fresh `unacknowledged` fetch (so it
  reappears). De-duped by id (a live event already in the queue is dropped).
- **Post-event cache refresh** — an `program.invite_received` event reloads the programs/picker list; a
  membership/program-change event (`role_changed`/`member_removed`/`member_left`/`member_joined`/
  `admin_transferred`/`updated`/`deleted`) reloads the programs list + (if a program is active) the
  membership roster. Mirrors iOS `refreshDataForNotification` / the web per-notification query invalidation.

## Android realization / deviations

- **`NotificationStreamClient`** = the iOS URLSession-delegate stream analog, built on **okhttp-sse**
  (`EventSources` — already a declared dep). Its own OkHttpClient with **`readTimeout(0)`** (streaming socket;
  the server holds it open + pings), Bearer header set explicitly, token re-read on each `connect()` so a
  session refresh is picked up on restart. Transport errors are swallowed (iOS `onError` no-op parity).
- **Lifecycle (A-1)** — `RootScreen` starts the stream + backfill when `authToken` becomes non-null and tears
  it down on sign-out; it **restarts on `Lifecycle.Event.ON_RESUME`** (the iOS `scenePhase == .active`
  restart) to recover a socket dropped while backgrounded. No internal reconnect loop (faithful to iOS).
- **`NotificationModal`** = a Compose `Dialog` (`dismissOnBackPress/ClickOutside = false`) — neutral M3
  `surface` card + brand-orange OK, theme-aware. The queue is `ProgramContext.notificationQueue`
  (`StateFlow`); `RootScreen` shows `firstOrNull()` in a `Box` overlay above both nav graphs (the iOS
  `AppRootView` `ZStack` overlay analog).
- **Refresh mapping (A-2)** — iOS's `loadPendingInvites`/`loadLookupData` map to Android's `loadPrograms()`
  (the picker list carries pending invites on Android) + `loadMembershipDetails()`; best-effort
  (`runCatching`), never surfaces an error.

## FCM push (the APNs analog — built)

Native push wakes the device when the app is closed/backgrounded (the in-app SSE layer covers the foreground).

- **Firebase** project `rasi-fiters`; `google-services.json` lives at `apps/android/app/google-services.json`
  — **gitignored** (repo is public; this Mac is the sole builder). The `com.google.gms.google-services`
  Gradle plugin + `firebase-bom`/`firebase-messaging` are wired in `libs.versions.toml` + both `build.gradle.kts`.
- **`push/RaSiFirebaseMessagingService.kt`** — `onNewToken` → `ProgramContext.onNewPushToken` (registers via
  `PUT /notifications/device`); `onMessageReceived` is a **deliberate no-op** (foreground alerts are the SSE
  modal's job; a tray push too would double-alert). Background `notification` messages the system tray shows
  automatically, in the `rasi_default` channel created in `App.onCreate`.
- **Token registration** — `ProgramContext.registerPushTokenIfNeeded()` fetches the FCM token and
  `PUT /notifications/device` with **`platform:"android"`**; called on sign-in + `ON_RESUME` (deduped by
  `lastRegisteredPushToken`). Sign-out `DELETE /notifications/device` (best-effort, while the token's still
  valid). **`POST_NOTIFICATIONS`** (Android 13+) is requested from `RootScreen` when signed in; registration
  proceeds regardless of the grant (the permission only gates *display*).
- **Backend delta** (`apps/backend`) — `authService.upsertPushToken` gained a `platform` param (default
  `"ios"`, so the LIVE iOS binary is untouched); the mobile-login + `PUT /device` routes thread it;
  `utils/pushNotifications.js` gained an **FCM sender** (`firebase-admin`, `sendEachForMulticast`, invalid-token
  pruning) that `sendPushToMembers` fires alongside APNs. Credential = `FIREBASE_SERVICE_ACCOUNT` (base64 of the
  service-account JSON) on Render, `sync:false` (graceful no-op when unset — the APNs-deferral pattern). **No
  migration** — the `member_push_tokens.platform` column already exists (default `'ios'`). The
  `member_push_tokens` schema + `getMemberIdsWithPushTokens` already cover Android tokens.

**Android-idiom deviations:** default notification icon falls back to the launcher icon (a dedicated
monochrome status-bar icon is later polish); `onMessageReceived` no-op in foreground (SSE owns it).

## Reliability Phase 3 decisions (C3, 0.3.0 — notifications §3.1–3.3, invites §3.1)

These supersede the "no internal reconnect loop", `ON_RESUME` restart, `readTimeout(0)`, no-op `onMessageReceived`,
`lastRegisteredPushToken` dedupe and `DELETE /notifications/device` notes above.

- **D-REL3-1 (SSE lifecycle):** the stream runs **foreground only** — `RootScreen` starts it on `ON_START` and closes it
  on `ON_STOP`. Every close or error reconnects with backoff **1 s × 2, 30 s cap, full jitter**, paused while
  offline; a fresh token before each connect (a 401 forces a refresh through `TokenRefresher`); the SSE client sends the
  §4.1 identity headers and has a **60 s idle (read) timeout** (pings every 25 s), so a half-open stream reconnects.
  `ready` resets the backoff and **re-fetches `/unacknowledged`** (the stream never replays): items acknowledged
  elsewhere drop out, our own acks of the last 2 minutes are filtered (no resurrection by a racing re-fetch), and an
  invite among them reloads the invite inbox.
- **D-REL3-2 (foreground FCM, A5):** `onMessageReceived` posts the message to the tray **only while the SSE stream is
  disconnected** (while connected, the in-app modal shows it — no duplicate), on the channel its type maps to:
  **`rasi_invites`** ("Invites & membership", IMPORTANCE_HIGH — `program.invite_received` / `role_changed` /
  `admin_transferred` / `member_removed`) or `rasi_default`; a foreground invite push also reloads the inbox. Both
  channels are created in `App.onCreate`.
- **D-REL3-3 (tap, U2):** a tap (tray or our post) carries `notification_id` / `type` / `program_id`; `MainActivity`
  (cold start and `onNewIntent`) **acknowledges** it, then an **invite** opens the program picker's actions sheet on
  its invites tab, any other type re-fetches its data (no navigation).
- **D-REL3-4 (device registry, A12):** `push/DeviceRegistry` — install id in `noBackupFilesDir/install_id` (sent as
  `device_id`); registration persisted in `rasi.push` (excluded from backup); `PUT /notifications/device` at most once
  per 12 h unless the token or the permission changed; **`POST /notifications/device/unregister`** (no login) on every
  sign-out and once when notifications are turned off (the cleared registration is the memo) — with no cached token it
  asks FCM (≤ 2 s) so it also matches 1.0.0 rows registered without `device_id`; one serial queue; one retry then drop;
  a sign-in waits for an in-flight unregister and drops a pending retry; a sign-in's ride-along is recorded only if
  that sign-in is still the current one. Login / OAuth ride along the
  token + install id + `platform:"android"`.
- **D-REL3-5 (permission, board §3.5):** POST_NOTIFICATIONS (Android 13+) is asked **once**, right after the first
  sign-in (flag in `rasi.push`); the answer re-runs the registration. The settings fallback is the
  [`notifications`](../notifications/SPEC.md) screen.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-10-13 | **Reliability Phase 3 C3.** D-REL3-1 foreground-only SSE with backoff + jitter + idle timeout + re-fetch on `ready`; D-REL3-2 foreground FCM posted only while the stream is disconnected, `rasi_invites` channel; D-REL3-3 tap → acknowledge + route; D-REL3-4 `DeviceRegistry` (install id, 12 h re-PUT, `/device/unregister`); D-REL3-5 permission asked once. Compile-checked green (`assembleDebug`). |
| 0.2.0 | 2026-07-08 | FCM push (Phase I-b). |
| 0.1.0 | 2026-07-08 | In-app SSE + modal queue (Phase I-a). |
