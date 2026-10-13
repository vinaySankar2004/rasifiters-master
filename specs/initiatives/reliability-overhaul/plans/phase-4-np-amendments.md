# Phase 4 Notifications + People: approval amendments (all five tracks)

> **Status: PENDING user approval.** Once approved, this file is binding. Implementers apply it on top of their track's `plan.md`; where a plan and this file disagree, this file wins.
> - Evidence: [`phase-4-np-parity.md`](phase-4-np-parity.md) (P#) and each track's `verdict.md`.
> - For every verdict objection not named here, the orchestrator takes the verdict's fix.
> - Shared docs stay orchestrator-owned.

## 1. User decisions

If the user approves without comment, the recommended option applies.

| # | Decision | Recommended |
|---|---|---|
| NP-U1 | People entry on the Members tab (D-P2 a) | **One header action, People, for every role, on all three.** iOS swaps the admin header's `envelope.badge.person.crop` GlassButton for `person.2` → `PeopleListView` (a swap, not a new button). Web shows the People pill *instead of* the Invite pill for admins when `PEOPLE_LIVE`. Admins' Invite moves to an "Invite member" row at the top of People (program admins and global admins) and stays on the Program tab. The Program-tab row reads "People" on all three. Supersedes iOS UA-1. |
| NP-U2 | Push tap / toast "View" for the existing program types | Route by `target` (C7.6) on all three, with the R5 guards. This supersedes phase-3 U2 and notifications D-C17(c). *Alternative:* keep U2, so existing program types only mark read and refresh, while invites, `inbox`, `log_workout` and the new types route. |
| NP-U3 | Phone permission prompt (D-N12) | Once per install, at the first signed-in start (sign-in **or** a restored session), on both phones. This is iOS UA-2 and Android's current behaviour. |
| NP-U4 | App-icon badge now (D-N14) | Yes, per device: only installs registered with `inbox: true` get `aps.badge` (N-SRV D1, iOS UA-3). |
| NP-U5 | People U-1 / U-2 / U-3 | U-1 (b), the notice. U-2: Activity ON (N-SRV's default). U-3: People goes live with the store release. Old apps never pop up kudos (P3), so the reason is the consent notice and one release. |
| NP-U6 | Privacy policy covers the time zone and opt-in reminders, digest and announcements (web U-W1) | Yes. It's one policy for all three surfaces, so web A19 ships in Pass A. |

## 2. Server (N-SRV + S1)

S1 is re-planned as **revision 3** against this section. Re-run plan-adversary on it, then the clients diff their People DTOs against rev 3 (web E4, iOS §F, Android G-P) before building People.

| # | Rule |
|---|---|
| S1-1 | **Build on S0's hook; no second rule.** See the breakdown below this table. |
| S1-2 | **The zone seam is C8.** In kudosService: `const { getTimeZones } = require("./notificationPreferenceService"); const { localParts } = require("../utils/localTime"); const recipientLocalDate = async (id) => (localParts((await getTimeZones([id])).get(id) || "UTC") \|\| localParts("UTC")).date;`. Delete `localDateIn` and its boot-check line. `utils/notifications.js` is not edited. The seam table, G0, people SPEC §4.3 and D-C11 cite `getTimeZones`. |
| S1-3 | **Kudos content comes from C8.** Load first names: the membership include's attributes become `["id", "first_name", "hide_activity"]`, plus `Member.findByPk(giver.id, { attributes: ["first_name"] })`. Inside the insert transaction, call `getContentProvider().render("activity.kudos_received", { first_name, actor_first_name, day_label: dayLabel(kudosDate, kudosDate) }, \`${recipientId}\|${giver.id}\|${kudosDate}\`)` and pass the resulting title and body to `createNotification`. People D-C5 and the notifications SPEC row cite C8, not fixed text. |
| S1-4 | **Contract text and checks.** See the breakdown below this table. |
| S1-5 | **Coordination.** See the breakdown below this table. |
| N-1 | No N-SRV code change. Its docs record C8 as the only People seam and `utils/notifications.js` exports as unchanged. |

**S1-1 in detail:**
- **`loadViewer`** fills `hiddenMemberIds` with one query: the program's active members whose `hide_activity = true`. Skip the query for staff and global admins.
- **The activity rule** is `canView(…, "workouts")`.
- **People list, profile and kudos** use `loadViewer` + `hasProgramAccess` (in place of `canViewRoster`) + `canView(…, "workouts")`.
- **`getMemberMetrics`** omits rows where `!canView(viewer, row.member_id, "workouts")`, keeping S1's "omit, never zero" rule. Update S0's header comment, which says "redaction", to say rows are omitted.
- **`getSummary`** filters `top_performers` with the same `canView`, and every caller passes the user.
- **The five analytics routes:** `requireWorkoutsView` stays the only guard. `requireMemberView` gains an optional `code` argument, and the "workouts" guard returns `{ error: "This member keeps their activity private.", code: "activity_hidden" }`. `assertMemberAccess` uses the same message.
- **`hide_activity` in GET `/members/:id`** is gated by `canView(viewer, id, "email")`.
- **Rewrite** G0, boot check 26(b) and matrix rows #5–9 for these names.

**S1-4 in detail:**
- **§F:** delivered through GET `/notifications/inbox`, the `?inbox=1` stream and push. Push data per C5 adds `category: activity` and `target: inbox`. Kudos **never** appear on `/unacknowledged`.
- **§8 / F3:** live binaries get a push banner only; there is no pop-up.
- **Matrix step 28:** read `GET /notifications/inbox?limit=50`. Find the item with `type === "activity.kudos_received" && actor_member_id === P.id`, and assert the note exists **before** asserting undo removed it.

**S1-5 in detail:**
- `server.js` lines are added by text anchor after N-SRV's lines; N-SRV lands first.
- `sql/README.md`: the count becomes "22 after 012".
- The 012 README row says: "SQL independent of 011; S1 code requires 011 on the schema first".
- The GET inventory gains rows for inbox `/` and `/unread-count` (self only), preferences `/` (self only) and announcements `/` (global admin only); the total becomes 39.
- Coverage guard (d) gains `services/memberActivityStats.js`, classified as: the recipient's own activity in their own notification, plus the global-admin preview.

## 3. Shared client rules (web · iOS · Android)

| # | Rule |
|---|---|
| R1 | **Reading (D-N5).** A visit whose first page loaded marks everything read with one `{all:true}`. Decide that from the loaded page (any `read_at == null`) or a non-zero cached `unread`, never from the cached count alone. An item that arrives **while the inbox is on screen** is marked read on arrival (`{ids:[id]}`). An inbox that isn't on screen marks nothing. Visibility comes from iOS `isVisible`, web's mounted list, and a new Android flag `NotificationInbox.inboxVisible` that `InboxList` sets via `DisposableEffect`. Unread dots stay for the whole visit: each surface keeps a per-visit set of new ids. |
| R2 | **Catch-up** (replaces A4's "/unacknowledged on ready"). On every stream `ready` and every foreground start, at most once per 5 s: refresh the unread counts, the inbox (if on screen), invites and programs. If the active program's role or status changed, or the program is gone, re-read the role-dependent data. See the per-surface list below this table. |
| R3 | **Toast = frontend-kit D-KIT-20** (recorded with web Pass A; an exception to D-KIT-8). See the full definition below this table. |
| R4 | **Badge and the "+" sheet.** The badge is the server's `badge` for every role, capped at "99+". Until counts load: the member's own pending invites, and 0 for global admins (iOS: `inboxCounts?.badge ?? (isGlobalAdmin ? 0 : pendingInvites.count)`). The tab is picked when the sheet opens: Inbox if badge > 0 or the sheet was opened by an `invites`/`inbox` target, otherwise Create. If the sheet opens before counts load, decide once they arrive, unless the user already switched tabs. iOS `hasInboxActivity` becomes `inboxBadgeCount > 0`; Android drops `invites non-empty \|\| hasRequests`. The invites SPEC records that global admins' badge counts only their own invites, while the inbox lists every invitation with Revoke. |
| R5 | **Routing (per NP-U2).** A push tap, a toast "View" and an inbox row all mark the item read, then route by `target` (unknown → inbox). Guards on all three: if the target program is already active and a program screen is showing, stay put and only refresh (web `openProgram` adds this check; on Android the current-program row closes the inbox and returns to the shell, Android verdict #6). Navigation never discards an open form or cover: iOS keeps its `isFullScreenCoverUp` skip, and Android only marks read when the current root route is a quick-add or widget form. Mark D-C17(c) as superseded. |
| R6 | **Edit membership from a profile** is shown and editable only after this screen's own membership-details load for the profile's program has finished. iOS: `PersonProfileView.load()` awaits `loadMembershipDetails()` when `isGlobalAdmin` and records `detailsProgramId`; the row shows only when that equals `profile.programId` (this also fixes iOS verdict #5). Android 39(d): render the form only when `loaded` is true, and key `remember` on `(memberId, loaded)`. |
| R7 | **Notification copy:** the table below. |
| R8 | **People copy:** the table below. |
| R9 | **429.** Kudos, on all three: `You've changed kudos too many times. Try again later.` Composer preview and send (web): `You've reached the announcement limit. Try again later.` Everything else goes through the kit. |
| R10 | **Activity notice.** The seen flag is **per member** on all three; iOS uses the key `people.activityVisibilityNoticeSeen.<memberId>`. Skip the notice when the member's `hide_activity` is already true (iOS `fetchHideActivity`, Android `fetchMember().hideActivity`). It counts as seen only once the choice actually landed. On the phones it never shows before the OS permission prompt has been answered, and never over the health review or a form. Android defers it while `health.pendingConfirmation != null` and until the `POST_NOTIFICATIONS` result. iOS also re-checks on changes to `pendingSyncConfirmation` and `widgetRoute` (iOS verdict #2). |
| R11 | **Hide my activity** sits in My Profile directly above "Sign out everywhere" on all three. Android moves `HideActivitySection` to just before the block at `ProfileScreen.kt:367`. A 200 response without the `hide_activity` echo is a **failure** on all three: web B3 and B8 throw when `data.hide_activity === undefined`. |
| R12 | **Inbox states.** While the notification list itself has failed, hide the invitations error, so the screen shows one kit ErrorView. If the list failed but invitations show, put a kit ErrorView in the Notifications section; Android drops "Couldn't load updates · Retry". When there are no notifications, show the empty card even if invitations are showing. |
| R13 | **S5 (D-KIT-13).** Show the ErrorView + Retry only when nothing for this program or member has loaded. On a partial failure, keep the loaded cards, show "—" in the failed ones, and show "Couldn't refresh · Retry". Never show another program's or member's numbers. Web B10(c): `dashboardError` only when no card has data, and count `membersQuery` only when `canViewAs \|\| canViewAsLogger`. iOS: `MemberCardFailure` shows "—". A logger's "Open full stats" on web opens the workouts list: record that as a sanctioned web divergence in the people SPEC. |
| R14 | **`log_workout`** opens the quick-add form over the current screen; save or close returns there, and the program stays open (Android TC-6). iOS: add `QuickAddWorkoutWidgetEntryView.swift` to the iOS brief and skip `exitToMyPrograms` when the form was opened from a notification. Web keeps `/summary/log-workout`. |

**R2 per surface:**
- **Web:** `onStart` also calls `refreshInbox()`.
- **iOS:** `onReady` → `refreshInboxCounts()` + `loadPendingInvites()` + `loadLookupData()` + (when a program is open) `loadMembershipDetails()`, behind a 5-s guard.
- **Android:** `onReady` and `onForeground` → `refreshCounts()` + `loadInvites()` + `loadPrograms()` + (when a program is active) `loadMembershipDetails()`, behind a 5-s guard.

**R3, the toast (D-KIT-20):**
- Position: top, under the status bar.
- Size and look: max width 520, banner chrome.
- Content: `<title>` (blank → `New notification`) · `View` · ×. Tap targets are at least 44pt / 48dp.
- Duration: **5 s**. The newest toast replaces the previous one.
- "View" marks the item read and routes it (R5). × or the timeout only hides the toast; the item stays unread.
- Shown only if `categories[category] !== false`. Missing preferences or an unknown key → show.
- Never shown over a modal or sheet, or while the Inbox is on screen. Announced politely to screen readers.
- Per surface:
  - **Web:** 6000 → 5000 ms, plus the blank-title fallback.
  - **iOS:** blank-title fallback; the category gate falls back to *show*; no toast and no root Inbox sheet while an `InboxView` is visible (iOS verdict #6); move `.animation` inside the overlay (iOS verdict #3).
  - **Android:** 4000 → 5000 ms; add a × IconButton; suppress the toast while `inboxVisible`.

**R7, notification copy** (identical on all three; casing follows each surface's idiom):

| Element | Text |
|---|---|
| Settings subtitle / section | `Choose what RaSi Fiters notifies you about.` · `Notify me about` |
| program | `Program & invites` · `Invites, role changes and updates to your programs.` |
| activity | `Activity` · `Kudos from people in your programs.` |
| reminders | `Reminders` · `One reminder a day around your chosen time, only if you haven't logged a workout that day.` |
| digest | `Weekly digest` · `A recap of your past week, every Monday morning.` |
| announcements | `Announcements` · `News and messages from the RaSi Fiters team.` |
| Note under the switches | `Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, you get no alert, but they still appear in your Inbox.` |
| Reminder time | `Reminder time` · phones: `Uses your phone's time zone.` · web: `Uses your time zone: <zone>.` (web's `webNote` stays) |
| Inbox | `Inbox` · `Invites and notifications`. Sections: `Invitations` (global admins: `All invitations`) · `Notifications`. Empty: `No notifications yet` · `Program updates, kudos, reminders and announcements show up here.` Paging: `Load more` / `Loading…` (iOS keeps load-on-scroll). |
| Times | `Just now` · `5m ago` · `3h ago` · `Yesterday` · `Oct 12` · `Oct 12, 2025` |
| Account row | `Inbox` · `<n> new` when badge > 0, otherwise `Invites and notifications` (web keeps its count pill) |
| "+" sheet tabs / toast | `Inbox` · `Create` / `<title>` · `View` |

**R8, People copy:**

| Element | Text |
|---|---|
| List | `People` · `Search people` (matches name or username) · `No one in this program yet.` · `No one matches your search.` |
| Invite row (NP-U1) / Program-tab row | `Invite member` · `Send an invite by username` / `People` · `<n> enrolled` |
| Row status | `Active today` · `Active yesterday` · `Last active Oct 12` · `Last active Oct 12, 2025` · `No workouts yet` · `Activity hidden` |
| Markers | `You` · `Admin` · `Logger` (plain members get no marker) |
| Hidden profile | `This member keeps their activity private.` |
| Stats | `Current streak` / `Longest streak` → `N days`; `This month` → `N days`; `Last active` → `Today` / `Yesterday` / `Oct 12` / `—` |
| Recent workouts | `Recent workouts` · `No workouts logged yet.` |
| Kudos | `N kudos`. One toggle: `Give kudos` ↔ `Kudos given` (web drops its separate Undo button). When given: `You gave kudos today. Tap again to undo.` |
| Staff rows | `Open full stats` · `History, streaks, health`. Global admins: `Edit membership` · `Joined date, status, remove` |
| Hide switch / notice | Unchanged (already identical on all three) |

## 4. Track-specific fixes

**Web (Track C):**
- Apply NP-U1 in B10(d), and add the Invite row to `PeopleList` for program admins.
- Apply R2, R3, R4 (deferred tab choice), R5, R7, R8 (username search, kudos toggle, "Edit membership", formatted dates), R9, R11, R12 and R13. Apply A19 per NP-U6.
- Web verdict #1: detect open modals by the presence of `.modal-surface` elements, not the body class.
- Web verdict #2: if N-SRV is reverted, roll web back first.
- Web verdict #7: `refreshQueriesFor` runs the general refetches only for `program.*` types.

**iOS (Track C):**
- **iOS verdict #1 (blocking).** Both Members tabs skip their reconnect and `members.count` reloads while `memberCardsOwner` is neither nil nor `membersTab`. Single `loadMember*` calls made outside `loadMemberCards` set `memberCardsOwner = nil`.
- Apply NP-U1 (header swap and the People Invite row), R2, R3, R4, R5, R6, R7, R8, R9, R10, R12, R13 and R14.
- iOS verdict #4: skip `foregroundPushReceived` while the stream is connected.
- iOS verdict #12: add `Tabs/MemberCardsState.swift` to the brief.
- iOS verdicts #9–#11: as written.

**Android (Track C):**
- Add `ui/program/ProgramSections.kt` to the brief: change "View Members" to "People".
- Apply R1, R2, R3, R4, R5, R6 (verdict #2), R7, R8, R9, R10 (verdict #12), R11 and R12.
- Android verdict #3: if gate G-P fails, the **whole** track stops, because People symbols are wired into 17(f/j), 24(d), 30 and 38(b).
- Android verdict #4: use the M3 `TimePicker` inside an `AlertDialog`.
- Android verdict #9: call `ensureMembersLoaded()` inside the `reload.tick` effect.
- Android verdict #10: cancel posted FCM notifications on a successful mark-all.
- Android verdict #11: keep the People search with `rememberSaveable`, and add the docs listed in that verdict.

**N-SRV:** no change beyond N-1. **S1:** §2.

## 5. Orchestrator

**Order:**
1. N-SRV: 011 on staging, then public, then deploy.
2. S1 rev 3. 012 already runs on both schemas first.
3. Web Pass A (gate A).
4. People parts of web Pass B, iOS and Android (gate: S1 live and the G-P diff done).
5. Wave C. It drops #32 and the badge half of Android #40, and is built after Track C on any shared file.

**Expected versions,** by docs commit in that order (git-version confirms each with the user):

| Docs commit | Bumps |
|---|---|
| N-SRV | notifications 0.6.0 · programs 0.3.0 · observability 0.4.0 |
| S1 | people 0.1.0 · members 0.5.0 · member-analytics 0.7.0 · analytics 0.6.0 · analytics-v2 0.3.0 · notifications 0.6.1 |
| Web A | notifications 0.7.0 · invites 0.3.0 · frontend-kit 0.5.0 (D-KIT-20) · observability 0.4.1 |
| Web B | people 0.2.0 · member-analytics 0.8.0 (the S5 recipe, written once for all three) |
| Phones (one commit) | notifications 0.8.0 · people 0.3.0 · invites 0.3.1 · frontend-kit 0.5.1 · member-analytics 0.8.1 · observability 0.4.2 · apple-health 0.8.1 · health-connect 0.3.1. members: FYI, no bump. |

**D-rule IDs,** assigned once:
- **notifications:** D-C19–D-C28 (N-SRV), D-C29 (S1 kudos emitter), D-C30 (R1–R5, R7 and the web realization), D-C31 (iOS + Android realization). D-C17(c) and A4's re-fetch clause are marked superseded.
- **frontend-kit:** D-KIT-20 (web A).
- **people:** D-C1–D-C12 (S1), D-C13 (R8/R10/R11 and web), D-C14 (phones).
- **invites:** one new D-rule (web A) covering the Inbox tab, the global-admin badge and C7.7.

**Key paths:**
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/memberVisibility.js`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberAnalyticsService.js`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+ProgramManagement.swift`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Members.swift`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/program/ProgramSections.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/program/ProfileScreen.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/RootScreen.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/members/page.tsx`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`

## 6. People server S1, revision 3 (orchestrator, 2026-10-13)

`phase-4-p-server/plan.md` is now revision 3. Its review is clean: 0 blocking, 4 advisory. Revision 2 is kept as
`plan-rev2.md` / `verdict-rev2.md`.

| # | Amendment |
|---|---|
| S1R-1 | **Verdict #1.** The hidden-member query reads **active** memberships only, as S1-1 says. Drop "What changed #7" and the "any membership status" wording from people D-C2, program-memberships D-C6 and §4.1. Every output is already active-only. |
| S1R-2 | **Verdict #3.** Add to Risks and to people SPEC §8: "If N-SRV is reverted, revert S1 first or in the same revert (S1 requires N-SRV modules at boot). The 012 column and table stay." |
| S1R-3 | **Verdict #4.** Matrix: the "someone else's flag → 403" check asserts the exact `You can only update your own profile.` message. The global-admin branch is recorded as unverified on staging, and the step-25(b) boot check gains a stub assertion of the guard's condition. |

## 7. Versions, tags and D-rule IDs across all Phase 4 waves (orchestrator)

Every version number, tag and new D-rule ID in the Phase 4 plans and amendments (this file and
`phase-4-polish-amendments.md`) is **provisional**. The orchestrator assigns them at each docs commit, in landing
order: the next free version and ID at that moment. This keeps the git-version tags invariant and the
"assigned once" rule. Implementers don't write version numbers or new D-rule IDs into SPECs, because docs belong to
the orchestrator. In code comments, cite the rule by name (for example "the toast rule"), not by number.
