# PLAN VERDICT — OBJECTIONS (3)

All three objections are ADVISORY. I found nothing blocking.

1. **[ADVISORY] Step 26's web gate `npm run lint` is not a real lint check.**
   - Evidence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web` has no ESLint config. There is no `.eslintrc*`, no `eslintConfig` key in `package.json`, and none in any parent directory. `package.json` only lists `eslint` and `eslint-config-next` as dependencies.
   - `next lint` 14.2.5 therefore runs its first-time setup. `node_modules/next/dist/lib/eslint/runLintCheck.js:279` opens an interactive prompt, `:304` writes a default config (`writeDefaultConfig`), and the same branch installs any missing packages.
   - The prompt (`compiled/cli-select`) calls `setRawMode(true)` with no TTY check.
   - Failure scenario:
     - In the agent's non-TTY shell, `setRawMode` throws. The error is caught, `next lint` returns null, and nothing is linted, so the gate looks green without checking anything.
     - If the user runs it in a real terminal, choosing "Strict" writes `apps/web/.eslintrc.json` and may change `package.json` / `package-lock.json`. Those files are outside the brief.
   - Fix: drop `&& npm run lint`. `next build` already type-checks.

2. **[ADVISORY] The stash before the Vercel CLI fallback lists only the SEO files.**
   - Evidence: the risk section names 7 SEO paths. The plan also says touch-ups (a) and (d) are being worked on separately at the same time. (a) includes web inbox × / clear-all and needs a new backend delete route.
   - Failure scenario: (a)'s web edits are uncommitted in the tree when (c) falls back to `vercel --prod --yes --scope personal-vinayak`. The CLI uploads the working tree, so half-built (a) web code goes to prod before (a)'s backend route exists, and prod inbox actions break.
   - Fix: after the stash, require `git status --porcelain -- apps/web` to be empty, and abort the CLI deploy if it is not. A clean `git worktree` checkout of the pushed commit also works. Either is safer than a hand-written path list.

3. **[ADVISORY] Docs step 17 leaves one stale line in the web profile SPEC.**
   - Evidence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/web/program/profile/SPEC.md:59` reads ``| Header | `PageHeader` "My Profile" + Back → `/program` or `/programs`. | profile/page.tsx:111-112 |``.
   - Step 17 rewrites the §3 "Leaves to" line to say Back returns to the opener, including `/summary`. The §4 row still says otherwise, and its anchor is also wrong: the real `PageHeader` is at `profile/page.tsx:265`.
   - Failure scenario: the next health-check finds §3 and §4 contradicting each other.
   - Fix: change the row to "Back (`router.back()`) → the opener; `backHref` = no-history fallback", with the anchor `profile/page.tsx` (`PageHeader`).

**What I checked and found clean:**
- **Code anchors are all current:**
  - web: `summary/page.tsx` :56 / :228 / :400-422, `program/page.tsx` :43 / :133-135.
  - iOS: `SummaryCards.swift` :25-38, `StandardProgramTab.swift` :14-22 / :43-56, `AdminSummaryTab.swift` :46, `AdminProgramTab.swift` :22.
  - Android: `SummaryScreen.kt` :54 / :72 / :118 / :214-236, `ProgramScreen.kt` :47 / :108 / :222-244.
- **Other callers:** none. iOS `SummaryHeader(` has only the 2 callers. Web `SummaryHeader` is local. Android `Header` is private, with 1 caller per file and no previews.
- **Android:**
  - The `tapTarget` import path is correct.
  - `onNavigate` is in scope in both screens.
  - `PROGRAM_PROFILE` is in `SHELL_FORMS` / `ROOT_FORMS` (`RootScreen.kt:361,367`).
  - `BackHandler` is enabled only on the main tabs.
  - `MyProfileScreen` has no `BackHandler` of its own.
- **iOS:**
  - `programContext.loggedInUserInitials` exists (`ProgramContext.swift:366`) and is driven by `@Published loggedInUserName`, which a rename updates (`ProgramContext+Members.swift:431-439`).
  - `adminName` / `adminInitials` have no other readers.
  - `MyProfileView` needs only `programContext`.
  - The admin variant pushes on the outer stack; the standard variant pushes on its own stack. Both match the existing My Account row.
  - `xcrun swiftc -parse` on the 4 iOS files is clean today. It does flag `EdgeSwipeToReturn.swift:83` ("'=' must have consistent whitespace"), so the plan's (d) precondition is correct.
- **Web:**
  - Tailwind is 3.4 (preflight gives buttons a pointer cursor, no padding or background), so the look is unchanged.
  - No fixed overlay sits over the circle.
  - `BackButton` uses `router.back()`.
- **No other circles:** Members and Lifestyle headers use action icons, not initials, so the scope causes no inconsistency.
- **Versions and contracts:**
  - No `reference_impl` in `registry.json` matches any touched path, so no feature bump.
  - iOS is at 1.5.2 (60) and Android at 1.2.0 (7) in the repo.
  - No backend change, so the live binaries are unaffected.
- **Docs:** `D-PC1` is unused elsewhere in `specs/`. The SPEC, REGISTRY and HANDOFF anchors (REGISTRY :22/:43/:46/:69/:84/:90/:125/:143/:146; HANDOFF :79-80) and the changelog formats all match.