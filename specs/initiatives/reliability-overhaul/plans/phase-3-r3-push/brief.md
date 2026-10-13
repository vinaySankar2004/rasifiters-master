# Phase 3 track R3 — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Reliability overhaul Phase 3, track R3 backend (invite transaction, push_deliveries, device registry, unauthenticated unregister, APNs/FCM delivery settings, SSE shutdown)

- **Features**:
  - notifications@0.3.1 (SPEC: specs/features/notifications/SPEC.md) · consumed_by [web, ios, android]. Owns SSE, device registry/push and the new `push_deliveries` table. The registry has no separate "devices/push" or "SSE" feature.
  - invites@0.1.0 (SPEC: specs/features/invites/SPEC.md) · consumed_by [web, ios].
  - observability@0.1.1 (SPEC: specs/features/observability/SPEC.md) · consumed_by []. Reused only: `rateLimit`, request log, the retention pattern from 007. Its D-C9 defers `push_deliveries` to R3.
  - frontend-kit@0.1.0. Provides the error vocabulary for the `code` values only.
- **Pages/screens**: none for this backend track. Later client consumers, planned separately:
  - web: programs, members/invite
  - ios: program-picker, program-actions, notifications
  - android: program-picker, member-management, notifications, notifications-alerts
- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/inviteService.js
    - Make `sendInvite` (16-85) one managed transaction: supersede the expired invite (60), create the invite (64), then `createNotification({..., transaction})` so dispatch runs afterCommit.
    - The privacy no-ops (30, 40, 46, 52, 59) return a reason the route can log.
    - `getMyInvites` (87-108) adds `expires_at IS NULL OR expires_at > now()`.
    - The file is already 334 lines, so move `sendInvite` into the new file below.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/inviteSendService.js (NEW) — the `sendInvite` split, keeping both files at about 200 lines.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/invites.js — POST /invite (14-22):
    - non-AppError → `500 {error, code:"server"}` instead of 200. Log only the error name and pg code (observability F8).
    - Postgres 23505 on `uniq_program_invites_program_username_pending` (001_schema.sql:277) is a concurrent duplicate, so it stays the privacy-safe 200.
    - Log the no-op reason without the username.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/notifications.js — dispatch (74-81) passes `type` (and the recipients) to `sendPushToMembers`, for channel choice and delivery rows.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/pushNotifications.js (198 lines; stays the facade exporting `sendPushToMembers`, `getProvider`, `getFcmApp`):
    - One token query for both platforms. Members with zero tokens get a `no_device` outcome (today they return silently at 54 and 134).
    - APNs `note.expiry` 3600 → 7 days (58).
    - FCM `android.notification.channel_id` + `android.ttl` (144).
    - Drop `messaging/invalid-argument` from pruning (167): log it, never prune.
    - Explicit timeout around `apnProvider.send`: apn 2.2.0 has none. firebase-admin already has a 15 s built-in (`FIREBASE_MESSAGING_TIMEOUT`).
    - Bulk-insert the delivery rows.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/push/apns.js + /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/push/fcm.js (NEW, optional) — split targets if the facade goes past about 200 lines.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/PushDelivery.js (NEW) — `require`d directly like `models/AppEvent.js`. NOT added to models/index.js.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/pushDeliveryService.js (NEW) — one `bulkCreate` per send; catches its own errors (fire-and-forget path).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/MemberPushToken.js — add `last_seen_at` (plus an install-id column only if a new column is chosen; see Q1).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/deviceService.js (NEW) — device registry logic:
    - upsert sets `last_seen_at = now`
    - one row per install id: token rotation replaces that install's old row
    - an omitted `platform` defaults to `ios` for NEW rows only
    - unregister by member (today's DELETE semantics)
    - unregister by push token without a login
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/notifications.js (148 lines):
    - PUT /device (44-56) goes through deviceService; its response is unchanged.
    - New unauthenticated unregister route, with `rateLimit` from /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/rateLimit.js (import only).
    - `/stream` (127-146) keeps `ready`, the 25 s `event: ping` keepalive and the frames. It now also clears its ping on shutdown.
    - DELETE /device, /unacknowledged, /acknowledge and /broadcast are untouched.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/notificationDevices.js (NEW, optional) — device routes split out and mounted with `router.use` inside notifications.js, so server.js needs no new mount.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/notificationStreams.js — add `closeAllNotificationStreams()`: `res.end()` on every stream, never writing a frame.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js (SHARED) — append-only:
    - keep the handle from `app.listen` (130)
    - on SIGTERM: close all streams → `server.close` → exit, with a hard-exit timer under Render's 30 s grace
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js (SHARED with R1) — minimal edit to `upsertPushToken`/`removePushToken` (91-125) so they delegate to deviceService. Exports and the login callers (153, 483) stay unchanged.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/010_push_deliveries_device_registry.sql (NEW) — the migration; see DB surface.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md (SHARED) — append the 010 row and update the staging table count in the verify query (15 → 16).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md (SHARED) — append `push_deliveries` and the registry columns to the "Added" line (24).
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/notifications/SPEC.md — write the exact client contract. Bump to 0.4.0 with D-rules and a changelog. Contents:
    - PUT /device body: `push_token`, `platform`, install id
    - the unauthenticated unregister: path, body, status codes (`200` always, `400`, `429 rate_limited` + `Retry-After`)
    - FCM channel ids and TTL; APNs expiry
    - push payload keys
    - SSE: the shutdown close, keepalive, and that clients re-fetch `/unacknowledged` on every reconnect
    - the `push_deliveries` schema and outcomes; the 60-day prune
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/invites/SPEC.md — bump to 0.2.0. Rewrite §3 and F1: the privacy-safe 200 stays only for the no-op reasons; non-AppError → 500 + `code`. Document the transaction and the expired filter. The Android adoption contract is that `/my-invites` + `/invite-response` are unchanged.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json + /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md (SHARED) — row-local edits: versions, `reference_impl` paths for the new files, invites `consumed_by` (Q7).
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md — optional PATCH note: D-C9's `push_deliveries` is now delivered in notifications 0.4.0.
  - web/ — none · ios/ — none · android/ — none (separate bundled client plans).
- **DB surface**: migration `apps/backend/sql/010_*.sql`, schema-neutral, run staging first then public. Contents:
  - `member_push_tokens`:
    - ADD `last_seen_at timestamptz`
    - backfill `last_seen_at = updated_at WHERE last_seen_at IS NULL`, THEN set DEFAULT now() and NOT NULL. A DEFAULT added at the same time as the column would stamp every old row with "now".
    - an index on `last_seen_at`
    - (an install-id column and partial unique index only if Q1 picks a new column)
  - `push_deliveries` columns:
    - uuid PK
    - `notification_id` FK → notifications
    - `member_id` FK → members ON DELETE CASCADE
    - device/token id with no FK or SET NULL, because tokens get pruned
    - `platform`
    - `outcome`: CHECK allow-list including `no_device`
    - `error_code` varchar
    - `created_at`
    - indexes on `created_at` and `(member_id, created_at)`
  - RLS: enabled only when `current_schema()='public'` (007 pattern).
  - Staging: an explicit `GRANT … TO rasifiters_staging` when the schema is `staging`, plus the RLS-off loop from 008 §5.
  - Two `pg_cron` jobs named per schema: `push_deliveries` older than 90 days, and `member_push_tokens` with `last_seen_at` older than 60 days. pg_cron is already enabled by 007.
  - A read-only verification query block.
  - Read-only pre-flight queries for the plan: duplicate non-null `device_id` (expect 0; E5 says 35/35 null), and how many token rows the first 60-day prune would delete, by platform.
- **Flags/env/config involved**:
  - No new env vars. Existing: `APNS_*`, `APNS_PRODUCTION` (prod `true`, staging `false`), `FIREBASE_SERVICE_ACCOUNT` (same Firebase project on staging).
  - Constants to fix in the SPEC: APNs expiry 604800 s, FCM TTL, FCM channel ids, the unregister rate limit, the shutdown hard-exit ms.
  - No Supabase setting, Render-env or console changes. The user runs only 010, on staging then public, and the staging deploy (`git push origin main:staging`).
- **Blast radius**:
  - Dependents of notifications: programs, program-memberships, invites. They emit through `createNotification`, whose signature stays unchanged.
  - Dependents of invites: program-memberships (its exit cascade writes `program_invites`; untouched).
  - Surfaces to keep in parity later: web, ios, android.
  - Cross-track risks:
    - server.js: R2 adds a mount; R3 only appends the SIGTERM block.
    - services/authService.js: R1 rewrites it heavily; R3 touches only 91-125.
    - registry.json, REGISTRY.md, sql/README.md, backend CONTEXT.md: every track edits them; row-local or append-only.
    - models/index.js, middleware/auth.js, errorHandler.js: R3 does NOT touch them.
- **Live-binary compat**: the backend contract changes additively, so the backend deploys FIRST. Things that must hold:
  - PUT /device without `platform` → `ios`; response `{message}` unchanged.
  - DELETE /device unchanged.
  - The SSE `event: notification` frame and the 7-field payload stay; `ready` and `ping` frames stay `data: {}`. iOS skips `"{}"` and data-less frames (NotificationStreamClient.swift:40); Android filters `type=="notification"`; web listens only to `"notification"`.
  - `/unacknowledged` unchanged.
  - Web `?token=` stays accepted.
  - Android 1.0.0 gets no invite shim. It swallows POST /invite HTTP errors (ProgramContext.kt:999-1006), so a 500 is harmless there. iOS 1.4.2 and web will now show an error where they used to get a false "sent", which is intended.
  - Android 1.0.0 only has channel `rasi_default` (strings.xml:5, App.kt:20-27). FCM falls back to the manifest default for an unknown channel id.
  - Pruned installs come back on their own: iOS re-registers on every foreground; Android on every cold start (the in-memory dedupe resets).
  - **Deploy-order hazard:** the model will select `last_seen_at`. If the commit reaches `main` (Render autodeploy) before the user runs 010 on `public`, PUT /device and every push break. Gate the push to main on 010 being verified on public.
- **Doc↔code mismatches found**:
  - invites `consumed_by` is [web, ios], but Android 1.0.0 already calls POST /invite (ApiService.kt:252).
  - notifications SPEC §1, §3 #2 and D-REF still describe an iOS-only APNs device lifecycle (FCM came in D-C9). Its `reference_impl` leaves out services/authService.js, where `upsertPushToken`/`removePushToken` live.
  - pushNotifications.js:167 prunes on `messaging/invalid-argument`, which contradicts the board. Firebase maps v1 `UNREGISTERED` to `messaging/registration-token-not-registered`.
  - "`?token=` redacted from the request log" is already true: requestLog.js:6/47 logs only the route template, never the URL. R3 only needs to verify it.
  - `authenticateStream` answers 401 for JWKS infrastructure failures (middleware/auth.js:113-115), unlike `authenticateToken`'s 503 (auth D-C11). On web, `EventSource` dies for good on a 401. This belongs to R1.
  - No SIGTERM handling exists anywhere in the backend.
  - The task text names the FCM channels `"invites"`/`"default"`, but the live channel id is `rasi_default`.
  - Latent: Android `OAuthRequest` sends `push_token` with no `platform` (Dtos.kt:74-80, ProgramContext.kt:220), and `upsertPushToken` overwrites an existing row's platform to `ios`. It is almost unreachable, because `clearSession` nulls the token (ProgramContext.kt:1213).
  - Files already well over about 200 lines: inviteService.js (334), authService.js (759).
  - The Android program-picker SPEC's A-4/A-5 premise is false (W2). That is for the client track to fix.
- **Out of scope (explicitly)**:
  - All web/iOS/Android code: Android inbox adoption, channel creation, foreground display, tap-to-acknowledge, permission flow, SSE backoff/jitter and token refresh, sign-out unregister calls.
  - R1: rate limits, logout/password scopes, `authenticateStream` 503. R2: health sync.
  - Unchanged here: `/all-invites` expiry, `/broadcast`, a `program-memberships` shim for Android 1.0.0.
  - Not now: web push, Supabase Realtime, multi-instance SSE fan-out.
  - The `tools/` query pack; Phase 4 notification redesign; `unhandledRejection` handlers.
- **Open questions for the orchestrator**:
  1. Install id: reuse the existing `device_id` field and column (already accepted on PUT /device, /auth/login/app and /auth/oauth; null on all 35 rows), or add a new `install_id` column? Recommend reusing `device_id`.
  2. Unregister without login: a new route (e.g. `POST /api/notifications/device/unregister {push_token, device_id?}`, always `200`, rate-limited) or relax DELETE /device to optional auth? Recommend the new route, which leaves the old endpoint untouched.
  3. FCM channel ids and mapping: recommend `rasi_default` (matches the live channel) plus `rasi_invites`. Does the invites channel carry only `program.invite_received`, or all `program.*` membership types? TTL value?
  4. Pruning: keep today's APNs prune reasons (410, BadDeviceToken, Unregistered, DeviceTokenNotForTopic) and prune FCM only on `registration-token-not-registered`? And what about `messaging/invalid-registration-token`?
  5. Where to log the invite no-op reason: a structured console line (7 days), or `app_events` with `source='server'`? R1 also writes server events, so pick one shared helper or keep R3 to console only.
  6. Hardening: when `platform` is omitted and the row exists, keep the existing platform (fixes the latent Android OAuth flip)? Recommend yes.
  7. Add `android` to invites `consumed_by` now (POST /invite is already used), or when the Android release lands? Also: add `type` to the APNs/FCM data payload (additive, for tap routing)?
  8. R1's logout must reuse deviceService for any push unregister; no second path.
  9. Timing: BRIEF and HANDOFF gate Phase 3 on the watch ending clean on 2026-10-19 (today is 10-12). Plan now, and deploy after the gate unless the user waives it?
  10. Version bumps the commit will make: notifications 0.3.1→0.4.0 · invites 0.1.0→0.2.0 · observability 0.1.1→0.1.2 (doc-only, optional) · auth unchanged, or a PATCH coordinated with R1's bump.
  11. Testing split. Staging first (wake the free instance): run 010 with `SET search_path TO staging`, run the verify block, deploy `main:staging`, then:
      - iOS `RaSi-Fiters-App-Staging` (sandbox token, `APNS_PRODUCTION=false`) and the Android `staging` build type with `+stg` accounts
      - check: invite → `push_deliveries` sent / no_device; unregister without login via curl; token rotation by install id; cron jobs present in `cron.job`

      Then prod: run 010 on public and verify, push to main, and the user runs a smoke test:
      - live iOS 1.4.2 moves `last_seen_at` (read-only query)
      - an unknown username still returns 200 "Invitation sent"
      - `/my-invites` hides expired invites (5 prod invites expire around 10-21)
      - `curl -N` on `/stream` across a deploy ends with a plain close and no new event
      - the Pixel on Play 1.0.0 still receives pushes in `rasi_default`
