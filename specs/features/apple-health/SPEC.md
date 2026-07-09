# Feature: `apple-health` — Apple Health (HealthKit) workout + sleep + steps auto-sync (iOS)

> **Status:** 🏗️ built (`apps/ios/` + backend touchpoints) · **Version:** 0.7.0 · **Apps (`consumed_by`):** `ios`
> **Provenance (legacy, archived):** `vinaySankar2004/RaSi-Fiters` **PR #4** (`apple-health` branch) —
> `HealthKitService.swift`, `HealthKitWorkoutTypeMap.swift`, `ProgramContext+HealthKit.swift`,
> `AppleHealthSettingsView.swift`. Ported to `apps/ios` and **corrected for our stack** (curated library +
> robust error handling), not a 1:1 copy. **Sleep sync (0.2.0) is net-new** (no legacy provenance) —
> `HealthKitService+Sleep.swift`, `APIClient+DailyHealth.swift`, `ProgramContext+HealthKitSleep.swift`.
> **Depends on:** [`auth`](../auth/SPEC.md) (JWT), [`programs`](../programs/SPEC.md) /
> [`program-memberships`](../program-memberships/SPEC.md) (target programs + the `admin_only_data_entry` lock),
> [`workouts`](../workouts/SPEC.md) (the library the map targets), [`workout-logs`](../workout-logs/SPEC.md)
> (the write endpoint + the 409-on-collision it relies on), and — for sleep + steps —
> [`daily-health-logs`](../daily-health-logs/SPEC.md) **0.2.0** (the `sleep_hours` + `steps` columns + its
> POST/PUT endpoints; steps needs migration `006`).

---

## 1. What it is

An **iOS-only** integration that reads workouts, **sleep, and steps** from Apple Health (HealthKit) and
auto-logs them to the user's selected RaSi Fiters programs. The user connects Apple Health in Settings, picks
which programs to sync into, and thereafter workouts recorded in Apple Health appear as workout logs — on app
launch, on foreground return, on program entry, and via HealthKit **background delivery**. Because Apple
Health is iOS-only, there is **no web analogue**; the cross-surface effects are the enlarged workout
library and the sleep/steps values that populate the existing web/Android daily-health views.

**Sleep (0.2.0)** is a **separate toggle on the same settings screen** (its own permission, program
selection, and status) that writes nightly *time asleep* into `daily_health_logs.sleep_hours`.

**Steps (0.7.0)** is a **third independent toggle on the same screen** that writes each day's cumulative
step count into `daily_health_logs.steps` (daily-health-logs 0.2.0, D-C4) — the exact sleep model verbatim
(rolling 14-day re-query + POST→409→PUT upsert), just on the step-count quantity type.

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
  `APIClient.writeHealthKitWorkoutLog` → `POST /api/workout-logs` with **`on_duplicate:"sum"`** (D-SUM):
  a same-type workout arriving in a later batch ADDs its minutes to the day's existing row instead of
  being 409-dropped. Idempotency comes from the **applied-sample ledger** (`HealthKitAppliedLedger`,
  keyed `sampleUUID|programId`) — each write sends only samples not yet applied to that program, so a
  replayed batch (held anchor) never double-adds. Classify each result; advance the anchor only on
  success; post a local notification on new logs (**failures are silent** — D-SIL: a passive settings
  status line + the manual Sync Now's inline error replace the old failure banner). Each workout is
  written to a program **only if its date falls in that program's `[start_date, end_date]` window**
  (D-S5) — out-of-window workouts are skipped, not scattered across every selected program.
- **First-sync confirmation gate (D-CONF)** — a program's first influx is **not written silently**. An
  **unconfirmed** program's in-window rows are collected into a `PendingSyncConfirmation` and reviewed
  one program per page in `HealthSyncConfirmationView` (glass tick = confirm + advance); only **confirmed**
  programs write silently thereafter. The anchor is stashed and committed only when the whole flow finishes
  cleanly. See D-CONF for the full gating/exclusion/defer semantics.
- **Triggers** — app launch, auth change, foreground (`AppRootView`), program entry (`AdminHomeView`),
  program-picker load (`ProgramPickerView`), and HealthKit background delivery.

### 3a. Sleep sync (0.2.0)

- **Connect / disconnect** (`ProgramContext.startSleepSync` / `clearSleepSyncSettings`) — request HealthKit
  read authorization for `HKCategoryType(.sleepAnalysis)`; persist a **separate** set of `UserDefaults`
  keys (`healthkit.sleep.*`: enabled, program ids, connect date, last-sync date/count). Independent of the
  workout toggle but on the **same** `AppleHealthSettingsView` screen.
- **Rolling-window fetch** (`HealthKitService.fetchSleepSamples`) — a plain `HKSampleQuery` over the last
  `sleepRecentDays` (=14), from the **start of that day** to now. **Not** floored at the connect date
  (that floor collapsed the window to `[today, today]` on same-day connect and synced nothing) and **not
  anchored** (see D-S1). Which nights land where is decided per-program at write time.
- **Aggregation** (`HealthKitService.aggregateSleep`) — prefer the precise *asleep* stages
  (`asleepUnspecified/Core/Deep/REM`), bucket by the **local calendar date of each sample's end** (the day
  you woke up), sum → hours (2 dp, clamped `0…24`). **In-Bed fallback (D-S6):** a night with no stage data
  (manual / iPhone-only sleep) uses its `.inBed` duration instead, so it still syncs; watch nights carry
  both and asleep wins (no double-count).
- **Sync** (`ProgramContext.performSleepSync`) — per (night × selected program) call
  `APIClient.writeHealthKitSleepLog` → `POST /api/daily-health-logs`, and on **409** fall back to
  `PUT /api/daily-health-logs` to overwrite `sleep_hours` only. Each night is written to a program **only
  if its date falls in that program's `[start_date, end_date]` window** (D-S5). Notify on genuinely new
  nights (`.created`); overwrites (`.updated`) are silent. Sleep is gated by the same **first-sync
  confirmation** as workouts (D-CONF): an unconfirmed program's nights are reviewed before writing.
- **Triggers** — same set as workouts (launch / auth / foreground / program entry) plus a sleep observer
  query. Background delivery frequency is `.hourly` (Apple's cap for non-glucose category types), vs
  workouts' `.immediate`.

### 3b. Steps sync (0.7.0) — the sleep model verbatim

- **Connect / disconnect** (`ProgramContext.startStepsSync` / `clearStepsSyncSettings`,
  `ProgramContext+HealthKitSteps.swift`) — request HealthKit read authorization for
  `HKQuantityType(.stepCount)`; persist a **separate** `healthkit.steps.*` `UserDefaults` key set (enabled,
  program ids, connect date, last-sync date/count/failed). Independent of the workout + sleep toggles but on
  the **same** `AppleHealthSettingsView` screen (a third section; connect icon `figure.walk`, tint `.teal`).
  Restored on relaunch via `restoreStepsSyncSettings()` (called from `ProgramContext+Auth`).
- **Rolling-window fetch** (`HealthKitService+Steps.fetchStepsDailyTotals`) — an `HKStatisticsCollectionQuery`
  over the last `stepsRecentDays` (=14) with `.cumulativeSum` + one-day intervals; each bucket's
  `sumQuantity().doubleValue(for: .count())` is rounded to an `Int` and emitted as an `AggregatedSteps`
  (`{ date, count }`) keyed by the **local calendar date** of the bucket start, when > 0. NOT anchored, NOT
  connect-date floored — identical to the sleep window model (D-S1).
- **Sync** (`ProgramContext.performStepsSync`) — per (day × selected program) call
  `APIClient.writeHealthKitStepsLog` → `POST /api/daily-health-logs`, and on **409** fall back to `PUT`
  overwriting `steps` only (sleep + diet untouched). Per-program date-window scoping (D-S5) + admin-lock skip
  (D-LOCK) apply. Notify on genuinely new days (`.created`) only; overwrites silent (D-S4). Gated by the same
  first-sync confirmation (D-CONF). Exclusion keys under their own `healthkit.steps.excludedKeys` namespace,
  pruned past 14 days.
- **Confirmation flow priority (D-CONF, revised):** when more than one flow is pending, they present in the
  order **workouts > sleep > steps** — a steps flow computed while sleep is showing stashes into
  `deferredStepsConfirmation` and promotes cleanly once sleep is committed/deferred; steps sync skips while
  its own confirmation is pending or deferred.
- **Triggers** — same set as sleep (launch / auth / foreground / program entry) plus a step-count observer
  query at `.hourly` background delivery. Success posts `notifyStepsSuccess(count:)`
  ("Synced steps for N days from Apple Health.", guarded > 0).

## 4. Data / schema touchpoints

- **`workouts_library`** — seeded (additive) by `apps/backend/sql/004_seed_healthkit_workout_types.sql`
  (`ON CONFLICT (name) DO NOTHING`; ~65 new rows + `Other Workout`). No renames, no other-table writes.
- **`workout_logs`** — written via the existing `POST /api/workout-logs`. Composite PK
  `(program_id, member_id, program_workout_id, log_date)` keeps one row per type/day; with
  `on_duplicate:"sum"` (D-SUM) a same-day repeat adds its minutes to that row instead of 409-ing.
- **`daily_health_logs`** (sleep) — written via the existing `POST`/`PUT /api/daily-health-logs`. Composite
  PK `(program_id, member_id, log_date)`; only `sleep_hours numeric(4,2)` is written (`diet_quality` never
  touched). No migration — the column + `CHECK (0…24)` already exist in `001_schema.sql`.
- **`daily_health_logs`** (steps, 0.7.0) — written via the same `POST`/`PUT /api/daily-health-logs`; only the
  `steps integer` column is written (sleep + diet never touched). Requires daily-health-logs 0.2.0's
  migration `006` (the `steps` column + the recreated at-least-one CHECK admitting steps-only rows) — the
  **one backend/schema dependency** for this version.
- **No apple-health-owned tables/columns.** All sync state is client-side `UserDefaults`.

## 5. The backend delta (two deliberate changes — workouts only)

1. **409-on-collision (D-BE, 0.1.0):** `logService.addWorkoutLog` catches the composite-PK
   `UniqueConstraintError` and throws **`AppError(409)`** instead of surfacing a generic 500 — mirroring
   the batch endpoint's duplicate semantics. Recorded in [`workout-logs`](../workout-logs/SPEC.md) §11.
2. **Sum-on-conflict (D-SUM, 0.6.0):** the same catch now honors an opt-in **`on_duplicate:"sum"`** body
   flag (sent only by this sync): instead of the 409, it atomically increments the existing row
   (`UPDATE … SET duration = COALESCE(duration,0) + N`) and returns **200 `{…, summed: true}`** (create
   stays 201). The manual form, widget, and batch endpoint never send the flag → their 409-reject
   behavior is unchanged. Recorded as [`workout-logs`](../workout-logs/SPEC.md) **D-C9**.

**Sleep needs no backend change:** `addDailyHealthLog` already 409s on an existing row, and
`updateDailyHealthLog` already does a `sleep_hours`-only partial update — so the iOS POST-then-PUT-on-409
upsert reuses them verbatim (D-S2).

**Steps (0.7.0) needs no *new* backend code — but one schema dependency:** the same POST→409→PUT upsert
writes the `steps` column, which daily-health-logs 0.2.0 added (migration `006` + the at-least-one CHECK
recreated to admit steps-only rows). So steps sync depends on daily-health-logs 0.2.0 being deployed
(migration `006` run first), but adds no server logic of its own (D-STEPS).

## 6. Error handling & edge cases (see §8 for the table)

- **Anchor integrity** — the anchor is committed **only after** a successful sync (the PR committed it inside
  the fetch, silently dropping any workout whose upload failed). Retryable failures (network/5xx/401) leave
  the anchor so the next trigger retries; re-runs are idempotent via the **applied-sample ledger** (D-SUM):
  already-applied samples are filtered out before the write, so a replayed batch adds nothing twice.
- **Sum-on-conflict (D-SUM, supersedes D3's skip)** — a duplicate (type, day) write with `on_duplicate:"sum"`
  adds its minutes to the existing row (manual logs are added **on top of**, never replaced). A plain `409`
  now occurs only as a backstop (old backend during deploy skew, or a delete race) and is skipped without
  ledger-marking, so a later replay resolves it; permanent `400/403/404` (validation / locked program /
  not-an-active-participant) are skipped without blocking the anchor.
- **Silent auto-retry (D-SIL)** — retryable failures no longer post a failure notification: automatic syncs
  retry losslessly on the next trigger, the settings screen shows a passive "will retry automatically"
  line (persisted `healthkit[.sleep].lastSyncFailed`), and the manual Sync Now consumes the returned
  `HealthSyncResult` to show an inline error.
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
| **D3** | ~~**Skip on conflict** — never overwrite/sum an existing log (reverses the PR's add→update fallback).~~ **Superseded by D-SUM (0.6.0)** — same-day repeats now sum; the 409-skip survives only as the deploy-skew/delete-race backstop. | user decision (2026-06-30); superseded by user decision (2026-07-05). |
| **D4** | **Reconcile against the live production library**, not the test seed. | live DB read via the gitignored `DATABASE_URL` (see the `supabase` skill). |
| **D5** | **New rows use Apple Title-Case names**; the map's target set ⊆ library (verified). | invariant check (79 targets ⊆ 90 names). |
| **D6** | **iOS-only** sync; library additions surface in web + iOS pickers (expected). | Apple Health is iOS-only. |
| **D7** | **Sync-result = local notification + in-app status**, only on new (≥1); silent otherwise. *(Revised by D-SIL, 0.6.0: failures no longer notify — they surface passively in settings + the manual Sync Now.)* | user decision. |
| **D-BE** | **409-on-PK-collision** in `addWorkoutLog` (the one backend code change). | needed for clean skip vs retry. |
| **D-FIX** | **Anchor committed only after successful sync** (fixes a data-loss bug in the reference PR). | code review of the PR. |
| **D-S1** | **Sleep uses a rolling look-back window + overwrite, NOT an anchor.** A night is stitched from many incremental category samples, so an anchor delivers fragments, not the whole night; re-querying the last **14 days** (from the start of the earliest day) and recomputing from the full sample set is correct + idempotent under overwrite. The window is **not** floored at the connect date (that floor collapsed same-day connects to `[today, today]` and synced nothing). | user decision (always-overwrite) + HealthKit sleep sample model; same-day-connect bug fix (0.3.0). |
| **D-S2** | **Sleep metric = time asleep**, stored in `sleep_hours`, **HealthKit always overwrites** it (diet untouched) via POST-then-PUT-on-409 on the existing endpoints — **no backend change**. | user decision. |
| **D-S3** | **Separate "Sync Sleep" toggle on the same settings screen** — own permission, own program selection, own `healthkit.sleep.*` defaults; independent of the workout sync. | user decision. |
| **D-S4** | **Notify only on genuinely new nights** (`.created`); overwrites (`.updated`) are silent — mirrors the workout "notify on new" rule so the hourly re-sync isn't noisy. | user decision (D7 parity). |
| **D-S5** | **Per-program date-window write-scoping (workouts + sleep).** An aggregated item is written to a selected program **only if its date ∈ `[start_date, min(end_date, today)]`** for that program. Pure client-side (`ProgramContext.loadSyncWindows`, using `ProgramDTO.start_date/end_date`); backend still accepts any date. Fixes cross-program bleed ("synced 42 from eons ago"). If program windows can't be resolved (offline), the workout sync leaves its anchor uncommitted to avoid dropping data. | user decision (0.3.0). |
| **D-S6** | **In-Bed fallback for sleep** — a night with no asleep-stage samples uses its `.inBed` duration so manual / iPhone-only sleep still syncs (asleep wins when both exist). | user decision (0.3.0). |
| **D-LOCK** | **Apple Health sync respects the per-program admin lock (`admin_only_data_entry`).** A shared client predicate `ProgramContext.isDataEntryLocked(programId:)` (multi-program analogue of `dataEntryLocked`, mirrors the widget's `widgetProgramLockedForLogging` and web's `isDataEntryLocked`) gates every sync write. **Workouts:** an in-window locked program is skipped — not written, not collected into a confirmation page, not auto-confirmed — and the HealthKit **anchor is held** (like the offline case in D-S5) so held workouts re-sync once the program is unlocked (idempotent: workouts already written to unlocked programs return 409 `.duplicate`). **Sleep:** locked programs are skipped; no anchor, so the 14-day rolling window (D-S1) self-heals on unlock. The per-page commits (`commitWorkout/SleepPage`) guard defensively for a program locked mid-review. Settings renders a locked program **non-selectable** (lock icon + "Admin-only — can't sync") and shows an "N program(s) are admin-locked and won't sync" note on manual Sync Now; a still-selected locked program is skipped at runtime (selection isn't mutated, so it resumes on unlock). The backend `requireDataEntryAllowed` 403 → `.skipped` classification stays as the TOCTOU backstop. | user decision (0.5.0); `requireDataEntryAllowed` (403); widget lock arc (D-C1). |
| **D-SUM** | **Sum-on-conflict + applied-sample ledger (workouts; supersedes D3's skip).** Users do the same workout type more than once a day; the old 409-skip silently dropped every later same-type workout's minutes. The sync now sends **`on_duplicate:"sum"`** on `POST /api/workout-logs` — the backend atomically adds the minutes to the existing (program, member, type, date) row (200 `{summed:true}`; manual logs are added on top of, per user choice). Because a held anchor replays whole batches, idempotency is client-side: **`HealthKitAppliedLedger`** (UserDefaults `healthkit.appliedWorkoutUUIDs`, keyed **`sampleUUID|programId`** — a batch can succeed for program A and fail for B; value = workout ymd, pruned at 45 days). `aggregate` now yields per-sample `(uuid, minutes)`; **both** write paths (steady-state `performHealthKitSync` + `commitWorkoutPage`) filter to unapplied samples, send only their minutes, and mark the ledger **only on `.created`/`.summed`** (never on `.duplicate`/`.skipped`/`.retryable`). Ledger cleared on disconnect (safe — a reconnect's fresh connect-date bounds the first fetch). Manual same-day duplicates stay rejected (D-C6/D-C9); sleep needs no ledger (PUT-overwrite is idempotent). | user decision (2026-07-05); backend D-C9 (`workout-logs` 0.4.0). |
| **D-SIL** | **Silent auto-retry (workouts + sleep; revises D7's failure half).** The "Apple Health sync failed" banner fired on any transient network/5xx blip during automatic syncs — scary, yet the retry is automatic and lossless (held anchor / rolling window). Now: **no failure notification at all** (`notifyFailure` deleted); `performHealthKitSync`/`performSleepSync` return a **`HealthSyncResult`** (`synced(n)`/`failed`/`skipped`, `@discardableResult` — auto triggers discard it); a persisted **`healthkit[.sleep].lastSyncFailed`** flag (set on retryable/offline-windows, cleared on a clean run; HealthKit read errors don't touch it) drives a passive "Last sync couldn't reach the server — will retry automatically." caption on `AppleHealthSettingsView`; the manual **Sync Now** consumes the result and shows an inline error. `HealthSyncConfirmationView`'s interactive "Couldn't reach the server" notice stays. | user decision (2026-07-05). |
| **D-STEPS** | **Steps auto-sync (0.7.0) = the sleep model verbatim, on `HKQuantityType(.stepCount)`.** A third independent toggle (`healthkit.steps.*` defaults) writes each day's cumulative step count into `daily_health_logs.steps` via POST→409→PUT upsert (`writeHealthKitStepsLog`; sleep + diet untouched). Rolling 14-day `HKStatisticsCollectionQuery` (`.cumulativeSum`, one-day intervals — NOT anchored, D-S1), local-wake-date bucketing, per-program window scoping (D-S5), admin-lock skip (D-LOCK), notify-only-on-new (D-S4), silent auto-retry (D-SIL). First-sync confirmation (D-CONF) with a **workouts > sleep > steps** presentation priority (steps stashes into `deferredStepsConfirmation` and promotes after sleep). No new backend code — reuses the daily-health upsert; requires daily-health-logs 0.2.0's `steps` column (migration `006`). New files: `HealthKitService+Steps.swift`, `ProgramContext+HealthKitSteps.swift`; extends `ProgramContext(+Auth/+Analytics/+HealthSyncGating)`, `PendingSyncConfirmation`, `HealthKitSyncNotifier`, `HealthSyncConfirmationView`, `AppleHealthSettingsView`. | user request 2026-07-09 (steps-tracking plan, DC-8/DC-12); daily-health-logs 0.2.0 D-C4; the sleep-sync arc (D-S1–D-S6). |
| **D-CONF** | **First-sync confirmation, gated per program.** A large first influx is dangerous, so a program's rows are **gated** until the user confirms them — for **both** flows. Compute (`performHealthKit/SleepSync`) splits from commit: an **unconfirmed** program's in-window rows are collected into a `PendingSyncConfirmation` (one page per program) and presented globally from `AppRootView` (`HealthSyncConfirmationView`); a **confirmed** program writes silently as before. **Per-program tracking** (`healthkit[.sleep].confirmedProgramIds`) means the gate also catches a program added later or an interrupted connect; a **reconnect clears** the set so everything is reviewed again. **Selectable rows** (default checked): the glass tick writes only checked rows and records **un**checked rows' keys in `healthkit[.sleep].excludedKeys` so later silent syncs never re-add them (sleep keys pruned past the 14-day window; workout keys inert after the anchor advances). **Always confirm** any first sync with ≥1 new row; a **0-row** first sync confirms the program silently. **Dismiss = defer**: nothing is written for unconfirmed programs, the integration stays connected, and it re-offers next trigger — so the **workout anchor commits only after every program is confirmed cleanly** (a deferred flow leaves it uncommitted, and the same batch is safely re-offered). Workouts are presented before sleep when both are pending. | user decision. |

## 9. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **F1** | **`"Swim"`/`"Yoga Flow"`/`"HIIT Intervals"` etc. keep RaSi names** — Apple canonical names (`Swimming`…) are NOT added; the map reuses the curated rows. A deliberate consequence of additive-only (D1). | `HealthKitWorkoutTypeMap.swift`; migration `004` | Kept — renaming is a separate, data-migrating decision. |
| **F2** | **Duration only** — HealthKit distance/energy are not synced; only workout type + day + summed minutes. | `HealthKitService.aggregate` | Kept (faithful to the log model, which stores only `duration`). |
| **F3** | **Client-persisted sync state** — enabled/programs/anchor/last-sync live in `UserDefaults`, not the backend. | `ProgramContext+HealthKit.swift` | Kept (matches the PR; no server preference table). |
| **F4** | **Sleep "day" = the whole calendar day of the wake time** — any *asleep* sample (incl. daytime naps) whose end falls on date D is summed into D's total. No main-night-only isolation. | `HealthKitService.aggregateSleep` | Kept — a reasonable "total time asleep per day" default; revisit only if naps prove noisy. |
| **F5** | **Overwrite is destructive to a manual sleep value** — a web/iOS-entered `sleep_hours` for a night HealthKit also has is replaced on the next sync (per D-S2). `diet_quality` is never affected. | `writeHealthKitSleepLog` (PUT path) | Kept (explicit user choice); no source/provenance column to distinguish manual vs synced. |

## 10. Open questions

None blocking. Retryable-failure surfacing in settings is now done (D-SIL; admin-lock notes were D-LOCK).
Future: optionally add a server-side sync-preferences store if multi-device consistency is ever needed;
optionally add a source/provenance column so HealthKit sleep could spare manually-entered nights (see F5)
— the same column would let workout sum-on-conflict distinguish manual minutes if "add on top" (D-SUM)
ever needs revisiting.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.7.0 | 2026-07-09 | **Steps auto-sync (D-STEPS, iOS-only) — the sleep model verbatim.** A third independent "Steps" section on `AppleHealthSettingsView` (own permission for `HKQuantityType(.stepCount)`, program selection, "Days Synced" status, disconnect; `figure.walk`/`.teal`) reads each day's cumulative steps via a rolling 14-day `HKStatisticsCollectionQuery` (`.cumulativeSum`, D-S1) and writes them to `daily_health_logs.steps` via POST→409→PUT upsert (`writeHealthKitStepsLog`; sleep/diet untouched). Full D-S5/D-LOCK/D-S4/D-SIL/D-CONF rule set inherited, with the confirmation priority extended to **workouts > sleep > steps** (`deferredStepsConfirmation`). **No new backend code — one schema dependency:** requires daily-health-logs 0.2.0's migration `006` (`steps` column + the recreated at-least-one CHECK admitting steps-only rows). New files: `HealthKitService+Steps.swift`, `ProgramContext+HealthKitSteps.swift`; extended `ProgramContext(.swift/+Auth/+Analytics/+HealthSyncGating)`, `PendingSyncConfirmation.swift`, `HealthKitSyncNotifier.swift` (`notifyStepsSuccess`), `HealthSyncConfirmationView.swift`, `AppleHealthSettingsView.swift`. iOS-only; role N/A. Android analog = health-connect 0.2.0. Deploy order: daily-health-logs migration `006` → backend → iOS build. |
| 0.6.0 | 2026-07-05 | **Sum-on-conflict (D-SUM) + silent auto-retry (D-SIL)** — two user-reported fixes. (1) A same-type workout arriving in a **later** sync batch no longer 409-drops: the sync sends `on_duplicate:"sum"` and the backend atomically adds its minutes to the day's row (backend delta D-C9 in `workout-logs` 0.4.0 — the only server change; manual/widget/batch 409-reject unchanged). Idempotent under batch replays via the new **`HealthKitAppliedLedger`** (`healthkit.appliedWorkoutUUIDs`, keyed `sampleUUID\|programId`, 45-day prune; marked only on `.created`/`.summed`); `aggregate` reworked to per-sample `(uuid, minutes)`; both write paths (steady-state + `commitWorkoutPage`) filter to unapplied samples. D3 superseded. (2) The "Apple Health sync failed" banner (fired on any transient blip during automatic syncs, even partial successes) is **removed** (`notifyFailure` deleted); failures surface as a passive settings caption (persisted `healthkit[.sleep].lastSyncFailed`) + an inline error on manual Sync Now (`performHealthKitSync`/`performSleepSync` now return `HealthSyncResult`, `@discardableResult`). D7 revised. Touches: backend `services/logService.js` + `routes/logs.js`; iOS `APIClient+Workouts.swift`, `HealthKitService.swift`, **new** `HealthKitAppliedLedger.swift`, `ProgramContext.swift`, `ProgramContext+HealthKit.swift`, `ProgramContext+HealthKitSleep.swift`, `ProgramContext+HealthSyncGating.swift`, `HealthKitSyncNotifier.swift`, `AppleHealthSettingsView.swift`. |
| 0.5.0 | 2026-07-01 | **Apple Health sync respects the admin lock (D-LOCK).** The auto-sync no longer relies solely on the backend 403 for admin-locked programs (`admin_only_data_entry`) — it now pre-checks a shared `ProgramContext.isDataEntryLocked(programId:)` (mirrors the widget/web lock predicates). A locked program is skipped from workout + sleep writes, confirmation pages, and 0-row auto-confirm; for **workouts** the HealthKit **anchor is held** (like the offline case) so a workout logged while locked re-syncs on unlock (fixes silent data-loss-on-unlock; sleep already self-heals via its 14-day window). Per-page commits guard defensively for a mid-review lock. `AppleHealthSettingsView` renders locked programs non-selectable (lock icon + "Admin-only — can't sync") and shows an "N program(s) are admin-locked and won't sync" note on Sync Now. The backend 403 → `.skipped` stays as the TOCTOU backstop (no new backend/migration change). Touches: `ProgramContext.swift`, `ProgramContext+HealthKit.swift`, `ProgramContext+HealthKitSleep.swift`, `ProgramContext+HealthSyncGating.swift`, `AppleHealthSettingsView.swift`. iOS builds clean. |
| 0.4.0 | 2026-07-01 | **First-sync confirmation, gated per program (D-CONF)** — a large first influx (first connect / reconnect / program added later / interrupted connect) is no longer written silently for **either** flow. Compute now splits from commit: an **unconfirmed** program's in-window rows are collected into a `PendingSyncConfirmation` and reviewed one program per page in the new full-screen `HealthSyncConfirmationView` (presented globally from `AppRootView`), with an iOS-26 Liquid-Glass tick that writes only **checked** rows and advances. Per-program `confirmedProgramIds` gating (reconnect re-gates all); **selectable rows** with persisted `excludedKeys` so silent syncs never re-add unchecked rows (sleep pruned past the 14-day window); **always confirm** ≥1 row (0 rows confirms silently); **dismiss = defer** (stays connected, re-offers next trigger) — so the workout **anchor commits only after every program is confirmed cleanly**. New files: `PendingSyncConfirmation.swift`, `ProgramContext+HealthSyncGating.swift`, `HealthSyncConfirmationView.swift`. No backend/migration change; user live-tested; iOS builds clean. |
| 0.3.0 | 2026-07-01 | **Per-program date-window scoping + sleep-sync fixes.** (1) Both workouts + sleep now write an item to a selected program **only if its date ∈ that program's `[start_date, min(end_date, today)]`** (D-S5) — client-side via new `ProgramContext+HealthKitWindows.swift` (`loadSyncWindows`/`localYMD`/`date(_:isWithin:)`), reading `ProgramDTO.start_date/end_date`; fixes cross-program bleed ("synced 42 from eons ago"). Workout sync leaves its anchor uncommitted if windows can't be resolved (no data drop). (2) Sleep now actually syncs: `fetchSleepSamples` drops the connect-date floor (which collapsed same-day connects to `[today, today]`) → rolling **14-day** window from start-of-day (D-S1 revised, `sleepLookbackDays`→`sleepRecentDays`). (3) **In-Bed fallback** (D-S6) — nights without watch stage data use `.inBed` duration so manual / iPhone-only sleep syncs. No backend/migration change. iOS builds clean. |
| 0.2.0 | 2026-07-01 | **Sleep auto-sync (net-new, iOS-only).** Separate "Sync Sleep" toggle on the same settings screen (D-S3) reads `HKCategoryType(.sleepAnalysis)` and writes nightly *time asleep* to `daily_health_logs.sleep_hours` (D-S2). Rolling 3-night look-back re-query + upsert-overwrite instead of an anchor (D-S1); asleep-stage-only aggregation bucketed by local wake-date (F4); POST-then-PUT-on-409 reuses the existing daily-health endpoints with **no backend change** (D-S2). Notify only on new nights (D-S4). Overwrite is destructive to manual sleep (F5). New files: `HealthKitService+Sleep.swift`, `APIClient+DailyHealth.swift`, `ProgramContext+HealthKitSleep.swift`; Info.plist `NSHealthShareUsageDescription` broadened to mention sleep. iOS builds clean (0 errors). No migration, no Render/Vercel deploy. |
| 0.1.0 | 2026-06-30 | Initial SPEC + build. Ported PR #4's HealthKit sync to `apps/ios`, corrected for our curated `workouts_library`: additive library seed (migration `004`, D1/D2/D4/D5), full `HKWorkoutActivityType` map (16 reuse + ~63 new, invariant-verified), skip-on-conflict (D3) via a new 409-on-PK-collision in `addWorkoutLog` (D-BE), anchor-integrity fix (D-FIX), and a sync-result local notification (D7). iOS builds clean; user runs migration `004` + the Xcode capability/App-Store steps. `consumed_by=[ios]`. |
