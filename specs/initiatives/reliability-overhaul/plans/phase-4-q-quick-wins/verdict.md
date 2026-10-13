# PLAN VERDICT — OBJECTIONS (8): all ADVISORY, none BLOCKING

1. **[ADVISORY] #47: the units-in-headers choice contradicts the brief, and the planner settled it alone.** The task says the CSV must use "the same formatting and units" as the page. DECISIONS.md #47 says "must match the page". Q-3 instead writes plain numbers (`45`, `7.5`, `4`, `12345`, empty cell for a missing value) and moves the units into the headers. The page shows `45 min`, `7.5 hrs`, `4 / 5`, `—` (iOS `MemberOverviewPicker.swift:56-66`, web `formatTotalDuration`).
   - Failure scenario: the mother exports, the file doesn't look like the page, and the user rejects it after all three surfaces have shipped.
   - Fix: put Q-3 to the user as an explicit choice at approval (units in cells vs units in headers). Don't record it as decided.

2. **[ADVISORY] iOS #5: the logger's View-as Recent card gets overwritten by their own rows. Android's plan fixes this; iOS's doesn't.** `MemberRecentCard` takes its label and tap target from `selectedMember` (View-as) but its rows from the shared `programContext.memberRecent` (`MemberCards.swift:113,136`). The new `loadUserData` (iOS step 5) still loads `loadMemberRecent(memberId: userId)` on every `.task`.
   - Failure scenario: a logger views Bob, switches tabs and comes back. With no spinner now, the card labelled Bob refreshes to the logger's own workouts.
   - This already happens today, but Android step 4(b) fixes it (`logsId = viewAs ?: self`), so the plan adds an iOS/Android divergence.
   - Fix: in step 5, load Recent for `loggerViewAsMember?.id ?? userId` when `isLogger`.

3. **[ADVISORY] Several Android line anchors are stale.** The text descriptions are correct; the line ranges are not.
   - `MembersScreen.kt` (a) says :105-114; the actual block is :102-112.
   - (b) says :152-182, but `var loading` is at :155. Lines :153-154 (`val roster`, `val loggerViewAsId`) are still used and are not re-declared in the replacement.
   - The `onFailure` ranges are each one line short: `LogWorkoutScreen.kt` is :198-206 (plan :198-205), `LogHealthScreen.kt` :224-232, `QuickAddWorkoutWidgetScreen.kt` :215-223, `QuickAddHealthWidgetScreen.kt` :206-214.
   - Failure scenario: an implementer who follows the ranges deletes `roster`/`loggerViewAsId`, or leaves a stray `}`.

4. **[ADVISORY] #2 parity: the Android invites tab doesn't relabel a timeout as offline; iOS does.** iOS step 4 uses `loadError.labeled(online:)`. Android `ProgramActionsSheet.kt:202` still shows `ErrorView(state.error, …)`. The picker (`ProgramPickerScreen.kt:212`) and Summary (`SummaryScreen.kt:137`) both substitute `AppError(OFFLINE)` when `!online` (polish-1 rule 6).
   - Failure scenario: a dead link times out (`InterruptedIOException` → TIMEOUT). Android shows "took too long" where iOS shows "Can't connect".
   - Fix: in the sheet, `if (!online) AppError(AppErrorKind.OFFLINE) else state.error`.

5. **[ADVISORY] An unannounced behaviour change in iOS `AdminWorkoutTypesTab` `.task`.** The plan now skips `loadLookupData()` (roster, workouts, programs, plus `apply(program:)`) when the roster is already loaded for this program (`AdminWorkoutTypesTab.swift:101`). Until now every visit to the Lifestyle tab refreshed the View-as roster and the program/role.
   - Failure scenario: a member joins while the admin has the app open. They don't appear in the Lifestyle View-as picker until the admin switches program.
   - Fix: call this out in a page-SPEC/D-rule, or drop it. #5 only asks for the 7 reads to run in parallel.

6. **[ADVISORY] #47 on iOS: the rendered list can drift from the sort/filter controls, so the CSV can too.** `MemberMetricsDetailView.loadMetrics()` keeps `guard !isLoading else { return }` (:166). A sort, filter or search change made during an in-flight load is silently dropped.
   - Web (query key) and Android (`LaunchedEffect` keys cancel and restart) don't have this problem.
   - Failure scenario: on a slow network, sort by Workouts, then switch to Ascending before it loads. The page and the CSV show the descending list under an "Ascending" control.
   - Fix: apply the same queued-reload loop the plan gives `AdminWorkoutTypesTab` (step 8).

7. **[ADVISORY] File size: `AppRootView.swift` goes from 188 to about 215 lines.** The new `WidgetCoverView` and `isWidgetCoverShown` are new code, and both the brief and the Workspace Standards say new code goes in new files (~200 lines). Put `WidgetCoverView` in its own file under `App/`.

8. **[ADVISORY] #8 copy parity: the "program order" error differs on Android.** Web (after step 4) and iOS (`ProgramPickerView.swift:513`) read "Couldn't save program order. …". Android `ProgramPickerScreen.kt:247` reads "Couldn't save program order: …". That file is already in scope, so one-character fix (": " → ". ").

**What I checked and found sound:**
- **Anchors:** every web and iOS #8 anchor, verified line by line (all exact). No sites are missed: grepped every `as Error).message` / `instanceof Error ? …message` (web), every `localizedDescription` / `error.message` (iOS) and every `it/e.message` (Android).
- **Server messages:** the backend sends 409 only on the single-row POSTs (`logService.js:214,547`) and on the batch routes, whose 409s carry rowErrors. Every "already exists" is a 400, so the server text survives through the kit on all three.
- **Live binaries:** there is no backend change. `getMemberMetrics` echoes a clamped `date_range` and rounds sleep to 1 decimal (`memberAnalyticsService.js:216,276`), so the three CSV builders produce identical bytes. Types match: Int on mobile, number on web, no BOM on any surface.
- **#5 consumers:**
  - Removing all-member `memberMetrics` from the standard tabs is safe. The only other readers are admin-only (`MemberOverviewPicker.swift:414`, Android `MemberCards.kt:355`) and the metrics detail screens, which load their own data.
  - `programContext.memberHealthLogs` has no view readers, and `MemberHealthCard` has its own `.task(id:)`.
- **iOS concurrency:** default MainActor isolation and Swift 5 mode make `pc` Sendable, so the task-group closures compile.
- **iOS project:** synced groups apply to the app target only (the widget extension uses explicit file refs), and none of the new symbol names collide.
- **#7:** the overlay-in-place approach is safe. `ForcedUpdateModalView` has a hit-testable backdrop. The only `widgetRoute` writers are AppRootView and the two widget views, and the picker's `isFullScreenCoverUp` is unaffected.
- **Web #6:** it only touches `fromQuery` consumers (programs, summary). The programs Retry refetches unconditionally. TanStack 5.51 exposes `failureCount`/`failureReason`, and there are no tests that build a `QueryLike` by hand.
- **Web #46:** no `allowEscapeViewBox` override and no chart inside `overflow-x-auto`.
- **Android #46:** `drawTooltip` already flips and clamps (`ChartPrimitives.kt:331-333`).
- **D-rule numbering:** no collisions (frontend-kit max is D-KIT-16, app-config max D-C7, member-analytics max D-C7). The bump plan matches git-version's "Multi-surface client release" lesson.

Key files:
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Tabs/StandardMembersTab.swift
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Tabs/AdminWorkoutTypesTab.swift
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Detail/MemberMetricsDetailView.swift
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/App/AppRootView.swift
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/members/MembersScreen.kt
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/programs/ProgramActionsSheet.kt
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/programs/ProgramPickerScreen.kt
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/phase-4/DECISIONS.md
