# W2 — Push notifications + invites · Phase 0 discovery brief

> Read-only, 2026-10-11. Sources: code at `20e014f`, prod DB (read-only transactions), Render app logs
> (retention starts **2026-10-05 01:19 UTC**, about 7 days), Pixel 7 over adb. Ids are truncated to 8 characters. No tokens or names appear here.

## 1. Summary

- **The reported failure is not mainly a push problem. Android cannot see or accept invites at all.** `POST /invite` writes
  only `program_invites`. Web and iOS read that table through `GET /my-invites`. Android shows invites only as `GET /programs` rows with
  `my_status='invited'`. Nothing creates those rows: there are **0 of them in prod**. Android never calls `/invite-response`.
- Prod impact: 11 invites in the last 60 days went to members with Android tokens. 2 are still pending after 20 days. 4 were accepted in one
  **59-second batch** about 21 h or more after the invite, which fits the only global admin accepting on their behalf. One earlier invite took 10 days.
- Push works when a token exists (10-06: "FCM sent to 8", "APNs sent to 7"), but it can't be observed: zero tokens is silent,
  nothing records delivery, logs last about 7 days, and SQL logging prints device tokens in plaintext.
- **S7 confirmed.** On every surface the SSE stream dies silently and comes back only on foreground. Android restarts it with an access token that may have expired.
  The backfill on app open hides this, so it is not the invite cause.
- Token lifecycle gaps: iOS never unregisters on sign-out. Android doesn't unregister when it signs out after a failed refresh. There is no device identity
  (`device_id` is null on 35 of 35 rows). Stale tokens are pruned only when a send fails.

## 2. How it works today

**Backend**

| Step | Where |
|---|---|
| Authz, then 5 silent, unlogged "privacy-safe" no-ops (program missing, username unknown, already a member, blocked, live pending invite) | `services/inviteService.js:16-61` (returns at 30, 40, 46, 52, 59) |
| Insert `program_invites` (30-day expiry), then emit. The two steps are **not** in one transaction | `inviteService.js:64-73`, `75-82` |
| Route turns any non-AppError into 200 "Invitation sent" and **logs nothing** | `routes/invites.js:14-22` |
| `createNotification`: rows, then SSE + push, fire-and-forget (`afterCommit` when inside a transaction) | `utils/notifications.js:42-92` (dispatch 74-81) |
| APNs: `platform='ios'` tokens. With 0 tokens it **returns silently**. Expiry 1 h. Prunes on 410 / BadDeviceToken / Unregistered / DeviceTokenNotForTopic | `utils/pushNotifications.js:43-89` (54, 58, 79-87) |
| FCM: `notification` + `data{notification_id}` + `priority:high`. No TTL or channel set. With 0 tokens it returns silently. Prunes on not-registered / invalid-token / **invalid-argument** | `pushNotifications.js:123-178` (134, 137-145, 164-170) |
| SSE: in-process `Map`, 25 s ping. No SIGTERM handling | `utils/notificationStreams.js:4-33`; `routes/notifications.js:127-146` |
| Device register/unregister. `platform` defaults to `'ios'`. Upsert is keyed on the token and re-binds the member | `routes/notifications.js:44-67`; `services/authService.js:82-113` |
| Invitee inbox: `invited_username = req.user.username AND status='pending'`. No expiry or program filter | `inviteService.js:87-108` |
| Picker list: membership rows `IN ('active','invited','requested')` | `services/programService.js:58-90` (79) |

**Android (Play 1.0.0 (4))**

- Invite UI comes from picker rows with `myStatus=="invited"` (`ui/programs/ProgramPickerScreen.kt:115, 368-371`; `ProgramActionsSheet.kt:83`).
  Accept calls `PUT /program-memberships`, which returns 404 because no membership row exists (`core/ProgramContext.kt:384-391` → `membershipService.js:200-215`). The spec records this as deviation A-4/A-5
  (`specs/pages/android/program-picker/SPEC.md:47-56`), based on the false premise that invites arrive in that list.
- `program.invite_received` only reloads programs (`ProgramContext.kt:472-476`). The modal has a single OK button and can't be dismissed any other way (`ui/components/NotificationModal.kt:37, 60-64`).
- FCM: `onNewToken` sends `PUT /device` with `platform:android`. `onMessageReceived` does nothing (`push/RaSiFirebaseMessagingService.kt:18-24`). The token is registered on
  sign-in and on every `ON_RESUME`, deduped in memory (`ProgramContext.kt:496-519`; `ui/RootScreen.kt:70-99`). There is one channel, `rasi_default`, at
  IMPORTANCE_DEFAULT (`App.kt:20-27`; manifest 72-82). POST_NOTIFICATIONS is requested on every signed-in launch and the result is ignored (`RootScreen.kt:62-80`).
  Explicit sign-out sends `DELETE /device` (`ProgramContext.kt:326-335`). Sign-out after a failed refresh does not (`338-340`, `1211-1213`). The push-tap `notification_id` is never read.
- SSE (okhttp-sse) sends a Bearer header from `session.accessToken`. It has no `onFailure` and restarts only on resume or a token change (`net/NotificationStreamClient.kt:26-62`;
  `ProgramContext.kt:426-434`). The Authenticator refresh updates `Session` but **not** `_authToken` (`net/Network.kt:79-103`; `ProgramContext.kt:104,190`).

**iOS (App Store 1.4.2 (56))**

- Inbox: `/my-invites` (or `/all-invites` for the global admin) on picker load and on an invite event (`ProgramContext+ProgramManagement.swift:114-127`;
  `ProgramPickerView.swift:126-129`; `ProgramContext+Notifications.swift:94-98`).
- APNs: re-registers on every foreground while authorized and sends `DELETE` if denied (`AppRootView.swift:87-118`). The token goes to UserDefaults, then `PUT /device`
  with no platform, via `try?` (`AppDelegate.swift:26-37`; `ProgramContext+Auth.swift:213-218`). It is also sent with login. **Sign-out never unregisters**
  (`ProgramContext+Auth.swift:136-161`). Tapping a push acknowledges it (`AppDelegate.swift:58-72`; `AppRootView.swift:78-81`).
- SSE: URLSession with a 1 h resource timeout. `onError` does nothing. The stream restarts on foreground after a proactive refresh (`NotificationStreamClient.swift:20-22, 74-78`;
  `ProgramContext+Notifications.swift:7-27`; `AppRootView.swift:89-93`).

**Web.** Inbox: React Query → `/my-invites` (`app/programs/page.tsx:71-75`). No web push. `EventSource` puts the token in the URL as `?token=`.
`onerror` does nothing; the browser retries on its own. The stream re-creates only when `token` changes (`components/NotificationsGate.tsx:145-179`). Backfill runs at `131-143`.

## 3. Production evidence

| # | Query / command | Window | Result |
|---|---|---|---|
| E1 | `program_invites` by status | 60 d / all | 19 accepted, 5 pending (all 09-21) / 143 accepted · 13 pending · 10 declined · 5 expired · 1 revoked |
| E2 | `program_memberships` by status | all | active 164, removed 13, **invited 0, requested 0** |
| E3 | Per invite: invitee, tokens then/now, notification row, ack, membership | 60 d, 24 invites | Every invite has a `program.invite_received` row within 1 s of creation. Username matches exactly (case included) 24/24. Android-token invitees: `e7ff12fa`→`ca50022b` and `0ff9dc1f`→`8b2aa0b0` are **pending**; both tokens predate the invite; notifications unacked. `8557519a`, `255532ac`, `77cb0e59`, `5025a03d` joined **09-22 18:36:48–18:37:47**. `ca50022b`'s 08-24 invite was acked the same day and joined 09-03 |
| E4 | `ca50022b` token row | now | Created 07-13. `updated_at` 10-04 04:00, i.e. a `PUT /device` 13 days after the invite. Last data log 09-11. The 09-21 invite is still unacked |
| E5 | `member_push_tokens` | now | Android: 23 tokens across 16 members. iOS: 12 across 12. **32 of 59 members have none.** `device_id` is null 35/35. One test account holds 8 Android tokens (07-16 to 09-11), never pruned |
| E6 | Global admins | now | 1 |
| E7 | Render logs, text `FCM`/`APNs` | 10-05 01:19 → 10-11 | Only 2 lines. 10-06 06:36:18 "APNs sent to 7" and "FCM sent to 8" (a member_joined fan-out to 18 recipients; 7 iOS and 8 Android tokens). No failures |
| E8 | Render logs around invite `67961202` (10-06 06:35:49) | 1 min | Notification insert and both token SELECTs ran. **No push line.** The invitee's token was created at 06:36:03, so the send hit the silent zero-token return |
| E9 | Render log content | — | Sequelize logs device tokens, member ids and usernames in plaintext (`config/database.js:13`) |
| E10 | Pixel: `dumpsys package/notification`, standby bucket, GCM service dump, usagestats | now | 1.0.0 (4) from Play, installed 09-28. POST_NOTIFICATIONS granted (USER_SET). `rasi_default` importance 3, not blocked. Bucket 40 (RARE). Not stopped. GMS 26.36.66. MCS connected; app is in the FCM client queue. Last used 10-10. The logcat buffer covers about 15 min and has no app or FCM receipt lines |

## 4. Failure modes

| # | Trigger → mechanism → symptom | Likelihood | Evidence |
|---|---|---|---|
| F1 | Any invite to an Android user. Android reads only membership rows (`programService.js:79`; `ProgramPickerScreen.kt:368`) → the invite is invisible and can't be accepted. The modal's OK button just dismisses it permanently | Every Android invitee | Proven by prod (E2, E3) + code |
| F2 | Recipient has 0 tokens → silent return (`pushNotifications.js:54/134`) → no push and no log | Common (32/59 members) | Proven by prod (E8) |
| F3 | Mistyped, blocked or already-member username → unlogged no-op (`inviteService.js:30-59`; `invites.js:20`) → admin sees "Invitation sent", invitee gets nothing | Plausible | Code |
| F4 | Notification insert fails after the invite insert (no transaction, `inviteService.js:64-82`) → invite exists with no alert; 200 returned; nothing logged | Low | Code |
| F5 | Android resume after >1 h → SSE opens with an expired token → the 401 is swallowed. The refresh doesn't touch `_authToken` → no live alerts until the next resume. Foreground FCM is a no-op too | First open after each idle hour | Code |
| F6 | Background, or a Render deploy (connections close; 30 s SIGTERM grace; unhandled) → iOS and Android reconnect only on foreground. The iOS stream also hard-stops after 1 h (`NotificationStreamClient.swift:22`) | Constant | Code + Render docs |
| F7 | Web after token expiry → browser retries with the stale `?token=` → 401 → `EventSource` closes for good (WHATWG: non-200 response = fail, no reconnect) | Plausible | Code + spec |
| F8 | Sign-out (iOS always; Android after a failed refresh) leaves the token bound → pushes reach a signed-out device. On Android a network blip during refresh signs the user out (`Network.kt:93-96, 117-118`) | Common | Code |
| F9 | FCM `invalid-argument` is treated as a dead token (`pushNotifications.js:167`) → a payload bug would delete every Android token | Low | Code + Firebase docs |
| F10 | No device id and no age-based prune → dead installs accumulate; pruned only on send failure | Ongoing | Prod (E5) |
| F11 | APNs expiry is 3600 s (`pushNotifications.js:58`) → an iPhone offline >1 h never gets the push. FCM's default TTL is 4 weeks | Moderate | Code |
| F12 | Minor: the Android push tap doesn't acknowledge, so the modal reappears. Expired-but-pending invites are still listed and accepting them returns 400 (5 expire 10-21) | — | Code |

## 5. Suspect verdicts

- **S4 — PARTIAL, reframed.** The backend emits correctly: 24/24 notification rows (E3). The **in-app half is CONFIRMED and is the root cause**: Android
  has no path to `program_invites` (F1). The Pixel's push setup looks healthy (E10). Whether FCM delivered the 09-21 pushes is
  **UNVERIFIABLE**: those logs are gone and there is no delivery record. The tokens were never pruned, so FCM did not reject them.
- **S7 — CONFIRMED.** All three clients lose SSE silently and depend on a foreground restart plus backfill (F5–F7). Android also restarts with a stale token.
  This is not the invite cause, because `/unacknowledged` runs on every app open.
- **S9 (push interaction) — CONFIRMED on Android.** `refreshBlocking` returns null on *any* exception, which leads to `session.clear()` and sign-out. That path also skips
  `DELETE /device` (F8).

## 6. Cross-surface divergences

| Concern | Web | iOS | Android |
|---|---|---|---|
| Invite inbox | `/my-invites` | `/my-invites` | `/programs` rows (never populated) |
| Accept/decline/block | `/invite-response` | `/invite-response` | `PUT /program-memberships` (always 404) |
| Native push | none | APNs | FCM |
| Push while in foreground | — | banner + modal | dropped (modal only) |
| Tap acknowledges | — | yes | no |
| Unregister on sign-out | — | never | explicit sign-out only |
| Permission denied → unregister | — | yes | no |
| SSE auth | URL `?token=` | header, refreshed first | header, may be stale |
| SSE reconnect | browser auto-retry (stops at first 401) | foreground only | resume only |
| `platform` sent | — | none (defaults to ios) | android (OAuth login omits it: latent, `Dtos.kt:74-80`) |

## 7. Industry-standard target (contract)

1. **One server source of truth for invites.** Every surface lists pending invites from one inbox endpoint and responds through one respond endpoint. Push and SSE are only hints to re-fetch.
2. **Durable first, delivery best-effort.** The invite and its notification are written in one transaction. Pushes are queued, retried with backoff, and every attempt is recorded
   (recipient, platform, token id, outcome). "Zero tokens" counts as a recorded outcome.
3. **Token lifecycle.** Sources: Firebase *Manage FCM registration tokens*; Apple *Registering your app with APNs*.
   - Register on every launch and on rotation.
   - Store one row per installation, with a last-seen timestamp updated on every upload.
   - Delete on `UNREGISTERED` or APNs 410/BadDeviceToken. Treat `INVALID_ARGUMENT` as a dead token only when the payload is known to be valid.
   - Prune tokens inactive for more than 30 days (Android expires them at 270 days).
   - Unregister on *every* sign-out path.
4. **Android delivery.** Sources: Android *Notification runtime permission*; *Power management*.
   - Ask for POST_NOTIFICATIONS in context, with a rationale and a fallback to settings, and show denial in the app.
   - Use a dedicated high-importance channel for invites.
   - Send an explicit channel and TTL.
   - Use high priority only for messages that produce a visible notification. Since Android 13 the standby bucket no longer caps high-priority FCM, but the system downgrades high-priority messages that don't show a notification.
   - Handle foreground messages and taps.
5. **Realtime.**
   - Keep a live connection only in the foreground.
   - Reconnect with exponential backoff and jitter.
   - Authenticate with a freshly refreshed token in a header, not in the URL.
   - Backfill or `Last-Event-ID` on every reconnect.
   - The server handles SIGTERM. Render docs: no maximum connection duration, connections close on deploy, 30 s grace.
6. **Observability.** Structured, redacted logs (no tokens or usernames) for every invite, notification and push attempt, kept longer than 7 days.

## 8. Live-binary constraints

- **Android 1.0.0 (4)** (and (3) on Alpha):
  - It can only show an invite as a `GET /programs` row with `my_status ∈ {invited, requested}`.
  - It can only accept via `PUT /program-memberships {program_id, member_id, status:"active"|"removed"}`, which needs an existing `invited`/`requested` row (`membershipService.js:212`).
  - Any fix that reaches today's Android users without a new build must work through those two contracts. Otherwise it waits for a new build and its adoption window (Android has no minimum-version gate; `app-config` is iOS-only).
  - It needs the FCM `notification` block, ignores data-only messages, and drops pushes that arrive in the foreground.
- **iOS 1.4.2 (56)** (and lingering 1.4.0/1.4.1):
  - It sends `PUT /device` with no `platform`, so the `'ios'` default must stay.
  - Its SSE parser decodes any `data:` frame as a notification whatever the `event:` type, so new event types must not carry notification-shaped data.
  - Tapping a push reads `notification_id`.
- All binaries rely on `/notifications/unacknowledged`, the `event: notification\ndata: …` framing and the 7-field payload. The API host is hard-coded.

## 9. Open questions for the user

1. Is the reported invitee `ca50022b` (two invites, one still pending) or `8b2aa0b0`? Did they see the "Program invitation" modal?
2. Was the 09-22 18:36–18:37 batch you accepting on the invitees' behalf as global admin?
3. Android invite gap: a server-side shim the live build can render and accept, or a new build only?
4. Keep the silent "Invitation sent" for unknown or blocked usernames? At minimum, should we log it on the server?
5. Is web push in scope? Web-only invitees get nothing while the tab is closed.
6. Can the test account's 8 stale Android tokens be pruned?
7. Render log retention: add a log drain (W6)?
