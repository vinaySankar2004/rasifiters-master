# Screen: `notifications-alerts` (android) — real-time alerts (in-app SSE + modal queue) + FCM push

> **Status:** 🏗️ built (in-app SSE + FCM push) · **Version:** 0.2.0 · **App:** `android`
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
