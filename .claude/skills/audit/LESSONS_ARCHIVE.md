# audit — Lessons Archive

Purpose: append one entry per `audit` run (what feature, what divergences found, what was reconciled).
Promote converged, durable checks into the skill's `SKILL.md`; keep this as the full history.

_No runs yet — fresh ICM repo (scaffolded for RaSi Fiters)._

- **2026-10-13 — Privacy destination drift (found by the user, not an audit).** Web's account-menu Privacy row opened
  the in-app `/program/privacy` duplicate; iOS / Android (and web Support) open the public `rasifiters.com` page.
  Reconciled by converging web to the common destination (privacy-policy D-ONE: duplicate deleted, 308 redirect).
  Promoted: parity checks link destinations, not just row presence.
- **2026-10-14 — Program-card bar source drift (found by the user, not an audit).** Web + iOS `ProgramCard` bars were
  `active_members / total_members`, faithful to the legacy, but `getPrograms` counts both the same way (programs F2),
  so the bar was always full. Android read `progress_percent` (days in ÷ total days) from its first port (2026-07-08),
  and no one noticed the split: every page SPEC said only "a progress bar", and F2 already recorded the equality
  without naming the consequence. Reconciled by converging web + iOS to Android (pages D-BAR; programs 0.4.1 F2).
  Promoted: parity compares each measure's data source, not its look (+ a question-asker critic template).
- **2026-10-14 — Data-source parity sweep (all three surfaces, R9).** A read-only sweep (`plans/parity-sweep/`) found 30
  displayed values and the splits among them. Program progress came from three sources (web server, iOS device date math,
  Android mixed). PTD % used two denominators, and web dates read a day early west of UTC. Web log forms defaulted to
  the UTC "today", so evening logs got tomorrow's date. Four displays drifted on rounding: participation, daily average,
  duration and diet. Fixed on every surface (backend `41a69d4`, web `88ea9ff`, iOS `d6f569a`, Android `8144345`) via
  multiplex: planner → plan-adversary (2 blocking: PTD must count local days; a brace-dropping line range) → 4 parallel
  implementers → impl-adversary PASS. Promoted to Notes: "same source isn't enough — same rounding, denominator and day
  rule too".
