# Feature: `notifications` — in-app alerts, real-time SSE delivery & APNs push

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/notifications.js`, `utils/notifications.js`,
> `utils/notificationStreams.js` (SSE registry), `utils/pushNotifications.js` (APNs),
> `models/{Notification,NotificationRecipient,MemberPushToken}.js`, `services/authService.js`
> (`upsertPushToken`/`removePushToken` — already ported), `server.js:20,61`.
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` + the Supabase-JWKS verify reused by the
> stream, and the already-ported `upsertPushToken`/`removePushToken`) · [`programs`](../programs/SPEC.md) /
> [`program-memberships`](../program-memberships/SPEC.md) / `invites` (the **emit** call sites — they already
> call `createNotification`; porting this feature **replaces the deferred stub** and lights them up).
> **The keystone.** Porting this **replaces** the deferred stub at `apps/backend/utils/notifications.js`
> (programs D-C1 / program-memberships D-C4) with the real `createNotification` (DB write + SSE dispatch +
> APNs). Every deferred emit across programs/memberships starts firing — **the call sites are unchanged**.
> **One migration delta** (the rest is faithful): **D-C2** the SSE stream auth swaps symmetric
> `jwt.verify(JWT_SECRET)` → **Supabase JWKS verify** (the auth D-C2 pattern), still accepting `?token=`.

---

## 1. What it is

The **alerts layer** of RaSi Fiters — the `notifications` / `notification_recipients` tables, the
**real-time SSE stream** that pushes new alerts to connected clients, and the **APNs push** path that wakes
iOS devices. Legacy ships **6 routes** at `/api/notifications` (`server.js:61`), all owned here:

1. **Read my pending alerts** — `GET /unacknowledged` (the per-member backfill on app load / stream start).
2. **Acknowledge one** — `POST /:id/acknowledge` (mark a recipient row read; dismisses the modal).
3. **Real-time delivery** — `GET /stream` (Server-Sent Events; the one route whose auth **migrates**, D-C2).
4. **Register / unregister a device** — `PUT /device` + `DELETE /device` (iOS APNs token lifecycle; thin
   wrappers over the already-ported `authService.upsertPushToken`/`removePushToken`).
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
| 2 | `PUT /device` | `notifications.js:61-73` | `authenticateToken` | Register a push token → `authService.upsertPushToken(req.user.id, push_token, device_id)`. `400` if `push_token` missing. |
| 3 | `DELETE /device` | `notifications.js:75-84` | `authenticateToken` | Unregister → `authService.removePushToken(req.user.id, push_token?)` (null token = all the member's tokens). |
| 4 | `POST /broadcast` | `notifications.js:86-120` | `authenticateToken` + **`global_admin`** (`403` else) | Admin alert to `recipient_ids` (or **all** members with a push token if omitted). `400` if `title`/`body` missing; `200` "nothing sent" if no recipients; else `201`. **Vestigial** (no client, F1). |
| 5 | `POST /:id/acknowledge` | `notifications.js:122-142` | `authenticateToken` | Set `acknowledged_at=now` on this member's recipient row. `404` if none un-acked. |
| 6 | `GET /stream` | `notifications.js:144-163` | **`authenticateStream`** (D-C2 — Supabase JWKS, token via header **or** `?token=`) | Open an SSE connection; emit `event: ready`, register the stream, ping every 25s, clean up on close. |

### Delivery mechanics (the non-route pieces)

- **`createNotification({ type, programId?, actorMemberId?, title, body, recipientIds, transaction? })`**
  (`utils/notifications.js:38-86`) — the emit engine. Dedupes `recipientIds`; returns `null` if empty; else
  `Notification.create` + `NotificationRecipient.bulkCreate` (one row per recipient, `acknowledged_at=null`);
  builds the payload; **dispatches** = SSE `sendNotificationToMember` to each recipient + `sendPushToMembers`
  (APNs). When called inside a transaction, the dispatch runs on **`transaction.afterCommit`** (so no alert
  fires for a rolled-back write); otherwise immediately.
- **SSE registry** (`utils/notificationStreams.js`) — an in-process `Map<memberId, Set<res>>`;
  `registerNotificationStream` / `removeNotificationStream` / `sendNotificationToMember` (writes
  `event: notification\ndata: <json>\n\n`, evicting a `res` that throws). In-memory → **single-instance**
  (F4).
- **APNs** (`utils/pushNotifications.js`) — lazy `apn.Provider` from `APNS_*` env; `sendPushToMembers` looks
  up `member_push_tokens` (`platform:'ios'`), sends the alert (`note.payload = { notification_id }`), and
  **prunes invalid tokens** (status 410 / `BadDeviceToken` / `Unregistered` / `DeviceTokenNotForTopic`).
  Returns/skips with a warning when unconfigured (D-C4).
- **`getActiveProgramMemberIds(programId, transaction?)`** (`utils/notifications.js:20-27`) — active-member
  recipient query (already ported as the **real** half of the stub); **`getMemberIdsWithPushTokens()`**
  (`:30-36`) — distinct members with a push token (broadcast's default audience).

### Response / payload shapes (faithful)

- **`GET /unacknowledged`** → array of `{ id, type, program_id, actor_member_id, title, body, created_at }`
  (the `Notification` fields; recipient rows whose `Notification` is null are filtered out).
- **SSE `event: notification`** → the same `buildNotificationPayload` object (`:10-18`).
- **`PUT`/`DELETE /device`** → `{ message }`. **`POST /:id/acknowledge`** → `{ message }`.
- **`POST /broadcast`** → `{ message, notification_id, recipient_count }` (201) or `{ message }` (200).

### Error contract (faithful)

Each handler wraps its body in `try/catch` → `500 { error: "Failed to …" }`; explicit `400` (missing
`push_token`/`title`/`body`), `401` (stream: no/invalid token), `403` (broadcast: not `global_admin`),
`404` (acknowledge: no un-acked recipient row). No `utils/response.AppError` here — the routes predate it
and hand-roll status codes (F5).

## 4. Feature list (behaviors to port)

- **`GET /unacknowledged`** (`notifications.js:30-59`) — `NotificationRecipient.findAll({ member_id,
  acknowledged_at:null })` include `Notification` (selected attrs), `ORDER BY Notification.created_at ASC`;
  filter null-Notification rows; project the 7-field shape.
- **`PUT /device`** (`:61-73`) — validate non-empty string `push_token`; `upsertPushToken(req.user.id,
  push_token.trim(), req.body.device_id)`. (iOS sends `{ push_token }` only — `device_id` is `undefined`,
  F3.)
- **`DELETE /device`** (`:75-84`) — `removePushToken(req.user.id, push_token ?? null)`.
- **`POST /broadcast`** (`:86-120`) — `global_admin` gate; validate `title`+`body`; recipients =
  `recipient_ids` filtered, else `getMemberIdsWithPushTokens()`; empty → `200`; else `createNotification({
  type:'app.broadcast', title, body, recipientIds })` → `201`. **Vestigial** (F1).
- **`POST /:id/acknowledge`** (`:122-142`) — `findOne({ notification_id, member_id, acknowledged_at:null })`;
  `404` if none; `update({ acknowledged_at: now })`.
- **`GET /stream`** (`:144-163`) — `authenticateStream` (D-C2); set SSE headers, `flushHeaders`, write
  `event: ready`, `registerNotificationStream(memberId, res)`, 25s ping interval, on `req.close` clear the
  interval + `removeNotificationStream`.
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
- **`member_push_tokens`** (owned — written by `upsert/removePushToken`, read by APNs + broadcast) — `id`,
  `member_id`, `device_token` (unique), `platform` (default `ios`), `device_id?`, timestamps (`:162-172`).
- **`members`** (read — the stream/route `req.user`; the broadcast audience) — owned by
  [`members`](../members/SPEC.md).
- **`program_memberships`** (read — `getActiveProgramMemberIds`) — owned by
  [`program-memberships`](../program-memberships/SPEC.md).

## 6. Flags / env

- **`SUPABASE_URL`** + the JWKS endpoint (already set) — the stream's D-C2 verify reuses `verifySupabaseJwt`
  from `config/supabase.js`; no new auth env.
- **APNs (D-C4 — declared `sync: false`, no creds supplied this run):** `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `APNS_BUNDLE_ID`, and **one of** `APNS_KEY_PATH` or `APNS_KEY` (base64 `.p8`); optional `APNS_PRODUCTION`
  (`true`/`false`; defaults to `NODE_ENV==='production'`). When any required value is absent, `getProvider()`
  returns `null` → `sendPushToMembers` warns + skips. **SSE delivery + DB persistence + unacknowledged
  backfill all work without APNs.**
- New runtime dep: **`apn`** (added to `apps/backend/package.json`). `jsonwebtoken` is **not** re-added — the
  stream uses `verifySupabaseJwt` (D-C2), not symmetric verify.

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
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [web, ios]`.** **Both** clients open the SSE stream (web `EventSource` w/ `?token=`, `NotificationsGate.tsx:144-159`; iOS `NotificationStreamClient.swift:12-29`) + call `GET /unacknowledged` + `POST /:id/acknowledge`, and render a **single-notification modal queue** (web `NotificationModal.tsx`, iOS `NotificationModalView.swift`). **iOS-only:** the APNs device lifecycle (`PUT/DELETE /device`, `APIClient+Auth.swift:64-91`). **Neither client:** `POST /broadcast` (vestigial, F1). No behavioral divergence in the shared paths. | Web + iOS consumption sweep (Explore agents). |
| **D-S1** | **Stance = faithful 1:1 except D-C2 (migrate stream verify) + D-C4 (defer APNs creds).** `POST /broadcast` is **kept** for parity though called by no client (F1); other oddities flagged (§10), not changed. | Whole-module review; §7; user decision. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`POST /broadcast` is vestigial** — `global_admin`-only, but **no client** has a broadcast UI (web + iOS sweeps found none). Kept 1:1 for API parity (like members `POST`/`DELETE`). | `notifications.js:86-120`; consumption sweep | Yes — admin tool with no caller; safe to drop later. |
| **F2** | **SSE is single-instance** — `streamsByMember` is an in-process `Map`. With >1 Render instance, a member connected to instance A won't get a `sendNotificationToMember` fired on instance B (the DB row + `GET /unacknowledged` backfill + APNs still cover it). Service runs single-instance today. | `utils/notificationStreams.js:1` | Yes — a Redis/pub-sub fan-out if horizontally scaled. |
| **F3** | **`PUT /device` ignores `device_id` from iOS** — iOS sends `{ push_token }` only (`APIClient+Auth.swift:69`), so `req.body.device_id` is `undefined` and `upsertPushToken` stores `device_id=null`. Harmless; the column is informational. | `notifications.js:67`; iOS `APIClient+Auth.swift:64-70` | Kept (faithful). |
| **F4** | **Push tokens are iOS-only** — `MemberPushToken.platform` defaults `'ios'` and APNs only queries `platform:'ios'`. No Android/web push path exists (web relies on the live SSE stream while open). | `pushNotifications.js:50-53`; `MemberPushToken.js:18-22` | Kept (faithful) — matches the product (iOS-only native app). |
| **F5** | **Hand-rolled status codes** — these routes predate `utils/response.AppError`; each handler `try/catch`es to a generic `500 { error }`. Inconsistent with the newer features but faithful. | `notifications.js` (every handler) | Kept (faithful). |
| **F6** | **`req.user.id` source differs by route** — `authenticateToken` routes get `id` from the `auth_user_id`→member lookup; the stream's `authenticateStream` rebuilds the **same** `req.user` (post-D-C2), so `memberId = req.user.id` is consistent across both. (Legacy's stream `req.user` was the raw JWT payload `{ id }`.) | `notifications.js:32,145`; D-C2 | Kept (faithful, mechanics migrated). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the 6 owned `/api/notifications` routes + the emit engine (`createNotification`) + SSE registry + APNs push. Decisions D-C1 (scope = the module; replaces the deferred stub; cross-feature emits/cascades stay their features' follow-ups) / D-C2 (the one migration delta — SSE stream auth: symmetric `jwt.verify` → Supabase JWKS + `sub`→member, dual token source kept) / D-C4 (defer APNs creds; push no-ops gracefully, SSE+DB live) / D-REF (`consumed_by [web, ios]`; both stream+ack, iOS-only device/APNs, broadcast called by neither) / D-S1 (faithful except D-C2/D-C4; broadcast kept vestigial). Flagged F1–F6. The keystone feature — un-defers every `createNotification` emit across programs/memberships. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`.** **Replaced the deferred stub** `utils/notifications.js` with the real emit engine (`createNotification` DB write + transactional `afterCommit` SSE/APNs dispatch + `getMemberIdsWithPushTokens`) — the programs/memberships emit call sites now fire **unchanged**. Added `utils/notificationStreams.js` (in-memory SSE registry) + `utils/pushNotifications.js` (APNs, `apn@^2.2.0`, graceful-null when unconfigured). `routes/notifications.js` (6 routes) mounted `/api/notifications` in `server.js`. **D-C2:** `authenticateStream` moved into `middleware/auth.js`, sharing a new `resolveReqUser` helper with `authenticateToken` — verifies Supabase JWT via JWKS (header **or** `?token=`), no `jsonwebtoken`. **D-C4:** `APNS_*` declared `sync:false` in `render.yaml`, no creds supplied. `npm install` + syntax + boot check (6-route stack, `authenticateStream` exported, `getProvider()→null`) pass. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
