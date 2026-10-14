# audit — Lessons Archive

Purpose: append one entry per `audit` run (what feature, what divergences found, what was reconciled).
Promote converged, durable checks into the skill's `SKILL.md`; keep this as the full history.

_No runs yet — fresh ICM repo (scaffolded for RaSi Fiters)._

- **2026-10-13 — Privacy destination drift (found by the user, not an audit).** Web's account-menu Privacy row opened
  the in-app `/program/privacy` duplicate; iOS / Android (and web Support) open the public `rasifiters.com` page.
  Reconciled by converging web to the common destination (privacy-policy D-ONE: duplicate deleted, 308 redirect).
  Promoted: parity checks link destinations, not just row presence.
