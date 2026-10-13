# SCOPE BRIEF — Phase 4 Track C: Notifications (N5 + client parts of N7/N8) and People (S4 + S5/#32) on the Android client

- **Features**:
  - notifications@0.5.0 → server track takes it to 0.6.0. SPEC: specs/features/notifications/SPEC.md · consumed_by [web, ios, android] · depends_on [auth, members, program-memberships, observability] · reference_impl backend.
  - people@— (NEW 0.1.0 from People S1). SPEC: specs/features/people/SPEC.md, created by S1 · consumed_by [] today; android joins with this track.
  - members@0.4.0 (S0 docs are in the working tree, uncommitted) · consumed_by [web, ios, android] · client reads/writes `hide_activity`.
  - invites@0.2.1 · consumed_by [web, ios, android] · the "My Invites" tab becomes Inbox.
  - observability@0.3.0 → 0.4.0 · consumed_by [web, ios, android] · Android sends `X-Time-Zone`.
  - frontend-kit@0.3.0 · consumed_by [web, ios, android] · every new screen follows the §3 copy table and §5/§6 recipe.
  - health-connect@0.3.0 · consumed_by [android] · footnote copy plus the notifier icon.
- **Pages/screens** (all android):
  - notifications — specs/pages/android/notifications/SPEC.md
  - notifications-alerts — specs/pages/android/notifications-alerts/SPEC.md
  - program-picker ("+" sheet, account sheet) — specs/pages/android/program-picker/SPEC.md
  - program (account section) — specs/pages/android/program/SPEC.md
  - members — specs/pages/android/members/SPEC.md
  - member-management (roster → People) — specs/pages/android/member-management/SPEC.md
  - my-profile — specs/pages/android/my-profile/SPEC.md
  - health-connect — specs/pages/android/health-connect/SPEC.md
  - NEW: android/people, android/person-profile, android/inbox — specs/pages/android/{people,person-profile,inbox}/SPEC.md, plus rows in specs/pages/REGISTRY.md

- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — none
  - web/ — none
  - ios/ — none
  - android/ — existing files to modify. **★ = already modified by quick-wins in the uncommitted working tree: merge, never overwrite.**
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/ClientHeaders.kt — `X-Time-Zone: ZoneId.systemDefault().id` on every client (main, refresh, SSE) (C1, D-N6).
    - …/net/NotificationStreamClient.kt — open `notifications/stream?inbox=1` and decode C3 inbox items. `onReady` refreshes the unread count, not `/unacknowledged`.
    - …/net/ApiService.kt (324 lines) — add the endpoints below. Drop `getUnacknowledgedNotifications` and `acknowledgeNotification` (C7.3).
      - `GET notifications/inbox`, `GET notifications/inbox/unread-count`, `POST notifications/inbox/read`
      - `GET` and `PUT notifications/preferences`
      - `GET people`, `GET people/{memberId}`, `POST` and `DELETE people/{memberId}/kudos`
      - a `PUT members/{id}` variant that carries `hide_activity` and reads its echo
    - …/net/Dtos.kt (719 lines) — `DeviceRegisterRequest` gets `inbox: Boolean? = null`, always passed explicitly as `true`; `MemberDTO` gets `hide_activity`; `NotificationDTO` is superseded by the inbox DTO.
      - **Gotcha:** `Network.json` has `encodeDefaults = false`, so a property left at its default value is never sent (see the `platform` comment).
    - …/push/DeviceRegistry.kt — send `inbox: true`.
      - Force one re-register when the stored "inbox registered" memo is missing (C7.4).
      - **Do not key the memo on versionCode:** the quick-wins test build already uses versionCode 6, the same code the final Phase 4 build will carry.
    - …/push/RaSiFirebaseMessagingService.kt
      - Small icon becomes the new monochrome drawable.
      - Fallback channel per category, used when `notification.channelId` is absent.
      - Tap intent carries `target` / `category` / `program_id`.
      - `onPushReceived` refreshes the unread count.
      - Keep the "skip tray post while the stream is connected" rule; the toast covers it.
    - …/App.kt — create `rasi_activity`, `rasi_reminders`, `rasi_digest` (LOW) and `rasi_announcements`, per the C5 table; keep `rasi_default` and `rasi_invites`.
    - …/MainActivity.kt — `handlePushTap` passes `target` and `program_id` through for routing.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/AndroidManifest.xml — `com.google.firebase.messaging.default_notification_icon` meta-data so background pushes use the monochrome icon.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/res/values/strings.xml — ids and names for the 4 new channels.
    - …/health/HealthSyncNotifier.kt — its small icon is also `R.mipmap.ic_launcher` (line 49). One-line swap to the monochrome icon.
    - ★ …/core/ProgramContext.kt (1534 lines) — replace the modal-queue section (lines 564-700) with delegation to the new inbox hub.
      - `onForeground` loads the unread count and the preferences.
      - `respondToInvite` also marks that program's unread `program.invite_received` items read (C7.7).
      - `clearSession` resets the inbox and People state.
      - `onPushTap` posts `POST /inbox/read {ids}` and routes by `target`, replacing `inviteInboxRequest` with a general pending-target flow.
    - ★ …/ui/RootScreen.kt (320 lines)
      - The `NotificationModal` overlay becomes the floating toast.
      - SignedInGraph consumes the pending target: `programs` pops to the picker; `program` selects `program_id` and opens SHELL; `inbox` opens INBOX; `log_workout` opens a log form (see Q6).
      - Register the INBOX route; `NotificationsScreen` now takes `programContext`.
      - The one-time POST_NOTIFICATIONS ask stays as is.
    - …/ui/shell/AppScaffold.kt (250 lines) — routes for INBOX, PERSON_PROFILE and the People list at MEMBER_ROSTER; the new `NotificationsScreen` signature.
    - …/ui/Routes.kt — `INBOX`, `PERSON_PROFILE` (plus a full-stats route only if Q4 needs one).
    - ★ …/ui/programs/ProgramActionsSheet.kt (380 lines) — the left tab becomes "Inbox" and hosts the shared inbox list (invites first, then items). It opens on Inbox when the badge is above 0 or for an `invites` / `inbox` target.
    - ★ …/ui/programs/ProgramPickerScreen.kt (664 lines)
      - The "+" badge becomes the server `badge` (C4/Q6). This also fixes the badge half of polish #40: requested programs no longer count.
      - The account-sheet Inbox action.
      - Pending-target handling.
    - …/ui/programs/AccountMenuSheet.kt — Inbox row (D-N4).
    - …/ui/program/ProgramAccountSection.kt — Inbox row (the second copy of the account menu).
    - …/ui/program/NotificationsScreen.kt — rebuild:
      - status card;
      - an in-app permission request button, or a real "Open Settings" button once permanently denied (the "Moved" row);
      - the preferences section.
    - ★ …/ui/program/ProfileScreen.kt (461 lines) — insert the "Hide my activity" section.
    - ★ …/ui/members/MembersScreen.kt (404 lines)
      - People entry for every role. The admin header has only Invite today (see Q3).
      - S5/#32 kit recipe: placeholders, "Couldn't load · Retry", `PullToRefreshBox`; the reference is `SummaryScreen.kt:94-140`.
    - …/ui/members/MemberCards.kt (560 lines) — S5: no "No workouts logged yet", 0-day streak or "No members to display" on a failed load.
    - ★ …/ui/members/MemberManagementScreens.kt (337 lines) — `ProgramMembersListScreen` is replaced by People. `MemberDetailEditScreen` (global admin only, D-P11) loads its own `loadMembershipDetails()` because the roster no longer preloads it (see Q5).
    - …/ui/health/HealthConnectSettingsScreen.kt (434 lines) — the People plan's §B footnote: `Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile.`
    - …/ui/components/NotificationModal.kt — DELETE (D-N3).
  - android/ — NEW files. Paths are under …/java/com/app/rasifiters/ unless noted; keep each at about 200 lines or less.
    - net/InboxDtos.kt — C3 item, inbox page, unread counts, read request, preferences GET/PUT.
    - net/PeopleDtos.kt — People §B–§E plus the `hide_activity` PUT.
    - core/NotificationInbox.kt — the hub that ProgramContext delegates to:
      - stream callbacks;
      - unread counts;
      - the paged inbox list;
      - the preferences cache that gates the toast (C7.5);
      - the toast flow;
      - mark read;
      - target parsing (unknown target → `inbox`).
    - core/PeopleStore.kt — list, profile, kudos give/undo, the `hide_activity` setter, and the device-local "activity notice seen" flag (U-1).
    - ui/inbox/InboxList.kt — shared by the sheet tab and the Inbox screen.
    - ui/inbox/InboxScreen.kt
    - ui/inbox/NotificationToast.kt
    - ui/program/NotificationPreferencesSection.kt — the five switches with one-line explanations, the reminder time via the platform `TimePickerDialog` (Material3 1.3.1 from BOM 2024.12.01 has no TimePickerDialog composable; default 19:00), and honest opt-in wording.
    - ui/program/HideActivitySection.kt
    - ui/people/PeopleListScreen.kt
    - ui/people/PersonProfileScreen.kt
    - ui/people/ActivityVisibilityNotice.kt — only under U-1(b).
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/res/drawable/ic_stat_notification.xml — 24dp monochrome version of the three-bar mark (geometry from `res/drawable/ic_launcher_monochrome.xml`).
- **DB surface**: none from this track. It consumes the server tracks' 011 (notifications) and 012 (people).
- **Flags/env/config involved**:
  - No new env vars.
  - `BuildConfig.API_BASE_URL`: debug points at live prod; the `staging` build type is opt-in.
  - `X-Time-Zone` header.
  - `POST_NOTIFICATIONS` runtime permission; the asked-once flag lives in prefs `rasi.push`.
  - Channel ids `rasi_default`, `rasi_invites`, `rasi_activity`, `rasi_reminders`, `rasi_digest`, `rasi_announcements`.
  - FCM manifest meta-data (default channel plus the new icon).
  - The new DeviceRegistry inbox memo.
  - No version bump: versionCode stays 6.
  - Compile gate: `cd apps/android && ./gradlew :app:assembleDebug`.
- **Blast radius**:
  - notifications dependents: programs, program-memberships, invites (FYI; `createNotification` is unchanged).
  - members dependents: program-memberships, notifications, invites, workout-logs, analytics, member-analytics (FYI; additive key).
  - people: new, no dependents.
  - Surfaces to keep in parity: web (N3, S2, plus web-only composer and privacy text) and iOS (N4, S3, plus iOS-only permission ask and icon badge). The Android-only items are sanctioned divergences: per-category channels, the monochrome status icon, launcher dots instead of a count, and the "Open Settings" / in-app permission flow.
- **Live-binary compat**:
  - This track changes no backend contract.
  - It depends on the N-SRV backend plus migration 011, and on the People S1 backend plus migration 012, being live on prod before Android is tested. Dev builds hit prod.
  - `PUT /device {"inbox":true}` flips this installation to the category channels. The channels are created in `App.onCreate` before any registration, so a post can't go to a missing channel.
  - Live Android 1.0.0 (4) and 1.1.0 (5) are untouched by client code. This build ships only in the single Phase 4 store release.
- **Doc↔code mismatches found**:
  1. People plan seams don't exist:
     - S-1 `canViewRoster`: the S0 module in the working tree (`apps/backend/utils/memberVisibility.js`) exports only `loadViewer, hasProgramAccess, canView, redactHealth, redactMetricsRow, requireMemberView`.
     - S-3 `getMemberTimeZone`: not in the Notifications plan, which provides `getTimeZones` in `services/notificationPreferenceService.js`.
     - S1's gate G0 will stop, which may delay the People contract Android builds against.
  2. People contract §F contradicts the Notifications contract:
     - §F says kudos arrives via `/unacknowledged`; Notifications C2 says kudos is non-legacy, so it reaches clients via `/inbox` and the `?inbox=1` stream only.
     - §F's push data has only `notification_id`, `type`, `program_id`; C5 adds `category` and `target`.
     - §F's title is "Kudos received"; C8 uses templated wording.
     - Android should follow the Notifications contract.
  3. DISCOVERY line refs have shifted: N-5 is now `ProgramContext.kt:564-700` and the `RootScreen` modal is at about 129-138. N-7 misses `HealthSyncNotifier.kt:49`, which also uses the launcher icon.
  4. The `NotificationsScreen.kt` header comment ("FCM registration is Phase I") is stale.
  5. The quick-wins Android edits and S0's backend + SPEC edits are uncommitted in the working tree. registry.json already shows members 0.4.0, member-analytics 0.5.0 and program-memberships 0.3.0, so the People plan's version predictions ("from today's labels") need re-basing.
- **Out of scope (explicitly)**:
  - web and iOS (parallel tracks); backend and migrations; the composer (web only); the app-icon badge (iOS only).
  - privacy-policy web text, the iOS `NSHealthShareUsageDescription`, and the store-console answers (user).
  - polish #10, #33, the Edit half of #40, #42, #44, #45.
  - streak semantics (F1/F14); version bumps.
  - `ProgramSections.kt` (the "View Members" row keeps `MEMBER_ROSTER`); the widget files.
  - SPEC and registry docs: orchestrator-owned, one docs commit at landing.
- **Open questions for the orchestrator**:
  1. **Read semantics (needs one answer for all three surfaces).** Does opening the inbox mark everything read (`{all:true}`), or only an item when it's tapped? D-N4/D-N5 allow either.
  2. **Global admins.** Today the left tab is "All Invites" with Revoke (A10). Is Inbox = all invites (with Revoke) plus the admin's own items?
  3. **Admin Members header.** Today it has only Invite. To give every role a People entry, do we add a second glass button (People) or replace Invite? Invite stays reachable from the Program tab either way.
  4. **"Open full stats" on Android.** There is no single member-detail screen. Options:
     - (a) set the Members "View as" to that member and switch to the Members tab — admins only; loggers' View-as only rescopes Recent and Health;
     - (b) a small new screen reusing the five member cards — needs one more new file.
     - Recommendation: (b).
  5. **Global-admin membership editor entry once the roster becomes People.** Recommendation: an "Edit membership" row on the profile, shown to global admins only.
  6. **`log_workout` target.** Reuse the root-level widget quick-add route (`WidgetRoute.QUICK_ADD_WORKOUT`; works with no program open), or the in-shell `SUMMARY_LOG_WORKOUT`? This needs to match iOS.
  7. **User decisions U-1, U-2, U-3** (People plan) gate `ActivityVisibilityNotice.kt`, the footnote wording, and when kudos goes live.
  8. **Toast home.** Is the toast a frontend-kit component (new D-KIT row, copy on all three) or local to each surface?
  9. **Inbox memo.** Confirm the re-register memo is a dedicated "inbox registered" flag, not the build-number memo C7.4 suggests.
