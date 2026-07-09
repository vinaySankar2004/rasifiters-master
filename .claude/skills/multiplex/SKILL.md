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
- **No staging, no test suites.** The automated gate is **compile-check** (backend boot check ·
  web `npm run build` · android `./gradlew :app:assembleDebug` · ios via the `xcode` MCP). The
  **user does all visual/live testing on prod** — you push, they test. That's fine and expected.
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
4. **Compile-check gate** (replaces staging): confirm every touched surface builds — backend
   boot check, web `npm run build`, android `./gradlew :app:assembleDebug`. iOS compile runs via
   the `xcode` MCP (Xcode open, user-side) or is flagged user-run. **No further verify step** —
   the user tests the live behavior on prod after the push.
5. **Close** — orchestrator merges worktrees, runs `git-version` (feature bump + registry +
   REGISTRY.md + SPEC §11/§12 changelog + tag), pushes, deploys (backend → Render FIRST, then web
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
- (seeded 2026-07-09) The gate is compile-check, not staging: no staging env + no test suites
  here. Confirm each surface builds, then the USER tests on prod. Never guess-green the iOS
  compile — it needs the `xcode` MCP with Xcode open (user-side); flag it UNVERIFIED if you can't
  drive it. Backend deploys first + degrades gracefully for the live binary.
