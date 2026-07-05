---
name: ios-build
description: The iOS compile-check loop for apps/ios via the native `xcode` MCP (xcrun mcpbridge) — build the open Xcode project, read STRUCTURED compiler diagnostics, fix, rebuild until clean. Compile-only by design — NO screenshots, NO simulator boot (the user runs the simulator + visual checks himself). Use after porting/editing any iOS screen, or on "build the ios app", "does it compile", "check the ios build", /ios-build. LIVING — append LESSONS_ARCHIVE.md every run.
---

# ios-build — the iOS compile-check loop (native `xcode` MCP)

The iOS analogue of the web `npm run build ✓` gate. After porting or editing anything in `apps/ios`,
verify it **compiles cleanly** through the Apple-native Xcode MCP — then hand off to the user for the
visual/simulator run. We do **not** take screenshots or boot simulators; that's the user's job and it's
slow + token-heavy. Our loop is: **build → read structured diagnostics → fix → rebuild → report clean.**

## Why the MCP (not raw `xcodebuild`)
On this Mac the raw CLI build is blocked by an Xcode-install quirk (stale CoreSimulator service can't
expose the iOS 26.5 simulator runtime → `actool` asset-catalog failure; see `apps/ios/CONTEXT.md`
§Toolchain note). The **native bridge builds the already-open Xcode instance**, which manages SDKs/runtimes
itself and sidesteps that — and returns **structured** issues (file/line/severity as data, not a wall of
log text), so fixes are precise and token-cheap. Raw `xcodebuild` stays the fallback ONLY if the MCP is
unavailable AND the CoreSimulator issue has been cleared (reboot).

## Trigger
"build the ios app", "does it compile", "check the ios build", "verify the ios build", after porting an
iOS screen/feature, or `/ios-build`. Whenever `apps/ios/**` Swift changed and you need a compile gate.

## Prereqs (tell the user if not met)
1. **Xcode is open** with `apps/ios/RaSi-Fiters-App.xcodeproj` (the native bridge drives the running
   instance — a closed Xcode = no tools / empty results).
2. **External agents enabled:** Xcode → **Settings → Intelligence → Model Context Protocol →
   "Allow external agents to use Xcode tools"** = ON. One-time.
3. The `xcode` MCP server is registered in `.mcp.json` (done 2026-06-30) and **active this session** —
   MCP servers load at session start, so a freshly-added server only appears next session.

## Workflow
1. **Confirm the `xcode` MCP tools are live.** They're deferred — discover them via ToolSearch
   (`select:` or keyword "xcode build"). The native bridge exposes ~20 tools; the build + diagnostics ones
   are what we use. **PIN the exact tool names in "Converged lessons" on first connect** (the doc names them
   loosely — e.g. a build tool like `XcodeBuild`/`BuildProject`, a structured-issues tool like
   `XcodeListNavigatorIssues`; confirm the real names from the live tool list and record them here).
   If the tools are absent → the server isn't active yet (restart session) or Xcode isn't open/permitted →
   say so; do NOT silently fall back to a screenshot/simulator path.
2. **Build** the `RaSi-Fiters-App` scheme via the MCP build tool. Don't request a run/launch — build only.
3. **Read structured diagnostics.** Pull the issues list (errors first, then warnings). Report concisely:
   `N errors, M warnings` + the error file:line:message — NOT the raw build log.
4. **Fix → rebuild** in a tight loop until **0 errors**. Warnings: surface them, fix only the ones our
   change introduced (don't chase pre-existing legacy warnings unless asked).
5. **Report clean + hand off.** "Compiles clean (0 errors). Run it in the simulator when you want — visual
   check is yours." Do not boot the simulator or screenshot.

## Scope of our verification (what "good" means here)
The backend is already proven (live, web uses it). For iOS we are verifying the port is **wired + adapted**,
not re-validating business logic:
- **Compiles** (this skill's core).
- **Wired to our stack** — points at the new Render API (`APIConfig.renderBaseURL =
  rasifiters-api.onrender.com/api`), Supabase-token auth path.
- **Parity with web** — the ported screen + the net-new pages (auth: forgot/reset-password equivalents, the
  small extra functionalities) match the web app's behavior/contract 1:1. Cross-check against the web SPECs
  (`specs/pages/web/**`) when a behavior is ambiguous. Flag divergences; don't "improve" silently.
The user owns the visual/runtime confirmation in the simulator.

## Hard rules
- **NO screenshots, NO `simctl boot`/run, NO simulator automation from us.** Compile-only. (User preference,
  2026-06-30 — memory `ios-user-verifies-builds-visually`.)
- **Native `xcode` MCP only** — do NOT add/community XcodeBuildMCP (token-heavy, simulator-centric).
- Keep diagnostics **structured + concise** — never paste raw multi-thousand-line build logs into context.
- A green compile is the gate to commit an iOS change (mirrors web's `npm run build ✓`); the user's visual
  run is a separate confirmation, not a commit blocker.

## Converged lessons (durable — fold new patterns here as they recur)
- **Tool names (confirmed live):** build = `mcp__xcode__BuildProject`, structured issues =
  `mcp__xcode__XcodeListNavigatorIssues` (filter by `severity`/`glob`/`pattern`), raw log =
  `mcp__xcode__GetBuildLog`. All require a **`tabIdentifier`** — get it from
  `mcp__xcode__XcodeListWindows` first. **The tab id varies per session** (seen `windowtab1` and
  `windowtab2`) — always fetch it fresh, never hardcode.
- **Invocation:** `BuildProject(tabIdentifier: <fresh id>)` — no scheme/destination arg needed; it builds
  the open instance and returns `{buildResult, elapsedTime, errors[], fullLogPath}`. ~18–44s clean.
- **Open-Xcode path avoids the `actool`/CoreSimulator issue** — the MCP build through the running Xcode
  builds clean where raw `xcodebuild` (simulator destination) fails. Confirmed.
- **MCP-absent fallback that works (run 75):** when the `xcode` tools aren't in the session (server not
  loaded / Xcode closed), `xcodebuild -project RaSi-Fiters-App.xcodeproj -scheme RaSi-Fiters-App
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` compiles clean — the **device**
  destination sidesteps the CoreSimulator/actool quirk (it's simulator-runtime-specific). No reboot needed.
  Gate on exit code + `BUILD SUCCEEDED`; run in background (~2–4 min, slower than the MCP's incremental).
- **New `.swift` files** added under the `apps/ios` synchronized folder group are picked up by the open
  Xcode automatically — `BuildProject` compiled a brand-new file (BulkAddWorkoutDetailView.swift) with no
  manual project.pbxproj edit needed.
- **Known pre-existing warning (ignore):** ValidateEmbeddedBinary "CFBundleVersion of an app extension
  ('25') must match … parent app ('40')" — a widget-target version mismatch, unrelated to Swift changes.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append the
new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons"; keep this
`SKILL.md` lean.
