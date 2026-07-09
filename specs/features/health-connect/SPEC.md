# Feature: `health-connect` — Health Connect (Samsung Health) workout + sleep auto-sync (Android)

> **Status:** 🏗️ built (`apps/android/` + existing backend endpoints) · **Version:** 0.1.0 ·
> **Apps (`consumed_by`):** `android`
> **Provenance:** the Android analog of the iOS [`apple-health`](../apple-health/SPEC.md) feature (0.6.0),
> re-expressed on **Health Connect** (`androidx.health.connect:connect-client`) instead of HealthKit.
> Same behavioral contract, same backend endpoints, same decision set (D-S5/D-CONF/D-LOCK/D-SUM/D-SIL) —
> ported 1:1; deviations are Health-Connect-idiom only (below). No new backend code and **no migration**
> (it reuses the endpoints + library that `apple-health` already established).
> **Depends on:** [`auth`](../auth/SPEC.md) (JWT), [`programs`](../programs/SPEC.md) /
> [`program-memberships`](../program-memberships/SPEC.md) (target programs + the `admin_only_data_entry`
> lock), [`workouts`](../workouts/SPEC.md) (the library the map targets — the Apple types seeded by
> `sql/004`), [`workout-logs`](../workout-logs/SPEC.md) (the write endpoint + `on_duplicate:"sum"`), and —
> for sleep — [`daily-health-logs`](../daily-health-logs/SPEC.md) (`sleep_hours` + its POST/PUT endpoints).

---

## 1. What it is

An **Android-only** integration that reads workouts **and sleep** from **Health Connect** (Samsung Health
and any other Health-Connect writer) and auto-logs them to the user's selected RaSi Fiters programs —
exactly as iOS `apple-health` does from HealthKit. The user connects in **Account → Health Connect**, picks
which programs to sync into, and thereafter Health Connect workouts appear as workout logs and nightly time
asleep populates `daily_health_logs.sleep_hours`. Because Health Connect is Android-only, there is **no web
analogue**; the cross-surface effects are the enlarged workout library (already seeded by `apple-health`'s
migration `004`) and the sleep values in the existing web/iOS daily-health views.

**Sleep** is a **separate toggle on the same settings screen** (its own permission, program selection, and
status), independent of the workout toggle.

## 2. Why it exists (same reconciliation as Apple Health)

The backend does **not** auto-create workout types: `workouts_library` is curated with a UNIQUE `name`, and
logging an unknown name lazily materializes a per-program **custom** row. So a synced log must resolve to a
real library name. This feature reuses the **same library** `apple-health` reconciled (migration `004`
already seeded the Apple types + `Other Workout`) and maps each Health Connect
`ExerciseSessionRecord.exerciseType` to a real `workouts_library` name — **every target is a subset of the
iOS map's targets** (verified against `sql/004`), so a synced Android log is always library-backed.

## 3. Functionality (1:1 with `apple-health` §3, on Health Connect)

- **Connect / disconnect** (`HealthSyncController.enableWorkoutsAfterPermission` / `disconnectWorkouts`) —
  request Health Connect **read** authorization for `ExerciseSessionRecord` via the Health Connect
  permission UI (`PermissionController.createRequestPermissionResultContract`, **not** a runtime dialog);
  persist enabled state, selected program ids, connect date, last-sync date/count, and the **changes token**
  in `SharedPreferences` (the `UserDefaults` analog — client-side, F3).
- **Incremental fetch** (`HealthConnectManager.fetchNewWorkouts`) — the **Changes API** (the anchor analog):
  first sync reads `ExerciseSessionRecord`s **since the connect date** (`readRecords`, no arbitrary
  backfill) and mints a changes token for the future; later syncs drain `getChanges(token)`; an **expired**
  token falls back to a full read-from-connect-date + a fresh token. The token is persisted **only after a
  successful sync** (iOS anchor-integrity, D-FIX).
- **Aggregation** (`HealthConnectManager.aggregate`) — group by (mapped library name, local calendar day),
  keeping each contributing session's `(uuid = record.metadata.id, minutes)` so writes can filter
  already-applied samples (D-SUM). Minutes = `max(round(Σ), 1)`.
- **Mapping** (`HealthConnectWorkoutTypeMap`) — every `ExerciseSessionRecord.EXERCISE_TYPE_*` → a
  `workouts_library` name; close equivalents reuse curated rows (Cycling/Rowing/Boxing/Swim/HIIT
  Intervals/Yoga Flow/Pilates Core/Dance Cardio/Stair Climber/Stretching/Traditional Strength
  Training/Functional Training/Running/Walking/Hiking/Elliptical), the rest use the Apple Title-Case names
  seeded by `004`; unmapped/`OTHER_WORKOUT` → `"Other Workout"`.
- **Sync** (`HealthSyncController.performWorkoutSync`) — per (aggregated workout × selected program) call
  `POST /api/workout-logs` with **`on_duplicate:"sum"`** (D-SUM); idempotency comes from the
  **applied-sample ledger** (`HealthStore`, keyed `sampleUUID|programId`, 45-day prune) — each write sends
  only unapplied samples' minutes. Classify each result (created/summed/duplicate/skipped/retryable);
  commit the changes token only on success; post a **local notification** on new logs (failures silent —
  D-SIL). Each workout writes to a program **only if its date ∈ that program's window** (D-S5).
- **First-sync confirmation gate (D-CONF)** — an **unconfirmed** program's in-window rows are collected into
  a `PendingSyncConfirmation` and reviewed one program per page in `HealthSyncConfirmationScreen` (tick =
  commit checked rows + advance); only **confirmed** programs write silently thereafter. The changes token
  commits only when the whole flow finishes cleanly; dismiss = defer.
- **Triggers** — app launch, auth change, foreground return (`RootScreen` `ON_RESUME`), and program entry
  (`AppScaffold`). **Deviation (H-1):** Health Connect has no HealthKit-style *immediate background
  delivery* observer, so there is **no OS-push background sync** — sync runs on these app triggers. (A
  future `WorkManager` periodic job could approximate it; deferred.)

### 3a. Sleep sync

- **Connect / disconnect** (`enableSleepAfterPermission` / `disconnectSleep`) — request read authorization
  for `SleepSessionRecord`; persist a **separate** `hc.sleep.*` key set. Independent toggle, same screen.
- **Rolling-window fetch** (`HealthConnectManager.fetchSleepSamples`) — `readRecords` over the last **14
  days** from the **start of that day** (NOT anchored, NOT connect-date floored — D-S1).
- **Aggregation** (`aggregateSleep`) — prefer the precise asleep stages (`STAGE_TYPE_SLEEPING/LIGHT/DEEP/
  REM`), bucket by the local calendar date of each stage's **end** (wake day), sum → hours (2 dp, 0…24).
  **In-Bed fallback (D-S6):** a session with **no** asleep stages (manual / phone-only) uses its whole
  in-bed duration (session end − start) instead, so it still syncs; a session with stages never
  double-counts.
- **Sync** (`performSleepSync`) — per (night × selected program) `POST /api/daily-health-logs`, on **409**
  fall back to `PUT` (overwrite `sleep_hours` only). Notify on genuinely new nights (`created`); overwrites
  silent. Gated by the same D-CONF confirmation and D-LOCK admin-lock skip; sleep needs no ledger (PUT is
  idempotent) and no token (the 14-day window self-heals).

## 4. Data / schema touchpoints

- **`workouts_library`** — already seeded by `apple-health`'s `sql/004`. This feature **adds nothing** —
  the Android map targets a subset of those names.
- **`workout_logs`** — written via `POST /api/workout-logs`; composite PK keeps one row per type/day, and
  `on_duplicate:"sum"` (D-SUM) adds minutes to the existing row.
- **`daily_health_logs`** (sleep) — written via `POST`/`PUT /api/daily-health-logs`; only `sleep_hours` is
  written (`diet_quality` never touched).
- **No new tables/columns, no migration.** All sync state is client-side `SharedPreferences`.

## 5. The backend delta

**None.** Both backend changes Apple Health needed already shipped and are live: the 409-on-collision +
`on_duplicate:"sum"` in `logService.addWorkoutLog` ([`workout-logs`](../workout-logs/SPEC.md) D-C9), and the
POST-then-PUT-on-409 upsert on the existing daily-health endpoints. This feature is a **pure client**
addition against the already-deployed contract, degrade-safe for the LIVE iOS binary.

## 6. Error handling & edge cases

- **Token integrity** — the changes token is committed **only after** a successful sync; retryable failures
  (network/5xx/401-after-refresh) hold the token so the next trigger retries, idempotent via the
  applied-sample ledger.
- **Sum-on-conflict (D-SUM)** — a duplicate (type, day) write adds its minutes; a plain 409 is the
  deploy-skew/delete-race backstop (skipped, ledger not marked). Permanent 400/403/404 skipped without
  blocking the token.
- **Silent auto-retry (D-SIL)** — retryable failures never notify; the settings screen shows a passive
  "will retry automatically" line (persisted `lastSyncFailed`), and the manual **Sync Now** consumes the
  returned `HealthSyncResult` to show an inline error.
- **Concurrency** — an `AtomicBoolean` single-flight guard per flow coalesces overlapping triggers.
- **Availability / permission** — `HealthConnectClient.getSdkStatus` gates the UI (an "isn't available"
  card when the provider is missing/needs update); denied read auth yields empty fetches (no crash). The
  401 refresh+retry is transparent (OkHttp `Authenticator`), so a 401 reaching the writer = refresh failed
  → retryable.

## 7. Flags / env

None. The Health Connect **read** permissions (`android.permission.health.READ_EXERCISE`,
`…READ_SLEEP`), the provider `<queries>`, and the permissions-rationale intent-filters ship in the
`AndroidManifest`. Play Console needs a Health Connect permissions declaration at submission (deploy-time,
user-run). Health Connect is built into Android 14+ (API 34); on 13 and lower it is a standalone provider
app.

## 8. Decisions made (inherited from `apple-health`, on Health Connect)

| ID | Decision | Rests on |
|----|----------|----------|
| **D1/D2/D4/D5** | **Additive + map**, targeting the library `apple-health` already seeded (`sql/004`); Android map targets ⊆ iOS map targets (verified). | the Apple Health feature; `sql/004`. |
| **D-SUM** | **Sum-on-conflict + applied-sample ledger** (`SharedPreferences`, keyed `sampleUUID\|programId`, 45-day prune; marked only on `created`/`summed`). Both write paths (steady-state + page-commit) filter to unapplied samples. | Apple Health D-SUM; backend `workout-logs` D-C9. |
| **D-S5** | **Per-program date-window scoping** — an item writes to a program only if its date ∈ `[start_date, min(end_date, today)]`. Empty windows (offline) → hold the token / skip, don't dump unscoped data. | Apple Health D-S5. |
| **D-CONF** | **First-sync confirmation, gated per program** — unconfirmed programs' in-window rows are reviewed one page per program (`HealthSyncConfirmationScreen`); selectable rows (default checked); unchecked rows recorded as excluded; 0-row first sync auto-confirms; dismiss = defer; token commits only after all confirmed cleanly. | Apple Health D-CONF. |
| **D-LOCK** | **Admin-lock skip** — an in-window `admin_only_data_entry`-locked program (viewer not global/program admin) is skipped from writes, confirmation pages, and 0-row auto-confirm; **workouts hold the token** (re-sync on unlock), **sleep** self-heals via its 14-day window. Settings renders locked programs non-selectable + a lock note. | Apple Health D-LOCK; `isDataEntryLocked(programId)`. |
| **D-SIL** | **Silent auto-retry** — no failure notification; passive settings caption + manual Sync Now inline error; `HealthSyncResult` returned. | Apple Health D-SIL. |
| **D-S1/D-S2/D-S6** | **Sleep** = rolling 14-day re-query + overwrite (not anchored), time-asleep → `sleep_hours` via POST-then-PUT-on-409, In-Bed fallback for stage-less sessions. | Apple Health sleep decisions. |
| **H-CHG** | **Changes API is the anchor analog** — Health Connect's `getChangesToken`/`getChanges` replaces `HKAnchoredObjectQuery`; first sync uses `readRecords` from the connect date (the Changes token carries no history), then the token drives incrementals; expired token → full re-read + fresh token. | Health Connect API shape. |

## 9. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **H-1** | **No OS-push background sync** — Health Connect offers no HealthKit-style immediate background delivery; sync runs on app triggers (launch/auth/foreground/program-entry). | `HealthSyncController.onTrigger` | Kept for v1; a `WorkManager` periodic sync could be added later. |
| **F1/F2/F3** | Same as Apple Health — reused curated names (no Apple-canonical renames), **duration only** (no distance/energy), **client-persisted** sync state. | `HealthConnectWorkoutTypeMap`, `aggregate`, `HealthStore` | Kept (faithful to the log model + the additive policy). |
| **F5** | **Overwrite is destructive to a manual sleep value** — a night Health Connect also has replaces a web/iOS-entered `sleep_hours` (diet untouched). | `writeSleep` PUT path | Kept (explicit user choice; no provenance column). |

## 10. Open questions

None blocking. Future: an optional `WorkManager` periodic background sync (H-1); a server-side
sync-preferences store if multi-device consistency is ever needed; a source/provenance column so synced
sleep could spare manually-entered nights (F5).

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | **Initial SPEC + build (Android Phase H).** Ported the iOS `apple-health` 0.6.0 integration to Health Connect: `health/{HealthConnectManager,HealthConnectWorkoutTypeMap,HealthStore,HealthAppliedLedger(in HealthStore),HealthModels,HealthDates,HealthSyncNotifier,HealthSyncController}.kt` + `ui/health/{HealthConnectSettingsScreen,HealthSyncConfirmationScreen}.kt`. Incremental workouts via the Changes API (anchor analog, H-CHG), rolling 14-day sleep window, the full D-S5/D-CONF/D-LOCK/D-SUM/D-SIL rule set, and status-code-aware writes (new raw `postWorkoutLog`/`postDailyHealthLogRaw`/`putDailyHealthLogRaw` on `ApiService`). `ProgramContext` gained `isDataEntryLocked(programId)` + owns a `HealthSyncController`; account rows (Program tab + picker sheet) + a full-screen confirmation overlay + launch/auth/resume/program-entry triggers wired. No backend change, no migration — reuses the already-live `workout-logs` D-C9 + daily-health upsert. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. |
