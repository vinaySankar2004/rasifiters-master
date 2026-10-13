# Phase 3 track R2 — plan-adversary verdict

# PLAN VERDICT — OBJECTIONS (7): 1 blocking, 6 advisory

Most of the plan holds up. I transcribed the plan's 009, both models, all three services and the router into a scratch copy of `apps/backend`. I ran them against a throwaway local Postgres 17 (base schema from 008's tables, plus the staging schema and role from 008), with the session-scoped scratch folder cleaned up afterwards. Results:

- **Migration 009:** runs twice per schema with no errors and no duplicate CHECK constraints. The last row is `staging|t|t|2|5|f|t` and `public|t|t|2|5|t|f`, exactly as the plan expects.
- **Staging smoke (S1–S13):** every result matches the plan's expectations, and so do the three SQL checks.
- **E1 route stack:** prints exactly `blockUnversionedAndroid | post /batch | get /state | put /state | <anonymous>`.
- **Two identical batches sent at the same time:** one returns `created`, the other `duplicate`. The per-member advisory lock works.

The objections are mostly about the client contract and the endgame.

1. **[BLOCKING] The upgrade path adds old-build workouts again when they are older than the 45-day device ledger.**
   - Evidence, Android: W4 F3 (`discovery/W4-android-health-sync.md:16-17,88`). The changes token expires after 30 days unused, or while a lock/retry holds it. An expired token re-reads everything since the connect date (`HealthConnectManager.kt:80-83`, confirmed). The device ledger keeps only 45 days (`HealthStore.kt:168`).
   - Evidence, iOS: W3 F7 and F10 (`W3-ios-health-sync.md:111,114`). A selected program that was left or hasn't started yet holds the anchor forever, and the ledger is pruned at 45 days.
   - The plan's contract leaves this open:
     - §8 rule 9 says "Keep the existing anchor / changes token".
     - §8 rule 4 says "No `last_success_at` → the client's first-sync rule (today: workouts from the connect date)".
     - On the first new-build run `last_success_at` never exists, because the state table is new.
   - This breaks board §4 item 4, which says the upgrade uploads the "already sent" list "so nothing the old build summed is added again".
   - Failure scenario:
     1. An Android 1.0.0 user (Play production) hasn't opened the app for 35 days and has a program whose window goes back to July.
     2. They upgrade. Rule 9 uploads ledger entries from the last 45 days or less as `legacy`.
     3. The workout token has expired and there's no `last_success_at`, so the app re-reads from the connect date.
     4. Every sample older than 45 days is not in the server ledger, so it goes up as an `add`, comes back `created`/`updated`, and its minutes are counted a second time. The same happens on iOS with a held anchor older than 45 days.
   - Fix (contract text in §8 rules 4 and 9): on the upgrade run, if the kept anchor or token is expired, or older than the old ledger's 45-day horizon:
     - discard it and read workouts from today − 30 d, sending samples found in the old ledger as `legacy`;
     - never use the "since connect date" rule while an old-build ledger existed.

     Older never-applied samples are deliberately dropped; that is the safe direction.

2. **[ADVISORY] The upgrade doesn't carry over the old review state (D-CONF), so every upgrading user sees the first-sync review again.**
   - Rule 6 shows the review unless the server has `review_done_at`, and at upgrade the server has nothing. W4:156 says "Upgrades must migrate `rasi.health` state (token, ledger, confirmed/excluded keys)". Board §4.7 says the review shows once.
   - Rule 9 should also say:
     - send `PUT /state review_done:true` for every (program, kind) in the old `confirmedProgramIds` (iOS `healthkit[.sleep/.steps].confirmedProgramIds`; Android the `hc.*` equivalents);
     - keep honoring the local `excludedKeys`, which the server has no record of.

3. **[ADVISORY] `PUT /state` can lose `review_done_at` when two writes overlap.**
   - `HealthSyncState.applyUpdates` reads the row first, then the upsert writes `review_done_at = EXCLUDED.review_done_at` from that stale read. `putState` takes no lock.
   - Reproduced on PG17 with the plan's code: concurrent `{review_done:true}` and `{sync_success:true}` for the same key left `review_done_at` NULL in 5 of 5 tries.
   - Scenario: two HealthKit devices (iPhone and iPad), or a client that doesn't wait for the review PUT before the end-of-run PUT. The review comes back.
   - Fix: take the same `pg_advisory_xact_lock(hashtextextended('health_sync:'||member))` in `putState`, or make the conflict path keep each column unless its own flag is set.

4. **[ADVISORY] E1's pass criteria fail a correct implementation.**
   - The plan expects "7 `??` and 10 ` M`". The real split is **8** new (`009`, the 2 models, the route, 3 services, `specs/features/health-sync/SPEC.md`) and **9** modified (`logService.js`, `server.js`, `sql/README.md`, `CONTEXT.md`, 3 SPECs, `registry.json`, `REGISTRY.md`).
   - I checked that `git status --short -- <file in an untracked dir>` prints one `??` line for that file.

5. **[ADVISORY] The `health-sync` `depends_on` (step 16) leaves out `workouts` and `program-workouts`.**
   - `LOOKUP_SQL` reads `workouts_library` and `program_workouts`, and `resolveProgramWorkout` creates `program_workouts` rows.
   - The brief listed `workouts`. Without both edges, a change to either feature won't show health-sync in its blast radius (same rule as the R3 verdict's objection #2).

6. **[ADVISORY] The plan doesn't say which checkout the implementer works in.**
   - E1 runs `cd …/rasifiters-master/apps/backend`, and E2 assumes R1/R3 hunks are mixed into the same working tree. But the multiplex skill (`SKILL.md` §3) gives parallel implementers `isolation:"worktree"`, and the R3 plan uses a worktree (R3 verdict #1, blocking).
   - If the orchestrator puts R2 in a worktree, E1 checks the main checkout, where the new files are missing (ENOENT), and the absolute step paths write into main.
   - Fix: state "R2 edits the main checkout, no worktree", or give a literal worktree path plus a `node_modules` symlink.

7. **[ADVISORY] Smaller points:**
   - **Provenance goes stale after a manual edit.** The plan accepts this as F3/F7: a manual PUT leaves `sleep_source='healthkit'` on a value the user typed, so the column can't show the "mix manual and synced" state that board §4.6 describes. It is announced, so not a hidden change. Clearing `<field>_source` on the old write paths with an extra UPDATE wouldn't change any response body.
   - **`sync.run` `error_class` (§8.1) leaves out `updateRequired`,** even though 426 is a documented status for these routes.
   - **The prod smoke P9 leaves `review_done_at` set for zoe.chen** (healthkit / Winter Reset / sleep). That hides the review when the bundled client release is later tested on that account. Add a P9b with `review_done:false`.

**What I checked and found clean:**
- Every cited anchor is current: `server.js:29/76`, `logService.js:924-935` and the 126-130/192-216/544-547 evidence, `routes/logs.js:103-112/140-149`, `HealthKitService.swift:77` (W3's line is right), daily-health-logs :3/14-19/166/253/291/293/304/309, workout-logs :3/247-248/283/305, observability :3/211/245, `registry.json:474`, `REGISTRY.md:30/102`, `sql/README.md:20`, `CONTEXT.md:24`.
- Live binaries are unaffected: no raw SQL reads `daily_health_logs`, and Sequelize returns only model attributes, so old response bodies stay byte-identical.
- The router's parser and error handler match `clientEvents.js`. Mounting before the gate is handled by the router's own `blockUnversionedAndroid`.
- The deploy isolation and tag steps (E2/E4/E7) and the staging script's expected values are consistent.
- Web has no consumers, and R3's brief edits only shared files append-only.

**Files:**
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/discovery/W4-android-health-sync.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/discovery/W3-ios-health-sync.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/health/HealthConnectManager.kt`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/plans/phase-3-r3-push/verdict.md`
- `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/skills/multiplex/SKILL.md`
