# PLAN VERDICT — OBJECTIONS (19)

**Summary.** The three plans have 6 blocking and 13 advisory cross-surface parity breaks for polish #9–#45:

- **Blocking:**
  - Android keeps the "Active Membership" switch that web and iOS remove (#11).
  - The #45 subtitle copy differs, and each plan claims the other surface will converge.
  - The empty-picker hint has three wordings and three gating rules (#16).
  - Auth D-C18 is written for web only (#17).
  - The iOS workout-type list error renders off-screen (#9).
  - Lifestyle "View as" can show the old scope's numbers on both phones (#10/#31).
- **Backend coverage:** every "Backend needs" item is covered. Only #38 changes server code, and it breaks no live binary.
- **Quick-wins collisions:** two stale web anchors, plus one superseded quick-wins amendment (QA6) that needs recording.

**What I checked:**
- DISCOVERY §2 rows and §6 evidence.
- DECISIONS.md and wave-A amendments QA1–QA8 / SA1–SA6.
- frontend-kit D-KIT-11 to D-KIT-19, registry.json, and the highest D-rule ids in every touched SPEC.
- RELEASES.md.
- The current code at the cited anchors on web, iOS, Android and backend.

## 1. [BLOCKING] #11: Android keeps the "Active Membership" switch (android vs web/ios)

**Evidence:**
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/members/MemberManagementScreens.kt`
  - :237 holds `var isActive`.
  - :274-280 is `FormFieldLabel("Active Membership")` plus the `Switch`.
  - :289 calls `editMembership(…, isActive = isActive, …)`.
- `membershipService.js:229-231` maps `is_active:false` to status `removed`.
- DISCOVERY lists #11 as web and iOS only. The Android plan never removes the switch, yet it edits this file (step 23).
- Web D-C6 says "web and iOS stop sending is_active"; iOS bumps program-memberships to 0.4.0.

**Failure scenario:** a global admin on a Pixel opens Member Details, flips the switch and taps Save. The member is removed with no confirm. The same action is impossible on web and iPhone.

**Fix (Android step 23):**
- Delete the `isActive` state, the whole Row with "Active Membership" and the Switch, and `errorMessage = null` from the switch.
- The Save call becomes `programContext.editMembership(membership.memberId, joinedAt = joinedAt.toString())`.
- Drop the unused `Switch` import.
- Update the Android page SPEC `member-management` (#11).
- program-memberships D-C6 covers all three clients. Correct DISCOVERY row #11's surfaces.

## 2. [BLOCKING] #45: health-row subtitle copy (ios vs android)

- iOS §B uses `Sync workouts, sleep, and steps` and claims Android keeps "Sync workouts and sleep". That claim is false: Android plan steps 18/19 change it. iOS also lists "#45 iOS mentions steps" as a D-KIT-11 divergence.
- Android uses `Sync workouts, sleep and steps` (no comma) and says "iOS converges to the same string".
- Both apps' own headers already read "Automatically sync workouts, sleep, and steps from …":
  - `AppleHealthSettingsView.swift:107`
  - Android Health Connect header (≈:124)

**Fix:** pin `Sync workouts, sleep, and steps` on all four rows:
- Android `AccountMenuSheet.kt:108` and `ProgramAccountSection.kt:93`
- iOS `ProgramPickerView.swift:664` and `ProgramCards.swift:365`

Delete the iOS divergence line from the D-KIT-11 note.

## 3. [BLOCKING] #16: empty-picker hint wording and gating (web vs ios vs android)

The three surfaces differ today:

| | Wording | When it shows |
|---|---|---|
| iOS (`SearchablePickerSheet` `emptyHint`) | "No workout types available for this program yet." / "No active members in this program yet." / "Couldn't load this" after a failure | Only once lookups have loaded; nothing before a program is picked |
| Android (`DetailChrome.kt`) | `PICKER_EMPTY_HINT = "Nothing to choose from yet."`, `PICKER_NO_MATCH_HINT = "No matches."` | Ungated: shows while loading, after a failure, and in widgets before a program is selected |
| Web (`Select.tsx:192`) | "No results" | For both empty and no-match |

The iOS revision-1 blocking objection was fixed by gating "as web/Android `lookupsLoaded`", but Android's picker isn't gated.

**Fix — one rule:**
- A loaded empty list shows the two specific strings (the same ones already used inline on all three).
- A lookup failure shows `Couldn't load this`.
- While loading, or before a program is selected, show no text.
- A search that matches nothing shows `No results`.

Per surface:
- **Android:**
  - `SearchablePickerField` gains `emptyHint: String? = null` and replaces both constants with `"No results"` for no-match.
  - `WorkoutRowCard` / `HealthRowCard` gain `memberEmptyHint` / `workoutEmptyHint`.
  - LogWorkout and LogHealth pass `lookupError → KitCopy.ERROR_VIEW_TITLE`, `lookupsLoaded → hint`, else `null`.
  - The widgets pass the same, gated on "every selected program's lookup arrived", mirroring iOS `membersLoaded` / `workoutsLoaded`.
  - The `MemberRecentDetail` filter passes `null`.
- **iOS:** `SearchablePickerSheet` adds a `No results` row when `!options.isEmpty && filtered.isEmpty`.
- **Web:** unchanged.
- **Accepted idiom:** iOS shows the full ErrorStateView where web and Android show a compact InlineLoadError (same title, message and Retry). Record it as D-KIT-11.

## 4. [BLOCKING] #17: auth D-C18 fits web only (web vs ios vs android)

- **Back after register:**
  - Web hides Back (`!registeredAs`).
  - iOS and Android allow going back and editing, but the edits are silently ignored: iOS signs in with `registered`, and Android's `BackHandler` steps pages.
- **Message when the sign-in after register fails:**
  - iOS: `Account created. Please sign in.`
  - Web: `credentialErrorMessage(error)`.
  - Android: `toCredentialMessage()`.
- **Lost reply:** a register that committed but whose reply was lost is unhandled on all three (web verdict #2). The retry gets 400 "Username already exists" (`authService.js:187`).

**Failure scenario:** on a phone, the sign-in fails, the user taps Back and changes the username, then taps Create. They are signed in as the old username with no notice. Web makes that impossible.

**Fix (D-C18, all three):**
- Once register has succeeded, a retry only signs in, with the registered credentials.
- Steps 1–2 can't change:
  - Web keeps Back hidden.
  - iOS sets `.disabled(registered != nil)` on the name and details fields.
  - Android sets `enabled = registered == null` on those `AppTextField`s.
- Sign-in failure after register shows `Account created. Please sign in.` in each surface's existing slot:
  - web: errorMessage
  - Android: errorMessage
  - iOS: alert
- The lost-reply case is recorded as a known limit on all three: the user can still sign in from Login.

## 5. [BLOCKING] #9: a failed delete is invisible on iOS (ios vs web/android)

- Web shows the 400 inside the confirm dialog, which stays open.
- Android shows it in the `error` line pinned under the search field, outside the LazyColumn (`WorkoutTypesListScreen.kt:132-135`).
- iOS inserts an `actionError` Section at the top of a roughly 65-row List (iOS verdict #1).

**Failure scenario:** swipe-delete "Zumba" low in the list → 400 "Cannot delete this workout…" (`workoutService.js:215`) → nothing visible changes on the iPhone.

**Fix (iOS step 29):**
- `actionError` becomes `AppError?`.
- Show it through the kit `.error` FloatingBanner with priority "action error > stale", as in `ProgramPickerView.swift:445`. Do this by giving `loadStateChrome` an `actionError: AppError?` plus `onDismissError`.
- Remove the in-List Section.

## 6. [BLOCKING] #10/#31: Lifestyle "View as" shows the old scope (ios + android)

- **iOS:** the `onChange(of: selectedMember?.id)` in step 40 only queues the reload, so self's numbers stay under "B" until the in-flight reads finish (iOS verdict #2).
- **Android:**
  - A pick made during the first load is dropped by the `loadedOnce` gate.
  - Every switch shows a frame of the old data, because `setLifestyleViewAs` (`ProgramContext.kt:1253`) doesn't reset (Android verdict #2).
- **Default without a roster:** Android 4(n) defaults a program admin to `loggedInMemberId` without the roster. iOS `applyDefaultSelectionIfNeeded` needs the roster, so after a failed roster read iOS loads program-wide numbers labelled with the admin's own name.

**Fix (one rule, recorded as D-KIT-22):** a View-as pick or program switch resets the tab to loading in the same event as the pick. A pick is never lost. A result whose key isn't the current key is dropped.

- **iOS:** in that `onChange`, set `loadState = .loading` when `LifestyleKey(pid, newId)` differs from `loadState.value?.key`, then load. The load's key is `selectedMember?.id ?? ((!hasUserChosenViewAs && !isGlobalAdmin) ? loggedInUserId : nil)`.
- **Android:**
  - `setLifestyleViewAs` sets `_lifestyleState = Idle` and `lifestyleKey = null`.
  - The second `LaunchedEffect` gates on `lifestyleDefaultedFor == program?.id` instead of `loadedOnce`.

## 7. [ADVISORY] #36: labels and tap targets differ (web vs ios vs android)

- **"+" button:**
  - iOS: `Program actions` / `Program actions, N new`.
  - Web: `Program actions` (no count).
  - Android: `Create program or view invites` (`ProgramPickerScreen.kt:310`).
- **✕ on a row:**
  - iOS: `Remove entry N`.
  - Android: `Remove entry`.
  - Web desktop: `Remove row` (`LogWorkoutsForm.tsx:396`, `LogDailyHealthForm.tsx:455`).
- **Web still too small:**
  - The mobile log-form "Remove" pill (`px-3 py-1 text-xs`).
  - The password Show/Hide toggles (login:188, create-account:396/414, reset-password:172, program/password:95). Web verdict #3 notes that #36 lists "the password eye". All of these files are already in the web plan.

**Fix:**
- Pin `Program actions[, N new]` on all three, fed by the badge count.
- Pin `Remove entry {index+1}` on all three.
- On web, the toggles get `inline-flex min-h-[44px] items-center px-2` plus `aria-label` `Show password` / `Hide password`, and the mobile Remove pill gets `inline-flex min-h-[44px] items-center px-4 text-sm`.

## 8. [ADVISORY] #15: delete-account error placement (web vs ios/android)

The iOS `DeleteAccountSection` and Android step 16 put the error between the button and the caption. Web step 45 puts it after the caption.

**Fix:** web moves `{deleteError && …}` above the `<p>` caption. The copy (kit message) and in-flight state already match; web's "Deleting…" label and the phones' spinner are each surface's idiom.

## 9. [ADVISORY] #18: profile load states (web vs ios vs android)

- iOS `loadCurrentEmail` still swallows a failed read (`MyProfileView.swift:411-420`, which DISCOVERY cites as #18 iOS evidence). iOS shows no Retry; web and Android do.
- Android alone disables "Change email" until the profile loads.
- Web disables Save until the profile loads. The phones save names and send gender only once it is loaded or touched. All three meet the shared rule "never send a gender the screen hasn't loaded".

**Fix:**
- iOS: an `emailLoadError: AppError?` with an ErrorStateView and Retry under the email row, reloading on reconnect.
- Android: drop `enabled = memberLoaded` on Change email.
- Record web's Save gating as its realization of the shared rule.

## 10. [ADVISORY] #29: offline with no data shows a spinner on iOS (ios vs web/android)

Web `QueryView` and Android `KitLoad` switch loading-while-offline to the offline ErrorView. iOS `LoadStateContent` shows the placeholder for `.idle/.loading` whatever the connection.

**Fix:** in iOS `LoadStateContent`, `.idle, .loading` while `!programContext.isOnline` shows `ErrorStateView(error: AppError.offline…, onRetry:)`.

## 11. [ADVISORY] #30/#31/#33: loading indicators

- iOS P-6 says "web and Android show '…' while in flight". That is false for Android: Summary (`SummaryScreen.kt:140`) and Lifestyle (`KitLoad`) show one section spinner.
- Android step 20 shows "—" while loading (`if (state.hasData) … else UNAVAILABLE`). That breaks the shared rule that "—" appears only after a failed load.

**Fix:**
- Record in D-KIT-11 that web shows "…", iOS a spinner per card, and Android a spinner per section, and that "—" means a failed load on all three (user decision U3).
- Android `MembersSection` / `WorkoutTypesSection` show `Loading...` (web's string, `program/page.tsx:155,234`) while Loading/Idle, and "—" only when Failed.

## 12. [ADVISORY] #10: clearing data on program switch, and late writes (ios vs android)

- **Not cleared on iOS:** Android `resetProgramScope` clears `_membershipDetails` and `_members`. iOS `resetProgramScopedData` doesn't clear `membershipDetails` (`ProgramContext.swift:113`; iOS verdict #6).
- **Members-tab placeholders:** Android spins via `loadedFor` / `logsLoadedFor` now. iOS defers this to People S5, so until S5 lands it shows "No workouts logged yet." / "0 days".
- **Late writes:** both surfaces' shared member loaders publish after the await with no check that the member or program is still current (iOS verdict #4b, Android verdict #4).

**Fix:**
- iOS adds `membershipDetails = []`.
- Write the placeholder hand-off into S5's plan before the store release.
- On both surfaces, `loadMemberOverview/History/Streaks/Recent/HealthLogs` publish only when the program is unchanged and `memberId` is still the focused/selected member.
- iOS cancels `memberLoadTask` in `onDisappear`.

## 13. [ADVISORY] #27: same gaps on both phones

- Three identical error/spinner blocks when all three syncs are on (iOS verdict #9; Android ProgramSelection ×3).
- Programs that are selected but no longer active are hidden and can't be unticked (Android verdict #6; iOS step 25 has the same issue).

**Fix (both):**
- Show the load state once, in the first enabled sync section.
- After a fresh successful load, prune every selected id whose program isn't in the active list, then persist.

## 14. [ADVISORY] #33: empty-list copy and the web roster

- Android adds `No members in this program yet.` / `No members match your search.` / `No workout types yet.` / `No workout types match your search.` and asks the other surfaces to match.
- Web `members/list/page.tsx:53-57` keeps ErrorState with no Retry and the text "No members found.". It is outside the web brief.

**Fix:** adopt Android's strings as canonical. Hand web members/list (QueryView plus these strings) to People S2, and the iOS roster and workout-type empty lines to S3/S5.

## 15. [ADVISORY] #41: Program-tab sign-out confirm title

The phones' Program-tab confirm is titled `Sign Out?` (`ProgramCards.swift:431`, `ProgramScreen.kt:156`). Web step 44 uses `Sign Out`.

**Fix:** web Program tab uses title `Sign Out?`. The picker confirm stays `Sign Out` on all three. The Support row copy, the row order and the `@username` row already match.

## 16. [ADVISORY] #35: login identifier keyboard

Android uses the Email keyboard for "Username or Email"; iOS step 17(c) keeps the default keyboard.

**Fix:** iOS identifier field gets `keyboardType: .emailAddress`.

## 17. [ADVISORY] #38: iOS docs say client-side only

iOS P-3 says "The date check is client-side only"; web D-C3 adds the server guard.

**Fix:** programs D-C3 = start ≥ end (on yyyy-MM-dd) is rejected by the server and by all three clients, with the same copy (web `program/edit:155`, iOS `EditProgramInfoView.swift:40`, Android `ProgramActionsSheet.kt:318` / `EditProgramScreen.kt:80`).

**Live binaries are safe:**
- Android 1.0.0 (4) and 1.1.0 (5) already block equal and reversed dates (e8cfd61, 2026-07-08).
- iOS 1.4.2 and 1.5.0 default the end date to +3 months and show the server's 400 text.
- `tools/testbed/seed.mjs:299` creates programs with a start in the past and an end in the future.
- The backend deploys first.

## 18. [ADVISORY] Collisions with the quick wins now in the tree

- **Web step 34:** "Replace :186-188" is stale. In `apps/web/src/app/members/metrics/page.tsx` the `isLoading` / `isError` lines are :183 and :185, and :187-189 is the empty-state block (the file was reshaped by 095d864). Fix: "replace :183-185".
- **Web step 21:** the destructure is at :12 (web verdict #4).
- **iOS step 44:** it removes `reloadQueued`, which supersedes wave-A amendment QA6 (queued reload) with a keyed `task(id:)` plus the drop rule. Record QA6 as superseded.
- **Checked and safe:**
  - Every other web anchor checked in the quick-wins files matches: the summary and summary sub-pages, members/history, streaks, workouts and health, lifestyle/timeline, steps-timeline and workouts, program/roles, members/detail, and programs.
  - Android #47 helpers `metricsCsvName` / `metricsCsv` / `committedSearch` match the tree.
  - QA2, QA3 and QA5 are preserved.

## 19. [ADVISORY] Versions and D-rule ids

- web D-KIT-20 and D-KIT-21 both mean something different from iOS D-KIT-20 and D-KIT-21.
- program-memberships: web PATCH 0.3.1 vs iOS MINOR 0.4.0.
- program-workouts: 0.1.1 vs 0.2.0.
- member-analytics: 0.6.1 vs "next MINOR".

**Fix:** see §5 of the amendments.

**Checked and consistent:**
- **Backend needs:** iOS and Android list none, and every implicit dependency already exists:
  - an explicit `gender: null` (`memberService.js:139`)
  - an optional `is_active` (`membershipService.js:229-231`)
  - the 400 "already exists" texts (`authService.js:187/190/530/532`; all are 400, so Android's `status == 400` also covers oauth/complete)
  - `my_status` on GET /programs
  - `skipped_not_member`
  - PUT /programs/:id for Android #40

  iOS's optional `code` field isn't added; all three clients match on the text.
- **Rows that already match:** #12, #14 (Later = Android back), #25, #34, the #44 wire format, #40 (web counts invites only, `programs/page.tsx:199`), and kit copy (`Couldn't load this` / `Retry`, identical in `copy.ts`, `KitCopy.swift` and `KitCopy.kt`).
- **#31 partial failure:** each surface mirrors its own Summary (web: ErrorView + "—"; phones: stale banner + "—"). This predates these plans (A13).

---

## Consolidated amendments — save as `plans/phase-4-polish-amendments.md`

```markdown

> Amendments: [`phase-4-polish-amendments.md`](phase-4-polish-amendments.md).
