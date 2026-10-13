# SCOPE BRIEF: Phase 4, track N-SRV (notifications server, backend only)

- **Features**: notifications@0.5.0 → 0.6.0 (SPEC: specs/features/notifications/SPEC.md) · consumed_by [web, ios, android]. programs@0.2.0 (SPEC: specs/features/programs/SPEC.md) · consumed_by [web, ios, android]: its D-C1 deferred `program.updated`/`program.deleted` emit gets wired up. observability@0.3.0 (SPEC: specs/features/observability/SPEC.md) · consumed_by [web, ios, android]: it owns the `X-App-*` header contract in `utils/clientInfo.js`, so the new time-zone header is parsed there. Read-only dependencies: members, program-memberships, invites (pending-invite count), workout-logs (reminder, digest and streak data).
- **Pages/screens**: none touched in this track. The client tracks (N3/N4/N5) will consume the contract later in: web/programs (specs/pages/web/programs/SPEC.md), ios/program-actions, ios/notifications, ios/program-picker, android/program-picker, android/notifications, android/notifications-alerts (specs/pages/<surface>/<slug>/SPEC.md).

- **Files (exhaustive; implementer may touch only these), grouped by surface**:
  - backend/ (modify)
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/notifications.js — `createNotification` keeps its exact signature, because programs, memberships, invites, broadcast and People S1 kudos call it. It gains:
      - category resolution
      - the D-N2(c) preference filter: activity, reminders and digest OFF means the item is never created; program and announcements OFF means inbox only, no push
      - a legacy flag on the SSE dispatch.

      It is 103 lines today, so new logic goes in the new modules below.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/notificationStreams.js — a per-stream capability flag. Streams opened without it (every live binary and today's web) receive only legacy types.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/notifications.js — three changes:
      - `GET /unacknowledged` returns only legacy types.
      - `/stream` reads the capability flag (query param, because web `EventSource` can't set headers).
      - `PUT /device` passes `getClientInfo(req)` version and build to deviceService.

      Response shapes stay the same. It is 190 lines today, so new routes go in new files.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/pushNotifications.js — new payload keys (`category`, `target`, `badge`). Badge and new channel ids are gated per device on the registered app build, which forces per-member (badge) and per-build (channel) send groups.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/push/apns.js — `aps.thread-id` = category; `aps.badge` only for gated devices. Never Time Sensitive.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/push/fcm.js — channel per category, but new channel ids only for builds ≥ 6 (see mismatch 3). `tag` only for reminders and digest. Extends `channelIdFor`/`INVITE_CHANNEL_TYPES`.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/deviceService.js — stamp `app_version`/`app_build` in UPSERT_SQL, using COALESCE so a login ride-along without headers keeps the stored value.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/MemberPushToken.js — the two new columns.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/index.js — register the new models. **Shared with People S1 (012).**
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/programService.js — replace the `emitProgramNotification` stub (lines 17-23, 175-182, 209-216) with a real emit to active members, excluding the requester (D-N13).
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js — mount the new routers; start the scheduler after `listen`; clear it in `shutdown()`. **Shared with People S1 (router mount).**
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/clientInfo.js — add a `parseTimeZone` for the `X-Time-Zone` header (IANA name, validated with `Intl.DateTimeFormat`, no new dependency). This module owns header parsing.
  - backend/ (new; suggested names, each file ~200 lines max)
    - …/apps/backend/sql/011_notifications_inbox_prefs_scheduler.sql — migration (see DB surface).
    - …/apps/backend/utils/notificationCategories.js — type → category map, LEGACY_TYPES set, per-category channel / thread / tag / deep-link target, badge build thresholds.
    - …/apps/backend/utils/notificationTemplates.js — D-N17 rotating wordings per type, picked deterministically by hash(member + date/key), plus a minimal content-provider interface.
    - …/apps/backend/utils/notificationChannels.js — channel interface; only push and inbox are implemented (no AI, no email).
    - …/apps/backend/utils/localTime.js — local date, time and ISO week for an IANA zone using `Intl`.
    - …/apps/backend/models/NotificationPreference.js, …/models/NotificationSendKey.js, …/models/NotificationAnnouncement.js
    - …/apps/backend/services/notificationPreferenceService.js — defaults when no row exists; PUT upsert; time-zone capture (write only on change).
    - …/apps/backend/services/notificationInboxService.js — list (newest first, paged, 90 days), unread count, mark read.
    - …/apps/backend/services/memberActivityStats.js — own streak, logged-today and weekly stats for templates. Do NOT edit or export from `memberAnalyticsService.js`: its `computeStreaks` is not exported, has the known never-resets quirk, and that file is in the privacy S0 track.
    - …/apps/backend/services/notificationScheduler.js — one `setInterval` (15 min, `unref`), with dispatch protected by the never-send-twice key.
    - …/apps/backend/services/dailyReminderJob.js, …/services/weeklyDigestJob.js
    - …/apps/backend/services/announcementService.js — target resolution, preview, send now or at local time, audit, merge fields.
    - …/apps/backend/routes/notificationInbox.js, …/routes/notificationPreferences.js, …/routes/announcements.js — mounted under `/api/notifications/*`. The composer uses the `utils/rateLimit` `keyFn` per member.
  - backend/ docs (git-version step)
    - specs/features/notifications/SPEC.md (0.6.0: §3.2 channel table, §3.3 legacy filter, new §3.4–3.7 contract)
    - specs/features/programs/SPEC.md (D-C1 resolved)
    - specs/features/observability/SPEC.md §4 (`X-Time-Zone`)
    - specs/features/registry.json + REGISTRY.md
    - apps/backend/CONTEXT.md
    - apps/backend/sql/README.md (011 row)
  - web/, ios/, android/ — none in this track. Clients only start sending `X-Time-Zone` and the stream capability flag in N3/N4/N5.

- **DB surface**: migration needed, `apps/backend/sql/011_notifications_*.sql`. It must be schema-neutral, run staging first and then public, follow the PART 3 staging grants/RLS pattern from 010, and use `SET lock_timeout`. Contents:
  1. `notification_preferences`: `member_id` PK, FK to members ON DELETE CASCADE; program, activity and announcements ON; reminders and digest OFF; `reminder_time` time default `'19:00'`; `time_zone` text null; timestamps.
  2. Never-send-twice table: PK (member_id, kind, period_key), with the INSERT … ON CONFLICT DO NOTHING RETURNING claim done before the send. Plus a cron retention job.
  3. Announcement audit/schedule table: sender with FK ON DELETE SET NULL; target kind, program id and member ids; templates; mode now or local; local send time; status; recipient and sent counts. **No FK to notifications**, because retention cascades.
  4. `member_push_tokens` gets `app_version varchar(32)` and `app_build int`. Migration 010 records only `platform`, `device_id` and `last_seen_at`, with no app version, so the badge gate can't work without these columns.
  5. pg_cron `notifications_retention_<schema>`: delete older than 90 days, cascading to `notification_recipients` and `push_deliveries` (precedent: 007/010). It must run before the inbox ships.

  Read-only tables: workout_logs, members (`first_name`, `status`), program_memberships, programs, program_invites. 011 runs before the backend deploy.

- **Flags/env/config involved**:
  - Optional `NOTIFICATIONS_SCHEDULER_ENABLED` kill switch (render.yaml + ENV_RUNBOOK) — open question.
  - Code constants: tick 15 min; badge thresholds iOS build ≥ 59, Android ≥ 6; composer rate limit; reminder lateness window.
  - Existing `APNS_*` / `FIREBASE_SERVICE_ACCOUNT` unchanged.
  - CORS: `cors()` sets no `allowedHeaders`, so it reflects the requested headers and `X-Time-Zone` needs no server change.
  - The staging free instance sleeps, so its timer only runs while it is awake.
  - During a Render deploy two instances overlap briefly; the never-send-twice key covers this.

- **Blast radius**: dependents of notifications = [programs, program-memberships, invites], all through the unchanged `createNotification` signature. Their emits now pass through category preferences (program category OFF = inbox only). People S1 is the future emitter of the kudos type. Surfaces to keep in parity: [web, ios, android], built later by the N3/N4/N5 client plans against this contract.
  - **Files shared with parallel tracks**: models/index.js and server.js with People S1. `utils/notifications.js` stays owned by this track; People only calls it.
  - Privacy S0 (`memberVisibility.js`, members/memberAnalytics/log/analytics/membership services) shares nothing with this track. N-SRV reads no other member's data, and the composer is global-admin only, so it imports nothing from memberVisibility.
  - Quick-wins track shares nothing (client-only).

- **Live-binary compat**: backend contract change, additive only. It must degrade gracefully for the live iOS/Android binaries, and the backend deploys first (after 011).
  - **"Old" here also means iOS 1.5.0 (58) and Android 1.1.0 (5).** Like 1.4.2 and 1.0.0, they turn every `/unacknowledged` item and every SSE `notification` frame of any type into a blocking pop-up: iOS `ProgramContext+Notifications.swift`, `NotificationStreamClient.swift`; Android `ProgramContext.kt` / `NotificationStreamClient.kt`; web `NotificationsGate.tsx`.
  - Both legacy paths must therefore filter to LEGACY_TYPES:
    - `program.invite_received`
    - `program.member_joined`
    - `program.role_changed`
    - `program.admin_transferred`
    - `program.member_left`
    - `program.member_removed`
    - `program.deleted`
    - `app.broadcast`
  - What an old-app user sees per new type:
    - **kudos** (activity, default ON): only a system push banner. No pop-up and no feed entry. Tapping it acknowledges, which marks it read in the inbox.
    - **daily reminder / weekly digest**: created only for members who opted in from a new app. Their other, older devices get the push banner only.
    - **announcement**: banner only if it is a new type; a blocking pop-up if `app.broadcast` is reused (open question 1).
    - **program.updated**: a pop-up on every edit if it is added to LEGACY_TYPES (open question 2); banner either way.
    - **program.deleted** from `deleteProgram`: a pop-up, same as today's deletion when the last member leaves.
    - iOS 1.5.0 in the foreground with the stream connected: `willPresent` returns `[.badge]`, so a new-type push shows nothing.
  - Badge goes only to devices with app_build ≥ threshold. 1.4.x sends no `X-App-Build`, so its stored build is null and it never gets a badge.
  - The device's `PUT /device` re-registers at most every 12 h (A12), so the stored build catches up within 12 h of an app update.

- **Doc↔code mismatches found**:
  1. Header comments in `utils/programMemberships.js:4-6` and `services/membershipService.js:9` still say `createNotification` is a no-op stub; it is live.
  2. DISCOVERY §3 defines "old apps" as 1.4.2 / 1.0.0 only. In code, 1.5.0 (58) and 1.1.0 (5) have the same blocking queue (see above).
  3. Not in the SPEC, and it breaks the §3.2 claim that an unknown channel falls back to the manifest default: Android 1.1.0 posts foreground pushes on `message.notification?.channelId` (`push/RaSiFirebaseMessagingService.kt:42`). A channel id that doesn't exist on the device is dropped silently in the foreground; the §3.2 fallback holds only in the background.
  4. Notifications SPEC §3.2 says `rasi_default` covers "any future type"; this changes.
  5. Not a mismatch, a known gap: `computeStreaks` (`memberAnalyticsService.js:28-48`) doesn't reset when days are skipped and counts per program.

- **Out of scope (explicitly)**:
  - All client code (N3/N4/N5 and the web composer UI); D-N12 iOS permission ask.
  - People S1 / migration 012, the kudos table and "Hide my activity" (kept out of the preferences table).
  - Privacy S0 rules.
  - The vestigial `POST /broadcast` (kept as is; its type maps to announcements).
  - Recipient rules of the `handleMemberExit` `program.deleted` emit (unchanged).
  - Fixing `computeStreaks`.
  - Web push, email, AI content; raising MIN_/LATEST_ versions; any app version bump.

- **Open questions for the orchestrator**:
  1. Composer type: a new `app.announcement` (old apps: banner only) or reuse `app.broadcast` (old apps: blocking pop-up)? Recommend new.
  2. Keep `program.updated` out of LEGACY_TYPES? Recommend out (old apps would get one pop-up per edit).
  3. Does "nothing logged today" mean workouts only? Recommend workouts only: auto-synced steps and sleep in `daily_health_logs` would otherwise suppress nearly every reminder.
  4. Streak for templates: recommend cross-program distinct workout dates ending today or yesterday (local), computed by the new helper.
  5. Time-zone fallback when a member has none (old-app users; "send at local time" announcements): recommend the sender's `X-Time-Zone`.
  6. Badge dedupe: recommend unread excluding `program.invite_received` + pending invites, so an invite counts once. The server returns `{unread, pending_invites, badge}`.
  7. Time-zone capture point: recommend reading the header only on the new notifications routes + `PUT /device`, writing on change. Not in `middleware/auth.js` (auth-owned, every request).
  8. Reminder lateness after a missed tick (deploy or sleep): recommend up to 2 h late, else skip that day.
  9. Retention via pg_cron in 011 (recommended, matches the 010 precedent) or an in-API nightly job?
  10. Android badge: use launcher dots only (no `notificationCount`) as a called-out platform-idiom divergence? FCM `tag` replaces rather than stacks, so use it only for reminders and digest.
  11. D-N14 gate: the per-device build gate (iOS ≥ 59, Android ≥ 6) satisfies "only after old iPhones must update" without forcing MIN_IOS. Confirm.
  12. Personalized sends: one notifications row per recipient, because title/body live on `notifications`; fine at about 60 members. "Everyone" = all active members, not only those with push tokens. Confirm.
  13. Kudos type key (`activity.kudos_received`) and deep-link target to be fixed jointly with People S1 before both contracts freeze.
