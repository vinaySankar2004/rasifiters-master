# ios-build — Lessons Archive

Run-by-run history for the `ios-build` skill. Newest first. Promote durable patterns into the SKILL's
"Converged lessons"; keep this file as the full record.

---

## Run 73 — Apple Health in-program entry point (apple-health page 0.3.0) (2026-07-01)

**Context.** The "Apple Health" settings row only existed on the main-level account sheet
(`AccountMenuSheet`); the in-program **My Account** section had none. Added the row to
`ProgramMyAccountSection` (`ProgramCards.swift`, between Notifications and Privacy Policy) as a
`NavigationLink` to `AppleHealthSettingsView()` — same screen, identical behavior, no pre-selection.
(An initial cut auto-scoped the current program into both sync sets via an `autoScopeProgramId` param;
the user rejected it as confusing, so it was reverted to the plain screen. D-ENTRY.)

**Build.** `XcodeListWindows` → `windowtab2` (fetched fresh). `BuildProject` → built successfully,
**0 errors** (both the auto-scope cut and the reverted plain cut). `XcodeListNavigatorIssues` → 0.

**Lesson.** Two entry points to one settings screen is just a second `NavigationLink` to the same view —
no param, no shared-state seeding. Simpler than scoping and the state is honestly reflected. When a
"smart default" mutates persisted shared state on appear, prefer showing reality; users read auto-checks
as bugs.

---

## Run 72 — Month timeline charts fit-to-width (cut-off-at-15 fix) (2026-07-01)

**Context.** User reported the M (Month) tab of the two timeline drill-downs (Workout Activity Timeline,
Lifestyle Timeline) "cut off at day 15" and didn't fit ~30 days. Root cause: `ScrollableBarChart` sized
content to `count × (minBarWidth+barGap)` ≈ 540pt for a month → overflowed the ~350pt screen → horizontal
scroll hid days 16-31. W/Y/P (≤12 bars) fit, so only M broke. The "0 data" symptom was NOT a bug —
`resolveTimelineWindow` uses calendar-month (1st→last), and today being the 1st means a legitimately empty
window (faithful per analytics SPEC D-S1/F1; user chose to keep it). Web is fine (Recharts ResponsiveContainer).

**Change.** Added an opt-in `fill: Bool` to `ScrollableBarChart` + changed its closure to `(CGFloat) -> Content`
so it hands back the resolved bar width (keeps `.fixed(barWidth)` consistent with the fitted plot). The 2
timeline detail views pass `fill: period == .month`; the 4 other call sites (summary cards, distribution,
workout-types) just take `{ _ in }` — byte-for-byte unchanged. axisValues(.month) left as-is.

**Build.** `XcodeListWindows` → `windowtab2`; `BuildProject` → built successfully, 34.9s, 0 errors;
`XcodeListNavigatorIssues(severity:error)` → 0. Closure-signature change compiled clean across all 6 sites.

**Lesson (durable, already in Converged):** tab id was `windowtab2` this session (varies) — fetched fresh.
No new pattern to promote. Hand-off: user does the visual M-tab check in the simulator.

---

## Run 71 — Apple Health per-program window scoping + sleep-sync fix (apple-health 0.3.0) (2026-07-01)

**Context.** Fixed two sync bugs. (1) Sleep never wrote: `fetchSleepSamples` floored its window at the
connect date, so a same-day connect → `[today, today]` → nothing; dropped the floor, `sleepLookbackDays(3)`
→ `sleepRecentDays(14)` from start-of-day, and added an In-Bed fallback in `aggregateSleep` (nights with
no watch stages use `.inBed`). (2) Cross-program bleed: both syncs wrote every item to every program;
added `ProgramContext+HealthKitWindows.swift` (`loadSyncWindows`/`localYMD`/`date(_:isWithin:)`) and a
per-program `[start,end]` write-guard in `performHealthKitSync` + `performSleepSync` (dates are
`yyyy-MM-dd` strings → lexicographic compare). Workout sync returns early without committing its anchor if
windows can't be resolved (offline) to avoid dropping workouts.

**Build.** `windowtab2` this session. `BuildProject` → built successfully, **0 errors**, 19.1s.
`XcodeListNavigatorIssues` (Sleep|HealthKit|Window|DailyHealth) → 0 warnings.

**Lessons.** (1) `ProgramDTO` already carried `start_date`/`end_date` (`yyyy-MM-dd` optional strings) — no
backend/decoder change to scope client-side. (2) Anchor-based syncs must NOT advance the anchor on a
transient resolve failure (empty windows) or data is lost silently — early-return before `commitAnchor`.
(3) HealthKit read auth is invisible: a "connected but syncs nothing" report is usually the connect-date
floor or ungranted read permission, not a query bug.

## Run 70 — Apple Health SLEEP auto-sync (apple-health 0.2.0) (2026-07-01)

**Context.** Added nightly sleep sync mirroring the workout HealthKit path but writing to
`daily_health_logs.sleep_hours`. New files: `HealthKitService+Sleep.swift` (auth for
`HKCategoryType(.sleepAnalysis)`, rolling 3-night `HKSampleQuery`, asleep-stage aggregation by local
wake-date, `.hourly` background delivery), `APIClient+DailyHealth.swift` (POST-then-PUT-on-409 upsert,
outcome classify), `ProgramContext+HealthKitSleep.swift` (separate `healthkit.sleep.*` defaults +
`performSleepSync`). Modified: `ProgramContext` (4 sleep `@Published`), `ProgramContext+Auth` (restore),
`AppRootView`/`AdminHomeView` (triggers), `AppleHealthSettingsView` (second Sleep section, same screen),
`HealthKitSyncNotifier` (nights), Info.plist (broadened share-usage string). No backend/migration change.

**Build.** `windowtab2` this session. `BuildProject` → built successfully, **0 errors**, 34.1s.
`XcodeListNavigatorIssues` filtered to Sleep|HealthKit|DailyHealth → 0 warnings from the new code.

**Lessons.** (1) **Swift extensions can't add instance stored properties** — the sleep observer query +
its `HKHealthStore` are held as `private static` on the `HealthKitService` extension (the type is a
singleton, so a static is equivalent and compiles cleanly in a separate file). (2) `try? await` on a
func returning `String?` **flattens** (Swift 5+) to `String?`, so the workout refresh-on-401 pattern
copies verbatim into the sleep writer with no double-optional. (3) New synchronized-group files compiled
with no pbxproj edit (as expected). (4) Same session, tab id was `windowtab2` again — still fetched fresh.

## Run 69 — merge "Bulk add" into a unified "Add workouts" (2026-07-01)

**Context.** Collapsed the two Summary workout entry points into one multi-row "Add workouts" flow (web +
iOS). iOS: new `AddWorkoutsDetailView.swift` (repurposed from the old `BulkAddWorkoutDetailView`) that
hides the per-row member field for plain members and seeds each row's `member_id` with the logged-in
member (`ignoreMember = !canSelectAnyMember` gates `isEmptyRow`/`isValidRow`/`clientRowError`); deleted
`BulkAddWorkoutDetailView.swift` + `AddWorkoutDetailView.swift`; removed the `.bulkAdd` `SummaryCardType`
case + `BulkAddWorkoutCard` + the admin-only visibility filter; retitled the orange card/nav to "Add
workouts"; pointed the `.addWorkout` NavigationLink at the new view.

**Build.** `windowtab2` this session (NOT windowtab1 — fetch fresh every run). `BuildProject` → built
successfully, 0 errors, 43.8s. Only warning is the known widget CFBundleVersion 25≠40 mismatch (ignore).

**Lessons.** (1) tab id varies per session — promoted to Converged lessons. (2) Deleting `.swift` files
from the synchronized folder group Just Works via the open Xcode — no pbxproj edit, same as adding.
(3) Removing an enum case (`SummaryCardType.bulkAdd`) is safe against persisted UserDefaults order:
`compactMap(SummaryCardType.init(rawValue:))` silently drops the stale `"bulkAdd"` string on restore.

## Run 68 — tap-to-skip the splash intro animation (2026-06-30)

**Context.** Added a "fast-forward" affordance to the signed-out splash typewriter animation on both
surfaces (user request; web + iOS mirror each other). iOS: `SplashViewModel` gained `isSkipped` + a
`skip()` method that snaps `displayedHeadline`/`displayedSubheadline` to the full strings and flips
`isHeadlineComplete`/`isCTAVisible` in one `withAnimation`; the `type()` loop now checks `isSkipped`
before and after each `Task.sleep` so no stray character lands post-skip; `start()` guards after each
`type()` to short-circuit the inter-phase sleeps. `SplashView`'s `ZStack` got `.contentShape(Rectangle())`
+ `.onTapGesture { viewModel.skip() }` (whole-screen tap; the inner Sign-in `NavigationLink` keeps its own
tap, and `skip()` no-ops once `isCTAVisible`).

**Build.** `BuildProject(tabIdentifier: "windowtab1")` → **built successfully, 0 errors** in 17.0s. Edit
was in an existing file, no `project.pbxproj` change. Web side typechecked clean via `tsc --noEmit`.

**Lesson.** `.contentShape(Rectangle())` on the ZStack is the clean way to make an otherwise-transparent
container fully tappable without adding a `Color.clear` hit-target layer — first instinct (insert a
`Color.clear`) was unnecessary and reverted. Child gestures (the Sign-in link) still win over the parent
`onTapGesture`, so no conflict.

---

## Run 67 — native forgot-password request screen (2026-06-30)

**Context.** Made the iOS "Forgot your password?" recovery *request* step native: new
`Features/Auth/ForgotPasswordView.swift` (mirrors the web `/forgot-password` page — inline email
validation, generic no-enumeration confirmation, `mailto:` contact fallback), new
`APIClient.requestPasswordReset(email:)` → `POST /auth/forgot-password`, `APIConfig` gained
`supportEmail`/`supportMailtoURL` and dropped the now-unused `forgotPasswordURL`, and `LoginView` swapped
its browser `Link` for a `NavigationLink → ForgotPasswordView()`.

**Build.** `BuildProject(tabIdentifier: "windowtab1")` → **built successfully, 0 errors** in 17.3s. The
brand-new `ForgotPasswordView.swift` compiled with no `project.pbxproj` edit (synchronized folder group —
reconfirms the converged lesson).

**Warnings (both pre-existing, not from this change):** (1) `LoginView.swift:20` deprecated
`NavigationLink(destination:isActive:)` — that's the legacy program-picker link, NOT my new closure-form
`NavigationLink { }`; (2) the known `CFBundleVersion` app-extension mismatch (widget target). No new
warnings from the added file.

**Lesson.** When a screen's warning fires on a *line* you didn't touch, check it against the diff before
"fixing" — `XcodeListNavigatorIssues` reports the file/line but not authorship; here the fresh-vitality
deprecation was legacy code the build just re-surfaced.

---

## Run 66 — bulk-add card + duplicate-rejection (2026-06-30)

**Context.** Ported the web Bulk-add card to the iOS Summary tab (new `BulkAddWorkoutDetailView` multi-row
form, `BulkAddWorkoutCard`, `SummaryCardType.bulkAdd`, `AdminSummaryTab` wiring + role gate) and added a
new `APIClient.addWorkoutLogsBatch` (with `BulkWorkoutEntry`/`BulkRowError`/`BulkWorkoutResult`/
`BulkWorkoutError` DTOs). Made `APIClient.refreshAccessTokenIfPossible()` non-private so the extension can
retry a 401.

**Build:** `mcp__xcode__BuildProject(tabIdentifier: "windowtab1")` → **built successfully, 0 errors, ~18s**
on the first attempt. Structured issues (`XcodeListNavigatorIssues`, severity=warning, globbed to the 5
touched files) returned only the pre-existing widget `CFBundleVersion` mismatch warning — nothing from
these changes.

**Confirmed / promoted to Converged lessons:**
- Real tool names pinned: `BuildProject`, `XcodeListNavigatorIssues`, `GetBuildLog`, `XcodeListWindows` —
  all take `tabIdentifier` (`windowtab1`). No scheme/destination arg needed.
- The brand-new Swift file compiled with **no manual `project.pbxproj` edit** — the synchronized folder
  group picks up new files in the open Xcode automatically.
- MCP build through open Xcode sidesteps the raw-CLI `actool`/CoreSimulator failure (confirmed again).

---

## Run 0 — skill created (2026-06-30)

**Context.** Created alongside the iOS foundation-scaffold run (PROGRESS Phase 4, run 50). The user wants
the native Xcode MCP used for **compilation/build verification** throughout the iOS build — efficiently,
without screenshots or simulator spin-up (the user runs the simulator + visual checks himself). The skill
is LIVING: we refine it as we actually use the MCP, starting the next session.

**Set up this run:**
- Registered the `xcode` MCP server in `.mcp.json` (stdio: `xcrun mcpbridge`, present at
  `/Applications/Xcode.app/Contents/Developer/usr/bin/mcpbridge`, Xcode 26.5 ✓).
- Updated `CLAUDE.md` §MCP Servers (added the `xcode` bridge; native-only, no community XcodeBuildMCP) and
  §Skills (added `ios-build`).
- Decided **native-only**: the community XcodeBuildMCP (~80 tools, simulator control) is rejected for token
  cost + because the user doesn't want simulator automation from us.

**Not yet validated (do next session, first real use):**
- The `xcode` MCP tools are NOT active until a session restart (servers load at session start). First task
  next session: confirm the tools appear, PIN their exact names in the SKILL's Converged lessons.
- Confirm the open-Xcode MCP build avoids the raw-CLI `actool`/CoreSimulator runtime failure documented in
  `apps/ios/CONTEXT.md` §Toolchain note.
- Record the exact build invocation (scheme `RaSi-Fiters-App` + any destination the MCP wants).

**Open question to resolve on first use:** does the native bridge build the whole scheme (app + Widgets
extension) and return per-file structured diagnostics as expected? If diagnostics are sparse, see whether a
specific "list navigator issues" tool must be called after the build tool.
