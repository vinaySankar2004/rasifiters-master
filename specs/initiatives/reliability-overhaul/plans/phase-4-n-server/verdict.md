# PLAN VERDICT — OBJECTIONS (8)

All eight objections are advisory; none blocks. Every cited line anchor matches the current code (clientInfo.js 10/14/34/51, apns.js 6/58-66/107-108, deviceService.js 4/31-41/56-63, routes/notifications.js 6/16/29-32/62-67/171, programService.js 6-8/13-23/175/209, MemberPushToken.js 35-42, server.js 30/107/139/159).

1. **[ADVISORY] The Endgame compile check (step 30) crashes as written.**
   - Evidence: I ran `DATABASE_URL=… node -e 'require("./routes/notifications")'` in `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`. It throws `Error: supabaseUrl is required.` from `config/supabase.js:71`. The chain is `routes/notifications` → `services/authService` → `config/supabase`, which calls `createClient` when the module loads.
   - With dummy `SUPABASE_URL=https://x.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x` the router loads and prints exactly the expected legacy route list.
   - Failure scenario: the implementer pastes step 30, gets a stack trace instead of the "Expected output", and the gate can't pass. Fix: add those three stub variables to the `node -e` line.

2. **[ADVISORY] Ignored daily reminders and digests make the app-icon badge climb.**
   - Evidence: `COUNTS_SQL` (step 9) counts every unread item from the last 90 days, including `reminder.daily` and `digest.weekly`. Each reminder is its own `notifications` row, and `apns-collapse-id` only collapses the tray, not the inbox.
   - Failure scenario: a member opts in, then skips workouts and ignores the pushes. The badge goes to 7 after a week and up to about 90 or more after three months. That is the "stuck badge" D-N14 was meant to prevent.
   - Fix options: leave the reminders and digest categories out of `badge` (keep them in `unread`), or mark the previous `reminder.daily` read when the next one is created. Either way it's server-only, so the contract shape is unchanged.

3. **[ADVISORY] D-N14 is reinterpreted, and the user should approve that explicitly.**
   - Evidence: `phase-4/DECISIONS.md:40` says "(a) app-icon badge, only after old iPhone apps are required to update". The plan's Q11/D1 replaces that with a per-installation `supports_inbox` gate, with no MIN_IOS raise.
   - The gate achieves the goal (no badge on devices that never clear it), but it is a different trigger from what the user decided. List it as a decision change in the approval summary, not as an implementation detail.

4. **[ADVISORY] Client rule C7.7 can't be done reliably on three clients.**
   - Evidence: C7.7 says "After accepting or declining an invite, mark that program's unread `program.invite_received` items read". `POST /inbox/read` only accepts `ids` or `all`, and the inbox is keyset-paged 30 at a time.
   - Failure scenario: the invite item is on page 2, or not loaded yet (accepted from a push or from My Invites). Each client has to page and search, or skip it, so the three clients diverge and the item stays unread forever.
   - Fix: add a third body form to `markRead`, `{ "type": "program.invite_received", "program_id": "<uuid>" }`, in `notificationInboxService.js`. It's in scope, about 5 lines.

5. **[ADVISORY] Error texts a user can trigger aren't plain language, and frontend-kit shows 400 text word for word.**
   - Evidence: frontend-kit SPEC lines 67-68 show the server's text for `invalidInput`, and quick-wins #8 is "plain-language errors everywhere".
   - Messages the web composer will show for things the admin typed or picked:
     - `delivery.date must be between today and 30 days from now.`
     - `Some target.member_ids are unknown or inactive.`
     - `Sending at local time needs your time zone (X-Time-Zone header).`
     - `{program_name} needs a program target.`
   - Fix: reword these in `announcementRequest.js` and `announcementService.js`, e.g. "Pick a date within the next 30 days."

6. **[ADVISORY] Android can't stack alerts per category, and contract C5 implies it can.**
   - Evidence: the plan says "Stacking uses one channel per category". The FCM v1 `AndroidNotification` has no group key; the fields used here are `channel_id`, `tag` and `notification_count`. A channel controls the user's per-category settings, not grouping in the tray.
   - When the system displays the push (app in background), all RaSi alerts sit in one app bundle.
   - Fix: state in C5 that Android has per-category channels but no per-category stacking (a platform limit), so N5 doesn't try to build it.

7. **[ADVISORY] Reminder candidates include members whose only active program is soft-deleted.**
   - Evidence: `listOptedIn`'s `EXISTS (… pm.status = 'active')` never checks `programs.is_deleted`. `deleteProgram` and `handleMemberExit` soft-delete the program but leave memberships `active` (`programService.js:207`, `utils/programMemberships.js:68-72`).
   - Failure scenario: an admin deletes a member's only program. That opted-in member keeps getting "Log today's workout" every day, and the `log_workout` target leads nowhere.
   - Fix: add `JOIN programs p ON p.id = pm.program_id AND p.is_deleted = false` inside the EXISTS.

8. **[ADVISORY] Minor standards and brief bookkeeping.**
   - (a) The scheduler's DB calls have no timeout and `running` blocks overlapping ticks. A hung query on a half-open connection stalls reminders until TCP gives up (about 15 min). Workspace Standards ask for explicit I/O timeouts; e.g. race each job against a 5-minute timer.
   - (b) "None of them adds a file outside the brief's scope" isn't accurate: `services/announcementRequest.js` and `services/announcementDelivery.js` aren't in the brief's exhaustive list. The orchestrator should extend the brief explicitly.
   - (c) An announcement can render "You're on a 0-day streak". Consider filling `{streak}` only when it is ≥ 1, or documenting it for the composer preview.

## What I checked (nothing else found)
- **Consumers.** I grepped `createNotification`, `sendPushToMembers`, `sendNotificationToMember`, `registerNotificationStream`, `channelIdFor`, `buildPushData` and `registerDevice` across `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend` and `tools/`.
  - The only external caller of `registerDevice` is `authService.js:112`, which passes `supportsInbox` undefined → null → keep the stored value.
  - Every emitted type is in LEGACY_TYPES.
- **Live clients.** Web reads `/unacknowledged` and opens the stream with `?token=` (`NotificationsGate.tsx:241`, `lib/api/notifications.ts:14`). iOS `AppDelegate.swift` `willPresent` returns `[.badge]` while the stream is connected, and a tap acknowledges. Android `RaSiFirebaseMessagingService.kt:42` posts on `notification.channelId`. All three already handle `program.updated` and `program.deleted` as refresh triggers. Excluding `program.updated` from LEGACY_TYPES is no regression (it's never emitted today).
- **Live-binary compat.** Response shapes, routes and the 7-field frame are unchanged. The `/unacknowledged` include `where` only filters. Live builds send no `inbox`, so `supports_inbox` is false: no badge and no new channel ids. The time-zone header is a no-op for old apps.
- **Library behaviour.**
  - Sequelize 6.37.8 named replacements skip string literals and `::` casts (`lib/utils/sql.js:118-167`), so the `'HH24:MI'`, `'…US"Z"'`, `::int` and `ARRAY[:x]::uuid[]` forms are safe.
  - apn 2.2.0 supports `threadId`, `collapseId` and `badge`.
  - firebase-admin 12.7.0 has `sendEach`.
  - `AppError(status, msg, {code})` matches.
  - `req.user` carries `id`, `member_name` and `global_role`.
  - The new requires form no cycle.
- **Expected outputs.** I hand-verified step 30's date math: Kolkata `{"date":"2026-10-13","minutes":10,"weekday":2}`, `2026-W42`, `dueReminderDate` → `2026-10-12` / `null`, Nairobi Monday → `2026-10-12`.
- **Decisions and versions.** D-N1 through D-N17 hold except D-N14 (objection 3). Free numbers are confirmed: notifications D-C19 and F14, observability D-C13, programs D-C3. Registry versions are 0.5.0, 0.2.0 and 0.3.0. No `depends_on` edge is needed, because the new code only reads those tables (git-version's import-vs-read rule).
- **Migration 011.** It is schema-neutral, idempotent, uses `lock_timeout`, follows the 010 RLS and grants pattern, and runs before the backend deploy.
- **Shared files.** Nothing is shared with privacy S0 or quick-wins. `server.js` is shared with People S1, as the plan already flags.
