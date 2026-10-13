# Feature: `notifications` — in-app alerts, real-time SSE delivery & APNs push

> **Status:** 🚀 deployed (`apps/backend/` + the `apps/web`, `apps/ios`, `apps/android` clients) · **Version:** 0.4.0 · **Apps (`consumed_by`):** `web`, `ios`, `android`
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

---

## 1. What it is

The **alerts layer** of RaSi Fiters — the `notifications` / `notification_recipients` tables, the
**real-time SSE stream** that pushes new alerts to connected clients, and the **APNs push** path that wakes
iOS devices. Legacy ships **6 routes** at `/api/notifications` (`server.js:61`), all owned here, plus one net-new route (0.4.0, item 4):

1. **Read my pending alerts** — `GET /unacknowledged` (the per-member backfill on app load / stream start).
2. **Acknowledge one** — `POST /:id/acknowledge` (mark a recipient row read; dismisses the modal).
3. **Real-time delivery** — `GET /stream` (Server-Sent Events; the one route whose auth **migrates**, D-C2).
4. **Device registry** — `PUT /device` + `DELETE /device` + (0.4.0, net-new) `POST /device/unregister` (no login) —
   the APNs (iOS) + FCM (Android) token lifecycle, one row per installation (`services/deviceService.js`; §3.1,
   D-C11/D-C12).
5. **Admin broadcast** — `POST /broadcast` (`global_admin` only). **Called by neither client** (vestigial,
   kept for parity, flagged §10 / F1).

Plus the **emit engine** — `utils/notifications.js` (`createNotification`, `buildNotificationPayload`,
`getActiveProgramMemberIds`, `getMemberIdsWithPushTokens`), the **in-memory SSE registry**
(`utils/notificationStreams.js`), and the **APNs provider** (`utils/pushNotifications.js`). This module is
imported by programs / program-memberships / invites / auth to fire their event alerts.

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

### Delivery mechanics (the non-route pieces)

- **`createNotification({ type, programId?, actorMemberId?, title, body, recipientIds, transaction? })`**
  (`utils/notifications.js:38-86`) — the emit engine. Dedupes `recipientIds`; returns `null` if empty; else
  `Notification.create` + `NotificationRecipient.bulkCreate` (one row per recipient, `acknowledged_at=null`);
  builds the payload; **dispatches** = SSE `sendNotificationToMember` to each recipient + `sendPushToMembers`
  (APNs + FCM + delivery records, §3.2). When called inside a transaction, the dispatch runs on **`transaction.afterCommit`** (so no alert
  fires for a rolled-back write); otherwise immediately.
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

All under `/api/notifications`. The next web / iOS / Android builds follow this; live binaries keep working unchanged
(they send no `device_id` and never call `/device/unregister`).

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
launch / foreground while signed in with notification permission granted, and on every token rotation (iOS
`didRegisterForRemoteNotificationsWithDeviceToken`, Android `onNewToken`). Repeats are idempotent. The same
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
permission is revoked, sending both fields. One retry on a network error / 5xx, then drop. **Ordering rule:**
unregister and registration go through ONE serial queue per install. A sign-in's login ride-along / `PUT /device`
starts only after any in-flight unregister has finished (success, or failure after its single retry), and a pending
retry is dropped the moment a sign-in begins. Never send an unregister after the next registration has started — it
would delete the new session's row (same token, same install id). Afterwards forget the cached push token and any
"already registered" memo (e.g. Android's in-memory dedupe), so the next sign-in registers again; keep the install id.
(Account deletion needs no call — the member's rows cascade.)

**Pruning.** A row is deleted when APNs answers `410` / `BadDeviceToken` / `Unregistered` / `DeviceTokenNotForTopic`,
when FCM answers `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, and nightly
when `last_seen_at` **and** `updated_at` are both older than 60 days (they move together; the second clause keeps a
rolled-back backend from pruning active installs). A pruned install comes back with its next `PUT /device`.

### 3.2 Push delivery (0.4.0, D-C13–D-C15)

| | APNs (iOS) | FCM (Android) |
|---|---|---|
| Visible alert | `aps.alert { title, body }`, `aps.sound "default"` | `notification { title, body }` |
| Custom keys | top-level `notification_id`, `type`, `program_id` | `data { notification_id, type, program_id }` |
| Lifetime | `apns-expiration` = send time + **604800 s (7 days)** (was 1 h) | `android.ttl` = **604800 s** (was unset = FCM's 4-week default) |
| Priority | APNs default (10) | `android.priority "high"` (every message shows a notification) |
| Channel | — | `android.notification.channel_id` (below) |

Custom keys are strings; `program_id` is omitted when the notification has none. Live binaries read only
`notification_id`; `type` + `program_id` are additive, for tap routing.

| Android channel id | Name | Importance | Notification types |
|---|---|---|---|
| `rasi_invites` | Invites & membership | `IMPORTANCE_HIGH` | `program.invite_received`, `program.role_changed`, `program.admin_transferred`, `program.member_removed` |
| `rasi_default` | (existing) | `IMPORTANCE_DEFAULT` | every other type (`program.member_joined`, `program.member_left`, `program.updated`, `program.deleted`, `app.broadcast`, any future type) |

The next Android build creates both channels at startup and keeps `rasi_default` as the manifest default
(`com.google.firebase.messaging.default_notification_channel_id`). Android 1.0.0 has only `rasi_default`; FCM shows a
message whose channel id doesn't exist on the device in the manifest default channel, so its invites keep arriving
there. **Clients (next builds):** a tap reads `notification_id` → `POST /:id/acknowledge` and opens the target
(`type` + `program_id`); Android shows foreground messages. Push is only a hint — state is always re-fetched.

**Delivery record:** every attempt is a `push_deliveries` row (§5) — `sent`; `failed` (token kept; `error_code` = the
APNs reason / FCM code / `timeout` / `send_error` / `provider_error` — APNs credentials present but malformed, so the
provider could not be built); `pruned` (dead token, row removed); `not_configured` (provider credentials unset); plus
one `no_device` row per recipient with no registered token.

### 3.3 Real-time stream — client contract (0.4.0, D-C16)

`GET /api/notifications/stream` — `Authorization: Bearer <token>` (iOS / Android) **or** `?token=<token>` (web
`EventSource`, which can't set headers — kept; the request log records only the route template, never the URL, so the
token is never logged).

| Frame | When |
|---|---|
| `event: ready` + `data: {}` | once, right after the stream opens |
| `event: ping` + `data: {}` | every 25 s (keepalive) |
| `event: notification` + `data: <the 7-field payload>` | each new notification for this member |

No other event type is ever added — iOS 1.4.x decodes any non-`{}` `data:` frame as a notification. On a deploy or
restart (`SIGTERM`) the server ends every stream with a **plain close** — no frame; a stream opened while the instance
is shutting down gets `ready` and then the close. `401 { "error": … }` on open = missing / bad / expired token; a JWKS / DB outage answers
`503 auth_unavailable` + `Retry-After` (auth 0.13.0 D-C15c — F11 resolved).

**Clients (next builds):** keep the stream open only in the foreground; treat every close or error as "reconnect": get
a fresh access token first (refresh when it expires within 60 s), reconnect with exponential backoff + full jitter
(values fixed by the client plans), and **after every `ready`** re-fetch `GET /unacknowledged` and merge by `id` (the
stream never replays). Web re-creates its `EventSource` with a fresh `?token=` on every token refresh.
`GET /unacknowledged` is idempotent, per member, oldest-first and unthrottled — safe to call on every (re)connect.

## 4. Feature list (behaviors to port)

- **`GET /unacknowledged`** (`notifications.js:30-59`) — `NotificationRecipient.findAll({ member_id,
  acknowledged_at:null })` include `Notification` (selected attrs), `ORDER BY Notification.created_at ASC`;
  filter null-Notification rows; project the 7-field shape.
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
- **`program_memberships`** (read — `getActiveProgramMemberIds`) — owned by
  [`program-memberships`](../program-memberships/SPEC.md).

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
  `EventSource` can't set headers (web `NotificationsGate.tsx:144` passes `?token=`); iOS
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
- **Downstream (the unblock):** [`programs`](../programs/SPEC.md),
  [`program-memberships`](../program-memberships/SPEC.md), and the future `invites` + the deferred
  members/auth delete cascades all **emit** through `createNotification` — replacing the stub here makes their
  alerts fire. Both clients (`web`, `ios`) consume the stream + unacknowledged + acknowledge; iOS also drives
  the device-token + APNs path.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the `notifications` module only** — the 6 `/api/notifications` routes + `utils/{notifications,notificationStreams,pushNotifications}` + the 3 models (already in `models/index`). Porting it **replaces** the deferred stub `apps/backend/utils/notifications.js`; the cross-feature emit call sites (programs/memberships/invites) and the deferred members/auth delete cascades stay **their** features' follow-ups (the emits just start working). | `routes/notifications.js`; `server.js:61`; programs D-C1 / program-memberships D-C4; user decision. |
| **D-C2** | **The SSE stream auth migrates** symmetric `jwt.verify(JWT_SECRET)` → **`verifySupabaseJwt` (JWKS) + `sub`→`members.auth_user_id`**, rebuilding the legacy `req.user`, while **keeping the dual token source** (header or `?token=` for `EventSource`). Same behavior, migrated verifier — the stream analog of auth D-C2. | `notifications.js:11-28` (legacy symmetric verify); `apps/backend/middleware/auth.js` (`authenticateToken`); web `NotificationsGate.tsx:144`; user decision. |
| **D-C4** | **APNs credentials deferred** — port `pushNotifications.js` faithfully (+ the `apn` dep), declare `APNS_*` as `sync:false` in `render.yaml`, supply **no creds** this run. `getProvider()→null` ⇒ push is a logged no-op; SSE + DB delivery fully live; tokens still persist for retroactive push. | `pushNotifications.js:6-33` (graceful-null); `render.yaml`; user decision. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios]`.** **Both** clients open the SSE stream (web `EventSource` w/ `?token=`, `NotificationsGate.tsx:144-159`; iOS `NotificationStreamClient.swift:12-29`) + call `GET /unacknowledged` + `POST /:id/acknowledge`, and render a **single-notification modal queue** (web `NotificationModal.tsx`, iOS `NotificationModalView.swift`). **iOS-only:** the APNs device lifecycle (`PUT/DELETE /device`, `APIClient+Auth.swift:64-91`). **Neither client:** `POST /broadcast` (vestigial, F1). No behavioral divergence in the shared paths. **Superseded in part:** Android joined with FCM in D-C9; the device-lifecycle contract is D-C11/D-C12 (0.4.0). | Web + iOS consumption sweep (Explore agents). |
| **D-S1** | **Stance = faithful 1:1 except D-C2 (migrate stream verify) + D-C4 (defer APNs creds).** `POST /broadcast` is **kept** for parity though called by no client (F1); other oddities flagged (§10), not changed. | Whole-module review; §7; user decision. |
| **D-C5** | **Web client ported (2026-06-29) — replaces the `NotificationsGate` deferred stub.** Three files land in `apps/web`: `lib/api/notifications.ts` (verbatim — `fetchUnacknowledgedNotifications`/`acknowledgeNotification` over `apiRequest`), `components/NotificationModal.tsx` (verbatim — already `rf-*` tokenized), and `components/NotificationsGate.tsx` (the real gate replacing the `return null` stub). Every other dep was already ported (`fetchPrograms`, `lib/storage`, `broadcastActiveProgramUpdate`, `API_BASE_URL`, `useAuth`) → **no new dependency** beyond the 3 ported files. Faithful otherwise: `EventSource` SSE client w/ `?token=`, `unacknowledged` backfill, single-notification modal queue, `acknowledge`-on-confirm, the per-notification React Query invalidation (which lands on the rebuilt query keys, verified). | `apps/web/src/components/NotificationsGate.tsx` (was the stub); legacy `rasifiters-webapp/src/components/NotificationsGate.tsx`; user decision. |
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

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`POST /broadcast` is vestigial** — `global_admin`-only, but **no client** has a broadcast UI (web + iOS sweeps found none). Kept 1:1 for API parity (like members `POST`/`DELETE`). | `notifications.js:86-120`; consumption sweep | Yes — admin tool with no caller; safe to drop later. |
| **F2** | **SSE is single-instance** — `streamsByMember` is an in-process `Map`. With >1 Render instance, a member connected to instance A won't get a `sendNotificationToMember` fired on instance B (the DB row + `GET /unacknowledged` backfill + APNs still cover it). Service runs single-instance today. | `utils/notificationStreams.js:1` | Yes — a Redis/pub-sub fan-out if horizontally scaled. |
| **F3** | **`PUT /device` ignores `device_id` from iOS** — iOS sends `{ push_token }` only (`APIClient+Auth.swift:69`), so `req.body.device_id` is `undefined` and `upsertPushToken` stores `device_id=null`. Harmless; the column is informational. **Superseded 0.4.0 (D-C11):** `device_id` is the install id (UUID-only); still null on every row until the next client builds send it. | `notifications.js:67`; iOS `APIClient+Auth.swift:64-70` | Superseded (D-C11). |
| **F4** | ~~**Push tokens are iOS-only**~~ **RESOLVED (2026-07-08, Android port):** `sendPushToMembers` now dispatches to **both** APNs (`platform:'ios'`) and **FCM** (`platform:'android'`); `upsertPushToken` takes a `platform` param (default `'ios'` — the LIVE iOS binary is unchanged), the Android client registers `platform:"android"`. Web still relies on the live SSE stream while open (no web push). The `platform` column + index already existed (no migration). | `pushNotifications.js` (dual sender); `authService.upsertPushToken`; `MemberPushToken.js:18-22` | Web-push remains out of scope (SSE covers it). |
| **F5** | **Hand-rolled status codes** — these routes predate `utils/response.AppError`; each handler `try/catch`es to a generic `500 { error }`. Inconsistent with the newer features but faithful. | `notifications.js` (every handler) | Kept (faithful). |
| **F7** | **The web modal is a single-notification QUEUE** — `NotificationsGate` holds a `queue`, shows `queue[0]`, and `acknowledge` pops it; multiple pending alerts are shown one-at-a-time oldest-first (`sortByCreatedAt`). Faithful 1:1; not a list/bell UI. | web `NotificationsGate.tsx`; D-C5 | Kept (faithful). |
| **F8** | **Acknowledge is optimistic** — the web gate removes the notification from the queue **before** the `POST /:id/acknowledge` resolves; on failure it re-fetches `unacknowledged` and rebuilds the queue (the alert reappears). Faithful 1:1. | web `NotificationsGate.tsx` `handleAcknowledge`; D-C5 | Kept (faithful). |
| **F6** | **`req.user.id` source differs by route** — `authenticateToken` routes get `id` from the `auth_user_id`→member lookup; the stream's `authenticateStream` rebuilds the **same** `req.user` (post-D-C2), so `memberId = req.user.id` is consistent across both. (Legacy's stream `req.user` was the raw JWT payload `{ id }`.) | `notifications.js:32,145`; D-C2 | Kept (faithful, mechanics migrated). |
| **F9** | **Shutdown can cut an in-flight push** — `server.js` exits 2 s after the HTTP server closes (hard 25 s); a push dispatched by one of the last requests may lose its send or its `push_deliveries` row. The notification row + `/unacknowledged` backfill still deliver it. | `server.js` shutdown | Accepted. |
| **F10** | **`POST /device/unregister` trusts possession** — whoever holds a push token or an install id can unregister that device (by design: sign-out runs when the login is gone, D-C12). Neither value is shown to other members; the effect is "no push until the device's next `PUT /device`". | `services/deviceService.js` | Accepted. |
| **F11** | **`authenticateStream` answers `401` for a JWKS / DB outage** (`middleware/auth.js:113-115`), unlike `authenticateToken`'s `503` (auth D-C11) — web `EventSource` stops for good on a 401. | `middleware/auth.js` | **Resolved** — auth 0.13.0 D-C15c (Phase 3 R1): the stream answers `503 auth_unavailable` for an infrastructure failure. |
| **F12** | **A malformed FCM token is never pruned on send** — FCM v1 reports it as `INVALID_ARGUMENT`, which D-C14 treats as a payload bug; it stays until the 60-day unseen prune or the install's next registration replaces it. | `utils/push/fcm.js` | Accepted. |
| **F13** | **Two installs sharing one install id evict each other** — `registerDevice` deletes the install's rows holding another token, so a copied id (backup restore / device transfer onto a second device) leaves push on whichever device registered last. The server can't distinguish them; the §3.1 storage rule (keychain `…ThisDeviceOnly` / `noBackupFilesDir`) prevents it. | `services/deviceService.js` | Client plans (storage rule). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.4.0 | 2026-10-12 | **Reliability overhaul Phase 3 R3 (backend) — device registry, push delivery records, unregister without a login, delivery settings, SSE shutdown.** D-C11 one row per installation (install id = the existing `device_id`, UUID-only, partial unique index, kept by clients in keychain `…ThisDeviceOnly` / `noBackupFilesDir`; `last_seen_at` on every registration, backfilled from `updated_at`; rotation replaces the install's old rows; an omitted platform keeps an existing row's value; DB errors scrubbed to name + pg code) in new `services/deviceService.js` (authService's push-token helpers delegate). D-C12 `POST /device/unregister` — no login, push token and/or install id, always 200, `400 invalid_body`, 30 / 60 s per client; clients serialize it before the next registration. D-C13 APNs expiry 1 h → 7 d; FCM TTL 7 d + explicit channel (`rasi_invites` / `rasi_default`); `type` + `program_id` custom keys. D-C14 FCM `invalid-argument` no longer prunes; APNs 410 compared as a string; 60-day unseen prune (`last_seen_at` and `updated_at`); APNs send timeout 10 s, raced per token; a malformed APNs credential records `failed`/`provider_error` instead of dropping the whole send's records. D-C15 `push_deliveries` (one token query; one row per attempt + `no_device`; 90-day retention). D-C16 SIGTERM → plain close of every SSE stream, drain, hard exit at 25 s. No new error `code`. Hardening: `PUT /device` answers its existing `400 "push_token is required."` for a token > 512 chars (was a `500`; live clients never send one). New: `utils/push/{apns,fcm}.js`, `services/{deviceService,pushDeliveryService}.js`, `models/PushDelivery.js`, `sql/010_push_deliveries_device_registry.sql`. `depends_on` += `observability` (`routes/notifications.js` imports its `utils/rateLimit`). Client contract §3.1–§3.3 for the bundled web / iOS / Android release. Flagged F9–F13. MINOR — additive for every live binary (`PUT`/`DELETE /device` bodies + responses, SSE frames, the 7-field payload and `/unacknowledged` unchanged); dependents (programs, program-memberships, invites) unaffected — `createNotification`'s signature is unchanged. Deploy order: `sql/010` on staging → public, then the backend. |
| 0.3.1 | 2026-07-10 | **iOS device-token registration made self-healing (D-C10).** Fixes TestFlight non-delivery for members whose APNs token was pruned server-side (e.g. after the `APNS_PRODUCTION` sandbox→production flip): `registerForRemoteNotifications()` was previously called from a single site (the `.notDetermined`-only "Enable Notifications" button), so an already-`.authorized` member never re-registered and toggling the OS Settings switch didn't help (iOS doesn't auto-register on that toggle). Added an idempotent re-registration on every foreground while authorized in `AppRootView`'s `scenePhase == .active` handler; the `didRegister` callback re-POSTs the token via the unchanged `registerPushTokenIfNeeded` → `PUT /device`. iOS build bumped 50 → 51 (marketing `1.3.1` unchanged, TestFlight iteration). PATCH — iOS-client robustness fix, **no backend/owned-interface/contract change**; dependents unaffected. Also synced `ENV_RUNBOOK.md` (`APNS_PRODUCTION` now `true` for TestFlight, with the sandbox trade-off noted). |
| 0.3.0 | 2026-07-08 | **Android client ported + FCM push added (D-C9) — `consumed_by` += `android`.** The `android` surface joins the shared consumption (SSE `/stream` via okhttp-sse + Bearer header, `/unacknowledged` backfill, `/:id/acknowledge`, single-notification modal queue), and the backend gains **FCM push** alongside APNs: `utils/pushNotifications.js` now runs a `firebase-admin` sender (`sendEachForMulticast` + invalid-token pruning) that `sendPushToMembers` fires next to APNs; `authService.upsertPushToken` gains a `platform` param (**default `'ios'`** — the LIVE iOS binary, sending none, is byte-for-byte unchanged) threaded from the mobile-login + `PUT /device` routes; the Android client registers `platform:"android"`. Credential = `FIREBASE_SERVICE_ACCOUNT` (base64 service-account JSON) on Render, `sync:false`, graceful-null when unset (the D-C4 APNs-deferral pattern). **No migration** — `member_push_tokens.platform` already existed (default `'ios'`, indexed). F4 resolved (push is now iOS **and** Android; web still SSE-only). MINOR — additive new consumer + backward-compat owned-interface change; dependents (programs/program-memberships/invites) unaffected (they emit through the unchanged `createNotification`). Client detail: `specs/pages/android/notifications-alerts/SPEC.md` (0.2.0). New dep `firebase-admin@^12.7.0`. |
| 0.2.1 | 2026-06-30 | **APNs credentials provisioned — iOS push enabled (D-C8).** Resolves the D-C4 deferral: a fresh token-based APNs Auth Key (`.p8`, Key ID `RA353TA52W`, Team `VSTTF2AM22`, "Sandbox & Production" / Team-scoped) created at Apple + **Push Notifications** capability enabled on App ID `com.app.rasifiters`; the 4 `APNS_*` values entered in the Render Dashboard (`sync:false` — the secret `.p8` base64 stays out of git). `getProvider()` now returns a live provider so `sendPushToMembers` fires; every previously registered iOS token receives retroactively. `APNS_PRODUCTION` set per build type (`false` = Xcode dev/sandbox, `true`/unset = TestFlight/App Store; mismatch → `BadDeviceToken` + token pruned). **Config/docs only — no code change** (the D-C4 port already carried the full push path + graceful-null fallback; the iOS app already had the `aps-environment` entitlement + device-token registration). Also touched: `render.yaml` APNs comment, `ENV_RUNBOOK.md` (APNs rows: new Key ID, dropped `TODO(provision)`), `app-config/SPEC.md` §6 cross-ref index, `CONTEXT.md` (Push line + stale bundle-id fix → `com.app.rasifiters`), `REGISTRY.md`. PATCH — additive decision row + config enablement, no owned-interface/contract change. |
| 0.2.0 | 2026-06-29 | **Web client ported (run 48) — replaced the `apps/web` `NotificationsGate` deferred stub** (the mirror of the keystone backend run). 3 files: `lib/api/notifications.ts` + `components/NotificationModal.tsx` (verbatim — already `rf-*` tokenized) + `components/NotificationsGate.tsx` (the real gate). Faithful 1:1 (D-C5 — `EventSource` SSE w/ `?token=`, `unacknowledged` backfill, single-notification modal queue, `acknowledge`-on-confirm, per-notification React Query invalidation landing on the rebuilt keys) + 2 user-picked reconciles: **D-C6** `isAuthRoute` extended with the net-new `/forgot-password`+`/reset-password` public routes; **D-C7** dropped the stray no-op `["program","roles",programId]` invalidation key (no rebuilt query uses it; broad `["program"]` covers it). **No new deps** (every other import already ported). Flagged F7 (single-notification modal queue) + F8 (optimistic acknowledge). `npm run build` ✓ (39 static pages). MINOR bump — the web client implementation lands + new D/F rows; `consumed_by` already `[web, ios]` (declared at backend-port time). |
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the 6 owned `/api/notifications` routes + the emit engine (`createNotification`) + SSE registry + APNs push. Decisions D-C1 (scope = the module; replaces the deferred stub; cross-feature emits/cascades stay their features' follow-ups) / D-C2 (the one migration delta — SSE stream auth: symmetric `jwt.verify` → Supabase JWKS + `sub`→member, dual token source kept) / D-C4 (defer APNs creds; push no-ops gracefully, SSE+DB live) / D-REF (`consumed_by [web, ios]`; both stream+ack, iOS-only device/APNs, broadcast called by neither) / D-S1 (faithful except D-C2/D-C4; broadcast kept vestigial). Flagged F1–F6. The keystone feature — un-defers every `createNotification` emit across programs/memberships. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`.** **Replaced the deferred stub** `utils/notifications.js` with the real emit engine (`createNotification` DB write + transactional `afterCommit` SSE/APNs dispatch + `getMemberIdsWithPushTokens`) — the programs/memberships emit call sites now fire **unchanged**. Added `utils/notificationStreams.js` (in-memory SSE registry) + `utils/pushNotifications.js` (APNs, `apn@^2.2.0`, graceful-null when unconfigured). `routes/notifications.js` (6 routes) mounted `/api/notifications` in `server.js`. **D-C2:** `authenticateStream` moved into `middleware/auth.js`, sharing a new `resolveReqUser` helper with `authenticateToken` — verifies Supabase JWT via JWKS (header **or** `?token=`), no `jsonwebtoken`. **D-C4:** `APNS_*` declared `sync:false` in `render.yaml`, no creds supplied. `npm install` + syntax + boot check (6-route stack, `authenticateStream` exported, `getProvider()→null`) pass. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
