# multiplex — Lessons Archive

Full run-by-run history for the `multiplex` skill (not auto-loaded; see `SKILL.md` for the
distilled "Converged lessons"). Append one entry per notable run.

## Entry template
- **Run N (YYYY-MM-DD) — task:** <one line>.
  - Shape: <single-surface | parallel per-surface [which]> · rounds: plan-adv <n>, impl-adv <n>.
  - What worked / what broke: <…>.
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs
- **Run 6 (2026-10-13) — task: Phase 4 release touch-ups** (inbox remove one + Clear all on all four surfaces; the
  Summary/Program initials circle → My Profile on the three clients; plans in
  `specs/initiatives/reliability-overhaul/plans/phase-4-touchup-*`).
  - Shape: two `plan-pipeline` runs in parallel under one wrapper workflow (each revised once; both verdicts advisory)
    + a separate iOS back-swipe investigation and SEO audit → one `phase-4-touchup-amendments.md`, user-approved. Build:
    backend first, then ONE implementer per client surface carrying BOTH plans' steps for it; impl-adversary per
    surface; fix rounds by SendMessage to the same implementer.
  - What broke / caught: the iOS fix round (swipe-to-remove, one card open at a time, paging across removes) was
    complex enough that a diff spot-check wasn't trusted — a second impl-adversary pass reviewed it, and its one open
    risk ("the list jumps") became a device-checklist line that passed on TestFlight 60.
  - New durable pattern promoted to Converged lessons: parallel plan-pipelines under a wrapper → per-surface
    implementers carrying every plan's steps; re-review complex fix rounds.
- **Run 5 (2026-10-13) — task: reliability overhaul Phase 4** (Notifications + People + polish #1–#48, all four
  surfaces; plans in `specs/initiatives/reliability-overhaul/plans/phase-4-*`).
  - Shape: three **waves**, each user-approved with an amendments file — A (quick wins + privacy fix S0; small, urgent)
    was approved and built while B (Notifications + People: server, then web / iOS / Android clients) and C (polish
    #9–#45 per surface) were still planning. Per-surface client plans fed the server plans' API CONTRACT sections;
    one parity check per wave produced the binding `phase-4-{wave-a,np,polish}-amendments.md`. Versions and D-IDs in
    plans were provisional and assigned at each docs commit (`phase-4-np-amendments.md` §7). Implementers ran in the main tree on disjoint
    surfaces with no git writes; the orchestrator committed each surface after its review + fix round.
  - What broke / caught: the Notifications and People server tracks both edited `server.js` → the commit was split
    by staging a copy stripped of the other track's lines, so each commit boots on its own. Migration 012 had to run on
    both schemas before the People code was committed (the `Member` model reads `hide_activity` on every request).
  - New durable pattern promoted to Converged lessons: plan in waves; client plans → server contract; provisional
    IDs; split a shared-file commit by staging a stripped copy.
- **Run 4 (2026-10-13) — task: reliability overhaul Phase 3 client release** (web / iOS / Android; plans in
  `specs/initiatives/reliability-overhaul/plans/phase-3-c*`). Planning = one workflow: `plan-pipeline` per surface in
  parallel → low-effort summarizers → one **parity-check** agent over all three plans (19 agents, ~2 h). Every track
  revised once; the parity check found **8 blocking cross-surface mismatches** the per-track adversaries couldn't
  see (refresh constants, SSE values, Sign-out-everywhere placement + copy, push-tap behaviour, review-once,
  Disconnect semantics, forced sign-out message, web swallowing invite errors). The orchestrator folded them into
  ONE shared `phase-3-client-amendments.md` (user decisions U1–U3 + shared rules + per-track fixes) instead of three
  per-plan sections. Build: three implementers in the main tree with **no git writes**; the orchestrator committed
  each surface after its review + fix round; web shipped live while mobile was still building. Reviews: web 0
  blocking / 8 advisory, Android 1 blocking (banner padding) / 10, iOS 0 / 8 — all fixed in one resume round each.
  iOS ⌘B passed first try (62 files) after a reviewer's scratch `swiftc -typecheck`. A reviewer surfaced an infra gap
  (Supabase refresh-token reuse window 10 s vs the clients' 30 s backoff) → one settings change with the user's yes.
  Shared docs came from a separate docs agent fed the implementers' "Docs for the orchestrator" lists. Promoted:
  parity check after parallel per-surface plans; shared amendments file; no-git-writes implementers + per-surface
  commits; ship each surface when it's reviewed.
- **Run 3 (2026-10-11 → 13) — task: reliability overhaul Phases 1b, 2 and 3-backend** (BRIEF §7; plans in
  `specs/initiatives/reliability-overhaul/plans/`). Planning = a wrapper workflow running `plan-pipeline` per track in
  parallel + a scribe (1b: 1 track · 2: 4 tracks · 3: 3 tracks, ~18 agents). Every plan came back "revised-once" with
  ≤ 1 blocking objection left; the orchestrator folded the fixes in as an "Approval amendments" section the user
  approved. Build: Phase 2 tracks were directory-disjoint (main tree); Phase 3's three tracks all lived in
  `apps/backend`, so worktrees. What broke: (1) worktrees branched from origin/main (the pushed commit) and missed the
  local amendment commit — caught by the first implementer, the others were told to `ff` mid-run; (2) the scribe
  skipped writing a 2,000-line plan (Phase 2 A and Phase 3 R2) — recovered byte-exact from `journal.jsonl`; (3) R3's
  rate-limit smoke failed on staging only — staging has an extra proxy hop (`xff_n` 3) → `TRUST_PROXY_HOPS`. What
  worked: impl-adversaries found 0 blocking in R1/R3 and 1 doc-blocking in R2 (an iOS anchor-age rule the client
  can't evaluate); fix rounds by resuming each implementer + `--amend`; `git merge-tree` predicted the exact
  docs-only conflicts; one combined staging deploy + one prod push with read-only SQL hard gates (R3: the new column
  must exist on public before the push; R1: a 5-minute refresh STOP rule with a pre-written env rollback). Promoted:
  worktrees-from-origin, merge-tree + cherry-pick landing, journal-not-scribe, fast combined landing.
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
