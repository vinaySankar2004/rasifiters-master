# Phase 3 track R2 — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Phase 3 R2, health sync v2 backend (one batch endpoint, permanent sample ledger, per-field provenance, server sync state, migration 009)

- **Features**:
  - **NEW `health-sync`@0.1.0** (proposed owner of the v2 client contract). SPEC: specs/features/health-sync/SPEC.md (to create). consumed_by `[]` until the bundled iOS/Android releases, following the observability precedent; then `[ios, android]`. depends_on [auth, programs, program-memberships, workouts, workout-logs, daily-health-logs, observability]. No existing feature has a backend reference impl for sync: apple-health and health-connect are client-only.
  - daily-health-logs@0.2.1 (SPEC: specs/features/daily-health-logs/SPEC.md) · consumed_by [web, ios, android]. Gains the provenance columns.
  - workout-logs@0.5.1 (SPEC: specs/features/workout-logs/SPEC.md) · consumed_by [web, ios, android]. v2 will add to and subtract from `workout_logs` rows. D-C9 `on_duplicate:"sum"` stays untouched.
  - observability@0.1.1 (SPEC: specs/features/observability/SPEC.md) · consumed_by []. Register the `sync.*` event type(s) in §8.
  - Context only, not bumped in this commit: apple-health@0.7.0 [ios] and health-connect@0.2.0 [android]. Both get bumped later with the client releases.
- **Pages/screens**: ios/apple-health (specs/pages/ios/apple-health/SPEC.md) and android/health-connect (specs/pages/android/health-connect/SPEC.md). Context only, not touched by this track. No web page.
- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/009_health_sync_ledger.sql — NEW. Schema-neutral. Contents:
    - The sample ledger table, the per-member+program sync-state table, and `ALTER TABLE daily_health_logs ADD COLUMN IF NOT EXISTS sleep_source, steps_source` (nullable).
    - `SET lock_timeout='5s'`.
    - RLS on for the `public` copy only (the 007 DO-block).
    - When `current_schema()='staging'`: explicit `GRANT SELECT, INSERT, UPDATE, DELETE … TO rasifiters_staging`, plus the 008 §5 RLS-off loop.
    - A trailing read-only verification query.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/HealthSyncSample.js — NEW. Ledger model. Do not register it in models/index.js; follow the AppEvent precedent of requiring it directly.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/HealthSyncState.js — NEW. Model for the server-remembered state: review done once, last successful sync. Not registered in index.js either.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/healthSync.js — NEW, thin routes:
    - `POST` batch (one call per run, per-item results, never 409).
    - `GET` state.
    - `PUT` state (review done).
    - Imports `authenticateToken` and `rateLimit` without editing them. Errors are `{error, code}` using the frontend-kit vocabulary.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/healthSyncService.js — NEW. Validates the batch: item cap, kind, dates via `isValidDateString`, value ranges. Then it runs:
    - One membership query and one program-lock query for all program ids, with no N+1. Per-item `skipped_locked` / `skipped_not_member`. The routes/logs.js `requireDataEntryAllowed` middleware is not exported and would 403 the whole request, so it can't be reused here.
    - One transaction with `SET LOCAL statement_timeout` as the explicit I/O timeout.
    - The state read/write.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/healthSyncWorkouts.js — NEW. The workout apply path:
    - Ledger `INSERT … ON CONFLICT DO NOTHING RETURNING` keeps concurrent runs safe; only newly inserted samples add minutes.
    - Cross-source overlap rule, the 12 h single-workout skip, and the 1,440 min/day synced cap.
    - Aggregated `workout_logs` increments.
    - Deletion = subtract the ledger value, floored at 0.
    - Legacy "already sent" import = record in the ledger with no change to totals.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/healthSyncDaily.js — NEW. Sleep/steps set semantics plus `sleep_source` / `steps_source`. An unchanged value means no write; this replaces the POST→409→PUT round trip.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/DailyHealthLog.js — add the `sleep_source` and `steps_source` attributes (open question 11).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/logService.js — export `resolveProgramWorkout` (:81-116, no behavior change). Optional edit (open question 10): clear `<field>_source` on manual writes at :549-552, :703-718 and :888-893. The old endpoints' status codes and bodies must not change. Evidence for the plan's "where it comes from" section:
    - **The 409s:** `addDailyHealthLog` returns 409 on an existing row (:544-547; route routes/logs.js:103-112). The clients then send `PUT` (routes/logs.js:140-149).
      - iOS: `APIClient+DailyHealth.swift:61-77,120-135` on a rolling 14-day window (`HealthKitService+Sleep.swift:21,47-69`, `+Steps.swift:20,47-82`) with hourly background delivery (`+Sleep.swift:144`, `+Steps.swift:103`).
      - Android: `HealthSyncController.kt:698-744` over `HealthConnectManager.kt:125-141,180-205`.
      - Result: one 409 per (day × program × flow) per run. iOS is at least 99% of the volume (W3 P1/P2).
    - **The double counts:**
      - The sum path adds minutes with `COALESCE(duration,0)+N` (:192-210). The only idempotency is a client ledger that holds just `uuid|programId → ymd` and is pruned at 45 days (`HealthKitAppliedLedger.swift:16,44-53`; `HealthStore.kt:145-147,168`).
      - iOS discards deletions (`HealthKitService.swift:76`) and groups by (type, start day) across all sources (:146-166).
      - Android re-reads everything since the connect date when its token expires (`HealthConnectManager.kt:80-83`), drops deletions (:86) and reads only one page (:94-99).
      - Runaway durations get through because the backend accepts any positive integer (:126-130); prod has 3,466 and 3,482 minute rows (W3 P7).
    - **How v2 removes them:** no POST-then-409; per-sample server dedup on (member, program, source, sample_id), kept permanently; deletions propagated; overlap rule plus duration bounds.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js — one `require` plus one append-only `app.use("/api/health-sync", …)` after :110. This file is shared with R1/R3; see Blast radius.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md — add the 009 row and update the staging verify count (currently "15 (14 + app_events…)", +2 tables).
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md — an "Added (Phase 3 R2)" bullet.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/health-sync/SPEC.md — NEW. Holds the exact v2 contract for the iOS (HealthKit) and Android (Health Connect) plans: routes, request/response JSON, the per-item result enum, statuses and codes, headers (§4.1 `X-App-*`), bounds, the catch-up rule (since `last_success_at`, capped at 30 d), resume-after-re-sign-in, review-once, and the legacy import.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json and /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md — add the `health-sync` entry and the version bumps.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/daily-health-logs/SPEC.md — 0.3.0: provenance columns, a new D-rule, changelog.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/workout-logs/SPEC.md — 0.5.2 PATCH: a cross-reference saying `workout_logs` is also written by health-sync v2; D-C9 is kept for old builds.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md — 0.1.2 PATCH: register `sync.run` and its props in §8 (trigger, per-kind counts sent/applied/duplicate/skipped/removed, outcome, duration_ms, error_class, catch_up_days; no PII).
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/plans/phase-3-r2-sync/ — the planner's brief, plan and verdict.
  - web/ — none.
  - ios/ — none. Bundled client release, planned later against the contract in health-sync/SPEC.md.
  - android/ — none. Same.
- **DB surface**: one migration, apps/backend/sql/009_health_sync_ledger.sql, run by the user.
  - **Ledger columns:** member_id, program_id, source, sample_id, kind (CHECK workout|sleep|steps), value, log_date, program_workout_id (nullable; the row a workout was summed into), start_at/end_at (nullable; for the overlap check), status, applied_at, deleted_at.
  - **Ledger keys and indexes:**
    - UNIQUE (member_id, program_id, source, sample_id).
    - Index (member_id, sample_id), because deletions arrive with no source.
    - Index (member_id, program_id, kind, log_date) for the day-cap and overlap checks.
    - FKs: members ON DELETE CASCADE, and (program_id, member_id) → program_memberships ON DELETE CASCADE. These mirror `workout_logs`; account deletion relies on the FK cascade (`cascadeMemberDeletion` destroys the member row), and leaving a program sets status `removed`, so rows remain.
  - **State table:** key = member + program (+ kind/integration, open question 2), `review_done_at`, `last_success_at`.
  - **Run order:** staging first (`SET search_path TO staging`, session pooler on port 5432 only), then public, then the backend deploy. Staging is mandatory here because this is a migration.
  - **Writes:** `workout_logs`, `daily_health_logs`. **Read-only:** programs, program_memberships, program_workouts, workouts_library.
- **Flags/env/config involved**: no new env var, Render env change, Supabase setting or console step.
  - Code constants: item cap, 720 min, 1,440 min/day, 30-day cap, and a per-member limiter via `utils/rateLimit.js` `keyFn`.
  - The statement timeout is set per transaction. Leave config/database.js alone: it has no timeout today and it is shared.
  - Testing:
    - **Staging (opt-in, migration only):** apply 009 to staging, deploy to `rasifiters-api-staging` (wake it first), then a curl smoke as a `+stg` account. Cases: replay → `duplicate`; delete → subtract; cross-source overlap → skip; >12 h → skip; day cap; legacy import leaves totals unchanged; sleep/steps set plus provenance; state GET/PUT; old POST→409→PUT and `on_duplicate:"sum"` unchanged.
    - **Prod (user-run smoke):** a regression check of the old endpoints plus a v2 batch on a testbed program; confirm the route and status in the request log.
- **Blast radius**:
  - Dependents of daily-health-logs: analytics, member-analytics, apple-health, health-connect, frontend-kit.
  - Dependents of workout-logs: daily-health-logs, analytics, analytics-v2, member-analytics, apple-health, health-connect, frontend-kit. All of these only read the data.
  - `DailyHealthLog.findAll` / `sum` in analyticsService.js:346,407-408 and memberAnalyticsService.js:115 will select the new model attributes, so **009 must run before the deploy** or every analytics screen returns 500.
  - Surfaces to keep in parity: ios + android (one contract). Web is unaffected.
  - **Cross-track risks:**
    - server.js mount: append-only after :110. A larger router-local body parser would have to sit above :78 and would skip the version gate at :93.
    - middleware/auth.js, models/index.js, errorHandler: import only, no edits.
    - observability SPEC §8 and its version bump: R1 adds `auth.*` events in the same section.
    - sql/README.md: R3 adds a row for 010 and changes the same staging count.
    - registry.json, REGISTRY.md and backend CONTEXT.md: R1 and R3 edit them too. Keep all of these edits append-only.
- **Live-binary compat**: the backend contract change is additive: new routes and nullable columns. Old POST→409→PUT, `on_duplicate:"sum"`, and 400/403/404-means-skip are untouched for iOS 1.4.0–1.4.3 (54–57) and Android 1.0.0 (3)/(4).
  - If the model attributes are added, the old POST/PUT `/daily-health-logs` responses gain 2 null keys. All decoders ignore unknown keys (Android Network.kt:24 `ignoreUnknownKeys`).
  - Deploy order: 009 (staging, then public) → backend (staging, then prod) → later client releases.
  - Old builds keep producing the 409s and double sums until the bundled release and the version gate. A member running an old and a new build at the same time can still double count; this is accepted (no shims).
- **Doc↔code mismatches found**:
  - W3 cites `HealthKitService.swift:77` for the discarded deletions; the actual line is :76.
  - apple-health SPEC §3b lists launch/foreground triggers for steps; W3 found steps runs only on its observer, connect and Sync Now (`AppRootView.swift:49-54,94-99`).
  - health-connect SPEC §3 doesn't mention that only the first page is read or that deletions are ignored.
  - apple-health and health-connect §4, F3 and §10 ("no server preference table / no provenance column") go stale with R2. Fix them in the client bumps.
  - The sql/README staging count is stale.
  - config/database.js has no explicit DB timeout (a CLAUDE.md standard; pre-existing).
  - Not checked against the live DB schema; the planner may run a read-only column check.
- **Out of scope (explicitly)**:
  - All client code: HealthKit launch registration and background tasks, Android permissions, Auto Backup and paging, catch-up logic, review UI.
  - Enforcing the program date window (D-S5) on the server.
  - Exposing provenance in `GET /daily-health-logs` or analytics.
  - Android background sync (D-6).
  - Retiring the old endpoints or `on_duplicate:"sum"`.
  - The `tools/` query pack.
  - Server-side `app_events` for sync.
  - R1/R3 work, raising the version gate, a testbed refresh.
- **Open questions for the orchestrator**:
  1. Contract owner: a new `health-sync` feature (recommended) or folding it into daily-health-logs + workout-logs?
  2. In task item (e), what does "source" mean: the integration and kind (`healthkit` / `health_connect`) or the origin app's bundle id? Should the state key include kind and integration? Today review (D-CONF) is per flow per program.
  3. Sleep/steps are day totals with no single Health sample id. Proposal: a deterministic `sample_id = "<kind>:<YYYY-MM-DD>"` per source, with set semantics. Also confirm v2 keeps F5: synced values overwrite manual sleep/steps. The server can't tell manual values from old-build synced ones (both have a null source).
  4. Workout items need fields beyond the task's list: `workout_name` (the mapped library name) and `start_at` / `end_at` (needed for the overlap check). Make them required?
  5. Deletions arrive as an id only (HK `deletedObjects`, HC `DeletionChange`), so lookup is by (member, sample_id) across programs. When a row's minutes reach 0, delete it or keep it at 0?
  6. Overlap: first-applied wins? Any threshold for partial overlap? If the winning sample is later deleted, should the skipped one be applied? (Recommend no.)
  7. Day cap: skip or clamp the item that crosses 1,440 minutes (recommend skip)? Per program, synced minutes only?
  8. Legacy import: the device ledger holds only `uuid|programId → ymd`. Either the client re-reads samples by UUID to send value, type and source, or the server records value null (a later deletion then subtracts nothing). Use `legacy:true` items on the same route, or a separate route?
  9. Body size: stay within the global 100 kb parser with about 200 items, where oversize gets a 500 via errorHandler (observability F2)? Or mount a router-local parser before server.js:78? Should items carry `program_ids[]` (≤20) so a 30-day catch-up fits in one call?
  10. Should the old manual write paths clear `<field>_source`?
  11. Add the model attributes, or write provenance with raw SQL in v2 only so old response bodies stay byte-identical?
  12. A per-member rate limit on the sync route? If so, what numbers?
  13. v2 is self-only (member = the token's member). Confirm.
  14. Coordinate the observability SPEC §8 edits and its version bump with R1.
