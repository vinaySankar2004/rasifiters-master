# Feature: `apple-health` — Apple Health (HealthKit) workout + sleep + steps auto-sync (iOS)

> **Status:** 🚀 deployed (`apps/ios/` + backend touchpoints) · **Version:** 0.8.0 · **Apps (`consumed_by`):** `ios`
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
> POST/PUT endpoints; steps needs migration `006`). **Since 0.8.0 (iOS 1.5.0 (58))** the sync writes go through
> [`health-sync`](../health-sync/SPEC.md) (`POST /api/health-sync/batch`, `GET`/`PUT /api/health-sync/state`); the
> workout-logs / daily-health-logs write paths above serve only iOS ≤ 1.4.x (D-V2).

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
step count into `daily_health_logs.steps` (daily-health-logs 0.2.0, D-C4) — the exact sleep model verbatim,
just on the step-count quantity type.

**Health sync v2 (0.8.0, D-V2):** iOS 1.5.0 (58) keeps the same screens and toggles but syncs through one engine and
the server-side [`health-sync`](../health-sync/SPEC.md) contract — per-sample workouts with deletions, a server ledger,
server-remembered review + last success, the 30-day catch-up window (§3).

## 2. Why it exists (and the core correction vs the PR)

The reference PR assumed "the backend auto-creates workout types." Our backend does **not**: `workouts_library`
is a curated list with a UNIQUE `name`, and logging an unknown name only lazily materializes a **per-program
custom** `program_workouts` row (`logService.resolveProgramWorkout`). Apple Health's ~80 granular activity
types would therefore scatter inconsistent custom workouts across programs. So this feature **reconciles the
library first** (migration `004` seeds the Apple types) and maps each `HKWorkoutActivityType` to a real
library name — a synced log always resolves to a library-backed program workout.

## 3. Functionality (0.8.0 — iOS 1.5.0 (58); contract = [`health-sync`](../health-sync/SPEC.md) §8, D-C13 / D-C14)

- **Connect / disconnect** (`ProgramContext.connectHealthSync` / `disconnectHealthSync`; the per-kind
  `start*/perform*/clear*` entry points are thin wrappers) — request HealthKit read authorization for the kind;
  prefs live **per member** in `UserDefaults` (`HealthSyncPrefs`: enabled, program ids, connect date, last-sync
  date / count / failed, exclusions, local confirms, the workout anchor + upgrade marker). **Disconnect** is local
  only: it clears the toggle, programs, status, connect date and (workouts) the anchor + upgrade marker, keeps
  exclusions + confirms, and sends nothing (H2).
- **A run** (`HealthSyncEngine` — one per device, a singleton, so a background wake needs no scene): the rule-9
  upgrade (once) → `GET /programs` + `GET /api/health-sync/state` → HealthKit reads (`HealthSyncPlanner`) →
  `POST /api/health-sync/batch` (≤ 300 items, halved on 413) → `PUT /state` (`sync_success`) → advance or hold
  (rule 5) → one `sync.run` event. Never signs out.
- **Workouts** (`HealthKitService.fetchWorkoutChanges`) — an `HKAnchoredObjectQuery` returning added samples **and
  deleted ids**: one item per **sample** × selected program (per-sample minutes; `origin` = the recording app's
  bundle id), deletions as `deleted` items. No anchor → the rule-4 catch-up window (first sync: the connect date, or
  today − 30 d with the upgrade marker; never before the reconnect date). No client ledger and no client grouping —
  the server ledger dedups (health-sync D-C2; D-SUM superseded).
- **Mapping** (`HealthKitWorkoutTypeMap`) — every `HKWorkoutActivityType` → a `workouts_library` name; 16 close
  equivalents reuse curated rows, the rest use Apple Title-Case names seeded by migration `004`; `.other`/unknown →
  `"Other Workout"` (unchanged).
- **Filters before sending** — per-program date window (D-S5), admin lock (D-LOCK; a server `skipped_locked` holds
  like a client-side lock), review exclusions (D-CONF).
- **First-sync review (D-CONF, revised by D-V2)** — shown for a (program, kind) only when no integration's server
  row has `review_done_at` and there is no local confirm; confirming a page sends `PUT review_done` and then a
  `manual` run uploads what was reviewed; unchecked rows become exclusions once that `PUT` lands. Same UI:
  `PendingSyncConfirmation` + `HealthSyncConfirmationView` (presented from `AppRootView`), workouts > sleep > steps.
- **Triggers** — `launch` (incl. sign-in), `foreground`, `program_entry` (spaced ≥ 60 s, folded into a run in
  flight), `background` (HealthKit observers registered at every launch — workouts `.immediate`, sleep / steps
  `.hourly`), `connect`, `manual` (Sync Now) and `pull_to_refresh` (Summary) — the user triggers wait for a run in
  flight, then run.
- **iOS ≤ 1.4.x** (live until the version gate retires them) keep the pre-0.8.0 paths: `POST /api/workout-logs` +
  `on_duplicate:"sum"` behind `HealthKitAppliedLedger`, `POST → 409 → PUT /api/daily-health-logs`, the fixed 14-day
  sleep / steps re-query, review confirmations in `UserDefaults`.

### 3a. Sleep sync (0.2.0; v2 since 0.8.0)

- **Connect / disconnect** — `HKCategoryType(.sleepAnalysis)`; its own toggle, programs and status on the same
  `AppleHealthSettingsView` screen (D-S3).
- **Window** — not anchored: the rule-4 catch-up window `max(last success − 1 d, today − 30 d)`; first sync = the
  last 14 days (D-S1's fixed 14-day re-query superseded for 1.5.0).
- **Aggregation** (`HealthKitService.aggregateSleep`, unchanged) — the asleep stages bucketed by the local date of
  each sample's end (the wake day), summed to hours (2 dp, `0…24`); In-Bed fallback for stage-less nights (D-S6).
- **Write** — one `sleep` day-total item per (night × program) in the batch (set semantics; `unchanged` when value +
  source match) — no `POST → 409 → PUT` (D-S2's write path superseded; overwrite semantics kept). Notify on created
  days only (D-S4).

### 3b. Steps sync (0.7.0; v2 since 0.8.0) — the sleep model verbatim

- **Connect / disconnect** — `HKQuantityType(.stepCount)`; a third independent section (`figure.walk`, `.teal`).
- **Window** — the same catch-up window as sleep; first sync = the last 14 days.
- **Aggregation** (`HealthKitService+Steps.fetchStepsDailyTotals`, unchanged) — `HKStatisticsCollectionQuery`,
  `.cumulativeSum`, one-day buckets by local date, emitted when > 0.
- **Write** — one `steps` day-total item per (day × program) in the batch (no `POST → 409 → PUT`). Notify on created
  days only; review priority workouts > sleep > steps.

## 4. Data / schema touchpoints

- **`workouts_library`** — seeded (additive) by `apps/backend/sql/004_seed_healthkit_workout_types.sql`
  (`ON CONFLICT (name) DO NOTHING`; ~65 new rows + `Other Workout`). No renames, no other-table writes.
- **`workout_logs`** / **`daily_health_logs`** — since 0.8.0 written by the server's health-sync batch: the
  `health_sync_samples` ledger (per-sample adds, subtract on deletion) and `sleep_source` / `steps_source =
  healthkit` (health-sync §4–§5). iOS ≤ 1.4.x still write through `POST /api/workout-logs` (`on_duplicate:"sum"`) and
  `POST`/`PUT /api/daily-health-logs` (`steps` needs daily-health-logs migration `006`).
- **No apple-health-owned tables/columns.** Sync state = per-member `UserDefaults` + the server's
  `health_sync_state` (review done, last success — health-sync D-C9).

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

**Since 0.8.0** iOS 1.5.0 uses neither delta — it syncs through [`health-sync`](../health-sync/SPEC.md) (its own
backend feature); both stay live, unchanged, for iOS ≤ 1.4.x.

## 6. Error handling & edge cases (see §8 for the table)

- **Advance or hold (rule 5)** — the workout anchor and "Last Synced" advance only when every item of the run came
  back final and no selected in-window program was held (admin lock, a pending review, a server `skipped_locked`);
  a held run re-reads next time and the server answers `duplicate` / `unchanged` for anything already applied.
  Data with no resolvable program window holds the anchor and reports `failed` (faithful to 1.4).
- **Errors (health-sync rule 8)** — `401` → the sessions contract (one refresh, same batch); `413` → split; `426` →
  the update screen; `429` / `503` → wait `Retry-After`; 5xx / timeout / offline → retry the same (idempotent)
  batch next trigger; never a sign-out.
- **Silent auto-retry (D-SIL, kept)** — no failure notification; the settings screen shows the passive
  "will retry automatically" line, the manual **Sync Now** an inline error (`HealthSyncOutcome`).
- **Concurrency** — one run per device (the engine); screen triggers fold into it, user triggers wait for it.
- **Availability / permission** — `HKHealthStore.isHealthDataAvailable()` gates the UI; denied read auth yields
  empty reads (no crash); a HealthKit read failure leaves the status line untouched (`readFailed`).

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
| **D-S1** | *(The fixed 14-day window is superseded at v0.8.0 by D-V2 — the rule-4 catch-up window; 14 days stays the first-sync rule; still not anchored.)* **Sleep uses a rolling look-back window + overwrite, NOT an anchor.** A night is stitched from many incremental category samples, so an anchor delivers fragments, not the whole night; re-querying the last **14 days** (from the start of the earliest day) and recomputing from the full sample set is correct + idempotent under overwrite. The window is **not** floored at the connect date (that floor collapsed same-day connects to `[today, today]` and synced nothing). | user decision (always-overwrite) + HealthKit sleep sample model; same-day-connect bug fix (0.3.0). |
| **D-S2** | *(The POST-then-PUT-on-409 write is superseded at v0.8.0 by D-V2 — a batch day-total item; overwrite semantics kept.)* **Sleep metric = time asleep**, stored in `sleep_hours`, **HealthKit always overwrites** it (diet untouched) via POST-then-PUT-on-409 on the existing endpoints — **no backend change**. | user decision. |
| **D-S3** | **Separate "Sync Sleep" toggle on the same settings screen** — own permission, own program selection, own `healthkit.sleep.*` defaults; independent of the workout sync. | user decision. |
| **D-S4** | **Notify only on genuinely new nights** (`.created`); overwrites (`.updated`) are silent — mirrors the workout "notify on new" rule so the hourly re-sync isn't noisy. | user decision (D7 parity). |
| **D-S5** | **Per-program date-window write-scoping (workouts + sleep).** An aggregated item is written to a selected program **only if its date ∈ `[start_date, min(end_date, today)]`** for that program. Pure client-side (`ProgramContext.loadSyncWindows`, using `ProgramDTO.start_date/end_date`); backend still accepts any date. Fixes cross-program bleed ("synced 42 from eons ago"). If program windows can't be resolved (offline), the workout sync leaves its anchor uncommitted to avoid dropping data. | user decision (0.3.0). |
| **D-S6** | **In-Bed fallback for sleep** — a night with no asleep-stage samples uses its `.inBed` duration so manual / iPhone-only sleep still syncs (asleep wins when both exist). | user decision (0.3.0). |
| **D-LOCK** | **Apple Health sync respects the per-program admin lock (`admin_only_data_entry`).** A shared client predicate `ProgramContext.isDataEntryLocked(programId:)` (multi-program analogue of `dataEntryLocked`, mirrors the widget's `widgetProgramLockedForLogging` and web's `isDataEntryLocked`) gates every sync write. **Workouts:** an in-window locked program is skipped — not written, not collected into a confirmation page, not auto-confirmed — and the HealthKit **anchor is held** (like the offline case in D-S5) so held workouts re-sync once the program is unlocked (idempotent: workouts already written to unlocked programs return 409 `.duplicate`). **Sleep:** locked programs are skipped; no anchor, so the 14-day rolling window (D-S1) self-heals on unlock. The per-page commits (`commitWorkout/SleepPage`) guard defensively for a program locked mid-review. Settings renders a locked program **non-selectable** (lock icon + "Admin-only — can't sync") and shows an "N program(s) are admin-locked and won't sync" note on manual Sync Now; a still-selected locked program is skipped at runtime (selection isn't mutated, so it resumes on unlock). The backend `requireDataEntryAllowed` 403 → `.skipped` classification stays as the TOCTOU backstop. | user decision (0.5.0); `requireDataEntryAllowed` (403); widget lock arc (D-C1). |
| **D-SUM** | *(Superseded at v0.8.0 by D-V2 for iOS 1.5.0: per-sample items into the server ledger — no client ledger, no `on_duplicate:"sum"`; the old ledger is uploaded once as `legacy` items (health-sync rule 9) and deleted. Still the behavior of iOS ≤ 1.4.x.)* **Sum-on-conflict + applied-sample ledger (workouts; supersedes D3's skip).** Users do the same workout type more than once a day; the old 409-skip silently dropped every later same-type workout's minutes. The sync now sends **`on_duplicate:"sum"`** on `POST /api/workout-logs` — the backend atomically adds the minutes to the existing (program, member, type, date) row (200 `{summed:true}`; manual logs are added on top of, per user choice). Because a held anchor replays whole batches, idempotency is client-side: **`HealthKitAppliedLedger`** (UserDefaults `healthkit.appliedWorkoutUUIDs`, keyed **`sampleUUID|programId`** — a batch can succeed for program A and fail for B; value = workout ymd, pruned at 45 days). `aggregate` now yields per-sample `(uuid, minutes)`; **both** write paths (steady-state `performHealthKitSync` + `commitWorkoutPage`) filter to unapplied samples, send only their minutes, and mark the ledger **only on `.created`/`.summed`** (never on `.duplicate`/`.skipped`/`.retryable`). Ledger cleared on disconnect (safe — a reconnect's fresh connect-date bounds the first fetch). Manual same-day duplicates stay rejected (D-C6/D-C9); sleep needs no ledger (PUT-overwrite is idempotent). | user decision (2026-07-05); backend D-C9 (`workout-logs` 0.4.0). |
| **D-SIL** | **Silent auto-retry (workouts + sleep; revises D7's failure half).** The "Apple Health sync failed" banner fired on any transient network/5xx blip during automatic syncs — scary, yet the retry is automatic and lossless (held anchor / rolling window). Now: **no failure notification at all** (`notifyFailure` deleted); `performHealthKitSync`/`performSleepSync` return a **`HealthSyncResult`** (`synced(n)`/`failed`/`skipped`, `@discardableResult` — auto triggers discard it); a persisted **`healthkit[.sleep].lastSyncFailed`** flag (set on retryable/offline-windows, cleared on a clean run; HealthKit read errors don't touch it) drives a passive "Last sync couldn't reach the server — will retry automatically." caption on `AppleHealthSettingsView`; the manual **Sync Now** consumes the result and shows an inline error. `HealthSyncConfirmationView`'s interactive "Couldn't reach the server" notice stays. | user decision (2026-07-05). |
| **D-STEPS** | *(The 14-day window and the POST→409→PUT write are superseded at v0.8.0 by D-V2, as for sleep.)* **Steps auto-sync (0.7.0) = the sleep model verbatim, on `HKQuantityType(.stepCount)`.** A third independent toggle (`healthkit.steps.*` defaults) writes each day's cumulative step count into `daily_health_logs.steps` via POST→409→PUT upsert (`writeHealthKitStepsLog`; sleep + diet untouched). Rolling 14-day `HKStatisticsCollectionQuery` (`.cumulativeSum`, one-day intervals — NOT anchored, D-S1), local-wake-date bucketing, per-program window scoping (D-S5), admin-lock skip (D-LOCK), notify-only-on-new (D-S4), silent auto-retry (D-SIL). First-sync confirmation (D-CONF) with a **workouts > sleep > steps** presentation priority (steps stashes into `deferredStepsConfirmation` and promotes after sleep). No new backend code — reuses the daily-health upsert; requires daily-health-logs 0.2.0's `steps` column (migration `006`). New files: `HealthKitService+Steps.swift`, `ProgramContext+HealthKitSteps.swift`; extends `ProgramContext(+Auth/+Analytics/+HealthSyncGating)`, `PendingSyncConfirmation`, `HealthKitSyncNotifier`, `HealthSyncConfirmationView`, `AppleHealthSettingsView`. | user request 2026-07-09 (steps-tracking plan, DC-8/DC-12); daily-health-logs 0.2.0 D-C4; the sleep-sync arc (D-S1–D-S6). |
| **D-CONF** | *(Storage + reconnect superseded at v0.8.0 by D-V2: the review record is the server's `review_done_at` — any integration, device or platform; `review_done` is sent only after a confirmed page; a 0-row first sync is a local confirm only; exclusions are per member and recorded after the page's upload lands; **a reconnect no longer re-gates** (H2). The page UI and dismiss = defer are unchanged.)* **First-sync confirmation, gated per program.** A large first influx is dangerous, so a program's rows are **gated** until the user confirms them — for **both** flows. Compute (`performHealthKit/SleepSync`) splits from commit: an **unconfirmed** program's in-window rows are collected into a `PendingSyncConfirmation` (one page per program) and presented globally from `AppRootView` (`HealthSyncConfirmationView`); a **confirmed** program writes silently as before. **Per-program tracking** (`healthkit[.sleep].confirmedProgramIds`) means the gate also catches a program added later or an interrupted connect; a **reconnect clears** the set so everything is reviewed again. **Selectable rows** (default checked): the glass tick writes only checked rows and records **un**checked rows' keys in `healthkit[.sleep].excludedKeys` so later silent syncs never re-add them (sleep keys pruned past the 14-day window; workout keys inert after the anchor advances). **Always confirm** any first sync with ≥1 new row; a **0-row** first sync confirms the program silently. **Dismiss = defer**: nothing is written for unconfirmed programs, the integration stays connected, and it re-offers next trigger — so the **workout anchor commits only after every program is confirmed cleanly** (a deferred flow leaves it uncommitted, and the same batch is safely re-offered). Workouts are presented before sleep when both are pending. | user decision. |
| **D-V2** | **Health sync v2 (0.8.0 — iOS 1.5.0 (58); reliability-overhaul Phase 3 C2).** The three flows run in one `HealthSyncEngine` against [`health-sync`](../health-sync/SPEC.md) §8 (its D-C13 shared client rules + D-C14 iOS realization): per-sample workout items with deletions into the server ledger, sleep / steps day totals with set semantics, the 30-day catch-up window, rule-5 advance-or-hold, server-remembered review (once per program + kind across integrations, devices and platforms), the rule-9 upgrade from the 1.4 ledger (+ the confirmed lists carried over), per-member prefs, Disconnect local-only with a reconnect floor, sign-out pauses. Supersedes D-SUM, D-S1's window, D-S2's write path, D-STEPS' window + write, and D-CONF's storage + reconnect re-gate (markers above). Unchanged: D1–D5, D-FIX (now rule 5), D-S3–D-S6, D-LOCK, D-SIL, the screens. `reference_impl` drops `HealthKitAppliedLedger.swift`, `ProgramContext+HealthKitWindows.swift` and `APIClient+DailyHealth.swift` (now only the manual daily-health calls) and gains `Shared/Services/{HealthSyncEngine,HealthSyncPlanner,HealthSyncItems,HealthSyncUpgrade,HealthSyncPrefs,APIClient+HealthSync}.swift`. | Phase 3 C2 plan + approval amendments H1–H5 (2026-10-13); page SPEC `ios/apple-health` D-V2. |

## 9. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **F1** | **`"Swim"`/`"Yoga Flow"`/`"HIIT Intervals"` etc. keep RaSi names** — Apple canonical names (`Swimming`…) are NOT added; the map reuses the curated rows. A deliberate consequence of additive-only (D1). | `HealthKitWorkoutTypeMap.swift`; migration `004` | Kept — renaming is a separate, data-migrating decision. |
| **F2** | **Duration only** — HealthKit distance/energy are not synced; only workout type + day + summed minutes. | `HealthKitService.aggregate` | Kept (faithful to the log model, which stores only `duration`). |
| **F3** | **Client-persisted sync state** — enabled/programs/anchor/last-sync live in `UserDefaults`, not the backend. | `HealthSyncPrefs.swift` (per member since 0.8.0) | Partly superseded 0.8.0 — the review record and last success are server-side (`health_sync_state`); preferences stay on the device. |
| **F4** | **Sleep "day" = the whole calendar day of the wake time** — any *asleep* sample (incl. daytime naps) whose end falls on date D is summed into D's total. No main-night-only isolation. | `HealthKitService.aggregateSleep` | Kept — a reasonable "total time asleep per day" default; revisit only if naps prove noisy. |
| **F5** | **Overwrite is destructive to a manual sleep value** — a web/iOS-entered `sleep_hours` for a night HealthKit also has is replaced on the next sync (per D-S2). `diet_quality` is never affected. | `writeHealthKitSleepLog` (PUT path) | Kept (explicit user choice); no source/provenance column to distinguish manual vs synced. |

## 10. Open questions

None blocking. Retryable-failure surfacing in settings is now done (D-SIL; admin-lock notes were D-LOCK).
0.8.0 delivered the server-side sync state (review + last success) and the `sleep_source` / `steps_source`
provenance columns (health-sync D-C6/D-C9); sparing manually-entered nights (F5) would still need a reader of that
provenance. Synced preferences across devices remain out of scope.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.8.0 | 2026-10-13 | **Health sync v2 on iOS 1.5.0 (58) (D-V2; reliability-overhaul Phase 3 C2).** One `HealthSyncEngine` runs workouts + sleep + steps against [`health-sync`](../health-sync/SPEC.md) 0.2.0 (`POST /api/health-sync/batch`, `GET`/`PUT /state`): per-sample workouts with deletions (anchored query), server ledger instead of `HealthKitAppliedLedger` + `on_duplicate:"sum"`, sleep / steps day totals over the 30-day catch-up window instead of the 14-day `POST → 409 → PUT` re-query, server-side review once (H1), Disconnect local-only + reconnect floor (H2), per-member prefs, the rule-9 upgrade (legacy items + carried-over reviews). Superseded in place: D-SUM, D-S1 window, D-S2 write, D-STEPS window + write, D-CONF storage + reconnect re-gate; F3 partly. §1/§3/§3a/§3b/§4/§6 rewritten (iOS ≤ 1.4.x keeps the old paths); §5 notes 1.5.0 uses neither backend delta. `reference_impl` paths: − `HealthKitAppliedLedger.swift`, `ProgramContext+HealthKitWindows.swift`, `APIClient+DailyHealth.swift`; + `HealthSync{Engine,Planner,Items,Upgrade,Prefs}.swift`, `APIClient+HealthSync.swift`. Same screens. MINOR (`reference_impl` contract change). |
| 0.7.0 | 2026-07-09 | **Steps auto-sync (D-STEPS, iOS-only) — the sleep model verbatim.** A third independent "Steps" section on `AppleHealthSettingsView` (own permission for `HKQuantityType(.stepCount)`, program selection, "Days Synced" status, disconnect; `figure.walk`/`.teal`) reads each day's cumulative steps via a rolling 14-day `HKStatisticsCollectionQuery` (`.cumulativeSum`, D-S1) and writes them to `daily_health_logs.steps` via POST→409→PUT upsert (`writeHealthKitStepsLog`; sleep/diet untouched). Full D-S5/D-LOCK/D-S4/D-SIL/D-CONF rule set inherited, with the confirmation priority extended to **workouts > sleep > steps** (`deferredStepsConfirmation`). **No new backend code — one schema dependency:** requires daily-health-logs 0.2.0's migration `006` (`steps` column + the recreated at-least-one CHECK admitting steps-only rows). New files: `HealthKitService+Steps.swift`, `ProgramContext+HealthKitSteps.swift`; extended `ProgramContext(.swift/+Auth/+Analytics/+HealthSyncGating)`, `PendingSyncConfirmation.swift`, `HealthKitSyncNotifier.swift` (`notifyStepsSuccess`), `HealthSyncConfirmationView.swift`, `AppleHealthSettingsView.swift`. iOS-only; role N/A. Android analog = health-connect 0.2.0. Deploy order: daily-health-logs migration `006` → backend → iOS build. |
| 0.6.0 | 2026-07-05 | **Sum-on-conflict (D-SUM) + silent auto-retry (D-SIL)** — two user-reported fixes. (1) A same-type workout arriving in a **later** sync batch no longer 409-drops: the sync sends `on_duplicate:"sum"` and the backend atomically adds its minutes to the day's row (backend delta D-C9 in `workout-logs` 0.4.0 — the only server change; manual/widget/batch 409-reject unchanged). Idempotent under batch replays via the new **`HealthKitAppliedLedger`** (`healthkit.appliedWorkoutUUIDs`, keyed `sampleUUID\|programId`, 45-day prune; marked only on `.created`/`.summed`); `aggregate` reworked to per-sample `(uuid, minutes)`; both write paths (steady-state + `commitWorkoutPage`) filter to unapplied samples. D3 superseded. (2) The "Apple Health sync failed" banner (fired on any transient blip during automatic syncs, even partial successes) is **removed** (`notifyFailure` deleted); failures surface as a passive settings caption (persisted `healthkit[.sleep].lastSyncFailed`) + an inline error on manual Sync Now (`performHealthKitSync`/`performSleepSync` now return `HealthSyncResult`, `@discardableResult`). D7 revised. Touches: backend `services/logService.js` + `routes/logs.js`; iOS `APIClient+Workouts.swift`, `HealthKitService.swift`, **new** `HealthKitAppliedLedger.swift`, `ProgramContext.swift`, `ProgramContext+HealthKit.swift`, `ProgramContext+HealthKitSleep.swift`, `ProgramContext+HealthSyncGating.swift`, `HealthKitSyncNotifier.swift`, `AppleHealthSettingsView.swift`. |
| 0.5.0 | 2026-07-01 | **Apple Health sync respects the admin lock (D-LOCK).** The auto-sync no longer relies solely on the backend 403 for admin-locked programs (`admin_only_data_entry`) — it now pre-checks a shared `ProgramContext.isDataEntryLocked(programId:)` (mirrors the widget/web lock predicates). A locked program is skipped from workout + sleep writes, confirmation pages, and 0-row auto-confirm; for **workouts** the HealthKit **anchor is held** (like the offline case) so a workout logged while locked re-syncs on unlock (fixes silent data-loss-on-unlock; sleep already self-heals via its 14-day window). Per-page commits guard defensively for a mid-review lock. `AppleHealthSettingsView` renders locked programs non-selectable (lock icon + "Admin-only — can't sync") and shows an "N program(s) are admin-locked and won't sync" note on Sync Now. The backend 403 → `.skipped` stays as the TOCTOU backstop (no new backend/migration change). Touches: `ProgramContext.swift`, `ProgramContext+HealthKit.swift`, `ProgramContext+HealthKitSleep.swift`, `ProgramContext+HealthSyncGating.swift`, `AppleHealthSettingsView.swift`. iOS builds clean. |
| 0.4.0 | 2026-07-01 | **First-sync confirmation, gated per program (D-CONF)** — a large first influx (first connect / reconnect / program added later / interrupted connect) is no longer written silently for **either** flow. Compute now splits from commit: an **unconfirmed** program's in-window rows are collected into a `PendingSyncConfirmation` and reviewed one program per page in the new full-screen `HealthSyncConfirmationView` (presented globally from `AppRootView`), with an iOS-26 Liquid-Glass tick that writes only **checked** rows and advances. Per-program `confirmedProgramIds` gating (reconnect re-gates all); **selectable rows** with persisted `excludedKeys` so silent syncs never re-add unchecked rows (sleep pruned past the 14-day window); **always confirm** ≥1 row (0 rows confirms silently); **dismiss = defer** (stays connected, re-offers next trigger) — so the workout **anchor commits only after every program is confirmed cleanly**. New files: `PendingSyncConfirmation.swift`, `ProgramContext+HealthSyncGating.swift`, `HealthSyncConfirmationView.swift`. No backend/migration change; user live-tested; iOS builds clean. |
| 0.3.0 | 2026-07-01 | **Per-program date-window scoping + sleep-sync fixes.** (1) Both workouts + sleep now write an item to a selected program **only if its date ∈ that program's `[start_date, min(end_date, today)]`** (D-S5) — client-side via new `ProgramContext+HealthKitWindows.swift` (`loadSyncWindows`/`localYMD`/`date(_:isWithin:)`), reading `ProgramDTO.start_date/end_date`; fixes cross-program bleed ("synced 42 from eons ago"). Workout sync leaves its anchor uncommitted if windows can't be resolved (no data drop). (2) Sleep now actually syncs: `fetchSleepSamples` drops the connect-date floor (which collapsed same-day connects to `[today, today]`) → rolling **14-day** window from start-of-day (D-S1 revised, `sleepLookbackDays`→`sleepRecentDays`). (3) **In-Bed fallback** (D-S6) — nights without watch stage data use `.inBed` duration so manual / iPhone-only sleep syncs. No backend/migration change. iOS builds clean. |
| 0.2.0 | 2026-07-01 | **Sleep auto-sync (net-new, iOS-only).** Separate "Sync Sleep" toggle on the same settings screen (D-S3) reads `HKCategoryType(.sleepAnalysis)` and writes nightly *time asleep* to `daily_health_logs.sleep_hours` (D-S2). Rolling 3-night look-back re-query + upsert-overwrite instead of an anchor (D-S1); asleep-stage-only aggregation bucketed by local wake-date (F4); POST-then-PUT-on-409 reuses the existing daily-health endpoints with **no backend change** (D-S2). Notify only on new nights (D-S4). Overwrite is destructive to manual sleep (F5). New files: `HealthKitService+Sleep.swift`, `APIClient+DailyHealth.swift`, `ProgramContext+HealthKitSleep.swift`; Info.plist `NSHealthShareUsageDescription` broadened to mention sleep. iOS builds clean (0 errors). No migration, no Render/Vercel deploy. |
| 0.1.0 | 2026-06-30 | Initial SPEC + build. Ported PR #4's HealthKit sync to `apps/ios`, corrected for our curated `workouts_library`: additive library seed (migration `004`, D1/D2/D4/D5), full `HKWorkoutActivityType` map (16 reuse + ~63 new, invariant-verified), skip-on-conflict (D3) via a new 409-on-PK-collision in `addWorkoutLog` (D-BE), anchor-integrity fix (D-FIX), and a sync-result local notification (D7). iOS builds clean; user runs migration `004` + the Xcode capability/App-Store steps. `consumed_by=[ios]`. |
