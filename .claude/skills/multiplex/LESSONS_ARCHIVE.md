# multiplex — Lessons Archive

Full run-by-run history for the `multiplex` skill (not auto-loaded; see `SKILL.md` for the
distilled "Converged lessons"). Append one entry per notable run.

## Entry template
- **Run N (YYYY-MM-DD) — task:** <one line>.
  - Shape: <single-surface | parallel per-surface [which]> · rounds: plan-adv <n>, impl-adv <n>.
  - What worked / what broke: <…>.
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs
- **Run 0 (2026-07-09) — scaffolded.** Ported the pipeline from the higgins-master `multiplex`
  skill and adapted it to rasifiters: five roles (dropped Higgins' cross-company `porter` — this
  is one app on four surfaces, so cross-surface = parallel per-surface implementers + the `audit`
  skill), replaced the staging `verify` gate with **compile-check + user-tests-on-prod** (no
  staging, no test suites here), and made the scout brief + planner plan **per-surface** so shared
  features fan out across web/ios/android in parity. `plan-pipeline.js` workflow is a near-verbatim
  port (scout → planner → plan-adversary + one bounded revision). Built alongside a doc-health pass
  that first corrected `registry.json` `consumed_by` (Android was missing from 10 features) so the
  scout reads an accurate cross-surface graph. Not yet exercised on a real task.
