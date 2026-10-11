# W4 — Android Health Connect sync: Phase 0 discovery brief

> Read-only discovery, 2026-10-11. Code = repo `main` (health files last changed 2026-07-09, before the
> live Play build 1.0.0 (4) was cut, so this code is what's live). Member ids are truncated to 8 characters.

## 1. Summary

- **S3 CONFIRMED.** No background sync: `onTrigger()` has only foreground UI callers, no
  `READ_HEALTH_DATA_IN_BACKGROUND`, no worker/alarm/service; the Pixel shows 0 jobs and 0 alarms.
- **The "disconnect" is the 14-day window running out.** Unopened > 14 days → uncovered sleep/steps days
  are lost for good and the last-written day stays partial. Production shows it for two members (18-day
  gap → 3-day hole; 19-day gap → 4-day hole), first backfilled day exactly 14 days before the next open.
- **409s come from the daily-health upsert, by design.** Every run POSTs each window day per program;
  existing days get 409 then PUT. Workouts almost never 409. iOS does the same on hourly background wakes,
  so is probably the larger source (Render can't filter metrics by path to prove the split).
- **Latent Android-only double count.** A changes token expires after 30 days unused → re-read since the
  connect date, but the ledger keeps 45 days → older workouts re-sent with `on_duplicate:"sum"`.
- **Permission loss is silent.** Permission checks are never called; settings keeps saying "will sync
  automatically"; read failures don't set the failure caption.

## 2. How it works today (paths under `apps/android/app/src/main/`)

| Concern | Behavior | file:line |
|---|---|---|
| Permissions | Read-only `READ_EXERCISE`/`READ_SLEEP`/`READ_STEPS`. **No** `READ_HEALTH_DATA_IN_BACKGROUND`, **no** `READ_HEALTH_DATA_HISTORY` | `AndroidManifest.xml:10-12`; `HealthConnectManager.kt:35-40` |
| Request / re-check | HC permission contract → `enable*AfterPermission` (sets `connectMillis` once). `has*Permission()` exist but are **never called** | `HealthConnectSettingsScreen.kt:92-102`; `HealthSyncController.kt:109-117`; `HealthConnectManager.kt:52-54` |
| Triggers | Only callers of `onTrigger()`: sign-in/launch `LaunchedEffect(token)`, `ON_RESUME`, program entry | `RootScreen.kt:74`, `:94`; `AppScaffold.kt:93`; `HealthSyncController.kt:101-105` |
| Workouts read | No token → `readRecords` since connect date and mint a token. Otherwise drain `getChanges`. **Expired → full re-read since connect date** + fresh token. `readRecords` reads only the first page (`pageToken` ignored) | `HealthConnectManager.kt:66-92`, `:80-83`, `:94-99` |
| Workouts write | Per (type, day) × program inside the program window: POST `/api/workout-logs` with `on_duplicate:"sum"`, sending only samples not yet in the ledger. 200 = summed, 2xx = created, 409 = duplicate, 400/403/404 = skip, otherwise retryable | `HealthSyncController.kt:239-269`, `:675-696` |
| Token commit | Only when nothing was retryable **and** no lock was held. Otherwise the old token is kept and keeps aging | `HealthSyncController.kt:282`, `:551-558` |
| Ledger | `SharedPreferences "rasi.health"`, key `uuid\|programId`, pruned by **workout date > 45 days** at every sync start | `HealthStore.kt:19-20`, `:151-157`, `:168`; `HealthSyncController.kt:209` |
| Sleep / steps | Rolling **14 days** from start of day; no token. POST `/api/daily-health-logs`, and **on 409 → PUT** | `HealthConnectManager.kt:125-141`, `:180-205`; `HealthSyncController.kt:698-742` |
| Failure state | An HC read exception returns `Failed` **without** setting `lastSyncFailed` | `HealthSyncController.kt:214`, `:319`, `:409` |
| First-sync gate | Unconfirmed programs get a full-screen review. Back = defer, which **discards** the pending workout token | `HealthSyncConfirmationScreen.kt:74`; `HealthSyncController.kt:519-528`; `RootScreen.kt:125-131` |
| Sign-out | Every flow skips without a token. `clearSession` never resets `HealthStore` | `HealthSyncController.kt:200`, `:306`, `:396`; `ProgramContext.kt:1211-1243` |
| Backend | Workout collision with `sum` → `COALESCE(duration,0)+n`. Daily-health POST → 409 if a row exists | `apps/backend/services/logService.js:192-214`, `:545-547` |

## 3. Production and device evidence

**Pixel 7** (`adb -s 2C151FDH20037A`, read-only commands, run 2026-10-11 ~16:00 PDT):

| Command | Result |
|---|---|
| `dumpsys package com.app.rasifiters` | `versionCode=4`, `versionName=1.0.0`, installer `com.android.vending`, installed 2026-09-28. Health perms `granted=false` with **no `USER_SET` flag**, so they were never granted on this device. `androidx.work…SystemJobService` is enabled (WorkManager arrives transitively, from Glance) |
| `dumpsys jobscheduler \| grep -c "JOB #u0a291"` / `dumpsys alarm \| grep pkg` | **0 jobs, 0 alarms** |
| `dumpsys healthconnect` | App `Fitness: DECLARED`, `Contributed Data: false`; per-UID rate-limit quotas empty, meaning no recent HC calls |
| `am get-standby-bucket` / `dumpsys usagestats` | **40 (RARE)**; last used 2026-10-10 12:26; `lastJob` never |
| `appops get` (`RUN_ANY_IN_BACKGROUND`, `AUTO_REVOKE_PERMISSIONS_IF_UNUSED`), `cmd app_hibernation get-state`, `dumpsys deviceidle whitelist` | allow; default (auto-reset eligible); not hibernating; not whitelisted |
| `logcat -d` | Main buffer covers only 15:49–15:59 on 10-11; no app or HC lines |

**Conclusion:** the Pixel can't reproduce HC sync. It has never connected Health Connect.

**Render** (`get_metrics http_request_count`, grouped by status, daily, 2026-10-04 → 10-10): 409s were
929 / 690 / 678 / 1,207 / 685 / 471 / 569, against 9–35 201s per day. Filtering by path returned empty, so
409s can't be split by route.

**Supabase** (psql inside `BEGIN TRANSACTION READ ONLY`). Logs have no source column, so the surface is
inferred from `member_push_tokens.platform`: 15 android-only members, 11 iOS-only, 1 both.

- **60-day coverage, `daily_health_logs`:**

  | Member | Platform | Steps days | Median first-write lag | Distinct write days |
  |---|---|---|---|---|
  | 5025a03d | android | 34 | 114 h | 6 |
  | 255532ac | android | 32 | 76 h | 7 |
  | 9b89cbc0 | android+ios | 48 | 119 h | 8 |
  | 81230fec | android (opens daily) | 13 | 4 h | 18 |
  | 4698b34f / d57dad74 | ios | 58 / 57 | 7 / 8 h | 44 / 35 |

- **Gaps between write days, and holes in the steps dates:**
  - **5025a03d:** 08-20 → 09-07 (+18 d); 08-21–08-23 missing; 08-24 first created 09-07 (14 d back);
    08-20 last written same day (18:25 UTC), never finalized.
  - **9b89cbc0:** 09-03 → 09-22 (+19 d); 09-04–09-07 missing; 09-08 created 09-22.
  - **255532ac, 81230fec:** 4–5 missing days inside 6-day gaps — not window-explained (no HC source
    data / gate-excluded rows / failed run?); unverifiable here.
- **Workouts:** `workout_logs` with `updated_at > created_at + 1 min` (the sum path) = **0 for every
  Android member**, compared with 38 for one iOS member. Whether a workout came from HC or manual entry
  can't be told apart.
- **Rows inside the current 15-day window:** 4 Android members hold 25 steps + 28 sleep rows; the
  android+ios member 16 + 12; 6 iOS members 75 + 59. Each row produces one 409 per flow per run.

## 4. Failure modes

| # | Trigger → mechanism → symptom | Likelihood | Evidence |
|---|---|---|---|
| F1 | App not opened → no background path (§2 triggers) → nothing syncs; data arrives in bursts on open | Certain | Strong (code + device + DB lag) |
| F2 | Gap > 14 days → the window (`HealthConnectManager.kt:137`, `:192`) can't reach the older days → permanent sleep/steps holes, and the last-written day stays partial | High for occasional openers | **Strong (DB, 2 members, exact 14-day match)** |
| F3 | Token unused for 30 days, or held by a lock/retry (`:282`) → expired → re-read since connect date (`HealthConnectManager.kt:80-83`), while the ledger only covers 45 days (`HealthStore.kt:168`) → older workouts re-POSTed with `sum` (`HealthSyncController.kt:682`) → **minutes double-counted** | Medium (needs a long absence plus a program window reaching back more than 45 days) | Code only; not yet seen in 60 days |
| F4 | Permission revoked, auto-reset (appop default), reinstall, or an **Auto Backup restore** (`allowBackup="true"`, `AndroidManifest.xml:25`, no rules, so `rasi.health` is restored with a foreign token and no grants) → read throws → `Failed`, flag unchanged → UI still says "will sync automatically" (`HealthConnectSettingsScreen.kt:118`) | Medium | Code strong; device unverifiable |
| F5 | User dismisses the first-sync review → token discarded → the next `ON_RESUME` brings the full-screen review back | Medium ("resumes oddly") | Code |
| F6 | Logout, including any exception during refresh → `session.clear()` (`net/Network.kt:94`, `:117`) → sync silently skips until the user signs in again. HC state survives sign-out, so a different account on the same phone inherits it | Medium (overlaps W1/S9) | Code |
| F7 | Every run, sleep and steps each make 2 sequential round trips per (day × program) → about 60 requests per open for a 1-program user (plus 409 noise) → slow opens far from us-east | Certain | Code + Render 409 volume |
| F8 | Only the first `readRecords` page is read (`HealthConnectManager.kt:96-98`) → a full re-read after expiry could be truncated | Low | Code |

## 5. Suspect verdicts

- **S3 — CONFIRMED.** Manifest, code, and device all agree: no worker, no job, no alarm, no background
  permission. SPEC `health-connect` H-1 records this as a known deviation.
- **409 origin — mechanism CONFIRMED, per-platform split PARTIAL.**
  Source = daily-health POST→409→PUT on every sleep/steps run, both surfaces
  (`HealthSyncController.kt:705-716`, `:728-739`; iOS `APIClient+DailyHealth.swift:67-69`, `:126-127`);
  workouts 409 only on the delete race (`logService.js:211-214`). Android ≈ ≤53 409s per round of opens
  by all Android users; iOS holds 134 window rows and runs on hourly background wakes
  (`HealthKitService+Sleep.swift:144`, `+Steps.swift:103`) → likely the majority. Exact split needs
  request logs (W6).

## 6. Divergences from the iOS contract

- **Background:** iOS uses `HKObserverQuery` with background delivery — `.immediate` for workouts
  (`HealthKitService.swift:108`), hourly for sleep/steps. Android has none. Because of this, the 14-day
  window horizon rarely bites on iOS but bites on Android after any 14-day absence.
- **Anchor durability:** the iOS `HKAnchoredObjectQuery` anchor (`HealthKitService.swift:72`) doesn't
  expire. The HC changes token expires after 30 days unused. F3 exists only on Android, even though both
  surfaces share the 45-day ledger (`HealthKitAppliedLedger.swift:16`).
- **Permission visibility:** HealthKit hides read-auth status (iOS can't detect loss); Android can, but
  doesn't. Everything else (D-S5, D-CONF, D-LOCK, D-SUM, 14-day POST→409→PUT) was ported 1:1.

## 7. Industry-standard target (contract, not a plan)

1. **Background reads:**
   - Declare `android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND`.
   - Check `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` before using it.
   - Run a unique periodic WorkManager `CoroutineWorker`. The HC docs' example uses 1 h with
     `ExistingPeriodicWorkPolicy.KEEP`. If the permission is only partly granted, degrade gracefully;
     the docs say to "perform as many tasks as it can".
   - Keep the foreground triggers too. HC docs: "Apps can only read data … while they are in the
     foreground" unless background read is granted.
   - Expect standby-bucket throttling. Rare: "strict restrictions on … jobs"; Restricted: "jobs once per
     day in a 10-minute batched session" (developer.android.com/topic/performance/appstandby).
2. **Token lifecycle:** a token "expires within 30 days". On expiry, follow the docs' "most ideal" path:
   "re-read all data from the most recent timestamp or for the last 30 days. Then, dedupe … using
   identifiers". Dedup retention must cover at least the re-read horizon.
3. **Catch-up:** backfill since the last successful sync, capped at the 30-day history default, instead
   of a fixed 14 days.
4. **Permissions as live state:** call `getGrantedPermissions()` on every run, show a "reconnect" state,
   and exclude or validate sync state across Auto Backup restore.
5. **Uploads:** one idempotent, batched upsert per (member, program, date) sending only changed values
   (no 409-then-PUT); retries with backoff via the worker; resume after interruption (HC docs: "continue
   the next time the app is opened" — paginate `readRecords`).
6. **Observability:** record each sync run (trigger, counts, outcome, error class), for W6.

## 8. Live-binary constraints

- **What must keep working:** Play production 1.0.0 (4), plus testers possibly still on (3), run this
  exact code. The backend must keep:
  - daily-health POST returning **409** on an existing row;
  - the partial-update PUT;
  - `on_duplicate:"sum"` returning 200/201;
  - 400/403/404 meaning "skip".
- **The upsert trap:** if POST became a 2xx upsert, the old binaries would count every day as `CREATED`
  and post "Synced N days" notifications on every open (`HealthSyncController.kt:707`, `:382`, `:471`).
  iOS live builds would behave the same way. Any 409 reduction therefore has to be opt-in: a new field or
  endpoint that only new binaries send.
- **Background sync needs a new Android release** (versionCode ≥ 5) and an updated Play Console Health
  Connect permissions declaration for background read.
- **Upgrades must migrate `rasi.health` state** (token, ledger, confirmed/excluded keys), not reset it —
  a reset re-triggers the first-sync gate.

## 9. Open questions for the user

1. Which Android members actually have HC connected? No server-side provenance exists. Should sync runs
   or provenance be recorded?
2. Will you connect HC on the Pixel 7, with a source app writing to it, so it can serve as the test
   device?
3. What background cadence is acceptable (hourly vs. a few times a day), and is the extra Play
   background-read declaration OK?
4. Should catch-up reach past 14 days (since last sync, capped at 30), knowing it rewrites older days?
5. For dedup: should the server key on the HC sample id, or keep the client ledger with retention ≥ the
   re-read horizon?
6. Should sign-out reset health-sync state, to cover shared or switched phones?
7. Any reports from 255532ac / 81230fec about the 4–5-day holes that the window doesn't explain?
