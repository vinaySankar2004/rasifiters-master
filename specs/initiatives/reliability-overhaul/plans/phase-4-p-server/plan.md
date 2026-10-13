# PLAN: People server slice S1. Covers "Hide my activity", the People list and profile, kudos, migration 012 and the API contract (revision 2)
**Brief accepted**: yes. 24 files: 16 backend, 8 docs. No file outside the brief. The optional `tools/testbed/visibility-smoke.mjs` is replaced by the inline matrix in step 28.

**Feature/version prediction**:
- `people` is new at v0.1.0.
- `members`, `member-analytics`, `analytics` and `analytics-v2` each take the next MINOR above whatever S0 lands. The owned interface changes additively. From today's labels that is 0.3.0→0.4.0, 0.4.0→0.5.0, 0.4.0→0.5.0 and 0.2.0→0.3.0.
- `notifications` takes the next PATCH above the Notifications track's version.
- No bump for `auth`. It lists `models/Member.js`, but the column belongs to members' D-rule and auth's code and behavior are unchanged.
- No app version bumps.

**Surfaces in scope**: [backend, docs]. Web, iOS and Android are untouched in S1. Their work is S2–S4, written against the API CONTRACT below.

## Revision 2: what changed (adversary objections)
| # | Fix |
|---|---|
| 1 BLOCKING | `DELETE /api/people/:memberId/kudos` now returns `{ kudos: { given_today, removed } }` with **no `count`**. Step 14 has the code and contract §E the shape. Row 13 of the checklist now covers DELETE, and the step-28 matrix tests it. |
| 2 | The migration now runs on staging **and public before any S1 code exists**: Phase A, steps 1–3. A push of `main` by another track can no longer cause the 503 outage. |
| 3 | Health-data consent is escalated as user decision **U-1**. No policy claims are stated as fact (Privacy §C). |
| 4 | The Activity category default goes to the user as **U-2**, and the old-binary pop-ups plus go-live timing as **U-3**. Contract §F now defers preference behavior to the Notifications SPEC. |
| 5 | Re-notify churn now has a per-pair limiter: 6 kudos writes per giver→recipient per 24 h. That allows at most 3 kudos notifications per pair per day (step 16). |
| 6 | git-version names the `auth` no-bump (step 29). |
| 7 | The seams are checked by a hard gate (G0, step 4). Step 8(d) now has code. No `D-C<n>` placeholders remain in code. A missing `getMemberTimeZone` fails the boot check instead of silently falling back to UTC. |
| 8 | Coverage now has three guards (step 26): a full inventory of all 33 current GET routes (35 after S1), an audit of the N-track and other files that read workout data, and a check of `getSummary(` and `computeStreaks` callers. |

## User decisions (escalated; if the user approves the plan without comment, the recommended option applies)
S1 code is identical under every option except U-1(c), which changes two default values (noted in steps 1 and 5). U-1 and U-3 mainly gate when the clients S2–S4 go live.

- **U-1: consent for showing synced Apple Health / Health Connect workouts to co-members.** Apple's HealthKit terms and Play's Health Connect policy both expect user consent before health data is shown to other people. Existing connected users never see a new `NSHealthShareUsageDescription`.
  - (a) Disclosure only: the policy text, purpose string and store answers in the Privacy section.
  - **(b) RECOMMENDED**: (a) plus a one-time **"Who can see your activity"** notice in every People client, with **[Keep visible]** and **[Hide my activity]**. "Hide" calls `PUT /api/members/:id {hide_activity:true}`.
    - On the phones it also shows once after the update to members who already sync health data.
    - The "seen" flag is stored on the device.
    - Why: it gives an explicit choice at the moment of disclosure, needs no server change and keeps D-P6.
  - (c) Hidden until opted in. This reverses D-P6, and People shows names only at launch. S1 changes: `DEFAULT true` in step 1 and `defaultValue: true` in step 5, and the VERIFY `hidden_members` value becomes the member count.
- **U-2: is the Activity notification category on by default?** It is owned by the Notifications track; D-N2 doesn't define Activity being off.
  - **RECOMMENDED: ON.** Kudos is a person-to-person interaction capped at one per giver per day.
  - If it is off, kudos still count and display, and `kudos.notification_id` stays null.
- **U-3: People go-live timing.** Old binaries show any new notification type as a blocking pop-up (D-N3 regression), and phone users with health sync wouldn't see the U-1 notice until they update.
  - **RECOMMENDED: People goes live on all clients together.** Web S2 is built and reviewed early but deployed alongside the store release.
  - The S1 backend can deploy any time; no live client calls `/api/people`.
  - Alternative: web People ships early with the kudos button held back until the store release.

## Preconditions and seams (the orchestrator confirms the names; the implementer verifies them with gate G0)
| Seam | Symbol S1 calls | Owner | Meaning S1 relies on |
|---|---|---|---|
| S-1 | `canViewRoster(viewer, programId)` → `Promise<boolean>`, exported from `apps/backend/utils/memberVisibility.js` | S0 | true for a global admin, or a viewer with an ACTIVE membership in `programId` |
| S-2 | S0's shared kind check, which takes (viewer, target member, program, data kind) and returns allowed | S0 | S1 adds kind `"activity"`, which maps to `canSeeActivity` |
| S-3 | `getMemberTimeZone(memberId)` → `Promise<string\|null>` (IANA), exported from `apps/backend/utils/notifications.js` | Notifications (N2, migration 011), which lands before S1 per DECISIONS order | the member's captured zone, or null |

Rules:
- S0, then N1–N8, are merged on `main` before step 4.
- If G0 reports a different name, STOP and report it to the orchestrator, which updates this table. Never guess and never rename.

## Steps — backend

### Phase A: migration first (no S1 code exists until step 3 completes)

1. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/012_people_hide_activity_kudos.sql`
```sql
-- 012_people_hide_activity_kudos.sql — People server slice S1 (reliability-overhaul Phase 4;
-- specs/features/people/SPEC.md §6; phase-4 DECISIONS D-P4–D-P7).
--
-- WHAT
--   PART 1  members.hide_activity — "Hide my activity" (D-P6/D-P7). boolean NOT NULL DEFAULT false: every existing member
--           stays visible. A constant default is a catalog-only change on PostgreSQL 11+ (no table rewrite).
--   PART 2  kudos — one row per giver per recipient per RECIPIENT-LOCAL day (D-P4/D-P5): UNIQUE (giver_id, recipient_id,
--           kudos_date) + CHECK giver_id <> recipient_id. program_id = the program it was given in (context + deep link
--           only; not part of the key). notification_id = its activity.kudos_received notification (SET NULL when the
--           notification is deleted — retention or undo).
--   PART 3  RLS on the `public` copy only; on `staging`: grants for rasifiters_staging + RLS off for every staging table.
--   PART 4  verification row.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema(). Run TWICE, STAGING FIRST:
--   SQL editor: first line `SET search_path TO staging;` + this whole file → Run; then the same with
--               `SET search_path TO public;`. If the editor offers "Run and enable RLS", run WITHOUT it.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/012_people_hide_activity_kudos.sql
--               then the same with public — SESSION pooler or direct connection (port 5432) ONLY.
-- ORDER: run + verify on BOTH schemas BEFORE any People S1 code is committed. The backend's Member model reads
--   members.hide_activity on EVERY authenticated request (the auth middleware's member lookup) — a backend that has the
--   attribute without the column answers every call 503. The running backend ignores the new column, so running this
--   early is safe. Independent of 011 (either order).
-- IDEMPOTENT: IF NOT EXISTS everywhere; the RLS / GRANT block re-runs safely.
-- LOCK TIMEOUT: the ALTER on members takes a brief exclusive lock, capped at 5 s. On "canceling statement due to lock
--   timeout" nothing changed — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — Hide my activity ==================================================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS hide_activity boolean DEFAULT false NOT NULL;

-- ===== PART 2 — kudos =============================================================================================
CREATE TABLE IF NOT EXISTS kudos (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    giver_id         uuid NOT NULL,
    recipient_id     uuid NOT NULL,
    program_id       uuid NOT NULL,
    kudos_date       date NOT NULL,
    notification_id  uuid,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT kudos_pkey PRIMARY KEY (id),
    CONSTRAINT kudos_not_self_check CHECK (giver_id <> recipient_id),
    CONSTRAINT kudos_giver_recipient_day_key UNIQUE (giver_id, recipient_id, kudos_date),
    CONSTRAINT kudos_giver_id_fkey FOREIGN KEY (giver_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT kudos_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT kudos_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    CONSTRAINT kudos_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
);

-- The profile's count + "given today" reads (recipient first); the UNIQUE key already serves giver-first lookups.
CREATE INDEX IF NOT EXISTS idx_kudos_recipient_id_kudos_date ON kudos USING btree (recipient_id, kudos_date);
-- FK indexes: a program delete / the nightly notification retention never scans kudos.
CREATE INDEX IF NOT EXISTS idx_kudos_program_id ON kudos USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_kudos_notification_id ON kudos USING btree (notification_id);

-- ===== PART 3 — RLS (public) / grants + RLS off (staging) =========================================================
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON kudos TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', current_schema(), t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 4 — verification (read-only; the SQL editor shows this last result) ===================================
SELECT current_schema()                                                          AS schema_name,          -- staging, then public
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'members' AND column_name = 'hide_activity'
           AND is_nullable = 'NO' AND column_default = 'false')                  AS hide_activity_column, -- 1
       (SELECT count(*) FROM members WHERE hide_activity)                        AS hidden_members,       -- 0 on the first run
       to_regclass('kudos') IS NOT NULL                                          AS kudos_table,          -- t
       (SELECT count(*) FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'kudos')            AS kudos_indexes,        -- 5
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid = to_regclass('kudos') AND contype IN ('c', 'u', 'f'))   AS kudos_constraints,    -- 6
       (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('kudos'))    AS rls_on,               -- public t · staging f
       has_table_privilege('rasifiters_staging', to_regclass('kudos'), 'INSERT') AS staging_role_writes;  -- staging t · public f
```
If the user picks U-1(c): change PART 1 to `DEFAULT true`. The `column_default = 'true'` check then applies, and `hidden_members` equals the member count.

2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md`, Files table. Append this row after the last `0NN_…` row (011's row if present, else 010's):
```
| `012_people_hide_activity_kudos.sql` | **Phase 4 People S1** ([`people`](../../../specs/features/people/SPEC.md) 0.1.0): `members.hide_activity boolean NOT NULL DEFAULT false` ("Hide my activity"; catalog-only add) + `kudos` (one row per giver → recipient per recipient-local day: `UNIQUE (giver_id, recipient_id, kudos_date)`, `CHECK (giver_id <> recipient_id)`; FKs → `members` / `programs` CASCADE, → `notifications` SET NULL; 3 indexes). Schema-neutral — run **staging first, then public**; RLS on the `public` copy only; staging grants + RLS off. Ends with a verification row (staging: `staging 1 0 t 5 6 f t`; public: `public 1 0 t 5 6 t f`). **Run on BOTH schemas BEFORE the People backend code is committed** — the `Member` model reads `hide_activity` on every authenticated request, so a backend without the column answers every call 503; the running backend ignores the column. Independent of 011 (either order). |
```

3. **STOP: the USER runs 012.**
   - The user runs the file on `staging`, and the VERIFY row must be `staging | 1 | 0 | t | 5 | 6 | f | t`. Then on `public`, where it must be `public | 1 | 0 | t | 5 | 6 | t | f`.
   - The user pastes both rows back.
   - Leave both files uncommitted. They go into the S1 feat commit in step 29.
   - Steps 4 onward start only after both rows match.

### Phase B: code (the column now exists on both schemas)

4. **Gate G0: seam check** (read-only, no DB connection):
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder node -r dotenv/config -e '
const v=require("./utils/memberVisibility");const n=require("./utils/notifications");const m=require("./services/memberAnalyticsService");
console.log(typeof v.canViewRoster, typeof n.getMemberTimeZone, ["viewerActiveRole","isActivityStaff","canSeeActivity","filterActivityRows","assertActivityVisible","requireActivityVisible"].filter(k=>k in v).join(",")||"none", "computeStreaks" in m);process.exit(0)'
```
   - The expected output is `function function none false`. A last value of `true` means N6 already exported `computeStreaks`; then skip 9(d).
   - Any other mismatch: STOP and report it.

5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/Member.js`. Insert directly after the `auth_user_id` attribute (it closes at :54):
```js
    hide_activity: {
        // people 0.1.0 (phase-4 D-P6/D-P7, migration sql/012): "Hide my activity" — hides this member's workouts,
        // workout stats and kudos from plain co-members (rule: utils/memberVisibility.js canSeeActivity).
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
```
For U-1(c), use `defaultValue: true`.

6. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/Kudos.js`
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// kudos — one row per giver → recipient per recipient-local day (people SPEC §6; migration sql/012). Written only by
// services/kudosService.js. No associations: nothing includes it (FKs live in SQL — the PushDelivery precedent).
const Kudos = sequelize.define("Kudos", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    giver_id: { type: DataTypes.UUID, allowNull: false },
    recipient_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: false },
    kudos_date: { type: DataTypes.DATEONLY, allowNull: false },
    notification_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "kudos",
    timestamps: false,
    underscored: true
});

module.exports = Kudos;
```

7. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/index.js`. This file is SHARED with the Notifications track; add lines only.
   - After `const MemberProgramOrder = require('./MemberProgramOrder');` (:14), add `const Kudos = require('./Kudos'); // people 0.1.0 — no associations (see models/Kudos.js)`.
   - In `module.exports`, after `MemberProgramOrder`, add `,\n    Kudos`. If the N-track appended entries after `MemberProgramOrder`, add `Kudos` as the last entry instead.
   - Add no associations.

8. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/memberVisibility.js` (EXTEND S0's module).
   - (a) **Imports.** You need `Op` from `"sequelize"`, `{ Member, ProgramMembership }` from `"../models"` and `{ AppError }` from `"./response"`. Merge any name S0 already imports into its existing destructuring; never `require` the same module twice.
   - (b) **Paste this block above `module.exports`:**
```js
// ═══ people 0.1.0 (phase-4 S1) — the ACTIVITY data kind ════════════════════════════════════════════════════════
// Activity = a member's workouts, workout stats (streaks, active days, last active) and kudos (D-P6 / D-P7).
// Rule (this ONE place): self always · global admin always · an ACTIVE admin or logger of that program always · anyone
// else only while the target's members.hide_activity is false. Program aggregates (totals, timelines, distributions,
// participation, type rankings without memberId) count hidden members on purpose and never call this.
// Every per-person output that uses it: specs/features/people/SPEC.md §5 (the route checklist). Fails closed: no viewer
// → nothing visible (internal callers must pass the recipient as the viewer).
const ACTIVITY_STAFF_ROLES = new Set(["admin", "logger"]);
const ACTIVITY_HIDDEN_MESSAGE = "This member keeps their activity private.";
const ACTIVITY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activityRoleCache = new WeakMap(); // viewer object → Map(programId → Promise<role | null>)

const sameMemberId = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();

// The viewer's ACTIVE role in a program (null = none). middleware/auth.js builds a fresh req.user per request, so keying
// the cache on that object makes it per-request: at most one membership query per (request, program).
const viewerActiveRole = (viewer, programId) => {
    if (!viewer?.id || !programId) return Promise.resolve(null);
    let byProgram = activityRoleCache.get(viewer);
    if (!byProgram) {
        byProgram = new Map();
        activityRoleCache.set(viewer, byProgram);
    }
    if (!byProgram.has(programId)) {
        byProgram.set(programId, ProgramMembership.findOne({
            where: { program_id: programId, member_id: viewer.id, status: "active" },
            attributes: ["program_id", "member_id", "role"]
        }).then((membership) => (membership ? membership.role : null)));
    }
    return byProgram.get(programId);
};

const isActivityStaff = async (viewer, programId) =>
    viewer?.global_role === "global_admin" || ACTIVITY_STAFF_ROLES.has(await viewerActiveRole(viewer, programId));

// target = a members row / { id, hide_activity } or a bare member id (then looked up).
const canSeeActivity = async ({ viewer, target, programId }) => {
    if (!viewer?.id || !target) return false;
    const targetId = typeof target === "string" ? target : target.id;
    if (sameMemberId(viewer.id, targetId)) return true;
    if (viewer.global_role === "global_admin") return true;
    let hidden = typeof target === "string" ? undefined : target.hide_activity;
    if (hidden === undefined) {
        const row = await Member.findByPk(targetId, { attributes: ["id", "hide_activity"] });
        hidden = Boolean(row?.hide_activity); // unknown member → nothing to hide (the caller 404s or returns empty)
    }
    if (!hidden) return true;
    return isActivityStaff(viewer, programId);
};

// List outputs (member-metrics rows, the summary's top_performers): keep only rows the viewer may see. One query for
// the rows' hide flags; the staff lookup runs only when a hidden row is present (and is cached).
const filterActivityRows = async ({ viewer, programId, rows, idOf = (row) => row.member_id }) => {
    if (!rows.length) return rows;
    const ids = [...new Set(rows.map(idOf).filter(Boolean))];
    const targets = ids.length
        ? await Member.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "hide_activity"] })
        : [];
    const byId = new Map(targets.map((t) => [t.id, t]));
    const keep = await Promise.all(rows.map((row) => canSeeActivity({
        viewer,
        target: byId.get(idOf(row)) || { id: idOf(row), hide_activity: false },
        programId
    })));
    return rows.filter((_row, index) => keep[index]);
};

// Service form — member-history / -streaks / -recent (memberAnalyticsService.assertMemberAccess).
const assertActivityVisible = async ({ viewer, targetMemberId, programId }) => {
    if (!(await canSeeActivity({ viewer, target: targetMemberId, programId }))) {
        throw new AppError(403, ACTIVITY_HIDDEN_MESSAGE, { code: "activity_hidden" });
    }
};

// Route form — the ?memberId analytics routes (v1 /workouts/types + the 4 v2 /workouts/types/* routes). Mount AFTER
// requireProgramAccess. No memberId (or "") = a program aggregate → pass through; no programId → the service's own 400.
const requireActivityVisible = async (req, res, next) => {
    try {
        const { memberId, programId } = req.query;
        if (memberId === undefined || memberId === "") return next();
        if (typeof memberId !== "string" || !ACTIVITY_UUID_RE.test(memberId)) {
            return res.status(400).json({ error: "memberId must be a valid id.", code: "invalid_request" });
        }
        if (typeof programId !== "string" || programId === "") return next();
        if (await canSeeActivity({ viewer: req.user, target: memberId, programId })) return next();
        return res.status(403).json({ error: ACTIVITY_HIDDEN_MESSAGE, code: "activity_hidden" });
    } catch (err) {
        next(err);
    }
};
```
   - (c) **Exports.** Add to `module.exports`: `viewerActiveRole, isActivityStaff, canSeeActivity, filterActivityRows, assertActivityVisible, requireActivityVisible`.
   - (d) **Seam S-2.** S0's shared kind check is the exported function whose body branches on S0's kinds (email / roster / health).
     - Insert this line as its first kind branch, renaming the four identifiers to S0's own parameter names for viewer, target member, program and kind:
       ```js
       if (kind === "activity") return canSeeActivity({ viewer, target, programId }); // people 0.1.0
       ```
     - If S0 declares a kinds constant (array, Set, object or frozen enum), add `"activity"` to it in S0's style (e.g. `ACTIVITY: "activity"`) and compare against that constant in the line above.
   - (e) This module must never `require` a `services/*` file. That would create a require cycle.
   - This file may exceed ~200 lines. That is accepted for one cohesive rule module; don't split it (a new file would be outside the brief).

9. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberAnalyticsService.js` (also touched by S0; merge with its edits).
   - (a) After the imports (:4), add `const { assertActivityVisible, filterActivityRows } = require("../utils/memberVisibility");`. If S0 already imports from that module, merge the names instead.
   - (b) In `assertMemberAccess`, directly after `if (!targetMembership) throw new AppError(404, "Member is not enrolled in this program.");` (:25), add:
```js
    // people 0.1.0 (people SPEC D-C2): a plain co-member can't read a hidden member's history / streaks / recent
    // workouts → 403. Self, active program admins/loggers and global admins always pass.
    await assertActivityVisible({ viewer: user, targetMemberId: memberId, programId });
```
   - (c) In `getMemberMetrics`, insert this directly after `let result = Array.from(metricsMap.values());` (:223) and BEFORE `const searchTrim`:
```js
    // people 0.1.0 (people SPEC D-C2): rows of members who hide their activity are OMITTED for plain viewers — never
    // zeroed (iOS MemberMetricsDTO has non-optional Ints). `total` keeps counting every active member; `filtered` counts
    // what's returned.
    result = await filterActivityRows({ viewer: user, programId, rows: result });
```
   - (d) Add `computeStreaks` to `module.exports` (:427-432); its semantics don't change. Skip this if G0 printed `true` last.

10. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/analyticsService.js`
   - (a) After :5, add `const { filterActivityRows } = require("../utils/memberVisibility");` (merge with any S0 import).
   - (b) At :118, change `async function getSummary(period, programId) {` to `async function getSummary(period, programId, user) {`.
   - (c) After the `topPerformersFormatted` map (:198-205), add:
```js
    // people 0.1.0 (people SPEC D-C2): plain viewers don't see members who hide their activity among the top performers
    // (the list may hold fewer than 5). totals / members / timeline / distribution / top_workout_types count everyone.
    const visibleTopPerformers = await filterActivityRows({ viewer: user, programId, rows: topPerformersFormatted });
```
   - (d) At :253, change `top_performers: topPerformersFormatted,` to `top_performers: visibleTopPerformers,`.

11. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js` (also touched by S0).
   - (a) After :5, add `const { requireActivityVisible } = require("../utils/memberVisibility");` (merge with S0's import if one exists).
   - (b) In the `/summary` handler (:44-47), the call becomes `analyticsService.getSummary((req.query.period || "day").toLowerCase(), req.query.programId, req.user)`.
   - (c) Insert `requireActivityVisible` directly after `requireProgramAccess` in the middleware chain of these routes:
     - `v1Router.get("/workouts/types"` (:140)
     - `v2Router.get("/workouts/types/total"` (:170)
     - `"/workouts/types/most-popular"` (:181)
     - `"/workouts/types/longest-duration"` (:192)
     - `"/workouts/types/highest-participation"` (:203)
   - (d) Above `v1Router.get("/workouts/types"`, add `// people 0.1.0: with ?memberId the activity kind applies (requireActivityVisible); without it = program aggregate, unchanged.`

12. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberService.js` (also touched by S0; keep S0's email gating byte-for-byte).
   - (a) **`getAllMembers`** (:16-23): change to `attributes: { exclude: ["auth_user_id", "hide_activity"] }` and extend the comment with ` — and people 0.1.0's hide_activity (members SPEC; shape unchanged).`
   - (b) **`getMemberById`**: the signature becomes `async function getMemberById(memberId, requester)`. If S0 already added a second parameter, keep S0's name and use it below.
     - Turn the final `return { … };` into `const response = { … };`, with S0's fields unchanged.
     - End the function with:
```js
    // people 0.1.0: the "Hide my activity" state — for the member themself (My Profile switch) and global admins only;
    // never shown to co-members.
    if (requester && (requester.id === member.id || requester.global_role === "global_admin")) {
        response.hide_activity = member.hide_activity;
    }
    return response;
```
   - (c) **`updateMember`** (:112-147):
     - The signature becomes `async function updateMember(memberId, { first_name, last_name, gender, hide_activity }, requester) {`.
     - Directly after the existing `if (!isOwnProfile && !isGlobalAdmin) { … }` block, insert:
```js
        // people 0.1.0 (people SPEC D-C3): "Hide my activity" — the member's own switch only (a global admin can't flip
        // it for someone else); strictly a JSON boolean. Absent = unchanged (every live binary omits it).
        if (hide_activity !== undefined) {
            if (!isOwnProfile) {
                await transaction.rollback();
                throw new AppError(403, "You can only change your own activity visibility.");
            }
            if (typeof hide_activity !== "boolean") {
                await transaction.rollback();
                throw new AppError(400, "hide_activity must be true or false.");
            }
        }
```
     - After `if (gender !== undefined) updateData.gender = gender;`, add `if (hide_activity !== undefined) updateData.hide_activity = hide_activity;`.
     - In the returned object, after `last_name: member.last_name`, add `,\n            hide_activity: member.hide_activity`.

13. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/members.js`. At :25 the call must read `await memberService.getMemberById(req.params.id, req.user);`. Change it only if S0 hasn't already.

14. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/kudosService.js`
```js
// Kudos service — give / undo kudos (specs/features/people/SPEC.md §4.3; phase-4 D-P4, D-P5, D-P9).
// One kudos per giver per recipient per RECIPIENT-LOCAL day — UNIQUE (giver_id, recipient_id, kudos_date), sql/012.
// A count only (no text). A new kudos emits ONE `activity.kudos_received` notification through
// utils/notifications.createNotification — category / template / preference handling belongs to the Notifications
// server (a null return = not created). Undo deletes the kudos and, while the recipient hasn't read it, its
// notification; it returns no count (the count is activity — people SPEC §5 row 13). Never require
// services/peopleService here (it requires this file).
const { UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../config/database");
const { Kudos, Member, Program, ProgramMembership, Notification, NotificationRecipient } = require("../models");
const { AppError } = require("../utils/response");
const notifications = require("../utils/notifications");
const { canSeeActivity, viewerActiveRole } = require("../utils/memberVisibility");

const KUDOS_NOTIFICATION_TYPE = "activity.kudos_received";

// D-P5 day rule: the calendar date in `timeZone` (IANA) at `now`; absent or invalid zone → the UTC date.
const localDateIn = (timeZone, now = new Date()) => {
    if (typeof timeZone === "string" && timeZone) {
        try {
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone, year: "numeric", month: "2-digit", day: "2-digit"
            }).formatToParts(now);
            const part = (type) => parts.find((p) => p.type === type)?.value;
            return `${part("year")}-${part("month")}-${part("day")}`;
        } catch (_err) {
            // RangeError: unknown time zone → UTC below
        }
    }
    return now.toISOString().slice(0, 10);
};

// The recipient's zone = the member time zone the Notifications server captures (D-N6, migration 011) — seam S-3.
const recipientLocalDate = async (recipientId) =>
    localDateIn(await notifications.getMemberTimeZone(recipientId));

const kudosState = async (giverId, recipientId, kudosDate) => {
    const [count, mine] = await Promise.all([
        Kudos.count({ where: { recipient_id: recipientId } }),
        Kudos.count({ where: { giver_id: giverId, recipient_id: recipientId, kudos_date: kudosDate } })
    ]);
    return { count, given_today: mine > 0 };
};

// The profile's kudos block (peopleService adds can_give). Only called after the activity check passed.
const getKudosSummary = async ({ viewerId, recipientId }) =>
    kudosState(viewerId, recipientId, await recipientLocalDate(recipientId));

// Insert once; the notification rides the same transaction (createNotification defers SSE + push to commit). A
// concurrent duplicate loses on the UNIQUE key → same outcome as "already given today".
const insertKudos = async ({ giver, recipientId, programId, programName, kudosDate }) => {
    try {
        await sequelize.transaction(async (transaction) => {
            const kudos = await Kudos.create({
                giver_id: giver.id,
                recipient_id: recipientId,
                program_id: programId,
                kudos_date: kudosDate
            }, { transaction });
            const notification = await notifications.createNotification({
                type: KUDOS_NOTIFICATION_TYPE,
                programId,
                actorMemberId: giver.id,
                title: "Kudos received",
                body: `${giver.member_name || "A member"} gave you kudos in ${programName || "your program"}.`,
                recipientIds: [recipientId],
                transaction
            });
            if (notification?.id) await kudos.update({ notification_id: notification.id }, { transaction });
        });
        return true;
    } catch (err) {
        if (err instanceof UniqueConstraintError) return false;
        throw err;
    }
};

// POST /api/people/:memberId/kudos — idempotent per recipient-local day → { created, kudos: { count, given_today } }.
async function giveKudos({ giver, recipientId, programId }) {
    if (recipientId === giver.id) {
        throw new AppError(400, "You can't give kudos to yourself.", { code: "kudos_self" });
    }
    if ((await viewerActiveRole(giver, programId)) === null) {
        throw new AppError(403, "You're not a member of this program.", { code: "not_program_member" });
    }
    const [program, membership] = await Promise.all([
        Program.findOne({ where: { id: programId, is_deleted: false }, attributes: ["id", "name"] }),
        ProgramMembership.findOne({
            where: { program_id: programId, member_id: recipientId, status: "active" },
            attributes: ["program_id", "member_id"],
            include: [{ model: Member, attributes: ["id", "hide_activity"] }]
        })
    ]);
    if (!program) throw new AppError(404, "This program no longer exists.", { code: "program_not_found" });
    if (!membership?.Member) {
        throw new AppError(404, "This person isn't in this program.", { code: "member_not_in_program" });
    }
    if (!(await canSeeActivity({ viewer: giver, target: membership.Member, programId }))) {
        throw new AppError(403, "This member keeps their activity private.", { code: "activity_hidden" });
    }
    const kudosDate = await recipientLocalDate(recipientId);
    const existing = await Kudos.findOne({
        where: { giver_id: giver.id, recipient_id: recipientId, kudos_date: kudosDate },
        attributes: ["id"]
    });
    const created = existing
        ? false
        : await insertKudos({ giver, recipientId, programId, programName: program.name, kudosDate });
    return { created, kudos: await kudosState(giver.id, recipientId, kudosDate) };
}

// DELETE /api/people/:memberId/kudos — undo the caller's kudos for the recipient's current day; idempotent; ungated
// (it only ever removes the caller's own row). Returns ONLY the caller's own state — never the recipient's count, so a
// hidden or unrelated member's kudos can't be read through it. Its notification goes too while unread
// (acknowledged_at IS NULL); a read one stays in the inbox. A push already delivered can't be recalled.
async function undoKudos({ giver, recipientId }) {
    const kudosDate = await recipientLocalDate(recipientId);
    const removed = await sequelize.transaction(async (transaction) => {
        const kudos = await Kudos.findOne({
            where: { giver_id: giver.id, recipient_id: recipientId, kudos_date: kudosDate },
            transaction
        });
        if (!kudos) return false;
        const notificationId = kudos.notification_id;
        await kudos.destroy({ transaction });
        if (notificationId) {
            const unread = await NotificationRecipient.count({
                where: { notification_id: notificationId, member_id: recipientId, acknowledged_at: null },
                transaction
            });
            // notification_recipients + push_deliveries rows go with it (ON DELETE CASCADE — sql/001, sql/010).
            if (unread > 0) await Notification.destroy({ where: { id: notificationId }, transaction });
        }
        return true;
    });
    return { given_today: false, removed };
}

module.exports = { giveKudos, undoKudos, getKudosSummary, localDateIn, KUDOS_NOTIFICATION_TYPE };
```

15. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/peopleService.js`
```js
// People service — the People list + a person's profile (specs/features/people/SPEC.md §3–§4; phase-4 D-P1–D-P3,
// D-P7, D-P10, D-P11). Roster access = S0's rule (canViewRoster); what of a person's ACTIVITY the viewer may see =
// utils/memberVisibility canSeeActivity — this file never re-states either rule. Grouped queries, no N+1.
const { Op, fn, col } = require("sequelize");
const { Member, Program, ProgramMembership, ProgramWorkout, WorkoutLog } = require("../models");
const { AppError } = require("../utils/response");
const { computeStreaks } = require("./memberAnalyticsService");
const { canViewRoster, canSeeActivity, isActivityStaff, viewerActiveRole } = require("../utils/memberVisibility");
const { getKudosSummary } = require("./kudosService");

const RECENT_WORKOUTS_LIMIT = 10;

const todayUtc = () => new Date().toISOString().slice(0, 10);

// raw MAX(log_date) / grouped log_date may come back as 'YYYY-MM-DD' or a Date depending on the type parser.
const toDateString = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

// D-P10: initials only (no photos) — computed here once so web / iOS / Android show the same letters.
const initialsOf = (first, last) =>
    `${[...(first || "").trim()][0] || ""}${[...(last || "").trim()][0] || ""}`.toUpperCase() || "?";

const MEMBER_ATTRS = ["id", "first_name", "last_name", "username", "hide_activity"];

const personBase = (membership, viewer) => {
    const member = membership.Member;
    return {
        member_id: member.id,
        member_name: `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Unknown",
        initials: initialsOf(member.first_name, member.last_name),
        username: member.username || "",
        program_role: membership.role,
        is_you: member.id === viewer.id
    };
};

// Shared prelude: the viewer may see this program's roster (S0 rule, seam S-1), then the program exists.
async function loadProgram(viewer, programId) {
    if (!(await canViewRoster(viewer, programId))) {
        throw new AppError(403, "You're not a member of this program.", { code: "not_program_member" });
    }
    const program = await Program.findOne({
        where: { id: programId, is_deleted: false },
        attributes: ["id", "start_date"]
    });
    if (!program) throw new AppError(404, "This program no longer exists.", { code: "program_not_found" });
    return program;
}

// GET /api/people?programId — every ACTIVE member; the caller first, then first + last name A→Z.
async function listPeople({ viewer, programId }) {
    await loadProgram(viewer, programId);
    const memberships = await ProgramMembership.findAll({
        where: { program_id: programId, status: "active" },
        attributes: ["program_id", "member_id", "role"],
        include: [{ model: Member, attributes: MEMBER_ATTRS }],
        order: [[Member, "first_name", "ASC"], [Member, "last_name", "ASC"]]
    });
    const rows = memberships.filter((membership) => membership.Member);
    const ids = rows.map((membership) => membership.member_id);
    const lastRows = ids.length ? await WorkoutLog.findAll({
        where: { program_id: programId, member_id: { [Op.in]: ids } },
        attributes: ["member_id", [fn("MAX", col("log_date")), "last_active"]],
        group: ["member_id"],
        raw: true
    }) : [];
    const lastActive = new Map(lastRows.map((row) => [row.member_id, toDateString(row.last_active)]));

    const people = [];
    for (const membership of rows) {
        const visible = await canSeeActivity({ viewer, target: membership.Member, programId });
        people.push({
            ...personBase(membership, viewer),
            activity_visible: visible,
            last_active: visible ? lastActive.get(membership.member_id) || null : null
        });
    }
    people.sort((a, b) => Number(b.is_you) - Number(a.is_you)); // stable: "You" first, A→Z kept
    return {
        program_id: programId,
        viewer: { member_id: viewer.id, is_staff: await isActivityStaff(viewer, programId) },
        people
    };
}

// Same streak window + semantics as GET /api/member-streaks (program start → today UTC; people F1) so the profile and
// "Open full stats" agree. Active days this month = distinct log dates in the current UTC month.
const buildStats = (dates, programStart) => {
    const today = todayUtc();
    const start = programStart || "1970-01-01";
    const { current, longest } = computeStreaks(dates.filter((d) => d >= start && d <= today));
    const month = today.slice(0, 7);
    return {
        current_streak: current,
        longest_streak: longest,
        active_days_this_month: dates.filter((d) => d.startsWith(month)).length,
        last_active: dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null
    };
};

// GET /api/people/:memberId?programId — D-P3 workouts only. Hidden from this viewer → stats / recent / kudos null.
async function getPersonProfile({ viewer, programId, memberId }) {
    const program = await loadProgram(viewer, programId);
    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: memberId, status: "active" },
        attributes: ["program_id", "member_id", "role", "joined_at"],
        include: [{ model: Member, attributes: MEMBER_ATTRS }]
    });
    if (!membership?.Member) {
        throw new AppError(404, "This person isn't in this program.", { code: "member_not_in_program" });
    }
    const base = personBase(membership, viewer);
    const [visible, isStaff, viewerRole] = await Promise.all([
        canSeeActivity({ viewer, target: membership.Member, programId }),
        isActivityStaff(viewer, programId),
        viewerActiveRole(viewer, programId)
    ]);
    const profile = {
        program_id: programId,
        ...base,
        joined_at: membership.joined_at,
        activity_visible: visible,
        can_open_full_stats: isStaff, // D-P11
        stats: null,
        recent_workouts: null,
        kudos: null
    };
    if (!visible) return profile;

    const [dateRows, recentRows, kudos] = await Promise.all([
        WorkoutLog.findAll({
            where: { program_id: programId, member_id: memberId },
            attributes: ["log_date"],
            group: ["log_date"],
            raw: true
        }),
        WorkoutLog.findAll({
            where: { program_id: programId, member_id: memberId },
            attributes: ["log_date", "duration"],
            include: [{ model: ProgramWorkout, attributes: ["workout_name"] }],
            order: [["log_date", "DESC"], [ProgramWorkout, "workout_name", "ASC"]],
            limit: RECENT_WORKOUTS_LIMIT
        }),
        getKudosSummary({ viewerId: viewer.id, recipientId: memberId })
    ]);
    profile.stats = buildStats(dateRows.map((row) => toDateString(row.log_date)).filter(Boolean), program.start_date);
    profile.recent_workouts = recentRows.map((w) => ({
        workout_type: w.ProgramWorkout?.workout_name || "",
        date: toDateString(w.log_date),
        duration_minutes: Number(w.duration || 0)
    }));
    profile.kudos = { ...kudos, can_give: !base.is_you && viewerRole !== null };
    return profile;
}

module.exports = { listPeople, getPersonProfile };
```

16. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/people.js`
```js
// /api/people — People list, person profile, kudos give / undo (specs/features/people/SPEC.md §3; phase-4 S1).
// Thin router: id validation → services. Errors are `{ error, code }` (frontend-kit §4: the status decides the kind;
// never a Sequelize 500 for a bad id). Mounted in server.js after express.json() + app-config's blockUnversionedAndroid.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { rateLimit } = require("../utils/rateLimit");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const peopleService = require("../services/peopleService");
const kudosService = require("../services/kudosService");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// people D-C8 — process memory; a deploy resets both (observability F3).
// Per member: 60 kudos writes (POST + DELETE) / 10 min — abuse protection (the health-sync D-C12 shape).
const limitKudosWrites = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyFn: (req) => req.user.id });
// Per giver → recipient: 6 writes / 24 h — bounds give/undo churn to at most 3 kudos notifications per pair per day.
const limitKudosPair = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 6,
    keyFn: (req) => `${req.user.id}:${String(req.params.memberId).toLowerCase()}`
});

const requireId = (value, field) => {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
        throw new AppError(400, `${field} must be a valid id.`, { code: "invalid_request" });
    }
    return value.toLowerCase();
};

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        const { status = 200, body } = await run(req);
        res.status(status).json(body);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[people] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", authenticateToken, handle("list", "Failed to load people.", async (req) => ({
    body: await peopleService.listPeople({
        viewer: req.user,
        programId: requireId(req.query.programId, "programId")
    })
})));

router.get("/:memberId", authenticateToken, handle("profile", "Failed to load this profile.", async (req) => ({
    body: await peopleService.getPersonProfile({
        viewer: req.user,
        programId: requireId(req.query.programId, "programId"),
        memberId: requireId(req.params.memberId, "memberId")
    })
})));

router.post("/:memberId/kudos", authenticateToken, limitKudosWrites, limitKudosPair,
    handle("kudos give", "Failed to send kudos.", async (req) => {
        const result = await kudosService.giveKudos({
            giver: req.user,
            recipientId: requireId(req.params.memberId, "memberId"),
            programId: requireId(req.body?.program_id, "program_id")
        });
        return { status: result.created ? 201 : 200, body: { kudos: result.kudos } };
    }));

router.delete("/:memberId/kudos", authenticateToken, limitKudosWrites, limitKudosPair,
    handle("kudos undo", "Failed to undo kudos.", async (req) => ({
        body: {
            kudos: await kudosService.undoKudos({
                giver: req.user,
                recipientId: requireId(req.params.memberId, "memberId")
            })
        }
    })));

module.exports = router;
```

17. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js`. This file is SHARED with the Notifications track; add lines only.
   - After `const healthSyncRoutes = require("./routes/healthSync");` (:30), add `const peopleRoutes = require("./routes/people");`.
   - After `app.use("/api/member-recent", memberRecentRoutes);` (:117), add `app.use("/api/people", peopleRoutes); // people 0.1.0 (phase-4 S1)`.

18. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md`
   - (a) Under `## Data`, after the "Added (reliability overhaul Phase 3 R3)" bullet, add:
     `- **Added (reliability overhaul Phase 4, People S1):** \`members.hide_activity\` ("Hide my activity", default false) + \`kudos\` (one per giver → recipient per recipient-local day; FK cascades; \`notification_id\` SET NULL) — migration \`sql/012\`, routes \`/api/people\` (list · profile · kudos give/undo) and the activity kind in \`utils/memberVisibility.js\` ([\`people\`](../../specs/features/people/SPEC.md)).`
   - (b) In `## Endpoints`: replace `~13 route groups (` with `~14 route groups (`, and `member-analytics). Documented` with `member-analytics, people). Documented`.
   - (c) In `## Status`: replace `All ~13 route groups` with `All ~14 route groups`.

## Steps — docs (they land in git-version's single docs commit)

19. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/people/SPEC.md`
````markdown
# Feature: `people` — program People list, person profiles, kudos and "Hide my activity"

> **Status:** 🏗️ built (backend, phase-4 S1) · **Version:** 0.1.0 · **Apps (`consumed_by`):** none yet — web (S2), iOS (S3), Android (S4) join as they ship
> **Provenance:** **NET-NEW.** Decisions: [`phase-4/DECISIONS.md`](../../initiatives/reliability-overhaul/phase-4/DECISIONS.md) (D-P1–D-P11); discovery: [`phase-4/DISCOVERY.md`](../../initiatives/reliability-overhaul/phase-4/DISCOVERY.md) §4; board [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §10.
> **Depends on:** [`auth`](../auth/SPEC.md) · [`members`](../members/SPEC.md) (`members.hide_activity`) · [`programs`](../programs/SPEC.md) · [`program-memberships`](../program-memberships/SPEC.md) · [`program-workouts`](../program-workouts/SPEC.md) · [`workout-logs`](../workout-logs/SPEC.md) · [`member-analytics`](../member-analytics/SPEC.md) (`computeStreaks`) · [`notifications`](../notifications/SPEC.md) (`createNotification`; the member time zone) · [`observability`](../observability/SPEC.md) (`utils/rateLimit.js`).

## 1. What it is
The program's people. A list of the current program's active members, for every role, with the caller first ("You") and initials only. A person's profile shows workouts only: streaks, active days this month, the last 10 workouts and last active. Members can give each other kudos: one per giver per recipient per recipient-local day, undoable, a count only. "Hide my activity" is one switch per member that hides their activity from plain co-members.

## 2. Why it exists
The Members tab is a one-person dashboard. People adds a social layer limited to your own programs (board §10, D-14), with privacy first. S0 closed today's gaps; S1 adds the switch and runs one visibility check on every per-person read (§5), so the switch can't lie.

## 3. The contract
<Copy the plan's "API CONTRACT" section here verbatim (§A–§F).>

## 4. Server behavior
4.1 **Activity rule.** Activity means workouts, workout stats and kudos. It is decided ONLY by `utils/memberVisibility.js` `canSeeActivity`:
- self: always;
- a global admin: always;
- an ACTIVE admin or logger of that program: always;
- anyone else: only while `members.hide_activity` is false.

It fails closed: no viewer means nothing is visible. It is applied through four helpers: `filterActivityRows` (lists; rows are omitted, never zeroed), `assertActivityVisible` (services, 403), `requireActivityVisible` (`?memberId` routes, 403/400) and direct calls (People). Program aggregates count hidden members on purpose.

4.2 **List and profile.**
- Active memberships only. Order: caller first, then first name A→Z, then last name A→Z.
- `initials` = the first letter of the first name plus the first letter of the last name, uppercased; "?" if both are empty.
- `last_active` = the latest workout `log_date` in this program.
- Profile streaks use the `/member-streaks` window (program start → today UTC) and semantics (F1).
- `active_days_this_month` = distinct log dates in the current UTC month.
- `recent_workouts` = the latest 10, ordered by date descending, then type A→Z.
- `can_open_full_stats` = the viewer is staff (D-P11).

4.3 **Kudos.**
- **Day:** the recipient's local calendar date. The IANA zone comes from the Notifications server's `getMemberTimeZone`; if it is absent or invalid, UTC is used.
- **Key:** UNIQUE (giver, recipient, day). Never to yourself. Only between ACTIVE members of the given `program_id`. A plain giver can't give kudos to a hidden member (403 `activity_hidden`).
- **Give:** idempotent (201 new / 200 already). A new kudos creates `activity.kudos_received` through `createNotification` inside the insert transaction.
- **Undo:** deletes today's row, plus its notification while it is unread. It is idempotent and ungated, and returns only the caller's own state (`given_today`, `removed`), never a count.
- **Count:** all-time received, across all programs. It is shown only where the recipient's activity is visible to the viewer.

## 5. Route checklist (every per-person output) + verification
<Copy the plan's "ROUTE CHECKLIST" section here verbatim, including the GET inventory.>

## 6. Data / schema — `apps/backend/sql/012_people_hide_activity_kudos.sql`
- `members.hide_activity boolean NOT NULL DEFAULT false`.
- `kudos (id uuid PK, giver_id → members CASCADE, recipient_id → members CASCADE, program_id → programs CASCADE, kudos_date date, notification_id → notifications SET NULL, created_at)`, with `CHECK (giver_id <> recipient_id)` and `UNIQUE (giver_id, recipient_id, kudos_date)`.
- Indexes: (recipient_id, kudos_date), (program_id), (notification_id).
- RLS on the public copy only. Model `models/Kudos.js`, which has no associations.

## 7. Flags / env
No env vars. The kudos write limits are constants in `routes/people.js`:
- 60 per member per 10 min;
- 6 per giver→recipient per 24 h.

## 8. Rollout + live binaries
- **Order:** 012 on staging and public BEFORE the S1 code is committed → backend (staging branch, then `main`) → clients (timing per user decision U-3).
- **Live binaries.** iOS 1.4.2 (56) / 1.5.0 (58) and Android 1.0.0 (4) / 1.1.0 (5) never call `/api/people`.
  - Plain-member apps request only their own `memberId`, and their own row is never filtered.
  - Staff are never filtered.
  - `GET` and `PUT /members/:id` changes are additive keys.
- **Kudos notifications** exist only once a People client ships. Old binaries show them as a pop-up on the default channel (F3; U-3).

## 9. Decisions made
| ID | Decision |
|----|----------|
| **D-C1** | Scope (S1, backend): `/api/people` (list, profile, kudos give/undo), `members.hide_activity`, `kudos`, the activity kind in `utils/memberVisibility.js` and its application on every per-person read (§5). Clients join `consumed_by` in S2–S4. |
| **D-C2** | One activity rule (§4.1) in one function (`canSeeActivity`), registered as kind `activity` in S0's shared check. Hidden rows are omitted, never zeroed. Aggregates count everyone. Any later output that names another member's activity must use it and add a §5 row. |
| **D-C3** | "Hide my activity" is one switch per member covering all programs. It defaults to off and only the member sets it (`PUT /members/:id`, own profile; not global admins). |
| **D-C4** | Kudos day = the recipient's local day (§4.3). One per giver → recipient per day. Not to self. Only between active members of `program_id`, which is context and not part of the key. |
| **D-C5** | Give is idempotent and emits `activity.kudos_received` through `createNotification` inside the transaction. S1 passes the title `Kudos received` and the body `<Giver name> gave you kudos in <Program name>.`; the Notifications server may template it or not create it (then `notification_id` is null). |
| **D-C6** | Undo deletes the kudos and its notification while unread. It is idempotent and ungated, and returns `{given_today, removed}` only (no count — it would bypass the activity rule). |
| **D-C7** | Kudos `count` = all-time received across programs, shown only where activity is visible. `given_today` = the viewer's kudos for the recipient's current day. `can_give` = not self and the viewer is an active member. |
| **D-C8** | Rate limits, in process memory: 60 kudos writes (POST + DELETE) per member per 10 min, plus 6 per giver→recipient per 24 h (at most 3 kudos notifications per pair per day). Reads are not limited. |
| **D-C9** | Initials are computed server-side for parity (D-P10). Profile = workouts only (D-P3). `can_open_full_stats` = staff (D-P11). No photos and no feed. |
| **D-C10** | Not built: person-to-person blocking (D-P9); membership editing from a profile (D-P11 — stays global-admin only); any streak semantic change (F1); an activity feed. |
| **D-C11** | Roster gate = S0's `canViewRoster`. Time zone = the Notifications server's `getMemberTimeZone`; UTC when absent or invalid. |
| **D-C12** | Disclosure of synced Apple Health / Health Connect workouts to co-members follows user decision U-1 (see the text after this table). |

D-C12 text, per the user's U-1 answer:
- **(b), the default:** policy text + purpose string + store answers + a one-time "Who can see your activity" notice ([Keep visible] / [Hide my activity]) in every People client before it first shows other people, and once after the update on phones already syncing health data. The flag is device-local.
- **(a):** policy text + purpose string + store answers only.
- **(c):** `hide_activity` defaults to true; members opt in to be visible.

## 10. Flagged characteristics
| ID | Characteristic |
|----|----------------|
| **F1** | The current streak doesn't reset when today is missed (`computeStreaks`, unchanged; undecided), so co-members can see a stale streak. |
| **F2** | Re-giving after an undo on the same day notifies again, capped by the pair limit (at most 3 per pair per 24 h). |
| **F3** | Live binaries show `activity.kudos_received` as a blocking pop-up on the default Android channel. Timing per U-3. |
| **F4** | `GET /analytics/summary` `top_performers` can hold fewer than 5 rows for plain viewers. No client renders it. |
| **F5** | An undo can't recall a push that was already delivered. If the day rolled over (or the recipient's zone changed) before the undo, the earlier day's kudos stays in place (`removed:false`). |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | (the docs commit's date, YYYY-MM-DD) | Initial SPEC + backend S1 (phase-4): `/api/people` (list · profile · kudos give/undo), `members.hide_activity`, `kudos` (sql/012), the activity kind + route checklist (§5). |
````

20. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/members/SPEC.md`
   - Header `**Version:**`: S0's value +1 MINOR.
   - §3 `GET /:id` bullet: append `People 0.1.0: plus \`hide_activity\` (boolean) when the requester is that member or a global admin.`
   - §3 `PUT /:id` bullet: append `Accepts \`hide_activity\` (strict boolean; own profile only → 403 \`You can only change your own activity visibility.\`; non-boolean → 400 \`hide_activity must be true or false.\`); the response adds \`hide_activity\`.`
   - §5 `members` bullet: add `\`hide_activity\` (migration \`sql/012\`, default false)`.
   - §9: append a row whose id is the integer after the highest D-C id in that table:
     `**"Hide my activity" (people 0.1.0, phase-4 D-P6/D-P7; deliberate, additive).** members.hide_activity; GET /:id returns it to self / global admin only; PUT /:id sets it for the own profile only (strict boolean) and echoes it; GET / excludes it (shape unchanged). What it hides: [people SPEC §4](../people/SPEC.md).`
   - §11: new top row, `MINOR — that D-rule; live binaries never send it and ignore the new key.`

21. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/member-analytics/SPEC.md`
   - Header version: +1 MINOR.
   - §9: append a row (next D-C id):
     `**Activity visibility (people 0.1.0; deliberate).** /member-metrics OMITS (never zeroes) rows of members who hide their activity for plain viewers — \`total\` counts every active member, \`filtered\` the returned rows; assertMemberAccess (history / streaks / recent) → 403 \`{ error: "This member keeps their activity private." }\` for the same case. Self, active admins/loggers, global admins unaffected. Rule only in utils/memberVisibility.js. \`computeStreaks\` exported (people reuses it; unchanged).`
   - §11: MINOR row.
   - `registry.json` `depends_on` += `"people"`.

22. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics/SPEC.md`
   - Header version: +1 MINOR.
   - §9: append a row (next D-C id):
     `**Activity visibility (people 0.1.0; deliberate).** /summary drops hidden members from top_performers for plain viewers (may be < 5; everything else counts everyone); getSummary(period, programId, user) — every caller must pass the viewer (fails closed). /workouts/types with memberId runs requireActivityVisible after requireProgramAccess: non-UUID memberId → 400 invalid_request; plain viewer → hidden member → 403 activity_hidden. Without memberId unchanged.`
   - §11: MINOR row.
   - `depends_on` += `"people"`.

23. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics-v2/SPEC.md`
   - Header version: +1 MINOR.
   - §9: append a row (next D-C id):
     `**Activity visibility (people 0.1.0; deliberate).** The four /workouts/types/{total,most-popular,longest-duration,highest-participation} routes run requireActivityVisible after requireProgramAccess when memberId is present (non-UUID → 400 invalid_request; plain → hidden → 403 activity_hidden). /participation/mtd and memberId-less calls unchanged.`
   - §11: MINOR row.
   - `depends_on` += `"people"`.

24. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/notifications/SPEC.md`
   - Header version: +1 PATCH above the Notifications track's version.
   - §9: append a row (next D-C id):
     `**New emitter — \`activity.kudos_received\` (people 0.1.0).** services/kudosService.js calls createNotification inside the kudos insert transaction: recipient = the kudos recipient, actorMemberId = giver, programId = the kudos program, title \`Kudos received\`, body \`<Giver name> gave you kudos in <Program name>.\`; a null return is stored as kudos.notification_id NULL. Undo deletes the notification while the recipient's row is unacknowledged. Category = Activity (this SPEC's preference rules apply); Android channel per §3.`
   - §11: PATCH row.

25. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json` + `REGISTRY.md`
   - (a) **`registry.json`.** Add after `"health-sync"`:
```json
    "people": {
      "version": "0.1.0",
      "spec": "specs/features/people/SPEC.md",
      "status": "built",
      "consumed_by": [],
      "depends_on": ["auth", "members", "programs", "program-memberships", "program-workouts", "workout-logs", "member-analytics", "notifications", "observability"],
      "reference_impl": {
        "app": "backend",
        "paths": ["routes/people.js", "services/peopleService.js", "services/kudosService.js", "models/Kudos.js", "utils/memberVisibility.js", "sql/012_people_hide_activity_kudos.sql", "server.js"]
      }
    }
```
     Then bump the versions of members, member-analytics, analytics, analytics-v2 and notifications per steps 20–24.
   - (b) **`REGISTRY.md`.** Append after the `health-sync` row:
     ``| `people` | 0.1.0 | 🏗️ | — (backend only until S2–S4) | `backend` (`routes/people.js`, `services/{peopleService,kudosService}.js`, `models/Kudos.js`, `utils/memberVisibility.js` [activity kind], `sql/012`, `server.js` [mount]) | [people/SPEC.md](people/SPEC.md) |``
     Then bump the Version cells of the five touched rows.
   - (c) **Status flip.** After the prod deploy is verified, flip `people` to `deployed` / 🚀 with no version bump.

## Endgame

26. **Compile, boot and coverage checks** (backend; the implementer runs them). Web, iOS and Android are untouched: no `npm run build`, no gradlew, no ⌘B. All live and visual testing is the user's.
   - (a) **Syntax:**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && for f in server.js routes/people.js routes/analytics.js routes/members.js services/peopleService.js services/kudosService.js services/memberAnalyticsService.js services/analyticsService.js services/memberService.js utils/memberVisibility.js models/Kudos.js models/Member.js models/index.js; do node --check "$f" || echo "FAIL $f"; done
```
   - (b) **Boot check** (loads modules only; no server, no DB connection):
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder node -r dotenv/config -e '
const show=(r)=>{for(const l of r.stack)if(l.route)console.log(`${Object.keys(l.route.methods)} ${l.route.path} ${l.route.stack.map(s=>s.name).join(",")}`);};
show(require("./routes/people"));
const {v1Router,v2Router}=require("./routes/analytics");
for(const l of [...v1Router.stack,...v2Router.stack])if(l.route&&/types|summary/.test(l.route.path))console.log(`${l.route.path} ${l.route.stack.map(s=>s.name).join(",")}`);
const v=require("./utils/memberVisibility");console.log(["viewerActiveRole","isActivityStaff","canSeeActivity","filterActivityRows","assertActivityVisible","requireActivityVisible","canViewRoster"].map(k=>typeof v[k]).join(","));
console.log(typeof require("./services/memberAnalyticsService").computeStreaks);
console.log(typeof require("./utils/notifications").getMemberTimeZone);
const k=require("./services/kudosService");console.log(Object.keys(k).join(","));
const d=new Date("2026-10-13T23:30:00Z");console.log([k.localDateIn("Australia/Sydney",d),k.localDateIn("America/Vancouver",d),k.localDateIn("Not/AZone",d),k.localDateIn(null,d)].join(","));
console.log(Object.keys(require("./services/peopleService")).join(","));
const m=require("./models");console.log(Object.keys(m.Kudos.rawAttributes).join(","),"hide_activity" in m.Member.rawAttributes);
(async()=>{const viewer={id:"a",global_role:"standard"};console.log(await v.canSeeActivity({viewer,target:{id:"A",hide_activity:true},programId:"p"}),await v.canSeeActivity({viewer,target:{id:"b",hide_activity:false},programId:"p"}),await v.canSeeActivity({viewer:{id:"a",global_role:"global_admin"},target:{id:"b",hide_activity:true},programId:"p"}),await v.canSeeActivity({viewer,target:{id:"b",hide_activity:true},programId:null}));process.exit(0);})()'
```
     The output must be exactly these 18 lines. If S0 added its own middleware to `/summary`, that line may also carry S0's name; only S1's middleware positions are checked.
```
get / authenticateToken,<anonymous>
get /:memberId authenticateToken,<anonymous>
post /:memberId/kudos authenticateToken,<anonymous>,<anonymous>,<anonymous>
delete /:memberId/kudos authenticateToken,<anonymous>,<anonymous>,<anonymous>
/summary authenticateToken,requireProgramAccess,<anonymous>
/workouts/types authenticateToken,requireProgramAccess,requireActivityVisible,<anonymous>
/workouts/types/total authenticateToken,requireProgramAccess,requireActivityVisible,<anonymous>
/workouts/types/most-popular authenticateToken,requireProgramAccess,requireActivityVisible,<anonymous>
/workouts/types/longest-duration authenticateToken,requireProgramAccess,requireActivityVisible,<anonymous>
/workouts/types/highest-participation authenticateToken,requireProgramAccess,requireActivityVisible,<anonymous>
function,function,function,function,function,function,function
function
function
giveKudos,undoKudos,getKudosSummary,localDateIn,KUDOS_NOTIFICATION_TYPE
2026-10-14,2026-10-13,2026-10-13,2026-10-13
listPeople,getPersonProfile
id,giver_id,recipient_id,program_id,kudos_date,notification_id,created_at true
true true true false
```
   - (c) **Coverage guard 1: the GET inventory.**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && grep -nE '\.get\("' routes/*.js | sed -E 's/^routes\/([a-zA-Z]+)\.js:[0-9]+:([a-zA-Z0-9]+)\.get\("([^"]*)".*/\1 \2 \3/' | sort
```
     - Today this prints 33 lines; after S1 it prints 35.
     - Every line must match a row of the GET INVENTORY table (in the ROUTE CHECKLIST section).
     - For any extra line (S0 or N-track additions), open the handler and classify it:
       - it returns only the caller's own data, names, or program aggregates: add it to the inventory table in the people SPEC §5 with its class;
       - it returns ANOTHER member's workouts, workout stats or kudos to a viewer who may be a plain member: STOP and report. Fixing it is outside the brief.
   - (d) **Coverage guard 2: other readers of workout data** (notification templates, digests, reminders):
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && grep -rlE "WorkoutLog|computeStreaks|getSummary|top_performers|workout_logs" routes services utils middleware | sort
```
     - The expected set is `routes/analytics.js`, `routes/logs.js`, `services/analyticsService.js`, `services/healthSyncWorkouts.js`, `services/logService.js`, `services/memberAnalyticsService.js`, `services/peopleService.js` and `services/workoutService.js`.
     - For any other file (e.g. the N-track's streak reminders N6, the digest N8 or the composer's merge fields N16):
       - fine if it only puts the RECIPIENT's own activity into that recipient's notification (self);
       - fine if it is the global-admin composer preview (G always sees);
       - STOP and report if it puts member X's activity into anything a plain member Y ≠ X receives (for example a digest leaderboard).
   - (e) **Coverage guard 3: callers.**
     - `grep -rn "getSummary(" --include='*.js' --exclude-dir=node_modules .` must show only the definition (`services/analyticsService.js`) and `routes/analytics.js`. Any other caller must pass the recipient as `user`; if it doesn't, STOP and report.
     - `grep -n "computeStreaks" services/memberAnalyticsService.js` must show exactly one key named `computeStreaks` in `module.exports`.

27. **Deploy order.** 012 is already on both schemas (step 3), so pushing `main` at any time is safe.
   - (a) Commit locally through git-version (step 29).
   - (b) With the user's OK, run `git push --force-with-lease origin main:staging`.
   - (c) Wake staging: `curl -s -m 120 https://rasifiters-api-staging.onrender.com/`.
   - (d) Confirm the staging deploy is `live` (deploy skill §C).
   - (e) Run step 28 against staging.
   - (f) With the user's OK, push `main` (Render auto-deploys).
   - (g) Check the prod deploy logs show no `[auth] token verification unavailable` lines.

28. **Verification matrix** (staging; the USER runs it in their zsh Terminal, or the orchestrator with the user's OK).
   - Accounts: testbed program **RaSi Winter Reset**, with S = `ava.rivera` (admin), L = `mia.patel` (logger), P = `zoe.chen` (plain member) and H = `ethan.m` (plain member, made hidden).
   - The limits live in memory, so re-run only after a staging redeploy (the pair limit for zoe→mia lasts 24 h).
```zsh
read -rs "TESTBED_PASSWORD?Testbed password: "; echo
curl -s -m 120 https://rasifiters-api-staging.onrender.com/; echo
TESTBED_PASSWORD="$TESTBED_PASSWORD" node --input-type=module - <<'EOF'
const API = "https://rasifiters-api-staging.onrender.com/api";
const call = async (method, path, token, body) => {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if ([502, 503, 504].includes(r.status) && i < 2) { await new Promise((s) => setTimeout(s, 3000)); continue; }
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data, retryAfter: r.headers.get("retry-after") };
  }
};
const login = async (u) => { const r = await call("POST", "/auth/login/app", null, { identifier: u, password: process.env.TESTBED_PASSWORD }); return { token: r.data?.access_token || r.data?.token, id: r.data?.member_id || r.data?.user?.id }; };
let fails = 0;
const check = (label, ok, got) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : " → " + JSON.stringify(got).slice(0, 240)}`); if (!ok) fails += 1; };
const [S, L, P, H] = await Promise.all(["ava.rivera", "mia.patel", "zoe.chen", "ethan.m"].map(login));
const T = (await call("GET", "/programs", S.token)).data.find((p) => p.name === "RaSi Winter Reset").id;
const q = (m) => `programId=${T}&memberId=${m}`;
try {
  let r = await call("PUT", `/members/${H.id}`, H.token, { hide_activity: true });
  check("H hides (PUT 200 + echo)", r.status === 200 && r.data.hide_activity === true, r);
  r = await call("GET", `/members/${H.id}`, P.token); check("P can't read H's flag", r.status === 200 && !("hide_activity" in r.data), r);
  r = await call("PUT", `/members/${P.id}`, P.token, { hide_activity: "yes" }); check("non-boolean → 400", r.status === 400, r);
  r = await call("PUT", `/members/${H.id}`, S.token, { hide_activity: false }); check("someone else's flag → 403", r.status === 403, r);
  const mp = await call("GET", `/member-metrics?programId=${T}`, P.token), ms = await call("GET", `/member-metrics?programId=${T}`, S.token);
  check("#1 metrics: H omitted for P, kept for S, total equal", !mp.data.members.some((m) => m.member_id === H.id) && ms.data.members.some((m) => m.member_id === H.id) && mp.data.total === ms.data.total, { p: mp.data?.total, s: ms.data?.total });
  for (const path of ["/member-history", "/member-streaks", "/member-recent"]) {
    const [rp, rs, rl, rh] = await Promise.all([P, S, L, H].map((v) => call("GET", `${path}?${q(H.id)}`, v.token)));
    check(`#2-4 ${path}: P 403 · S/L/H 200`, rp.status === 403 && [rs, rl, rh].every((x) => x.status === 200), [rp.status, rs.status, rl.status, rh.status]);
  }
  for (const path of ["/analytics/workouts/types", ...["total", "most-popular", "longest-duration", "highest-participation"].map((s) => `/analytics-v2/workouts/types/${s}`)]) {
    const [rp, rs, rh] = await Promise.all([P, S, H].map((v) => call("GET", `${path}?${q(H.id)}`, v.token)));
    const bad = await call("GET", `${path}?${q("not-a-uuid")}`, P.token);
    check(`#5-9 ${path}: P 403 activity_hidden · S/H 200 · bad id 400`, rp.status === 403 && rp.data?.code === "activity_hidden" && rs.status === 200 && rh.status === 200 && bad.status === 400, [rp.status, rs.status, rh.status, bad.status]);
  }
  const sp = await call("GET", `/analytics/summary?programId=${T}`, P.token), ss = await call("GET", `/analytics/summary?programId=${T}`, S.token);
  check("#10 summary: H not in P's top_performers; totals equal", !sp.data.top_performers.some((x) => x.member_id === H.id) && JSON.stringify(sp.data.members) === JSON.stringify(ss.data.members), { p: sp.data?.top_performers, s: ss.data?.top_performers });
  for (const path of ["/analytics/health/timeline", "/analytics/health/steps", "/daily-health-logs"]) {
    r = await call("GET", `${path}?${q(H.id)}`, P.token); check(`#11-12 ${path}: P 403 (S0)`, r.status === 403, r.status);
  }
  r = await call("GET", `/people?programId=${T}`, P.token);
  const hRow = r.data?.people?.find((x) => x.member_id === H.id);
  check("#13 list: P first, H name-only", r.status === 200 && r.data.people[0].member_id === P.id && r.data.people[0].is_you && hRow?.activity_visible === false && hRow.last_active === null && r.data.viewer.is_staff === false, r.data);
  r = await call("GET", `/people/${H.id}?programId=${T}`, P.token);
  check("#13 profile for P: stats/recent/kudos null", r.status === 200 && r.data.activity_visible === false && r.data.stats === null && r.data.recent_workouts === null && r.data.kudos === null && r.data.can_open_full_stats === false, r.data);
  r = await call("GET", `/people/${H.id}?programId=${T}`, S.token);
  check("#13 profile for S: visible + full stats", r.status === 200 && r.data.activity_visible === true && r.data.stats !== null && r.data.can_open_full_stats === true, r.data);
  r = await call("POST", `/people/${H.id}/kudos`, P.token, { program_id: T }); check("#13 POST kudos → hidden: 403 activity_hidden", r.status === 403 && r.data?.code === "activity_hidden", r);
  r = await call("DELETE", `/people/${H.id}/kudos`, P.token); check("#13 DELETE kudos → hidden: 200, no count", r.status === 200 && !("count" in (r.data?.kudos || {})) && r.data.kudos.removed === false, r);
  r = await call("POST", `/people/${P.id}/kudos`, P.token, { program_id: T }); check("kudos to self → 400 kudos_self", r.status === 400 && r.data?.code === "kudos_self", r);
  await call("DELETE", `/people/${L.id}/kudos`, P.token);                                                   // write 1 (normalize)
  r = await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                              // write 2
  check("give → 201 given_today", r.status === 201 && r.data.kudos.given_today === true && Number.isInteger(r.data.kudos.count), r);
  r = await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                              // write 3
  check("give again → 200 (idempotent)", r.status === 200 && r.data.kudos.given_today === true, r);
  let inbox = await call("GET", "/notifications/unacknowledged", L.token);
  const note = inbox.data?.find?.((n) => n.type === "activity.kudos_received" && n.actor_member_id === P.id);
  console.log(`INFO L's inbox holds the kudos notification: ${Boolean(note)} (true only when the Activity category is on — U-2)`);
  r = await call("DELETE", `/people/${L.id}/kudos`, P.token);                                               // write 4
  check("undo → 200 {given_today:false, removed:true}, no count", r.status === 200 && r.data.kudos.given_today === false && r.data.kudos.removed === true && !("count" in r.data.kudos), r);
  inbox = await call("GET", "/notifications/unacknowledged", L.token);
  check("undo removed the unread notification", !inbox.data?.some?.((n) => note && n.id === note.id), inbox.status);
  await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                                  // write 5
  await call("DELETE", `/people/${L.id}/kudos`, P.token);                                                   // write 6
  r = await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                              // write 7
  check("pair limit: 7th write → 429 rate_limited + Retry-After", r.status === 429 && r.data?.code === "rate_limited" && Boolean(r.retryAfter), r);
  r = await call("GET", `/people?programId=bad`, P.token); check("bad programId → 400 invalid_request", r.status === 400 && r.data?.code === "invalid_request", r);
} finally {
  const r = await call("PUT", `/members/${H.id}`, H.token, { hide_activity: false });
  console.log(`cleanup: H visible again → ${r.status}`);
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL(S)`);
}
EOF
```
   - The output must end with `ALL PASS`.
   - Rows #11–12 test S0's rule (expected 403). If S0 uses a different status, the S0 track owns that line.

29. **git-version**
   - (a) **One `feat(backend)` commit for S1.** It contains the 13 backend code files plus `sql/012_…` and `sql/README.md` (uncommitted since Phase A).
   - (b) **ONE docs commit after it.** This commit:
     - bumps `people` (new, v0.1.0), `members`, `member-analytics`, `analytics` and `analytics-v2` (MINOR each, consecutive above S0's landing) and `notifications` (PATCH above the N-track's version);
     - updates `registry.json` and `REGISTRY.md`;
     - tags each touched feature on that commit and pushes the tags by name.
   - (c) **The commit body says:** "no bump for auth (models/Member.js is shared; the column is owned by members' D-rule; auth's code and behavior are unchanged); no bump for the other features listing server.js / models/index.js".
   - (d) **Status flip.** `people` flips to 🚀 only after the prod deploy is verified, with no bump.

## Privacy, consent and store disclosures (task item 6; final form per U-1)
Plain co-members can already read each other's workout metrics through today's API, but no shipped UI shows them to plain members. People makes this visible, including workouts synced from Apple Health and Health Connect. Under U-3's recommendation, the disclosures below must be live no later than the first People client.

**A. Web privacy text.** The web client plan applies these edits identically to BOTH `apps/web/src/app/privacy-policy/page.tsx` and `apps/web/src/app/program/privacy/page.tsx`. Both files are shared with quick-win #48 (BrandMark), and the Notifications track may edit the notifications bullet too; merge those edits, never overwrite.
1. `subtitle="Effective date: …"` → the date the web change ships (the web plan sets it).
2. "How we use information": in the bullet starting `Deliver push and in-app notifications (for example program updates, membership or role changes)`, change that parenthesis to `(for example program updates, membership or role changes, and kudos from other members)`.
3. "Connected health data": insert after the bullet `We use data read from Apple Health or Health Connect only…`:
   `<li>Workouts created from Apple Health or Health Connect are part of your program activity: other members of your programs can see them, along with your streaks and active days, unless you turn on Hide my activity in My Profile. Sleep and steps are never shown to other members — only you, your program&apos;s admins and loggers, and RaSi Fiters administrators can see them.</li>`
4. "Sharing of information": insert as the FIRST `<li>`:
   `<li>Other members of your programs: members of a program you belong to can see your name, username and program role. They can also see your workouts, workout stats (such as streaks and active days) and the kudos you receive — including workouts synced from Apple Health or Health Connect — unless you turn on Hide my activity in My Profile. Program admins and loggers can always see your activity in their programs. Your sleep, diet and steps are visible only to you, your program&apos;s admins and loggers, and RaSi Fiters administrators. Your email address is never shown to other members.</li>`
5. "Your choices": insert after `<li>Access or update your information in the app.</li>`:
   `<li>Turn on Hide my activity (My Profile) to hide your workouts, workout stats and kudos from other members of your programs. You stay on your programs&apos; member lists by name, program admins and loggers still see your activity, and program totals still include it.</li>`

If the user picks U-1(c), replace "unless you turn on Hide my activity" with "if you choose to show your activity" in items 3 and 4, and change item 5 to describe the opt-in.

**B. In-app consent copy** (client plans).
- **iOS:** `NSHealthShareUsageDescription` in project.pbxproj (:381 and :420, Debug and Release). This also fixes the "RaSi Fit'ers" typo (#45). New value:
  `RaSi Fiters reads your workouts, sleep, and steps from Apple Health to log them in your programs. Members of your programs can see your workouts unless you turn on Hide my activity.`
- **iOS `AppleHealthSettingsView` and Android `HealthConnectSettingsScreen`:** one footnote line each, at parity:
  `Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile.`
- **U-1(b) notice, all three clients:**
  - Title: `Who can see your activity`.
  - Body: `Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or Health Connect. Sleep, diet and steps stay private to you and your program's staff.`
  - Buttons: `Keep visible` / `Hide my activity`.

**C. Store answers** (the USER changes these in the consoles; nothing in code). These are recommendations, not legal determinations: the console's current help text decides, and if it classes visibility to other users as "sharing", answer accordingly.
- **App Store Connect → App Privacy:** confirm that Health & Fitness → **Health** and **Fitness** are declared as collected, Linked to the user, purpose App Functionality, not used for tracking. Kudos is a count, so no new data type is needed.
- **App Store Connect → App Review notes:** add
  `People (Members → People): members of a program see each other's workouts and streaks and can send kudos (a count, no text). Synced Apple Health workouts are included; members are told this in a one-time notice and can hide their activity in My Profile → Hide my activity.`
  The existing demo login stays.
- **Play Console → Data safety:** declare Health and fitness → **Fitness info** (workouts, steps) and **Health info** (sleep) as Collected = Yes, purpose App functionality.
  - For "Shared", read Play's definition in the form. If visibility to other users of the same app is counted as sharing, answer Shared = Yes for Fitness info, purpose App functionality.
- **Play Console → App content → Health Connect permissions declaration:**
  - ExerciseSession READ: `Workouts are logged to the user's fitness programs and shown to the other members of those programs after the user is told so in the app; the user can hide them with Hide my activity.`
  - SleepSession and Steps READ: `Shown only to the user and their program's admins and loggers.`

## ROUTE CHECKLIST (every per-person output; the switch is only honest if every row holds)
Viewer types:
- **P** = plain co-member (role `member` in T, not a global admin);
- **H** = the hidden member themself;
- **S** = active program admin or logger;
- **G** = global admin.

H's rows are visible to H, S and G on every route.

| # | Output | How it's covered | Verify (P viewing hidden H) |
|---|---|---|---|
| 1 | GET /api/member-metrics | `getMemberMetrics` → `filterActivityRows` (row omitted; `total` unchanged, `filtered` recomputed) | H's row absent; `total` the same as for S |
| 2 | GET /api/member-history?memberId=H | `assertMemberAccess` → `assertActivityVisible` | 403 `{ error }` |
| 3 | GET /api/member-streaks?memberId=H | same as 2 | 403 |
| 4 | GET /api/member-recent?memberId=H | same as 2 | 403 |
| 5 | GET /api/analytics/workouts/types?memberId=H | `requireActivityVisible` | 403 `activity_hidden` |
| 6–9 | GET /api/analytics-v2/workouts/types/{total,most-popular,longest-duration,highest-participation}?memberId=H | `requireActivityVisible` | 403 `activity_hidden` |
| 10 | GET /api/analytics/summary → `top_performers` | `getSummary` → `filterActivityRows` | H absent; `members` totals the same as for S |
| 11 | GET /api/analytics/health/timeline?memberId=H and /health/steps?memberId=H | S0's health kind (self/staff only) — strictly stronger | S0's 403 |
| 12 | GET /api/daily-health-logs?memberId=H | `getDailyHealthLogs` staff/self (logService) — stronger | 403 |
| 13 | /api/people: GET list · GET profile · POST kudos · DELETE kudos | `canSeeActivity` (list, profile, POST). DELETE returns only the caller's own `{given_today, removed}`, never a count | list: `activity_visible:false`, `last_active:null` · profile: `stats` / `recent_workouts` / `kudos` null · POST: 403 `activity_hidden` · DELETE: 200 without `count` |

**GET INVENTORY** (all 35 GET routes after S1; step 26(c) must match this exactly, plus any classified additions):

| Router (file) | Paths | Class |
|---|---|---|
| auth | `/me`, `/identities` | self only |
| members | `/`, `/:id` | name-only (S0 rules); `hide_activity` to self / G only |
| programs | `/` | the caller's own programs |
| memberships | `/members`, `/details` | name-only roster (S0 roster rule) |
| invites | `/my-invites`, `/all-invites` | invites, no activity |
| notifications | `/unacknowledged`, `/stream` | the caller's own inbox |
| workouts, programWorkouts | `/` | the workout catalog |
| logs (dailyHealthLogRouter) | `/` | #12 |
| healthSync | `/state` | self only |
| analytics v1Router | `/summary` | #10 |
| analytics v1Router | `/workouts/types` | #5 (with memberId); aggregate without it |
| analytics v1Router | `/health/timeline`, `/health/steps` | #11 (S0) |
| analytics v1Router | `/workouts/total`, `/duration/total`, `/duration/average`, `/timeline`, `/distribution/day` | program aggregates (count hidden members on purpose) |
| analytics v2Router | `/participation/mtd` | program aggregate |
| analytics v2Router | `/workouts/types/{total,most-popular,longest-duration,highest-participation}` | #6–9 (with memberId); aggregate without it |
| memberAnalytics | metricsRouter `/`, historyRouter `/`, streaksRouter `/`, recentRouter `/` | #1–4 |
| people | `/`, `/:memberId` | #13 |

- **Write routes:** write responses only echo the caller's own write. Kudos POST and DELETE are in #13.
- **Future rule:** any later output that names another member's activity (a digest leaderboard, announcement merge fields shown to others) must call `filterActivityRows` / `canSeeActivity` and gets a row here.

## Risks the implementer must watch
- **Outage risk.** Phase A is mandatory. Don't write step 5 (Member.js) until the user has pasted both VERIFY rows. With 012 on public first, any later push of `main` by any track is safe.
- **Seams S-1/S-2/S-3.** Run G0 and never guess a name. Never re-implement S0's roster, email or health rules. `memberVisibility.js` must not require any service (a require cycle).
- **Shared files: merge, never overwrite.**
  - With S0: memberVisibility.js, memberAnalyticsService.js, routes/analytics.js, analyticsService.js, memberService.js, routes/members.js.
  - With the Notifications track: models/index.js, server.js.
  - The quick-wins track touches no S1 file. The privacy-page text (client plans) is shared with #48.
- **Metrics rows are OMITTED, never nulled or zeroed.** The iOS `MemberMetricsDTO` Ints are non-optional.
- **Kudos counts appear only behind `canSeeActivity`.** That means profile and POST. DELETE must never return `count`.
- **Self comparisons are case-insensitive** (`sameMemberId`, and the route lowercases ids). A plain hidden member must never get a 403 on their own data.
- **`canSeeActivity` fails closed.** Every caller passes a viewer, and step 26(e) checks that.
- **403 bodies on member-history, member-streaks and member-recent carry no `code`.** Those route files echo only `error`, and S1 doesn't touch them. No live client reaches that case.
- **The invalid-`memberId` 400 is new behavior.** On the 5 analytics routes it was a 500 before. "" or an absent memberId still passes through, which is what web sends today.
- **Kudos notifications are created only in `kudosService`, via `createNotification`.** Never push from People code. The Notifications server owns category, template and preferences.
- **No associations for Kudos.** `kudosService` must not import `peopleService`.
- **Streaks.** `computeStreaks` semantics stay unchanged (F1). Don't "fix" the stale-streak issue.
- **No app version bumps, and no client files.**

## API CONTRACT (People server S1, the source of truth for the web / iOS / Android client plans S2–S4)

**§A Conventions**
- **Base URL:** prod `https://rasifiters-api.onrender.com/api`; staging `https://rasifiters-api-staging.onrender.com/api`.
- **Auth:** every route requires `Authorization: Bearer <access token>`.
  - 401 `{error}` = invalid or expired token (the client's refresh policy, amendment A3).
  - 503 `{error, code:"auth_unavailable"}` + `Retry-After`.
  - 426 = a header-less Android build (app-config gate).
- **Error body:** `{ "error": "<plain-language sentence>", "code": "<machine code>" }`. The status decides the frontend-kit kind; `code` is carried but never decisive.
- **Formats:** ids are lowercase UUID strings; dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC. JSON keys are snake_case.
- **Staff** = global admin, or an ACTIVE `admin` / `logger` of the program.
- **Activity visible** = the viewer is self, or staff, or the target has `hide_activity = false`.

**§B GET /api/people?programId=<uuid>** — the People list
- 200:
```json
{
  "program_id": "6f1c…",
  "viewer": { "member_id": "a1b2…", "is_staff": false },
  "people": [
    { "member_id": "a1b2…", "member_name": "Ava Rivera", "initials": "AR", "username": "ava.rivera",
      "program_role": "member", "is_you": true,  "activity_visible": true,  "last_active": "2026-10-12" },
    { "member_id": "c3d4…", "member_name": "Liam Kim",   "initials": "LK", "username": "liam.kim",
      "program_role": "admin",  "is_you": false, "activity_visible": false, "last_active": null }
  ]
}
```
- `people` = ACTIVE members only. The `is_you` row comes first (absent when the viewer is a global admin who isn't a member), then first name A→Z, then last name A→Z.
- `program_role` ∈ `admin|logger|member`.
- `initials`: 1–2 uppercase letters, or `"?"`.
- `last_active`: the latest workout date in this program. It is `null` when there is none, or when `activity_visible` is false.
- Errors:
  - 400 `invalid_request` (programId missing or not a UUID);
  - 403 `not_program_member` (not an active member and not a global admin);
  - 404 `program_not_found`;
  - 500 `server_error`.

**§C GET /api/people/:memberId?programId=<uuid>** — a person's profile
- 200:
```json
{
  "program_id": "6f1c…", "member_id": "c3d4…", "member_name": "Liam Kim", "initials": "LK",
  "username": "liam.kim", "program_role": "member", "is_you": false,
  "joined_at": "2026-07-01T17:02:11.000Z",
  "activity_visible": true,
  "can_open_full_stats": false,
  "stats": { "current_streak": 3, "longest_streak": 9, "active_days_this_month": 6, "last_active": "2026-10-12" },
  "recent_workouts": [ { "workout_type": "Running", "date": "2026-10-12", "duration_minutes": 30 } ],
  "kudos": { "count": 12, "given_today": false, "can_give": true }
}
```
- When `activity_visible` is false, `stats`, `recent_workouts` and `kudos` are all `null`; render the name only.
- `stats`:
  - streaks use the same window and semantics as GET /api/member-streaks (stale-streak caveat F1);
  - `active_days_this_month` counts the current UTC month;
  - `last_active` may be null.
- `recent_workouts`: at most 10, ordered by date descending, then type A→Z. It may be `[]`.
- `kudos`:
  - `count` = all-time received, across all programs;
  - `given_today` = the viewer already gave kudos on the recipient's current local day;
  - `can_give` = not self, and the viewer is an active member of this program.
- `can_open_full_stats` = the viewer is staff. "Open full stats" uses the existing member routes (member-history, member-streaks, member-recent, member-metrics?memberId) with no new data.
- Errors:
  - 400 `invalid_request` (programId or memberId not a UUID);
  - 403 `not_program_member`;
  - 404 `program_not_found`;
  - 404 `member_not_in_program` (the target isn't an ACTIVE member);
  - 500 `server_error`.

**§D POST /api/people/:memberId/kudos** — body `{ "program_id": "<uuid>" }`
- 201 = new kudos; 200 = already given today (idempotent). Both return `{ "kudos": { "count": 13, "given_today": true } }`.
- Day = the recipient's local calendar day (their time zone as captured by the Notifications server; UTC if unknown).
- Errors:
  - 400 `invalid_request` (memberId or program_id missing or not a UUID);
  - 400 `kudos_self`;
  - 403 `not_program_member` (the giver isn't an ACTIVE member of program_id);
  - 403 `activity_hidden` (plain giver, hidden recipient — re-fetch the profile);
  - 404 `program_not_found`;
  - 404 `member_not_in_program`;
  - 429 `rate_limited` + `Retry-After` (60 kudos writes per member per 10 min, POST + DELETE combined, or 6 per giver→recipient per 24 h);
  - 500 `server_error`.
- Side effect: only on 201, a notification of type `activity.kudos_received` may be created (§F).

**§E DELETE /api/people/:memberId/kudos** — undo today's kudos (no body, no programId)
- 200 always (idempotent): `{ "kudos": { "given_today": false, "removed": true } }`.
  - `removed: false` means there was nothing for the recipient's current day (already undone, or the day rolled over).
  - There is **no `count`**. Clients that showed a count decrement it by 1 when `removed` is true, or re-fetch §C.
- It removes the caller's kudos to that member for the recipient's current day, together with its notification if it is still unread.
- Errors: 400 `invalid_request`; 429 `rate_limited` + `Retry-After` (same limits as §D); 500 `server_error`.

**§F Changed existing routes and the notification** (all additive or restrictive only; live binaries are unaffected)
- **GET /api/members/:id** adds `"hide_activity": true|false`, but ONLY when the requester is that member or a global admin. The key is absent otherwise. Every other field is per S0.
- **PUT /api/members/:id**: the body may include `"hide_activity": true|false` (a JSON boolean).
  - The response adds `"hide_activity"`.
  - 400 `{ "error": "hide_activity must be true or false." }`.
  - 403 `{ "error": "You can only change your own activity visibility." }` (another member's profile, including for a global admin).
  - These two errors carry no `code`. The existing 403 for "not your profile" still comes first.
- **GET /api/member-metrics**: rows of members hidden from the viewer are omitted. `total` counts every active member; `filtered` counts the returned rows.
- **GET /api/member-history | member-streaks | member-recent?memberId=<hidden>** (plain viewer): 403 `{ "error": "This member keeps their activity private." }`.
- **GET /api/analytics/workouts/types** and the 4 **/api/analytics-v2/workouts/types/*** routes with `memberId`:
  - 400 `{error, code:"invalid_request"}` for a non-UUID memberId;
  - 403 `{error, code:"activity_hidden"}` for a hidden member viewed by a plain viewer.
- **GET /api/analytics/summary**: `top_performers` omits members hidden from the viewer, so it may hold fewer than 5. Totals are unchanged.
- **Notification `activity.kudos_received`:**
  - Delivered via `/api/notifications/unacknowledged`, SSE and push, with the usual payload `{ id, type, program_id, actor_member_id, title, body, created_at }`.
  - `title` = `Kudos received`; `body` = `<Giver full name> gave you kudos in <Program name>.` (the Notifications server's templates may reword it); `program_id` = the kudos program; `actor_member_id` = the giver.
  - Push data carries `notification_id`, `type` and `program_id` only; the giver is read from the inbox item.
  - Category = Activity. Whether it is created, alerted or silenced follows the **Notifications SPEC preference rules** (default per U-2). The Android channel follows the notifications SPEC.
  - An undo removes it while it is still unread. A client acknowledging a removed notification gets a 404 and must drop the item on its next re-fetch (iOS 1.5.0 already does this).
