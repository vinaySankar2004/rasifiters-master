# Feature: `health-connect` — Health Connect (Samsung Health) workout + sleep + steps auto-sync (Android)

> **Status:** 🚀 deployed (`apps/android/` + existing backend endpoints) · **Version:** 0.4.0 ·
> **Apps (`consumed_by`):** `android`
> **Provenance:** the Android analog of the iOS [`apple-health`](../apple-health/SPEC.md) feature (0.7.0),
> re-expressed on **Health Connect** (`androidx.health.connect:connect-client`) instead of HealthKit.
> Same behavioral contract, same backend endpoints, same decision set (D-S5/D-CONF/D-LOCK/D-SUM/D-SIL +
> 0.2.0 D-STEPS) — ported 1:1; deviations are Health-Connect-idiom only (below). No new backend code; the
> only schema dependency is daily-health-logs 0.2.0's `steps` column (migration `006`, added there).
> **Depends on:** [`auth`](../auth/SPEC.md) (JWT), [`programs`](../programs/SPEC.md) /
> [`program-memberships`](../program-memberships/SPEC.md) (target programs + the `admin_only_data_entry`
> lock), [`workouts`](../workouts/SPEC.md) (the library the map targets — the Apple types seeded by
> `sql/004`), [`workout-logs`](../workout-logs/SPEC.md) (the write endpoint + `on_duplicate:"sum"`), and —
> for sleep + steps — [`daily-health-logs`](../daily-health-logs/SPEC.md) **0.2.0** (`sleep_hours` + `steps`
> columns + its POST/PUT endpoints; steps needs migration `006`). **Since 0.3.0 (Android 1.1.0 (5))** the sync writes
> go through [`health-sync`](../health-sync/SPEC.md) (`POST /api/health-sync/batch`, `GET`/`PUT /api/health-sync/state`);
> the workout-logs / daily-health-logs write paths serve only Android 1.0.0 (D-V2).

---

## 1. What it is

An **Android-only** integration that reads workouts, **sleep, and steps** from **Health Connect** (Samsung
Health and any other Health-Connect writer) and auto-logs them to the user's selected RaSi Fiters programs —
exactly as iOS `apple-health` does from HealthKit. The user connects in **Account → Health Connect**, picks
which programs to sync into, and thereafter Health Connect workouts appear as workout logs, nightly time
asleep populates `daily_health_logs.sleep_hours`, and daily step totals populate `daily_health_logs.steps`.
Because Health Connect is Android-only, there is **no web analogue**; the cross-surface effects are the
enlarged workout library (already seeded by `apple-health`'s migration `004`) and the sleep/steps values in
the existing web/iOS daily-health views.

**Sleep** and **Steps** (0.2.0) are each a **separate toggle on the same settings screen** (own permission,
program selection, and status), independent of the workout toggle and of each other.

## 2. Why it exists (same reconciliation as Apple Health)

The backend does **not** auto-create workout types: `workouts_library` is curated with a UNIQUE `name`, and
logging an unknown name lazily materializes a per-program **custom** row. So a synced log must resolve to a
real library name. This feature reuses the **same library** `apple-health` reconciled (migration `004`
already seeded the Apple types + `Other Workout`) and maps each Health Connect
`ExerciseSessionRecord.exerciseType` to a real `workouts_library` name — **every target is a subset of the
iOS map's targets** (verified against `sql/004`), so a synced Android log is always library-backed.

## 3. Functionality (0.3.0 — Android 1.1.0 (5); contract = [`health-sync`](../health-sync/SPEC.md) §8, D-C13 / D-C15)

- **Connect / disconnect** (`HealthSyncController.enable{Workouts,Sleep,Steps}AfterPermission` /
  `disconnect{Workouts,Sleep,Steps}`) — request Health Connect **read** authorization via the Health Connect
  permission UI (`PermissionController.createRequestPermissionResultContract`, **not** a runtime dialog); state lives
  **per member** in the `rasi.health` `SharedPreferences` (`HealthStore`, keys `m.<memberId>.*`, excluded from Auto
  Backup + device transfer). **Disconnect** is local only: it clears the toggle, programs, status, connect date and
  the changes token (+ the upgrade marker), keeps exclusions + confirmed reviews, sends nothing (H2). **Reconnect
  state:** the settings re-read the granted permissions on open and after a grant; a connected flow whose permission
  was revoked shows "Reconnect Health Connect" instead of "will sync automatically".
- **A run** (`HealthSyncRunner`, planned by `HealthSyncItems`): the rule-9 upgrade (`HealthSyncUpgrade`, once) →
  `GET /api/health-sync/state` → Health Connect reads → `POST /api/health-sync/batch` (≤ 300 items, halved on 413;
  old-ledger `legacy` items first) → `PUT /state` → advance or hold (rule 5) → one `sync.run` event. Pinned to the
  member it started for; the sign-out teardown cancels it. Never signs out.
- **Workouts** (`HealthConnectManager`) — the **Changes API** with paging (`pageToken`): added
  `ExerciseSessionRecord`s become one item per **record** × selected program, `DeletionChange.recordId`s become
  `deleted` items. A missing / expired token mints a fresh token **first**, then reads the rule-4 catch-up window
  (first sync: the connect date, or today − 30 d with the upgrade marker; never before the reconnect date). No client
  ledger, no aggregation, no `on_duplicate:"sum"` — the server ledger dedups (health-sync D-C2; D-SUM superseded).
- **Mapping** (`HealthConnectWorkoutTypeMap`) — every `ExerciseSessionRecord.EXERCISE_TYPE_*` → a `workouts_library`
  name (targets ⊆ the iOS map's; unmapped / `OTHER_WORKOUT` → `"Other Workout"`) — unchanged.
- **Filters before sending** — D-S5 window, D-LOCK (a server `skipped_locked` holds like a client-side lock), D-CONF
  exclusions.
- **First-sync review (D-CONF, revised by D-V2)** — shown only when no integration's server row has
  `review_done_at` and there is no local confirm; `review_done` is sent only after a confirmed page (queued until
  `PUT /state` accepts); unchecked rows become exclusions once that page's upload succeeds. Same UI
  (`HealthSyncConfirmationScreen`, workouts > sleep > steps; system back = defer).
- **Triggers** — `launch` (incl. sign-in), `foreground` (`RootScreen` `ON_RESUME`) and `program_entry` (`AppScaffold`)
  run at most once a minute and skip while a run is in flight; `connect` (after a grant), `manual` (**Sync Now** —
  one run of all flows, each judged by its own outcome) and `pull_to_refresh` (Summary) wait for an in-flight run,
  then run. **No OS-push background sync (H-1).**
- **Android 1.0.0 (3)/(4)** (live until gated) keep the pre-0.3.0 paths: `POST /api/workout-logs` +
  `on_duplicate:"sum"` behind the client ledger, `POST → 409 → PUT /api/daily-health-logs`, the fixed 14-day
  sleep / steps window.

### 3a. Sleep sync

- **Connect / disconnect** — `SleepSessionRecord`; its own toggle, programs and status on the same screen.
- **Window** — the rule-4 catch-up window (first sync: the last 14 days), read from **start − 1 day** so a night that
  began the evening before is whole; only days ≥ start are sent.
- **Aggregation** (`aggregateSleep`, unchanged) — the asleep stages bucketed by the local date of each stage's end
  (wake day), summed to hours (2 dp, 0…24); In-Bed fallback for stage-less sessions (D-S6).
- **Write** — one `sleep` day-total item per (night × program) in the batch (set semantics) — no `POST → 409 → PUT`.
  Notify on created days only.

### 3b. Steps sync (0.2.0; v2 since 0.3.0) — the sleep model verbatim

- **Connect / disconnect** — `StepsRecord` (`READ_STEPS`); a third independent section (`DirectionsWalk`, teal).
- **Window** — the same catch-up window as sleep (first sync: the last 14 days).
- **Aggregation** (`fetchStepsDailyTotals`, unchanged) — `aggregateGroupByPeriod` (`COUNT_TOTAL`, one-day periods;
  dedups overlapping sources), emitted when > 0.
- **Write** — one `steps` day-total item per (day × program) in the batch. Notify on created days only.

## 4. Data / schema touchpoints

- **`workouts_library`** — already seeded by `apple-health`'s `sql/004`. This feature **adds nothing** —
  the Android map targets a subset of those names.
- **`workout_logs`** / **`daily_health_logs`** — since 0.3.0 written by the server's health-sync batch (the
  `health_sync_samples` ledger; `sleep_source` / `steps_source = health_connect`). Android 1.0.0 still writes through
  `POST /api/workout-logs` (`on_duplicate:"sum"`) and `POST`/`PUT /api/daily-health-logs`.
- **No health-connect-owned tables/columns.** Sync state = the per-member `rasi.health` `SharedPreferences` + the
  server's `health_sync_state`. The manifest carries `android.permission.health.READ_STEPS` (0.2.0).

## 5. The backend delta

**None of its own.** Android 1.1.0 (5) syncs through [`health-sync`](../health-sync/SPEC.md) (a backend feature in its
own right); Android 1.0.0 keeps the `workout-logs` D-C9 `on_duplicate:"sum"` path and the daily-health
POST-then-PUT-on-409 upsert (daily-health-logs 0.2.0's `steps` column, migration `006`), both live and unchanged.

## 6. Error handling & edge cases

- **Advance or hold (rule 5)** — the changes token and "Last Synced" advance only when every item came back final and
  nothing was held (a locked selected program or a server `skipped_locked`); `sync_success` goes out per (program,
  kind) whose whole flow advanced. Selected programs with data but no resolvable window hold the flow and report
  `failed` (faithful to 1.4). A run with nothing to send reports `skipped`.
- **Errors (health-sync rule 8)** — `401` → the sessions contract; `413` → split; `426` → the update screen; one
  `429` / `503` with `Retry-After` ≤ 5 s waited out, else retried next trigger; 5xx / timeout / offline → retry the
  same (idempotent) batch later; never a sign-out.
- **Silent auto-retry (D-SIL, kept)** — no failure notification; passive settings caption; the manual **Sync Now**
  shows an inline error per flow.
- **Concurrency** — one run at a time (`runMutex`): user triggers wait for it, automatic ones skip (`tryLock`).
- **Availability / permission** — `HealthConnectClient.getSdkStatus` gates the UI (an "isn't available" card when
  the provider is missing / needs an update); a revoked permission shows the Reconnect row.

## 7. Flags / env

None. The Health Connect **read** permissions (`android.permission.health.READ_EXERCISE`,
`…READ_SLEEP`, and — 0.2.0 — `…READ_STEPS`), the provider `<queries>`, and the permissions-rationale
intent-filters ship in the `AndroidManifest`. Play Console needs a Health Connect permissions declaration at submission (deploy-time,
user-run). Health Connect is built into Android 14+ (API 34); on 13 and lower it is a standalone provider
app.

**0.3.1 (Phase 4 Android build):** `HealthConnectSettingsScreen` shows the People disclosure footnote `Synced workouts
are visible to members of your programs unless you turn on Hide my activity in My Profile.` ([people](../people/SPEC.md)
D-C12, U-1 (b)); `HealthSyncNotifier`'s notification uses the monochrome status-bar icon `ic_stat_notification` (was
the launcher icon — notifications D-C31), and its id (`HEALTH_NOTIFICATION_ID` 4201) is kept when the Inbox clears
posted pushes. Sleep and steps are never shown to co-members.

## 8. Decisions made (inherited from `apple-health`, on Health Connect)

| ID | Decision | Rests on |
|----|----------|----------|
| **D1/D2/D4/D5** | **Additive + map**, targeting the library `apple-health` already seeded (`sql/004`); Android map targets ⊆ iOS map targets (verified). | the Apple Health feature; `sql/004`. |
| **D-SUM** | *(Superseded at v0.3.0 by D-V2 for Android 1.1.0: per-record items into the server ledger; the 1.0.0 ledger is uploaded once as `legacy` items and retired. Still the behavior of 1.0.0.)* **Sum-on-conflict + applied-sample ledger** (`SharedPreferences`, keyed `sampleUUID\|programId`, 45-day prune; marked only on `created`/`summed`). Both write paths (steady-state + page-commit) filter to unapplied samples. | Apple Health D-SUM; backend `workout-logs` D-C9. |
| **D-S5** | **Per-program date-window scoping** — an item writes to a program only if its date ∈ `[start_date, min(end_date, today)]`. Empty windows (offline) → hold the token / skip, don't dump unscoped data. | Apple Health D-S5. |
| **D-CONF** | *(Superseded in part at v0.3.0 by D-V2: the review record is the server's `review_done_at` (any integration / device / platform); a 0-row first sync is a local confirm only; **a reconnect no longer re-gates** (H2); exclusions recorded after the page's upload succeeds. Page UI + defer unchanged.)* **First-sync confirmation, gated per program** — unconfirmed programs' in-window rows are reviewed one page per program (`HealthSyncConfirmationScreen`); selectable rows (default checked); unchecked rows recorded as excluded; 0-row first sync auto-confirms; dismiss = defer; token commits only after all confirmed cleanly. | Apple Health D-CONF. |
| **D-LOCK** | **Admin-lock skip** — an in-window `admin_only_data_entry`-locked program (viewer not global/program admin) is skipped from writes, confirmation pages, and 0-row auto-confirm; **workouts hold the token** (re-sync on unlock), **sleep** self-heals via its 14-day window. Settings renders locked programs non-selectable + a lock note. | Apple Health D-LOCK; `isDataEntryLocked(programId)`. |
| **D-SIL** | **Silent auto-retry** — no failure notification; passive settings caption + manual Sync Now inline error; `HealthSyncResult` returned. | Apple Health D-SIL. |
| **D-S1/D-S2/D-S6** | *(The 14-day window and the POST-then-PUT-on-409 write are superseded at v0.3.0 by D-V2 — the catch-up window (first sync 14 d) and a batch day-total item; overwrite semantics + the In-Bed fallback kept.)* **Sleep** = rolling 14-day re-query + overwrite (not anchored), time-asleep → `sleep_hours` via POST-then-PUT-on-409, In-Bed fallback for stage-less sessions. | Apple Health sleep decisions. |
| **D-STEPS** | *(Window + write superseded at v0.3.0 by D-V2, as for sleep.)* **Steps auto-sync (0.2.0) = the sleep model verbatim, on `StepsRecord`.** A third independent toggle (`hc.steps.*`) writes each day's cumulative steps into `daily_health_logs.steps` via POST→409→PUT upsert (`writeSteps`; sleep + diet untouched). Rolling 14-day `aggregateGroupByPeriod` (`COUNT_TOTAL`, one-day periods — the aggregate API dedups overlapping sources, the HC analogue of iOS `.cumulativeSum`; not anchored, D-S1), per-program window scoping (D-S5), admin-lock skip (D-LOCK), notify-only-on-new (D-S4), silent auto-retry (D-SIL), first-sync confirmation (D-CONF) with a **workouts > sleep > steps** priority (`deferredSteps`). No ledger/token (PUT + the 14-day window are idempotent/self-healing). Manifest gains `READ_STEPS`. Requires daily-health-logs 0.2.0's `steps` column (migration `006`). | iOS `apple-health` D-STEPS (0.7.0); daily-health-logs 0.2.0 D-C4; steps-tracking plan DC-8/DC-12. |
| **H-CHG** | *(Refined at v0.3.0 by D-V2: every read pages; deletions are synced; an expired / missing token is re-minted before the catch-up window read, not a full re-read from the connect date.)* **Changes API is the anchor analog** — Health Connect's `getChangesToken`/`getChanges` replaces `HKAnchoredObjectQuery`; first sync uses `readRecords` from the connect date (the Changes token carries no history), then the token drives incrementals; expired token → full re-read + fresh token. | Health Connect API shape. |
| **D-V2** | **Health sync v2 (0.3.0 — Android 1.1.0 (5); reliability-overhaul Phase 3 C3).** The three flows run one `HealthSyncRunner` against [`health-sync`](../health-sync/SPEC.md) §8 (its D-C13 shared client rules + D-C15 Android realization, incl. the recorded rule-9 upgrade-window deviation): per-record workout items with deletions into the server ledger, sleep / steps day totals with set semantics over the 30-day catch-up window, rule-5 advance-or-hold with per-flow `sync_success`, server-remembered review once, the rule-9 upgrade from the 1.0.0 ledger (+ confirmed lists carried over), per-member store, Disconnect local-only with a reconnect floor, the Reconnect row, named triggers (automatic ≥ 60 s apart; user triggers wait), Sync Now = one run judged per flow. Supersedes D-SUM, the D-S1/D-S2 and D-STEPS window + write, D-CONF's reconnect re-gate + storage; refines H-CHG (markers above). Unchanged: D1/D2/D4/D5, D-S5, D-LOCK, D-SIL, D-S6, the screens. `reference_impl` gains `health/{HealthSyncItems,HealthSyncRunner,HealthSyncUpgrade}.kt`. Screen-level detail: page SPEC `android/health-connect` D-REL3-1–6. | Phase 3 C3 plan + approval amendments H1–H4 (2026-10-13); Android `157578f`. |
| **D-ACTIVE** | **The settings program list (0.4.0; reliability-overhaul Phase 4 polish #27, amendments PA10 — Apple Health D-ACTIVE on Health Connect).** `HealthConnectSettingsScreen` lists **only programs you're active in** (invited / requested never receive synced data — the server's `skipped_not_member`); the list loads on every entry and again when back online after a failure; its load state (spinner / `Couldn't load this` + Retry) shows **once**, in the first enabled sync section — never "No programs available" while loading or after a failure; after a fresh successful load, selected ids whose program isn't active are dropped through the controller's own toggles and persisted. Program rows are announced as checkboxes with their checked state (frontend-kit D-KIT-22). | amendments PA10; `ui/health/HealthConnectSettingsScreen.kt`. |

## 9. Flagged characteristics kept as-is

| ID | Characteristic | Where | Cleanup candidate? |
|----|----------------|-------|--------------------|
| **H-1** | **No OS-push background sync** — Health Connect offers no HealthKit-style immediate background delivery; sync runs on app triggers (launch/auth/foreground/program-entry). | `HealthSyncController.onTrigger` | Kept for v1; a `WorkManager` periodic sync could be added later. |
| **F1/F2/F3** | Same as Apple Health — reused curated names (no Apple-canonical renames), **duration only** (no distance/energy), **client-persisted** sync state (since 0.3.0 the review record + last success are server-side). | `HealthConnectWorkoutTypeMap`, `aggregate`, `HealthStore` | Kept (faithful to the log model + the additive policy). |
| **F5** | **Overwrite is destructive to a manual sleep value** — a night Health Connect also has replaces a web/iOS-entered `sleep_hours` (diet untouched). | `writeSleep` PUT path | Kept (explicit user choice; no provenance column). |

## 10. Open questions

None blocking. Future: an optional `WorkManager` periodic background sync (H-1). 0.3.0 delivered the server-side
sync state and the provenance columns (health-sync D-C6/D-C9); sparing manually-entered nights (F5) would still need a
reader of that provenance.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.4.0 | 2026-10-13 | **D-ACTIVE — active-only program list** on the Health Connect settings, one load state (first enabled section) + Retry + reload on reconnect, prune of no-longer-active selections after a fresh load; 48 dp checkbox rows. **MINOR** (selection rule; no backend change). Reliability-overhaul Phase 4 polish #27 / #36 (`0b0a0a3`, built; ships in the Phase 4 store release). |
| 0.3.1 | 2026-10-13 | **People disclosure footnote + monochrome notifier icon (Phase 4 Android build).** `HealthConnectSettingsScreen` footnote (synced workouts visible to co-members unless Hide my activity); `HealthSyncNotifier` uses `ic_stat_notification`; its notification survives the Inbox's mark-all tray clear. §7. PATCH. |
| 0.3.0 | 2026-10-13 | **Health sync v2 on Android 1.1.0 (5) (D-V2; reliability-overhaul Phase 3 C3).** One `HealthSyncRunner` runs workouts + sleep + steps against [`health-sync`](../health-sync/SPEC.md) 0.2.0: Changes API with paging + deletions (token minted before the window read), server ledger instead of the client ledger + `on_duplicate:"sum"`, day totals over the 30-day catch-up window (sleep read from start − 1 d) instead of the 14-day `POST → 409 → PUT`, server-side review once, Disconnect local-only (keeps exclusions + reviews) + reconnect floor, the Reconnect row, per-member `rasi.health` store (1.0.0 keys adopted once), rule-9 upgrade with the recorded upgrade-window deviation. Superseded in place: D-SUM, D-S1/D-S2 + D-STEPS window + write, D-CONF re-gate + storage; H-CHG refined. §1 header, §3/§3a/§3b/§4/§5/§6 rewritten (Android 1.0.0 keeps the old paths). `reference_impl` += `HealthSyncItems.kt`, `HealthSyncRunner.kt`, `HealthSyncUpgrade.kt`. Same screens. MINOR (`reference_impl` contract change). |
| 0.2.0 | 2026-07-09 | **Steps auto-sync (D-STEPS, Android-only) — the sleep model verbatim, on `StepsRecord`.** A third independent "Steps" section on `HealthConnectSettingsScreen` (own `READ_STEPS` permission, program selection, "Days Synced" status, disconnect; `DirectionsWalk` icon, teal `#14b8a6`) reads each day's steps via a rolling 14-day `aggregateGroupByPeriod` (`COUNT_TOTAL`, one-day periods — dedups overlapping sources, D-S1) and writes them to `daily_health_logs.steps` via POST→409→PUT upsert (`writeSteps`; sleep/diet untouched). Full D-S5/D-LOCK/D-S4/D-SIL/D-CONF rule set inherited, confirmation priority extended to **workouts > sleep > steps** (`deferredSteps`). **No new backend code — one schema dependency:** requires daily-health-logs 0.2.0's migration `006` (`steps` column + at-least-one CHECK). Files: `health/{HealthModels,HealthConnectManager,HealthStore,HealthSyncNotifier,HealthSyncController}.kt`, `ui/health/{HealthConnectSettingsScreen,HealthSyncConfirmationScreen}.kt`; `AndroidManifest.xml` gains `READ_STEPS`. Android-only; iOS analog = apple-health 0.7.0. Deploy order: daily-health-logs migration `006` → backend → Android build. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. |
| 0.1.0 | 2026-07-08 | **Initial SPEC + build (Android Phase H).** Ported the iOS `apple-health` 0.6.0 integration to Health Connect: `health/{HealthConnectManager,HealthConnectWorkoutTypeMap,HealthStore,HealthAppliedLedger(in HealthStore),HealthModels,HealthDates,HealthSyncNotifier,HealthSyncController}.kt` + `ui/health/{HealthConnectSettingsScreen,HealthSyncConfirmationScreen}.kt`. Incremental workouts via the Changes API (anchor analog, H-CHG), rolling 14-day sleep window, the full D-S5/D-CONF/D-LOCK/D-SUM/D-SIL rule set, and status-code-aware writes (new raw `postWorkoutLog`/`postDailyHealthLogRaw`/`putDailyHealthLogRaw` on `ApiService`). `ProgramContext` gained `isDataEntryLocked(programId)` + owns a `HealthSyncController`; account rows (Program tab + picker sheet) + a full-screen confirmation overlay + launch/auth/resume/program-entry triggers wired. No backend change, no migration — reuses the already-live `workout-logs` D-C9 + daily-health upsert. `./gradlew :app:assembleDebug` = BUILD SUCCESSFUL. |
