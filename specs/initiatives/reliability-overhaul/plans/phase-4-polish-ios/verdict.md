# PLAN VERDICT — OBJECTIONS (10)

1. **[BLOCKING] The #9 fix leaves "looks like nothing happened" in place on most of the list.** The plan puts the hide/show/delete error in a `Section` at the top of the `List`.
   - Evidence: `workoutService.getProgramWorkouts` sorts every library and custom type alphabetically (`apps/backend/services/workoutService.js:89`), so the list is long. Migration `sql/004_seed_healthkit_workout_types.sql` alone adds about 65 entries. A SwiftUI `List` does not scroll to a row inserted above the visible area.
   - The kit already has an iOS idiom for a failed action: the dismissable `.error` `FloatingBanner`, with priority action error > stale > update (`ProgramPickerView.swift:446`; frontend-kit §6 / D-KIT-15).
   - Failure scenario: scroll down to the custom type "Zumba", swipe Delete, confirm. The server answers 400 "Cannot delete this workout. It has 3 workout logs…" (`workoutService.js:215`). The plan's `actionError` Section is inserted at the top, off-screen, so nothing visible changes.
   - Fix: show `actionError` through `.floatingBanner { ScreenBanner(...) }` with the picker's priority over the stale banner. One way is an `actionError` parameter on `loadStateChrome`, or keep the inline Section and scroll to it.

2. **[BLOCKING] #10 on the admin Lifestyle "View as" is only partly fixed, and the plan breaks its own D-KIT-20 rule.** In step 40, `.onChange(of: selectedMember?.id) { Task { await load() } }` only sets `reloadQueued` while a load is in flight. The reset to `.idle` happens inside `load()`, and only once the loop gets to run again.
   - Evidence: step 40 `load()`. D-KIT-20 as the plan writes it says "a key change resets the state through `.onChange(of: key)`".
   - Failure scenario: an admin opens Lifestyle on a slow connection, so the 7 reads for self are in flight. They pick member B. The label says "B" while self's numbers stay on screen until those reads finish. That can take up to 15 s per request, or 60 s per resource (`APIClient.swift:34-35`). This is exactly the #10 wording: "until loading finishes".
   - Fix: in that `onChange`, set `loadState = .loading` when `LifestyleKey(programId, newId)` differs from `loadState.value?.key`, before starting the load.

3. **[BLOCKING] The #45 copy table and D-KIT-11 note rest on a false claim, which breaks parity.** §B says "Android keeps `Sync workouts and sleep`, which is accurate for Android". §C and the Risks section then record "#45: the iOS subtitle mentions steps" as a sanctioned divergence.
   - Evidence: Android syncs steps. `apps/android/.../health/HealthConnectManager.kt:10,37,184-198` reads `StepsRecord`, and `ui/health/HealthConnectSettingsScreen.kt:80-113` has a steps section. DISCOVERY #45 asks for the edit on iOS and Android.
   - Failure scenario: the orchestrator merges this "one table" and writes the divergence into D-KIT-11. Android then keeps a subtitle that leaves out steps.
   - Fix: one string, "Sync workouts, sleep, and steps", on both platforms. Drop the divergence line.

4. **[ADVISORY] #10 still has two races.**
   - (a) Logger "View as": `loggerLoadTask?.cancel()` does not cancel the Recent read inside the tab's `loadUserData`. That read's `recentId` is captured when it starts (step 36 / `StandardMembersTab` `loadUserData`).
     - Scenario: a logger enters the tab and switches to B straight away. The tab-level read for self lands after B's read, so self's rows stay under B's name until the next visit.
   - (b) Old program's data after a switch: `AdminMembersTab.memberLoadTask` is never cancelled on disappear. The `ProgramContext+Members` loaders (`loadMemberOverview`, `loadMemberHistory`, `loadMemberStreaks`, `loadMemberRecent`, :127-167) write after their await without the `programId == pid` / `Task.isCancelled` guard that `loadSummary` has.
     - Result: a late response from the old program can repopulate the shared fields after `resetProgramScopedData()`.
   - Fix: add that guard to the four loaders (the file is in the brief) and cancel `memberLoadTask` in `onDisappear`.

5. **[ADVISORY] Deferring the placeholders (P-1) turns wrong-member data into fake-empty data.** After this patch, a member switch shows "No workouts logged yet." (`MemberOverviewPicker.swift:110`) and "0 days" streak tiles (`MemberCards.swift:69-70`) while loading. Offline, they stay for good.
   - This is only acceptable if People S5's plan explicitly takes over the placeholders before the single store release. The orchestrator must record that hand-off.

6. **[ADVISORY] `resetProgramScopedData` does not clear `membershipDetails`.** It is read by `MemberManagementSection.swift:76` and `RoleManagementSection.swift:16-20,141,146`.
   - After the in-program "Switch Program" (`StandardProgramTab.swift:63,226`), the previous program's roster and roles show until `loadMembershipDetails` returns. Offline, they never clear.

7. **[ADVISORY] Detail screens no longer open instantly.** `ActivityTimelineDetailView` (opened from the Summary week card or Members History week) and `MemberStreakDetail` used to draw the already-loaded shared data straight away. Now they always start on a spinner.
   - Consider seeding the local state when the key matches the tab's preload (week, same member), in line with D-9 instant open.

8. **[ADVISORY] The #36 period labels may not reach VoiceOver.** `Text(p.label).accessibilityLabel(p.spokenName)` sits inside a `.segmented` Picker, which is drawn by `UISegmentedControl`. Accessibility modifiers on segment content may not be carried over to the segments, which would make this fix silently do nothing (step 41(b), 42(c), 43).
   - The VoiceOver phone check is listed. Have a fallback ready.

9. **[ADVISORY] Apple Health settings can stack three identical error views.** In step 25, `programList` wraps each of the three selectors (workouts, sleep, steps) in its own `LoadStateContent`. When all three syncs are on and the program list fails with nothing in memory, the screen shows three identical "Couldn't load this · Retry" blocks, and three spinners while loading. That is not clean UI; one shared load-state block would do.

10. **[ADVISORY] Small accuracy and cosmetic points.**
    - The plan cites HEAD as `ecc249c`; HEAD is actually `d9378cc`, a docs-only commit. The patch still passes `git apply --check`, and its sha256 starts `904bf5b0f2d21ba5` as stated.
    - The patch leaves SplashView's `NavigationLink` body mis-indented (cosmetic only).

**What I checked:**
- **iOS consumers:** I grepped the whole iOS app for every changed or deleted symbol: the 8 analytics loaders, `loadSummary`, `loadLookupData`, `loadProgramWorkouts`, `GlassButton`, `AppInputField`, `SearchablePickerSheet`, `PlaceholderCard`, `WorkoutTypesTotalCard`, `MemberStreakDetail`, `EditCustomWorkoutSheet`, `programWorkouts`, `memberMetrics*` and every `programId =` site. No caller is missing. The widget target compiles no shared files.
- **Other surfaces:** web and Android are untouched. The only wire change is `{"gender": null}` on `PUT /members/:id`, which `memberService.js` (`gender !== undefined`) and the nullable column accept, so the live binaries are unaffected.
- **Shared-state interactions:**
  - The S0 privacy rules (roster returns `200 []`; health-timeline 403) cause no new error states.
  - The Apple Health review's dismiss = defer path (D-CONF) matches "Later".
  - The #17 server texts match `authService.js:187/190/530/532`.
- **Anchors and versions:**
  - Step 41's line range (19–62) and the duplicate `if let gender` anchor at :221/:337 are correct.
  - Registry versions match the plan, including workout-logs at 0.7.0. D-KIT-19 is the highest number, so D-KIT-20/21 are free.
  - No migration is needed, and the compile and git-version steps are present.
