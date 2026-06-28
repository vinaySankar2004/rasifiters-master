---
name: audit
description: Web↔iOS parity audit — for a shared feature, diff how the web and iOS clients implement it against the same backend contract, classify every divergence, and report what to reconcile so the two clients stay 1:1. Read-only; ends with a plan, never auto-edits. Trigger: "audit parity for <feature>", "do web and ios match on <feature>", "check <feature> parity", /audit.
---

# Audit — web↔iOS parity check

> RaSi Fiters ships the same features across two clients — `web` (Next.js) and `ios` (SwiftUI) — on one
> shared Node/Express + Supabase backend. They *should* behave identically (same endpoints, same business
> rules, same role-based view rules), but can silently drift. This skill cross-diffs a shared feature
> across web + ios and flags what to reconcile. It is **read-only** and ends with a plan — it never edits.

Use this for a feature whose `consumed_by` is `[web, ios]`. Skip it for web-only / ios-only features
(nothing to compare). It is NOT a doc-health check (that's `health-check`) — this compares *behavior across
the two clients*, grounded in code + the feature spec.

## When to run
- After building a shared feature on the second client (e.g. you built `auth` on web, then on ios).
- Before cutover, as a parity sweep over all shared features.
- When a bug appears on one client but not the other.

## Workflow

1. **Load the contract.** Read `specs/features/<feature>/SPEC.md` (the shared truth) + the relevant
   `specs/pages/web/**` and `specs/pages/ios/**` specs. Note the backend endpoints the feature owns and
   the role-based view rules. This is the yardstick both clients are measured against.

2. **Map each client's implementation (read-only).** For `web`, find the components/hooks/api-calls under
   `apps/web/**`; for `ios`, the views/`ProgramContext` methods/`APIClient` calls under `apps/ios/**`.
   Fan out `Explore` agents per client if large, then verify the load-bearing files in full (cite
   `file:line` — never trust the map alone).

3. **Diff along fixed dimensions** (so nothing is missed):
   - **API usage** — same endpoints, params, payloads? (Both must match the backend contract.)
   - **Business rules** — same validation, computed values, edge-case handling?
   - **Role-based views** — does each role (global_admin / program admin / logger / member, +
     `admin_only_data_entry`) see/do the same on both clients?
   - **States** — loading / empty / error / offline / permission-denied handled the same?
   - **Data shown** — same fields, same formatting/units (durations, dates, sleep/diet scales)?

4. **Classify each divergence:**
   - `intentional-client-difference` — legitimate platform difference (e.g. iOS widget, web CSV export).
     Record it in the spec (§ flagged characteristics) so it's known, not flagged again.
   - `drift` — should match, silently diverged → reconcile.
   - `accidental-rewrite` — one client re-implemented logic that belongs in/behind the backend → pull back.
   - `one-side-more-correct` — one client matches the spec, the other doesn't → fix the other.
   - `spec-gap` — neither matches the spec, or the spec is silent → update the spec via `question-asker`.

5. **Report + plan.** Output a table (dimension · web · ios · classification · recommended fix), then end
   with a plan via `ExitPlanMode`. Never auto-apply. Reconciliation fixes are normal edits committed via
   `git-version`; spec gaps loop back through `question-asker`.

## Notes
- The **backend is the single contract** — when web and ios disagree, the backend + the feature spec
  decide who's right (usually: business logic belongs in the backend, both clients just call it).
- Living skill: keep this lean; append run notes to `LESSONS_ARCHIVE.md` and promote converged checks here.
