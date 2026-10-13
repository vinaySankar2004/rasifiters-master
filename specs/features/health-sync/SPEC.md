# Feature: `health-sync` — health sync v2 (one batch upload per run, permanent sample ledger, server sync state)

> **Status:** 🚀 deployed (backend, live on Render 2026-10-13; reliability-overhaul Phase 3 R2) · **Version:** 0.1.0 · **Apps (`consumed_by`):** none yet — `[]` until the bundled iOS (HealthKit) + Android (Health Connect) reliability releases adopt §8, then `ios` `android` (web has no health sync)
> **Provenance:** **NET-NEW** — no legacy equivalent. Contract: [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §4 items 2–9 (approved 2026-10-11; D-6, D-7, D-8); evidence: [`discovery/W3`](../../initiatives/reliability-overhaul/discovery/W3-ios-health-sync.md) (iOS), [`discovery/W4`](../../initiatives/reliability-overhaul/discovery/W4-android-health-sync.md) (Android).
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken`) · [`app-config`](../app-config/SPEC.md) (`blockUnversionedAndroid`, applied inside this router — D-C10) · [`observability`](../observability/SPEC.md) (`utils/rateLimit.js`; the `sync.run` event, its §8.1) · [`programs`](../programs/SPEC.md) + [`program-memberships`](../program-memberships/SPEC.md) (the `admin_only_data_entry` lock + membership, via their models) · [`workout-logs`](../workout-logs/SPEC.md) (`resolveProgramWorkout`, `isValidDateString`; writes `workout_logs`) · [`program-workouts`](../program-workouts/SPEC.md) (`resolveProgramWorkout` reads / creates `program_workouts` rows; the legacy lookup reads them) · [`workouts`](../workouts/SPEC.md) (the `workouts_library` name match) · [`daily-health-logs`](../daily-health-logs/SPEC.md) (writes `daily_health_logs` incl. its D-C6 provenance columns).
> **Supersedes for NEW builds only:** the sync writers' `POST /api/workout-logs` + `on_duplicate:"sum"` (workout-logs D-C9) and the `POST → 409 → PUT /api/daily-health-logs` round trip. Both stay exactly as they are for the live binaries (§7).

---

## 1. What it is

One contract for automatic health sync on iOS (HealthKit) and Android (Health Connect). The only differences between
the platforms are platform idiom (§8).

1. **`POST /api/health-sync/batch`** — one idempotent upload per sync run. It carries workouts (each with its Health
   sample id), workout deletions, and day totals for sleep and steps. It returns one result per item and never a 409
   (§3.2).
2. **A permanent sample ledger** (`health_sync_samples`) — every workout sample the server applied, keyed by
   member + program + integration + sample id.
   - A re-sent, re-read or restored sample comes back `duplicate`.
   - A Health deletion subtracts exactly that sample's minutes, never below 0.
   - Workouts that overlap in time count once when they come from different apps or different integrations.
   - A single workout over 12 h is refused, and so is any sample that would take a synced day over 24 h (§4.2).
3. **Per-field provenance** on `daily_health_logs`: `sleep_source` and `steps_source`. Diet stays manual (§4.3).
4. **Server-remembered sync state** (`health_sync_state`), per member + program + integration + kind:
   - whether the first-sync review was done (it is shown once);
   - the last successful sync, which anchors the catch-up window (capped at 30 days).

   After a reinstall, a re-sign-in as the same member, or a move to another device, sync resumes with no review screen
   and no gap (§3.3–§3.4, §8).

## 2. Why it exists — where today's 409s and double counts come from

### The 300–1,200 daily 409s

Source: Render `http_request_count`; W3 P1/P2 show at least 99 % come from iOS.

- Sleep and steps are written with a POST. The backend rejects it with **409** whenever the (program, member, date)
  row already exists (`apps/backend/services/logService.js:544-547`, route `routes/logs.js:103-112`). The client then
  sends a PUT (`routes/logs.js:140-149`).
- iOS re-reads a rolling 14-day window plus today on every run (`HealthKitService+Sleep.swift:21,47-69`,
  `HealthKitService+Steps.swift:20,47-82`):
  - sleep runs on launch, sign-in, foreground, program entry and its hourly background delivery (`+Sleep.swift:144`);
  - steps runs on its hourly background delivery (`+Steps.swift:103`), on connect and on Sync Now (W3 §Triggers).
  Each already-synced day × program × flow costs a POST-409 plus a PUT (`APIClient+DailyHealth.swift:61-77,120-135`).
- Android does the same on every app open (`HealthSyncController.kt:698-743`, over `HealthConnectManager.kt:125-141,180-205`).

### The double-counted workout minutes

Source: W3 P6 (69 + 13 + 9 rows re-summed within single minutes) and P7 (rows of 3,466 and 3,482 minutes).

- `on_duplicate:"sum"` adds `COALESCE(duration, 0) + N` without knowing which sample the minutes came from
  (`logService.js:192-213`).
- The only idempotency is a device-side ledger keyed `uuid|programId`. It is pruned after 45 days and wiped on
  disconnect or logout (`HealthKitAppliedLedger.swift:16,44-53`; Android `HealthStore.kt:145-168`).
- iOS ignores Health deletions: the `deletedObjects` closure argument is discarded (`HealthKitService.swift:77`).
  It also groups workouts by (mapped type, start day) across **all** source apps (`:146-166`). So a second app recording
  the same session, or a workout re-saved under a new id, is summed again.
- Android re-reads everything since the connect date when its changes token expires (`HealthConnectManager.kt:80-83`).
  It keeps only upsertions (`:86`) and reads only the first `readRecords` page (`:94-99`).
- The backend accepts any positive whole number of minutes (`logService.js:126-130`).

### How v2 removes them

- One batch per run and no POST-then-409. A day whose value and source already match is `unchanged` and nothing is
  written (§4.3).
- Per-sample dedup on the server, kept forever: no pruning, and it survives a reinstall, a restore or a second device
  (§4.2).
- Deletions propagate to the totals.
- The overlap rule and the 12 h / 24 h bounds (board D-7).

Old builds keep producing both problems until they update (F1).

## 3. The contract

Mounted at **`/api/health-sync`**. Code path: `routes/healthSync.js` → `services/healthSyncService.js` →
`services/healthSyncWorkouts.js` / `services/healthSyncDaily.js` → `models/HealthSyncSample.js` /
`models/HealthSyncState.js`.

The router is mounted in `server.js` **before** the global `express.json()` (D-C10).

Each request passes through, in order:
1. app-config's `blockUnversionedAndroid` (router level);
2. `authenticateToken`;
3. the per-member limiter (60 requests / 10 min across the three routes, D-C12);
4. the route's own JSON parser (batch 256 kb, state 16 kb);
5. the handler.

**Self-only:** every route acts on the token's member, and no request names a member (D-C11).

| # | Route | Purpose |
|---|---|---|
| 1 | `POST /api/health-sync/batch` | Upload one sync run (≤ 300 items, ≤ 256 kb) → `200` + one result per item |
| 2 | `GET /api/health-sync/state` | The member's server-remembered sync state (every integration / program / kind) |
| 3 | `PUT /api/health-sync/state` | Record "first-sync review done" and/or "sync run succeeded" (server clock) |

### 3.1 Request headers (every route)

- `Authorization: Bearer <access token>` (required).
- `Content-Type: application/json` (POST and PUT).
- The observability §4.1 identity headers: `X-App-Platform` (`ios` | `android`), `X-App-Version`, `X-App-Build`.
- A fresh UUID `X-Request-Id` per request (echoed back).

These routes don't require the `X-App-*` headers, but new builds always send them, because app-config's gate keys on
`X-App-Version`.

### 3.2 `POST /api/health-sync/batch`

```json
{
  "integration": "healthkit",
  "items": [
    { "kind": "workout", "program_id": "3f1c…", "date": "2026-10-11", "sample_id": "6A1F0C2E-…",
      "origin": "com.apple.health.81AF5B1E", "workout_name": "Running", "value": 32,
      "start_at": "2026-10-11T13:02:10Z", "end_at": "2026-10-11T13:34:40Z" },
    { "kind": "workout", "deleted": true, "sample_id": "C0FFEE00-…" },
    { "kind": "workout", "legacy": true, "program_id": "3f1c…", "date": "2026-09-30", "sample_id": "9B2D…",
      "origin": "com.strava", "workout_name": "Cycling", "value": 45,
      "start_at": "2026-09-30T23:40:00Z", "end_at": "2026-10-01T00:25:00Z" },
    { "kind": "sleep", "program_id": "3f1c…", "date": "2026-10-11", "value": 7.25 },
    { "kind": "steps", "program_id": "3f1c…", "date": "2026-10-11", "value": 8123 }
  ]
}
```

| Field | Rule |
|---|---|
| `integration` | **Batch level.** `"healthkit"` (iOS) or `"health_connect"` (Android) — the source of every item in the batch. |
| `items` | **Batch level.** Array of 1–300 items. |
| `kind` | `"workout"` · `"sleep"` · `"steps"`. |
| `program_id` | UUID. **One program per item** — send one item per selected program. Not sent on a deletion. |
| `date` | `YYYY-MM-DD`, a real calendar date in the **device's local time zone**, from `2000-01-01` to 2 days after the server's UTC today. Workout = the day it **started**; sleep = the day you **woke up**; steps = the day counted. |
| `sample_id` | **Workout only.** The Health store's id: iOS `HKWorkout.uuid.uuidString`, Android `ExerciseSessionRecord.metadata.id`. 1–128 chars of `A-Z a-z 0-9 . _ : -`. |
| `origin` | **Workout add / legacy.** The recording app: iOS `sourceRevision.source.bundleIdentifier`, Android `metadata.dataOrigin.packageName`. 1–255 chars of `A-Z a-z 0-9 . _ : -`. |
| `workout_name` | **Workout add / legacy.** The library name from the platform type map (`HealthKitWorkoutTypeMap` / `HealthConnectWorkoutTypeMap`), 1–100 chars. |
| `value` | Workout: whole minutes 1–100,000, `max(1, round(seconds / 60))` **per sample** (iOS `HKWorkout.duration`, Android `endTime − startTime`). Sleep: hours 0–24 (a number, stored to 2 dp). Steps: whole steps 0–200,000. |
| `start_at` / `end_at` | **Workout add / legacy.** ISO-8601 instants `YYYY-MM-DDThh:mm[:ss[.fraction]]` with an explicit `Z` or `±hh:mm` offset (no offset = `invalid`, never local time) and a UTC year 2000–2100, with `end_at` after `start_at`. |
| `deleted` | **Workout only.** `true` = Health deleted this sample. Send only `kind`, `deleted` and `sample_id`. |
| `legacy` | **Workout only.** `true` = an "already sent" sample from the old build's device ledger (§4.2 step 2, §8 rule 9). |

**Bounds:** at most 300 items and 256 kb per request. A 30-day catch-up of one or two programs fits in one request;
larger runs are split. A bad item becomes `invalid` with an `error` and never fails the other items. The `date` range
and the `start_at` / `end_at` format + year range above are checked before the database is touched, so no value can
reach Postgres unparsable and fail the whole batch.

These are also `invalid`:
- a second sleep (or steps) item for the same program + date in one batch;
- an add or legacy item whose `sample_id` the same batch also deletes (send only the deletion).

**Response `200`:**

```json
{ "integration": "healthkit",
  "results": [ { "index": 0, "status": "created" }, { "index": 1, "status": "removed" },
               { "index": 2, "status": "recorded" }, { "index": 3, "status": "unchanged" },
               { "index": 4, "status": "invalid", "error": "value must be whole steps between 0 and 200000." } ],
  "counts": { "created": 1, "removed": 1, "recorded": 1, "unchanged": 1, "invalid": 1 } }
```

- `results` holds exactly one entry per item, in item order; `index` is the item's position.
- `counts` gives the number of items per status, listing only statuses that occurred.

| `status` | Kinds | Meaning | Final? |
|---|---|---|---|
| `created` | all | Workout: a new (program, type, day) `workout_logs` row. Sleep/steps: the field had no value before. | yes |
| `updated` | all | Workout: its minutes were added onto the existing row (manual minutes included). Sleep/steps: the stored value (or its source) was replaced. | yes |
| `unchanged` | sleep, steps | The stored value and source already match; nothing written. | yes |
| `duplicate` | workout | Already in the ledger for this program (re-sent, re-read, restored, adopted, deleted earlier, or repeated in this batch); nothing added. | yes |
| `recorded` | workout (legacy) | Adopted into the ledger; totals unchanged. | yes |
| `removed` | workout (deleted) | Its minutes were subtracted (floored at 0; a row reaching 0 is deleted) in every program where it was applied and the member can still write. Never partial across locks: returned only when no copy sits in an admin-locked program (copies in programs the member has left stay as they are). | yes |
| `not_found` | workout (deleted) | Never applied, or already removed; nothing to do. | yes |
| `skipped_overlap` | workout | Overlaps in time a sample already counted for this program from a **different app or a different integration**. Not recorded. | yes. If it is ever sent again it is checked again, but normally it isn't (the anchor / token has moved past it), so this errs toward undercounting (D-C4). |
| `skipped_too_long` | workout | Longer than 720 min (12 h). | yes |
| `skipped_day_cap` | workout | Would take this program + date's live ledger minutes (applied + legacy) over 1,440 (24 h). Not recorded. | yes. Like `skipped_overlap`, normally not re-sent even after a deletion frees room — errs toward undercounting (D-C4, D-C5). |
| `skipped_not_member` | all | No active membership in the program (legacy: no membership row at all). | yes |
| `skipped_locked` | workout, sleep, steps | The program is admin-only (`admin_only_data_entry`) and the member isn't its admin. **Not written.** A deletion gets it when **any** live copy of the sample sits in such a program; then nothing is subtracted in any program (atomic per sample). | **no** — the client holds and re-sends it later (§8 rule 5) |
| `invalid` | all | The item broke a rule above (`error` says which). Never retry it unchanged. | yes |

**Request-level statuses.** Errors are `{ "error", "code" }`. Per frontend-kit §4 the HTTP status decides the error
kind; `code` is informational.

| HTTP | Body | When |
|---|---|---|
| `200` | as above | A well-formed batch, even if every item is `invalid`. |
| `400` | `{ "error": "items must be an array of 1-300 items.", "code": "invalid_batch" }` (or the integration / object message) | Body not an object, bad `integration`, `items` missing / empty / > 300. Also a non-JSON `Content-Type` (the body isn't parsed). |
| `400` · `415` | `{ "error": "Invalid request body.", "code": "invalid_body" }` | Malformed or non-object JSON, or a corrupt gzip/deflate body (400); unsupported charset or encoding (415). |
| `401` | `{ "error": "Access denied. No token provided." }` · `{ "error": "Invalid token." }` | Missing, bad or expired token (auth). |
| `413` | `{ "error": "Payload too large.", "code": "payload_too_large" }` | Body larger than 256 kb. |
| `426` | `{ "error": "Please update RaSi Fiters from the Play Store", "code": "update_required" }` | Android request without version headers while `BLOCK_UNVERSIONED_ANDROID=true` (app-config D-C5). |
| `429` | `{ "error": "Too many requests. Try again later.", "code": "rate_limited" }` + `Retry-After` | More than 60 requests in 10 min from one member. |
| `500` | `{ "error": "Failed to sync health data.", "code": "server_error" }` | Unexpected failure. The whole batch rolled back; nothing was written. |
| `503` | `{ "error": "Authentication service temporarily unavailable", "code": "auth_unavailable" }` + `Retry-After` | Token verification unavailable (auth D-C11). |
| `503` | `{ "error": "Another health sync is still running. Try again shortly.", "code": "busy" }` + `Retry-After: 2` | A lock wait passed 2 s (`lock_timeout`): another batch or state write of this member held the per-member lock, or another write held a row this batch needed (§4.1). Rolled back; nothing was written. |

**Never `403`, `404` or `409`.** Locks, memberships and duplicates are reported as per-item statuses.

### 3.3 `GET /api/health-sync/state`

```json
{ "server_time": "2026-10-12T18:04:05.000Z",
  "states": [ { "integration": "healthkit", "program_id": "3f1c…", "kind": "sleep",
                "review_done_at": "2026-10-01T09:00:00.000Z", "last_success_at": "2026-10-12T17:58:00.000Z" } ] }
```

- Returns every state row of the token's member, for all integrations.
- No row means never reviewed and never synced.
- Times are server-clock UTC ISO-8601, or `null` when unset.
- `server_time` lets a client whose clock is wrong compute ages.

Errors: `401` / `426` / `429` / `503` as in §3.2; `500 { "error": "Failed to load sync state.", "code": "server_error" }`.

### 3.4 `PUT /api/health-sync/state`

```json
{ "integration": "healthkit",
  "entries": [ { "program_id": "3f1c…", "kind": "sleep", "review_done": true, "sync_success": true } ] }
```

| Field | Rule |
|---|---|
| `integration` | `"healthkit"` · `"health_connect"`. |
| `entries` | 1–60 entries, one per (`program_id`, `kind`), no repeats. `kind` ∈ `workout` · `sleep` · `steps`. |
| `review_done` | Optional boolean. `true` = the first-sync review for this program + kind is done (an existing time is kept, so the first time wins). `false` = clear it, so the review shows again. |
| `sync_success` | Optional, only `true`. A run for this program + kind ended with every item final → `last_success_at` = now (server clock). |
| — | Every entry needs `review_done` or `sync_success`. |

Entries for programs where the member has no **active** membership are ignored. The `200` response is the
`GET /state` body after the write.

Errors:
- `400 { "error": "…", "code": "invalid_state" }` for a malformed body;
- `400` · `415` `invalid_body`, `413` `payload_too_large` (body > 16 kb), `401`, `426`, `429`, `503` (`auth_unavailable`
  or `busy`) as in §3.2;
- `500 { "error": "Failed to save sync state.", "code": "server_error" }`.

## 4. Server behavior

### 4.1 Transactions, timeout, access

Every database call of these routes, including both state routes, runs inside a transaction that starts with
`SET LOCAL statement_timeout = '10s'`. That is the explicit I/O bound. The batch and `PUT /state` also set
`SET LOCAL lock_timeout = '2s'` just before the per-member lock, so a run queued behind another one gives its pool
connection back after 2 s instead of 10: any lock wait over 2 s in that transaction rolls it back and answers
`503 busy` with `Retry-After: 2` (§3.2).

`syncBatch` validates every item without touching the database. If any item is valid, it opens one transaction and
runs, in order:
1. `lock_timeout` 2 s, then `pg_advisory_xact_lock` on the member, so concurrent runs of one member serialize;
2. one ledger read by sample id;
3. one membership read plus one locked-program read, covering every program in the batch;
4. workouts (§4.2);
5. sleep and steps (§4.3).

An unexpected error rolls the whole batch back (`500`). Re-sending the same batch is always safe.

**Write access per item** follows the old routes' rules, applied per item instead of per request:
- the item's program needs an active membership, else `skipped_not_member`;
- an `admin_only_data_entry` program also needs the member to be its admin or a global admin, else `skipped_locked`;
- legacy adoption writes no data, so it needs only a membership row in any status.

### 4.2 Workouts (`services/healthSyncWorkouts.js`), in this order

1. **Deletions.** Take the live ledger rows with this `sample_id` (this integration, any program, `deleted_at` null).
   A deletion is **atomic per sample** across programs:
   - no live row → `not_found`;
   - **any** live row in a program that is admin-locked for this member → `skipped_locked` and **nothing** is
     subtracted anywhere (non-final: the client holds and re-sends it, §8 rule 5);
   - otherwise, in each program the member may write, subtract the row's minutes from its `workout_logs` row, floored
     at 0 (a row at 0 is deleted), then set `deleted_at` → `removed`. Rows in programs the member has left stay as
     they are (no one may write there for them); if every live row is in such a program → `skipped_not_member`.
   - The ledger row stays, so the sample can never count again.
2. **Legacy adoption** (`legacy: true`).
   - The sample is inserted with status `legacy` and its minutes; **totals are unchanged**. Result: `recorded`, or
     `duplicate` if it is already in the ledger.
   - Its program workout is looked up, never created. When found, a later deletion subtracts the minutes like any
     other sample.
3. **New samples**, checked in this order:
   1. `duplicate` — already in the ledger for this program.
   2. `skipped_too_long` — longer than 720 min.
   3. `skipped_overlap` — `start < other.end && other.start < end` against a live ledger sample (or one adopted or
      counted earlier in this batch) of this program whose `origin` **or** `integration` differs. Two samples from
      the same app in the same integration never clash.
   4. `skipped_day_cap` — the live ledger minutes (applied and legacy) of this program + date, plus this sample,
      exceed 1,440. Legacy items themselves are never capped (D-C5).

   Samples are taken in start-time order, so the first one counted wins. A skipped sample is **not recorded**: if it
   is ever sent again, it is checked again against the ledger as it is then. Normally it isn't — the client's anchor /
   changes token has already moved past it — so a skip errs toward undercounting, never double counting (D-C4).

   Each accepted sample:
   - resolves (or creates, as the old sync path did) its `program_workouts` row through `resolveProgramWorkout`, once
     per distinct program + name;
   - is inserted into the ledger with `ON CONFLICT DO NOTHING` (a concurrent duplicate becomes `duplicate`);
   - has its minutes added to `workout_logs` in one upsert per (program, workout, day), giving `created` (new row) or
     `updated`.

### 4.3 Sleep + steps (`services/healthSyncDaily.js`)

**Set semantics:** the day's total replaces the stored value. apple-health F5 is kept (a synced value overwrites a
manual one for that field). Diet is never touched.

- If the stored value **and** its `<field>_source` already equal the item → `unchanged`, nothing written.
- Otherwise one upsert per kind writes the value and sets `<field>_source` to the integration. The result is `created`
  when the field had no value, `updated` when one was replaced.

Sleep and steps carry no sample id and get no ledger rows; their provenance lives on the daily row (D-C6).

### 4.4 State (`models/HealthSyncState.js`)

`review_done_at` and `last_success_at` are kept per (member, program, integration, kind), written only by `PUT /state`
with the server clock. The server never acts on them; they exist for the client rules in §8.

`PUT /state` reads the current rows, then upserts them. It takes the same per-member `pg_advisory_xact_lock` as the
batch first, so two overlapping writes (two devices, or a review PUT racing an end-of-run PUT) run one after the other
and neither drops the other's `review_done_at`.

## 5. Data / schema — `apps/backend/sql/009_health_sync_ledger.sql`

The migration is run by the user, is schema-neutral, and runs on staging first.

**`health_sync_samples`** (model `models/HealthSyncSample.js`; not registered in `models/index.js`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `member_id` | `uuid NOT NULL` | FK → `members(id)` ON DELETE CASCADE (account deletion removes the ledger) |
| `program_id` | `uuid NOT NULL` | FK (`program_id`, `member_id`) → `program_memberships` ON DELETE CASCADE. Leaving a program keeps the rows, because the membership row stays with status `removed`. |
| `integration` | `varchar(16) NOT NULL` | `healthkit` · `health_connect` (CHECK) |
| `sample_id` | `varchar(128) NOT NULL` | the Health sample id |
| `origin` | `varchar(255)` | the recording app (overlap rule, provenance) |
| `program_workout_id` | `uuid` | the `program_workouts` row its minutes went into; FK ON DELETE SET NULL |
| `log_date` | `date NOT NULL` | the item's `date` |
| `start_at` / `end_at` | `timestamptz` | the workout's span (overlap rule) |
| `minutes` | `integer` | CHECK ≥ 0 |
| `status` | `varchar(16) NOT NULL DEFAULT 'applied'` | `applied` · `legacy` (CHECK) |
| `applied_at` | `timestamptz NOT NULL DEFAULT now` | |
| `deleted_at` | `timestamptz` | set by a Health deletion; the row is kept forever |

Keys and indexes:
- UNIQUE (`member_id`, `program_id`, `integration`, `sample_id`);
- index (`member_id`, `sample_id`), because deletions arrive without a program;
- index (`member_id`, `program_id`, `log_date`), for the overlap rule and the day cap;
- index (`program_workout_id`), for its FK.

**`health_sync_state`** (model `models/HealthSyncState.js`):
- PK (`member_id`, `program_id`, `integration`, `kind`);
- columns `review_done_at`, `last_success_at`, `updated_at` (all `timestamptz`);
- `kind` CHECK `workout` · `sleep` · `steps`; `integration` CHECK and FKs as in the ledger.

**`daily_health_logs.sleep_source` / `steps_source`** (`varchar(16)`, nullable, CHECK `healthkit` · `health_connect`)
are owned by [`daily-health-logs`](../daily-health-logs/SPEC.md) (its D-C6) and written only here.

RLS is on for the `public` copies only, with no policies (the project posture). The `staging` copies get the staging
role's grants and stay RLS-free (`sql/README.md` §Staging schema).

## 6. Flags / env

No env var, no Render setting and no Supabase setting. Code constants:

| Constant | Value | File |
|---|---|---|
| `MAX_ITEMS` | 300 | `healthSyncService.js` |
| `MAX_STATE_ENTRIES` | 60 | `healthSyncService.js` |
| Workout value cap | ≤ 100,000 | `healthSyncService.js` |
| Steps cap | ≤ 200,000 | `healthSyncService.js` |
| Statement timeout | 10 s per transaction (batch, GET + PUT state) | `healthSyncService.js` (`withTimeout`) |
| Lock timeout | 2 s (batch + PUT state, set before the per-member lock) → `503 busy`, `Retry-After: 2` | `healthSyncService.js` (`lockMember`) |
| Item `date` range | `2000-01-01` … server UTC today + 2 days | `healthSyncService.js` (`MIN_DATE`, `latestDate`) |
| `start_at` / `end_at` | explicit `Z` / `±hh:mm` offset, UTC year 2000–2100 | `healthSyncService.js` (`INSTANT_RE`, `toInstant`) |
| `MAX_WORKOUT_MINUTES` | 720 | `healthSyncWorkouts.js` |
| `DAY_CAP_MINUTES` | 1,440 | `healthSyncWorkouts.js` |
| Per-member limiter | 60 / 10 min | `routes/healthSync.js` |
| Parser limits | 256 kb (batch) / 16 kb (state) | `routes/healthSync.js` |

`config/database.js` is unchanged. It has no global query timeout, so the per-transaction `SET LOCAL` is this
feature's bound.

## 7. Rollout + live binaries

**Order:**
1. `sql/009` on `staging`;
2. backend on `rasifiters-api-staging`, then the staging smoke;
3. `sql/009` on `public`;
4. backend on prod, then the prod smoke;
5. later, the bundled iOS + Android releases (`consumed_by` grows then).

**Live binaries** (iOS 1.4.0–1.4.3, Android 1.0.0 (3)/(4)) see only additive changes:
- three new routes that no binary calls;
- two new tables;
- two nullable columns that no existing route selects or returns. The `DailyHealthLog` model is unchanged, so every
  `/daily-health-logs` response is byte-identical.

`POST → 409 → PUT`, `on_duplicate:"sum"` and 400/403/404-means-skip are untouched.

## 8. Contract for the iOS (HealthKit) + Android (Health Connect) builds

Both platforms follow the same rules. The only differences are platform idiom, named in the rule.

1. **Freshness (board §4.1).**
   - A run on launch, foreground and pull-to-refresh.
   - iOS background delivery is a best-effort bonus: registered at launch, acknowledged after the work.
   - No Android background sync for now (D-6).
   - One run in flight per device.
2. **A run.**
   - Read Health → build items → `POST /batch`. Split at 300 items / 256 kb; on `413`, split the batch in half.
   - Then send `PUT /state` with `sync_success: true` for every selected (program, kind) where all of these hold: the
     Health read succeeded, every item sent for it came back final, and it was not held (rule 5).
3. **Items.** One item per (sample or day) × selected program. A program counts only if:
   - its date window contains `date` (D-S5);
   - it was not excluded in the review (D-CONF);
   - it is **not admin-locked for this member** (D-LOCK — the existing `isDataEntryLocked(programId)` predicate; a
     locked program is filtered out before sending, as today).

   Shape, as in §3.2:
   - Workouts: one item per sample. No client-side grouping and no client ledger.
   - Deletions: iOS `HKAnchoredObjectQuery` `deletedObjects`, Android `DeletionChange.recordId`. Never send an add for
     the same id in the same batch.
   - Sleep / steps: the day totals the clients compute today (sleep by wake date with the in-bed fallback; steps by
     local day), only for days with data.
4. **Catch-up window.** Applies to sleep/steps, and to workouts whenever the local anchor or token is missing or
   expired.
   - The window runs from `max(start of the local day of last_success_at − 1 day, today − 30 days)` to now.
   - `last_success_at` is the oldest one for that kind among the selected programs this run writes to (unlocked,
     in-window).
   - No `last_success_at` → the client's first-sync rule (today: workouts from the connect date; sleep/steps the last
     14 days) — **except on a device that held an old-build ledger** (the upgrade marker of rule 9): there, workouts
     are read from today − 30 days and the connect-date rule is **never** used.
   - Health Connect reads every page (`pageToken`).
   - iOS keeps its anchor and Android its changes token across runs, but **not** across the upgrade from the old
     build: the upgrade run always discards the workout anchor / changes token (rule 9). The ledger makes any re-read
     free (`duplicate` / `unchanged`).
5. **Advance or hold — one design (D-LOCK kept).**
   - Advance the anchor / changes token / local "last synced" and send `sync_success` **only** when every item of the
     run came back final **and** no selected in-window program was skipped for the admin lock.
   - A server `skipped_locked` (the backstop for a lock the client hadn't seen yet) is handled exactly like the
     client-side skip: **hold**. Keep the anchor / token, don't mark success for that (program, kind), queue nothing.
   - The next run re-reads those samples (a held deletion is re-delivered and re-sent), and anything already applied
     elsewhere comes back `duplicate` / `unchanged`.
   - The only non-final status is `skipped_locked`.
6. **Review once.**
   - Before the first upload for a (program, kind), show the first-sync review unless `review_done_at` is set on **any**
     integration's row for that program + kind (`GET /state` returns all of them).
   - After the user confirms, send `PUT review_done: true` on the current integration.
   - Once done, the review never shows again for that program + kind: not on this device, not after a reinstall, not
     on another device, and not on the other platform (D-C9).
7. **Sessions.**
   - Sync stops only on an explicit Disconnect or an explicit sign-out.
   - After any sign-in, call `GET /state`. The **same** member resumes from `last_success_at` (rule 4) with no review
     screen (D-8).
   - Local sync state is stored per member and excluded from Android Auto Backup (board §4.8).
8. **Errors.**
   - `401` → the sessions contract: one refresh, then retry the same batch.
   - `413` → split.
   - `426` → the update screen.
   - `429` / `503` → wait for `Retry-After`.
   - `5xx`, timeout or offline → retry the same batch later with backoff (it is idempotent).
   - `400 invalid_batch` → a client bug: don't retry, report it.
   - Never sign out from here.
9. **Upgrade from the old build** — once per device + integration, before the first normal batch.
   - For every entry of the old device ledger (iOS `HealthKitAppliedLedger` `healthkit.appliedWorkoutUUIDs`, key
     `uuid|programId`; Android `rasi.health` `hc.ledger|<id>|<programId>`), re-read the sample from Health by id.
   - Send it as a workout item with `legacy: true`: `program_id` from the key, `date` = the ledger's stored day, the
     other fields from the re-read sample. Skip samples Health no longer has.
   - **Read window of the upgrade run.** On the upgrade run, **always discard the workout anchor (iOS) / changes token
     (Android) and read workouts from today − 30 days.** No age test: the old iOS build stores its `HKQueryAnchor` with
     no timestamp and advances `lastSyncDate` even while the anchor is held, so a client can't tell how stale a kept
     anchor is. The old ledger keeps 45 days, so the samples the old build summed in that window are in it, went up as
     `legacy` above, and now come back `duplicate`. **Never** use the connect-date first-sync rule while an old-build
     ledger existed: before deleting it, set a local upgrade marker (per member + integration) that rule 4 reads.
     Samples older than 30 days that the old build never applied are deliberately dropped — the safe direction
     (nothing is counted twice).
   - **Carry the review over.** Send `PUT /state` with `review_done: true` for every (program, kind) in the old build's
     confirmed lists (iOS `healthkit[.sleep/.steps].confirmedProgramIds`, Android the `hc.*` equivalents), so an
     upgrading member doesn't see the first-sync review again. The local `excludedKeys` stay on the device and keep
     being honored (rule 3) — the server has no record of exclusions.
   - When every legacy item is final, delete the old ledger (the upgrade marker stays).
10. **Report** one `sync.run` event per run (observability §8.1) through `POST /api/client-events`.
11. **New builds never use the old sync paths:** no `POST /api/workout-logs` with `on_duplicate:"sum"`, and no
    POST/PUT `/api/daily-health-logs` for sync.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **One idempotent batch endpoint per sync run; never a 409.** New routes only. `POST → 409 → PUT` and `on_duplicate:"sum"` stay byte-for-byte for the live binaries: a 2xx upsert on the old POST would make them count every day as new. | Board §4.3 + live-binary line; W3 §8; W4 §8 |
| **D-C2** | **Permanent per-sample workout ledger**, keyed (member, program, integration, sample id) and never pruned. A deletion sets `deleted_at`, subtracts the sample's minutes floored at 0, and deletes a `workout_logs` row that reaches 0 (a 0-minute row would still count as a session in analytics `COUNT(*)`). | Board §4.4 ✅ |
| **D-C3** | **`integration` vs `origin`.** `integration` (batch level) is in the ledger and state keys, so a changed origin string or a legacy entry can never create a second key. `origin` (per workout) is provenance and feeds the overlap rule. | Board §4.4 / §4.6; orchestrator Q2 |
| **D-C4** | **Overlap rule:** a positive time overlap with a live sample of the same program whose `origin` **or** `integration` differs → `skipped_overlap`. This catches a watch plus a second app, and the same app on an iPhone plus an Android phone. The first sample counted wins (ledger first, then start-time order). A skipped sample (overlap, day cap, too long) is **not recorded**; if it is ever sent again, it is checked again against the ledger as it is then. Normally it is **not** re-sent after the winner is deleted — the client's anchor / changes token has already advanced past it — so the loser stays uncounted: the rule errs toward undercounting, never double counting. Same app + same integration never clashes (F7). | Board §4.4 ✅; Q6 |
| **D-C5** | **Bounds (D-7):** a sample longer than 720 min → `skipped_too_long`. The 1,440-minute day cap applies to what v2 itself adds: a **new** synced sample is skipped (not clamped) when the program + date's live ledger minutes — applied and legacy alike — plus its own would exceed 1,440. **Legacy rows are not capped**: adoption only records what the old build already summed, so a day's ledger total can exceed 1,440 through legacy rows (and then no new sample is added that day). Manual minutes don't count toward the cap. | Board §4.5 ✅, D-7; Q7 |
| **D-C6** | **Sleep / steps:** set semantics on day totals, with no sample ids and no ledger rows; `unchanged` when value + source match. apple-health F5 is kept: the server can't tell a manual value from an old build's synced one (both have a null source). **Deliberate reading of task (a):** the daily `<field>_source` stores the **integration only**, not the origin app. A day total is combined across apps (HealthKit `cumulativeSum` statistics / sleep merge; Health Connect `aggregateGroupByPeriod` dedups across origins), so no single app recorded it. Per-sample origin is kept for workouts in the ledger. Storing an app here later = a new migration. | Board §4.3 / §4.6; Q3; user confirmed at plan approval |
| **D-C7** | **Provenance via raw SQL only.** `models/DailyHealthLog.js` and the old routes are untouched, so their responses stay byte-identical. A manual edit doesn't clear `<field>_source` (F3). | Hard rule "old shapes untouched"; Q10 / Q11 |
| **D-C8** | **Legacy import** on the same route (`legacy: true`; the client re-reads samples by id). Ledger only, totals unchanged. The program workout is looked up, never created. | Board §4.4 upgrade ✅; Q8 |
| **D-C9** | **Server state per (member, program, integration, kind)**, written only by `PUT /state` with the server clock. `last_success_at` is the catch-up anchor (30-day cap, §8 rule 4) and is per integration because it describes one data source. **Deliberate reading of board §4.7 "once per member + program":** the review stays per (program, kind) as D-CONF works today (each flow has its own first-sync review), and clients treat it as done if **any** integration's row has `review_done_at` (§8 rule 6). Moving from iPhone to Android therefore shows no new review. | Board §4.2 / §4.7, D-8; Q2; user confirmed at plan approval |
| **D-C10** | **Transport.** The router is mounted before the global `express.json()` with its own 256 kb parser and a router-local parser-error handler: the global 100 kb parser's 413 reaches `errorHandler` as a 500 and would loop retries (observability F2). The router applies `blockUnversionedAndroid` itself. ≤ 300 items, one program per item. | Q9 |
| **D-C11** | **Self-only + per-item access + bounded I/O.** `requireDataEntryAllowed` returns a whole-request 403, so it isn't reused; access costs two queries per batch. Every DB call (batch, GET and PUT state) runs in a transaction with `statement_timeout` 10 s. A batch and a `PUT /state` also take the same per-member advisory lock (§4.4), after `SET LOCAL lock_timeout = '2s'`: a lock wait over 2 s rolls back and answers `503 busy` + `Retry-After: 2`, so a queued run doesn't hold a pool connection for the full 10 s. Item dates and instants are bounded before any query (§3.2), so no input can fail the whole batch in Postgres. | Q13; CLAUDE.md (timeouts, no N+1) |
| **D-C12** | **Per-member limiter:** 60 requests / 10 min (`utils/rateLimit.js` with `keyFn`). | Q12 |
| **D-REF** | **NET-NEW**, no legacy reference. `consumed_by = []` until the bundled releases. | — |

## 10. Flagged characteristics

| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | Old builds keep producing the 409s and the sum-path double counts until they update (the version gate). A member running an old and a new build at once can still double count, because the old build sums outside the ledger. | Accepted — no shims (board §0.3) |
| **F2** | A Health Connect record updated in place (same id, new duration) keeps its first-applied minutes. HealthKit samples are immutable: an edit is a delete plus a new id, which is handled. | Revisit only if seen |
| **F3** | `<field>_source` means "last set by v2". A manual edit through `/daily-health-logs` leaves it in place, so the column can't tell a manually corrected value from a synced one (board §4.6's "mix manual and synced" is visible only until a manual edit); inside the sync window the next sync re-asserts the synced value anyway (F5). Clearing it would take extra raw `UPDATE`s in the old write paths of `logService.js` — not a one-liner — so it is recorded here instead (plan approval, verdict #7). | When something reads provenance |
| **F4** | A deletion subtracts from the row even if manual minutes were added on top after the sync (floored at 0). | Accepted |
| **F5** | The program date window (D-S5), review exclusions (D-CONF) and the admin-lock pre-filter (D-LOCK) stay client-side. The server accepts any valid date and answers `skipped_locked` as a backstop. | Out of scope (R2) |
| **F6** | The limiter lives in process memory: one instance, reset on deploy (observability F3). | — |
| **F7** | **Same app, same integration, two record ids for one session** (for example one app writing a session from two Android devices into one Health Connect store) still counts twice. The overlap rule compares only different apps or integrations, because overlapping samples from one app in one store are normally separate sessions. | Revisit only if seen |
| **F8** | A batch with many distinct unknown workout names creates that many custom `program_workouts` rows in one transaction (`resolveProgramWorkout`, as the old sync path did per call); bounded by the 300-item cap and the per-member rate limit. | Accepted — no separate cap |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-12 | **NET-NEW (reliability-overhaul Phase 3 R2, board §4 items 2–9).** `POST /api/health-sync/batch`, `GET` + `PUT /api/health-sync/state`; permanent workout sample ledger `health_sync_samples` + `health_sync_state` + `daily_health_logs.sleep_source` / `steps_source` (schema-neutral `sql/009`); deletions (atomic per sample — any admin-locked copy → `skipped_locked`, nothing subtracted), overlap rule (different app or integration), 12 h / 24 h bounds (legacy rows uncapped), legacy import (the upgrade run always discards the workout anchor / changes token and reads from today − 30 d, never the connect date, and carries the old review over — §8 rule 9), review-once (across integrations), catch-up anchor, D-LOCK hold, per-member advisory lock on the batch and `PUT /state` with a 2 s `lock_timeout` → `503 busy`; item `date` (2000-01-01 … today + 2 d) and `start_at` / `end_at` (explicit offset, years 2000–2100) bounds; `sync.run` registered in observability §8.1. Backend-only and additive for every live binary; `consumed_by = []` until the bundled iOS + Android releases (§8). D-C1–D-C12, F1–F8. |
