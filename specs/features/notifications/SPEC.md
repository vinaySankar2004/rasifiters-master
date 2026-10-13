# Feature: `notifications` — in-app alerts, real-time SSE delivery & APNs push

> **Status:** 🚀 deployed (`apps/backend/` + the `apps/web`, `apps/ios`, `apps/android` clients) · **Version:** 0.6.0 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/notifications.js`, `utils/notifications.js`,
> `utils/notificationStreams.js` (SSE registry), `utils/pushNotifications.js` (APNs),
> `models/{Notification,NotificationRecipient,MemberPushToken}.js`, `services/authService.js`
> (`upsertPushToken`/`removePushToken` — already ported), `server.js:20,61`.
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` + the Supabase-JWKS verify reused by the
> stream, and the already-ported `upsertPushToken`/`removePushToken`) · [`programs`](../programs/SPEC.md) /
> [`program-memberships`](../program-memberships/SPEC.md) / `invites` (the **emit** call sites — they already
> call `createNotification`; porting this feature **replaces the deferred stub** and lights them up) ·
> [`observability`](../observability/SPEC.md) (`utils/rateLimit` — the `POST /device/unregister` limiter, 0.4.0).
> **The keystone.** Porting this **replaces** the deferred stub at `apps/backend/utils/notifications.js`
> (programs D-C1 / program-memberships D-C4) with the real `createNotification` (DB write + SSE dispatch +
> APNs). Every deferred emit across programs/memberships starts firing — **the call sites are unchanged**.
> **One migration delta** (the rest is faithful): **D-C2** the SSE stream auth swaps symmetric
> `jwt.verify(JWT_SECRET)` → **Supabase JWKS verify** (the auth D-C2 pattern), still accepting `?token=`.
> **0.4.0 (reliability overhaul R3):** device registry, `push_deliveries`, unregister without a login, 7-day APNs/FCM
> TTL + Android channels, SSE plain close on shutdown — D-C11–D-C16; client contracts §3.1–§3.3.
> **0.5.0 (Phase 3 client release):** web, iOS 1.5.0 (58) and Android 1.1.0 (5) adopt §3.1–§3.3 — D-C17 / D-C18.
> **0.6.0 (reliability overhaul Phase 4 — Notifications server + People kudos + the three client builds):** five
> categories, the inbox + read state + badge, preferences + time zone, the reminder / digest scheduler, send-anytime
> announcements, per-category push, the content seam, 90-day retention, the kudos emitter, and the clients' Inbox + toast
> replacing the pop-up queue — D-C19–D-C31; §3.4–§3.9.

---

## 1. What it is

The **alerts layer** of RaSi Fiters — the `notifications` / `notification_recipients` tables, the
**real-time SSE stream** that pushes new alerts to connected clients, and the **APNs push** path that wakes
iOS devices. Legacy ships **6 routes** at `/api/notifications` (`server.js:61`), all owned here, plus one net-new route (0.4.0, item 4) and nine net-new routes on three sub-routers (0.6.0, items 6–8):

1. **Read my pending alerts** — `GET /unacknowledged` (the per-member backfill on app load / stream start).
2. **Acknowledge one** — `POST /:id/acknowledge` (mark a recipient row read; dismisses the modal).
3. **Real-time delivery** — `GET /stream` (Server-Sent Events; the one route whose auth **migrates**, D-C2).
4. **Device registry** — `PUT /device` + `DELETE /device` + (0.4.0, net-new) `POST /device/unregister` (no login) —
   the APNs (iOS) + FCM (Android) token lifecycle, one row per installation (`services/deviceService.js`; §3.1,
   D-C11/D-C12).
5. **Admin broadcast** — `POST /broadcast` (`global_admin` only). **Called by neither client** (vestigial,
   kept for parity, flagged §10 / F1).
6. **Inbox** (0.6.0) — `GET /inbox`, `GET /inbox/unread-count`, `POST /inbox/read` (`routes/notificationInbox.js`; §3.5).
7. **Preferences** (0.6.0) — `GET` + `PUT /preferences` (`routes/notificationPreferences.js`; §3.5).
8. **Announcements** (0.6.0, global admins) — `GET /announcements`, `POST /announcements/preview`, `POST /announcements`,
   `POST /announcements/:id/cancel` (`routes/announcements.js`; §3.8).

Plus the **emit engine** — `utils/notifications.js` (`createNotification`, `buildNotificationPayload`,
`getActiveProgramMemberIds`, `getMemberIdsWithPushTokens`), the **in-memory SSE registry**
(`utils/notificationStreams.js`), and the **APNs provider** (`utils/pushNotifications.js`). This module is
imported by programs / program-memberships / invites / auth to fire their event alerts. **0.6.0:** plus the category map
(`utils/notificationCategories.js`, §3.4), the preference filter inside `createNotification` (§3.5), the in-process
scheduler for reminders, the digest and scheduled announcements (§3.6), and the content + channel seam
(`utils/notificationTemplates.js`, `utils/notificationChannels.js`, §3.7); People's kudos emits through it (D-C29).

## 2. Why it exists

Every cross-member event in RaSi Fiters — you were invited to a program, your role changed, you were
removed, a program you led was deleted, a new admin was promoted, an admin broadcast — needs to **reach the
member**. This feature is the single sink for all of those: it **persists** each alert (so a member who was
offline sees it via `GET /unacknowledged` on next load), **pushes it live** over SSE to any connected
web/iOS client (the modal pops instantly), and **wakes iOS devices** via APNs even when the app is closed.
The `acknowledge` step keeps the unacknowledged set from growing without bound. Authorization stays in
Express (the stream + broadcast gates), per the auth model.

## 3. Functionality (the routes)

All mounted at **`/api/notifications`** (legacy `server.js:61`). Handlers in `routes/notifications.js`; the
emit/recipient logic in `utils/notifications.js`; SSE registry in `utils/notificationStreams.js`; APNs in
`utils/pushNotifications.js`.

| # | Route | Legacy handler | Auth | Purpose |
|---|-------|----------------|------|---------|
| 1 | `GET /unacknowledged` | `notifications.js:30-59` | `authenticateToken` | This member's un-acked notifications, oldest-first, projected from the joined `Notification`. |
| 2 | `PUT /device` | `notifications.js:61-73` | `authenticateToken` | Register this installation's push token → `deviceService.registerDevice` (§3.1, D-C11). `400` if `push_token` missing. |
| 3 | `DELETE /device` | `notifications.js:75-84` | `authenticateToken` | Unregister → `authService.removePushToken(req.user.id, push_token?)` → `deviceService.unregisterMemberDevices` (null token = all the member's tokens). Unchanged. |
| 4 | `POST /broadcast` | `notifications.js:86-120` | `authenticateToken` + **`global_admin`** (`403` else) | Admin alert to `recipient_ids` (or **all** members with a push token if omitted). `400` if `title`/`body` missing; `200` "nothing sent" if no recipients; else `201`. **Vestigial** (no client, F1). |
| 5 | `POST /:id/acknowledge` | `notifications.js:122-142` | `authenticateToken` | Set `acknowledged_at=now` on this member's recipient row. `404` if none un-acked. |
| 6 | `GET /stream` | `notifications.js:144-163` | **`authenticateStream`** (D-C2 — Supabase JWKS, token via header **or** `?token=`) | Open an SSE connection; emit `event: ready`, register the stream, ping every 25s, clean up on close. |
| 7 | `POST /device/unregister` | net-new (0.4.0) | **none** — per-client rate limit (D-C12) | Unregister a device **without a login**: the push token and/or install id prove the device (§3.1). |
| 8 | `GET /inbox` | net-new (0.6.0) | `authenticateToken` | The member's inbox — newest first, keyset-paged, last 90 days (§3.5). |
| 9 | `GET /inbox/unread-count` | net-new (0.6.0) | `authenticateToken` | `{ unread, pending_invites, badge }` (§3.5). |
| 10 | `POST /inbox/read` | net-new (0.6.0) | `authenticateToken` | Mark read: `{ids}` · `{all:true}` · `{type:"program.invite_received", program_id}` (§3.5). |
| 11 | `GET /preferences` | net-new (0.6.0) | `authenticateToken` | The member's categories, reminder time, time zone (§3.5). |
| 12 | `PUT /preferences` | net-new (0.6.0) | `authenticateToken` | Partial update (§3.5). |
| 13 | `GET /announcements` | net-new (0.6.0) | `authenticateToken` + **`global_admin`** | The newest 50 announcements (§3.8). |
| 14 | `POST /announcements/preview` | net-new (0.6.0) | same; 30 / min | Recipient count + one sample rendering (§3.8). |
| 15 | `POST /announcements` | net-new (0.6.0) | same; 10 / hour | Send now or at each recipient's local time (§3.8). |
| 16 | `POST /announcements/:id/cancel` | net-new (0.6.0) | same | Cancel a scheduled / sending announcement (§3.8). |

**0.6.0 on the legacy routes:** `GET /unacknowledged` returns **legacy types only** (§3.4); `GET /stream` without
`?inbox=1` frames legacy types only and with `?inbox=1` every type as an inbox item; `PUT /device` also records the
`inbox` capability and the caller's `X-Time-Zone`. Shapes unchanged.

### Delivery mechanics (the non-route pieces)

- **`createNotification({ type, programId?, actorMemberId?, title, body, recipientIds, transaction? })`**
  (`utils/notifications.js:38-86`) — the emit engine. Dedupes `recipientIds`; returns `null` if empty; else
  `Notification.create` + `NotificationRecipient.bulkCreate` (one row per recipient, `acknowledged_at=null`);
  builds the payload; **dispatches** = SSE `sendNotificationToMember` to each recipient + `sendPushToMembers`
  (APNs + FCM + delivery records, §3.2). When called inside a transaction, the dispatch runs on **`transaction.afterCommit`** (so no alert
  fires for a rolled-back write); otherwise immediately. **0.6.0 (D-C21):** recipient ids are lower-cased once; the
  type's category and each recipient's switch (read inside the caller's transaction) decide — activity / reminders /
  digest OFF → no row for that member; program / announcements OFF → in the inbox but not pushed; nobody left →
  `null`. Dispatch goes through `utils/notificationChannels.js` (§3.7). The signature is unchanged.
- **SSE registry** (`utils/notificationStreams.js`) — an in-process `Map<memberId, Set<res>>`;
  `registerNotificationStream` / `removeNotificationStream` / `sendNotificationToMember` (writes
  `event: notification\ndata: <json>\n\n`, evicting a `res` that throws). In-memory → **single-instance**
  (F4).
- **Native push** (`utils/pushNotifications.js` facade → `utils/push/apns.js` + `utils/push/fcm.js`, 0.4.0) —
  `sendPushToMembers(memberIds, { id, title, body, type, programId })` runs ONE token query for both platforms,
  sends APNs (lazy `apn.Provider` from `APNS_*`) and FCM (lazy `firebase-admin` app from `FIREBASE_SERVICE_ACCOUNT`)
  in parallel with the §3.2 settings, prunes the tokens a provider declared dead (D-C14), and writes one
  `push_deliveries` row per attempt plus one `no_device` row per recipient with no registered device (D-C15). A sender
  whose credentials are unset records `not_configured` (the D-C4 pattern). Never throws.
- **`getActiveProgramMemberIds(programId, transaction?)`** (`utils/notifications.js:20-27`) — active-member
  recipient query (already ported as the **real** half of the stub); **`getMemberIdsWithPushTokens()`**
  (`:30-36`) — distinct members with a push token (broadcast's default audience).

### Response / payload shapes (faithful)

- **`GET /unacknowledged`** → array of `{ id, type, program_id, actor_member_id, title, body, created_at }`
  (the `Notification` fields; recipient rows whose `Notification` is null are filtered out).
- **SSE `event: notification`** → the same `buildNotificationPayload` object (`:10-18`).
- **`PUT`/`DELETE /device`** and **`POST /device/unregister`** → `{ message }` (§3.1). **`POST /:id/acknowledge`** → `{ message }`.
- **`POST /broadcast`** → `{ message, notification_id, recipient_count }` (201) or `{ message }` (200).

### Error contract (faithful)

Each handler wraps its body in `try/catch` → `500 { error: "Failed to …" }`; explicit `400` (missing
`push_token`/`title`/`body`), `401` (stream: no/invalid token), `403` (broadcast: not `global_admin`),
`404` (acknowledge: no un-acked recipient row). No `utils/response.AppError` here — the routes predate it
and hand-roll status codes (F5).

(0.4.0: the net-new `POST /device/unregister` carries a `code` on its `400` / `429` — the existing backend codes
`invalid_body` (observability client-events) and `rate_limited` (`utils/rateLimit`). This feature adds **no new
`code`**; its 500s are `{ error }` like every backend 500 — the frontend-kit derives `server` from the status.)

### 3.1 Device registry — client contract (0.4.0, D-C11/D-C12)

All under `/api/notifications`. Web, iOS 1.5.0 (58) and Android 1.1.0 (5) follow this (D-C17 / D-C18); the older
binaries keep working unchanged (they send no `device_id` and never call `/device/unregister`).

**Install id (`device_id`).** Each installation generates a random UUID v4 once, on first launch, and stores it where
**neither backup/restore nor device-to-device transfer can copy it to another device**:

- **iOS:** a keychain item (`kSecClassGenericPassword`, service `com.app.rasifiters.install-id`) with
  `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — `…ThisDeviceOnly` items never migrate to
  another device (an encrypted backup restores them to the same device only). Never `UserDefaults`,
  `NSUbiquitousKeyValueStore` or a file in the app container: all of those are restored onto a new device. Surviving
  an uninstall/reinstall on the same device is fine.
- **Android:** a file named `install_id` in `Context.noBackupFilesDir` — the platform excludes that directory from
  Auto Backup (all API levels) and from device-to-device transfer (API 31+). Never SharedPreferences / DataStore: the
  app ships `android:allowBackup="true"` with no backup rules (`AndroidManifest.xml:26`), so those are backed up and
  restored.
- **Web:** no native push; sends none.

The server uses `device_id` only when it is a UUID (case-insensitive, stored lower-case); any other value is ignored.
Two live installs sharing one id would evict each other's row on every registration, so push would reach only the
device that registered last (F13). The storage rule above is what prevents that — the server cannot tell the two
devices apart.

**`PUT /device`** — `Authorization: Bearer <access token>` required.

```json
{ "push_token": "<APNs device token (hex) | FCM registration token>", "platform": "android", "device_id": "6f1c2a0e-3b5d-4c1a-9e7f-2a4b6c8d0e1f" }
```

| Field | Rule |
|---|---|
| `push_token` | required — a non-empty string of ≤ 512 chars after trim |
| `platform` | `"ios"` or `"android"`; omitted / anything else → `"ios"` for a **new** row, the stored value for an **existing** row |
| `device_id` | optional — the install UUID (above) |

| Status | Body | When |
|---|---|---|
| `200` | `{ "message": "Device registered for push notifications." }` | registered (unchanged) |
| `400` | `{ "error": "push_token is required." }` | `push_token` missing / empty / not a string, or longer than 512 chars after trim (0.4.0 hardening — was a `500`; no live client sends one) |
| `401` / `503` | per `authenticateToken` (auth D-C11) | bad / expired token · verifier outage |
| `500` | `{ "error": "Failed to register device." }` | DB failure |

Server effect, one transaction: with a `device_id`, the install's rows holding a different token are deleted (token
rotation); then an upsert on `push_token` re-binds the row to the caller, applies the `platform` rule, keeps the stored
`device_id` when none is sent, and sets `updated_at = last_seen_at = now()`. **Call it** after every sign-in, on every
token rotation (iOS `didRegisterForRemoteNotificationsWithDeviceToken`, Android `onNewToken`) and when notification
permission is granted again; otherwise at most **once per 12 h** on launch / foreground while signed in with permission
granted (amended 0.5.0 — A12; well inside the 60-day unseen prune). Repeats are idempotent. The same
registration rides along on `POST /api/auth/login/app`, `POST /api/auth/login/global` and `POST /api/auth/oauth`
(body fields `push_token`, `device_id`, `platform` — identical rules).

**`DELETE /device`** — unchanged: Bearer; body `{ "push_token"?: string }`; removes that one of the caller's tokens, or
all of them; `200 { "message": "Device unregistered from push notifications." }`.

**`POST /device/unregister`** — **no login** (a Bearer, if sent, is ignored). The push token and/or the install id
prove the device. Send `Content-Type: application/json`.

```json
{ "push_token": "<token>", "device_id": "6f1c2a0e-3b5d-4c1a-9e7f-2a4b6c8d0e1f" }
```

At least one must be usable: `push_token` a non-empty string of ≤ 512 chars after trim; `device_id` a UUID. Every row
whose token equals `push_token` **or** whose install id equals `device_id` is deleted, whoever it is bound to.

| Status | Body | When |
|---|---|---|
| `200` | `{ "message": "Device unregistered from push notifications." }` | a valid body — whether or not a row matched (no existence oracle) |
| `400` | `{ "error": "push_token or device_id is required.", "code": "invalid_body" }` | neither field usable (also a body sent without the JSON content type) |
| `429` | `{ "error": "Too many requests. Try again later.", "code": "rate_limited" }` + `Retry-After` | > 30 requests / 60 s from one client (IPv4 address / IPv6 /64) |
| `500` | `{ "error": "Failed to unregister device." }` | DB failure (malformed JSON → `400 { "error": "Invalid request body.", "code": "invalid_body" }` from the global errorHandler — observability D-C11) |

**Call it** on every sign-out path — voluntary and forced (refresh `401 session_invalid`) — and when notification
permission is revoked (once per denial: a memo, re-armed when permission is granted again — A12), sending both fields.
One retry on a network error / 5xx, then drop. **Ordering rule:**
unregister and registration go through ONE serial queue per install. A sign-in's login ride-along / `PUT /device`
starts only after any in-flight unregister has finished (success, or failure after its single retry), and a pending
retry is dropped the moment a sign-in begins. Never send an unregister after the next registration has started — it
would delete the new session's row (same token, same install id). Afterwards forget the "already registered" memo, so
the next sign-in registers again, and the cached push token (iOS keeps its APNs token value — the OS re-issues the same
token and the login ride-along re-sends it, D-C18); keep the install id.
(Account deletion needs no call — the member's rows cascade.)

**Pruning.** A row is deleted when APNs answers `410` / `BadDeviceToken` / `Unregistered` / `DeviceTokenNotForTopic`,
when FCM answers `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, and nightly
when `last_seen_at` **and** `updated_at` are both older than 60 days (they move together; the second clause keeps a
rolled-back backend from pruning active installs). A pruned install comes back with its next `PUT /device`.

### 3.2 Push delivery (0.4.0, D-C13–D-C15; per category since 0.6.0, D-C26)

| | APNs (iOS) | FCM (Android) |
|---|---|---|
| Visible alert | `aps.alert { title, body }`, `aps.sound "default"` | `notification { title, body }` |
| Custom keys | top-level `notification_id`, `type`, `category`, `target` (0.6.0), `program_id` | `data { notification_id, type, category, target, program_id }` |
| Lifetime | `apns-expiration` = send time + **604800 s (7 days)** (was 1 h) | `android.ttl` = **604800 s** (was unset = FCM's 4-week default) |
| Priority | APNs default (10) | `android.priority "high"` (every message shows a notification) |
| Channel | — | `android.notification.channel_id` (below) |
| Stacking (0.6.0) | `aps.thread-id` = the category | the channel (below); one message per token (`sendEach`) |
| Replace (0.6.0) | `apns-collapse-id` = `reminders` / `digest` | `android.notification.tag` = same |
| Badge (0.6.0) | `aps.badge` = the §3.5 `badge`, **only** on devices registered with `inbox: true` | none — launcher dots are drawn by the OS (the platform-idiom divergence) |

Custom keys are strings; `program_id` is omitted when the notification has none. Live binaries read only
`notification_id`; `type` + `program_id` are additive, for tap routing; `category` + `target` (0.6.0) drive the Phase 4
clients' routing (§3.4).

| Android channel id | Name | Importance | Notification types |
|---|---|---|---|
| `rasi_invites` | Invites & membership | `IMPORTANCE_HIGH` | `program.invite_received`, `program.role_changed`, `program.admin_transferred`, `program.member_removed` |
| `rasi_default` | General | `IMPORTANCE_DEFAULT` | every other type (`program.member_joined`, `program.member_left`, `program.updated`, `program.deleted`, `app.broadcast`, any future type) — on installs registered with `inbox: true`, only the program types not on `rasi_invites` |
| `rasi_activity` (0.6.0) | Activity | `IMPORTANCE_DEFAULT` | category activity — inbox-capable installs only |
| `rasi_reminders` (0.6.0) | Reminders | `IMPORTANCE_DEFAULT` | category reminders — inbox-capable installs only |
| `rasi_digest` (0.6.0) | Weekly digest | `IMPORTANCE_LOW` | category digest — inbox-capable installs only |
| `rasi_announcements` (0.6.0) | Announcements | `IMPORTANCE_DEFAULT` | category announcements — inbox-capable installs only |

Android 1.1.0 (5) creates both channels at startup and keeps `rasi_default` as the manifest default
(`com.google.firebase.messaging.default_notification_channel_id`). Android 1.0.0 has only `rasi_default`; FCM shows a
message whose channel id doesn't exist on the device in the manifest default channel, so its invites keep arriving
there. **0.6.0 (D-C26):** the four category channels go **only** to installs registered with `inbox: true` (Android
1.1.0 posts a foreground push on the message's channel id, and a post to a missing channel is dropped); the Phase 4
Android build creates all six at startup, before anything can register. A channel gives the user per-category
settings; it does **not** stack alerts per category in the tray (FCM has no group key). ~~**Clients (amended 0.5.0 — U2,
A5; D-C17):** a tap reads `notification_id` → `POST /:id/acknowledge`; a `program.invite_received` tap then opens the
invite inbox, any other type re-fetches what it is about (no other navigation).~~ *(Superseded at 0.6.0 by §3.9 rule 8 /
D-C30: a tap marks the item read and routes by `target`.)* A push that arrives while the app is in the foreground is shown once: while the SSE stream is connected
the in-app modal shows it (Android skips the tray post; iOS `willPresent` returns `[.badge]`), otherwise the system
banner — in the Phase 4 builds the in-app copy is the toast (D-KIT-20) and the Inbox. Push is only a hint — state is
always re-fetched.

**Delivery record:** every attempt is a `push_deliveries` row (§5) — `sent`; `failed` (token kept; `error_code` = the
APNs reason / FCM code / `timeout` / `send_error` / `provider_error` — APNs credentials present but malformed, so the
provider could not be built); `pruned` (dead token, row removed); `not_configured` (provider credentials unset); plus
one `no_device` row per recipient with no registered token.

### 3.3 Real-time stream — client contract (0.4.0, D-C16; `?inbox=1` since 0.6.0, D-C20)

`GET /api/notifications/stream` — `Authorization: Bearer <token>` (iOS / Android) **or** `?token=<token>` (web
`EventSource`, which can't set headers — kept; the request log records only the route template, never the URL, so the
token is never logged).

| Frame | When |
|---|---|
| `event: ready` + `data: {}` | once, right after the stream opens |
| `event: ping` + `data: {}` | every 25 s (keepalive) |
| `event: notification` + `data: <the 7-field payload>` | each new notification for this member — **0.6.0:** legacy types only on a plain stream; with `?inbox=1`, every type as a §3.5 inbox item (the 7 fields + `category`, `target`, `read_at`) |

No other event type is ever added — iOS 1.4.x decodes any non-`{}` `data:` frame as a notification. On a deploy or
restart (`SIGTERM`) the server ends every stream with a **plain close** — no frame; a stream opened while the instance
is shutting down gets `ready` and then the close. `401 { "error": … }` on open = missing / bad / expired token; a JWKS / DB outage answers
`503 auth_unavailable` + `Retry-After` (auth 0.13.0 D-C15c — F11 resolved).

**Clients (values fixed 0.5.0 — A4; D-C17):** keep the stream open only in the foreground; treat every close, error or
**60 s of silence** (the server pings every 25 s) as "reconnect": get a fresh access token first (refresh when it expires
within 60 s), reconnect with exponential backoff — **1 s base, ×2, 30 s cap, full jitter**, the attempt count reset on
`ready` — and pause reconnects while offline. ~~On every stream start and **after every `ready`** re-fetch
`GET /unacknowledged` and merge by `id` (the stream never replays): items acknowledged elsewhere leave the queue, ids this
device acknowledged moments ago are ignored (a short-lived set), and an invite notification in the result refreshes
the invite inbox.~~ *(Superseded at 0.6.0 by the catch-up, §3.9 rule 6 / D-C30.)* Web re-creates its `EventSource` with a fresh `?token=` on every token refresh.
`GET /unacknowledged` is idempotent, per member, oldest-first and unthrottled — safe to call on every (re)connect.

### 3.4 Categories, types and the legacy-feed rule (0.6.0, D-C19 / D-C20)

The ONE map — `utils/notificationCategories.js`. A new type is added there (category + target) and nowhere else; an
unknown type counts as category `program`, target `inbox`.

| Category key | Label (all 3 clients) | Default | OFF means |
|---|---|---|---|
| `program` | Program & invites | on | inbox only, no push |
| `activity` | Activity | on | never created |
| `reminders` | Reminders | **off** (opt-in) | never created |
| `digest` | Weekly digest | **off** (opt-in) | never created |
| `announcements` | Announcements | on | inbox only, no push |

| Type | Category | Target | Legacy (old apps show it) |
|---|---|---|---|
| `program.invite_received` | program | `invites` | yes |
| `program.member_joined` / `program.role_changed` / `program.admin_transferred` / `program.member_left` | program | `program` | yes |
| `program.member_removed` / `program.deleted` | program | `programs` | yes |
| `program.updated` | program | `program` | **no** |
| `activity.kudos_received` ([people](../people/SPEC.md)) | activity | `inbox` | no |
| `reminder.daily` | reminders | `log_workout` | no |
| `digest.weekly` | digest | `inbox` | no |
| `app.broadcast` (announcements) | announcements | `inbox` | yes |

Targets: `invites` = the "+" sheet on its Inbox tab · `program` = open `program_id` · `programs` = the program picker ·
`log_workout` = the workout-log form · `inbox` = the inbox. Unknown target → `inbox`.

**Legacy-feed rule (D-C20).** Every pre-inbox client (iOS ≤ 1.5.0 (58), Android ≤ 1.1.0 (5), web before the Phase 4
build) turns ANY item on `GET /unacknowledged` or a plain stream into a blocking pop-up, so both legacy paths carry only
`LEGACY_TYPES` (the "yes" rows) in the unchanged 7-field payload. A stream opened with `?inbox=1` gets **every** type as
a §3.5 inbox item.

### 3.5 Inbox, read state, badge, preferences and time zone (0.6.0, D-C21–D-C23)

All under `/api/notifications`, Bearer, self-only (every route acts on the token's member). Errors are
`{ "error": "<text>", "code": "<code>" }` — `invalid_body` (400; show the server text), `forbidden` (403), `not_found`
(404), `invalid_state` (409), `rate_limited` (429 + `Retry-After`), `server_error` (500). The status decides the
frontend-kit kind.

**Header — `X-Time-Zone`** (owned by [observability](../observability/SPEC.md) §4.1, D-C13): the device's IANA zone, sent
on every request. Read by `/inbox/*`, `/preferences`, `/announcements/*` and `PUT /device`; stored (Intl's canonical
name, e.g. `Asia/Calcutta`) only when it changed; invalid or missing is ignored, except the 400 for a local-time
announcement (§3.8).

**Inbox item** (`GET /inbox` items and `?inbox=1` stream frames):
```json
{ "id": "uuid", "type": "program.role_changed", "category": "program", "target": "program",
  "program_id": "uuid|null", "actor_member_id": "uuid|null", "title": "Role updated",
  "body": "Your role in Morning Crew is now logger.", "created_at": "2026-10-13T17:02:11.482Z", "read_at": null }
```

| Method + path | Request | 200 response | Errors |
|---|---|---|---|
| `GET /inbox?limit=1..50&before=<next_cursor>` | limit defaults to 30. Newest first, last 90 days. | `{ "items": [item…], "next_cursor": "2026-10-13T17:02:11.482913Z_<uuid>" \| null }` — the cursor is opaque | 400 `invalid_body` |
| `GET /inbox/unread-count` | — | `{ "unread": 3, "pending_invites": 1, "badge": 3 }` | — |
| `POST /inbox/read` | `{ "ids": ["uuid", …] }` (1–100) **or** `{ "all": true }` **or** `{ "type": "program.invite_received", "program_id": "uuid" }` (that program's unread invite items, wherever they sit in the paged inbox). Idempotent. | `{ "updated": 1, "unread": 2, "pending_invites": 1, "badge": 2 }` | 400 `invalid_body` |
| `GET /preferences` | — | `{ "categories": { "program": true, "activity": true, "reminders": false, "digest": false, "announcements": true }, "reminder_time": "19:00", "time_zone": "Africa/Nairobi" \| null }` | — |
| `PUT /preferences` | Partial: `{ "categories": { "reminders": true }, "reminder_time": "07:30" }` (24-hour `HH:MM`; unknown category keys ignored). GET and PUT store the caller's zone first, so `time_zone` is current. | the full preferences, same shape as GET | 400 `invalid_body` (e.g. `Nothing to update.`) |
| `GET /stream?inbox=1` | Bearer, or `?token=…&inbox=1` | `ready` / `ping` unchanged; every `event: notification` `data` is an inbox item, for every type | 401 / 503 as §3.3 |
| `PUT /device` | §3.1 body plus `"inbox": true` | unchanged | unchanged |

- **Read = the existing acknowledged flag** (`notification_recipients.acknowledged_at`): reading on one device clears it
  everywhere, including the live binaries' `/unacknowledged` queues, and a live binary's acknowledge marks it read here.
- **Badge** = unread items **except** `program.invite_received` (counted once, through the pending invites instead) and
  **except** `reminder.daily` / `digest.weekly` (an ignored nudge must never make the badge climb — they stay in
  `unread`), **plus** the member's pending, unexpired invites (the `GET /my-invites` rule: exact username). It is both
  the "+" badge and the iOS app-icon badge. For a global admin it counts **their own** invites only.
- **Preferences:** one `notification_preferences` row per member; **no row = the defaults** (program, activity,
  announcements on; reminders + digest off; reminder 19:00 local). PUT is partial — only the fields sent change.

### 3.6 Scheduler — daily reminder and weekly digest (0.6.0, D-C24)

One in-process timer (`services/notificationScheduler.js`), started once the server listens: first tick after 60 s,
then every 15 min, jobs in order daily reminder → weekly digest → due announcements (§3.8). A tick still running when the
next fires is skipped; **each job is capped at 5 min** (given up on — it can't be cancelled; if it finishes later the
send key still keeps every send at most once). One JSON log line `{"type":"scheduler", job, claimed, sent, duration_ms}`
per job that claimed or sent something.

- **Never send twice:** before every scheduled send the member is **claimed** in `notification_send_keys`
  (`INSERT … ON CONFLICT DO NOTHING RETURNING`, PK `(member_id, kind, period_key)`), so a restart, a missed tick or the
  two instances of a Render deploy never double-send. At most once, not exactly once (F15).
- **Candidates** (reminders and digest): the switch on, a known time zone, `members.status = 'active'`, and at least one
  ACTIVE membership in a **non-deleted** program. A member without a zone gets neither (never a guessed time).
- **Daily reminder** (`reminder.daily`, target `log_workout`): at or after the member's `reminder_time` in their zone,
  at most **120 min** late (else that day is skipped; a window crossing midnight belongs to its first day); claimed per
  local day; sent only if **no workout** (`workout_logs`) was logged that local day — synced sleep / steps don't count; a
  member who logged keeps the claim and gets nothing. Streak wording when the streak is ≥ 2.
- **Weekly digest** (`digest.weekly`, target `inbox`): Monday 09:00 local, ≤ 120 min late, claimed per ISO week
  (`2026-W42`); the member's own previous Monday–Sunday: workouts, active days, minutes (the same workout logged to
  several programs on one day counts once, at its longest duration) + the current streak.
- **Streak** (`services/memberActivityStats.js`): consecutive local days with ≥ 1 workout across all programs, ending
  today if today has one, else yesterday; 0 otherwise; 366-day lookback. Deliberately not `computeStreaks` (F14).
- Never Time Sensitive (no APNs interruption level). Web has no push, so web-only members see reminders only in the
  inbox.

### 3.7 Content and delivery seam — templates, content provider, channels (0.6.0, D-C27)

The pipeline is **content source → trigger → preferences → channel**.
- **Content** (`utils/notificationTemplates.js`): `getContentProvider().render(type, vars, seedKey)` → `{ title, body }`.
  Today's provider is the templates: rotating wordings picked deterministically by `sha256(seedKey)`, so a retry for
  the same member + period renders the same words; a missing first name renders `friend`; ASCII apostrophes only.
  Templated types: `reminder.daily` (plain / streak variants), `digest.weekly` (active / quiet variants + the streak
  suffix), `activity.kudos_received` (the KUDOS variants). A later AI provider implements the same async `render`.
- **Announcement merge fields:** `{first_name}`, `{streak}`, `{program_name}` (`renderMergeFields`); `{streak}` renders
  `0` for a member with no current streak.
- **Channels** (`utils/notificationChannels.js`): after the write commits, `inbox` (the live SSE copy to every inbox
  recipient, §3.4's legacy filter applied per stream) and `push` (APNs + FCM, only to recipients whose category switch
  is on). A later channel (email) is one more entry with the same `deliver({ payload, recipientIds,
  pushRecipientIds })` shape. Fire-and-forget: a channel failure is logged and never reaches the emitter.
- **Server-internal contract for emitters (C8 — People's kudos, D-C29):** `createNotification` (signature unchanged),
  `getContentProvider` (`utils/notificationTemplates.js`), `getTimeZones(memberIds)` → `Map`
  (`services/notificationPreferenceService.js`), `localParts` / `dayLabel` (`utils/localTime.js`). Activity OFF →
  `createNotification` returns `null`. Emitters add no preference columns.

### 3.8 Announcements — the send-anytime composer (0.6.0, D-C25)

Global admins only (`403 { error: "Only global admins can send announcements.", code: "forbidden" }`). Web-only UI
(`/program/announcements`); the phones have no composer.

| Method + path | Request | 200/201 response | Errors |
|---|---|---|---|
| `GET /announcements` | — | `{ "announcements": [Summary…] }`, newest 50 | 403 `forbidden` |
| `POST /announcements/preview` | the body below, plus optional `sample_member_id` | `{ "recipient_count": 23, "sample": { "member_id", "first_name", "title", "body" } \| null }` | 400 `invalid_body` · 403 · 404 `not_found` (program) · 429 `rate_limited` (30 / min) |
| `POST /announcements` | the body below | **201** Summary | 400 · 403 · 404 · 429 (10 / hour) |
| `POST /announcements/:id/cancel` | — | `{ "id", "status": "cancelled" }` | 403 · 404 `not_found` · 409 `invalid_state` |

```json
{ "target": { "kind": "program", "program_id": "uuid" } | { "kind": "members", "member_ids": ["uuid"] } | { "kind": "everyone" },
  "title": "Week 3, {first_name}!",
  "body": "{program_name} is halfway. You're on a {streak}-day streak.",
  "delivery": { "mode": "now" } | { "mode": "local", "date": "2026-10-20", "time": "08:00" } }
```
Summary: `{ id, created_at, sender_member_id, sender_name, target_kind, target_program_id, target_program_name, title,
body, mode, send_date, send_time, status: "scheduled|sending|sent|cancelled", recipient_count, sent_count, completed_at }`.

- **Type `app.broadcast`** (category announcements) — a legacy type, so every live binary still shows it (its usual
  pop-up); pushed only where the member's Announcements switch is on; always in the inbox.
- **Audience:** a program's active members, chosen members (1–200, all active), or everyone (every active member,
  **including the sender**) — resolved ONCE at compose time and stored on the audit row (later joiners are excluded).
- **Content:** title ≤ 100, body ≤ 500 characters; merge fields `{first_name}`, `{streak}`, `{program_name}` (program
  targets only). With merge fields each recipient gets their own `notifications` row; without, one shared row.
- **Delivery:** `now`, or `local` = each recipient's own date + time in their zone, else the announcement's fallback
  (the sender's zone); `local` needs the sender's `X-Time-Zone`, and the date must be today … +30 days in the sender's
  zone. Each recipient is claimed with the send key (kind `announcement`, period = the announcement id) before the send;
  status → `sent` once no active recipient is left unclaimed. Cancel works while `scheduled` / `sending` (it doesn't stop
  a batch already in flight).
- **Preview:** one sample recipient — `sample_member_id` when it is in the audience, else the sender when in it, else the
  first; renders their real words.
- **400 texts** (plain language; the kit shows a 400 word for word), incl.: `Couldn't read your time zone, so this
  can't be scheduled. Reload and try again, or send it now.` · `Pick a date within the next 30 days.` ·
  `{program_name} only works when you send to a program.` · `Some of the chosen members are no longer active. Update the
  list and try again.` · `No active members match this target.` · `Unknown merge field {x}. Use {first_name}, {streak}
  or {program_name}.`
- **Limits:** preview 30 / min, send 10 / hour per admin (process memory — F16).

### 3.9 Client rules (0.6.0 — web, iOS and Android Phase 4 builds; D-C30 / D-C31)

*Plan contract IDs (cited in code comments) → this SPEC:* C1 → §3.5 header (+ observability §4.1) · C2 → §3.4 · C3 →
§3.5 (inbox item) · C4 → §3.5 + §3.8 · C5 → §3.2 · C6 → §3.5 + §3.6 · C7.1 → rule 1 · C7.2 / C7.3 → rule 2 · C7.4 →
rule 3 · C7.5 → rule 4 · C7.6 → rule 8 · C7.7 → rule 9 · C7.8 → rule 10 · C8 → §3.7.

1. Send `X-Time-Zone` on every request (observability D-C13).
2. Open the stream with `inbox=1`; stop using `/unacknowledged` and the blocking pop-up queue. Each surface shows the
   **Inbox** (the "+" sheet's `Inbox` tab — invitations first, then notifications) and a **toast** (frontend-kit
   D-KIT-20) instead.
3. Mobile: `PUT /device` with `"inbox": true`; re-register once on the first launch of a new build so the capability
   lands at once.
4. On a stream item: refresh the unread count; show the toast (`<title>` · `View`) only if `categories[item.category]`
   isn't `false` in the cached preferences (missing or unknown → show); an invite item also refreshes
   `GET /program-memberships/my-invites`.
5. **Reading (R1):** a visit whose first page loaded marks everything read with one `{all:true}` — decided from the
   loaded page (any `read_at == null`) or a non-zero cached `unread`, never from the cached count alone; an item that
   arrives while the inbox is on screen is marked read on arrival (`{ids:[id]}`); an inbox that isn't on screen marks
   nothing; unread dots stay for the whole visit.
6. **Catch-up (R2):** on every stream `ready` and every foreground start, at most once per 5 s: refresh the unread
   counts, the inbox (if on screen), invites and programs; if the active program's role or status changed, or it is
   gone, re-read the role-dependent data.
7. **Badge + "+" sheet (R4):** the badge is the server `badge` for every role, capped at `99+`; until counts load, the
   member's own pending invites (global admins 0). The tab is picked when the sheet opens — Inbox if badge > 0 or it was
   opened by an `invites` / `inbox` target, else Create; opened before counts load → decided once they arrive, unless
   the user already switched tabs.
8. **Routing (R5):** a push tap, a toast `View` and an inbox row mark the item read, then route by `target`
   (unknown → inbox). If the target program is already active and a program screen is showing, stay put and refresh.
   Navigation never discards an open form or cover.
9. After accepting or declining an invite, mark that program's unread `program.invite_received` items read.
10. iOS sets the app-icon badge to `badge`; Android shows launcher dots only (no count); web has none.

**Copy (R7 — identical on all three; casing per surface idiom):**

| Element | Text |
|---|---|
| Settings subtitle / section | `Choose what RaSi Fiters notifies you about.` · `Notify me about` |
| program | `Program & invites` · `Invites, role changes and updates to your programs.` |
| activity | `Activity` · `Kudos from people in your programs.` |
| reminders | `Reminders` · `One reminder a day around your chosen time, only if you haven't logged a workout that day.` |
| digest | `Weekly digest` · `A recap of your past week, every Monday morning.` |
| announcements | `Announcements` · `News and messages from the RaSi Fiters team.` |
| Note under the switches | `Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, you get no alert, but they still appear in your Inbox.` |
| Reminder time | `Reminder time` · phones: `Uses your phone's time zone.` · web: `Uses your time zone: <zone>.` (web keeps its no-push note) |
| Inbox | `Inbox` · `Invites and notifications`. Sections: `Invitations` (global admins: `All invitations` + Revoke) · `Notifications`. Empty: `No notifications yet` · `Program updates, kudos, reminders and announcements show up here.` Paging: `Load more` / `Loading…` (iOS loads on scroll) |
| Times | `Just now` · `5m ago` · `3h ago` · `Yesterday` · `Oct 12` · `Oct 12, 2025` |
| Account row | `Inbox` · `<n> new` when badge > 0, otherwise `Invites and notifications` (web adds a count pill) |
| "+" sheet tabs / toast | `Inbox` · `Create` / `<title>` (blank → `New notification`) · `View` |


## 4. Feature list (behaviors to port)

- **`GET /unacknowledged`** (`notifications.js:30-59`) — `NotificationRecipient.findAll({ member_id,
  acknowledged_at:null })` include `Notification` (selected attrs), `ORDER BY Notification.created_at ASC`;
  filter null-Notification rows; project the 7-field shape. **0.6.0:** the include is filtered to `LEGACY_TYPES`
  (D-C20).
- **`PUT /device`** (`:61-73`) — validate non-empty string `push_token` (**0.4.0:** also ≤ 512 chars after trim —
  additive hardening, same `400`; it was a `500` from Postgres `22001`); **0.4.0:** `deviceService.registerDevice({
  memberId, pushToken: push_token.trim(), deviceId: device_id, platform })` (§3.1, D-C11); a failure logs error name +
  Postgres code only. iOS 1.4.x sends `{ push_token }` only and Android 1.0.0 `{ push_token, platform }` — both
  unchanged.
- **`DELETE /device`** (`:75-84`) — `removePushToken(req.user.id, push_token ?? null)`.
- **`POST /device/unregister`** (0.4.0, net-new) — per-client `rateLimit` (30 / 60 s) → `deviceService.unregisterDevice({
  pushToken, deviceId })`; `400 invalid_body` when neither is usable, else `200` (§3.1, D-C12).
- **`POST /broadcast`** (`:86-120`) — `global_admin` gate; validate `title`+`body`; recipients =
  `recipient_ids` filtered, else `getMemberIdsWithPushTokens()`; empty → `200`; else `createNotification({
  type:'app.broadcast', title, body, recipientIds })` → `201`. **Vestigial** (F1).
- **`POST /:id/acknowledge`** (`:122-142`) — `findOne({ notification_id, member_id, acknowledged_at:null })`;
  `404` if none; `update({ acknowledged_at: now })`.
- **`GET /stream`** (`:144-163`) — `authenticateStream` (D-C2); set SSE headers, `flushHeaders`, write
  `event: ready`, `registerNotificationStream(memberId, res)`, 25s ping interval, on `req.close` clear the
  interval + `removeNotificationStream`. **0.4.0:** the ping is skipped once the response has ended; cleanup on `req` *or* `res` close; ended with a plain close on shutdown (§3.3, D-C16).
- **`authenticateStream`** (`:11-28`) — **MIGRATES (D-C2)**: token from header **or** `?token=`; legacy
  `jwt.verify(token, JWT_SECRET)` → **`verifySupabaseJwt`** + `sub`→`members.auth_user_id` lookup, rebuilding
  the same `req.user` (mirrors the ported `authenticateToken`). `401` on missing/invalid.
- **`createNotification` + the dispatch + SSE registry + APNs** (`utils/*`) — ported faithfully (§3).
- **0.6.0 (net-new):** the inbox + preferences routers (`services/notificationInboxService.js`,
  `services/notificationPreferenceService.js`; §3.5), the announcements router (`services/announcementRequest.js` →
  validation, `services/announcementService.js` → resolve / preview / create / list / cancel,
  `services/announcementDelivery.js` → sending; §3.8), the scheduler (`services/notificationScheduler.js`,
  `services/dailyReminderJob.js`, `services/weeklyDigestJob.js`, `services/memberActivityStats.js`; §3.6), the
  category map, templates, channels and local-time helpers (`utils/{notificationCategories,notificationTemplates,
  notificationChannels,localTime}.js`), and `models/{NotificationPreference,NotificationSendKey,
  NotificationAnnouncement}.js` (no associations — not registered in `models/index.js`).

## 5. Data / schema touchpoints

Faithful names (R5); schema already applied in `apps/backend/sql/001_schema.sql`; all three models already in
`apps/backend/models/index.js` (with associations).

- **`notifications`** (owned — write via `createNotification`, read via `GET /unacknowledged`) — `id` (uuid),
  `type`, `program_id?`, `actor_member_id?`, `title`, `body`, `created_at`. FKs `program_id`→`programs`
  **SET NULL**, `actor_member_id`→`members` **SET NULL** (`001_schema.sql:212-224`).
- **`notification_recipients`** (owned — composite PK `(notification_id, member_id)`) — `acknowledged_at?`;
  FKs CASCADE on both parents (`:228-236`). Indexes incl. `(member_id, acknowledged_at)` for the
  unacknowledged query (`:274`).
- **`member_push_tokens`** (owned — written only by `services/deviceService.js` [`PUT /device`, the login ride-along
  via `authService.upsertPushToken`, `DELETE /device`, `POST /device/unregister`], read by the push facade + broadcast,
  pruned by the facade + `pg_cron`) — `id`, `member_id`, `device_token` (unique), `platform` (default `ios`), `device_id?`
  (**0.4.0: the install id** — UUID-only, partial unique index `uniq_member_push_tokens_device_id`), timestamps,
  **`last_seen_at`** (0.4.0 — `NOT NULL DEFAULT now()`, indexed, backfilled from `updated_at`) (`001_schema.sql:162-172`,
  `sql/010`).
- **`push_deliveries`** (owned, 0.4.0 — `sql/010`, `models/PushDelivery.js`, written only by
  `services/pushDeliveryService.js`) — the table below.
- **`members`** (read — the stream/route `req.user`; the broadcast audience) — owned by
  [`members`](../members/SPEC.md).
- **`program_memberships`** (read — `getActiveProgramMemberIds`; the scheduler's "in a non-deleted program" check) —
  owned by [`program-memberships`](../program-memberships/SPEC.md).
- **0.6.0 — `sql/011_notifications_inbox_prefs_scheduler.sql`** (schema-neutral; RLS on the `public` copies; staging
  grants):
  - **`notification_preferences`** (owned) — PK `member_id` (FK `members` CASCADE); `program`, `activity`,
    `announcements` boolean default **true**; `reminders`, `digest` default **false**; `reminder_time time` default
    `19:00`; `time_zone varchar(64)` (Intl canonical name); timestamps. No row = the defaults. Read inside every emit
    transaction (`createNotification`) — **011 must exist on a schema before this code reaches it.**
  - **`notification_send_keys`** (owned) — PK `(member_id, kind, period_key)` (FK `members` CASCADE), `created_at`;
    the never-send-twice ledger (`reminder.daily` + local date, `digest.weekly` + ISO week, `announcement` + id).
  - **`notification_announcements`** (owned) — the composer's audit + schedule: sender (SET NULL), `target_kind`,
    `target_program_id` (SET NULL), `recipient_ids uuid[]`, `title_template`, `body_template`, `mode`
    (`now`/`local`), `send_date`, `send_time`, `fallback_time_zone`, `status`
    (`scheduled`/`sending`/`sent`/`cancelled`), `recipient_count`, `sent_count`, `completed_at`. **No FK to
    `notifications`** (retention deletes those).
  - **`member_push_tokens.supports_inbox boolean NOT NULL DEFAULT false`** — true once an installation registers with
    `inbox: true` (D-C26).
  - **Retention (D-C28):** a one-time `DELETE` of notifications older than 90 days inside 011 (cascading to recipients
    and `push_deliveries`; 407 rows on public, 2026-10-13), then `pg_cron` `notifications_retention_<schema>` daily
    04:32 UTC and `notification_send_keys_retention_<schema>` daily 04:37 UTC (both > 90 days).
- **Read, not owned (raw SQL, no import):** `program_invites` (the badge's pending-invite count — [invites](../invites/SPEC.md)),
  `workout_logs` + `program_workouts` (`memberActivityStats` — [workout-logs](../workout-logs/SPEC.md)).
  `kudos.notification_id` references `notifications` (SET NULL — [people](../people/SPEC.md)).

**`push_deliveries`** (RLS on the `public` copy only, no policies; staging copy granted to `rasifiters_staging`):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` / Sequelize UUIDV4 |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | attempt time — retention + query axis |
| `notification_id` | `uuid NOT NULL` | FK → `notifications(id)` **ON DELETE CASCADE** |
| `member_id` | `uuid NOT NULL` | FK → `members(id)` **ON DELETE CASCADE** |
| `push_token_id` | `uuid` | the `member_push_tokens.id` attempted — **no FK** (tokens are pruned); `null` for `no_device` |
| `platform` | `varchar(16)` | `ios` / `android`; `null` for `no_device` |
| `outcome` | `varchar(16) NOT NULL` | CHECK `sent` · `failed` · `pruned` · `no_device` · `not_configured` |
| `error_code` | `varchar(64)` | APNs reason (`BadDeviceToken`, …) or `status_<n>` / `transport_error`; FCM `messaging/…` code; `timeout`; `send_error`; `provider_error` (APNs provider init threw); `null` for `sent` / `no_device` / `not_configured` |

Indexes `created_at`, `(member_id, created_at)`, `notification_id`. Retention: `pg_cron`
`push_deliveries_retention_<schema>` daily 04:22 UTC (> 90 days). Unseen tokens: `member_push_tokens_prune_<schema>`
daily 04:27 UTC (`last_seen_at` and `updated_at` both > 60 days).

## 6. Flags / env

- **`SUPABASE_URL`** + the JWKS endpoint (already set) — the stream's D-C2 verify reuses `verifySupabaseJwt`
  from `config/supabase.js`; no new auth env.
- **APNs (D-C4 → resolved by D-C8, creds provisioned 2026-06-30):** `APNS_KEY_ID` (`RA353TA52W`),
  `APNS_TEAM_ID` (`VSTTF2AM22`), `APNS_BUNDLE_ID` (`com.app.rasifiters`), and **one of** `APNS_KEY` (base64
  `.p8`, the secret) or `APNS_KEY_PATH`; plus `APNS_PRODUCTION` (`true`/`false`; defaults to
  `NODE_ENV==='production'` — set **`false`** while testing an Xcode dev build, which gets a sandbox token).
  Entered in the Render Dashboard (`sync:false`); `getProvider()` now returns a live provider so
  `sendPushToMembers` fires iOS push. If any required value is later absent it falls back to `null` →
  `sendPushToMembers` warns + skips; **SSE delivery + DB persistence + unacknowledged backfill work with or
  without APNs.**
- New runtime dep: **`apn`** (added to `apps/backend/package.json`). `jsonwebtoken` is **not** re-added — the
  stream uses `verifySupabaseJwt` (D-C2), not symmetric verify.
- **Constants (0.4.0 — code, not env; no new env var):** APNs expiry + FCM TTL `PUSH_TTL_SECONDS = 604800` (7 days,
  `utils/pushNotifications.js`); APNs send timeout `10000` ms per token (`utils/push/apns.js`; FCM = firebase-admin's
  built-in 15 s); FCM channels `rasi_default` / `rasi_invites` (`utils/push/fcm.js`); unregister limit 30 / 60 s per client
  (`routes/notifications.js`); shutdown drain `2000` ms + hard exit `25000` ms (`server.js`); retention 90 days /
  unseen prune 60 days (`sql/010` cron). Staging runs `APNS_PRODUCTION=false` (sandbox tokens) and the same Firebase
  project.
- **Constants (0.6.0 — code, not env; no new env var, no scheduler kill switch):** scheduler tick 15 min, first tick 60 s
  after listen, each job capped at 5 min (`services/notificationScheduler.js`); reminder / digest late window 120 min;
  digest Monday 09:00 local; default reminder 19:00; streak lookback 366 days; inbox 90 days, page 30 (max 50), read ids
  ≤ 100; composer title ≤ 100 / body ≤ 500, members ≤ 200, schedule ≤ 30 days, preview 30 / min and send 10 / hour per
  admin (`routes/announcements.js`); `notifications` + `notification_send_keys` retention 90 days (`sql/011` cron). An
  emergency stop is a deploy revert.

## 7. The migration delta — the load-bearing part

**What stays (faithful 1:1):** all 6 route paths + their projections + error codes, `GET /unacknowledged`,
`PUT/DELETE /device` (over the already-ported push-token helpers), `POST /:id/acknowledge`, `POST
/broadcast` (kept though vestigial), the whole emit engine (`createNotification` dedupe + transactional
`afterCommit` dispatch + `buildNotificationPayload`), the in-memory SSE registry + 25s ping + close cleanup,
the APNs provider + invalid-token pruning. The SSE payload framing (`event: notification\ndata: …\n\n`) is
preserved exactly so both clients' parsers (web `EventSource`, iOS `NotificationStreamClient`) keep working.

**What changes:**

- **The SSE stream auth migrates (D-C2 — the one delta).** Legacy `authenticateStream`
  (`notifications.js:11-28`) verifies the token with **symmetric `jwt.verify(token, process.env.JWT_SECRET)`**
  — which no longer exists under Supabase Auth. The rebuild applies the **same pattern as auth D-C2 /
  `authenticateToken`**: `verifySupabaseJwt` (JWKS/ES256) → `sub`→`members.auth_user_id` → rebuild `req.user`.
  The **dual token source is kept** (Authorization header **or** `?token=` query param) because browser
  `EventSource` can't set headers (web `lib/notifications/stream.ts` passes `?token=`); iOS
  `NotificationStreamClient` uses `URLSession` and can send either. Behavior is identical; only the verifier
  changes. (This is the stream analog of the auth feature's load-bearing token-verify migration.)
- **APNs creds deferred (D-C4).** The push code ports faithfully and the `APNS_*` vars are declared
  `sync:false` in `render.yaml`, but **no credentials are supplied this run**. Push degrades to a logged
  no-op until the key lands; SSE + DB delivery are fully live. iOS device-token registration still persists
  tokens (so push works retroactively the moment creds are added). A deferred side-effect, not a spec change.
  **Resolved (D-C8, 2026-06-30):** a fresh token-based APNs Auth Key (`.p8`, Key ID `RA353TA52W`) was created
  and its `APNS_*` values entered in the Render Dashboard — push is now enabled, and every previously
  registered iOS token receives retroactively.

> **This feature is the keystone — it un-defers the rest.** Porting `utils/notifications.js` here **replaces**
> the stub (programs D-C1 / program-memberships D-C4). The deferred emits — `program.updated`/`program.deleted`
> (programs), `program.role_changed`/`member_removed`/`member_left`/`admin_transferred`/`deleted`
> (program-memberships + `handleMemberExit`), and `program.invite_received`/`member_joined` (the future
> `invites` feature) — **already call `createNotification` by name**, so they light up automatically with **no
> edits to their call sites**. (The deferred `members DELETE /:id` + auth `/account` cascades are a separate
> follow-up — they need `handleMemberExit` wired, not this module.)

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) — `authenticateToken`, `verifySupabaseJwt` (the D-C2 stream
  verify), and the already-ported `upsertPushToken`/`removePushToken` (`authService.js`). Reads
  [`members`](../members/SPEC.md) (`req.user`, broadcast audience) +
  [`program-memberships`](../program-memberships/SPEC.md) (`getActiveProgramMemberIds`).
  [`observability`](../observability/SPEC.md) — `utils/rateLimit` (unregister + composer limits) and `parseTimeZone`
  (`X-Time-Zone`, D-C13).
- **Downstream (the unblock):** [`programs`](../programs/SPEC.md),
  [`program-memberships`](../program-memberships/SPEC.md), and the future `invites` + the deferred
  members/auth delete cascades all **emit** through `createNotification` — replacing the stub here makes their
  alerts fire. **0.6.0:** programs' `program.updated` / `program.deleted` emit is live (programs D-C3), and
  [`people`](../people/SPEC.md) emits `activity.kudos_received` through the C8 seam (D-C29). All three clients (`web`,
  `ios`, `android`) consume the stream (Phase 4 builds: `?inbox=1`) + the inbox, preferences and read routes (live
  binaries: unacknowledged + acknowledge); iOS (APNs) and Android (FCM) also drive the device registry (§3.1); web alone
  hosts the composer (§3.8).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the `notifications` module only** — the 6 `/api/notifications` routes + `utils/{notifications,notificationStreams,pushNotifications}` + the 3 models (already in `models/index`). Porting it **replaces** the deferred stub `apps/backend/utils/notifications.js`; the cross-feature emit call sites (programs/memberships/invites) and the deferred members/auth delete cascades stay **their** features' follow-ups (the emits just start working). | `routes/notifications.js`; `server.js:61`; programs D-C1 / program-memberships D-C4; user decision. |
| **D-C2** | **The SSE stream auth migrates** symmetric `jwt.verify(JWT_SECRET)` → **`verifySupabaseJwt` (JWKS) + `sub`→`members.auth_user_id`**, rebuilding the legacy `req.user`, while **keeping the dual token source** (header or `?token=` for `EventSource`). Same behavior, migrated verifier — the stream analog of auth D-C2. | `notifications.js:11-28` (legacy symmetric verify); `apps/backend/middleware/auth.js` (`authenticateToken`); web `lib/notifications/stream.ts` (was `NotificationsGate.tsx:144`); user decision. |
| **D-C4** | **APNs credentials deferred** — port `pushNotifications.js` faithfully (+ the `apn` dep), declare `APNS_*` as `sync:false` in `render.yaml`, supply **no creds** this run. `getProvider()→null` ⇒ push is a logged no-op; SSE + DB delivery fully live; tokens still persist for retroactive push. | `pushNotifications.js:6-33` (graceful-null); `render.yaml`; user decision. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios]`.** **Both** clients open the SSE stream (web `EventSource` w/ `?token=`, `NotificationsGate.tsx:144-159`; iOS `NotificationStreamClient.swift:12-29`) + call `GET /unacknowledged` + `POST /:id/acknowledge`, and render a **single-notification modal queue** (web `NotificationModal.tsx`, iOS `NotificationModalView.swift`). **iOS-only:** the APNs device lifecycle (`PUT/DELETE /device`, `APIClient+Auth.swift:64-91`). **Neither client:** `POST /broadcast` (vestigial, F1). No behavioral divergence in the shared paths. **Superseded in part:** Android joined with FCM in D-C9; the device-lifecycle contract is D-C11/D-C12 (0.4.0). | Web + iOS consumption sweep (Explore agents). |
| **D-S1** | **Stance = faithful 1:1 except D-C2 (migrate stream verify) + D-C4 (defer APNs creds).** `POST /broadcast` is **kept** for parity though called by no client (F1); other oddities flagged (§10), not changed. | Whole-module review; §7; user decision. |
| **D-C5** | **Web client ported (2026-06-29) — replaces the `NotificationsGate` deferred stub.** Three files land in `apps/web`: `lib/api/notifications.ts` (verbatim — `fetchUnacknowledgedNotifications`/`acknowledgeNotification` over `apiRequest`), `components/NotificationModal.tsx` (verbatim — already `rf-*` tokenized), and `components/NotificationsGate.tsx` (the real gate replacing the `return null` stub). Every other dep was already ported (`fetchPrograms`, `lib/storage`, `broadcastActiveProgramUpdate`, `API_BASE_URL`, `useAuth`) → **no new dependency** beyond the 3 ported files. Faithful otherwise: `EventSource` SSE client w/ `?token=`, `unacknowledged` backfill, single-notification modal queue, `acknowledge`-on-confirm, the per-notification React Query invalidation (which lands on the rebuilt query keys, verified). *(The modal queue, `NotificationModal.tsx` and the per-notification invalidation are superseded at 0.6.0 by D-C30 — the Inbox + toast; `NotificationModal.tsx` is deleted.)* | `apps/web/src/components/NotificationsGate.tsx` (was the stub); legacy `rasifiters-webapp/src/components/NotificationsGate.tsx`; user decision. |
| **D-C6** | **Web `isAuthRoute` reconciled (deliberate divergence from legacy).** The gate suppresses the modal on pre-auth routes; the rebuild added two net-new public auth routes (`/forgot-password`, `/reset-password`, runs 17–18), so the ported list is `["/login","/create-account","/splash","/forgot-password","/reset-password"]` (legacy had the first 3). Belt-and-suspenders (`shouldRun` also requires a token) but covers a logged-in user landing on `/reset-password` from an email link. | `NotificationsGate.tsx:39-41` (legacy 3); rebuild's `app/{forgot,reset}-password`; run-19 reconcile pattern; user decision. |
| **D-C7** | **Dropped the stray `["program","roles",programId]` invalidation key.** The legacy gate invalidated it on every notification, but **no rebuilt query uses that key** (grep of the web query layer) — and the broad `["program"]` invalidation in the membership-event branch covers the roles cache. All other legacy invalidation keys (`["programs"]`, `["program","membership-details",…]`, `["members","list",…]`, `["program","workouts",…]`, `["members","metrics",…,"preview"]`, `["invites",bool]`) **match live rebuilt keys** and port verbatim. | web query-key grep; legacy `NotificationsGate.tsx:73-81`; user decision. |
| **D-C9** | **Android client ported + FCM push added (2026-07-08).** The `android` surface consumes the shared paths 1:1 (SSE `/stream` via okhttp-sse + Bearer header, `/unacknowledged` backfill, `/:id/acknowledge`, single-notification modal queue) and adds the **FCM device lifecycle** (the APNs analog): `upsertPushToken` gains a `platform` param (**default `'ios'`** — the LIVE iOS binary, which sends none, is byte-for-byte unchanged), the mobile-login + `PUT /device` routes thread it, and `utils/pushNotifications.js` gains a **`firebase-admin` FCM sender** that `sendPushToMembers` fires alongside APNs (`sendEachForMulticast`, invalid-token pruning). Credential = `FIREBASE_SERVICE_ACCOUNT` (base64 service-account JSON) on Render, `sync:false`, graceful-null when unset (the D-C4 APNs-deferral pattern). **No migration** — `member_push_tokens.platform` already exists (default `'ios'`, indexed). Broadcast stays vestigial (F1). | `apps/android` notifications-alerts SPEC; `pushNotifications.js` (dual sender); `authService.upsertPushToken`; `member_push_tokens` schema; user provisioned the Firebase project + entered the Render secret. |
| **D-C8** | **APNs credentials provisioned — D-C4 resolved, iOS push enabled (2026-06-30).** A fresh token-based APNs Auth Key (`.p8`, Key ID `RA353TA52W`, Team `VSTTF2AM22`, "Sandbox & Production" / Team-scoped) created at Apple; **Push Notifications** capability enabled on App ID `com.app.rasifiters`. The 4 `APNS_*` values entered in the Render Dashboard (`sync:false` — the secret `.p8` base64 stays out of git); `getProvider()` returns a live provider so `sendPushToMembers` fires. `APNS_PRODUCTION` set per build type (`false` = Xcode dev / sandbox token; `true`/unset = TestFlight/App Store). **No code change** — the D-C4 port already carried the full push path + graceful-null fallback; the iOS app already had the `aps-environment` entitlement + device-token registration. | `pushNotifications.js:9-36`; `render.yaml` APNs block; `apps/ios/.../RaSi-Fiters-App.entitlements` (`aps-environment`); user provisioned the key + entered Render secrets. |
| **D-C10** | **iOS device-token registration is self-healing on foreground (2026-07-10).** Before, `registerForRemoteNotifications()` was called from **only one** site — the in-app "Enable Notifications" button, which only appears in the `.notDetermined` permission state (`NotificationsSettingsView.swift:161`). Once a member was already `.authorized`, nothing re-registered — so an APNs token pruned server-side (§10 F-prune: `BadDeviceToken`/`Unregistered` after e.g. an `APNS_PRODUCTION` sandbox→production flip) was **never resent**, and toggling the OS-level Settings switch didn't help (iOS does not auto-register on that toggle — the app must call it). The rebuild adds an **idempotent re-registration on every foreground while authorized** in the `scenePhase == .active` handler (`AppRootView.swift`), so a pruned token is restored on next app open; the resulting `didRegister` callback re-POSTs it via the unchanged `registerPushTokenIfNeeded` → `PUT /device`. iOS-client behavior only — **no backend/contract change** (owned routes, payloads, and `member_push_tokens` schema all unchanged). | `AppRootView.swift` (`scenePhase .active`); `AppDelegate.swift:26-37` (didRegister → `PUT /device`); `NotificationsSettingsView.swift:157-168` (the former sole call site); `pushNotifications.js:79-87` (invalid-token pruning that made stale tokens unrecoverable); user-reported TestFlight non-delivery. |
| **D-C11** | **Device registry = one row per installation (0.4.0).** The install id is the EXISTING `device_id` field/column (already accepted by `PUT /device` and both login routes; null on all 35 prod rows; no live build sends it), used only when it is a UUID, with partial unique index `uniq_member_push_tokens_device_id`. Clients keep it where backup/restore and device transfer can't copy it — iOS keychain `…ThisDeviceOnly`, Android `noBackupFilesDir` (§3.1, F13). `deviceService.registerDevice`: one transaction — delete the install's rows holding another token (rotation), then an atomic `INSERT … ON CONFLICT (device_token)` that re-binds the token to the caller (faithful) and stamps `last_seen_at` on **every** call, old builds included (`sql/010` backfills it from `updated_at` so old installs aren't pruned); one retry on a `23505` race. `platform` omitted/unknown → `"ios"` for a NEW row only; an existing row keeps its platform (fixes the latent Android OAuth-login flip, `Dtos.kt:74-80`). DB errors leave `deviceService` scrubbed to name + Postgres code (its raw SQL would otherwise put the push token in callers' logs — observability F8). `authService.upsertPushToken`/`removePushToken` now delegate here (exports + login callers unchanged). **Every server-side device write goes through `deviceService` — Phase 3 R1's sign-out work adds no second path.** | DESIGN_BOARD §3.4; W2 E5/F8/F10; user decision (Phase 3 R3 plan). |
| **D-C12** | **Unregister without a login (0.4.0).** New `POST /device/unregister` (no auth): `push_token` and/or `device_id` prove the device; every matching row is deleted whoever owns it; `200` for every valid body (no existence oracle), `400 invalid_body` otherwise (the existing client-events code — no new `code`); per-client `rateLimit` 30 / 60 s (the `utils/rateLimit` primitive, same window as client-events). Clients serialize unregister before the next registration (§3.1 ordering rule). A new route rather than optional auth on `DELETE /device`, so the live binaries' endpoint stays byte-identical. | DESIGN_BOARD §2 client rule 5 + §3.4; observability D-C4. |
| **D-C13** | **Delivery settings (0.4.0).** APNs `apns-expiration` = now + 604800 s (was 3600 — an iPhone offline > 1 h lost the push, W2 F11); FCM `android.ttl` 604800 s + `priority "high"` + an explicit `android.notification.channel_id`: `rasi_invites` for `program.invite_received` / `program.role_changed` / `program.admin_transferred` / `program.member_removed`, `rasi_default` for every other type (Android 1.0.0 has only `rasi_default`; FCM falls back to the manifest default for an unknown id). Custom keys `type` + `program_id` join `notification_id` on both platforms (additive). The FCM `notification` block stays (1.0.0 ignores data-only messages). | DESIGN_BOARD §3.5; W2 §7.4, F11; Android `App.kt:20-27`, `strings.xml:5`, manifest `:82-83`. |
| **D-C14** | **Pruning + send timeouts (0.4.0).** Prune on APNs `410` (now compared as a string — apn 2.2.0's node-http2 reports `:status` as `"410"`, so the old numeric check never matched) / `BadDeviceToken` / `Unregistered` / `DeviceTokenNotForTopic`, and FCM `messaging/registration-token-not-registered` (FCM v1 `UNREGISTERED` / `NOT_FOUND`) / `messaging/invalid-registration-token`. **`messaging/invalid-argument` never prunes** — a payload bug, logged at error level (W2 F9). Plus the nightly unseen prune (`pg_cron`, `sql/010`): `last_seen_at` AND `updated_at` both > 60 days — the `updated_at` clause makes a code rollback safe (pre-0.4.0 code bumps only `updated_at`). APNs: one `send()` **per token**, each raced against its own 10 s timer (apn 2.2.0 has no request timeout, and its multi-token `send()` is a `Promise.all` — one hung stream would have failed every token of the notification); a late result is ignored and only that token records `failed`/`timeout`. FCM relies on firebase-admin's built-in 15 s. | DESIGN_BOARD §3.4; W2 F9/F10; `apn/lib/client.js`, `apn/lib/provider.js`; firebase-admin `lib/utils/error.js`; plan-adversary #4 (approval amendment). |
| **D-C15** | **`push_deliveries` (0.4.0).** `sendPushToMembers` runs ONE token query for both platforms (was one per platform), sends APNs + FCM in parallel, prunes, then writes one row per attempt plus one `no_device` row per recipient with no registered device (was a silent return — W2 F2/E8) in ONE `bulkCreate` (`services/pushDeliveryService.js`; fire-and-forget — a failed insert logs name + pg code and never affects delivery). Schema §5; 90-day `pg_cron` retention like `app_events`; migration `sql/010` (schema-neutral, staging grants). Delivers observability D-C9's deferred `push_deliveries`. | DESIGN_BOARD §3.3 + §7.2; W2 F2/E8; observability D-C9. |
| **D-C16** | **SSE survives deploys cleanly (0.4.0).** `server.js` handles `SIGTERM`/`SIGINT`: `closeAllNotificationStreams()` ends every stream with a plain `res.end()` (never a frame), streams opened afterwards close right after `ready`, `server.close()` + `closeIdleConnections()`, exit 2 s after the server closes, hard exit at 25 s (Render's grace is 30 s); one JSON log line `{"type":"shutdown",…}`. The ping is skipped once the response has ended; cleanup runs on `req` **or** `res` close. Frames, the 25 s ping, `?token=` and `/unacknowledged` are unchanged; `?token=` was already absent from the request log (observability D-C1 logs the route template only) — verified, no change. | DESIGN_BOARD §3.6; W2 F6; Render SIGTERM grace. |
| **D-C17** | **Client adoption of §3.1–§3.3 (0.5.0) — web, iOS 1.5.0 (58), Android 1.1.0 (5)** (approval amendments A4, A5, A12, U2 in [`phase-3-client-amendments.md`](../../initiatives/reliability-overhaul/plans/phase-3-client-amendments.md)). (a) **Stream (A4):** 1 s base, ×2, 30 s cap, full jitter, attempt reset on `ready`; 60 s idle timeout; reconnects paused while offline; ~~`/unacknowledged` re-fetched on every start + `ready`, merged by id — items acknowledged elsewhere dropped, this device's recent acks ignored (web + Android 2 min, iOS 5 min), an invite item refreshes the inbox~~ *(this re-fetch clause is superseded at 0.6.0 by the catch-up, D-C30)*. (b) **Foreground push (A5):** never shown twice — while the stream is connected the in-app modal shows it (Android: no tray post; iOS: `willPresent` → `[.badge]`). ~~(c) **Push tap (U2):** acknowledge; `program.invite_received` opens the invite inbox (iOS: a published flag `ProgramPickerView` consumes to present `ProgramActionsSheet` on its Invites tab; Android: the program picker's actions sheet on My Invites); any other type re-fetches. Supersedes the 0.4.0 §3.2 "opens the target (`type` + `program_id`)".~~ *((c) superseded at 0.6.0 by D-C30 — NP-U2: mark read, then route by `target`.)* (d) **Registry cadence (A12):** `PUT /device` after every sign-in / token rotation / permission re-grant, else at most once per 12 h; unregister once per denial (a memo re-armed on re-grant); the §3.1 serial queue + install-id storage rules as specified. | Phase 3 client plans C1 / C2 / C3 + approval amendments (2026-10-13). |
| **D-C18** | **Per-surface realization (0.5.0; platform idiom only).** *(The web clause is superseded at 0.6.0 by D-C30; the pop-up / invite-flag parts of the iOS and Android clauses by D-C31.)* **Web** (`components/NotificationsGate.tsx`): no native push; foreground = `document.visibilityState`; `EventSource` hides the HTTP status, so after **3 failed opens in a row** one forced session refresh runs (`forceSessionRefresh`, at most once per 5 min — auth D-C16). **iOS** (`App/AppDelegate.swift`, `Shared/Services/{DeviceRegistry,NotificationStreamClient}.swift`, `Shared/Models/ProgramContext+Notifications.swift`): install id = keychain `…ThisDeviceOnly`; the APNs token value is **kept** after sign-out and only the registration memo is forgotten (D-IOS-PUSH-1 — iOS's reading of §3.1: the OS re-issues the same token, the login ride-along re-sends it, and it is safe because the unregister sends the token **and** the install id); a cold-start tap is parked in `PushNotificationTapped.pendingTap` until `AppRootView` handles it; an invite push received in the foreground also refreshes the inbox. **Android** (`push/{DeviceRegistry,RaSiFirebaseMessagingService}.kt`, `App.kt`, `net/NotificationStreamClient.kt`): both channels created at startup (`rasi_invites` high importance for invite / membership types); install id in `noBackupFilesDir/install_id`; registration state + the ask-once flag in `rasi.push` SharedPreferences (excluded from backup, so an unregister-on-revoke survives process death); unregister falls back to the FCM token (2 s wait) so it also matches rows 1.0.0 registered without an install id; the login ride-along is recorded only for the current sign-in; notification permission asked once, after the first sign-in; stream client `readTimeout(60 s)`, `MAX_DELAY_MS = 30_000`. | As-built code (web `211d0a9`, Android `157578f`, iOS 1.5.0 working tree). |
| **D-C19** | **Five categories + ONE type map (0.6.0; DESIGN D-N1/D-N2).** `program`, `activity`, `reminders`, `digest`, `announcements` (§3.4). `utils/notificationCategories.js` maps each type → category + target and holds every per-category delivery setting (Android channel, replace key; APNs thread = the category) and `LEGACY_TYPES`. A new type is added there and nowhere else; an unknown type is `program` / `inbox`. | N-SRV plan steps 4, Q13; contract C2. |
| **D-C20** | **Legacy-feed safety (0.6.0).** Every live binary turns any `/unacknowledged` item or plain-stream frame into a blocking pop-up, so both legacy paths carry only `LEGACY_TYPES` (invite, joined, role changed, admin transferred, left, removed, deleted, `app.broadcast`) in the unchanged 7-field payload; a stream opened with `?inbox=1` gets every type as an inbox item. **`program.updated` is NOT legacy** (a pop-up on every program edit) — old apps get only its push banner. **`app.broadcast` stays legacy**, so announcements still reach old apps (as `/broadcast` does). New types (`activity.kudos_received`, `reminder.daily`, `digest.weekly`) reach live binaries as push banners only. | N-SRV plan Q1/Q2, steps 10 + 17; risks table. |
| **D-C21** | **Preferences + the category filter inside `createNotification` (0.6.0; DESIGN D-N2 (c), D-N7, D-N10).** One `notification_preferences` row per member, no row = the defaults (program / activity / announcements on; reminders + digest **off — opt-in**, App Store 4.5.4; 19:00). `PUT /preferences` is partial; unknown category keys are ignored. `createNotification` (signature unchanged) lower-cases the recipient ids once, reads each recipient's switch for the type's category **inside the caller's transaction**, and: activity / reminders / digest OFF → no row for that member (`null` when nobody is left); program / announcements OFF → still created (inbox) but not pushed. | N-SRV plan steps 8 + 15; contract C2/C4. |
| **D-C22** | **Inbox, read = acknowledged, the badge rule (0.6.0; DESIGN D-N3/D-N4/D-N5).** `GET /inbox` (newest first, keyset cursor `<created_at µs>_<id>`, 30 / max 50, last 90 days), `GET /inbox/unread-count`, `POST /inbox/read` with three body forms — `{ids}` (1–100), `{all:true}`, or `{type:"program.invite_received", program_id}` (an answered invite's items wherever they are; any other body → `400 invalid_body`). No new table: read is `notification_recipients.acknowledged_at`, so reading anywhere clears it everywhere (incl. the old apps' queues). **Badge** = unread − unread invite items − unread `reminder.daily` / `digest.weekly` + pending unexpired invites (exact username, the `/my-invites` rule) — each invite counts once, an ignored nudge never makes it climb (reminders / digest stay in `unread`); one query for many members (also the push badge). | N-SRV plan Q6, steps 9 + 26; implementation (badge exclusion + the third read form). |
| **D-C23** | **`X-Time-Zone` capture + the no-zone rules (0.6.0; DESIGN D-N6).** The header (observability D-C13) is read on the inbox, preferences and announcements routers and `PUT /device` only (not in auth middleware); stored in `notification_preferences.time_zone` as Intl's canonical name (`Asia/Kolkata` → `Asia/Calcutta`) with an upsert guarded by `IS DISTINCT FROM` (written only when it changed); fire-and-forget on request paths, while `GET` / `PUT /preferences` store it first so `time_zone` is current. A member with no zone gets **no** reminder or digest (never a guessed time); a local-time announcement falls back to the sender's zone and needs the sender's header (400 otherwise). | N-SRV plan Q5/Q7, steps 2 + 8. |
| **D-C24** | **Scheduler, send key, reminder, digest, activity stats (0.6.0; DESIGN D-N7/D-N8/D-N9).** §3.6: one in-process 15-min timer (first tick 60 s after listen; reminders → digest → announcements; overlap skipped; **each job capped at 5 min**); `notification_send_keys` claimed before every scheduled send (at most once, F15); candidates opted in + zone known + active + in an active membership of a **non-deleted** program; reminder ≤ 120 min late, workouts only, streak wording at ≥ 2; digest Monday 09:00 local ≤ 120 min late, per ISO week; streak = consecutive local workout days across programs (F14). No kill switch (D4); never Time Sensitive. | N-SRV plan Q3/Q4/Q8/D4, steps 19–21 + 25; implementation (non-deleted program, 5-min cap). |
| **D-C25** | **Send-anytime announcements (0.6.0; DESIGN D-N16).** §3.8: global admins only; type `app.broadcast` (category announcements); audience program / members (≤ 200) / everyone (incl. the sender), snapshotted on the `notification_announcements` audit row; merge fields `{first_name}` / `{streak}` (can render `0`) / `{program_name}` (program targets only) — per-recipient rows only when merge fields are used; now or local (recipient's zone, else the sender's; ≤ 30 days); per-recipient send-key claims; cancel while scheduled / sending (409 `invalid_state` after); preview 30 / min, send 10 / hour per admin (F16). Four 400 texts reworded to plain language at implementation (§3.8). | N-SRV plan Q1/Q12/D3, steps 22–24 + 28; implementation (400 texts). |
| **D-C26** | **Push per category, gated per device (0.6.0; DESIGN D-N14, N-SRV D1/Q10).** Custom keys gain `category` + `target`; APNs `thread-id` = the category, `apns-collapse-id` = `reminders` / `digest` (replace, not stack), and `aps.badge` = the §3.5 badge **only** for installs with `member_push_tokens.supports_inbox`; FCM: one message per token (`sendEach`), `tag` = the replace key, the four category channels only for inbox-capable installs (else today's `rasi_invites` / `rasi_default`) — a channel gives per-category settings but **doesn't stack per category** (FCM has no group key); no notification count (launcher dots). `supports_inbox` is set by `PUT /device` (`inbox: true` → true; an old build → false, so a downgrade turns it off); the login ride-along keeps it. No build-number threshold. A failed badge count only omits the badge. | N-SRV plan D1/Q10, steps 7, 11–13, 16; contract C5. |
| **D-C27** | **Content + channel seam (0.6.0; DESIGN D-N17, board §9).** Every generated notification's title + body comes from `getContentProvider().render(type, vars, seedKey)` (`utils/notificationTemplates.js` — deterministic rotating wordings; the AI report writer later plugs in behind the same contract); delivery goes through `utils/notificationChannels.js` (`inbox` + `push`; email plugs in as one more channel). No AI / email code yet. People's kudos uses this seam (C8, §3.7). | N-SRV plan steps 5 + 14; contract C8; notifications vision (personalized, pipeline). |
| **D-C28** | **90-day retention + a one-time delete (0.6.0; DESIGN D-N11, N-SRV Q9).** `sql/011` deleted every notification older than 90 days once (407 rows on public, 2026-10-13 — the old unread backlog, before the inbox and badge shipped) and schedules `notifications_retention_<schema>` (04:32 UTC) + `notification_send_keys_retention_<schema>` (04:37 UTC). The inbox shows the last 90 days. | `sql/011` PART 6; N-SRV plan step 31. |
| **D-C29** | **New emitter — `activity.kudos_received` (0.6.0, [people](../people/SPEC.md) 0.1.0).** `services/kudosService.js` emits it inside the kudos insert transaction through **C8 only**: title + body from `getContentProvider().render("activity.kudos_received", { first_name, actor_first_name, day_label }, "<recipient>\|<giver>\|<date>")` (the KUDOS variants — not fixed text), then `createNotification({ type, programId, actorMemberId: giver, title, body, recipientIds: [recipient], transaction })`; the day = `localParts(getTimeZones(...) \|\| "UTC")`. Category activity, target inbox: delivered via `GET /inbox`, the `?inbox=1` stream and push (keys incl. `category` / `target`), never on `/unacknowledged` or a plain stream (D-C20); Activity off → not created (`kudos.notification_id` null). Undo deletes it while the recipient's row is unread. `utils/notifications.js` unchanged by People. | people D-C5/D-C6/D-C11; NP amendments S1-3/S1-4, N-1. |
| **D-C30** | **Client rules (§3.9: C7 + NP amendments R1–R5, R7; NP-U2) + the web realization (0.6.0).** All three Phase 4 builds: `X-Time-Zone`; `?inbox=1`; no `/unacknowledged` and no pop-up queue — the **Inbox** (the "+" sheet's `Inbox` tab: invitations first, then notifications) and a **toast** (frontend-kit D-KIT-20); read rule R1; catch-up R2 on every `ready` + foreground (≤ once per 5 s); badge + tab choice R4; a tap / `View` / row marks read then routes by `target` with the R5 guards (NP-U2 — supersedes D-C17(c)); answered invites mark that program's invite items read; copy R7. **Web** (`components/NotificationsGate.tsx` + `components/notifications/{InboxList,NotificationToast}.tsx` + `lib/notifications/{stream,queries,targets}.ts`): the stream URL `…/stream?token=…&inbox=1`; catch-up on start + `ready` (the unread count + inbox always; programs, invites and the stored active program at most once per 5 s; a role / status change re-reads the role-gated queries); on an item: refresh the inbox, run the type's refetches (only `program.*` types trigger the general program refetches; kudos → People), toast if the category is on; **toast** 5 s, top-centre, ×, never over a modal (`.modal-surface` or `[aria-modal='true']`, watched live) — the "+" sheet that hosts the Inbox is one — and never on the page-form routes `/program/profile`, `/program/password`, `/program/edit`, `/members/detail`, `/program/announcements` (cleared when one opens); routing: `program` → open it (stay put when it is already active and a program tab is showing), `programs` → `/programs`, `log_workout` → `/summary/log-workout`, everything else → the Inbox (`/programs?open=inbox`, or the `rf:open-inbox` event when already there); Inbox marks all read once its first fresh page is on screen; account rows `Inbox` (`<n> new` + a count pill), `Notifications`, `Announcements` (global admins); settings `/program/notifications`; composer `/program/announcements` (§3.8 — exact-preview send, a timeout / unknown failure shows `Check Recent announcements before sending again.`, 429 `You've reached the announcement limit. Try again later.`). `NotificationModal.tsx` deleted. Web divergences (platform idiom): no push / permission / app badge / channels; the composer is web-only. Supersedes D-C18's web clause and D-C5's modal queue; F7 / F8 superseded. | NP amendments §1 (NP-U2, NP-U6), §3 R1–R5 + R7, §4 web; web plan W5/W9/W13–W15/W17/W18. |
| **D-C31** | **iOS + Android realization (0.6.0; platform idiom only).** **iOS** (`Features/Home/Inbox/{InboxView,InboxRow}.swift`, `Shared/Views/NotificationToast.swift`, `Shared/Models/ProgramContext+{Inbox,Notifications}.swift`, `Shared/Services/{APIClient+Inbox,APIClient+Notifications,DeviceRegistry,NotificationStreamClient}.swift`, `App/{AppDelegate,AppRootView}.swift`): Inbox hosts — the "+" sheet's tab 0, both account rows, and a **root Inbox sheet** (with `Done` + `.offlineBanner()`) so an open program stays open; mark-all only after a loaded **and visible** visit, later live items marked by id; dots per visit; load-on-scroll. Toast at the top, 5 s, × or swipe up; no toast while an `InboxView` is visible or anything is presented (suppressed, not queued). `openTarget`: `inbox` / `invites` → reload the visible Inbox, else the root Inbox sheet, else the picker opens the "+" sheet; other targets via `inboxRoute` (the picker; skipped while a full-screen cover is up); `log_workout` opens the quick-add workout form over the current screen and returns there. **Permission asked once per install** at the first signed-in start (sign-in or a restored session; `UserDefaults` `push.permissionAsked`) — NP-U3. **App-icon badge** (NP-U4) only for inbox-capable installs: set via `setBadgeCount` from every counts answer, dropping when the Inbox marks all read (to the pending invites), 0 at sign-out. `PUT /device` sends `inbox: true`; the 12-h memo is also keyed by build (`push.registeredBuild`). `foregroundPushReceived` is skipped while the stream is connected. `NotificationModalView` deleted (`NotificationModalView.swift` keeps only `ForcedUpdateModalView`). **Android** (`core/NotificationInbox.kt`, `ui/inbox/{InboxList,InboxScreen,NotificationToast}.kt`, `ui/RootScreen.kt`, `push/{DeviceRegistry,RaSiFirebaseMessagingService}.kt`, `App.kt`, `MainActivity.kt`, `net/InboxDtos.kt`): Inbox hosts — the "+" sheet's Inbox tab and the `inbox` route (root + shell graphs); every load of the newest page while on screen (open, pull, Retry, reconnect) is followed by `{all:true}` (`inboxVisible` set via `DisposableEffect`; the race with an item arriving between the GET and the mark is accepted); a successful mark-all cancels the posted pushes (except the Health Connect one). Toast (D-KIT-20) suppressed while the inbox is visible, a form is open (`ROOT_FORMS` + `SHELL_FORMS` + a non-blank "+" sheet Create draft) or a cover is up (cover counter: Health Connect review, account menu, "+" sheet). Routing: `invites` → the picker's "+" sheet on Inbox; `programs` → the picker (clears the active program if it is the one); `inbox` → the Inbox route; `log_workout` → `inbox/log-workout` (the quick-add workout form over where the member is); `program` → open it, or stay when it is already showing. Catch-up on `ready` + foreground reconciles the open program — a role change replaces it and resets View-as; a program gone (or no longer active) → the picker, then the active program is cleared. **Six channels** created before the container: `rasi_default` (General), `rasi_invites` (Invites & membership, high), `rasi_activity`, `rasi_reminders`, `rasi_digest` (low), `rasi_announcements`; the monochrome `ic_stat_notification` is the FCM default icon and the posted-notification icon (also the health-sync notifier); launcher dots, no count. The `inbox: true` memo is `inbox_registered_token` in `rasi.push`. Permission asked once after the first signed-in start (unchanged). `NotificationModal.kt` deleted. | NP amendments R1–R5, R14, NP-U3, NP-U4; iOS plan TC2/TC4/TC6/TC10/TC11, UA-2/UA-3; Android plan TC-1/TC-6/TC-9/TC-11. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`POST /broadcast` is vestigial** — `global_admin`-only, but **no client** has a broadcast UI (web + iOS sweeps found none). Kept 1:1 for API parity (like members `POST`/`DELETE`). | `notifications.js:86-120`; consumption sweep | Yes — admin tool with no caller; safe to drop later. |
| **F2** | **SSE is single-instance** — `streamsByMember` is an in-process `Map`. With >1 Render instance, a member connected to instance A won't get a `sendNotificationToMember` fired on instance B (the DB row + `GET /unacknowledged` backfill + APNs still cover it). Service runs single-instance today. | `utils/notificationStreams.js:1` | Yes — a Redis/pub-sub fan-out if horizontally scaled. |
| **F3** | **`PUT /device` ignores `device_id` from iOS** — iOS sends `{ push_token }` only (`APIClient+Auth.swift:69`), so `req.body.device_id` is `undefined` and `upsertPushToken` stores `device_id=null`. Harmless; the column is informational. **Superseded 0.4.0 (D-C11):** `device_id` is the install id (UUID-only); still null on every row until the next client builds send it. | `notifications.js:67`; iOS `APIClient+Auth.swift:64-70` | Superseded (D-C11). |
| **F4** | ~~**Push tokens are iOS-only**~~ **RESOLVED (2026-07-08, Android port):** `sendPushToMembers` now dispatches to **both** APNs (`platform:'ios'`) and **FCM** (`platform:'android'`); `upsertPushToken` takes a `platform` param (default `'ios'` — the LIVE iOS binary is unchanged), the Android client registers `platform:"android"`. Web still relies on the live SSE stream while open (no web push). The `platform` column + index already existed (no migration). | `pushNotifications.js` (dual sender); `authService.upsertPushToken`; `MemberPushToken.js:18-22` | Web-push remains out of scope (SSE covers it). |
| **F5** | **Hand-rolled status codes** — these routes predate `utils/response.AppError`; each handler `try/catch`es to a generic `500 { error }`. Inconsistent with the newer features but faithful. | `notifications.js` (every handler) | Kept (faithful). |
| **F7** | ~~**The web modal is a single-notification QUEUE** — `NotificationsGate` holds a `queue`, shows `queue[0]`, and `acknowledge` pops it; multiple pending alerts are shown one-at-a-time oldest-first (`sortByCreatedAt`). Faithful 1:1; not a list/bell UI.~~ | web `NotificationsGate.tsx`; D-C5 | **Superseded 0.6.0 (D-C30)** — the Inbox + toast. |
| **F8** | ~~**Acknowledge is optimistic** — the web gate removes the notification from the queue **before** the `POST /:id/acknowledge` resolves; on failure it re-fetches `unacknowledged` and rebuilds the queue (the alert reappears). Faithful 1:1.~~ | web `NotificationsGate.tsx` `handleAcknowledge`; D-C5 | **Superseded 0.6.0 (D-C30)** — no web acknowledge path. |
| **F6** | **`req.user.id` source differs by route** — `authenticateToken` routes get `id` from the `auth_user_id`→member lookup; the stream's `authenticateStream` rebuilds the **same** `req.user` (post-D-C2), so `memberId = req.user.id` is consistent across both. (Legacy's stream `req.user` was the raw JWT payload `{ id }`.) | `notifications.js:32,145`; D-C2 | Kept (faithful, mechanics migrated). |
| **F9** | **Shutdown can cut an in-flight push** — `server.js` exits 2 s after the HTTP server closes (hard 25 s); a push dispatched by one of the last requests may lose its send or its `push_deliveries` row. The notification row + `/unacknowledged` backfill still deliver it. | `server.js` shutdown | Accepted. |
| **F10** | **`POST /device/unregister` trusts possession** — whoever holds a push token or an install id can unregister that device (by design: sign-out runs when the login is gone, D-C12). Neither value is shown to other members; the effect is "no push until the device's next `PUT /device`". | `services/deviceService.js` | Accepted. |
| **F11** | **`authenticateStream` answers `401` for a JWKS / DB outage** (`middleware/auth.js:113-115`), unlike `authenticateToken`'s `503` (auth D-C11) — web `EventSource` stops for good on a 401. | `middleware/auth.js` | **Resolved** — auth 0.13.0 D-C15c (Phase 3 R1): the stream answers `503 auth_unavailable` for an infrastructure failure. |
| **F12** | **A malformed FCM token is never pruned on send** — FCM v1 reports it as `INVALID_ARGUMENT`, which D-C14 treats as a payload bug; it stays until the 60-day unseen prune or the install's next registration replaces it. | `utils/push/fcm.js` | Accepted. |
| **F13** | **Two installs sharing one install id evict each other** — `registerDevice` deletes the install's rows holding another token, so a copied id (backup restore / device transfer onto a second device) leaves push on whichever device registered last. The server can't distinguish them; the §3.1 storage rule (keychain `…ThisDeviceOnly` / `noBackupFilesDir`) prevents it. | `services/deviceService.js` | Client plans (storage rule). |
| **F14** | **The reminder / digest streak ≠ the app's streak cards** — the template streak is cross-program and resets after a skipped day; `computeStreaks` (member-analytics, People profiles) is per program and never resets (people F1). | `services/memberActivityStats.js` | Known; out of scope. |
| **F15** | **Claim-then-crash skips one send** — the send key is claimed before the send, so a crash (or the shutdown cut) between claim and send skips that member for that day / week / announcement. At most once is preferred over a duplicate. | `services/{dailyReminderJob,weeklyDigestJob,announcementDelivery}.js` | Accepted. |
| **F16** | **Composer limits are per-process memory** (preview 30 / min, send 10 / hour per admin) — a deploy resets them; a second instance would double them. | `routes/announcements.js` | Accepted (single instance, observability F3). |
| **F17** | **Stale "stub" header comments** — `utils/programMemberships.js:4-6` and `services/membershipService.js:9` still describe the emits as calling the deferred `utils/notifications` stub (live since 0.1.0). | those two files | Comment-only fix when those files are next touched. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.6.0 | 2026-10-13 | **Reliability-overhaul Phase 4 — the Notifications server (`6224a61`, live), the People kudos emitter (`d8f8eee`) and the three client builds (web `b2ea09b` live; Android `d528f75` + iOS `198407c` built for the store release).** Server: five categories + one type map (D-C19, §3.4); legacy-feed safety — `/unacknowledged` + plain streams carry legacy types only, `?inbox=1` every type, `program.updated` not legacy (D-C20); preferences + the category filter inside `createNotification` (recipient ids lower-cased; D-C21); the inbox (`GET /inbox`, `/inbox/unread-count`, `POST /inbox/read` with `{ids}` / `{all}` / `{type, program_id}`), read = acknowledged, the badge (invites once, reminders + digest excluded; D-C22, §3.5); `X-Time-Zone` capture, Intl-canonical names, no-zone rules (D-C23); the 15-min scheduler with send keys, 5-min job cap, daily reminder + weekly digest (opt-in; non-deleted programs only; D-C24, §3.6); announcements composer (global admins, preview / send / list / cancel, merge fields incl. `{streak}` = 0, local time, four plain-language 400s; D-C25, §3.8); per-category push gated by `supports_inbox` (thread, replace key, badge, Android category channels that don't stack; D-C26); templates + channels seam (D-C27, §3.7); 90-day retention + the one-time delete of 407 rows (D-C28); `sql/011`. People: the `activity.kudos_received` emitter through C8 (D-C29). Clients: §3.9 rules + R7 copy; Inbox + toast replace the pop-up queue; routing by `target`; catch-up; the web realization incl. settings + composer (D-C30); iOS (root Inbox sheet, permission once, app-icon badge) + Android (six channels, monochrome icon, form guard, open-program reconciliation) (D-C31). Superseded: D-C17(a) re-fetch clause + (c), D-C18's web clause, D-C5's modal queue, F7, F8; §3.2 / §3.3 client paragraphs. Flagged F14–F17. `reference_impl` += 20 backend files + `sql/011`. MINOR (owned interface: new routes, stream capability, device field, push keys, schema); additive for every live binary; dependents (programs 0.3.0 — D-C3; invites 0.3.0; people 0.1.0) documented in the same change. Deploy order: `011` on staging → public, then the backend. |
| 0.5.0 | 2026-10-13 | **Clients adopt §3.1–§3.3 (reliability-overhaul Phase 3 client release — web live, iOS 1.5.0 (58), Android 1.1.0 (5)).** D-C17: SSE reconnect values fixed (1 s ×2, 30 s cap, full jitter, reset on `ready`, 60 s idle, paused offline; `/unacknowledged` on every start + `ready`, acked-elsewhere dropped, recent acks ignored); a foreground push is shown once (A5); push tap → acknowledge, invite → the invite inbox, else re-fetch (U2 — §3.2 amended); `PUT /device` at most every 12 h unless the token / permission changed, unregister once per denial (A12 — §3.1 amended). D-C18: per-surface realization (web 3-failed-opens forced refresh + `visibilityState`; iOS keeps the APNs token value, parks a cold-start tap; Android `rasi_invites` channel, `rasi.push` state, FCM-token unregister fallback, ask-once permission). §8 downstream line corrected (all three clients). No backend change. MINOR (owned client contract amended); dependents unaffected. |
| 0.4.0 | 2026-10-12 | **Reliability overhaul Phase 3 R3 (backend) — device registry, push delivery records, unregister without a login, delivery settings, SSE shutdown.** D-C11 one row per installation (install id = the existing `device_id`, UUID-only, partial unique index, kept by clients in keychain `…ThisDeviceOnly` / `noBackupFilesDir`; `last_seen_at` on every registration, backfilled from `updated_at`; rotation replaces the install's old rows; an omitted platform keeps an existing row's value; DB errors scrubbed to name + pg code) in new `services/deviceService.js` (authService's push-token helpers delegate). D-C12 `POST /device/unregister` — no login, push token and/or install id, always 200, `400 invalid_body`, 30 / 60 s per client; clients serialize it before the next registration. D-C13 APNs expiry 1 h → 7 d; FCM TTL 7 d + explicit channel (`rasi_invites` / `rasi_default`); `type` + `program_id` custom keys. D-C14 FCM `invalid-argument` no longer prunes; APNs 410 compared as a string; 60-day unseen prune (`last_seen_at` and `updated_at`); APNs send timeout 10 s, raced per token; a malformed APNs credential records `failed`/`provider_error` instead of dropping the whole send's records. D-C15 `push_deliveries` (one token query; one row per attempt + `no_device`; 90-day retention). D-C16 SIGTERM → plain close of every SSE stream, drain, hard exit at 25 s. No new error `code`. Hardening: `PUT /device` answers its existing `400 "push_token is required."` for a token > 512 chars (was a `500`; live clients never send one). New: `utils/push/{apns,fcm}.js`, `services/{deviceService,pushDeliveryService}.js`, `models/PushDelivery.js`, `sql/010_push_deliveries_device_registry.sql`. `depends_on` += `observability` (`routes/notifications.js` imports its `utils/rateLimit`). Client contract §3.1–§3.3 for the bundled web / iOS / Android release. Flagged F9–F13. MINOR — additive for every live binary (`PUT`/`DELETE /device` bodies + responses, SSE frames, the 7-field payload and `/unacknowledged` unchanged); dependents (programs, program-memberships, invites) unaffected — `createNotification`'s signature is unchanged. Deploy order: `sql/010` on staging → public, then the backend. |
| 0.3.1 | 2026-07-10 | **iOS device-token registration made self-healing (D-C10).** Fixes TestFlight non-delivery for members whose APNs token was pruned server-side (e.g. after the `APNS_PRODUCTION` sandbox→production flip): `registerForRemoteNotifications()` was previously called from a single site (the `.notDetermined`-only "Enable Notifications" button), so an already-`.authorized` member never re-registered and toggling the OS Settings switch didn't help (iOS doesn't auto-register on that toggle). Added an idempotent re-registration on every foreground while authorized in `AppRootView`'s `scenePhase == .active` handler; the `didRegister` callback re-POSTs the token via the unchanged `registerPushTokenIfNeeded` → `PUT /device`. iOS build bumped 50 → 51 (marketing `1.3.1` unchanged, TestFlight iteration). PATCH — iOS-client robustness fix, **no backend/owned-interface/contract change**; dependents unaffected. Also synced `ENV_RUNBOOK.md` (`APNS_PRODUCTION` now `true` for TestFlight, with the sandbox trade-off noted). |
| 0.3.0 | 2026-07-08 | **Android client ported + FCM push added (D-C9) — `consumed_by` += `android`.** The `android` surface joins the shared consumption (SSE `/stream` via okhttp-sse + Bearer header, `/unacknowledged` backfill, `/:id/acknowledge`, single-notification modal queue), and the backend gains **FCM push** alongside APNs: `utils/pushNotifications.js` now runs a `firebase-admin` sender (`sendEachForMulticast` + invalid-token pruning) that `sendPushToMembers` fires next to APNs; `authService.upsertPushToken` gains a `platform` param (**default `'ios'`** — the LIVE iOS binary, sending none, is byte-for-byte unchanged) threaded from the mobile-login + `PUT /device` routes; the Android client registers `platform:"android"`. Credential = `FIREBASE_SERVICE_ACCOUNT` (base64 service-account JSON) on Render, `sync:false`, graceful-null when unset (the D-C4 APNs-deferral pattern). **No migration** — `member_push_tokens.platform` already existed (default `'ios'`, indexed). F4 resolved (push is now iOS **and** Android; web still SSE-only). MINOR — additive new consumer + backward-compat owned-interface change; dependents (programs/program-memberships/invites) unaffected (they emit through the unchanged `createNotification`). Client detail: `specs/pages/android/notifications-alerts/SPEC.md` (0.2.0). New dep `firebase-admin@^12.7.0`. |
| 0.2.1 | 2026-06-30 | **APNs credentials provisioned — iOS push enabled (D-C8).** Resolves the D-C4 deferral: a fresh token-based APNs Auth Key (`.p8`, Key ID `RA353TA52W`, Team `VSTTF2AM22`, "Sandbox & Production" / Team-scoped) created at Apple + **Push Notifications** capability enabled on App ID `com.app.rasifiters`; the 4 `APNS_*` values entered in the Render Dashboard (`sync:false` — the secret `.p8` base64 stays out of git). `getProvider()` now returns a live provider so `sendPushToMembers` fires; every previously registered iOS token receives retroactively. `APNS_PRODUCTION` set per build type (`false` = Xcode dev/sandbox, `true`/unset = TestFlight/App Store; mismatch → `BadDeviceToken` + token pruned). **Config/docs only — no code change** (the D-C4 port already carried the full push path + graceful-null fallback; the iOS app already had the `aps-environment` entitlement + device-token registration). Also touched: `render.yaml` APNs comment, `ENV_RUNBOOK.md` (APNs rows: new Key ID, dropped `TODO(provision)`), `app-config/SPEC.md` §6 cross-ref index, `CONTEXT.md` (Push line + stale bundle-id fix → `com.app.rasifiters`), `REGISTRY.md`. PATCH — additive decision row + config enablement, no owned-interface/contract change. |
| 0.2.0 | 2026-06-29 | **Web client ported (run 48) — replaced the `apps/web` `NotificationsGate` deferred stub** (the mirror of the keystone backend run). 3 files: `lib/api/notifications.ts` + `components/NotificationModal.tsx` (verbatim — already `rf-*` tokenized) + `components/NotificationsGate.tsx` (the real gate). Faithful 1:1 (D-C5 — `EventSource` SSE w/ `?token=`, `unacknowledged` backfill, single-notification modal queue, `acknowledge`-on-confirm, per-notification React Query invalidation landing on the rebuilt keys) + 2 user-picked reconciles: **D-C6** `isAuthRoute` extended with the net-new `/forgot-password`+`/reset-password` public routes; **D-C7** dropped the stray no-op `["program","roles",programId]` invalidation key (no rebuilt query uses it; broad `["program"]` covers it). **No new deps** (every other import already ported). Flagged F7 (single-notification modal queue) + F8 (optimistic acknowledge). `npm run build` ✓ (39 static pages). MINOR bump — the web client implementation lands + new D/F rows; `consumed_by` already `[web, ios]` (declared at backend-port time). |
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the 6 owned `/api/notifications` routes + the emit engine (`createNotification`) + SSE registry + APNs push. Decisions D-C1 (scope = the module; replaces the deferred stub; cross-feature emits/cascades stay their features' follow-ups) / D-C2 (the one migration delta — SSE stream auth: symmetric `jwt.verify` → Supabase JWKS + `sub`→member, dual token source kept) / D-C4 (defer APNs creds; push no-ops gracefully, SSE+DB live) / D-REF (`consumed_by [web, ios]`; both stream+ack, iOS-only device/APNs, broadcast called by neither) / D-S1 (faithful except D-C2/D-C4; broadcast kept vestigial). Flagged F1–F6. The keystone feature — un-defers every `createNotification` emit across programs/memberships. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`.** **Replaced the deferred stub** `utils/notifications.js` with the real emit engine (`createNotification` DB write + transactional `afterCommit` SSE/APNs dispatch + `getMemberIdsWithPushTokens`) — the programs/memberships emit call sites now fire **unchanged**. Added `utils/notificationStreams.js` (in-memory SSE registry) + `utils/pushNotifications.js` (APNs, `apn@^2.2.0`, graceful-null when unconfigured). `routes/notifications.js` (6 routes) mounted `/api/notifications` in `server.js`. **D-C2:** `authenticateStream` moved into `middleware/auth.js`, sharing a new `resolveReqUser` helper with `authenticateToken` — verifies Supabase JWT via JWKS (header **or** `?token=`), no `jsonwebtoken`. **D-C4:** `APNS_*` declared `sync:false` in `render.yaml`, no creds supplied. `npm install` + syntax + boot check (6-route stack, `authenticateStream` exported, `getProvider()→null`) pass. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
