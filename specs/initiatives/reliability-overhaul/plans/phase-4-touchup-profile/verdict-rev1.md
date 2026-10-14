# PLAN VERDICT: OBJECTIONS (3)

1. **[BLOCKING] The iOS compile check in step 26 cannot pass as written.** The working tree already holds touch-up (d)'s uncommitted edit to `EdgeSwipeToReturn.swift`, and that edit is a hard compile error. This plan forbids touching the file and gives no rule for what to do about it.
   - Evidence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Components/EdgeSwipeToReturn.swift:83` reads `let root =(recognizer.view?.window ?? …)`.
   - `xcrun swiftc -parse` on that file fails with `83:28: error: '=' must have consistent whitespace on both sides`. `git diff` shows the edit is the (d) `isCommitted` work-in-progress.
   - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/ios-typecheck.sh` type-checks every `.swift` file under `RaSi-Fiters-App`, so it will report this error. The user's ⌘B will fail on it too.
   - The web endgame has a rule ("a failure in another file: report it, don't fix it"). The iOS endgame has none. The ios-build loop is "Claude fixes the reported errors, repeat".
   - Failure scenario: implementer I applies steps 4–7 and runs `ios-typecheck.sh`, which exits non-zero on `EdgeSwipeToReturn.swift`. The implementer then either:
     - edits the (d)-owned file (out of scope, and it collides with (d)'s pending commit), or
     - stalls with a red gate.
   - The user's tests of edge-swipe-back from My Profile also need this file to compile.
   - Fix: make (d) correct line 83 (`let root = (`) before (c)'s iOS gate runs. Or add the same rule as web: "a typecheck/⌘B error in a file outside the 4 iOS files: report it to the orchestrator, do not fix it". Also note that the 1.5.2 (60) ⌘B waits on (d).

2. **[ADVISORY] Two iOS SPEC rows are rewritten but keep stale line anchors.**
   - Step 19 rewrites both Header rows and keeps the old anchors:
     - `AdminProgramTab.swift:14-19`: the `SummaryHeader` call is actually at :18-23.
     - `StandardProgramTab.swift:31-55`: the header is :32-57 today, and it grows by about 8 lines after step 7.
   - The web rows were fixed (anchors switched to symbol names), so the iOS rows are inconsistent with them.
   - Failure scenario: the next health-check flags drift in rows this run just wrote.
   - Fix: use symbol anchors in both rows (`AdminProgramTab.swift` (`SummaryHeader` call) and `StandardProgramTab.swift` (header `HStack`)).

3. **[ADVISORY] The OQ1 switch leaves dead code and changes one fallback silently.**
   - After steps 5–6, nothing reads `ProgramContext.adminInitials` (`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext.swift:329`). `adminName` only feeds `adminInitials`, plus the writes in `ProgramContext+Auth.swift:43,126,129`. Both become dead, and neither the plan nor D-PC1 says so.
   - The nil-name fallback also changes. With no stored name, `loggedInUserInitials` returns `"?"` (:366-368), where `adminName` defaulted to `"Admin"` and showed "A".
   - Not worth a scope expansion tonight. Add one clause to the admin-summary D-PC1 row: "`adminInitials`/`adminName` now unused (left in place); a missing name shows `?`".

**What was checked and holds up:**
- **Anchors:** every code anchor cited in steps 1–14 matches the files exactly. Doc anchors were spot-checked in all 9 page SPECs, all 9 REGISTRY.md rows and the HANDOFF (c) item; they match.
- **Consumers:**
  - The iOS `SummaryHeader` has only 2 callers, both covered.
  - Web `SummaryHeader` and the Android `Header`s are file-private.
  - Members and Lifestyle have no initials circle on any surface (web members :301 and Android `GlassIconButton` are action buttons), so the change creates no inconsistency between tabs.
- **No feature bump:** none of the 8 code files is a `reference_impl` path in `specs/features/registry.json`. Page bumps follow the git-version page-SPEC rule.
- **Back behavior on each surface:**
  - Web: `BackButton` falls back to `router.back()` when history is longer than 1, and the bottom nav is hidden on `/program/profile`.
  - iOS: the admin variant pushes on the outer stack, where `AdminHomeView`'s `@State selectedTab` survives. The standard variant pushes on the tab's own stack. Once compiling, the edge swipe pops one level on both stacks.
  - Android: `PROGRAM_PROFILE` is an inner-NavHost route, `BackHandler` is enabled only on the 4 tabs, and `PROGRAM_PROFILE` is in `SHELL_FORMS`.
- **Initials refresh after a rename:** `loggedInUserName` is `@Published` (iOS), `_memberName` is a StateFlow (Android), and web uses `updateUser`.
- **Look and tap target:**
  - Web is on Tailwind 3.4, where buttons get a pointer cursor, and no global `button` CSS overrides the classes.
  - Android: `tapTarget`'s 48 dp minimum is a no-op at 52 dp, so the circle looks the same.
  - iOS: these are ScrollView links, not List rows, so the `.dismissKeyboardOnTap()` gotcha does not apply.
- **Backend and live binaries:** no backend, contract or migration change, so no live binary is affected.
- **Deploy hygiene:** the SEO work-in-progress is handled with explicit-path staging and a stash before any CLI deploy.