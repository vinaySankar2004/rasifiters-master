# Feature: `apple-health` — Apple Health (HealthKit) workout + sleep auto-sync (iOS)

> **Status:** 🏗️ built (`apps/ios/` + backend touchpoints) · **Version:** 0.2.0 · **Apps (`consumed_by`):** `ios`
> **Provenance (legacy, archived):** `vinaySankar2004/RaSi-Fiters` **PR #4** (`apple-health` branch) —
> `HealthKitService.swift`, `HealthKitWorkoutTypeMap.swift`, `ProgramContext+HealthKit.swift`,
> `AppleHealthSettingsView.swift`. Ported to `apps/ios` and **corrected for our stack** (curated library +
> robust error handling), not a 1:1 copy. **Sleep sync (0.2.0) is net-new** (no legacy provenance) —
> `HealthKitService+Sleep.swift`, `APIClient+DailyHealth.swift`, `ProgramContext+HealthKitSleep.swift`.
> **Depends on:** [`auth`](../auth/SPEC.md) (JWT), [`programs`](../programs/SPEC.md) /
> [`program-memberships`](../program-memberships/SPEC.md) (target programs + the `admin_only_data_entry` lock),
> [`workouts`](../workouts/SPEC.md) (the library the map targets), [`workout-logs`](../workout-logs/SPEC.md)
> (the write endpoint + the 409-on-collision it relies on), and — for sleep —
> [`daily-health-logs`](../daily-health-logs/SPEC.md) (the `sleep_hours` column + its POST/PUT endpoints).

---

## 1. What it is

An **iOS-only** integration that reads workouts **and sleep** from Apple Health (HealthKit) and auto-logs
them to the user's selected RaSi Fiters programs. The user connects Apple Health in Settings, picks which
programs to sync into, and thereafter workouts recorded in Apple Health appear as workout logs — on app
launch, on foreground return, on program entry, and via HealthKit **background delivery**. Because Apple
Health is iOS-only, there is **no web analogue**; the cross-surface effects are the enlarged workout
library and the sleep values that populate the existing web daily-health views.

**Sleep (0.2.0)** is a **separate toggle on the same settings screen** (its own permission, program
selection, and status) that writes nightly *time asleep* into `daily_health_logs.sleep_hours`.

## 2. Why it exists (and the core correction vs the PR)

The reference PR assumed "the backend auto-creates workout types." Our backend does **not**: `workouts_library`
is a curated list with a UNIQUE `name`, and logging an unknown name only lazily materializes a **per-program
custom** `program_workouts` row (`logService.resolveProgramWorkout`). Apple Health's ~80 granular activity
types would therefore scatter inconsistent custom workouts across programs. So this feature **reconciles the
library first** (migration `004` seeds the Apple types) and maps each `HKWorkoutActivityType` to a real
library name — a synced log always resolves to a library-backed program workout.

## 3. Functionality

- **Connect / disconnect** (`ProgramContext.startHealthKitSync` / `clearHealthKitSettings`) — request
  HealthKit read authorization for `HKObjectType.workoutType()`; persist enabled state, selected program ids,
  connect date, last-sync date/count in `UserDefaults`.
- **Incremental fetch** (`HealthKitService.fetchNewWorkouts`) — an `HKAnchoredObjectQuery`; first sync is
  bounded by the **connect date** (no arbitrary backfill).
- **Aggregation** (`HealthKitService.aggregate`) — group by (mapped library name, calendar day), sum minutes
  (min 1), matching the backend's one-log-per-type/member/day composite PK.
- **Mapping** (`HealthKitWorkoutTypeMap`) — every `HKWorkoutActivityType` → a `workouts_library` name;
  16 close equivalents reuse existing curated rows, the rest use Apple Title-Case names seeded by migration
  `004`; `.other`/unknown → `"Other Workout"`.
- **Sync** (`ProgramContext.performHealthKitSync`) — per (aggregated workout × selected program) call
  `APIClient.writeHealthKitWorkoutLog` → `POST /api/workout-logs`; classify each result; advance the anchor
  only on success; post a local notification on new logs / failure.
- **Triggers** — app launch, auth change, foreground (`AppRootView`), program entry (`AdminHomeView`),
  program-picker load (`ProgramPickerView`), and HealthKit background delivery.

### 3a. Sleep sync (0.2.0)

- **Connect / disconnect** (`ProgramContext.startSleepSync` / `clearSleepSyncSettings`) — request HealthKit
  read authorization for `HKCategoryType(.sleepAnalysis)`; persist a **separate** set of `UserDefaults`
  keys (`healthkit.sleep.*`: enabled, program ids, connect date, last-sync date/count). Independent of the
  workout toggle but on the **same** `AppleHealthSettingsView` screen.
- **Rolling-window fetch** (`HealthKitService.fetchSleepSamples`) — a plain `HKSampleQuery` over the last
  `sleepLookbackDays` (=3), floored at the sleep connect date. **Not anchored** (see D-S1).
- **Aggregation** (`HealthKitService.aggregateSleep`) — keep only the *asleep* stages
  (`asleepUnspecified/Core/Deep/REM`; exclude `inBed`/`awake`), bucket by the **local calendar date of each
  sample's end** (the day you woke up), sum → hours (2 dp, clamped `0…24`).
- **Sync** (`ProgramContext.performSleepSync`) — per (night × selected program) call
  `APIClient.writeHealthKitSleepLog` → `POST /api/daily-health-logs`, and on **409** fall back to
  `PUT /api/daily-health-logs` to overwrite `sleep_hours` only. Notify on genuinely new nights (`.created`);
  overwrites (`.updated`) are silent.
- **Triggers** — same set as workouts (launch / auth / foreground / program entry) plus a sleep observer
  query. Background delivery frequency is `.hourly` (Apple's cap for non-glucose category types), vs
  workouts' `.immediate`.

## 4. Data / schema touchpoints

- **`workouts_library`** — seeded (additive) by `apps/backend/sql/004_seed_healthkit_workout_types.sql`
  (`ON CONFLICT (name) DO NOTHING`; ~65 new rows + `Other Workout`). No renames, no other-table writes.
- **`workout_logs`** — written via the existing `POST /api/workout-logs`. Composite PK
  `(program_id, member_id, program_workout_id, log_date)` gives one-log-per-day dedup.
- **`daily_health_logs`** (sleep) — written via the existing `POST`/`PUT /api/daily-health-logs`. Composite
  PK `(program_id, member_id, log_date)`; only `sleep_hours numeric(4,2)` is written (`diet_quality` never
  touched). No migration — the column + `CHECK (0…24)` already exist in `001_schema.sql`.
- **No new tables/columns.** All sync state is client-side `UserDefaults`.

## 5. The backend delta (one deliberate change — workouts only)

`logService.addWorkoutLog` now catches the composite-PK `UniqueConstraintError` and throws **`AppError(409)`**
instead of surfacing a generic 500 — mirroring the batch endpoint's duplicate semantics. This lets the
sync distinguish "already logged" (skip, D3) from a real failure (retry), and improves the manual
single-log form's duplicate message. Recorded in [`workout-logs`](../workout-logs/SPEC.md) §11.

**Sleep needs no backend change:** `addDailyHealthLog` already 409s on an existing row, and
`updateDailyHealthLog` already does a `sleep_hours`-only partial update — so the iOS POST-then-PUT-on-409
upsert reuses them verbatim (D-S2).

## 6. Error handling & edge cases (see §8 for the table)

- **Anchor integrity** — the anchor is committed **only after** a successful sync (the PR committed it inside
  the fetch, silently dropping any workout whose upload failed). Retryable failures (network/5xx/401) leave
  the anchor so the next trigger retries; re-runs are idempotent (already-written → 409 → skipped).
- **Skip-on-conflict (D3)** — `409` (duplicate) and permanent `400/403/404` (validation / locked program /
  not-an-active-participant) are skipped without blocking the anchor; manual logs are never overwritten.
- **Concurrency** — a single-flight `isSyncing` guard coalesces overlapping triggers.
- **Availability / permission** — `HKHealthStore.isHealthDataAvailable()` gates the UI; denied read auth
  yields empty fetches (no crash).

## 7. Flags / env

None. HealthKit entitlements (`com.apple.developer.healthkit` + `…background-delivery`), `UIBackgroundModes`
`fetch`, and the `NSHealth{Share,Update}UsageDescription` strings ship in the app target (see
`HEALTHKIT_SUBMISSION_CHECKLIST.md`). The Xcode capability toggles + App Store privacy config are user-run.

## 8. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D1** | **Additive + map** — no library renames, no `program_workouts`/`workout_logs` migration; add missing Apple types, reuse close equivalents. | user decision; live-library read (25 rows). |
| **D2** | **Seed all ~76 non-deprecated `HKWorkoutActivityType`** + `Other Workout` (migration `004`, 65 new rows). | user decision; Apple docs enum. |
| **D3** | **Skip on conflict** — never overwrite/sum an existing log (reverses the PR's add→update fallback). | user decision. |
| **D4** | **Reconcile against the live production library**, not the test seed. | live DB read via the gitignored `DATABASE_URL` (see the `supabase` skill). |
| **D5** | **New rows use Apple Title-Case names**; the map's target set ⊆ library (verified). | invariant check (79 targets ⊆ 90 names). |
| **D6** | **iOS-only** sync; library additions surface in web + iOS pickers (expected). | Apple Health is iOS-only. |
| **D7** | **Sync-result = local notification + in-app status**, only on new (≥1) or failure; silent otherwise. | user decision. |
| **D-BE** | **409-on-PK-collision** in `addWorkoutLog` (the one backend code change). | needed for clean skip vs retry. |
| **D-FIX** | **Anchor committed only after successful sync** (fixes a data-loss bug in the reference PR). | code review of the PR. |
| **D-S1** | **Sleep uses a rolling look-back window + overwrite, NOT an anchor.** A night is stitched from many incremental category samples, so an anchor delivers fragments, not the whole night; re-querying the last 3 nights and recomputing from the full sample set is correct + idempotent under overwrite. | user decision (always-overwrite) + HealthKit sleep sample model. |
| **D-S2** | **Sleep metric = time asleep**, stored in `sleep_hours`, **HealthKit always overwrites** it (diet untouched) via POST-then-PUT-on-409 on the existing endpoints — **no backend change**. | user decision. |
| **D-S3** | **Separate "Sync Sleep" toggle on the same settings screen** — own permission, own program selection, own `healthkit.sleep.*` defaults; independent of the workout sync. | user decision. |
| **D-S4** | **Notify only on genuinely new nights** (`.created`); overwrites (`.updated`) are silent — mirrors the workout "notify on new" rule so the hourly re-sync isn't noisy. | user decision (D7 parity). |

## 9. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **F1** | **`"Swim"`/`"Yoga Flow"`/`"HIIT Intervals"` etc. keep RaSi names** — Apple canonical names (`Swimming`…) are NOT added; the map reuses the curated rows. A deliberate consequence of additive-only (D1). | `HealthKitWorkoutTypeMap.swift`; migration `004` | Kept — renaming is a separate, data-migrating decision. |
| **F2** | **Duration only** — HealthKit distance/energy are not synced; only workout type + day + summed minutes. | `HealthKitService.aggregate` | Kept (faithful to the log model, which stores only `duration`). |
| **F3** | **Client-persisted sync state** — enabled/programs/anchor/last-sync live in `UserDefaults`, not the backend. | `ProgramContext+HealthKit.swift` | Kept (matches the PR; no server preference table). |
| **F4** | **Sleep "day" = the whole calendar day of the wake time** — any *asleep* sample (incl. daytime naps) whose end falls on date D is summed into D's total. No main-night-only isolation. | `HealthKitService.aggregateSleep` | Kept — a reasonable "total time asleep per day" default; revisit only if naps prove noisy. |
| **F5** | **Overwrite is destructive to a manual sleep value** — a web/iOS-entered `sleep_hours` for a night HealthKit also has is replaced on the next sync (per D-S2). `diet_quality` is never affected. | `writeHealthKitSleepLog` (PUT path) | Kept (explicit user choice); no source/provenance column to distinguish manual vs synced. |

## 10. Open questions

None blocking. Future: optionally surface locked/failed-program notes in the settings UI; optionally add a
server-side sync-preferences store if multi-device consistency is ever needed; optionally add a
source/provenance column so HealthKit sleep could spare manually-entered nights (see F5).

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC + build. Ported PR #4's HealthKit sync to `apps/ios`, corrected for our curated `workouts_library`: additive library seed (migration `004`, D1/D2/D4/D5), full `HKWorkoutActivityType` map (16 reuse + ~63 new, invariant-verified), skip-on-conflict (D3) via a new 409-on-PK-collision in `addWorkoutLog` (D-BE), anchor-integrity fix (D-FIX), and a sync-result local notification (D7). iOS builds clean; user runs migration `004` + the Xcode capability/App-Store steps. `consumed_by=[ios]`. |
| 0.2.0 | 2026-07-01 | **Sleep auto-sync (net-new, iOS-only).** Separate "Sync Sleep" toggle on the same settings screen (D-S3) reads `HKCategoryType(.sleepAnalysis)` and writes nightly *time asleep* to `daily_health_logs.sleep_hours` (D-S2). Rolling 3-night look-back re-query + upsert-overwrite instead of an anchor (D-S1); asleep-stage-only aggregation bucketed by local wake-date (F4); POST-then-PUT-on-409 reuses the existing daily-health endpoints with **no backend change** (D-S2). Notify only on new nights (D-S4). Overwrite is destructive to manual sleep (F5). New files: `HealthKitService+Sleep.swift`, `APIClient+DailyHealth.swift`, `ProgramContext+HealthKitSleep.swift`; Info.plist `NSHealthShareUsageDescription` broadened to mention sleep. iOS builds clean (0 errors). No migration, no Render/Vercel deploy. |
