# PLAN VERDICT: OBJECTIONS (24)

# Phase 4 Notifications + People: cross-surface parity check

> Output of the parity-check over N-SRV, People S1 (rev 2), web Track C (rev 2), iOS Track C (rev 2) and Android Track C (rev 2), plus their verdicts.
> - Save this report as `plans/phase-4-np-parity.md`.
> - Save the amendments at the end as `plans/phase-4-np-amendments.md`.

**Result: 9 blocking and 15 advisory.**

The blocking ones, in short:
- **People S1 doesn't fit the shipped code.** It isn't built on the S0 visibility module and calls two seams that don't exist (`canViewRoster`, `getMemberTimeZone`).
- **S1's kudos notification contradicts N-SRV** C2, C5, C8 and D-C20, and S1's own test of it can never fail.
- **D-P2(a) gets three answers:** each surface puts the People entry on the Members tab differently.
- **Android leaves live items unread** while the inbox is open.
- **The phones drop A4's catch-up on `ready`;** web keeps it.
- **Both phones' push-tap routing reverses user decision U2** without asking.
- **Both phones' "Edit membership" can write another program's joined date.**
- **The toast is defined three ways,** and Android writes it into the kit as "the same on all three".

**What I checked:**
- The S0 code that shipped: `apps/backend/utils/memberVisibility.js`, `routes/analytics.js:20-34,138-201`, `services/memberAnalyticsService.js:5-23`, `services/memberService.js:17-45`, `middleware/auth.js:26-29`, `utils/rateLimit.js`, `utils/notifications.js` exports, `server.js:25-117`, `sql/README.md:87`, and `services/inviteService.js:17-30` (the `/my-invites` rule matches N-SRV `COUNTS_SQL`).
- iOS: `APIClient.swift:11-19`, `AppError.swift:134`, `ProgramContext+ProgramManagement.swift:6,114-121,170`, `ProgramContext+Members.swift:258-288`, `MyProfileView.swift:70-82`.
- Android: `RootScreen.kt:80-93`, `ProgramSections.kt:169-178`, `MembersScreen.kt:127,202`, `ProfileScreen.kt:207,367`, `Network.kt:31`, `AppError.kt:89`.
- Web: `members/page.tsx:1-40,259-273`, `program/page.tsx:146-171`, `kit/app-error.ts:79`.
- Docs: phase-3 amendments A4/U2, wave-A amendments SA1, phase-4 DECISIONS D-N1–17 / D-P1–11, frontend-kit §5/§6/D-KIT-8/13/17/19, `registry.json` versions, and DISCOVERY #32/#40.

**Contract fit that holds on all three clients:**
- C3/C4 field names and `?inbox=1`.
- `"inbox": true`: real JSON booleans on iOS (JSONSerialization) and Android (`encodeDefaults` off, `explicitNulls=false`).
- `X-Time-Zone`, C7.7, C5 channel ids and importances.
- The 011 and 012 SQL are independent of each other.

## 1. [blocking] S1's visibility extension ignores the shipped S0 module (S1 vs S0 code)

**Evidence:**
- `memberVisibility.js:94` exports `loadViewer, hasProgramAccess, canView, redactHealth, redactMetricsRow, requireMemberView`. There is no `canViewRoster` (S1 seam S-1).
- S0 already built the S1 hook:
  - kind `"workouts"` (:65-66) reads `viewer.hiddenMemberIds`;
  - `loadViewer` leaves `hiddenMemberIds` empty "for People S1" (:16-20, :36);
  - `routes/analytics.js:34` plus :138/:168/:179/:190/:201 already chain `requireWorkoutsView` on the five `?memberId` routes;
  - `assertMemberAccess` already checks `canView(…, "workouts")` (`memberAnalyticsService.js:20`).
- S1 step 8 adds a second predicate (`canSeeActivity`, kind `"activity"`, `requireActivityVisible`, `filterActivityRows`), and step 11 adds a second guard on the same five routes.
- Step 4 (G0) expects `function function none false` and will print `undefined…`, so it STOPs. Android's G-P note says the same.

**Failure:** the S1 build halts at G0. If someone adapts the seam instead, two rules answer one question. That breaks S1's own D-C2 ("one rule in one function") and S0's "the ONE rule", and a later fix to one rule leaves the other open.

**Fix:** amendment S1-1.

## 2. [blocking] The kudos day calls a time-zone seam that N-SRV doesn't ship (S1 vs N-SRV)

**Evidence:**
- S1 step 14 (`recipientLocalDate`) calls `notifications.getMemberTimeZone`. Seam S-3 expects it in `utils/notifications.js`, and G0 and 26(b) check for it.
- N-SRV step 15 leaves that file's exports unchanged. The zone lives in `services/notificationPreferenceService.getTimeZones` (step 8), and C8 freezes `getTimeZones` plus `utils/localTime.localParts`.
- N-SRV's risks say "People S1 must not edit `utils/notifications.js`". The iOS plan calls this "mismatch 2".

**Failure:** G0 STOPs. If it were bypassed, every give, undo and profile request would throw a TypeError and return 500.

**Fix:** amendment S1-2.

## 3. [blocking] The kudos notification contradicts N-SRV C2/C5/C8/D-C20, and S1's check of it can never fail

**Content:**
- S1 step 14 passes the fixed title `Kudos received` and the body `<member_name> gave you kudos in <Program>.`.
- C8 instead renders through `getContentProvider().render("activity.kudos_received", …)` (D-N17).
- `createNotification` never applies a template, so S1's fixed text would ship and N-SRV's KUDOS variants would never be used.
- C8 needs first names. `req.user` only has `username`, `member_name` and `global_role` (`auth.js:26-29`), and S1's membership include loads only `id, hide_activity`.

**Delivery:**
- S1 §F says kudos arrive through `/unacknowledged` and that push data carries 3 keys.
- Under D-C20, kudos never reach `/unacknowledged` or plain streams. C5 adds `category` and `target` to push data.

**Live binaries:**
- S1 §8, F3 and U-3 claim old apps show kudos as a blocking pop-up.
- That's false under D-C20: old apps get only a push banner (on `rasi_default` for Android devices without the inbox).

**Verification gap:**
- The step-28 matrix looks for the note in `/notifications/unacknowledged`, so it is always absent.
- "undo removed the unread notification" then passes with `note === undefined`, so the undo-deletes-notification behaviour is never actually tested.

**Fix:** amendments S1-3 and S1-4.

## 4. [blocking] People entry on the Members tab: three answers to D-P2(a) (web vs iOS vs Android)

**Evidence:**
- Web B10(d) uses `(PEOPLE_LIVE || !canViewAs)`, which adds a People pill beside the admins' existing Invite pill (`members/page.tsx:259-273`). Admins get two header actions.
- iOS keeps the admin header Invite-only (UA-1 default); admins reach People only from the Program tab.
- Android TC-3 swaps the admin's Invite button for People and moves Invite into People.
- Android's Program-tab row stays "View Members" (`ui/program/ProgramSections.kt:173`, which isn't in its brief), while web B11 and iOS 31(b) rename it "People".
- D-P2(a) says "roster becomes People via a header button". The Android plan says "web and iOS must give the same answer", and iOS verdict #8 asks for an explicit answer.

**Failure:** an admin's header opens People on a Pixel, invites on an iPhone, and shows two pills on web.

**Fix:** user decision NP-U1.

## 5. [blocking] Items that arrive while the inbox is open (Android vs web/iOS)

**Evidence:**
- Web W9 marks a live item read on arrival (`{ids}`).
- iOS TC2 reloads a visible inbox, which runs mark-all.
- Android step 15 `onStreamItem` inserts the item unread and never marks it. Its next mark-all also returns early on a stale cached `unread == 0` (Android verdict #8).

**Failure:** with the Inbox open on a Pixel, a role change arrives. The "+" badge and the "1 new" row go up while the member is looking at the item. On web or iPhone it is read immediately.

**Fix:** amendment R1.

## 6. [blocking] Catch-up after a stream gap (iOS/Android vs web; phase-3 A4)

**Evidence:**
- Binding rule A4 had clients re-fetch `/unacknowledged` on `ready`. That is how a role change or removal missed while the stream was down got applied.
- C7.3 retires that feed.
- Web A8 replaces it with a throttled catch-up on every start and every `ready` (programs, invites, active program, role queries), and its shared contract table requires the same of the phones.
- iOS step 10 `onReady` only calls `refreshInboxCounts`. Android 17(f) `onReady` only calls `refreshCounts`.
- Web `onStart` also skips `refreshInbox` (web verdict #3).

**Failure:** an admin is demoted while the phone reconnects (a deploy close, or Wi-Fi to cell). The phone keeps the admin UI until the next foreground; web catches up at once.

**Fix:** amendment R2.

## 7. [blocking] Push tap routes existing types, reversing U2 without a decision (iOS + Android)

**Evidence:**
- U2 (`phase-3-client-amendments.md:13`, user-approved; notifications D-C17(c)): "any other type acknowledges + re-fetches".
- N-SRV C7.6 says to route by `target`.
- iOS step 10 `handlePushTap` → `openTarget(.program)` → picker `applyProgram`, which closes the open program.
- Android 15 `open()` + 23(e) → `selectProgram` + navigate to SHELL.
- Neither plan records U2 as superseded (Android verdict #1).

**Failure:** inside program A's Log Workout form, the member taps "Your role in B is now logger". Both phones discard the form and open B.

**Fix:** user decision NP-U2, plus amendment R5.

## 8. [blocking] "Edit membership" can write another program's joined date (iOS + Android)

**Android** (verdict #2): `MemberManagementScreens.kt:234-237` keys the form on `memberId` only, and `selectProgram` never clears `_membershipDetails`.

**iOS** has the same bug, and the iOS adversary missed it:
- Step 25 picks the row with `programContext.membershipDetails.first(where: member_id == …)`.
- `membershipDetails` is not cleared on a program switch: `apply(program:)` at `ProgramContext+ProgramManagement.swift:6` and `ProgramPickerView.applyProgram:459` leave it alone; only :170, `+Members:39` and `+Session:139` clear it.
- `MemberDetailEditView` seeds `joinedAt` from that row, and `updateMembership` writes to the active `programId` (`+Members.swift:284-288`).

**Web** is unaffected: `/members/detail` loads the row for the active program.

**Failure:** a global admin views program A, switches to B, then opens People → X → Edit → Save. A's joined date is written into X's membership in B.

**Fix:** amendment R6.

## 9. [blocking] The toast is defined three ways (web vs iOS vs Android; frontend-kit)

**Evidence:**

| | Web A6 | iOS 14 | Android 20 |
|---|---|---|---|
| Duration | 6 s | 5 s | 4 s |
| Dismiss | × | × or swipe | tap the card |
| Blank title | — | — | `New notification` |
| How the plan classifies it | "web chrome" | notifications-local, "not a kit primitive" | writes **D-KIT-20 "the same on all three"** (frontend-kit MINOR) |

- iOS bumps frontend-kit only as a PATCH.
- Before preferences load, iOS's category gate falls back to `reminders`/`digest` = false. Web (`!== false`) and Android (`?: true`) show the toast.

**Failure:** the kit records a rule that two surfaces break, and a reminder toast shows on web and Android but not on iOS until preferences load.

**Fix:** amendment R3.

## 10. [advisory] Notification copy differs on every surface

The differences:
- **Category hints:** program, reminders, digest and announcements are worded three ways.
- **Opt-in note:** three wordings.
- **Reminder-time hint** and **settings subtitle:** web has none.
- **Inbox subtitle:** "Invites and notifications" (web) / "Your notifications and invitations" (iOS) / "Invites and updates" (Android).
- **Section headers:** Android uses "Program invitations" and "Updates".
- **Empty state:** Android says "You're all caught up".
- **Paging:** Android says "Show more".
- **Time labels:** web uses absolute `toLocaleString`; the phones use relative times.
- **Account row:** web shows a fixed subtitle plus a count pill; the phones say "<n> new".

**Fix:** R7.

## 11. [advisory] People copy and presentation differ

The differences:
- **Empty list:** Android says "No members yet."
- **Search:** web matches the name only; the phones also match the username.
- **Last-active line:** "Last active Oct 12, 2026" (web) / "Active Oct 12" (iOS) / "Last active Oct 12" (Android).
- **Stat label:** "This month" + "N days" (Android) vs "Active days this month" + a number (web, iOS).
- **Kudos count:** iOS says "N kudos received"; web and Android say "N kudos".
- **Undo:** web has a separate Undo button; the phones tap again.
- **Hint:** iOS "Tap again to undo." / Android "You gave kudos today. Tap again to undo." / web none.
- **Membership row:** web says "Manage membership".
- **Staff-row subtitles** truncate at 360dp (Android verdict #5).

**Fix:** R8.

## 12. [advisory] Copy for 429 (rate limited)

- All three kits map 429 to "busy right now" (`AppError.swift:134`, `AppError.kt:89`, `app-error.ts:79`).
- Only web's KudosButton has its own 429 message; iOS and Android show the kit copy.
- Web's composer has no 429 copy, so a 10-per-hour send limit reads "try again in a moment" (web verdict #6).

**Fix:** R9.

## 13. [advisory] Badge fallback and the "+" sheet's starting tab

**Badge fallback before counts load:**
- iOS uses `inboxCounts?.badge ?? pendingInvites.count`. For global admins, `pendingInvites` holds every invite in the system (`fetchAllInvites`, `ProgramContext+ProgramManagement.swift:116-117`).
- Web and Android use 0 for global admins.

**Starting tab:**
- Web: Inbox when badge > 0.
- iOS: Inbox when badge > 0 or any listed invite exists.
- Android: Inbox when badge > 0, any invite exists, or the member has a join request.
- Web also picks the tab before the counts have loaded (web verdict #4).

**Fix:** R4.

## 14. [advisory] Activity notice

- **Seen flag:** iOS keeps one per device; web and Android keep one per member.
- **Already hidden:** only web skips the notice when the member is already hidden.
- **Stacking:** Android's picker notice can stack on the first-sign-in `POST_NOTIFICATIONS` prompt (`RootScreen.kt:86-93`) and on the Health Connect review (Android verdict #12). iOS orders these (TC13) but checks only once (iOS verdict #2).

**Fix:** R10.

## 15. [advisory] Hide my activity

**Missing echo** (a 200 response with no `hide_activity` field):
- Web treats it as saved: B3 uses `data.hide_activity ?? hide`, and B8 calls `remember()` on any 200.
- iOS and Android treat it as a failure.

**Placement:**
- Web and iOS put the switch directly above "Sign out everywhere" (`MyProfileView.swift:77-80`).
- Android puts it before the Email section (`ProfileScreen.kt:207`), but "Sign out everywhere" is at :367.

**Fix:** R11.

## 16. [advisory] Inbox error and empty states

- Offline with no data, web and iOS show two error views, one for invitations and one for notifications (iOS verdict #13).
- Android uses bespoke text, "Couldn't load updates · Retry", which breaks D-KIT-19.
- With invitations but no notifications, web and iOS show the empty card; Android shows nothing.

**Fix:** R12.

## 17. [advisory] S5 Members-tab recipe

- **Web B10(c)** shows a page-level ErrorView when *any* query failed with no data, even above cards that loaded, and it counts `membersQuery` for plain members (web verdict #7).
- **iOS and Android** show the ErrorView only when everything failed, and use the stale banner for a partial failure. That matches D-KIT-13.
- **Failed-card text:** iOS shows "Couldn't load this"; web and Android show "—", which is what D-KIT-13 specifies.
- **A logger's "Open full stats":** web opens the workouts list (W6); the phones open the five-card screen.

**Fix:** R13.

## 18. [advisory] A `program` target that is already open

- Web `openProgram` always navigates to `/summary`; iOS and Android stay where they are.
- On Android, the inbox row for the current program has a dead chevron (Android verdict #6).

**Fix:** R5.

## 19. [advisory] Where a `log_workout` target returns

- Android TC-6 returns to where the member was.
- iOS's quick-add save path goes back to My Programs (`exitToMyPrograms`, iOS verdict #7).
- Android's plan says "iOS must match".

**Fix:** R14.

## 20. [advisory] D-N12 and D-N14 are applied differently from their wording, but the surfaces agree with each other

- **Permission prompt:** iOS UA-2 asks at the first signed-in start, including a restored session. That equals Android's existing `LaunchedEffect(signedIn)` (`RootScreen.kt:86-93`).
- **App-icon badge:** iOS UA-3 (a per-device badge) equals N-SRV D1.
- Both differ from the decisions' literal text, so they need an explicit yes (NP-U3, NP-U4).

## 21. [advisory] U-W1 is a question for all three surfaces

- The phones send `X-Time-Zone` and get reminders too, and their Privacy rows open the web policy (#48).
- Web's default answer ("no") would leave the time zone undisclosed on all three.

**Decision:** NP-U6.

## 22. [advisory] Server coordination between N-SRV and S1

**`server.js`:**
- Both plans insert after :30.
- S1's anchor at :117 moves once N-SRV lands.
- S1 step 7 says `models/index.js` is shared, but N-SRV D2 never touches it, so there's no conflict there.

**012 vs 011:**
- S1's README row says "Independent of 011". That holds for the SQL only.
- S1's code needs 011 on the schema, because the kudos transaction reads `notification_preferences` and calls `getTimeZones`.

**Table count:** `sql/README.md:87` says "18 after 010". N-SRV changes it to 21; S1 must add "22 after 012".

**S1's coverage guards will STOP on N-SRV's additions:**
- 4 new GET routes: inbox `/`, `/unread-count`, preferences `/`, announcements `/`. That makes 39, not 35.
- `services/memberActivityStats.js` becomes a new reader of `workout_logs`.

**Fix:** S1-5.

## 23. [advisory] Version and D-rule ID collisions

- notifications 0.7.0 is claimed by web A and by Android.
- people 0.2.0 is claimed by web B and by Android.
- invites: web says PATCH; iOS and Android say MINOR (web verdict #5 says MINOR).
- frontend-kit: iOS says PATCH; Android says MINOR.
- observability: Android sends `X-Time-Zone` too but predicts no bump.
- "Next D-C id" in notifications and people is claimed by four tracks.

**Fix:** §5 of the amendments.

## 24. [advisory] Quick-wins and Wave C

- **Quick wins are committed:** web `095d864`, iOS `53f2e5d`, Android `82b7297`.
- All three plans anchor on that HEAD and keep #2, #5, #8, #10, QA2, QA4, QA7 and #48 (BrandMark). There is no collision.
- **Wave C (#9–#45) isn't planned yet** and will touch the same client files.
- #32 is delivered here (S5), and so is the badge half of Android #40.

**Fix:** §5 of the amendments.

## Uncovered

- **Delivered notifications stay in the tray** after the inbox marks them read, on both phones. Android verdict #10 points to launcher dots.
  - Recommendation: on a successful mark-all, iOS removes delivered remote notifications (those whose userInfo has `notification_id`), and Android cancels its posted FCM notifications by id/tag.
- **No surface says when a category is switched on in the app but off at the OS level** (an Android channel disabled, or iOS notifications off).
- **Streaks can disagree.** Reminder, digest and `{streak}` count across programs and reset after a skipped day (N-SRV F14). The People profile and the Members cards count per program and never reset (S1 F1). A member can see "5-day streak" in a reminder and "9 days" on their profile. Cross-reference F14 and F1 in both SPECs.
- **The People search query is lost** on a profile push and back (Android verdict #11). It should survive navigation on all three.

> Amendments: [`phase-4-np-amendments.md`](phase-4-np-amendments.md).
