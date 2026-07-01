# ios-build — Lessons Archive

Run-by-run history for the `ios-build` skill. Newest first. Promote durable patterns into the SKILL's
"Converged lessons"; keep this file as the full record.

---

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
