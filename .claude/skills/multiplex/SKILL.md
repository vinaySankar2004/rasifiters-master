---
name: multiplex
description: Orchestrate rasifiters-master work through the role-agent pipeline — scout → plan → plan-adversary → USER APPROVES → implementer(s) → impl-adversary → compile-check → git-version → USER tests on prod. Use for nontrivial changes, anything touching 3+ files or 2+ surfaces, parallel workstreams, or when the user says "multiplex"/"pipeline this"/"fan out". LIVING — append LESSONS_ARCHIVE.md on notable runs.
---

# Multiplex — the ICM role-agent pipeline (rasifiters-master)

**Architecture: roles are agents, scope is data.** Five definitions in `.claude/agents/`
(scout, planner, plan-adversary, implementer, impl-adversary) — never create per-feature or
per-screen agents; feature quirks belong in that feature's SPEC (§9 Decisions). **The
orchestrator is the main session (you).** You dispatch, gate, commit, deploy.

This complements the ICM — it does not replace it. **The ICM stays the source of truth**
(`specs/`, `registry.json`, `PROGRESS.md`); the agents are built to *serve* it — scout reads
the manifests, planner obeys the SPEC D-rules, git-version writes the changelog back.

## The rasifiters shape (vs a generic pipeline)

- **One app, four surfaces** (`web`, `ios`, `android`, `backend`) — parity is the default.
  Cross-surface changes fan out as **parallel per-surface implementers** on disjoint file sets;
  the `audit` skill checks web↔ios↔android parity after. There is **no cross-company porter**.
- **No test suites; staging is opt-in.** The automated gate is **compile-check** (backend boot check ·
  web `npm run build` · android `./gradlew :app:assembleDebug` · ios = the user's ⌘B in Xcode). The
  **user does visual/live testing on prod** by default — you push, they test. Staging
  (`rasifiters-api-staging`, auth D-C13) is only for risky changes (migrations, auth/session): offer it
  when the risk justifies it, never as a default step.
- **Backend deploys first** and must degrade gracefully for the LIVE iOS/Android binary.

## The standard pipeline

1. **PLAN half (deterministic)** — run the saved workflow:
   `Workflow({name: "plan-pipeline", args: {task: "<task>"}})`
   → `{brief, plan, verdict, status}`. It scouts (per-surface file fence), plans, attacks, and
   does ONE bounded revision round on blocking objections.
2. **USER GATE** — present the plan + verdict to the user. No implementation before approval
   (ExitPlanMode when in plan mode; otherwise show and ask).
3. **BUILD half (orchestrated inline — deliberately NOT a workflow**, so you can gate, rerun fix
   rounds, and manage worktrees):
   - Single surface: spawn `implementer` (Agent tool) with the approved plan + brief.
   - Parallel surfaces: FIRST prove the per-surface file sets are DISJOINT (`comm -12` of each
     surface's `git diff --name-only` prediction), commit any shared prereq (e.g. the backend
     contract) FIRST, then spawn each per-surface `implementer` with `isolation: "worktree"`.
   - Then `impl-adversary` with plan + brief + report(s) + the tree path. It re-runs the
     compile-checks and sweeps parity. BLOCKING findings → implementer fix round (same tree) →
     re-review. Max 2 rounds, then escalate to the user.
4. **Compile-check gate**: confirm every touched surface builds — backend boot check, web
   `npm run build`, android `./gradlew :app:assembleDebug`. iOS compile = the user's ⌘B in Xcode
   (never call the `xcode` MCP build) — flagged user-run until they report it green. **No further
   verify step** — the user tests the live behavior on prod after the push (staging first only for a
   risky change).
5. **Close** — orchestrator merges worktrees, runs `git-version` (feature bump + registry +
   REGISTRY.md + SPEC §11 changelog + tag), pushes, deploys (backend → Render FIRST, then web
   → Vercel; the user ships the iOS/Android binaries), updates page specs if routes/screens moved.

## Briefing rules

- Scout output IS the briefing contract; planner/implementer prompts embed it verbatim.
- Never let an agent "look around" beyond its brief — that's what the fence rules and adversaries
  police. If a fence hit is reported, re-scout; don't hand-wave the file in.
- For shared features, the brief + plan MUST cover every surface in `consumed_by` — parity is the
  default; platform idiom (SwiftUI/Compose/React, APNs/FCM, HealthKit/Health Connect) is the only
  sanctioned divergence and must be a called-out D-rule.

## Partial use (small changes — use PARTS, not the whole pipeline)

The roles are à la carte. You do NOT need the full pipeline for small work:
- **Trivial edit** (1–2 files, mechanical, one surface): just do it inline + `git-version`.
- **Hand-wrote a change, want it checked**: spawn ONLY `impl-adversary` on your diff.
- **Unsure of the blast radius**: spawn ONLY `scout` to get a per-surface file fence, then decide.
- **Need a plan but trust yourself to build**: run `plan-pipeline`, take the plan, implement inline.
- **Parity check after a change**: use the `audit` skill (not an agent).

## When NOT to multiplex

Trivial edits (1–2 files), docs-only changes, and pure investigations — do those inline. The
full pipeline earns its overhead on multi-file features, cross-surface (parity) changes, and
anything you'd want adversarially checked before the user tests it on prod.

## Converged lessons

- (seeded 2026-07-09) Five roles, no porter: rasifiters is one app on four surfaces, so
  cross-surface = parallel per-surface implementers on disjoint file sets + the `audit` skill,
  not a cross-company port. The BUILD half stays orchestrator-driven because worktree lifecycle +
  user gates + fix loops don't fit a deterministic script.
- (seeded 2026-07-09; staging added 2026-10-12, opt-in for risky changes only) The gate is
  compile-check: no test suites here. Confirm each surface builds, then the USER tests on prod.
  Never guess-green the iOS compile — the user presses ⌘B (don't call the `xcode` MCP build); flag
  it UNVERIFIED until they report. Backend deploys first + degrades gracefully for the live binary.
- (Run 1, 2026-07-10) Directory-disjoint surfaces don't need worktrees: web/ios/android/backend
  live in separate `apps/**` trees, so parallel implementers editing disjoint directories in the
  SAME main working tree can't collide — skip the expensive worktree isolation (reserve it for
  same-file parallel edits) and the merge/adversary/commit is trivial (all changes already in one
  tree). Prove disjointness by directory up front.
- (Run 1, 2026-07-10) Honor backend-first at DEPLOY time, not build time, via TWO pushes: build +
  impl-adversary the whole cross-surface diff FIRST (deploy nothing), then commit+push backend →
  confirm it's live (a new route flips 404→401) → git-version the clients + push → web deploys.
  Deferring the deploy until after the adversary avoids shipping a contract the clients never
  validated against, while the two-push order still lands backend before web.
- (Run 3, 2026-10-13) Same-directory parallel tracks (three backend tracks in `apps/backend`) DO need
  worktrees. Agent worktrees branch from **origin/main, not local HEAD**: push the plan/amendment commit
  first, or have each implementer `git merge --ff-only <sha>` before coding. Dry-run conflicts early with
  `git merge-tree --write-tree A B`; land by cherry-pick in a fixed order (conflicts were docs/registry
  only); tag after the cherry-pick (new shas). Fix round = resume the SAME implementer (SendMessage) +
  `git commit --amend`; the orchestrator reads the small fix diff instead of a full re-review.
- (Run 3) A workflow "scribe" agent can't copy 100k+-char plans verbatim (it silently skipped one file,
  twice). Write brief/plan/verdict straight from the run's `journal.jsonl` with a script — byte-exact.
- (Run 3) Landing fast (user said "asap"): migrations first (staging, then public — additive, safe for the
  old code), ONE combined staging deploy, ONE prod push. Hard gates are read-only SQL/log checks the
  orchestrator runs; credentialed smokes stay user-run in the Terminal panel (zsh) and are read back with
  `read_terminal`. Staging infra ≠ prod (3 proxy hops vs 2), so IP-keyed checks can differ there.
- (Run 4, 2026-10-13) Parallel per-surface plans drift on shared behaviour that no per-track adversary sees: add ONE
  parity-check agent over all the plans (constants, copy, error mapping, teardown, event fields), then write ONE
  shared amendments file (user decisions + shared rules + per-track fixes) that every implementer applies on top of
  its plan. Shared docs stay out of implementer fences: each lists "Docs for the orchestrator"; a docs agent writes
  them once at landing.
- (Run 4) Directory-disjoint implementers in the main tree must run **no git writes**; the orchestrator commits each
  surface after its review + fix round, and ships it (web) without waiting for the slower surfaces. Fix rounds =
  resume the same implementer with the reviewer's list; the orchestrator spot-checks the fix diff + re-runs the compile.
