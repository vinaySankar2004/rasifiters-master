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
