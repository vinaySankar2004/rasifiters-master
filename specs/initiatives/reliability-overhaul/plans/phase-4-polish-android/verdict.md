# PLAN VERDICT — OBJECTIONS (8)

1. **[BLOCKING] Step 4(s) does not compile.** The new `loadMembershipDetails` body has a bare `return@runCatching`, and its last expression is `details.firstOrNull { … }?.let { _loggedInGender.value = it.gender }`, which has type `Unit?`. The `Unit` line that is at `ProgramContext.kt:1125` today was dropped. The receiver chain is inferred before the expected return type is applied, so the result is `Result<Unit?>`.
   - Evidence: I rebuilt the exact shape in the scratchpad and compiled it with the cached `kotlin-compiler-embeddable-2.0.21`. Output: `error: return type mismatch: expected 'kotlin.Result<kotlin.Unit>', actual 'kotlin.Result<kotlin.Unit?>'`. Step 4(g) has the same `return@runCatching` shape but ends in an `if` statement, and it compiled.
   - Failure scenario: the implementer pastes step 4(s), and `:app:assembleDebug` fails in `ProgramContext.kt`. That breaks the "copy-paste-ready" rule in Planning Standards.
   - Fix: add `Unit` as the last line inside the `runCatching`.

2. **[BLOCKING] #10 / #31 Lifestyle "View as" can still show the old scope's numbers under the new name.** The plan claims "never the old numbers, not even for one frame". That holds for Members, which clears its flows in the same frame inside `setMembersViewAs`. It does not hold for Lifestyle.
   - **(a) A pick during the first load is lost, and the wrong data stays.**
     - Step 26 keeps `LaunchedEffect(viewAsId) { if (isAdmin && loadedOnce.value) loadLifestyle(viewAsId) }`. `loadedOnce` only turns true after the first `loadLifestyle(self)` returns.
     - Scenario: a program admin opens Lifestyle on a slow or cold API and picks member C from the visible "View as" row while the 7 reads for self are still running. The effect re-runs with `loadedOnce == false` and does nothing.
     - The self load then finishes. `stillMine()` is true because `lifestyleKey == (pid, self)`, so it publishes Loaded(self).
     - Result: the label says C (the label comes from `viewAsId`) and the cards show self's numbers. Nothing corrects it: the reconnect refetch only fires for Failed/Stale, and the effect key never changes again. It lasts until a manual pull or the user leaves and re-enters the tab.
     - Separately (an existing bug, not introduced here): a pick made during `ensureLifestyleViewAsDefault` is overwritten by the default.
   - **(b) Every View-as switch shows at least one frame of old data.** `setLifestyleViewAs` (`ProgramContext.kt:1253`) is not changed. The frame that draws the new label still renders `lifestyleState` = Loaded(old), because `loadLifestyle` only resets to Loading once the effect coroutine runs after that frame.
   - Fix:
     - Have `setLifestyleViewAs` reset `_lifestyleState` to `UiState.Idle` and `lifestyleKey` to null in the same call, mirroring step 4(f).
     - Gate the second effect on "default applied for this program" (`lifestyleDefaultedFor == pid`) instead of `loadedOnce`. Alternatively, render the data only when the state's key equals `(pid, scopeMemberId())`.

3. **[ADVISORY] `KitLoad` puts Loaded and Stale in separate `when` branches, so content state resets when a refresh fails or recovers.**
   - Moving Loaded → Stale (a failed refresh) or Stale → Loaded(refreshing) disposes and rebuilds `content`.
   - Concrete case in `WorkoutTypesListScreen` (step 27): the `LazyColumn` and its default `rememberLazyListState()` sit inside the content, so a failed pull-to-refresh jumps the list to the top.
   - Lifestyle's popularity metric and "Show all" reset the same way, as do chart tooltip selections and ⋮ menus.
   - Fix: one branch for both data-carrying states (e.g. `is Loaded, is Stale -> content(state.dataOrNull as T)`).

4. **[ADVISORY] Members "View as" still has a narrow window for the previous member's data.** `setMembersViewAs` clears the flows in the click handler, but the old `LaunchedEffect` is only cancelled at the next recomposition.
   - An old load whose response is already being dispatched can still write member A's rows into the cleared `_memberRecent` / `_selectedMemberOverview`.
   - If B's read then fails, `loadedFor = B` (or `logsLoadedFor`) shows A's rows under B's name.
   - Evidence: the 5 loads publish without checking who is selected (`ProgramContext.kt:1039, 1049, 1065, 1084, 1108`).
   - Cheap guard: publish only when `memberId == _membersViewAsId` / `_focusedMemberId`.

5. **[ADVISORY] #12 add-custom-workout can silently leave the new type missing.**
   - Step 4(o) `addCustomProgramWorkout` changes nothing locally (`list -> list`) and runs the refresh fire-and-forget (`scope.launch { loadAllProgramWorkouts() }`). The refresh result is thrown away and never reaches the screen's `load` handle.
   - Scenario: the add succeeds, the refresh fails, the sheet closes as a success, and the new type is not in the list with no Stale banner. The user re-adds and gets a 400 "already exists" — the confusion #12 is meant to remove.
   - Suggest: on success, call `load.reload()` from `WorkoutTypesListScreen.saveSheet` so a failed refresh shows as Stale.

6. **[ADVISORY] #27 hides selected programs the user can no longer untick.**
   - `ProgramSelection` now lists only `myStatus == "active"`, but the stored selection sets (`workoutProgramIds` etc.) are not pruned.
   - A global admin sees every program from GET /programs (`programService.js:29-55`). If they left a program they had selected, it is now hidden but still a sync target, and they cannot deselect it.
   - Fix: prune the inactive ids on load, or show selected-but-inactive rows so they can be unticked.

7. **[ADVISORY] `RolePill` reports the current role as disabled to screen readers.** Step 22 passes `enabled = !selected && !disabled` into `selectableTarget`, so TalkBack reads the selected role as disabled.
   - Use `enabled = !disabled`. `onSelect` already ignores a re-pick of the same role (`ManageRolesScreen.kt:88`).

8. **[ADVISORY] Small doc/checklist inaccuracies.**
   - The endgame check "Summary and Members-tab chart cards still scrub horizontally" can't be done: those preview charts have no tooltip or pointer input (`MemberCards.kt:420-431`, "No tooltip on the tab-level preview").
   - The member-analytics bump is "→ next MINOR" rather than an exact version (Planning Standards nit; the brief already flagged the drift).

**What I checked:**
- **Anchors:** read every cited file at the plan's anchors. All anchors are current in the clean tree (HEAD ecc249c).
- **Consumers of every changed ProgramContext API**, grepped across `apps/android`:
  - `loadMember*` return-type changes; the only out-of-brief caller is `MemberCards.kt:361`, a statement call, which still compiles.
  - `lifestyle` / `lifestyleLoading` / `LifestyleData`, `resetMemberHistoryToWeek`, `UpdateMemberProfileRequest`, `GoogleSignInButton`, the Lifestyle card signatures, `Members/Role/WorkoutTypesSection`, `PeriodSelector` / `CircleBackButton` / `DetailTopBar`, `selectProgram` / `PROGRAM_EDIT`. No missed consumers.
- **Other surfaces:**
  - No web, iOS or backend contract changes.
  - Backend `PUT /members/:id` accepts an explicit `gender: null` (`memberService.js:138`, `Member.gender allowNull`).
  - The 400 texts that #17 matches exist (`authService.js:187/190/530`).
  - Delete-with-logs returns a 400 that is shown on the list.
  - iOS `programToEdit` also calls `applyProgram` first, so #40 matches it.
- **Live binaries:** no backend change, so nothing to check.
- **D-rules:** checked against frontend-kit D-KIT-8/13/14/16/17/19 and phase-4 DECISIONS. The deliberate SPEC changes (program-picker A-1/A-4, iOS F1 superseded for Lifestyle, history reset removed) are all announced.
- **Compiler check:** compiled scratch reproductions with kotlinc 2.0.21. The `KitLoad` generic smart cast, `rememberLoad` inference and labels, the `ProgramSelection` `when` smart cast, the `LifestyleParts.getOrElse` merge and step 4(g) all compile. Only step 4(s) fails.

Files: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/core/ProgramContext.kt`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/lifestyle/LifestyleScreen.kt`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/lifestyle/WorkoutTypesListScreen.kt`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/health/HealthConnectSettingsScreen.kt`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/program/ManageRolesScreen.kt`
