---
name: health-check
description: Periodic ICM doc-health cross-review — a read-only audit of rasifiters-master's docs for factual drift, redundancy (single-source-of-truth violations), and genuine structural decay, plus doc↔code consistency (registry↔SPEC↔tag sync, reference_impl paths exist, schema ownership, manifest↔code). STRICT by design — restructuring is proposed only when REALLY needed; the healthy result is "no action". Runs as a standalone task in a fresh session, ends with a graded report via plan mode (no auto-apply). Optionally scoped to ONE app (web · backend · ios). NOT the per-feature `audit` skill. Trigger — "health check", "doc health", "icm health", "cross-review the docs", "/health-check". LIVING — append LESSONS_ARCHIVE.md every run.
---

# Health Check — ICM doc-health cross-review (LIVING)

> A periodic, **read-only** cross-review of this repo's documentation. It catches what
> normal per-change discipline misses over time: stale facts, the same fact duplicated
> across docs, broken cross-references, and structural decay. It is **strict** — verbosity
> is not a finding, and restructuring is proposed only when it clears a high bar (below).
> A run that finds only 🔴 drift fixes and zero structural proposals is a *healthy* run.
>
> This is NOT the `audit` skill. `audit` diffs ONE feature across apps (drift reconcile);
> `health-check` audits the WHOLE doc corpus for hygiene + doc↔code consistency. See
> `../audit/SKILL.md` and the repo's `METHODOLOGY.md` (concern→skill map) if present.

## Trigger
"health check", "doc health", "icm health", "cross-review the docs", "/health-check", or any
time the user wants a periodic ICM-health pass. Usually invoked in a FRESH session as a task
on its own.

## Where to run
From a session rooted at `rasifiters-master/`. Read-only across the whole repo's docs (any top-level
`ICM.md`, `METHODOLOGY.md`, `CLAUDE.md`, `ENV_RUNBOOK.md`, `COVERAGE.md`, `specs/features/**`,
`apps/**`, `.claude/skills/**`) + the code paths the docs reference. The repo is **standalone** — the
original app it was rebuilt from is archived and is NOT a reference; each SPEC's `Provenance` header records
where it was ported from, as history. reference_impl paths (registry.json) resolve against `apps/<app>/`.

## Scope
- **Default = whole repo** (all apps — web, backend, ios — all features, top-level + skill docs).
- **App-scoped** (user names an app, e.g. "health check web"): restrict to that app's
  `apps/<app>/**` PLUS the shared docs those touch (registry rows, the feature
  SPECs the app consumes, the page SPECs under `specs/pages/<app>/**`, the routing-table row). State the
  resolved scope back to the user before starting.

## Prereqs
- This is an AUDIT, not an edit session. **Strictly read-only** — touch nothing but the plan.
- Use the session's current date (from the system reminder); skills can't call `Date.now()`.
- If a single-source-of-truth contract exists (a METHODOLOGY.md "Where each fact lives" table), it is
  the yardstick for redundancy findings — re-read it first. If the repo has no such table yet (early
  scaffold), treat the per-app `CONTEXT.md` / registry as the canonical home and flag the missing
  SoT table itself as a 🔵 candidate.

## Operating mode (read-only → plan)
End the run by presenting the graded report as a **plan via `ExitPlanMode`** — never auto-apply.
Approved fixes are carried out afterward through the normal edit + commit flow. If the session is not
already in plan mode, behave as if it is (no writes).

## Workflow
1. **Resolve scope** (whole-repo vs one app). Echo it back.
2. **Build the doc inventory.** Fan out up to 3 `Explore` agents in parallel to map the doc
   tree in scope (top-level, `specs/features/**`, `apps/**`, `.claude/skills/**`) and return a
   file→purpose→line-count inventory. Re-read any load-bearing doc yourself before asserting a
   finding on it (Explore summaries go stale — verify file:line at report time).
3. **Run the check catalog** (below) over the inventory. Every finding MUST cite `file:line`
   evidence and the canonical home (from the SoT table) where relevant.
4. **Grade each finding** by severity (🔴 / 🟡 / 🔵, below).
5. **Apply the strictness bar** to any 🔵 restructuring candidate. Default verdict is *leave it*.
   Drop anything that doesn't clear all four gates.
6. **Present report + plan** via `ExitPlanMode`: findings grouped by severity, each with
   evidence + the exact remediation (file:line → change). Note which approved-but-unresolved
   items should fold into ICM.md's "Open follow-ups" (if such a doc exists). Stop. Do not apply.

## Check catalog

**A. Factual drift / breakage (🔴 — objective, always reported):**
| Check | How |
|-------|-----|
| Registry↔SPEC↔tag sync | each `registry.json` `version` == the SPEC's top §12 version == a `git tag -l "feature/<f>@*"` tag; REGISTRY.md cell matches |
| `reference_impl.paths` exist | every path a SPEC's reference_impl names resolves to a real, non-empty file under `apps/<web|backend|ios>/` |
| Dependency graph closure | `A depends_on B` ⇒ `B.consumed_by` includes A (both halves written) |
| Schema-ownership uniqueness | each table claimed by exactly one feature SPEC (no two claim the same; none unclaimed) |
| Manifest↔code | every feature in a `PROGRESS.md` maps to real code/routes in that app |
| Status progression | statuses only advance 📄→🏗️→🚀; a 🚀 has a matching CONTEXT.md milestone |
| Self-referencing range headers | e.g. "Decisions log (R1 → Rn)" header matches the actual last entry; "N runs" counts; feature counts |
| Broken cross-references | every `path/to/file` or skill/feature reference in a doc resolves |
| Routing/skill-index consistency | ICM.md routing table ↔ `apps/**`; the skill lists in ICM.md + METHODOLOGY concern-map + CLAUDE.md all name the same skill set |

**B. Redundancy / overlap (🟡 — reported with canonical home named):**
| Check | How |
|-------|-----|
| Single-source-of-truth violation | the same fact maintained in ≥2 docs where the SoT table says one is canonical → propose: keep canonical, replace the copy with a pointer |
| Drift-prone duplication | values likely to change (IDs, env vars, ports, version numbers, Supabase/Vercel/Render refs) restated outside their canonical CONTEXT.md/registry |
| Volatile-doc log accumulation | a volatile doc (`ICM.md` Open follow-ups, any current-state list) still carries struck `DONE` entries past one pass, or un-struck items whose work is clearly shipped → propose pruning, gated on the doc blast-radius check (outcome lives in its canonical home) |

**C. Structural decay (🔵 — only past the strict bar, often zero per run):**
| Check | How |
|-------|-----|
| Layer-model violation | a fact living at the wrong ICM layer (e.g. operational how-to leaking into METHODOLOGY, "why" leaking into a skill) |
| Homeless fact | a recurring fact with no canonical home in the SoT table → propose where it should live |

## Strictness bar (the whole point — be critical)
Propose a 🔵 restructuring ONLY if **ALL FOUR** hold; otherwise the verdict is *leave it*:
1. **Evidence of harm or recurrence** — it has caused (or will demonstrably cause) a reader to
   act on wrong info or fail to find a fact, OR the issue recurs across ≥2 docs.
2. **Maps to a methodology violation** — a concrete breach of the layer model or SoT table, not
   "could be tidier" / "is long".
3. **Net-clearer, not lateral** — the fix removes lines or removes ambiguity; reshuffling that
   trades one shape for an equivalent one is rejected.
4. **Every moved fact has a destination** — no orphaning; name the target home for each.

Hard rules: **verbosity alone is NEVER a finding** — a long doc is fine if every line earns its
place. Do not invent work. If a run yields only 🔴/🟡 and no 🔵, say so plainly — that is the
expected healthy outcome.

## Severity grades
- 🔴 **Drift** — docs assert something false or a reference is broken. Objective; always reported.
- 🟡 **Redundancy** — a fact maintained in 2+ places (drift risk). Report + name the canonical home.
- 🔵 **Restructuring** — only past the strictness bar. Expect zero on a healthy run.

## Output contract
A single plan (via `ExitPlanMode`) with: the resolved scope; findings grouped 🔴/🟡/🔵 each with
`file:line` evidence + exact remediation; a one-line health verdict ("N drift, M redundancy, K
structural — overall healthy / needs attention"); and which items, if approved, fold into ICM.md
"Open follow-ups". No files written. No fixes applied.

## Converged lessons (durable — the patterns that recur, project-agnostic)
- The SoT table (when it exists) is the yardstick for every 🟡 finding — cite it. Until one exists in
  this scaffold, the per-app `CONTEXT.md` / registry is the canonical home and the missing table is
  itself a 🔵 candidate.
- Re-read the load-bearing doc at report time; Explore inventories go stale.
- A clean run (only 🔴 fixes, no 🔵) is the goal, not a failure — resist manufacturing structure work.
- **Version sync = §12 top + registry `version`; NO version folders.** SPECs live flat at
  `specs/features/<feature>/SPEC.md` (no `<version>/` segment) and keep the full changelog inside the SPEC.
  The real invariant is `registry.version` == the SPEC **§12 Changelog top entry** == the highest
  `feature/<f>@*` git tag. Ignore "max-semver-in-file" comparisons (they catch prose cross-refs to other
  features' versions) — Explore inventory agents tend to raise these as bogus alarms.
- **A SPEC's line-3 `Version:` prose header is a DISTINCT drift class from the sync invariant** — it can lag
  while the invariant above (changelog top == registry == tag) is perfectly in sync. Before flagging a
  "version mismatch", check the changelog top: if it agrees with registry+tag, this is a one-token
  header-field fix, NOT a sync break. (Run 2: `workouts` header 0.1.0 vs synced 0.1.1; `apple-health` header
  0.3.0 vs synced 0.5.0.)
- **After a fast build sprint, check the orientation docs first.** A burst of runs (e.g. iOS runs 50→74 in
  ~2 days) predictably freezes the L1 map (`ICM.md`) + the lowest-churn `CONTEXT.md` §Status ("Next: port
  X…"), while the append-only logs (SPEC changelogs, registry, git tags) stay correct. Staleness concentrates
  in the human-written current-state prose, not the mechanical records.
- **reference_impl.paths (registry.json) are rasifiters-app paths** — they resolve in
  `apps/<web|backend|ios>/` (the repo's own code). The original app is archived/detached and is NOT a
  reference. SPEC `Provenance` headers name the archived original as history (past-tense prose, not a live
  path) — don't flag those as broken references. A feature's `consumed_by` may name a single client (web- or
  ios-only), so don't flag a feature as broken just because it isn't wired into both clients.
- **registry.json — prefer a surgical string Edit over a JSON round-trip.** `json.dumps(d, indent=2)` does
  NOT round-trip byte-identical here: the file uses compact inline arrays (`["web", "ios"]`) that `indent=2`
  expands to multi-line, producing a large spurious diff. For a single-field change, edit the unique target
  string directly (e.g. `"app": "ios-mobile"` → `"ios"`); only script a patch when the target string repeats.
- **The living skills' "Distilled from N runs" headers are a recurring drift class** — they lag their
  LESSONS_ARCHIVE run counts. Always recompute against `grep -cE "^#+ +Run [0-9]+"` (heading-anchored;
  unanchored grep catches prose) and check the count vs the max run index.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:**
append the run (date, scope, counts by severity, what was proposed vs accepted, any false
positive to suppress next time) to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into
"Converged lessons"; keep this `SKILL.md` lean.
