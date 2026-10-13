# PLAN: Phase 4 Track P (polish #9–#45 minus #32), iOS surface, revision 2

**Brief accepted**: yes. The plan touches 52 files, all on the brief's list: 5 new and 47 existing. `MemberOverviewPicker.swift` is listed but stays untouched (see P-1).

**Feature/version prediction** (the orchestrator merges these with the web and Android tracks and takes the highest per feature):

| Feature | Version | Bump | Reason |
|---|---|---|---|
| frontend-kit | 0.4.0 → 0.5.0 | MINOR | New D-KIT-20 (the load recipe and the key-drop rule) and D-KIT-21 (the 44-pt tap target) |
| auth | 0.14.0 → 0.15.0 | MINOR | #15, #17, #18, #25, #28, #35 |
| apple-health | 0.8.0 → 0.9.0 | MINOR | #14, #27 |
| programs | 0.2.0 → 0.3.0 | MINOR | #12, #38 |
| program-memberships | 0.3.0 → 0.4.0 | MINOR | #11: the Active toggle is retired on clients |
| program-workouts | 0.1.0 → 0.1.1 | PATCH | #9 |
| workout-logs | 0.7.0 → 0.7.1 | PATCH | #16 |
| daily-health-logs | 0.4.0 → 0.4.1 | PATCH | #16 |
| members | 0.4.0 → 0.4.1 | PATCH | #44 |
| member-analytics | 0.6.0 → 0.6.1 | PATCH | The D-C9 wording for the iOS mechanism changes (see §C) |

- No bump for analytics, analytics-v2 or health-sync: these changes are client presentation only.
- Every page SPEC listed in §C gets a PATCH.

**Surfaces in scope**: [ios]. Backend, web and Android are planned by their own tracks. This track makes no backend change.

**Verified**: I applied the entire change set below to a scratch copy and typechecked it with `tools/ios-typecheck.sh`, using the project's flags (MainActor default isolation and the approachable-concurrency upcoming features).
- Result: 0 errors. There are no new warnings; the 26 that remain are the existing deprecation and Decodable warnings.
- **Reference patch**: `/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/tc/phase4-polish-ios.patch`
  - Its sha256 starts `904bf5b0f2d21ba5`. It has 52 file diffs, 1949 lines added and 1500 removed.
  - `git apply --check` passes on the current HEAD (`ecc249c`). The tree is clean, so the quick wins are already committed.
- The reference tree is next to it at `…/scratchpad/tc/repo/apps/ios/RaSi-Fiters-App`.

### What changed since revision 1 (the adversary's verdict)

1. **Fixes BLOCKING #1.** The old `settle` helper is replaced by `loadOutcome` + `LoadState.applying`.
   - The result is applied to the state as it is *after* the await.
   - Each keyed screen captures its key (period or query) before the await, and drops the result if the key changed meanwhile.
   - A key change resets the screen to loading through `.onChange(of: key)`, and `.task(id: key)` does the load.
   - So a Retry or reconnect Task, which nothing ever cancels, can no longer land under newer controls or overwrite fresh data.
2. **Fixes BLOCKING #2.** The empty-picker hint only shows once lookups have loaded, the same as web and Android (`lookupsLoaded`):
   - Widgets: every selected program's lookup has arrived.
   - In-app forms: the `lookupsLoaded` flag.
   - Otherwise there is no hint. After a failure the hint reads "Couldn't load this".
3. **#10:** a member switch now cancels the previous member's load (`memberLoadTask` / `loggerLoadTask`).
4. **Tap targets:** fixed-size controls give the extra size back (the row height doesn't change). For text-sized chips, the layout growth is now stated explicitly (P-8).
5. **#14:** "Later" moves on to the next queued review. This is now documented, the same as Android's back button, and added to the phone checks.
6. **Doc gaps:**
   - member-analytics D-C9 gets its PATCH.
   - The CSV comment now cites D-C9 (it wrongly cited D-C8).
   - The #9 list error is now **inline**, matching web and Android, so it is no longer a divergence.
   - Only the P-6 spinner still needs a D-KIT-11 line and the user's OK.
7. **Workspace standards:**
   - `LifestyleCardsSection` moves into `StandardWorkoutTypesTab.swift` (136 lines), so the brief needs no new file.
   - `MyProfileSections.swift` is 211 lines.
   - The dead `listRangeStart` / `listRangeEnd` and `SplashViewModel.isCTAVisible` are removed.
8. **Step 41:** now states the exact line range to replace.
9. **GlassButton:** `label` is an optional parameter defaulting to `nil`, so the People track's calls still compile. Every call in this plan passes a label.
10. **#17:** a retry after sign-up signs in with the credentials that were **registered**, not with whatever is in the fields now.

Also found while checking: the line `if let gender { body["gender"] = gender }` appears **twice** in `APIClient+Members.swift`, at :221 (create member) and :337. Step 7 is anchored inside `updateMemberProfile`.

---

## A. Decisions (the implementer has nothing left to decide)

| ID | Decision | Why |
|---|---|---|
| P-1 (#10 vs S5) | Clear the data now, and leave the loading placeholders in `MemberOverviewCard` / `MemberCards` to **People S5**. `MemberOverviewPicker.swift` is not touched. `MemberCards.swift` gets one line, for #29. **Orchestrator: write "loading/error placeholders for MemberOverviewCard + History/Streak/Recent cards (the placeholder half of #10)" into S5's plan.** | S5 rebuilds those exact cards on the kit. |
| P-2 (#17) | Match the exact 400 texts `Username already exists` / `Email already exists` (`authService.js` :187/:190/:530/:532). | They are stable server strings, and no backend change is needed. |
| P-3 (#38) | The date check is client-side only. | — |
| P-4 (#29/#34, D-KIT-20) | Each detail screen keeps its own `@State LoadState`, loaded with the existing `APIClient` fetchers. It never writes a `ProgramContext` field. A key change resets the state to `.loading`. Results are applied to the current state, and a result for a stale key is dropped. A Retry keeps the data (shown stale). After an edit or delete, `MemberRecentDetail` refreshes the tab card with `loadMemberRecent(limit: 10)`. | This removes the cross-screen leaks and the races. |
| P-5 (#31) | The Lifestyle tab keeps its data in its own keyed `LoadState<LifestyleSnapshot>`. `ProgramContext.loadLifestyle` runs 7 parallel reads and writes no shared field. The 8 shared analytics loaders that are now unused are deleted. | Today the Lifestyle tab overwrites Summary's program-wide `workoutTypes`. |
| P-6 (#30) | While a load is in flight, a missing part shows the existing `PlaceholderCard` spinner. Once settled it shows the new "—" variant. **Divergence needing a D-KIT-11 line and the user's OK:** web and Android show "…" while in flight; "—" is the same everywhere. | It keeps iOS's existing card-loading idiom. |
| P-7 (#9) | Hide, show and delete failures appear **inline at the top of the list**, as web and Android do. The Add and Edit sheets show their errors inside the sheet. | Parity. |
| P-8 (#36, D-KIT-21) | One helper, `.minTapTarget(alignment:)` (a 44×44 minimum frame plus `contentShape`), applied to the button's label after its drawn styling. Fixed-size controls give the growth back, so the layout doesn't change: the eye (−12 vertical, −12 trailing), the ✕ on the forms (−12 / −12) and the widget back button (−4 vertical). The text-sized controls stay the same drawn size, but their row's layout grows at the default text size (and not at all at large sizes): role chips +8 pt, invite Accept / Decline / Revoke +4 pt, and the "Cancel request" chip +12 pt (only on a requested program's card). This is stated, deliberate, and the user eyeballs it. | The hit area grows; the drawn shape doesn't. |
| P-9 (#18) | Sign-in methods use `LoadState` + `ErrorStateView` directly, not `LoadStateContent`. | The loading state is rows reading "—", not a spinner. |
| P-10 (#36 "+") | A single `plusBadgeCount` feeds both the badge and the spoken label. | N4 changes only its body. |
| P-11 (#16 widgets) | `programsError` (the program list) + `selectionError` (set only while the **current** selection still lacks a lookup). Retry and reconnect reload whatever failed. | — |
| P-12 (#34 metrics key) | The metrics key uses `committedSearch`, set on Return or on clear. **Deliberate micro-change:** a sort or filter change no longer applies search text that hasn't been committed (recorded in the D-C9 wording). | The list and the CSV always match the controls. |
| P-13 (#17) | `registered: (username, password)?`. Once the account is created, Create Account only signs in, using those credentials. The page-validity re-check is skipped once registered. | No loop on "Account created". |
| P-14 (#14) | "Later" calls `dismiss()`. `onDisappear` then records the defer; a queued sleep or steps review shows next. | This is the existing defer path, and it is what Android's back button does. Gating is outside the brief. |

## B. Copy table (new strings only; one table across all surfaces)

| Row | String (exact) | Where on iOS |
|---|---|---|
| #14 | `Later` | Apple Health review, leading toolbar button |
| #14 / #36 | `Confirm` (accessibility label) | Review tick |
| #16 | `No workout types available for this program yet.` / `No active members in this program yet.` (both exist already on web and Android) | Empty picker sheet, once lookups have loaded. After a failure it shows `Couldn't load this` (`KitCopy.errorViewTitle`). |
| #17 | `Account created. Please sign in.` | Create-account alert |
| #30 / #31 | `—`, accessibility label `Unavailable` | Cards whose part is missing |
| #36 | `Show password` / `Hide password` · `Remove entry N` · `Back` · `Week` `Month` `Year` `Program` · `Program actions, N new` · `Invite member` · `View members` · `Workout types` | Accessibility labels |
| #38 | `End date must be after the start date.` | Create program |
| #45 | `Sync workouts, sleep, and steps` (iOS syncs steps; Android keeps `Sync workouts and sleep`, which is accurate for Android) · `Choose how RaSi Fiters looks to you` | Account menus · Appearance |

## C. SPECs each row changes (orchestrator-owned; implementers don't edit docs)

| # | iOS page SPECs (`specs/pages/ios/…`) | Feature SPEC |
|---|---|---|
| 9 | program-workout-types | program-workouts |
| 10 | admin-members, program-picker, admin-workout-types | — |
| 11 | program-member-management (the Active Toggle text is superseded) | program-memberships |
| 12, 38 | program-actions | programs |
| 13 | admin-home (F4 corrected: the edge swipe leaves the program only from a tab's top screen) | — |
| 14, 27 | apple-health | apple-health (health-sync H1 unchanged) |
| 15, 18, 44 | my-profile | auth (15, 18), members (44) |
| 16 | log-workout, log-health, widget-quick-add-workout, widget-quick-add-health | workout-logs, daily-health-logs |
| 17 | create-account | auth |
| 25 | splash | auth |
| 28 | login | auth |
| 29, 34 | summary-activity-detail, lifestyle-timeline, lifestyle-steps-timeline, member-metrics-detail, member-recent-detail, member-health-detail, member-streaks-detail, program-workout-types, admin-members | frontend-kit (D-KIT-20); **member-analytics D-C9** (see the wording below) |
| 30 | admin-summary, program-picker | frontend-kit |
| 31, 43 | admin-workout-types (D-S1 "faithful swallow" is superseded) | frontend-kit |
| 35 | login (including ForgotPasswordView), create-account, my-profile, change-password | auth |
| 36 | login, create-account, change-password, log-workout, log-health, program-role-management, program-picker, program-actions, widget-quick-add-workout, widget-quick-add-health, admin-members, admin-workout-types, summary-activity-detail, lifestyle-timeline, lifestyle-steps-timeline, apple-health, appearance | frontend-kit (D-KIT-21) |
| 45 | appearance, program-picker, admin-program | — |

**D-rule text for the orchestrator's docs commit:**
- **D-KIT-20 (iOS load recipe):**
  - `LoadStateContent` renders the state: idle or loading shows the placeholder; failed shows `ErrorStateView` with Retry, labelled for offline; loaded or stale shows the content.
  - `.loadStateChrome` is applied once at the screen root. It gives the stale banner, a reserved 76-pt band, and a refetch on reconnect.
  - `loadOutcome` + `LoadState.applying`: an outcome is applied to the state as it is *after* the await. It is **dropped when the screen's key (period / sort / filter / search) changed meanwhile**.
  - A key change resets the state through `.onChange(of: key)`, and `.task(id: key)` loads.
  - Detail screens own their data; they never write shared `ProgramContext` fields.
- **D-KIT-21 (tap targets):**
  - Every tappable control is at least 44×44 pt, via `.minTapTarget()`.
  - Fixed-size controls in tight rows give the growth back; the growth of text-sized chips is accepted (P-8).
  - Icon-only controls carry spoken labels, and toggle-like rows carry `.isSelected`.
- **D-KIT-11 addition (needs the user's OK):** P-6, the iOS in-flight spinner versus "…" on the other platforms. Also note these sanctioned idioms: 44 pt vs 48 dp, the #16 hint living inside the iOS picker sheet versus inline on web and Android, and #45's iOS subtitle mentioning steps.
- **member-analytics D-C9, iOS mechanism, replace the clause:** "the list loads keyed on (search applied on Return / clear, sort, direction, filters); a change restarts the load and a result for an older query is dropped, so the list and the CSV always match the controls."

## D. Backend needs
None. The web track may optionally add `code: "username_taken" | "email_taken"` to the 400s. That is additive, and iOS keeps matching the text either way.

---

## Steps: ios

Paths are relative to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/`. The groups are synced, so there is no pbxproj edit.

0. **Preferred path:** from the repo root run
   ```
   git apply --3way /private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/tc/phase4-polish-ios.patch
   ```
   - It is exactly steps 1–52 and has been typechecked.
   - If the patch is missing, or some hunks conflict because a Q fix round changed a file, apply the affected files by hand from the steps below and keep the Q fix's intent.
   - Then go to the Endgame.

### New files

1. NEW `Shared/Kit/LoadStateContent.swift`:
```swift
import SwiftUI

/// Polish #29 (frontend-kit D-KIT-20): the ONE way a screen region shows a `LoadState` — the Summary recipe, so a
/// detail screen never shows a blank page, raw text or "No data" when its load failed.
///   idle / loading → `placeholder` (the screen's own skeleton, or the default spinner)
///   failed         → ErrorStateView + Retry, offline-labelled (polish-1 rule 6)
///   loaded / stale → `content(value)`; the stale banner + reconnect reload are the root's `.loadStateChrome(…)`.
struct LoadStateContent<Value, Placeholder: View, Content: View>: View {
    @EnvironmentObject private var programContext: ProgramContext
    private let state: LoadState<Value>
    private let onRetry: () -> Void
    private let placeholder: () -> Placeholder
    private let content: (Value) -> Content

    init(state: LoadState<Value>, onRetry: @escaping () -> Void,
         @ViewBuilder placeholder: @escaping () -> Placeholder,
         @ViewBuilder content: @escaping (Value) -> Content) {
        self.state = state
        self.onRetry = onRetry
        self.placeholder = placeholder
        self.content = content
    }

    var body: some View {
        switch state {
        case .idle, .loading:
            placeholder()
        case .failed(let error):
            ErrorStateView(error: error.labeled(online: programContext.isOnline), onRetry: onRetry)
                .frame(maxWidth: .infinity)
        case .loaded(let value, _, _), .stale(let value, _, _):
            content(value)
        }
    }
}

extension LoadStateContent where Placeholder == LoadingPlaceholder {
    /// The default placeholder: a centred spinner (the timelines' existing loading look).
    init(state: LoadState<Value>, minHeight: CGFloat = 240, onRetry: @escaping () -> Void,
         @ViewBuilder content: @escaping (Value) -> Content) {
        self.init(state: state, onRetry: onRetry, placeholder: { LoadingPlaceholder(minHeight: minHeight) }, content: content)
    }
}

/// The default loading placeholder.
struct LoadingPlaceholder: View {
    var minHeight: CGFloat = 240

    var body: some View {
        ProgressView()
            .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .center)
    }
}

/// The screen-root half of the recipe (D-KIT-13): the stale "Couldn't refresh · Retry" banner (hidden while offline —
/// `ScreenBanner`, A6) with its band reserved so the last row is never under it, and a reload when the connection
/// comes back after a failed load. Apply ONCE at the screen root (never inside a ScrollView).
struct LoadStateChrome: ViewModifier {
    @EnvironmentObject private var programContext: ProgramContext
    let isStale: Bool
    let hasError: Bool
    let onRetry: () -> Void

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if isStale && programContext.isOnline {
                    Color.clear.frame(height: 76)       // 52 min height + 12 margin + 12 clearance (OfflineBanner)
                }
            }
            .floatingBanner {
                ScreenBanner(banner: isStale ? FloatingBanner(variant: .stale, onRetry: onRetry) : nil)
            }
            .onChange(of: programContext.isOnline) { _, online in
                if online, hasError { onRetry() }      // D-IOS-KIT-3: refetch on reconnect
            }
    }
}

extension View {
    func loadStateChrome<Value>(_ state: LoadState<Value>, onRetry: @escaping () -> Void) -> some View {
        var isStale = false
        if case .stale = state { isStale = true }
        return modifier(LoadStateChrome(isStale: isStale, hasError: state.error != nil, onRetry: onRetry))
    }
}

/// One fetch as a load outcome: the value, or its AppError; nil = cancelled / superseded (`task(id:)` restarted, the
/// screen went away) — the caller leaves its state alone. Rule (D-KIT-20): apply the outcome to the state AS IT IS
/// AFTER the await (`state.applying(outcome)`), and drop it when the screen's key (period / sort / filter / search)
/// changed meanwhile — a Retry or reconnect load is an unstructured Task that nothing cancels (#34).
func loadOutcome<Value>(_ fetch: () async throws -> Value) async -> Result<Value, AppError>? {
    do {
        let value = try await fetch()
        return Task.isCancelled ? nil : .success(value)
    } catch {
        guard !Task.isCancelled, let appError = AppError(error) else { return nil }
        return .failure(appError)
    }
}

extension LoadState {
    /// A load's outcome on the current state: fresh; or failing (stale when data is kept, else failed).
    func applying(_ outcome: Result<Value, AppError>) -> LoadState {
        switch outcome {
        case .success(let value): return .fresh(value)
        case .failure(let error): return failing(with: error)
        }
    }

    /// The same state with its value edited in place (a row edited or deleted on this screen).
    func mapValue(_ transform: (Value) -> Value) -> LoadState {
        switch self {
        case .loaded(let value, let fetchedAt, let refreshing):
            return .loaded(transform(value), fetchedAt: fetchedAt, refreshing: refreshing)
        case .stale(let value, let fetchedAt, let error):
            return .stale(transform(value), fetchedAt: fetchedAt, error: error)
        case .idle, .loading, .failed:
            return self
        }
    }
}
```

2. NEW `Shared/Components/TapTarget.swift`:
```swift
import SwiftUI

/// Polish #36 (frontend-kit D-KIT-21): the one tap-target rule — every tappable control is at least 44 × 44 pt (Apple
/// HIG; web 44 px, Android 48 dp). Apply to a Button's LABEL after its visual chrome: the drawn shape keeps its size,
/// only the hit area / layout box grows. A FIXED-size control in a tight row (a text field's eye, a card header's ✕,
/// the widget back circle) gives the growth back with negative padding so the row's height doesn't change.
extension View {
    func minTapTarget(alignment: Alignment = .center) -> some View {
        frame(minWidth: 44, minHeight: 44, alignment: alignment)
            .contentShape(Rectangle())
    }
}
```

3. NEW `Shared/Models/ProgramContext+ProgramSwitch.swift`:
```swift
import Foundation

extension ProgramContext {
    /// Polish #10 / #30: a program switch clears every program-scoped value a tab shows, so no screen renders the
    /// previous program's numbers under the new name — while its own load runs, or for good when offline. Called by
    /// ProgramPickerView.applyProgram, only when the program actually changes. (The Lifestyle tab and the detail
    /// screens keep their own keyed state — nothing shared to clear.)
    @MainActor
    func resetProgramScopedData() {
        // Members tab: the selected member's cards + the metrics preview
        selectedMemberOverview = nil
        memberHistory = []
        memberHistoryLabel = ""
        memberHistoryDailyAverage = 0
        memberStreaks = nil
        memberRecent = []
        memberHealthLogs = []
        memberMetrics = []
        memberMetricsTotal = 0
        memberMetricsFiltered = 0
        memberMetricsRangeStart = nil
        memberMetricsRangeEnd = nil
        // Summary: every field loadSummary writes
        totalLogsThisPeriod = 0
        totalWorkouts = 0
        totalDurationHours = 0
        averageDurationMinutes = 0
        logsChangePct = 0
        durationChangePct = 0
        avgDurationChangePct = 0
        atRiskMembers = 0
        timelinePoints = []
        distributionByDay = [:]
        distributionByDayCounts = [:]
        topPerformers = []
        topWorkoutTypes = []
        lastFetchedPeriod = nil
        mtdParticipation = nil
        totalWorkoutsMTD = 0
        totalWorkoutsChangePct = 0
        totalDurationHoursMTD = 0
        totalDurationChangePct = 0
        avgDurationMinutesMTD = 0
        avgDurationChangePctMTD = 0
        activityTimeline = []
        activityTimelineLabel = ""
        activityTimelineDailyAverage = 0
        workoutTypes = []
        // The program's workout-type list (Add workouts' picker, the Workout Types screen)
        programWorkouts = []
    }
}
```

4. NEW `Shared/Models/ProgramContext+Lifestyle.swift`:
```swift
import Foundation

/// Which Lifestyle numbers are on screen: a program + the member they're for (nil = program-wide, a global admin's
/// "None"). Polish #31 / #10: a new key never shows the previous one's numbers.
struct LifestyleKey: Equatable {
    let programId: String
    let memberId: String?
}

/// The Lifestyle tab's data — the tab's own copy (polish #31/#34: never shared with Summary or the timelines). A nil
/// part = that read failed (its card shows "—"); a read that succeeded empty stays a value (the card's own empty text).
struct LifestyleSnapshot {
    let key: LifestyleKey
    var total: Int?
    var mostPopular: APIClient.WorkoutTypeMostPopularDTO?
    var longestDuration: APIClient.WorkoutTypeLongestDurationDTO?
    var highestParticipation: APIClient.WorkoutTypeHighestParticipationDTO?
    var types: [APIClient.WorkoutTypeDTO]?
    var timeline: [APIClient.HealthTimelinePoint]?
    var steps: APIClient.StepsStatsDTO?

    fileprivate var hasAnyPart: Bool {
        total != nil || mostPopular != nil || longestDuration != nil || highestParticipation != nil
            || types != nil || timeline != nil || steps != nil
    }

    /// A part that failed this time keeps its last good value for the same key (A13: the parts that loaded stay).
    fileprivate func keepingParts(of previous: LifestyleSnapshot?) -> LifestyleSnapshot {
        guard let previous, previous.key == key else { return self }
        var merged = self
        merged.total = total ?? previous.total
        merged.mostPopular = mostPopular ?? previous.mostPopular
        merged.longestDuration = longestDuration ?? previous.longestDuration
        merged.highestParticipation = highestParticipation ?? previous.highestParticipation
        merged.types = types ?? previous.types
        merged.timeline = timeline ?? previous.timeline
        merged.steps = steps ?? previous.steps
        return merged
    }
}

extension ProgramContext {
    /// Polish #31: the Lifestyle tab's seven reads in PARALLEL (the Summary recipe, `loadSummary`). Returns every part
    /// that loaded + the first failure; nil with no session / program, or when superseded (cancelled, or the program
    /// changed meanwhile). Writes no shared field — the tab keeps the snapshot in its own LoadState.
    @MainActor
    func loadLifestyle(memberId: String?) async -> (snapshot: LifestyleSnapshot, failure: Error?)? {
        guard let token = authToken, !token.isEmpty, let pid = programId else { return nil }
        let api = APIClient.shared
        let week = AdminHomeView.Period.week.apiValue
        async let totalCall = api.fetchWorkoutTypesTotal(token: token, programId: pid, memberId: memberId)
        async let popularCall = api.fetchWorkoutTypeMostPopular(token: token, programId: pid, memberId: memberId)
        async let longestCall = api.fetchWorkoutTypeLongestDuration(token: token, programId: pid, memberId: memberId)
        async let participationCall = api.fetchWorkoutTypeHighestParticipation(token: token, programId: pid, memberId: nil) // always program-wide
        async let typesCall = api.fetchWorkoutTypes(token: token, programId: pid, memberId: memberId)
        async let timelineCall = api.fetchHealthTimeline(token: token, period: week, programId: pid, memberId: memberId)
        async let stepsCall = api.fetchHealthSteps(token: token, programId: pid, memberId: memberId)
        var s = LifestyleSnapshot(key: LifestyleKey(programId: pid, memberId: memberId))
        var failure: Error?
        do { s.total = (try await totalCall).total_types } catch { failure = failure ?? error }
        do { s.mostPopular = try await popularCall } catch { failure = failure ?? error }
        do { s.longestDuration = try await longestCall } catch { failure = failure ?? error }
        do { s.highestParticipation = try await participationCall } catch { failure = failure ?? error }
        do { s.types = try await typesCall } catch { failure = failure ?? error }
        do { s.timeline = (try await timelineCall).buckets } catch { failure = failure ?? error }
        do { s.steps = try await stepsCall } catch { failure = failure ?? error }
        guard !Task.isCancelled, programId == pid else { return nil }
        return (s, failure)
    }
}

extension LoadState where Value == LifestyleSnapshot {
    /// Merges a `loadLifestyle` result into the CURRENT state (the Summary recipe, A13): every part → loaded; some →
    /// stale (failed parts keep their last good value for the same key, else "—"); none → failing (stale over kept
    /// data, else the error view).
    func merging(_ result: (snapshot: LifestyleSnapshot, failure: Error?)) -> LoadState {
        let merged = result.snapshot.keepingParts(of: value)
        guard let failure = result.failure else { return .fresh(merged) }
        guard let error = AppError(failure) else { return self }            // cancelled = superseded
        return merged.hasAnyPart ? .stale(merged, fetchedAt: Date(), error: error) : failing(with: error)
    }
}
```

5. NEW `Features/Home/Settings/MyProfileSections.swift` (211 lines):
```swift
import SwiftUI
import AuthenticationServices
import GoogleSignIn

// My Profile sections, moved out of MyProfileView (file size; People S3 also edits that view).

/// Sign-in methods (auth phase-2, D-C10). Polish #18: three states — while loading every row reads "—" with its
/// button disabled, a failed load shows "Couldn't load · Retry", then the real rows (never a false "Not linked" + Link).
struct SignInMethodsSection: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var state: LoadState<IdentitiesResponse> = .idle
    @State private var linkError: String?
    @State private var isLinking = false
    @State private var showPasswordForm = false
    @State private var newAccountPassword = ""
    @State private var isSettingPassword = false
    @State private var hadUnconfirmedSetPassword = false
    @State private var showPasswordSetNotice = false

    private var identities: [IdentitiesResponse.Identity] { state.value?.identities ?? [] }
    private var isLoaded: Bool { state.value != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            Text("Sign-in methods").font(.subheadline.weight(.semibold))

            if case .failed(let error) = state {
                ErrorStateView(error: error.labeled(online: programContext.isOnline), onRetry: { Task { await load() } })
            } else {
                providerRow(provider: "google", label: "Google")
                providerRow(provider: "apple", label: "Apple")
                passwordRow
            }

            if showPasswordSetNotice {
                Text(SessionCopy.passwordSet)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appGreen)
            }

            if showPasswordForm && state.value?.hasPassword == false {
                AppInputField(title: "New password", text: $newAccountPassword, isSecure: true, contentType: .newPassword)
                Text("At least 8 characters with an uppercase, a lowercase, and a number.")
                    .font(.caption).foregroundColor(Color(.tertiaryLabel))
                AppPrimaryButton(title: "Save password", isLoading: isSettingPassword) {
                    Task { await addPassword() }
                }.frame(maxWidth: .infinity).disabled(!isNewPasswordValid || isSettingPassword)
            }

            if let linkError {
                Text(linkError).font(.footnote.weight(.semibold)).foregroundColor(.appRed)
            }
        }
        .task { await load() }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }          // D-IOS-KIT-3: refetch on reconnect
        }
    }

    private var passwordRow: some View {
        let hasPassword = state.value?.hasPassword
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Password").font(.subheadline.weight(.semibold))
                Text(hasPassword.map { $0 ? "Enabled" : "Not set" } ?? "—")
                    .font(.subheadline).foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
            if hasPassword == false {
                Button(showPasswordForm ? "Cancel" : "Add password") {
                    showPasswordForm.toggle(); linkError = nil; newAccountPassword = ""
                }.font(.footnote.weight(.semibold)).foregroundColor(.appOrange)
            }
        }
    }

    @ViewBuilder
    private func providerRow(provider: String, label: String) -> some View {
        let identity = identities.first { $0.provider == provider }
        let linked = identity != nil
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.subheadline.weight(.semibold))
                Text(isLoaded ? (linked ? (identity?.email ?? "Linked") : "Not linked") : "—")
                    .font(.subheadline).foregroundColor(Color(.secondaryLabel)).lineLimit(1).truncationMode(.middle)
            }
            Spacer()
            Button(linked ? "Unlink" : "Link") {
                Task { await toggleProvider(provider, linked: linked) }
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(.appOrange)
            .disabled(!isLoaded || isLinking || (linked && identities.count <= 1))
        }
    }

    private var isNewPasswordValid: Bool {
        newAccountPassword.range(of: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}$", options: .regularExpression) != nil
    }

    /// The kit load step (D-KIT-20) — a Retry keeps the rows (stale); a cancelled load changes nothing.
    private func load() async {
        state = state.refreshing()
        guard let outcome = await loadOutcome({ try await programContext.fetchIdentities() }) else { return }
        state = state.applying(outcome)
    }

    private func toggleProvider(_ provider: String, linked: Bool) async {
        isLinking = true; linkError = nil
        defer { isLinking = false }
        do {
            if linked {
                state = .fresh(try await programContext.unlink(provider: provider))
            } else {
                state = .fresh(try await (provider == "apple" ? programContext.linkApple() : programContext.linkGoogle()))
            }
        } catch {
            if !isCancellation(error) { linkError = SessionCopy.credentialMessage(for: error) }   // A8
        }
    }

    /// auth §3.1 rule 6 for set-password: never auto-retried; "couldn't confirm" after a 503 / 5xx / timeout; a
    /// same-password 400 on the manual retry means the earlier attempt landed. Other errors → kit copy (A8).
    private func addPassword() async {
        isSettingPassword = true; linkError = nil; showPasswordSetNotice = false
        defer { isSettingPassword = false }
        do {
            state = .fresh(try await programContext.setPassword(newPassword: newAccountPassword))
            passwordSetDone()
        } catch {
            if hadUnconfirmedSetPassword, let http = error as? APIHTTPError, http.statusCode == 400,
               http.message == SessionCopy.samePassword {
                await load()                                             // rule 6: the earlier attempt landed
                passwordSetDone()
            } else if SessionCopy.isUnconfirmedWrite(error) {
                hadUnconfirmedSetPassword = true
                linkError = SessionCopy.passwordUnconfirmed
            } else {
                linkError = SessionCopy.kitMessage(for: error)
            }
        }
    }

    private func passwordSetDone() {
        showPasswordForm = false
        newAccountPassword = ""
        hadUnconfirmedSetPassword = false
        showPasswordSetNotice = true
    }

    private func isCancellation(_ error: Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled || (error as? GIDSignInError)?.code == .canceled
    }
}

/// Delete Account (store reviewers try it — polish #15): a spinner on the button while it runs, and any failure in plain
/// words right under it — its own slot, never the profile form's error line far up the page.
struct DeleteAccountSection: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showConfirmation = false
    @State private var isDeleting = false
    @State private var deleteError: String?

    var body: some View {
        VStack(spacing: 8) {
            Divider()
                .padding(.bottom, 8)

            AppDestructiveButton(title: "Delete Account", isLoading: isDeleting) {
                deleteError = nil
                showConfirmation = true
            }
            .disabled(isDeleting)

            if let deleteError {
                Text(deleteError)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            Text("This will permanently delete your account and all associated data.")
                .font(.caption)
                .foregroundColor(Color(.tertiaryLabel))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .padding(.top, 20)
        .alert("Delete Account?", isPresented: $showConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await deleteAccount() }
            }
        } message: {
            Text("This action cannot be undone. All your data, including workout logs, health logs, and program memberships will be permanently deleted.")
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        deleteError = nil
        do {
            try await programContext.deleteAccount()   // success → the teardown → the sign-in screen
        } catch {
            deleteError = SessionCopy.kitMessage(for: error)
            isDeleting = false
        }
    }
}
```

### Models and services

6. `Shared/Models/ProgramContext+Members.swift`
   - (a) `loadLookupData` (#16). Replace the 5 lines from `@MainActor` / `func loadLookupData() async {` through the guard's closing `}` with:
```swift
    /// Roster + workouts + programs. Polish #16: returns its failure (nil = loaded, or no session) so a form can show
    /// "Couldn't load · Retry"; most callers ignore it.
    @discardableResult
    @MainActor
    func loadLookupData() async -> Error? {
        guard let token = authToken, !token.isEmpty else {
            return nil
        }
```
   - Inside `do`, after the closing `}` of the `if let pid … else if programId != nil { … }` chain, add `return nil`.
   - The catch body becomes:
```swift
            // Do not fail hard; surface error message
            if let message = AppError(error)?.message { errorMessage = message }
            return error
```
   - (b) `updateMemberProfile` (#44). Replace its `@MainActor` and signature lines with:
```swift
    /// Polish #44: `clearGender` sends an explicit JSON null (the user picked "Clear"); a nil gender otherwise omits
    /// the key, so an untouched-empty field never wipes a gender this device hasn't loaded.
    @MainActor
    func updateMemberProfile(memberId: String, firstName: String?, lastName: String?, gender: String?,
                             clearGender: Bool = false) async throws {
```
   - In its API call, change `gender: gender` to `gender: gender,` followed by a new line `clearGender: clearGender`.

7. `Shared/Services/APIClient+Members.swift`: inside **`func updateMemberProfile(`** only (around :327; do **not** touch the identical line at :221 in the create-member call):
   - The signature becomes:
```swift
    func updateMemberProfile(token: String, memberId: String, firstName: String?, lastName: String?, gender: String?,
                             clearGender: Bool = false) async throws -> MemberUpdateResponse {
```
   - Its `if let gender { body["gender"] = gender }` becomes:
```swift
        if let gender { body["gender"] = gender } else if clearGender { body["gender"] = NSNull() }   // #44: JSON null clears (web parity)
```

8. `Shared/Models/ProgramContext+WorkoutManagement.swift`. Replace from `@MainActor` / `func loadProgramWorkouts() async {` through its closing `}` with:
```swift
    /// Polish #16 / #29: returns its failure (nil = loaded, or no session / program) for the screens that show it.
    @discardableResult
    @MainActor
    func loadProgramWorkouts() async -> Error? {
        guard let token = authToken, !token.isEmpty else { return nil }
        guard let pid = programId else {
            errorMessage = "No program selected for program workouts."
            return nil
        }
        do {
            programWorkouts = try await APIClient.shared.fetchProgramWorkouts(token: token, programId: pid)
            return nil
        } catch {
            if let message = AppError(error)?.message { errorMessage = message }
            return error
        }
    }
```

9. `Shared/Models/ProgramContext+Analytics.swift` (#30). The file ends at about 92 lines.
   - (a) Between `import Foundation` and `extension ProgramContext {` insert:
```swift
/// The Summary reads (polish #30: the tab tracks which parts it has for the program on screen).
nonisolated enum SummaryPart: Hashable {
    case summary, mtd, workouts, duration, average, timeline, distribution, types
}

```
   - (b) The doc comment and signature of `loadSummary` become:
```swift
    /// Summary tab (board §6 item 5 + D-9): the 8 loads in PARALLEL, cache-only when `read == .cacheOnly`. Every load
    /// that succeeded is applied (amendment A13: partial failures keep the parts that loaded). Returns WHICH parts
    /// applied (polish #30) + the first failure (the tab goes stale / failed — frontend-kit §5); throws only when
    /// superseded.
    @MainActor
    func loadSummary(period: String, timelinePeriod: String,
                     read: APIClient.LaunchRead) async throws -> (applied: Set<SummaryPart>, failure: Error?) {
```
   - (c) Replace its last two statements (`let parts: [Any?] = …` and `return (parts.contains…, failure)`) with:
```swift
        var applied: Set<SummaryPart> = []
        if summary != nil { applied.insert(.summary) }
        if mtd != nil { applied.insert(.mtd) }
        if workouts != nil { applied.insert(.workouts) }
        if duration != nil { applied.insert(.duration) }
        if average != nil { applied.insert(.average) }
        if timeline != nil { applied.insert(.timeline) }
        if distribution != nil { applied.insert(.distribution) }
        if types != nil { applied.insert(.types) }
        return (applied, failure)
```
   - (d) **Delete** everything after `loadSummary`'s closing `}` up to (but not including) the file's final `}`. That removes 8 functions:
     - `loadActivityTimeline`, `loadHealthTimeline`, `loadStepsStats`, `loadWorkoutTypes`
     - `loadWorkoutTypesTotal`, `loadWorkoutTypeMostPopular`, `loadWorkoutTypeLongestDuration`, `loadWorkoutTypeHighestParticipation`

10. `Shared/Models/ProgramContext+ProgramManagement.swift`, `createProgram` (#12). Replace from `let response = try await APIClient.shared.createProgram(` to the end of the function with:
```swift
        _ = try await APIClient.shared.createProgram(
            token: token,
            name: name,
            status: status,
            startDate: startStr,
            endDate: endStr
        )

        // Polish #12: success is the create alone — a failed list refresh never reports "failed" (a retry would make a
        // duplicate). The picker reloads its list when the sheet closes anyway.
        if let updatedPrograms = try? await APIClient.shared.fetchPrograms(token: token) {
            programs = updatedPrograms
        }
    }
```

### Shared components

11. `Shared/Components/AppInputField.swift`. Replace the whole file:
```swift
import SwiftUI

struct AppInputField: View {
    let title: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .never
    /// Polish #35: the autofill hint (password managers / iCloud Keychain). The "@" keyboard is `keyboardType`.
    var contentType: UITextContentType? = nil
    var accessory: AnyView? = nil

    var body: some View {
        HStack {
            if isSecure {
                SecureField(title, text: $text)
                    .textContentType(contentType)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
                    .submitLabel(.done)
            } else {
                TextField(title, text: $text)
                    .keyboardType(keyboardType)
                    .textContentType(contentType)
                    .textInputAutocapitalization(autocapitalization)
                    .disableAutocorrection(true)
                    .submitLabel(.done)
            }

            if let accessory {
                accessory
            }
        }
        .padding(.horizontal, AppSpacing.mdl)
        .padding(.vertical, AppSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                .stroke(Color(.systemGray3), lineWidth: 1)
        )
    }
}

struct AppPasswordToggleButton: View {
    @Binding var isVisible: Bool

    var body: some View {
        Button(action: { isVisible.toggle() }) {
            Image(systemName: isVisible ? "eye.slash" : "eye")
                .foregroundColor(Color(.secondaryLabel))
                .minTapTarget()
        }
        // Polish #36: the 44-pt hit area sits inside the field's own padding — the field's height and the eye's
        // position don't change.
        .padding(.vertical, -AppSpacing.md)
        .padding(.trailing, -AppSpacing.md)
        .accessibilityLabel(isVisible ? "Hide password" : "Show password")
    }
}
```

12. `Shared/Components/GlassButton.swift`. Replace the struct; keep the file's header comment:
```swift
struct GlassButton: View {
    let icon: String
    /// Polish #36: what the button does, for VoiceOver (the icon has no text of its own). Every call site passes one;
    /// nil keeps the system's symbol description.
    var label: String? = nil

    var body: some View {
        if let label {
            glyph.accessibilityLabel(label)
        } else {
            glyph
        }
    }

    private var glyph: some View {
        Image(systemName: icon)
            .font(.title2.weight(.semibold))
            .foregroundColor(Color(.black))
            .frame(width: 52, height: 52)
            .background(
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.appOrange, Color.appOrangeGradientEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                Circle()
                    .stroke(Color.black.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: Color(.black).opacity(0.16), radius: 10, x: 0, y: 6)
    }
}
```

13. `Shared/Components/SearchablePickerSheet.swift`.
   - After `let selectedId: String?` insert:
```swift
    /// Polish #16: what an EMPTY list says — never a blank sheet. nil = no hint (still loading, or a filter sheet).
    var emptyHint: String? = nil
```
   - Inside `List {`, before `ForEach(filtered) { option in`, insert:
```swift
                if options.isEmpty, let emptyHint {
                    Text(emptyHint)
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
```

14. `Shared/Components/EdgeSwipeToReturn.swift` (#13). Replace the whole file:
```swift
import SwiftUI
import UIKit

/// A left-edge swipe-back "hack" for the program-detail area.
///
/// The program shell (AdminHomeView) and every tab root set `.navigationBarBackButtonHidden(true)`, which disables
/// iOS's native edge swipe-back there — leaving no quick way back to the program list. This installs ONE
/// `UIScreenEdgePanGestureRecognizer` on the window while the shell is on screen (removed with it) and, on completion:
///
/// - polish #13: leaves the program (`onRootSwipe`) ONLY from a tab's top screen;
/// - anything above it — a screen pushed on the outer stack (Summary, admin Lifestyle and admin Program have no stack
///   of their own), on the tab's own stack, or a presented sheet / cover — is a normal one-level back: the system
///   swipe-back when it is running (a transition is in flight), otherwise one pop here.
///
/// Because it only fires from the very screen edge, it does not conflict with the in-content
/// horizontal `DragGesture` scrubbing used by the summary/timeline charts.
extension View {
    func edgeSwipeToReturn(perform action: @escaping () -> Void) -> some View {
        background(EdgeSwipeToReturnInstaller(onRootSwipe: action))
    }
}

private struct EdgeSwipeToReturnInstaller: UIViewRepresentable {
    let onRootSwipe: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onRootSwipe: onRootSwipe)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false // never intercept content touches itself

        let recognizer = UIScreenEdgePanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleEdgePan(_:))
        )
        recognizer.edges = .left
        recognizer.delegate = context.coordinator
        context.coordinator.attach(recognizer, to: view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onRootSwipe = onRootSwipe
    }

    /// Polish #13: the recognizer lives on the WINDOW — remove it when the program shell leaves, so it never outlives
    /// AdminHomeView (or stacks up one per program visit).
    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onRootSwipe: () -> Void
        private weak var hostView: UIView?
        private var recognizer: UIScreenEdgePanGestureRecognizer?

        init(onRootSwipe: @escaping () -> Void) {
            self.onRootSwipe = onRootSwipe
        }

        /// Add the recognizer to the window once the host view is in a window, so it observes edge
        /// pans across the whole program-detail area (not just this zero-size background view).
        func attach(_ recognizer: UIScreenEdgePanGestureRecognizer, to view: UIView) {
            hostView = view
            self.recognizer = recognizer
            DispatchQueue.main.async { [weak self] in
                guard let self, let recognizer = self.recognizer,
                      let target = self.hostView?.window ?? self.hostView else { return }
                target.addGestureRecognizer(recognizer)
            }
        }

        func detach() {
            if let recognizer { recognizer.view?.removeGestureRecognizer(recognizer) }
            recognizer = nil
        }

        @objc func handleEdgePan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
            guard recognizer.state == .ended,
                  let root = (recognizer.view?.window ?? UIApplication.shared.keyWindowRoot)?.rootViewController,
                  let tabBar = deepestTabBarController(root) else { return }
            // A sheet / full-screen cover is up: it owns the swipe, never the program shell.
            if root.presentedViewController != nil { return }
            // Something is pushed above the shell on the OUTER stack → one level back, never leave the program.
            if let outer = tabBar.navigationController {
                if outer.transitionCoordinator != nil { return }          // the system swipe-back is already popping
                if let top = outer.topViewController, !isAncestor(top, of: tabBar) {
                    outer.popViewController(animated: true)
                    return
                }
            }
            // Something is pushed on the selected tab's OWN stack → the same.
            if let selected = tabBar.selectedViewController, let inner = firstNavigationController(in: selected) {
                if inner.transitionCoordinator != nil { return }
                if inner.viewControllers.count > 1 {
                    inner.popViewController(animated: true)
                    return
                }
            }
            onRootSwipe()   // a tab's top screen → back to the program list
        }

        // MARK: - UIGestureRecognizerDelegate

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }

        // MARK: - Hierarchy lookup

        /// `ancestor` is `vc` itself or one of its parents (the outer stack's top hosts the program shell).
        private func isAncestor(_ ancestor: UIViewController, of vc: UIViewController) -> Bool {
            var current: UIViewController? = vc
            while let candidate = current {
                if candidate === ancestor { return true }
                current = candidate.parent
            }
            return false
        }

        /// Deepest visible `UITabBarController` reachable through children/presented VCs — the program
        /// detail's `TabView`, even when other content sits above it in the outer navigation stack.
        private func deepestTabBarController(_ vc: UIViewController) -> UITabBarController? {
            var found: UITabBarController? = vc as? UITabBarController
            for child in vc.children {
                if let deeper = deepestTabBarController(child) { found = deeper }
            }
            if let presented = vc.presentedViewController,
               let deeper = deepestTabBarController(presented) {
                found = deeper
            }
            return found
        }

        /// The `UINavigationController` for a tab — the VC itself or its first descendant.
        private func firstNavigationController(in vc: UIViewController) -> UINavigationController? {
            if let nav = vc as? UINavigationController { return nav }
            for child in vc.children {
                if let nav = firstNavigationController(in: child) { return nav }
            }
            return nil
        }
    }
}

private extension UIApplication {
    var keyWindowRoot: UIWindow? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }
}
```

15. `Shared/Views/HealthSyncConfirmationView.swift` (#14, #36).
   - Replace `ToolbarItem(placement: .topBarTrailing) { tickButton }` with:
```swift
                // Polish #14: a way out — Later closes the review; `onDisappear` records the defer (nothing lost, asked
                // again on the next sync; a queued sleep / steps review shows next — Android's back does the same).
                ToolbarItem(placement: .topBarLeading) {
                    Button("Later") { dismiss() }
                        .disabled(isCommitting)
                }
                ToolbarItem(placement: .topBarTrailing) { tickButton }
```
   - In `tickButton`, after `.modifier(GlassTickStyle())` add `.accessibilityLabel("Confirm")`.

### Auth and onboarding (#17, #25, #28, #35)

16. `Features/Onboarding/SplashView.swift` (#25, plus removing dead code).
   - Delete `@Published var isCTAVisible: Bool = false`.
   - In `start()`, delete everything after the subheadline `await type(…)` block: the `if isSkipped { return }`, the 300 ms sleep and the `withAnimation { isCTAVisible = true }`. `start()` now ends right after that `await type(text: subheadline) {…}` call.
   - In `skip()`, change `guard !isCTAVisible else { return }` to `guard !isSkipped else { return }`, and change its `withAnimation` body to only `isHeadlineComplete = true`.
   - In the body, replace the whole `if viewModel.isCTAVisible { NavigationLink {…} … .transition(…) }` block with:
```swift
                // Polish #25: Sign in is there from the first frame — the typewriter above is decoration only.
                NavigationLink {
                    LoginView()
                } label: {
                    Text("Sign in")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .frame(maxWidth: 240)
                .foregroundColor(colorScheme == .dark ? .black : .white)
                .background(
                    Capsule()
                        .fill(Color(.label))
                )
                .adaptiveShadow(radius: 8, y: 4)
```

17. `Features/Auth/LoginView.swift` (#28, #35).
   - (a) Replace the line `            VStack(spacing: 16) {` (right after `.ignoresSafeArea()`) with:
```swift
            // Polish #28: scrollable like CreateAccountView, so keyboard avoidance scrolls the form instead of hiding fields.
            ScrollView {
                VStack(spacing: 16) {
```
   - (b) Delete the `Spacer()` just before that VStack's closing `}`. Replace the VStack's trailing modifiers (`.padding(.horizontal, 20)` / `.padding(.top, 24)` / `.frame(maxWidth: AdaptiveLayout.formMaxWidth)`) with:
```swift
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: AdaptiveLayout.formMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
```
     Indent everything between `ScrollView {` and the closing `}` by 4 spaces.
   - (c) The identifier field gets `contentType: .username` after `text: $identifier,`.
   - (d) The password field gets `contentType: .password,` before `accessory:`, and after its `)` add:
```swift
                        .onSubmit {
                            // Polish #35: Return on the password field signs in (the Login button's own gate).
                            guard !isLoading, !identifier.isEmpty, !password.isEmpty else { return }
                            Task { await handleLogin() }
                        }
```

18. `Features/Auth/ForgotPasswordView.swift` (#35). The email field becomes `keyboardType: .emailAddress,` followed by `contentType: .emailAddress`.

19. `Features/Home/Settings/ChangePasswordView.swift` (#35).
   - New password: add `contentType: .newPassword,` before `accessory:`.
   - Confirm: `AppInputField(title: "••••••••", text: $confirmPassword, isSecure: true, contentType: .newPassword)`.

20. `Features/Auth/CreateAccountView.swift` (#17, #35).
   - (a) After `@State private var didConfigure: Bool = false` add:
```swift
    // Polish #17: a taken username / email shows on the step that owns the field; once the account exists, a retry
    // only signs in — with the credentials it was created with, even if a field was edited since.
    @State private var detailsError: String?
    @State private var registered: (username: String, password: String)?
    /// The server's 400 texts for a taken name (authService register + oauth/complete).
    private static let takenMessages: Set<String> = ["Username already exists", "Email already exists"]
```
   - (b) Content types:
     - First Name / Last Name fields add `, contentType: .givenName)` / `, contentType: .familyName)`.
     - `AppInputField(title: "Username", text: $username, contentType: .username)`.
     - `AppInputField(title: "Email", text: $email, keyboardType: .emailAddress, contentType: .emailAddress)`.
     - Both password fields: add `contentType: .newPassword,` before `accessory:`.
   - (c) In `detailsPage`, after the closing `}` of the email `VStack(alignment: .leading, spacing: 6) { … }` (still inside the outer `VStack(spacing: 16)`), add:
```swift

                if let detailsError {
                    Text(detailsError)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appRed)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
```
   - (d) After `.onAppear(perform: configureIfNeeded)` add:
```swift
        .onChange(of: username) { detailsError = nil }
        .onChange(of: email) { detailsError = nil }
```
   - (e) Replace `advance()` with:
```swift
    private func advance() {
        if step < lastStep {
            withAnimation { step += 1 }
            return
        }
        // Polish #17: the paged TabView can be swiped past a page's checks — re-check every page and jump to the first
        // that fails (not once the account exists: then the tap only signs in).
        if registered == nil, let invalid = (0...lastStep).first(where: { !canContinue($0) }) {
            withAnimation { step = invalid }
            return
        }
        if isSocial {
            Task { await handleCompleteSocial() }
        } else {
            Task { await handleCreateAccount() }
        }
    }

    /// Polish #17: back to the details step with the server's message under the field.
    private func showTaken(_ message: String) {
        detailsError = message
        withAnimation { step = 1 }
    }
```
   - (f) In `handleCreateAccount()`, replace the two `do/catch` blocks with:
```swift
        let login: (username: String, password: String)
        if let registered {
            login = registered                                           // #17: the account exists — sign in only
        } else {
            do {
                _ = try await APIClient.shared.registerAccount(firstName: firstName, lastName: lastName, username: username,
                                                                email: email, password: password, gender: gender)
            } catch {
                let message = SessionCopy.credentialMessage(for: error)    // sign-up, not a sign-in: no event
                if Self.takenMessages.contains(message) { showTaken(message) } else { showAlert(message) }
                return
            }
            login = (username, password)
            registered = login
        }
        do {
            let response = try await APIClient.shared.loginGlobal(identifier: login.username, password: login.password)
            try await programContext.applyAuthResponse(response)
            navigateToProgramPicker = true
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "password")
            showAlert("Account created. Please sign in.")              // #17: tapping Create Account again signs in
        }
```
   - (g) In `handleCompleteSocial()`'s catch, replace `showAlert(SessionCopy.credentialMessage(for: error))` with:
```swift
            let message = SessionCopy.credentialMessage(for: error)
            if Self.takenMessages.contains(message) { showTaken(message) } else { showAlert(message) }
```

### My Profile (#15, #18, #35, #44)

21. `Features/Home/Settings/MyProfileView.swift` (547 → 373 lines).
   - (a) Delete `import AuthenticationServices` and `import GoogleSignIn`.
   - (b) Delete `showDeleteConfirmation` and `isDeleting`. Also delete the `// Sign-in methods (auth phase-2, D-C10)` comment and the 9 `@State` lines after it (`identities` … `showPasswordSetNotice`).
   - (c) First/last name fields add `, contentType: .givenName)` / `, contentType: .familyName)`.
   - (d) Change `signInMethodsSection` (in the body) to `SignInMethodsSection()`.
   - (e) Replace the `// Delete Account Section` comment and the whole `if !programContext.isGlobalAdmin { VStack(spacing: 8) { … } .padding(.top, 20) }` with:
```swift
                if !programContext.isGlobalAdmin {
                    DeleteAccountSection()
                }
```
   - (f) Delete the `.alert("Delete Account?", …) { … } message: { … }` modifier.
   - (g) In `.task`, delete `await loadIdentities()`.
   - (h) The new-email field becomes `AppInputField(title: "you@example.com", text: $newEmail, keyboardType: .emailAddress, contentType: .emailAddress)`, and the trailing `.keyboardType(.emailAddress)` line is removed. Current password becomes `AppInputField(title: "Current password", text: $emailPassword, isSecure: true, contentType: .password)`.
   - (i) Delete everything from `@ViewBuilder private var signInMethodsSection` through the end of `isCancellation(_:)`, and delete `deleteAccount()`.
   - (j) In `save()`, change `gender: gender.isEmpty ? nil : gender` to:
```swift
                gender: gender.isEmpty ? nil : gender,
                clearGender: gender.isEmpty && didEditGender      // #44: "Clear" sends null (web parity)
```

### Picker, actions and settings (#10, #12, #14, #27, #30, #36, #38, #45)

22. `Features/Home/ProgramPickerView.swift`.
   - (a) After `pendingInvitesCount` add:
```swift

    /// The "+" badge AND its spoken count (polish #36) — one number, so N4's "unread + invites" changes both together.
    private var plusBadgeCount: Int { pendingInvitesCount }
```
   - (b) In `floatingProgramActionsButton`:
     - `if pendingInvitesCount > 0 {` / `Text("\(pendingInvitesCount)")` use `plusBadgeCount`.
     - `.accessibilityLabel("Program actions")` becomes `.accessibilityLabel(plusBadgeCount > 0 ? "Program actions, \(plusBadgeCount) new" : "Program actions")`.
   - (c) In `programRow`, after the `.onTapGesture { … }` block add `.accessibilityAddTraits(canOpen ? .isButton : [])        // #36: VoiceOver opens the card like a button`.
   - (d) The first lines of `applyProgram(_:)`:
```swift
        // Polish #10 / #30: a different program never shows the previous one's numbers.
        if program.id != programContext.programId { programContext.resetProgramScopedData() }
```
   - (e) In AccountMenuSheet, change `subtitle: "Sync workouts automatically"` to `subtitle: "Sync workouts, sleep, and steps"`.
   - (f) On the "Cancel request" `Text`, after `.foregroundColor(Color(.label))` add `.minTapTarget(alignment: .leading)`.

23. `Features/Home/Tabs/ProgramCards.swift`. The Apple Health row's `subtitle: "Sync workouts automatically"` becomes `"Sync workouts, sleep, and steps"`.

24. `Features/Home/ProgramActions/CreateProgramTabView.swift` (#38).
   - Replace `isFormValid` with:
```swift
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // Polish #38: Edit's client-side date check (EditProgramInfoView, web program/edit D-C1) — end must be after start.
    private var dateRangeError: String? {
        Self.dayFormatter.string(from: startDate) >= Self.dayFormatter.string(from: endDate)
            ? "End date must be after the start date." : nil
    }

    private var isFormValid: Bool {
        !programName.trimmingCharacters(in: .whitespaces).isEmpty && dateRangeError == nil
    }
```
   - Before `if let errorMessage {` add:
```swift
                if let dateRangeError {
                    Text(dateRangeError)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

```

25. `Features/Home/Settings/AppleHealthSettingsView.swift` (#27, #36).
   - (a) After `@State private var stepsSyncError: String?` add:
```swift
    /// Polish #27: the program list's own load (frontend-kit §5) — never "No programs available" while loading or after
    /// a failure. Seeded with the list already in memory, so it shows at once and refreshes underneath.
    @State private var programsState: LoadState<[APIClient.ProgramDTO]> = .idle
```
   - (b) Replace the body's `.task { guard let token … }` block with:
```swift
        .loadStateChrome(programsState, onRetry: { Task { await loadPrograms() } })
        .task { await loadPrograms() }
```
   - (c) Insert right before `/// One selectable program row`:
```swift
    private func loadPrograms() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        if programsState.value == nil, !programContext.programs.isEmpty {
            programsState = .loaded(programContext.programs, fetchedAt: Date(), refreshing: false)
        }
        programsState = programsState.refreshing()
        guard let outcome = await loadOutcome({ try await APIClient.shared.fetchPrograms(token: token) }) else { return }
        programsState = programsState.applying(outcome)
        if case .success(let programs) = outcome { programContext.programs = programs }
    }

    /// Polish #27: one program list for the three selectors — load states, and only programs you're ACTIVE in (the
    /// server skips every other program: healthSyncService `skipped_not_member`).
    @ViewBuilder
    private func programList(selectedIds: Set<String>, onToggle: @escaping (String) -> Void) -> some View {
        LoadStateContent(state: programsState, minHeight: 80, onRetry: { Task { await loadPrograms() } }) { all in
            let programs = all.filter { ($0.my_status ?? "").lowercased() == "active" }
            if programs.isEmpty {
                Text("No programs available. Join or create a program first.")
                    .font(.caption)
                    .foregroundColor(Color(.tertiaryLabel))
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(cardBackground)
                    .overlay(cardBorder(Color(.systemGray4).opacity(0.6)))
            } else {
                VStack(spacing: 0) {
                    ForEach(programs, id: \.id) { program in
                        programRow(program, isSelected: selectedIds.contains(program.id)) { onToggle(program.id) }
                        if program.id != programs.last?.id {
                            Divider().padding(.leading, 50)
                        }
                    }
                }
                .background(cardBackground)
                .overlay(cardBorder(Color(.systemGray4).opacity(0.6)))
            }
        }
    }

```
   - (d) In `programSelectionSection`, replace the whole `if programContext.programs.isEmpty { … } else { … }` (28 lines) with:
```swift
            programList(selectedIds: programContext.healthKitSyncProgramIds) { id in
                if programContext.healthKitSyncProgramIds.contains(id) {
                    programContext.healthKitSyncProgramIds.remove(id)
                } else {
                    programContext.healthKitSyncProgramIds.insert(id)
                }
                programContext.persistHealthKitSettings()
            }
```
     Do the same in `sleepProgramSelectionSection` (`sleepSyncProgramIds`, `persistSleepSyncSettings()`) and `stepsProgramSelectionSection` (`stepsSyncProgramIds`, `persistStepsSyncSettings()`).
   - (e) In `programRow`, after `.disabled(locked)` add `.accessibilityAddTraits(isSelected ? .isSelected : [])`.

26. `Features/Home/Settings/AppearanceSettingsView.swift`.
   - `Text("Choose how RaSi Fit'ers looks to you")` becomes `Text("Choose how RaSi Fiters looks to you")`.
   - After the row's `.buttonStyle(.plain)` add `.accessibilityAddTraits(themeManager.appearance == mode ? .isSelected : [])`.

27. `Features/Home/ProgramActions/InviteCardView.swift` (#36; the row grows about 4 pt, per P-8).
   - After each of the 3 `.contentShape(Capsule())` lines, add `.minTapTarget()` at the same indentation: Accept and Decline at 24 spaces, Revoke at 28. **Exactly one per button.**

28. `Features/Home/ProgramActions/InvitesTabView.swift` (#36).
   - On the "Block future invites" `Button`, after `.contentShape(Rectangle())` / `.buttonStyle(.plain)`, add `.accessibilityAddTraits(blockFutureInvites ? .isSelected : [])`.

### Program management (#9, #11, #29, #36)

29. `Features/Home/ProgramManagement/WorkoutTypesSection.swift` (in `ViewWorkoutTypesListView` and `EditCustomWorkoutSheet`).
   - (a) After `@State private var errorMessage: String?` in `ViewWorkoutTypesListView` add:
```swift
    /// Polish #9: a failed hide / show / delete, shown at the top of the list (web / Android parity); the Add / Edit
    /// sheets show their own.
    @State private var actionError: String?
    /// Polish #29: the list's own load state; the value = the program whose list is on screen.
    @State private var loadState: LoadState<String> = .idle
```
   - (b) In `body`, replace `        List {` / `            // Visible workouts section` with the block below.
     - Indent the whole existing List body by 4 spaces.
     - After the List's closing `}`, add `        }` before `// Container cap …`.
```swift
        LoadStateContent(state: loadState, onRetry: { Task { await load() } }) { _ in
            List {
                if let actionError {
                    Section {
                        Text(actionError)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appRed)
                    }
                }

                // Visible workouts section
```
   - (c) Replace the `.task { await programContext.loadProgramWorkouts() }` and `.refreshable { … }` blocks with:
```swift
        .task { await load() }
        .refreshable { await load() }
        .loadStateChrome(loadState, onRetry: { Task { await load() } })
```
   - (d) Insert before `private func editCustomWorkoutSheet`:
```swift
    /// Polish #29: the kit load step on the program's list (a Retry keeps the list — stale + banner).
    private func load() async {
        guard let pid = programContext.programId else { return }
        actionError = nil
        if loadState.value != pid {
            // The Program tab / log forms usually loaded this program's list already (a program switch clears it), so
            // it shows at once and refreshes underneath.
            loadState = programContext.programWorkouts.isEmpty ? .idle : .loaded(pid, fetchedAt: Date(), refreshing: false)
        }
        loadState = loadState.refreshing()
        guard let failure = await programContext.loadProgramWorkouts() else {
            loadState = .fresh(pid)
            return
        }
        guard let appError = AppError(failure) else { return }        // cancelled
        loadState = loadState.failing(with: appError)
    }

```
   - (e) In `editCustomWorkoutSheet`, `onSave:` becomes:
```swift
            onSave: { newName in
                do {
                    try await programContext.editCustomProgramWorkout(workoutId: workout.id, name: newName)
                    workoutToEdit = nil
                    return nil
                } catch {
                    return SessionCopy.kitMessage(for: error)          // #9: shown in the sheet, which stays open
                }
            },
```
   - (f) In `toggleVisibility`, `toggleCustomVisibility` and `deleteWorkout`:
     - Add `actionError = nil` after `isProcessing = true`.
     - Change `errorMessage = SessionCopy.kitMessage(for: error)` to `actionError = SessionCopy.kitMessage(for: error)`.
     - `addCustomWorkout` is unchanged.
   - (g) In `EditCustomWorkoutSheet`:
     - Change `let onSave: (String) -> Void` to:
```swift
    /// Returns nil on success (the parent closes the sheet) or the error to show here (polish #9).
    let onSave: (String) async -> String?
```
     - Add `@State private var errorMessage: String?` after `isSaving`.
     - After the `Section { TextField… } header: { Text("Edit Custom Workout") }`, add:
```swift

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundColor(.appRed)
                    }
                }
```
     - The Save button becomes:
```swift
                    Button("Save") {
                        Task {
                            // Polish #9: a failure keeps the sheet open with the error, and Save works again.
                            isSaving = true
                            errorMessage = await onSave(workoutName.trimmingCharacters(in: .whitespacesAndNewlines))
                            isSaving = false
                        }
                    }
```

30. `Features/Home/ProgramManagement/MemberManagementSection.swift` (#11).
   - Delete `@State private var isActive: Bool = true`.
   - Delete the whole `Toggle(isOn: $isActive) { … }` / `.adaptiveTint()` block, together with the blank line before it.
   - Delete `isActive = membership.is_active` (in `.onAppear`) and `.onChange(of: isActive) { errorMessage = nil }`.
   - In `save()`, use `isActive: nil,          // #11: the Active toggle is gone — "Remove from Program" (confirmed) covers removal; nil omits the key`.

31. `Features/Home/ProgramManagement/RoleManagementSection.swift` (#36; the row grows about 8 pt, per P-8). In `roleButton`:
   - After `.contentShape(Capsule())` inside the label, add `.minTapTarget()`.
   - After `.opacity(isSelected || !isDisabled ? 1.0 : 0.55)`, add `.accessibilityAddTraits(isSelected ? .isSelected : [])`.

### Program shell, Summary and Members (#10, #30, #36)

32. `Features/Home/AdminHomeView.swift`. In `enum Period`, after `var label: String { rawValue }` add:
```swift

        /// Polish #36: what VoiceOver says for a period segment (the visible label is one letter).
        var spokenName: String {
            switch self {
            case .week: return "Week"
            case .month: return "Month"
            case .year: return "Year"
            case .program: return "Program"
            }
        }
```

33. `Features/Home/Tabs/SummaryCards.swift`. In `PlaceholderCard`:
   - Add `/// Polish #30: the load settled without this card's data → "—" (never a fake 0); otherwise a spinner while it loads.` and `var isUnavailable = false` after `let title: String`.
   - Replace `ProgressView()` with:
```swift
            if isUnavailable {
                Text("—")
                    .font(.title3.weight(.bold))
                    .foregroundColor(Color(.secondaryLabel))
                    .accessibilityLabel("Unavailable")
            } else {
                ProgressView()
            }
```

34. `Features/Home/Tabs/AdminSummaryTab.swift` (#30).
   - (a) After `@State private var loadState …` add:
```swift
    /// Polish #30: which Summary reads this program has on screen — a card without its part shows a spinner while a
    /// load is in flight and "—" once it settled (never a fake 0 or the previous program's total).
    @State private var loadedParts: Set<SummaryPart> = []
```
   - (b) Replace `load()` (from its doc comment through its closing `}`) with:
```swift
    /// Instant open (D-9): cached Summary first, then the network; the 8 loads run in parallel (ProgramContext.loadSummary).
    private func load() async {
        guard let pid = programContext.programId else { return }
        if loadState.value != pid {                                        // another program's data never carries over
            loadState = .idle
            loadedParts = []
        }
        if loadState.value == nil,
           let cached = try? await programContext.loadSummary(period: period.apiValue, timelinePeriod: timelinePeriod.apiValue,
                                                               read: .cacheOnly),
           cached.failure == nil {
            loadedParts = cached.applied
            loadState = .loaded(pid, fetchedAt: Date(), refreshing: true)
        }
        loadState = loadState.refreshing()
        guard let result = try? await programContext.loadSummary(period: period.apiValue, timelinePeriod: timelinePeriod.apiValue,
                                                                 read: .network) else { return }   // superseded
        loadedParts.formUnion(result.applied)
        guard let failure = result.failure else {
            loadState = .fresh(pid)
            return
        }
        guard let appError = AppError(failure)?.labeled(online: programContext.isOnline) else { return }   // cancelled = superseded; polish-1 rule 6
        // A13: parts that loaded stay on screen as stale data (never the error view over real values).
        loadState = result.applied.isEmpty ? loadState.failing(with: appError) : .stale(pid, fetchedAt: Date(), error: appError)
    }

    /// Polish #30: a load is running (first load, Retry, or a refresh) — a missing card shows a spinner, not "—".
    private var isLoadInFlight: Bool {
        switch loadState {
        case .idle, .loading: return true
        case .loaded(_, _, let refreshing): return refreshing
        case .failed, .stale: return false
        }
    }

    private func missingCard(_ title: String) -> some View {
        PlaceholderCard(title: title, isUnavailable: !isLoadInFlight)
    }
```
   - (c) In `cardView(for:)`, replace the cases from `case .mtdParticipation:` through the end of `case .workoutTypes:` (`.programProgress`, `.addWorkout` and `.addDailyHealth` are unchanged) with:
```swift
        case .mtdParticipation:
            if loadedParts.contains(.mtd), let mtd = programContext.mtdParticipation {
                MTDParticipationCard(
                    active: mtd.active_members,
                    total: mtd.total_members,
                    pct: mtd.participation_pct,
                    change: mtd.change_pct
                )
            } else {
                missingCard("MTD Participation")
            }
        case .totalWorkouts:
            if loadedParts.contains(.workouts) {
                TotalWorkoutsCard(total: programContext.totalWorkoutsMTD, change: programContext.totalWorkoutsChangePct)
            } else {
                missingCard("Total workouts")
            }
        case .totalDuration:
            if loadedParts.contains(.duration) {
                TotalDurationCard(hours: programContext.totalDurationHoursMTD, change: programContext.totalDurationChangePct)
            } else {
                missingCard("Total duration")
            }
        case .avgDuration:
            if loadedParts.contains(.average) {
                AvgDurationCard(minutes: programContext.avgDurationMinutesMTD, change: programContext.avgDurationChangePctMTD)
            } else {
                missingCard("Avg duration")
            }
        case .activityTimeline:
            if loadedParts.contains(.timeline) {
                NavigationLink {
                    ActivityTimelineDetailView(initialPeriod: timelinePeriod)
                } label: {
                    ActivityTimelineCardSummary(points: programContext.activityTimeline)
                }
            } else {
                missingCard("Workout Activity Timeline")
            }
        case .distributionByDay:
            if loadedParts.contains(.distribution) {
                NavigationLink {
                    DistributionByDayDetailView(points: distributionPoints(fromCounts: programContext.distributionByDayCounts))
                } label: {
                    DistributionByDayCard(points: distributionPoints(fromCounts: programContext.distributionByDayCounts),
                                          interactive: false)
                }
            } else {
                missingCard("Workout Distribution by Day")
            }
        case .workoutTypes:
            if loadedParts.contains(.types) {
                NavigationLink {
                    WorkoutTypesDetailView(types: programContext.workoutTypes)
                } label: {
                    WorkoutTypesSummaryCard(types: programContext.workoutTypes)
                }
            } else {
                missingCard("Top Workout Types")
            }
```

35. `Features/Home/Tabs/AdminMembersTab.swift` (#10, #36).
   - (a) After `@State private var selectedMember: APIClient.MemberDTO?` add:
```swift
    /// #10: the selected member's tab reads — cancelled when the selection or the program changes, so a slow read for
    /// the previous member never lands under the new name.
    @State private var memberLoadTask: Task<Void, Never>?
```
   - (b) `GlassButton(icon: "envelope.badge.person.crop", label: "Invite member")`.
   - (c) `.onChange(of: programContext.programId)` becomes:
```swift
        .onChange(of: programContext.programId) { _, _ in
            // #10: "View as" belongs to one program — reset it for every role (global admins too).
            memberLoadTask?.cancel()
            selectedMember = nil
            applyDefaultSelectionIfNeeded()
        }
```
   - (d) Replace `applySelection` and `loadMemberData` with:
```swift
    private func applySelection(_ member: APIClient.MemberDTO?) {
        selectedMember = member
        showMemberPicker = false
        memberLoadTask?.cancel()
        clearSelectedMemberData()          // #10: the previous member's numbers never sit under the new name
        guard let member else { return }
        memberLoadTask = Task { await loadMemberData(for: member) }
    }

    @MainActor
    private func loadMemberData(for member: APIClient.MemberDTO) async {
        // Polish #5: the four tab-level reads in parallel; MemberHealthCard loads its own preview (.task(id:)).
        let pc = programContext
        let memberId = member.id
        await withDiscardingTaskGroup { group in
            group.addTask { await pc.loadMemberOverview(memberId: memberId) }
            group.addTask { await pc.loadMemberHistory(memberId: memberId, period: "week") }
            group.addTask { await pc.loadMemberStreaks(memberId: memberId) }
            group.addTask { await pc.loadMemberRecent(memberId: memberId, limit: 10) }
        }
    }

    private func clearSelectedMemberData() {
        programContext.selectedMemberOverview = nil
        programContext.memberHistory = []
        programContext.memberStreaks = nil
        programContext.memberRecent = []
        programContext.memberHealthLogs = []
    }
```

36. `Features/Home/Tabs/StandardMembersTab.swift` (#10, #36).
   - (a) After `@State private var loadedProgramId: String?` add:
```swift
    /// #10: the logger's View-as Recent read — cancelled on the next switch / program change.
    @State private var loggerLoadTask: Task<Void, Never>?
```
   - (b) `GlassButton(icon: "person.2", label: "View members")`.
   - (c) `.onChange(of: programContext.programId)` becomes:
```swift
        .onChange(of: programContext.programId) { _, _ in
            loggerLoadTask?.cancel()
            loggerViewAsMember = nil       // #10: a member of the previous program never carries over
            Task {
                await loadUserData()
            }
        }
```
   - (d) In the logger picker's `onSelect`, replace `loggerViewAsMember = m` / `Task { await loadLoggerLogsData(memberId: m.id) }` with:
```swift
                    loggerViewAsMember = m
                    loggerLoadTask?.cancel()
                    programContext.memberRecent = []       // #10: the previous member's rows never sit under the new name
                    loggerLoadTask = Task {
                        await loadLoggerLogsData(memberId: m.id)
                    }
```

37. `Features/Home/Tabs/MemberCards.swift` (#29, one line). `MemberStreakDetail()` becomes `MemberStreakDetail(memberId: selectedMember?.id ?? programContext.loggedInUserId)`.

### Lifestyle tab (#31, #36, #43)

38. `Features/Home/Tabs/WorkoutTypesCards.swift`.
   - (a) Insert before `struct WorkoutTypesHeader: View {`:
```swift
/// Polish #43: the big orange / green values on white were ≈2:1 — light mode uses a darker shade (≥ 4.5:1 on white),
/// dark mode keeps the system color. Local to these cards on purpose (palette tokens untouched — D-KIT-10).
private extension Color {
    static let lifestyleOrangeValue = Color(light: Color(hex: "C2410C"), dark: .orange)
    static let lifestyleGreenValue = Color(light: Color(hex: "15803D"), dark: .green)
}

```
   - (b) `GlassButton(icon: "dumbbell", label: "Workout types")`.
   - (c) `WorkoutTypesTotalCard`:
     - `let total: Int` becomes `/// nil = the read failed (polish #31: "—", never a fake 0).` and `let total: Int?`.
     - The value becomes `Text(total.map { "\($0)" } ?? "—")` with `.foregroundColor(.lifestyleOrangeValue)`.
     - `AccentChip` keeps `accent`.
   - (d) `WorkoutTypeMostPopularCard`, `WorkoutTypeLongestDurationCard` and `WorkoutTypeHighestParticipationCard`:
     - Add `var isUnavailable = false` right before `private let accent`.
     - The value `Text(name ?? "N/A")` becomes `Text(isUnavailable ? "—" : (name ?? "N/A"))`.
     - The footnotes become, in that order:
       - `Text(isUnavailable ? "" : (name == nil ? "No data" : "\(sessions) workouts"))`
       - `Text(isUnavailable ? "" : (name == nil ? "No data" : "\(avgMinutes) mins avg"))`
       - `Text(isUnavailable ? "" : (name == nil ? "No data" : String(format: "%.1f%% of members", participationPct)))`
     - In HighestParticipation only, the value's `.foregroundColor(accent)` becomes `.foregroundColor(.lifestyleGreenValue)`.

39. `Features/Home/Tabs/StandardWorkoutTypesTab.swift`. Replace the whole file (136 lines; it hosts the shared `LifestyleCardsSection`):
```swift
import SwiftUI

// MARK: - Standard Workout Types Tab (for non-admin users)
//
// Tab 3 "Lifestyle", non-admin (logger/member) variant — own data only, no view-as picker.
// Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift` (run 56).
// Polish #31: the Summary recipe — its own keyed LoadState (ProgramContext.loadLifestyle, seven reads in parallel),
// the kit error view + Retry, the stale banner, pull-to-refresh, a reload on reconnect and on every visit; a part
// that failed shows "—", never a fake 0 / "N/A" / "No data". `LifestyleCardsSection` (below) is shared with
// AdminWorkoutTypesTab.

struct StandardWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    /// This tab's own data for (program, me) — frontend-kit §5.
    @State private var loadState: LoadState<LifestyleSnapshot> = .idle

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color.appBackground
                    .ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        // Header with View Workouts button
                        HStack(alignment: .center, spacing: 14) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Lifestyle")
                                    .font(.largeTitle.weight(.bold))
                                    .foregroundColor(Color(.label))
                                Text(programContext.name)
                                    .font(.headline.weight(.semibold))
                                    .foregroundColor(Color(.secondaryLabel))
                            }

                            Spacer()

                            // View Workouts button
                            NavigationLink {
                                ViewWorkoutTypesListView()
                            } label: {
                                GlassButton(icon: "dumbbell", label: "Workout types")
                            }
                        }

                        LoadStateContent(state: loadState, onRetry: { Task { await load() } }) { snapshot in
                            LifestyleCardsSection(snapshot: snapshot)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    .padding(.bottom, 24)
                    .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await load() }
            }
            .loadStateChrome(loadState, onRetry: { Task { await load() } })
            .navigationBarBackButtonHidden(true)
        }
        // Every visit reloads (a re-entry keeps the cards and refreshes underneath — polish #5); a program switch
        // restarts it for the new program.
        .task(id: programContext.programId) { await load() }
    }

    private func load() async {
        guard let userId = programContext.loggedInUserId, let pid = programContext.programId else { return }
        // #10: another program's numbers never carry over — a new key starts from the spinner.
        if loadState.value?.key != LifestyleKey(programId: pid, memberId: userId) { loadState = .idle }
        loadState = loadState.refreshing()
        guard let result = await programContext.loadLifestyle(memberId: userId) else { return }   // superseded
        loadState = loadState.merging(result)
    }
}

/// The Lifestyle tab's cards for one loaded snapshot (polish #31) — shared by the admin and standard tabs. A part that
/// failed to load shows "—" (never a fake 0 / "N/A" / "No data"); a part that loaded empty keeps the card's own text.
/// The timeline drill-downs open for the snapshot's own member (the label the cards are under).
struct LifestyleCardsSection: View {
    let snapshot: LifestyleSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(spacing: 14) {
                HStack(spacing: 14) {
                    WorkoutTypesTotalCard(total: snapshot.total)
                        .frame(maxWidth: .infinity)
                    WorkoutTypeMostPopularCard(
                        name: snapshot.mostPopular?.workout_name,
                        sessions: snapshot.mostPopular?.sessions ?? 0,
                        isUnavailable: snapshot.mostPopular == nil
                    )
                    .frame(maxWidth: .infinity)
                }
                HStack(spacing: 14) {
                    WorkoutTypeLongestDurationCard(
                        name: snapshot.longestDuration?.workout_name,
                        avgMinutes: snapshot.longestDuration?.avg_minutes ?? 0,
                        isUnavailable: snapshot.longestDuration == nil
                    )
                    .frame(maxWidth: .infinity)
                    WorkoutTypeHighestParticipationCard(
                        name: snapshot.highestParticipation?.workout_name,
                        participationPct: snapshot.highestParticipation?.participation_pct ?? 0,
                        isUnavailable: snapshot.highestParticipation == nil
                    )
                    .frame(maxWidth: .infinity)
                }
            }

            StepsStatsCard(stats: snapshot.steps)          // nil already reads "—"

            if let types = snapshot.types {
                WorkoutTypePopularityCard(types: types)
            } else {
                PlaceholderCard(title: "Workout Type Popularity", isUnavailable: true)
            }

            if let timeline = snapshot.timeline {
                NavigationLink {
                    LifestyleTimelineDetailView(initialPeriod: .week, memberId: snapshot.key.memberId)
                } label: {
                    LifestyleTimelineCardSummary(points: timeline)
                }
                NavigationLink {
                    StepsTimelineDetailView(initialPeriod: .week, memberId: snapshot.key.memberId)
                } label: {
                    StepsTimelineCardSummary(points: timeline)
                }
            } else {
                PlaceholderCard(title: "Lifestyle Timeline", isUnavailable: true)
                PlaceholderCard(title: "Steps Timeline", isUnavailable: true)
            }
        }
    }
}
```

40. `Features/Home/Tabs/AdminWorkoutTypesTab.swift`. Replace the whole file (172 lines):
```swift
import SwiftUI

// MARK: - Admin Workout Types Tab (program / global admin)
//
// Tab 3 "Lifestyle", program-admin variant — adds the role-gated "view as" picker above the
// cards. Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift`
// (which co-located both tab structs) on the Lifestyle-tab port (run 56).
// Polish #31: the Summary recipe (see StandardWorkoutTypesTab), keyed on (program, View-as member); every visit
// reloads (admin re-entry included), and "View as" resets on a program switch for every role (#10).

struct AdminWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    /// This tab's own data for (program, View-as member) — frontend-kit §5.
    @State private var loadState: LoadState<LifestyleSnapshot> = .idle
    @State private var isLoading = false
    @State private var showMemberPicker = false
    @State private var selectedMember: APIClient.MemberDTO?
    @State private var hasUserChosenViewAs = false
    @State private var reloadQueued = false
    private var canViewAs: Bool { programContext.isProgramAdmin }

    private var viewAsLabel: String {
        if let selectedMember {
            return selectedMember.member_name
        }
        if programContext.isGlobalAdmin {
            return "Admin"
        }
        if hasUserChosenViewAs {
            return "Admin"
        }
        return programContext.loggedInUserName ?? "Member"
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.appBackground
                .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    WorkoutTypesHeader(
                        title: "Lifestyle",
                        subtitle: programContext.name
                    )

                    if canViewAs {
                        viewAsSelector
                    }

                    LoadStateContent(state: loadState, onRetry: { Task { await load() } }) { snapshot in
                        LifestyleCardsSection(snapshot: snapshot)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await load() }
        }
        .loadStateChrome(loadState, onRetry: { Task { await load() } })
        .task {
            await programContext.loadLookupData()        // QA5: every visit refreshes the roster, program and role
            await loadAfterSelectionSettles()             // #31: every visit reloads (admin re-entry included)
        }
        .onChange(of: programContext.programId) { _, _ in
            Task {
                // #10: "View as" belongs to one program — reset it for every role (global admins too).
                selectedMember = nil
                hasUserChosenViewAs = false
                await programContext.loadLookupData()
                await loadAfterSelectionSettles()
            }
        }
        .onChange(of: selectedMember?.id) { _, _ in
            Task { await load() }
        }
        .onChange(of: programContext.members.count) { _, _ in
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
                hasUserChosenViewAs = false
            }
            applyDefaultSelectionIfNeeded()
        }
    }

    /// Applies the default "View as" (self, for a program admin). A changed selection loads through
    /// `onChange(selectedMember)`; an unchanged one loads here.
    private func loadAfterSelectionSettles() async {
        let before = selectedMember?.id
        applyDefaultSelectionIfNeeded()
        if selectedMember?.id == before { await load() }
    }

    private func load() async {
        // Polish #5: a View-as change (or a Retry / reconnect / pull) during a load is queued, not dropped — the loop
        // re-reads the selection until it settles, so the cards always end on the member the label shows.
        guard !isLoading else {
            reloadQueued = true
            return
        }
        isLoading = true
        repeat {
            reloadQueued = false
            guard let pid = programContext.programId else { break }
            let memberId = selectedMember?.id
            // #10: another program's / member's numbers never sit under the new label.
            if loadState.value?.key != LifestyleKey(programId: pid, memberId: memberId) { loadState = .idle }
            loadState = loadState.refreshing()
            if let result = await programContext.loadLifestyle(memberId: memberId), !reloadQueued {
                loadState = loadState.merging(result)
            }
        } while reloadQueued && !Task.isCancelled
        isLoading = false
        // This load's task was cancelled (the tab's .task on disappear) with a View-as change still queued: run it on
        // its own, so the change isn't lost.
        if Task.isCancelled && reloadQueued {
            Task { await load() }
        }
    }

    private var viewAsSelector: some View {
        Button {
            showMemberPicker = true
        } label: {
            HStack {
                Text("View as")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Text(viewAsLabel)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showMemberPicker) {
            MemberPickerView(
                members: programContext.members,
                selected: selectedMember,
                showNoneOption: true,
                noneLabel: programContext.isGlobalAdmin ? "None" : "Admin",
                onSelect: { member in
                    hasUserChosenViewAs = true
                    selectedMember = member
                    showMemberPicker = false
                }
            )
        }
    }

    private func applyDefaultSelectionIfNeeded() {
        guard !programContext.isGlobalAdmin else { return }
        guard !hasUserChosenViewAs else { return }
        guard selectedMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        selectedMember = member
    }
}
```

### Detail screens (#29, #34, #36): each keeps its own data under D-KIT-20

41. `Features/Home/Detail/ActivityTimelineDetailView.swift`.
   - (a) Replace **lines 19–62**: from `    @State private var isLoading = false` through the closing `}` of `axisEndDate`. **This range contains the existing `init`; the block below restates it unchanged, so there is still exactly one init.**
```swift
    /// Polish #29 / #34: this screen's own data (frontend-kit §5) — never ProgramContext's shared timeline / member
    /// history, so the Summary and Members cards behind it keep their own week, and W→M→Y taps can't mix periods.
    @State private var state: LoadState<TimelineData> = .idle
    @State private var selectedLabel: String?
    @State private var dailyHeight: CGFloat = 0
    private let showActiveSeries: Bool
    private let memberId: String?

    /// One period's chart: the program-wide timeline, or one member's workout history.
    private struct TimelineData {
        let points: [APIClient.ActivityTimelinePoint]
        let dailyAverage: Double
        /// The member history's own range; nil = the program's dates (program-wide).
        let start: Date?
        let end: Date?
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    init(
        initialPeriod: AdminHomeView.Period,
        memberId: String? = nil,
        showActiveSeries: Bool = true
    ) {
        _period = State(initialValue: initialPeriod)
        self.memberId = memberId
        self.showActiveSeries = showActiveSeries
    }

    private var points: [APIClient.ActivityTimelinePoint] { state.value?.points ?? [] }
    private var dailyAverage: Double { state.value?.dailyAverage ?? 0 }
    private var axisStartDate: Date { state.value?.start ?? programContext.startDate }
    private var axisEndDate: Date { state.value?.end ?? programContext.endDate }

```
   - (b) `Text(p.label).tag(p)` becomes `Text(p.label).accessibilityLabel(p.spokenName).tag(p)`.
   - (c) `if selectedLabel == nil {` becomes `if selectedLabel == nil, state.value != nil {`.
   - (d) Replace the three lines `if isLoading {` / `ProgressView()` + `.frame(…)` / `} else if points.isEmpty {` with `LoadStateContent(state: state, onRetry: { Task { await load() } }) { _ in` and a new line `    if points.isEmpty {`.
     - Indent the whole `if / else` chart chain by 4 spaces.
     - After the chain's closing `}` (which follows `.frame(height: 280)`), add `            }` before the blank line and `Spacer()`.
   - (e) Replace from `.task(id: period) {` through the end of the file with:
```swift
        .loadStateChrome(state, onRetry: { Task { await load() } })
        .onChange(of: period) { _, _ in state = .loading }      // #34: another period's bars never sit under the new label
        .task(id: period) { await load() }
    }

    /// Polish #29: the kit load step — a Retry keeps the data (stale + banner); a cancelled load changes nothing, and a
    /// load for a period no longer on screen (a Retry / reconnect started before a switch) is dropped (D-KIT-20).
    private func load() async {
        guard let token = programContext.authToken, !token.isEmpty, let pid = programContext.programId else { return }
        let period = self.period
        let memberId = self.memberId
        state = state.refreshing()
        let outcome = await loadOutcome { () async throws -> TimelineData in
            if let memberId {
                let r = try await APIClient.shared.fetchMemberHistory(token: token, programId: pid, memberId: memberId,
                                                                      period: period.apiValue)
                return TimelineData(points: memberTimelinePoints(from: r.buckets), dailyAverage: r.daily_average,
                                    start: Self.dayFormatter.date(from: r.start) ?? Date(),
                                    end: Self.dayFormatter.date(from: r.end) ?? Date())
            }
            let r = try await APIClient.shared.fetchActivityTimeline(token: token, period: period.apiValue, programId: pid)
            return TimelineData(points: r.buckets, dailyAverage: r.daily_average, start: nil, end: nil)
        }
        guard let outcome, period == self.period else { return }
        state = state.applying(outcome)
    }
}
```
     This removes the `.onDisappear` week reload.

42. `Features/Home/Detail/LifestyleTimelineDetailView.swift`.
   - (a) Replace `@State private var isLoading = false` and `@State private var errorMessage: String?` with:
```swift
    /// Polish #29 / #34: this screen's own data — never ProgramContext's shared health timeline.
    @State private var state: LoadState<APIClient.HealthTimelineResponse> = .idle
```
   - (b) Replace the three computed properties `points` / `dailyAverageSleep` / `dailyAverageFood` with:
```swift
    private var points: [APIClient.HealthTimelinePoint] { state.value?.buckets ?? [] }
    private var dailyAverageSleep: Double { state.value?.daily_average_sleep ?? 0 }
    private var dailyAverageFood: Double { state.value?.daily_average_food ?? 0 }
```
   - (c) Apply step 41(b) and (c) here too.
   - (d) Replace `if isLoading {` … (including the `else if let errorMessage { errorBanner… }` branch) … `} else if points.isEmpty {` with the `LoadStateContent … { _ in` / `if points.isEmpty {` wrap from 41(d), with the same re-indent and closing `}`.
   - (e) In the header comment, the D-C2 line becomes `// D-C2: superseded by the kit error view + Retry (polish #29).`
   - (f) Replace from `.task(id: period) {` through the end of the file (this also removes `.onDisappear`, `errorBanner(_:)` and the old `load(period:)`) with:
```swift
        .loadStateChrome(state, onRetry: { Task { await load() } })
        .onChange(of: period) { _, _ in state = .loading }      // #34: another period's bars never sit under the new label
        .task(id: period) { await load() }
    }

    /// Polish #29: the kit load step (see ActivityTimelineDetailView.load — D-KIT-20).
    private func load() async {
        guard let token = programContext.authToken, !token.isEmpty, let pid = programContext.programId else { return }
        let period = self.period
        let memberId = self.memberId
        state = state.refreshing()
        let outcome = await loadOutcome {
            try await APIClient.shared.fetchHealthTimeline(token: token, period: period.apiValue, programId: pid, memberId: memberId)
        }
        guard let outcome, period == self.period else { return }
        state = state.applying(outcome)
    }
}
```

43. `Features/Home/Detail/StepsTimelineDetailView.swift`.
   - The same `state` declaration as 42(a).
   - `points` becomes `state.value?.buckets ?? []`; `dailyAverageSteps` becomes `state.value?.daily_average_steps ?? 0`.
   - Apply 41(b) and (c), and the 42(d) wrap.
   - Replace `.task(id: period) {…}` and `.onDisappear {…}` with the three modifier lines from 42(f).
   - Delete `errorBanner(_:)` and `load(period:)`, and put the `load()` from 42(f) in their place, after `stepsHeader`.
   - Header comment: "and the `loadHealthTimeline` loader" becomes "and `APIClient.fetchHealthTimeline` into its own LoadState (polish #29)".

44. `Features/Home/Detail/MemberMetricsDetailView.swift`.
   - (a) Header line 8 becomes `//  its own APIClient.fetchMemberMetrics load (polish #29), plus a client-side CSV export (ShareSheet).`
   - (b) Replace `isLoading`, `reloadQueued`, the 2-line comment and `listRangeStart` / `listRangeEnd` with:
```swift
    /// The search the list shows — applied on Return / clear (part of the load key; P-12).
    @State private var committedSearch = ""
    /// Polish #29 / #34: this screen's own results — never ProgramContext.memberMetrics (the Members-tab preview card's
    /// copy). The #47 CSV reads these same rows and their own date_range.
    @State private var state: LoadState<APIClient.MemberMetricsResponse> = .idle
```
   - (c) Before `var body: some View {` insert:
```swift
    /// Everything the list depends on — a change restarts the load (task(id:) cancels the old one) and a load for an
    /// older query is dropped, so the list and the CSV always match the controls (member-analytics D-C9).
    private struct MetricsQuery: Equatable {
        let programId: String?
        let search: String
        let sort: SortField
        let direction: SortDirection
        let filters: MetricsFilters
    }

    private var query: MetricsQuery {
        MetricsQuery(programId: programContext.programId, search: committedSearch, sort: sortField,
                     direction: sortDirection, filters: filters)
    }

    private var metrics: [APIClient.MemberMetricsDTO] { state.value?.members ?? [] }

```
   - (d) Toolbar: `.disabled(isLoading || programContext.memberMetrics.isEmpty)` becomes `.disabled(metrics.isEmpty)`.
   - (e) Replace `.task { await loadMetrics() }` and the four `.onChange` lines with:
```swift
        .loadStateChrome(state, onRetry: { Task { await loadMetrics() } })
        .onChange(of: query) { _, _ in state = .loading }      // the old order never sits under the new controls
        .task(id: query) { await loadMetrics() }
```
   - (f) Search: `onCommit: { Task { await loadMetrics() } }` becomes `onCommit: { committedSearch = searchText }`. In the clear button, `Task { await loadMetrics() }` becomes `committedSearch = ""`.
   - (g) In `contentList`:
     - Replace `Group {` / `if isLoading {` with `LoadStateContent(state: state, onRetry: { Task { await loadMetrics() } }) {`, and outdent the skeleton `VStack` by 4.
     - Replace `} else if programContext.memberMetrics.isEmpty {` with `        } content: { _ in` and a new line `            if metrics.isEmpty {`.
     - `ForEach(programContext.memberMetrics)` becomes `ForEach(metrics)`.
   - (h) Replace `loadMetrics()` with:
```swift
    private func loadMetrics() async {
        guard let token = programContext.authToken, !token.isEmpty, let pid = programContext.programId else { return }
        let query = self.query
        var filterParams: [String: String] = [:]
        query.filters.addTo(&filterParams)
        state = state.refreshing()
        let outcome = await loadOutcome {
            try await APIClient.shared.fetchMemberMetrics(token: token, programId: pid, search: query.search,
                                                          sort: query.sort.rawValue, direction: query.direction.rawValue,
                                                          filters: filterParams)
        }
        guard let outcome, query == self.query else { return }    // D-KIT-20: an older query's result is dropped
        state = state.applying(outcome)
    }
```
   - (i) In `exportCSV()`, replace the lines from `let rows = programContext.memberMetrics` through the end of the `let fileName = Self.csvFileName(…)` call with:
```swift
        guard let response = state.value, !response.members.isEmpty else { return }
        // member-analytics D-C9: S / E = the list's own response date_range (yyyy-MM-dd), else all / today.
        let fileName = Self.csvFileName(programName: programContext.name,
                                        start: response.date_range?.start, end: response.date_range?.end)
```
     and `try Self.csv(rows)` becomes `try Self.csv(response.members)`.

45. `Features/Home/Detail/MemberRecentDetail.swift` (in `struct MemberRecentDetail`).
   - (a) Replace `@State private var isLoading = false` with:
```swift
    /// Polish #29 / #34: this screen's own list — never ProgramContext.memberRecent (the Members-tab card's 10 rows).
    @State private var state: LoadState<[APIClient.MemberRecentWorkoutsResponse.Item]> = .idle
```
     Before `var body: some View {` insert:
```swift
    /// Everything the list depends on — a change restarts the load; an older query's result is dropped (D-KIT-20).
    private struct RecentQuery: Equatable {
        let sort: WorkoutSortField
        let direction: WorkoutSortDirection
        let filters: WorkoutFilters
    }

    private var query: RecentQuery { RecentQuery(sort: sortField, direction: sortDirection, filters: filters) }
    private var recent: [APIClient.MemberRecentWorkoutsResponse.Item] { state.value ?? [] }

```
   - (b) `.disabled(programContext.memberRecent.isEmpty)` becomes `.disabled(recent.isEmpty)`.
   - (c) In the edit sheet's closure, replace the `withAnimation { if let index … }` block with the block below. Both "Saved" / "Deleted" alerts stay.
```swift
                withAnimation {
                    state = state.mapValue { items in
                        items.map {
                            $0.id == item.id
                                ? APIClient.MemberRecentWorkoutsResponse.Item(id: item.id, workoutType: item.workoutType,
                                                                             workoutDate: item.workoutDate,
                                                                             durationMinutes: updatedDuration)
                                : $0
                        }
                    }
                }
                Task { await refreshTabPreview() }          // #34: the Members-tab card keeps its own 10 rows
```
   - (d) Replace `.task { await loadWorkouts() }` and the three `.onChange` lines with:
```swift
        .loadStateChrome(state, onRetry: { Task { await loadWorkouts() } })
        .onChange(of: query) { _, _ in state = .loading }      // the old order never sits under the new controls
        .task(id: query) { await loadWorkouts() }
```
   - (e) In `contentList`, do the same as 44(g):
     - `LoadStateContent(state: state, onRetry: { Task { await loadWorkouts() } }) {`, with the skeleton outdented by 4.
     - `        } content: { _ in` / `            if recent.isEmpty {`.
     - `ForEach(recent)`.
   - (f) Replace `loadWorkouts()` with:
```swift
    private func loadWorkouts() async {
        guard let mId = memberId, let pid = programContext.programId,
              let token = programContext.authToken, !token.isEmpty else { return }
        let query = self.query
        state = state.refreshing()
        let outcome = await loadOutcome {
            try await APIClient.shared.fetchMemberRecentWorkouts(
                token: token, programId: pid, memberId: mId, limit: 0,
                startDate: query.filters.startDateString(), endDate: query.filters.endDateString(),
                sortBy: query.sort.apiValue, sortDir: query.direction.apiValue,
                workoutType: query.filters.workoutTypeName,
                minDuration: query.filters.minDurationMinutes, maxDuration: query.filters.maxDurationMinutes
            ).items
        }
        guard let outcome, query == self.query else { return }    // D-KIT-20: an older query's result is dropped
        state = state.applying(outcome)
    }

    /// Polish #34: after an edit / delete here, the Members-tab Recent card reloads its own 10 rows.
    private func refreshTabPreview() async {
        guard let mId = memberId else { return }
        await programContext.loadMemberRecent(memberId: mId, limit: 10)
    }
```
   - (g) In `deleteWorkout`, replace `withAnimation { programContext.memberRecent.removeAll { $0.id == item.id } }` with:
```swift
            withAnimation {
                state = state.mapValue { $0.filter { $0.id != item.id } }
            }
            Task { await refreshTabPreview() }
```
   - (h) In `exportCSV`, `programContext.memberRecent` becomes `recent` (2 places).

46. `Features/Home/Detail/MemberHealthDetail.swift` (in `struct MemberHealthDetail`).
   - (a) Header line 7 becomes `//  Sorted + filterable list over its own APIClient.fetchDailyHealthLogs load (polish #29), swipe Edit`.
   - (b) Replace `@State private var isLoading = false` and `@State private var logs: [APIClient.DailyHealthLogItem] = []` with:
```swift
    /// Polish #29 / #34: this screen's own list (frontend-kit §5).
    @State private var state: LoadState<[APIClient.DailyHealthLogItem]> = .idle
```
     Before `var body: some View {` insert:
```swift
    /// Everything the list depends on — a change restarts the load; an older query's result is dropped (D-KIT-20).
    private struct HealthQuery: Equatable {
        let sort: HealthSortField
        let direction: HealthSortDirection
        let filters: HealthFilters
    }

    private var query: HealthQuery { HealthQuery(sort: sortField, direction: sortDirection, filters: filters) }
    private var logs: [APIClient.DailyHealthLogItem] { state.value ?? [] }

```
   - (c) Replace `.task { await loadHealthLogs() }` and the three `.onChange` lines with the 3 modifiers from 45(d), with `loadHealthLogs()` in place of `loadWorkouts()`.
   - (d) In `contentList`:
     - `LoadStateContent(state: state, onRetry: { Task { await loadHealthLogs() } }) {`, with the skeleton outdented by 4.
     - `        } content: { _ in` / `            if logs.isEmpty {`.
   - (e) Replace `loadHealthLogs()` with:
```swift
    private func loadHealthLogs() async {
        guard let mId = memberId, let pid = programContext.programId,
              let token = programContext.authToken, !token.isEmpty else { return }
        let query = self.query
        state = state.refreshing()
        let outcome = await loadOutcome {
            try await APIClient.shared.fetchDailyHealthLogs(
                token: token, programId: pid, memberId: mId, limit: 0,
                startDate: query.filters.startDateString(), endDate: query.filters.endDateString(),
                sortBy: query.sort.apiValue, sortDir: query.direction.apiValue,
                minSleepHours: query.filters.minSleepHours, maxSleepHours: query.filters.maxSleepHours,
                minFoodQuality: query.filters.minFoodQuality, maxFoodQuality: query.filters.maxFoodQuality,
                minSteps: query.filters.minSteps, maxSteps: query.filters.maxSteps
            ).items
        }
        guard let outcome, query == self.query else { return }    // D-KIT-20: an older query's result is dropped
        state = state.applying(outcome)
    }
```
     The edit-sheet reload, `deleteHealthLog` and `exportCSV` are unchanged; `logs` is now computed.

47. `Features/Home/Detail/MemberStreakDetail.swift`.
   - Header line "server-computed ProgramContext.memberStreaks (no client math)." becomes "server-computed streaks, loaded by the screen itself (polish #29; no client math)."
   - Replace the `MemberStreakDetail` struct from its first line through the closing `}` of `body`. `streakTile` and `WrapChips` are unchanged.
```swift
struct MemberStreakDetail: View {
    @EnvironmentObject var programContext: ProgramContext
    /// Whose streaks. Polish #29: the screen loads its own (never ProgramContext.memberStreaks, the card's copy), with
    /// the kit error view + Retry instead of "No streak data.".
    let memberId: String?
    @State private var state: LoadState<APIClient.MemberStreaksResponse> = .idle

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            LoadStateContent(state: state, onRetry: { Task { await load() } }) { s in
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        streakTile(title: "Current", value: s.currentStreakDays, icon: "flame.fill", color: .appOrange)
                        streakTile(title: "Longest", value: s.longestStreakDays, icon: "trophy.fill", color: .appYellow)
                    }

                    Text("Milestones")
                        .font(.headline.weight(.semibold))
                    WrapChips(items: s.milestones.map { ($0.dayValue, $0.achieved) })
                }
            }
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
        .navigationTitle("Streak Stats")
        .navigationBarTitleDisplayMode(.inline)
        .loadStateChrome(state, onRetry: { Task { await load() } })
        .task { await load() }
    }

    private func load() async {
        guard let memberId, let pid = programContext.programId,
              let token = programContext.authToken, !token.isEmpty else { return }
        state = state.refreshing()
        guard let outcome = await loadOutcome({
            try await APIClient.shared.fetchMemberStreaks(token: token, programId: pid, memberId: memberId)
        }) else { return }
        state = state.applying(outcome)
    }

```

### Log forms and widgets (#16, #36)

The ✕ button block used in steps 48–51 (it replaces the `Button { removeRow(row.id) } label: { Image(systemName: "xmark.circle.fill").foregroundColor(.secondary) }.buttonStyle(.plain)` in each row card header):
```swift
                Button {
                    removeRow(row.id)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                        .minTapTarget()
                }
                .buttonStyle(.plain)
                .padding(.vertical, -AppSpacing.md)          // #36: 44-pt hit area, header row height unchanged
                .padding(.trailing, -AppSpacing.md)
                .accessibilityLabel("Remove entry \(rowNumber(row))")
```

48. `Features/Home/Detail/AddWorkoutsDetailView.swift`.
   - (a) After `@State private var selectedProgramIds: Set<String> = []` add:
```swift
    /// Polish #16: a lookup (roster / programs / workout types) failed — "Couldn't load · Retry" on the form.
    @State private var lookupError: AppError?
    /// Polish #16: the first lookup pass finished cleanly — only then can an empty picker mean "none".
    @State private var lookupsLoaded = false
```
   - (b) After the `ProgramMultiSelectSection(…)` call's closing `)` add:
```swift

                if let lookupError {
                    ErrorStateView(error: lookupError.labeled(online: programContext.isOnline),
                                   onRetry: { Task { await ensureLookups() } })
                }
```
   - (c) After the `.onChange(of: memberLocked) { … }` block add:
```swift
        .onChange(of: programContext.isOnline) { _, online in
            if online, lookupError != nil { Task { await ensureLookups() } }        // #16: reload when back online
        }
```
   - (d) The member picker gets `selectedId: …,` followed by `emptyHint: emptyHint("No active members in this program yet.")`. The workout picker gets `emptyHint: emptyHint("No workout types available for this program yet.")`.
   - (e) Apply the ✕ block above.
   - (f) Replace `ensureLookups()` with:
```swift
    /// The empty-picker line (web / Android `lookupsLoaded` parity): failed → the kit title; loaded → the hint;
    /// still loading → none.
    private func emptyHint(_ hint: String) -> String? {
        if lookupError != nil { return KitCopy.errorViewTitle }
        return lookupsLoaded ? hint : nil
    }

    /// Polish #16: a failed lookup shows "Couldn't load · Retry" on the form (never an empty picker that reads as "no
    /// types / no members"); it reloads by itself when the connection comes back.
    private func ensureLookups() async {
        var failure: Error?
        let needsRefresh = programContext.membersProgramId != programContext.programId
        if programContext.members.isEmpty || programContext.workouts.isEmpty || needsRefresh {
            failure = await programContext.loadLookupData()
        }
        // Program multi-select needs the full program list (with per-program roles).
        if programContext.programs.isEmpty, let token = programContext.authToken, !token.isEmpty {
            do { programContext.programs = try await APIClient.shared.fetchPrograms(token: token) }
            catch { failure = failure ?? error }
        }
        if programContext.programId != nil, let error = await programContext.loadProgramWorkouts() {
            failure = failure ?? error
        }
        lookupError = failure.flatMap { AppError($0) }
        lookupsLoaded = failure == nil
    }
```

49. `Features/Home/Detail/AddDailyHealthDetailView.swift`.
   - Apply 48(a), (b), (c) and (e) verbatim.
   - The member picker gets `emptyHint: emptyHint("No active members in this program yet.")`.
   - Replace `ensureLookups()` with the `emptyHint(_:)` helper from 48(f), plus:
```swift
    /// Polish #16: as AddWorkoutsDetailView.ensureLookups — a failure shows "Couldn't load · Retry".
    private func ensureLookups() async {
        var failure: Error?
        let needsRefresh = programContext.membersProgramId != programContext.programId
        if programContext.members.isEmpty || needsRefresh {
            failure = await programContext.loadLookupData()
        }
        if programContext.programs.isEmpty, let token = programContext.authToken, !token.isEmpty {
            do { programContext.programs = try await APIClient.shared.fetchPrograms(token: token) }
            catch { failure = failure ?? error }
        }
        lookupError = failure.flatMap { AppError($0) }
        lookupsLoaded = failure == nil
    }
```

50. `Features/Widgets/QuickAddWorkoutWidgetEntryView.swift`.
   - (a) After `@State private var programWorkouts …` add:
```swift
    /// Polish #16: the program list failed (the form can't work) / a selected program's lookups failed.
    @State private var programsError: AppError?
    @State private var selectionError: AppError?
    private var lookupError: AppError? { programsError ?? selectionError }

    /// Polish #16: every selected program's lookup has arrived — only then can an empty picker mean "none".
    private var membersLoaded: Bool {
        !selectedProgramIds.isEmpty && selectedProgramIds.allSatisfy { programMembers[$0] != nil }
    }
    private var workoutsLoaded: Bool {
        !selectedProgramIds.isEmpty && selectedProgramIds.allSatisfy { programWorkouts[$0] != nil }
    }

    /// The empty-picker line (web / Android `lookupsLoaded` parity): failed → the kit title; loaded → the hint;
    /// nothing selected or still loading → none.
    private func emptyHint(loaded: Bool, hint: String) -> String? {
        if lookupError != nil { return KitCopy.errorViewTitle }
        return loaded ? hint : nil
    }
```
   - (b) After the `ProgramMultiSelectSection(… alwaysShow: true)` call add:
```swift

                    if let lookupError {
                        ErrorStateView(error: lookupError.labeled(online: programContext.isOnline),
                                       onRetry: { Task { await reloadLookups() } })
                    }
```
   - (c) After `.onChange(of: selectedProgramIds) { … }` add:
```swift
        .onChange(of: programContext.isOnline) { _, online in
            if online, lookupError != nil { Task { await reloadLookups() } }        // #16: reload when back online
        }
```
   - (d) Member picker: `selectedId: …,` followed by `emptyHint: emptyHint(loaded: membersLoaded, hint: "No active members in this program yet.")`. Workout picker: `emptyHint: emptyHint(loaded: workoutsLoaded, hint: "No workout types available for this program yet.")`.
   - (e) Apply the ✕ block above.
   - (f) Replace `loadInitialData()` and `loadSelectedProgramData()` with the code below, ending before the `/// After the selection's data loads` doc comment:
```swift
    @MainActor
    private func loadInitialData() async {
        var failure: Error?
        if programContext.programs.isEmpty {
            failure = await programContext.loadLookupData()
        }
        // The multi-select needs the full program list (with per-program roles).
        if programContext.programs.isEmpty, let token = programContext.authToken, !token.isEmpty {
            do { programContext.programs = try await APIClient.shared.fetchPrograms(token: token) }
            catch { failure = failure ?? error }
        }
        // #16: only a still-empty program list is a failure this form can't work without.
        programsError = programContext.programs.isEmpty ? failure.flatMap { AppError($0) } : nil
        if rows.isEmpty { addRows(1) }
    }

    @MainActor
    private func loadSelectedProgramData() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        guard !selectedProgramIds.isEmpty else {
            selectionError = nil
            syncRowsAfterSelectionChange()
            return
        }

        var failure: Error?
        for programId in Array(selectedProgramIds) {
            if programMembers[programId] == nil {
                do {
                    programMembers[programId] = try await APIClient.shared
                        .fetchMembershipDetails(token: token, programId: programId).filter { $0.is_active }
                } catch { failure = failure ?? error }
            }
            if programWorkouts[programId] == nil {
                do {
                    programWorkouts[programId] = try await APIClient.shared
                        .fetchProgramWorkouts(token: token, programId: programId).filter { !$0.is_hidden }
                } catch { failure = failure ?? error }
            }
        }
        // #16: recorded, not swallowed — and only while the CURRENT selection still lacks a lookup (an overlapping
        // pass for an older selection never leaves a stale error behind).
        selectionError = (membersLoaded && workoutsLoaded) ? nil : failure.flatMap { AppError($0) }
        syncRowsAfterSelectionChange()
    }

    /// #16 Retry / back online: reload whatever failed.
    @MainActor
    private func reloadLookups() async {
        if programsError != nil { await loadInitialData() }
        await loadSelectedProgramData()
    }

```

51. `Features/Widgets/QuickAddHealthWidgetEntryView.swift`.
   - (a) After `@State private var programMembers …` add the first 4 lines of 50(a) (`programsError`, `selectionError`, `lookupError`), plus:
```swift

    /// Polish #16: every selected program's roster has arrived — only then can an empty picker mean "none".
    private var membersLoaded: Bool {
        !selectedProgramIds.isEmpty && selectedProgramIds.allSatisfy { programMembers[$0] != nil }
    }
```
   - (b) and (c): apply 50(b) and 50(c) verbatim.
   - (d) Member picker: `selectedId: …,` followed by:
```swift
                emptyHint: lookupError != nil ? KitCopy.errorViewTitle
                    : (membersLoaded ? "No active members in this program yet." : nil)
```
   - (e) Apply the ✕ block above.
   - (f) `loadInitialData()` and `reloadLookups()` are identical to 50(f). `loadSelectedProgramData()` becomes:
```swift
    @MainActor
    private func loadSelectedProgramData() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        guard !selectedProgramIds.isEmpty else {
            selectionError = nil
            syncRowsAfterSelectionChange()
            return
        }

        var failure: Error?
        for programId in Array(selectedProgramIds) where programMembers[programId] == nil {
            do {
                programMembers[programId] = try await APIClient.shared
                    .fetchMembershipDetails(token: token, programId: programId).filter { $0.is_active }
            } catch { failure = failure ?? error }
        }
        // #16: recorded, not swallowed — and only while the CURRENT selection still lacks a roster.
        selectionError = membersLoaded ? nil : failure.flatMap { AppError($0) }
        syncRowsAfterSelectionChange()
    }
```

52. `Features/Widgets/WidgetQuickAddComponents.swift` (#36). In `WidgetQuickAddHeader`:
   - After the `ZStack { … }` inside `Button(action: onBack)`, add `.minTapTarget(alignment: .leading)`.
   - After `.buttonStyle(.plain)`, add:
```swift
                .padding(.vertical, -4)          // #36: 44-pt hit area on the 36-pt circle, header height unchanged
                .accessibilityLabel("Back")
```

---

## Endgame

53. **Compile check (iOS only; this track touches no other surface):**
   - Run `bash tools/ios-typecheck.sh` from the repo root. It must report `errors=0`; the 26 existing warnings are expected.
   - Then **the user presses ⌘B in Xcode**. The user reports any errors, Claude fixes them, and this repeats. Never call `BuildProject`.
   - Sanity grep (it must return nothing):
     ```
     grep -rn "loadActivityTimeline\|loadHealthTimeline\|loadStepsStats\|\.loadWorkoutTypes(\|loadWorkoutTypesTotal\|loadWorkoutTypeMostPopular\|loadWorkoutTypeLongestDuration\|loadWorkoutTypeHighestParticipation\|isCTAVisible\|listRangeStart" apps/ios
     ```
   - **All visual, VoiceOver and live testing is the user's job, on prod** (a debug build against prod). There is no migration and no auth-session change, so staging isn't needed.
   - **User phone checks:**
     - **#13:**
       - Summary → Add workouts → swipe from the left edge: it goes back one screen and stays in the program.
       - Do the same from Edit program (admin Program tab) and from a Members detail screen.
       - At a tab's top screen, the swipe still returns to My Programs. There must be no double pop.
     - **#28:** on a small iPhone or with large Dynamic Type, the login fields stay above the keyboard, and Return on the password field signs in.
     - **#14:** in airplane mode, "Later" closes the Apple Health review. A queued sleep or steps review may show next (one "Later" each). The review comes back on the next sync.
     - **#29/#34:**
       - In airplane mode, open every detail screen: it shows "Couldn't load this · Retry", and reloads by itself once back online.
       - With bad signal: tap Retry, then quickly switch W→M. The bars must match the label.
       - Re-sort View Workouts: the Members-tab card doesn't change. After an edit or delete, the card updates.
     - **#30/#31:**
       - A program switch never shows the old totals.
       - A partial failure shows "—".
       - Lifestyle supports pull-to-refresh and reloads on every visit.
     - **#16:**
       - Widget: tapping "Select workout" before choosing a program shows an empty sheet with **no** "no types" text.
       - Offline, the form shows "Couldn't load · Retry".
     - **#18:** My Profile shows "—" rows while loading, and "Couldn't load · Retry" offline.
     - **#17:**
       - A taken username jumps to step 2 with the message.
       - If the automatic sign-in after sign-up fails, "Account created. Please sign in." shows, and Create Account then signs in.
     - **#36:**
       - With VoiceOver, check: the period segments, the eye, ✕, Back, the GlassButtons, the "+" count, and the selected state on role chips, Appearance, the Apple Health rows and the Block-invites box.
       - Visually check: the field, card-header and widget-header heights are unchanged. The role chips (+8 pt), invite buttons (+4 pt) and the "Cancel request" card (+12 pt) grow, as intended (P-8).
     - **#43:** the orange and green Lifestyle values are readable in light mode.
   - Afterwards, delete `/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/tc` (about 21 MB) and report free disk space.

54. **Migration:** none. **Backend:** none.
   - The only new wire behavior is the #44 body `{"gender": null}` on `PUT /members/:id`. The existing route already accepts it (`memberService.js:139`, `gender !== undefined`; the model is `allowNull: true`).
   - No response shape changes, so the live binaries are unaffected.

55. **git-version:**
   - This surface lands as a no-bump `feat(ios): Phase 4 polish …` commit once its review passes. There is no app version bump: iOS stays 1.5.1 (59) and ships only in the single Phase 4 store release.
   - One orchestrator docs commit then bumps:
     - frontend-kit 0.5.0 (D-KIT-20/21, the §8 files, the D-KIT-11 line)
     - auth 0.15.0, apple-health 0.9.0, programs 0.3.0, program-memberships 0.4.0
     - program-workouts 0.1.1, workout-logs 0.7.1, daily-health-logs 0.4.1, members 0.4.1
     - member-analytics 0.6.1 (D-C9 wording)
     - every page SPEC in §C as a PATCH
   - It takes the highest version per feature across the web and Android tracks. Tag only after cherry-picking onto `main`.

## Risks the implementer must watch

- **The D-KIT-20 invariant:**
  - Every keyed load captures its key (`period` / `query`) before the await and drops the outcome when `key != self.key` afterwards.
  - Never compute the next state from a state captured before the await. Always use `state = state.applying(outcome)` after it.
  - The reset to `.loading` happens only in `.onChange(of: key)`, never inside `.task(id:)`, so a tab re-visit keeps its data and refreshes underneath.
- **Duplicate anchors:**
  - `if let gender { body["gender"] = gender }` appears at :221 and in `updateMemberProfile`; edit only the latter.
  - In InviteCardView, `.contentShape(Capsule())` at 24 spaces is a substring of the 28-space Revoke line. Add exactly one `.minTapTarget()` per button.
- **Signature changes and their only callers** (all compiled in the scratch run):
  - `loadSummary` now returns a `Set` (AdminSummaryTab).
  - `EditCustomWorkoutSheet.onSave` is now `async -> String?`.
  - `WorkoutTypesTotalCard(total: Int?)`.
  - `MemberStreakDetail(memberId:)` (MemberCards).
  - `loadLookupData` / `loadProgramWorkouts` are `@discardableResult`.
  - The new parameters on `GlassButton(label:)`, `SearchablePickerSheet(emptyHint:)` and `PlaceholderCard(isUnavailable:)` are defaulted.
- **Lifestyle and detail screens no longer write the shared `ProgramContext` analytics fields.** Don't reintroduce shared writes.
  - Follow-up, outside this brief: delete the fields nothing writes any more from `ProgramContext.swift`: `healthTimeline*`, `stepsStats`, `workoutTypesTotal`, `workoutTypeMostPopular`, `workoutTypeLongestDuration`, `workoutTypeHighestParticipation`, plus their init parameters. They are harmless meanwhile.
- **#13 relies on UIKit's `transitionCoordinator`.** If the phone shows a double pop or no pop, report it. Don't re-add a manual pop without the transition check.
- **Sanctioned parity divergences:**
  - P-6: iOS spinner versus "…" (**needs the user's OK**)
  - #36: 44 pt versus 48 dp
  - #16: the hint inside the picker sheet versus inline
  - #45: the iOS subtitle mentions steps
  - #10: the placeholders are deferred to S5
  - #13, #14, #28: iOS-only
  - #17: the message shows in iOS's existing create-account alert slot
- **Composition (don't redo another track's work):**
  - **Notifications N4:**
    - Change only the body of `plusBadgeCount`; the badge and the spoken label follow it.
    - InviteCardView's buttons carry `.minTapTarget()`, and InvitesTabView's box has the selected trait.
    - The account-menu Apple Health subtitles changed, in `AccountMenuSheet` and in ProgramCards.
  - **People S3:**
    - MyProfileView hosts `SignInMethodsSection()` and `DeleteAccountSection()` from `MyProfileSections.swift`. Put "Hide my activity" in MyProfileView.
    - The member editor no longer has the Active toggle.
    - New `GlassButton` calls should pass `label:`.
    - "View as" now resets on a program switch on both Members tabs, and member loads are cancellable tasks.
  - **People S5:**
    - S5 owns the loading and error placeholders for `MemberOverviewCard` and `MemberCards`: the placeholder half of #10 plus #32.
    - Detail screens own their data. The shared member fields are written only by the tab loads and by `MemberRecentDetail.refreshTabPreview`.
- **Files never to touch:** any SPEC, the registry, REGISTRY, HANDOFF or RELEASES file, `AppRootView`, `NotificationsSettingsView`, `MemberOverviewPicker.swift`, `EditProgramInfoView.swift` and `ProgramContext.swift`.
