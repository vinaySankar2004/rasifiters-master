# health-check — Lessons Archive

Full run-by-run history for the `health-check` skill (not auto-loaded; see `SKILL.md` for the
distilled "Converged lessons"). Append one entry per run.

## Entry template
- **Run N (YYYY-MM-DD) — scope:** <whole-repo | product>.
  - Counts: 🔴 <n> · 🟡 <n> · 🔵 <n>.
  - Proposed → accepted: <summary>.
  - False positives to suppress next run: <…>.
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs

- **Run 1 (2026-06-30) — scope:** whole-repo. Ran as the acceptance gate of the legacy-detachment +
  doc-slim + repo-move cleanup pass (not a standalone session).
  - Counts: 🔴 4 · 🟡 0 · 🔵 0. (Healthy — only objective drift, no restructuring.)
  - Proposed → accepted (all fixed inline): (1) `auth` `reference_impl` listed `models/RefreshToken.js`,
    retired at R1 → removed from registry. (2) `ios-build` missing from the skill enumerations in `ICM.md`
    (×2) + the `METHODOLOGY.md` concern-map → added. (3+4) two ios page SPECs linked
    `../../../features/memberships/SPEC.md` (wrong slug) → fixed to `program-memberships`.
  - Also verified clean: registry↔REGISTRY↔git-tag version sync (28 tags), dependency-graph closure,
    reference_impl paths resolve under `apps/`, decisions-log range header (R1→R7) matches last entry.
  - False positives to suppress next run: none. The updated "reference_impl vs Provenance" converged
    lesson held — SPEC `Provenance` prose (archived-original breadcrumbs) was correctly NOT flagged.
  - New durable pattern promoted to Converged lessons: the registry `json.dumps` round-trip correction
    (compact inline arrays) + the reference_impl/Provenance detachment note (added during 4a).

- **Run 2 (2026-07-01) — scope:** whole-repo. Standalone session, run as the pre-TestFlight + pre-public-GitHub
  cleanup pass. 3 Explore agents (top-level/registry · iOS doc↔code · public-repo secrets) + direct re-read.
  - Counts: 🔴 4 · 🟡 1 · 🔵 0. (Healthy — narrative drift + one redundancy, no restructuring.)
  - Proposed → accepted (all applied): (1) `ICM.md` "`ios` not yet built (next surface)" → all-three-surfaces-built
    (iOS code-complete runs 50→74; the L1 map froze at the 2026-06-29 scaffold). (2) `apps/ios/CONTEXT.md` §Status
    frozen at run 51 ("Auth screens ported… build-green pending… Next: port ProgramPickerView") → code-complete.
    (3+4) two SPEC line-3 `Version:` headers lagged the §11 changelog+registry+tag — `workouts` 0.1.0→0.1.1,
    `apple-health` 0.3.0→0.5.0 (+ reordered apple-health's out-of-order changelog rows). (5, 🟡) per-app infra IDs
    (Vercel prj/team, Render srv) restated in root `CONTEXT.md` → replaced with pointers to `apps/<app>/CONTEXT.md`
    (canonical per the SoT table); Supabase project ref left in root (genuinely project-level). Plus user-directed
    public-repo prep: no tracked secrets (verified); contact emails kept as-is (user's call); cosmetic identifier
    anonymization (SETUP clone-URL owner → placeholder); PROGRESS/COVERAGE freshened.
  - False positive to suppress next run: **the SPEC line-3 `Version:` header lagging is NOT a registry↔tag sync
    break** — the §11 changelog top + `registry.json` + git tag were all correctly in sync (0.1.1 / 0.5.0); only
    the prose header field lagged. Verify the changelog top before flagging, and report it as a one-token
    header-field fix, not a version-sync failure. (Promoted to Converged lessons.)
  - New durable pattern promoted to Converged lessons: the header-field-vs-changelog distinction above; and that
    a fast build sprint (runs 50→74 over ~2 days) predictably freezes the L1 map (`ICM.md`) + the lowest-churn
    CONTEXT §Status while the append-only logs (SPEC changelogs, registry, tags) stay correct — check the
    orientation docs first after any sprint.
