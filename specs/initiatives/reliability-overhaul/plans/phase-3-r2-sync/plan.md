# Phase 3 track R2 — plan

# PLAN: Reliability overhaul Phase 3 R2, health sync v2 backend (revision 2)

Scope: one batch endpoint, a permanent workout sample ledger, per-field provenance, server sync state and migration 009. The new `health-sync` SPEC owns the contract.

**Brief accepted**: yes. The plan touches 17 of the 18 briefed files.
- `models/DailyHealthLog.js` is deliberately left alone (Q11).
- `middleware/auth.js`, `middleware/versionGate.js`, `utils/rateLimit.js` and `models/index.js` are imported, never edited.

**Planner pre-checks (done in the scratchpad only; no repo files were touched)**:
- The E1 command was run against a scratch copy of `apps/backend` with every step below applied. It prints exactly the expected router stack. Line counts: `healthSyncService.js` 208, `healthSyncWorkouts.js` 203, everything else ≤ 93.
- An in-memory stub of `sequelize.query` and the model finders ran S1–S13 from E5. Every expected status, ledger row, `workout_logs` total and daily row below came out as written.
- Both smoke scripts pass `bash -n`.

**Feature/version prediction**:
- `health-sync`: new at **v0.1.0**. Status `built` at commit, then `deployed` after the prod smoke, with no bump.
- `daily-health-logs`: 0.2.1 → **0.3.0** (MINOR). The table it owns gains columns, recorded as D-C6.
- `workout-logs`: 0.5.1 → **0.6.0** (MINOR). `logService.js` gains two exported functions, following the auth 0.11.0 `optionalAuthenticate` precedent.
- `observability`: 0.1.1 → **0.1.2** (PATCH, docs only). It becomes **0.1.3** if R1 lands its §8.1 edit first.

**Surfaces in scope**: backend and its docs only, one implementer. Web, iOS and Android are out: they come later as bundled releases, built against health-sync SPEC §3 and §8.

**Gate**: build, commit and the staging steps (E1–E5) may run now. The **prod** steps (E6–E7) run only once the BRIEF §7 / HANDOFF gate opens: either the Phase 1b watch ends clean on 2026-10-19, or the user gives an explicit go.

**Two deliberate readings the user confirms when approving this plan** (both written into SPEC §9):
1. **Review-once is per (program, kind)**, as D-CONF works today, and is read across integrations: once done on iOS, it is also done on Android. The board's wording is "once per member + program".
2. **Daily-row provenance stores the integration only** (`healthkit` / `health_connect`), not the origin app. Sleep and steps are day totals combined across apps, so no single app recorded them. Workouts store both integration and origin app in the ledger.

## Changes from round 1 (verdict items)

1. **BLOCKING #1, deploys could ship another track's code before its migration ran.**
   - E2 stages only R2's hunks. Shared files with another track's hunks are staged through a non-interactive copy built from HEAD.
   - E4 and E7 deploy the exact commit `R2_SHA`, not `main`. Both first check `git log origin/main..$R2_SHA -- apps/backend`.
   - E7 pushes R2's tags by name.
2. **D-C4 re-check.** A skipped sample sent again is checked again. The replay is now part of the script (S3r), and re-runs use fresh ids and dates through `R`.
3. **E1 pass criteria.** The router's error handler prints as `<anonymous>`, and the git status check is limited to the 17 paths.
4. **Timeouts.** GET and PUT `/state` now run inside `withTimeout`, the same `SET LOCAL statement_timeout` transaction the batch uses.
5. **Admin-locked programs.** SPEC §8 rule 3 adds D-LOCK. Rule 5 names a single design: hold the anchor and don't mark success, with nothing queued.
6. **Board and task departures** are now labelled in D-C9 and D-C6 (the two readings above).
7. **Doc fixes.** daily-health-logs D-S1 is updated (step 13h), and SPEC §2's steps triggers are corrected.
8. **Prod smoke.** It is now a complete script run as `zoe.chen`, not the reviewer demo login. The leftover rows are documented.
9. **Same app on two integrations.** Two samples now clash if their origin app **or** their integration differs. The remaining gap (same app, same integration, two record ids) is recorded as F7, and S9x tests the new rule.
10. **Wake loop.** It no longer uses `sleep`. Files stay at about 200 lines (208 and 203).

## Where the 409s and double counts come from (verified) and how v2 removes them

**The 409s**
- `logService.js:544-547` returns 409 when the daily row already exists. The route is `routes/logs.js:103-112`, and clients then send a PUT to `:140-149`.
- **iOS** (`APIClient+DailyHealth.swift:61-77,120-135`) re-reads 14 days on every run:
  - sleep: `HealthKitService+Sleep.swift:21,47-69`;
  - steps: `+Steps.swift:20,47-82`;
  - hourly background delivery: `+Sleep.swift:144`, `+Steps.swift:103`.
- **Android** does the same: `HealthSyncController.kt:698-743`.
- Each run costs one 409 plus one PUT per day × program × flow. iOS sends at least 99% of them (W3 P1/P2).

**The double counts**
- The sum path adds minutes blindly: `COALESCE(duration,0)+N` (`logService.js:192-213`).
- The only idempotency is a 45-day device-side ledger (`HealthKitAppliedLedger.swift:16,44-53`; `HealthStore.kt:145-168`).
- iOS throws away deletions: the `deletedObjects` argument is `_` at `HealthKitService.swift:77` (the brief says :76; W3's :77 is right). It also groups workouts across all apps (`:146-166`).
- Android re-reads everything when its changes token expires (`HealthConnectManager.kt:80-83`), drops deletions (`:86`), and reads only one page (`:94-99`).
- Nothing limits how long a single workout can be (`logService.js:126-130`).

**How v2 removes them**
- One POST per run, and no 409 path: a day that already matches comes back `unchanged` and nothing is written.
- A permanent, server-side ledger with one row per sample.
- A deletion subtracts that sample's minutes.
- The overlap rule plus the 12 h and 24 h bounds.

## Open questions, resolved (all become D-rules in the health-sync SPEC §9)

| Q | Decision |
|---|---|
| 1 | A new `health-sync` feature owns the contract. |
| 2 | Two separate fields: <ul><li>**`integration`** (`healthkit` \| `health_connect`) is set once per batch and is part of the ledger and state keys.</li><li>**`origin`** is the bundle or package id of the app that recorded the workout, set per workout.</li></ul> State key = (member, program, integration, kind). Clients read `review_done_at` across integrations (D-C9). |
| 3 | Sleep and steps are day totals with set semantics: no sample id and no ledger rows. Provenance lives on the daily row as the integration only (D-C6). F5 is kept. |
| 4 | `workout_name`, `origin`, `start_at` and `end_at` are **required** on workout add and legacy items. |
| 5 | A deletion is matched by (member, integration, sample_id) across programs. Minutes are subtracted, floored at 0, and **a row that reaches 0 is deleted**. |
| 6 | Any positive time overlap with a live sample of the same program from a **different origin or a different integration** → `skipped_overlap`. The first sample counted wins. A skipped sample is not recorded; if sent again, it is checked again. |
| 7 | Skip the item, never clamp it. The cap is per program + date and counts synced ledger minutes only (legacy minutes included). |
| 8 | Legacy items go to the same route with `legacy: true`. The client re-reads each sample by id. The server records it in the ledger and leaves totals unchanged. |
| 9 | The router is mounted **before** the global `express.json()` and has its own 256 kb parser. It applies `blockUnversionedAndroid` itself. Limits: ≤ 300 items, one program per item. |
| 10 | No. The old write routes are untouched (F3 / F7). |
| 11 | No model attributes. Provenance is written with raw SQL, so old responses stay byte-identical. |
| 12 | 60 requests per 10 min per member (`rateLimit` keyed on the member). |
| 13 | Confirmed: self-only. |
| 14 | §8.1 is append-only. Whichever of R1 and R2 lands second takes the next PATCH. |

## Steps — backend

### 1. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/009_health_sync_ledger.sql`

```sql
-- 009_health_sync_ledger.sql — health sync v2 (reliability-overhaul Phase 3 R2; specs/features/health-sync/SPEC.md §5;
-- DESIGN_BOARD §4 items 3-7, D-7).
--
-- WHAT
--   1. health_sync_samples — the PERMANENT per-sample workout ledger: one row per (member, program, integration, Health
--      sample id) the server applied ('applied') or adopted from an old build's device ledger ('legacy'). A Health
--      deletion sets deleted_at; the app never deletes rows (only the FK cascades below do).
--   2. health_sync_state — server-remembered sync state per (member, program, integration, kind): first-sync review
--      done + last successful sync.
--   3. daily_health_logs.sleep_source / steps_source — per-field provenance ('healthkit' | 'health_connect'; NULL = not
--      written by health sync v2). Nullable, no default: existing rows are untouched.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema(). Run TWICE, STAGING FIRST:
--   SQL editor: first line `SET search_path TO staging;` + this whole file → Run; then the same with
--               `SET search_path TO public;`. If the editor offers "Run and enable RLS", run WITHOUT it.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/009_health_sync_ledger.sql
--               then the same with public — SESSION pooler or direct connection (port 5432) ONLY: on the transaction
--               pooler (6543) SET search_path does not persist and the "staging" run silently lands in public.
-- IDEMPOTENT: IF NOT EXISTS everywhere; the RLS / GRANT block re-runs safely.
-- ORDER: before the backend deploy that adds /api/health-sync (those routes 500 without these objects; no other route
--   reads them — the DailyHealthLog model does not map the two new columns).
-- LOCK TIMEOUT: the ALTER on daily_health_logs takes a brief exclusive lock; the first statement caps every lock wait
--   at 5 s so it can never queue live writes. On "canceling statement due to lock timeout" nothing changed (the SQL
--   editor rolls the run back) — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — the sample ledger =================================================================================
CREATE TABLE IF NOT EXISTS health_sync_samples (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id           uuid NOT NULL,
    program_id          uuid NOT NULL,
    integration         character varying(16) NOT NULL,
    sample_id           character varying(128) NOT NULL,
    origin              character varying(255),
    program_workout_id  uuid,
    log_date            date NOT NULL,
    start_at            timestamp with time zone,
    end_at              timestamp with time zone,
    minutes             integer,
    status              character varying(16) DEFAULT 'applied'::character varying NOT NULL,
    applied_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at          timestamp with time zone,
    CONSTRAINT health_sync_samples_pkey PRIMARY KEY (id),
    CONSTRAINT health_sync_samples_sample_key UNIQUE (member_id, program_id, integration, sample_id),
    CONSTRAINT health_sync_samples_integration_check CHECK (integration IN ('healthkit', 'health_connect')),
    CONSTRAINT health_sync_samples_status_check CHECK (status IN ('applied', 'legacy')),
    CONSTRAINT health_sync_samples_minutes_check CHECK (minutes IS NULL OR minutes >= 0),
    -- CASCADE: account deletion (cascadeMemberDeletion → members row delete) removes the member's ledger.
    CONSTRAINT health_sync_samples_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    -- Same pair FK as workout_logs: leaving a program keeps the membership row (status 'removed'), so rows stay.
    CONSTRAINT health_sync_samples_membership_fkey FOREIGN KEY (program_id, member_id)
        REFERENCES program_memberships(program_id, member_id) ON DELETE CASCADE,
    CONSTRAINT health_sync_samples_program_workout_id_fkey FOREIGN KEY (program_workout_id)
        REFERENCES program_workouts(id) ON DELETE SET NULL
);

-- Deletions arrive with a sample id only (no program); duplicate lookups too.
CREATE INDEX IF NOT EXISTS idx_health_sync_samples_member_sample
    ON health_sync_samples USING btree (member_id, sample_id);
-- Overlap rule + 24 h day cap: live rows of a member's programs around the batch's dates.
CREATE INDEX IF NOT EXISTS idx_health_sync_samples_member_program_date
    ON health_sync_samples USING btree (member_id, program_id, log_date);
-- The program_workouts FK (ON DELETE SET NULL) without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_health_sync_samples_program_workout_id
    ON health_sync_samples USING btree (program_workout_id);

-- ===== PART 2 — server-remembered sync state ======================================================================
CREATE TABLE IF NOT EXISTS health_sync_state (
    member_id        uuid NOT NULL,
    program_id       uuid NOT NULL,
    integration      character varying(16) NOT NULL,
    kind             character varying(16) NOT NULL,
    review_done_at   timestamp with time zone,
    last_success_at  timestamp with time zone,
    updated_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT health_sync_state_pkey PRIMARY KEY (member_id, program_id, integration, kind),
    CONSTRAINT health_sync_state_integration_check CHECK (integration IN ('healthkit', 'health_connect')),
    CONSTRAINT health_sync_state_kind_check CHECK (kind IN ('workout', 'sleep', 'steps')),
    CONSTRAINT health_sync_state_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT health_sync_state_membership_fkey FOREIGN KEY (program_id, member_id)
        REFERENCES program_memberships(program_id, member_id) ON DELETE CASCADE
);

-- ===== PART 3 — per-field provenance on daily rows ================================================================
-- On a re-run the columns exist, so each ADD COLUMN (with its CHECK) is skipped with a notice.
ALTER TABLE daily_health_logs
    ADD COLUMN IF NOT EXISTS sleep_source character varying(16)
        CONSTRAINT daily_health_logs_sleep_source_check CHECK (sleep_source IN ('healthkit', 'health_connect')),
    ADD COLUMN IF NOT EXISTS steps_source character varying(16)
        CONSTRAINT daily_health_logs_steps_source_check CHECK (steps_source IN ('healthkit', 'health_connect'));

-- ===== PART 4 — RLS (public) / grants + RLS off (staging) =========================================================
-- public: RLS on, no policies — the posture of every public table (PostgREST anon/authenticated read nothing; the backend
-- connects as the owner). staging: explicit DML grants for the staging role (008's default privileges already cover
-- tables the owner creates there) and RLS OFF for every staging table — the non-owner staging role must use them (008 §5).
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE health_sync_samples ENABLE ROW LEVEL SECURITY;
        ALTER TABLE health_sync_state ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON health_sync_samples, health_sync_state TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', current_schema(), t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 5 — verification (read-only; the SQL editor shows this last result) ====================================
SELECT current_schema()                                                     AS schema_name,         -- staging, then public
       to_regclass('health_sync_samples') IS NOT NULL                       AS samples_table,       -- t
       to_regclass('health_sync_state') IS NOT NULL                         AS state_table,         -- t
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'daily_health_logs'
           AND column_name IN ('sleep_source', 'steps_source'))             AS source_columns,      -- 2
       (SELECT count(*) FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'health_sync_samples') AS sample_indexes, -- 5
       (SELECT bool_and(relrowsecurity) FROM pg_class
         WHERE oid IN (to_regclass('health_sync_samples'), to_regclass('health_sync_state'))) AS rls_on, -- public t · staging f
       has_table_privilege('rasifiters_staging', to_regclass('health_sync_samples'), 'INSERT')
         AND has_table_privilege('rasifiters_staging', to_regclass('health_sync_state'), 'UPDATE') AS staging_role_writes; -- staging t · public f
```

### 2. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/HealthSyncSample.js`

```js
const { DataTypes, QueryTypes, Op } = require("sequelize");
const { sequelize } = require("../config/database");

// health_sync_samples — the PERMANENT per-sample workout ledger of health sync v2 (health-sync SPEC §5, D-C2; migration
// sql/009). One row per (member, program, integration, Health sample id) the server applied ("applied") or adopted from
// an old build's device ledger ("legacy"). A Health deletion sets deleted_at and never removes the row, so a re-sent,
// re-read or restored sample can never count twice. No associations — NOT registered in models/index.js (AppEvent
// precedent); the health-sync services require it directly.
const HealthSyncSample = sequelize.define("HealthSyncSample", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    member_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: false },
    integration: { type: DataTypes.STRING(16), allowNull: false },
    sample_id: { type: DataTypes.STRING(128), allowNull: false },
    origin: { type: DataTypes.STRING(255), allowNull: true },
    program_workout_id: { type: DataTypes.UUID, allowNull: true },
    log_date: { type: DataTypes.DATEONLY, allowNull: false },
    start_at: { type: DataTypes.DATE, allowNull: true },
    end_at: { type: DataTypes.DATE, allowNull: true },
    minutes: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "applied" },
    applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: "health_sync_samples",
    timestamps: false,
    underscored: true
});

// Every row (applied or legacy, deleted or not) of this integration with these sample ids — the duplicate + deletion lookup.
HealthSyncSample.findBySampleIds = async (memberId, integration, sampleIds, transaction) =>
    (sampleIds.length === 0 ? [] : HealthSyncSample.findAll({
        where: { member_id: memberId, integration, sample_id: sampleIds },
        raw: true,
        transaction
    }));

// Live (not deleted) rows of ANY integration in these programs between two dates — the overlap + day-cap working set.
HealthSyncSample.findLiveInRange = async (memberId, programIds, fromDate, toDate, transaction) =>
    HealthSyncSample.findAll({
        where: {
            member_id: memberId,
            program_id: programIds,
            deleted_at: null,
            log_date: { [Op.between]: [fromDate, toDate] }
        },
        attributes: ["program_id", "integration", "sample_id", "origin", "log_date", "start_at", "end_at", "minutes"],
        raw: true,
        transaction
    });

const INSERT_SQL = `
INSERT INTO health_sync_samples
    (member_id, program_id, integration, sample_id, origin, program_workout_id, log_date, start_at, end_at, minutes, status)
SELECT $memberId::uuid, t.program_id, $integration::varchar, t.sample_id, t.origin, t.program_workout_id, t.log_date,
       t.start_at, t.end_at, t.minutes, t.status
FROM unnest($programIds::uuid[], $sampleIds::varchar[], $origins::varchar[], $programWorkoutIds::uuid[],
            $logDates::date[], $startAts::timestamptz[], $endAts::timestamptz[], $minutes::int[], $statuses::varchar[])
    AS t(program_id, sample_id, origin, program_workout_id, log_date, start_at, end_at, minutes, status)
ON CONFLICT (member_id, program_id, integration, sample_id) DO NOTHING
RETURNING id, program_id, sample_id`;

// Bulk insert of { program_id, sample_id, origin, program_workout_id, log_date, start_at (Date), end_at (Date), minutes,
// status }. A row whose (member, program, integration, sample) already exists is skipped; returns ONLY the inserted rows
// ({ id, program_id, sample_id }) — anything not returned was a concurrent duplicate.
HealthSyncSample.insertMany = async (memberId, integration, rows, transaction) => {
    if (rows.length === 0) return [];
    const col = (key) => rows.map((row) => row[key] ?? null);
    const instant = (key) => rows.map((row) => (row[key] ? row[key].toISOString() : null));
    return sequelize.query(INSERT_SQL, {
        bind: {
            memberId,
            integration,
            programIds: col("program_id"),
            sampleIds: col("sample_id"),
            origins: col("origin"),
            programWorkoutIds: col("program_workout_id"),
            logDates: col("log_date"),
            startAts: instant("start_at"),
            endAts: instant("end_at"),
            minutes: col("minutes"),
            statuses: col("status")
        },
        type: QueryTypes.SELECT,
        transaction
    });
};

HealthSyncSample.markDeleted = async (ids, transaction) => {
    if (ids.length > 0) await HealthSyncSample.update({ deleted_at: new Date() }, { where: { id: ids }, transaction });
};

module.exports = HealthSyncSample;
```

### 3. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/HealthSyncState.js`

```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// health_sync_state — server-remembered sync state per (member, program, integration, kind) (health-sync SPEC §5, D-C9;
// migration sql/009). review_done_at = the first-sync review was confirmed; last_success_at = server time of the last
// clean sync run (the clients' catch-up anchor, SPEC §8 rule 4). Clients read review_done_at ACROSS integrations (SPEC
// §8 rule 6). Written only by PUT /api/health-sync/state with the SERVER clock. NOT registered in models/index.js.
const HealthSyncState = sequelize.define("HealthSyncState", {
    member_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    program_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    integration: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    kind: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    review_done_at: { type: DataTypes.DATE, allowNull: true },
    last_success_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "health_sync_state",
    timestamps: false,
    underscored: true
});

HealthSyncState.listForMember = async (memberId, transaction) =>
    HealthSyncState.findAll({
        where: { member_id: memberId },
        order: [["integration", "ASC"], ["program_id", "ASC"], ["kind", "ASC"]],
        raw: true,
        transaction
    });

const UPSERT_SQL = `
INSERT INTO health_sync_state (member_id, program_id, integration, kind, review_done_at, last_success_at, updated_at)
SELECT $memberId::uuid, t.program_id, $integration::varchar, t.kind, t.review_done_at, t.last_success_at, $now::timestamptz
FROM unnest($programIds::uuid[], $kinds::varchar[], $reviewDoneAts::timestamptz[], $lastSuccessAts::timestamptz[])
    AS t(program_id, kind, review_done_at, last_success_at)
ON CONFLICT (member_id, program_id, integration, kind) DO UPDATE SET
    review_done_at = EXCLUDED.review_done_at,
    last_success_at = EXCLUDED.last_success_at,
    updated_at = EXCLUDED.updated_at`;

// entries: [{ program_id, kind, review_done: true | false | undefined, sync_success: boolean }], one per (program, kind).
// review_done true keeps an existing time (first time wins), false clears it, undefined leaves it; sync_success true
// sets last_success_at = now. Read-then-write inside the caller's transaction; one upsert statement.
HealthSyncState.applyUpdates = async (memberId, integration, entries, transaction) => {
    if (entries.length === 0) return;
    const existing = await HealthSyncState.findAll({
        where: { member_id: memberId, integration, program_id: [...new Set(entries.map((e) => e.program_id))] },
        raw: true,
        transaction
    });
    const byKey = new Map(existing.map((row) => [`${row.program_id}|${row.kind}`, row]));
    const now = new Date();
    const iso = (value) => (value ? new Date(value).toISOString() : null);
    const rows = entries.map((e) => {
        const current = byKey.get(`${e.program_id}|${e.kind}`) || {};
        let review = current.review_done_at || null;
        if (e.review_done === true && !review) review = now;
        if (e.review_done === false) review = null;
        return { ...e, review, success: e.sync_success ? now : current.last_success_at || null };
    });
    await sequelize.query(UPSERT_SQL, {
        bind: {
            memberId,
            integration,
            now: now.toISOString(),
            programIds: rows.map((r) => r.program_id),
            kinds: rows.map((r) => r.kind),
            reviewDoneAts: rows.map((r) => iso(r.review)),
            lastSuccessAts: rows.map((r) => iso(r.success))
        },
        transaction
    });
};

module.exports = HealthSyncState;
```

### 4. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/healthSyncDaily.js`

```js
// Health sync v2 — the sleep + steps half (health-sync SPEC §4.3, D-C6/D-C7). SET semantics: the day's total replaces the
// stored value (apple-health F5 kept — a synced value overwrites a manual one for that field; diet is never touched) and
// stamps <field>_source = the integration. A day whose stored value AND source already match is "unchanged" and not
// written — this replaces the old POST→409→PUT round trip. "created" = the field had no value before, "updated" = it
// was replaced. Raw SQL on purpose: the DailyHealthLog model does not map the provenance columns, so every old
// /daily-health-logs response stays byte-identical (D-C7).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const READ_SQL = `
SELECT program_id, log_date::text AS log_date, sleep_hours, steps, sleep_source, steps_source
FROM daily_health_logs
WHERE member_id = $memberId::uuid AND program_id = ANY($programIds::uuid[]) AND log_date = ANY($dates::date[])`;

// Column names come only from the fixed table below — never from input.
const upsertSql = (valueColumn, sourceColumn, cast) => `
INSERT INTO daily_health_logs (program_id, member_id, log_date, ${valueColumn}, ${sourceColumn})
SELECT t.program_id, $memberId::uuid, t.log_date, t.value, $integration::varchar
FROM unnest($programIds::uuid[], $dates::date[], $values::${cast}[]) AS t(program_id, log_date, value)
ON CONFLICT (program_id, member_id, log_date) DO UPDATE SET
    ${valueColumn} = EXCLUDED.${valueColumn},
    ${sourceColumn} = EXCLUDED.${sourceColumn},
    updated_at = CURRENT_TIMESTAMP`;

const KINDS = {
    sleep: { value: "sleep_hours", source: "sleep_source", sql: upsertSql("sleep_hours", "sleep_source", "numeric") },
    steps: { value: "steps", source: "steps_source", sql: upsertSql("steps", "steps_source", "int") }
};

async function applyDaily({ memberId, integration, access, transaction, entries }) {
    for (const e of entries) e.status = access.blockFor(e.program_id);
    const open = entries.filter((e) => !e.status);
    if (open.length === 0) return;

    const current = await sequelize.query(READ_SQL, {
        bind: {
            memberId,
            programIds: [...new Set(open.map((e) => e.program_id))],
            dates: [...new Set(open.map((e) => e.date))]
        },
        type: QueryTypes.SELECT,
        transaction
    });
    const byDay = new Map(current.map((row) => [`${row.program_id}|${row.log_date}`, row]));

    for (const [kind, field] of Object.entries(KINDS)) {
        const writes = [];
        for (const e of open.filter((item) => item.kind === kind)) {
            const row = byDay.get(`${e.program_id}|${e.date}`);
            const stored = row && row[field.value] !== null ? Number(row[field.value]) : null;
            if (stored === e.value && row[field.source] === integration) {
                e.status = "unchanged";
            } else {
                e.status = stored === null ? "created" : "updated";
                writes.push(e);
            }
        }
        if (writes.length === 0) continue;
        await sequelize.query(field.sql, {
            bind: {
                memberId,
                integration,
                programIds: writes.map((e) => e.program_id),
                dates: writes.map((e) => e.date),
                values: writes.map((e) => e.value)
            },
            transaction
        });
    }
}

module.exports = { applyDaily };
```

### 5. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/healthSyncWorkouts.js`

```js
// Health sync v2 — the workout half (health-sync SPEC §4.2). Inside the caller's transaction (per-member advisory lock
// held), in this order: Health deletions (subtract, floored at 0, a row reaching 0 is deleted — D-C2) → legacy adoption
// (ledger only, totals unchanged — D-C8) → new samples (duplicate → 12 h bound → overlap → 24 h day cap → apply —
// D-C4/D-C5). Decisions are made in memory against the permanent ledger, then written in bulk: one ledger insert + one
// workout_logs upsert. resolveProgramWorkout runs once per distinct (program, workout name), never per item.
// A skipped sample is NOT recorded: if it is sent again it is checked again (D-C4).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const HealthSyncSample = require("../models/HealthSyncSample");
const { resolveProgramWorkout } = require("./logService");

const MAX_WORKOUT_MINUTES = 720; // board D-7: a single synced workout longer than 12 h is skipped
const DAY_CAP_MINUTES = 1440;    // board D-7: synced minutes per member + program + day never exceed 24 h
const DAY_MS = 24 * 60 * 60 * 1000;

const shiftDate = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const ms = (value) => new Date(value).getTime();
const overlaps = (a, b) => ms(a.start_at) < ms(b.end_at) && ms(b.start_at) < ms(a.end_at);
const sampleKey = (programId, sampleId) => `${programId}|${sampleId}`;

const ADD_SQL = `
INSERT INTO workout_logs (program_id, member_id, program_workout_id, log_date, duration)
SELECT t.program_id, $memberId::uuid, t.program_workout_id, t.log_date, t.minutes
FROM unnest($programIds::uuid[], $programWorkoutIds::uuid[], $logDates::date[], $minutes::int[])
    AS t(program_id, program_workout_id, log_date, minutes)
ON CONFLICT (program_id, member_id, program_workout_id, log_date)
DO UPDATE SET duration = COALESCE(workout_logs.duration, 0) + EXCLUDED.duration, updated_at = CURRENT_TIMESTAMP
RETURNING program_id, program_workout_id, log_date::text AS log_date, (xmax = 0) AS inserted`;

const SUBTRACT_SQL = `
UPDATE workout_logs w
SET duration = GREATEST(COALESCE(w.duration, 0) - t.minutes, 0), updated_at = CURRENT_TIMESTAMP
FROM unnest($programIds::uuid[], $programWorkoutIds::uuid[], $logDates::date[], $minutes::int[])
    AS t(program_id, program_workout_id, log_date, minutes)
WHERE w.program_id = t.program_id AND w.member_id = $memberId::uuid
  AND w.program_workout_id = t.program_workout_id AND w.log_date = t.log_date`;

const DELETE_EMPTY_SQL = `
DELETE FROM workout_logs w
USING unnest($programIds::uuid[], $programWorkoutIds::uuid[], $logDates::date[], $minutes::int[])
    AS t(program_id, program_workout_id, log_date, minutes)
WHERE w.program_id = t.program_id AND w.member_id = $memberId::uuid
  AND w.program_workout_id = t.program_workout_id AND w.log_date = t.log_date
  AND COALESCE(w.duration, 0) <= 0`;

// Legacy samples were already summed by the old build into an existing program workout: look it up, never create one.
const LOOKUP_SQL = `
SELECT pw.program_id, pw.id, pw.workout_name, wl.name AS library_name
FROM program_workouts pw
LEFT JOIN workouts_library wl ON wl.id = pw.library_workout_id
WHERE pw.program_id = ANY($programIds::uuid[])
  AND (pw.workout_name = ANY($names::text[]) OR wl.name = ANY($names::text[]))`;

// One total per (program, program workout, date): a single UPDATE … FROM / ON CONFLICT may touch each row only once.
function groupMinutes(items) {
    const groups = new Map();
    for (const item of items) {
        const key = `${item.program_id}|${item.program_workout_id}|${item.log_date}`;
        const group = groups.get(key) || { key, ...item, minutes: 0, entries: [] };
        group.minutes += item.minutes;
        if (item.entry) group.entries.push(item.entry);
        groups.set(key, group);
    }
    const list = [...groups.values()];
    const bind = {
        programIds: list.map((g) => g.program_id),
        programWorkoutIds: list.map((g) => g.program_workout_id),
        logDates: list.map((g) => g.log_date),
        minutes: list.map((g) => g.minutes)
    };
    return { list, bind };
}

async function applyDeletions({ memberId, access, transaction, entries, known }) {
    if (entries.length === 0) return;
    const live = new Map(); // sample_id → live ledger rows (any program) not yet removed in this batch
    for (const row of known) if (!row.deleted_at) live.set(row.sample_id, [...(live.get(row.sample_id) || []), row]);
    const removed = [];
    for (const e of entries) {
        const rows = live.get(e.sample_id) || [];
        const blocks = rows.map((row) => access.blockFor(row.program_id));
        removed.push(...rows.filter((_, i) => !blocks[i]));
        live.set(e.sample_id, rows.filter((_, i) => blocks[i]));
        if (blocks.some((b) => !b)) e.status = "removed";
        else if (rows.length === 0) e.status = "not_found";
        else e.status = blocks.includes("skipped_locked") ? "skipped_locked" : "skipped_not_member";
    }
    if (removed.length === 0) return;
    for (const row of removed) row.deleted_at = new Date(); // a later add of the same sample stays "duplicate"
    const subtract = removed.filter((row) => row.program_workout_id && row.minutes > 0).map((row) => ({
        program_id: row.program_id, program_workout_id: row.program_workout_id, log_date: row.log_date, minutes: row.minutes
    }));
    if (subtract.length > 0) {
        const { bind } = groupMinutes(subtract);
        await sequelize.query(SUBTRACT_SQL, { bind: { ...bind, memberId }, transaction });
        await sequelize.query(DELETE_EMPTY_SQL, { bind: { ...bind, memberId }, transaction });
    }
    await HealthSyncSample.markDeleted(removed.map((row) => row.id), transaction);
}

async function adoptLegacy({ access, transaction, entries, seen }) {
    const accepted = [];
    for (const e of entries) {
        const key = sampleKey(e.program_id, e.sample_id);
        if (!access.hasMembership(e.program_id)) e.status = "skipped_not_member";
        else if (seen.has(key)) e.status = "duplicate";
        else { seen.add(key); accepted.push(e); }
    }
    if (accepted.length === 0) return accepted;
    const rows = await sequelize.query(LOOKUP_SQL, {
        bind: {
            programIds: [...new Set(accepted.map((e) => e.program_id))],
            names: [...new Set(accepted.map((e) => e.workout_name))]
        },
        type: QueryTypes.SELECT,
        transaction
    });
    for (const e of accepted) {
        const mine = rows.filter((row) => row.program_id === e.program_id);
        const hit = mine.find((row) => row.library_name === e.workout_name) || mine.find((row) => row.workout_name === e.workout_name);
        e.program_workout_id = hit ? hit.id : null;
    }
    return accepted;
}

// D-C4: two samples of one program clash when they overlap in time AND come from a different app OR a different
// integration (the same app on an iPhone and an Android phone records one session twice).
const clashes = (row, e, integration) => row.program_id === e.program_id && row.start_at && row.end_at
    && (row.integration !== integration || row.origin !== e.origin) && overlaps(row, e);

async function screenAdds({ memberId, integration, access, transaction, entries, seen, adopted }) {
    const pending = [];
    for (const e of entries) {
        const key = sampleKey(e.program_id, e.sample_id);
        e.status = access.blockFor(e.program_id)
            || (seen.has(key) ? "duplicate" : null)
            || (e.value > MAX_WORKOUT_MINUTES ? "skipped_too_long" : null);
        if (!e.status) { seen.add(key); pending.push(e); }
    }
    if (pending.length === 0) return [];
    const dates = pending.map((e) => e.date).sort();
    const programIds = [...new Set(pending.map((e) => e.program_id))];
    const live = await HealthSyncSample.findLiveInRange(
        memberId, programIds, shiftDate(dates[0], -1), shiftDate(dates[dates.length - 1], 1), transaction
    );
    const asPeer = (e) => ({ program_id: e.program_id, integration, origin: e.origin, log_date: e.date,
        start_at: e.start_at, end_at: e.end_at, minutes: e.value });
    const peers = [...live, ...adopted.map(asPeer)];
    const dayTotals = new Map();
    for (const row of peers) {
        const dayKey = `${row.program_id}|${row.log_date}`;
        dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + (row.minutes || 0));
    }
    const accepted = [];
    pending.sort((a, b) => ms(a.start_at) - ms(b.start_at) || a.index - b.index); // first counted wins (D-C4)
    for (const e of pending) {
        const dayKey = `${e.program_id}|${e.date}`;
        const total = (dayTotals.get(dayKey) || 0) + e.value;
        if (peers.some((row) => clashes(row, e, integration))) e.status = "skipped_overlap";
        else if (total > DAY_CAP_MINUTES) e.status = "skipped_day_cap";
        else { dayTotals.set(dayKey, total); peers.push(asPeer(e)); accepted.push(e); }
    }
    return accepted;
}

async function addMinutes(memberId, entries, transaction) {
    if (entries.length === 0) return;
    const { list, bind } = groupMinutes(entries.map((e) => ({
        program_id: e.program_id, program_workout_id: e.program_workout_id, log_date: e.date, minutes: e.value, entry: e
    })));
    const rows = await sequelize.query(ADD_SQL, { bind: { ...bind, memberId }, type: QueryTypes.SELECT, transaction });
    const created = new Set(rows.filter((row) => row.inserted).map((row) => `${row.program_id}|${row.program_workout_id}|${row.log_date}`));
    for (const group of list) for (const e of group.entries) e.status = created.has(group.key) ? "created" : "updated";
}

async function applyWorkouts({ memberId, integration, access, transaction, entries, known }) {
    if (entries.length === 0) return;
    await applyDeletions({ memberId, access, transaction, known, entries: entries.filter((e) => e.op === "delete") });
    const seen = new Set(known.map((row) => sampleKey(row.program_id, row.sample_id)));
    const adopted = await adoptLegacy({ access, transaction, seen, entries: entries.filter((e) => e.op === "legacy") });
    const accepted = await screenAdds({
        memberId, integration, access, transaction, seen, adopted, entries: entries.filter((e) => e.op === "add")
    });
    const workoutIds = new Map(); // `${program}|${name}` → program_workouts.id (resolved/created once per pair)
    for (const e of accepted) {
        const key = `${e.program_id}|${e.workout_name}`;
        if (!workoutIds.has(key)) workoutIds.set(key, (await resolveProgramWorkout(e.program_id, e.workout_name, transaction)).id);
        e.program_workout_id = workoutIds.get(key);
    }
    const toRow = (e, status) => ({
        program_id: e.program_id, sample_id: e.sample_id, origin: e.origin, program_workout_id: e.program_workout_id,
        log_date: e.date, start_at: e.start_at, end_at: e.end_at, minutes: e.value, status
    });
    const inserted = await HealthSyncSample.insertMany(memberId, integration,
        [...adopted.map((e) => toRow(e, "legacy")), ...accepted.map((e) => toRow(e, "applied"))], transaction);
    const insertedKeys = new Set(inserted.map((row) => sampleKey(row.program_id, row.sample_id)));
    for (const e of adopted) e.status = insertedKeys.has(sampleKey(e.program_id, e.sample_id)) ? "recorded" : "duplicate";
    const applied = accepted.filter((e) => insertedKeys.has(sampleKey(e.program_id, e.sample_id)));
    for (const e of accepted) if (!applied.includes(e)) e.status = "duplicate";
    await addMinutes(memberId, applied, transaction);
}

module.exports = { applyWorkouts };
```

### 6. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/healthSyncService.js`

```js
// Health sync v2 — validation + orchestration for /api/health-sync (specs/features/health-sync/SPEC.md §3–§4).
// SELF-ONLY (D-C11): the member is always the token's member — no item names a member. One bad item never fails the
// batch (status "invalid" + error); only a malformed batch is a 400 (code "invalid_batch"). Every DB call runs in a
// transaction with an explicit statement timeout (withTimeout); a batch also takes a per-member advisory lock, so two
// runs of one member (two triggers, two devices) serialize instead of racing the ledger.
const { sequelize } = require("../config/database");
const { Program, ProgramMembership } = require("../models");
const HealthSyncSample = require("../models/HealthSyncSample");
const HealthSyncState = require("../models/HealthSyncState");
const { AppError } = require("../utils/response");
const { isValidDateString } = require("./logService");
const { applyWorkouts } = require("./healthSyncWorkouts");
const { applyDaily } = require("./healthSyncDaily");

const MAX_ITEMS = 300;
const MAX_STATE_ENTRIES = 60;
const MAX_WORKOUT_VALUE = 100000;
const MAX_STEPS = 200000;
const INTEGRATIONS = new Set(["healthkit", "health_connect"]);
const KINDS = new Set(["workout", "sleep", "steps"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const ORIGIN_RE = /^[A-Za-z0-9._:-]{1,255}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const toInstant = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)) : null);
const iso = (v) => (v ? new Date(v).toISOString() : null);

// The explicit I/O bound (D-C11): every statement of `work` is capped at 10 s, lock waits included.
const withTimeout = (work) => sequelize.transaction(async (transaction) => {
    await sequelize.query("SET LOCAL statement_timeout = '10s'", { transaction });
    return work(transaction);
});

function fillWorkout(raw, e) {
    if (typeof raw.sample_id !== "string" || !SAMPLE_ID_RE.test(raw.sample_id)) {
        return "sample_id is required (1-128 characters: letters, digits, . _ : -).";
    }
    e.sample_id = raw.sample_id;
    if (raw.deleted === true) { e.op = "delete"; return null; }
    e.op = raw.legacy === true ? "legacy" : "add";
    if (typeof raw.origin !== "string" || !ORIGIN_RE.test(raw.origin)) return "origin is required (1-255 characters: letters, digits, . _ : -).";
    const name = typeof raw.workout_name === "string" ? raw.workout_name.trim() : "";
    if (!name || name.length > 100 || CONTROL_RE.test(name)) return "workout_name is required (1-100 characters).";
    if (!Number.isInteger(raw.value) || raw.value <= 0 || raw.value > MAX_WORKOUT_VALUE) return `value must be whole minutes between 1 and ${MAX_WORKOUT_VALUE}.`;
    const start = toInstant(raw.start_at);
    const end = toInstant(raw.end_at);
    if (!start || !end || end <= start) return "start_at and end_at must be ISO-8601 times with end_at after start_at.";
    Object.assign(e, { origin: raw.origin, workout_name: name, value: raw.value, start_at: start, end_at: end });
    return null;
}

function fillEntry(raw, e) {
    if (!KINDS.has(raw.kind)) return "kind must be workout, sleep or steps.";
    e.kind = raw.kind;
    if (e.kind === "workout" && raw.deleted === true) return fillWorkout(raw, e);
    if (!isUuid(raw.program_id)) return "program_id must be a UUID.";
    if (!isValidDateString(raw.date)) return "date must be a valid YYYY-MM-DD date.";
    Object.assign(e, { program_id: raw.program_id.toLowerCase(), date: raw.date });
    if (e.kind === "workout") return fillWorkout(raw, e);
    e.op = "set";
    if (e.kind === "sleep") {
        if (typeof raw.value !== "number" || !(raw.value >= 0 && raw.value <= 24)) return "value must be hours between 0 and 24.";
        e.value = Math.round(raw.value * 100) / 100;
        return null;
    }
    if (!Number.isInteger(raw.value) || raw.value < 0 || raw.value > MAX_STEPS) return `value must be whole steps between 0 and ${MAX_STEPS}.`;
    e.value = raw.value;
    return null;
}

// In-batch conflicts → "invalid": a second sleep/steps item for one program + date, and an add/legacy item for a sample
// the same batch deletes (send only the deletion). A repeated workout sample is the ledger pass's "duplicate".
function markBatchConflicts(entries) {
    const deleted = new Set(entries.filter((e) => !e.status && e.op === "delete").map((e) => e.sample_id));
    const days = new Set();
    for (const e of entries) {
        if (e.status) continue;
        const dayKey = `${e.kind}|${e.program_id}|${e.date}`;
        if (e.op === "set" && days.has(dayKey)) Object.assign(e, { status: "invalid", error: "Duplicate item for this program and date." });
        else if (e.op === "set") days.add(dayKey);
        else if (e.op !== "delete" && deleted.has(e.sample_id)) Object.assign(e, { status: "invalid", error: "This sample is also deleted in this batch." });
    }
}

function validateBatch(body) {
    const bad = (message) => new AppError(400, message, { code: "invalid_batch" });
    if (!isPlainObject(body)) throw bad("Body must be a JSON object.");
    if (!INTEGRATIONS.has(body.integration)) throw bad("integration must be healthkit or health_connect.");
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
        throw bad(`items must be an array of 1-${MAX_ITEMS} items.`);
    }
    const entries = body.items.map((raw, index) => {
        const e = { index, status: null };
        const error = isPlainObject(raw) ? fillEntry(raw, e) : "Each item must be an object.";
        return error ? Object.assign(e, { status: "invalid", error }) : e;
    });
    markBatchConflicts(entries);
    return { integration: body.integration, entries };
}

// The token member's write access per program — the old routes' rules (active membership; admin_only_data_entry needs a
// program admin or a global admin) applied per item: two indexed queries per batch, never one per item (D-C11).
async function loadAccess(requester, programIds, transaction) {
    const memberships = programIds.length === 0 ? [] : await ProgramMembership.findAll({
        where: { member_id: requester.id, program_id: programIds },
        attributes: ["program_id", "role", "status"], raw: true, transaction
    });
    const lockedPrograms = memberships.length === 0 ? [] : await Program.findAll({
        where: { id: memberships.map((m) => m.program_id), admin_only_data_entry: true },
        attributes: ["id"], raw: true, transaction
    });
    const locked = new Set(lockedPrograms.map((p) => p.id));
    const isGlobalAdmin = requester.global_role === "global_admin";
    const byProgram = new Map(memberships.map((m) => [m.program_id, {
        active: m.status === "active",
        locked: locked.has(m.program_id) && !isGlobalAdmin && m.role !== "admin"
    }]));
    return {
        hasMembership: (programId) => byProgram.has(programId),
        blockFor: (programId) => {
            const access = byProgram.get(programId);
            if (!access || !access.active) return "skipped_not_member";
            return access.locked ? "skipped_locked" : null;
        }
    };
}

async function syncBatch({ body, requester }) {
    const { integration, entries } = validateBatch(body);
    const open = entries.filter((e) => !e.status);
    if (open.length > 0) {
        await withTimeout(async (transaction) => {
            await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended($key::text, 0))", {
                bind: { key: `health_sync:${requester.id}` }, transaction
            });
            const workouts = open.filter((e) => e.kind === "workout");
            const known = await HealthSyncSample.findBySampleIds(
                requester.id, integration, [...new Set(workouts.map((e) => e.sample_id))], transaction
            );
            const programIds = [...new Set([...open.map((e) => e.program_id), ...known.map((r) => r.program_id)].filter(Boolean))];
            const access = await loadAccess(requester, programIds, transaction);
            const context = { memberId: requester.id, integration, access, transaction };
            await applyWorkouts({ ...context, entries: workouts, known });
            await applyDaily({ ...context, entries: open.filter((e) => e.kind !== "workout") });
            if (open.some((e) => !e.status)) throw new Error("health-sync: an item finished without a status");
        });
    }
    const counts = {};
    const results = entries.map(({ index, status, error }) => {
        counts[status] = (counts[status] || 0) + 1;
        return error ? { index, status, error } : { index, status };
    });
    return { integration, results, counts };
}

function validateState(body) {
    const bad = (message) => new AppError(400, message, { code: "invalid_state" });
    if (!isPlainObject(body) || !INTEGRATIONS.has(body.integration)) throw bad("integration must be healthkit or health_connect.");
    if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > MAX_STATE_ENTRIES) {
        throw bad(`entries must be an array of 1-${MAX_STATE_ENTRIES} items.`);
    }
    const seen = new Set();
    const entries = body.entries.map((raw) => {
        if (!isPlainObject(raw) || !isUuid(raw.program_id) || !KINDS.has(raw.kind)) {
            throw bad("Each entry needs a program_id (UUID) and a kind (workout, sleep or steps).");
        }
        if (raw.review_done !== undefined && typeof raw.review_done !== "boolean") throw bad("review_done must be true or false.");
        if (raw.sync_success !== undefined && raw.sync_success !== true) throw bad("sync_success can only be true.");
        if (raw.review_done === undefined && raw.sync_success !== true) throw bad("Each entry needs review_done or sync_success.");
        const key = `${raw.program_id.toLowerCase()}|${raw.kind}`;
        if (seen.has(key)) throw bad("Duplicate entry for this program and kind.");
        seen.add(key);
        return { program_id: raw.program_id.toLowerCase(), kind: raw.kind, review_done: raw.review_done, sync_success: raw.sync_success === true };
    });
    return { integration: body.integration, entries };
}

async function readState(memberId, transaction) {
    const rows = await HealthSyncState.listForMember(memberId, transaction);
    return {
        server_time: new Date().toISOString(),
        states: rows.map((r) => ({
            integration: r.integration, program_id: r.program_id, kind: r.kind,
            review_done_at: iso(r.review_done_at), last_success_at: iso(r.last_success_at)
        }))
    };
}

const getState = (memberId) => withTimeout((transaction) => readState(memberId, transaction));

// Entries for programs without an ACTIVE membership are ignored (state rows FK to the membership).
async function putState({ body, requester }) {
    const { integration, entries } = validateState(body);
    return withTimeout(async (transaction) => {
        const active = await ProgramMembership.findAll({
            where: { member_id: requester.id, program_id: [...new Set(entries.map((e) => e.program_id))], status: "active" },
            attributes: ["program_id"], raw: true, transaction
        });
        const activeIds = new Set(active.map((m) => m.program_id));
        await HealthSyncState.applyUpdates(requester.id, integration, entries.filter((e) => activeIds.has(e.program_id)), transaction);
        return readState(requester.id, transaction);
    });
}

module.exports = { syncBatch, getState, putState };
```

### 7. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/healthSync.js`

```js
// /api/health-sync — health sync v2 (specs/features/health-sync/SPEC.md §3). Self-only (D-C11): every route is
// authenticateToken and acts on the token's member. Mounted in server.js BEFORE the global express.json() (like
// /api/client-events, D-C10): the batch carries its own 256 kb parser — a 30-day catch-up can exceed the global 100 kb
// default, whose 413 the global errorHandler answers as a 500 (observability F2) that clients would retry forever.
// Because that mount sits above server.js's `app.use("/api", blockUnversionedAndroid)`, this router applies app-config's
// version gate itself. Errors are `{ error, code }` (frontend-kit §4: the status decides the kind). Never 403/404/409.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { blockUnversionedAndroid } = require("../middleware/versionGate");
const { rateLimit } = require("../utils/rateLimit");
const { AppError } = require("../utils/response");
const healthSyncService = require("../services/healthSyncService");

const router = express.Router();

// D-C12: per member (after auth), 60 requests / 10 min across the three routes — abuse protection only (a sync run is
// 1-3 calls). Process memory; a deploy resets it (observability F3).
const limitPerMember = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyFn: (req) => req.user.id });

router.use(blockUnversionedAndroid);

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        // Name + Postgres error code only — a Sequelize error message can echo inserted values.
        console.error("[health-sync] %s failed: %s %s", tag, err.name, err.parent?.code || "");
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.post("/batch", authenticateToken, limitPerMember, express.json({ limit: "256kb" }),
    handle("batch", "Failed to sync health data.",
        (req) => healthSyncService.syncBatch({ body: req.body, requester: req.user })));

router.get("/state", authenticateToken, limitPerMember,
    handle("state read", "Failed to load sync state.", (req) => healthSyncService.getState(req.user.id)));

router.put("/state", authenticateToken, limitPerMember, express.json({ limit: "16kb" }),
    handle("state write", "Failed to save sync state.",
        (req) => healthSyncService.putState({ body: req.body, requester: req.user })));

// Body-parser 4xx keep their real status (same as routes/clientEvents.js) — the global errorHandler would answer 500.
// Four params = an Express error handler; keep `next`.
router.use((err, req, res, next) => {
    if (!err || !(err.status >= 400 && err.status < 500)) return next(err);
    if (err.status === 413) return res.status(413).json({ error: "Payload too large.", code: "payload_too_large" });
    return res.status(err.status).json({ error: "Invalid request body.", code: "invalid_body" });
});

module.exports = router;
```

### 8. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/logService.js`: exports only (lines 924-935), no behavior change

Replace the `module.exports = { … };` block with this:

```js
module.exports = {
    isProgramAdmin,
    addWorkoutLog,
    addWorkoutLogsBatch,
    updateWorkoutLog,
    deleteWorkoutLog,
    addDailyHealthLog,
    addDailyHealthLogsBatch,
    getDailyHealthLogs,
    updateDailyHealthLog,
    deleteDailyHealthLog,
    // health-sync 0.1.0 (workout-logs 0.6.0): shared helpers, exported unchanged.
    resolveProgramWorkout,
    isValidDateString
};
```

### 9. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js`: two inserts anchored by text (file shared with R1/R3)

**9a.** Insert this line directly after `const clientEventRoutes = require("./routes/clientEvents");` (currently :29):

```js
const healthSyncRoutes = require("./routes/healthSync");
```

**9b.** Insert this block directly after `app.use("/api/client-events", clientEventRoutes);` (currently :76), before the blank line and `app.use(express.json());`:

```js

// health-sync D-C10: also BEFORE the global express.json() — the batch route carries its own 256 kb parser (a 30-day
// catch-up exceeds the global 100 kb default). The router applies app-config's blockUnversionedAndroid itself, since this
// mount sits above the `/api` gate below.
app.use("/api/health-sync", healthSyncRoutes);
```

### 10. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md`

**10a.** Insert this row after the `008_staging_schema.sql` row (:20) of the Files table:

```markdown
| `009_health_sync_ledger.sql` | **Health sync v2** (reliability-overhaul Phase 3 R2, [`health-sync`](../../../specs/features/health-sync/SPEC.md)): creates `health_sync_samples` (the permanent per-sample workout ledger, unique per member + program + integration + sample id, 3 indexes) and `health_sync_state` (review-once + last successful sync per member + program + integration + kind), and adds the nullable provenance columns `daily_health_logs.sleep_source` / `steps_source`. Schema-neutral — run **staging first, then public** (§Staging schema step 4); RLS on the `public` copies only; the staging run grants the staging role and switches RLS off for every staging table. Starts with `SET lock_timeout = '5s'` (a lock timeout rolled the run back — just re-run). Ends with a read-only verification row (staging: `t t 2 5 f t`; public: `t t 2 5 t f`). Run **before** the backend deploy that adds `/api/health-sync`. |
```

**10b.** In §Staging schema step 5, replace `-- 15 (14 + app_events; + later tables)` with:

`-- 17 after 009 (14 + app_events + health_sync_samples + health_sync_state); every later migration's tables add to it`

If R3's 010 has already changed this count, add 2 to its number instead and keep both sets of table names.

### 11. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md`

Insert after line 24 (the "Added (reliability overhaul Phase 2)" bullet):

```markdown
- **Added (reliability overhaul Phase 3 R2):** `health_sync_samples` (permanent per-sample health-sync ledger) + `health_sync_state` (review-once + last successful sync per member/program/integration/kind) + `daily_health_logs.sleep_source` / `steps_source` (per-field provenance, not mapped by the `DailyHealthLog` model) — migration `sql/009`, routes `/api/health-sync/{batch,state}` mounted before the global body parser ([`health-sync`](../../specs/features/health-sync/SPEC.md)).
```

## Steps — docs (same implementer; this is the contract the iOS and Android plans follow)

### 12. NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/health-sync/SPEC.md` (complete content)

````markdown
# Feature: `health-sync` — health sync v2 (one batch upload per run, permanent sample ledger, server sync state)

> **Status:** 🏗️ built (backend, reliability-overhaul Phase 3 R2) · **Version:** 0.1.0 · **Apps (`consumed_by`):** none yet — `[]` until the bundled iOS (HealthKit) + Android (Health Connect) reliability releases adopt §8, then `ios` `android` (web has no health sync)
> **Provenance:** **NET-NEW** — no legacy equivalent. Contract: [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §4 items 2–9 (approved 2026-10-11; D-6, D-7, D-8); evidence: [`discovery/W3`](../../initiatives/reliability-overhaul/discovery/W3-ios-health-sync.md) (iOS), [`discovery/W4`](../../initiatives/reliability-overhaul/discovery/W4-android-health-sync.md) (Android).
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken`) · [`app-config`](../app-config/SPEC.md) (`blockUnversionedAndroid`, applied inside this router — D-C10) · [`observability`](../observability/SPEC.md) (`utils/rateLimit.js`; the `sync.run` event, its §8.1) · [`programs`](../programs/SPEC.md) + [`program-memberships`](../program-memberships/SPEC.md) (the `admin_only_data_entry` lock + membership, via their models) · [`workout-logs`](../workout-logs/SPEC.md) (`resolveProgramWorkout`, `isValidDateString`; writes `workout_logs`) · [`daily-health-logs`](../daily-health-logs/SPEC.md) (writes `daily_health_logs` incl. its D-C6 provenance columns).
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
| `date` | `YYYY-MM-DD`, a real calendar date in the **device's local time zone**. Workout = the day it **started**; sleep = the day you **woke up**; steps = the day counted. |
| `sample_id` | **Workout only.** The Health store's id: iOS `HKWorkout.uuid.uuidString`, Android `ExerciseSessionRecord.metadata.id`. 1–128 chars of `A-Z a-z 0-9 . _ : -`. |
| `origin` | **Workout add / legacy.** The recording app: iOS `sourceRevision.source.bundleIdentifier`, Android `metadata.dataOrigin.packageName`. 1–255 chars of `A-Z a-z 0-9 . _ : -`. |
| `workout_name` | **Workout add / legacy.** The library name from the platform type map (`HealthKitWorkoutTypeMap` / `HealthConnectWorkoutTypeMap`), 1–100 chars. |
| `value` | Workout: whole minutes 1–100,000, `max(1, round(seconds / 60))` **per sample** (iOS `HKWorkout.duration`, Android `endTime − startTime`). Sleep: hours 0–24 (a number, stored to 2 dp). Steps: whole steps 0–200,000. |
| `start_at` / `end_at` | **Workout add / legacy.** ISO-8601 instants, with `end_at` after `start_at`. |
| `deleted` | **Workout only.** `true` = Health deleted this sample. Send only `kind`, `deleted` and `sample_id`. |
| `legacy` | **Workout only.** `true` = an "already sent" sample from the old build's device ledger (§4.2 step 2, §8 rule 9). |

**Bounds:** at most 300 items and 256 kb per request. A 30-day catch-up of one or two programs fits in one request;
larger runs are split. A bad item becomes `invalid` with an `error` and never fails the other items.

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
| `removed` | workout (deleted) | Its minutes were subtracted (floored at 0; a row reaching 0 is deleted) in every program where it was applied. | yes |
| `not_found` | workout (deleted) | Never applied, or already removed; nothing to do. | yes |
| `skipped_overlap` | workout | Overlaps in time a sample already counted for this program from a **different app or a different integration**. | yes — for this send. Sent again, it is checked again (D-C4). |
| `skipped_too_long` | workout | Longer than 720 min (12 h). | yes |
| `skipped_day_cap` | workout | Would take this program + date's synced minutes over 1,440 (24 h). | yes — for this send. Sent again, it is checked again (e.g. after a deletion freed room). |
| `skipped_not_member` | all | No active membership in the program (legacy: no membership row at all). | yes |
| `skipped_locked` | workout, sleep, steps | The program is admin-only (`admin_only_data_entry`) and the member isn't its admin. **Not written.** | **no** — the client holds (§8 rule 5) |
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
- `400` · `415` `invalid_body`, `413` `payload_too_large` (body > 16 kb), `401`, `426`, `429`, `503` as in §3.2;
- `500 { "error": "Failed to save sync state.", "code": "server_error" }`.

## 4. Server behavior

### 4.1 Transactions, timeout, access

Every database call of these routes, including both state routes, runs inside a transaction that starts with
`SET LOCAL statement_timeout = '10s'`. That is the explicit I/O bound, and it covers lock waits.

`syncBatch` validates every item without touching the database. If any item is valid, it opens one transaction and
runs, in order:
1. `pg_advisory_xact_lock` on the member, so concurrent runs of one member serialize;
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
   - In each program the member may write, subtract the row's minutes from its `workout_logs` row, floored at 0; a row
     at 0 is deleted. Then set `deleted_at`.
   - Result: `removed` if at least one program was done, `not_found` if there is no live row, otherwise
     `skipped_locked` or `skipped_not_member`.
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
   4. `skipped_day_cap` — the live synced minutes of this program + date, plus this sample, exceed 1,440.

   Samples are taken in start-time order, so the first one counted wins. A skipped sample is **not recorded**: if it
   is sent again, it is checked again against the ledger as it is then (D-C4).

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
     14 days).
   - Health Connect reads every page (`pageToken`).
   - iOS keeps its anchor and Android its changes token across runs and upgrades. The ledger makes any re-read free
     (`duplicate` / `unchanged`).
5. **Advance or hold — one design (D-LOCK kept).**
   - Advance the anchor / changes token / local "last synced" and send `sync_success` **only** when every item of the
     run came back final **and** no selected in-window program was skipped for the admin lock.
   - A server `skipped_locked` (the backstop for a lock the client hadn't seen yet) is handled exactly like the
     client-side skip: **hold**. Keep the anchor / token, don't mark success for that (program, kind), queue nothing.
   - The next run re-reads those samples, and anything already applied elsewhere comes back `duplicate` /
     `unchanged`.
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
   - When every legacy item is final, delete the old ledger. Keep the existing anchor / changes token.
10. **Report** one `sync.run` event per run (observability §8.1) through `POST /api/client-events`.
11. **New builds never use the old sync paths:** no `POST /api/workout-logs` with `on_duplicate:"sum"`, and no
    POST/PUT `/api/daily-health-logs` for sync.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **One idempotent batch endpoint per sync run; never a 409.** New routes only. `POST → 409 → PUT` and `on_duplicate:"sum"` stay byte-for-byte for the live binaries: a 2xx upsert on the old POST would make them count every day as new. | Board §4.3 + live-binary line; W3 §8; W4 §8 |
| **D-C2** | **Permanent per-sample workout ledger**, keyed (member, program, integration, sample id) and never pruned. A deletion sets `deleted_at`, subtracts the sample's minutes floored at 0, and deletes a `workout_logs` row that reaches 0 (a 0-minute row would still count as a session in analytics `COUNT(*)`). | Board §4.4 ✅ |
| **D-C3** | **`integration` vs `origin`.** `integration` (batch level) is in the ledger and state keys, so a changed origin string or a legacy entry can never create a second key. `origin` (per workout) is provenance and feeds the overlap rule. | Board §4.4 / §4.6; orchestrator Q2 |
| **D-C4** | **Overlap rule:** a positive time overlap with a live sample of the same program whose `origin` **or** `integration` differs → `skipped_overlap`. This catches a watch plus a second app, and the same app on an iPhone plus an Android phone. The first sample counted wins (ledger first, then start-time order). A skipped sample (overlap, day cap, too long) is **not recorded**; if sent again, it is checked again against the ledger as it is then, so it counts once the winner is deleted. Same app + same integration never clashes (F7). | Board §4.4 ✅; Q6 |
| **D-C5** | **Bounds (D-7):** a sample longer than 720 min → `skipped_too_long`. Synced ledger minutes per program + date stay ≤ 1,440; the sample that would cross is skipped, not clamped. Manual minutes don't count toward the cap. | Board §4.5 ✅, D-7; Q7 |
| **D-C6** | **Sleep / steps:** set semantics on day totals, with no sample ids and no ledger rows; `unchanged` when value + source match. apple-health F5 is kept: the server can't tell a manual value from an old build's synced one (both have a null source). **Deliberate reading of task (a):** the daily `<field>_source` stores the **integration only**, not the origin app. A day total is combined across apps (HealthKit `cumulativeSum` statistics / sleep merge; Health Connect `aggregateGroupByPeriod` dedups across origins), so no single app recorded it. Per-sample origin is kept for workouts in the ledger. Storing an app here later = a new migration. | Board §4.3 / §4.6; Q3; user confirmed at plan approval |
| **D-C7** | **Provenance via raw SQL only.** `models/DailyHealthLog.js` and the old routes are untouched, so their responses stay byte-identical. A manual edit doesn't clear `<field>_source` (F3). | Hard rule "old shapes untouched"; Q10 / Q11 |
| **D-C8** | **Legacy import** on the same route (`legacy: true`; the client re-reads samples by id). Ledger only, totals unchanged. The program workout is looked up, never created. | Board §4.4 upgrade ✅; Q8 |
| **D-C9** | **Server state per (member, program, integration, kind)**, written only by `PUT /state` with the server clock. `last_success_at` is the catch-up anchor (30-day cap, §8 rule 4) and is per integration because it describes one data source. **Deliberate reading of board §4.7 "once per member + program":** the review stays per (program, kind) as D-CONF works today (each flow has its own first-sync review), and clients treat it as done if **any** integration's row has `review_done_at` (§8 rule 6). Moving from iPhone to Android therefore shows no new review. | Board §4.2 / §4.7, D-8; Q2; user confirmed at plan approval |
| **D-C10** | **Transport.** The router is mounted before the global `express.json()` with its own 256 kb parser and a router-local parser-error handler: the global 100 kb parser's 413 reaches `errorHandler` as a 500 and would loop retries (observability F2). The router applies `blockUnversionedAndroid` itself. ≤ 300 items, one program per item. | Q9 |
| **D-C11** | **Self-only + per-item access + bounded I/O.** `requireDataEntryAllowed` returns a whole-request 403, so it isn't reused; access costs two queries per batch. Every DB call (batch, GET and PUT state) runs in a transaction with `statement_timeout` 10 s. A batch also takes a per-member advisory lock. | Q13; CLAUDE.md (timeouts, no N+1) |
| **D-C12** | **Per-member limiter:** 60 requests / 10 min (`utils/rateLimit.js` with `keyFn`). | Q12 |
| **D-REF** | **NET-NEW**, no legacy reference. `consumed_by = []` until the bundled releases. | — |

## 10. Flagged characteristics

| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | Old builds keep producing the 409s and the sum-path double counts until they update (the version gate). A member running an old and a new build at once can still double count, because the old build sums outside the ledger. | Accepted — no shims (board §0.3) |
| **F2** | A Health Connect record updated in place (same id, new duration) keeps its first-applied minutes. HealthKit samples are immutable: an edit is a delete plus a new id, which is handled. | Revisit only if seen |
| **F3** | `<field>_source` means "last set by v2". A manual edit through `/daily-health-logs` leaves it in place; inside the sync window the next sync re-asserts the synced value anyway (F5). | When something reads provenance |
| **F4** | A deletion subtracts from the row even if manual minutes were added on top after the sync (floored at 0). | Accepted |
| **F5** | The program date window (D-S5), review exclusions (D-CONF) and the admin-lock pre-filter (D-LOCK) stay client-side. The server accepts any valid date and answers `skipped_locked` as a backstop. | Out of scope (R2) |
| **F6** | The limiter lives in process memory: one instance, reset on deploy (observability F3). | — |
| **F7** | **Same app, same integration, two record ids for one session** (for example one app writing a session from two Android devices into one Health Connect store) still counts twice. The overlap rule compares only different apps or integrations, because overlapping samples from one app in one store are normally separate sessions. | Revisit only if seen |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-12 | **NET-NEW (reliability-overhaul Phase 3 R2, board §4 items 2–9).** `POST /api/health-sync/batch`, `GET` + `PUT /api/health-sync/state`; permanent workout sample ledger `health_sync_samples` + `health_sync_state` + `daily_health_logs.sleep_source` / `steps_source` (schema-neutral `sql/009`); deletions, overlap rule (different app or integration), 12 h / 24 h bounds, legacy import, review-once (across integrations), catch-up anchor, D-LOCK hold; `sync.run` registered in observability §8.1. Backend-only and additive for every live binary; `consumed_by = []` until the bundled iOS + Android releases (§8). D-C1–D-C12, F1–F7. |
````

### 13. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/daily-health-logs/SPEC.md` → 0.3.0

**13a.** On line 3, replace `**Version:** 0.2.1` with `**Version:** 0.3.0`.

**13b.** On lines 14-19, replace the whole `> **Deliberate changes (4, the rest faithful):** … with no divergence.` block with:

```markdown
> **Deliberate changes (5, the rest faithful):** **D-C2** reuse `workout-logs`' `requireDataEntryAllowed`
> route middleware for the `admin_only_data_entry` lock (instead of the inline `assertDataEntryAllowed`) ·
> **D-C3** tidy `updateDailyHealthLog`'s 3-arg signature to a single `body` param · **D-C4** a third metric —
> `daily_health_logs.steps` (migration `006`; a row is valid with **any one** of sleep/diet/steps, ratified
> **R-1**) · **D-C5** a batched, multi-program `POST /batch` write (upsert against existing rows) · **D-C6**
> (0.3.0) per-field provenance columns `sleep_source` / `steps_source` (migration `009`), written only by
> [`health-sync`](../health-sync/SPEC.md) v2 — no route here reads or returns them. Everything else is faithful
> 1:1; the CRUD quartet is used 1:1 by all three clients with no divergence.
```

**13c.** In §5, after the `**`steps`** …` sentence ending `(R-1 — sync days may carry steps only).` (:166), insert:

```markdown
- **`daily_health_logs.sleep_source` / `steps_source`** (0.3.0, D-C6 — migration `009`, **USER-run before the backend
  deploy**) — `varchar(16)`, nullable, CHECK `healthkit` · `health_connect`: which integration last set that field
  through `POST /api/health-sync/batch`; NULL = not set by health sync v2. **Not mapped by `models/DailyHealthLog.js`**,
  so none of this feature's routes reads, writes or returns them.
```

**13d.** In §8, after the bullet ending `…write \`sleep_hours\` and (0.2.0) \`steps\` via the single POST→409→PUT upsert idiom.` (:253), append:

```markdown
  As of 0.3.0, [`health-sync`](../health-sync/SPEC.md) (0.1.0) writes `sleep_hours` / `steps` + their `_source` columns
  for NEW builds through `POST /api/health-sync/batch` (raw SQL upsert, no 409 round trip); the live binaries keep the
  POST→409→PUT idiom here unchanged.
```

**13e.** In §9, after the D-C5 row (:291), insert:

```markdown
| **D-C6** | **Deliberate change — per-field provenance (0.3.0).** `daily_health_logs` gains `sleep_source` / `steps_source` (`varchar(16)`, nullable, CHECK `healthkit` · `health_connect`; migration `009`). NULL = not written by health sync v2 (manual, the batch form, or an old build's POST→409→PUT). The value is the **integration only**, not the origin app — a day total is aggregated across apps, so there is no single recording app (health-sync D-C6, confirmed at plan approval). **Written only by [`health-sync`](../health-sync/SPEC.md)** with raw SQL (its D-C7): the `DailyHealthLog` model does not map them, so this feature's routes neither read, write nor return them — every response stays byte-identical for the live binaries. One row can mix a synced sleep, a manual diet and a synced or manual steps value (board §4.6). Not cleared by a manual edit (F7). | DESIGN_BOARD §4.6 ✅; health-sync D-C6/D-C7; `sql/009`. |
```

**13f.** In §10, after the F6 row (:304), insert:

```markdown
| **F7** | **Provenance means "last set by health sync v2"** — a manual PUT / batch edit of a synced field leaves `<field>_source` in place (this feature's routes don't know the columns, D-C6); inside the sync window the next sync re-asserts the synced value anyway (apple-health F5). | `sql/009`; health-sync F3 | Revisit only when something reads provenance. |
```

**13g.** In §11, directly under the `|---------|------|--------|` line (:309), insert:

```markdown
| 0.3.0 | 2026-10-12 | **D-C6 — per-field provenance columns** `sleep_source` / `steps_source` (migration `009`, schema-neutral, staging first; USER-run before the deploy), written only by the new [`health-sync`](../health-sync/SPEC.md) 0.1.0 v2 batch for NEW builds (raw SQL — the `DailyHealthLog` model is unchanged, so all five routes' responses stay byte-identical for the live binaries; POST→409→PUT kept). §1 header, §5, §8, D-C6, D-S1, F7. Blast radius: analytics / member-analytics / frontend-kit read the data only — unaffected; apple-health / health-connect move to health-sync with the bundled client releases. |
```

**13h.** In the §9 D-S1 row (:293 before 13e; find it by text), replace `**Stance = faithful 1:1 except D-C2/D-C3 + the deliberate changes D-C4/D-C5.**` with:

`**Stance = faithful 1:1 except D-C2/D-C3 + the deliberate changes D-C4/D-C5/D-C6** (D-C6 = the 0.3.0 provenance columns, invisible through this feature's routes).`

### 14. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/workout-logs/SPEC.md` → 0.6.0

**14a.** On line 3, replace `**Version:** 0.5.1` with `**Version:** 0.6.0`.

**14b.** In §8 (:247-248), replace the Downstream bullet with:

```markdown
- **Downstream / referenced (not owned here):** the analytics + member-analytics features aggregate
  `workout_logs`; `daily-health-logs` shares the same file pair + the same log helpers (§7 D-C1);
  [`health-sync`](../health-sync/SPEC.md) (0.1.0) also **writes** `workout_logs` for NEW builds — adds each newly
  applied Health sample's minutes, subtracts a deleted sample's minutes (floored at 0; a row reaching 0 is deleted) —
  and imports `resolveProgramWorkout` + `isValidDateString` from `logService.js` (exported as of 0.6.0, no behavior
  change).
```

**14c.** In the §9 D-C9 row (:283), in the Decision cell, directly after `…see [\`apple-health\`](../apple-health/SPEC.md) D-SUM.`, append:

` **0.6.0:** kept unchanged for the live iOS 1.4.x / Android 1.0.0 sync writers; new builds sync through \`POST /api/health-sync/batch\` (health-sync D-C1) and never send the flag.`

**14d.** In §11, directly under `|---------|------|--------|` (:305), insert:

```markdown
| 0.6.0 | 2026-10-12 | **Owned interface: `logService.js` exports `resolveProgramWorkout` + `isValidDateString`** (no behavior change) for the new [`health-sync`](../health-sync/SPEC.md) 0.1.0, which also writes `workout_logs` for NEW builds (per-sample adds through its ledger, subtract on Health deletion, row deleted at 0). D-C9 `on_duplicate:"sum"` kept unchanged for the live binaries. §8 + D-C9 note. MINOR (new owned exports — the auth 0.11.0 `optionalAuthenticate` precedent); consumers `[web, ios, android]` unaffected; dependents read data only. |
```

### 15. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md` → 0.1.2

**15a.** On line 3, replace `**Version:** 0.1.1` with `**Version:** 0.1.2`. If R1 already took 0.1.2, use **0.1.3** here and in 15c.

**15b.** At the end of §8, after the bullet ending `(a \`text/plain\` \`sendBeacon\` body is not parsed).` (:211) and before `## 9. Decisions made`, insert the block below. If R1 already added a `### 8.1 Registered event types` heading, append only the `sync.run` row and its example under it.

````markdown
### 8.1 Registered event types

| `type` | Sender | `props` (no ids, names, emails or free text) |
|---|---|---|
| `sync.run` | iOS + Android health sync — one per run ([`health-sync`](../health-sync/SPEC.md) §8 rule 10) | `integration` (`healthkit` · `health_connect`, required) · `trigger` (`launch` · `foreground` · `pull_to_refresh` · `program_entry` · `background` · `connect` · `manual`) · `outcome` (`success` = every item final, nothing held · `partial` = a (program, kind) was held for the admin lock or a later batch failed · `failed` = nothing uploaded · `skipped` = nothing to sync) · `duration_ms` (integer) · `catch_up_days` (integer — the widest window read) · `batches` (integer) · `error_class` (`null`, a frontend-kit kind — `offline` · `timeout` · `signedOut` · `unavailable` · `server` · `invalidInput` · `unknown` — or `health_read_failed` · `permission_missing`) · `workout` / `sleep` / `steps` = `{ sent, applied, unchanged, duplicate, skipped, removed, invalid }` (integers; `applied` = `created` + `updated`, `skipped` = every `skipped_*`; omit a kind that didn't sync) · `legacy_recorded` (integer, upgrade runs only) |

```json
{ "id": "0b6f2c1e-6a51-4c39-9d8e-3f1a2b4c5d6e", "type": "sync.run", "occurred_at": "2026-10-12T18:04:05.000Z",
  "props": { "integration": "healthkit", "trigger": "foreground", "outcome": "success", "duration_ms": 1840,
             "catch_up_days": 2, "batches": 1, "error_class": null,
             "workout": { "sent": 3, "applied": 1, "duplicate": 2 },
             "sleep": { "sent": 3, "applied": 1, "unchanged": 2 }, "steps": { "sent": 3, "unchanged": 3 } } }
```
````

**15c.** In §11, directly under the header separator (:245), insert:

```markdown
| 0.1.2 | 2026-10-12 | **PATCH — §8.1 registers `sync.run`** (health-sync 0.1.0 §8 rule 10; Phase 3 R2): props `integration`, `trigger`, `outcome`, `duration_ms`, `catch_up_days`, `batches`, `error_class`, per-kind counts, `legacy_recorded`. Docs only — the ingest already accepts any well-formed type; no code change. |
```

### 16. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`

Version bumps:
- `"workout-logs"`: `"version": "0.5.1"` → `"0.6.0"`.
- `"daily-health-logs"`: `"version": "0.2.1"` → `"0.3.0"`. Also add `"sql/009_health_sync_ledger.sql"` to its `paths`, right after `"sql/006_add_steps_to_daily_health_logs.sql"`.
- `"observability"`: `"version": "0.1.1"` → `"0.1.2"` (or `"0.1.3"`, per 15a).

New entry: after the `"frontend-kit"` entry's closing `}` (:474), add a comma and then:

```json
    "health-sync": {
      "version": "0.1.0",
      "spec": "specs/features/health-sync/SPEC.md",
      "status": "built",
      "consumed_by": [],
      "depends_on": [
        "auth",
        "app-config",
        "observability",
        "programs",
        "program-memberships",
        "workout-logs",
        "daily-health-logs"
      ],
      "reference_impl": {
        "app": "backend",
        "paths": [
          "routes/healthSync.js",
          "services/healthSyncService.js",
          "services/healthSyncWorkouts.js",
          "services/healthSyncDaily.js",
          "models/HealthSyncSample.js",
          "models/HealthSyncState.js",
          "sql/009_health_sync_ledger.sql",
          "server.js"
        ]
      }
    }
```

### 17. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`

Row edits:
- `workout-logs`: `0.5.1` → `0.6.0`.
- `daily-health-logs`: `0.2.1` → `0.3.0`, and `` `sql/006` `` → `` `sql/006`, `sql/009` [provenance columns] ``.
- `observability`: `0.1.1` → `0.1.2` (or `0.1.3`, per 15a).

After the `frontend-kit` row (:30), insert:

```markdown
| `health-sync` | 0.1.0 | 🏗️ | — (none yet; `ios` `android` with the bundled reliability releases) | `backend` (`routes/healthSync.js`, `services/healthSync{Service,Workouts,Daily}.js`, `models/{HealthSyncSample,HealthSyncState}.js`, `sql/009`, `server.js` [mount before the global body parser]) | [health-sync/SPEC.md](health-sync/SPEC.md) |
```

After line 102, append:

```markdown
_`health-sync` (reliability-overhaul Phase 3 R2) is the second **net-new** feature: one idempotent batch upload per sync run, a permanent per-sample workout ledger (dedup, deletions, overlap rule, 12 h / 24 h bounds, legacy import), per-field sleep/steps provenance and server-remembered sync state — backend-only (`consumed_by = []`) until the bundled iOS + Android releases._
```

### 18. Orchestrator (not the implementer)

Save the scout brief, this plan and the final plan-adversary verdict as `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/plans/phase-3-r2-sync/{brief,plan,verdict}.md`.

## Steps — web
None.

## Steps — ios
None. The bundled release is planned later against health-sync SPEC §3 and §8.

## Steps — android
None, as for iOS.

## Endgame

**E1. Compile-check (implementer)**

```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && \
for f in routes/healthSync.js services/healthSyncService.js services/healthSyncWorkouts.js services/healthSyncDaily.js \
         models/HealthSyncSample.js models/HealthSyncState.js services/logService.js server.js; do node -c "$f" || exit 1; done && \
DATABASE_URL=postgres://check:check@127.0.0.1:5432/check SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co \
SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node -e "
const r = require('./routes/healthSync'); require('./services/healthSyncService');
const l = require('./services/logService');
if (typeof l.resolveProgramWorkout !== 'function' || typeof l.isValidDateString !== 'function') throw new Error('exports');
console.log(r.stack.map((x) => x.route ? Object.keys(x.route.methods)[0] + ' ' + x.route.path : x.name).join(' | '));" && \
wc -l routes/healthSync.js services/healthSync*.js models/HealthSync*.js && \
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master && git status --short -- \
  apps/backend/sql/009_health_sync_ledger.sql apps/backend/models/HealthSyncSample.js apps/backend/models/HealthSyncState.js \
  apps/backend/routes/healthSync.js apps/backend/services/healthSyncService.js apps/backend/services/healthSyncWorkouts.js \
  apps/backend/services/healthSyncDaily.js apps/backend/services/logService.js apps/backend/server.js apps/backend/sql/README.md \
  apps/backend/CONTEXT.md specs/features/health-sync/SPEC.md specs/features/daily-health-logs/SPEC.md \
  specs/features/workout-logs/SPEC.md specs/features/observability/SPEC.md specs/features/registry.json \
  specs/features/REGISTRY.md apps/backend/models/DailyHealthLog.js
```

Pass criteria:
- It prints exactly `blockUnversionedAndroid | post /batch | get /state | put /state | <anonymous>`.
- Line counts: `healthSyncService.js` 208, `healthSyncWorkouts.js` 203, the other four ≤ 93. If a file is more than 5 lines over these, report it; don't restructure.
- `git status` lists exactly 17 lines: 7 `??` and 10 ` M`. There must be no `models/DailyHealthLog.js` line.

No web, Android or iOS build is needed, because no client changes. There are no test suites.

**E2. Commit (git-version) with only R2's hunks.** Done by the orchestrator, before any deploy.

1. Stage the files only R2 touches:
   ```bash
   cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master
   git add apps/backend/sql/009_health_sync_ledger.sql apps/backend/models/HealthSyncSample.js apps/backend/models/HealthSyncState.js \
     apps/backend/routes/healthSync.js apps/backend/services/healthSyncService.js apps/backend/services/healthSyncWorkouts.js \
     apps/backend/services/healthSyncDaily.js specs/features/health-sync/SPEC.md specs/features/daily-health-logs/SPEC.md \
     specs/features/workout-logs/SPEC.md specs/initiatives/reliability-overhaul/plans/phase-3-r2-sync
   for f in apps/backend/services/logService.js apps/backend/server.js apps/backend/sql/README.md apps/backend/CONTEXT.md \
            specs/features/registry.json specs/features/REGISTRY.md specs/features/observability/SPEC.md; do echo "=== $f"; git diff -- "$f"; done
   ```
2. For each file printed by the loop:
   - **If every hunk is one of this plan's steps** (8, 9a/9b, 10a/10b, 11, 15a–c, 16, 17), run `git add <file>`.
   - **If R1 or R3 hunks are also present**, stage R2's version without `-p`:
     ```bash
     T=$(mktemp); git show HEAD:<file> > "$T"
     # apply to "$T" exactly this plan's step edits for <file> (same anchors/text)
     git update-index --cacheinfo 100644,"$(git hash-object -w "$T")",<file>; rm -f "$T"
     git diff --cached -- <file>   # must show ONLY R2's hunks; the working tree keeps every track's edits
     ```
3. `git diff --cached --name-only` must list exactly the 17 files from E1 plus the 3 plan files. `BRIEF.md` and `HANDOFF.md` must not appear, and nothing from R1 or R3 may appear.
4. Commit and tag:
   ```bash
   git commit -m "feat(health-sync): v2 batch sync, permanent sample ledger, provenance, sync state (Phase 3 R2)" \
              -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
   R2_SHA=$(git rev-parse HEAD); echo "$R2_SHA"   # record it in HANDOFF — every deploy below pushes THIS commit
   git tag feature/health-sync@v0.1.0 "$R2_SHA"; git tag feature/daily-health-logs@v0.3.0 "$R2_SHA"
   git tag feature/workout-logs@v0.6.0 "$R2_SHA"; git tag feature/observability@v0.1.2 "$R2_SHA"   # v0.1.3 if 15a applied
   ```

| Feature | Version | Tag | Reason |
|---|---|---|---|
| `health-sync` | **v0.1.0** (new) | `feature/health-sync@v0.1.0` | new feature |
| `daily-health-logs` | 0.2.1 → **0.3.0** | `feature/daily-health-logs@v0.3.0` | MINOR: owned table gains columns, D-C6 |
| `workout-logs` | 0.5.1 → **0.6.0** | `feature/workout-logs@v0.6.0` | MINOR: new owned exports (auth 0.11.0 precedent) |
| `observability` | 0.1.1 → **0.1.2** (0.1.3 if R1 landed first) | `feature/observability@v0.1.2` | PATCH: §8.1, docs only |

**E3. Migration on staging (USER-run; staging is mandatory because this is a migration)**

1. Supabase SQL editor: first line `SET search_path TO staging;`, then the whole of `apps/backend/sql/009_health_sync_ledger.sql`. Run it **without** "enable RLS".
2. Expected last row: `staging | t | t | 2 | 5 | f | t`.
3. Then run `sql/README` §Staging step 5 (read-only). Expected: `staging_tables` = 17 (plus R3's tables if 010 already ran) and `staging_rls_on` = 0.

**E4. Backend on staging (orchestrator, with the user's OK for the push)**

1. Check that the deploy is isolated. This must pass before every staging or prod push of `R2_SHA`:
   ```bash
   cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master && git fetch origin && \
   git log --oneline origin/main.."$R2_SHA" -- apps/backend
   ```
   - It must list **only** the `feat(health-sync)` commit, or other commits that change nothing but `*.md` files.
   - Any other listed commit (an R1 or R3 code commit that is an ancestor of `R2_SHA`): **STOP**. Proceed only after the user confirms that the commit's migration (010 / 011), if it has one, has already run in the target schema: `staging` here, `public` in E7.
2. Push: `git push --force-with-lease origin "$R2_SHA:refs/heads/staging"`. This deploys exactly R2 plus what is already on `main`. Staging is a single branch, so a push here replaces another track's staging build; the orchestrator runs one track on staging at a time.
3. Wake staging, with no `sleep`: `for i in 1 2 3; do curl -s -m 120 https://rasifiters-api-staging.onrender.com/ | grep -q running && break; done`.
4. Check that the deploy is live: use the render MCP read-only deploy list for `rasifiters-api-staging` (pass `workspaceId`). The newest deploy must be a new id with status `live`.

**E5. Staging smoke (orchestrator runs it; if `TESTBED_PASSWORD` isn't in the environment, the user runs it)**

The orchestrator writes this script to `<scratchpad>/staging-smoke.sh` and runs `bash <scratchpad>/staging-smoke.sh`. Never print the password. Expected results are in the comments; R=1 is the first run.

```bash
#!/usr/bin/env bash
# Health sync v2 — STAGING smoke (Phase 3 R2, E5). Account ava.rivera (+stg) · "RaSi Winter Reset" (admin) + "RaSi Spring Shred" (locked, logger).
R=${R:-1}   # run number — the ledger is permanent, so a re-run needs R=2, 3, … (fresh sample ids + dates)
M=$(printf '%02d' $((R + 1))); D=2025-$M-15; DN=2025-$M-16; D2=2025-$M-20; ID=stg$R
BASE=https://rasifiters-api-staging.onrender.com/api; TMP=$(mktemp)
[ -n "${TESTBED_PASSWORD:-}" ] || { read -rsp 'Testbed password: ' TESTBED_PASSWORD; echo; }
TOKEN=$(curl -s -m 30 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"ava.rivera\",\"password\":\"$TESTBED_PASSWORD\"}" | jq -r .token)
[ -n "$TOKEN" ] && [ "$TOKEN" != null ] || { echo "staging login failed — STOP"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
HDRS=(-H "$AUTH" -H 'Content-Type: application/json' -H 'X-App-Platform: ios' -H 'X-App-Version: 9.9.9' -H 'X-App-Build: 999')
PROGS=$(curl -s -m 20 "$BASE/programs" -H "$AUTH")
P=$(jq -r '.[] | select(.name=="RaSi Winter Reset") | .id' <<<"$PROGS")   # ava = admin, not locked
L=$(jq -r '.[] | select(.name=="RaSi Spring Shred") | .id' <<<"$PROGS")   # admin-only, ava = logger
[ -n "$P" ] && [ -n "$L" ] || { echo "testbed programs missing on staging — STOP and ask the user"; exit 1; }
sync() { curl -s -m 30 -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d "{\"integration\":\"${2:-healthkit}\",\"items\":[$1]}" | jq -c '[.results[].status]'; }
W() { printf '{"kind":"workout","program_id":"%s","date":"%s","sample_id":"%s","origin":"%s","workout_name":"%s","value":%s,"start_at":"%sT%sZ","end_at":"%sT%sZ"}' "${7:-$P}" "$D" "$ID-$1" "$2" "$3" "$4" "$D" "$5" "$D" "$6"; }
code() { curl -s -m 30 -o "$TMP" -w '%{http_code} ' "$@"; jq -c '{code,error}' "$TMP" 2>/dev/null || echo; }
echo S1  $(sync "$(W w1 com.apple.health.A Running 30 07:00:00 07:30:00)")                 # ["created"]
echo S2  $(sync "$(W w1 com.apple.health.A Running 30 07:00:00 07:30:00)")                 # ["duplicate"]
echo S3  $(sync "$(W w2 com.strava Running 25 07:05:00 07:30:00)")                         # ["skipped_overlap"]
echo S4  $(sync "$(W w3 com.apple.health.A Walking 800 08:00:00 21:20:00)")                # ["skipped_too_long"]
echo S5  $(sync "$(W w4 com.apple.health.A Walking 700 08:00:00 19:40:00),$(W w5 com.apple.health.A Walking 715 08:10:00 20:05:00)")   # ["created","skipped_day_cap"]
echo S6  $(sync '{"kind":"workout","deleted":true,"sample_id":"'"$ID"'-w1"}')             # ["removed"]
echo S3r $(sync "$(W w2 com.strava Running 25 07:05:00 07:30:00)")                         # ["created"]  D-C4 re-check: its overlap winner w1 is gone
echo S7  $(sync "$(W w6 com.apple.health.A Running 20 06:00:00 06:20:00 | sed 's/^{/{"legacy":true,/')")   # ["recorded"]
echo S8  $(sync "$(W w6 com.apple.health.A Running 20 06:00:00 06:20:00)")                 # ["duplicate"]
echo S9  $(sync "$(W w7 com.apple.health.A Running 15 05:00:00 05:15:00 "$L"),$(W w8 com.apple.health.A Running 15 05:00:00 05:15:00 00000000-0000-4000-8000-000000000000)")   # ["skipped_locked","skipped_not_member"]
echo S9x $(sync "$(W w9 com.apple.health.A Running 10 06:05:00 06:15:00)" health_connect)  # ["skipped_overlap"]  same app, other integration (D-C4)
echo S10  $(sync "{\"kind\":\"sleep\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":7.5},{\"kind\":\"steps\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":8123}")   # ["created","created"]
echo S10r $(sync "{\"kind\":\"sleep\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":7.5},{\"kind\":\"steps\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":8123}")   # ["unchanged","unchanged"]
echo S10u $(sync "{\"kind\":\"steps\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":9000}")   # ["updated"]
echo S11  $(sync "{\"kind\":\"yoga\"},{\"kind\":\"sleep\",\"program_id\":\"$P\",\"date\":\"$DN\",\"value\":6}")   # ["invalid","created"]
echo S12a $(code -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d '{"integration":"healthkit","items":[]}')   # 400 {"code":"invalid_batch",…}
echo S12b $(code -X POST "$BASE/health-sync/batch" -H 'Content-Type: application/json' -d '{}')                 # 401
echo S12c $(code -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d '{')                                        # 400 {"code":"invalid_body",…}
echo S12d $(code -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d "{\"integration\":\"healthkit\",\"items\":[{\"pad\":\"$(head -c 270000 /dev/zero | tr '\0' a)\"}]}")   # 413 {"code":"payload_too_large",…}
echo S12e $(code -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d "$(jq -nc --arg p "$P" --arg d "$D" '{integration:"healthkit",items:[range(301)|{kind:"steps",program_id:$p,date:$d,value:1}]}')")   # 400 {"code":"invalid_batch",…}
echo S13a $(curl -s -m 20 "$BASE/health-sync/state" -H "$AUTH" | jq -c '.states|length')   # 0 when R=1 (first run on this account) · 1 afterwards
echo S13b $(curl -s -m 20 -X PUT "$BASE/health-sync/state" "${HDRS[@]}" -d "{\"integration\":\"healthkit\",\"entries\":[{\"program_id\":\"$P\",\"kind\":\"sleep\",\"review_done\":true,\"sync_success\":true},{\"program_id\":\"00000000-0000-4000-8000-000000000000\",\"kind\":\"sleep\",\"sync_success\":true}]}" | jq -c '.states')   # 1 row: P/sleep, both times set
echo S13c $(curl -s -m 20 -X PUT "$BASE/health-sync/state" "${HDRS[@]}" -d "{\"integration\":\"healthkit\",\"entries\":[{\"program_id\":\"$P\",\"kind\":\"sleep\",\"review_done\":false}]}" | jq -c '.states')   # review_done_at null, last_success_at kept
echo S13x $(code -X PUT "$BASE/health-sync/state" "${HDRS[@]}" -d "{\"integration\":\"healthkit\",\"entries\":[{\"program_id\":\"$P\",\"kind\":\"sleep\"}]}")   # 400 {"code":"invalid_state",…}
# S14 — the old endpoints are unchanged (status codes + no *_source key in the bodies), then cleanup of D2
echo S14a $(curl -s -m 20 -o "$TMP" -w '%{http_code} ' -X POST "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\",\"sleep_hours\":6}"; jq -c '[keys[]|select(test("source"))]' "$TMP")   # 201 []
echo S14b $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\",\"sleep_hours\":6}")   # 409
echo S14c $(curl -s -m 20 -o "$TMP" -w '%{http_code} ' -X PUT "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\",\"steps\":100}"; jq -c '[keys[]|select(test("source"))]' "$TMP")   # 200 []
echo S14d $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/workout-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"workout_name\":\"Running\",\"date\":\"$D2\",\"duration\":10,\"on_duplicate\":\"sum\"}")   # 201
echo S14e $(curl -s -m 20 -X POST "$BASE/workout-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"workout_name\":\"Running\",\"date\":\"$D2\",\"duration\":10,\"on_duplicate\":\"sum\"}" | jq -c '{summed,duration}')   # {"summed":true,"duration":20}
echo S14f $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\"}")   # 200
echo S14g $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE "$BASE/workout-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"workout_name\":\"Running\",\"date\":\"$D2\"}")   # 200
rm -f "$TMP"
```

**Replay and idempotency** are tested inside one run: S2, S8 and S10r cover replay, and S3r covers the D-C4 re-check. The same `R` is never run twice. A re-run after a fix uses `R=2`, `3`, … so the sample ids and dates are fresh.

Then run these read-only SQL checks. The orchestrator uses the read-only supabase MCP; if its role can't read `staging`, the user pastes them into the SQL editor. The values are for R=1; for R=n use `stgn-%` and month n+1.

```sql
SELECT hs.sample_id, hs.integration, hs.status, hs.minutes, hs.deleted_at IS NOT NULL AS deleted, hs.program_workout_id IS NOT NULL AS has_pw
FROM staging.health_sync_samples hs JOIN staging.members m ON m.id = hs.member_id
WHERE m.username = 'ava.rivera' AND hs.sample_id LIKE 'stg1-%' ORDER BY hs.applied_at, hs.sample_id;
-- expect exactly 4 rows, all healthkit + has_pw=t: stg1-w1 applied 30 deleted=t · stg1-w4 applied 700 · stg1-w2 applied 25 · stg1-w6 legacy 20
SELECT pw.workout_name, wl.duration FROM staging.workout_logs wl
JOIN staging.program_workouts pw ON pw.id = wl.program_workout_id JOIN staging.members m ON m.id = wl.member_id
WHERE m.username = 'ava.rivera' AND wl.log_date = '2025-02-15' ORDER BY 1;
-- expect exactly: Running | 25 · Walking | 700  (w1's 30 hit 0 → row deleted; S3r re-created Running with 25; legacy 20 added nothing)
SELECT d.log_date, d.sleep_hours, d.sleep_source, d.steps, d.steps_source FROM staging.daily_health_logs d
JOIN staging.members m ON m.id = d.member_id WHERE m.username = 'ava.rivera' AND d.log_date IN ('2025-02-15','2025-02-16') ORDER BY 1;
-- expect 2025-02-15 | 7.50 | healthkit | 9000 | healthkit · 2025-02-16 | 6.00 | healthkit | null | null
```

Any mismatch → STOP, fix, commit again, and redo E4–E5 with the next `R`.

**E6. Migration on prod (USER-run; only after E5 passes and the Phase 3 gate is open)**

- Supabase SQL editor: `SET search_path TO public;` plus the whole of 009, then Run.
- Expected last row: `public | t | t | 2 | 5 | t | f`.

**E7. Prod deploy and the user-run prod smoke**

1. Re-run the E4.1 isolation check against `public`. Then push exactly R2's commit as a fast-forward, with no force: `git push origin "$R2_SHA:refs/heads/main"`. Push R2's tags by name only, not `--tags`, so other tracks' tags stay local: `git push origin feature/health-sync@v0.1.0 feature/daily-health-logs@v0.3.0 feature/workout-logs@v0.6.0 feature/observability@v0.1.2` (use `@v0.1.3` if 15a applied).
2. Wait for Render to show the prod deploy `live` (render MCP read-only deploy list, `workspaceId` `tea-cv3u7a3tq21c73ald2ig`).
3. The user runs the prod smoke. The orchestrator writes this script to `<scratchpad>/prod-smoke.sh`, and the user runs `bash <that path>`; it asks for the password and never echoes it.
   - Account: `zoe.chen`, a testbed member that is **not** the reviewer demo login.
   - **Left behind by design (harmless):** the ledger row `prodN-w1` (deleted) and one `health_sync_state` row for zoe.chen (healthkit / Winter Reset / sleep, both times set). No route clears `last_success_at`, and zoe.chen is never a reviewer or demo account.

```bash
#!/usr/bin/env bash
# Health sync v2 — PROD smoke (Phase 3 R2, E7; USER-run). Account zoe.chen (testbed — NOT the reviewer demo login)
# in "RaSi Winter Reset" (member, not admin-only). Dates are in 2025 (outside every program window) and are cleaned up;
# the ledger rows (prodN-w1, deleted) and one health_sync_state row (healthkit / Winter Reset / sleep) stay by design.
R=${R:-1}   # run number — a re-run needs R=2, 3, … (fresh sample ids + dates)
M=$(printf '%02d' $((R + 1))); D=2025-$M-15; D2=2025-$M-20; ID=prod$R
BASE=https://rasifiters-api.onrender.com/api; TMP=$(mktemp)
[ -n "${TESTBED_PASSWORD:-}" ] || { read -rsp 'Testbed password: ' TESTBED_PASSWORD; echo; }
TOKEN=$(curl -s -m 30 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"zoe.chen\",\"password\":\"$TESTBED_PASSWORD\"}" | jq -r .token)
[ -n "$TOKEN" ] && [ "$TOKEN" != null ] || { echo "prod login failed — STOP"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
HDRS=(-H "$AUTH" -H 'Content-Type: application/json' -H 'X-App-Platform: ios' -H 'X-App-Version: 9.9.9' -H 'X-App-Build: 999')
P=$(curl -s -m 20 "$BASE/programs" -H "$AUTH" | jq -r '.[] | select(.name=="RaSi Winter Reset") | .id')
[ -n "$P" ] || { echo "RaSi Winter Reset not found for zoe.chen — STOP"; exit 1; }
sync() { curl -s -m 30 -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d "{\"integration\":\"healthkit\",\"items\":[$1]}" | jq -c '[.results[].status]'; }
WK="{\"kind\":\"workout\",\"program_id\":\"$P\",\"date\":\"$D\",\"sample_id\":\"$ID-w1\",\"origin\":\"com.apple.health.A\",\"workout_name\":\"Running\",\"value\":30,\"start_at\":\"${D}T07:00:00Z\",\"end_at\":\"${D}T07:30:00Z\"}"
DAY="{\"kind\":\"sleep\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":7.5},{\"kind\":\"steps\",\"program_id\":\"$P\",\"date\":\"$D\",\"value\":8123}"
echo P1 $(sync "$WK")                                                       # ["created"]
echo P2 $(sync "$WK")                                                       # ["duplicate"]
echo P3 $(sync "{\"kind\":\"workout\",\"deleted\":true,\"sample_id\":\"$ID-w1\"}")   # ["removed"]  (the Running row hit 0 and is gone)
echo P4 $(sync "$DAY")                                                      # ["created","created"]
echo P5 $(sync "$DAY")                                                      # ["unchanged","unchanged"]
echo P6 $(curl -s -m 30 -o "$TMP" -w '%{http_code} ' -X POST "$BASE/health-sync/batch" "${HDRS[@]}" -d '{"integration":"healthkit","items":[]}'; jq -c .code "$TMP")   # 400 "invalid_batch"
echo P7 $(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$BASE/health-sync/batch" -H 'Content-Type: application/json' -d '{}')   # 401
echo P8 $(curl -s -m 20 "$BASE/health-sync/state" -H "$AUTH" | jq -c '.states|length')   # 0 when R=1 · 1 afterwards
echo P9 $(curl -s -m 20 -X PUT "$BASE/health-sync/state" "${HDRS[@]}" -d "{\"integration\":\"healthkit\",\"entries\":[{\"program_id\":\"$P\",\"kind\":\"sleep\",\"review_done\":true,\"sync_success\":true}]}" | jq -c '[.states[]|{kind,review:(.review_done_at!=null),success:(.last_success_at!=null)}]')   # [{"kind":"sleep","review":true,"success":true}]
# Old endpoints unchanged (live binaries), then cleanup
echo P10 $(curl -s -m 20 -o "$TMP" -w '%{http_code} ' -X POST "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\",\"sleep_hours\":6}"; jq -c '[keys[]|select(test("source"))]' "$TMP")   # 201 []
echo P11 $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\",\"sleep_hours\":6}")   # 409
echo P12 $(curl -s -m 20 -o "$TMP" -w '%{http_code} ' -X PUT "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\",\"steps\":100}"; jq -c '[keys[]|select(test("source"))]' "$TMP")   # 200 []
echo P13 $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/workout-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"workout_name\":\"Running\",\"date\":\"$D2\",\"duration\":10,\"on_duplicate\":\"sum\"}")   # 201
echo P14 $(curl -s -m 20 -X POST "$BASE/workout-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"workout_name\":\"Running\",\"date\":\"$D2\",\"duration\":10,\"on_duplicate\":\"sum\"}" | jq -c '{summed,duration}')   # {"summed":true,"duration":20}
echo C1 $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE "$BASE/workout-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"workout_name\":\"Running\",\"date\":\"$D2\"}")   # 200
echo C2 $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D2\"}")   # 200
echo C3 $(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE "$BASE/daily-health-logs" "${HDRS[@]}" -d "{\"program_id\":\"$P\",\"log_date\":\"$D\"}")    # 200 (the P4 row)
rm -f "$TMP"
```

4. Orchestrator: search the render MCP read-only logs for `"route":"/api/health-sync/batch"`. There should be status 200 lines with `"platform":"ios"` and `"version":"9.9.9"`, and no 5xx.

**E8. git-version outcome**

- `feature/health-sync@v0.1.0` (new feature).
- `feature/daily-health-logs@v0.3.0` (MINOR).
- `feature/workout-logs@v0.6.0` (MINOR).
- `feature/observability@v0.1.2` (PATCH; v0.1.3 if R1 landed first).

Commit type is `feat(health-sync)`. After E7 passes, a docs-only git-version commit flips `health-sync` `status` to `deployed` in `registry.json` and `REGISTRY.md`, with no bump.

Not re-versioned (FYI): analytics, analytics-v2, member-analytics and frontend-kit, which only read the data. apple-health 0.7.0 and health-connect 0.2.0 are bumped with the client releases.

## Risks the implementer must watch

**Live-binary compatibility**
- Do not edit `models/DailyHealthLog.js` or any `/workout-logs` or `/daily-health-logs` handler. Old response bodies must stay byte-identical (S14 and P10–P12 check this).
- In `logService.js`, change only `module.exports`.

**Cross-track deploy coupling (verdict #1)**
- **Every deploy pushes `R2_SHA`, never `main`.** Before each push, `git log origin/main..$R2_SHA -- apps/backend` must show no R1/R3 code commit, unless the user confirms that commit's migration already ran in the target schema (E4.1, E7.1).
- **Commits stage explicit paths only**: never `git add -A` or `-p`. Shared files with another track's hunks go through the E2 copy built from HEAD.
- **Tags are pushed by name.** Staging is one branch, so one track at a time.

**Mount order**
- `/api/health-sync` must sit **above** `app.use(express.json())`. If it sits below, the 256 kb parser never runs and bodies over 100 kb return 500.
- The mount sits above the `/api` gate, so the router's own `router.use(blockUnversionedAndroid)` is required.

**Bind parameters**
- Every bind value must be a value or `null`, never `undefined`.
- Use the exact `$name::type` casts as written. `DELETE_EMPTY_SQL` intentionally unnests the same four arrays as `SUBTRACT_SQL`, so one bind object fits both.
- `ON CONFLICT DO UPDATE` and `UPDATE … FROM unnest` must never see the same key twice in one statement. That is why `groupMinutes` aggregates, and why duplicate daily items are rejected as `invalid`.

**Status completeness and timeouts**
- The guard that throws inside the transaction if any item has no status must stay.
- Every DB call goes through `withTimeout`.

**Cross-track edits (R1 and R3 run in parallel)**
- `server.js`: two inserts only, anchored by text. R3 may add another mount before the body parser; keep both.
- `sql/README.md` and `CONTEXT.md`: append-only. Adjust the staging table count if R3's 010 lands first.
- Observability §8.1 and its version: if R1 landed first, append the `sync.run` row to its table and take **0.1.3**.
- `registry.json` and `REGISTRY.md`: edit only the 3 version rows named here, the daily-health-logs `paths`, and the new entry.
- `middleware/auth.js`, `versionGate.js`, `rateLimit.js`, `models/index.js`, `errorHandler.js`: import only.

**Deploy order**
- 009 runs before each environment's deploy. Without it only `/api/health-sync` returns 500s, and no client calls it yet.
- Staging first is mandatory, because this is a migration.

**Things the implementer must not do**
- Never run SQL against the live DB. 009 is the user's to run.
- No console, Render-env or Supabase-setting change is needed. If one seems needed, STOP and report.
- iOS compile and every visual or device test belong to the user in the later client releases. This track has no iOS or Android build.

**Doc mismatches carried to the client bumps**
- The apple-health / health-connect §3–§4 and §10 staleness, and apple-health §3b's steps-trigger claim, are fixed in the client releases.
- The scout's `HealthKitService.swift:76` should be `:77`.
