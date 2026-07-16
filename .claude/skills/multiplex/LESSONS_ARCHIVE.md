# multiplex — Lessons Archive

Full run-by-run history for the `multiplex` skill (not auto-loaded; see `SKILL.md` for the
distilled "Converged lessons"). Append one entry per notable run.

## Entry template
- **Run N (YYYY-MM-DD) — task:** <one line>.
  - Shape: <single-surface | parallel per-surface [which]> · rounds: plan-adv <n>, impl-adv <n>.
  - What worked / what broke: <…>.
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs
- **Run 2 (2026-07-15) — task: member-analytics 0.4.0 D-C7 — Active Days ⇄ Workouts primary-stat swap
  (hero, subtitle, tile order, default sort, top-performer) on backend + web + ios + android.** Shape:
  **parallel per-surface** [backend+shared-docs · web · ios · android] in the main tree (directory-disjoint,
  no worktrees — Run 1 pattern held); rounds: plan-adv 1 (clean, 3 advisories, zero blocking → no revision
  round fired), impl-adv 1 (APPROVE, zero blocking). What worked: (1) assigning ALL shared docs (feature
  SPEC/registry.json/both REGISTRY.md) to the backend implementer kept the 4 fences disjoint with no
  file touched twice; (2) scout's key insight — "top performer = `members[0]` of the server-sorted
  response" — collapsed the feared client-side ranking hunt to a one-param flip per client; (3) resolving the
  plan-adversary's advisory reconciles (stale `member-analytics 0.2.0` refs) INTO the implementer prompts
  avoided a second doc round; (4) two-push backend-first deploy (Run 1 pattern): backend commit → Render
  `status: live` confirmed via MCP → clients+docs commit + tag → Vercel Ready in 49s. What broke / caught:
  plan cited `specs/pages/REGISTRY.md` but MISSED `specs/features/REGISTRY.md`'s version cell — caught at
  git-version time by the skill's own step-5 checklist, fixed inline pre-commit (planner gap: two REGISTRY.md
  files, only one in the brief). iOS compile UNVERIFIED again (xcode MCP absent for both subagents AND the
  orchestrator session) → flagged user-run; edits were enum-case/string/order-only, grep-verified symbols.
  New durable pattern promoted to Converged lessons: none (Run 1 patterns re-confirmed); note for scout:
  version bumps must enumerate BOTH registry surfaces (`specs/features/REGISTRY.md` + `specs/pages/REGISTRY.md`).
- **Run 1 (2026-07-10) — task: auth phase-2 link/unlink Google (+Apple iOS) + add-password in account
  settings (auth v0.9.0).** Shape: **parallel per-surface** [web · ios · android] after a **backend-first**
  shared-prereq; rounds: plan-adv 1 (revised once), impl-adv 1. **First full end-to-end run of the pipeline.**
  What worked: (1) `plan-pipeline` workflow burned the crux down cleanly — the scout's fear of a stranded
  second `auth.users` row was killed by the planner verifying `linkIdentityIdToken` in the installed
  `@supabase/auth-js@2.108.2`, so linking attaches to the caller's own user with NO email-match limit and
  `/oauth`'s 409 untouched. (2) The 4 surfaces have **disjoint file sets by directory** (backend / apps/web /
  apps/ios / apps/android), so the 3 client implementers ran **in parallel in the SAME main working tree
  (no worktrees needed)** — worktrees are only for same-file conflict risk, which directory-disjoint surfaces
  don't have; this made the merge/adversary/commit trivial (everything already in one tree). (3) Deferred the
  backend DEPLOY until AFTER impl-adversary blessed the whole diff, but kept backend-FIRST at deploy time via
  **two pushes** (backend commit+push → confirm Render route flips 404→401 → then git-version clients+push →
  Vercel). What broke / caught: plan-adv found 1 BLOCKING (Android `ProgramContext.kt` missing 4 `net.*`
  imports — the plan's "wildcard import" rationale was false) → implementer applied the fix; impl-adv found 2
  advisories (Android email row lacked `TextOverflow.Ellipsis` → orchestrator one-line fix + rebuild green;
  coarse client unlink guard = accepted, backend authoritative). iOS compile stayed UNVERIFIED (no xcode MCP
  headless) — flagged as the user's Xcode/TestFlight archive; thorough static review substituted. New durable
  pattern promoted to Converged lessons: **directory-disjoint surfaces parallelize in the main tree without
  worktrees; honor backend-first with two pushes, not two build phases.**
- **Run 0 (2026-07-09) — scaffolded.** Ported the pipeline from the higgins-master `multiplex`
  skill and adapted it to rasifiters: five roles (dropped Higgins' cross-company `porter` — this
  is one app on four surfaces, so cross-surface = parallel per-surface implementers + the `audit`
  skill), replaced the staging `verify` gate with **compile-check + user-tests-on-prod** (no
  staging, no test suites here), and made the scout brief + planner plan **per-surface** so shared
  features fan out across web/ios/android in parity. `plan-pipeline.js` workflow is a near-verbatim
  port (scout → planner → plan-adversary + one bounded revision). Built alongside a doc-health pass
  that first corrected `registry.json` `consumed_by` (Android was missing from 10 features) so the
  scout reads an accurate cross-surface graph. Not yet exercised on a real task.
