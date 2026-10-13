# PLAN — Phase 4 Track Q: polish quick wins #2–#8, #46, #47, #48 (web · iOS · Android)

**Brief accepted**: yes (76 files: web 27 incl. 1 new · iOS 31 incl. 2 new · Android 18 · backend 0)

**Feature/version prediction**:
- frontend-kit v0.3.0 → v0.4.0 (MINOR: new D-KIT-17/18/19 behaviour, and `src/lib/kit/async-state.ts` is in its `reference_impl`)
- member-analytics v0.4.0 → v0.5.0 (MINOR: new D-C8 CSV contract that supersedes D-C7's "CSV column order untouched", plus D-C9 for the self-row read)
- app-config v0.3.0 → v0.4.0 (MINOR: new D-C8, the iOS gate no longer blocks)
- analytics, analytics-v2 and invites: no bump (client presentation only)
- Page SPECs: PATCH each

**Surfaces in scope**: [web, ios, android]. The file sets are disjoint, so the three can run in parallel. Backend: none.

### Already done (cf52772, polish 1). Do not redo.
- **#3 is done.** The Android picker reloads on reconnect (`ProgramPickerScreen.kt:143-149`) and so does Summary (`SummaryScreen.kt:94-100`). The one gap left is an invites-only failure, which never reloads. That is fixed in A2.
- **#6 is partly done.** Polish 1 stops retries while offline (`providers.tsx:16` `!isOnlineNow()`). With no data, programs and summary show the offline view while offline. Still missing: on a stuck "online" link, `fromQuery` stays `loading` through all 3 tries (about 48 s). That is fixed in W2–W3.
- **#4 is not done.** Mutations only set `retry: false`.

### Decisions resolved (each has a one-line reason)
| ID | Decision | Why |
|---|---|---|
| Q-1 (#7) | iOS opens the widget form at once and runs the check in its own Task. If the build turns out unsupported, `ForcedUpdateModalView` covers the form **in place** as an overlay, and the forced-update cover waits until no widget form is up. The iOS foreground check also runs alongside (it no longer delays restore or `sessionDidBecomeActive`), which matches Android's `ON_START`. **Android keeps A7** (`withTimeoutOrNull(3_000)`). This is a recorded divergence (app-config D-C8). | This is the user's pick for #7. A7 is a binding amendment, and Android already waits at most 3 s. The in-place overlay avoids two `fullScreenCover`s being presented at once. |
| Q-2 (#2) | Yes: Android's Health Connect review gets the offline banner (RootScreen). | 1:1 with the iOS Apple Health review cover. |
| Q-3 (#47) | Use the column contract below. Units go in the **headers**, so every cell stays a plain number. Missing value = empty cell. Steps have no thousands separator. Unified filename. | A CSV shared through WhatsApp opens in Numbers, Sheets or Excel, and numeric cells keep sort and sum working there. This is a deliberate deviation from the on-screen "45 min" / "12,345" / "—", recorded in D-C8. |
| Q-4 (#48) | `BrandMark size={96}`, centred above `PageHeader`. | That is the login / create-account size. These are reading pages, and 128 is used only on the single-purpose recovery screens. |
| Q-5 (#46) | iOS: one shared `chartCalloutPlacement` modifier, which measures the bubble, flips it below the point and clamps it. `DistributionByDayDetailView` drew **two** callouts (an `.annotation` plus the overlay; confirmed at :56-75 and :95-114), so its annotation is removed. The Summary distribution card keeps its annotation with `overflowResolution`. Web and Android: verify only. | One rule for every chart, using Android's algorithm. |
| Q-6 (#5) | iOS/Android: the spinner shows only while nothing **for this program** is on screen, keyed on a `loadedProgramId` (iOS `@State`) or `membersSelfLoadedFor` (Android ProgramContext). A program switch still shows the spinner. | A re-entry no longer spins, and a program switch never shows the previous program's numbers, so #10 does not get worse. |

### #47 column contract (identical on web, iOS and Android)
| # | Header (exact text) | Field | Cell |
|---|---|---|---|
| 1 | `Name` | member_name | always in double quotes, `"` doubled |
| 2 | `Active Days` | active_days | integer |
| 3 | `Workouts` | workouts | integer |
| 4 | `Total Duration (min)` | total_duration | integer |
| 5 | `Workout Types` | workout_types | integer |
| 6 | `Avg Duration (min)` | avg_duration | integer |
| 7 | `Longest Streak (days)` | longest_streak | integer |
| 8 | `Avg Sleep (hrs)` | avg_sleep_hours | 1 decimal, `.` separator; empty if null |
| 9 | `Avg Diet Quality (out of 5)` | avg_food_quality | integer; empty if null |
| 10 | `Avg Steps` | avg_steps | integer, no separator; empty if null |
| 11 | `Current Streak (days)` | current_streak | integer |

- **Rows:** the rendered list in its on-screen order. That is the response `members` array; search, filters and sort are already applied by the server.
- **Encoding:** `,` separator, `\n` after the header and after every row (so there is a final newline), UTF-8, no BOM.
- **Filename:** `MemberPerformanceMetrics_<P>_<S>_to_<E>.csv`.
  - P = the program name with every char outside `[A-Za-z0-9]` removed; if that leaves nothing, use `Program`.
  - S = the response `date_range.start` (yyyy-MM-dd), or `all` if missing.
  - E = the response `date_range.end`, or `today` if missing.

## Steps — web (files: apps/web/src/…)

1. `app/providers.tsx:34`: replace `mutations: { retry: false }` with:
```ts
          // Polish #4 (D-KIT-18): a save fires even when the browser reports offline, so it fails at once with the kit
          // offline copy instead of pausing on "Saving…" forever. Mutations never auto-retry.
          mutations: { retry: false, networkMode: "always" }
```
2. `lib/kit/async-state.ts`:
   - Add two fields to the `QueryLike` type (after `isError: boolean;`):
```ts
  /** Failed tries of the current fetch (TanStack v5 — reset when a new fetch starts or one succeeds). */
  failureCount: number;
  failureReason: unknown;
```
   - In `fromQuery`, insert this line between `if (query.isError) …` and `if (query.isPaused) …`:
```ts
  // Polish #6 (D-KIT-18): with nothing on screen, show the error after the FIRST failed try while TanStack keeps
  // retrying quietly — never a "Loading…" that waits out every retry (~48 s on a stuck connection).
  if (query.failureCount > 0) return { status: "failed", error: toAppError(query.failureReason) };
```
3. `app/summary/page.tsx`:
   - :40 becomes `import { appError, toAppError } from "@/lib/kit/app-error";`
   - :169 becomes:
```ts
  // isError is false while TanStack retries in the background — a query with failureCount > 0 is failed too (#6).
  const retrySummary = () =>
    summaryQueries.forEach((query) => { if (query.isError || query.failureCount > 0) void query.refetch(); });
```
   - :320 `(workoutsMutation.error as Error).message` becomes `toAppError(workoutsMutation.error).message`
   - :339 `(dailyHealthMutation.error as Error).message` becomes `toAppError(dailyHealthMutation.error).message`
4. `app/programs/page.tsx` (it already imports `toAppError`):
   - :190 becomes `setOrderError(\`Couldn't save program order. ${toAppError(error).message}\`);`
   - :453 becomes `toAppError(createProgramMutation.error).message`
   - :545 becomes `toAppError(updateProgramMutation.error).message`
5. `app/reset-password/page.tsx`:
   - Add `import { credentialErrorMessage } from "@/lib/kit/app-error";` after the `ApiError` import.
   - Replace the two `else if / else` branches at :105-110 with:
```ts
      } else {
        // Polish #8 (D-KIT-14, sign-in scope): the server's text for 400 / 409 / 422 (e.g. the password policy);
        // offline, timeouts and 5xx read the kit copy — never "Failed to fetch".
        setErrorMessage(credentialErrorMessage(error));
      }
```
6. **#8 rule for steps 6–7.**
   - In every file listed below, add `import { toAppError } from "@/lib/kit/app-error";` to the import block.
   - **P1:** `error instanceof Error ? error.message : "<any fallback>"` becomes `toAppError(error).message`.
   - **P2:** `(<x>.error as Error).message` becomes `toAppError(<x>.error).message`.

   Mutation sites:
   - `app/summary/log-workout/page.tsx:59` (P2)
   - `app/summary/log-health/page.tsx:59` (P2)
   - `app/program/page.tsx:86` (P2)
   - `app/program/edit/page.tsx:81` (P1)
   - `app/program/roles/page.tsx:72` (P1) and `:100` (P2)
   - `app/members/workouts/page.tsx:144, :162` (P1)
   - `app/members/health/page.tsx:166, :181` (P1)
   - `app/members/detail/page.tsx:69, :84` (P1) and `:96` (P2)
   - `app/lifestyle/workouts/page.tsx:62, :70, :82, :94, :102` (P1)
7. Load sites (P2, message only; the component stays `ErrorState`):
   - `app/members/list/page.tsx:54`
   - `app/members/history/page.tsx:60`
   - `app/members/streaks/page.tsx:46`
   - `app/lifestyle/timeline/page.tsx:66`
   - `app/lifestyle/steps-timeline/page.tsx:67`
   - `app/summary/activity/page.tsx:44`
   - `app/summary/distribution/page.tsx:53`
   - `app/summary/workout-types/page.tsx:40`
8. NEW `lib/metrics-csv.ts`:
```ts
import type { MemberMetrics, MemberMetricsResponse } from "@/lib/api/members";
import { escapeCsv } from "@/lib/format";

// Member Performance Metrics CSV — member-analytics D-C8 (polish #47): ONE column contract on web, iOS and Android.
// Rows = the page's list in its on-screen order (the server applied search + filters + sort). Units live in the headers
// so every number cell stays a plain number a spreadsheet can sort; a missing average is an empty cell.
export const METRICS_CSV_HEADERS = [
  "Name",
  "Active Days",
  "Workouts",
  "Total Duration (min)",
  "Workout Types",
  "Avg Duration (min)",
  "Longest Streak (days)",
  "Avg Sleep (hrs)",
  "Avg Diet Quality (out of 5)",
  "Avg Steps",
  "Current Streak (days)"
] as const;

export function metricsCsv(members: MemberMetrics[]): string {
  const rows = members.map((m) =>
    [
      escapeCsv(m.member_name),
      m.active_days,
      m.workouts,
      m.total_duration,
      m.workout_types,
      m.avg_duration,
      m.longest_streak,
      m.avg_sleep_hours == null ? "" : m.avg_sleep_hours.toFixed(1),
      m.avg_food_quality == null ? "" : String(Math.round(m.avg_food_quality)),
      m.avg_steps == null ? "" : String(Math.round(m.avg_steps)),
      m.current_streak
    ].join(",")
  );
  return [METRICS_CSV_HEADERS.join(","), ...rows].join("\n") + "\n";
}

export function metricsCsvFilename(programName: string | undefined, range: MemberMetricsResponse["date_range"]): string {
  const name = (programName ?? "").replace(/[^A-Za-z0-9]/g, "") || "Program";
  return `MemberPerformanceMetrics_${name}_${range?.start || "all"}_to_${range?.end || "today"}.csv`;
}
```
9. `app/members/metrics/page.tsx`:
   - Change :7 to `import { initials, downloadCsv } from "@/lib/format";`
   - Add `import { metricsCsv, metricsCsvFilename } from "@/lib/metrics-csv";` and `import { toAppError } from "@/lib/kit/app-error";`
   - Replace `handleExport` (:133-170) with:
```ts
  const handleExport = () => {
    const data = metricsQuery.data;
    if (!data || data.members.length === 0) return;
    // member-analytics D-C8 (polish #47): exactly the list on screen, in its order, under the shared column contract.
    downloadCsv(metricsCsvFilename(program?.name, data.date_range), metricsCsv(data.members));
  };
```
   - :215 becomes `toAppError(metricsQuery.error).message`
10. `app/privacy-policy/page.tsx`, `app/support/page.tsx`, `app/delete-account/page.tsx`:
    - Add `import { BrandMark } from "@/components/BrandMark";`
    - Make this the first child of `<PageShell maxWidth="3xl">`, directly above `<PageHeader`:
```tsx
      <div className="flex justify-center">
        <BrandMark size={96} />
      </div>
```
11. #46 web check only (no code). Recharts' default `allowEscapeViewBox {x:false,y:false}` holds: no `<Tooltip>` overrides it, and no chart sits in an `overflow-x-auto`.
    - Check a tall-bar tooltip on `/summary/activity` (week/month/year), `/summary` and `/lifestyle/timeline` at 375 px and 1280 px.
    - If anything clips, **stop and report to the orchestrator** (that would widen the scope).

## Steps — ios (files: apps/ios/RaSi-Fiters-App/…)

1. NEW `Shared/Kit/OfflineBanner.swift`. The groups are synced, so there is no pbxproj edit.
```swift
import SwiftUI

/// The app-wide offline banner on a presented sheet / full-screen cover (polish #2, frontend-kit D-KIT-17). A
/// presentation sits above `AppRootView`, so the root banner (A6) can't show over it: apply `.offlineBanner()` ONCE at
/// the presented view's root, INSIDE any `.environmentObject(programContext)`. While offline it reserves the root's
/// 76-pt band (52 min height + 12 margin + 12 clearance) so a Save / Create at the end of a scroll view is never under
/// it (D-KIT-8); a screen's own banner already hides while offline (`ScreenBanner`).
struct OfflineBannerModifier: ViewModifier {
    @EnvironmentObject private var programContext: ProgramContext

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !programContext.isOnline {
                    Color.clear.frame(height: 76)
                }
            }
            .floatingBanner {
                if !programContext.isOnline {
                    FloatingBanner(variant: .offline)
                }
            }
    }
}

extension View {
    func offlineBanner() -> some View {
        modifier(OfflineBannerModifier())
    }
}
```
2. `App/AppRootView.swift`:
   - (a) Delete the `.onChange(of: programContext.isUpdateRequired) { … }` block (:72-76).
   - (b) In `case .active:` (:79-103), split the work:
```swift
            case .active:
                // Polish #7 (app-config D-C8): the version check runs alongside — restore + session work never wait on it.
                Task { @MainActor in await programContext.checkMinimumSupportedVersion() }
                Task { @MainActor in
                    if programContext.authToken == nil {
```
     Keep everything from `programContext.restorePersistedSession() …` through the end of the permission `switch` unchanged. The only change is that the first line inside the old Task (`await programContext.checkMinimumSupportedVersion()`) moves into its own Task, as shown.
   - (c) Replace `.onOpenURL { … }` (:110-121) with:
```swift
        .onOpenURL { url in
            if let route = WidgetRoute(url: url) {
                // Polish #7 (app-config D-C8): open the form at once; the check runs alongside. An unsupported build gets
                // the update modal over the form (WidgetCoverView) — never a second cover while this one is up.
                if !programContext.isUpdateRequired { programContext.widgetRoute = route }
                Task { @MainActor in await programContext.checkMinimumSupportedVersion() }
            }
        }
```
   - (d) Widget cover content (:127-135): replace the `switch route { … }` with `WidgetCoverView(route: route).environmentObject(programContext)`.
   - (e) Forced-update cover binding (:138-141):
```swift
            isPresented: Binding(
                // While a widget form is up, WidgetCoverView shows the update modal in place (polish #7).
                get: { programContext.isUpdateRequired && !isWidgetCoverShown },
                set: { _ in }      // blocking: only checkMinimumSupportedVersion changes isUpdateRequired
            )
```
   - (f) Health review cover: `HealthSyncConfirmationView(confirmation: confirmation).offlineBanner().environmentObject(programContext)`.
   - (g) Add after `offlineBannerSpace`:
```swift
    private var isWidgetCoverShown: Bool { programContext.authToken != nil && programContext.widgetRoute != nil }
```
   - (h) Add after `struct ScreenBanner`:
```swift
/// The widget quick-add form (polish #7): opens at once while the version check runs alongside; if the check finds this
/// build unsupported, the blocking update modal covers the form in place (its dimmed backdrop takes every tap).
private struct WidgetCoverView: View {
    @EnvironmentObject private var programContext: ProgramContext
    let route: WidgetRoute

    var body: some View {
        Group {
            switch route {
            case .quickAddWorkout: QuickAddWorkoutWidgetEntryView()
            case .quickAddHealth: QuickAddHealthWidgetEntryView()
            }
        }
        .offlineBanner()
        .overlay {
            if programContext.isUpdateRequired {
                ForcedUpdateModalView(minimumVersion: programContext.minimumSupportedVersion)
            }
        }
    }
}
```
3. `Features/Home/ProgramActions/ProgramActionsSheet.swift`: after `.onAppear { … }` (:70-78), append `.offlineBanner()`.
4. `Features/Home/ProgramActions/InvitesTabView.swift`:
   - :56: `ErrorStateView(error: loadError.labeled(online: programContext.isOnline), onRetry: { Task { await refreshInvites() } })`
   - :72: `Spacer(minLength: staleBanner == nil || !programContext.isOnline ? 40 : 104)`
   - :106-108 becomes `.floatingBanner { ScreenBanner(banner: staleBanner) }` (the stale banner is hidden while offline; the sheet's offline banner wins).
   - Add after the `.alert(…)` modifier:
```swift
        .onChange(of: programContext.isOnline) { _, online in
            // Polish #2: back online after a failed load → reload by itself (the picker's D-KIT-13 rule).
            if online, loadError != nil { Task { await refreshInvites() } }
        }
```
   - `HealthSyncConfirmationView.swift` gets **no change**. The modifier lives on the cover content in AppRootView, chosen as the single place.
5. `Features/Home/Tabs/StandardMembersTab.swift`:
   - Add `@State private var loadedProgramId: String?` after :12.
   - Replace `loadLoggerLogsData` (:155-159) with:
```swift
    @MainActor
    private func loadLoggerLogsData(memberId: String) async {
        // MemberHealthCard loads its own preview (.task(id:)) — only Recent is tab-level state.
        await programContext.loadMemberRecent(memberId: memberId, limit: 10)
    }
```
   - Replace `loadUserData` (:161-198) with:
```swift
    private func loadUserData() async {
        guard let userId = programContext.loggedInUserId else {
            errorMessage = "Unable to identify logged-in user."
            return
        }

        // Polish #5: the spinner shows only while nothing for this program is on screen (first load / program switch);
        // a tab re-entry keeps the cards and refreshes underneath. Every read runs in parallel.
        let programId = programContext.programId
        isLoading = loadedProgramId != programId
        errorMessage = nil

        let pc = programContext
        let needsLookup = isLogger && (pc.members.isEmpty || pc.membersProgramId != pc.programId)
        await withDiscardingTaskGroup { group in
            if needsLookup { group.addTask { await pc.loadLookupData() } }
            group.addTask { await pc.loadMemberOverview(memberId: userId) }
            group.addTask { await pc.loadMemberHistory(memberId: userId, period: "week") }
            group.addTask { await pc.loadMemberStreaks(memberId: userId) }
            group.addTask { await pc.loadMemberRecent(memberId: userId, limit: 10) }
        }

        // The self metric row IS the overview row (same memberId-scoped /member-metrics DTO) — no all-member download
        // (member-analytics D-C9). MemberHealthCard loads its own preview, so no tab-level health read either.
        loggedInUserMetrics = pc.selectedMemberOverview?.member_id == userId ? pc.selectedMemberOverview : nil
        loadedProgramId = programId
        isLoading = false

        if isLogger, loggerViewAsMember == nil, let member = loggedInMember {
            loggerViewAsMember = member
        }
    }
```
6. `Features/Home/Tabs/AdminMembersTab.swift`: replace the `if let m = member { … }` branch (:133-138) with:
```swift
        if let m = member {
            // Polish #5: the four tab-level reads in parallel; MemberHealthCard loads its own preview (.task(id:)).
            let pc = programContext
            let memberId = m.id
            await withDiscardingTaskGroup { group in
                group.addTask { await pc.loadMemberOverview(memberId: memberId) }
                group.addTask { await pc.loadMemberHistory(memberId: memberId, period: "week") }
                group.addTask { await pc.loadMemberStreaks(memberId: memberId) }
                group.addTask { await pc.loadMemberRecent(memberId: memberId, limit: 10) }
            }
        } else {
```
   The `else` body stays unchanged.
7. `Features/Home/Tabs/StandardWorkoutTypesTab.swift`:
   - Add `@State private var loadedProgramId: String?` after :11.
   - Replace the body of `loadUserWorkoutTypes` after its `guard` (:123-136) with:
```swift
        // Polish #5: spinner only while nothing for this program is on screen; the seven reads run in parallel.
        let programId = programContext.programId
        isLoading = loadedProgramId != programId
        errorMessage = nil

        let pc = programContext
        let week = AdminHomeView.Period.week.apiValue
        await withDiscardingTaskGroup { group in
            group.addTask { await pc.loadWorkoutTypesTotal(memberId: userId) }
            group.addTask { await pc.loadWorkoutTypeMostPopular(memberId: userId) }
            group.addTask { await pc.loadWorkoutTypeLongestDuration(memberId: userId) }
            group.addTask { await pc.loadWorkoutTypeHighestParticipation(memberId: nil) }  // Always program-wide
            group.addTask { await pc.loadWorkoutTypes(memberId: userId) }
            group.addTask { await pc.loadHealthTimeline(period: week, memberId: userId) }
            group.addTask { await pc.loadStepsStats(memberId: userId) }
        }

        errorMessage = pc.errorMessage
        loadedProgramId = programId
        isLoading = false
```
8. `Features/Home/Tabs/AdminWorkoutTypesTab.swift`:
   - Add `@State private var reloadQueued = false` after :15.
   - In `.task` (:100), replace the bare `await programContext.loadLookupData()` with:
```swift
            // Polish #5: the roster loads once per program (StandardMembersTab's guard), not on every tab appearance.
            if programContext.members.isEmpty || programContext.membersProgramId != programContext.programId {
                await programContext.loadLookupData()
            }
```
   - Leave the `.onChange(of: programContext.programId)` call as it is.
   - Replace `load()` (:135-149) with:
```swift
    private func load() async {
        // Polish #5: the seven reads run in parallel. A View-as change during a load is queued, not dropped — the loop
        // re-reads the selection until it settles, so the cards always end on the member the label shows.
        guard !isLoading else {
            reloadQueued = true
            return
        }
        isLoading = true
        errorMessage = nil
        let pc = programContext
        let week = AdminHomeView.Period.week.apiValue
        repeat {
            reloadQueued = false
            let memberId = selectedMember?.id
            await withDiscardingTaskGroup { group in
                group.addTask { await pc.loadWorkoutTypesTotal(memberId: memberId) }
                group.addTask { await pc.loadWorkoutTypeMostPopular(memberId: memberId) }
                group.addTask { await pc.loadWorkoutTypeLongestDuration(memberId: memberId) }
                group.addTask { await pc.loadWorkoutTypeHighestParticipation(memberId: nil) }  // Always program-wide
                group.addTask { await pc.loadWorkoutTypes(memberId: memberId) }
                group.addTask { await pc.loadHealthTimeline(period: week, memberId: memberId) }
                group.addTask { await pc.loadStepsStats(memberId: memberId) }
            }
        } while reloadQueued
        errorMessage = pc.errorMessage
        isLoading = false
    }
```
9. **#8, user actions.** Replace each right-hand side with `SessionCopy.kitMessage(for: error)`. That keeps the server text for 400/422 and for any rowErrors batch; everything else gets the kit copy.
   - `Features/Home/Tabs/ProgramCards.swift:92`
   - `Features/Home/Settings/MyProfileView.swift:453`
   - `Features/Home/ProgramManagement/MemberManagementSection.swift:352, :366`
   - `Features/Home/ProgramManagement/RoleManagementSection.swift:297`
   - `Features/Home/ProgramManagement/WorkoutTypesSection.swift:290, :306, :316, :326, :342`
   - `Features/Home/ProgramActions/EditProgramInfoView.swift:223`
   - `Features/Home/ProgramActions/CreateProgramTabView.swift:152`
   - `Features/Home/Detail/AddWorkoutsDetailView.swift:464` (`error.message`) and `:467`
   - `Features/Home/Detail/AddDailyHealthDetailView.swift:518, :521`
   - `Features/Widgets/QuickAddWorkoutWidgetEntryView.swift:559, :562`
   - `Features/Widgets/QuickAddHealthWidgetEntryView.swift:600, :603`
   - `Features/Home/Detail/MemberRecentDetail.swift:422, :824`
   - `Features/Home/Detail/MemberHealthDetail.swift:457, :968`
   - In the `BulkWorkoutError` catches, keep `applyRowErrors(error.rowErrors)`. Only the message line changes.
10. **#8, ProgramContext loads.** Replace `errorMessage = error.localizedDescription` with `if let message = AppError(error)?.message { errorMessage = message }`. A cancelled load stays silent.
    - `Shared/Models/ProgramContext+Members.swift:44, :83, :117, :141, :160, :197, :247, :274`
    - `Shared/Models/ProgramContext+Analytics.swift:93, :116, :131, :146, :161, :176, :191, :206`
    - `Shared/Models/ProgramContext+WorkoutManagement.swift:92`
11. NEW `Features/Home/Detail/ChartCalloutPlacement.swift`:
```swift
import SwiftUI

/// One placement rule for every iOS chart callout (polish #46; reference = Android `drawTooltip`, ChartPrimitives.kt):
/// centred on the touched point and clamped inside the chart overlay; above the point when the whole (measured) bubble
/// fits under the overlay's top edge, else flipped below it — never cut off by the chart's top edge or its scroll view.
struct ChartCalloutPlacement: ViewModifier {
    /// The touched point, in the chart overlay's (GeometryReader's) coordinate space.
    let anchor: CGPoint
    /// The chart overlay's size (`geo.size`).
    let bounds: CGSize

    @State private var size: CGSize = .zero

    private let gap: CGFloat = 8
    private let margin: CGFloat = 4

    func body(content: Content) -> some View {
        content
            .fixedSize()
            .onGeometryChange(for: CGSize.self) { proxy in proxy.size } action: { size = $0 }
            .opacity(size == .zero ? 0 : 1)     // the first pass measures; nothing flashes at a wrong spot
            .position(center)
    }

    private var center: CGPoint {
        let halfWidth = size.width / 2
        let halfHeight = size.height / 2
        let x = clamp(anchor.x, min: halfWidth + margin, max: max(halfWidth + margin, bounds.width - halfWidth - margin))
        let fitsAbove = anchor.y - gap - size.height >= margin
        let y = fitsAbove
            ? anchor.y - gap - halfHeight
            : min(anchor.y + gap + halfHeight, max(halfHeight + margin, bounds.height - halfHeight - margin))
        return CGPoint(x: x, y: y)
    }
}

extension View {
    /// Places a chart callout bubble (CalloutView / HealthCalloutView / StepsCalloutView) by the shared rule above.
    func chartCalloutPlacement(anchor: CGPoint, in bounds: CGSize) -> some View {
        modifier(ChartCalloutPlacement(anchor: anchor, bounds: bounds))
    }
}
```
12. Replace each callout's `.position(x: clamp(…), y: max(…))` block with `.chartCalloutPlacement(anchor: CGPoint(x: anchorX, y: anchorY), in: geo.size)` at:
    - `Features/Home/Detail/ActivityTimelineDetailView.swift:199-202` (this also covers member history, which reuses this view)
    - `Features/Home/Detail/StepsTimelineDetailView.swift:171-174`
    - `Features/Home/Detail/LifestyleTimelineDetailView.swift:222-225`
    - `Features/Home/Detail/DistributionByDayDetailView.swift:110-113`
    - In `DistributionByDayDetailView.swift`, also delete the whole `.annotation(position: .top, spacing: 6) { … }` (:60-75). Keep the `RuleMark(…).lineStyle(…).foregroundStyle(…)`; the duplicate callout goes away.
13. `Features/Home/Tabs/SummaryChartCards.swift:220`: change the call to `.annotation(position: .top, spacing: 6, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {`. The content stays unchanged.
14. `Features/Home/Detail/MemberMetricsDetailView.swift`: replace `exportCSV()` (:180-208) with:
```swift
    private func exportCSV() async {
        let rows = programContext.memberMetrics
        guard !rows.isEmpty else { return }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        let fileName = Self.csvFileName(
            programName: programContext.name,
            start: programContext.memberMetricsRangeStart.map { formatter.string(from: $0) },
            end: programContext.memberMetricsRangeEnd.map { formatter.string(from: $0) }
        )
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try Self.csv(rows).write(to: url, atomically: true, encoding: .utf8)
            shareItem = ShareItem(url: url)
        } catch {
            // silently fail for now
        }
    }

    // MARK: CSV — member-analytics D-C8 (polish #47): ONE column contract on web, iOS and Android. Rows = the list on
    // screen, in its order; units live in the headers so cells stay plain numbers; a missing average is an empty cell.
    private static let csvHeader = "Name,Active Days,Workouts,Total Duration (min),Workout Types,Avg Duration (min),Longest Streak (days),Avg Sleep (hrs),Avg Diet Quality (out of 5),Avg Steps,Current Streak (days)"

    private static func csv(_ rows: [APIClient.MemberMetricsDTO]) -> String {
        var csv = csvHeader + "\n"
        for m in rows {
            let cells: [String] = [
                "\"" + m.member_name.replacingOccurrences(of: "\"", with: "\"\"") + "\"",
                "\(m.active_days)",
                "\(m.workouts)",
                "\(m.total_duration)",
                "\(m.workout_types)",
                "\(m.avg_duration)",
                "\(m.longest_streak)",
                m.avg_sleep_hours.map { String(format: "%.1f", $0) } ?? "",
                m.avg_food_quality.map { "\($0)" } ?? "",
                m.avg_steps.map { "\($0)" } ?? "",
                "\(m.current_streak)"
            ]
            csv += cells.joined(separator: ",") + "\n"
        }
        return csv
    }

    private static func csvFileName(programName: String, start: String?, end: String?) -> String {
        let cleaned = programName.filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        let name = cleaned.isEmpty ? "Program" : cleaned
        return "MemberPerformanceMetrics_\(name)_\(start ?? "all")_to_\(end ?? "today").csv"
    }
```

## Steps — android (files: apps/android/app/src/main/java/com/app/rasifiters/…)

1. `ui/programs/ProgramActionsSheet.kt`:
   - Add imports: `com.app.rasifiters.ui.OFFLINE_BANNER_RESERVE`, `com.app.rasifiters.ui.components.kit.FloatingBanner`, `com.app.rasifiters.ui.components.kit.FloatingBannerVariant`.
   - Add `val online by programContext.isOnline.collectAsStateWithLifecycle()` after :97.
   - Replace the `ModalBottomSheet { … }` body (:99-120) with the following. `SegmentedToggle` and the `when` stay exactly as they are today.
```kotlin
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        // Polish #2 (D-KIT-17): the sheet is its own window, so the root offline banner can't show over it — it carries
        // its own, and the tab area gives up the banner's band (the sheet keeps its height) so nothing sits under it.
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 16.dp),
            ) {
                SegmentedToggle(
                    left = if (isGlobalAdmin) "All Invites" else "My Invites",
                    right = "Create",
                    selectedIndex = selectedTab,
                    onSelect = { selectedTab = it },
                )
                Spacer(Modifier.height(16.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(TAB_CONTENT_HEIGHT)
                        .padding(bottom = if (online) 0.dp else OFFLINE_BANNER_RESERVE),
                ) {
                    when (selectedTab) {
                        0 -> InvitesTab(programContext, invitesState, requested, isGlobalAdmin, onAccepted = onDismiss)
                        else -> CreateProgramTab(programContext, onCreated = onDismiss)
                    }
                }
            }
            if (!online) {
                FloatingBanner(FloatingBannerVariant.Offline, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
            }
        }
    }
```
   - :177 becomes `.onFailure { errorMessage = it.toAppError().message }`
   - :339 becomes `.onFailure { errorMessage = it.toAppError().message }`
2. `ui/programs/ProgramPickerScreen.kt`: replace the reconnect `LaunchedEffect` (:143-149) with:
```kotlin
    // D-KIT-13: back online → a failed / stale list reloads by itself; polish #2: so does a failed / stale invite inbox.
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val programsSt = programContext.programsState.value
            val invitesSt = programContext.invites.value
            coroutineScope {
                if (programsSt is UiState.Failed || programsSt is UiState.Stale) launch { programContext.loadPrograms() }
                if (invitesSt is UiState.Failed || invitesSt is UiState.Stale) launch { programContext.loadInvites() }
            }
        }
    }
```
3. `ui/RootScreen.kt` (OQ-2 = yes):
   - Add imports `androidx.compose.foundation.background` and `androidx.compose.material3.MaterialTheme`.
   - Replace the `pendingHealthConfirmation?.let { … }` block (:135-142) with:
```kotlin
        // First-time Health Connect sync confirmation — a full-screen overlay above everything (iOS AppRootView
        // fullScreenCover). Dismiss (system back) defers; the tick commits + advances. Polish #2 (D-KIT-17): drawn above
        // SignedInGraph's offline banner, so it carries the banner itself and lifts its list clear of it.
        pendingHealthConfirmation?.let { confirmation ->
            Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                Box(modifier = Modifier.fillMaxSize().offlineReserve(!online)) {
                    HealthSyncConfirmationScreen(
                        programContext = programContext,
                        confirmation = confirmation,
                        onFinished = { committed -> programContext.health.finishConfirmation(confirmation.flow, committed) },
                    )
                }
                OfflineBanner(!online)
            }
        }
```
   - The widget gate (`WIDGET_GATE_TIMEOUT_MS`) stays unchanged (Q-1).
4. `ui/members/MembersScreen.kt`:
   - Add imports `kotlinx.coroutines.coroutineScope` and `kotlinx.coroutines.launch`.
   - (a) Admin `LaunchedEffect(selectedId)` (:105-114) becomes:
```kotlin
    // The selected member's 5 reads whenever the persisted selection changes (or on tab re-entry) — in parallel (#5).
    LaunchedEffect(selectedId) {
        val id = selectedId ?: return@LaunchedEffect
        val name = roster.firstOrNull { it.id == id }?.memberName
        programContext.focusMember(id, name)
        coroutineScope {
            launch { programContext.loadMemberOverview(id) }
            launch { programContext.loadMemberHistory(id, "week") }
            launch { programContext.loadMemberStreaks(id) }
            launch { programContext.loadMemberRecent(id, limit = 10) }
            launch { programContext.loadMemberHealthLogs(id, limit = 10) }
        }
    }
```
   - (b) In `StandardMembersBody`, replace the lines from `var loading …` through the end of the logger `LaunchedEffect(loggerViewAsId)` (:152-182) with:
```kotlin
    val overview by programContext.selectedMemberOverview.collectAsStateWithLifecycle()
    // Polish #5: a spinner only while nothing for this program is on screen; a tab re-entry keeps the cards.
    var loading by remember { mutableStateOf(programContext.membersSelfLoadedFor != program?.id) }
    // The member whose Recent + Health the program load already fetched (the View-as effect skips it).
    var logsLoadedFor by remember { mutableStateOf<String?>(null) }
    var showPicker by remember { mutableStateOf(false) }

    // Self data — every read in parallel. The self metric row IS the overview row (no all-member download, D-C9).
    LaunchedEffect(program?.id) {
        loading = programContext.membersSelfLoadedFor != program?.id
        programContext.ensureMembersLoaded()
        if (selfId != null) {
            val logsId = (if (isLogger) programContext.membersViewAsId.value else null) ?: selfId
            logsLoadedFor = logsId
            programContext.focusMember(selfId, selfName)
            coroutineScope {
                launch { programContext.loadMemberOverview(selfId) }
                launch { programContext.loadMemberHistory(selfId, "week") }
                launch { programContext.loadMemberStreaks(selfId) }
                launch { programContext.loadMemberRecent(logsId, limit = 10) }
                launch { programContext.loadMemberHealthLogs(logsId, limit = 10) }
            }
            programContext.membersSelfLoadedFor = program?.id
        }
        loading = false
    }

    // Logger View-as re-scopes Recent + Health only — never on first composition (the program load covers it).
    LaunchedEffect(loggerViewAsId) {
        if (!isLogger) return@LaunchedEffect
        val loaded = logsLoadedFor ?: return@LaunchedEffect
        val id = loggerViewAsId ?: selfId ?: return@LaunchedEffect
        if (id == loaded) return@LaunchedEffect
        logsLoadedFor = id
        coroutineScope {
            launch { programContext.loadMemberRecent(id, limit = 10) }
            launch { programContext.loadMemberHealthLogs(id, limit = 10) }
        }
    }
```
   - (c) Replace `selfMetrics?.let { MemberMetricsCard(it, MetricSortField.ACTIVE_DAYS) }` with `overview?.takeIf { it.memberId == selfId }?.let { MemberMetricsCard(it, MetricSortField.ACTIVE_DAYS) }`.
   - The old `var selfMetrics` is gone (removed with the block above).
5. `core/ProgramContext.kt`:
   - After :975 add:
```kotlin
    /** The program whose Members-tab self data last finished loading (polish #5): the tab spins only when nothing for the
     *  active program is on screen; a re-entry keeps the cards and refreshes underneath. Reset by the teardown. */
    var membersSelfLoadedFor: String? = null
```
   - After :1450 (`membersLoadedFor = null`) add `membersSelfLoadedFor = null`.
   - Replace `loadLifestyle` (:1267-1282) with the following. It keeps today's all-or-nothing behaviour; partial results are #31.
```kotlin
    suspend fun loadLifestyle(memberId: String?): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        _lifestyleLoading.value = true
        return runCatching {
            // Polish #5: the seven reads in parallel; any failure fails the whole load as before.
            coroutineScope {
                val totalTypes = async { api.getWorkoutTypesTotal(pid, memberId).totalTypes }
                val mostPopular = async { api.getWorkoutTypeMostPopular(pid, memberId) }
                val longestDuration = async { api.getWorkoutTypeLongestDuration(pid, memberId) }
                val highestParticipation = async { api.getWorkoutTypeHighestParticipation(pid, null) }
                val workoutTypes = async { api.getWorkoutTypes(pid, 100, memberId) }
                val timeline = async { api.getHealthTimeline("week", pid, memberId) }
                val steps = async { api.getHealthSteps(pid, memberId) }
                _lifestyle.value = LifestyleData(
                    totalTypes = totalTypes.await(),
                    mostPopular = mostPopular.await(),
                    longestDuration = longestDuration.await(),
                    highestParticipation = highestParticipation.await(),
                    workoutTypes = workoutTypes.await(),
                    timeline = timeline.await(),
                    steps = steps.await(),
                )
            }
        }.recoverCatching { throw it.asApiError() }.also { _lifestyleLoading.value = false }
    }
```
6. **#8.**
   - Add `import com.app.rasifiters.core.kit.toAppError` to every file below that lacks it: everything except `ProgramActionsSheet` and `ProfileScreen`.
   - Replace each `it.message ?: "…"`, `it.message`, `e.message ?: "…"` with `it.toAppError().message` (or `e.toAppError().message`):
     - `ui/lifestyle/WorkoutTypesListScreen.kt:94`
     - `ui/program/EditProgramScreen.kt:158`
     - `ui/program/ManageRolesScreen.kt:91`
     - `ui/program/ProfileScreen.kt:422, :441`
     - `ui/program/ProgramScreen.kt:143`
     - `ui/members/MemberManagementScreens.kt:125, :290, :318`
     - `ui/members/MemberRecentDetailScreen.kt:191, :207`
     - `ui/members/MemberHealthDetailScreen.kt:191, :208`
   - In `ui/summary/LogWorkoutScreen.kt:198-205`, `ui/summary/LogHealthScreen.kt:224-231`, `ui/summary/QuickAddWorkoutWidgetScreen.kt:215-222` and `ui/summary/QuickAddHealthWidgetScreen.kt:206-213`, replace the `onFailure` body with:
```kotlin
                .onFailure { e ->
                    saving = false
                    // Polish #8: the kit message — the server's text survives for 400/422 and any rowErrors batch (D-KIT-3).
                    rowErrors = (e as? ApiException)?.rowErrors?.takeIf { it.isNotEmpty() }
                    errorMessage = e.toAppError().message
                }
```
7. `ui/members/MemberMetricsDetailScreen.kt`: replace `metricsCsv` and `metricsCsvName` (:356-381) with:
```kotlin
// ---- CSV export — member-analytics D-C8 (polish #47): ONE column contract on web, iOS and Android ----
// Rows = the list on screen, in its order; units live in the headers so cells stay plain numbers; a missing average is
// an empty cell; sleep has one decimal ('.' always).
private const val METRICS_CSV_HEADER =
    "Name,Active Days,Workouts,Total Duration (min),Workout Types,Avg Duration (min),Longest Streak (days)," +
        "Avg Sleep (hrs),Avg Diet Quality (out of 5),Avg Steps,Current Streak (days)"

private fun metricsCsv(rows: List<com.app.rasifiters.net.MemberMetricsDTO>): String {
    val sb = StringBuilder(METRICS_CSV_HEADER).append('\n')
    rows.forEach { m ->
        sb.append(csvField(m.memberName)).append(',')
            .append(m.activeDays).append(',')
            .append(m.workouts).append(',')
            .append(m.totalDuration).append(',')
            .append(m.workoutTypes).append(',')
            .append(m.avgDuration).append(',')
            .append(m.longestStreak).append(',')
            .append(m.avgSleepHours?.let { String.format(Locale.US, "%.1f", it) } ?: "").append(',')
            .append(m.avgFoodQuality?.toString() ?: "").append(',')
            .append(m.avgSteps?.toString() ?: "").append(',')
            .append(m.currentStreak).append('\n')
    }
    return sb.toString()
}

private fun metricsCsvName(program: String?, range: Pair<String?, String?>): String {
    val name = program.orEmpty().filter { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' }.ifEmpty { "Program" }
    val start = range.first?.takeIf { it.isNotEmpty() } ?: "all"
    val end = range.second?.takeIf { it.isNotEmpty() } ?: "today"
    return "MemberPerformanceMetrics_${name}_${start}_to_$end.csv"
}
```
8. #46 Android check only, no code change. `ChartPrimitives.kt` `drawTooltip` already flips below the point (`above = anchorY - boxH - caretH - 6dp >= 0`) and clamps x. Check a tall bar on the Activity timeline on the emulator.

## Endgame
1. **Compile checks:**
   - web: `cd apps/web && npm run build && npm run lint`
   - android: `cd apps/android && ./gradlew :app:assembleDebug`
   - iOS: `bash tools/ios-typecheck.sh`, then **the user presses ⌘B** in Xcode (the user reports errors, Claude fixes them, repeat).
   - backend: not touched, so no boot check.
   - Afterwards clean `apps/android` build dirs and `apps/web/.next`, and report free disk space.
   - **All visual and live testing is the user's job, on prod** (web after deploy; phones on debug builds against prod). No staging: there is no migration and no auth change.
   - User checklist:
     - (#2) airplane mode on the "+" sheet, the widget forms, and the Apple Health / Health Connect review: the banner shows, Create/Save stay reachable, and invites reload when back online.
     - (#5) Members/Lifestyle: no spinner on re-entry; a program switch still spins.
     - (#7) the widget opens at once on weak Wi-Fi.
     - (#4/#6/#8) an offline save fails at once with "Can't connect…"; a duplicate workout-type name still shows the server text.
     - (#46) a tall-bar tooltip is fully visible on every iOS chart.
     - (#47) the same search + filter + sort exported on all three gives byte-identical files.
     - (#48) the logo shows on the three pages at 375 px and on desktop.
2. **Migration:** none. Backend: none. S0 must keep serving the all-member `GET /member-metrics` that live binaries (iOS 1.4.2/1.5.0, Android 1.0.0/1.1.0) still call.
3. **git-version:**
   - Each surface lands as a no-bump `feat(web)`, `feat(ios)` or `feat(android)` commit when its review passes. Web can deploy alone. The phones ship only in the single Phase 4 store release; there is no app version bump (iOS stays 1.5.1 (59), Android versionCode 6).
   - Then ONE orchestrator docs commit bumps:
     - **frontend-kit 0.3.0→0.4.0**
       - D-KIT-17: presentations carry the offline banner (iOS `.offlineBanner()` on the "+" sheet, widget covers and Apple Health review; Android on the sheet and HC review; the invites reload on reconnect on both).
       - D-KIT-18: web `fromQuery` fails after the first try (`failureCount` / `failureReason`), Retry refetches retrying queries, and mutations use `networkMode: "always"`.
       - D-KIT-19: the #8 sweep (every save/load error goes through the kit; reset-password uses `credentialErrorMessage`).
       - §8 adds `Shared/Kit/OfflineBanner.swift`.
     - **member-analytics 0.4.0→0.5.0**
       - D-C8: the column contract table above, with the deliberate units-in-headers deviation. D-C7's "CSV column order untouched" is marked superseded in place.
       - D-C9: new clients read the self row via the memberId-scoped overview; plain members no longer download all members' metrics.
     - **app-config 0.3.0→0.4.0**
       - D-C8: on iOS the widget opens at once with the check alongside, and the update modal sits over the form in place. The iOS foreground check runs alongside the session work. Android keeps A7's 3 s wait (recorded divergence).
     - **Page SPECs** for every page listed in the brief, as PATCH bumps.
   - Tags: `feature/frontend-kit@v0.4.0`, `feature/member-analytics@v0.5.0`, `feature/app-config@v0.4.0`.

## Risks the implementer must watch
- **iOS #7, two covers:** never re-add `widgetRoute = nil` when `isUpdateRequired` flips. The forced-update binding's setter must stay a no-op. Edge case: if a widget form auto-exits after a successful save at the exact moment the check flips to "required", the forced cover may be presented mid-dismissal. This is accepted as rare (it needs a minimum-version bump at that instant).
- **iOS `withDiscardingTaskGroup` closures** must capture only `pc` (a MainActor class, so Sendable) and value locals (`userId`, `memberId`, `week`). Never `self`, `m`, or `AdminHomeView.Period…` inside a closure, otherwise isolation errors appear under default MainActor isolation.
- **iOS `.offlineBanner()` order:** it must sit inside `.environmentObject(programContext)` on the covers, as written in I2 (f) and (h).
- **iOS #8 split:** user actions use `SessionCopy.kitMessage`. ProgramContext loads use `AppError(error)?.message`, because `nil` on cancellation keeps cancelled loads silent. Do not swap them.
- **Android `toAppError()` rethrows `CancellationException`.** That is fine inside `onFailure` (the coroutine is already cancelled). `saving = false` stays first.
- **Android Members `logsLoadedFor`** relies on the program effect setting it right after `ensureMembersLoaded()` and before any recomposition. Keep that order. Plain members never run the logger effect.
- **#10 must not get worse:** program-switch spinners stay on both phones (`loadedProgramId` / `membersSelfLoadedFor`). The AdminWorkoutTypesTab queue loop always ends on the member the label shows.
- **Kit 409 copy:** a single-row 409 would show the kit "conflict" text, but every form uses the batch routes, whose 409s carry rowErrors, so the server text survives. Every "…already exists" from the program and workout-type routes is a 400, so its text survives too.
- **Web #6 covers `fromQuery` screens only** (programs, summary). The detail pages still use `isLoading`/`isError` and keep the 48 s wait until #29.
- **Web metrics cards** don't show Avg Duration or Avg Steps tiles, but the CSV carries all 10 metrics per the contract. Don't restyle the card (out of scope).
- **Parity divergences, both called out:** #7 timing (iOS opens at once, Android waits ≤3 s, per A7). #2, #5 and #7 are mobile-only by nature (web has no sheets or widgets, and its reads are already parallel queries).
- Don't touch `specs/initiatives/reliability-overhaul/HANDOFF.md` (it has uncommitted edits that aren't ours) or any SPEC, registry or REGISTRY file. Docs belong to the orchestrator.
