# PLAN VERDICT — OBJECTIONS (13)

1. **[BLOCKING] TC5 still lets another member's numbers into the cards.** The owner token only works if every screen that writes the shared card state checks it first. The plan's own Members tabs don't: their reload-on-reconnect handlers run while a different screen owns the state.
   - **Evidence:**
     - Plan step 33 (`StandardMembersTab`): `.onChange(of: programContext.isOnline) { if online, loadState.error != nil { loadUserData() } }` sits on the tab's outer view, so it fires while `MemberFullStatsView` is pushed in that same stack. `loadUserData()` then sets `memberCardsOwner = membersTab` and loads self into `selectedMemberOverview`, `memberHistory`, `memberStreaks` and `memberRecent`.
     - Step 27 (`MemberFullStatsView`) re-checks the owner only in `.task` (on appear) or when its own `loadState` has an error. Its owner field is deliberately not published (step 8b), so it never notices the takeover.
     - Step 32 (`AdminMembersTab`) has the same reconnect handler, plus a `members.count` handler that calls `applySelection`, while `AdminHomeView` stays alive under the People push.
     - Separately, `ActivityTimelineDetailView.swift:216-223` reloads member X's week history in a `.onDisappear` Task without checking the owner. That write can land after the Members tab has already reloaded self.
   - **Failure scenario:**
     1. A logger opens the Members tab. One of the four reads times out, so `loadState` is `.stale` with an error.
     2. They go People → X → Open full stats. X loads fine and the owner becomes X's screen.
     3. The phone briefly drops connection and comes back.
     4. `StandardMembersTab` reloads the logger's own data into the shared state.
     5. `MemberFullStatsView`, titled with X's name, now shows the logger's overview, history, streaks and recent workouts as `.loaded`, with no banner.

     This is the plan's own user test ("never the other member") failing, and it reopens revision-1 BLOCKING #3.
   - **Fix (inside the brief):**
     - In both Members tabs, skip the reconnect and `members.count` reloads when `memberCardsOwner` is neither nil nor `membersTab`; let `onAppear` do the reload instead.
     - In `ProgramContext+Members`, have the single loaders clear `memberCardsOwner` (set it to nil) whenever they are called from outside `loadMemberCards`, so late or unowned writes force a placeholder-and-reload.

2. **[ADVISORY] The visibility notice can block screens AppRootView presents later.** `canPresentRootAlert` is checked once (step 9). The same `sessionDidBecomeActive` call also starts `HealthSyncEngine.trigger(.launch)`, so `pendingSyncConfirmation` can be set after the alert is already up.
   - Phones with Apple Health workout sync on are exactly the group the notice targets.
   - The Apple Health review full-screen cover then can't present from AppRootView (`AppRootView.swift:135-142`) and can stay stuck.
   - The same thing happens with a cold-launch reminder tap: the picker sets `widgetRoute` 0.5 s later, after the alert is up.
   - Fix: show the notice only once the health sync has settled, or re-check in an `onChange` of `pendingSyncConfirmation` / `widgetRoute`.

3. **[ADVISORY] The toast's animation applies to the whole app.** In step 14, `.animation(.spring…, value: context.toastItem?.id)` wraps `content.overlay(…)`, which is all of AppRootView.
   - If a toast is showing at sign-out, `resetInboxState` clears it in the same update that swaps the signed-in and signed-out views, so the whole swap springs.
   - Fix: put the animation inside the overlay content only.

4. **[ADVISORY] A foreground push refreshes everything twice.** With the stream connected, `willPresent` posts `remoteReceived` (step 13) and the stream delivers the same item (step 10).
   - Each path runs `refreshInboxCounts`, `refreshData` (`loadLookupData` is 3 GETs) and bumps `inboxRevision`, so every request runs twice.
   - Fix: skip `foregroundPushReceived` while `NotificationStreamClient.isConnected` is true.

5. **[ADVISORY] Global admins lose a way to refresh the membership editor.** The "Edit membership" row in `PersonProfileView` looks the member up in `programContext.membershipDetails`.
   - The deleted roster's pull-to-refresh was what reloaded that list (`MemberManagementSection.swift:106-108`).
   - People comes fresh from `/people`, so a member who joined since the last foreground or `member_joined` event shows in the list but has no Edit row, and pull-to-refresh on People or the profile doesn't fix it.
   - Fix: call `loadMembershipDetails()` inside `PeopleListView.load()` when the viewer is a global admin.

6. **[ADVISORY] A second Inbox can open over the first.** `openTarget(.inbox)` only checks `showInboxSheet` and whether a modal is up.
   - With the account-menu or Program-tab Inbox already on screen (a navigation push, not a sheet), the toast's "View" opens a duplicate root Inbox sheet over it.
   - Fix: suppress the toast, or skip the sheet, while an `InboxView` reports itself visible.

7. **[ADVISORY] A reminder still pops the open program after logging.** Step 16(6) deliberately keeps the program open for `.logWorkout`.
   - But `QuickAddWorkoutWidgetEntryView.swift:588-592` (`exitToMyPrograms` sets `returnToMyPrograms = true`) pops it after a successful save.
   - Either accept this and say so in the inbox/people page SPECs, or note it in the user test list.

8. **[ADVISORY] Defaults override three of the user's locked decisions if they approve without comment.** Each is escalated to the user, but "built unless the user picks the alternative" means silence changes a locked decision.
   - **UA-3** (badge ships now) departs from D-N14's literal "only after old iPhone apps are required to update".
   - **UA-1** (no header button for admins) departs from D-P2(a) "header button for every role".
   - **UA-2** reinterprets D-N12 "after the first sign-in" to include session restore.
   - Ask for explicit answers to these three.

9. **[ADVISORY] Some line numbers and versions are out of date.**
   - Step 22(c) cites :84 / :86; the closing `.padding(.top, 8)` and `Spacer()` are at `NotificationsSettingsView.swift:86` and `:88`.
   - Step 31(b) says :23–33; the block is :23–34.
   - The quoted text is unambiguous in both cases.
   - The brief's versions are behind: member-analytics is now 0.6.0 and frontend-kit is 0.4.0.

10. **[ADVISORY] Some version bumps are predicted too low.** Per `git-version` SKILL.md:46-48, newly documented behaviour and `reference_impl` changes are MINOR.
    - frontend-kit (D-KIT-17 gains the root Inbox sheet) is predicted PATCH but looks MINOR.
    - members (iOS now reads and writes `hide_activity`) is predicted PATCH but looks MINOR.
    - observability is MINOR too if iOS files join its `reference_impl`.

11. **[ADVISORY] The shared copy table is not settled before building.** OQ7 asked for one cross-surface copy table before implementers start.
    - The plan fixes iOS copy as binding and leaves reconciliation for later.
    - With three tracks running in parallel, that likely means reworking two of them.

12. **[ADVISORY] New code goes into an existing file.** `MemberCards.swift` grows from 272 to about 420 lines.
    - The added types are new S5 code: `MemberCardState`, `MemberCardsState`, `MemberCardsOwner`, the `LoadState` extension and the placeholder/failure views.
    - This conflicts with "new feature code goes in new files".
    - Fix: have the orchestrator add one brief file (e.g. `Tabs/MemberCardsState.swift`) instead of recording a deviation.

13. **[ADVISORY] Offline, the Inbox can show two error views at once.** With no invites already loaded, the invitations section and the notifications section each show an `ErrorStateView` with its own Retry.
    - DESIGN_BOARD §6 contract 1 calls for one async state per screen.
    - Fix: hide the invitations error while the list itself has failed.

**What I checked:**
- **Anchors:** every cited line in `AppRootView`, `AppDelegate`, `ProgramContext` (115-123, 153-159), `+Notifications`, `+Session` (140-143, 152-158), `+Members` (48-204), `ProgramPickerView` (25-27, 83-88, 367, 531-559, 610-619), `ProgramActionsSheet`, `InvitesTabView` (`DeclineInviteDialog` at :239), `NotificationModalView` (3-44; `ForcedUpdateModalView` is used by `WidgetCoverView:24` and `AppRootView:132`), `ProgramCards` (:317), `MyProfileView` (:77), `MemberOverviewPicker` (83, 105-113, 386-516), and `project.pbxproj` (381/420).
- **Consumers of removed symbols:** grepped `notificationQueue`, `openInvitesRequested`, `acknowledgedNotificationIds`, `notificationIds`, `notificationDateFormatter`, `inviteReceived`, `handlePushTap`, `fetchUnacknowledged`, `ProgramMembersListView` and `NotificationDTO(` across the app and widget targets. All are handled.
- **Name collisions:** none for any of the new type names.
- **Card call sites:** checked every Members card and `loadMember*` caller, including `ActivityTimelineDetailView`, `MemberRecentDetail` and `MemberMetricsDetailView`.
- **Build settings:** default MainActor isolation, MemberImportVisibility, Swift 5 mode, iOS 18.6 target.
- **Contract fit:**
  - The DTOs match notifications C3/C4 and People §B–§E.
  - JSONSerialization sends real JSON booleans for `inbox`, `all` and `hide_activity`.
  - The server-side `PUT /members` path and `getMembershipDetails` (active members only) mean no roster regression.
  - The `supports_inbox` re-registration after sign-out works through the build-keyed memo.
- **Locked decisions:** DECISIONS D-N3/4/5/12/14 and D-P2/7/11, frontend-kit D-KIT-13/17/19, and the program-actions page SPEC D-C1.
- **Live binaries and other surfaces:** this is a client-only track, so no live-binary impact.
- **Parity:** web and Android are separate tracks; the iOS-only differences are called out in the plan.
