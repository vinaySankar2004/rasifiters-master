# PLAN VERDICT — OBJECTIONS (12)

1. **[BLOCKING] Push-tap routing for existing types reverses user decision U2, and the plan never says so.**
   - Evidence: `specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md:13` (U2, APPROVED by the user, binding): "any other type acknowledges + re-fetches". This is written into notifications SPEC D-C17(c), which "supersedes the 0.4.0 §3.2 'opens the target'".
   - The task text also says "today's deep-link routing stays; add the new types".
   - Step 15 `NotificationInbox.open()` plus step 23(e) send every push tap through `InboxTarget`:
     - Legacy `program.role_changed` / `member_joined` / `admin_transferred` / `member_left` now call `selectProgram` and navigate to SHELL.
     - `member_removed` / `deleted` now pop to the picker.
     - A target-less legacy non-invite push now navigates to Inbox.
   - The step 42 docs list does not record that D-C17(c) is superseded.
   - Failure scenario: a member is inside program A's Log Workout form and taps a banner "Your role in B is now logger". The form is discarded and they land in B's shell. Under U2 they would have stayed put, with B's data refreshed.
   - Fix, either way:
     - Keep U2 for push taps of the 8 legacy types (mark read + refresh). Only `invites`, new types and the toast's View navigate.
     - Or escalate "C7.6 supersedes U2" to the user as an explicit D-rule for all three surfaces.

2. **[BLOCKING] TC-5 "Edit membership" can write another program's joined date.**
   - Evidence: `MemberManagementScreens.kt:234-237`. The form state is `remember(membership?.memberId)` only. `ProgramContext.selectProgram` (`ProgramContext.kt:547-556`) never clears `_membershipDetails`. `ProgramScreen.kt:72-76` loads details for the program that was active at the time. `editMembership` (`ProgramContext.kt:1192-1201`) writes to the *active* program.
   - Step 39(d) adds a self-load but keeps the `membership == null` gate. A stale row from another program therefore renders at once, and the reload never re-keys the form.
   - Failure scenario:
     1. A global admin opens program A's Program tab, so A's details load.
     2. They switch to program B, then Members → People → X (a member of both A and B) → Edit membership.
     3. The form initializes `joinedAt` from X's row in A. B's rows then load with the same `memberId`, so the form is not re-keyed.
     4. Save writes A's date into B's membership.
   - Fix: render the form only after `loaded` for this program. Alternatively, key `remember` on `(memberId, joinedAt, loaded)` or reset `_membershipDetails` in `selectProgram`.

3. **[ADVISORY] The G-P gate cannot actually isolate the People work.**
   - People symbols are wired into the Notifications/shared steps:
     - 17(f) `val people = PeopleStore(...)`, plus `people.reset()` in 17(j)
     - 24(d) the People routes
     - 30(a/f/j) `ActivityVisibilityNotice`
     - 38(b) MembersHeader → People
     - 39(e) full stats
   - If G-P stops (likely: the brief reports People S1 seams S-1/S-3 missing), "stop steps 3, 16, 31–35" leaves a build that does not compile.
   - Fix: say "G-P failure stops the whole track", or list every dependent step.

4. **[ADVISORY] The platform `android.app.TimePickerDialog` (step 25) renders off-theme.**
   - Evidence: `res/values/themes.xml` is `android:Theme.Material.Light.NoActionBar`. Dark mode in this app is Compose-only.
   - Result: a bright light dialog with the platform's default accent (not brand orange) appears even in the app's dark mode. This breaks the neutral-surface and clean-UI standards.
   - Precedent for the right approach: `DetailChrome.kt:316` already uses the M3 `DatePickerDialog`. Use M3 `TimePicker` inside an `AlertDialog` in the same way.

5. **[ADVISORY] Two profile subtitles get truncated at 360dp (fit gate).**
   - Evidence: `ProgramSettingsRow` (`ProgramCards.kt:101-125`) caps the subtitle at `maxLines=1` with ellipsis. At 360dp it has about 198dp of text width.
   - "History, streaks, workouts and health" (37 characters) and "Joined date, active status or remove" (36) both truncate. Checklist #15 only covers the stat tiles.
   - Fix: shorten the copy, for example "History, streaks, health" and "Joined date, status, remove".

6. **[ADVISORY] Inbox rows for the current program have a dead chevron.**
   - Evidence: step 23(e) does nothing (`Unit`) when `program.id == active && root route == SHELL`.
   - Failure scenario: Program tab → Inbox (the inner AppScaffold route) → tap "Role updated" for the current program. The item is marked read but nothing opens, even though the row shows a chevron.
   - Fix: when the target is already open, pop the inner stack to the program, or don't show a chevron for that row.

7. **[ADVISORY] Cross-surface decisions are being made unilaterally by one track.**
   - These all need one answer on every surface: TC-1 (mark-all-read on every load), TC-3 (admin header becomes People), TC-6, TC-10/D-KIT-20 (top toast, an exception to D-KIT-8), TC-13, and the whole copy table.
   - Brief Q1 says read semantics "needs one answer for all three surfaces". The iOS and web tracks may also claim D-KIT-20.
   - The orchestrator must reconcile these before the user approves. Also: "Couldn't load updates · Retry" is bespoke text, not kit copy (D-KIT-19).

8. **[ADVISORY] Mark-all-read can be skipped based on stale counts.**
   - Step 15 `markAllRead` returns early when `_counts.value?.unread == 0`.
   - Failure scenario: a stream item or foreground push arrives. Its `refreshCounts` is async. If the inbox loads first, `{all:true}` is skipped. The item stays unread on the server and the badge reappears while the inbox is open.
   - Fix: decide from the loaded page instead (`items.any { it.readAt == null }`).

9. **[ADVISORY] S5 gap in the admin Members tab: a failed roster load is never retried.**
   - Evidence: in 38(b), `ensureMembersLoaded()` is keyed only on `program?.id`. Pull, Retry and reconnect only reload the cards.
   - Failure scenario: the roster fails for a program admin. `selectedId` stays null forever, so only the preview shows. There are no member cards, no error, and pull does not help.
   - Fix: call `ensureMembersLoaded()` inside the `reload.tick` effect.

10. **[ADVISORY] Launcher dots and tray entries outlive reading.**
    - Android's sanctioned divergence is launcher dots instead of a count. Dots come from posted notifications, and the plan never clears them when the inbox is read.
    - This is the Android equivalent of iOS's N7 "clear the badge on inbox open".
    - Fix: call `NotificationManagerCompat.cancelAll()` (or cancel per id) on inbox load / mark-all-read.
    - Related: a category can show ON in-app while its OS channel is disabled. An honest "Off in Android settings" line would cover that.

11. **[ADVISORY] Docs and state gaps.**
    - Docs missing:
      - The members page SPEC needs a D-rule for the TC-3 header change (step 42 lists only TC-13).
      - The widgets / log-workout page SPECs need the new `INBOX_LOG_WORKOUT` entry, which pops back instead of exiting to My Programs.
      - The observability SPEC should note that Android now sends `X-Time-Zone`.
      - The notifications SPEC must state that D-C17(a) is superseded (the `/unacknowledged` backfill is gone).
    - State: the People search query is a plain `remember`, so it is lost on profile push and back. That goes against the persist-selections rule; use `rememberSaveable`.

12. **[ADVISORY] Dialogs can stack on first launch.**
    - The picker's activity notice (30(f), `LaunchedEffect(workoutSync)`) can fire at the same time as the first-sign-in POST_NOTIFICATIONS request (`RootScreen.kt:86-94`).
    - It can also appear on top of the Health Connect confirmation overlay: an `AlertDialog` is its own window and sits above that root Box.
    - Fix: defer the notice while `pendingConfirmation != null`, and until after the permission result.

**Checked:**
- **Anchors:** every quoted anchor was verified against HEAD 82b7297/ecc249c. They are accurate; the working tree is clean and the ★ files are committed.
- **Callers of removed or changed symbols:** all are covered.
  - Removed: `NotificationDTO`, `notificationQueue`, `acknowledgeNotification`, `inviteInboxRequest`, `membersSelfLoadedFor`, `ProgramMembersListScreen`.
  - Changed: the `onPushTap` and `NotificationsScreen` signatures, and `openOnInvites`.
  - There are no test sources.
- **Encoding:** with `encodeDefaults=false` (`Network.kt:31`), `DeviceRegisterRequest.inbox` and `HideActivityRequest` are always encoded.
- **Kit API:** `UiState` / `toAppError` usage is correct, including that `toAppError` rethrows cancellation.
- **PUT /members/:id:** the response is flat (`memberService.updateMember`), so the `HideActivityResponse` echo works.
- **Live binaries and other surfaces:** no backend or contract change in this track, so live binaries are unaffected. Web and iOS are untouched; their parity is item 7.
- **Brief scope and endgame:** file scope matches the brief. The compile, self-grep and cleanup steps are all present.
