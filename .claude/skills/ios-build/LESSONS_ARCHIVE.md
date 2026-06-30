# ios-build — Lessons Archive

Run-by-run history for the `ios-build` skill. Newest first. Promote durable patterns into the SKILL's
"Converged lessons"; keep this file as the full record.

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
